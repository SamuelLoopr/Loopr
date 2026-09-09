-- review_clients has row level security enabled with policies that cover reads,
-- inserts and updates but not deletes. A delete therefore matches no policy,
-- PostgREST filters the row out of the statement, and the API answers 200 with
-- zero rows affected — so the app gets a "success" for a delete that never
-- happened. Verified against the live database: 6 rows before the delete,
-- 6 rows after, no error raised.
--
-- Nothing in the UI deletes a review client today, which is why this stayed
-- hidden; it would have silently failed the moment a delete button was added.
--
-- Same policy shape as audits in 016_audits_rls.sql and proposals in
-- 010_proposals_enhancements.sql: "for all" covers select/insert/update/delete,
-- and anon needs access because the public /demo/[shareId] page reads
-- review_clients without a session.
--
-- RLS policies are permissive and OR'd together, so adding these alongside the
-- existing ones only widens access to the operation that was missing.

alter table review_clients enable row level security;

drop policy if exists "Anon full access to review_clients" on review_clients;
create policy "Anon full access to review_clients" on review_clients
  for all to anon using (true) with check (true);

drop policy if exists "Auth full access to review_clients" on review_clients;
create policy "Auth full access to review_clients" on review_clients
  for all to authenticated using (true) with check (true);
