import { getSupabase } from "./client";
import type { BracketRow, MarketRow } from "./types";
import type { BoxOfficeEvent } from "@/lib/polymarket/types";

/**
 * Upsert a market + its brackets from a live Gamma event.
 * Idempotent on markets(polymarket_event_id) and brackets(market_id, label).
 * Returns null in no-DB mode.
 */
export async function upsertMarketWithBrackets(
  ev: BoxOfficeEvent,
): Promise<{ marketId: string; bracketIds: Map<string, string> } | null> {
  const db = getSupabase();
  if (!db) return null;

  const { data: market, error: mErr } = await db
    .from("markets")
    .upsert(
      {
        polymarket_event_id: ev.polymarketEventId,
        slug: ev.slug,
        title: ev.title,
        movie_title: ev.movieTitle,
        resolution_rules: ev.resolutionRules,
        end_date: ev.endDate || null,
        weekend_type: ev.weekendType,
      },
      { onConflict: "polymarket_event_id" },
    )
    .select()
    .single<MarketRow>();
  if (mErr) throw new Error(`upsert market ${ev.slug}: ${mErr.message}`);

  const { data: brackets, error: bErr } = await db
    .from("brackets")
    .upsert(
      ev.brackets.map((b) => ({
        market_id: market.id,
        polymarket_market_id: b.polymarketMarketId,
        label: b.label,
        lo_millions: b.loMillions,
        hi_millions: b.hiMillions,
        clob_token_ids: JSON.stringify(b.clobTokenIds),
      })),
      { onConflict: "market_id,label" },
    )
    .select<"*", BracketRow>();
  if (bErr) throw new Error(`upsert brackets ${ev.slug}: ${bErr.message}`);

  const bracketIds = new Map<string, string>(
    (brackets ?? []).map((b) => [b.label, b.id]),
  );
  return { marketId: market.id, bracketIds };
}

export async function insertPriceSnapshots(
  ev: BoxOfficeEvent,
  bracketIds: Map<string, string>,
): Promise<void> {
  const db = getSupabase();
  if (!db) return;

  const rows = ev.brackets
    .filter((b) => bracketIds.has(b.label))
    .map((b) => ({
      bracket_id: bracketIds.get(b.label)!,
      best_bid: b.bestBid,
      best_ask: b.bestAsk,
      mid: b.mid,
      volume24hr: b.volume24hr,
      liquidity: b.liquidity,
    }));

  const { error } = await db.from("price_snapshots").insert(rows);
  if (error) throw new Error(`insert snapshots ${ev.slug}: ${error.message}`);
}

export async function getMarketBySlug(slug: string): Promise<MarketRow | null> {
  const db = getSupabase();
  if (!db) return null;
  const { data } = await db
    .from("markets")
    .select()
    .eq("slug", slug)
    .maybeSingle<MarketRow>();
  return data ?? null;
}

export async function listBrackets(marketId: string): Promise<BracketRow[]> {
  const db = getSupabase();
  if (!db) return [];
  const { data } = await db
    .from("brackets")
    .select<"*", BracketRow>()
    .eq("market_id", marketId);
  return data ?? [];
}
