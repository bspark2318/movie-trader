import { NextRequest, NextResponse } from "next/server";
import { fetchBoxOfficeEvents } from "@/lib/polymarket/gamma";
import { hasDb } from "@/lib/config";
import { checkCronAuth } from "@/lib/cron-auth";
import {
  upsertMarketWithBrackets,
  insertPriceSnapshots,
} from "@/lib/db/markets";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!checkCronAuth(req)) {
    return NextResponse.json(
      { ok: false, reason: "unauthorized" },
      { status: 401 },
    );
  }
  if (!hasDb()) {
    // 200 so Vercel cron doesn't alarm — snapshots simply require a DB.
    return NextResponse.json({ ok: false, reason: "no-db" });
  }

  const events = await fetchBoxOfficeEvents();
  const results: { slug: string; brackets: number }[] = [];

  for (const ev of events) {
    const upserted = await upsertMarketWithBrackets(ev);
    if (!upserted) continue;
    await insertPriceSnapshots(ev, upserted.bracketIds);
    results.push({ slug: ev.slug, brackets: upserted.bracketIds.size });
  }

  return NextResponse.json({ ok: true, snapped: results });
}
