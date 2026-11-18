-- CRM-listor hör till inloggningen, inte till webbläsaren.
--
-- /crm läste och skrev crm_lists på device_id, ett slumpat id i webbläsarens
-- localStorage: en lista syntes bara i den webbläsare som skapat den, och
-- user_id (001) användes aldrig. Nu läser och skriver sidan på user_id.
--
-- Befintliga listor (fyra, alla operatörens) flyttas till operatören så att
-- de syns igen. device_id lämnas kvar men används inte längre.
--
-- Säker att köra före koden: sidan som körs nu läser på device_id, som inte rörs.

update crm_lists set user_id = (select user_id from operators limit 1) where user_id is null;

create index if not exists crm_lists_user on crm_lists (user_id);

-- ROLLBACK
-- drop index if exists crm_lists_user;
-- (user_id-värdena kan stå kvar; den gamla sidan läser inte dem)
