import { NextResponse } from "next/server";
import { searchEpisodes } from "@/lib/data";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ personId: string }> }
) {
  const { personId } = await params;
  const q = new URL(request.url).searchParams.get("q") ?? "";
  const episodes = await searchEpisodes(personId, q);
  return NextResponse.json({ episodes });
}
