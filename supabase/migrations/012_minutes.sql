-- minute_balance / minute_transactions already exist (001_initial_schema.sql) with
-- RLS enabled and auth.uid()-based policies only — that blocks anon access, same
-- issue profile/proposals hit before. No new columns needed, just anon policies.

drop policy if exists "Anon full access to minute_balance" on minute_balance;
create policy "Anon full access to minute_balance" on minute_balance
  for all to anon using (true) with check (true);

drop policy if exists "Auth full access to minute_balance" on minute_balance;
create policy "Auth full access to minute_balance" on minute_balance
  for all to authenticated using (true) with check (true);

drop policy if exists "Anon full access to minute_transactions" on minute_transactions;
create policy "Anon full access to minute_transactions" on minute_transactions
  for all to anon using (true) with check (true);

drop policy if exists "Auth full access to minute_transactions" on minute_transactions;
create policy "Auth full access to minute_transactions" on minute_transactions
  for all to authenticated using (true) with check (true);

create index if not exists minute_transactions_created on minute_transactions (created_at desc);
