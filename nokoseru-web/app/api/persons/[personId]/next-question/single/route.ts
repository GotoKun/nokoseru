import { NextResponse } from "next/server";
import { getNextSingleQuestion } from "@/lib/data";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ personId: string }> }
) {
  const { personId } = await params;
  const forceFresh = new URL(request.url).searchParams.get("fresh") === "1";
  const question = await getNextSingleQuestion(personId, { forceFresh });
  return NextResponse.json({ question });
}
