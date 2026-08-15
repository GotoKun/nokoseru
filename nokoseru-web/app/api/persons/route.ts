import { NextResponse } from "next/server";
import { createPerson, listPersons } from "@/lib/data";

export const runtime = "nodejs";

export async function GET() {
  const persons = await listPersons();
  return NextResponse.json({ persons });
}

export async function POST(request: Request) {
  const body = await request.json();
  const name = String(body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const relation = body.relation ? String(body.relation) : null;
  const birthday = body.birthday ? new Date(String(body.birthday)) : null;
  const familyMembers = Array.isArray(body.familyMembers)
    ? body.familyMembers
        .map((f: { name?: unknown; relationship?: unknown }) => ({
          name: String(f?.name ?? "").trim(),
          relationship: String(f?.relationship ?? "").trim(),
        }))
        .filter((f: { name: string; relationship: string }) => f.name || f.relationship)
    : [];
  const person = await createPerson(name, relation, {
    birthday,
    familyMembers,
    hometown: body.hometown ? String(body.hometown) : null,
    occupation: body.occupation ? String(body.occupation) : null,
    hobbies: body.hobbies ? String(body.hobbies) : null,
    notes: body.notes ? String(body.notes) : null,
  });
  return NextResponse.json({ person }, { status: 201 });
}
