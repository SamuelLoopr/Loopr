-- Mina egna betyg på ElevenLabs-rösterna.
--
-- Efter importen av hela svenska biblioteket finns 55 svenska röster i kontot,
-- och enda sättet att veta vilken som låter bra är att lyssna. Det går inte att
-- avgöra ur API-svaret, och ingen modell kan höra skillnaden åt oss. Det här är
-- alltså en anteckningsbok för operatörens egna lyssningsintryck — inget
-- automatiskt mått.
--
-- Betyget hör till RÖSTEN, inte till en agent eller kund: hela poängen är att
-- bedömningen ska gå att återanvända när nästa kund ska få en röst. Därför en
-- egen tabell på voice_id i stället för kolumner på agents.
--
-- ÄGARNIVÅ-RLS, till skillnad från resten av dashboarden. 019_auth_rls.sql
-- förklarar varför de andra tabellerna är `to authenticated using (true)`:
-- deras rader skrevs innan auth fanns och har user_id NULL, så ett
-- ägarvillkor hade låst ut ägaren från sin egen data. Den kommentaren slutar
-- med "Revisit when rows start carrying a real user_id" — och den här tabellen
-- gör det från första raden. Betygen är personliga, så de scopas på
-- auth.uid(). Ingen anon-policy alls: ingenting här ska kunna läsas publikt.

create table if not exists voice_ratings (
  id uuid primary key default gen_random_uuid(),

  -- Default auth.uid() som skyddsnät. Klienten skickar user_id uttryckligen
  -- ändå, eftersom upsert behöver det som konfliktmål.
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,

  -- ElevenLabs voice_id. Text och inte en främmande nyckel: rösterna bor hos
  -- ElevenLabs, inte hos oss, och ett betyg ska kunna sättas på en röst i det
  -- delade biblioteket innan den importerats till kontot.
  voice_id text not null,

  /** 1–5. Null betyder "anteckning utan betyg", vilket är ett giltigt läge. */
  rating smallint,

  /** Fritext: "låter lite robotisk", "bra för Bentus, professionell ton". */
  note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint voice_ratings_rating_range check (rating is null or (rating >= 1 and rating <= 5)),
  constraint voice_ratings_user_voice_unique unique (user_id, voice_id)
);

comment on table voice_ratings is
  'Operatörens egna lyssningsbetyg per ElevenLabs-röst. Personliga (auth.uid()), återanvänds mellan kunder, aldrig publikt synliga.';

alter table voice_ratings enable row level security;

-- Bara inloggade, och bara sina egna rader. Samma form som crm_lists (004) och
-- de ursprungliga tabellerna i 001.
drop policy if exists "Voice ratings - own rows" on voice_ratings;
create policy "Voice ratings - own rows" on voice_ratings
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Uppslag sker alltid som "alla mina betyg" eller "mitt betyg på den här
-- rösten". Unik-villkoret ovan täcker båda, eftersom user_id är dess första
-- kolumn — inget extra index behövs.
