import { NextResponse } from "next/server";
import { getCoverageMap } from "@/lib/data";
import { OCCASIONS } from "@/lib/occasions";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ personId: string }> }
) {
  const { personId } = await params;
  const rows = await getCoverageMap(personId);
  const coverage = OCCASIONS.map((o) => {
    const row = rows.find((r) => r.occasion === o.id);
    return {
      occasion: o.id,
      label: o.label,
      description: o.description,
      status: row?.status ?? "empty",
    };
  });
  return NextResponse.json({ coverage });
}
