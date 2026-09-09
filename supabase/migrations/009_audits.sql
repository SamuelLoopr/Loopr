create table if not exists audits (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  website_url text not null,
  share_id text unique not null,
  status text default 'completed',
  content jsonb,
  created_at timestamptz default now()
);

create index if not exists audits_created on audits (created_at desc);
create index if not exists audits_share on audits (share_id);
