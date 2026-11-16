-- Loopr Voice säljlinje: en egen agent av sorten 'sales'.
--
--   agents.kind          'receptionist' (standard, alla befintliga rader) eller
--                        'sales'. Allt nytt i lib/sales-lead.ts körs bara för
--                        'sales'; receptionisterna går exakt som förut.
--   agents.crm_list_id   CRM-listan där säljlinjens leads hamnar (crm_lists).
--
--   sales_calls          en rad per samtal på säljlinjen. Skrivs under samtalet
--                        av verktygen (tider, bokning, e-post) och efter samtalet
--                        av analysen. analysed_at och notified_at är låsen som
--                        gör att analysen och mejlet sker högst en gång.
--
--   leads                fyra kolumner för det CRM:et ska visa om ett samtal.
--
-- Personuppgifter: sales_calls.caller_name, email, summary med flera gallras med
-- sammanfattningsperioden (lib/retention.ts). Loopr är personuppgiftsansvarig
-- för de här raderna, till skillnad från kundernas samtal.
--
-- RLS som övriga tabeller sedan 048: operatören via is_operator(), servern på
-- service-rollen.
--
-- Säker att köra före koden: utan kolumnerna och tabellen är funktionen av.

alter table agents add column if not exists kind text not null default 'receptionist';
alter table agents drop constraint if exists agents_kind_check;
alter table agents add constraint agents_kind_check check (kind in ('receptionist', 'sales'));

alter table agents add column if not exists crm_list_id uuid references crm_lists(id) on delete set null;

create table if not exists sales_calls (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references agents(id) on delete cascade,
  conversation_id text not null,
  call_log_id uuid references call_logs(id) on delete set null,
  lead_id uuid references leads(id) on delete set null,
  -- under samtalet (verktygen)
  offered_slots jsonb,                 -- [{n:1, start:'2026-11-18T09:00:00.000Z', spoken:'tisdag 18 november klockan 10'}, …]
  booking_uid text,                    -- Cal.com-bokningens uid
  meeting_at timestamptz,
  email text,
  info_sent_at timestamptz,            -- prislista och video skickade
  -- efter samtalet (analysen)
  caller_name text,
  company text,
  industry text,
  missed_calls text,                   -- som personen sa det: "fem, sex i veckan"
  current_handling text,               -- vad som händer med missade samtal i dag
  opening_hours text,
  interest text,                       -- 'varm' | 'ljummen' | 'kall'
  wants_callback boolean,
  summary text,
  analysed_at timestamptz,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_calls_conversation_key unique (conversation_id),
  constraint sales_calls_interest_check check (interest is null or interest in ('varm', 'ljummen', 'kall')),
  constraint sales_calls_email_length check (email is null or char_length(email) <= 254),
  constraint sales_calls_text_length check (
    coalesce(char_length(caller_name), 0) <= 80 and coalesce(char_length(company), 0) <= 120
    and coalesce(char_length(industry), 0) <= 80 and coalesce(char_length(missed_calls), 0) <= 80
    and coalesce(char_length(current_handling), 0) <= 200 and coalesce(char_length(opening_hours), 0) <= 120
    and coalesce(char_length(summary), 0) <= 1000
  )
);

create index if not exists sales_calls_agent_recent on sales_calls (agent_id, created_at desc);
create index if not exists sales_calls_call_log on sales_calls (call_log_id) where call_log_id is not null;
create index if not exists sales_calls_lead on sales_calls (lead_id) where lead_id is not null;

alter table sales_calls enable row level security;
drop policy if exists "Operator full access to sales_calls" on sales_calls;
create policy "Operator full access to sales_calls" on sales_calls
  for all to authenticated using ((select public.is_operator())) with check ((select public.is_operator()));

alter table leads add column if not exists industry text;
alter table leads add column if not exists missed_calls text;
alter table leads add column if not exists interest text;
alter table leads add column if not exists meeting_at timestamptz;
alter table leads drop constraint if exists leads_interest_check;
alter table leads add constraint leads_interest_check check (interest is null or interest in ('varm', 'ljummen', 'kall'));

-- ROLLBACK
-- alter table leads drop constraint if exists leads_interest_check;
-- alter table leads drop column if exists meeting_at;
-- alter table leads drop column if exists interest;
-- alter table leads drop column if exists missed_calls;
-- alter table leads drop column if exists industry;
-- drop table if exists sales_calls;
-- alter table agents drop column if exists crm_list_id;
-- alter table agents drop constraint if exists agents_kind_check;
-- alter table agents drop column if exists kind;
