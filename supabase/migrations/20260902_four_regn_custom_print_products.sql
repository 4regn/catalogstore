-- 4REGN Custom Upload Studio products -- ported from UNIK Labs' own 4
-- custom-print SKUs (see supabase/migrations/20260723_unik_products.sql
-- for the original, UNIK-side rows and their exact prices) as plain 4regn
-- products rather than UNIK's multi-step Studio, per lib/four-regn-flash-
-- cap.ts's own sibling feature comment style: no account, nothing saved
-- for reuse -- see CUSTOM_PRINT_FRONT_TAG/CUSTOM_PRINT_BOTH_TAG in
-- FourRegnStore.tsx for how the tags below drive the storefront's upload
-- UI and front/back auto-flip card.
--
-- Images already hosted as static files in this repo (public/products/
-- 4regn-custom-print/), re-extracted from UNIK's own light-mode assets --
-- see that commit for where each file actually came from. image_url/
-- images hold the smaller "card" crop (tees only; hoodies have one crop
-- used everywhere); variants->Color->images holds the larger per-color
-- front/back pair, which resolveVariantImage (FourRegnStore.tsx) upgrades
-- to automatically once a shopper actually picks a color on the PDP.

insert into public.products (
  seller_id, name, price, old_price, category, description,
  image_url, images, variants, tags, handle, in_stock, status, sort_order
)
select s.id, v.name, v.price, v.old_price, v.category, v.description,
  v.image_url, v.images, v.variants::jsonb, v.tags, v.handle, true, 'published', v.sort_order
from public.sellers s
cross join (
  values
    (
      'Custom Hoodie — Front', 350, 450, 'CUSTOM PRINTED HOODIES',
      'Your own artwork, printed on the front. Upload your design at checkout -- we print exactly what you send.',
      'https://4regn.com/products/4regn-custom-print/front-black-hoodie.jpg',
      array['https://4regn.com/products/4regn-custom-print/front-black-hoodie.jpg']::text[],
      '[
        {"name":"Color","options":["Black","White","Beige"],"images":{
          "Black":["https://4regn.com/products/4regn-custom-print/front-black-hoodie.jpg"],
          "White":["https://4regn.com/products/4regn-custom-print/front-white-hoodie.jpg"],
          "Beige":["https://4regn.com/products/4regn-custom-print/front-beige-hoodie.jpg"]
        }},
        {"name":"Size","options":["XS","S","M","L","XL","XXL"]}
      ]',
      array['custom-print-front']::text[],
      'custom-hoodie-front',
      1
    ),
    (
      'Custom Hoodie — Front + Back', 450, 550, 'CUSTOM PRINTED HOODIES',
      'Your own artwork, printed on the front and back. Upload both designs at checkout -- we print exactly what you send.',
      'https://4regn.com/products/4regn-custom-print/front-black-hoodie.jpg',
      array['https://4regn.com/products/4regn-custom-print/back-black-hoodie.png']::text[],
      '[
        {"name":"Color","options":["Black","White","Beige"],"images":{
          "Black":["https://4regn.com/products/4regn-custom-print/front-black-hoodie.jpg","https://4regn.com/products/4regn-custom-print/back-black-hoodie.png"],
          "White":["https://4regn.com/products/4regn-custom-print/front-white-hoodie.jpg","https://4regn.com/products/4regn-custom-print/back-white-hoodie.png"],
          "Beige":["https://4regn.com/products/4regn-custom-print/front-beige-hoodie.jpg","https://4regn.com/products/4regn-custom-print/back-beige-hoodie.png"]
        }},
        {"name":"Size","options":["XS","S","M","L","XL","XXL"]}
      ]',
      array['custom-print-both']::text[],
      'custom-hoodie-front-back',
      2
    ),
    (
      'Custom Tee — Front', 299, 399, 'CUSTOM PRINTED TEES',
      'Your own artwork, printed on the front. Upload your design at checkout -- we print exactly what you send.',
      'https://4regn.com/products/4regn-custom-print/card-tee-black.jpg',
      array[]::text[],
      '[
        {"name":"Color","options":["Black","White","Beige"],"images":{
          "Black":["https://4regn.com/products/4regn-custom-print/pdp-tee-black.jpg"],
          "White":["https://4regn.com/products/4regn-custom-print/pdp-tee-white.jpg"],
          "Beige":["https://4regn.com/products/4regn-custom-print/front-beige-tee.jpg"]
        }},
        {"name":"Size","options":["XS","S","M","L","XL","XXL"]}
      ]',
      array['custom-print-front']::text[],
      'custom-tee-front',
      3
    ),
    (
      'Custom Tee — Front + Back', 379, 479, 'CUSTOM PRINTED TEES',
      'Your own artwork, printed on the front and back. Upload both designs at checkout -- we print exactly what you send.',
      'https://4regn.com/products/4regn-custom-print/card-tee-black.jpg',
      array['https://4regn.com/products/4regn-custom-print/back-black-tee.jpg']::text[],
      '[
        {"name":"Color","options":["Black","White","Beige"],"images":{
          "Black":["https://4regn.com/products/4regn-custom-print/pdp-tee-black.jpg","https://4regn.com/products/4regn-custom-print/back-black-tee.jpg"],
          "White":["https://4regn.com/products/4regn-custom-print/pdp-tee-white.jpg","https://4regn.com/products/4regn-custom-print/back-white-tee.jpg"],
          "Beige":["https://4regn.com/products/4regn-custom-print/front-beige-tee.jpg","https://4regn.com/products/4regn-custom-print/back-beige-tee.jpg"]
        }},
        {"name":"Size","options":["XS","S","M","L","XL","XXL"]}
      ]',
      array['custom-print-both']::text[],
      'custom-tee-front-back',
      4
    )
) as v(name, price, old_price, category, description, image_url, images, variants, tags, handle, sort_order)
where s.subdomain = '4regn'
and not exists (
  select 1 from public.products p where p.seller_id = s.id and p.name = v.name
);
