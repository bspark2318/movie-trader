"use client";

import { useEffect, useState } from "react";

interface MovieMeta {
  id: string;
  title: string;
  releaseDateISO: string;
  actualOpeningM: number;
  note?: string;
}
interface Gate {
  candidateLabel: string | null;
  edgePts: number;
  agreementPts: number;
  emit: boolean;
  won: boolean | null;
  pnlPerShare: number | null;
}
interface Result {
  movie: { id: string; title: string; actualOpeningM: number };
  source: "real" | "approx";
  marketSlug: string | null;
  asOfDate: string;
  labels: string[];
  winningLabel: string;
  ensembleMedian: Record<string, number>;
  ensembleLogpool: Record<string, number>;
  marketProbs: Record<string, number> | null;
  brierMedian: number;
  brierLogpool: number;
  marketBrier: number | null;
  uniformBrier: number;
  gate: Gate;
  leakageFlags: number;
  costUsd: number;
}

const mean = (xs: number[]) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

export function BacktestBoard() {
  const [movies, setMovies] = useState<MovieMeta[]>([]);
  const [results, setResults] = useState<Record<string, Result>>({});
  const [running, setRunning] = useState<string | null>(null);
  const [runningAll, setRunningAll] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/backtest")
      .then((r) => r.json())
      .then((j) => j.ok && setMovies(j.movies))
      .catch(() => setError("Couldn't load the dataset."));
  }, []);

  async function runOne(id: string) {
    setRunning(id);
    setError("");
    try {
      const res = await fetch("/api/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ movieId: id }),
      });
      const j = await res.json();
      if (!j.ok) {
        setError(
          j.reason === "missing-agent-keys"
            ? `Missing API keys: ${(j.missing ?? []).join(", ")}`
            : "Run failed",
        );
        return false;
      }
      setResults((prev) => ({ ...prev, [id]: j.results[0] }));
      return true;
    } catch (e) {
      setError(String(e));
      return false;
    } finally {
      setRunning(null);
    }
  }

  async function runAll() {
    setRunningAll(true);
    for (const m of movies) {
      const ok = await runOne(m.id);
      if (!ok) break;
    }
    setRunningAll(false);
  }

  const done = Object.values(results);
  const medianMean = mean(done.map((r) => r.brierMedian));
  const logpoolMean = mean(done.map((r) => r.brierLogpool));
  const marketVals = done
    .map((r) => r.marketBrier)
    .filter((x): x is number => x !== null);
  const marketMean = mean(marketVals);
  const bets = done.filter((r) => r.gate.emit);
  const pnl = bets.reduce((a, r) => a + (r.gate.pnlPerShare ?? 0), 0);
  const best = Math.min(medianMean, logpoolMean);
  const beatsMarket = done.length > 0 && marketVals.length > 0 && best < marketMean;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={runAll}
          disabled={runningAll || running !== null}
          className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {runningAll ? "Running all…" : "Run all backtests"}
        </button>
        {done.length > 0 && (
          <span className="text-xs text-zinc-500">
            {done.length}/{movies.length} scored · $
            {done.reduce((a, r) => a + (r.costUsd ?? 0), 0).toFixed(2)} spent
          </span>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {done.length > 0 && (
        <div className="space-y-3 rounded-lg border border-zinc-200 p-4">
          <h2 className="text-sm font-semibold">
            Mean Brier across {done.length} film{done.length === 1 ? "" : "s"}{" "}
            <span className="font-normal text-zinc-400">(lower is better)</span>
          </h2>
          <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
            <Stat label="Median" value={medianMean} highlight={best === medianMean} />
            <Stat label="Log-pool" value={logpoolMean} highlight={best === logpoolMean} />
            <Stat label="Market" value={marketVals.length ? marketMean : null} />
            <Stat label="Uniform" value={mean(done.map((r) => r.uniformBrier))} />
          </div>
          {marketVals.length > 0 && (
            <p
              className={`rounded px-3 py-1.5 text-sm font-medium ${
                beatsMarket
                  ? "bg-emerald-50 text-emerald-800"
                  : "bg-amber-50 text-amber-800"
              }`}
            >
              {beatsMarket
                ? `Best ensemble beats market by ${(marketMean - best).toFixed(3)} Brier.`
                : `Best ensemble (${best.toFixed(3)}) does NOT beat market (${marketMean.toFixed(3)}). Valid finding.`}
            </p>
          )}
          <div className="rounded bg-zinc-50 px-3 py-2 text-sm">
            <span className="font-medium">Gate P&amp;L:</span> placed{" "}
            {bets.length} bet{bets.length === 1 ? "" : "s"}
            {bets.length > 0 && (
              <>
                {" "}
                ({bets.filter((r) => r.gate.won).length} won) ·{" "}
                <span
                  className={
                    pnl >= 0 ? "text-emerald-700" : "text-red-600"
                  }
                >
                  {pnl >= 0 ? "+" : ""}
                  {pnl.toFixed(2)} per $1 share
                </span>
              </>
            )}
          </div>
          <p className="text-[11px] text-zinc-400">
            Log-pool keeps tail conviction the median washes out. “Real” rows use
            actual Polymarket brackets + the last pre-release YES price; “approx”
            rows use a hand-set prior.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {movies.map((m) => {
          const r = results[m.id];
          const isRunning = running === m.id;
          return (
            <div key={m.id} className="rounded-lg border border-zinc-200 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <span className="font-medium">{m.title}</span>
                  <span className="ml-2 text-xs text-zinc-500">
                    opened to ${m.actualOpeningM}M
                  </span>
                  {r && (
                    <span
                      className={`ml-2 rounded px-1.5 py-0.5 text-[11px] ${
                        r.source === "real"
                          ? "bg-blue-50 text-blue-700"
                          : "bg-zinc-100 text-zinc-500"
                      }`}
                    >
                      {r.source === "real" ? "real market" : "approx"}
                    </span>
                  )}
                </div>
                {!r && (
                  <button
                    onClick={() => runOne(m.id)}
                    disabled={isRunning || runningAll}
                    className="rounded border border-zinc-300 px-2.5 py-1 text-xs font-medium hover:bg-zinc-50 disabled:opacity-50"
                  >
                    {isRunning ? "Running…" : "Run"}
                  </button>
                )}
              </div>
              {m.note && !r && (
                <p className="mt-1 text-xs text-zinc-400">{m.note}</p>
              )}
              {r && <ResultView r={r} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number | null;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded p-2 ${highlight ? "bg-emerald-50" : "bg-zinc-50"}`}>
      <div className="text-[11px] uppercase tracking-wide text-zinc-400">
        {label}
      </div>
      <div className="font-mono text-lg">
        {value === null ? "—" : value.toFixed(3)}
      </div>
    </div>
  );
}

function ResultView({ r }: { r: Result }) {
  return (
    <div className="mt-3 space-y-3">
      <div className="space-y-1">
        {r.labels.map((l) => {
          const win = l === r.winningLabel;
          const lp = r.ensembleLogpool[l] ?? 0;
          const md = r.ensembleMedian[l] ?? 0;
          const mk = r.marketProbs?.[l] ?? null;
          return (
            <div key={l} className="flex items-center gap-2 text-xs">
              <span
                className={`w-20 shrink-0 ${win ? "font-semibold text-emerald-700" : "text-zinc-500"}`}
              >
                {l}
                {win && " ✓"}
              </span>
              <div className="relative h-3 flex-1 rounded bg-zinc-100">
                <div
                  className={`absolute h-3 rounded ${win ? "bg-emerald-500" : "bg-blue-400/70"}`}
                  style={{ width: `${Math.min(lp, 1) * 100}%` }}
                />
                {mk !== null && (
                  <div
                    className="absolute top-0 h-3 w-0.5 bg-zinc-800"
                    style={{ left: `${Math.min(mk, 1) * 100}%` }}
                    title={`market ${Math.round(mk * 100)}%`}
                  />
                )}
              </div>
              <span className="w-24 shrink-0 text-right font-mono text-[11px] text-zinc-500">
                lp {Math.round(lp * 100)} · md {Math.round(md * 100)}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span>
          Brier log-pool{" "}
          <span className="font-mono font-medium">{r.brierLogpool.toFixed(3)}</span>{" "}
          · median{" "}
          <span className="font-mono">{r.brierMedian.toFixed(3)}</span>
        </span>
        {r.marketBrier !== null && (
          <span className="text-zinc-500">
            vs market <span className="font-mono">{r.marketBrier.toFixed(3)}</span>{" "}
            {Math.min(r.brierLogpool, r.brierMedian) < r.marketBrier ? (
              <span className="text-emerald-600">✓ beat</span>
            ) : (
              <span className="text-amber-600">✗ lost</span>
            )}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="text-zinc-400">
          actual in{" "}
          <span className="font-medium text-zinc-600">{r.winningLabel}</span> · as
          of {r.asOfDate}
        </span>
        {r.gate.candidateLabel && (
          <span
            className={`rounded px-1.5 py-0.5 ${
              r.gate.emit
                ? r.gate.won
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-red-50 text-red-600"
                : "bg-zinc-100 text-zinc-500"
            }`}
          >
            {r.gate.emit
              ? `BET ${r.gate.candidateLabel} (+${r.gate.edgePts}pts) → ${
                  r.gate.won ? "WON" : "LOST"
                } ${r.gate.pnlPerShare !== null ? `${r.gate.pnlPerShare >= 0 ? "+" : ""}${r.gate.pnlPerShare.toFixed(2)}` : ""}`
              : `no bet (edge ${r.gate.edgePts}pts, disagree ${r.gate.agreementPts}pts)`}
          </span>
        )}
        {r.leakageFlags > 0 && (
          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">
            ⚠ {r.leakageFlags}/9 recall the result
          </span>
        )}
      </div>
    </div>
  );
}
