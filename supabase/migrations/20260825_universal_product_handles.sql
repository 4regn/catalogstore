-- Give every seller readable, stable product URLs and keep new products SEO-ready.
create or replace function public.set_catalog_product_handle()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  base_handle text;
  candidate text;
  suffix integer := 1;
begin
  if nullif(btrim(new.handle), '') is not null then
    new.handle := lower(btrim(new.handle));
    return new;
  end if;

  base_handle := trim(both '-' from regexp_replace(lower(coalesce(new.name, '')), '[^a-z0-9]+', '-', 'g'));
  if base_handle = '' then base_handle := 'product'; end if;
  candidate := base_handle;

  while exists (
    select 1 from public.products p
    where p.seller_id = new.seller_id
      and p.handle = candidate
      and p.id is distinct from new.id
  ) loop
    suffix := suffix + 1;
    candidate := base_handle || '-' || suffix::text;
  end loop;

  new.handle := candidate;
  return new;
end;
$$;

drop trigger if exists products_set_catalog_handle on public.products;
create trigger products_set_catalog_handle
before insert or update of name, handle on public.products
for each row execute function public.set_catalog_product_handle();

-- Backfill one row at a time so stores with duplicate product names get
-- deterministic -2/-3 suffixes without ever colliding with the unique index.
do $$
declare
  product_row record;
begin
  for product_row in
    select id
    from public.products
    where handle is null or btrim(handle) = ''
    order by seller_id, created_at nulls last, id
  loop
    update public.products set handle = null where id = product_row.id;
  end loop;
end;
$$;
