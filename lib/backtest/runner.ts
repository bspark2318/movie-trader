import { matrixModels } from "@/lib/config";
import { METHODS } from "@/lib/agents/types";
import { SYSTEM_PROMPTS } from "@/lib/agents/prompts";
import { runCell } from "@/lib/agents/runner";
import { extractJson } from "@/lib/agents/schema";
import {
  medianAggregate,
  logPoolAggregate,
  maxPairwiseDisagreement,
} from "@/lib/runs/consensus";
import { brierScore, marketImpliedProbs } from "@/lib/scoring/brier";
import { wikipediaAsOf } from "./wikipedia";
import { fetchHistoricalMarket } from "./polymarket";
import { buildBacktestBrief, BACKTEST_ADDENDUM } from "./prompts";
import {
  winningBracketLabel,
  type BacktestBracket,
  type BacktestCell,
  type BacktestGate,
  type BacktestMovie,
  type BacktestResult,
} from "./types";

const AGREEMENT_MAX = 0.05;
const EDGE_MIN = 0.08;
const CONF_WEIGHT: Record<string, number> = { low: 1, medium: 2, high: 3 };

function minusDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
function uniform(labels: string[]): Record<string, number> {
  const u = 1 / labels.length;
  return Object.fromEntries(labels.map((l) => [l, u]));
}

export async function runBacktestMovie(
  movie: BacktestMovie,
): Promise<BacktestResult> {
  // Prefer the REAL Polymarket market (real brackets + real pre-release price).
  const real = await fetchHistoricalMarket(movie.title, movie.releaseDateISO);

  const source: "real" | "approx" = real ? "real" : "approx";
  const brackets: BacktestBracket[] = real ? real.brackets : movie.brackets;
  const labels = brackets.map((b) => b.label);
  const asOfDate = real ? real.asOfDate : minusDays(movie.releaseDateISO, 7);
  const marketProbs: Record<string, number> | null = real
    ? real.marketProbs
    : movie.approxMarketPrior
      ? marketImpliedProbs(movie.approxMarketPrior, labels)
      : null;

  const wiki = await wikipediaAsOf(movie.wikiTitle, asOfDate);
  const prompt = buildBacktestBrief(
    { ...movie, brackets },
    asOfDate,
    wiki?.timestamp ?? null,
    wiki?.text ?? null,
  );
  const seats = matrixModels();

  const tasks = METHODS.flatMap((method) =>
    seats.map((seat) => ({ method, ...seat })),
  );
  const settled = await Promise.allSettled(
    tasks.map(async (t): Promise<BacktestCell> => {
      const { output, raw, costUsd } = await runCell({
        provider: t.provider,
        modelId: t.modelId,
        system: SYSTEM_PROMPTS[t.method] + BACKTEST_ADDENDUM,
        prompt,
        labels,
        webSearch: false,
      });
      const parsed = extractJson(raw) as { leakage_self_report?: string } | null;
      return {
        method: t.method,
        provider: t.provider,
        probs: output.bracket_probs,
        confidence: output.confidence,
        leakage: parsed?.leakage_self_report ?? "none",
        costUsd,
      };
    }),
  );
  const cells: BacktestCell[] = settled.map((s, i) =>
    s.status === "fulfilled"
      ? s.value
      : {
          method: tasks[i].method,
          provider: tasks[i].provider,
          probs: {},
          confidence: "low",
          leakage: "none",
          costUsd: 0,
          error: String((s as PromiseRejectedResult).reason),
        },
  );
  const good = cells.filter((c) => !c.error);

  // Two aggregations from the SAME cells: median vs confidence-weighted log-pool.
  const ensembleMedian = good.length
    ? medianAggregate(
        good.map((c) => ({ bracket_probs: c.probs })),
        labels,
      )
    : uniform(labels);
  const ensembleLogpool = good.length
    ? logPoolAggregate(
        good.map((c) => ({
          bracket_probs: c.probs,
          weight: CONF_WEIGHT[c.confidence] ?? 1,
        })),
        labels,
      )
    : uniform(labels);

  const winningLabel = winningBracketLabel(brackets, movie.actualOpeningM);
  const brierMedian = brierScore(ensembleMedian, labels, winningLabel);
  const brierLogpool = brierScore(ensembleLogpool, labels, winningLabel);
  const uniformBrier = brierScore(uniform(labels), labels, winningLabel);
  const marketBrier = marketProbs
    ? brierScore(marketProbs, labels, winningLabel)
    : null;

  const gate = evaluateBacktestGate(
    ensembleLogpool,
    marketProbs,
    good.map((c) => ({ bracket_probs: c.probs })),
    labels,
    winningLabel,
  );

  return {
    movie,
    source,
    marketSlug: real?.slug ?? null,
    asOfDate,
    wikiTimestamp: wiki?.timestamp ?? null,
    labels,
    brackets,
    winningLabel,
    cells,
    ensembleMedian,
    ensembleLogpool,
    marketProbs,
    brierMedian,
    brierLogpool,
    marketBrier,
    uniformBrier,
    gate,
    leakageFlags: cells.filter((c) => c.leakage !== "none").length,
    costUsd: cells.reduce((a, c) => a + c.costUsd, 0),
  };
}

/**
 * Simplified gate for the backtest: pick the bracket with the biggest positive
 * edge of the (log-pool) ensemble over the market price; require agreement
 * across cells and a min edge; then check whether that bracket actually won and
 * what a $1 YES share would have returned.
 */
function evaluateBacktestGate(
  ensemble: Record<string, number>,
  marketProbs: Record<string, number> | null,
  cellOutputs: { bracket_probs: Record<string, number> }[],
  labels: string[],
  winningLabel: string,
): BacktestGate {
  if (!marketProbs) {
    return {
      candidateLabel: null,
      edgePts: 0,
      agreementPts: 0,
      emit: false,
      won: null,
      pnlPerShare: null,
    };
  }
  let best = { label: "", edge: -Infinity };
  for (const l of labels) {
    const edge = (ensemble[l] ?? 0) - (marketProbs[l] ?? 0);
    if (edge > best.edge) best = { label: l, edge };
  }
  const disagreement = maxPairwiseDisagreement(
    cellOutputs.map((o) => ({
      bracket_probs: o.bracket_probs,
      confidence: "low" as const,
      key_evidence: [],
      what_would_change_my_mind: "",
    })),
    best.label,
  );
  const emit = best.edge >= EDGE_MIN && disagreement <= AGREEMENT_MAX;
  const price = marketProbs[best.label] ?? 0;
  const won = best.label === winningLabel;
  return {
    candidateLabel: best.label,
    edgePts: Math.round(best.edge * 100),
    agreementPts: Math.round(disagreement * 100),
    emit,
    won: emit ? won : null,
    pnlPerShare: emit ? (won ? 1 - price : -price) : null,
  };
}
