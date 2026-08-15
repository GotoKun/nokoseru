"use client";

import { useState } from "react";
import { Hit } from "@/app/components/km/Hit";

export interface FamilyMemberInput {
  name: string;
  relationship: string;
}

export interface ProfileFormValues {
  name: string;
  relation: string;
  birthday: string; // "YYYY-MM-DD" or ""
  familyMembers: FamilyMemberInput[];
  hometown: string;
  occupation: string;
  hobbies: string;
  notes: string;
}

export function PersonProfileForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial: ProfileFormValues;
  submitLabel: string;
  onSubmit: (values: ProfileFormValues) => Promise<void>;
}) {
  const [name, setName] = useState(initial.name);
  const [relation, setRelation] = useState(initial.relation);
  const [birthday, setBirthday] = useState(initial.birthday);
  const [familyMembers, setFamilyMembers] = useState<FamilyMemberInput[]>(initial.familyMembers);
  const [hometown, setHometown] = useState(initial.hometown);
  const [occupation, setOccupation] = useState(initial.occupation);
  const [hobbies, setHobbies] = useState(initial.hobbies);
  const [notes, setNotes] = useState(initial.notes);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addFamilyMember() {
    setFamilyMembers((prev) => [...prev, { name: "", relationship: "" }]);
  }

  function updateFamilyMember(index: number, field: keyof FamilyMemberInput, value: string) {
    setFamilyMembers((prev) => prev.map((f, i) => (i === index ? { ...f, [field]: value } : f)));
  }

  function removeFamilyMember(index: number) {
    setFamilyMembers((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    if (!name.trim()) {
      setError("お名前を入力してください");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        relation,
        birthday,
        familyMembers: familyMembers.filter((f) => f.name.trim() || f.relationship.trim()),
        hometown,
        occupation,
        hobbies,
        notes,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
      className="flex flex-col gap-5"
    >
      <label className="flex flex-col gap-1.5">
        <span className="km-label">お名前</span>
        <input
          className="km-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例：山田 花子"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="km-label">続柄（任意）</span>
        <input
          className="km-input"
          value={relation}
          onChange={(e) => setRelation(e.target.value)}
          placeholder="例：母"
        />
      </label>

      <div className="rounded-2xl p-5 shadow-[inset_0_0_0_1px_var(--border)]">
        <p className="km-label">ご本人のプロフィール（任意）</p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          分かる範囲で構いません。質問を「お孫さん」ではなく実際のお名前で具体的にするためだけに使います。
          まだ起きていないことや将来のことを想像させる目的には使いません。
        </p>

        <label className="mt-4 flex flex-col gap-1.5">
          <span className="km-label">誕生日</span>
          <input
            type="date"
            className="km-input max-w-xs"
            value={birthday}
            onChange={(e) => setBirthday(e.target.value)}
          />
        </label>

        <label className="mt-4 flex flex-col gap-1.5">
          <span className="km-label">出身地・育った場所</span>
          <input
            className="km-input"
            value={hometown}
            onChange={(e) => setHometown(e.target.value)}
            placeholder="例：新潟県〇〇市"
          />
        </label>

        <label className="mt-4 flex flex-col gap-1.5">
          <span className="km-label">お仕事・経歴</span>
          <input
            className="km-input"
            value={occupation}
            onChange={(e) => setOccupation(e.target.value)}
            placeholder="例：長く洋裁の仕事をしていた"
          />
        </label>

        <label className="mt-4 flex flex-col gap-1.5">
          <span className="km-label">趣味・好きなこと</span>
          <input
            className="km-input"
            value={hobbies}
            onChange={(e) => setHobbies(e.target.value)}
            placeholder="例：庭いじり、将棋、演歌を聴くこと"
          />
        </label>

        <label className="mt-4 flex flex-col gap-1.5">
          <span className="km-label">その他、知っておいてほしいこと</span>
          <textarea
            className="km-textarea"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="例：昔から料理がとても得意"
          />
        </label>

        <div className="mt-5">
          <span className="km-label">家族構成</span>
          <div className="mt-2 flex flex-col gap-2">
            {familyMembers.map((f, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  className="km-input w-28 text-sm"
                  value={f.relationship}
                  onChange={(e) => updateFamilyMember(i, "relationship", e.target.value)}
                  placeholder="続柄（例：長男）"
                />
                <input
                  className="km-input flex-1 text-sm"
                  value={f.name}
                  onChange={(e) => updateFamilyMember(i, "name", e.target.value)}
                  placeholder="お名前"
                />
                <button
                  type="button"
                  onClick={() => removeFamilyMember(i)}
                  aria-label="削除"
                  className="text-muted hover:text-red-700"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button type="button" onClick={addFamilyMember} className="mt-2 text-sm text-accent hover:underline">
            + 家族を追加する
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}

      <Hit locked={submitting} onActivate={handleSubmit} className="mt-2">
        <div className="km-btn km-btn-primary">{submitting ? "保存しています…" : submitLabel}</div>
      </Hit>
    </form>
  );
}
