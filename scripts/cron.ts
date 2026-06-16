/**
 * Headless cron runner for GitHub Actions (free automation path).
 *
 * Reuses the exact lib functions the /api/cron/* routes wrap, but runs in a
 * plain Node process so the heavy 12-call run executes inside an Actions runner
 * (6h job limit, free) instead of a Vercel function (maxDuration=800 needs Pro).
 *
 * Usage: tsx scripts/cron.ts <snapshot|run|resolve>
 * Env: SUPABASE_URL, SUPABASE_SERVICE_KEY, ANTHROPIC/OPENAI/GOOGLE_API_KEY,
 *      optional MODEL_*, AUTO_RUN_WINDOW_DAYS.
 */
import { fetchBoxOfficeEvents } from "@/lib/polymarket/gamma";
import { hasDb, missingProviderKeys, env } from "@/lib/config";
import { getSupabase } from "@/lib/db/client";
import {
  upsertMarketWithBrackets,
  insertPriceSnapshots,
} from "@/lib/db/markets";
import { orchestrateRun } from "@/lib/runs/orchestrator";
import { evaluateAndPersistGate } from "@/lib/gate";
import { resolveAndScore } from "@/lib/scoring/run-scoring";
import type { MarketRow, RunRow } from "@/lib/db/types";

function requireDb() {
  if (!hasDb()) {
    console.error("FATAL: SUPABASE_URL / SUPABASE_SERVICE_KEY not set.");
    process.exit(1);
  }
}

async function snapshot() {
  requireDb();
  const events = await fetchBoxOfficeEvents();
  const snapped: { slug: string; brackets: number }[] = [];
  for (const ev of events) {
    const upserted = await upsertMarketWithBrackets(ev);
    if (!upserted) continue;
    await insertPriceSnapshots(ev, upserted.bracketIds);
    snapped.push({ slug: ev.slug, brackets: upserted.bracketIds.size });
  }
  console.log(JSON.stringify({ ok: true, snapped }, null, 2));
}

async function run() {
  requireDb();
  const missing = missingProviderKeys();
  if (missing.length > 0) {
    console.error("FATAL: missing agent keys:", missing.join(", "));
    process.exit(1);
  }
  const e = env();
  const db = getSupabase()!;
  const today = new Date().toISOString().slice(0, 10);
  const windowMs = e.AUTO_RUN_WINDOW_DAYS * 86_400_000;

  const events = await fetchBoxOfficeEvents();
  const eligible = events.filter(
    (ev) => ev.endDate && Date.parse(ev.endDate) - Date.now() <= windowMs,
  );

  // One heavy run per invocation: first eligible market not already run today.
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

    const result = await orchestrateRun(ev);
    const gate = await evaluateAndPersistGate(ev, result);
    console.log(
      JSON.stringify(
        { ok: true, ran: ev.slug, runId: result.runId, emit: gate.emit },
        null,
        2,
      ),
    );
    return;
  }
  console.log(JSON.stringify({ ok: true, ran: null, reason: "nothing-pending" }));
}

async function resolve() {
  requireDb();
  const db = getSupabase()!;
  const { data: resolvedIds } = await db.from("resolutions").select("market_id");
  const exclude = new Set((resolvedIds ?? []).map((r) => r.market_id));

  const { data: markets } = await db
    .from("markets")
    .select<"*", MarketRow>()
    .lt("end_date", new Date().toISOString());

  const candidates = (markets ?? []).filter((m) => !exclude.has(m.id));
  const resolved = [];
  for (const m of candidates) {
    const scored = await resolveAndScore(m);
    if (scored) resolved.push(scored);
  }
  console.log(JSON.stringify({ ok: true, resolved }, null, 2));
}

const cmd = process.argv[2];
const jobs: Record<string, () => Promise<void>> = { snapshot, run, resolve };
const job = jobs[cmd ?? ""];
if (!job) {
  console.error(`Usage: tsx scripts/cron.ts <${Object.keys(jobs).join("|")}>`);
  process.exit(1);
}
job()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
