"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Hit } from "@/app/components/km/Hit";

// モック用ログイン画面。モックアップ.htmlには存在しない画面だが、配色・タイポグラフィ・
// ボタン/入力欄の見た目・背景の泡飾りは他画面と同じカエルムのデザイン言語を使う。
// 背景の泡飾りはレイアウト直下のRouteDecoが担う（pathname="/login"でquestion配置になる）。
// 実際の認証はしない：何か文字を入力して送信すると/home（画面00 役割選択）へ進む。
export default function LoginPage() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [showHint, setShowHint] = useState(false);

  function submit() {
    if (!value.trim()) {
      setShowHint(true);
      return;
    }
    router.push("/home");
  }

  return (
    <div className="relative min-h-screen">
      <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-16">
        <div className="km-t-note">カエルム</div>
        <div className="km-t-hero mt-3">おかえりなさい</div>
        <div className="km-t-sub mt-2">なにか入力すると、はじめられます</div>

        <div className="mt-8 flex flex-col gap-2">
          <input
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setShowHint(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            placeholder="お名前またはメールアドレス"
            aria-label="お名前またはメールアドレス"
            className="km-input"
          />
          {showHint && (
            <p className="text-xs text-red-700">
              なにか入力してください（デモ用のため、内容は問いません）
            </p>
          )}
        </div>

        <div className="mt-6">
          <Hit locked={false} onActivate={submit}>
            <div className="km-btn km-btn-primary">はじめる</div>
          </Hit>
        </div>
      </div>
    </div>
  );
}
