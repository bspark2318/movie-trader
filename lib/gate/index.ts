import type { BoxOfficeEvent, Bracket } from "@/lib/polymarket/types";
import type { AgentOutput } from "@/lib/agents/types";
import { maxPairwiseDisagreement } from "@/lib/runs/consensus";
import { evPerShare, quarterKelly } from "@/lib/sizing/kelly";
import type { RunResult } from "@/lib/runs/orchestrator";
import { getSupabase } from "@/lib/db/client";

// Gate thresholds (probability points are 0..1 internally, expressed in pts in UI).
const AGREEMENT_MAX = 0.05; // ≤5 pts pairwise on the candidate bracket
const EDGE_MIN = 0.08; // ≥8 pts vs executable price
const LIQUIDITY_MIN = 100; // ≥ $100 depth
const SPREAD_MAX = 0.04; // ≤4 pts
const HOURS_MIN = 24; // > 24h to resolution

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
): GateResult {
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
      pass: disagreement <= AGREEMENT_MAX,
      maxPairwiseDisagreementPts: Math.round(disagreement * 100),
    },
    edge: {
      pass: (best?.edge ?? 0) >= EDGE_MIN,
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

  const candidate =
    best && emit
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
 * Evaluate the gate for a completed run and persist a recommendation row only
 * when it emits. Gate diagnostics for NO-BET runs are recomputed on demand.
 */
export async function evaluateAndPersistGate(
  ev: BoxOfficeEvent,
  run: RunResult,
): Promise<GateResult> {
  const gate = evaluateGate(ev, run.ensemble, Object.values(run.consensus));
  if (!gate.emit || !gate.candidate) return gate;

  const db = getSupabase();
  if (!db) return gate;

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
    status: "open",
  });

  return gate;
}
