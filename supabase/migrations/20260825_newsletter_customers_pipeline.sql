-- Connect storefront newsletter signups to the consent-aware customer
-- directory used by Email Studio, while retaining the legacy newsletter
-- table for dashboard history and exports.
alter table public.newsletter_subscribers
  add column if not exists first_name text,
  add column if not exists consented_at timestamptz not null default now();

update public.customers c
set
  accepts_email_marketing = true,
  marketing_consent_updated_at = greatest(
    coalesce(c.marketing_consent_updated_at, '-infinity'::timestamptz),
    coalesce(ns.consented_at, ns.created_at)
  ),
  tags = case
    when 'storefront-newsletter' = any(c.tags) then c.tags
    else array_append(c.tags, 'storefront-newsletter')
  end,
  updated_at = now()
from public.newsletter_subscribers ns
where c.seller_id = ns.seller_id
  and lower(trim(c.email)) = lower(trim(ns.email));

insert into public.customers (
  seller_id, email, accepts_email_marketing,
  marketing_consent_updated_at, tags, source, created_at, updated_at
)
select
  ns.seller_id, lower(trim(ns.email)), true,
  coalesce(ns.consented_at, ns.created_at),
  array['storefront-newsletter']::text[], 'manual', ns.created_at, now()
from public.newsletter_subscribers ns
where nullif(trim(ns.email), '') is not null
  and not exists (
    select 1 from public.customers c
    where c.seller_id = ns.seller_id
      and lower(trim(c.email)) = lower(trim(ns.email))
  );

update public.newsletter_subscribers ns
set first_name = c.first_name
from public.customers c
where c.seller_id = ns.seller_id
  and lower(trim(c.email)) = lower(trim(ns.email))
  and nullif(trim(ns.first_name), '') is null
  and nullif(trim(c.first_name), '') is not null;
