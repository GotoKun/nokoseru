import { NextResponse } from "next/server";
import { createSession } from "@/lib/data";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json();
  const personId = String(body.personId ?? "");
  const questionText = String(body.questionText ?? "").trim();
  if (!personId || !questionText) {
    return NextResponse.json({ error: "personId and questionText are required" }, { status: 400 });
  }
  const session = await createSession({
    personId,
    questionText,
    occasionHint: body.occasionHint ? String(body.occasionHint) : null,
    sourcePhotoId: body.sourcePhotoId ? String(body.sourcePhotoId) : null,
  });
  return NextResponse.json({ session }, { status: 201 });
}
