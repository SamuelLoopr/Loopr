-- En rad per körning av morgonkontrollen (/api/cron/health) och kontrollen
-- var tionde minut (/api/cron/long-calls), även när allt är bra. Så syns det
-- att kontrollerna faktiskt körs, inte bara när de hittar något.
--
-- Cirka 150 rader om dagen. Inga personuppgifter: jobbets namn, tid, antal problem och varningens utfall.
-- Bara service-rollen läser och skriver; RLS på utan regler.
--
-- Säker att köra före eller efter koden: saknas tabellen loggas bara ett fel.

create table if not exists cron_runs (
  id bigint generated always as identity primary key,
  job text not null check (job in ('health', 'long_calls')),
  ran_at timestamptz not null default now(),
  ok boolean not null,
  problems integer not null default 0,
  alert text,
  duration_ms integer
);
create index if not exists cron_runs_job_ran_at on cron_runs (job, ran_at desc);
alter table cron_runs enable row level security;

-- ROLLBACK
-- drop table if exists cron_runs;
