import { getSupabase } from "@/lib/db/client";
import { env } from "@/lib/config";
import { quarterKelly } from "@/lib/sizing/kelly";
import type {
  RecommendationRow,
  BracketRow,
  MarketRow,
  PriceSnapshotRow,
} from "@/lib/db/types";

export interface PaperPosition {
  id: string;
  marketTitle: string;
  slug: string;
  bracketLabel: string;
  side: string;
  entryPrice: number; // exec price, $/share
  ensembleProb: number;
  edgePts: number;
  gatePassed: boolean;
  kellyFraction: number;
  stake: number; // $ staked (flat ¼-Kelly on starting bankroll)
  shares: number;
  status: "open" | "won" | "lost";
  mark: number | null; // latest market price for open positions
  pnl: number; // realized (closed) or unrealized (open mark-to-market)
  createdAt: string;
}

export interface PnlBreakdown {
  realizedPnl: number;
  won: number;
  lost: number;
  open: number;
}

export interface PaperPortfolio {
  startingBankroll: number;
  realizedPnl: number;
  unrealizedPnl: number;
  equity: number; // starting + realized + unrealized
  returnPct: number;
  counts: { open: number; won: number; lost: number };
  /** Subset that also cleared the strict gate — the experiment: does the gate help? */
  gateOnly: PnlBreakdown;
  positions: PaperPosition[];
}

/**
 * Build the paper-trade portfolio from logged recommendations. Each emitted bet
 * is staked flat ¼-Kelly on the STARTING bankroll (no compounding, so order
 * doesn't matter), settled won/lost on resolution, and marked-to-market while
 * open. Paper only — no real capital is ever deployed.
 */
export async function buildPaperPortfolio(): Promise<PaperPortfolio | null> {
  const db = getSupabase();
  if (!db) return null;
  const bankroll = env().PAPER_BANKROLL;

  const { data: recs } = await db
    .from("recommendations")
    .select<"*", RecommendationRow>()
    .order("created_at", { ascending: true });

  const list = recs ?? [];
  if (list.length === 0) {
    return {
      startingBankroll: bankroll,
      realizedPnl: 0,
      unrealizedPnl: 0,
      equity: bankroll,
      returnPct: 0,
      counts: { open: 0, won: 0, lost: 0 },
      gateOnly: { realizedPnl: 0, won: 0, lost: 0, open: 0 },
      positions: [],
    };
  }

  const bracketIds = [...new Set(list.map((r) => r.bracket_id))];
  const { data: brackets } = await db
    .from("brackets")
    .select<"*", BracketRow>()
    .in("id", bracketIds);
  const bracketById = new Map((brackets ?? []).map((b) => [b.id, b]));

  const marketIds = [...new Set((brackets ?? []).map((b) => b.market_id))];
  const { data: markets } = await db
    .from("markets")
    .select<"*", MarketRow>()
    .in("id", marketIds);
  const marketById = new Map((markets ?? []).map((m) => [m.id, m]));

  // Latest mark for open positions.
  async function latestMid(bracketId: string): Promise<number | null> {
    const { data } = await db!
      .from("price_snapshots")
      .select<"*", PriceSnapshotRow>()
      .eq("bracket_id", bracketId)
      .order("snapped_at", { ascending: false })
      .limit(1)
      .maybeSingle<PriceSnapshotRow>();
    return data?.mid ?? null;
  }

  const positions: PaperPosition[] = [];
  let realizedPnl = 0;
  let unrealizedPnl = 0;
  const counts = { open: 0, won: 0, lost: 0 };
  const gateOnly: PnlBreakdown = { realizedPnl: 0, won: 0, lost: 0, open: 0 };

  for (const r of list) {
    const bracket = bracketById.get(r.bracket_id);
    const market = bracket ? marketById.get(bracket.market_id) : undefined;
    const gate = (r.gate_results ?? {}) as { quarterKellyFraction?: number };
    const f =
      gate.quarterKellyFraction ??
      quarterKelly(r.ensemble_prob, r.exec_price);
    const stake = Math.max(0, f) * bankroll;
    const shares = r.exec_price > 0 ? stake / r.exec_price : 0;

    const passed = r.gate_passed ?? true;
    let pnl = 0;
    let mark: number | null = null;
    if (r.status === "won") {
      pnl = shares * (1 - r.exec_price);
      realizedPnl += pnl;
      counts.won++;
      if (passed) {
        gateOnly.realizedPnl += pnl;
        gateOnly.won++;
      }
    } else if (r.status === "lost") {
      pnl = -stake;
      realizedPnl += pnl;
      counts.lost++;
      if (passed) {
        gateOnly.realizedPnl += pnl;
        gateOnly.lost++;
      }
    } else {
      mark = await latestMid(r.bracket_id);
      pnl = mark !== null ? shares * (mark - r.exec_price) : 0;
      unrealizedPnl += pnl;
      counts.open++;
      if (passed) gateOnly.open++;
    }

    positions.push({
      id: r.id,
      marketTitle: market?.movie_title || market?.title || "—",
      slug: market?.slug ?? "",
      bracketLabel: bracket?.label ?? "—",
      side: r.side,
      entryPrice: r.exec_price,
      ensembleProb: r.ensemble_prob,
      edgePts: r.edge_pts,
      gatePassed: r.gate_passed ?? true,
      kellyFraction: f,
      stake,
      shares,
      status: r.status,
      mark,
      pnl,
      createdAt: r.created_at,
    });
  }

  // Newest first for display.
  positions.reverse();
  const equity = bankroll + realizedPnl + unrealizedPnl;
  return {
    startingBankroll: bankroll,
    realizedPnl,
    unrealizedPnl,
    equity,
    returnPct: (equity / bankroll - 1) * 100,
    counts,
    gateOnly,
    positions,
  };
}
