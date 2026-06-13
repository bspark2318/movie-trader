import { NextRequest, NextResponse } from "next/server";
import { hasDb } from "@/lib/config";
import { checkCronAuth } from "@/lib/cron-auth";
import { getSupabase } from "@/lib/db/client";
import { resolveAndScore } from "@/lib/scoring/run-scoring";
import type { MarketRow } from "@/lib/db/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!checkCronAuth(req)) {
    return NextResponse.json(
      { ok: false, reason: "unauthorized" },
      { status: 401 },
    );
  }
  if (!hasDb()) return NextResponse.json({ ok: false, reason: "no-db" });

  const db = getSupabase()!;

  // Markets past their end date that don't yet have a resolution row.
  const { data: resolvedIds } = await db
    .from("resolutions")
    .select("market_id");
  const exclude = new Set((resolvedIds ?? []).map((r) => r.market_id));

  const { data: markets } = await db
    .from("markets")
    .select<"*", MarketRow>()
    .lt("end_date", new Date().toISOString());

  const candidates = (markets ?? []).filter((m) => !exclude.has(m.id));

  const results = [];
  for (const m of candidates) {
    const scored = await resolveAndScore(m);
    if (scored) results.push(scored);
  }

  return NextResponse.json({ ok: true, resolved: results });
}
