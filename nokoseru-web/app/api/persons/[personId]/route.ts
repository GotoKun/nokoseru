import { NextResponse } from "next/server";
import { getPerson } from "@/lib/data";

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
