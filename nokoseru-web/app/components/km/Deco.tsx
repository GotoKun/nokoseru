import type { CSSProperties } from "react";

// モックアップ.html の背景の泡飾り（.deco）の移植。
// [x, y, scale, opacity] はモックアップの390×844フレーム基準の座標で、
// %に変換してから使うことで可変の高さ・幅のコンテナにも追従させている。
// 押せるものではない（pointer-events:none）ので、アニメーションの0ms原則の対象外
// （UI仕様書5章の例外は起動スプラッシュと収録中の相槌の2つだけだが、この泡飾りは
// そもそも操作要素ではないため「押した/押していない」の判別に影響しない）。
export type DecoPose = [number, number, number, number][];

const DESIGN_W = 390;
const DESIGN_H = 844;

// モックアップのDECOテーブルそのまま。子側（一覧・まだ聞けていないこと・再生）は
// 元のモックアップにも登場しないため、ここにも用意していない。
export const DECO_POSES: Record<string, DecoPose> = {
  splash: [
    [52, 158, 0.78, 1],
    [288, 250, 1, 1],
    [92, 612, 1, 1],
    [230, 630, 1, 1],
  ],
  role: [
    [292, -52, 1, 1],
    [26, 690, 0.9, 1],
    [187, 772, 1, 1],
    [310, 724, 0.8, 1],
  ],
  question: [
    [300, -90, 0.8, 1],
    [-16, 130, 0.75, 1],
    [358, 470, 1, 1],
    [-26, 752, 0.9, 1],
  ],
  place: [
    [330, -104, 0.55, 1],
    [-28, 706, 0.6, 1],
    [366, 556, 0.8, 1],
    [-42, 110, 0.6, 1],
  ],
  recording: [
    [400, -160, 0.3, 0],
    [-60, 840, 0.4, 0],
    [368, 118, 0.6, 1],
    [-80, -80, 0.4, 0],
  ],
  heard: [
    [26, 84, 0.6, 1],
    [306, 656, 1, 1],
    [78, 700, 1, 1],
    [163, 390, 4.7, 1],
  ],
  confirm: [
    [312, -84, 0.7, 1],
    [-20, 140, 0.6, 1],
    [352, 424, 0.7, 1],
    [-30, 748, 0.7, 1],
  ],
  done: [
    [300, -70, 0.8, 1],
    [-18, 690, 0.7, 1],
    [356, 470, 0.9, 1],
    [-30, 120, 0.7, 1],
  ],
  hidden: [
    [440, -160, 0.2, 0],
    [-80, 900, 0.2, 0],
    [430, 900, 0.2, 0],
    [-90, -90, 0.2, 0],
  ],
};

function dotStyle([x, y, scale, opacity]: [number, number, number, number]): CSSProperties {
  return {
    left: `${(x / DESIGN_W) * 100}%`,
    top: `${(y / DESIGN_H) * 100}%`,
    transform: `scale(${scale})`,
    opacity,
  };
}

export function Deco({ pose }: { pose?: DecoPose }) {
  const p = pose ?? DECO_POSES.hidden;
  return (
    <div className="km-deco" aria-hidden="true">
      <i className="a" style={dotStyle(p[0])} />
      <i className="b" style={dotStyle(p[1])} />
      <i className="c" style={dotStyle(p[2])} />
      <i className="d" style={dotStyle(p[3])} />
    </div>
  );
}
