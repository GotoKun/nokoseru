"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { PersonProfileForm, type ProfileFormValues } from "@/app/components/PersonProfileForm";

// 画面00の「わたしを、登録する」から来る、自分自身のプロフィール入力画面。
// カエルムが質問を具体的にするために使う情報（誕生日・出身地・趣味など）と、
// 家族構成をここでまとめて入力する。
export default function NewPersonPage() {
  const router = useRouter();

  async function handleSubmit(values: ProfileFormValues) {
    const res = await fetch("/api/persons", {
      method: "POST",
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
    if (!res.ok) throw new Error("登録に失敗しました");
    await res.json();
    router.push("/home");
  }

  return (
    <div className="relative flex-1">
      <main className="km-phone px-6 py-10">
        <Link href="/home" className="text-xs text-muted hover:text-accent">
          ← もどる
        </Link>
        <div className="km-t-h1 mt-4">わたしのプロフィール</div>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          お名前や誕生日、趣味などを教えてください。カエルムが質問を考えるときにだけ使います。
          あわせて、ご家族のことも登録できます。
        </p>

        <div className="mt-8">
          <PersonProfileForm
            initial={{
              name: "",
              relation: "",
              birthday: "",
              familyMembers: [],
              hometown: "",
              occupation: "",
              hobbies: "",
              notes: "",
            }}
            submitLabel="登録する"
            onSubmit={handleSubmit}
          />
        </div>
      </main>
    </div>
  );
}
