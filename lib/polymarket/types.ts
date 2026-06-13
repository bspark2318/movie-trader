export interface Bracket {
  /** Polymarket market id for this bracket (each bracket is its own Yes/No market). */
  polymarketMarketId: string;
  /** e.g. "<145m", "145-158m", ">184m" (Gamma groupItemTitle) */
  label: string;
  /** null = open-ended low ("<145m") */
  loMillions: number | null;
  /** null = open-ended high (">184m") */
  hiMillions: number | null;
  /** Price of the YES outcome, 0..1 */
  yesPrice: number;
  bestBid: number;
  bestAsk: number;
  mid: number;
  spread: number;
  liquidity: number;
  volume24hr: number;
  clobTokenIds: string[];
}

export type WeekendType = "3-day" | "4-day" | "unknown";

export interface BoxOfficeEvent {
  polymarketEventId: string;
  slug: string;
  title: string;
  /** Movie title extracted from the event title's quotes, e.g. `Toy Story 5` */
  movieTitle: string;
  /** Market description verbatim — contains the resolution rules. */
  resolutionRules: string;
  endDate: string; // ISO
  weekendType: WeekendType;
  /** Opening weekend dates parsed from the resolution rules, when present. */
  weekendDates: { start: string; end: string } | null;
  liquidity: number;
  volume24hr: number;
  brackets: Bracket[];
}
