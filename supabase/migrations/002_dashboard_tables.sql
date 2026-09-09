-- Add daily proposal goal to profile
alter table profile add column if not exists daily_proposal_goal int default 5;

-- Daily checklist (no FK to auth.users yet — added when auth is wired up)
create table if not exists daily_checklist (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  date date not null,
  item_key text not null,
  completed boolean default false,
  created_at timestamptz default now(),
  unique (user_id, date, item_key)
);

-- Activity log
create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id text,
  description text not null,
  entity_type text,
  entity_id uuid,
  created_at timestamptz default now()
);

-- Meetings
create table if not exists meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  lead_id uuid references leads(id) on delete set null,
  scheduled_at timestamptz not null,
  status text default 'scheduled',
  created_at timestamptz default now()
);

-- Indexes
create index if not exists daily_checklist_user_date on daily_checklist (user_id, date);
create index if not exists activity_log_created on activity_log (created_at desc);
create index if not exists meetings_scheduled on meetings (scheduled_at asc);
