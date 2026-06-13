import type { BoxOfficeEvent } from "@/lib/polymarket/types";
import { matrixModels, type ProviderName } from "@/lib/config";
import { buildFeatures } from "@/lib/features";
import {
  buildBrief,
  buildConsensusPrompt,
  SYSTEM_PROMPTS,
  type MethodView,
} from "@/lib/agents/prompts";
import { METHODS, type AgentBrief, type AgentOutput, type MethodName } from "@/lib/agents/types";
import { runCell } from "@/lib/agents/runner";
import { medianAggregate } from "./consensus";
import { upsertMarketWithBrackets, insertPriceSnapshots } from "@/lib/db/markets";
import {
  createOrResumeRun,
  loadAgentOutputs,
  saveAgentOutput,
} from "@/lib/db/runs";

export interface RunResult {
  runId: string;
  marketId: string;
  labels: string[];
  /** independent[method][provider] = distribution */
  independent: Record<string, Record<string, AgentOutput>>;
  methodViews: MethodView[];
  /** consensus[provider] = distribution */
  consensus: Record<string, AgentOutput>;
  ensemble: Record<string, number>;
}

function briefFor(ev: BoxOfficeEvent, features: AgentBrief["features"]): AgentBrief {
  return {
    movieTitle: ev.movieTitle,
    question: ev.title,
    brackets: ev.brackets.map((b) => ({
      label: b.label,
      bestAsk: b.bestAsk,
      mid: b.mid,
    })),
    resolutionRules: ev.resolutionRules,
    features,
  };
}

/**
 * Run the full 3×3 matrix for one market, resumable and idempotent.
 * Requires a DB (run logging is the product). Caller ensures all provider keys
 * are present.
 */
export async function orchestrateRun(ev: BoxOfficeEvent): Promise<RunResult> {
  const labels = ev.brackets.map((b) => b.label);

  // Persist market + a fresh price snapshot at run start.
  const upserted = await upsertMarketWithBrackets(ev);
  if (!upserted) throw new Error("DB required for runs");
  await insertPriceSnapshots(ev, upserted.bracketIds);

  const features = await buildFeatures(ev);
  const run = await createOrResumeRun(upserted.marketId, features);
  const brief = briefFor(ev, features);
  const promptBody = buildBrief(brief);
  const seats = matrixModels();

  // Load any already-completed cells to support resume.
  const existing = await loadAgentOutputs(run.id);
  const done = new Set(existing.map((r) => `${r.phase}:${r.agent}:${r.model}`));
  const outputOf = (phase: string, agent: string, model: string) =>
    existing.find(
      (r) => r.phase === phase && r.agent === agent && r.model === model,
    );

  // --- Independent phase: 9 blinded cells in parallel ---
  type IndepTask = { method: MethodName; provider: ProviderName; modelId: string };
  const tasks: IndepTask[] = [];
  for (const method of METHODS)
    for (const seat of seats)
      tasks.push({ method, provider: seat.provider, modelId: seat.modelId });

  const independent: RunResult["independent"] = {};
  for (const m of METHODS) independent[m] = {};

  await Promise.allSettled(
    tasks.map(async (t) => {
      const key = `independent:${t.method}:${t.provider}`;
      if (done.has(key)) {
        const row = outputOf("independent", t.method, t.provider)!;
        independent[t.method][t.provider] = {
          bracket_probs: row.bracket_probs,
          confidence: row.confidence as AgentOutput["confidence"],
          key_evidence: row.evidence,
          what_would_change_my_mind: "",
        };
        return;
      }
      const { output, raw } = await runCell({
        provider: t.provider,
        modelId: t.modelId,
        system: SYSTEM_PROMPTS[t.method],
        prompt: promptBody,
        labels,
      });
      independent[t.method][t.provider] = output;
      await saveAgentOutput({
        runId: run.id,
        agent: t.method,
        model: t.provider,
        phase: "independent",
        output,
        raw,
      });
    }),
  );

  // --- Method views: per-method median across the model seats present ---
  const methodViews: MethodView[] = METHODS.map((method) => {
    const outs = Object.values(independent[method]);
    return {
      method,
      probs: medianAggregate(outs, labels),
      evidence: outs.flatMap((o) => o.key_evidence).slice(0, 8),
    };
  });

  // --- Consensus phase: one integrated revision per model seat ---
  const consensus: RunResult["consensus"] = {};
  await Promise.allSettled(
    seats.map(async (seat) => {
      const key = `consensus:consensus:${seat.provider}`;
      if (done.has(key)) {
        const row = outputOf("consensus", "consensus", seat.provider)!;
        consensus[seat.provider] = {
          bracket_probs: row.bracket_probs,
          confidence: row.confidence as AgentOutput["confidence"],
          key_evidence: row.evidence,
          what_would_change_my_mind: "",
        };
        return;
      }
      // Seed "own" with this seat's comps cell as a starting point.
      const own =
        independent.comps_quant[seat.provider] ??
        Object.values(independent.comps_quant)[0] ??
        ({ bracket_probs: {} } as AgentOutput);

      const { output, raw } = await runCell({
        provider: seat.provider,
        modelId: seat.modelId,
        system:
          "You are reconciling three independent box-office forecasting methods into one calibrated distribution.",
        prompt: buildConsensusPrompt(brief, own, methodViews),
        labels,
        maxSteps: 4,
      });
      consensus[seat.provider] = output;
      await saveAgentOutput({
        runId: run.id,
        agent: "consensus",
        model: seat.provider,
        phase: "consensus",
        output,
        raw,
      });
    }),
  );

  const ensemble = medianAggregate(Object.values(consensus), labels);

  return {
    runId: run.id,
    marketId: upserted.marketId,
    labels,
    independent,
    methodViews,
    consensus,
    ensemble,
  };
}
