-- Paper-trade-every-run: log a trade on every run (the ensemble's best value
-- pick), not only when the strict gate passes. `gate_passed` records whether it
-- also cleared the 4-condition gate, so you can compare all trades vs
-- gate-approved only. One paper trade per run.
alter table recommendations
  add column if not exists gate_passed boolean not null default true;

create unique index if not exists recommendations_one_per_run
  on recommendations (run_id);
