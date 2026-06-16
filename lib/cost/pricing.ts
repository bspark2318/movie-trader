import type { ProviderName } from "@/lib/config";

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

/**
 * Token prices in USD per 1M tokens. ESTIMATES — update as prices move. Keyed by
 * a model-id substring so swapping a seat's model (e.g. Opus → Sonnet) prices
 * correctly; falls back to a per-provider default if no id matches.
 */
export const MODEL_PRICES: Record<string, { in: number; out: number }> = {
  "claude-opus": { in: 15, out: 75 },
  "claude-sonnet": { in: 3, out: 15 },
  "claude-haiku": { in: 1, out: 5 },
  "gpt-5": { in: 1.25, out: 10 },
  "gemini-2.5-pro": { in: 1.25, out: 10 },
  "gemini-2.5-flash": { in: 0.3, out: 2.5 },
};

const PROVIDER_FALLBACK: Record<ProviderName, { in: number; out: number }> = {
  anthropic: { in: 15, out: 75 },
  openai: { in: 1.25, out: 10 },
  google: { in: 1.25, out: 10 },
};

function priceFor(provider: ProviderName, modelId: string) {
  const id = modelId.toLowerCase();
  for (const [key, price] of Object.entries(MODEL_PRICES))
    if (id.includes(key)) return price;
  return PROVIDER_FALLBACK[provider];
}

/**
 * Rough surcharge for a web-search-enabled call. Provider web search bills per
 * search (~$10/1k) plus the searched content lands in tokens (already counted).
 * We can't reliably count searches through the SDK, so approximate a few per
 * call. Backtest calls (search off) pay $0 here.
 */
export const SEARCH_SURCHARGE_USD = 0.03;

export function computeCallCost(
  provider: ProviderName,
  modelId: string,
  usage: Usage,
  searchOn: boolean,
): number {
  const price = priceFor(provider, modelId);
  const tokenCost =
    (usage.inputTokens / 1_000_000) * price.in +
    (usage.outputTokens / 1_000_000) * price.out;
  return tokenCost + (searchOn ? SEARCH_SURCHARGE_USD : 0);
}
