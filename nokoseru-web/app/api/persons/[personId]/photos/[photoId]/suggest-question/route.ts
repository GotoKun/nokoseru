import { NextResponse } from "next/server";
import { suggestQuestionForPhoto } from "@/lib/data";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ personId: string; photoId: string }> }
) {
  const { photoId } = await params;
  const question = await suggestQuestionForPhoto(photoId);
  return NextResponse.json({ question });
}
