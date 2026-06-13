import { weekendActuals } from "@/lib/thenumbers/comps";
import { winningBracket } from "@/lib/polymarket/brackets";
import type { MarketRow, BracketRow } from "@/lib/db/types";

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** The Friday of the opening weekend from market end date (the ~Sunday). */
function openingFriday(endDateIso: string): string {
  const d = new Date(endDateIso);
  // endDate is typically the Monday after; step back to the Friday.
  const dow = d.getUTCDay();
  const back = (dow - 5 + 7) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

export interface ResolveResult {
  finalGrossMillions: number;
  winningLabel: string | null;
}

/**
 * Resolve a market from FINAL The Numbers figures.
 * Only trusts charts at least `minSettleDays` past the weekend (Sunday studio
 * estimates revise $1–2M Mon/Tue — we wait for finals). Tie → HIGHER bracket
 * (handled by winningBracket's lo-inclusive/hi-exclusive intervals).
 * Returns null if it's too early to settle or the title can't be matched.
 */
export async function resolveMarket(
  market: MarketRow,
  brackets: BracketRow[],
  minSettleDays = 10,
): Promise<ResolveResult | null> {
  if (!market.end_date) return null;
  const daysSince =
    (Date.now() - Date.parse(market.end_date)) / 86_400_000;
  if (daysSince < minSettleDays) return null; // not final yet

  const friday = openingFriday(market.end_date);
  const actuals = await weekendActuals(friday);

  const wantKey = norm(market.movie_title);
  const match = Object.entries(actuals.threeDayTotalByTitle).find(
    ([title]) => norm(title) === wantKey || norm(title).includes(wantKey),
  );
  if (!match) return null;

  const finalGrossMillions = match[1] / 1e6;
  const winningLabel = winningBracket(
    finalGrossMillions,
    brackets.map((b) => ({
      label: b.label,
      loMillions: b.lo_millions,
      hiMillions: b.hi_millions,
    })),
  );

  return { finalGrossMillions, winningLabel };
}
