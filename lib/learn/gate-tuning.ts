import { getSupabase } from "@/lib/db/client";
import type { RecommendationRow } from "@/lib/db/types";

export interface GateThresholds {
  edgeMin: number; // prob points (0..1)
  agreementMax: number; // prob points (0..1)
}

export interface ResolvedTrade {
  edgePts: number; // 0..100
  agreementPts: number; // 0..100
  pnlPerShare: number; // (won? 1-price : -price)
}

/**
 * Grid-search the edge / agreement thresholds that would have maximized realized
 * P&L per trade on resolved paper trades. Returns null if too few to be
 * meaningful (don't tune a gate on a handful of bets).
 */
export function tuneThresholds(
  trades: ResolvedTrade[],
  minPassing = 8,
): GateThresholds | null {
  if (trades.length < minPassing) return null;
  let best: { edgeMin: number; agreementMax: number; score: number } | null =
    null;
  for (let edge = 4; edge <= 20; edge += 1) {
    for (let agr = 2; agr <= 15; agr += 1) {
      const passing = trades.filter(
        (t) => t.edgePts >= edge && t.agreementPts <= agr,
      );
      if (passing.length < minPassing) continue;
      const avg =
        passing.reduce((a, t) => a + t.pnlPerShare, 0) / passing.length;
      if (!best || avg > best.score)
        best = { edgeMin: edge, agreementMax: agr, score: avg };
    }
  }
  if (!best) return null;
  return { edgeMin: best.edgeMin / 100, agreementMax: best.agreementMax / 100 };
}

/** Load resolved paper trades and learn the best thresholds, or null. */
export async function learnedGateThresholds(): Promise<GateThresholds | null> {
  const db = getSupabase();
  if (!db) return null;
  const { data } = await db
    .from("recommendations")
    .select<"*", RecommendationRow>()
    .in("status", ["won", "lost"]);
  const trades: ResolvedTrade[] = (data ?? []).map((r) => {
    const checks = (r.gate_results ?? {}) as {
      agreement?: { maxPairwiseDisagreementPts?: number };
    };
    return {
      edgePts: r.edge_pts,
      agreementPts: checks.agreement?.maxPairwiseDisagreementPts ?? 100,
      pnlPerShare:
        r.status === "won" ? 1 - r.exec_price : -r.exec_price,
    };
  });
  return tuneThresholds(trades);
}
