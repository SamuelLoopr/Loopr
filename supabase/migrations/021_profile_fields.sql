-- Make `profile` a real per-user record, owned by the user it belongs to.
--
-- COLUMNS: nothing is actually missing. 001_initial_schema.sql already created
-- display_name, bio, phone, avatar_url, business_name and tagline, and 002 added
-- daily_proposal_goal. The add-column statements below are kept only so this
-- migration is safe to run against a database that drifted; they are no-ops on
-- a current one.
--
-- The real work here is ownership. Until now `profile` had one policy from 019
-- ("Auth full access to profile", using (true)), meaning any signed-in user
-- could read and edit any other user's personal details. That was acceptable
-- while the dashboard had exactly one operator; it is not the right shape for a
-- table holding a name, phone number, bio and photo.

alter table profile add column if not exists display_name  text;
alter table profile add column if not exists bio           text;
alter table profile add column if not exists phone         text;
alter table profile add column if not exists avatar_url    text;
alter table profile add column if not exists business_name text;
alter table profile add column if not exists tagline       text;

-- user_id is the ownership key and already carries a UNIQUE constraint from
-- 001, which is what lets the app upsert on it (one row per user).
create index if not exists profile_user on profile (user_id);

alter table profile enable row level security;

-- ── Owner access ───────────────────────────────────────────────────────────
-- Replaces the blanket using(true) policy. `with check` matters as much as
-- `using`: without it a user could save a row with someone else's user_id and
-- take over their profile.
drop policy if exists "Auth full access to profile" on profile;
drop policy if exists "Users own their profile"     on profile;

drop policy if exists "Users read own profile" on profile;
create policy "Users read own profile" on profile
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users insert own profile" on profile;
create policy "Users insert own profile" on profile
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Users update own profile" on profile;
create policy "Users update own profile" on profile
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users delete own profile" on profile;
create policy "Users delete own profile" on profile
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ── Anon read: kept deliberately, and it is a known compromise ─────────────
-- The customer-facing proposal page (app/forslag/[shareId]) renders the
-- sender's card — name, business, tagline, bio, phone, avatar — and reads it
-- straight from the browser with the anon key. Dropping anon here would blank
-- that card on every shared proposal.
--
-- The cost: anon can read every row in this table, not just the one belonging
-- to the proposal being viewed. With a single operator that is the same data
-- either way. It stops being true the moment a second person has an account.
--
-- The fix, when that day comes: move the public page's profile lookup behind a
-- server route that uses the service-role key and resolves the profile from the
-- proposal's share_id (the pattern /api/public-agent/[shareId] already uses),
-- then delete this policy.
drop policy if exists "Anon may read profile" on profile;
create policy "Anon may read profile" on profile
  for select to anon using (true);


-- ── Avatar storage ─────────────────────────────────────────────────────────
-- The bucket itself is already created (public, 2 MB cap, images only). This
-- block is idempotent so the migration also works on a fresh project.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152,
        array['image/png','image/jpeg','image/webp','image/gif'])
on conflict (id) do nothing;

-- Files are stored as <auth.uid()>/<filename>, so the first path segment is the
-- owner. That is what these policies check — a user can only write inside their
-- own folder, and cannot overwrite or delete anyone else's avatar.
drop policy if exists "Avatars are publicly readable" on storage.objects;
create policy "Avatars are publicly readable" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "Users upload own avatar" on storage.objects;
create policy "Users upload own avatar" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users update own avatar" on storage.objects;
create policy "Users update own avatar" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users delete own avatar" on storage.objects;
create policy "Users delete own avatar" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
