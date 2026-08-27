-- Clean up stale 4REGN hero/editor promo copy for OVERSIZED PREMIUM TEES.
-- The storefront also normalizes this at render time, but this updates the
-- saved config so the dashboard/editor no longer carries old "3 for 2" copy.

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
    store_config = regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              coalesce(store_config, '{}'::jsonb)::text,
              'BUY\s*ANY\s*2\s*OVERSIZED\s*GRAPHIC\s*TEES\s*GET\s*A\s*3RD\s*TEE\s*FREE',
              'BUY 2 FOR R449!',
              'gi'
            ),
            'BUY\s*2\s*GET\s*1\s*FREE\s*(—|-)?\s*3\s*TEES\s*FOR\s*R700!!?',
            'BUY 2 FOR R449!',
            'gi'
          ),
          'BUY\s*2\s*,?\s*GET\s*A?\s*3RD?\s*TEE\s*FREE!!!?',
          'BUY 2 FOR R449!',
          'gi'
        ),
        '3\s*TEES\s*FOR\s*R700!!?',
        'BUY 2 FOR R449!',
        'gi'
      ),
      'R350\s*EACH\s*BUY\s*3\s*FOR\s*2',
      'BUY 2 FOR R449!',
      'gi'
    )::jsonb,
    template_configs = regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              coalesce(template_configs, '{}'::jsonb)::text,
              'BUY\s*ANY\s*2\s*OVERSIZED\s*GRAPHIC\s*TEES\s*GET\s*A\s*3RD\s*TEE\s*FREE',
              'BUY 2 FOR R449!',
              'gi'
            ),
            'BUY\s*2\s*GET\s*1\s*FREE\s*(—|-)?\s*3\s*TEES\s*FOR\s*R700!!?',
            'BUY 2 FOR R449!',
            'gi'
          ),
          'BUY\s*2\s*,?\s*GET\s*A?\s*3RD?\s*TEE\s*FREE!!!?',
          'BUY 2 FOR R449!',
          'gi'
        ),
        '3\s*TEES\s*FOR\s*R700!!?',
        'BUY 2 FOR R449!',
        'gi'
      ),
      'R350\s*EACH\s*BUY\s*3\s*FOR\s*2',
      'BUY 2 FOR R449!',
      'gi'
    )::jsonb
  where id = v_seller_id;
end $$;
