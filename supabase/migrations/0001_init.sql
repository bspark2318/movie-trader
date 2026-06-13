-- movie-trader initial schema
-- Run this in the Supabase SQL editor (or `supabase db push`).

create extension if not exists pgcrypto;

create table if not exists markets (
  id uuid primary key default gen_random_uuid(),
  polymarket_event_id text not null unique,
  slug text not null,
  title text not null,
  movie_title text not null default '',
  resolution_rules text not null default '',
  end_date timestamptz,
  weekend_type text not null default 'unknown',
  created_at timestamptz not null default now()
);

create table if not exists brackets (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references markets(id) on delete cascade,
  polymarket_market_id text not null,
  label text not null,
  lo_millions numeric,
  hi_millions numeric,
  clob_token_ids text not null default '[]',
  unique (market_id, label)
);

create table if not exists price_snapshots (
  id uuid primary key default gen_random_uuid(),
  bracket_id uuid not null references brackets(id) on delete cascade,
  best_bid numeric not null default 0,
  best_ask numeric not null default 0,
  mid numeric not null default 0,
  volume24hr numeric not null default 0,
  liquidity numeric not null default 0,
  snapped_at timestamptz not null default now()
);
create index if not exists price_snapshots_bracket_time
  on price_snapshots (bracket_id, snapped_at desc);

create table if not exists runs (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references markets(id) on delete cascade,
  features_json jsonb not null default '{}',
  started_at timestamptz not null default now()
);
-- Run identity: one run per market per UTC day (idempotent re-trigger resumes it).
-- AT TIME ZONE 'UTC' makes the expression IMMUTABLE (plain date() is not).
create unique index if not exists runs_market_day
  on runs (market_id, ((started_at at time zone 'UTC')::date));

-- 3x3 matrix: `agent` holds the method name (comps_quant | tracking_interpreter
-- | demand_signals | consensus), `model` holds the provider seat.
create table if not exists agent_outputs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs(id) on delete cascade,
  agent text not null,
  model text not null,
  phase text not null check (phase in ('independent', 'consensus')),
  bracket_probs jsonb not null default '{}',
  confidence text not null default 'low',
  evidence jsonb not null default '[]',
  raw_response text not null default '',
  created_at timestamptz not null default now(),
  unique (run_id, agent, model, phase)
);

create table if not exists recommendations (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs(id) on delete cascade,
  bracket_id uuid not null references brackets(id) on delete cascade,
  side text not null check (side in ('buy_yes', 'buy_no')),
  exec_price numeric not null,
  ensemble_prob numeric not null,
  edge_pts numeric not null,
  gate_results jsonb not null default '{}',
  status text not null default 'open' check (status in ('open', 'won', 'lost')),
  created_at timestamptz not null default now()
);

create table if not exists resolutions (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references markets(id) on delete cascade unique,
  final_gross_millions numeric not null,
  winning_bracket_id uuid references brackets(id),
  resolved_at timestamptz not null default now(),
  source text not null default 'the-numbers'
);

create table if not exists scores (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs(id) on delete cascade,
  agent text not null,
  model text not null default '',
  brier numeric not null,
  market_brier numeric not null,
  created_at timestamptz not null default now(),
  unique (run_id, agent, model)
);
