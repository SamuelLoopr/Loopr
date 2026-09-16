-- Which plan an operator picked on /uppgradera.
--
-- Separate from subscription_status (025): status answers "may this account use
-- the product", plan answers "at what tier". An account can be `inactive` and
-- still have a plan recorded — that is exactly the state of someone who chose
-- Pro and has not paid yet, and it is what tells you which checkout to send
-- them to when Stripe is connected.
--
-- Nullable on purpose: null means "has not chosen", which is different from any
-- particular tier and is the state every existing account is in.
alter table profile add column if not exists subscription_plan text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profile_subscription_plan_valid') then
    alter table profile add constraint profile_subscription_plan_valid
      check (subscription_plan is null or subscription_plan in ('basic', 'pro', 'business'));
  end if;
end $$;

-- The limits each tier sells are NOT enforced anywhere yet, and cannot be until
-- the tables carry an owner. As of this migration, only crm_lists, lead_searches
-- and scrape_usage have a user_id at all — and in the latter two it holds a
-- localStorage device id, not an auth uid. agents, leads, review_clients,
-- proposals, audits, call_logs and speed_to_lead_agents have no owner column.
-- Enforcing per-operator caps means adding ownership to those tables first.
