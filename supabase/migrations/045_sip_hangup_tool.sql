-- Att lägga på SIP-samtal från vår sida (46elks POST /a1/calls/{id} hangup=yes).
--
-- ElevenLabs end_call avslutar konversationen men skickar ingen SIP BYE, så
-- 46elks-benet ligger kvar (uppmätt 2026-10-03 och igen 2026-10-22: 27 s). I
-- stället får agenten ett eget verktyg, lagg_pa, som körs när den talat klart
-- (lib/elks-hangup.ts). Vår server lägger då på samtalet hos 46elks.
--
--   agents.sip_hangup_tool    slå på per agent. Av som standard.
--
--   elks_inbound_calls        46elks samtals-id för inkommande samtal, så att
--                             rätt samtal läggs på. Skrivs BARA för agenter med
--                             sip_hangup_tool = true, efter att samtalet redan
--                             kopplats (app/api/46elks/[token]/incoming-call).
--     conversation_id         unik: en konversation lägger på högst ett samtal.
--     hangup_requested_at     låset: sätts villkorat innan vi lägger på, så att
--                             samma samtal aldrig läggs på två gånger.
--     hangup_result           utfallet i några ord, aldrig 46elks svar.
--
-- Personuppgifter: from_number, i samma klass som call_logs.from_number.
-- Gallras med sammanfattningsperioden (lib/retention.ts).
--
-- RLS som call_logs (019_auth_rls.sql). Bara serverroutes på service-rollen
-- läser och skriver.
--
-- Säker att köra före eller efter koden: utan kolumnen och tabellen är
-- funktionen helt enkelt av.

alter table agents add column if not exists sip_hangup_tool boolean not null default false;

create table if not exists elks_inbound_calls (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references agents(id) on delete cascade,
  callid text not null,
  from_number text,
  to_number text not null,
  created_at timestamptz not null default now(),
  conversation_id text,
  hangup_requested_at timestamptz,
  hangup_result text,
  constraint elks_inbound_calls_callid_key unique (callid),
  constraint elks_inbound_calls_conversation_key unique (conversation_id),
  constraint elks_inbound_calls_result_length check (hangup_result is null or char_length(hangup_result) <= 100)
);

create index if not exists elks_inbound_calls_to_recent on elks_inbound_calls (to_number, created_at desc);

alter table elks_inbound_calls enable row level security;

drop policy if exists "Auth full access to elks_inbound_calls" on elks_inbound_calls;
create policy "Auth full access to elks_inbound_calls" on elks_inbound_calls
  for all to authenticated using (true) with check (true);

-- ROLLBACK
-- drop table if exists elks_inbound_calls;
-- alter table agents drop column if exists sip_hangup_tool;
