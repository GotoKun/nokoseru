import { NextResponse } from "next/server";
import { finalizeSession } from "@/lib/data";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  try {
    const session = await finalizeSession(sessionId);
    return NextResponse.json({ session });
  } catch (err) {
    console.error("[finalize] failed", err);
    return NextResponse.json({ error: "finalize failed" }, { status: 500 });
  }
}
