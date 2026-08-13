import { NextResponse } from "next/server";
import { deletePhoto } from "@/lib/data";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ personId: string; photoId: string }> }
) {
  const { photoId } = await params;
  try {
    await deletePhoto(photoId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[delete photo] failed", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
