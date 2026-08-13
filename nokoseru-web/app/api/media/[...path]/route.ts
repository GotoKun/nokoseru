import { NextResponse } from "next/server";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { absolutePath } from "@/lib/storage";

export const runtime = "nodejs";

const CONTENT_TYPES: Record<string, string> = {
  ".webm": "video/webm",
  ".mp4": "video/mp4",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".srt": "application/x-subrip",
  ".json": "application/json",
  ".zip": "application/zip",
  ".html": "text/html; charset=utf-8",
};

// storage/ 配下のローカルファイルをストリーム配信する。
// design 3章「動画保存」の抽象化に対応する読み出し側。本番はS3署名URLへの差し替えを想定。
export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;
  const relPath = segments.join("/");

  let abs: string;
  try {
    abs = absolutePath(relPath);
  } catch {
    return NextResponse.json({ error: "invalid path" }, { status: 400 });
  }

  let size: number;
  try {
    size = (await stat(abs)).size;
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const ext = path.extname(abs).toLowerCase();
  const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";
  // zip（エクスポート一式）はブラウザに表示させず確実にダウンロードさせる。
  const disposition: Record<string, string> = ext === ".zip" ? { "Content-Disposition": "attachment" } : {};

  const range = request.headers.get("range");
  if (range) {
    const match = /bytes=(\d+)-(\d*)/.exec(range);
    if (match) {
      const start = Number(match[1]);
      const end = match[2] ? Number(match[2]) : size - 1;
      const stream = createReadStream(abs, { start, end });
      return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
        status: 206,
        headers: {
          "Content-Type": contentType,
          "Content-Range": `bytes ${start}-${end}/${size}`,
          "Accept-Ranges": "bytes",
          "Content-Length": String(end - start + 1),
          ...disposition,
        },
      });
    }
  }

  const stream = createReadStream(abs);
  return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(size),
      "Accept-Ranges": "bytes",
      ...disposition,
    },
  });
}
