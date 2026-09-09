-- review_clients: one row per customer using Review Automation
create table if not exists review_clients (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  google_review_url text not null,
  delay_minutes int not null default 30,
  message_template text not null default 'Hej {{kund_namn}}, tack för att du valde {{företag}}! Vi skulle uppskatta en snabb recension på Google: {{review_url}}',
  share_id text unique not null,
  demo_generated_at timestamptz,
  created_at timestamptz default now()
);

-- review_requests: log of every SMS sent (for "X skickade denna månad")
create table if not exists review_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references review_clients(id) on delete cascade,
  customer_name text,
  customer_phone text,
  status text default 'sent', -- sent | delivered | rated | reviewed
  rating int,    -- 1-5, set when customer rates
  feedback text, -- private feedback if rating < 5
  created_at timestamptz default now()
);

create index if not exists rr_client  on review_requests (client_id);
create index if not exists rr_created on review_requests (created_at desc);
