import Link from "next/link";
import { notFound } from "next/navigation";
import { getPerson, getCoverageMap } from "@/lib/data";
import { OCCASIONS } from "@/lib/occasions";
import { PersonNav } from "@/app/components/PersonNav";

const STATUS_TEXT: Record<string, string> = {
  empty: "まだ記録がありません",
  thin: "少し記録があります",
  covered: "いくつか記録があります",
};

export default async function PersonPage({ params }: PageProps<"/persons/[personId]">) {
  const { personId } = await params;
  const person = await getPerson(personId);
  if (!person) notFound();

  const coverage = await getCoverageMap(personId);

  return (
    <div className="flex-1 bg-background">
      <main className="mx-auto max-w-2xl px-6 py-16">
        <Link href="/" className="text-sm text-muted hover:text-accent">
          ← 対象者一覧に戻る
        </Link>
        <h1 className="mt-4 text-2xl font-bold">{person.name}</h1>
        <p className="text-sm text-muted mt-1">{person.relation ?? "続柄未設定"}</p>

        <PersonNav personId={person.id} active="" />

        <section className="mt-10">
          <h2 className="text-lg font-semibold">これまでの記録</h2>
          <p className="mt-1 text-sm text-muted leading-relaxed">
            達成率や進捗ではなく、「次に聞けそうなこと」の一覧です。空欄があっても問題ありません。
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {OCCASIONS.map((o) => {
              const row = coverage.find((c) => c.occasion === o.id);
              const status = row?.status ?? "empty";
              return (
                <div
                  key={o.id}
                  className="rounded-xl border border-border bg-surface px-5 py-4"
                >
                  <div className="flex items-center gap-2">
                    <StatusDot status={status} />
                    <span className="font-medium text-sm">{o.label}</span>
                  </div>
                  <p className="mt-1.5 text-xs text-muted leading-relaxed">{o.description}</p>
                  <p className="mt-2 text-xs text-accent">{STATUS_TEXT[status]}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Link
            href={`/persons/${person.id}/record`}
            className="flex-1 text-center rounded-full bg-accent px-5 py-3 text-sm font-medium text-white hover:opacity-90"
          >
            収録をはじめる
          </Link>
          <Link
            href={`/persons/${person.id}/search`}
            className="flex-1 text-center rounded-full border border-border px-5 py-3 text-sm font-medium hover:border-accent"
          >
            記録を見る・探す
          </Link>
        </section>
      </main>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  if (status === "covered") {
    return <span className="inline-block h-2.5 w-2.5 rounded-full bg-accent" />;
  }
  if (status === "thin") {
    return (
      <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-accent bg-accent-soft" />
    );
  }
  return <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-border" />;
}
