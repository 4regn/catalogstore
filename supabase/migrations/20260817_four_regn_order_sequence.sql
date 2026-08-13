-- Shopify/legacy tracking owns #1 through #3539D. Every new native 4REGN
-- order receives an atomic public reference beginning at #3540D. The
-- existing orders.order_number remains untouched because it is shared by
-- every CatalogStore seller and several payment integrations.
create table if not exists public.store_order_reference_sequences (
  seller_id uuid primary key references public.sellers(id) on delete cascade,
  last_number bigint not null check (last_number >= 0),
  updated_at timestamptz not null default now()
);

alter table public.store_order_reference_sequences enable row level security;
-- No public policies: only the service-role checkout/trigger can use it.

insert into public.store_order_reference_sequences (seller_id, last_number)
select id, 3539
from public.sellers
where lower(subdomain) = '4regn'
on conflict (seller_id) do update
set last_number = greatest(public.store_order_reference_sequences.last_number, 3539),
    updated_at = now();

create or replace function public.assign_four_regn_order_reference()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_reference bigint;
begin
  -- Imported Shopify orders already carry their original external_id and
  -- must never consume a new number. This only runs for new native orders.
  if new.external_id is null and exists (
    select 1 from public.sellers s
    where s.id = new.seller_id and lower(s.subdomain) = '4regn'
  ) then
    insert into public.store_order_reference_sequences (seller_id, last_number, updated_at)
    values (new.seller_id, 3540, now())
    on conflict (seller_id) do update
      set last_number = public.store_order_reference_sequences.last_number + 1,
          updated_at = now()
    returning last_number into next_reference;

    new.external_id := '#' || next_reference::text || 'D';
  end if;
  return new;
end;
$$;

drop trigger if exists assign_four_regn_order_reference_trigger on public.orders;
create trigger assign_four_regn_order_reference_trigger
before insert on public.orders
for each row execute function public.assign_four_regn_order_reference();
