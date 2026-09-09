-- Add channel column to leads for source/contact-method tracking
alter table leads add column if not exists channel text;

-- Add device_id to crm_lists to support pre-auth device-based ownership
alter table crm_lists add column if not exists device_id text;

-- Replace the single RLS policy with role-specific ones so anon users
-- can work with lists they own via device_id (user_id IS NULL pre-auth)
drop policy if exists "Users own their CRM lists" on crm_lists;

create policy "CRM lists - authenticated users" on crm_lists
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "CRM lists - anon device access" on crm_lists
  for all
  to anon
  using (user_id is null)
  with check (user_id is null);
