import Link from "next/link";
import { notFound } from "next/navigation";
import { getPerson } from "@/lib/data";
import { RecordFlow } from "./RecordFlow";
import { PcWidthWarning } from "./PcWidthWarning";

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
    <div className="relative flex-1">
      <main className="mx-auto max-w-lg px-6 py-10">
        <Link href={`/persons/${person.id}`} className="text-xs text-muted hover:text-accent">
          ← {person.name}さんのページに戻る
        </Link>
        <div className="mt-4">
          <PcWidthWarning />
        </div>

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
