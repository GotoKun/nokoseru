import { NextResponse } from "next/server";
import { getNextQuestionCandidates } from "@/lib/data";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ personId: string }> }
) {
  const { personId } = await params;
  const questions = await getNextQuestionCandidates(personId);
  return NextResponse.json({ questions });
}
