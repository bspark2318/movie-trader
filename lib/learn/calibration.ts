import { getSupabase } from "@/lib/db/client";
import { medianAggregate } from "@/lib/runs/consensus";
import { renormalize } from "@/lib/agents/schema";
import type {
  ResolutionRow,
  BracketRow,
  RunRow,
  AgentOutputRow,
} from "@/lib/db/types";

export interface CalBin {
  lo: number;
  hi: number;
  predictedMean: number;
  realized: number;
  n: number;
}

/**
 * Reliability mapping from (predicted, outcome) pairs: bin predictions, and in
 * each bin record how often the event actually happened. If we systematically
 * say 30% when it's really 22%, this captures it.
 */
export function buildCalibrationMapping(
  pairs: { p: number; o: number }[],
  binCount = 10,
): CalBin[] {
  const bins: CalBin[] = [];
  for (let i = 0; i < binCount; i++) {
    const lo = i / binCount;
    const hi = (i + 1) / binCount;
    const inBin = pairs.filter((x) => x.p >= lo && (x.p < hi || (i === binCount - 1 && x.p <= hi)));
    if (inBin.length === 0) continue;
    bins.push({
      lo,
      hi,
      predictedMean: inBin.reduce((a, x) => a + x.p, 0) / inBin.length,
      realized: inBin.reduce((a, x) => a + x.o, 0) / inBin.length,
      n: inBin.length,
    });
  }
  return bins;
}

/**
 * Map a raw probability to the realized rate of the nearest reliability point
 * (identity if no mapping). Nearest-by-predicted-mean avoids bin-boundary
 * ambiguity and degrades smoothly when bins are sparse.
 */
export function applyCalibration(p: number, mapping: CalBin[]): number {
  if (mapping.length === 0) return p;
  const best = mapping.reduce((a, b) =>
    Math.abs(b.predictedMean - p) < Math.abs(a.predictedMean - p) ? b : a,
  );
  return best.realized;
}

/** Calibrate a full distribution, then renormalize across the brackets. */
export function calibrateDistribution(
  probs: Record<string, number>,
  labels: string[],
  mapping: CalBin[],
): Record<string, number> {
  if (mapping.length === 0) return probs;
  const adj: Record<string, number> = {};
  for (const l of labels) adj[l] = applyCalibration(probs[l] ?? 0, mapping);
  return renormalize(adj, labels);
}

/**
 * Build the calibration mapping from every resolved market's ensemble
 * distribution vs its actual winner. Returns [] (identity) when there's no data.
 */
export async function loadCalibrationMapping(): Promise<CalBin[]> {
  const db = getSupabase();
  if (!db) return [];

  const { data: resolutions } = await db
    .from("resolutions")
    .select<"*", ResolutionRow>();
  if (!resolutions || resolutions.length === 0) return [];

  const pairs: { p: number; o: number }[] = [];
  for (const res of resolutions) {
    if (!res.winning_bracket_id) continue;
    const { data: brackets } = await db
      .from("brackets")
      .select<"*", BracketRow>()
      .eq("market_id", res.market_id);
    if (!brackets || brackets.length === 0) continue;
    const labels = brackets.map((b) => b.label);
    const winningLabel =
      brackets.find((b) => b.id === res.winning_bracket_id)?.label ?? null;
    if (!winningLabel) continue;

    const { data: runs } = await db
      .from("runs")
      .select<"*", RunRow>()
      .eq("market_id", res.market_id);
    for (const run of runs ?? []) {
      const { data: outputs } = await db
        .from("agent_outputs")
        .select<"*", AgentOutputRow>()
        .eq("run_id", run.id)
        .eq("phase", "consensus");
      if (!outputs || outputs.length === 0) continue;
      const ensemble = medianAggregate(
        outputs.map((o) => ({ bracket_probs: o.bracket_probs })),
        labels,
      );
      for (const l of labels) {
        pairs.push({ p: ensemble[l] ?? 0, o: l === winningLabel ? 1 : 0 });
      }
    }
  }
  return buildCalibrationMapping(pairs);
}
