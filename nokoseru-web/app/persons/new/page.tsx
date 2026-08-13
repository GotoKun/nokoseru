"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function NewPersonPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [relation, setRelation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("お名前を入力してください");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/persons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), relation: relation.trim() || null }),
      });
      if (!res.ok) throw new Error("登録に失敗しました");
      const { person } = await res.json();
      router.push(`/persons/${person.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "登録に失敗しました");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex-1 bg-background">
      <main className="mx-auto max-w-lg px-6 py-16">
        <Link href="/" className="text-sm text-muted hover:text-accent">
          ← 対象者一覧に戻る
        </Link>
        <h1 className="mt-4 text-xl font-bold">対象者登録</h1>
        <p className="mt-2 text-sm text-muted leading-relaxed">
          記録を残す方（親御さまなど）の情報を登録します。依頼文の作成やご本人への説明はこのあと行えます。
        </p>

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">お名前</span>
            <input
              className="rounded-lg border border-border bg-surface px-4 py-2.5 outline-none focus:border-accent"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例：山田 花子"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">続柄（任意）</span>
            <input
              className="rounded-lg border border-border bg-surface px-4 py-2.5 outline-none focus:border-accent"
              value={relation}
              onChange={(e) => setRelation(e.target.value)}
              placeholder="例：母"
            />
          </label>

          {error && <p className="text-sm text-red-700">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 rounded-full bg-accent px-5 py-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "登録しています…" : "登録する"}
          </button>
        </form>
      </main>
    </div>
  );
}
