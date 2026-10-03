-- Lösningsgrad: hur stor andel av samtalen AI-receptionisten klarar helt själv.
--
-- Siffran ska kunna visas både för oss ("Aktiva klienter") och för klienten
-- ("Ert konto" i BOS) som ett mått på vad tjänsten gör. Då måste den vara
-- försvarbar om någon frågar hur den räknas, så bedömningen sparas per samtal
-- i stället för att räknas fram ur något indirekt.
--
-- Grunden finns redan: contact_request (027) säger om den som ringde vill bli
-- uppringd, bokad eller få en offert — allt sådant kräver att Bentus gör något.
-- Men den fångar inte det omvända felet: ett samtal där receptionisten sa att
-- den inte vet, eller inte kunde svara. Det är inte heller löst, men får
-- contact_request = 'none' och skulle räknats som en succé.
--
-- Därför en egen kolumn, satt av samma Claude-analys som skriver
-- sammanfattningen (lib/call-insights.ts, INSIGHT_VERSION 3):
--
--   true   samtalet är färdigt — personen fick vad den behövde och ingen på
--          företaget behöver göra något mer
--   false  någon måste ta i det: kontaktförfrågan, eller så kunde
--          receptionisten inte svara
--   null   går inte att bedöma — den som ringde sa aldrig något
--
-- null är avsiktligt skilt från false. Ett samtal där ingen sa något (fellagt,
-- lade på direkt) har ingenting att lösa, och räknas därför varken som löst
-- eller olöst — det hålls utanför både täljare och nämnare
-- (lib/resolution-rate.ts). Att kalla såna samtal lösta hade blåst upp
-- siffran med fellagda samtal; att kalla dem olösta hade dragit ner den för
-- något receptionisten inte kunde göra något åt.
--
-- Eftersom INSIGHT_VERSION går från 2 till 3 analyseras befintliga samtal om
-- och får kolumnen ifylld. Det skickar INGA nya mejl: notiserna bokas med
-- call_logs.notified_at (030), och en rad som redan notiserats matchar inte
-- bokningen igen.
--
-- RLS oförändrad: call_logs är authenticated-only (019_auth_rls.sql). De
-- publika BOS-routerna läser via service-rollen och kopierar bara ett
-- fält-urval till svaret, så kolumnen syns inte publikt förrän den läggs till
-- där med avsikt.

alter table call_logs add column if not exists ai_resolved boolean;

comment on column call_logs.ai_resolved is
  'Löste AI:n samtalet helt själv? true = inget kvar för företaget att göra, false = kräver uppföljning eller kunde inte svara, null = inget sades (räknas inte).';

-- Sidan "Aktiva klienter" räknar lösningsgrad per agent och period, och BOS
-- gör samma sak för en agent. Båda filtrerar på agent_id + status och sorterar
-- på created_at, vilket det här indexet täcker.
create index if not exists call_logs_agent_created_idx
  on call_logs (agent_id, created_at desc)
  where status = 'completed';
