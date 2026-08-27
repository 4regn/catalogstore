-- Keep the full live-session timeline moving even when a visitor stays on
-- one page. The storefront records this lightweight event at most once a
-- minute per active browser session.
alter table public.store_visitor_events
  drop constraint if exists store_visitor_events_event_type_check;

alter table public.store_visitor_events
  add constraint store_visitor_events_event_type_check check (event_type in (
    'page_view',
    'add_to_cart',
    'reached_checkout',
    'purchase',
    'session_activity',
    'free_delivery_upsell_impression',
    'free_delivery_upsell_click',
    'free_delivery_upsell_add',
    'free_delivery_threshold_reached',
    'checkout_started_after_upsell',
    'order_completed_after_upsell'
  ));
