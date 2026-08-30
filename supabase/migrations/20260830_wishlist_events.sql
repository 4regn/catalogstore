-- Adds wishlist_added/wishlist_removed to store_visitor_events' event_type
-- check constraint, same "extends the existing list" pattern as
-- 20260829_flash_cap_analytics_events.sql. These fire for every visitor who
-- taps the heart icon, signed into a customer account or not -- unlike
-- customer_wishlist_items, which only records account holders and is what
-- the wishlist-analytics dashboard card previously relied on exclusively.
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
    'order_completed_after_upsell',
    'flash_cap_promo_seen',
    'flash_cap_progress_clicked',
    'flash_cap_unlocked',
    'flash_cap_picker_opened',
    'flash_cap_collection_visited',
    'flash_cap_selected',
    'flash_cap_changed',
    'flash_cap_qualification_lost',
    'flash_cap_checkout_warning_seen',
    'flash_cap_checkout_without_gift',
    'flash_cap_order_completed',
    'wishlist_added',
    'wishlist_removed'
  ));
