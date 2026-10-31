-- Kortare namn i BOS och mejl: "Samuel H." i stället för hela namnet.
--
-- false (standard) = som i dag: analysen sparar namnet som den som ringde sa
-- det. true = call_logs.caller_name sparas som förnamn plus första bokstaven i
-- efternamnet med punkt (lib/caller-name.ts). Gäller bara samtal som
-- analyseras efter att inställningen slagits på; gamla samtal ändras inte.
--
-- Säker att köra före eller efter koden: utan kolumnen gäller false.

alter table agents add column if not exists short_caller_name boolean not null default false;

-- ROLLBACK
-- alter table agents drop column if exists short_caller_name;
