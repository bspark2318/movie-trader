import { notFound } from "next/navigation";
import { fetchEventBySlug } from "@/lib/polymarket/gamma";
import { hasDb, missingProviderKeys } from "@/lib/config";
import { BracketTable } from "@/components/BracketTable";
import { MatrixGrid } from "@/components/MatrixGrid";
import { GatePanel } from "@/components/GatePanel";
import { RunButton } from "@/components/RunButton";
import { getMarketBySlug } from "@/lib/db/markets";
import { latestRunWithOutputs } from "@/lib/db/runs";
import { evaluateGate } from "@/lib/gate";
import type { AgentOutput } from "@/lib/agents/types";

export const dynamic = "force-dynamic";

export default async function MarketPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ev = await fetchEventBySlug(slug);
  if (!ev) notFound();

  const labels = ev.brackets.map((b) => b.label);

  // Layer DB run data on top of the live market view, if present.
  let runData: Awaited<ReturnType<typeof latestRunWithOutputs>> = null;
  if (hasDb()) {
    const market = await getMarketBySlug(slug);
    if (market) runData = await latestRunWithOutputs(market.id);
  }

  const consensusOutputs: AgentOutput[] = (runData?.outputs ?? [])
    .filter((o) => o.phase === "consensus")
    .map((o) => ({
      bracket_probs: o.bracket_probs,
      confidence: o.confidence as AgentOutput["confidence"],
      key_evidence: o.evidence,
      what_would_change_my_mind: "",
    }));

  // Ensemble = stored consensus median (recomputed deterministically here).
  const ensemble =
    consensusOutputs.length > 0
      ? (await import("@/lib/runs/consensus")).medianAggregate(
          consensusOutputs,
          labels,
        )
      : undefined;

  const gate =
    ensemble && consensusOutputs.length > 0
      ? evaluateGate(ev, ensemble, consensusOutputs)
      : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{ev.title}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {ev.weekendType !== "unknown" && `${ev.weekendType} weekend`}
          {ev.weekendDates &&
            ` (${ev.weekendDates.start} – ${ev.weekendDates.end})`}
          {" · "}resolves{" "}
          {ev.endDate ? new Date(ev.endDate).toLocaleString() : "TBD"}
          {" · "}${Math.round(ev.liquidity).toLocaleString()} liquidity
        </p>
      </div>

      <section className="rounded-lg border border-zinc-200 p-4">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500">
          Brackets {ensemble && "· ensemble vs market"}
        </h2>
        <BracketTable brackets={ev.brackets} ensemble={ensemble} />
      </section>

      {gate && (
        <section className="rounded-lg border border-zinc-200 p-4">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500">
            Recommendation gate
          </h2>
          <GatePanel gate={gate} />
        </section>
      )}

      {runData && (
        <section className="rounded-lg border border-zinc-200 p-4">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500">
            Agent matrix ·{" "}
            {new Date(runData.run.started_at).toLocaleString()}
          </h2>
          <MatrixGrid outputs={runData.outputs} labels={labels} />
        </section>
      )}

      {hasDb() && missingProviderKeys().length === 0 && (
        <section className="rounded-lg border border-zinc-200 p-4">
          <RunButton slug={slug} />
        </section>
      )}

      {!hasDb() && (
        <p className="rounded bg-amber-50 p-3 text-sm text-amber-700">
          Database not configured — agent runs, history, and recommendations
          appear here once Supabase is connected.
        </p>
      )}

      <section className="rounded-lg border border-zinc-200 p-4">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500">
          Resolution rules (verbatim)
        </h2>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">
          {ev.resolutionRules || "No resolution rules found."}
        </p>
      </section>
    </div>
  );
}
