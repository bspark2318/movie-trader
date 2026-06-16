-- Combined, idempotent: run once in the Supabase SQL editor. Bundles
-- migrations 0002 (realtime), 0003 (run cost), 0004 (paper trades).

-- ============ 0002: Realtime live board ============
drop policy if exists "public read runs" on runs;
create policy "public read runs" on runs for select to anon using (true);

drop policy if exists "public read agent_outputs" on agent_outputs;
create policy "public read agent_outputs" on agent_outputs for select to anon using (true);

do $$ begin
  alter publication supabase_realtime add table agent_outputs;
exception when duplicate_object then null; end $$;

-- ============ 0003: Cost tracking ============
alter table runs add column if not exists cost_usd numeric not null default 0;
alter table runs add column if not exists input_tokens bigint not null default 0;
alter table runs add column if not exists output_tokens bigint not null default 0;

-- ============ 0004: Paper-trade-every-run ============
alter table recommendations add column if not exists gate_passed boolean not null default true;
create unique index if not exists recommendations_one_per_run on recommendations (run_id);
