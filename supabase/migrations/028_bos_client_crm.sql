-- BOS: the client works their own calls on the public link (/master/[shareId]).
--
-- Adds what the client can see and change there, on top of 027_call_insights:
--
--   caller_name       the caller's name if they gave it in the call, extracted
--                     by Claude with the summary (lib/call-insights.ts)
--   insight_version   which version of that analysis produced the row. NULL or
--                     lower than the current version means "analyse again" —
--                     how rows classified before caller_name existed get a name
--   client_status     set by the CLIENT on the public page: ny | kontaktad |
--                     offert_skickad | bokad | avslutad (NULL = ny)
--   client_note       the client's own free-text note on the call
--   client_updated_at when the client last changed status or note
--   public_ref        random per-call reference for the page's write requests
--
-- WHY public_ref. The public payload carries no internal ids — not the call's,
-- not the agent's. To say which call to update, the page needs some handle, and
-- the call's uuid would be exactly the internal id that must not leave the
-- server. public_ref is a separate random value with no other meaning, and on
-- its own it opens nothing: /api/public-agent/[shareId]/calls/[ref] only
-- updates a row when the ref matches AND the row belongs to the agent behind
-- the share id AND the call is one the page shows.
--
-- RLS is unchanged: call_logs stays authenticated-only (019_auth_rls.sql). The
-- public page reads and writes only through those server routes, which use the
-- service role and do their own scoping.
--
-- Safe to run before or after deploying the code: without these columns the
-- calls list still works, just without names, status or notes.

alter table call_logs add column if not exists caller_name text;
alter table call_logs add column if not exists insight_version smallint;
alter table call_logs add column if not exists client_status text;
alter table call_logs add column if not exists client_note text;
alter table call_logs add column if not exists client_updated_at timestamptz;

-- gen_random_uuid() is volatile, so adding the column fills every existing row
-- with its own value; the update below only matters if the column already
-- existed without a default. 32 hex characters, 122 random bits.
alter table call_logs add column if not exists public_ref text
  default replace(gen_random_uuid()::text, '-', '');
update call_logs set public_ref = replace(gen_random_uuid()::text, '-', '') where public_ref is null;
create unique index if not exists call_logs_public_ref_key on call_logs (public_ref);

alter table call_logs drop constraint if exists call_logs_client_status_check;
alter table call_logs add constraint call_logs_client_status_check
  check (client_status is null or client_status in ('ny', 'kontaktad', 'offert_skickad', 'bokad', 'avslutad'));

-- Mirrors CLIENT_NOTE_MAX in lib/client-status.ts; the route rejects longer
-- notes first, this is the backstop.
alter table call_logs drop constraint if exists call_logs_client_note_length_check;
alter table call_logs add constraint call_logs_client_note_length_check
  check (client_note is null or char_length(client_note) <= 2000);

-- ROLLBACK
-- alter table call_logs drop constraint if exists call_logs_client_note_length_check;
-- alter table call_logs drop constraint if exists call_logs_client_status_check;
-- drop index if exists call_logs_public_ref_key;
-- alter table call_logs drop column if exists public_ref;
-- alter table call_logs drop column if exists client_updated_at;
-- alter table call_logs drop column if exists client_note;
-- alter table call_logs drop column if exists client_status;
-- alter table call_logs drop column if exists insight_version;
-- alter table call_logs drop column if exists caller_name;
