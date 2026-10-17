-- Lagringstid och automatisk radering, per kund.
--
-- AVSTÄNGT SOM STANDARD, med avsikt. enabled = false och dry_run i cron-jobbet
-- gör att ingenting raderas förrän operatören uttryckligen slår på det. En
-- raderingsrutin som går skarpt direkt vid driftsättning är en
-- dataförlustincident som väntar på att hända.
--
-- SEPARATA PERIODER för råtranskript och för sammanfattning. Transkriptet är
-- ordagrant vad en privatperson sagt i telefon och är det känsligaste vi har;
-- sammanfattningen är PII-maskerad (lib/redact.ts) och är det klienten behöver
-- för att minnas ärendet. Att tvinga samma period på båda hade betytt att man
-- antingen sparar transkript för länge eller tappar arbetsmaterial för tidigt.
--
-- AGGREGAT BEVARAS. duration_sec, cost_*, ai_resolved, provider, status,
-- created_at och insight_version rörs aldrig, så /aktiva-klienter, MRR och
-- lösningsgraden fortsätter stämma bakåt i tiden. Det är radens
-- personuppgifter som töms, inte raden.
--
-- FAKTUROR RÖRS ALDRIG. Bokföringslagen 7 kap. 2 § ordagrant: "De ska bevaras
-- fram till och med det sjunde året efter utgången av det kalenderår då
-- räkenskapsåret avslutades." Alltså inte sju år från fakturadatum — en faktura
-- från mars 2026 ska bevaras till och med 2033. Den här migrationen rör inte
-- invoices, och raderingsrutinen har ingen kod som gör det.

-- Egen tabell i stället för kolumner på agents, så agents inte behöver röras
-- alls och inställningen får ägarnivå-RLS direkt.
create table if not exists retention_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  agent_id uuid not null references agents(id) on delete cascade,

  /**
   * FÖRSLAG – kräver jurist. 90 dagar är vald som en rimlig avvägning mellan
   * klientens behov av att kunna gå tillbaka till ett samtal och
   * dataminimering, inte som en rättslig bedömning.
   */
  transcript_days integer not null default 90,
  summary_days integer not null default 90,

  /** Ingenting raderas förrän detta sätts till true. */
  enabled boolean not null default false,

  /**
   * Radera även konversationen hos ElevenLabs via
   * DELETE /v1/convai/conversations/{id}. Avstängt som standard: det är
   * oåterkalleligt och sker hos tredje part.
   */
  delete_at_elevenlabs boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint retention_settings_unique unique (user_id, agent_id),
  constraint retention_days_sane check (
    transcript_days between 1 and 3650 and summary_days between 1 and 3650
  )
);

comment on table retention_settings is
  'Lagringstid per kund. Separata perioder för råtranskript och sammanfattning. enabled=false betyder att inget raderas.';

-- Varje körning loggas, torrkörning som skarp. Utan detta finns ingen bevisning
-- för att gallringen faktiskt sker.
create table if not exists retention_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,

  started_at timestamptz not null default now(),
  finished_at timestamptz,

  /** true = ingenting skrevs, bara räknat. */
  dry_run boolean not null default true,
  /** 'cron' eller 'manual' — vem som startade. */
  triggered_by text,

  scanned integer not null default 0,
  transcripts_cleared integer not null default 0,
  summaries_cleared integer not null default 0,
  elevenlabs_deleted integer not null default 0,
  errors integer not null default 0,

  /** Per agent: vad som skulle röras eller rördes. Inga telefonnummer. */
  detail jsonb,

  created_at timestamptz not null default now()
);

create index if not exists retention_runs_started on retention_runs (user_id, started_at desc);

-- Spår på raden av att den gallrats, så det går att skilja "aldrig haft
-- transkript" från "transkriptet är raderat enligt lagringstiden".
alter table call_logs add column if not exists retention_cleared_at timestamptz;

comment on column call_logs.retention_cleared_at is
  'När radens personuppgifter tömdes enligt lagringstiden. Null = inte gallrad. Aggregaten (längd, kostnad, ai_resolved, provider) är kvar.';

alter table retention_settings enable row level security;
alter table retention_runs     enable row level security;

drop policy if exists "Retention settings - own rows" on retention_settings;
create policy "Retention settings - own rows" on retention_settings
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Körningsloggen är append-only av samma skäl som åtkomstloggen i 035.
drop policy if exists "Retention runs - insert own" on retention_runs;
drop policy if exists "Retention runs - read own" on retention_runs;
create policy "Retention runs - insert own" on retention_runs
  for insert to authenticated with check (auth.uid() = user_id);
create policy "Retention runs - read own" on retention_runs
  for select to authenticated using (auth.uid() = user_id);
