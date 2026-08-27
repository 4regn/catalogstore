-- Private, additive 4REGN retail consignment pilot.
create table if not exists public.retail_pilot_settings (
  seller_id uuid primary key references public.sellers(id) on delete cascade,
  retail_price numeric(12,2) not null default 129 check (retail_price >= 0),
  unit_cost numeric(12,2) not null default 65 check (unit_cost >= 0),
  commission numeric(12,2) not null default 30 check (commission >= 0),
  initial_units integer not null default 20 check (initial_units between 0 and 100000),
  minimum_sell_through numeric(5,2) not null default 50 check (minimum_sell_through between 0 and 100),
  scale_sell_through numeric(5,2) not null default 75 check (scale_sell_through between 0 and 100),
  weekly_units_target numeric(10,2) not null default 4 check (weekly_units_target >= 0),
  pilot_days integer not null default 30 check (pilot_days between 1 and 3650),
  max_shrinkage numeric(5,2) not null default 2 check (max_shrinkage between 0 and 100),
  updated_at timestamptz not null default now()
);
create table if not exists public.retail_partners (
  id uuid primary key default gen_random_uuid(), seller_id uuid not null references public.sellers(id) on delete cascade,
  store_code text not null, name text not null, location text not null default '', contact_name text not null default '',
  joined_on date not null default current_date, status text not null default 'Active' check (status in ('Active','Strong','Watch','Hold','Scale','Stopped','Archived')),
  notes text not null default '', created_by uuid not null references auth.users(id), archived_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(seller_id,store_code)
);
create table if not exists public.retail_stock_movements (
  id bigint generated always as identity primary key, seller_id uuid not null references public.sellers(id) on delete cascade,
  partner_id uuid not null references public.retail_partners(id) on delete cascade, quantity integer not null check (quantity > 0),
  movement_type text not null default 'handover' check (movement_type in ('handover','replenishment')),
  colour text, size text, variation text, notes text not null default '', occurred_at timestamptz not null default now(),
  recorded_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table if not exists public.retail_reconciliations (
  id bigint generated always as identity primary key, seller_id uuid not null references public.sellers(id) on delete cascade,
  partner_id uuid not null references public.retail_partners(id) on delete cascade,
  units_sold integer not null check (units_sold >= 0), missing_damaged integer not null check (missing_damaged >= 0),
  notes text not null default '', reconciled_at timestamptz not null default now(), recorded_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table if not exists public.retail_settlements (
  id bigint generated always as identity primary key, seller_id uuid not null references public.sellers(id) on delete cascade,
  partner_id uuid not null references public.retail_partners(id) on delete cascade, amount numeric(12,2) not null check (amount > 0),
  notes text not null default '', settled_at timestamptz not null default now(), recorded_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table if not exists public.retail_partner_activity (
  id bigint generated always as identity primary key, seller_id uuid not null references public.sellers(id) on delete cascade,
  partner_id uuid references public.retail_partners(id) on delete cascade, actor_user_id uuid not null references auth.users(id),
  action text not null, details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists retail_partners_seller_idx on public.retail_partners(seller_id,updated_at desc);
create index if not exists retail_stock_partner_idx on public.retail_stock_movements(partner_id,occurred_at desc);
create index if not exists retail_reconciliations_partner_idx on public.retail_reconciliations(partner_id,reconciled_at desc);
create index if not exists retail_settlements_partner_idx on public.retail_settlements(partner_id,settled_at desc);
create index if not exists retail_activity_partner_idx on public.retail_partner_activity(partner_id,created_at desc);
alter table public.retail_pilot_settings enable row level security; alter table public.retail_partners enable row level security;
alter table public.retail_stock_movements enable row level security; alter table public.retail_reconciliations enable row level security;
alter table public.retail_settlements enable row level security; alter table public.retail_partner_activity enable row level security;
drop policy if exists "Seller owns retail settings" on public.retail_pilot_settings; create policy "Seller owns retail settings" on public.retail_pilot_settings for all using (seller_id=auth.uid()) with check (seller_id=auth.uid());
drop policy if exists "Seller owns retail partners" on public.retail_partners; create policy "Seller owns retail partners" on public.retail_partners for all using (seller_id=auth.uid()) with check (seller_id=auth.uid());
drop policy if exists "Seller owns retail stock" on public.retail_stock_movements; create policy "Seller owns retail stock" on public.retail_stock_movements for all using (seller_id=auth.uid()) with check (seller_id=auth.uid());
drop policy if exists "Seller owns retail reconciliations" on public.retail_reconciliations; create policy "Seller owns retail reconciliations" on public.retail_reconciliations for all using (seller_id=auth.uid()) with check (seller_id=auth.uid());
drop policy if exists "Seller owns retail settlements" on public.retail_settlements; create policy "Seller owns retail settlements" on public.retail_settlements for all using (seller_id=auth.uid()) with check (seller_id=auth.uid());
drop policy if exists "Seller reads retail activity" on public.retail_partner_activity; create policy "Seller reads retail activity" on public.retail_partner_activity for select using (seller_id=auth.uid());
create or replace function public.touch_retail_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
drop trigger if exists retail_settings_touch on public.retail_pilot_settings; create trigger retail_settings_touch before update on public.retail_pilot_settings for each row execute function public.touch_retail_updated_at();
drop trigger if exists retail_partners_touch on public.retail_partners; create trigger retail_partners_touch before update on public.retail_partners for each row execute function public.touch_retail_updated_at();
