-- Clean up stale 4REGN hero/editor promo copy for OVERSIZED PREMIUM TEES.
-- The storefront also normalizes this at render time, but this updates the
-- saved config so the dashboard/editor no longer carries the old "3 for 2"
-- message.

do $$
declare
  v_seller_id uuid;
begin
  select id into v_seller_id
  from public.sellers
  where subdomain = '4regn'
  limit 1;

  if v_seller_id is null then
    raise notice '4REGN seller not found; skipping hero promo copy update.';
    return;
  end if;

  update public.sellers
  set
    store_config = replace(
      replace(
        replace(
          replace(
            replace(coalesce(store_config, '{}'::jsonb)::text,
              'BUY 2 GET 1 FREE — 3 TEES FOR R700!!',
              'BUY 2 FOR R449!'
            ),
            'BUY 2 GET 1 FREE - 3 TEES FOR R700!!',
            'BUY 2 FOR R449!'
          ),
          'BUY 2 GET 1 FREE',
          'BUY 2 FOR R449'
        ),
        '3 TEES FOR R700',
        'BUY 2 FOR R449'
      ),
      'R350 EACH BUY 3 FOR 2',
      'BUY 2 FOR R449'
    )::jsonb,
    template_configs = replace(
      replace(
        replace(
          replace(
            replace(coalesce(template_configs, '{}'::jsonb)::text,
              'BUY 2 GET 1 FREE — 3 TEES FOR R700!!',
              'BUY 2 FOR R449!'
            ),
            'BUY 2 GET 1 FREE - 3 TEES FOR R700!!',
            'BUY 2 FOR R449!'
          ),
          'BUY 2 GET 1 FREE',
          'BUY 2 FOR R449'
        ),
        '3 TEES FOR R700',
        'BUY 2 FOR R449'
      ),
      'R350 EACH BUY 3 FOR 2',
      'BUY 2 FOR R449'
    )::jsonb
  where id = v_seller_id;
end $$;
