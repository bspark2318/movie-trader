# movie-trader

A research tool that hunts for probability edges in **Polymarket box-office
opening-weekend markets** using an ensemble of LLM agents with methodologically
distinct research approaches. Agents research independently, run a consensus
round, and the system emits a bet recommendation **only** when the agents agree
*and* diverge from the executable market price. Every prediction is logged and
Brier-scored after the weekend resolves.

**Paper-trade only.** No real capital until the ensemble beats the market's own
Brier score over ≥25 resolved markets — which it might not, and that's a valid
finding.

> Research tool, not financial advice.

## How it works

```
Polymarket (Gamma API) ──► market list + bracket prices
The Numbers (scraper)  ──► comps, holdovers, release schedule, final grosses
static calendar/weather──► holiday/school/extreme-weather features
                            │
                            ▼
        ┌──────────── 3×3 agent matrix ────────────┐
        │  3 models (Claude · GPT · Gemini)         │
        │   ×                                       │
        │  3 methods (Comps · Tracking · Demand)    │  ← each blinded to the others' method
        │   = 9 independent web-researched forecasts│
        └───────────────────┬───────────────────────┘
                            │  per-method median across models
                            ▼
              3 consensus revisions (one per model)
                            │  median ensemble
                            ▼
         recommendation gate (agreement · edge · liquidity · timing)
                            │
                            ▼
              BET / NO-BET  →  logged  →  Brier-scored on resolution
```

The edge hypothesis is **not** information access (tracking consensus is already
in the price) — it's the range→bracket distribution math, the divergence
*between* methods, and revision dynamics.

## Stack

Next.js (App Router) · TypeScript · Tailwind · Supabase (Postgres) ·
[Vercel AI SDK](https://ai-sdk.dev) (Anthropic + OpenAI + Google). Every agent's
model is a config string — swap any seat to any provider with an env var.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in keys as you get them
npm run dev
```

The app **degrades gracefully**: with an empty `.env` you still get the live
market list and bracket prices from Polymarket. DB-backed features (runs,
scoring, calibration) light up once Supabase is connected.

1. **Database (optional):** create a Supabase project, run
   `supabase/migrations/0001_init.sql` in the SQL editor, then set
   `SUPABASE_URL` / `SUPABASE_SERVICE_KEY`.
2. **Agents:** set `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`
   (all three are needed for a run). Override model seats with
   `MODEL_ANTHROPIC` / `MODEL_OPENAI` / `MODEL_GOOGLE`.
3. **Runs:** trigger manually from `/runs` (`RUN_MODE=manual`, the default), or
   set `RUN_MODE=auto` to let the daily cron run markets within
   `AUTO_RUN_WINDOW_DAYS` of resolution. A run is ~12 LLM calls.

## Pages

- `/` — active box-office markets + live bracket prices
- `/market/[slug]` — bracket prices, agent matrix, ensemble vs market, gate panel
- `/runs` — trigger runs, run history
- `/calibration` — Brier leaderboard, reliability curve, go/no-go banner

## Cron (Vercel)

`vercel.json` schedules three daily jobs (protected by `CRON_SECRET`):
`snapshot` (free price snapshots), `run` (auto-runs if enabled), `resolve`
(settles past markets from final The Numbers figures and writes Brier scores).

## Tests

```bash
npx tsx --test 'lib/**/*.test.ts'
```

Covers the deterministic core: Gamma bracket/tie-rule parsing, The Numbers chart
parsing, output-schema validation, consensus median, the gate, Kelly sizing, and
Brier scoring. Agent calls themselves need live API keys.

## Gotchas baked in

- Gamma `outcomes` / `outcomePrices` arrive as JSON-encoded **strings** — parsed.
- Each market's `description` (resolution rules) is captured verbatim and passed
  to the agents — 3-day vs 4-day weekends, Thursday previews, finals-not-estimates.
- Tie rule: a boundary gross resolves to the **higher** bracket.
- Resolution waits ≥10 days post-weekend for final figures, not Sunday estimates.
