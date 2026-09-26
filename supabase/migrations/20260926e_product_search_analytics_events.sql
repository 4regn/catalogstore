-- Adds the 3 product-interest/search-insight event names to
-- store_visitor_events' event_type check constraint, same "extends the
-- existing list, doesn't replace it" pattern as every prior migration
-- touching this constraint (20260926d_reviews_page_events.sql,
-- 20260923c_checkout_funnel_events.sql, etc.) -- without this,
-- FourRegnStore.tsx's new trackStorefrontEvent() calls insert successfully
-- as far as the app is concerned (fire-and-forget, swallows errors) but
-- silently fail at the database with a check-constraint violation.
--
-- product_viewed: fires once per real product-detail-page visit, any entry
-- path (product grid, search result, wishlist, direct/shared link) --
-- captures "which products do shoppers actually look at".
-- product_added_to_cart: fires on every genuine add-to-cart (excludes
-- promo freebies, same as tees_sale_added_to_cart already does) --
-- captures "which products do shoppers actually add to cart".
-- site_search_performed: fires both when an in-header search query settles
-- (typed, paused, never necessarily committed) and when the dedicated
-- /search results page itself loads -- captures "what are shoppers
-- searching for", including zero-result searches, which is the "what
-- don't we stock that people are looking for" signal this was built for.
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
    'wishlist_removed',
    'tees_sale_collection_visited',
    'tees_sale_product_viewed',
    'tees_sale_added_to_cart',
    'tees_sale_order_completed',
    'tees_sale_popup_seen',
    'tees_sale_popup_clicked',
    'checkout_delivery_details_filled',
    'checkout_payment_method_selected',
    'checkout_shipping_method_selected',
    'checkout_pay_clicked',
    'checkout_payment_retry',
    'reviews_link_clicked',
    'reviews_page_viewed',
    'product_viewed',
    'product_added_to_cart',
    'site_search_performed'
  ));
