-- Cost tracking: model spend per run (estimated from token usage + a web-search
-- surcharge). Lets the app show $/run and a cumulative total.
alter table runs add column if not exists cost_usd numeric not null default 0;
alter table runs add column if not exists input_tokens bigint not null default 0;
alter table runs add column if not exists output_tokens bigint not null default 0;
