import { NextResponse } from "next/server";
import { setSessionUnlockAt, discardSession } from "@/lib/data";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const body = await request.json();
  const unlockAt = body.unlockAt ? new Date(String(body.unlockAt)) : null;
  const session = await setSessionUnlockAt(sessionId, unlockAt);
  return NextResponse.json({ session });
}

// カエルム画面04「今のは、残しますか」で「残さない」を選んだときに呼ぶ。
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  await discardSession(sessionId);
  return NextResponse.json({ ok: true });
}
