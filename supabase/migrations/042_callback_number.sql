-- Återuppringningsnummer: numret den som ringde själv gav för att bli uppringd.
--
-- Två fall där from_number inte räcker:
--   - Dolt nummer. Twilio skickar då "anonymous" eller en platshållare, och
--     receptionisten ber om ett nummer att ringa tillbaka på.
--   - "Ring mig hellre på jobbet." Personen ringer från ett nummer men vill bli
--     uppringd på ett annat.
--
-- Numret plockas ut av samma Claude-analys som skriver sammanfattningen
-- (lib/call-insights.ts), och bara när den som ringer uttryckligen ger det för
-- att bli uppringd. Ett nummer som bara nämns i samtalet sparas inte.
-- Telefonnumren skickas aldrig till modellen: de byts mot platshållare
-- ("[telefonnummer 1]") och modellen pekar bara ut vilken platshållare det
-- gäller. Siffrorna sätts tillbaka, normaliseras till E.164 (+46…) och
-- valideras på servern innan något sparas.
--
-- Bara det här fältet bär numret. Sammanfattningar och transkript maskeras
-- precis som förut (lib/redact.ts).
--
-- Säker att köra före eller efter att koden deployas: koden faller tillbaka
-- till att inte spara eller visa numret när kolumnen saknas.
--
-- RLS oförändrad: call_logs är authenticated-only (019_auth_rls.sql). BOS-
-- routerna läser via service-rollen och skickar bara ett fält-urval. Numret
-- skickas till sidan bara i klientläge, aldrig till en säljdemo.
--
-- Gallring: kolumnen är en personuppgift i samma klass som from_number och ska
-- gallras med den (lib/retention.ts, sammanfattningsperioden).

alter table call_logs add column if not exists callback_number text;

comment on column call_logs.callback_number is
  'Numret den som ringde uttryckligen gav för att bli uppringd, E.164 (+46…). Satt av samtalsanalysen (lib/call-insights.ts). Null när inget nummer gavs.';

-- Bakkantsskydd: bara E.164. Normalisering och validering görs i
-- lib/call-insights.ts innan värdet når hit.
alter table call_logs drop constraint if exists call_logs_callback_number_check;
alter table call_logs add constraint call_logs_callback_number_check
  check (callback_number is null or callback_number ~ '^\+[1-9][0-9]{6,14}$');

-- ROLLBACK
-- alter table call_logs drop constraint if exists call_logs_callback_number_check;
-- alter table call_logs drop column if exists callback_number;
