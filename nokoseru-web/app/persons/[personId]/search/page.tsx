import Link from "next/link";
import { notFound } from "next/navigation";
import { getPerson, getCoverageMap, listEpisodeHeadingsByOccasion } from "@/lib/data";
import { OCCASIONS } from "@/lib/occasions";
import { SearchFlow } from "./SearchFlow";

export default async function SearchPage({ params }: PageProps<"/persons/[personId]/search">) {
  const { personId } = await params;
  const person = await getPerson(personId);
  if (!person) notFound();

  const [coverage, headingsByOccasion] = await Promise.all([
    getCoverageMap(personId),
    listEpisodeHeadingsByOccasion(personId),
  ]);

  // 画面06「まだ聞けていないこと」用。あり=2件、すこし=1件まで、まだ=見出しなし。
  const occasionRows = OCCASIONS.map((o) => {
    const status = coverage.find((c) => c.occasion === o.id)?.status ?? "empty";
    const headings = headingsByOccasion[o.id] ?? [];
    const shown = status === "covered" ? headings.slice(0, 2) : status === "thin" ? headings.slice(0, 1) : [];
    return { label: o.label, status, headings: shown };
  });

  return (
    <div className="relative flex-1">
      <main className="mx-auto max-w-lg px-6 py-10">
        <Link href={`/persons/${person.id}`} className="text-xs text-muted hover:text-accent">
          ← {person.name}さんのページに戻る
        </Link>

        <SearchFlow personId={person.id} personName={person.name} occasionRows={occasionRows} />
      </main>
    </div>
  );
}
