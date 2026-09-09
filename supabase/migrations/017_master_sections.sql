-- Which sections the Master Demo one-pager should show for a given agent.
-- Shape: {"voice":true,"sms":true,"audit":true,"proposal":true,"benefits":true}
--
-- NULL means "everything the agent has data for", so existing share links keep
-- rendering exactly as they did before this column existed — the builder only
-- writes a value once someone actually toggles a section off.

alter table agents add column if not exists master_sections jsonb;
