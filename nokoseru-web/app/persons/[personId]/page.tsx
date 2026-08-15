import Link from "next/link";
import { notFound } from "next/navigation";
import { getPerson } from "@/lib/data";

// 画面00「役割選択」そのもの。モックアップにある内容だけを表示する
// （名前・続柄・家族構成の表示や、写真/エクスポート/編集などの補助機能は置かない）。
// 背景の泡飾りはレイアウト直下のRouteDecoが担う（この画面ではrole配置）。
export default async function PersonPage({ params }: PageProps<"/persons/[personId]">) {
  const { personId } = await params;
  const person = await getPerson(personId);
  if (!person) notFound();

  return (
    <div className="relative flex-1">
      <main className="km-phone px-6 py-10">
        <Link href="/home" className="text-xs text-muted hover:text-accent">
          ← もどる
        </Link>

        <div className="km-t-h1 mt-6">どちらですか</div>

        <div className="mt-8 flex flex-col gap-4">
          <Link href={`/persons/${person.id}/record`} className="km-hit r24 block">
            <div className="km-card-role tint-a">
              <div className="km-rl">
                じぶんのことを、
                <br />
                話す
              </div>
              <div className="km-rs">カエルムが、おききします</div>
            </div>
          </Link>
          <Link href={`/persons/${person.id}/search`} className="km-hit r24 block">
            <div className="km-card-role tint-b">
              <div className="km-rl">
                家族の話を、
                <br />
                見る
              </div>
              <div className="km-rs">とどいた話を見ます</div>
            </div>
          </Link>
        </div>
      </main>
    </div>
  );
}
