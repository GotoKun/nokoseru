"use client";

import { usePathname } from "next/navigation";
import { Deco, DECO_POSES, type DecoPose } from "./Deco";

// モックアップ.html では画面遷移のたびに同じ.deco要素のtransform/opacityが書き換わり、
// 700msかけて次の位置へ滑る。実装ではURLが変わる＝コンポーネントが再マウントされるため、
// 同じ仕組みをページをまたいで再現するには、この要素をレイアウト直下に置いて
// ナビゲーションをまたいで生き続けさせ、現在のpathnameだけをpose切り替えの入力にする。
//
// 収録フロー（/persons/[id]/record）だけは画面内の細かいステージ遷移（質問→置く→収録中…）を
// RecordFlow自身のDecoで表現しているため、ここではhidden（オフスクリーン）にして二重表示を避ける。
function getPoseForPath(pathname: string): DecoPose {
  if (pathname === "/") return DECO_POSES.splash;
  if (pathname === "/login") return DECO_POSES.question;
  if (pathname === "/home") return DECO_POSES.role;
  // /persons/new は "/persons/[id]" と同じ形をしているため先に判定する。
  // フォームが主役の画面なので泡飾りは出さない。
  if (pathname === "/persons/new") return DECO_POSES.hidden;
  if (/^\/persons\/[^/]+$/.test(pathname)) return DECO_POSES.role;
  return DECO_POSES.hidden;
}

export function RouteDeco() {
  const pathname = usePathname();
  const pose = getPoseForPath(pathname ?? "");
  return (
    <div className="pointer-events-none fixed inset-0" aria-hidden="true">
      <Deco pose={pose} />
    </div>
  );
}
