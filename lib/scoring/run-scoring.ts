import { getSupabase } from "@/lib/db/client";
import { resolveMarket } from "./resolve";
import { brierScore, marketImpliedProbs } from "./brier";
import { medianAggregate } from "@/lib/runs/consensus";
import type {
  MarketRow,
  BracketRow,
  RunRow,
  AgentOutputRow,
  PriceSnapshotRow,
} from "@/lib/db/types";

/** Market-implied probs from the latest snapshot per bracket (the benchmark). */
async function marketProbs(
  brackets: BracketRow[],
  labels: string[],
): Promise<Record<string, number>> {
  const db = getSupabase()!;
  const mids: Record<string, number> = {};
  for (const b of brackets) {
    const { data } = await db
      .from("price_snapshots")
      .select<"*", PriceSnapshotRow>()
      .eq("bracket_id", b.id)
      .order("snapped_at", { ascending: false })
      .limit(1)
      .maybeSingle<PriceSnapshotRow>();
    mids[b.label] = data?.mid ?? 0;
  }
  return marketImpliedProbs(mids, labels);
}

export interface ScoredMarket {
  slug: string;
  finalGrossMillions: number;
  winningLabel: string | null;
  scoredRuns: number;
}

/**
 * Resolve one market and write resolution + scores + recommendation outcomes.
 * Returns null if the market isn't ready to settle or can't be matched.
 */
export async function resolveAndScore(
  market: MarketRow,
): Promise<ScoredMarket | null> {
  const db = getSupabase();
  if (!db) return null;

  const { data: brackets } = await db
    .from("brackets")
    .select<"*", BracketRow>()
    .eq("market_id", market.id);
  if (!brackets || brackets.length === 0) return null;

  const resolved = await resolveMarket(market, brackets);
  if (!resolved || !resolved.winningLabel) return null;

  const labels = brackets.map((b) => b.label);
  const winId =
    brackets.find((b) => b.label === resolved.winningLabel)?.id ?? null;

  // Persist resolution (idempotent on market_id unique).
  await db.from("resolutions").upsert(
    {
      market_id: market.id,
      final_gross_millions: resolved.finalGrossMillions,
      winning_bracket_id: winId,
      source: "the-numbers",
    },
    { onConflict: "market_id" },
  );

  const market_brier = brierScore(
    await marketProbs(brackets, labels),
    labels,
    resolved.winningLabel,
  );

  // Score each run of this market.
  const { data: runs } = await db
    .from("runs")
    .select<"*", RunRow>()
    .eq("market_id", market.id);

  let scoredRuns = 0;
  for (const run of runs ?? []) {
    const { data: outputs } = await db
      .from("agent_outputs")
      .select<"*", AgentOutputRow>()
      .eq("run_id", run.id);
    if (!outputs || outputs.length === 0) continue;

    const scoreRows: {
      run_id: string;
      agent: string;
      model: string;
      brier: number;
      market_brier: number;
    }[] = [];

    // Per-cell Brier (independent + consensus).
    for (const o of outputs) {
      scoreRows.push({
        run_id: run.id,
        agent: o.agent,
        model: o.model,
        brier: brierScore(o.bracket_probs, labels, resolved.winningLabel),
        market_brier,
      });
    }

    // Ensemble = median of the consensus outputs.
    const consensus = outputs.filter((o) => o.phase === "consensus");
    if (consensus.length > 0) {
      const ensemble = medianAggregate(
        consensus.map((c) => ({ bracket_probs: c.bracket_probs })),
        labels,
      );
      scoreRows.push({
        run_id: run.id,
        agent: "ensemble",
        model: "",
        brier: brierScore(ensemble, labels, resolved.winningLabel),
        market_brier,
      });
    }

    await db
      .from("scores")
      .upsert(scoreRows, { onConflict: "run_id,agent,model" });
    scoredRuns++;
  }

  // Settle recommendations: won if the recommended bracket is the winner.
  const { data: recs } = await db
    .from("recommendations")
    .select("id, bracket_id, run_id")
    .in("run_id", (runs ?? []).map((r) => r.id));
  for (const rec of recs ?? []) {
    const status = rec.bracket_id === winId ? "won" : "lost";
    await db.from("recommendations").update({ status }).eq("id", rec.id);
  }

  return {
    slug: market.slug,
    finalGrossMillions: resolved.finalGrossMillions,
    winningLabel: resolved.winningLabel,
    scoredRuns,
  };
}
