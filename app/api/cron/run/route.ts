import { NextRequest, NextResponse } from "next/server";
import { fetchBoxOfficeEvents } from "@/lib/polymarket/gamma";
import { hasDb, missingProviderKeys, env } from "@/lib/config";
import { checkCronAuth } from "@/lib/cron-auth";
import { orchestrateRun } from "@/lib/runs/orchestrator";
import { evaluateAndPersistGate } from "@/lib/gate";
import { getSupabase } from "@/lib/db/client";
import type { RunRow } from "@/lib/db/types";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

export async function GET(req: NextRequest) {
  if (!checkCronAuth(req)) {
    return NextResponse.json(
      { ok: false, reason: "unauthorized" },
      { status: 401 },
    );
  }
  const e = env();
  if (e.RUN_MODE !== "auto") {
    return NextResponse.json({ ok: true, skipped: "manual-mode" });
  }
  if (!hasDb()) return NextResponse.json({ ok: false, reason: "no-db" });
  if (missingProviderKeys().length > 0) {
    return NextResponse.json({
      ok: false,
      reason: "missing-agent-keys",
      missing: missingProviderKeys(),
    });
  }

  const db = getSupabase()!;
  const today = new Date().toISOString().slice(0, 10);
  const windowMs = e.AUTO_RUN_WINDOW_DAYS * 86_400_000;

  const events = await fetchBoxOfficeEvents();
  // Only markets within the auto-run window of resolution.
  const eligible = events.filter(
    (ev) =>
      ev.endDate && Date.parse(ev.endDate) - Date.now() <= windowMs,
  );

  // Pick at most ONE market that hasn't run today (one heavy run per invocation).
  for (const ev of eligible) {
    const { data: market } = await db
      .from("markets")
      .select("id")
      .eq("polymarket_event_id", ev.polymarketEventId)
      .maybeSingle<{ id: string }>();

    if (market) {
      const { data: ranToday } = await db
        .from("runs")
        .select("id")
        .eq("market_id", market.id)
        .gte("started_at", `${today}T00:00:00Z`)
        .maybeSingle<Pick<RunRow, "id">>();
      if (ranToday) continue;
    }

    const run = await orchestrateRun(ev);
    const gate = await evaluateAndPersistGate(ev, run);
    return NextResponse.json({
      ok: true,
      ran: ev.slug,
      runId: run.runId,
      emit: gate.emit,
    });
  }

  return NextResponse.json({ ok: true, ran: null, reason: "nothing-pending" });
}
