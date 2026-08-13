import Link from "next/link";
import { listPersons } from "@/lib/data";

export const dynamic = "force-dynamic";

const STEPS = [
  {
    number: "1",
    title: "話す",
    description: "思い出や日々のことを、質問に答える形で少しずつ話します。書き記す負担はありません。",
  },
  {
    number: "2",
    title: "残る",
    description: "話した内容は映像として、そのまま無理なく積み重なっていきます。",
  },
  {
    number: "3",
    title: "届く",
    description: "結婚や誕生日など、指定した節目でご家族のもとへ届きます。",
  },
];

export default async function Home() {
  const persons = await listPersons();

  return (
    <div className="flex-1 bg-background">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(60% 50% at 15% 0%, var(--accent-soft) 0%, transparent 65%), radial-gradient(45% 40% at 100% 20%, var(--accent-soft) 0%, transparent 60%)",
          }}
        />
        <div className="mx-auto max-w-3xl px-6 py-20 sm:py-28">
          <p className="text-2xl sm:text-3xl font-bold tracking-tight text-accent">ノコセル</p>
          <h1 className="mt-4 text-3xl sm:text-4xl font-bold leading-snug tracking-tight">
            その人の話が、
            <br className="hidden sm:block" />
            そのまま残る。
          </h1>
          <p className="mt-5 max-w-xl text-muted leading-relaxed">
            何気ない会話も、ずっと残しておける形に。質問に答えるだけで、大切な人の記憶を映像として記録し、
            節目のタイミングでご家族のもとへ届けます。
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link
              href="/persons/new"
              className="rounded-full bg-accent px-6 py-3 text-sm font-medium text-white hover:opacity-90"
            >
              はじめる
            </Link>
            {persons.length > 0 && (
              <a href="#persons" className="text-sm text-muted hover:text-accent">
                登録済みの方を見る ↓
              </a>
            )}
          </div>
        </div>
      </section>

      {/* 3ステップ */}
      <section className="mx-auto max-w-3xl px-6 py-14">
        <div className="grid gap-8 sm:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.number}>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-sm font-medium text-accent">
                {s.number}
              </span>
              <h3 className="mt-3 font-semibold">{s.title}</h3>
              <p className="mt-1.5 text-sm text-muted leading-relaxed">{s.description}</p>
            </div>
          ))}
        </div>
        <p className="mt-10 text-sm text-muted leading-relaxed">
          話すことは、聞く人にとっても、話す人にとっても、想いを整理する時間になります。
        </p>
      </section>

      {/* 対象者一覧 */}
      <section id="persons" className="mx-auto max-w-2xl px-6 pb-20 pt-4">
        <div className="flex items-center justify-between border-t border-border pt-10">
          <h2 className="text-lg font-semibold">対象者</h2>
          <Link
            href="/persons/new"
            className="rounded-full border border-border px-4 py-2 text-sm font-medium hover:border-accent hover:text-accent"
          >
            対象者を登録する
          </Link>
        </div>

        {persons.length === 0 ? (
          <p className="mt-6 text-sm text-muted">
            まだ対象者が登録されていません。まずは登録から始めましょう。
          </p>
        ) : (
          <ul className="mt-6 flex flex-col gap-3">
            {persons.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/persons/${p.id}`}
                  className="flex items-center justify-between rounded-xl border border-border bg-surface px-5 py-4 hover:border-accent"
                >
                  <div>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted mt-0.5">{p.relation ?? "続柄未設定"}</div>
                  </div>
                  <div className="text-xs text-muted">収録 {p._count.sessions}件</div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
