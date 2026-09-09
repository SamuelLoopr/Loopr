create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references agents(id) on delete set null,
  client_name text not null,
  amount numeric not null,
  description text,
  status text default 'sent', -- sent | paid | overdue | cancelled
  created_at timestamptz default now()
);

create index if not exists invoices_created on invoices (created_at desc);

alter table invoices enable row level security;

drop policy if exists "Anon full access to invoices" on invoices;
create policy "Anon full access to invoices" on invoices
  for all to anon using (true) with check (true);

drop policy if exists "Auth full access to invoices" on invoices;
create policy "Auth full access to invoices" on invoices
  for all to authenticated using (true) with check (true);
