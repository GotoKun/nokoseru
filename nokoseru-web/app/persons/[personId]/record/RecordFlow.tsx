"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { pickSupportedMimeType, formatElapsed } from "./mediaUtils";

interface CandidateQuestion {
  text: string;
  occasionHint: string;
}

interface ResultEpisode {
  id: string;
  title: string;
  tags: string[];
  excluded: boolean;
}

type Stage =
  | "loading"
  | "choose"
  | "preparing"
  | "recording"
  | "uploading"
  | "processing"
  | "done"
  | "error";

export function RecordFlow({
  personId,
  personName,
  presetQuestion,
  sourcePhotoId,
}: {
  personId: string;
  personName: string;
  presetQuestion?: CandidateQuestion;
  sourcePhotoId?: string;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("loading");
  const [questions, setQuestions] = useState<CandidateQuestion[]>([]);
  const [selected, setSelected] = useState<CandidateQuestion | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [hasVideo, setHasVideo] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resultEpisodes, setResultEpisodes] = useState<ResultEpisode[]>([]);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customText, setCustomText] = useState("");

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);

  // stage遷移とvideoタグのマウントのタイミングがズレるため（"preparing"時点ではまだ<video>が
  // DOMに存在しない）、srcObjectはコールバックrefでマウント時に直接紐付ける。
  function attachVideoPreview(el: HTMLVideoElement | null) {
    videoPreviewRef.current = el;
    if (el && streamRef.current) {
      el.srcObject = streamRef.current;
    }
  }

  useEffect(() => {
    if (presetQuestion) {
      chooseQuestion(presetQuestion);
    } else {
      loadQuestions();
    }
    return () => {
      stopTimer();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadQuestions() {
    setStage("loading");
    setErrorMessage(null);
    setShowCustomInput(false);
    setCustomText("");
    try {
      const res = await fetch(`/api/persons/${personId}/next-question`);
      if (!res.ok) throw new Error("質問の取得に失敗しました");
      const data = await res.json();
      setQuestions(data.questions ?? []);
      setStage("choose");
    } catch {
      setErrorMessage("質問候補の取得に失敗しました。時間をおいて再度お試しください。");
      setStage("error");
    }
  }

  function startCustomRecording() {
    const text = customText.trim() || "自分で話したいことを話す";
    chooseQuestion({ text, occasionHint: "daily" });
  }

  async function chooseQuestion(q: CandidateQuestion) {
    setSelected(q);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personId,
          questionText: q.text,
          occasionHint: q.occasionHint || null,
          sourcePhotoId: sourcePhotoId ?? null,
        }),
      });
      if (!res.ok) throw new Error("セッションの作成に失敗しました");
      const data = await res.json();
      setSessionId(data.session.id);
      await startRecording();
    } catch {
      setErrorMessage("収録の準備に失敗しました。もう一度お試しください。");
      setStage("error");
    }
  }

  async function startRecording() {
    setStage("preparing");
    let stream: MediaStream;
    let withVideo = true;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    } catch {
      try {
        withVideo = false;
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        setErrorMessage("マイク（またはカメラ）にアクセスできませんでした。ブラウザの権限設定をご確認ください。");
        setStage("error");
        return;
      }
    }
    setHasVideo(withVideo);
    streamRef.current = stream;

    const mimeType = pickSupportedMimeType(withVideo);
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.start(1000);
    recorderRef.current = recorder;

    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    setStage("recording");
  }

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  async function stopRecording() {
    const recorder = recorderRef.current;
    if (!recorder) return;
    stopTimer();

    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });
    recorder.stop();
    await stopped;
    streamRef.current?.getTracks().forEach((t) => t.stop());

    setStage("uploading");
    const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "video/webm" });
    try {
      const form = new FormData();
      form.append("media", blob, `session.${blob.type.includes("mp4") ? "mp4" : "webm"}`);
      const uploadRes = await fetch(`/api/sessions/${sessionId}/upload`, { method: "POST", body: form });
      if (!uploadRes.ok) throw new Error("アップロードに失敗しました");

      setStage("processing");
      const finalizeRes = await fetch(`/api/sessions/${sessionId}/finalize`, { method: "POST" });
      if (!finalizeRes.ok) throw new Error("内容の整理に失敗しました");
      const data = await finalizeRes.json();
      const episodes: ResultEpisode[] = (data.session.episodes ?? []).map(
        (e: { id: string; title: string; tags: string[]; excluded: boolean }) => ({
          id: e.id,
          title: e.title,
          tags: e.tags,
          excluded: e.excluded,
        })
      );
      setResultEpisodes(episodes);
      setStage("done");
    } catch {
      setErrorMessage("収録データの処理に失敗しました。ネットワーク状況をご確認のうえ、もう一度お試しください。");
      setStage("error");
    }
  }

  async function toggleExclude(episodeId: string, excluded: boolean) {
    setResultEpisodes((prev) => prev.map((e) => (e.id === episodeId ? { ...e, excluded } : e)));
    await fetch(`/api/episodes/${episodeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ excluded }),
    });
  }

  function recordAnother() {
    setSelected(null);
    setSessionId(null);
    setResultEpisodes([]);
    loadQuestions();
  }

  return (
    <div className="mt-8">
      <div className="rounded-xl border border-accent-soft bg-accent-soft/40 px-4 py-3 text-xs text-accent">
        これはAIによるインタビューです。{personName}さんの回答を録画・録音し、あとから振り返れる形で保存します。
      </div>

      {stage === "loading" && <p className="mt-8 text-sm text-muted">質問を準備しています…</p>}

      {stage === "choose" && (
        <div className="mt-8">
          <h2 className="text-sm font-medium">今日はどれか話してみませんか</h2>
          <div className="mt-4 flex flex-col gap-3">
            {questions.map((q, i) => (
              <button
                key={i}
                onClick={() => chooseQuestion(q)}
                className="text-left rounded-xl border border-border bg-surface px-5 py-4 hover:border-accent"
              >
                {q.text}
              </button>
            ))}

            {!showCustomInput ? (
              <button
                onClick={() => setShowCustomInput(true)}
                className="text-left rounded-xl border border-dashed border-border px-5 py-4 text-muted hover:border-accent hover:text-accent"
              >
                この中にないことを、自分で考えて話す
              </button>
            ) : (
              <div className="rounded-xl border border-dashed border-accent px-5 py-4">
                <label className="text-sm font-medium" htmlFor="custom-topic">
                  何について話しますか（空欄のまま始めても構いません）
                </label>
                <input
                  id="custom-topic"
                  value={customText}
                  onChange={(e) => setCustomText(e.target.value)}
                  placeholder="例：子どもの頃に住んでいた家のこと"
                  className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                />
                <button
                  onClick={startCustomRecording}
                  className="mt-3 rounded-full bg-accent px-5 py-2 text-sm font-medium text-white hover:opacity-90"
                >
                  この内容で始める
                </button>
              </div>
            )}
          </div>
          <button
            onClick={() => router.push(`/persons/${personId}`)}
            className="mt-5 text-sm text-muted hover:text-accent"
          >
            今日は実施しない
          </button>
        </div>
      )}

      {stage === "preparing" && (
        <p className="mt-8 text-sm text-muted">カメラ・マイクを準備しています…</p>
      )}

      {(stage === "recording" || stage === "uploading" || stage === "processing") && selected && (
        <div className="mt-8">
          <p className="text-sm text-muted">質問</p>
          <p className="mt-1 text-lg font-medium">{selected.text}</p>

          {hasVideo && (
            <video
              ref={attachVideoPreview}
              autoPlay
              muted
              playsInline
              className="mt-4 w-full rounded-xl bg-black aspect-video"
            />
          )}

          {stage === "recording" && (
            <div className="mt-5 flex items-center gap-4">
              <button
                onClick={stopRecording}
                className="flex items-center gap-2 rounded-full bg-red-700 px-6 py-3 text-sm font-medium text-white hover:opacity-90"
              >
                <span className="h-2.5 w-2.5 rounded-full bg-white" />
                話し終える（{formatElapsed(elapsed)}）
              </button>
              <span className="text-xs text-muted">押しながら話す必要はありません。話し終えたら押してください。</span>
            </div>
          )}
          {stage === "uploading" && <p className="mt-5 text-sm text-muted">保存しています…</p>}
          {stage === "processing" && <p className="mt-5 text-sm text-muted">内容を整理しています…</p>}
        </div>
      )}

      {stage === "done" && (
        <div className="mt-8">
          <p className="text-sm font-medium">収録が保存されました。</p>
          <p className="mt-1 text-xs text-muted leading-relaxed">
            公開したくない内容があれば、下のエピソードから除外できます。除外した内容は検索・配信の対象から外れます。
          </p>
          <div className="mt-4 flex flex-col gap-2">
            {resultEpisodes.map((e) => (
              <label
                key={e.id}
                className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 text-sm"
              >
                <span>
                  {e.title}
                  {e.tags.length > 0 && (
                    <span className="ml-2 text-xs text-muted">{e.tags.join(" / ")}</span>
                  )}
                </span>
                <span className="flex items-center gap-1.5 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={e.excluded}
                    onChange={(ev) => toggleExclude(e.id, ev.target.checked)}
                  />
                  除外する
                </span>
              </label>
            ))}
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              onClick={recordAnother}
              className="flex-1 rounded-full bg-accent px-5 py-3 text-sm font-medium text-white hover:opacity-90"
            >
              続けて収録する
            </button>
            <button
              onClick={() => router.push(`/persons/${personId}`)}
              className="flex-1 rounded-full border border-border px-5 py-3 text-sm font-medium hover:border-accent"
            >
              今日はここまでにする
            </button>
          </div>
        </div>
      )}

      {stage === "error" && (
        <div className="mt-8">
          <p className="text-sm text-red-700">{errorMessage}</p>
          <button
            onClick={loadQuestions}
            className="mt-4 rounded-full border border-border px-5 py-2.5 text-sm hover:border-accent"
          >
            もう一度試す
          </button>
        </div>
      )}
    </div>
  );
}
