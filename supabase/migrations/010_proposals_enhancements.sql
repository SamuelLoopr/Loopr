-- Add tracking columns to proposals
alter table proposals add column if not exists view_count int default 0;
alter table proposals add column if not exists sent_at timestamptz;
alter table proposals add column if not exists accepted_at timestamptz;

-- Enable RLS on proposals (was not enabled) and allow anon full access
alter table proposals enable row level security;

drop policy if exists "Anon full access to proposals" on proposals;
create policy "Anon full access to proposals" on proposals
  for all to anon using (true) with check (true);

drop policy if exists "Auth full access to proposals" on proposals;
create policy "Auth full access to proposals" on proposals
  for all to authenticated using (true) with check (true);

-- Allow anon to read/write profile (for Edit About Me without auth)
drop policy if exists "Anon full access to profile" on profile;
create policy "Anon full access to profile" on profile
  for all to anon using (true) with check (true);

-- Index for share_id lookups
create index if not exists proposals_share on proposals (share_id);
create index if not exists proposals_created on proposals (created_at desc);
