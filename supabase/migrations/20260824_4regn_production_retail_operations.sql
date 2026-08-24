-- 4REGN sewing production, retail inventory, settlements and analytics.
-- Additive: the existing production compiler and retail pilot remain intact.

create table if not exists public.production_retail_settings (
  seller_id uuid primary key references public.sellers(id) on delete cascade,
  sewing_rate numeric(12,2) not null default 30 check (sewing_rate >= 0),
  fabric_cost numeric(12,2) not null default 40 check (fabric_cost >= 0),
  retail_commission numeric(12,2) not null default 30 check (retail_commission >= 0),
  retail_price numeric(12,2) not null default 120 check (retail_price >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.sewing_batches (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers(id) on delete cascade,
  batch_code text not null,
  title text not null default '',
  fabric_sent_at timestamptz not null,
  expected_collection_at timestamptz,
  actual_collection_at timestamptz,
  sewing_rate_snapshot numeric(12,2) not null check (sewing_rate_snapshot >= 0),
  fabric_cost_snapshot numeric(12,2) not null check (fabric_cost_snapshot >= 0),
  retail_commission_snapshot numeric(12,2) not null check (retail_commission_snapshot >= 0),
  retail_price_snapshot numeric(12,2) not null check (retail_price_snapshot >= 0),
  notes text not null default '',
  handover_locked_at timestamptz,
  archived_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (seller_id, batch_code)
);

create table if not exists public.sewing_batch_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.sewing_batches(id) on delete cascade,
  colour text not null,
  size text not null,
  requested_quantity integer not null check (requested_quantity > 0),
  created_at timestamptz not null default now(),
  unique (batch_id, colour, size)
);

create table if not exists public.sewing_reports (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null unique references public.sewing_batches(id) on delete cascade,
  reported_at timestamptz not null,
  channel text not null default 'manual' check (channel in ('manual','phone','whatsapp','in_person','other')),
  notes text not null default '',
  recorded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sewing_report_items (
  report_id uuid not null references public.sewing_reports(id) on delete cascade,
  batch_item_id uuid not null references public.sewing_batch_items(id) on delete cascade,
  reported_quantity integer not null check (reported_quantity >= 0),
  primary key (report_id, batch_item_id)
);

create table if not exists public.sewing_receipts (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null unique references public.sewing_batches(id) on delete cascade,
  received_at timestamptz not null,
  notes text not null default '',
  recorded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sewing_receipt_items (
  receipt_id uuid not null references public.sewing_receipts(id) on delete cascade,
  batch_item_id uuid not null references public.sewing_batch_items(id) on delete cascade,
  received_quantity integer not null check (received_quantity >= 0),
  defect_quantity integer not null default 0 check (defect_quantity >= 0 and defect_quantity <= received_quantity),
  primary key (receipt_id, batch_item_id)
);

create table if not exists public.retail_allocations (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers(id) on delete cascade,
  batch_id uuid not null references public.sewing_batches(id) on delete restrict,
  destination text not null check (destination in ('4regn','retailer')),
  partner_id uuid references public.retail_partners(id) on delete restrict,
  allocated_at timestamptz not null default now(),
  notes text not null default '',
  recorded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check ((destination='retailer' and partner_id is not null) or (destination='4regn' and partner_id is null))
);

create table if not exists public.retail_allocation_items (
  allocation_id uuid not null references public.retail_allocations(id) on delete cascade,
  batch_item_id uuid not null references public.sewing_batch_items(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  primary key (allocation_id, batch_item_id)
);

create table if not exists public.retail_collections (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers(id) on delete cascade,
  partner_id uuid not null references public.retail_partners(id) on delete restrict,
  collected_at timestamptz not null default now(),
  customer_sales numeric(12,2) not null default 0 check (customer_sales >= 0),
  commission_total numeric(12,2) not null default 0 check (commission_total >= 0),
  expected_4regn_share numeric(12,2) not null default 0 check (expected_4regn_share >= 0),
  actual_cash_collected numeric(12,2) not null default 0 check (actual_cash_collected >= 0),
  sewing_payment_amount numeric(12,2) not null default 0 check (sewing_payment_amount >= 0 and sewing_payment_amount <= actual_cash_collected),
  notes text not null default '',
  recorded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.retail_collection_items (
  collection_id uuid not null references public.retail_collections(id) on delete cascade,
  batch_item_id uuid not null references public.sewing_batch_items(id) on delete restrict,
  quantity_sold integer not null check (quantity_sold > 0),
  retail_price_snapshot numeric(12,2) not null check (retail_price_snapshot >= 0),
  commission_snapshot numeric(12,2) not null check (commission_snapshot >= 0),
  primary key (collection_id, batch_item_id)
);

create table if not exists public.sewing_payments (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers(id) on delete cascade,
  batch_id uuid not null references public.sewing_batches(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  payment_source text not null check (payment_source in ('upfront','manual','retail_collection')),
  retail_collection_id uuid references public.retail_collections(id) on delete restrict,
  paid_at timestamptz not null default now(),
  notes text not null default '',
  recorded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check ((payment_source='retail_collection' and retail_collection_id is not null) or (payment_source<>'retail_collection' and retail_collection_id is null))
);

create table if not exists public.production_inventory_movements (
  id bigint generated always as identity primary key,
  seller_id uuid not null references public.sellers(id) on delete cascade,
  batch_id uuid not null references public.sewing_batches(id) on delete restrict,
  batch_item_id uuid not null references public.sewing_batch_items(id) on delete restrict,
  movement_type text not null check (movement_type in ('receipt','receipt_adjustment','allocate_4regn','allocate_retail','retail_sale','return','transfer','manual_adjustment')),
  from_location text,
  to_location text,
  partner_id uuid references public.retail_partners(id) on delete restrict,
  quantity integer not null check (quantity <> 0),
  source_id uuid,
  occurred_at timestamptz not null default now(),
  notes text not null default '',
  recorded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.production_retail_activity (
  id bigint generated always as identity primary key,
  seller_id uuid not null references public.sellers(id) on delete cascade,
  batch_id uuid references public.sewing_batches(id) on delete cascade,
  partner_id uuid references public.retail_partners(id) on delete set null,
  actor_user_id uuid not null references auth.users(id),
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists sewing_batches_seller_date_idx on public.sewing_batches(seller_id, fabric_sent_at desc);
create index if not exists sewing_items_batch_idx on public.sewing_batch_items(batch_id);
create index if not exists retail_allocations_batch_idx on public.retail_allocations(batch_id, allocated_at desc);
create index if not exists retail_allocations_partner_idx on public.retail_allocations(partner_id, allocated_at desc);
create index if not exists retail_collections_partner_idx on public.retail_collections(partner_id, collected_at desc);
create index if not exists sewing_payments_batch_idx on public.sewing_payments(batch_id, paid_at desc);
create index if not exists production_inventory_batch_idx on public.production_inventory_movements(batch_id, occurred_at desc);
create index if not exists production_retail_activity_idx on public.production_retail_activity(seller_id, created_at desc);

alter table public.production_retail_settings enable row level security;
alter table public.sewing_batches enable row level security;
alter table public.sewing_batch_items enable row level security;
alter table public.sewing_reports enable row level security;
alter table public.sewing_report_items enable row level security;
alter table public.sewing_receipts enable row level security;
alter table public.sewing_receipt_items enable row level security;
alter table public.retail_allocations enable row level security;
alter table public.retail_allocation_items enable row level security;
alter table public.retail_collections enable row level security;
alter table public.retail_collection_items enable row level security;
alter table public.sewing_payments enable row level security;
alter table public.production_inventory_movements enable row level security;
alter table public.production_retail_activity enable row level security;

-- Direct seller access remains scoped to its seller id. Child rows are protected through their parent.
drop policy if exists "Seller owns production retail settings" on public.production_retail_settings;
create policy "Seller owns production retail settings" on public.production_retail_settings for all using (seller_id=auth.uid()) with check (seller_id=auth.uid());
drop policy if exists "Seller owns sewing batches" on public.sewing_batches;
create policy "Seller owns sewing batches" on public.sewing_batches for all using (seller_id=auth.uid()) with check (seller_id=auth.uid());
drop policy if exists "Seller owns sewing batch items" on public.sewing_batch_items;
create policy "Seller owns sewing batch items" on public.sewing_batch_items for all using (exists(select 1 from public.sewing_batches b where b.id=batch_id and b.seller_id=auth.uid())) with check (exists(select 1 from public.sewing_batches b where b.id=batch_id and b.seller_id=auth.uid()));
drop policy if exists "Seller owns sewing reports" on public.sewing_reports;
create policy "Seller owns sewing reports" on public.sewing_reports for all using (exists(select 1 from public.sewing_batches b where b.id=batch_id and b.seller_id=auth.uid())) with check (exists(select 1 from public.sewing_batches b where b.id=batch_id and b.seller_id=auth.uid()));
drop policy if exists "Seller owns sewing report items" on public.sewing_report_items;
create policy "Seller owns sewing report items" on public.sewing_report_items for all using (exists(select 1 from public.sewing_reports r join public.sewing_batches b on b.id=r.batch_id where r.id=report_id and b.seller_id=auth.uid())) with check (exists(select 1 from public.sewing_reports r join public.sewing_batches b on b.id=r.batch_id where r.id=report_id and b.seller_id=auth.uid()));
drop policy if exists "Seller owns sewing receipts" on public.sewing_receipts;
create policy "Seller owns sewing receipts" on public.sewing_receipts for all using (exists(select 1 from public.sewing_batches b where b.id=batch_id and b.seller_id=auth.uid())) with check (exists(select 1 from public.sewing_batches b where b.id=batch_id and b.seller_id=auth.uid()));
drop policy if exists "Seller owns sewing receipt items" on public.sewing_receipt_items;
create policy "Seller owns sewing receipt items" on public.sewing_receipt_items for all using (exists(select 1 from public.sewing_receipts r join public.sewing_batches b on b.id=r.batch_id where r.id=receipt_id and b.seller_id=auth.uid())) with check (exists(select 1 from public.sewing_receipts r join public.sewing_batches b on b.id=r.batch_id where r.id=receipt_id and b.seller_id=auth.uid()));

do $$ declare t text; begin foreach t in array array['retail_allocations','retail_collections','sewing_payments','production_inventory_movements','production_retail_activity'] loop execute format('drop policy if exists "Seller owns %s" on public.%I',t,t); execute format('create policy "Seller owns %s" on public.%I for all using (seller_id=auth.uid()) with check (seller_id=auth.uid())',t,t); end loop; end $$;
drop policy if exists "Seller owns retail allocation items" on public.retail_allocation_items;
create policy "Seller owns retail allocation items" on public.retail_allocation_items for all using (exists(select 1 from public.retail_allocations a where a.id=allocation_id and a.seller_id=auth.uid())) with check (exists(select 1 from public.retail_allocations a where a.id=allocation_id and a.seller_id=auth.uid()));
drop policy if exists "Seller owns retail collection items" on public.retail_collection_items;
create policy "Seller owns retail collection items" on public.retail_collection_items for all using (exists(select 1 from public.retail_collections c where c.id=collection_id and c.seller_id=auth.uid())) with check (exists(select 1 from public.retail_collections c where c.id=collection_id and c.seller_id=auth.uid()));

create or replace function public.touch_production_retail_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
drop trigger if exists production_retail_settings_touch on public.production_retail_settings;
create trigger production_retail_settings_touch before update on public.production_retail_settings for each row execute function public.touch_production_retail_updated_at();
drop trigger if exists sewing_batches_touch on public.sewing_batches;
create trigger sewing_batches_touch before update on public.sewing_batches for each row execute function public.touch_production_retail_updated_at();
drop trigger if exists sewing_reports_touch on public.sewing_reports;
create trigger sewing_reports_touch before update on public.sewing_reports for each row execute function public.touch_production_retail_updated_at();
drop trigger if exists sewing_receipts_touch on public.sewing_receipts;
create trigger sewing_receipts_touch before update on public.sewing_receipts for each row execute function public.touch_production_retail_updated_at();

-- The requested handover list is historical and cannot be edited after creation.
create or replace function public.prevent_sewing_request_mutation() returns trigger language plpgsql as $$ begin raise exception 'Requested batch quantities are immutable; create a new batch for a corrected handover.'; end $$;
drop trigger if exists sewing_items_immutable_update on public.sewing_batch_items;
create trigger sewing_items_immutable_update before update or delete on public.sewing_batch_items for each row execute function public.prevent_sewing_request_mutation();
create or replace function public.prevent_locked_sewing_request_insert() returns trigger language plpgsql as $$ begin if exists(select 1 from public.sewing_batches b where b.id=new.batch_id and b.handover_locked_at is not null) then raise exception 'This batch handover is locked.'; end if; return new; end $$;
drop trigger if exists sewing_items_locked_insert on public.sewing_batch_items;
create trigger sewing_items_locked_insert before insert on public.sewing_batch_items for each row execute function public.prevent_locked_sewing_request_insert();
