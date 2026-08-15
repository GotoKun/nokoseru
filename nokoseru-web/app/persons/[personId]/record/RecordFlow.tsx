"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { pickSupportedMimeType } from "./mediaUtils";
import { Hit } from "@/app/components/km/Hit";
import { Deco, DECO_POSES } from "@/app/components/km/Deco";

interface CandidateQuestion {
  text: string;
  occasionHint: string;
}

// 「話したいことがある」＝任意発言。テキスト入力欄は出さない（本人にタイプさせない）。
// questionTextはDBスキーマ上nullにできないため定数文字列を入れる。
// design: カエルム_共有_20260814/UI仕様書.md 9章
const OTHER_TOPIC: CandidateQuestion = { text: "（じぶんの話）", occasionHint: "daily" };

type Stage =
  | "question" // 画面01
  | "place" // 画面02
  | "recording" // 画面03
  | "heard" // 押したあと（画面が全部消える）
  | "confirm" // 画面04
  | "done" // 画面04-D
  | "error";

// 背景の泡飾り（画面ごとの定位置）。モックアップのDECOテーブルと対応。
const STAGE_DECO: Record<Stage, keyof typeof DECO_POSES> = {
  question: "question",
  place: "place",
  recording: "recording",
  heard: "heard",
  confirm: "confirm",
  done: "done",
  error: "hidden",
};

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
  const [stage, setStage] = useState<Stage>("question");
  const [stageLocked, setStageLocked] = useState(true);
  const [question, setQuestion] = useState<CandidateQuestion | null>(presetQuestion ?? null);
  const [selected, setSelected] = useState<CandidateQuestion | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [hasVideo, setHasVideo] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [kept, setKept] = useState(true);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const placePreviewRef = useRef<HTMLVideoElement | null>(null);
  const retryRef = useRef<() => void>(() => {});

  function attachPlacePreview(el: HTMLVideoElement | null) {
    placePreviewRef.current = el;
    if (el && streamRef.current) el.srcObject = streamRef.current;
  }

  // 画面遷移は必ずこの関数を通す：遷移と同時にロックし、800ms後に解除する
  // （連打防止。無効色にはしない。UI仕様書5章）。
  function go(next: Stage) {
    setStageLocked(true);
    setStage(next);
  }

  useEffect(() => {
    const t = setTimeout(() => setStageLocked(false), 800);
    return () => clearTimeout(t);
  }, [stage]);

  useEffect(() => {
    if (!presetQuestion) loadQuestion();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 画面02に入った瞬間にカメラ許可ダイアログを一度だけ出す（録画開始はまだしない）。
  useEffect(() => {
    if (stage !== "place") return;
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        setHasVideo(true);
        streamRef.current = stream;
        if (placePreviewRef.current) placePreviewRef.current.srcObject = stream;
      } catch {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          if (cancelled) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          setHasVideo(false);
          streamRef.current = stream;
        } catch {
          if (!cancelled) {
            setErrorMessage("マイク（またはカメラ）にアクセスできませんでした。ブラウザの権限設定をご確認ください。");
            retryRef.current = () => go("place");
            go("error");
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stage]);

  // fresh=trueは「他に話したいことがある」＝今の質問を更新する操作用。
  // キャッシュを使わず必ず新しい質問をLLMに作らせる（同じ質問が返ってこないように）。
  async function loadQuestion(fresh = false) {
    setQuestion(null);
    try {
      const res = await fetch(
        `/api/persons/${personId}/next-question/single${fresh ? "?fresh=1" : ""}`
      );
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      setQuestion(data.question);
    } catch {
      setErrorMessage("質問の取得に失敗しました。時間をおいて再度お試しください。");
      retryRef.current = () => loadQuestion(fresh);
      go("error");
    }
  }

  function goPlace(q: CandidateQuestion) {
    setSelected(q);
    go("place");
  }

  function cancelToPerson() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (sessionId) {
      // 収録に至らなかった空セッションは残さない（fire-and-forget）。
      fetch(`/api/sessions/${sessionId}`, { method: "DELETE" }).catch(() => {});
    }
    router.push(`/persons/${personId}`);
  }

  async function startRecording() {
    if (!selected || !streamRef.current) return;
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personId,
          questionText: selected.text,
          occasionHint: selected.occasionHint || null,
          sourcePhotoId: sourcePhotoId ?? null,
        }),
      });
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      setSessionId(data.session.id);

      const mimeType = pickSupportedMimeType(hasVideo);
      const recorder = mimeType
        ? new MediaRecorder(streamRef.current, { mimeType })
        : new MediaRecorder(streamRef.current);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.start(1000);
      recorderRef.current = recorder;
      go("recording");
    } catch {
      setErrorMessage("収録の準備に失敗しました。もう一度お試しください。");
      retryRef.current = () => go("place");
      go("error");
    }
  }

  // 冪等化：2回目以降のstop()呼び出しでInvalidStateErrorを投げない
  // （UI仕様書9章の既知バグ対応）。
  async function stopRecorder(): Promise<void> {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });
    recorder.stop();
    await stopped;
  }

  async function finishRecording() {
    // 案B：押した瞬間、画面上のすべてを消す。押す対象が無くなるので連打が起きない。
    go("heard");
    await stopRecorder();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    const recorder = recorderRef.current;
    const blob = new Blob(chunksRef.current, { type: recorder?.mimeType || "video/webm" });
    try {
      const form = new FormData();
      form.append("media", blob, `session.${blob.type.includes("mp4") ? "mp4" : "webm"}`);
      const uploadRes = await fetch(`/api/sessions/${sessionId}/upload`, { method: "POST", body: form });
      if (!uploadRes.ok) throw new Error("upload failed");

      const finalizeRes = await fetch(`/api/sessions/${sessionId}/finalize`, { method: "POST" });
      if (!finalizeRes.ok) throw new Error("finalize failed");
      await finalizeRes.json();
      go("confirm");
    } catch {
      setErrorMessage("収録データの処理に失敗しました。ネットワーク状況をご確認のうえ、もう一度お試しください。");
      retryRef.current = () => router.push(`/persons/${personId}`);
      go("error");
    }
  }

  async function decide(keepIt: boolean) {
    setKept(keepIt);
    if (!keepIt && sessionId) {
      try {
        await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
      } catch {
        // 削除に失敗しても「残さない」の体験は優先し、そのまま進める
      }
    }
    go("done");
  }

  function recordAnother() {
    setSelected(null);
    setSessionId(null);
    go("question");
    loadQuestion();
  }

  const topic = selected?.text ?? question?.text ?? "";

  return (
    <div className="km-phone km-deco-host mt-8">
      <Deco pose={DECO_POSES[STAGE_DECO[stage]]} />

      {stage === "question" && !question && (
        <div className="relative flex min-h-[50vh] flex-col items-center justify-center px-1">
          <div className="km-t-sub">きょうの質問を よういしています…</div>
        </div>
      )}

      {stage === "question" && question && (
        <div className="relative flex flex-col gap-6 px-1 py-4">
          <div className="km-t-note">
            カエルムが、聞き役です。
            <br />
            人ではありません。
          </div>
          <div className="km-t-hero">{question.text}</div>
          <div className="grow" />
          <div className="flex flex-col">
            <Hit locked={stageLocked} onActivate={() => goPlace(question)}>
              <div className="km-btn km-btn-primary">はなす</div>
            </Hit>
            <div className="h-5" />
            <Hit locked={stageLocked} onActivate={() => loadQuestion(true)}>
              <div className="km-btn km-btn-ghost">他に話したいことがある</div>
            </Hit>
            <div className="h-3" />
            <Hit locked={stageLocked} onActivate={() => goPlace(OTHER_TOPIC)}>
              <div className="km-btn km-btn-ghost">自由に、はなす</div>
            </Hit>
            <div className="h-3" />
            <Hit locked={stageLocked} onActivate={() => router.push(`/persons/${personId}`)}>
              <div className="km-btn km-btn-ghost sm">おわりにする</div>
            </Hit>
          </div>
        </div>
      )}

      {stage === "place" && (
        <div className="relative flex flex-col gap-4 px-1 py-4">
          <div className="km-t-far">スマホを、立てて置いてください</div>
          <div className="km-t-sub">手で持つと、ゆれます</div>
          <div className="km-cam">
            {hasVideo && <video ref={attachPlacePreview} autoPlay muted playsInline />}
            <div className="km-cnote">顔を、この中に</div>
          </div>
          <div className="mt-2 flex flex-col gap-6">
            <Hit locked={stageLocked} onActivate={startRecording}>
              <div className="km-btn km-btn-primary">置きました</div>
            </Hit>
            <Hit locked={stageLocked} onActivate={cancelToPerson}>
              <div className="km-btn km-btn-ghost">おわりにする</div>
            </Hit>
          </div>
        </div>
      )}

      {stage === "recording" && (
        <div className="relative flex flex-col gap-9 px-1 py-4">
          <div className="km-t-status km-nod">聞いています</div>
          <div className="km-t-topic" style={{ minHeight: "3.6em" }}>
            {topic}
          </div>
          <div className="grow" />
          <div className="flex flex-col gap-8">
            <div className="km-t-note text-center">うつっています</div>
            <Hit locked={stageLocked} onActivate={finishRecording}>
              <div className="km-btn km-btn-primary big">はなしおわった</div>
            </Hit>
            <Hit locked={stageLocked} onActivate={cancelToPerson}>
              <div className="km-btn km-btn-ghost sm">おわりにする</div>
            </Hit>
          </div>
        </div>
      )}

      {stage === "heard" && (
        <div className="relative flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center">
          <div className="text-[40px] font-bold leading-tight">聞きました</div>
          <div className="km-t-sub">
            しばらく
            <br />
            お待ちください
          </div>
        </div>
      )}

      {stage === "confirm" && (
        <div className="relative flex flex-col gap-4 px-1 py-4">
          <div className="km-t-note">いま話したこと</div>
          <div className="km-t-topic b">{topic}</div>
          <div className="km-t-far mt-6">今のは、残しますか</div>
          <div className="km-t-sub">残さないときは、保存しません。</div>
          <div className="grow" />
          <div className="flex gap-5">
            <Hit className="flex-1" locked={stageLocked} onActivate={() => decide(true)}>
              <div className="km-btn km-btn-equal">残す</div>
            </Hit>
            <Hit className="flex-1" locked={stageLocked} onActivate={() => decide(false)}>
              <div className="km-btn km-btn-equal">残さない</div>
            </Hit>
          </div>
        </div>
      )}

      {stage === "done" && (
        <div className="relative flex min-h-[60vh] flex-col gap-4 px-1 py-4">
          <div className="grow" style={{ flexGrow: 0.6 }} />
          <div className="km-t-far">{kept ? "のこしました" : "のこしませんでした"}</div>
          <div className="km-t-sub">きょうは、これでおしまいです</div>
          <div className="grow" />
          <Hit locked={stageLocked} onActivate={recordAnother}>
            <div className="km-btn km-btn-primary">つづけて 話す</div>
          </Hit>
          <div className="h-3" />
          <Hit locked={stageLocked} onActivate={() => router.push(`/persons/${personId}`)}>
            <div className="km-btn km-btn-ghost">おわりにする</div>
          </Hit>
        </div>
      )}

      {stage === "error" && (
        <div className="relative flex flex-col gap-4 px-1 py-4">
          <p className="text-sm text-red-700">{errorMessage}</p>
          <Hit
            locked={false}
            onActivate={() => {
              setErrorMessage(null);
              retryRef.current();
            }}
          >
            <div className="km-btn km-btn-ghost">もう一度試す</div>
          </Hit>
        </div>
      )}

      <p className="relative mt-10 text-center text-xs text-muted">
        {personName}さんの回答を録画・録音し、あとから振り返れる形で保存します。
      </p>
    </div>
  );
}
