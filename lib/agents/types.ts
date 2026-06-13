import type { FeaturesJson } from "@/lib/features";
import type { ProviderName } from "@/lib/config";

/** The three research methods (also the `agent` column value). */
export type MethodName =
  | "comps_quant"
  | "tracking_interpreter"
  | "demand_signals";

export const METHODS: MethodName[] = [
  "comps_quant",
  "tracking_interpreter",
  "demand_signals",
];

export type Phase = "independent" | "consensus";

export interface AgentOutput {
  /** Probabilities keyed by bracket label; sum ~1 after renormalize. */
  bracket_probs: Record<string, number>;
  confidence: "low" | "medium" | "high";
  key_evidence: string[];
  what_would_change_my_mind: string;
  /** Consensus phase only: what this model revised on. */
  updated_on?: string;
}

export interface AgentBrief {
  movieTitle: string;
  question: string;
  brackets: { label: string; bestAsk: number; mid: number }[];
  resolutionRules: string;
  features: FeaturesJson;
}

/** One cell of the matrix: a (model seat × method) result. */
export interface CellResult {
  method: MethodName;
  provider: ProviderName;
  modelId: string;
  phase: Phase;
  output: AgentOutput;
  raw: string;
}
