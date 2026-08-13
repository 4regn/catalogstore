-- Link existing seller orders to their CRM customer using normalized email.
-- Seller scoping prevents the same email at two different stores from ever
-- crossing account histories.
update public.orders as orders
set customer_id = customers.id
from public.customers as customers
where orders.seller_id = customers.seller_id
  and lower(trim(orders.customer_email)) = lower(trim(customers.email));

create index if not exists orders_seller_customer_created_idx
  on public.orders (seller_id, customer_id, created_at desc);
