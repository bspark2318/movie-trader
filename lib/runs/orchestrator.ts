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
import { medianAggregate, logPoolAggregate } from "./consensus";
import {
  learningActive,
  loadSeatBriers,
  brierToWeights,
} from "@/lib/learn";
import {
  loadCalibrationMapping,
  calibrateDistribution,
  type CalBin,
} from "@/lib/learn/calibration";
import { upsertMarketWithBrackets, insertPriceSnapshots } from "@/lib/db/markets";
import {
  createOrResumeRun,
  loadAgentOutputs,
  saveAgentOutput,
  saveRunCost,
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
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
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
/**
 * Aggregate cell distributions: a performance-weighted log-pool once learning
 * is active (seats that forecast better count more), else today's plain median.
 */
function aggregateSeats(
  items: { key: string; bracket_probs: Record<string, number> }[],
  labels: string[],
  active: boolean,
  briers: Map<string, number>,
): Record<string, number> {
  if (!active || briers.size === 0 || items.length === 0) {
    return medianAggregate(
      items.map((i) => ({ bracket_probs: i.bracket_probs })),
      labels,
    );
  }
  const weights = brierToWeights(items.map((i) => briers.get(i.key) ?? 1));
  return logPoolAggregate(
    items.map((i, idx) => ({
      bracket_probs: i.bracket_probs,
      weight: weights[idx],
    })),
    labels,
  );
}

export async function orchestrateRun(ev: BoxOfficeEvent): Promise<RunResult> {
  const labels = ev.brackets.map((b) => b.label);

  // Self-improvement inputs (no-ops until MIN_SAMPLE markets have resolved).
  const active = await learningActive();
  const seatBriers: Map<string, number> = active
    ? await loadSeatBriers()
    : new Map();
  const calMapping: CalBin[] = active ? await loadCalibrationMapping() : [];

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

  // Accumulate estimated model cost across freshly-run cells (resumed cells were
  // already paid for and add nothing).
  const cost = { usd: 0, input: 0, output: 0 };

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
      const { output, raw, costUsd, inputTokens, outputTokens } = await runCell({
        provider: t.provider,
        modelId: t.modelId,
        system: SYSTEM_PROMPTS[t.method],
        prompt: promptBody,
        labels,
      });
      cost.usd += costUsd;
      cost.input += inputTokens;
      cost.output += outputTokens;
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
    const entries = Object.entries(independent[method]);
    return {
      method,
      probs: aggregateSeats(
        entries.map(([provider, o]) => ({
          key: `${method}:${provider}`,
          bracket_probs: o.bracket_probs,
        })),
        labels,
        active,
        seatBriers,
      ),
      evidence: entries.flatMap(([, o]) => o.key_evidence).slice(0, 8),
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

      const { output, raw, costUsd, inputTokens, outputTokens } = await runCell({
        provider: seat.provider,
        modelId: seat.modelId,
        system:
          "You are reconciling three independent box-office forecasting methods into one calibrated distribution.",
        prompt: buildConsensusPrompt(brief, own, methodViews),
        labels,
        maxSteps: 4,
      });
      cost.usd += costUsd;
      cost.input += inputTokens;
      cost.output += outputTokens;
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

  const ensembleRaw = aggregateSeats(
    Object.entries(consensus).map(([provider, o]) => ({
      key: `consensus:${provider}`,
      bracket_probs: o.bracket_probs,
    })),
    labels,
    active,
    seatBriers,
  );
  // Apply the learned calibration correction (identity until there's data).
  const ensemble = calibrateDistribution(ensembleRaw, labels, calMapping);

  // Persist the run's estimated cost (only the cells run this invocation).
  if (cost.usd > 0) {
    await saveRunCost(run.id, {
      costUsd: cost.usd,
      inputTokens: cost.input,
      outputTokens: cost.output,
    });
  }

  return {
    runId: run.id,
    marketId: upserted.marketId,
    labels,
    independent,
    methodViews,
    consensus,
    ensemble,
    costUsd: cost.usd,
    inputTokens: cost.input,
    outputTokens: cost.output,
  };
}
