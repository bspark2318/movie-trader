import { NextRequest, NextResponse } from "next/server";
import { missingProviderKeys } from "@/lib/config";
import { BACKTEST_MOVIES, getBacktestMovie } from "@/lib/backtest/dataset";
import { runBacktestMovie } from "@/lib/backtest/runner";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

export function GET() {
  return NextResponse.json({
    ok: true,
    movies: BACKTEST_MOVIES.map((m) => ({
      id: m.id,
      title: m.title,
      releaseDateISO: m.releaseDateISO,
      actualOpeningM: m.actualOpeningM,
      labels: m.brackets.map((b) => b.label),
      note: m.note,
    })),
  });
}

export async function POST(req: NextRequest) {
  const missing = missingProviderKeys();
  if (missing.length > 0) {
    return NextResponse.json(
      { ok: false, reason: "missing-agent-keys", missing },
      { status: 503 },
    );
  }

  let movieId: string | undefined;
  try {
    movieId = (await req.json())?.movieId;
  } catch {
    /* run all */
  }

  const movies = movieId
    ? [getBacktestMovie(movieId)].filter(Boolean)
    : BACKTEST_MOVIES;
  if (movies.length === 0) {
    return NextResponse.json({ ok: false, reason: "unknown-movie" }, { status: 404 });
  }

  const results = [];
  for (const m of movies) {
    if (!m) continue;
    results.push(await runBacktestMovie(m));
  }

  // Aggregate skill: mean Brier per aggregation vs baselines (lower is better),
  // plus the gate's realized P&L on the bets it would have placed.
  const n = results.length;
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
  const marketVals = results
    .map((r) => r.marketBrier)
    .filter((x): x is number => x !== null);
  const bets = results.filter((r) => r.gate.emit);
  const summary = {
    n,
    brierMedian: mean(results.map((r) => r.brierMedian)),
    brierLogpool: mean(results.map((r) => r.brierLogpool)),
    marketBrier: marketVals.length === n ? mean(marketVals) : null,
    uniformBrier: mean(results.map((r) => r.uniformBrier)),
    bets: bets.length,
    betsWon: bets.filter((r) => r.gate.won).length,
    pnlPerShare: bets.reduce((a, r) => a + (r.gate.pnlPerShare ?? 0), 0),
    costUsd: results.reduce((a, r) => a + r.costUsd, 0),
  };

  return NextResponse.json({ ok: true, summary, results });
}
