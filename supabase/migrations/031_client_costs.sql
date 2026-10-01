-- Kostnad per samtal och tjänst, för dashboardsidan "Aktiva klienter".
--
-- Kartlagt mot de riktiga API:erna 2026-10-01:
--
--   Twilio      GET /Calls.json ger price (sträng, negativ = avgift) och
--               price_unit ("USD"). Finns kvar långt i efterhand.
--   ElevenLabs  GET /v1/convai/conversations/{id} ger metadata.cost_fiat i USD
--               (och metadata.cost i krediter). Finns kvar i efterhand.
--   Anthropic   har INGEN uppslagning i efterhand — /v1/messages/usage och
--               /v1/usage ger 404, och organisationsrapporten kräver Admin-
--               nyckel och ger ändå bara totaler. Därför loggas tokens vid
--               själva anropet i lib/call-insights.ts, och kostnaden räknas ut
--               i lib/service-pricing.ts. Bara framåt i tiden.
--
-- Alla belopp sparas i USD, som är vad leverantörerna fakturerar i. Växling
-- till kronor sker vid visning (USD_TO_SEK_RATE), så en ändrad kurs inte kräver
-- att historiken skrivs om.
--
-- Den gamla kolumnen call_logs.cost lämnas orörd: den är null på varje rad och
-- har tvetydig valuta. Nya siffror hamnar i de uttryckliga kolumnerna nedan.
--
-- RLS oförändrad: båda tabellerna är authenticated-only (019_auth_rls.sql).
-- Sidan är en vanlig inloggad dashboardsida utan publik åtkomst.

-- ── Vad klienten betalar ────────────────────────────────────────────────────
-- subscription_plan på profile är OPERATÖRENS egen Loopr-plan, inte vad
-- klienten betalar — det finns inget pris per klient i databasen. Här är det.
-- Null = inte satt, och då visas ingen marginal för klienten.
alter table agents add column if not exists monthly_price_sek numeric;

alter table agents drop constraint if exists agents_monthly_price_positive;
alter table agents add constraint agents_monthly_price_positive
  check (monthly_price_sek is null or (monthly_price_sek >= 0 and monthly_price_sek < 1000000));

-- ── Kostnad per samtal ──────────────────────────────────────────────────────
-- Twilios identifierare sparades inte tidigare, så gamla rader matchas mot
-- Twilio på nummer + starttid + längd (vår created_at ligger inom en sekund
-- från deras start_time). Nya samtal skriver sid direkt och behöver ingen
-- gissning alls.
alter table call_logs add column if not exists twilio_call_sid text;
alter table call_logs add column if not exists cost_twilio_usd numeric;
alter table call_logs add column if not exists cost_elevenlabs_usd numeric;

-- Anthropic: tokens loggas, priset räknas ut vid visning. Att spara tokens i
-- stället för ett belopp gör att en prisändring hos Anthropic inte gör
-- historiken fel.
alter table call_logs add column if not exists anthropic_input_tokens integer;
alter table call_logs add column if not exists anthropic_output_tokens integer;

-- När de externa kostnaderna senast hämtades. Null = aldrig. Används för att
-- inte fråga Twilio och ElevenLabs om samma samtal vid varje sidladdning.
alter table call_logs add column if not exists cost_synced_at timestamptz;

create index if not exists call_logs_cost_unsynced on call_logs (agent_id, created_at desc)
  where cost_synced_at is null;

-- ROLLBACK
-- drop index if exists call_logs_cost_unsynced;
-- alter table call_logs drop column if exists cost_synced_at;
-- alter table call_logs drop column if exists anthropic_output_tokens;
-- alter table call_logs drop column if exists anthropic_input_tokens;
-- alter table call_logs drop column if exists cost_elevenlabs_usd;
-- alter table call_logs drop column if exists cost_twilio_usd;
-- alter table call_logs drop column if exists twilio_call_sid;
-- alter table agents drop constraint if exists agents_monthly_price_positive;
-- alter table agents drop column if exists monthly_price_sek;
