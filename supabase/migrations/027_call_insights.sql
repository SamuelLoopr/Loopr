-- Call insights for the public Master Demo / BOS link (/master/[shareId]).
--
-- Real inbound calls reach call_logs through /api/twilio/incoming-call, which
-- writes an 'in_progress' row with the two numbers and the ElevenLabs
-- conversation id — and nothing ever completed it. lib/call-sync.ts now fills
-- those rows in from ElevenLabs (transcript, duration, sentiment) and has Claude
-- write a Swedish summary and classify what the caller wants. The two columns
-- below hold that classification:
--
--   contact_request  NULL      = not classified yet; the sync picks the row up
--                    'none'    = no request
--                    'meeting' = wants to book a time, meeting or site visit
--                    'quote'   = wants a quote or a price
--                    'callback'= wants to be called back for another reason
--   contact_note     one line on what the request is about, or NULL
--
-- RLS is unchanged: call_logs stays authenticated-only (019_auth_rls.sql). The
-- public page never reads this table itself — /api/public-agent/[shareId]/calls
-- does, server-side, scoped to the single agent behind the share id.
--
-- Safe to run before or after deploying the code: without these columns the
-- calls list still works, it just shows no "Vill bli kontaktad" badges.

alter table call_logs add column if not exists contact_request text;
alter table call_logs add column if not exists contact_note text;

alter table call_logs drop constraint if exists call_logs_contact_request_check;
alter table call_logs add constraint call_logs_contact_request_check
  check (contact_request is null or contact_request in ('none', 'meeting', 'quote', 'callback'));

-- The public route lists one agent's calls, newest first.
create index if not exists call_logs_agent_created on call_logs (agent_id, created_at desc);

-- ROLLBACK
-- drop index if exists call_logs_agent_created;
-- alter table call_logs drop constraint if exists call_logs_contact_request_check;
-- alter table call_logs drop column if exists contact_note;
-- alter table call_logs drop column if exists contact_request;
