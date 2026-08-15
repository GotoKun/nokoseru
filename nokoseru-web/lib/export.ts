import { ZipArchive } from "archiver";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { prisma } from "./prisma";
import { OCCASIONS } from "./occasions";
import { absolutePath, relativePath } from "./storage";
import { buildSrt } from "./srt";
import { buildViewerHtml, type ExportData } from "./viewer-template";

// design: nokoseru_design.md 8章「エクスポート仕様」
// video + SRT + data.json + 自己完結型viewer.html をzipにまとめる。
// サーバー・LLM不要でviewer.htmlを開くだけで検索・再生ができるようにする。

export async function buildExportBundle(personId: string): Promise<string> {
  const person = await prisma.person.findUniqueOrThrow({ where: { id: personId } });
  const sessions = await prisma.session.findMany({
    where: {
      personId,
      status: "structured",
      videoPath: { not: null },
      // 鍵付きメッセージ：開封日時が来ていないセッションはエクスポートにも含めない
      // （エクスポート経由で鍵を回避できてしまうのを防ぐ）。
      OR: [{ unlockAt: null }, { unlockAt: { lte: new Date() } }],
    },
    include: {
      utterances: { orderBy: { startSec: "asc" } },
      episodes: { where: { excluded: false } },
    },
    orderBy: { recordedAt: "asc" },
  });

  const exportData: ExportData = {
    person: { id: person.id, name: person.name, relation: person.relation },
    generatedAt: new Date().toISOString(),
    sessions: [],
    episodes: [],
  };

  const filename = `${person.id}_${Date.now()}.zip`;
  const rel = relativePath("exports", filename);
  const abs = absolutePath(rel);
  await mkdir(path.dirname(abs), { recursive: true });

  const output = createWriteStream(abs);
  const archive = new ZipArchive({ zlib: { level: 9 } });
  const done = new Promise<void>((resolve, reject) => {
    output.on("close", () => resolve());
    archive.on("error", reject);
  });
  archive.pipe(output);

  for (const session of sessions) {
    if (session.episodes.length === 0) continue; // 除外等で公開エピソードがないセッションは含めない
    const videoExt = path.extname(session.videoPath ?? "") || ".webm";
    const videoFile = `videos/session_${session.id}${videoExt}`;
    const subtitleFile = `subtitles/session_${session.id}.srt`;

    if (session.videoPath) {
      archive.file(absolutePath(session.videoPath), { name: videoFile });
    }
    const srt = buildSrt(session.utterances);
    archive.append(srt, { name: subtitleFile });

    exportData.sessions.push({
      id: session.id,
      questionText: session.questionText,
      recordedAt: session.recordedAt ? session.recordedAt.toISOString() : null,
      durationSec: session.durationSec ?? 0,
      videoFile,
      subtitleFile,
    });

    for (const ep of session.episodes) {
      exportData.episodes.push({
        id: ep.id,
        sessionId: session.id,
        title: ep.title,
        startSec: ep.startSec,
        endSec: ep.endSec,
        tags: (ep.tags as string[]) ?? [],
        era: ep.era,
        people: (ep.people as string[]) ?? [],
        theme: ep.theme,
        occasion: ep.occasion,
        occasionLabel: OCCASIONS.find((o) => o.id === ep.occasion)?.label ?? "未分類",
      });
    }
  }

  archive.append(JSON.stringify(exportData, null, 2), { name: "data.json" });
  archive.append(buildViewerHtml(exportData), { name: "viewer.html" });

  await archive.finalize();
  await done;

  await prisma.delivery.create({
    data: {
      personId,
      occasion: "export_all",
      deliveredAt: new Date(),
      exportBundlePath: rel,
    },
  });

  return rel;
}
