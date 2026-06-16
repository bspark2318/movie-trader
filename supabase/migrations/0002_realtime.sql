-- Live board via Supabase Realtime.
-- Lets the browser (publishable/anon key) READ run progress and subscribe to
-- new cells. Writes stay locked to the server's secret key — this only opens
-- reads, and only on paper-trade research data (no secrets, no PII).

-- (a) Read policies for the anon role used by the publishable key.
create policy "public read runs"
  on runs for select to anon using (true);

create policy "public read agent_outputs"
  on agent_outputs for select to anon using (true);

-- (b) Opt the table into Realtime so Postgres broadcasts its row changes.
alter publication supabase_realtime add table agent_outputs;
