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
  const person = await createPerson(name, relation);
  return NextResponse.json({ person }, { status: 201 });
}
