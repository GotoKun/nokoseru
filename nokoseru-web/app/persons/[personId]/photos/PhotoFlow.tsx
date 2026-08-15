"use client";

import { useEffect, useRef, useState } from "react";
import { PhotoCard, type PhotoItem } from "./PhotoCard";
import { Hit } from "@/app/components/km/Hit";

export function PhotoFlow({ personId }: { personId: string }) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadPhotos() {
    setLoading(true);
    try {
      const res = await fetch(`/api/persons/${personId}/photos`);
      const data = await res.json();
      setPhotos(data.photos ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadPhotos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleDeleted(photoId: string) {
    setPhotos((prev) => prev.filter((p) => p.id !== photoId));
  }

  async function handleFiles(files: FileList) {
    const list = Array.from(files);
    if (list.length === 0) return;
    setError(null);
    setUploadProgress({ done: 0, total: list.length });

    // 1件ずつ順番に処理する（カラー化は数十秒かかることがあるため、一気に並行実行しない）。
    for (let i = 0; i < list.length; i++) {
      try {
        const form = new FormData();
        form.append("photo", list[i]);
        const res = await fetch(`/api/persons/${personId}/photos`, { method: "POST", body: form });
        if (!res.ok) throw new Error("failed");
        const data = await res.json();
        setPhotos((prev) => [{ ...data.photo, lastComment: null }, ...prev]);
      } catch {
        setError(`「${list[i].name}」のアップロードに失敗しました。`);
      }
      setUploadProgress({ done: i + 1, total: list.length });
    }
    setUploadProgress(null);
  }

  return (
    <div className="mt-8">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <Hit locked={uploadProgress !== null} onActivate={() => fileRef.current?.click()} className="w-fit">
        <div className="km-btn km-btn-primary">写真を選ぶ（複数選択可）</div>
      </Hit>

      {uploadProgress && (
        <p className="mt-3 text-sm text-muted">
          カラー化しています… ({uploadProgress.done}/{uploadProgress.total})
        </p>
      )}
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      {!loading && photos.length === 0 && !uploadProgress && (
        <p className="mt-6 text-sm text-muted">まだ写真がアップロードされていません。</p>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {photos.map((p) => (
          <PhotoCard key={p.id} personId={personId} photo={p} onDeleted={handleDeleted} />
        ))}
      </div>
    </div>
  );
}
