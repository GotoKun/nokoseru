"use client";

import { useRouter } from "next/navigation";
import { PersonProfileForm, type ProfileFormValues } from "@/app/components/PersonProfileForm";

export function EditProfileForm({ personId, initial }: { personId: string; initial: ProfileFormValues }) {
  const router = useRouter();

  async function handleSubmit(values: ProfileFormValues) {
    const res = await fetch(`/api/persons/${personId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: values.name,
        relation: values.relation.trim() || null,
        birthday: values.birthday || null,
        familyMembers: values.familyMembers,
        hometown: values.hometown.trim() || null,
        occupation: values.occupation.trim() || null,
        hobbies: values.hobbies.trim() || null,
        notes: values.notes.trim() || null,
      }),
    });
    if (!res.ok) throw new Error("保存に失敗しました");
    router.push(`/persons/${personId}`);
    router.refresh();
  }

  return <PersonProfileForm initial={initial} submitLabel="保存する" onSubmit={handleSubmit} />;
}
