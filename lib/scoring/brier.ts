/**
 * Multi-category Brier score for a single market resolution.
 * The brackets are mutually exclusive; the outcome is one-hot on the winner.
 * Brier = Σ_k (p_k − o_k)²  over all brackets (range 0..2; lower is better).
 */
export function brierScore(
  probs: Record<string, number>,
  labels: string[],
  winningLabel: string,
): number {
  let s = 0;
  for (const label of labels) {
    const p = probs[label] ?? 0;
    const o = label === winningLabel ? 1 : 0;
    s += (p - o) ** 2;
  }
  return s;
}

/**
 * Market-implied probabilities from a price snapshot (per-bracket YES mid),
 * renormalized to sum to 1 — the benchmark our ensemble must beat.
 */
export function marketImpliedProbs(
  mids: Record<string, number>,
  labels: string[],
): Record<string, number> {
  const out: Record<string, number> = {};
  let sum = 0;
  for (const label of labels) {
    const v = Math.max(0, mids[label] ?? 0);
    out[label] = v;
    sum += v;
  }
  if (sum <= 0) {
    const u = 1 / labels.length;
    for (const label of labels) out[label] = u;
    return out;
  }
  for (const label of labels) out[label] /= sum;
  return out;
}
