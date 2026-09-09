-- Enable UUID generation
create extension if not exists "pgcrypto";

-- CRM Lists
create table if not exists crm_lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

-- Leads
create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  list_id uuid references crm_lists(id) on delete set null,
  name text,
  business text,
  phone text,
  email text,
  website text,
  status text default 'new',
  owner_status text,
  notes text,
  source text,
  ai_score int,
  created_at timestamptz default now()
);

-- AI Agents (receptionists)
create table if not exists agents (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) on delete set null,
  name text not null,
  business_name text,
  language text default 'sv',
  intelligence_tier text default 'standard',
  voice_id text,
  prompt_text text,
  welcome_message text,
  transfer_number text,
  status text default 'draft',
  created_at timestamptz default now()
);

-- Speed-to-lead agents
create table if not exists speed_to_lead_agents (
  id uuid primary key default gen_random_uuid(),
  agent_name text not null,
  business_name text,
  phone_number text,
  voice_id text,
  opening_message text,
  service_requested text,
  qualification_questions jsonb default '[]',
  disqualify_conditions jsonb default '[]',
  webhook_url text,
  created_at timestamptz default now()
);

-- Review automation clients
create table if not exists review_clients (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  google_review_url text,
  delay_minutes int default 60,
  twilio_ready boolean default false,
  sent_this_month int default 0,
  demo_url text,
  created_at timestamptz default now()
);

-- AI Audits
create table if not exists audits (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  website_url text,
  content jsonb,
  share_id text unique default encode(gen_random_bytes(8), 'hex'),
  status text default 'pending',
  created_at timestamptz default now()
);

-- Proposals
create table if not exists proposals (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) on delete set null,
  agent_id uuid references agents(id) on delete set null,
  title text not null,
  tagline text,
  avg_job_value numeric,
  is_public boolean default false,
  status text default 'draft',
  share_id text unique default encode(gen_random_bytes(8), 'hex'),
  created_at timestamptz default now()
);

-- User profiles
create table if not exists profile (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade unique,
  display_name text,
  bio text,
  phone text,
  avatar_url text,
  business_name text,
  tagline text,
  created_at timestamptz default now()
);

-- Call logs
create table if not exists call_logs (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references agents(id) on delete set null,
  transcript text,
  summary text,
  sentiment text,
  duration_sec int,
  cost numeric,
  from_number text,
  to_number text,
  created_at timestamptz default now()
);

-- Minute balance per user
create table if not exists minute_balance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade unique,
  balance_minutes int default 0,
  created_at timestamptz default now()
);

-- Minute transactions
create table if not exists minute_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  amount int not null,
  type text not null, -- 'credit' | 'debit'
  description text,
  balance_after int,
  created_at timestamptz default now()
);

-- RLS: enable row-level security on user-owned tables
alter table crm_lists enable row level security;
alter table profile enable row level security;
alter table minute_balance enable row level security;
alter table minute_transactions enable row level security;

create policy "Users own their CRM lists" on crm_lists
  for all using (auth.uid() = user_id);

create policy "Users own their profile" on profile
  for all using (auth.uid() = user_id);

create policy "Users own their minute balance" on minute_balance
  for all using (auth.uid() = user_id);

create policy "Users own their minute transactions" on minute_transactions
  for all using (auth.uid() = user_id);
