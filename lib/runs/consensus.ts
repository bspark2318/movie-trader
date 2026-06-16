import { renormalize } from "@/lib/agents/schema";
import type { AgentOutput } from "@/lib/agents/types";

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Per-bracket median across several distributions, then renormalized.
 * Robust to one agent going rogue.
 */
export function medianAggregate(
  outputs: { bracket_probs: Record<string, number> }[],
  labels: string[],
): Record<string, number> {
  const raw: Record<string, number> = {};
  for (const label of labels) {
    raw[label] = median(outputs.map((o) => o.bracket_probs[label] ?? 0));
  }
  return renormalize(raw, labels);
}

/**
 * Weighted logarithmic opinion pool (geometric mean), renormalized. Unlike the
 * median, this keeps tail conviction instead of regressing to the middle — if a
 * couple of forecasters put real mass on a long-shot bracket, the pool reflects
 * it. Each prob is floored to avoid one zero annihilating a bracket. Weights let
 * higher-confidence cells count more.
 */
export function logPoolAggregate(
  outputs: { bracket_probs: Record<string, number>; weight?: number }[],
  labels: string[],
): Record<string, number> {
  const EPS = 1e-4;
  const raw: Record<string, number> = {};
  let totalW = 0;
  for (const o of outputs) totalW += o.weight ?? 1;
  if (totalW <= 0 || outputs.length === 0) return renormalize({}, labels);

  for (const label of labels) {
    let logSum = 0;
    for (const o of outputs) {
      const w = o.weight ?? 1;
      const p = Math.max(EPS, o.bracket_probs[label] ?? 0);
      logSum += w * Math.log(p);
    }
    raw[label] = Math.exp(logSum / totalW);
  }
  return renormalize(raw, labels);
}

/** Largest pairwise gap between any two distributions on a given bracket (in prob points 0..1). */
export function maxPairwiseDisagreement(
  outputs: AgentOutput[],
  label: string,
): number {
  const vals = outputs.map((o) => o.bracket_probs[label] ?? 0);
  if (vals.length < 2) return 0;
  return Math.max(...vals) - Math.min(...vals);
}

/** The bracket with the highest ensemble probability. */
export function topBracket(
  ensemble: Record<string, number>,
): { label: string; prob: number } {
  let best = { label: "", prob: -1 };
  for (const [label, prob] of Object.entries(ensemble)) {
    if (prob > best.prob) best = { label, prob };
  }
  return best;
}
