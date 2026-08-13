"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function ExportFlow({ personId }: { personId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "building" | "done" | "error">("idle");
  const [url, setUrl] = useState<string | null>(null);
  const downloadRef = useRef<HTMLAnchorElement | null>(null);

  useEffect(() => {
    // 準備ができたら自動でダウンロードを開始する（ボタンは押し直したいときのために残す）。
    if (status === "done" && url) {
      downloadRef.current?.click();
    }
  }, [status, url]);

  async function runExport() {
    setStatus("building");
    setUrl(null);
    try {
      const res = await fetch(`/api/persons/${personId}/export`, { method: "POST" });
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      setUrl(data.url);
      setStatus("done");
      router.refresh();
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="mt-8 rounded-xl border border-border bg-surface px-5 py-5">
      <button
        onClick={runExport}
        disabled={status === "building"}
        className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {status === "building" ? "書き出しています…" : "エクスポートを作成する"}
      </button>

      {status === "done" && url && (
        <div className="mt-5 rounded-xl border-2 border-accent bg-accent-soft/50 px-5 py-5 text-center">
          <p className="text-sm">準備ができました。ダウンロードが始まらない場合は下のボタンを押してください。</p>
          <a
            ref={downloadRef}
            href={url}
            download="nokoseru-export.zip"
            className="mt-3 inline-block rounded-full bg-accent px-8 py-3.5 text-base font-bold text-white shadow-md hover:opacity-90"
          >
            ダウンロードする
          </a>
        </div>
      )}
      {status === "error" && (
        <p className="mt-3 text-sm text-red-700">書き出しに失敗しました。もう一度お試しください。</p>
      )}
    </div>
  );
}
