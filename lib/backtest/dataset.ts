import type { BacktestMovie } from "./types";

/**
 * Resolved films with known 3-day domestic openings. Brackets are set roughly
 * around the pre-release tracking consensus, so the backtest implicitly asks:
 * does the ensemble beat where the market/tracking sat? `approxMarketPrior` is a
 * HAND-SET illustration of that consensus (not real Polymarket prices) — several
 * of these films genuinely shocked tracking (Inside Out 2, Minecraft up; Mufasa
 * down), which is exactly what makes them a useful test.
 */
export const BACKTEST_MOVIES: BacktestMovie[] = [
  {
    id: "inside-out-2",
    title: "Inside Out 2",
    wikiTitle: "Inside Out 2",
    releaseDateISO: "2024-06-14",
    weekendType: "3-day",
    actualOpeningM: 154.2,
    brackets: [
      { label: "<90m", lo: null, hi: 90 },
      { label: "90-110m", lo: 90, hi: 110 },
      { label: "110-130m", lo: 110, hi: 130 },
      { label: "130-150m", lo: 130, hi: 150 },
      { label: ">150m", lo: 150, hi: null },
    ],
    approxMarketPrior: {
      "<90m": 0.12,
      "90-110m": 0.34,
      "110-130m": 0.3,
      "130-150m": 0.17,
      ">150m": 0.07,
    },
    note: "Tracking massively underestimated; opened to $154M.",
  },
  {
    id: "deadpool-wolverine",
    title: "Deadpool & Wolverine",
    wikiTitle: "Deadpool & Wolverine",
    releaseDateISO: "2024-07-26",
    weekendType: "3-day",
    actualOpeningM: 211.4,
    brackets: [
      { label: "<150m", lo: null, hi: 150 },
      { label: "150-175m", lo: 150, hi: 175 },
      { label: "175-200m", lo: 175, hi: 200 },
      { label: "200-225m", lo: 200, hi: 225 },
      { label: ">225m", lo: 225, hi: null },
    ],
    approxMarketPrior: {
      "<150m": 0.1,
      "150-175m": 0.3,
      "175-200m": 0.33,
      "200-225m": 0.19,
      ">225m": 0.08,
    },
    note: "Strong tracking (~$160-170M); beat it to $211M.",
  },
  {
    id: "wicked-2024",
    title: "Wicked",
    wikiTitle: "Wicked (2024 film)",
    releaseDateISO: "2024-11-22",
    weekendType: "3-day",
    actualOpeningM: 112.5,
    brackets: [
      { label: "<85m", lo: null, hi: 85 },
      { label: "85-100m", lo: 85, hi: 100 },
      { label: "100-115m", lo: 100, hi: 115 },
      { label: "115-130m", lo: 115, hi: 130 },
      { label: ">130m", lo: 130, hi: null },
    ],
    approxMarketPrior: {
      "<85m": 0.15,
      "85-100m": 0.36,
      "100-115m": 0.3,
      "115-130m": 0.13,
      ">130m": 0.06,
    },
    note: "Opened above most tracking to $112.5M.",
  },
  {
    id: "mufasa",
    title: "Mufasa: The Lion King",
    wikiTitle: "Mufasa: The Lion King",
    releaseDateISO: "2024-12-20",
    weekendType: "3-day",
    actualOpeningM: 35.4,
    brackets: [
      { label: "<40m", lo: null, hi: 40 },
      { label: "40-50m", lo: 40, hi: 50 },
      { label: "50-60m", lo: 50, hi: 60 },
      { label: "60-70m", lo: 60, hi: 70 },
      { label: ">70m", lo: 70, hi: null },
    ],
    approxMarketPrior: {
      "<40m": 0.14,
      "40-50m": 0.34,
      "50-60m": 0.3,
      "60-70m": 0.15,
      ">70m": 0.07,
    },
    note: "Underperformed tracking; opened to just $35M.",
  },
  {
    id: "minecraft-movie",
    title: "A Minecraft Movie",
    wikiTitle: "A Minecraft Movie",
    releaseDateISO: "2025-04-04",
    weekendType: "3-day",
    actualOpeningM: 162.8,
    brackets: [
      { label: "<90m", lo: null, hi: 90 },
      { label: "90-110m", lo: 90, hi: 110 },
      { label: "110-130m", lo: 110, hi: 130 },
      { label: "130-150m", lo: 130, hi: 150 },
      { label: ">150m", lo: 150, hi: null },
    ],
    approxMarketPrior: {
      "<90m": 0.2,
      "90-110m": 0.38,
      "110-130m": 0.26,
      "130-150m": 0.11,
      ">150m": 0.05,
    },
    note: "Tracking ~$80-90M; shocked to $163M.",
  },
  {
    id: "captain-america-bnw",
    title: "Captain America: Brave New World",
    wikiTitle: "Captain America: Brave New World",
    releaseDateISO: "2025-02-14",
    weekendType: "3-day",
    actualOpeningM: 88.5,
    brackets: [
      { label: "<80m", lo: null, hi: 80 },
      { label: "80-95m", lo: 80, hi: 95 },
      { label: "95-110m", lo: 95, hi: 110 },
      { label: "110-125m", lo: 110, hi: 125 },
      { label: ">125m", lo: 125, hi: null },
    ],
    approxMarketPrior: {
      "<80m": 0.16,
      "80-95m": 0.37,
      "95-110m": 0.29,
      "110-125m": 0.12,
      ">125m": 0.06,
    },
    note: "Landed near the low end of tracking at $88.5M.",
  },
];

export function getBacktestMovie(id: string): BacktestMovie | undefined {
  return BACKTEST_MOVIES.find((m) => m.id === id);
}
