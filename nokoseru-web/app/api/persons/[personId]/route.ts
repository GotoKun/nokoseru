import { NextResponse } from "next/server";
import { getPerson, updatePersonProfile } from "@/lib/data";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ personId: string }> }
) {
  const { personId } = await params;
  const person = await getPerson(personId);
  if (!person) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ person });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ personId: string }> }
) {
  const { personId } = await params;
  const body = await request.json();

  const data: {
    name?: string;
    relation?: string | null;
    birthday?: Date | null;
    familyMembers?: { name: string; relationship: string }[];
    hometown?: string | null;
    occupation?: string | null;
    hobbies?: string | null;
    notes?: string | null;
  } = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if ("relation" in body) data.relation = body.relation ? String(body.relation) : null;
  if ("birthday" in body) data.birthday = body.birthday ? new Date(String(body.birthday)) : null;
  if ("hometown" in body) data.hometown = body.hometown ? String(body.hometown) : null;
  if ("occupation" in body) data.occupation = body.occupation ? String(body.occupation) : null;
  if ("hobbies" in body) data.hobbies = body.hobbies ? String(body.hobbies) : null;
  if ("notes" in body) data.notes = body.notes ? String(body.notes) : null;
  if (Array.isArray(body.familyMembers)) {
    data.familyMembers = body.familyMembers
      .map((f: { name?: unknown; relationship?: unknown }) => ({
        name: String(f?.name ?? "").trim(),
        relationship: String(f?.relationship ?? "").trim(),
      }))
      .filter((f: { name: string; relationship: string }) => f.name || f.relationship);
  }

  const person = await updatePersonProfile(personId, data);
  return NextResponse.json({ person });
}
