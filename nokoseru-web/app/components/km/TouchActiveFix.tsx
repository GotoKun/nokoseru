"use client";

import { useEffect } from "react";

// iOS Safariは、documentのどこかにtouchstartリスナーが無いと:active疑似クラスを
// 発火させない既知の挙動がある。「押した瞬間0msで反転する」がこのUIの核（UI仕様書5章）
// なので、ページ全体に一度だけno-opリスナーを張って有効化する。
export function TouchActiveFix() {
  useEffect(() => {
    const noop = () => {};
    document.addEventListener("touchstart", noop, { passive: true });
    return () => document.removeEventListener("touchstart", noop);
  }, []);
  return null;
}
