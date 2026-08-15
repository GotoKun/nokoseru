import { NextResponse } from "next/server";
import { listSessionCards } from "@/lib/data";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ personId: string }> }
) {
  const { personId } = await params;
  const cards = await listSessionCards(personId);
  return NextResponse.json({ cards });
}
