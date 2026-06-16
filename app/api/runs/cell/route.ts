import { NextRequest, NextResponse } from "next/server";
import { hasDb } from "@/lib/config";
import { getSupabase } from "@/lib/db/client";
import { extractJson } from "@/lib/agents/schema";
import type { AgentOutputRow } from "@/lib/db/types";

export const dynamic = "force-dynamic";

/**
 * Full reasoning trace for one matrix cell: its distribution, cited evidence,
 * what-would-change-my-mind / updated-on (recovered from the raw JSON), and the
 * prose narrative (raw text with the trailing JSON contract stripped off).
 */
export async function GET(req: NextRequest) {
  if (!hasDb()) return NextResponse.json({ ok: false, reason: "no-db" });
  const p = req.nextUrl.searchParams;
  const runId = p.get("runId");
  const agent = p.get("agent");
  const model = p.get("model");
  const phase = p.get("phase");
  if (!runId || !agent || !model || !phase) {
    return NextResponse.json({ ok: false, reason: "missing-params" });
  }

  const db = getSupabase()!;
  const { data: row } = await db
    .from("agent_outputs")
    .select<"*", AgentOutputRow>()
    .eq("run_id", runId)
    .eq("agent", agent)
    .eq("model", model)
    .eq("phase", phase)
    .maybeSingle<AgentOutputRow>();

  if (!row) return NextResponse.json({ ok: false, reason: "not-found" });

  // Recover the free-text reflection fields the model emitted in its JSON.
  const parsed = extractJson(row.raw_response) as {
    what_would_change_my_mind?: string;
    updated_on?: string;
  } | null;

  // Narrative = everything before the final fenced JSON contract block.
  const narrative = row.raw_response
    .replace(/```(?:json)?[\s\S]*?```\s*$/i, "")
    .trim();

  return NextResponse.json({
    ok: true,
    cell: {
      agent: row.agent,
      model: row.model,
      phase: row.phase,
      bracket_probs: row.bracket_probs,
      confidence: row.confidence,
      evidence: row.evidence ?? [],
      whatWouldChangeMyMind: parsed?.what_would_change_my_mind ?? "",
      updatedOn: parsed?.updated_on ?? "",
      narrative,
    },
  });
}
