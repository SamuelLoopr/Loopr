-- Sms-bekräftelse av återuppringningen, och svar på den.
--
--   agents.sms_enabled        skicka sms efter samtalet. Av som standard; slås
--                             på per agent.
--   agents.sms_sender         avsändaren hos 46elks: ett nummer i E.164 (då kan
--                             mottagaren svara och ringa) eller ett textnamn
--                             (3–11 tecken, A–Z och 0–9, börjar med en bokstav).
--
--   call_logs.sms_claimed_at  låset. Sätts med ett villkorat UPDATE (... where
--                             sms_claimed_at is null) innan sms:et skickas, så
--                             att två körningar av analysen — webhooken och en
--                             sidladdning samtidigt — aldrig kan skicka två sms.
--                             Släpps INTE vid fel: ett sms som gick iväg men
--                             vars svar tappades skulle annars skickas igen.
--   call_logs.sms_sent_at     när 46elks tog emot sms:et. NULL = inte skickat.
--   call_logs.sms_error       varför det inte skickades, kort och utan nummer.
--   call_logs.sms_id          46elks id för sms:et, för att kunna spåra det hos dem.
--
--   call_sms_replies          sms som kommer in till agentens nummer, kopplade
--                             till den uppringarens senaste samtal. elks_id är
--                             unikt: 46elks försöker igen i minst sex timmar om
--                             vi inte svarar 2xx, och samma sms ska bara sparas
--                             och mejlas en gång.
--
-- Personuppgifter: call_sms_replies.from_number och message är i samma klass
-- som call_logs.from_number och transcript, och ska gallras med dem
-- (lib/retention.ts, sammanfattningsperioden).
--
-- RLS som call_logs (019_auth_rls.sql): inloggade användare i dashboarden. BOS-
-- och webhook-routerna kör på service-rollen och avgränsar själva per agent.
--
-- Säker att köra före eller efter att koden deployas: utan kolumnerna skickas
-- inga sms, och utan tabellen sparas inga svar.

alter table agents add column if not exists sms_enabled boolean not null default false;
alter table agents add column if not exists sms_sender text;

alter table agents drop constraint if exists agents_sms_sender_check;
alter table agents add constraint agents_sms_sender_check
  check (sms_sender is null
         or sms_sender ~ '^\+[1-9][0-9]{6,14}$'
         or sms_sender ~ '^[A-Za-z][A-Za-z0-9]{2,10}$');

alter table call_logs add column if not exists sms_claimed_at timestamptz;
alter table call_logs add column if not exists sms_sent_at timestamptz;
alter table call_logs add column if not exists sms_error text;
alter table call_logs add column if not exists sms_id text;

alter table call_logs drop constraint if exists call_logs_sms_error_length_check;
alter table call_logs add constraint call_logs_sms_error_length_check
  check (sms_error is null or char_length(sms_error) <= 300);

create table if not exists call_sms_replies (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references agents(id) on delete cascade,
  call_log_id uuid references call_logs(id) on delete set null,
  elks_id text not null,
  from_number text not null,
  message text not null,
  received_at timestamptz not null default now(),
  notified_at timestamptz,
  constraint call_sms_replies_elks_id_key unique (elks_id),
  constraint call_sms_replies_message_length check (char_length(message) <= 2000)
);

create index if not exists call_sms_replies_call on call_sms_replies (call_log_id) where call_log_id is not null;

alter table call_sms_replies enable row level security;

drop policy if exists "Auth full access to call_sms_replies" on call_sms_replies;
create policy "Auth full access to call_sms_replies" on call_sms_replies
  for all to authenticated using (true) with check (true);

-- ROLLBACK
-- drop table if exists call_sms_replies;
-- alter table call_logs drop constraint if exists call_logs_sms_error_length_check;
-- alter table call_logs drop column if exists sms_id;
-- alter table call_logs drop column if exists sms_error;
-- alter table call_logs drop column if exists sms_sent_at;
-- alter table call_logs drop column if exists sms_claimed_at;
-- alter table agents drop constraint if exists agents_sms_sender_check;
-- alter table agents drop column if exists sms_sender;
-- alter table agents drop column if exists sms_enabled;
