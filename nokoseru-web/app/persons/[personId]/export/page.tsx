import Link from "next/link";
import { notFound } from "next/navigation";
import { getPerson, listDeliveries } from "@/lib/data";
import { PersonNav } from "@/app/components/PersonNav";
import { ExportFlow } from "./ExportFlow";

export default async function ExportPage({ params }: PageProps<"/persons/[personId]/export">) {
  const { personId } = await params;
  const person = await getPerson(personId);
  if (!person) notFound();

  const deliveries = await listDeliveries(personId);

  return (
    <div className="flex-1 bg-background">
      <main className="mx-auto max-w-2xl px-6 py-16">
        <Link href={`/persons/${person.id}`} className="text-sm text-muted hover:text-accent">
          ← {person.name}さんのページに戻る
        </Link>
        <h1 className="mt-4 text-2xl font-bold">エクスポート</h1>
        <p className="mt-2 text-sm text-muted leading-relaxed">
          動画・字幕・タグ情報を1つのファイルにまとめて書き出します。サーバーやこのサービスが終了しても、
          ダウンロードした一式は端末内の動画プレイヤーとブラウザだけで再生・検索できます。
        </p>
        <PersonNav personId={person.id} active="/export" />

        <ExportFlow personId={person.id} />

        <section className="mt-10">
          <h2 className="text-sm font-medium">これまでのエクスポート</h2>
          {deliveries.length === 0 ? (
            <p className="mt-3 text-sm text-muted">まだエクスポートはありません。</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {deliveries.map((d) => (
                <li
                  key={d.id}
                  className="rounded-lg border border-border bg-surface px-4 py-3 text-xs text-muted flex items-center justify-between"
                >
                  <span>{new Date(d.createdAt).toLocaleString("ja-JP")}</span>
                  {d.exportBundlePath && (
                    <a
                      href={`/api/media/${d.exportBundlePath}`}
                      className="text-accent hover:underline"
                    >
                      再ダウンロード
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
