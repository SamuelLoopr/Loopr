-- Let a lead be entered by hand in Lead Finder, alongside the ones Google
-- Places returns.
--
-- WHY THIS TABLE AND NOT `leads`
-- A manual entry belongs in the same place a search result does, so it flows
-- through the rest of Lead Finder unchanged: it renders in the same card, and
-- the existing "+ Lägg till CRM" button is what promotes it into `leads` — the
-- table CRM, Cold Call and the dashboard pipeline actually read. Writing
-- straight to `leads` would skip that step and put a lead in the CRM without a
-- list, which the CRM does not expect.
--
-- search_id is already nullable (020), which is what lets a manual row exist
-- without belonging to a search. `source` is what tells the two apart.

alter table lead_search_results add column if not exists source text not null default 'google';

-- The free-text note from the manual form. Search results have ai_reason for
-- Claude's rationale; this is the operator's own comment, kept separate so one
-- cannot overwrite the other.
alter table lead_search_results add column if not exists notes text;

-- The "Egna leads" view filters on source and orders by date.
create index if not exists lsr_source on lead_search_results (source, created_at desc);

-- RLS: nothing to add. 020 already enabled row level security on this table
-- with a single authenticated-only policy ("Auth full access to
-- lead_search_results", for all to authenticated using (true) with check
-- (true)), and deliberately gave anon no policy at all — this is prospect
-- contact data, the same class as `leads`. Manual rows land in that same table
-- and inherit exactly that protection. Adding an anon policy here would undo
-- the decision made in 019/020.
