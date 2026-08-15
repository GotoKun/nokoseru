import { prisma } from "./prisma";
import type { Prisma } from "@/app/generated/prisma/client";
import {
  OCCASIONS,
  coverageStatusFromCount,
  type OccasionId,
} from "./occasions";
import {
  generateQuestionsForOccasions,
  structureSession,
  transcribeAudio,
  colorizePhoto,
  suggestQuestionFromPhoto,
  DUMMY_MODE,
  type CandidateQuestion,
  type FamilyMember,
} from "./orcarouter";
import { saveBuffer, readStoredFile, deleteStoredFile, mediaUrl, type StorageCategory } from "./storage";
import { extractAudioForStt, remuxForSeeking, probeDuration, mergeLumaFromOriginal } from "./media";
import { randomUUID } from "node:crypto";

// ---- Person ----

export async function listPersons() {
  return prisma.person.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { sessions: true } },
    },
  });
}

export interface PersonProfileInput {
  birthday?: Date | null;
  familyMembers?: FamilyMember[];
  hometown?: string | null;
  occupation?: string | null;
  hobbies?: string | null;
  notes?: string | null;
}

export async function createPerson(name: string, relation: string | null, profile: PersonProfileInput = {}) {
  const person = await prisma.person.create({
    data: {
      name,
      relation,
      birthday: profile.birthday ?? null,
      familyMembers: (profile.familyMembers ?? []) as unknown as Prisma.InputJsonValue,
      hometown: profile.hometown ?? null,
      occupation: profile.occupation ?? null,
      hobbies: profile.hobbies ?? null,
      notes: profile.notes ?? null,
    },
  });
  await prisma.coverage.createMany({
    // suggestedQuestionsはスキーマ側のJSONデフォルト値に頼らず常に明示する
    // （SQLite上でJson型のデフォルト値が正しく初期化されない既知の問題があるため）。
    data: OCCASIONS.map((o) => ({ personId: person.id, occasion: o.id, status: "empty", suggestedQuestions: [] })),
  });

  // 登録直後から収録画面が即座に開けるよう、初回の質問候補もバックグラウンドで用意しておく。
  refreshSuggestedQuestions(person.id).catch((err) => {
    console.error("[refresh suggested questions] failed", err);
  });

  return person;
}

export async function getPerson(personId: string) {
  return prisma.person.findUnique({ where: { id: personId } });
}

// プロフィール（誕生日・家族構成）は任意入力かつ後から追加・変更できる。
// 変更後は質問候補が古い前提のままにならないよう、キャッシュをバックグラウンドで再生成する。
export async function updatePersonProfile(
  personId: string,
  data: { name?: string; relation?: string | null } & PersonProfileInput
) {
  const person = await prisma.person.update({
    where: { id: personId },
    data: {
      ...data,
      familyMembers:
        data.familyMembers !== undefined
          ? (data.familyMembers as unknown as Prisma.InputJsonValue)
          : undefined,
    },
  });
  refreshSuggestedQuestions(personId).catch((err) => {
    console.error("[refresh suggested questions] failed", err);
  });
  return person;
}

export async function listDeliveries(personId: string) {
  return prisma.delivery.findMany({ where: { personId }, orderBy: { createdAt: "desc" } });
}

// ---- Coverage ----

export async function recomputeCoverage(personId: string) {
  const episodes = await prisma.episode.findMany({
    where: { excluded: false, session: { personId } },
    select: { occasion: true },
  });
  const counts: Record<string, number> = {};
  for (const e of episodes) {
    if (e.occasion) counts[e.occasion] = (counts[e.occasion] ?? 0) + 1;
  }
  for (const occ of OCCASIONS) {
    const count = counts[occ.id] ?? 0;
    const status = coverageStatusFromCount(count);
    await prisma.coverage.upsert({
      where: { personId_occasion: { personId, occasion: occ.id } },
      update: { status },
      create: { personId, occasion: occ.id, status, suggestedQuestions: [] },
    });
  }
}

export async function getCoverageMap(personId: string) {
  const existing = await prisma.coverage.findMany({ where: { personId } });
  if (existing.length === 0) {
    await prisma.coverage.createMany({
      data: OCCASIONS.map((o) => ({ personId, occasion: o.id, status: "empty", suggestedQuestions: [] })),
    });
    return prisma.coverage.findMany({ where: { personId } });
  }
  return existing;
}

// 節目ごとの見出し一覧（画面06「まだ聞けていないこと」用）。
// バーも％も使わず、実際の見出しを並べることで「見えている情報量そのものが状態になる」。
export async function listEpisodeHeadingsByOccasion(personId: string): Promise<Record<string, string[]>> {
  const episodes = await prisma.episode.findMany({
    where: {
      excluded: false,
      session: {
        personId,
        status: "structured",
        OR: [{ unlockAt: null }, { unlockAt: { lte: new Date() } }],
      },
    },
    orderBy: { createdAt: "desc" },
    select: { title: true, occasion: true },
  });
  const map: Record<string, string[]> = {};
  for (const e of episodes) {
    if (!e.occasion) continue;
    (map[e.occasion] ??= []).push(e.title);
  }
  return map;
}

// ---- Next question candidates ----
// 収録画面を開くたびにLLMを待たせない設計：finalizeSession完了直後にバックグラウンドで
// refreshSuggestedQuestions()を呼び、次に出すべき質問をCoverage.suggestedQuestionsへ
// 事前キャッシュしておく。getNextQuestionCandidatesは基本そのキャッシュを読むだけにする。

const STATUS_PRIORITY: Record<string, number> = { empty: 0, thin: 1, covered: 2 };

function pickPriorityOccasions<T extends { occasion: string; status: string }>(
  coverage: T[],
  limit: number
): T[] {
  return [...coverage]
    .sort((a, b) => (STATUS_PRIORITY[a.status] ?? 9) - (STATUS_PRIORITY[b.status] ?? 9))
    .slice(0, limit);
}

async function recentEpisodeSummaries(personId: string): Promise<string[]> {
  const recentEpisodes = await prisma.episode.findMany({
    where: { excluded: false, session: { personId } },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { title: true, theme: true },
  });
  return recentEpisodes.map((e) => e.theme || e.title);
}

function personProfileParams(person: {
  name: string;
  relation: string | null;
  birthday: Date | null;
  familyMembers: unknown;
  hometown: string | null;
  occupation: string | null;
  hobbies: string | null;
  notes: string | null;
}) {
  return {
    personName: person.name,
    relation: person.relation,
    birthday: person.birthday,
    familyMembers: (person.familyMembers as unknown as FamilyMember[]) ?? [],
    hometown: person.hometown,
    occupation: person.occupation,
    hobbies: person.hobbies,
    notes: person.notes,
  };
}

export async function refreshSuggestedQuestions(personId: string): Promise<void> {
  const person = await prisma.person.findUniqueOrThrow({ where: { id: personId } });
  const coverage = await getCoverageMap(personId);
  const targets = pickPriorityOccasions(coverage, 3);

  const questions = await generateQuestionsForOccasions({
    ...personProfileParams(person),
    targetOccasions: targets.map((c) => ({
      occasion: c.occasion as OccasionId,
      label: OCCASIONS.find((o) => o.id === c.occasion)?.label ?? c.occasion,
    })),
    recentEpisodeSummaries: await recentEpisodeSummaries(personId),
  });

  for (const q of questions) {
    await prisma.coverage.update({
      where: { personId_occasion: { personId, occasion: q.occasionHint } },
      data: { suggestedQuestions: [q.text] },
    });
  }
}

export async function getNextQuestionCandidates(personId: string): Promise<CandidateQuestion[]> {
  const coverage = await getCoverageMap(personId);
  const targets = pickPriorityOccasions(coverage, 3);

  const cached: CandidateQuestion[] = [];
  const missing: { occasion: OccasionId; label: string }[] = [];
  for (const c of targets) {
    const q = (c.suggestedQuestions as string[])?.[0];
    if (q) {
      cached.push({ text: q, occasionHint: c.occasion as OccasionId });
    } else {
      missing.push({
        occasion: c.occasion as OccasionId,
        label: OCCASIONS.find((o) => o.id === c.occasion)?.label ?? c.occasion,
      });
    }
  }

  if (missing.length === 0) {
    return cached;
  }

  // まだキャッシュがない節目（初回利用時など）だけ、その場で生成する。
  const person = await prisma.person.findUniqueOrThrow({ where: { id: personId } });
  const fresh = await generateQuestionsForOccasions({
    ...personProfileParams(person),
    targetOccasions: missing,
    recentEpisodeSummaries: await recentEpisodeSummaries(personId),
  });
  for (const q of fresh) {
    try {
      await prisma.coverage.update({
        where: { personId_occasion: { personId, occasion: q.occasionHint } },
        data: { suggestedQuestions: [q.text] },
      });
    } catch (err) {
      console.error("[cache suggested question] failed", err);
    }
  }

  return [...cached, ...fresh];
}

// カエルムUI（画面1）は候補を並べず、AIが1問だけ出す。
// pickPriorityOccasions(coverage, 1) は status優先度（empty→thin→covered）でソートした先頭を返すため、
// 「まだ記録のない節目を必ず優先する」という要件をそのまま満たす
// （UI仕様書9章：3件取得後にカーソル回転させると empty 優先が崩れる、という実装バグの回避）。
export async function getNextSingleQuestion(
  personId: string,
  opts: { forceFresh?: boolean } = {}
): Promise<CandidateQuestion> {
  const coverage = await getCoverageMap(personId);
  const [target] = pickPriorityOccasions(coverage, 1);
  if (!target) {
    return { text: "最近、印象に残っていることはありますか", occasionHint: "daily" };
  }

  // 画面01「他に話したいことがある」＝今の質問を更新する操作のときは、
  // キャッシュを読まずに必ず新しく生成する（同じ質問が返ってくるのを防ぐため）。
  if (!opts.forceFresh) {
    const cachedText = (target.suggestedQuestions as string[])?.[0];
    if (cachedText) {
      return { text: cachedText, occasionHint: target.occasion as OccasionId };
    }
  }

  const person = await prisma.person.findUniqueOrThrow({ where: { id: personId } });
  const [fresh] = await generateQuestionsForOccasions({
    ...personProfileParams(person),
    targetOccasions: [
      {
        occasion: target.occasion as OccasionId,
        label: OCCASIONS.find((o) => o.id === target.occasion)?.label ?? target.occasion,
      },
    ],
    recentEpisodeSummaries: await recentEpisodeSummaries(personId),
  });
  if (fresh) {
    try {
      await prisma.coverage.update({
        where: { personId_occasion: { personId, occasion: fresh.occasionHint } },
        data: { suggestedQuestions: [fresh.text] },
      });
    } catch (err) {
      console.error("[cache suggested question] failed", err);
    }
    return fresh;
  }
  return { text: "最近、印象に残っていることはありますか", occasionHint: target.occasion as OccasionId };
}

// ---- Episode search (keyword / tag) ----

export interface EpisodeSearchResult {
  id: string;
  sessionId: string;
  title: string;
  startSec: number;
  endSec: number;
  tags: string[];
  era: string | null;
  people: string[];
  theme: string | null;
  occasion: string | null;
  occasionLabel: string;
  videoUrl: string | null;
  questionText: string;
  unlockAt: string | null;
  recordedAt: string | null;
  // 再生画面（画面07）の字幕オーバーレイ用。動画を加工せず、テキストだけをクライアント側で同期表示する。
  subtitles: { startSec: number; endSec: number; text: string }[];
}

export async function searchEpisodes(personId: string, query: string): Promise<EpisodeSearchResult[]> {
  const episodes = await prisma.episode.findMany({
    where: {
      excluded: false,
      session: {
        personId,
        status: "structured",
        // 鍵付きメッセージ：unlockAtが未来のセッションは、日時が来るまで検索・再生の対象から外す。
        OR: [{ unlockAt: null }, { unlockAt: { lte: new Date() } }],
      },
    },
    include: { session: { include: { utterances: { orderBy: { startSec: "asc" } } } } },
    orderBy: { createdAt: "desc" },
  });

  const q = query.trim().toLowerCase();
  const matched = episodes.filter((e) => {
    if (!q) return true;
    const tags = (e.tags as string[]) ?? [];
    const people = (e.people as string[]) ?? [];
    const haystack = [e.title, e.theme ?? "", e.era ?? "", ...tags, ...people, e.session.questionText]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });

  return matched.map((e) => ({
    id: e.id,
    sessionId: e.sessionId,
    title: e.title,
    startSec: e.startSec,
    endSec: e.endSec,
    tags: (e.tags as string[]) ?? [],
    era: e.era,
    people: (e.people as string[]) ?? [],
    theme: e.theme,
    occasion: e.occasion,
    occasionLabel: OCCASIONS.find((o) => o.id === e.occasion)?.label ?? "未分類",
    videoUrl: e.session.videoPath ? mediaUrl(e.session.videoPath) : null,
    questionText: e.session.questionText,
    unlockAt: e.session.unlockAt ? e.session.unlockAt.toISOString() : null,
    recordedAt: e.session.recordedAt ? e.session.recordedAt.toISOString() : null,
    subtitles: e.session.utterances
      .filter((u) => u.speaker === "interviewee")
      .map((u) => ({ startSec: u.startSec, endSec: u.endSec, text: u.text })),
  }));
}

// 一覧画面（画面05）用：施錠中のものも含めた全セッションの要約。
// 開封済み（unlockAtなし or 過ぎている）／施錠中（unlockAtが未来）の判定に使う。
export interface SessionCardSummary {
  sessionId: string;
  episodeId: string | null;
  title: string | null;
  recordedAt: string | null;
  unlockAt: string | null;
  locked: boolean;
  // 施錠中でも節目の名前だけは見せる（UI仕様書：「親が生きているうちから子に見えていて、話すきっかけになる」）。
  // 内容（タイトル・タグ・本文）は日時が来るまで一切渡さない。
  lockLabel: string | null;
}

export async function listSessionCards(personId: string): Promise<SessionCardSummary[]> {
  const sessions = await prisma.session.findMany({
    where: { personId, status: "structured" },
    include: { episodes: { where: { excluded: false }, orderBy: { createdAt: "asc" }, take: 1 } },
    orderBy: { createdAt: "desc" },
  });
  const now = Date.now();
  return sessions.map((s) => {
    const locked = Boolean(s.unlockAt && s.unlockAt.getTime() > now);
    const episode = s.episodes[0] ?? null;
    const occasionLabel = OCCASIONS.find((o) => o.id === (episode?.occasion ?? s.occasionHint))?.label ?? null;
    return {
      sessionId: s.id,
      episodeId: locked ? null : episode?.id ?? null,
      title: locked ? null : episode?.title ?? s.questionText,
      recordedAt: locked ? null : s.recordedAt ? s.recordedAt.toISOString() : null,
      unlockAt: s.unlockAt ? s.unlockAt.toISOString() : null,
      locked,
      lockLabel: locked ? occasionLabel ?? "まだ開けられません" : null,
    };
  });
}

// ---- Sessions ----

export async function createSession(params: {
  personId: string;
  questionText: string;
  occasionHint: string | null;
  sourcePhotoId?: string | null;
}) {
  return prisma.session.create({
    data: {
      personId: params.personId,
      questionText: params.questionText,
      occasionHint: params.occasionHint,
      sourcePhotoId: params.sourcePhotoId ?? null,
      status: "uploading",
    },
  });
}

// 鍵付きメッセージ：撮影者が「この回答は指定した日時まで見られないように」と設定できる。
// 遺族側には「鍵のかかったメッセージが存在すること」と開封日時だけを示し、内容（タイトル・タグ・
// 本文）は日時が来るまで一切渡さない（listLockedSessionsが最小限の情報しか返さないのはそのため）。
export async function setSessionUnlockAt(sessionId: string, unlockAt: Date | null) {
  return prisma.session.update({ where: { id: sessionId }, data: { unlockAt } });
}

export interface LockedSessionSummary {
  id: string;
  unlockAt: string;
  recordedAt: string | null;
}

export async function listLockedSessions(personId: string): Promise<LockedSessionSummary[]> {
  const sessions = await prisma.session.findMany({
    where: { personId, status: "structured", unlockAt: { gt: new Date() } },
    orderBy: { unlockAt: "asc" },
    select: { id: true, unlockAt: true, recordedAt: true },
  });
  return sessions.map((s) => ({
    id: s.id,
    unlockAt: s.unlockAt!.toISOString(),
    recordedAt: s.recordedAt ? s.recordedAt.toISOString() : null,
  }));
}

function extensionForMime(mimeType: string): string {
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("wav")) return "wav";
  return "webm";
}

export async function saveSessionUpload(sessionId: string, data: Buffer, mimeType: string) {
  const session = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
  const ext = extensionForMime(mimeType);
  const filename = `${session.id}.${ext}`;

  // ブラウザのMediaRecorderはコンテナに長さ・シーク索引を書き込まない「配信中」形式のまま
  // 出力するため、そのまま保存すると<video>での再生・シークが不安定になる（実測で確認済み）。
  // 再エンコードなし(-c copy)でコンテナだけ書き直し、正しい長さ・索引を持つファイルにする。
  let finalized = data;
  try {
    finalized = await remuxForSeeking(data, ext);
  } catch (err) {
    console.error("[remux] failed, saving original file as-is", err);
  }

  const rel = await saveBuffer("videos", filename, finalized);
  await prisma.session.update({
    where: { id: sessionId },
    data: { videoPath: rel, recordedAt: new Date() },
  });
  return rel;
}

export async function finalizeSession(sessionId: string) {
  const session = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
  if (!session.videoPath) {
    throw new Error("session has no uploaded media yet");
  }
  await prisma.session.update({ where: { id: sessionId }, data: { status: "processing" } });

  try {
    const buffer = await readStoredFile(session.videoPath);
    // GeminiはBase64インライン音声としてwebm等のブラウザネイティブ形式を受け付けないため、
    // STT呼び出し用に音声トラックのみwavへ変換する（保存済みの元ファイルには影響しない）。
    // ダミーモードでは音声内容自体を読まないため変換をスキップする（ffmpeg不要で動かせるようにする）。
    const { wav: wavBuffer, offsetSec } = DUMMY_MODE
      ? { wav: buffer, offsetSec: 0 }
      : await extractAudioForStt(buffer);

    const sttResult = await transcribeAudio(wavBuffer, "wav", session.questionText);
    // STTは抽出後の音声（音声トラックの開始オフセット分だけ元動画より短い）を基準に
    // タイムスタンプを返すため、元動画のタイムラインに合わせてoffsetSecを加算する。
    const utterances = sttResult.utterances.map((u) => ({
      ...u,
      startSec: u.startSec + offsetSec,
      endSec: u.endSec + offsetSec,
    }));

    // STTが返す最終タイムスタンプは、聞き取り漏れ等で実際の録画の終端より
    // 手前で止まることがある（実測済み）。remux済みファイルの実長をffprobeで直接測り、
    // それより短くなっていないかを確認して正とする。
    const trueDurationSec = DUMMY_MODE ? 0 : await probeDuration(buffer);
    const durationSec = Math.max(sttResult.durationSec + offsetSec, trueDurationSec);

    await prisma.utterance.deleteMany({ where: { sessionId } });
    if (utterances.length > 0) {
      await prisma.utterance.createMany({
        data: utterances.map((u) => ({
          sessionId,
          startSec: u.startSec,
          endSec: u.endSec,
          speaker: u.speaker,
          text: u.text,
        })),
      });
    }

    const episodes = await structureSession({
      questionText: session.questionText,
      occasionHint: session.occasionHint,
      utterances,
      durationSec,
    });
    // 発話内容から区切られた末尾のエピソードが、実際の録画終端より手前で終わっている場合、
    // そこで再生が途切れてしまう（発話終盤の聞き取り漏れなど）。末尾のエピソードだけは
    // 録画の実終端まで伸ばし、内容が欠けずに再生できるようにする。
    if (episodes.length > 0) {
      const last = episodes.reduce((a, b) => (a.endSec >= b.endSec ? a : b));
      last.endSec = Math.max(last.endSec, durationSec);
    }

    await prisma.episode.deleteMany({ where: { sessionId } });
    if (episodes.length > 0) {
      await prisma.episode.createMany({
        data: episodes.map((e) => ({
          sessionId,
          title: e.title,
          startSec: e.startSec,
          endSec: e.endSec,
          tags: e.tags,
          era: e.era,
          people: e.people,
          theme: e.theme,
          deliverTo: e.deliverTo,
          occasion: e.occasion,
        })),
      });
    }

    await prisma.session.update({
      where: { id: sessionId },
      data: { status: "structured", durationSec },
    });

    await recomputeCoverage(session.personId);

    // 次回の収録画面を即座に開けるよう、次の質問候補をバックグラウンドで事前生成しておく。
    // レスポンスは待たせない（fire-and-forget）。
    refreshSuggestedQuestions(session.personId).catch((err) => {
      console.error("[refresh suggested questions] failed", err);
    });

    return prisma.session.findUniqueOrThrow({
      where: { id: sessionId },
      include: { episodes: true, utterances: true },
    });
  } catch (err) {
    await prisma.session.update({ where: { id: sessionId }, data: { status: "failed" } });
    throw err;
  }
}

// 確認画面（画面04）で「残さない」を選んだ場合の実削除。
// UI仕様書2章の制約どおり、「残さないときは、保存しません。」を文字通り実装する
// （除外フラグで隠すのではなく、動画ファイル・発話・エピソード・セッション行を消す）。
export async function discardSession(sessionId: string): Promise<void> {
  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session) return;
  await prisma.utterance.deleteMany({ where: { sessionId } });
  await prisma.episode.deleteMany({ where: { sessionId } });
  await prisma.session.delete({ where: { id: sessionId } });
  if (session.videoPath) await deleteStoredFile(session.videoPath);
  if (session.audioPath) await deleteStoredFile(session.audioPath);
  await recomputeCoverage(session.personId);
}

export async function toggleEpisodeExclusion(episodeId: string, excluded: boolean) {
  const episode = await prisma.episode.update({ where: { id: episodeId }, data: { excluded } });
  const session = await prisma.session.findUniqueOrThrow({ where: { id: episode.sessionId } });
  await recomputeCoverage(session.personId);
  return episode;
}

// ---- Photos (wow機能: カラー化＋写真ベース質問生成) ----

export async function listPhotos(personId: string) {
  return prisma.photo.findMany({ where: { personId }, orderBy: { uploadedAt: "desc" } });
}

// AIには色だけを決めさせ、最終画像の構造（明暗＝輪郭・表情）は常に元写真からそのまま使う。
// AI出力の輝度は使わず捨てるため、「顔の向き・輪郭が変わる」ことが構造的に起こらなくなる
// （lib/media.tsのmergeLumaFromOriginal参照）。合成に失敗した場合はAIの出力をそのまま使う。
async function colorizeWithStructurePreserved(
  original: Buffer,
  originalExt: string,
  filename: string,
  extraInstruction?: string
): Promise<{ image: Buffer; ext: "png" | "jpg" }> {
  const colorized = await colorizePhoto(original, filename, extraInstruction);
  try {
    const merged = await mergeLumaFromOriginal(original, originalExt, colorized.image, colorized.ext);
    return { image: merged, ext: "png" };
  } catch (err) {
    console.error("[luma merge] failed, falling back to AI output as-is", err);
    return colorized;
  }
}

export async function createPhoto(personId: string, data: Buffer, mimeType: string) {
  const id = randomUUID();
  const ext = mimeType.includes("png") ? "png" : "jpg";
  const originalRel = await saveBuffer("photos", `${id}_original.${ext}`, data);

  let colorizedRel: string | null = null;
  try {
    const colorized = await colorizeWithStructurePreserved(data, ext, `${id}_original.${ext}`);
    colorizedRel = await saveBuffer("photos", `${id}_colorized.${colorized.ext}`, colorized.image);
  } catch (err) {
    console.error("[photo colorize] failed", err);
  }

  return prisma.photo.create({
    data: {
      id,
      personId,
      originalPath: originalRel,
      colorizedPath: colorizedRel,
    },
  });
}

export async function recolorizePhoto(photoId: string, comment: string) {
  const photo = await prisma.photo.findUniqueOrThrow({ where: { id: photoId } });
  const original = await readStoredFile(photo.originalPath);
  const ext = photo.originalPath.split(".").pop() ?? "jpg";
  const filename = photo.originalPath.split("/").pop() ?? `${photo.id}_original.${ext}`;

  const colorized = await colorizeWithStructurePreserved(original, ext, filename, comment.trim() || undefined);
  const colorizedRel = await saveBuffer("photos", `${photo.id}_colorized.${colorized.ext}`, colorized.image);

  return prisma.photo.update({
    where: { id: photoId },
    data: { colorizedPath: colorizedRel, lastComment: comment.trim() || null },
  });
}

export async function deletePhoto(photoId: string) {
  const photo = await prisma.photo.findUniqueOrThrow({ where: { id: photoId } });
  // この写真から生成した収録セッションが参照している場合、先に紐付けを外してから削除する
  // （Photo削除時の外部キー制約に抵触しないようにするため）。
  await prisma.session.updateMany({ where: { sourcePhotoId: photoId }, data: { sourcePhotoId: null } });
  await prisma.photo.delete({ where: { id: photoId } });
  await deleteStoredFile(photo.originalPath);
  if (photo.colorizedPath) await deleteStoredFile(photo.colorizedPath);
}

export async function suggestQuestionForPhoto(photoId: string) {
  const photo = await prisma.photo.findUniqueOrThrow({ where: { id: photoId } });
  const person = await prisma.person.findUniqueOrThrow({ where: { id: photo.personId } });
  const relPath = photo.colorizedPath ?? photo.originalPath;
  const buffer = await readStoredFile(relPath);
  const mimeType = relPath.endsWith(".png") ? "image/png" : "image/jpeg";
  const question = await suggestQuestionFromPhoto(buffer, mimeType, person.name);
  return question;
}

export type { StorageCategory };
