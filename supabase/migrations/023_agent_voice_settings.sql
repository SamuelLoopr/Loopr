-- Per-agent voice tuning for the Master Demo and the other voice demos.
--
-- WHAT ELEVENLABS ACTUALLY LETS US CONTROL, verified against the live agent's
-- platform_settings.overrides.conversation_config_override.tts:
--   voice_id           override: true   <- per conversation
--   stability          override: true
--   similarity_boost   override: true
--   speed              override: true
--   model_id           override: FALSE  <- fixed on the agent (eleven_flash_v2_5)
-- There is no `style` field in this agent's tts config at all, so style is not
-- adjustable here despite being a familiar ElevenLabs setting elsewhere.
--
-- The catch: the browser SDK (@11labs/client) builds its override message with
-- only one tts field —
--     tts: { voice_id: overrides.tts?.voiceId }
-- — and silently drops everything else. So voice_id can be set per conversation,
-- but stability/similarity_boost/speed cannot travel that way. They are applied
-- instead by PATCHing the shared ElevenLabs agent just before a demo starts,
-- which is why they are stored per agent here.

alter table agents add column if not exists voice_stability        numeric;
alter table agents add column if not exists voice_similarity_boost numeric;
alter table agents add column if not exists voice_speed            numeric;

-- Guard rails matching ElevenLabs' accepted ranges, so a bad value cannot be
-- saved and then rejected later at call time.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'agents_voice_stability_range') then
    alter table agents add constraint agents_voice_stability_range
      check (voice_stability is null or (voice_stability >= 0 and voice_stability <= 1));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'agents_voice_similarity_range') then
    alter table agents add constraint agents_voice_similarity_range
      check (voice_similarity_boost is null or (voice_similarity_boost >= 0 and voice_similarity_boost <= 1));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'agents_voice_speed_range') then
    alter table agents add constraint agents_voice_speed_range
      check (voice_speed is null or (voice_speed >= 0.7 and voice_speed <= 1.2));
  end if;
end $$;
