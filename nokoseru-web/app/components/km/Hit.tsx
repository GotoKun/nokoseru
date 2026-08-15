"use client";

import type { KeyboardEvent, PointerEvent, ReactNode } from "react";

// カエルムUIの「押せるもの」の共通ラッパー。
// - 発火は pointerup（iOSのclickは約300ms遅延することがあるため）。
// - 見た目の反転は .km-hit:active の素のCSSに任せる（0ms・JS不要）。
// - locked中はpointer-events:noneにする（disabledは使わない。無効色になって
//   「壊れた」に見えるのを避けるため。UI仕様書5章）。
export function Hit({
  onActivate,
  className = "",
  locked = false,
  children,
  ariaLabel,
  round24,
}: {
  onActivate: () => void;
  className?: string;
  locked?: boolean;
  children: ReactNode;
  ariaLabel?: string;
  round24?: boolean;
}) {
  function handlePointerUp(e: PointerEvent<HTMLDivElement>) {
    if (locked) return;
    e.preventDefault();
    onActivate();
  }
  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (locked) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onActivate();
    }
  }
  return (
    <div
      className={`km-hit${round24 ? " r24" : ""} ${className}`}
      role="button"
      tabIndex={locked ? -1 : 0}
      aria-label={ariaLabel}
      aria-disabled={locked}
      style={locked ? { pointerEvents: "none" } : undefined}
      onPointerUp={handlePointerUp}
      onKeyDown={handleKeyDown}
    >
      {children}
    </div>
  );
}
