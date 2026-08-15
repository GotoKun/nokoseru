import { NextResponse } from "next/server";
import { listLockedSessions } from "@/lib/data";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ personId: string }> }
) {
  const { personId } = await params;
  const lockedMessages = await listLockedSessions(personId);
  return NextResponse.json({ lockedMessages });
}
