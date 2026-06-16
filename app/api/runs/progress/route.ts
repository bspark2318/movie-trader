import { NextRequest, NextResponse } from "next/server";
import { hasDb } from "@/lib/config";
import { fetchEventBySlug } from "@/lib/polymarket/gamma";
import { getMarketBySlug } from "@/lib/db/markets";
import { latestRunWithOutputs, totalRunCost } from "@/lib/db/runs";
import { medianAggregate } from "@/lib/runs/consensus";
import { evaluateGate } from "@/lib/gate";
import { METHODS } from "@/lib/agents/types";
import { matrixModels } from "@/lib/config";
import type { AgentOutput } from "@/lib/agents/types";
import type { AgentOutputRow } from "@/lib/db/types";

export const dynamic = "force-dynamic";

/**
 * Live progress for the most recent run of a market. Cheap to poll: it just
 * reads the agent_outputs rows the orchestrator checkpoints as each of the 12
 * cells lands, plus live Gamma prices, and recomputes the ensemble + gate.
 */
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ status: "error", reason: "slug-required" });
  }
  if (!hasDb()) {
    return NextResponse.json({ status: "no-db" });
  }

  const ev = await fetchEventBySlug(slug);
  if (!ev) {
    return NextResponse.json({ status: "unknown-market" });
  }

  const labels = ev.brackets.map((b) => b.label);
  const market = {
    slug: ev.slug,
    title: ev.title,
    movieTitle: ev.movieTitle,
    weekendType: ev.weekendType,
    endDate: ev.endDate,
    brackets: ev.brackets.map((b) => ({
      label: b.label,
      bestAsk: b.bestAsk,
      mid: b.mid,
    })),
  };

  const seats = matrixModels();
  const providers = seats.map((s) => s.provider);

  const marketRow = await getMarketBySlug(slug);
  const found = marketRow ? await latestRunWithOutputs(marketRow.id) : null;

  // No run yet — return the board skeleton so the page can render the matrix
  // and an idle "Start run" state.
  if (!found) {
    return NextResponse.json({
      status: "not-started",
      market,
      labels,
      providers,
      cells: emptyCells(providers),
      counts: { done: 0, total: 12 },
    });
  }

  const { run, outputs } = found;
  const rowOf = (agent: string, model: string, phase: string) =>
    outputs.find(
      (o) => o.agent === agent && o.model === model && o.phase === phase,
    );

  const cells = {
    independent: METHODS.flatMap((method) =>
      providers.map((provider) => {
        const r = rowOf(method, provider, "independent");
        return cellView(method, provider, r);
      }),
    ),
    consensus: providers.map((provider) => {
      const r = rowOf("consensus", provider, "consensus");
      return cellView("consensus", provider, r);
    }),
  };

  const indepDone = cells.independent.filter((c) => c.done).length;
  const consDone = cells.consensus.filter((c) => c.done).length;
  const done = indepDone + consDone;

  // Per-method median view across the models present (mirrors the orchestrator).
  const methodViews = METHODS.map((method) => {
    const outs = providers
      .map((p) => rowOf(method, p, "independent"))
      .filter((r): r is AgentOutputRow => Boolean(r))
      .map(toOutput);
    return {
      method,
      probs: outs.length ? medianAggregate(outs, labels) : null,
    };
  });

  // Ensemble + gate once all three consensus seats have landed.
  const consensusOutputs = providers
    .map((p) => rowOf("consensus", p, "consensus"))
    .filter((r): r is AgentOutputRow => Boolean(r))
    .map(toOutput);

  let ensemble: Record<string, number> | null = null;
  let gate = null;
  if (consensusOutputs.length === providers.length && providers.length > 0) {
    ensemble = medianAggregate(consensusOutputs, labels);
    gate = evaluateGate(ev, ensemble, consensusOutputs);
  }

  const phase =
    done >= 12
      ? "complete"
      : indepDone < 9
        ? "independent"
        : "consensus";

  return NextResponse.json({
    status: phase === "complete" ? "complete" : "running",
    phase,
    market,
    labels,
    providers,
    runId: run.id,
    startedAt: run.started_at,
    cells,
    methodViews,
    counts: { done, total: 12, independent: indepDone, consensus: consDone },
    ensemble,
    gate,
    runCostUsd: Number(run.cost_usd ?? 0),
    totalCostUsd: await totalRunCost(),
  });
}

function toOutput(r: AgentOutputRow): AgentOutput {
  return {
    bracket_probs: r.bracket_probs,
    confidence: r.confidence as AgentOutput["confidence"],
    key_evidence: r.evidence,
    what_would_change_my_mind: "",
  };
}

function cellView(method: string, provider: string, r?: AgentOutputRow) {
  if (!r) return { method, provider, done: false };
  let top = { label: "—", p: -1 };
  for (const [label, p] of Object.entries(r.bracket_probs))
    if (p > top.p) top = { label, p };
  return {
    method,
    provider,
    done: true,
    confidence: r.confidence,
    probs: r.bracket_probs,
    top: top.p >= 0 ? { label: top.label, pct: Math.round(top.p * 100) } : null,
    evidence: r.evidence?.slice(0, 3) ?? [],
  };
}

function emptyCells(providers: string[]) {
  return {
    independent: METHODS.flatMap((method) =>
      providers.map((provider) => ({ method, provider, done: false })),
    ),
    consensus: providers.map((provider) => ({
      method: "consensus",
      provider,
      done: false,
    })),
  };
}
