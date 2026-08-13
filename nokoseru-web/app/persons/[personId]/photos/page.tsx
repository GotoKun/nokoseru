import Link from "next/link";
import { notFound } from "next/navigation";
import { getPerson } from "@/lib/data";
import { PersonNav } from "@/app/components/PersonNav";
import { PhotoFlow } from "./PhotoFlow";

export default async function PhotosPage({ params }: PageProps<"/persons/[personId]/photos">) {
  const { personId } = await params;
  const person = await getPerson(personId);
  if (!person) notFound();

  return (
    <div className="flex-1 bg-background">
      <main className="mx-auto max-w-4xl px-6 py-16">
        <Link href={`/persons/${person.id}`} className="text-sm text-muted hover:text-accent">
          ← {person.name}さんのページに戻る
        </Link>
        <h1 className="mt-4 text-2xl font-bold">写真のカラー化</h1>
        <p className="mt-2 text-sm text-muted leading-relaxed">
          古い白黒写真をまとめてアップロードすると、自然な色合いにカラー化します。遺影など当日に飾る写真の準備にお使いください。
          気になる仕上がりがあれば、修正内容をコメントで伝えて作り直せます。カラー化した写真をもとに質問を作って収録することもできます。
        </p>
        <PersonNav personId={person.id} active="/photos" />

        <PhotoFlow personId={person.id} />
      </main>
    </div>
  );
}
