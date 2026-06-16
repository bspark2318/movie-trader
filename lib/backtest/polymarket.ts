import { parseBracketLabel, sortBrackets } from "@/lib/polymarket/brackets";

/**
 * Real Polymarket data for a resolved opening-weekend market: the actual
 * brackets, and each bracket's last YES price BEFORE the release Friday — the
 * market's sharpest pre-release line. These box-office markets only appear a few
 * days out, so the "as-of" is typically T-3, not T-7.
 */
export interface HistoricalMarket {
  slug: string;
  asOfDate: string; // date of the price snapshot used (YYYY-MM-DD)
  brackets: { label: string; lo: number | null; hi: number | null }[];
  marketProbs: Record<string, number>; // normalized pre-release YES prices
}

interface GammaMarket {
  groupItemTitle?: string;
  question?: string;
  clobTokenIds?: string;
}

/** Find the opening-weekend box-office market slug for a film title, if any. */
export async function findOpeningWeekendSlug(
  title: string,
): Promise<string | null> {
  const url = `https://gamma-api.polymarket.com/public-search?q=${encodeURIComponent(
    `${title} opening weekend box office`,
  )}&limit_per_type=8&events_status=resolved`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const events: { slug?: string; title?: string }[] = data?.events ?? [];
  const match = events.find((e) =>
    /opening-weekend-box-office/.test(e.slug ?? ""),
  );
  return match?.slug ?? null;
}

async function lastPriceBefore(
  tokenId: string,
  cutoffTs: number,
): Promise<number | null> {
  const url = `https://clob.polymarket.com/prices-history?market=${tokenId}&interval=max&fidelity=720`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const history: { t: number; p: number }[] = data?.history ?? [];
  const before = history.filter((h) => h.t < cutoffTs);
  if (before.length === 0) return null;
  return before[before.length - 1].p; // latest point still before release
}

/** Fetch real brackets + pre-release prices for a film's market, or null. */
export async function fetchHistoricalMarket(
  title: string,
  releaseDateISO: string,
): Promise<HistoricalMarket | null> {
  const slug = await findOpeningWeekendSlug(title);
  if (!slug) return null;

  const evRes = await fetch(
    `https://gamma-api.polymarket.com/events?slug=${slug}`,
  );
  if (!evRes.ok) return null;
  const evData = await evRes.json();
  const ev = Array.isArray(evData) ? evData[0] : evData?.events?.[0];
  const markets: GammaMarket[] = ev?.markets ?? [];
  if (markets.length === 0) return null;

  const cutoffTs = Math.floor(Date.parse(`${releaseDateISO}T00:00:00Z`) / 1000);

  const parsed = [];
  for (const m of markets) {
    const label = (m.groupItemTitle ?? m.question ?? "").trim();
    let tokens: string[] = [];
    try {
      tokens = JSON.parse(m.clobTokenIds ?? "[]");
    } catch {
      /* skip */
    }
    if (!label || tokens.length === 0) continue;
    const { loMillions, hiMillions } = parseBracketLabel(label);
    const price = await lastPriceBefore(tokens[0], cutoffTs);
    parsed.push({ label, lo: loMillions, hi: hiMillions, price });
  }

  const withPrice = parsed.filter((p) => p.price !== null);
  if (withPrice.length < 2) return null; // not enough pre-release signal

  const sorted = sortBrackets(
    parsed.map((p) => ({ ...p, loMillions: p.lo })),
  );
  const labels = sorted.map((s) => s.label);

  // Normalize the pre-release YES prices into a distribution.
  const probs: Record<string, number> = {};
  let sum = 0;
  for (const s of sorted) {
    const v = Math.max(0, s.price ?? 0);
    probs[s.label] = v;
    sum += v;
  }
  for (const l of labels) probs[l] = sum > 0 ? probs[l] / sum : 1 / labels.length;

  // as-of date: use the day before release (markets price right up to it).
  const asOf = new Date(`${releaseDateISO}T00:00:00Z`);
  asOf.setUTCDate(asOf.getUTCDate() - 1);

  return {
    slug,
    asOfDate: asOf.toISOString().slice(0, 10),
    brackets: sorted.map((s) => ({ label: s.label, lo: s.lo, hi: s.hi })),
    marketProbs: probs,
  };
}
