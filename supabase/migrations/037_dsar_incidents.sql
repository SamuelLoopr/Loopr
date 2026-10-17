-- Registrerades rättigheter (DSAR) och incidentregister.
--
-- Båda är loggböcker, inte automatik. Poängen är att kunna visa att ett ärende
-- togs emot, när fristen gick ut och vad som gjordes — inte att påstå att vi
-- uppfyller GDPR.

-- ── d) Begäranden från registrerade ─────────────────────────────────────────
create table if not exists dsar_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,

  /**
   * Vem begäran gäller. Normalt ett telefonnummer, eftersom det är den enda
   * identifierare vi har om en uppringare. Lagras i klartext — det måste det,
   * annars går ärendet inte att koppla till rätt samtal.
   */
  subject_identifier text not null,
  subject_note text,

  request_type text not null,
  status text not null default 'received',

  received_at timestamptz not null default now(),
  /**
   * En månad enligt GDPR art. 12(3). Beräknas som received_at + 1 månad, vilket
   * Postgres hanterar kalenderriktigt (31 jan + 1 månad = 28 feb).
   */
  due_at timestamptz not null default (now() + interval '1 month'),
  completed_at timestamptz,

  /** Vad som gjordes: exporterat, raderat, avslaget och varför. */
  outcome_note text,
  /** Antal rader som berördes, för bevisning. */
  affected_rows integer,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint dsar_type_known check (request_type in ('access','erasure','rectification','portability','restriction','objection')),
  constraint dsar_status_known check (status in ('received','in_progress','completed','rejected'))
);

create index if not exists dsar_requests_due on dsar_requests (user_id, due_at);

-- ── e) Incidentregister ─────────────────────────────────────────────────────
create table if not exists privacy_incidents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,

  occurred_at timestamptz,
  /**
   * 72-timmarsfristen i GDPR art. 33 räknas från när incidenten UPPTÄCKTES,
   * inte från när den inträffade. Därför två skilda fält, och fristen nedan
   * räknas på upptäckten.
   */
  discovered_at timestamptz not null default now(),
  report_due_at timestamptz not null default (now() + interval '72 hours'),

  description text not null,
  scope text,
  affected_count integer,
  measures text,

  reported_to_imy boolean not null default false,
  reported_at timestamptz,
  /** Om vi bedömt att anmälan inte krävs — skälet hör till bevisningen. */
  no_report_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists privacy_incidents_due on privacy_incidents (user_id, report_due_at);

alter table dsar_requests     enable row level security;
alter table privacy_incidents enable row level security;

drop policy if exists "DSAR requests - own rows" on dsar_requests;
create policy "DSAR requests - own rows" on dsar_requests
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Privacy incidents - own rows" on privacy_incidents;
create policy "Privacy incidents - own rows" on privacy_incidents
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
