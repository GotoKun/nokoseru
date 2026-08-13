import { NextResponse } from "next/server";
import { saveSessionUpload } from "@/lib/data";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const form = await request.formData();
  const file = form.get("media");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "media file is required" }, { status: 400 });
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const rel = await saveSessionUpload(sessionId, buffer, file.type || "video/webm");
  return NextResponse.json({ videoPath: rel });
}
