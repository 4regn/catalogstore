-- Server-authoritative products for the private UNIK Labs storefront.
-- Checkout always resolves price from these rows, never from the browser.
-- Run this in your Supabase SQL editor.

insert into public.products (seller_id, name, price, old_price, category, in_stock, status, description, sort_order)
select s.id, v.name, v.price, v.old_price, v.category, true, 'published', v.description, v.sort_order
from public.sellers s
cross join (
  values
    ('Custom Tee — Front',            299, 399, 'Custom Upload', 'Your artwork, printed on the front.',              1),
    ('Custom Tee — Front + Back',      379, 479, 'Custom Upload', 'Your artwork, printed on the front and back.',     2),
    ('Custom Hoodie — Front',          350, 450, 'Custom Upload', 'Your artwork, printed on the front.',              3),
    ('Custom Hoodie — Front + Back',   450, 550, 'Custom Upload', 'Your artwork, printed on the front and back.',     4),
    ('AI Tee',                         349, 450, 'AI Studio',     'AI-generated design, printed on a tee.',           5),
    ('AI Hoodie',                      399, 500, 'AI Studio',     'AI-generated design, printed on a hoodie.',        6)
) as v(name, price, old_price, category, description, sort_order)
where s.subdomain = 'unik' and s.template = 'unik-labs'
and not exists (
  select 1 from public.products p where p.seller_id = s.id and p.name = v.name
);
