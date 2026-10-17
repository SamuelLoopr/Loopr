-- Fakturor: obruten nummerserie, fullständigt innehåll, och oföränderlighet.
--
-- BYGGER VIDARE PÅ invoices (011 + 022), DUPLICERAR INTE. Befintliga kolumner
-- rörs inte. status behåller sina värden — 'sent' betyder utfärdad precis som
-- förut, och 'draft' läggs till som nytt läge FÖRE utfärdande. Det betyder att
-- varje befintlig rad förblir giltig och att MRR-beräkningen i
-- app/(dashboard)/dashboard/page.tsx (sum(amount) where status='paid' and
-- is_recurring) fortsätter ge exakt samma resultat. Ingen befintlig rad ändras
-- av den här migrationen.
--
-- VARFÖR INTE EN SEKVENS. En obruten nummerserie går inte att bygga på
-- Postgres sequences: nextval rullas INTE tillbaka, så varje misslyckad
-- transaktion bränner ett nummer och lämnar ett hål. En låst räknarrad
-- (select ... for update) rullas tillbaka tillsammans med insättningen och ger
-- en serie utan hål även när två utfärdanden sker samtidigt.
--
-- NUMRET DELAS UT VID UTFÄRDANDE, inte när utkastet skapas. Ett utkast som
-- kastas ska inte lämna ett hål i serien.

-- ── Nya kolumner på invoices ────────────────────────────────────────────────
alter table invoices add column if not exists user_id uuid;
-- OBS: invoices RLS lämnas role-level (019) med avsikt. Befintliga rader har
-- user_id NULL, och ett ägarvillkor hade låst ut ägaren från sin egen
-- fakturahistorik — exakt det 019 varnar för. Nya rader får user_id ifyllt så
-- skulden kan betalas senare.

alter table invoices add column if not exists invoice_number text;
alter table invoices add column if not exists invoice_date date;
alter table invoices add column if not exists due_date date;
alter table invoices add column if not exists period_start date;
alter table invoices add column if not exists period_end date;
alter table invoices add column if not exists issued_at timestamptz;
alter table invoices add column if not exists paid_at timestamptz;

-- Ögonblicksbilder av parterna. Måste frysas på fakturan: om kunden byter
-- adress nästa år ska den gamla fakturan fortfarande visa adressen som gällde.
alter table invoices add column if not exists seller_snapshot jsonb;
alter table invoices add column if not exists buyer_snapshot jsonb;
-- restrict, inte set null: invoices_guard_issued förbjuder att
-- billing_client_id ändras på en utfärdad faktura, så en kaskad som försökte
-- nolla fältet hade avvisats av triggern — med ett förvirrande fel om
-- oföränderlighet i stället för ett tydligt om att kunden har fakturor. En kund
-- med fakturor ska inte gå att radera.
alter table invoices add column if not exists billing_client_id uuid references billing_clients(id) on delete restrict;

-- Belopp. Den gamla kolumnen `amount` behålls som TOTALBELOPP inklusive moms,
-- eftersom MRR och bruttointäkten summerar just den. Specifikationen läggs
-- till i egna kolumner.
alter table invoices add column if not exists amount_excl_vat numeric;
alter table invoices add column if not exists vat_rate numeric;
alter table invoices add column if not exists vat_amount numeric;

-- Underlaget för rörlig del, räknat ur call_logs per kund och månad.
alter table invoices add column if not exists included_minutes integer;
alter table invoices add column if not exists used_minutes integer;
alter table invoices add column if not exists overage_minutes integer;
alter table invoices add column if not exists overage_price_sek numeric;
alter table invoices add column if not exists overage_amount numeric;

-- Texter som måste stå på fakturan, frysta vid utfärdandet.
alter table invoices add column if not exists f_tax_text text;
alter table invoices add column if not exists vat_exempt_note text;
alter table invoices add column if not exists payment_terms_text text;
alter table invoices add column if not exists late_interest_text text;
alter table invoices add column if not exists payment_info_text text;

-- Rättelse sker med kreditfaktura, aldrig genom att ändra originalet.
alter table invoices add column if not exists credit_of_invoice_id uuid references invoices(id) on delete restrict;
alter table invoices add column if not exists pdf_path text;
alter table invoices add column if not exists updated_at timestamptz;

-- Kontrollerat mot den levande databasen 2026-10-08: det fanns INGEN
-- CHECK-constraint och ingen enum på invoices.status — kolumnen är ren
-- `text default 'sent'`, och databasen tog emot både 'draft' och ett
-- nonsensvärde. 'draft' var alltså redan tillåtet, men vilket stavfel som helst
-- var det också, och ett felstavat 'paid' hade tystat MRR utan att någon märkt
-- det. Villkoret läggs till nu, medan tabellen är tom (0 rader), så det kan
-- inte kollidera med befintlig data.
--
-- 'sent' behåller sin innebörd: utfärdad. 'draft' är nytt och ligger före.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'invoices_status_known'
  ) then
    alter table invoices add constraint invoices_status_known
      check (status in ('draft','sent','paid','overdue','cancelled'));
  end if;
end $$;

create unique index if not exists invoices_number_unique
  on invoices (user_id, invoice_number) where invoice_number is not null;
create index if not exists invoices_billing_client on invoices (billing_client_id);

comment on column invoices.amount is
  'Totalbelopp INKLUSIVE moms. MRR och bruttointäkt summerar denna kolumn (022) — ändra inte innebörden.';
comment on column invoices.invoice_number is
  'Delas ut vid utfärdande av next_invoice_number(). Null på utkast, så kastade utkast inte lämnar hål i serien.';

-- ── Obruten nummerserie ─────────────────────────────────────────────────────
create table if not exists invoice_counters (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  prefix text not null default '',
  next_number integer not null default 1,
  updated_at timestamptz not null default now()
);

alter table invoice_counters enable row level security;
drop policy if exists "Invoice counters - own rows" on invoice_counters;
create policy "Invoice counters - own rows" on invoice_counters
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

/**
 * Nästa fakturanummer för en användare, utan hål och utan dubbletter.
 *
 * `for update` låser räknarraden för hela transaktionen, så två samtidiga
 * utfärdanden serialiseras i stället för att få samma nummer. Eftersom
 * ökningen sker i samma transaktion som fakturaskrivningen rullas den tillbaka
 * om skrivningen misslyckas — därav ingen lucka.
 *
 * security definer för att funktionen ska kunna låsa räknarraden även när
 * anroparens RLS-policy annars hade begränsat den. p_user jämförs mot
 * auth.uid() så en inloggad användare inte kan konsumera någon annans serie.
 *
 * Prefixet läses från invoice_counters.prefix, som är enda sanningen för
 * nummerserien. seller_settings har inget prefixfält (borttaget i 041). Sidan
 * Avtal & Fakturor läser och skriver prefixet direkt i invoice_counters.
 * Ändrar man prefix mitt i en serie gäller det bara framåt, redan utfärdade
 * nummer rörs inte.
 *
 * ── "INGEN LUCKA" GÄLLER BARA INOM EN TRANSAKTION ──────────────────────────
 * Återställningen av räknaren skyddar bara om numret tilldelas OCH fakturan
 * utfärdas i SAMMA transaktion. Hämtar en route numret i ett anrop och skriver
 * fakturan i ett annat, och det andra misslyckas, är numret redan förbrukat —
 * då finns luckan ändå, och den här funktionen kan inte göra något åt det.
 *
 * Steg A ska därför bygga en funktion issue_invoice() som gör båda sakerna i
 * ett anrop: tar numret, sätter invoice_date, issued_at och
 * ögonblicksbilderna, och flyttar status från 'draft'. Tills den finns är
 * serien bara obruten så länge anroparen håller allt i en transaktion.
 */
create or replace function next_invoice_number(p_user uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text;
  v_number integer;
begin
  if p_user is null or p_user is distinct from auth.uid() then
    raise exception 'next_invoice_number: får bara anropas för egen användare';
  end if;

  insert into invoice_counters (user_id) values (p_user)
    on conflict (user_id) do nothing;

  select prefix, next_number into v_prefix, v_number
    from invoice_counters where user_id = p_user
    for update;

  update invoice_counters
     set next_number = v_number + 1, updated_at = now()
   where user_id = p_user;

  -- Nollutfyllnad till fyra siffror, men serien får inte brytas vid 10000:
  -- då växer numret i stället för att klippas.
  return v_prefix || case
    when v_number < 10000 then lpad(v_number::text, 4, '0')
    else v_number::text
  end;
end;
$$;

revoke all on function next_invoice_number(uuid) from public, anon;
grant execute on function next_invoice_number(uuid) to authenticated;

-- next_number ändras BARA av next_invoice_number().
--
-- RLS-policyn ovan skulle annars låta ägaren skriva vilket next_number som
-- helst, och då är serien inte längre obruten — man kan hoppa över nummer
-- eller återanvända dem. Kolumnrättigheter är ett eget lager under RLS, så
-- även en användare som policyn släpper igenom nekas på kolumnnivå.
--
-- Funktionen är security definer och kör som sin ägare, så den berörs inte av
-- revoke nedan. Det är hela poängen: enda vägen till next_number går genom
-- funktionen, som ökar den med exakt ett.
--
-- delete nekas också, annars kan ägaren radera räknarraden och börja om serien
-- vid 1.
--
-- select lämnas orört, så sidan kan visa nuvarande prefix och nästa nummer.
revoke insert, update, delete on invoice_counters from authenticated;
grant insert (user_id, prefix), update (prefix) on invoice_counters to authenticated;

-- ── Oföränderlighet ─────────────────────────────────────────────────────────
/**
 * En utfärdad faktura får inte ändras.
 *
 * Men den måste kunna markeras betald, annars går den aldrig att bokföra och
 * MRR förblir noll för alltid. Triggern låser därför belopp, datum, nummer,
 * parter och specifikation, men släpper igenom status, paid_at, pdf_path,
 * kreditkoppling och updated_at.
 *
 * Utkast (status = 'draft') får ändras fritt — det är vad ett utkast är.
 *
 * INSERT kontrolleras av samma skäl: en rad som skapas direkt som utfärdad
 * blir oföränderlig i samma ögonblick, och saknar den fakturanummer eller
 * partsuppgifter är den permanent låst OCH ofullständig. Därför krävs allt vid
 * insättningen om status inte är 'draft'. Befintliga rader berörs inte —
 * triggern gäller bara nya skrivningar.
 *
 * DELETE blockeras helt på utfärdade fakturor: bokföringslagen 7 kap. 2 §
 * kräver att räkenskapsinformation bevaras till och med det sjunde året efter
 * utgången av det kalenderår då räkenskapsåret avslutades.
 */
create or replace function invoices_guard_issued()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.status is distinct from 'draft' then
      raise exception 'Utfärdad faktura % får inte raderas (bokföringslagen 7 kap. 2 §). Använd kreditfaktura.',
        coalesce(old.invoice_number, old.id::text);
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    -- Utkast får skapas fritt.
    if new.status is distinct from 'draft' then
      if new.user_id is null
      or new.invoice_number is null
      or new.invoice_date is null
      or new.issued_at is null
      or new.seller_snapshot is null
      or new.buyer_snapshot is null
      then
        -- user_id krävs: utan ägare går fakturan inte att knyta till en
        -- nummerserie, och den unika indexeringen av invoice_number är
        -- (user_id, invoice_number) — med null ägare kan samma nummer
        -- återanvändas obemärkt.
        raise exception 'En faktura kan inte skapas direkt som utfärdad utan user_id, invoice_number, invoice_date, issued_at, seller_snapshot och buyer_snapshot. Skapa den som utkast (status = ''draft'') och utfärda den sedan.';
      end if;
    end if;
    new.updated_at := now();
    return new;
  end if;

  -- Ett utfärdat nummer får inte återtas genom att fakturan görs till utkast
  -- igen. Det hade lämnat ett hål i serien och gjort en redan skickad faktura
  -- redigerbar.
  if old.status is distinct from 'draft' and new.status = 'draft' then
    raise exception 'Utfärdad faktura får inte återgå till utkast. Använd kreditfaktura.';
  end if;

  -- Utfärdandet är det ögonblick där fakturan blir ett bokföringsunderlag.
  -- Allt som måste stå på den ska finnas då, för efteråt går det inte att
  -- lägga till.
  if old.status = 'draft' and new.status is distinct from 'draft' then
    if new.user_id is null
    or new.invoice_number is null
    or new.invoice_date is null
    or new.issued_at is null
    or new.seller_snapshot is null
    or new.buyer_snapshot is null
    then
      raise exception 'Fakturan kan inte utfärdas: user_id, invoice_number, invoice_date, issued_at, seller_snapshot och buyer_snapshot måste alla vara satta.';
    end if;
  end if;

  -- Utkast är fritt redigerbara.
  if old.status is distinct from 'draft' then
    if new.invoice_number   is distinct from old.invoice_number
    or new.invoice_date     is distinct from old.invoice_date
    or new.due_date         is distinct from old.due_date
    or new.amount           is distinct from old.amount
    or new.amount_excl_vat  is distinct from old.amount_excl_vat
    or new.vat_rate         is distinct from old.vat_rate
    or new.vat_amount       is distinct from old.vat_amount
    or new.client_name      is distinct from old.client_name
    or new.description      is distinct from old.description
    or new.seller_snapshot::text is distinct from old.seller_snapshot::text
    or new.buyer_snapshot::text  is distinct from old.buyer_snapshot::text
    or new.period_start     is distinct from old.period_start
    or new.period_end       is distinct from old.period_end
    or new.used_minutes     is distinct from old.used_minutes
    or new.overage_minutes  is distinct from old.overage_minutes
    or new.overage_amount   is distinct from old.overage_amount
    or new.is_recurring     is distinct from old.is_recurring
    or new.agent_id         is distinct from old.agent_id
    or new.issued_at        is distinct from old.issued_at
    -- Texterna är frysta: de är en del av vad kunden fakturerades med, inte
    -- inställningar som får följa med när säljaruppgifterna ändras.
    or new.f_tax_text        is distinct from old.f_tax_text
    or new.vat_exempt_note   is distinct from old.vat_exempt_note
    or new.payment_terms_text is distinct from old.payment_terms_text
    or new.late_interest_text is distinct from old.late_interest_text
    or new.payment_info_text  is distinct from old.payment_info_text
    -- Underlaget för den rörliga delen hör till beloppet och låses med det.
    or new.included_minutes  is distinct from old.included_minutes
    or new.overage_price_sek is distinct from old.overage_price_sek
    -- Motparten hör till vad som fakturerades och får inte bokas om i
    -- efterhand. user_id hanteras separat nedan, eftersom äldre rader har null.
    or new.billing_client_id is distinct from old.billing_client_id
    then
      raise exception 'Utfärdad faktura % får inte ändras. Tillåtet: status, paid_at, pdf_path, kreditkoppling. Rättelse sker med kreditfaktura.',
        coalesce(old.invoice_number, old.id::text);
    end if;

    -- user_id får SÄTTAS på en gammal rad som saknar ägare — det är så
    -- multi-user-skulden från 019 ska kunna betalas i efterhand. Men när den
    -- en gång är satt får den inte flyttas: fakturan skulle då byta
    -- nummerserie, och den unika indexeringen är (user_id, invoice_number).
    if old.user_id is not null and new.user_id is distinct from old.user_id then
      raise exception 'Utfärdad faktura % är redan knuten till en ägare och får inte flyttas till en annan.',
        coalesce(old.invoice_number, old.id::text);
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists invoices_guard_issued_trg on invoices;
create trigger invoices_guard_issued_trg
  before insert or update or delete on invoices
  for each row execute function invoices_guard_issued();
