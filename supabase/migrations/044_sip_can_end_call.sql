-- Får agenten lägga på själv på SIP-vägen (46elks -> ElevenLabs)?
--
-- false (standard) = som i dag: agenten tar farväl och säger "Du kan lägga på
-- nu", eftersom ElevenLabs end_call inte har fått 46elks-benet att släppa
-- (uppmätt 2026-10-03: 10–19 sekunder död linje). true = canEndCall även på
-- SIP, så end_call används som på Twilio-vägen. Till för att pröva om det
-- fungerar nu, en agent i taget. Twilio-vägen påverkas inte.
--
-- Säker att köra före eller efter koden: utan kolumnen gäller false.

alter table agents add column if not exists sip_can_end_call boolean not null default false;

-- ROLLBACK
-- alter table agents drop column if exists sip_can_end_call;
