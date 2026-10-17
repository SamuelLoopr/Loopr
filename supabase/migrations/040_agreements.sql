-- Avtalsmallar med versionshantering, genererade avtal som oföränderliga
-- ögonblicksbilder, och publik acceptlänk.
--
-- ALLA MALLAR ÄR UTKAST. lawyer_reviewed_at är null tills operatören bockar i
-- att en jurist granskat versionen, och gränssnittet ska skriva
-- "UTKAST – ska granskas av jurist" så länge den är null. Ingenting här gör
-- avtalen juridiskt hållbara.
--
-- VARFÖR ÖGONBLICKSBILD OCH HASH. Ändras mallen nästa år måste vi ändå kunna
-- visa exakt vilken text kunden godkände. Därför fryses den renderade texten
-- på avtalsraden, tillsammans med mallversionen och en SHA-256 av texten.
-- Hashen är bevisningen: samma text ger samma hash, en ändrad text ger en
-- annan.

create table if not exists agreement_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,

  /** service = tjänsteavtal, dpa = personuppgiftsbiträdesavtal, price = prisbilaga. */
  kind text not null,
  /** Räknas upp per kind. En ny version ersätter aldrig en gammal. */
  version integer not null,
  title text not null,
  body text not null,

  /** Null = inte granskad. Gränssnittet visar UTKAST-märkningen så länge. */
  lawyer_reviewed_at timestamptz,
  lawyer_reviewed_note text,

  /** Den version nya avtal genereras från. Högst en per kind. */
  is_current boolean not null default false,

  created_at timestamptz not null default now(),
  constraint agreement_templates_kind_known check (kind in ('service','dpa','price')),
  constraint agreement_templates_version_unique unique (user_id, kind, version)
);

create unique index if not exists agreement_templates_one_current
  on agreement_templates (user_id, kind) where is_current;

comment on table agreement_templates is
  'Avtalsmallar, versionerade. lawyer_reviewed_at null = UTKAST, ska granskas av jurist innan användning.';

/**
 * En granskad mallversion är låst.
 *
 * Har en jurist granskat texten är det DEN texten granskningen gäller. Går den
 * att redigera efteråt blir lawyer_reviewed_at en lögn — stämpeln sitter kvar
 * på något annat än det som faktiskt lästes. En ändring kräver därför en ny
 * version (version + 1), som i sin tur är ogranskad tills någon granskat den.
 *
 * lawyer_reviewed_note och is_current får ändras: anteckningen om granskningen
 * hör till granskningen och inte till avtalstexten, och is_current styr bara
 * vilken version nya avtal genereras från.
 */
create or replace function agreement_templates_guard()
returns trigger language plpgsql as $$
begin
  -- DELETE: new är null här, så kontrollen måste ske före UPDATE-grenen och
  -- returnera old. En granskad version är det jurist faktiskt läste — den får
  -- inte försvinna, för då går det inte längre att visa vad granskningen gällde.
  if tg_op = 'DELETE' then
    if old.lawyer_reviewed_at is not null then
      raise exception 'Granskad mallversion får inte raderas.';
    end if;
    return old;
  end if;

  if old.lawyer_reviewed_at is not null then
    if new.title is distinct from old.title
    or new.body is distinct from old.body
    or new.kind is distinct from old.kind
    or new.version is distinct from old.version
    then
      raise exception 'Mallversion %/% är granskad av jurist och får inte ändras. Skapa en ny version i stället.',
        old.kind, old.version;
    end if;
    -- Granskningen själv får inte heller backas eller flyttas.
    if new.lawyer_reviewed_at is distinct from old.lawyer_reviewed_at then
      raise exception 'lawyer_reviewed_at är redan satt för %/% och får inte ändras.', old.kind, old.version;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists agreement_templates_guard_trg on agreement_templates;
create trigger agreement_templates_guard_trg before update or delete on agreement_templates
  for each row execute function agreement_templates_guard();

create table if not exists agreements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  -- restrict, inte set null: agreements_guard förbjuder att
  -- billing_client_id ändras på ett avtal som inte är utkast, så en kaskad som
  -- försökte nolla fältet hade avvisats av triggern — med ett förvirrande
  -- felmeddelande om oföränderlighet i stället för ett tydligt om att kunden
  -- har avtal. restrict ger rätt fel på rätt ställe: kunden går inte att
  -- radera medan det finns avtal som pekar på den.
  billing_client_id uuid references billing_clients(id) on delete restrict,

  /** Frusen vid genereringen. Ändras aldrig. */
  rendered_title text not null,
  rendered_body text not null,
  /** SHA-256 (hex) av rendered_body. Bevisar att texten inte ändrats. */
  content_hash text not null,
  /** Vilka mallversioner som ingick, t.ex. {"service":3,"dpa":2,"price":1}. */
  template_versions jsonb not null default '{}'::jsonb,
  /** Kopia av kunduppgifterna som avtalet skrevs mot. */
  buyer_snapshot jsonb,

  status text not null default 'draft',
  /** Satt när operatören skickat länken, inte automatiskt. */
  sent_at timestamptz,
  accepted_at timestamptz,
  /** FÖRSLAG – kräver jurist. Avtalsperiod och förnyelse. */
  valid_from date,
  valid_until date,
  renewal_notice_days integer default 90,

  pdf_path text,
  created_at timestamptz not null default now(),

  constraint agreements_status_known check (status in ('draft','sent','accepted','declined','expired','superseded'))
);

create index if not exists agreements_client on agreements (user_id, billing_client_id);
create index if not exists agreements_valid_until on agreements (user_id, valid_until);

/**
 * Ett genererat avtal får inte ändras i innehållet.
 *
 * Status, sent_at, accepted_at och pdf_path måste gå att sätta — det är
 * livscykeln. Texten, hashen och mallversionerna är frysta.
 */
create or replace function agreements_guard()
returns trigger language plpgsql as $$
begin
  -- Ett avtal som skickats eller godkänts är bevisning för vad som avtalades
  -- och får inte försvinna. Utkast som aldrig nått kunden får kastas.
  if tg_op = 'DELETE' then
    if old.status is distinct from 'draft' then
      raise exception 'Avtal med status % får inte raderas. Sätt status till superseded i stället.', old.status;
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    -- Ett avtal som nått kunden får inte göras till utkast igen. Då hade den
    -- frysta texten blivit redigerbar och bevisvärdet försvunnit.
    if old.status is distinct from 'draft' and new.status = 'draft' then
      raise exception 'Skickat eller godkänt avtal får inte återgå till utkast. Sätt status till superseded.';
    end if;

    -- Tidpunkterna är bevisning och sätts en gång. Att kunna flytta dem i
    -- efterhand hade gjort dem värdelösa som underlag för när avtalet ingicks.
    if old.sent_at is not null and new.sent_at is distinct from old.sent_at then
      raise exception 'sent_at är redan satt och får inte ändras.';
    end if;
    if old.accepted_at is not null and new.accepted_at is distinct from old.accepted_at then
      raise exception 'accepted_at är redan satt och får inte ändras.';
    end if;

    -- Ägare och motpart hör till vad som avtalades. På ett avtal som inte är
    -- utkast får de inte flyttas — ett godkänt avtal ska inte kunna bokas om
    -- till en annan kund i efterhand.
    if old.status is distinct from 'draft' then
      if new.user_id is distinct from old.user_id then
        raise exception 'user_id får inte ändras på ett avtal som inte är utkast.';
      end if;
      if new.billing_client_id is distinct from old.billing_client_id then
        raise exception 'billing_client_id får inte ändras på ett avtal som inte är utkast.';
      end if;
    end if;

    if new.rendered_body is distinct from old.rendered_body
    or new.rendered_title is distinct from old.rendered_title
    or new.content_hash is distinct from old.content_hash
    or new.template_versions::text is distinct from old.template_versions::text
    or new.buyer_snapshot::text is distinct from old.buyer_snapshot::text
    then
      raise exception 'Ett genererat avtal får inte ändras. Generera ett nytt avtal i stället.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists agreements_guard_trg on agreements;
create trigger agreements_guard_trg before update or delete on agreements
  for each row execute function agreements_guard();

-- ── Publik acceptlänk ───────────────────────────────────────────────────────
-- Token lagras ALDRIG i klartext, bara som SHA-256. Läcker databasen går
-- befintliga länkar inte att återanvända.
create table if not exists agreement_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  -- restrict, inte cascade: en acceptans är bevisning för att avtalet ingicks
  -- och får inte försvinna med avtalsraden. Eftersom agreements_guard dessutom
  -- bara tillåter radering av utkast betyder det i praktiken att ett avtal som
  -- någon gång fått en acceptanslänk inte går att radera alls.
  agreement_id uuid not null references agreements(id) on delete restrict,

  token_hash text not null unique,
  expires_at timestamptz not null,
  /** Engångslänk: satt när den använts, och då går den inte att använda igen. */
  used_at timestamptz,

  /** Bevisning för att avtalet ingicks: när, varifrån, med vilken webbläsare. */
  accepted_ip text,
  accepted_user_agent text,
  accepted_name text,

  /** Räknas upp vid varje försök, även misslyckade. Underlag för spärr. */
  attempt_count integer not null default 0,
  last_attempt_at timestamptz,

  created_at timestamptz not null default now()
);

create index if not exists agreement_acceptances_agreement on agreement_acceptances (agreement_id);

-- ── AVVECKLING AV ETT KONTO MISSLYCKAS MED AVSIKT ───────────────────────────
-- Två skydd i den här filen gör att ett användarkonto med skickade eller
-- godkända avtal INTE går att radera rent:
--
--   1. agreements_guard tillåter bara radering av avtal med status 'draft'.
--   2. agreement_acceptances.agreement_id är on delete restrict, så en
--      acceptansrad hindrar att avtalet försvinner.
--
-- Raderas auth-användaren kaskaderar user_id på båda tabellerna, men Postgres
-- garanterar ingen ordning mellan kaskaderna — försöker den ta avtalet före
-- acceptansen stoppas den av restrict, och hela raderingen rullas tillbaka.
--
-- DET ÄR AVSIKTLIGT. Ett avtal och dess acceptans är bevisning för vad som
-- avtalades och när. Att den bevisningen tyst försvinner när någon rensar ett
-- konto är värre än att raderingen misslyckas högt.
--
-- Ett konto som verkligen ska avvecklas kräver därför en SÄRSKILD RUTIN: avtal
-- och acceptanser ska först exporteras och arkiveras utanför databasen, och
-- raderingen dokumenteras. Kontot får inte raderas tyst. Rutinen finns inte
-- byggd — bygg den innan ett konto avvecklas, inte efteråt.

-- Hastighetsbegränsning för publika routes. Nyckeln är en HASH av IP plus
-- route, inte IP:n själv — spärren fungerar lika bra och vi lagrar inte
-- besökarnas adresser i onödan.
create table if not exists public_rate_limit (
  bucket text primary key,
  window_start timestamptz not null default now(),
  hits integer not null default 0
);

alter table agreement_templates    enable row level security;
alter table agreements             enable row level security;
alter table agreement_acceptances  enable row level security;
alter table public_rate_limit      enable row level security;

drop policy if exists "Agreement templates - own rows" on agreement_templates;
create policy "Agreement templates - own rows" on agreement_templates
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Agreements - own rows" on agreements;
create policy "Agreements - own rows" on agreements
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Bara läsa och skapa. Ingen update- eller delete-policy, så RLS nekar båda
-- även för ägaren: en operatör ska inte kunna ändra tidpunkten, IP-adressen
-- eller namnet på en registrerad acceptans i efterhand — det är själva
-- bevisvärdet.
--
-- Den publika acceptansrouten kan därför INTE använda den inloggade klienten
-- för att sätta used_at, accepted_ip och accepted_user_agent. Den måste gå via
-- service-rollen (createSupabaseServiceClient), som går runt RLS, och själv
-- avgränsa skrivningen till raden vars token_hash matchar. Besökaren har ingen
-- session, så det är ändå den enda möjliga vägen.
drop policy if exists "Agreement acceptances - own rows" on agreement_acceptances;
drop policy if exists "Agreement acceptances - read own" on agreement_acceptances;
drop policy if exists "Agreement acceptances - insert own" on agreement_acceptances;
create policy "Agreement acceptances - read own" on agreement_acceptances
  for select to authenticated using (auth.uid() = user_id);
--
-- Ägaren får bara skapa OANVÄNDA token. Villkoret nedan hindrar att en
-- operatör skriver in en acceptans för hand och därmed hittar på att kunden
-- godkänt avtalet: used_at, accepted_ip, accepted_user_agent och accepted_name
-- måste alla vara null vid insättningen, och eftersom det inte finns någon
-- update-policy kan ägaren inte fylla dem efteråt heller. Bara service-rollen
-- kan det, och den används bara av den publika routen när besökaren faktiskt
-- klickat.
--
-- exists-villkoret hindrar att en operatör skapar en acceptanslänk för NÅGON
-- ANNANS avtal. Utan det räckte det att sätta sitt eget user_id på raden och
-- peka agreement_id mot ett främmande avtal — och då hade man en giltig länk
-- som godkänner ett avtal man inte äger.
create policy "Agreement acceptances - insert own" on agreement_acceptances
  for insert to authenticated with check (
    auth.uid() = user_id
    and used_at is null
    and accepted_ip is null
    and accepted_user_agent is null
    and accepted_name is null
    and exists (
      select 1 from agreements a
       where a.id = agreement_id and a.user_id = auth.uid()
    )
  );

-- SAMBANDET MELLAN AVTAL OCH ACCEPTANS, för den som bygger vidare:
--
-- Ett avtal med status 'accepted' bör kunna kopplas till en rad här med
-- used_at satt — det är den raden som bär bevisningen (tidpunkt, IP,
-- user agent). Databasen tvingar inte sambandet, eftersom det finns ett
-- legitimt undantag:
--
-- PAPPERSUNDERSKRIVNA AVTAL har ingen acceptansrad alls. Kunden laddar ner
-- PDF:en, skriver under på papper, och då finns ingen klickning att logga.
-- Den vägen kräver ett eget fält för hur avtalet ingicks och var det
-- underskrivna exemplaret finns — och den byggs i Steg A, inte här. Tills dess
-- ska ett 'accepted' avtal UTAN acceptansrad betraktas som ett avtal vars
-- ingående inte är dokumenterat i systemet.

-- Ingen policy alls på public_rate_limit: bara service-rollen (som går runt
-- RLS) rör den, från den publika routen. Varken anon eller authenticated ska
-- kunna läsa eller nollställa spärren.
