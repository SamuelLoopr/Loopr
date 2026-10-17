-- Sidan "Data & Sekretess": register över personuppgiftsbehandling,
-- underbiträden, och åtkomstlogg.
--
-- INGENTING HÄR GÖR OSS GDPR-GODKÄNDA. Tabellerna är en plats att skriva ner
-- vad vi faktiskt gör, så att en jurist kan granska det och så att vi kan visa
-- vad vi visste när. Varje mall och varje text ska betraktas som utkast tills
-- kolumnen lawyer_reviewed_at är satt.
--
-- ÄGARNIVÅ-RLS, som 034_voice_ratings.sql. 019_auth_rls.sql förklarar varför de
-- ÄLDRE tabellerna är role-level (deras rader skrevs före auth och har user_id
-- NULL) och säger uttryckligen "Revisit when rows start carrying a real
-- user_id". Alla tabeller härifrån och framåt gör det. Ingen anon-policy alls.

-- ── a) Registret över behandling ────────────────────────────────────────────
-- Raderna seedas som utkast ur det levande schemat (48 kolumner i 17 tabeller,
-- kartlagt 2026-10-08) och fylls sedan i för hand med ändamål och rättslig
-- grund. Därför är bara tabell/kolumn obligatoriskt.
create table if not exists privacy_register (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,

  table_name text not null,
  column_name text not null,
  /** Vilken sorts personuppgift kolumnen innehåller. Satt av kartläggningen. */
  data_kind text,

  /** Fylls i av operatören. Null = inte bedömt än, vilket är en giltig status. */
  purpose text,
  legal_basis text,
  retention_note text,
  recipients text,
  notes text,

  /** Automatiskt seedad rad som ingen människa gått igenom än. */
  is_draft boolean not null default true,
  lawyer_reviewed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint privacy_register_unique unique (user_id, table_name, column_name)
);

comment on table privacy_register is
  'Utkast till register över personuppgiftsbehandling. Seedas ur schemat, fylls i manuellt. Inte juridiskt granskat förrän lawyer_reviewed_at är satt.';

-- ── b) Underbiträden ────────────────────────────────────────────────────────
create table if not exists subprocessors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,

  name text not null,
  purpose text,
  /** Var uppgifterna behandlas. Fritext, eftersom leverantörer anger det olika. */
  country_region text,
  /** T.ex. standardavtalsklausuler, adekvansbeslut, inget. */
  transfer_mechanism text,
  dpa_url text,
  /** När operatören godkände underbiträdet. Null = inte godkänt. */
  approved_at timestamptz,

  /**
   * false betyder "jag har skrivit in det men inte kontrollerat mot
   * leverantörens egna uppgifter". Viktigt att skilja på: ett register fullt av
   * ogranskade antaganden är värre än ett tomt, för det ser färdigt ut.
   */
  verified boolean not null default false,
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subprocessors_unique unique (user_id, name)
);

-- ── f) Åtkomstlogg ──────────────────────────────────────────────────────────
-- Export, radering och inställningsändringar. Loggen är avsiktligt append-only:
-- en logg som går att redigera är ingen logg. Inga UPDATE- eller DELETE-policyer
-- skapas nedan, så RLS tillåter bara insert och select.
create table if not exists privacy_audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,

  /** T.ex. 'dsar_export', 'dsar_erase', 'retention_run', 'settings_change'. */
  action text not null,
  /** Vad det gällde, i klartext. Aldrig ett telefonnummer i sin helhet. */
  target text,
  detail jsonb,

  created_at timestamptz not null default now()
);

create index if not exists privacy_audit_log_created on privacy_audit_log (user_id, created_at desc);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table privacy_register   enable row level security;
alter table subprocessors      enable row level security;
alter table privacy_audit_log  enable row level security;

drop policy if exists "Privacy register - own rows" on privacy_register;
create policy "Privacy register - own rows" on privacy_register
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Subprocessors - own rows" on subprocessors;
create policy "Subprocessors - own rows" on subprocessors
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Bara läsa och skriva nytt. Ingen policy för update eller delete, så de
-- nekas av RLS även för ägaren.
drop policy if exists "Privacy audit log - own rows" on privacy_audit_log;
drop policy if exists "Privacy audit log - insert own" on privacy_audit_log;
drop policy if exists "Privacy audit log - read own" on privacy_audit_log;
create policy "Privacy audit log - insert own" on privacy_audit_log
  for insert to authenticated with check (auth.uid() = user_id);
create policy "Privacy audit log - read own" on privacy_audit_log
  for select to authenticated using (auth.uid() = user_id);
