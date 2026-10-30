-- RLS: inloggade användare ser bara data om de är operatör.
--
-- 019 och senare migrationer gav varje inloggad användare full åtkomst
-- ("for all to authenticated using (true)") till 23 tabeller, bland annat
-- call_logs med transkripten. Med registreringen öppen kunde vem som helst
-- skapa ett konto och läsa allt. Registreringen är nu avstängd i Supabase;
-- det här är skyddet i databasen, så att ett nytt konto ändå inte ser något.
--
-- Varför en operatörslista och inte user_id = auth.uid(): de flesta tabellerna
-- (agents, call_logs, leads, proposals …) har ingen user_id-kolumn. Det finns
-- en operatör i dag. Fyra tabeller med user_id har dessutom rader som tillhör
-- konton som inte längre finns, och de hade försvunnit ur dashboarden.
--
-- Servern (webhooks, BOS, samtalen) kör på service-rollen och påverkas inte:
-- service-rollen går förbi RLS.
--
-- profile rörs inte här: den har redan ägarregler (021).
-- Anon-reglerna på audits, proposals, review_clients och profile rörs inte
-- här heller — de bärs av publika sidor och behöver flyttas till servern först.

create table if not exists public.operators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
-- RLS utan policyer: bara service-rollen (och is_operator nedan) kan läsa den.
alter table public.operators enable row level security;

insert into public.operators (user_id) values ('c8bc6526-8166-459b-b0f6-649c8c3f8732') on conflict do nothing;

-- security definer så att policyerna kan fråga operators utan egen åtkomst.
create or replace function public.is_operator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.operators where user_id = (select auth.uid()))
$$;
revoke all on function public.is_operator() from public, anon;
grant execute on function public.is_operator() to authenticated;

drop policy if exists "Auth full access to activity_log" on activity_log;
drop policy if exists "Operator full access to activity_log" on activity_log;
create policy "Operator full access to activity_log" on activity_log
  for all to authenticated using ((select public.is_operator())) with check ((select public.is_operator()));
drop policy if exists "Auth full access to agents" on agents;
drop policy if exists "Operator full access to agents" on agents;
create policy "Operator full access to agents" on agents
  for all to authenticated using ((select public.is_operator())) with check ((select public.is_operator()));
drop policy if exists "Auth full access to audits" on audits;
drop policy if exists "Operator full access to audits" on audits;
create policy "Operator full access to audits" on audits
  for all to authenticated using ((select public.is_operator())) with check ((select public.is_operator()));
drop policy if exists "Auth full access to bos_bookings" on bos_bookings;
drop policy if exists "Operator full access to bos_bookings" on bos_bookings;
create policy "Operator full access to bos_bookings" on bos_bookings
  for all to authenticated using ((select public.is_operator())) with check ((select public.is_operator()));
drop policy if exists "Auth full access to call_logs" on call_logs;
drop policy if exists "Operator full access to call_logs" on call_logs;
create policy "Operator full access to call_logs" on call_logs
  for all to authenticated using ((select public.is_operator())) with check ((select public.is_operator()));
drop policy if exists "Auth full access to call_sms_replies" on call_sms_replies;
drop policy if exists "Operator full access to call_sms_replies" on call_sms_replies;
create policy "Operator full access to call_sms_replies" on call_sms_replies
  for all to authenticated using ((select public.is_operator())) with check ((select public.is_operator()));
drop policy if exists "Auth full access to crm_lists" on crm_lists;
drop policy if exists "CRM lists - authenticated users" on crm_lists;
drop policy if exists "Operator full access to crm_lists" on crm_lists;
create policy "Operator full access to crm_lists" on crm_lists
  for all to authenticated using ((select public.is_operator())) with check ((select public.is_operator()));
drop policy if exists "Auth full access to daily_checklist" on daily_checklist;
drop policy if exists "Operator full access to daily_checklist" on daily_checklist;
create policy "Operator full access to daily_checklist" on daily_checklist
  for all to authenticated using ((select public.is_operator())) with check ((select public.is_operator()));
drop policy if exists "Auth full access to elks_inbound_calls" on elks_inbound_calls;
drop policy if exists "Operator full access to elks_inbound_calls" on elks_inbound_calls;
create policy "Operator full access to elks_inbound_calls" on elks_inbound_calls
  for all to authenticated using ((select public.is_operator())) with check ((select public.is_operator()));
drop policy if exists "Auth full access to invoices" on invoices;
drop policy if exists "Operator full access to invoices" on invoices;
create policy "Operator full access to invoices" on invoices
  for all to authenticated using ((select public.is_operator())) with check ((select public.is_operator()));
drop policy if exists "Auth full access to lead_search_results" on lead_search_results;
drop policy if exists "Operator full access to lead_search_results" on lead_search_results;
create policy "Operator full access to lead_search_results" on lead_search_results
  for all to authenticated using ((select public.is_operator())) with check ((select public.is_operator()));
drop policy if exists "Auth full access to lead_searches" on lead_searches;
drop policy if exists "Operator full access to lead_searches" on lead_searches;
create policy "Operator full access to lead_searches" on lead_searches
  for all to authenticated using ((select public.is_operator())) with check ((select public.is_operator()));
drop policy if exists "Auth full access to leads" on leads;
drop policy if exists "Operator full access to leads" on leads;
create policy "Operator full access to leads" on leads
  for all to authenticated using ((select public.is_operator())) with check ((select public.is_operator()));
drop policy if exists "Auth full access to meetings" on meetings;
drop policy if exists "Operator full access to meetings" on meetings;
create policy "Operator full access to meetings" on meetings
  for all to authenticated using ((select public.is_operator())) with check ((select public.is_operator()));
drop policy if exists "Auth full access to minute_balance" on minute_balance;
drop policy if exists "Operator full access to minute_balance" on minute_balance;
create policy "Operator full access to minute_balance" on minute_balance
  for all to authenticated using ((select public.is_operator())) with check ((select public.is_operator()));
drop policy if exists "Auth full access to minute_transactions" on minute_transactions;
drop policy if exists "Operator full access to minute_transactions" on minute_transactions;
create policy "Operator full access to minute_transactions" on minute_transactions
  for all to authenticated using ((select public.is_operator())) with check ((select public.is_operator()));
drop policy if exists "Auth full access to phone_numbers" on phone_numbers;
drop policy if exists "Operator full access to phone_numbers" on phone_numbers;
create policy "Operator full access to phone_numbers" on phone_numbers
  for all to authenticated using ((select public.is_operator())) with check ((select public.is_operator()));
drop policy if exists "Auth full access to proposals" on proposals;
drop policy if exists "Operator full access to proposals" on proposals;
create policy "Operator full access to proposals" on proposals
  for all to authenticated using ((select public.is_operator())) with check ((select public.is_operator()));
drop policy if exists "Auth full access to review_clients" on review_clients;
drop policy if exists "Operator full access to review_clients" on review_clients;
create policy "Operator full access to review_clients" on review_clients
  for all to authenticated using ((select public.is_operator())) with check ((select public.is_operator()));
drop policy if exists "Auth full access to review_requests" on review_requests;
drop policy if exists "Operator full access to review_requests" on review_requests;
create policy "Operator full access to review_requests" on review_requests
  for all to authenticated using ((select public.is_operator())) with check ((select public.is_operator()));
drop policy if exists "Auth full access to scrape_usage" on scrape_usage;
drop policy if exists "Operator full access to scrape_usage" on scrape_usage;
create policy "Operator full access to scrape_usage" on scrape_usage
  for all to authenticated using ((select public.is_operator())) with check ((select public.is_operator()));
drop policy if exists "Auth full access to speed_to_lead_agents" on speed_to_lead_agents;
drop policy if exists "Operator full access to speed_to_lead_agents" on speed_to_lead_agents;
create policy "Operator full access to speed_to_lead_agents" on speed_to_lead_agents
  for all to authenticated using ((select public.is_operator())) with check ((select public.is_operator()));
drop policy if exists "Auth full access to speed_to_lead_calls" on speed_to_lead_calls;
drop policy if exists "Operator full access to speed_to_lead_calls" on speed_to_lead_calls;
create policy "Operator full access to speed_to_lead_calls" on speed_to_lead_calls
  for all to authenticated using ((select public.is_operator())) with check ((select public.is_operator()));

-- ROLLBACK
-- drop policy if exists "Operator full access to activity_log" on activity_log;
-- create policy "Auth full access to activity_log" on activity_log for all to authenticated using (true) with check (true);
-- drop policy if exists "Operator full access to agents" on agents;
-- create policy "Auth full access to agents" on agents for all to authenticated using (true) with check (true);
-- drop policy if exists "Operator full access to audits" on audits;
-- create policy "Auth full access to audits" on audits for all to authenticated using (true) with check (true);
-- drop policy if exists "Operator full access to bos_bookings" on bos_bookings;
-- create policy "Auth full access to bos_bookings" on bos_bookings for all to authenticated using (true) with check (true);
-- drop policy if exists "Operator full access to call_logs" on call_logs;
-- create policy "Auth full access to call_logs" on call_logs for all to authenticated using (true) with check (true);
-- drop policy if exists "Operator full access to call_sms_replies" on call_sms_replies;
-- create policy "Auth full access to call_sms_replies" on call_sms_replies for all to authenticated using (true) with check (true);
-- drop policy if exists "Operator full access to crm_lists" on crm_lists;
-- create policy "Auth full access to crm_lists" on crm_lists for all to authenticated using (true) with check (true);
-- drop policy if exists "Operator full access to daily_checklist" on daily_checklist;
-- create policy "Auth full access to daily_checklist" on daily_checklist for all to authenticated using (true) with check (true);
-- drop policy if exists "Operator full access to elks_inbound_calls" on elks_inbound_calls;
-- create policy "Auth full access to elks_inbound_calls" on elks_inbound_calls for all to authenticated using (true) with check (true);
-- drop policy if exists "Operator full access to invoices" on invoices;
-- create policy "Auth full access to invoices" on invoices for all to authenticated using (true) with check (true);
-- drop policy if exists "Operator full access to lead_search_results" on lead_search_results;
-- create policy "Auth full access to lead_search_results" on lead_search_results for all to authenticated using (true) with check (true);
-- drop policy if exists "Operator full access to lead_searches" on lead_searches;
-- create policy "Auth full access to lead_searches" on lead_searches for all to authenticated using (true) with check (true);
-- drop policy if exists "Operator full access to leads" on leads;
-- create policy "Auth full access to leads" on leads for all to authenticated using (true) with check (true);
-- drop policy if exists "Operator full access to meetings" on meetings;
-- create policy "Auth full access to meetings" on meetings for all to authenticated using (true) with check (true);
-- drop policy if exists "Operator full access to minute_balance" on minute_balance;
-- create policy "Auth full access to minute_balance" on minute_balance for all to authenticated using (true) with check (true);
-- drop policy if exists "Operator full access to minute_transactions" on minute_transactions;
-- create policy "Auth full access to minute_transactions" on minute_transactions for all to authenticated using (true) with check (true);
-- drop policy if exists "Operator full access to phone_numbers" on phone_numbers;
-- create policy "Auth full access to phone_numbers" on phone_numbers for all to authenticated using (true) with check (true);
-- drop policy if exists "Operator full access to proposals" on proposals;
-- create policy "Auth full access to proposals" on proposals for all to authenticated using (true) with check (true);
-- drop policy if exists "Operator full access to review_clients" on review_clients;
-- create policy "Auth full access to review_clients" on review_clients for all to authenticated using (true) with check (true);
-- drop policy if exists "Operator full access to review_requests" on review_requests;
-- create policy "Auth full access to review_requests" on review_requests for all to authenticated using (true) with check (true);
-- drop policy if exists "Operator full access to scrape_usage" on scrape_usage;
-- create policy "Auth full access to scrape_usage" on scrape_usage for all to authenticated using (true) with check (true);
-- drop policy if exists "Operator full access to speed_to_lead_agents" on speed_to_lead_agents;
-- create policy "Auth full access to speed_to_lead_agents" on speed_to_lead_agents for all to authenticated using (true) with check (true);
-- drop policy if exists "Operator full access to speed_to_lead_calls" on speed_to_lead_calls;
-- create policy "Auth full access to speed_to_lead_calls" on speed_to_lead_calls for all to authenticated using (true) with check (true);
-- drop function if exists public.is_operator();
-- drop table if exists public.operators;
