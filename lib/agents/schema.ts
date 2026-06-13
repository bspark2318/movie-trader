import { z } from "zod";
import type { AgentOutput } from "./types";

export const agentOutputSchema = z.object({
  bracket_probs: z.record(z.string(), z.number()),
  confidence: z.enum(["low", "medium", "high"]),
  key_evidence: z.array(z.string()).default([]),
  what_would_change_my_mind: z.string().default(""),
  updated_on: z.string().optional(),
});

/** Pull the last fenced ```json block (or last bare {...}) from model text. */
export function extractJson(raw: string): unknown | null {
  const fences = [...raw.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
  const candidates = fences.map((m) => m[1].trim());
  // Fall back to the last balanced-looking object if no fence.
  if (candidates.length === 0) {
    const start = raw.lastIndexOf("{");
    const end = raw.lastIndexOf("}");
    if (start !== -1 && end > start) candidates.push(raw.slice(start, end + 1));
  }
  for (const c of candidates.reverse()) {
    try {
      return JSON.parse(c);
    } catch {
      /* try next */
    }
  }
  return null;
}

/** Renormalize probabilities to sum to 1, restricted to known bracket labels. */
export function renormalize(
  probs: Record<string, number>,
  labels: string[],
): Record<string, number> {
  const out: Record<string, number> = {};
  let sum = 0;
  for (const label of labels) {
    const v = Math.max(0, probs[label] ?? 0);
    out[label] = v;
    sum += v;
  }
  if (sum <= 0) {
    // Degenerate — uniform prior.
    const u = 1 / labels.length;
    for (const label of labels) out[label] = u;
    return out;
  }
  for (const label of labels) out[label] /= sum;
  return out;
}

export interface ValidationResult {
  ok: boolean;
  output?: AgentOutput;
  error?: string;
}

/**
 * Parse + validate a raw model response against the output contract.
 * Returns a renormalized AgentOutput, or an error string for the retry loop.
 */
export function validateAgentOutput(
  raw: string,
  labels: string[],
): ValidationResult {
  const json = extractJson(raw);
  if (json === null) {
    return { ok: false, error: "No JSON object found in the response." };
  }
  const parsed = agentOutputSchema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      error: `JSON did not match the schema: ${parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    };
  }

  const known = parsed.data.bracket_probs;
  const missing = labels.filter((l) => !(l in known));
  const extra = Object.keys(known).filter((l) => !labels.includes(l));
  if (missing.length > 0 || extra.length > 0) {
    return {
      ok: false,
      error:
        `bracket_probs keys must be exactly: ${labels.join(", ")}. ` +
        (missing.length ? `Missing: ${missing.join(", ")}. ` : "") +
        (extra.length ? `Unexpected: ${extra.join(", ")}. ` : ""),
    };
  }

  return {
    ok: true,
    output: {
      ...parsed.data,
      bracket_probs: renormalize(known, labels),
    },
  };
}
