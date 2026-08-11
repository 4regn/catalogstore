-- Imports 4regn's real Shopify discount codes that map directly onto this
-- platform's existing discount_codes table (order-wide fixed/percentage
-- off, exactly what /api/checkout/place-order already validates and
-- applies) -- from discounts_export_1_1.csv, seller_id
-- b6d1ed6c-cb6e-4ef8-a1fb-0bf935ee7a5a (4regn).
--
-- Deliberately NOT imported here, and why:
--   - 4REGN100OFF4R1004R: Shopify's export shows this restricted to a
--     specific customer ("Customer Selection: prerequisite"). This
--     platform's discount_codes has no per-customer eligibility concept --
--     importing it as open-to-everyone would misrepresent the original
--     intent (and hand out a code meant for one person to anyone who finds
--     it). Skipped; add manually as a normal open code from the dashboard
--     if that's actually fine going forward.
--   - FREESHIT (100% off, 385 real uses on Shopify): scoped to a specific
--     product Shopify's CSV export doesn't name. Needs the actual product
--     told to us (or pulled from Shopify's Admin API) before it can be
--     imported as applies_to='product' with a real product_ids value --
--     importing it as an order-wide 100%-off code would be a serious
--     pricing bug.
--   - The three "Buy X Get Y" codes (BUY 2 FOR R599!, BUY 2 FOR R699!,
--     BUY 2, GET A 3RD TEE FREE!!!): bundle/bundle-price pricing has no
--     equivalent in this schema's type ('percentage'|'fixed') or
--     place-order.ts's math at all -- a real separate feature, not a data
--     gap. Confirmed with the seller these should stay code-required
--     (matching how they actually worked on Shopify) once that logic is
--     built.
--
-- Each insert is guarded by NOT EXISTS on (seller_id, code) so this is
-- safe to re-run without creating duplicates.

insert into discount_codes (seller_id, code, type, value, min_order, max_uses, active, applies_to)
select 'b6d1ed6c-cb6e-4ef8-a1fb-0bf935ee7a5a', 'DIDINTLE40', 'fixed', 60, 0, 1, true, 'cart'
where not exists (select 1 from discount_codes where seller_id = 'b6d1ed6c-cb6e-4ef8-a1fb-0bf935ee7a5a' and code = 'DIDINTLE40');

insert into discount_codes (seller_id, code, type, value, min_order, max_uses, active, applies_to)
select 'b6d1ed6c-cb6e-4ef8-a1fb-0bf935ee7a5a', '4REGN150OFF4R150', 'fixed', 150, 1500, null, true, 'cart'
where not exists (select 1 from discount_codes where seller_id = 'b6d1ed6c-cb6e-4ef8-a1fb-0bf935ee7a5a' and code = '4REGN150OFF4R150');

insert into discount_codes (seller_id, code, type, value, min_order, max_uses, active, applies_to)
select 'b6d1ed6c-cb6e-4ef8-a1fb-0bf935ee7a5a', 'R150OFF4R', 'fixed', 150, 1500, null, true, 'cart'
where not exists (select 1 from discount_codes where seller_id = 'b6d1ed6c-cb6e-4ef8-a1fb-0bf935ee7a5a' and code = 'R150OFF4R');

insert into discount_codes (seller_id, code, type, value, min_order, max_uses, active, applies_to)
select 'b6d1ed6c-cb6e-4ef8-a1fb-0bf935ee7a5a', '4REGN80OFFNOW', 'fixed', 80, 0, null, true, 'cart'
where not exists (select 1 from discount_codes where seller_id = 'b6d1ed6c-cb6e-4ef8-a1fb-0bf935ee7a5a' and code = '4REGN80OFFNOW');

insert into discount_codes (seller_id, code, type, value, min_order, max_uses, active, applies_to)
select 'b6d1ed6c-cb6e-4ef8-a1fb-0bf935ee7a5a', '4REGN20OFFFESTIVE4', 'percentage', 20, 0, null, true, 'cart'
where not exists (select 1 from discount_codes where seller_id = 'b6d1ed6c-cb6e-4ef8-a1fb-0bf935ee7a5a' and code = '4REGN20OFFFESTIVE4');
