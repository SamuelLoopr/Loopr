-- Link the two remaining public demo artefacts back to the agent they belong to,
-- so the "Demos" tab can show all four client-facing links for one agent in one
-- place. proposals already has agent_id + lead_id (001_initial_schema), and the
-- voice demo lives on agents.public_share_id (014_agent_public_demo) — only
-- audits and review_clients were keyed by business_name alone with no join back
-- to the agent.
--
-- on delete set null (not cascade): an audit or a review-automation client is a
-- standalone artefact the customer may still be using. Deleting the agent it was
-- generated from should unlink it, never delete the customer's live SMS demo.

alter table audits         add column if not exists agent_id uuid references agents(id) on delete set null;
alter table audits         add column if not exists lead_id  uuid references leads(id)  on delete set null;
alter table review_clients add column if not exists agent_id uuid references agents(id) on delete set null;
alter table review_clients add column if not exists lead_id  uuid references leads(id)  on delete set null;

create index if not exists audits_agent         on audits (agent_id);
create index if not exists review_clients_agent on review_clients (agent_id);
