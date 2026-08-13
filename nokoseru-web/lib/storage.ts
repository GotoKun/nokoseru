import { mkdir, readFile, writeFile, stat, unlink } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

// ローカルファイルシステムへの保存を抽象化する薄いレイヤー。
// design: nokoseru_design.md 3章「動画保存」— 本番はS3互換の3層ストレージに差し替える前提。
// ここでの関数シグネチャ（category + key で相対パスを受け取り、保存先を意識しない）は
// そのままS3実装（putObject(key, buffer) 相当）に置き換えられるように保っている。

const STORAGE_ROOT = path.join(process.cwd(), "storage");

export type StorageCategory = "videos" | "photos" | "exports";

export function relativePath(category: StorageCategory, filename: string): string {
  return path.posix.join(category, filename);
}

export function absolutePath(relPath: string): string {
  const resolved = path.join(STORAGE_ROOT, relPath);
  if (!resolved.startsWith(STORAGE_ROOT)) {
    throw new Error("invalid storage path");
  }
  return resolved;
}

export async function saveBuffer(
  category: StorageCategory,
  filename: string,
  data: Buffer
): Promise<string> {
  const rel = relativePath(category, filename);
  const abs = absolutePath(rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, data);
  return rel;
}

export async function saveStream(
  category: StorageCategory,
  filename: string,
  stream: ReadableStream<Uint8Array>
): Promise<string> {
  const rel = relativePath(category, filename);
  const abs = absolutePath(rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await pipeline(Readable.fromWeb(stream as never), createWriteStream(abs));
  return rel;
}

export async function readStoredFile(relPath: string): Promise<Buffer> {
  return readFile(absolutePath(relPath));
}

export async function deleteStoredFile(relPath: string): Promise<void> {
  try {
    await unlink(absolutePath(relPath));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

export async function storedFileExists(relPath: string): Promise<boolean> {
  try {
    await stat(absolutePath(relPath));
    return true;
  } catch {
    return false;
  }
}

export function mediaUrl(relPath: string): string {
  return `/api/media/${relPath}`;
}
