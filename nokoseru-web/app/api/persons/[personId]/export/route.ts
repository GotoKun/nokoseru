import { NextResponse } from "next/server";
import { buildExportBundle } from "@/lib/export";
import { mediaUrl } from "@/lib/storage";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ personId: string }> }
) {
  const { personId } = await params;
  const rel = await buildExportBundle(personId);
  return NextResponse.json({ url: mediaUrl(rel) });
}
