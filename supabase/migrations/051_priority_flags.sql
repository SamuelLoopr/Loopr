-- Viktiga samtal och företag: två flaggor per samtal från analysen.
--
-- agents.priority_flags: false (standard) = analysen ser ut exakt som i dag,
-- byte för byte, och flaggorna sätts aldrig. true = analysen bedömer också
--   is_urgent    något som gäller idag, en veteran som inte kan komma, en kund som väntar
--   is_business  den som ringer gör det för ett företag eller en organisation
-- Flaggorna används i mejlets ämne ("Brådskande:", "Företag:") och i BOS.
--
-- call_logs.is_urgent / is_business: null = inte bedömt (inställningen av, eller
-- samtalet analyserades innan den slogs på). Gamla samtal analyseras inte om.
--
-- Säker att köra före eller efter koden: utan kolumnerna gäller false/null.

alter table agents add column if not exists priority_flags boolean not null default false;

alter table call_logs add column if not exists is_urgent boolean;
alter table call_logs add column if not exists is_business boolean;

-- ROLLBACK
-- alter table call_logs drop column if exists is_business;
-- alter table call_logs drop column if exists is_urgent;
-- alter table agents drop column if exists priority_flags;
