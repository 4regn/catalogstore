-- 4REGN promo change:
-- OVERSIZED PREMIUM TEES moves from "BUY 2 GET 1 FREE / 3 TEES FOR R700"
-- to "BUY 2 FOR R449".
--
-- With the current R350 tee price, this is implemented as:
-- buy 1 eligible tee, get 1 eligible tee with R251 off.

do $$
declare
  v_seller_id uuid;
begin
  select id into v_seller_id
  from public.sellers
  where subdomain = '4regn'
  limit 1;

  if v_seller_id is null then
    raise notice '4REGN seller not found; skipping oversized tee promo update.';
    return;
  end if;

  update public.automatic_bxgy_discounts
  set
    title = 'BUY 2 FOR R449!',
    buy_quantity = 1,
    buy_collection_names = array['OVERSIZED PREMIUM TEES'],
    get_quantity = 1,
    get_collection_names = array['OVERSIZED PREMIUM TEES'],
    effect_type = 'fixed_amount',
    effect_value = 251.00,
    active = true,
    ends_at = null
  where seller_id = v_seller_id
    and (
      'OVERSIZED PREMIUM TEES' = any(buy_collection_names)
      or 'OVERSIZED PREMIUM TEES' = any(get_collection_names)
      or title ilike '%3%TEE%R700%'
      or title ilike '%GET%3%TEE%FREE%'
      or title ilike '%BUY 2 GET 1%'
    );

  if not found then
    insert into public.automatic_bxgy_discounts (
      seller_id,
      title,
      buy_quantity,
      buy_collection_names,
      get_quantity,
      get_collection_names,
      effect_type,
      effect_value,
      active,
      source,
      external_id
    ) values (
      v_seller_id,
      'BUY 2 FOR R449!',
      1,
      array['OVERSIZED PREMIUM TEES'],
      1,
      array['OVERSIZED PREMIUM TEES'],
      'fixed_amount',
      251.00,
      true,
      'manual',
      '4regn-oversized-premium-tees-buy-2-for-449'
    )
    on conflict (seller_id, external_id) do update
    set
      title = excluded.title,
      buy_quantity = excluded.buy_quantity,
      buy_collection_names = excluded.buy_collection_names,
      get_quantity = excluded.get_quantity,
      get_collection_names = excluded.get_collection_names,
      effect_type = excluded.effect_type,
      effect_value = excluded.effect_value,
      active = true,
      ends_at = null;
  end if;

  update public.product_promo_badges
  set
    label = 'BUY 2 FOR R449',
    active = true,
    ends_at = null
  where seller_id = v_seller_id
    and scope = 'collection'
    and (
      collection_name = 'OVERSIZED PREMIUM TEES'
      or label ilike '%3%TEE%R700%'
      or label ilike '%BUY 2 GET 1%'
    );

  insert into public.product_promo_badges (
    seller_id,
    label,
    scope,
    collection_name,
    active,
    source,
    external_id
  ) values (
    v_seller_id,
    'BUY 2 FOR R449',
    'collection',
    'OVERSIZED PREMIUM TEES',
    true,
    'manual',
    '4regn-oversized-premium-tees-buy-2-for-449-badge'
  )
  on conflict (seller_id, external_id) do update
  set
    label = excluded.label,
    scope = excluded.scope,
    collection_name = excluded.collection_name,
    active = true,
    ends_at = null;
end $$;
