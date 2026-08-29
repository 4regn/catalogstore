-- Adds the 11 Flash Weekend free trucker cap promotion event names to
-- store_visitor_events' event_type check constraint. Without this, every
-- trackStorefrontEvent() call using one of these new StorefrontEventType
-- values (lib/use-live-visitor-ping.ts) would insert successfully as far
-- as the app is concerned (it's a fire-and-forget POST that swallows
-- errors) but silently fail at the database with a check-constraint
-- violation -- same "extends the existing list, doesn't replace it"
-- pattern as 20260823_add_session_activity_timeline.sql, which is the
-- current live version of this constraint being built on here.
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
    'flash_cap_order_completed'
  ));
