import OpenAI from "openai";
import { OCCASIONS, type OccasionId } from "./occasions";

// OrcaRouter経由のLLM/STT/画像編集呼び出しをまとめたモジュール。
// design: nokoseru_design.md 4章「OrcaRouter利用設計」準拠。
//
// モデル選定（4.4節）:
//   質問生成       -> 明示指定（デモの再現性優先）
//   文字起こし     -> google/gemini-2.5-flash 固定（音声入力対応がGeminiのみ）
//   構造化・タグ付け -> orcarouter/auto（balanced、軽い定型タスクのコスト最適化を見せる）
//
// APIキー未設定時はダミーモードで動作する（8/13の開発スケジュール「ダミートランスクリプトでの
// 構造化ロジック先行実装」に対応）。本番/デモ提出では ORCAROUTER_API_KEY を必ず設定すること。

const QUESTION_MODEL = "anthropic/claude-sonnet-4.6";
const TRANSCRIBE_MODEL = "google/gemini-2.5-flash";
const STRUCTURE_MODEL = "orcarouter/auto";
// OrcaRouterの/v1/images/editsは公式ドキュメント（/ja/other-apis/images）に記載がなく、
// 実際にopenai/gpt-image-1-mini経由で使うと顔の向き・輪郭が変わる強いデフォルメが確認された。
// ドキュメントが編集用途として案内しているのはchat completions経由のGemini画像モデル
// （通称nano-banana系）のため、そちらに切り替える。
const IMAGE_EDIT_MODEL = "google/gemini-2.5-flash-image";
const VISION_MODEL = "anthropic/claude-sonnet-4.6";

export const DUMMY_MODE = !process.env.ORCAROUTER_API_KEY;

function client(): OpenAI {
  return new OpenAI({
    apiKey: process.env.ORCAROUTER_API_KEY,
    baseURL: process.env.ORCAROUTER_BASE_URL ?? "https://api.orcarouter.ai/v1",
  });
}

function logResolvedModel(label: string, response: { headers?: Headers } | null) {
  const resolved = response?.headers?.get?.("x-orca-resolved-model");
  if (resolved) {
    console.log(`[OrcaRouter] ${label} -> resolved model: ${resolved}`);
  }
}

// モデル出力はコードフェンス混じり等の揺れがあるため、寛容にJSONを取り出す。
function extractJson<T>(raw: string): T {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : trimmed;
  const start = candidate.indexOf("{");
  const arrStart = candidate.indexOf("[");
  const firstBrace =
    start === -1 ? arrStart : arrStart === -1 ? start : Math.min(start, arrStart);
  const jsonSlice = firstBrace >= 0 ? candidate.slice(firstBrace) : candidate;
  return JSON.parse(jsonSlice) as T;
}

export interface UtteranceDraft {
  startSec: number;
  endSec: number;
  speaker: "interviewee" | "ai";
  text: string;
}

export interface TranscribeResult {
  utterances: UtteranceDraft[];
  durationSec: number;
}

export async function transcribeAudio(
  audio: Buffer,
  format: "webm" | "mp4" | "wav" | "ogg",
  questionText: string
): Promise<TranscribeResult> {
  if (DUMMY_MODE) {
    return dummyTranscribe(questionText);
  }

  const base64 = audio.toString("base64");
  const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    {
      type: "text",
      text:
        `これはインタビューでの質問「${questionText}」に対する回答音声です。` +
        "この音声を文字起こしし、発話区間ごとのタイムスタンプ(秒, 数値)をJSONで出力してください。" +
        '出力形式: {"utterances": [{"startSec": 0.0, "endSec": 4.2, "speaker": "interviewee", "text": "..."}]}。' +
        "speakerは基本すべて interviewee としてください。他のテキストは一切出力しないでください。",
    },
    {
      type: "input_audio",
      // OpenAI公式SDKの型は wav/mp3 のみを許容するが、OrcaRouter経由のGeminiは
      // webm等も受け付ける（design 4.2節のサンプルどおり）ため型を緩めてキャストする。
      input_audio: { data: base64, format: format as "wav" | "mp3" },
    },
  ];
  const res = await client().chat.completions.create({
    model: TRANSCRIBE_MODEL,
    messages: [{ role: "user", content }],
    response_format: { type: "json_object" },
  });
  logResolvedModel("transcribe", res as never);

  const raw = res.choices[0]?.message?.content ?? "{}";
  const parsed = extractJson<{ utterances: UtteranceDraft[] }>(raw);
  const utterances = (parsed.utterances ?? []).map((u) => ({
    startSec: Number(u.startSec) || 0,
    endSec: Number(u.endSec) || 0,
    speaker: (u.speaker === "ai" ? "ai" : "interviewee") as "interviewee" | "ai",
    text: String(u.text ?? ""),
  }));
  const durationSec = utterances.reduce((max, u) => Math.max(max, u.endSec), 0);
  return { utterances, durationSec };
}

export interface EpisodeDraft {
  title: string;
  startSec: number;
  endSec: number;
  tags: string[];
  era: string | null;
  people: string[];
  theme: string | null;
  deliverTo: string[];
  occasion: OccasionId | null;
}

export async function structureSession(params: {
  questionText: string;
  occasionHint: string | null;
  utterances: UtteranceDraft[];
  durationSec: number;
}): Promise<EpisodeDraft[]> {
  if (DUMMY_MODE) {
    return dummyStructure(params);
  }

  const transcriptBlock = params.utterances
    .map((u) => `[${u.startSec.toFixed(1)}-${u.endSec.toFixed(1)}] ${u.text}`)
    .join("\n");

  const occasionList = OCCASIONS.map((o) => `${o.id}: ${o.label}`).join(", ");

  const res = await client().chat.completions.create({
    model: STRUCTURE_MODEL,
    messages: [
      {
        role: "system",
        content:
          "あなたはインタビュー記録の構造化を行うアシスタントです。発話内容の改変・要約による意味変更は行わず、" +
          "発話区間をエピソードに分割してタグ付けするだけの役割です。",
      },
      {
        role: "user",
        content:
          `質問: 「${params.questionText}」\n` +
          `想定配信先ヒント: ${params.occasionHint ?? "なし"}\n` +
          `節目カテゴリの選択肢: ${occasionList}\n\n` +
          `文字起こし（発話区間ごと）:\n${transcriptBlock}\n\n` +
          "この回答を1〜3個のエピソードに分割し、以下のJSON形式で出力してください。" +
          "startSec/endSecは元の発話区間の範囲内で設定し、区間を連結・並べ替えしないこと。" +
          '出力形式: {"episodes": [{"title": "短い見出し", "startSec": 0.0, "endSec": 10.0, ' +
          '"tags": ["タグ1","タグ2"], "era": "時代・年代の目安 or null", "people": ["登場人物"], ' +
          '"theme": "テーマ", "deliverTo": ["配信対象の説明"], "occasion": "上記occasion idのいずれか or null"}]}' +
          "他のテキストは一切出力しないこと。",
      },
    ],
    response_format: { type: "json_object" },
  });
  logResolvedModel("structure", res as never);

  const raw = res.choices[0]?.message?.content ?? "{}";
  const parsed = extractJson<{ episodes: EpisodeDraft[] }>(raw);
  const validOccasions = new Set(OCCASIONS.map((o) => o.id));

  return (parsed.episodes ?? []).map((e) => ({
    title: String(e.title ?? "無題のエピソード"),
    startSec: clamp(Number(e.startSec) || 0, 0, params.durationSec),
    endSec: clamp(Number(e.endSec) || params.durationSec, 0, params.durationSec),
    tags: Array.isArray(e.tags) ? e.tags.map(String) : [],
    era: e.era ? String(e.era) : null,
    people: Array.isArray(e.people) ? e.people.map(String) : [],
    theme: e.theme ? String(e.theme) : null,
    deliverTo: Array.isArray(e.deliverTo) ? e.deliverTo.map(String) : [],
    occasion: validOccasions.has(e.occasion as OccasionId) ? (e.occasion as OccasionId) : null,
  }));
}

function clamp(v: number, min: number, max: number): number {
  if (Number.isNaN(v)) return min;
  return Math.min(Math.max(v, min), Math.max(min, max));
}

export interface CandidateQuestion {
  text: string;
  occasionHint: OccasionId;
}

export async function generateCandidateQuestions(params: {
  personName: string;
  relation: string | null;
  coverageSummary: { occasion: OccasionId; label: string; status: string }[];
  recentEpisodeSummaries: string[];
}): Promise<CandidateQuestion[]> {
  if (DUMMY_MODE) {
    return dummyQuestions(params.coverageSummary);
  }

  const coverageText = params.coverageSummary
    .map((c) => `${c.label}(${c.occasion}): ${c.status}`)
    .join(" / ");
  const recentText =
    params.recentEpisodeSummaries.length > 0
      ? params.recentEpisodeSummaries.map((s) => `- ${s}`).join("\n")
      : "（まだ収録なし）";

  const res = await client().chat.completions.create({
    model: QUESTION_MODEL,
    messages: [
      {
        role: "system",
        content:
          "あなたは高齢者への回想インタビューの質問設計者です。以下のルールを厳守してください。" +
          "1) 質問はすべて過去形の回想質問にする（未来に向けた「一言メッセージ」形式は禁止）。" +
          "2) 死や相続を想起させる表現を避ける。3) 演出的・儀礼的な発話を誘発する質問を避ける。" +
          "4) 1問は1テーマに絞り、答えやすい具体的な質問にする。",
      },
      {
        role: "user",
        content:
          `対象者: ${params.personName}（${params.relation ?? "続柄不明"}）\n` +
          `これまでの収録状況: ${coverageText}\n` +
          `直近のエピソード概要:\n${recentText}\n\n` +
          "次に提示する質問候補を3件、できれば異なる節目カテゴリをカバーするように生成してください。" +
          'JSON形式で出力: {"questions": [{"text": "質問文", "occasionHint": "occasion id"}]}' +
          "occasionHintは child_marriage, grandchild_birth, child_career, child_hardship, daily のいずれか。" +
          "他のテキストは一切出力しないこと。",
      },
    ],
    response_format: { type: "json_object" },
  });
  logResolvedModel("questions", res as never);

  const raw = res.choices[0]?.message?.content ?? "{}";
  const parsed = extractJson<{ questions: CandidateQuestion[] }>(raw);
  const validOccasions = new Set(OCCASIONS.map((o) => o.id));
  const questions = (parsed.questions ?? [])
    .filter((q) => q.text)
    .map((q) => ({
      text: String(q.text),
      occasionHint: validOccasions.has(q.occasionHint) ? q.occasionHint : "daily",
    }));
  return questions.length > 0 ? questions : dummyQuestions(params.coverageSummary);
}

export interface ColorizeResult {
  image: Buffer;
  ext: "png" | "jpg";
}

export async function colorizePhoto(
  image: Buffer,
  filename: string,
  extraInstruction?: string
): Promise<ColorizeResult> {
  if (DUMMY_MODE) {
    // ダミーモードでは元画像をそのまま返す
    const ext = filename.toLowerCase().endsWith(".png") ? "png" : "jpg";
    return { image, ext };
  }
  const mimeType = filename.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
  const dataUrl = `data:${mimeType};base64,${image.toString("base64")}`;
  const promptText =
    "添付した白黒写真をカラー化してください。以下を厳守してください。\n" +
    "1. 人物の顔の向き・角度・輪郭・横幅・表情・視線・髪型は元の写真から絶対に変更しないこと。\n" +
    "2. 構図・背景・被写体の位置や大きさ・トリミング・画角を変更しないこと。\n" +
    "3. イラスト調・絵画調・美化・スタイル変換は行わず、元の写真と同じ写実的な質感を保つこと。\n" +
    "4. 新しい要素の追加や削除、修復・美肌のような加工もしないこと。\n" +
    "5. 変更してよいのは色情報のみとし、それ以外のピクセル構造・形状はできる限り忠実に保持すること。\n" +
    "肌・服・背景に自然な色を推定して着色した画像のみを返してください。説明文は不要です。" +
    (extraInstruction
      ? `\n\n追加の修正指示（上記1〜5の制約は維持したうえで反映してください）: ${extraInstruction}`
      : "");
  const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    { type: "text", text: promptText },
    { type: "image_url", image_url: { url: dataUrl } },
  ];
  const res = await client().chat.completions.create({
    model: IMAGE_EDIT_MODEL,
    messages: [{ role: "user", content }],
  });
  logResolvedModel("colorize", res as never);

  const result = extractImageDataUrl(res.choices[0]?.message);
  if (!result) {
    throw new Error("colorize failed: no image data returned");
  }
  return { image: dataUrlToBuffer(result.dataUrl), ext: result.mimeType.includes("png") ? "png" : "jpg" };
}

// OrcaRouter経由のGemini画像モデルは、生成画像をSDKの標準スキーマ外（message.images等）で
// 返すことがあるため、いくつかの想定される形を順に確認する。
interface ImageUrlPart {
  type?: string;
  image_url?: { url?: string };
}

function extractImageDataUrl(message: unknown): { dataUrl: string; mimeType: string } | null {
  if (!message || typeof message !== "object") return null;
  const m = message as { content?: unknown; images?: unknown };

  const fromUrl = (url: string | undefined) => {
    if (!url) return null;
    const match = url.match(/^data:([^;]+);base64,/);
    return { dataUrl: url, mimeType: match ? match[1] : "image/png" };
  };

  if (Array.isArray(m.images)) {
    for (const item of m.images as ImageUrlPart[]) {
      const found = fromUrl(item?.image_url?.url);
      if (found) return found;
    }
  }
  if (Array.isArray(m.content)) {
    for (const part of m.content as ImageUrlPart[]) {
      if (part?.type === "image_url") {
        const found = fromUrl(part.image_url?.url);
        if (found) return found;
      }
    }
  }
  if (typeof m.content === "string") {
    const match = m.content.match(/data:(image\/[a-zA-Z]+);base64,[A-Za-z0-9+/=]+/);
    if (match) return { dataUrl: match[0], mimeType: match[1] };
  }
  return null;
}

function dataUrlToBuffer(dataUrl: string): Buffer {
  const match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
  return Buffer.from(match ? match[1] : dataUrl, "base64");
}

export async function suggestQuestionFromPhoto(
  image: Buffer,
  mimeType: string,
  personName: string
): Promise<string> {
  if (DUMMY_MODE) {
    return `この写真が撮られたのはいつ頃で、どんな場面だったか覚えていますか`;
  }
  const dataUrl = `data:${mimeType};base64,${image.toString("base64")}`;
  const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    {
      type: "text",
      text:
        `これは${personName}さんの古い写真です。この写真に写っている場面・時代・人物を踏まえて、` +
        "過去形の回想を引き出す質問を1つだけ日本語で生成してください。未来に向けたメッセージや死を想起させる表現は禁止です。" +
        "質問文だけを出力してください（前置き・説明は不要）。",
    },
    { type: "image_url", image_url: { url: dataUrl } },
  ];
  const res = await client().chat.completions.create({
    model: VISION_MODEL,
    messages: [{ role: "user", content }],
  });
  logResolvedModel("photo-question", res as never);
  return (res.choices[0]?.message?.content ?? "").trim() || "この写真について教えてください";
}

// ---- ダミーモード（APIキー未設定時のフォールバック） ----

function dummyTranscribe(questionText: string): TranscribeResult {
  const script = [
    `${questionText}についてですね。ちょっと考えますね。`,
    "あれは確か、まだ若い頃のことでした。当時は今と違って何もかもが手探りで、大変だったけれど楽しかった記憶があります。",
    "一番覚えているのは、家族みんなで過ごした時間のことですね。何気ない日常が一番大事だったなと、今になって思います。",
  ];
  let t = 0;
  const utterances: UtteranceDraft[] = script.map((text) => {
    const startSec = t;
    const endSec = t + 6 + text.length / 12;
    t = endSec + 0.6;
    return { startSec, endSec, speaker: "interviewee" as const, text };
  });
  return { utterances, durationSec: t };
}

function dummyStructure(params: {
  questionText: string;
  occasionHint: string | null;
  utterances: UtteranceDraft[];
  durationSec: number;
}): EpisodeDraft[] {
  const validOccasions = new Set(OCCASIONS.map((o) => o.id));
  const occasion = validOccasions.has(params.occasionHint as OccasionId)
    ? (params.occasionHint as OccasionId)
    : "daily";
  return [
    {
      title: params.questionText.slice(0, 20),
      startSec: 0,
      endSec: params.durationSec,
      tags: ["ダミー収録", occasion],
      era: null,
      people: [],
      theme: params.questionText,
      deliverTo: [OCCASIONS.find((o) => o.id === occasion)?.label ?? "日常"],
      occasion,
    },
  ];
}

let dummyQuestionCursor = 0;

function dummyQuestions(
  coverageSummary: { occasion: OccasionId; label: string; status: string }[]
): CandidateQuestion[] {
  const pool: CandidateQuestion[] = [
    { text: "お二人が結婚したときのこと、覚えていますか", occasionHint: "child_marriage" },
    { text: "私が生まれた日のこと、何か覚えていますか", occasionHint: "grandchild_birth" },
    { text: "初めて働いたとき、どんな職場でしたか", occasionHint: "child_career" },
    { text: "一番しんどかった時期はいつ頃でしたか", occasionHint: "child_hardship" },
    { text: "得意料理はどうやって作っていましたか", occasionHint: "daily" },
    { text: "子どもの頃、よく遊んだ場所はどこでしたか", occasionHint: "daily" },
  ];
  const emptyFirst = [...pool].sort((a, b) => {
    const sa = coverageSummary.find((c) => c.occasion === a.occasionHint)?.status ?? "empty";
    const sb = coverageSummary.find((c) => c.occasion === b.occasionHint)?.status ?? "empty";
    const rank = (s: string) => (s === "empty" ? 0 : s === "thin" ? 1 : 2);
    return rank(sa) - rank(sb);
  });
  dummyQuestionCursor = (dummyQuestionCursor + 1) % pool.length;
  const rotated = [...emptyFirst.slice(dummyQuestionCursor), ...emptyFirst.slice(0, dummyQuestionCursor)];
  return rotated.slice(0, 3);
}
