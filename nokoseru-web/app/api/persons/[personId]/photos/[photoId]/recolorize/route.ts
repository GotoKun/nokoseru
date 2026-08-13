import { NextResponse } from "next/server";
import { recolorizePhoto } from "@/lib/data";
import { mediaUrl } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ personId: string; photoId: string }> }
) {
  const { photoId } = await params;
  const body = await request.json().catch(() => ({}));
  const comment = String(body.comment ?? "");

  try {
    const photo = await recolorizePhoto(photoId, comment);
    return NextResponse.json({
      photo: {
        id: photo.id,
        originalUrl: mediaUrl(photo.originalPath),
        colorizedUrl: photo.colorizedPath ? mediaUrl(photo.colorizedPath) : null,
        lastComment: photo.lastComment,
      },
    });
  } catch (err) {
    console.error("[recolorize] failed", err);
    return NextResponse.json({ error: "recolorize failed" }, { status: 500 });
  }
}
