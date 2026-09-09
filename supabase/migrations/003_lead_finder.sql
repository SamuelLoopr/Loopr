-- Scrape usage tracker
create table if not exists scrape_usage (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  month text not null, -- 'YYYY-MM'
  count int default 0,
  created_at timestamptz default now(),
  unique (user_id, month)
);

create index if not exists scrape_usage_user_month on scrape_usage (user_id, month);
