-- Adds the budget AI Studio tee: same tee, same styles, a smaller (A4)
-- print zone calibrated via calibrate-tee-budget-front.html, flat R250 --
-- no "was" price, so old_price is set equal to price. Checkout resolves
-- this by design.garment = 'tee-budget' (see PRODUCT_BY_GARMENT in
-- app/api/unik/checkout/create/route.ts), matching the pattern set by
-- 20260723_unik_products.sql. Run this in your Supabase SQL editor.

insert into public.products (seller_id, name, price, old_price, category, in_stock, status, description, sort_order)
select s.id, v.name, v.price, v.old_price, v.category, true, 'published', v.description, v.sort_order
from public.sellers s
cross join (
  values
    ('AI Tee — Budget (A4)', 250, 250, 'AI Studio', 'AI-generated design, printed in a smaller A4 print area on a tee.', 7)
) as v(name, price, old_price, category, description, sort_order)
where s.subdomain = 'unik' and s.template = 'unik-labs'
and not exists (
  select 1 from public.products p where p.seller_id = s.id and p.name = v.name
);
