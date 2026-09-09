-- Business profile fields for AI Receptionist agents
alter table agents add column if not exists industry text;
alter table agents add column if not exists description text;
alter table agents add column if not exists target_customers text;
alter table agents add column if not exists services text;      -- newline-separated
alter table agents add column if not exists pain_points text;   -- newline-separated
alter table agents add column if not exists goals text;         -- newline-separated
