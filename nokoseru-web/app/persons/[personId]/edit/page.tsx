import Link from "next/link";
import { notFound } from "next/navigation";
import { getPerson } from "@/lib/data";
import { EditProfileForm } from "./EditProfileForm";
import type { FamilyMemberInput } from "@/app/components/PersonProfileForm";

export default async function EditPersonPage({ params }: PageProps<"/persons/[personId]/edit">) {
  const { personId } = await params;
  const person = await getPerson(personId);
  if (!person) notFound();

  const familyMembers = (person.familyMembers as unknown as FamilyMemberInput[]) ?? [];

  return (
    <div className="relative flex-1">
      <main className="km-phone px-6 py-10">
        <Link href={`/persons/${person.id}`} className="text-xs text-muted hover:text-accent">
          ← {person.name}さんのページに戻る
        </Link>
        <div className="km-t-h1 mt-4">プロフィールを編集</div>

        <div className="mt-8">
          <EditProfileForm
            personId={person.id}
            initial={{
              name: person.name,
              relation: person.relation ?? "",
              birthday: person.birthday ? person.birthday.toISOString().slice(0, 10) : "",
              familyMembers,
              hometown: person.hometown ?? "",
              occupation: person.occupation ?? "",
              hobbies: person.hobbies ?? "",
              notes: person.notes ?? "",
            }}
          />
        </div>
      </main>
    </div>
  );
}
