-- audits was created in 009 with row level security enabled but no policies at
-- all, so every insert from the app (which uses the anon key) was rejected with
-- "new row violates row-level security policy" and the table stayed empty. That
-- silently broke the AI Audit Maker, the Demos tab's audit generator and the
-- audit section of the Master Demo.
--
-- Same policy shape as proposals in 010_proposals_enhancements.sql: anon needs
-- full access because the public report pages read audits without a session.

alter table audits enable row level security;

drop policy if exists "Anon full access to audits" on audits;
create policy "Anon full access to audits" on audits
  for all to anon using (true) with check (true);

drop policy if exists "Auth full access to audits" on audits;
create policy "Auth full access to audits" on audits
  for all to authenticated using (true) with check (true);
