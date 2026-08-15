import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

// GeminiはBase64インライン音声としてwebmを受け付けない
// （実測: "mime type is not supported by Gemini: 'audio/webm'"、対応形式はmp3/wav/mp4等のみ）。
// ブラウザ(MediaRecorder)はChromeではwebm以外をほぼ生成できないため、
// STT呼び出し直前だけffmpegで音声トラックをwavに変換する。保存・再生用の元ファイルは変更しない。
//
// 注意: ChromeのMediaRecorderが生成するwebmは、マイクの起動遅延により音声トラックが
// 動画トラックより後（実測で数秒〜の場合あり）から始まることがある。ffmpegで抽出したwavは
// その分だけ元動画より短く、かつ0秒基点で始まる。さらに実測では、先頭に無音を人工的に
// 詰めて長さを合わせてもGemini側のタイムスタンプはその無音区間を正しく考慮せず0秒付近から
// 発話が始まったものとして返してくることが確認された（STTモデル自身の絶対時刻把握は
// 無音区間をまたぐと信頼できない）。そのため無音パディングはせず、代わりに開始オフセットを
// ffprobeで独立に測定し、STTが返す相対タイムスタンプに後から加算して元動画の実時間に補正する。
export async function extractAudioForStt(
  input: Buffer
): Promise<{ wav: Buffer; offsetSec: number }> {
  const offsetSec = await probeAudioStartOffset(input);
  const wav = await runPiped(
    "ffmpeg",
    ["-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-vn", "-ac", "1", "-ar", "16000", "-f", "wav", "pipe:1"],
    input
  );
  return { wav, offsetSec };
}

// STTが返す発話区間の最終endSecは、実際の録画の終端より手前で止まることがある
// （実測: 発話終盤の聞き取り漏れ等でSTT側の最終タイムスタンプが動画の実際の長さより
// 1秒以上短くなるケースを確認）。それをそのままSession.durationSecやエピソードの
// 終端に使うと、まだ話している内容が再生できないまま途切れてしまう。
// remux後（Durationがヘッダーに正しく入った状態）のファイルであれば、この関数で
// 実際の録画時間をffprobeから直接・確実に取得できる。
export async function probeDuration(input: Buffer): Promise<number> {
  try {
    const stdout = await runPiped(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", "-i", "pipe:0"],
      input
    );
    const value = Number(stdout.toString("utf8").trim());
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

async function probeAudioStartOffset(input: Buffer): Promise<number> {
  try {
    const stdout = await runPiped(
      "ffprobe",
      ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=start_time", "-of", "json", "-i", "pipe:0"],
      input
    );
    const parsed = JSON.parse(stdout.toString("utf8"));
    const value = Number(parsed?.streams?.[0]?.start_time);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0; // 取得できない場合は補正なしで続行する
  }
}

// ChromeのMediaRecorderが書き出すwebmは「ライブ配信中」扱いのストリーミング形式のままで、
// Segment Duration・Cues（シーク索引）がヘッダーに書き込まれていない
// （ffprobeで確認すると常に "Duration: N/A" になる）。この状態のファイルを<video>で再生すると、
// ブラウザが長さを推測しながら再生するため、シークや再生の途中で映像が乱れる・止まる不具合が起きる。
// ffmpegで再エンコードなし（-c copy）のままコンテナだけ書き直す（remux）ことで、
// 長さとシーク索引が正しく入った通常のファイルになる。
// Duration/Cuesの書き込みには最後にファイル先頭へシークして書き戻す必要があり、パイプ出力では
// finalizeされない（実測で確認済み）ため、出力は実ファイルにする。
export async function remuxForSeeking(input: Buffer, ext: string): Promise<Buffer> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "nokoseru-remux-"));
  const inPath = path.join(dir, `in.${ext}`);
  const outPath = path.join(dir, `out.${ext}`);
  try {
    await writeFile(inPath, input);
    await runFile("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", inPath, "-c", "copy", outPath]);
    return await readFile(outPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// 写真カラー化のAI出力は、プロンプトで「輪郭・向きを変えないで」と指示しても
// 守られる保証がない（実測で顔の変形を確認済み）。そこで最終画像の構造（明暗＝形・輪郭・表情）は
// 常に元の白黒写真からそのまま使い、AIの出力からは色情報（色相・彩度）だけを抜き出して重ねる。
// これにより構造の同一性は「AIへのお願い」ではなく合成処理として保証される。
//
// AI出力は元写真と解像度・構図が完全には一致しない（実測: 400x400入力→1024x1024出力）ため、
// 色情報はscale2refで元写真のサイズに合わせたうえ、軽くぼかして重ねる。
// これは動画・画像圧縮のクロマサブサンプリング（JPEG等が採用）と同じ考え方で、
// 人間の目は明暗のズレには敏感だが色のズレには鈍感なため、多少の位置ズレを目立たなくできる。
export async function mergeLumaFromOriginal(
  original: Buffer,
  originalExt: string,
  colorized: Buffer,
  colorizedExt: string
): Promise<Buffer> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "nokoseru-colorize-"));
  const origPath = path.join(dir, `orig.${originalExt}`);
  const colorPath = path.join(dir, `color.${colorizedExt}`);
  const outPath = path.join(dir, "out.png");
  try {
    await writeFile(origPath, original);
    await writeFile(colorPath, colorized);
    await runFile("ffmpeg", [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      origPath,
      "-i",
      colorPath,
      "-filter_complex",
      "[1:v][0:v]scale2ref=w=iw:h=ih[csc][org];" +
        "[org]format=yuv420p,extractplanes=y[y];" +
        "[csc]format=yuv420p,extractplanes=u+v[uraw][vraw];" +
        "[uraw]gblur=sigma=3[u];[vraw]gblur=sigma=3[v];" +
        "[y][u][v]mergeplanes=0x001020:yuv420p[out]",
      "-map",
      "[out]",
      outPath,
    ]);
    return await readFile(outPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function runFile(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args);
    const errChunks: Buffer[] = [];
    proc.stderr.on("data", (d) => errChunks.push(d));
    proc.on("error", (err) => reject(toFriendlyError(err)));
    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code}: ${Buffer.concat(errChunks).toString()}`));
      }
    });
  });
}

function runPiped(command: string, args: string[], input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args);
    const outChunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    proc.stdout.on("data", (d) => outChunks.push(d));
    proc.stderr.on("data", (d) => errChunks.push(d));
    // 相手プロセスが入力を読み切る前に終了すると書き込み側でEPIPEが発生する。
    // これはハンドラを付けないとNodeのuncaughtExceptionになるため、ここで捕捉して無視する
    // （プロセスの成否自体は'close'のexit codeで判定する）。
    proc.stdin.on("error", () => {});
    proc.on("error", (err) => reject(toFriendlyError(err)));
    proc.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(outChunks));
      } else {
        reject(new Error(`${command} exited with code ${code}: ${Buffer.concat(errChunks).toString()}`));
      }
    });
    proc.stdin.write(input);
    proc.stdin.end();
  });
}

function toFriendlyError(err: unknown): Error {
  if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
    return new Error("ffmpeg/ffprobeが見つかりません。`brew install ffmpeg` 等でインストールしてください。");
  }
  return err instanceof Error ? err : new Error(String(err));
}
