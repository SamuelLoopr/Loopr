-- E-postnotis per färdiganalyserat samtal, på klientens BOS-sida.
--
--   agents.notification_email   adressen klienten själv skriver in under
--                               "Ert konto" på /master/[shareId]. NULL = av.
--   call_logs.notified_at       när notisen för det samtalet skickades.
--                               NULL = inte skickad än.
--
-- VARFÖR notified_at BEHÖVS. Analysen i lib/call-sync.ts körs vid sidladdning,
-- och samma rad kan passera den flera gånger: två flikar som laddar samtidigt,
-- eller en höjning av INSIGHT_VERSION som gör att äldre samtal analyseras om
-- (028). Utan en stämpel skulle klienten få om samma notis varje gång. Raden
-- "bokas" med ett villkorat UPDATE (... where notified_at is null) innan mejlet
-- skickas, så två samtidiga körningar aldrig kan skicka samma notis.
--
-- VARFÖR INGEN BACKFILL HÄR. När klienten sparar sin adress första gången
-- stämplas alla befintliga samtal som redan notifierade — det görs i
-- /api/public-agent/[shareId]/settings, inte här, eftersom det ska hända vid
-- varje ny adress och inte bara en gång vid migrationen. Annars hade Bentus
-- fått ett mejl per gammalt samtal i samma sekund de slog på funktionen.
--
-- RLS är oförändrad: båda tabellerna är authenticated-only (019_auth_rls.sql).
-- Den publika sidan läser och skriver bara via serverrouterna, som kör på
-- service-rollen och filtrerar på agenten bakom share-id:t.
--
-- Säker att köra före eller efter att koden deployas: utan kolumnerna fungerar
-- sidan precis som nu, bara utan notiser.

alter table agents    add column if not exists notification_email text;
alter table call_logs add column if not exists notified_at timestamptz;

-- Enkel rimlighetskoll. Riktig validering (längd, format, trimning) görs i
-- lib/notification-email.ts innan värdet når hit; det här är bakkantsskyddet.
alter table agents drop constraint if exists agents_notification_email_check;
alter table agents add constraint agents_notification_email_check
  check (
    notification_email is null
    or (notification_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
        and char_length(notification_email) <= 254)
  );

-- Notisjobbet letar efter oskickade samtal för en agent.
create index if not exists call_logs_agent_unnotified on call_logs (agent_id)
  where notified_at is null;

-- ROLLBACK
-- drop index if exists call_logs_agent_unnotified;
-- alter table agents drop constraint if exists agents_notification_email_check;
-- alter table call_logs drop column if exists notified_at;
-- alter table agents drop column if exists notification_email;
