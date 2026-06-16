import type { BoxOfficeEvent, Bracket } from "@/lib/polymarket/types";
import type { AgentOutput } from "@/lib/agents/types";
import { maxPairwiseDisagreement } from "@/lib/runs/consensus";
import { evPerShare, quarterKelly } from "@/lib/sizing/kelly";
import type { RunResult } from "@/lib/runs/orchestrator";
import { getSupabase } from "@/lib/db/client";
import { learningActive } from "@/lib/learn";
import { learnedGateThresholds } from "@/lib/learn/gate-tuning";

// Default gate thresholds (probability points 0..1; shown as pts in UI). The
// agreement/edge pair can be overridden by the self-tuning learner.
const AGREEMENT_MAX = 0.05; // ≤5 pts pairwise on the candidate bracket
const EDGE_MIN = 0.08; // ≥8 pts vs executable price
const LIQUIDITY_MIN = 100; // ≥ $100 depth
const SPREAD_MAX = 0.04; // ≤4 pts
const HOURS_MIN = 24; // > 24h to resolution

export interface GateOverrides {
  edgeMin?: number;
  agreementMax?: number;
}

export interface GateChecks {
  agreement: { pass: boolean; maxPairwiseDisagreementPts: number };
  edge: { pass: boolean; edgePts: number };
  liquidity: { pass: boolean; depthUsd: number; spreadPts: number };
  timing: { pass: boolean; hoursToResolution: number };
}

export interface GateResult {
  emit: boolean;
  candidate: {
    bracketLabel: string;
    side: "buy_yes";
    execPrice: number;
    ensembleProb: number;
    edgePts: number;
    evPerShare: number;
    quarterKellyFraction: number;
    dissent: string;
  } | null;
  checks: GateChecks;
}

/**
 * Evaluate the 4-condition gate against the consensus ensemble.
 * Candidate = the bracket where buying YES has the largest positive edge
 * vs. its executable (bestAsk) price.
 */
export function evaluateGate(
  ev: BoxOfficeEvent,
  ensemble: Record<string, number>,
  consensusOutputs: AgentOutput[],
  overrides: GateOverrides = {},
): GateResult {
  const agreementMax = overrides.agreementMax ?? AGREEMENT_MAX;
  const edgeMin = overrides.edgeMin ?? EDGE_MIN;
  const byLabel = new Map<string, Bracket>(ev.brackets.map((b) => [b.label, b]));

  // Find the bracket with the largest positive YES edge against bestAsk.
  let best: { bracket: Bracket; prob: number; edge: number } | null = null;
  for (const [label, prob] of Object.entries(ensemble)) {
    const b = byLabel.get(label);
    if (!b) continue;
    const edge = prob - b.bestAsk;
    if (!best || edge > best.edge) best = { bracket: b, prob, edge };
  }

  const hoursToResolution = ev.endDate
    ? (Date.parse(ev.endDate) - Date.now()) / 3_600_000
    : 0;

  const candidateLabel = best?.bracket.label ?? "";
  const disagreement = candidateLabel
    ? maxPairwiseDisagreement(consensusOutputs, candidateLabel)
    : 1;

  const checks: GateChecks = {
    agreement: {
      pass: disagreement <= agreementMax,
      maxPairwiseDisagreementPts: Math.round(disagreement * 100),
    },
    edge: {
      pass: (best?.edge ?? 0) >= edgeMin,
      edgePts: Math.round((best?.edge ?? 0) * 100),
    },
    liquidity: {
      pass:
        (best?.bracket.liquidity ?? 0) >= LIQUIDITY_MIN &&
        (best?.bracket.spread ?? 1) <= SPREAD_MAX,
      depthUsd: Math.round(best?.bracket.liquidity ?? 0),
      spreadPts: Math.round((best?.bracket.spread ?? 0) * 100),
    },
    timing: {
      pass: hoursToResolution > HOURS_MIN,
      hoursToResolution: Math.round(hoursToResolution),
    },
  };

  const emit =
    best !== null &&
    checks.agreement.pass &&
    checks.edge.pass &&
    checks.liquidity.pass &&
    checks.timing.pass;

  // Candidate is always populated (the best value pick) so every run can log a
  // paper trade; `emit` separately says whether it cleared the strict gate.
  const candidate = best
    ? {
        bracketLabel: best.bracket.label,
        side: "buy_yes" as const,
        execPrice: best.bracket.bestAsk,
        ensembleProb: best.prob,
        edgePts: Math.round(best.edge * 100),
        evPerShare: Number(evPerShare(best.prob, best.bracket.bestAsk).toFixed(4)),
        quarterKellyFraction: Number(
          quarterKelly(best.prob, best.bracket.bestAsk).toFixed(4),
        ),
        dissent:
          disagreement > 0.02
            ? `Models disagree by ${Math.round(disagreement * 100)} pts on this bracket.`
            : "Models broadly agree.",
      }
    : null;

  return { emit, candidate, checks };
}

/**
 * Evaluate the gate for a completed run and log a paper trade for EVERY run —
 * the ensemble's best value pick — tagged with whether it also cleared the
 * strict gate (`gate_passed`). One trade per run (idempotent on run_id).
 */
export async function evaluateAndPersistGate(
  ev: BoxOfficeEvent,
  run: RunResult,
): Promise<GateResult> {
  // Self-tuned thresholds once enough trades have resolved, else the defaults.
  const tuned = (await learningActive()) ? await learnedGateThresholds() : null;
  const gate = evaluateGate(
    ev,
    run.ensemble,
    Object.values(run.consensus),
    tuned ?? {},
  );
  if (!gate.candidate) return gate;

  const db = getSupabase();
  if (!db) return gate;

  // One paper trade per run.
  const { data: existing } = await db
    .from("recommendations")
    .select("id")
    .eq("run_id", run.runId)
    .maybeSingle<{ id: string }>();
  if (existing) return gate;

  // Find the bracket_id for the candidate label.
  const { data: bracketRow } = await db
    .from("brackets")
    .select("id")
    .eq("market_id", run.marketId)
    .eq("label", gate.candidate.bracketLabel)
    .maybeSingle<{ id: string }>();
  if (!bracketRow) return gate;

  await db.from("recommendations").insert({
    run_id: run.runId,
    bracket_id: bracketRow.id,
    side: gate.candidate.side,
    exec_price: gate.candidate.execPrice,
    ensemble_prob: gate.candidate.ensembleProb,
    edge_pts: gate.candidate.edgePts,
    gate_results: gate.checks as unknown as Record<string, unknown>,
    gate_passed: gate.emit,
    status: "open",
  });

  return gate;
}
