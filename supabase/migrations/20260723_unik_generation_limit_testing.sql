-- Temporarily raises the UNIK AI Studio daily generation cap from 3 to a
-- much higher testing threshold so hallucination/quality issues on the
-- new multi-photo templates (Chrome Collage, I Love My...) can be
-- reproduced repeatedly without waiting on the 24-hour reset. Lower this
-- back to 3 (or whatever the real production limit should be) with a
-- follow-up migration before this goes back in front of real customers --
-- see the matching UI copy in app/api/unik/account/route.ts and
-- app/api/unik/generations/route.ts, which also need to change together.
create or replace function public.reserve_unik_generation(
  p_seller_id uuid,
  p_auth_user_id uuid
)
returns table (attempt_id uuid, used_count integer, remaining_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used integer;
  v_active integer;
  v_attempt_id uuid;
  v_limit constant integer := 1000; -- was 3; temporary for template testing
begin
  perform pg_advisory_xact_lock(hashtextextended(p_seller_id::text || ':' || p_auth_user_id::text, 0));

  select count(*)::integer into v_used
  from public.unik_generation_attempts
  where seller_id = p_seller_id
    and auth_user_id = p_auth_user_id
    and status = 'succeeded'
    and created_at >= now() - interval '24 hours';

  select count(*)::integer into v_active
  from public.unik_generation_attempts
  where seller_id = p_seller_id
    and auth_user_id = p_auth_user_id
    and status in ('started', 'processing')
    and created_at >= now() - interval '15 minutes';

  if v_used + v_active >= v_limit then
    return query select null::uuid, v_used, greatest(0, v_limit - v_used - v_active);
    return;
  end if;

  insert into public.unik_generation_attempts (seller_id, auth_user_id, status)
  values (p_seller_id, p_auth_user_id, 'started')
  returning id into v_attempt_id;

  return query select v_attempt_id, v_used, greatest(0, v_limit - 1 - v_used - v_active);
end;
$$;

revoke all on function public.reserve_unik_generation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reserve_unik_generation(uuid, uuid) to service_role;
