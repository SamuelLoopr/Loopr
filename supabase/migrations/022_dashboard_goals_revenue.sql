-- Back the dashboard's goals and revenue cards with real data.
--
-- Three things on the dashboard were not reading from anywhere:
--   * the daily call goal was `const CALL_GOAL = 20` in the page source;
--   * the daily proposal goal was written to localStorage only, so it followed
--     the browser rather than the account (profile.daily_proposal_goal already
--     existed from 002 and was read on load, but never written);
--   * MRR and Bruttointäkt were the literal string "0 kr" in JSX.

-- Goals live on the profile row, next to daily_proposal_goal from 002.
alter table profile add column if not exists daily_call_goal int default 20;

-- Revenue needs one thing the invoices table could not express: whether an
-- invoice repeats. Without it "MRR" has no basis in the data at all — every
-- invoice is a one-off, so any monthly-recurring figure would be invented.
--   Bruttointäkt = sum(amount) where status = 'paid'
--   MRR          = sum(amount) where status = 'paid' and is_recurring
alter table invoices add column if not exists is_recurring boolean not null default false;

-- The dashboard filters on status and the history list orders by date.
create index if not exists invoices_status  on invoices (status);
create index if not exists invoices_created on invoices (created_at desc);
