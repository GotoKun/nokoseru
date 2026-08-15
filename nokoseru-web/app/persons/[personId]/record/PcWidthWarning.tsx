"use client";

import { useEffect, useState } from "react";

// UI仕様書の絶対制約は「PCで開いたら収録に入らせない」だが、開発・デモでの検証を
// 妨げないよう、ここではブロックせず警告のみ表示する（運用判断）。
// design: カエルム_共有_20260814/UI仕様書.md 0章
export function PcWidthWarning() {
  const [isWide, setIsWide] = useState(false);

  useEffect(() => {
    const check = () => setIsWide(window.innerWidth >= 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  if (!isWide) return null;

  return (
    <div className="mb-6 rounded-xl bg-accent-soft px-4 py-3 text-xs leading-relaxed text-accent">
      本来はスマホを立てて置いて収録する画面です。手持ち撮影や広い画面での収録は、映像がぶれる原因になります。
      できるだけスマートフォンで開いてください。
    </div>
  );
}
