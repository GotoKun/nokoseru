import Link from "next/link";
import { notFound } from "next/navigation";
import { getPerson } from "@/lib/data";
import { PersonNav } from "@/app/components/PersonNav";
import { RecordFlow } from "./RecordFlow";

export default async function RecordPage({
  params,
  searchParams,
}: PageProps<"/persons/[personId]/record">) {
  const { personId } = await params;
  const sp = (await searchParams) ?? {};
  const person = await getPerson(personId);
  if (!person) notFound();

  const presetQuestionText = typeof sp.q === "string" ? sp.q : undefined;
  const presetOccasion = typeof sp.occasion === "string" ? sp.occasion : "";
  const sourcePhotoId = typeof sp.photoId === "string" ? sp.photoId : undefined;

  return (
    <div className="flex-1 bg-background">
      <main className="mx-auto max-w-2xl px-6 py-16">
        <Link href={`/persons/${person.id}`} className="text-sm text-muted hover:text-accent">
          ← {person.name}さんのページに戻る
        </Link>
        <h1 className="mt-4 text-2xl font-bold">収録</h1>
        <PersonNav personId={person.id} active="/record" />

        <RecordFlow
          personId={person.id}
          personName={person.name}
          presetQuestion={presetQuestionText ? { text: presetQuestionText, occasionHint: presetOccasion } : undefined}
          sourcePhotoId={sourcePhotoId}
        />
      </main>
    </div>
  );
}
