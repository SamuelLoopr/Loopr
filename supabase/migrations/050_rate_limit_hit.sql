-- Rate limiting för de publika routerna (BOS-länken och /api/public/*).
--
-- En atomisk räknare per "bucket" och tidsfönster i public_rate_limit (040).
-- Bucket är en hash av IP-adressen och routegruppen (lib/rate-limit.ts) —
-- ingen IP-adress sparas i klartext.
--
-- Bara service-rollen får anropa funktionen; anon och authenticated nekas.
-- Säker att köra före koden: utan anrop händer ingenting.

create or replace function public.rate_limit_hit(p_bucket text, p_window_seconds integer, p_max integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hits integer;
begin
  insert into public.public_rate_limit as r (bucket, window_start, hits)
  values (p_bucket, now(), 1)
  on conflict (bucket) do update set
    hits = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end,
    window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning hits into v_hits;
  return v_hits <= p_max;
end
$$;

revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;

-- ROLLBACK
-- drop function if exists public.rate_limit_hit(text, integer, integer);
