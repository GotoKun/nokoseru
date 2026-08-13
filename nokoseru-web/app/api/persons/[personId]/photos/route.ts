import { NextResponse } from "next/server";
import { createPhoto, listPhotos } from "@/lib/data";
import { mediaUrl } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ personId: string }> }
) {
  const { personId } = await params;
  const photos = await listPhotos(personId);
  return NextResponse.json({
    photos: photos.map((p) => ({
      id: p.id,
      originalUrl: mediaUrl(p.originalPath),
      colorizedUrl: p.colorizedPath ? mediaUrl(p.colorizedPath) : null,
      lastComment: p.lastComment,
      uploadedAt: p.uploadedAt,
    })),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ personId: string }> }
) {
  const { personId } = await params;
  const form = await request.formData();
  const file = form.get("photo");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "photo file is required" }, { status: 400 });
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const photo = await createPhoto(personId, buffer, file.type || "image/jpeg");
  return NextResponse.json(
    {
      photo: {
        id: photo.id,
        originalUrl: mediaUrl(photo.originalPath),
        colorizedUrl: photo.colorizedPath ? mediaUrl(photo.colorizedPath) : null,
      },
    },
    { status: 201 }
  );
}
