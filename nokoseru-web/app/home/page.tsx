import Link from "next/link";
import { listPersons } from "@/lib/data";

export const dynamic = "force-dynamic";

// 画面00「役割選択」。ログイン直後に必ずここへ来るグローバルな入口。
// モックアップの2枚（話す／見る）に、「わたしを、登録する」の3枚目を追加している
// （モックアップには無い、今回の追加要件）。
// 背景の泡飾りはレイアウト直下のRouteDecoが担う（この画面ではrole配置）。
export default async function HomePage() {
  const persons = await listPersons();
  // 登録済みが1人だけならその人の収録/検索画面へ直接進む。
  // 0人ならまず登録へ。複数人のときは一覧画面を持たないため、最新の1人へ暫定的に進む。
  const target = persons[0] ?? null;
  const talkHref = target ? `/persons/${target.id}/record` : "/persons/new";
  const watchHref = target ? `/persons/${target.id}/search` : "/persons/new";

  return (
    <div className="relative flex-1">
      <main className="km-phone px-6 py-10">
        <div className="km-t-h1">どちらですか</div>

        <div className="mt-8 flex flex-col gap-4">
          <Link href={talkHref} className="km-hit r24 block">
            <div className="km-card-role tint-a">
              <div className="km-rl">
                じぶんのことを、
                <br />
                話す
              </div>
              <div className="km-rs">カエルムが、おききします</div>
            </div>
          </Link>

          <Link href={watchHref} className="km-hit r24 block">
            <div className="km-card-role tint-b">
              <div className="km-rl">
                家族の話を、
                <br />
                見る
              </div>
              <div className="km-rs">とどいた話を見ます</div>
            </div>
          </Link>

          <Link href="/persons/new" className="km-hit r24 block">
            <div className="km-card-role tint-c">
              <div className="km-rl">
                わたしを、
                <br />
                登録する
              </div>
              <div className="km-rs">プロフィールを入力します</div>
            </div>
          </Link>
        </div>
      </main>
    </div>
  );
}
