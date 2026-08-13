import Link from "next/link";
import { notFound } from "next/navigation";
import { getPerson } from "@/lib/data";
import { PersonNav } from "@/app/components/PersonNav";
import { SearchFlow } from "./SearchFlow";

export default async function SearchPage({ params }: PageProps<"/persons/[personId]/search">) {
  const { personId } = await params;
  const person = await getPerson(personId);
  if (!person) notFound();

  return (
    <div className="flex-1 bg-background">
      <main className="mx-auto max-w-2xl px-6 py-16">
        <Link href={`/persons/${person.id}`} className="text-sm text-muted hover:text-accent">
          ← {person.name}さんのページに戻る
        </Link>
        <h1 className="mt-4 text-2xl font-bold">見る・探す</h1>
        <PersonNav personId={person.id} active="/search" />

        <SearchFlow personId={person.id} />
      </main>
    </div>
  );
}
