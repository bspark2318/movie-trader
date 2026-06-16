export interface BacktestBracket {
  label: string;
  lo: number | null; // $M, inclusive (null = open low)
  hi: number | null; // $M, exclusive (null = open high)
}

export interface BacktestMovie {
  id: string;
  title: string;
  wikiTitle: string; // exact Wikipedia article title
  releaseDateISO: string; // YYYY-MM-DD (Friday of opening)
  weekendType: "3-day" | "4-day";
  brackets: BacktestBracket[];
  actualOpeningM: number; // actual 3-day domestic opening, $M
  /** Illustrative pre-release tracking consensus (hand-set, NOT real market prices). */
  approxMarketPrior?: Record<string, number>;
  note?: string;
}

export interface BacktestCell {
  method: string;
  provider: string;
  probs: Record<string, number>;
  confidence: string;
  leakage: string; // self-reported: none | suspected | known
  costUsd: number;
  error?: string;
}

export interface BacktestGate {
  candidateLabel: string | null;
  edgePts: number;
  agreementPts: number;
  emit: boolean;
  won: boolean | null; // did the candidate bracket actually win?
  pnlPerShare: number | null; // realized if emit: won ? 1-price : -price
}

export interface BacktestResult {
  movie: BacktestMovie;
  source: "real" | "approx"; // real Polymarket market vs hand-set approximation
  marketSlug: string | null;
  asOfDate: string;
  wikiTimestamp: string | null;
  labels: string[];
  brackets: BacktestBracket[]; // the brackets actually used (real or dataset)
  winningLabel: string;
  cells: BacktestCell[];
  ensembleMedian: Record<string, number>;
  ensembleLogpool: Record<string, number>;
  marketProbs: Record<string, number> | null;
  brierMedian: number;
  brierLogpool: number;
  marketBrier: number | null;
  uniformBrier: number;
  gate: BacktestGate;
  leakageFlags: number; // how many cells self-reported suspected/known
  costUsd: number;
}

/** Bracket the actual gross falls into: lo-inclusive, hi-exclusive (tie → higher). */
export function winningBracketLabel(
  brackets: BacktestBracket[],
  actualM: number,
): string {
  for (const b of brackets) {
    const aboveLo = b.lo === null || actualM >= b.lo;
    const belowHi = b.hi === null || actualM < b.hi;
    if (aboveLo && belowHi) return b.label;
  }
  return brackets[brackets.length - 1]?.label ?? "";
}
