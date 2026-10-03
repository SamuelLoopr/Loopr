-- Vilken telefoniväg ett samtal kom in genom.
--
-- Fram till nu fanns bara en väg: Twilio (finskt nummer +358454906617) ->
-- ElevenLabs via app/api/twilio/incoming-call. Nu finns en andra: ett svenskt
-- 46elks-nummer som kopplar samtalet vidare med SIP direkt till ElevenLabs,
-- utan att ljudet passerar oss alls.
--
-- Twilio-vägen är kvar orörd som reträtt. Båda skriver till call_logs, och utan
-- den här kolumnen gick det inte att se vilken väg ett samtal tog — vilket är
-- precis det man vill veta när man utvärderar om den nya vägen håller.
--
--   'twilio'  app/api/twilio/incoming-call -> TwiML -> ElevenLabs
--   '46elks'  46elks voice_start -> SIP -> ElevenLabs
--
-- Ingen CHECK-villkor med avsikt: koden driftsätts före sina migrationer, och
-- en tredje leverantör skulle då skrivas av kod som finns innan ett villkor
-- hunnit uppdateras — och ge 23514 i stället för en rad. Kolumnen dokumenteras
-- i stället här.
--
-- RLS oförändrad: call_logs är authenticated-only (019_auth_rls.sql). De
-- publika BOS-routerna kopierar bara ett urval av fält till svaren, så
-- kolumnen syns inte för klienten förrän den läggs till där med avsikt.

alter table call_logs add column if not exists provider text;

comment on column call_logs.provider is
  'Telefonivägen samtalet kom in genom: twilio (finskt nummer, TwiML) eller 46elks (svenskt nummer, SIP direkt till ElevenLabs). Null på rader från före 033.';

-- Allt som finns före den här migrationen kom genom Twilio.
update call_logs set provider = 'twilio' where provider is null;

-- "Aktiva klienter" och BOS filtrerar på agent och status och grupperar per
-- väg när man vill jämföra dem.
create index if not exists call_logs_provider_idx
  on call_logs (provider)
  where provider is not null;
