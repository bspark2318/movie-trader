"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getBrowserSupabase } from "@/lib/db/browser";

const METHOD_LABELS: Record<string, string> = {
  comps_quant: "Comps",
  tracking_interpreter: "Tracking",
  demand_signals: "Demand",
  consensus: "Consensus",
};
const PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Claude",
  openai: "GPT",
  google: "Gemini",
};
const METHODS = ["comps_quant", "tracking_interpreter", "demand_signals"];

interface CellView {
  method: string;
  provider: string;
  done: boolean;
  confidence?: string;
  probs?: Record<string, number>;
  top?: { label: string; pct: number } | null;
  evidence?: string[];
}
interface GateResult {
  emit: boolean;
  candidate: {
    bracketLabel: string;
    execPrice: number;
    ensembleProb: number;
    edgePts: number;
    evPerShare: number;
    quarterKellyFraction: number;
    dissent: string;
  } | null;
  checks: {
    agreement: { pass: boolean; maxPairwiseDisagreementPts: number };
    edge: { pass: boolean; edgePts: number };
    liquidity: { pass: boolean; depthUsd: number; spreadPts: number };
    timing: { pass: boolean; hoursToResolution: number };
  };
}
interface Market {
  slug: string;
  title: string;
  movieTitle: string;
  weekendType: string;
  endDate: string;
  brackets: { label: string; bestAsk: number; mid: number }[];
}
interface CellDetail {
  agent: string;
  model: string;
  phase: string;
  bracket_probs: Record<string, number>;
  confidence: string;
  evidence: string[];
  whatWouldChangeMyMind: string;
  updatedOn: string;
  narrative: string;
}
interface Selection {
  phase: string;
  agent: string;
  model: string;
  title: string;
}

const keyOf = (phase: string, agent: string, model: string) =>
  `${phase}:${agent}:${model}`;

/** Raw agent_outputs row (from Realtime) → the compact cell view we render. */
function rowToCell(row: {
  agent: string;
  model: string;
  bracket_probs: Record<string, number>;
  confidence: string;
  evidence?: string[];
}): CellView {
  const probs = row.bracket_probs ?? {};
  let top = { label: "—", p: -1 };
  for (const [l, p] of Object.entries(probs)) if (p > top.p) top = { label: l, p };
  return {
    method: row.agent,
    provider: row.model,
    done: true,
    confidence: row.confidence,
    probs,
    top: top.p >= 0 ? { label: top.label, pct: Math.round(top.p * 100) } : null,
    evidence: (row.evidence ?? []).slice(0, 3),
  };
}

export function LiveBoard({ slug }: { slug: string }) {
  const [market, setMarket] = useState<Market | null>(null);
  const [labels, setLabels] = useState<string[]>([]);
  const [providers, setProviders] = useState<string[]>([]);
  const [cells, setCells] = useState<Record<string, CellView>>({});
  const [ensemble, setEnsemble] = useState<Record<string, number> | null>(null);
  const [gate, setGate] = useState<GateResult | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [runCost, setRunCost] = useState<number>(0);
  const [totalCost, setTotalCost] = useState<number>(0);
  const [status, setStatus] = useState<string>("loading");
  const [starting, setStarting] = useState(false);
  const [runError, setRunError] = useState("");
  const [live, setLive] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [stopped, setStopped] = useState(false);
  const startRef = useRef<number | null>(null);
  const discoverRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [sel, setSel] = useState<Selection | null>(null);
  const [detail, setDetail] = useState<CellDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const openCell = useCallback(
    async (s: Selection) => {
      if (!runId) return;
      setSel(s);
      setDetail(null);
      setDetailLoading(true);
      try {
        const res = await fetch(
          `/api/runs/cell?runId=${runId}&agent=${s.agent}&model=${s.model}&phase=${s.phase}`,
          { cache: "no-store" },
        );
        const j = await res.json();
        if (j.ok) setDetail(j.cell);
      } finally {
        setDetailLoading(false);
      }
    },
    [runId],
  );

  // Pull authoritative state from the server (seeds cells + computes
  // ensemble/gate). Called on mount, and on every Realtime insert so the
  // computed summary stays in sync. Returns the runId it found.
  const sync = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch(
        `/api/runs/progress?slug=${encodeURIComponent(slug)}`,
        { cache: "no-store" },
      );
      const j = await res.json();
      if (j.market) setMarket(j.market);
      if (j.labels) setLabels(j.labels);
      if (j.providers) setProviders(j.providers);
      setStatus(j.status);
      setEnsemble(j.ensemble ?? null);
      setGate(j.gate ?? null);
      setRunId(j.runId ?? null);
      if (typeof j.runCostUsd === "number") setRunCost(j.runCostUsd);
      if (typeof j.totalCostUsd === "number") setTotalCost(j.totalCostUsd);
      if (j.cells) {
        const merged: Record<string, CellView> = {};
        for (const c of [...j.cells.independent, ...j.cells.consensus]) {
          if (!c.done) continue;
          const phase = c.method === "consensus" ? "consensus" : "independent";
          merged[keyOf(phase, c.method, c.provider)] = c;
        }
        setCells((prev) => ({ ...prev, ...merged }));
      }
      return j.runId ?? null;
    } catch {
      return null;
    }
  }, [slug]);

  // Initial load. sync() is async (awaits a fetch before any setState), so this
  // is the standard data-fetch-on-mount pattern, not a synchronous cascade.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void sync();
  }, [sync]);

  // Realtime subscription — the WebSocket. Re-subscribes when runId changes.
  useEffect(() => {
    if (!runId || stopped) return;
    const sb = getBrowserSupabase();
    if (!sb) return;
    const ch = sb
      .channel(`run:${runId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "agent_outputs",
          filter: `run_id=eq.${runId}`,
        },
        (payload) => {
          const row = payload.new as Parameters<typeof rowToCell>[0] & {
            phase: string;
          };
          setCells((prev) => ({
            ...prev,
            [keyOf(row.phase, row.agent, row.model)]: rowToCell(row),
          }));
          sync(); // refresh ensemble/gate/status authoritatively
        },
      )
      .subscribe((s) => setLive(s === "SUBSCRIBED"));
    return () => {
      sb.removeChannel(ch);
      setLive(false);
    };
  }, [runId, sync, stopped]);

  // Elapsed timer while running.
  const done = Object.values(cells).filter((c) => c.done).length;
  const running = (starting || (status === "running" && done < 12)) && !stopped;
  useEffect(() => {
    if (!running) {
      startRef.current = null;
      return;
    }
    if (startRef.current === null) startRef.current = Date.now();
    const id = setInterval(() => {
      if (startRef.current !== null)
        setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  // Fallback poller: if Realtime isn't connected (e.g. the SQL hasn't been run
  // yet), keep the board fresh by re-syncing every 2s while a run is active.
  // When the WebSocket IS live, this stays off — push covers it.
  useEffect(() => {
    if (!running || live) return;
    const id = setInterval(() => {
      void sync();
    }, 2000);
    return () => clearInterval(id);
  }, [running, live, sync]);

  function stop() {
    setStopped(true);
    setStarting(false);
    setLive(false);
    if (discoverRef.current) {
      clearInterval(discoverRef.current);
      discoverRef.current = null;
    }
    startRef.current = null;
  }

  async function start() {
    setStopped(false);
    setStarting(true);
    setRunError("");
    setCells({});
    setEnsemble(null);
    setGate(null);
    startRef.current = Date.now();
    setElapsed(0);

    // Fire the run (long-lived; we watch via Realtime, not this response).
    fetch("/api/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ marketSlug: slug }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok)
          setRunError(
            j.reason === "missing-agent-keys"
              ? `Missing API keys: ${(j.missing ?? []).join(", ")}`
              : j.reason === "db-required"
                ? "Supabase not configured"
                : "Run failed to start",
          );
      })
      .catch((e) => setRunError(String(e)));

    // Briefly poll just to learn the new runId, then the subscription takes
    // over and we stop. (Discovery only — not steady-state polling.)
    let tries = 0;
    const discover = setInterval(async () => {
      const id = await sync();
      tries += 1;
      if (id || tries > 20) {
        clearInterval(discover);
        discoverRef.current = null;
        setStarting(false);
      }
    }, 1500);
    discoverRef.current = discover;
  }

  if (status === "loading" && !market) {
    return <p className="text-sm text-zinc-500">Loading live board…</p>;
  }
  if (status === "no-db") {
    return (
      <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
        Supabase isn&apos;t configured — the live board needs the DB.
      </p>
    );
  }
  if (!market) {
    return (
      <p className="text-sm text-zinc-500">
        Couldn&apos;t find an active market for “{slug}”.
      </p>
    );
  }

  const total = 12;
  const pct = Math.round((done / total) * 100);
  const complete = done >= 12;
  const phaseLabel = complete
    ? "Complete"
    : done >= 9
      ? "Consensus phase"
      : done > 0
        ? "Independent research"
        : running
          ? "Starting…"
          : "Idle";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">
            {market.movieTitle || market.title}
          </h1>
          <p className="mt-0.5 flex items-center gap-2 text-sm text-zinc-500">
            {market.weekendType !== "unknown" && `${market.weekendType} weekend · `}
            {market.brackets.length} brackets · 3×3 → 12 calls
            <span
              className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] ${
                live
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-zinc-100 text-zinc-400"
              }`}
              title={live ? "Realtime connected" : "Realtime not connected"}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${live ? "bg-emerald-500" : "bg-zinc-300"}`}
              />
              {live ? "live" : "offline"}
            </span>
            <a
              href={`https://polymarket.com/event/${market.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline-offset-2 hover:underline"
            >
              Open on Polymarket ↗
            </a>
          </p>
        </div>
        <div className="flex items-center gap-3">
          {running && (
            <span className="font-mono text-sm text-zinc-500">
              {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
            </span>
          )}
          {running ? (
            <button
              onClick={stop}
              className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
            >
              Stop watching
            </button>
          ) : (
            <button
              onClick={start}
              className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white"
            >
              {complete ? "Run again" : stopped ? "Resume" : "Start run"}
            </button>
          )}
        </div>
      </div>

      {runError && <p className="text-sm text-red-600">{runError}</p>}

      <div>
        <div className="mb-1 flex items-center justify-between text-xs text-zinc-500">
          <span>
            {phaseLabel}
            {running && <PulseDot />}
          </span>
          <span className="font-mono">
            {runCost > 0 && (
              <span className="text-zinc-400">${runCost.toFixed(2)} run · </span>
            )}
            {totalCost > 0 && (
              <span className="text-zinc-400">${totalCost.toFixed(2)} total · </span>
            )}
            {done}/{total} calls
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              complete ? "bg-emerald-500" : "bg-blue-500"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <section>
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Independent research — 9 blinded cells
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-1 text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-zinc-400">
                <th className="px-2 py-1 font-normal">method ↓ / model →</th>
                {providers.map((p) => (
                  <th key={p} className="px-2 py-1 font-normal">
                    {PROVIDER_LABELS[p] ?? p}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {METHODS.map((method) => (
                <tr key={method}>
                  <td className="px-2 py-1 font-medium text-zinc-600">
                    {METHOD_LABELS[method]}
                  </td>
                  {providers.map((provider) => (
                    <td key={provider} className="p-0">
                      <MatrixCell
                        cell={cells[keyOf("independent", method, provider)]}
                        onOpen={() =>
                          openCell({
                            phase: "independent",
                            agent: method,
                            model: provider,
                            title: `${METHOD_LABELS[method]} · ${PROVIDER_LABELS[provider] ?? provider}`,
                          })
                        }
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Consensus — each model reconciles all 3 method views
        </h2>
        <div className="grid gap-2 sm:grid-cols-3">
          {providers.map((provider) => (
            <ConsensusCard
              key={provider}
              provider={provider}
              cell={cells[keyOf("consensus", "consensus", provider)]}
              labels={labels}
              onOpen={() =>
                openCell({
                  phase: "consensus",
                  agent: "consensus",
                  model: provider,
                  title: `Consensus · ${PROVIDER_LABELS[provider] ?? provider}`,
                })
              }
            />
          ))}
        </div>
      </section>

      {ensemble && (
        <section className="space-y-4 rounded-lg border border-zinc-200 p-4">
          <h2 className="text-sm font-semibold">
            Ensemble forecast vs market price
          </h2>
          <EnsembleBars
            ensemble={ensemble}
            brackets={market.brackets}
            labels={labels}
          />
          {gate && (
            <Gate
              gate={gate}
              marketUrl={`https://polymarket.com/event/${market.slug}`}
            />
          )}
        </section>
      )}

      {sel && (
        <CellModal
          title={sel.title}
          detail={detail}
          loading={detailLoading}
          labels={labels}
          onClose={() => {
            setSel(null);
            setDetail(null);
          }}
        />
      )}
    </div>
  );
}

function CellModal({
  title,
  detail,
  loading,
  labels,
  onClose,
}: {
  title: string;
  detail: CellDetail | null;
  loading: boolean;
  labels: string[];
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className="my-4 w-full max-w-2xl rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-3">
          <h3 className="text-sm font-semibold">{title}</h3>
          <button
            onClick={onClose}
            className="rounded px-2 py-1 text-sm text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          >
            ✕
          </button>
        </div>

        <div className="space-y-5 px-5 py-4">
          {loading && <p className="text-sm text-zinc-400">Loading reasoning…</p>}
          {!loading && !detail && (
            <p className="text-sm text-zinc-400">No reasoning stored yet.</p>
          )}
          {detail && (
            <>
              <div>
                <h4 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-zinc-400">
                  Distribution · confidence {detail.confidence}
                </h4>
                <div className="space-y-1">
                  {labels.map((l) => {
                    const p = detail.bracket_probs[l] ?? 0;
                    return (
                      <div key={l} className="flex items-center gap-2 text-xs">
                        <span className="w-16 shrink-0 text-zinc-500">{l}</span>
                        <div className="h-3 flex-1 rounded bg-zinc-100">
                          <div
                            className="h-3 rounded bg-blue-400/70"
                            style={{ width: `${Math.min(p, 1) * 100}%` }}
                          />
                        </div>
                        <span className="w-10 shrink-0 text-right font-mono">
                          {Math.round(p * 100)}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {detail.evidence.length > 0 && (
                <div>
                  <h4 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-zinc-400">
                    Key evidence the model cited
                  </h4>
                  <ul className="list-disc space-y-1 pl-5 text-sm">
                    {detail.evidence.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}

              {detail.updatedOn && (
                <div>
                  <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-400">
                    What it updated on
                  </h4>
                  <p className="text-sm text-zinc-700">{detail.updatedOn}</p>
                </div>
              )}

              {detail.whatWouldChangeMyMind && (
                <div>
                  <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-400">
                    What would change its mind
                  </h4>
                  <p className="text-sm text-zinc-700">
                    {detail.whatWouldChangeMyMind}
                  </p>
                </div>
              )}

              {detail.narrative && (
                <details className="group">
                  <summary className="cursor-pointer text-xs font-medium uppercase tracking-wide text-zinc-400 hover:text-zinc-600">
                    Full reasoning narrative ▾
                  </summary>
                  <div className="mt-2 max-h-80 overflow-y-auto whitespace-pre-wrap rounded bg-zinc-50 p-3 text-xs leading-relaxed text-zinc-700">
                    {detail.narrative}
                  </div>
                </details>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PulseDot() {
  return (
    <span className="ml-2 inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500 align-middle" />
  );
}

function Spinner() {
  return (
    <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-zinc-300 border-t-blue-500" />
  );
}

function MatrixCell({
  cell,
  onOpen,
}: {
  cell?: CellView;
  onOpen?: () => void;
}) {
  if (!cell || !cell.done) {
    return (
      <div className="flex h-14 items-center justify-center rounded border border-dashed border-zinc-200 bg-zinc-50 text-xs text-zinc-300">
        {cell ? <Spinner /> : "—"}
      </div>
    );
  }
  return (
    <button
      onClick={onOpen}
      className="h-14 w-full rounded border border-zinc-200 bg-white px-2 py-1.5 text-left transition hover:border-blue-300 hover:bg-blue-50/40"
      title="See this model's reasoning"
    >
      <div className="font-mono text-sm font-medium">
        {cell.top ? cell.top.label : "—"}
      </div>
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>{cell.top ? `${cell.top.pct}%` : ""}</span>
        <span
          className={
            cell.confidence === "high"
              ? "text-emerald-600"
              : cell.confidence === "medium"
                ? "text-amber-600"
                : "text-zinc-400"
          }
        >
          {cell.confidence}
        </span>
      </div>
    </button>
  );
}

function ConsensusCard({
  provider,
  cell,
  labels,
  onOpen,
}: {
  provider: string;
  cell?: CellView;
  labels: string[];
  onOpen?: () => void;
}) {
  const done = cell?.done;
  return (
    <button
      onClick={done ? onOpen : undefined}
      disabled={!done}
      className={`w-full rounded border border-zinc-200 p-3 text-left transition ${
        done ? "hover:border-blue-300 hover:bg-blue-50/40" : "cursor-default"
      }`}
      title={done ? "See this model's reasoning" : undefined}
    >
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-sm font-medium">
          {PROVIDER_LABELS[provider] ?? provider}
        </span>
        {done ? (
          <span className="text-xs text-emerald-600">✓</span>
        ) : (
          <Spinner />
        )}
      </div>
      {done && cell.probs ? (
        <div className="space-y-0.5">
          {labels.map((l) => (
            <div key={l} className="flex items-center justify-between text-xs">
              <span className="text-zinc-500">{l}</span>
              <span className="font-mono">
                {Math.round((cell.probs?.[l] ?? 0) * 100)}%
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-zinc-300">waiting…</p>
      )}
    </button>
  );
}

function EnsembleBars({
  ensemble,
  brackets,
  labels,
}: {
  ensemble: Record<string, number>;
  brackets: { label: string; bestAsk: number }[];
  labels: string[];
}) {
  const askOf = (l: string) =>
    brackets.find((b) => b.label === l)?.bestAsk ?? 0;
  return (
    <div className="space-y-2">
      {labels.map((l) => {
        const ours = ensemble[l] ?? 0;
        const mkt = askOf(l);
        const edge = ours - mkt;
        return (
          <div key={l} className="text-xs">
            <div className="mb-0.5 flex items-center justify-between">
              <span className="font-medium">{l}</span>
              <span className="font-mono text-zinc-500">
                us {Math.round(ours * 100)}% · mkt {Math.round(mkt * 100)}%{" "}
                <span
                  className={
                    edge >= 0.08
                      ? "text-emerald-600"
                      : edge <= -0.08
                        ? "text-red-500"
                        : "text-zinc-400"
                  }
                >
                  ({edge >= 0 ? "+" : ""}
                  {Math.round(edge * 100)})
                </span>
              </span>
            </div>
            <div className="relative h-4 w-full rounded bg-zinc-100">
              <div
                className="absolute top-0 h-4 rounded bg-blue-400/70"
                style={{ width: `${Math.min(ours, 1) * 100}%` }}
              />
              <div
                className="absolute top-0 h-4 w-0.5 bg-zinc-700"
                style={{ left: `${Math.min(mkt, 1) * 100}%` }}
              />
            </div>
          </div>
        );
      })}
      <p className="pt-1 text-[11px] text-zinc-400">
        Blue bar = ensemble probability · tick = market price (bestAsk).
      </p>
    </div>
  );
}

function Gate({ gate, marketUrl }: { gate: GateResult; marketUrl?: string }) {
  const c = gate.checks;
  const rows: [string, boolean, string][] = [
    [
      "Agreement (≤5 pts)",
      c.agreement.pass,
      `${c.agreement.maxPairwiseDisagreementPts} pts`,
    ],
    [
      "Edge vs price (≥8 pts)",
      c.edge.pass,
      `${c.edge.edgePts > 0 ? "+" : ""}${c.edge.edgePts} pts`,
    ],
    [
      "Liquidity & spread",
      c.liquidity.pass,
      `$${c.liquidity.depthUsd} · ${c.liquidity.spreadPts} pts`,
    ],
    ["Timing (>24h)", c.timing.pass, `${c.timing.hoursToResolution}h`],
  ];
  return (
    <div className="space-y-2">
      <div
        className={`rounded px-3 py-2 text-sm font-semibold ${
          gate.emit
            ? "bg-emerald-50 text-emerald-800"
            : "bg-zinc-100 text-zinc-700"
        }`}
      >
        {gate.emit ? "✓ BET RECOMMENDED" : "NO BET — gate not satisfied"}
      </div>
      <div className="space-y-1">
        {rows.map(([label, pass, detail]) => (
          <div key={label} className="flex items-center justify-between text-xs">
            <span>
              <span className={pass ? "text-emerald-600" : "text-red-500"}>
                {pass ? "✓" : "✗"}
              </span>{" "}
              {label}
            </span>
            <span className="font-mono text-zinc-500">{detail}</span>
          </div>
        ))}
      </div>
      {gate.emit && gate.candidate && (
        <div className="rounded border border-emerald-200 bg-emerald-50/50 p-2 text-xs">
          <div className="font-medium">
            Buy YES · {gate.candidate.bracketLabel} @{" "}
            {Math.round(gate.candidate.execPrice * 100)}¢
          </div>
          <div className="mt-0.5 font-mono text-zinc-600">
            edge +{gate.candidate.edgePts} pts · EV $
            {gate.candidate.evPerShare.toFixed(2)}/share · ¼-Kelly{" "}
            {(gate.candidate.quarterKellyFraction * 100).toFixed(1)}%
          </div>
          {marketUrl && (
            <a
              href={marketUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block rounded bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700"
            >
              Place this bet on Polymarket ↗
            </a>
          )}
        </div>
      )}
      <p className="text-[11px] text-zinc-400">
        Research tool, not financial advice. Paper-trade only.
      </p>
    </div>
  );
}
