import { getSupabase } from "./client";
import type { AgentOutputRow, RunRow } from "./types";
import type { FeaturesJson } from "@/lib/features";
import type { AgentOutput, Phase } from "@/lib/agents/types";

/** Find or create today's run for a market. Idempotent on (market_id, date). */
export async function createOrResumeRun(
  marketId: string,
  features: FeaturesJson,
): Promise<RunRow> {
  const db = getSupabase();
  if (!db) throw new Error("DB required for runs");

  const today = new Date().toISOString().slice(0, 10);
  const { data: existing } = await db
    .from("runs")
    .select<"*", RunRow>()
    .eq("market_id", marketId)
    .gte("started_at", `${today}T00:00:00Z`)
    .lte("started_at", `${today}T23:59:59Z`)
    .maybeSingle<RunRow>();
  if (existing) return existing;

  const { data, error } = await db
    .from("runs")
    .insert({ market_id: marketId, features_json: features })
    .select()
    .single<RunRow>();
  if (error) throw new Error(`create run: ${error.message}`);
  return data;
}

export async function loadAgentOutputs(
  runId: string,
): Promise<AgentOutputRow[]> {
  const db = getSupabase();
  if (!db) return [];
  const { data } = await db
    .from("agent_outputs")
    .select<"*", AgentOutputRow>()
    .eq("run_id", runId);
  return data ?? [];
}

/** Latest run for a market plus its agent outputs, or null. */
export async function latestRunWithOutputs(
  marketId: string,
): Promise<{ run: RunRow; outputs: AgentOutputRow[] } | null> {
  const db = getSupabase();
  if (!db) return null;
  const { data: run } = await db
    .from("runs")
    .select<"*", RunRow>()
    .eq("market_id", marketId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle<RunRow>();
  if (!run) return null;
  const outputs = await loadAgentOutputs(run.id);
  return { run, outputs };
}

export async function saveAgentOutput(params: {
  runId: string;
  agent: string;
  model: string;
  phase: Phase;
  output: AgentOutput;
  raw: string;
}): Promise<void> {
  const db = getSupabase();
  if (!db) return;
  const { error } = await db.from("agent_outputs").upsert(
    {
      run_id: params.runId,
      agent: params.agent,
      model: params.model,
      phase: params.phase,
      bracket_probs: params.output.bracket_probs,
      confidence: params.output.confidence,
      evidence: params.output.key_evidence,
      raw_response: params.raw,
    },
    { onConflict: "run_id,agent,model,phase" },
  );
  if (error) throw new Error(`save agent_output: ${error.message}`);
}
