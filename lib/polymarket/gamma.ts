import { z } from "zod";
import type { BoxOfficeEvent, Bracket, WeekendType } from "./types";
import { parseBracketLabel, sortBrackets } from "./brackets";

const GAMMA = "https://gamma-api.polymarket.com";
const BOX_OFFICE_RE = /opening weekend box office/i;

// Gamma encodes several array fields as JSON strings — parse defensively.
const jsonStringArray = z
  .union([z.string(), z.array(z.string())])
  .transform((v) => {
    if (Array.isArray(v)) return v;
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  });

const gammaMarketSchema = z.object({
  id: z.coerce.string(),
  question: z.string(),
  groupItemTitle: z.string().default(""),
  description: z.string().default(""),
  outcomes: jsonStringArray,
  outcomePrices: jsonStringArray,
  bestBid: z.coerce.number().default(0),
  bestAsk: z.coerce.number().default(0),
  spread: z.coerce.number().default(0),
  liquidityNum: z.coerce.number().default(0),
  volume24hr: z.coerce.number().default(0),
  endDate: z.string().default(""),
  clobTokenIds: jsonStringArray,
  closed: z.boolean().default(false),
  active: z.boolean().default(true),
});

const gammaEventSchema = z.object({
  id: z.coerce.string(),
  slug: z.string(),
  title: z.string(),
  description: z.string().default(""),
  endDate: z.string().default(""),
  liquidity: z.coerce.number().default(0),
  volume24hr: z.coerce.number().default(0),
  markets: z.array(gammaMarketSchema).default([]),
});

type GammaEvent = z.infer<typeof gammaEventSchema>;

function parseWeekendType(rules: string): WeekendType {
  if (/4[\s-]day/i.test(rules)) return "4-day";
  if (/3[\s-]day/i.test(rules)) return "3-day";
  return "unknown";
}

function parseWeekendDates(
  rules: string,
): { start: string; end: string } | null {
  // e.g. "3-day opening weekend (June 19 - June 21)"
  const m = rules.match(
    /\(([A-Z][a-z]+ \d{1,2})\s*[-–]\s*([A-Z][a-z]+ \d{1,2})\)/,
  );
  return m ? { start: m[1], end: m[2] } : null;
}

function parseMovieTitle(eventTitle: string): string {
  const quoted = eventTitle.match(/[“"]([^”"]+)[”"]/);
  if (quoted) return quoted[1];
  return eventTitle.replace(/opening weekend box office/i, "").trim();
}

function toBoxOfficeEvent(raw: unknown): BoxOfficeEvent | null {
  const parsed = gammaEventSchema.safeParse(raw);
  if (!parsed.success) return null;
  const e: GammaEvent = parsed.data;

  const openMarkets = e.markets.filter((m) => !m.closed && m.active);
  if (openMarkets.length === 0) return null;

  const brackets: Bracket[] = sortBrackets(
    openMarkets.map((m) => {
      const label = m.groupItemTitle || m.question;
      const { loMillions, hiMillions } = parseBracketLabel(label);
      const yesPrice = Number(m.outcomePrices[0] ?? 0);
      return {
        polymarketMarketId: m.id,
        label,
        loMillions,
        hiMillions,
        yesPrice,
        bestBid: m.bestBid,
        bestAsk: m.bestAsk,
        mid: (m.bestBid + m.bestAsk) / 2,
        spread: m.spread,
        liquidity: m.liquidityNum,
        volume24hr: m.volume24hr,
        clobTokenIds: m.clobTokenIds,
      };
    }),
  );

  const resolutionRules = openMarkets[0]?.description || e.description;

  return {
    polymarketEventId: e.id,
    slug: e.slug,
    title: e.title,
    movieTitle: parseMovieTitle(e.title),
    resolutionRules,
    endDate: e.endDate || openMarkets[0]?.endDate || "",
    weekendType: parseWeekendType(resolutionRules),
    weekendDates: parseWeekendDates(resolutionRules),
    liquidity: e.liquidity,
    volume24hr: e.volume24hr,
    brackets,
  };
}

async function gammaFetch(path: string): Promise<unknown> {
  const res = await fetch(`${GAMMA}${path}`, {
    next: { revalidate: 60 },
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Gamma ${path} → ${res.status}`);
  return res.json();
}

/**
 * Discover active box-office events. The events list endpoint caps at 100
 * per page and box-office markets rarely crack the top-100 by volume, so we
 * use the public-search endpoint and hydrate each hit by slug.
 */
export async function fetchBoxOfficeEvents(): Promise<BoxOfficeEvent[]> {
  const search = (await gammaFetch(
    `/public-search?q=${encodeURIComponent("opening weekend box office")}&events_status=active`,
  )) as { events?: { slug?: string; title?: string; closed?: boolean }[] };

  const slugs = (search.events ?? [])
    .filter((e) => e.slug && !e.closed && BOX_OFFICE_RE.test(e.title ?? ""))
    .map((e) => e.slug as string);

  const events = await Promise.all(slugs.map((slug) => fetchEventBySlug(slug)));
  return events
    .filter((e): e is BoxOfficeEvent => e !== null)
    .sort((a, b) => Date.parse(a.endDate) - Date.parse(b.endDate));
}

export async function fetchEventBySlug(
  slug: string,
): Promise<BoxOfficeEvent | null> {
  const data = (await gammaFetch(
    `/events?slug=${encodeURIComponent(slug)}`,
  )) as unknown[];
  if (!Array.isArray(data) || data.length === 0) return null;
  return toBoxOfficeEvent(data[0]);
}
