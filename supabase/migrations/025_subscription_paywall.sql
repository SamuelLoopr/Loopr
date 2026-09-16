-- Paywall groundwork: a billing state per account, with no payment provider
-- attached yet.
--
-- There was no notion of a paying Loopr user anywhere in the schema before this.
-- Note that invoices.is_recurring (022) is NOT it — that table is the operator
-- invoicing their own clients and feeds the MRR card. It tracks money flowing
-- *to* the user; this tracks money flowing *from* them to Loopr.
--
-- Stripe is not wired up. subscription_status is set by hand until it is, which
-- is why the values below use the same vocabulary Stripe does — when a webhook
-- eventually lands it can write this column directly, with no translation layer
-- and no second migration.

-- trialing | active | past_due | canceled | inactive
alter table profile add column if not exists subscription_status text not null default 'trialing';

-- Only meaningful while status = 'trialing'. Null is treated as expired rather
-- than open-ended: a row created by accident should fail closed, not hand out
-- free access forever.
alter table profile add column if not exists trial_ends_at timestamptz;

-- Manual override: always allowed, whatever the status says. The database-side
-- equivalent of DASHBOARD_ALLOWED_EMAILS — changeable without a redeploy, and
-- it travels with the account instead of living in Vercel.
alter table profile add column if not exists billing_bypass boolean not null default false;

create index if not exists profile_subscription on profile (subscription_status);

-- Backfill every account that already exists as 'active'.
--
-- This is what stops the paywall from locking the owner out of their own app
-- the moment it ships. The auto-create path in middleware.ts only ever fires
-- for an account with no profile row, so after this runs it applies exclusively
-- to genuinely new sign-ups — who get the 14-day trial instead.
insert into profile (user_id, subscription_status)
select id, 'active' from auth.users
on conflict (user_id) do nothing;

-- And promote profile rows that already existed.
--
-- This clause is the one that matters most. `add column ... not null default
-- 'trialing'` stamps every pre-existing row as 'trialing' with a null
-- trial_ends_at — and evaluateAccess() treats a trial with no end date as
-- expired, on purpose, so a half-written row fails closed. Without this update,
-- anyone who had already saved a profile would be locked out by the very
-- migration meant to keep them in, and the insert above would not help them
-- because `on conflict do nothing` leaves their row untouched.
--
-- A genuine trial always carries an end date (middleware writes both together),
-- so 'trialing' + null end date can only have come from the column default.
update profile
set subscription_status = 'active'
where subscription_status is null
   or subscription_status = ''
   or (subscription_status = 'trialing' and trial_ends_at is null);
