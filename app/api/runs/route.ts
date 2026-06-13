import { NextRequest, NextResponse } from "next/server";
import { fetchBoxOfficeEvents, fetchEventBySlug } from "@/lib/polymarket/gamma";
import { hasDb, missingProviderKeys } from "@/lib/config";
import { getSupabase } from "@/lib/db/client";
import { orchestrateRun } from "@/lib/runs/orchestrator";
import { evaluateAndPersistGate } from "@/lib/gate";
import type { RunRow } from "@/lib/db/types";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

export async function GET() {
  const db = getSupabase();
  if (!db) return NextResponse.json({ ok: false, reason: "db-required" });
  const { data } = await db
    .from("runs")
    .select<"*", RunRow>()
    .order("started_at", { ascending: false })
    .limit(50);
  return NextResponse.json({ ok: true, runs: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!hasDb()) {
    return NextResponse.json(
      { ok: false, reason: "db-required" },
      { status: 503 },
    );
  }
  const missing = missingProviderKeys();
  if (missing.length > 0) {
    return NextResponse.json(
      { ok: false, reason: "missing-agent-keys", missing },
      { status: 503 },
    );
  }

  let marketSlug: string | undefined;
  try {
    const body = await req.json();
    marketSlug = body?.marketSlug;
  } catch {
    /* no body — run all active */
  }

  const events = marketSlug
    ? [await fetchEventBySlug(marketSlug)].filter(Boolean)
    : await fetchBoxOfficeEvents();

  const results = [];
  for (const ev of events) {
    if (!ev) continue;
    const run = await orchestrateRun(ev);
    const gate = await evaluateAndPersistGate(ev, run);
    results.push({ slug: ev.slug, runId: run.runId, ensemble: run.ensemble, gate });
  }

  return NextResponse.json({ ok: true, results });
}
