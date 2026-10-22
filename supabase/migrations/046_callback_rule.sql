-- Återuppringningsregel per agent: när kontoret lovar att ringa tillbaka.
--
-- NULL (standard) = dagens regel i lib/callback-time.ts: nästa vardag mellan
-- 10 och 16, måndag förmiddag efter en helg. Alla agenter utan värde beter sig
-- exakt som förut.
--
-- Ett värde slår på regeln "inom en timme" (callbackSlot med regel):
--   {
--     "work_start":        "09:00",  -- arbetsdagens början, vardagar
--     "within_hour_until": "15:00",  -- samtal före detta (och efter work_start)
--                                    -- får "inom en timme"
--     "within_minutes":    60,       -- hur lång tid "inom en timme" är
--     "morning_end":       "12:00"   -- "förmiddag" betyder work_start–morning_end
--   }
-- Tolkas och valideras i lib/callback-time.ts (parseCallbackRule); ett
-- ogiltigt värde behandlas som NULL.
--
-- Säker att köra före eller efter koden: utan kolumnen gäller dagens regel.

alter table agents add column if not exists callback_rule jsonb;

alter table agents drop constraint if exists agents_callback_rule_object;
alter table agents add constraint agents_callback_rule_object
  check (callback_rule is null or jsonb_typeof(callback_rule) = 'object');

-- ROLLBACK
-- alter table agents drop constraint if exists agents_callback_rule_object;
-- alter table agents drop column if exists callback_rule;
