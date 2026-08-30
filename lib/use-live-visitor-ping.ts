"use client";

import { useEffect, useRef } from "react";

const VISITOR_ID_KEY = "cs-visitor-id";
const PING_INTERVAL_MS = 20_000;

export function getStorefrontVisitorId(): string {
  try {
    let id = localStorage.getItem(VISITOR_ID_KEY);
    if (!id) {
      id = "v-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      localStorage.setItem(VISITOR_ID_KEY, id);
    }
    return id;
  } catch {
    // Private browsing / storage blocked -- fall back to a per-mount id
    // rather than crashing; this visitor just won't be recognised across
    // page loads, which is a cosmetic loss, not a functional one.
    return "v-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }
}

export type StorefrontEventType =
  | "page_view" | "add_to_cart" | "reached_checkout"
  | "session_activity"
  | "free_delivery_upsell_impression" | "free_delivery_upsell_click"
  | "free_delivery_upsell_add" | "free_delivery_threshold_reached"
  | "checkout_started_after_upsell" | "order_completed_after_upsell"
  // 4regn Flash Weekend free trucker cap promotion -- see
  // lib/four-regn-flash-cap.ts for the state machine these correspond to.
  | "flash_cap_promo_seen" | "flash_cap_progress_clicked" | "flash_cap_unlocked"
  | "flash_cap_picker_opened" | "flash_cap_collection_visited" | "flash_cap_selected"
  | "flash_cap_changed" | "flash_cap_qualification_lost"
  | "flash_cap_checkout_warning_seen" | "flash_cap_checkout_without_gift"
  | "flash_cap_order_completed"
  | "wishlist_added" | "wishlist_removed"
  // 4regn Oversized Premium Tees flash sale (R249, was R350, buy 2 for
  // R449) -- see FourRegnTeesSaleCountdown.tsx. Simpler funnel than the
  // flash cap's, since this promo has no claim/unlock state machine, just
  // a discounted price and a bundle deal.
  | "tees_sale_collection_visited" | "tees_sale_product_viewed"
  | "tees_sale_added_to_cart" | "tees_sale_order_completed";

export function trackStorefrontEvent(args: {
  sellerId: string;
  eventType: StorefrontEventType;
  cartItemCount?: number;
  cartValue?: number;
  cartItems?: Array<{ id?: string; name: string; price: number; qty: number; variant?: string; image?: string }>;
  metadata?: Record<string, unknown>;
}) {
  if (typeof window === "undefined" || !args.sellerId) return;
  fetch("/api/storefront/heartbeat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    body: JSON.stringify({
      sellerId: args.sellerId,
      visitorId: getStorefrontVisitorId(),
      status: args.cartItemCount ? "active_cart" : "browsing",
      path: window.location.pathname,
      cartItemCount: args.cartItemCount || 0,
      cartValue: args.cartValue || 0,
      cartItems: (args.cartItems || []).slice(0, 20),
      eventType: args.eventType,
      eventMetadata: args.metadata || {},
    }),
  }).catch(() => {});
}

/* Pings /api/storefront/heartbeat so the seller (or UNIK's Brand Manager)
   can see who's live on the store right now -- browsing, has an active
   cart, or is at checkout. One call per storefront template's top-level
   component (each already owns its own cart state) plus the shared
   checkout page; the UNIK Labs static-HTML template pings separately from
   store.js since it renders inside an iframe outside this React tree. */
export function useLiveVisitorPing(
  sellerId: string | undefined,
  opts: { cartItemCount?: number; cartValue?: number; checkout?: boolean; customerName?: string; customerEmail?: string; cartItems?: Array<{ id?: string; name: string; price: number; qty: number; variant?: string; image?: string }> }
) {
  const { cartItemCount = 0, cartValue = 0, checkout = false, customerName, customerEmail, cartItems = [] } = opts;
  const visitorIdRef = useRef<string | null>(null);
  const lastPathRef = useRef<string>("");
  const lastCartSignatureRef = useRef<string>("");
  const reachedCheckoutRef = useRef(false);
  const lastTimelineActivityRef = useRef(0);

  useEffect(() => {
    if (!sellerId) return;
    if (!visitorIdRef.current) visitorIdRef.current = getStorefrontVisitorId();

    const cartSignature = cartItems.map((i) => `${i.id || i.name}:${i.qty}:${i.variant || ""}`).join("|");

    const send = (eventType?: "page_view" | "add_to_cart" | "reached_checkout" | "session_activity") => {
      const status = checkout ? "checkout" : cartItemCount > 0 ? "active_cart" : "browsing";
      fetch("/api/storefront/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          sellerId,
          visitorId: visitorIdRef.current,
          status,
          path: window.location.pathname,
          cartItemCount,
          cartValue,
          customerName: customerName || undefined,
          customerEmail: customerEmail || undefined,
          cartItems: cartItems.slice(0, 20),
          eventType,
        }),
      }).catch(() => {});
    };

    const currentPath = window.location.pathname;
    let eventType: "page_view" | "add_to_cart" | "reached_checkout" | undefined;
    if (checkout && !reachedCheckoutRef.current) {
      eventType = "reached_checkout";
      reachedCheckoutRef.current = true;
    } else if (cartItemCount > 0 && cartSignature && cartSignature !== lastCartSignatureRef.current) {
      eventType = "add_to_cart";
    } else if (currentPath !== lastPathRef.current) {
      eventType = "page_view";
    }
    lastPathRef.current = currentPath;
    lastCartSignatureRef.current = cartSignature;

    send(eventType);
    // The live session table is only a current snapshot. Record one quiet
    // timeline heartbeat per minute as well, so a customer browsing within a
    // page does not disappear from the historical timeline until they click
    // a button or navigate away.
    lastTimelineActivityRef.current = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      const timelineEvent = now - lastTimelineActivityRef.current >= 60_000 ? "session_activity" : undefined;
      if (timelineEvent) lastTimelineActivityRef.current = now;
      send(timelineEvent);
    }, PING_INTERVAL_MS);
    return () => clearInterval(id);
  }, [sellerId, cartItemCount, cartValue, checkout, customerName, customerEmail, JSON.stringify(cartItems)]);
}
