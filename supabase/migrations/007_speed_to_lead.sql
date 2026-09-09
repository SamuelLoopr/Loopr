-- speed_to_lead_calls: log of every automated call attempt
create table if not exists speed_to_lead_calls (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references speed_to_lead_agents(id) on delete set null,
  lead_name text,
  lead_phone text,
  -- pending | calling | answered | no_answer | qualified | email_sent | booked | disqualified
  status text default 'pending',
  duration_sec int,
  created_at timestamptz default now()
);

create index if not exists stl_calls_agent on speed_to_lead_calls (agent_id);
create index if not exists stl_calls_created on speed_to_lead_calls (created_at desc);
