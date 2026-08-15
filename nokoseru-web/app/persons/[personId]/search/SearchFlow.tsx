"use client";

import { useEffect, useRef, useState } from "react";
import { Hit } from "@/app/components/km/Hit";

interface EpisodeResult {
  id: string;
  sessionId: string;
  title: string;
  startSec: number;
  endSec: number;
  tags: string[];
  era: string | null;
  occasionLabel: string;
  videoUrl: string | null;
  questionText: string;
  recordedAt: string | null;
  subtitles: { startSec: number; endSec: number; text: string }[];
}

interface SessionCard {
  sessionId: string;
  episodeId: string | null;
  title: string | null;
  recordedAt: string | null;
  unlockAt: string | null;
  locked: boolean;
  lockLabel: string | null;
}

interface OccasionRow {
  label: string;
  status: string; // covered | thin | empty
  headings: string[];
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" });
}

export function SearchFlow({
  personId,
  personName,
  occasionRows,
}: {
  personId: string;
  personName: string;
  occasionRows: OccasionRow[];
}) {
  const [view, setView] = useState<"grid" | "missing" | "player">("grid");
  const [cards, setCards] = useState<SessionCard[]>([]);
  const [allEpisodes, setAllEpisodes] = useState<EpisodeResult[]>([]);
  const [query, setQuery] = useState("");
  const [searchedFor, setSearchedFor] = useState<string | null>(null);
  const [results, setResults] = useState<EpisodeResult[] | null>(null);
  const [active, setActive] = useState<EpisodeResult | null>(null);
  const [subsOn, setSubsOn] = useState(true);
  const [caption, setCaption] = useState("");

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const currentSrcRef = useRef<string | null>(null);

  useEffect(() => {
    (async () => {
      const [cardsRes, episodesRes] = await Promise.all([
        fetch(`/api/persons/${personId}/session-cards`),
        fetch(`/api/persons/${personId}/episodes/search?q=`),
      ]);
      if (cardsRes.ok) setCards((await cardsRes.json()).cards ?? []);
      if (episodesRes.ok) setAllEpisodes((await episodesRes.json()).episodes ?? []);
    })();
  }, [personId]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !active) return;
    const onTimeUpdate = () => {
      if (video.currentTime >= active.endSec) video.pause();
      const hit = active.subtitles.find((s) => video.currentTime >= s.startSec && video.currentTime < s.endSec);
      setCaption(hit?.text ?? "");
    };
    video.addEventListener("timeupdate", onTimeUpdate);
    return () => video.removeEventListener("timeupdate", onTimeUpdate);
  }, [active]);

  function play(ep: EpisodeResult, fromStart = false) {
    setActive(ep);
    setView("player");
    setCaption("");
    const video = videoRef.current;
    if (!ep.videoUrl || !video) return;
    const startAt = fromStart ? ep.startSec : ep.startSec;
    const seekAndPlay = () => {
      video.currentTime = startAt;
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

  function openCard(card: SessionCard) {
    if (card.locked || !card.episodeId) return;
    const ep = allEpisodes.find((e) => e.id === card.episodeId);
    if (ep) play(ep);
  }

  async function runSearch() {
    const q = query.trim();
    setSearchedFor(q);
    const res = await fetch(`/api/persons/${personId}/episodes/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    const found: EpisodeResult[] = data.episodes ?? [];
    setResults(found);
    setView("player");
    if (found.length > 0) {
      play(found[0]);
    } else {
      setActive(null);
      setCaption("");
      videoRef.current?.pause();
      if (videoRef.current) videoRef.current.removeAttribute("src");
      currentSrcRef.current = null;
    }
  }

  const nearMiss = results && results.length === 0 ? allEpisodes[0] ?? null : null;

  return (
    <div className="km-phone mt-8">
      {view === "grid" && (
        <div className="flex flex-col gap-1">
          <div className="text-[13px] font-black tracking-widest text-accent">カエルム</div>
          <div className="mt-1 text-xl font-bold">{personName}の話</div>

          {cards.length === 0 ? (
            <p className="mt-8 py-8 text-center text-sm text-muted">まだ記録がありません</p>
          ) : (
            <div className="km-kgrid mt-5">
              {cards.map((c) =>
                c.locked ? (
                  <div key={c.sessionId} className="km-seal">
                    <div className="km-wax" />
                    <div className="km-on">{c.lockLabel}</div>
                    <div className="km-bar" />
                    <div className="km-txt">まだ 開けられません</div>
                  </div>
                ) : (
                  <div
                    key={c.sessionId}
                    className="km-kcard"
                    role="button"
                    tabIndex={0}
                    onClick={() => openCard(c)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") openCard(c);
                    }}
                  >
                    <div className="km-kthumb">
                      <div className="h" />
                      <div className="b" />
                    </div>
                    <div className="km-kbody">
                      <div className="km-kt">{c.title}</div>
                      <div className="km-km">{formatDate(c.recordedAt)}</div>
                    </div>
                  </div>
                )
              )}
            </div>
          )}

          <div className="mt-6 rounded-2xl bg-white px-4 py-4 text-xs leading-relaxed text-muted shadow-[inset_0_0_0_1px_var(--border)]">
            鍵のかかったものは、その日が来ると自分で開きます。こちらから催促はできません。
          </div>

          <Hit className="mt-4" locked={false} onActivate={() => setView("player")}>
            <div className="km-btn km-btn-ghost">キーワードでさがす</div>
          </Hit>
          <Hit className="mt-3" locked={false} onActivate={() => setView("missing")}>
            <div className="km-btn km-btn-ghost sm">まだ聞けていないこと</div>
          </Hit>
        </div>
      )}

      {view === "missing" && (
        <div className="flex flex-col gap-1">
          <div className="km-brand">カエルム</div>
          <div className="mt-1 text-xl font-bold">まだ聞けていないこと</div>

          <div className="mt-5">
            {occasionRows.map((o, i) => (
              <div key={i} className="km-orow">
                <div className="km-otop">
                  <div className="km-oname">{o.label}</div>
                  {o.status === "empty" ? (
                    <div className="km-otag none">まだ</div>
                  ) : (
                    <div className="km-otag">{o.status === "covered" ? "あり" : "すこし"}</div>
                  )}
                </div>
                {o.status === "empty" ? (
                  <div className="km-oitem">
                    <span>&nbsp;</span>
                    <span>まだ、聞けていません。</span>
                  </div>
                ) : (
                  o.headings.map((h, j) => (
                    <div key={j} className="km-oitem">
                      <span>–</span>
                      <span>{h}</span>
                    </div>
                  ))
                )}
              </div>
            ))}
          </div>

          <p className="mt-6 text-xs leading-relaxed text-muted">
            ここで「まだ」の節目は、{personName}さんの画面に質問の候補として出ます。こちらから送るものではありません。
          </p>

          <button
            onClick={() => setView("grid")}
            className="mt-6 w-fit text-xs text-muted hover:text-accent"
          >
            ← 一覧に戻る
          </button>
        </div>
      )}

      {view === "player" && (
        <div className="flex flex-col gap-4">
          <button onClick={() => setView("grid")} className="w-fit text-xs text-muted hover:text-accent">
            ← 一覧に戻る
          </button>

          <div className="km-player" style={{ opacity: active ? 1 : 0.35 }}>
            {!active && (
              <>
                <div className="h" />
                <div className="b" />
              </>
            )}
            <video ref={videoRef} playsInline />
            {subsOn && caption && <div className="km-cc">{caption}</div>}
          </div>

          {active ? (
            <div>
              <div className="text-[17px] font-bold leading-snug">{active.questionText}</div>
              <div className="mt-2 text-xs leading-relaxed text-muted">
                {formatDate(active.recordedAt)}に話しました
                <br />
                この場面から、そのまま流れています
              </div>
              <div className="mt-3 flex gap-2.5">
                <div className="km-pill" onClick={() => setSubsOn((v) => !v)} role="button" tabIndex={0}>
                  {subsOn ? "字幕 ON" : "字幕 OFF"}
                </div>
                <div className="km-pill q" onClick={() => play(active, true)} role="button" tabIndex={0}>
                  はじめから見る
                </div>
              </div>
            </div>
          ) : (
            searchedFor && (
              <div>
                <div className="flex gap-3 text-xs text-muted">
                  <span>さがしたこと</span>
                  <span className="font-bold text-foreground">{searchedFor || "（すべて）"}</span>
                </div>
                <div className="mt-3 text-xl font-bold">それは、聞いていません。</div>
                <div className="mt-2 text-sm leading-relaxed text-muted">
                  この録画のなかに、その話はありませんでした。似た場面をつないでお見せすることはしません。
                </div>
                {nearMiss && (
                  <>
                    <div className="mt-5 h-px bg-border" />
                    <div className="mt-4 text-xs text-muted">ちかい話</div>
                    <div
                      className="km-near mt-2 cursor-pointer"
                      role="button"
                      tabIndex={0}
                      onClick={() => play(nearMiss)}
                    >
                      <div className="km-th" />
                      <div className="km-kt">{nearMiss.title}</div>
                    </div>
                    <div className="mt-2 text-xs leading-relaxed text-muted">
                      これは、たずねた話とはちがいます。
                    </div>
                  </>
                )}
              </div>
            )
          )}

          <div className="km-askbar mt-2 flex gap-2.5">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
              placeholder="子どもが生まれた日のこと"
              aria-label="聞きたいこと"
            />
            <div className="km-send" onClick={runSearch} role="button" tabIndex={0}>
              さがす
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
