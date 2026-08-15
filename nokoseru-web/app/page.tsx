"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// 画面0-S「ひらいた瞬間」。モックアップ.html の .splashword をそのまま移植。
// サービス名だけを見せて（フワッと上がる、約1.8秒）、どこを触っても即スキップできる。
// design: カエルム_共有_20260814/UI仕様書.md 4章
export default function SplashPage() {
  const router = useRouter();
  const wentRef = useRef(false);

  function go() {
    if (wentRef.current) return;
    wentRef.current = true;
    router.push("/login");
  }

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      go();
      return;
    }
    const t = setTimeout(go, 1760);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 背景の泡飾りはレイアウト直下のRouteDecoが担う（pathname="/"でsplash配置になる）。
  // ここは透明なままにして、その飾りが透けて見えるようにする。
  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ touchAction: "manipulation" }}
      role="button"
      tabIndex={0}
      aria-label="はじめる"
      onPointerUp={go}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          go();
        }
      }}
    >
      <div className="km-splashword relative">カエルム</div>
    </div>
  );
}
