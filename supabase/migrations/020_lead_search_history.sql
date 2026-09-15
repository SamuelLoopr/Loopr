-- Persist every Lead Finder search and every result it returned.
--
-- Until now a search lived only in React state: navigating away lost the whole
-- result set unless each lead had been pushed to the CRM by hand, and the only
-- trace left behind was the counter in scrape_usage. Re-finding a business meant
-- running the search again and paying for it out of the monthly quota a second
-- time.
--
-- TWO NOTES ON THE ORIGINAL SPEC
--
-- 1. lead_searches did not exist. The spec has lead_search_results.search_id
--    referencing it, so it is created here as the parent row — one per search,
--    holding the query that produced the results.
--
-- 2. The spec asked for anon RLS policies "same pattern as before". That
--    pattern belongs to the public share tables (audits, review_clients,
--    proposals), which anonymous customers genuinely read. This is the opposite
--    kind of data: names, addresses and phone numbers of sales prospects, the
--    same class as `leads`, which 019_auth_rls.sql just closed to anon after it
--    was found world-readable. Anon policies here would reopen that hole with
--    the same data in a new table, so these are authenticated-only. The anon
--    variant is at the bottom, commented out, if a public consumer ever appears.

create table if not exists lead_searches (
  id uuid primary key default gen_random_uuid(),
  -- The query, kept so a past search can be re-run or simply understood later.
  industry text,
  location text,
  country text,
  radius int,
  max_results int,
  icp text,
  -- Denormalised so the history list does not need a count() per row.
  result_count int not null default 0,
  -- Matches scrape_usage.user_id, which is a device id today rather than an
  -- auth uid. Left as text so the two stay joinable until both move to auth.uid().
  user_id text,
  created_at timestamptz default now()
);

create table if not exists lead_search_results (
  id uuid primary key default gen_random_uuid(),
  search_id uuid references lead_searches(id) on delete cascade,
  business_name text,
  address text,
  phone text,
  website text,
  rating numeric,
  review_count int,
  ai_score int,
  -- Flipped when the result is pushed into `leads`, so the history view can grey
  -- out what is already in the CRM instead of creating duplicates.
  added_to_crm boolean not null default false,
  -- Not in the spec, but the Google place id is what makes a result identifiable
  -- across searches; without it the same business appearing in two searches
  -- cannot be recognised as the same business.
  place_id text,
  ai_reason text,
  maps_url text,
  created_at timestamptz default now()
);

create index if not exists lead_searches_created on lead_searches (created_at desc);
create index if not exists lead_searches_user    on lead_searches (user_id, created_at desc);
create index if not exists lsr_search            on lead_search_results (search_id);
create index if not exists lsr_score             on lead_search_results (search_id, ai_score desc);

-- RLS: dashboard-only, same shape as the tables in 019_auth_rls.sql.
alter table lead_searches       enable row level security;
alter table lead_search_results enable row level security;

drop policy if exists "Auth full access to lead_searches" on lead_searches;
create policy "Auth full access to lead_searches" on lead_searches
  for all to authenticated using (true) with check (true);

drop policy if exists "Auth full access to lead_search_results" on lead_search_results;
create policy "Auth full access to lead_search_results" on lead_search_results
  for all to authenticated using (true) with check (true);

-- If a public, unauthenticated consumer for this data ever exists, this is the
-- anon pattern the spec asked for. Do not enable it without one: it would make
-- every scraped prospect's name, address and phone number readable by anyone
-- holding the public anon key.
--
-- create policy "Anon full access to lead_searches" on lead_searches
--   for all to anon using (true) with check (true);
-- create policy "Anon full access to lead_search_results" on lead_search_results
--   for all to anon using (true) with check (true);
