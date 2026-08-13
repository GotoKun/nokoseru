"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lightbox } from "@/app/components/Lightbox";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";

export interface PhotoItem {
  id: string;
  originalUrl: string;
  colorizedUrl: string | null;
  lastComment: string | null;
}

export function PhotoCard({
  personId,
  photo,
  onDeleted,
}: {
  personId: string;
  photo: PhotoItem;
  onDeleted: (photoId: string) => void;
}) {
  const router = useRouter();
  const [colorizedUrl, setColorizedUrl] = useState(photo.colorizedUrl);
  const [comment, setComment] = useState(photo.lastComment ?? "");
  const [recoloring, setRecoloring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function recolorize() {
    setRecoloring(true);
    setError(null);
    try {
      const res = await fetch(`/api/persons/${personId}/photos/${photo.id}/recolorize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment }),
      });
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      // キャッシュされた同一URLを再取得させるためタイムスタンプを付与する。
      setColorizedUrl(`${data.photo.colorizedUrl}?t=${Date.now()}`);
    } catch {
      setError("作り直しに失敗しました。もう一度お試しください。");
    } finally {
      setRecoloring(false);
    }
  }

  async function generateQuestion() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/persons/${personId}/photos/${photo.id}/suggest-question`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      setQuestion(data.question);
    } catch {
      setError("質問の生成に失敗しました。もう一度お試しください。");
    } finally {
      setGenerating(false);
    }
  }

  function startRecordingWithQuestion() {
    if (!question) return;
    const params = new URLSearchParams({ q: question, photoId: photo.id });
    router.push(`/persons/${personId}/record?${params.toString()}`);
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/persons/${personId}/photos/${photo.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("failed");
      onDeleted(photo.id);
    } catch {
      setError("削除に失敗しました。もう一度お試しください。");
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  const displayColorizedUrl = colorizedUrl ?? photo.originalUrl;

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-[11px] text-muted mb-1">元の写真</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.originalUrl}
            alt="元の写真"
            onClick={() => setLightbox({ src: photo.originalUrl, alt: "元の写真" })}
            className="w-full cursor-zoom-in rounded-lg border border-border aspect-square object-cover hover:opacity-90"
          />
        </div>
        <div>
          <p className="text-[11px] text-muted mb-1">カラー化</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={displayColorizedUrl}
            alt="カラー化した写真"
            onClick={() => setLightbox({ src: displayColorizedUrl, alt: "カラー化した写真" })}
            className="w-full cursor-zoom-in rounded-lg border border-border aspect-square object-cover hover:opacity-90"
          />
        </div>
      </div>

      <a
        href={displayColorizedUrl}
        download={`nokoseru-photo-${photo.id}.png`}
        className="mt-2 inline-block text-xs text-accent hover:underline"
      >
        カラー化した写真をダウンロード
      </a>

      <label className="mt-3 block">
        <span className="text-xs text-muted">修正したい点があればコメントで伝えてください</span>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="例：もう少し肌の色を明るく、背景は元のままで"
          rows={2}
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </label>
      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={recolorize}
          disabled={recoloring}
          className="rounded-full border border-border px-4 py-1.5 text-xs font-medium hover:border-accent disabled:opacity-50"
        >
          {recoloring ? "作り直しています…" : "この内容で作り直す"}
        </button>
        <button
          onClick={() => setConfirmingDelete(true)}
          className="rounded-full border border-border px-4 py-1.5 text-xs font-medium text-red-700 hover:border-red-700"
        >
          削除する
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}

      <div className="mt-3 border-t border-border pt-3">
        {!question ? (
          <button
            onClick={generateQuestion}
            disabled={generating}
            className="text-xs text-accent hover:underline disabled:opacity-50"
          >
            {generating ? "考えています…" : "この写真から質問をつくる"}
          </button>
        ) : (
          <div>
            <p className="text-xs">{question}</p>
            <button
              onClick={startRecordingWithQuestion}
              className="mt-2 rounded-full bg-accent px-4 py-1.5 text-xs font-medium text-white hover:opacity-90"
            >
              この質問で収録する
            </button>
          </div>
        )}
      </div>

      {lightbox && (
        <Lightbox src={lightbox.src} alt={lightbox.alt} onClose={() => setLightbox(null)} />
      )}

      {confirmingDelete && (
        <ConfirmDialog
          title="この写真を削除しますか"
          description="元の写真・カラー化した写真の両方が削除されます。この操作は取り消せません。"
          confirmLabel="削除する"
          busy={deleting}
          onConfirm={handleDelete}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  );
}
