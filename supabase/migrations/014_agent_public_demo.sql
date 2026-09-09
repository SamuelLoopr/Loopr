-- Public "prova agenten live" share link, one per agent.
-- Lets a prospect talk to a business's AI receptionist from a plain URL
-- without logging in — same pattern as review_clients.share_id and
-- proposals.share_id. Kept separate from webhook_token (which is an
-- inbound-data secret, not something we hand out to prospects).
alter table agents add column if not exists public_share_id text unique;

create index if not exists agents_public_share on agents (public_share_id);
