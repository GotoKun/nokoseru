function toTimestamp(sec: number): string {
  const clamped = Math.max(0, sec);
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const seconds = Math.floor(clamped % 60);
  const ms = Math.round((clamped - Math.floor(clamped)) * 1000);
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(ms, 3)}`;
}

export function buildSrt(utterances: { startSec: number; endSec: number; text: string }[]): string {
  return utterances
    .map((u, i) => {
      return `${i + 1}\n${toTimestamp(u.startSec)} --> ${toTimestamp(u.endSec)}\n${u.text}\n`;
    })
    .join("\n");
}
