import { getSupabase } from "@/lib/db/client";
import type { ScoreRow } from "@/lib/db/types";

/**
 * Self-improvement activates only once enough markets have resolved — below
 * this, "learning" is just fitting noise, so every lever falls back to the
 * static default. This is the guard that keeps the system honest.
 */
export const MIN_SAMPLE = 15;

export async function resolvedMarketCount(): Promise<number> {
  const db = getSupabase();
  if (!db) return 0;
  const { count } = await db
    .from("resolutions")
    .select("*", { count: "exact", head: true });
  return count ?? 0;
}

export async function learningActive(): Promise<boolean> {
  return (await resolvedMarketCount()) >= MIN_SAMPLE;
}

/**
 * Inverse-Brier weights, normalized: a seat that has forecast well (low Brier)
 * gets more say. eps stops a single great run from dominating.
 */
export function brierToWeights(briers: number[]): number[] {
  const eps = 0.05;
  const raw = briers.map((b) => 1 / (Math.max(0, b) + eps));
  const sum = raw.reduce((a, b) => a + b, 0);
  return sum > 0 ? raw.map((r) => r / sum) : briers.map(() => 1 / briers.length);
}

/** Mean historical Brier per `${agent}:${model}` seat, from the scores table. */
export async function loadSeatBriers(): Promise<Map<string, number>> {
  const db = getSupabase();
  if (!db) return new Map();
  const { data } = await db.from("scores").select<"*", ScoreRow>();
  const acc = new Map<string, { sum: number; n: number }>();
  for (const s of data ?? []) {
    const key = `${s.agent}:${s.model}`;
    const cur = acc.get(key) ?? { sum: 0, n: 0 };
    cur.sum += Number(s.brier);
    cur.n += 1;
    acc.set(key, cur);
  }
  const out = new Map<string, number>();
  for (const [k, v] of acc) out.set(k, v.sum / v.n);
  return out;
}
