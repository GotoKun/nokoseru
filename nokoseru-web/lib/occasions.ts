// 節目（occasion）の固定定義。
// 質問の裏層（想定配信先）とカバレッジマップの区分の両方に使う。
// design: nokoseru_design.md 5章 / nokoseru_planning.md 6.2

export type OccasionId =
  | "child_marriage"
  | "grandchild_birth"
  | "child_career"
  | "child_hardship"
  | "daily";

export interface OccasionDef {
  id: OccasionId;
  label: string;
  description: string;
}

export const OCCASIONS: OccasionDef[] = [
  {
    id: "child_marriage",
    label: "子の結婚",
    description: "結婚や夫婦としての歩みにまつわる話",
  },
  {
    id: "grandchild_birth",
    label: "孫の誕生",
    description: "自分が生まれたとき・子育てにまつわる話",
  },
  {
    id: "child_career",
    label: "子の就職・転職",
    description: "仕事・キャリアの選び方にまつわる話",
  },
  {
    id: "child_hardship",
    label: "困難な時期",
    description: "しんどかった時期をどう乗り越えたかの話",
  },
  {
    id: "daily",
    label: "日常（随時）",
    description: "得意料理・暮らしの知恵など日々の話",
  },
];

export const OCCASION_IDS = OCCASIONS.map((o) => o.id);

export function occasionLabel(id: string | null | undefined): string {
  return OCCASIONS.find((o) => o.id === id)?.label ?? "未分類";
}

// カバレッジの状態はエピソード件数から決定論的に算出する（LLM呼び出し不要）。
// 「未収録＝次の質問候補」という位置づけのため、達成率のニュアンスを持つ語は使わない。
export function coverageStatusFromCount(count: number): "empty" | "thin" | "covered" {
  if (count <= 0) return "empty";
  if (count < 3) return "thin";
  return "covered";
}
