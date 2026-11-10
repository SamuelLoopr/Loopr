-- Varningar till operatören och reservnummer när ElevenLabs inte svarar.
--
-- ops_alerts: en rad per skickad varning, för att begränsa dem till en per
-- sort och timme (lib/ops-alert.ts). Unik på (kind, bucket), så två samtidiga
-- körningar aldrig skickar samma varning två gånger. Bara service-rollen
-- läser och skriver; RLS på utan regler.
--
-- agents.fallback_number: null (standard) = av, samtalet kopplas bara till
-- ElevenLabs som i dag. Satt = 46elks kopplar dit om ElevenLabs inte svarar.
-- Triggern nekar ett nummer som är ett av våra egna (phone_numbers), oavsett
-- agent: det skulle koppla samtalet tillbaka till oss i en loop. Ett nummer
-- som vidarekopplar till oss (som kontorets 031-nummer) syns inte här, så det
-- skyddet ligger hos den som sätter numret.
--
-- Säker att köra före eller efter koden.

create table if not exists ops_alerts (
  kind text not null,
  bucket text not null,
  sent_at timestamptz not null default now(),
  primary key (kind, bucket)
);
alter table ops_alerts enable row level security;

alter table agents add column if not exists fallback_number text;

create or replace function public.agents_fallback_number_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.fallback_number is null then
    return new;
  end if;
  if new.fallback_number !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'fallback_number måste vara ett nummer i E.164, till exempel +4631123456';
  end if;
  if exists (
    select 1 from phone_numbers
    where regexp_replace(phone_number, '\D', '', 'g') = regexp_replace(new.fallback_number, '\D', '', 'g')
  ) then
    raise exception 'fallback_number får inte vara ett av Loopr-numren (det blir en loop)';
  end if;
  return new;
end;
$$;

drop trigger if exists agents_fallback_number_guard on agents;
create trigger agents_fallback_number_guard
  before insert or update of fallback_number on agents
  for each row execute function public.agents_fallback_number_guard();

-- ROLLBACK
-- drop trigger if exists agents_fallback_number_guard on agents;
-- drop function if exists public.agents_fallback_number_guard();
-- alter table agents drop column if exists fallback_number;
-- drop table if exists ops_alerts;
