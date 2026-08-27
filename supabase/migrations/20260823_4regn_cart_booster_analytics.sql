-- Non-sensitive attribution for the deterministic 4REGN cart booster.
alter table public.store_visitor_events
  add column if not exists event_metadata jsonb not null default '{}'::jsonb;

alter table public.store_visitor_events
  drop constraint if exists store_visitor_events_event_type_check;

alter table public.store_visitor_events
  add constraint store_visitor_events_event_type_check check (event_type in (
    'page_view',
    'add_to_cart',
    'reached_checkout',
    'purchase',
    'free_delivery_upsell_impression',
    'free_delivery_upsell_click',
    'free_delivery_upsell_add',
    'free_delivery_threshold_reached',
    'checkout_started_after_upsell',
    'order_completed_after_upsell'
  ));
