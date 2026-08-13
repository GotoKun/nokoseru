import { prisma } from "./prisma";
import {
  OCCASIONS,
  coverageStatusFromCount,
  type OccasionId,
} from "./occasions";
import {
  generateCandidateQuestions,
  structureSession,
  transcribeAudio,
  colorizePhoto,
  suggestQuestionFromPhoto,
  DUMMY_MODE,
  type CandidateQuestion,
} from "./orcarouter";
import { saveBuffer, readStoredFile, deleteStoredFile, mediaUrl, type StorageCategory } from "./storage";
import { extractAudioForStt, remuxForSeeking, probeDuration } from "./media";
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

export async function createPerson(name: string, relation: string | null) {
  const person = await prisma.person.create({ data: { name, relation } });
  await prisma.coverage.createMany({
    data: OCCASIONS.map((o) => ({ personId: person.id, occasion: o.id, status: "empty" })),
  });
  return person;
}

export async function getPerson(personId: string) {
  return prisma.person.findUnique({ where: { id: personId } });
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
      create: { personId, occasion: occ.id, status },
    });
  }
}

export async function getCoverageMap(personId: string) {
  const existing = await prisma.coverage.findMany({ where: { personId } });
  if (existing.length === 0) {
    await prisma.coverage.createMany({
      data: OCCASIONS.map((o) => ({ personId, occasion: o.id, status: "empty" })),
    });
    return prisma.coverage.findMany({ where: { personId } });
  }
  return existing;
}

// ---- Next question candidates ----

export async function getNextQuestionCandidates(personId: string): Promise<CandidateQuestion[]> {
  const person = await prisma.person.findUniqueOrThrow({ where: { id: personId } });
  const coverage = await getCoverageMap(personId);
  const coverageSummary = coverage.map((c) => ({
    occasion: c.occasion as OccasionId,
    label: OCCASIONS.find((o) => o.id === c.occasion)?.label ?? c.occasion,
    status: c.status,
  }));
  const recentEpisodes = await prisma.episode.findMany({
    where: { excluded: false, session: { personId } },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { title: true, theme: true },
  });

  return generateCandidateQuestions({
    personName: person.name,
    relation: person.relation,
    coverageSummary,
    recentEpisodeSummaries: recentEpisodes.map((e) => e.theme || e.title),
  });
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
}

export async function searchEpisodes(personId: string, query: string): Promise<EpisodeSearchResult[]> {
  const episodes = await prisma.episode.findMany({
    where: { excluded: false, session: { personId, status: "structured" } },
    include: { session: true },
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
  }));
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

    return prisma.session.findUniqueOrThrow({
      where: { id: sessionId },
      include: { episodes: true, utterances: true },
    });
  } catch (err) {
    await prisma.session.update({ where: { id: sessionId }, data: { status: "failed" } });
    throw err;
  }
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

export async function createPhoto(personId: string, data: Buffer, mimeType: string) {
  const id = randomUUID();
  const ext = mimeType.includes("png") ? "png" : "jpg";
  const originalRel = await saveBuffer("photos", `${id}_original.${ext}`, data);

  let colorizedRel: string | null = null;
  try {
    const colorized = await colorizePhoto(data, `${id}_original.${ext}`);
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
  const filename = photo.originalPath.split("/").pop() ?? `${photo.id}_original.jpg`;

  const colorized = await colorizePhoto(original, filename, comment.trim() || undefined);
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
