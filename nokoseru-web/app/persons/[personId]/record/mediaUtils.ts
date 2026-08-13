// iOS Safariなど MediaRecorder の対応コーデックが端末依存のため、
// 動画→音声の順にサポートされている形式を探索する。
// design: nokoseru_design.md 10章「iOS Safariでの録画可否」/ 企画書12.2 の縮退方針に対応。

const VIDEO_CANDIDATES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4",
];

const AUDIO_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];

export function pickSupportedMimeType(withVideo: boolean): string | null {
  const candidates = withVideo ? VIDEO_CANDIDATES : AUDIO_CANDIDATES;
  if (typeof MediaRecorder === "undefined") return null;
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return null;
}

export function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
