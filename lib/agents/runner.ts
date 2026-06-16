import { generateText, stepCountIs, type LanguageModel, type ToolSet } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { env, type ProviderName } from "@/lib/config";
import { validateAgentOutput } from "./schema";
import { computeCallCost } from "@/lib/cost/pricing";
import type { AgentOutput } from "./types";

interface ProviderHandle {
  model: (id: string) => LanguageModel;
  webSearch: () => ToolSet;
}

function providerHandle(provider: ProviderName): ProviderHandle {
  const e = env();
  switch (provider) {
    case "anthropic": {
      const p = createAnthropic({ apiKey: e.ANTHROPIC_API_KEY });
      return {
        model: (id) => p(id),
        webSearch: () => ({
          web_search: p.tools.webSearch_20250305({ maxUses: 8 }),
        }),
      };
    }
    case "openai": {
      const p = createOpenAI({ apiKey: e.OPENAI_API_KEY });
      return {
        model: (id) => p(id),
        webSearch: () => ({ web_search: p.tools.webSearch({}) }),
      };
    }
    case "google": {
      const p = createGoogleGenerativeAI({ apiKey: e.GOOGLE_API_KEY });
      return {
        model: (id) => p(id),
        webSearch: () => ({ google_search: p.tools.googleSearch({}) }),
      };
    }
  }
}

export interface RunCellParams {
  provider: ProviderName;
  modelId: string;
  system: string;
  prompt: string;
  /** Bracket labels the output must cover. */
  labels: string[];
  /** Max tool/generation steps for the web-search loop. */
  maxSteps?: number;
  /** Disable web search (backtest mode: agents must not look up the result). */
  webSearch?: boolean;
}

export interface RunCellResult {
  output: AgentOutput;
  raw: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Run one matrix cell: provider + model + method-specific system prompt, with
 * unrestricted web search. Validates the strict-JSON output, retrying ONCE with
 * the validation error appended if the first response is malformed.
 */
// TODO(cost): a Batch API path (~50% cheaper, async ≤24h) fits the Mon/Thu
// scheduled cadence — submit/poll across separate cron invocations, state in DB.
// Skipped for now: cheap models already make a run ~$0.40, so batch saves ~$1.50/mo.
export async function runCell(p: RunCellParams): Promise<RunCellResult> {
  const handle = providerHandle(p.provider);
  const model = handle.model(p.modelId);
  const searchOn = p.webSearch !== false;
  const tools = searchOn ? handle.webSearch() : undefined;
  const maxSteps = p.maxSteps ?? (searchOn ? 10 : 1);

  // Accumulate token cost across every call this cell makes (incl. a retry).
  let inputTokens = 0;
  let outputTokens = 0;

  async function once(promptText: string): Promise<string> {
    const res = await generateText({
      model,
      system: p.system,
      prompt: promptText,
      tools,
      stopWhen: stepCountIs(maxSteps),
    });
    inputTokens += res.usage?.inputTokens ?? 0;
    outputTokens += res.usage?.outputTokens ?? 0;
    return res.text;
  }

  function done(output: AgentOutput, raw: string): RunCellResult {
    return {
      output,
      raw,
      inputTokens,
      outputTokens,
      costUsd: computeCallCost(
        p.provider,
        p.modelId,
        { inputTokens, outputTokens },
        searchOn,
      ),
    };
  }

  const first = await once(p.prompt);
  let v = validateAgentOutput(first, p.labels);
  if (v.ok) return done(v.output!, first);

  // One retry: feed back the validation error, demand JSON only.
  const retryPrompt = `${p.prompt}

Your previous answer was rejected: ${v.error}
Respond again. End with ONLY the corrected fenced JSON object matching the contract exactly.`;
  const second = await once(retryPrompt);
  v = validateAgentOutput(second, p.labels);
  if (v.ok) return done(v.output!, second);

  throw new Error(`Agent output invalid after retry (${p.provider}): ${v.error}`);
}
