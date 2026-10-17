-- Sidan "Avtal & Fakturor": säljarens egna uppgifter och kundregistret.
--
-- Säljaruppgifterna är de som måste stå på en faktura. Momsregistrering är ett
-- eget fält och inte en följd av att momsreg.nr är ifyllt: en verksamhet kan ha
-- ett organisationsnummer men inte vara momsregistrerad, och då ska fakturan
-- INTE innehålla moms och i stället ange skälet. Det styr beräkningen i 039.

create table if not exists seller_settings (
  id uuid primary key default gen_random_uuid(),
  /** En rad per användare. unique nedan gör det till en inställningssida. */
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,

  seller_name text,
  /** Organisationsnummer eller personnummer för enskild firma. */
  org_number text,
  address_line1 text,
  address_line2 text,
  postal_code text,
  city text,
  country text default 'Sverige',
  email text,
  phone text,

  /**
   * Avgör om moms läggs på alls. false = ingen moms och en rad på fakturan som
   * förklarar varför (vat_exempt_note).
   */
  vat_registered boolean not null default false,
  vat_number text,
  /** FÖRSLAG – kräver jurist/revisor. */
  vat_exempt_note text default 'Ej momsregistrerad verksamhet.',
  /** FÖRSLAG – kräver jurist. Standardmomssats i Sverige. */
  default_vat_rate numeric not null default 25,

  /** "Godkänd för F-skatt" ska stå på fakturan när det stämmer. */
  f_tax_approved boolean not null default false,
  f_tax_text text default 'Godkänd för F-skatt.',

  bankgiro text,
  iban text,
  bic text,
  payment_reference_note text,

  /** FÖRSLAG – kräver jurist. 30 dagar är branschvanligt, inte lagstadgat. */
  default_payment_terms_days integer not null default 30,
  /**
   * FÖRSLAG – kräver jurist. Räntelagen 6 § ger referensränta + 8
   * procentenheter som dröjsmålsränta när inget annat avtalats.
   */
  default_late_interest_note text default 'Vid försenad betalning utgår dröjsmålsränta enligt räntelagen (referensränta + 8 procentenheter).',
  default_terms text,

  /** Fakturanummerprefix, t.ex. "2026-". Tomt är tillåtet. */
  invoice_number_prefix text default '',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seller_settings_one_per_user unique (user_id)
);

comment on table seller_settings is
  'Säljarens fakturauppgifter. vat_registered styr om moms beräknas alls. Standardvärdena är FÖRSLAG och inte juridiskt granskade.';

-- Kundregister, kopplat till agenten så fakturaunderlaget kan räknas ur
-- call_logs per kund och månad.
create table if not exists billing_clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  agent_id uuid references agents(id) on delete set null,

  company_name text not null,
  org_number text,
  address_line1 text,
  address_line2 text,
  postal_code text,
  city text,
  country text default 'Sverige',
  contact_person text,
  email text,
  phone text,

  /**
   * Prismodellen. monthly_price_sek dubblerar agents.monthly_price_sek (031)
   * med avsikt: den här är fakturaunderlaget och ska inte ändras retroaktivt av
   * att någon justerar priset på agentsidan. Kostnadssidan fortsätter läsa
   * agents-kolumnen, så /aktiva-klienter påverkas inte.
   */
  monthly_price_sek numeric,
  included_minutes integer,
  overage_price_sek numeric,

  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists billing_clients_agent on billing_clients (user_id, agent_id);

alter table seller_settings enable row level security;
alter table billing_clients enable row level security;

drop policy if exists "Seller settings - own rows" on seller_settings;
create policy "Seller settings - own rows" on seller_settings
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Billing clients - own rows" on billing_clients;
create policy "Billing clients - own rows" on billing_clients
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
