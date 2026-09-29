-- BOS as a product of its own: client mode for the page, and the client's own
-- calendar.
--
-- ── 1. agents.client_mode ───────────────────────────────────────────────────
-- /master/[shareId] is one page with two jobs. For a prospect it is the sales
-- demo (voice demo, audit, proposal, "Boka en kostnadsfri demo"). For a paying
-- client it is where they run their calls. client_mode = true makes the link
-- the client's: calls, calendar and an account section, and no sales content
-- at all — /api/public-agent/[shareId]/master stops sending it.
--
-- Its own column rather than a key inside master_sections: both builders
-- (Master Demo and Bygg BOS) rewrite master_sections whole from their six
-- section switches on every toggle, so a mode stored in there would be wiped
-- silently the next time anyone flipped a section.
--
-- Per agent, not global: one link is one agent, and some agents are clients
-- while others are still prospects.

alter table agents add column if not exists client_mode boolean not null default false;

-- ── 2. bos_bookings ─────────────────────────────────────────────────────────
-- The client's calendar on their BOS page, managed by the client there. Not
-- the receptionist's Cal.com integration, and not the operator's `meetings`
-- table (Bokade möten) — a separate entity, hence a table of its own.
--
-- The public page never reads or writes this table itself. It goes through
-- /api/public-agent/[shareId]/bookings, which runs on the service role and
-- scopes every query to the one agent behind the share id. Rows are named to
-- the page by public_ref only — the same pattern as call_logs.public_ref
-- (028_bos_client_crm.sql): id, agent_id and call_log_id never leave the server.
--
-- Deleting from the page sets deleted_at instead of removing the row. The link
-- is a bearer key with no login behind it; if one ever leaks and someone clears
-- a client's calendar, the bookings can still be brought back.

create table if not exists bos_bookings (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references agents(id) on delete cascade,
  -- The call the booking was made from, if any. A call row going away must not
  -- take the client's booking with it.
  call_log_id uuid references call_logs(id) on delete set null,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  caller_name text,
  note text,
  public_ref text not null default replace(gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint bos_bookings_public_ref_key unique (public_ref),
  constraint bos_bookings_ends_after_start check (ends_at > starts_at),
  -- Mirrors BOOKING_MAX_DURATION_MIN in lib/booking-rules.ts. The route checks
  -- first (with a readable message); this is the backstop.
  constraint bos_bookings_max_duration check (ends_at - starts_at <= interval '12 hours'),
  constraint bos_bookings_title_length check (char_length(title) between 1 and 120),
  constraint bos_bookings_caller_name_length check (caller_name is null or char_length(caller_name) <= 80),
  constraint bos_bookings_note_length check (note is null or char_length(note) <= 2000)
);

-- "Too far in the future / past" depends on now(), which a CHECK constraint
-- must not use (it would be evaluated once, at write time, and break restores).
-- That limit lives in the route only: lib/booking-rules.ts.

-- The calendar reads one agent's live bookings in a time window; the calls
-- list reads the bookings made from its calls.
create index if not exists bos_bookings_agent_starts on bos_bookings (agent_id, starts_at) where deleted_at is null;
create index if not exists bos_bookings_call on bos_bookings (call_log_id) where call_log_id is not null;

-- RLS exactly like call_logs (019_auth_rls.sql): signed-in dashboard users only.
-- The anon role — the key every browser holds — gets no policy at all, so it can
-- neither read nor write this table directly.
alter table bos_bookings enable row level security;

drop policy if exists "Auth full access to bos_bookings" on bos_bookings;
create policy "Auth full access to bos_bookings" on bos_bookings
  for all to authenticated using (true) with check (true);

-- ROLLBACK
-- drop table if exists bos_bookings;
-- alter table agents drop column if exists client_mode;
