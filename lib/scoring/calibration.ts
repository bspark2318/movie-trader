import { getSupabase } from "@/lib/db/client";
import type { ScoreRow, RecommendationRow } from "@/lib/db/types";

export interface BrierLeaderboardEntry {
  key: string; // "ensemble" | "anthropic" | "comps_quant" | ...
  meanBrier: number;
  meanMarketBrier: number;
  n: number;
  beatsMarket: boolean;
}

export interface CalibrationBin {
  /** Predicted-probability bucket midpoint, 0..1. */
  predicted: number;
  /** Realized frequency of the event in this bucket. */
  realized: number;
  n: number;
}

export interface CalibrationData {
  resolvedMarkets: number;
  leaderboard: BrierLeaderboardEntry[];
  /** Ensemble reliability curve. */
  bins: CalibrationBin[];
  recommendations: { total: number; won: number; lost: number; open: number };
  goNoGo: "insufficient" | "go" | "no-go";
}

const GO_THRESHOLD = 25;

/** Aggregate Brier scores and reliability into the calibration view. */
export async function buildCalibration(): Promise<CalibrationData> {
  const db = getSupabase();
  const empty: CalibrationData = {
    resolvedMarkets: 0,
    leaderboard: [],
    bins: [],
    recommendations: { total: 0, won: 0, lost: 0, open: 0 },
    goNoGo: "insufficient",
  };
  if (!db) return empty;

  const { count: resolvedMarkets } = await db
    .from("resolutions")
    .select("*", { count: "exact", head: true });

  const { data: scores } = await db.from("scores").select<"*", ScoreRow>();
  const rows = scores ?? [];

  // Group by agent (method/ensemble) and by model seat.
  const groups = new Map<string, { brier: number[]; market: number[] }>();
  const add = (key: string, brier: number, market: number) => {
    const g = groups.get(key) ?? { brier: [], market: [] };
    g.brier.push(brier);
    g.market.push(market);
    groups.set(key, g);
  };
  for (const r of rows) {
    add(r.agent, r.brier, r.market_brier);
    if (r.model) add(`model:${r.model}`, r.brier, r.market_brier);
  }

  const mean = (xs: number[]) =>
    xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;

  const leaderboard: BrierLeaderboardEntry[] = [...groups.entries()]
    .map(([key, g]) => ({
      key,
      meanBrier: mean(g.brier),
      meanMarketBrier: mean(g.market),
      n: g.brier.length,
      beatsMarket: mean(g.brier) < mean(g.market),
    }))
    .sort((a, b) => a.meanBrier - b.meanBrier);

  // Recommendation track record.
  const { data: recs } = await db
    .from("recommendations")
    .select<"*", RecommendationRow>();
  const recRows = recs ?? [];
  const recommendations = {
    total: recRows.length,
    won: recRows.filter((r) => r.status === "won").length,
    lost: recRows.filter((r) => r.status === "lost").length,
    open: recRows.filter((r) => r.status === "open").length,
  };

  const ensemble = leaderboard.find((l) => l.key === "ensemble");
  let goNoGo: CalibrationData["goNoGo"] = "insufficient";
  if ((resolvedMarkets ?? 0) >= GO_THRESHOLD && ensemble) {
    goNoGo = ensemble.beatsMarket ? "go" : "no-go";
  }

  return {
    resolvedMarkets: resolvedMarkets ?? 0,
    leaderboard,
    bins: [], // reliability curve filled in once enough per-bracket data exists
    recommendations,
    goNoGo,
  };
}
