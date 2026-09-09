-- Telephony (Twilio), calendar (Cal.com), webhook, and error-tracking support
-- for the AI Receptionist agent detail view.

-- call_logs: track call outcome / errors (DEL 2.2 — log ElevenLabs failures
-- instead of failing silently)
alter table call_logs add column if not exists status text default 'completed'; -- 'completed' | 'error' | 'in_progress'
alter table call_logs add column if not exists error_message text;

-- agents: non-secret per-agent config. Actual API keys (Twilio, Cal.com,
-- Airtable) live in server-only env vars, never in a table the anon key
-- can read — these columns are just identifiers, not credentials.
alter table agents add column if not exists cal_com_event_type_id text;
alter table agents add column if not exists airtable_table_name text;
alter table agents add column if not exists webhook_token text unique;

-- Purchased Twilio phone numbers, one agent can have several
create table if not exists phone_numbers (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references agents(id) on delete cascade,
  phone_number text not null,
  twilio_sid text not null unique,
  friendly_name text,
  created_at timestamptz default now()
);

create index if not exists phone_numbers_agent on phone_numbers (agent_id);

alter table phone_numbers enable row level security;

drop policy if exists "Anon full access to phone_numbers" on phone_numbers;
create policy "Anon full access to phone_numbers" on phone_numbers
  for all to anon using (true) with check (true);

drop policy if exists "Auth full access to phone_numbers" on phone_numbers;
create policy "Auth full access to phone_numbers" on phone_numbers
  for all to authenticated using (true) with check (true);

create index if not exists agents_webhook_token on agents (webhook_token);
