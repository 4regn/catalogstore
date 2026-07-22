-- Private UNIK Labs customer accounts and design archive.
-- Catalogstore sellers also live in auth.users, so customer membership is kept
-- in a separate seller-scoped table and never inferred from an auth session.

create table if not exists public.unik_customer_profiles (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (seller_id, auth_user_id)
);

create table if not exists public.unik_generation_attempts (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'started'
    check (status in ('started', 'processing', 'succeeded', 'failed', 'cancelled')),
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.unik_designs (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  generation_attempt_id uuid references public.unik_generation_attempts(id) on delete set null,
  source text not null default 'ai-studio'
    check (source in ('ai-studio', 'custom-upload')),
  status text not null default 'generated'
    check (status in ('processing', 'generated', 'saved', 'in_cart', 'checkout_started', 'paid', 'failed', 'expired')),
  name text,
  garment text,
  colour text,
  size text,
  style text,
  options jsonb not null default '{}'::jsonb,
  preview_url text,
  mockup_url text,
  private_artwork_path text,
  saved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists unik_profiles_auth_idx
  on public.unik_customer_profiles (auth_user_id);
create index if not exists unik_attempts_limit_idx
  on public.unik_generation_attempts (seller_id, auth_user_id, created_at desc)
  where status = 'succeeded';
create index if not exists unik_designs_history_idx
  on public.unik_designs (seller_id, auth_user_id, created_at desc);

alter table public.unik_customer_profiles enable row level security;
alter table public.unik_generation_attempts enable row level security;
alter table public.unik_designs enable row level security;

drop policy if exists "UNIK customers read own profile" on public.unik_customer_profiles;
create policy "UNIK customers read own profile"
  on public.unik_customer_profiles for select
  using (auth.uid() = auth_user_id);

drop policy if exists "UNIK customers update own profile" on public.unik_customer_profiles;
create policy "UNIK customers update own profile"
  on public.unik_customer_profiles for update
  using (auth.uid() = auth_user_id)
  with check (auth.uid() = auth_user_id);

drop policy if exists "UNIK customers read own attempts" on public.unik_generation_attempts;
create policy "UNIK customers read own attempts"
  on public.unik_generation_attempts for select
  using (auth.uid() = auth_user_id);

drop policy if exists "UNIK customers read own designs" on public.unik_designs;
create policy "UNIK customers read own designs"
  on public.unik_designs for select
  using (auth.uid() = auth_user_id);

-- Reserve a generation under a transaction-level lock. This prevents a user
-- from opening several tabs at once to race past the daily allowance.
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

  if v_used + v_active >= 3 then
    return query select null::uuid, v_used, greatest(0, 3 - v_used - v_active);
    return;
  end if;

  insert into public.unik_generation_attempts (seller_id, auth_user_id, status)
  values (p_seller_id, p_auth_user_id, 'started')
  returning id into v_attempt_id;

  return query select v_attempt_id, v_used, greatest(0, 2 - v_used - v_active);
end;
$$;

revoke all on function public.reserve_unik_generation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reserve_unik_generation(uuid, uuid) to service_role;

-- Clean artwork is private. The API issues short-lived signed URLs only when a
-- legitimate customer or production workflow needs one.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'unik-private-designs',
  'unik-private-designs',
  false,
  20971520,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "UNIK customers read own private files" on storage.objects;
create policy "UNIK customers read own private files"
  on storage.objects for select
  using (
    bucket_id = 'unik-private-designs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
