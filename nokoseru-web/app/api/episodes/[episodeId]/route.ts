import { NextResponse } from "next/server";
import { toggleEpisodeExclusion } from "@/lib/data";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ episodeId: string }> }
) {
  const { episodeId } = await params;
  const body = await request.json();
  const episode = await toggleEpisodeExclusion(episodeId, Boolean(body.excluded));
  return NextResponse.json({ episode });
}
