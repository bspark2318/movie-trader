import { z } from "zod";

const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_KEY: z.string().optional(),
  OPENWEATHER_API_KEY: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  // Per-provider model overrides — any agent seat can run any model.
  MODEL_ANTHROPIC: z.string().default("claude-opus-4-8"),
  MODEL_OPENAI: z.string().default("gpt-5.1"),
  MODEL_GOOGLE: z.string().default("gemini-2.5-pro"),
  RUN_MODE: z.enum(["manual", "auto"]).default("manual"),
  AUTO_RUN_WINDOW_DAYS: z.coerce.number().int().positive().default(7),
  // Paper-trading: notional starting bankroll for the P&L ledger (no real money).
  PAPER_BANKROLL: z.coerce.number().positive().default(1000),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function env(): Env {
  if (!cached) cached = envSchema.parse(process.env);
  return cached;
}

export function hasDb(): boolean {
  const e = env();
  return Boolean(e.SUPABASE_URL && e.SUPABASE_SERVICE_KEY);
}

export type ProviderName = "anthropic" | "openai" | "google";

export function providerKeys(): Record<ProviderName, boolean> {
  const e = env();
  return {
    anthropic: Boolean(e.ANTHROPIC_API_KEY),
    openai: Boolean(e.OPENAI_API_KEY),
    google: Boolean(e.GOOGLE_API_KEY),
  };
}

export function missingProviderKeys(): ProviderName[] {
  return (Object.entries(providerKeys()) as [ProviderName, boolean][])
    .filter(([, ok]) => !ok)
    .map(([name]) => name);
}

/** The three model seats of the matrix. Method blinding is per-call, not per-seat. */
export function matrixModels(): { provider: ProviderName; modelId: string }[] {
  const e = env();
  return [
    { provider: "anthropic", modelId: e.MODEL_ANTHROPIC },
    { provider: "openai", modelId: e.MODEL_OPENAI },
    { provider: "google", modelId: e.MODEL_GOOGLE },
  ];
}
