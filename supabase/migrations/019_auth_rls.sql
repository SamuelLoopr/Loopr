-- Lock every dashboard table to signed-in users.
--
-- Before this migration every table answered the anon key — the same key that
-- ships to every browser in NEXT_PUBLIC_SUPABASE_ANON_KEY. Verified against the
-- live database on 2026-09-09: an anonymous PostgREST read returned 16 leads,
-- 2 call_logs (transcripts), 4 agents (prompt_text, i.e. each customer's whole
-- knowledge base), 9 activity_log, 7 daily_checklist, 3 crm_lists and
-- 2 speed_to_lead_agents rows. Hiding the dashboard behind a login does nothing
-- about that on its own, which is what this file is for.
--
-- PREREQUISITE: SUPABASE_SERVICE_ROLE_KEY must be set in .env.local and the app
-- restarted BEFORE running this. The public share links, the Twilio
-- incoming-call webhook and the per-agent inbound webhook resolve agents from
-- the server; they used to do it with the anon key, which is why anon could not
-- previously be closed. lib/supabase-server.ts now gives them the service-role
-- key, which bypasses RLS, so anon can lose its access entirely. Run this
-- without that key set and the customer demos and inbound calls will break.
--
-- RLS policies are permissive and OR'd together, so an old "anon can do
-- everything" policy left in place would silently defeat a new one — every
-- policy replaced below is therefore dropped by name first.
--
-- On `to authenticated using (true)`: this is deliberately role-level, not
-- ownership-level. Supabase's own guidance is to pair `to authenticated` with an
-- `auth.uid() = user_id` predicate, and that is the right shape for a
-- multi-tenant app. It is wrong here: this is a single-operator dashboard whose
-- rows were all written before auth existed and therefore have user_id NULL, so
-- an ownership predicate would lock the owner out of their own data. Access is
-- instead controlled at the door — signups disabled in Supabase, plus the
-- DASHBOARD_ALLOWED_EMAILS allow-list in middleware.ts. Revisit when rows start
-- carrying a real user_id.

-- ---------------------------------------------------------------------------
-- 1. Dashboard-only tables — no public page, API route or webhook touches these.
--    Eight of them never had RLS enabled at all.
-- ---------------------------------------------------------------------------

alter table leads                enable row level security;
alter table meetings             enable row level security;
alter table activity_log         enable row level security;
alter table daily_checklist      enable row level security;
alter table scrape_usage         enable row level security;
alter table speed_to_lead_agents enable row level security;
alter table speed_to_lead_calls  enable row level security;
alter table review_requests      enable row level security;

drop policy if exists "Auth full access to leads" on leads;
create policy "Auth full access to leads" on leads
  for all to authenticated using (true) with check (true);

drop policy if exists "Auth full access to meetings" on meetings;
create policy "Auth full access to meetings" on meetings
  for all to authenticated using (true) with check (true);

drop policy if exists "Auth full access to activity_log" on activity_log;
create policy "Auth full access to activity_log" on activity_log
  for all to authenticated using (true) with check (true);

drop policy if exists "Auth full access to daily_checklist" on daily_checklist;
create policy "Auth full access to daily_checklist" on daily_checklist
  for all to authenticated using (true) with check (true);

drop policy if exists "Auth full access to scrape_usage" on scrape_usage;
create policy "Auth full access to scrape_usage" on scrape_usage
  for all to authenticated using (true) with check (true);

drop policy if exists "Auth full access to speed_to_lead_agents" on speed_to_lead_agents;
create policy "Auth full access to speed_to_lead_agents" on speed_to_lead_agents
  for all to authenticated using (true) with check (true);

drop policy if exists "Auth full access to speed_to_lead_calls" on speed_to_lead_calls;
create policy "Auth full access to speed_to_lead_calls" on speed_to_lead_calls
  for all to authenticated using (true) with check (true);

drop policy if exists "Auth full access to review_requests" on review_requests;
create policy "Auth full access to review_requests" on review_requests
  for all to authenticated using (true) with check (true);

-- crm_lists: 004_crm_channel gave anon access to every list with a NULL user_id
-- as a stand-in for ownership before auth existed. That is every list in the
-- table, and auth exists now, so the anon half goes.
drop policy if exists "CRM lists - anon device access" on crm_lists;
drop policy if exists "CRM lists - authenticated users" on crm_lists;
drop policy if exists "Users own their CRM lists" on crm_lists;
create policy "Auth full access to crm_lists" on crm_lists
  for all to authenticated using (true) with check (true);

-- Billing tables: 011 and 012 opened these to anon. Nothing public reads them.
drop policy if exists "Anon full access to invoices" on invoices;
drop policy if exists "Auth full access to invoices" on invoices;
create policy "Auth full access to invoices" on invoices
  for all to authenticated using (true) with check (true);

drop policy if exists "Anon full access to minute_balance" on minute_balance;
drop policy if exists "Auth full access to minute_balance" on minute_balance;
drop policy if exists "Users own their minute balance" on minute_balance;
create policy "Auth full access to minute_balance" on minute_balance
  for all to authenticated using (true) with check (true);

drop policy if exists "Anon full access to minute_transactions" on minute_transactions;
drop policy if exists "Auth full access to minute_transactions" on minute_transactions;
drop policy if exists "Users own their minute transactions" on minute_transactions;
create policy "Auth full access to minute_transactions" on minute_transactions
  for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- 2. Tables the server reaches on behalf of anonymous visitors.
--    These are now served by the service-role key, which bypasses RLS, so anon
--    gets no policy at all — not even INSERT.
-- ---------------------------------------------------------------------------

-- call_logs never had RLS, so call transcripts were world-readable. The public
-- voice demo, the Twilio webhook and the inbound webhook all write rows here,
-- and all three now run on the service-role key.
alter table call_logs enable row level security;

drop policy if exists "Anon may log calls"        on call_logs;
drop policy if exists "Auth full access to call_logs" on call_logs;
create policy "Auth full access to call_logs" on call_logs
  for all to authenticated using (true) with check (true);

-- agents: read by /api/public-agent/*, /api/twilio/incoming-call and
-- /api/webhooks/[token] — all server-side on the service-role key. No public
-- page queries agents from the browser, so anon needs nothing.
alter table agents enable row level security;

drop policy if exists "Anon may read agents"       on agents;
drop policy if exists "Auth full access to agents" on agents;
create policy "Auth full access to agents" on agents
  for all to authenticated using (true) with check (true);

-- phone_numbers: read only by the Twilio incoming-call webhook (service role).
drop policy if exists "Anon full access to phone_numbers" on phone_numbers;
drop policy if exists "Anon may read phone_numbers"       on phone_numbers;
drop policy if exists "Auth full access to phone_numbers" on phone_numbers;
create policy "Auth full access to phone_numbers" on phone_numbers
  for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- 3. Tables the customer-facing share pages read straight from the browser.
--    These genuinely need anon access — it is the anon key doing the reading.
-- ---------------------------------------------------------------------------

-- profile: /forslag/[shareId] shows the sender's name and contact details.
-- 010 gave anon full access; it only ever reads, so anon drops to SELECT.
drop policy if exists "Anon full access to profile" on profile;
drop policy if exists "Users own their profile"     on profile;

drop policy if exists "Auth full access to profile" on profile;
create policy "Auth full access to profile" on profile
  for all to authenticated using (true) with check (true);

drop policy if exists "Anon may read profile" on profile;
create policy "Anon may read profile" on profile
  for select to anon using (true);

-- Deliberately NOT touched — the share pages query these from the browser with
-- the anon key, and their existing anon policies exist for that reason:
--   audits          -> /audit/[shareId]      (016_audits_rls.sql)
--   review_clients  -> /demo/[shareId]       (018_review_clients_delete_policy.sql)
--   proposals       -> /forslag/[shareId]    (010_proposals_enhancements.sql)
-- Note proposals also takes an UPDATE from that page (status -> 'viewed'), which
-- in Postgres needs a SELECT policy as well; its existing "for all" anon policy
-- covers both.


-- ---------------------------------------------------------------------------
-- ROLLBACK — restores the pre-migration behaviour if something breaks.
-- ---------------------------------------------------------------------------
--
-- alter table leads                disable row level security;
-- alter table meetings             disable row level security;
-- alter table activity_log         disable row level security;
-- alter table daily_checklist      disable row level security;
-- alter table scrape_usage         disable row level security;
-- alter table speed_to_lead_agents disable row level security;
-- alter table speed_to_lead_calls  disable row level security;
-- alter table review_requests      disable row level security;
-- alter table call_logs            disable row level security;
-- alter table agents               disable row level security;
-- create policy "Anon full access to profile" on profile
--   for all to anon using (true) with check (true);
-- create policy "Anon full access to phone_numbers" on phone_numbers
--   for all to anon using (true) with check (true);
-- create policy "Anon full access to invoices" on invoices
--   for all to anon using (true) with check (true);
-- create policy "Anon full access to minute_balance" on minute_balance
--   for all to anon using (true) with check (true);
-- create policy "Anon full access to minute_transactions" on minute_transactions
--   for all to anon using (true) with check (true);
