"use client";

import { useEffect, useRef, useState } from "react";

interface EpisodeResult {
  id: string;
  sessionId: string;
  title: string;
  startSec: number;
  endSec: number;
  tags: string[];
  era: string | null;
  people: string[];
  theme: string | null;
  occasionLabel: string;
  videoUrl: string | null;
  questionText: string;
}

export function SearchFlow({ personId }: { personId: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<EpisodeResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const endSecRef = useRef<number | null>(null);
  const currentSrcRef = useRef<string | null>(null);

  async function runSearch(q: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/persons/${personId}/episodes/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setResults(data.episodes ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const handle = setTimeout(() => {
      runSearch(query);
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    // 動画の切り出し・結合は行わない。該当区間の終端で一時停止するだけに留める（design方針）。
    const onTimeUpdate = () => {
      if (endSecRef.current !== null && video.currentTime >= endSecRef.current) {
        video.pause();
      }
    };
    video.addEventListener("timeupdate", onTimeUpdate);
    return () => video.removeEventListener("timeupdate", onTimeUpdate);
  }, []);

  function play(ep: EpisodeResult) {
    if (!ep.videoUrl || !videoRef.current) return;
    setActiveId(ep.id);
    endSecRef.current = ep.endSec;
    const video = videoRef.current;
    const seekAndPlay = () => {
      video.currentTime = ep.startSec;
      video.play();
    };
    if (currentSrcRef.current !== ep.videoUrl) {
      currentSrcRef.current = ep.videoUrl;
      video.src = ep.videoUrl;
      video.addEventListener("loadedmetadata", seekAndPlay, { once: true });
    } else {
      seekAndPlay();
    }
  }

  return (
    <div className="mt-8">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="キーワード・タグで探す（例: 結婚、仕事、料理）"
        className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 outline-none focus:border-accent"
      />

      <div className="mt-4 rounded-xl overflow-hidden bg-black">
        <video ref={videoRef} controls playsInline className="w-full aspect-video bg-black" />
      </div>

      {!loading && results.length === 0 && (
        <p className="mt-6 text-sm text-muted text-center py-8">記録がありません</p>
      )}

      <div className="mt-5 flex flex-col gap-2">
        {results.map((ep) => (
          <button
            key={ep.id}
            onClick={() => play(ep)}
            className={`text-left rounded-lg border px-4 py-3 ${
              activeId === ep.id ? "border-accent bg-accent-soft/40" : "border-border bg-surface hover:border-accent"
            }`}
          >
            <div className="text-sm font-medium">{ep.title}</div>
            <div className="mt-1 text-xs text-muted">
              {ep.occasionLabel}
              {ep.era ? ` ／ ${ep.era}` : ""}
            </div>
            {ep.tags.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {ep.tags.map((t) => (
                  <span key={t} className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] text-accent">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
