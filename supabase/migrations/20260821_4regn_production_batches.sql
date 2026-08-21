-- Private 4REGN production batch compiler. All application access is also
-- protected by a server-side 4REGN seller check in /api/production.
create table if not exists public.production_cost_settings (
  seller_id uuid primary key references public.sellers(id) on delete cascade,
  tee_material numeric(12,2) not null default 40 check (tee_material >= 0),
  tee_production numeric(12,2) not null default 30 check (tee_production >= 0),
  hoodie numeric(12,2) not null default 175 check (hoodie >= 0),
  a3_plus numeric(12,2) not null default 60 check (a3_plus >= 0),
  a4 numeric(12,2) not null default 25 check (a4 >= 0),
  aramex numeric(12,2) not null default 90 check (aramex >= 0),
  paxi numeric(12,2) not null default 60 check (paxi >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.production_batches (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  notes text not null default '' check (char_length(notes) <= 4000),
  status text not null default 'Draft' check (status in ('Draft','Buying','Printing','Packing','Complete','Archived')),
  created_by uuid not null references auth.users(id),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.production_batch_orders (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers(id) on delete cascade,
  batch_id uuid not null references public.production_batches(id) on delete cascade,
  source_order_id uuid references public.orders(id) on delete set null,
  customer_name text not null check (char_length(customer_name) between 1 and 160),
  order_reference text check (char_length(order_reference) <= 100),
  design_name text not null check (char_length(design_name) between 1 and 180),
  custom_print boolean not null default false,
  design_ready boolean not null default false,
  garment_type text not null check (garment_type in ('tee','hoodie')),
  colour text not null check (char_length(colour) between 1 and 80),
  customer_size text not null check (customer_size in ('S','M','L','XL','2XL','3XL','4XL')),
  supplier_size text not null check (supplier_size in ('S','M','L','XL','2XL','3XL','4XL')),
  print_size text not null check (print_size in ('a3_plus','a4')),
  delivery_method text not null check (delivery_method in ('aramex','paxi')),
  tee_material_cost numeric(12,2) not null check (tee_material_cost >= 0),
  tee_production_cost numeric(12,2) not null check (tee_production_cost >= 0),
  hoodie_cost numeric(12,2) not null check (hoodie_cost >= 0),
  a3_plus_cost numeric(12,2) not null check (a3_plus_cost >= 0),
  a4_cost numeric(12,2) not null check (a4_cost >= 0),
  aramex_cost numeric(12,2) not null check (aramex_cost >= 0),
  paxi_cost numeric(12,2) not null check (paxi_cost >= 0),
  material_complete boolean not null default false,
  production_complete boolean not null default false,
  garment_complete boolean not null default false,
  printing_complete boolean not null default false,
  delivery_complete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.production_order_activity (
  id bigint generated always as identity primary key,
  seller_id uuid not null references public.sellers(id) on delete cascade,
  batch_id uuid not null references public.production_batches(id) on delete cascade,
  order_id uuid references public.production_batch_orders(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id),
  action text not null check (char_length(action) between 1 and 180),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists production_batches_seller_updated_idx on public.production_batches(seller_id, updated_at desc);
create index if not exists production_orders_batch_created_idx on public.production_batch_orders(batch_id, created_at);
create index if not exists production_orders_source_order_idx on public.production_batch_orders(source_order_id) where source_order_id is not null;
create index if not exists production_activity_batch_created_idx on public.production_order_activity(batch_id, created_at desc);

alter table public.production_cost_settings enable row level security;
alter table public.production_batches enable row level security;
alter table public.production_batch_orders enable row level security;
alter table public.production_order_activity enable row level security;

drop policy if exists "Seller owns production settings" on public.production_cost_settings;
create policy "Seller owns production settings" on public.production_cost_settings for all using (seller_id = auth.uid()) with check (seller_id = auth.uid());
drop policy if exists "Seller owns production batches" on public.production_batches;
create policy "Seller owns production batches" on public.production_batches for all using (seller_id = auth.uid()) with check (seller_id = auth.uid());
drop policy if exists "Seller owns production orders" on public.production_batch_orders;
create policy "Seller owns production orders" on public.production_batch_orders for all using (seller_id = auth.uid()) with check (seller_id = auth.uid());
drop policy if exists "Seller reads production activity" on public.production_order_activity;
create policy "Seller reads production activity" on public.production_order_activity for select using (seller_id = auth.uid());

create or replace function public.touch_production_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists production_settings_touch on public.production_cost_settings;
create trigger production_settings_touch before update on public.production_cost_settings for each row execute function public.touch_production_updated_at();
drop trigger if exists production_batches_touch on public.production_batches;
create trigger production_batches_touch before update on public.production_batches for each row execute function public.touch_production_updated_at();
drop trigger if exists production_orders_touch on public.production_batch_orders;
create trigger production_orders_touch before update on public.production_batch_orders for each row execute function public.touch_production_updated_at();
