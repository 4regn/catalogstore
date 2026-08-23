-- Stitch Pay Later is a CatalogStore platform payment method. Existing
-- sellers without a saved preference are opted in; sellers who have
-- deliberately saved false remain opted out.
UPDATE public.sellers
SET checkout_config = jsonb_set(
  COALESCE(checkout_config, '{}'::jsonb),
  '{stitch_enabled}',
  'true'::jsonb,
  true
)
WHERE NOT (COALESCE(checkout_config, '{}'::jsonb) ? 'stitch_enabled');
