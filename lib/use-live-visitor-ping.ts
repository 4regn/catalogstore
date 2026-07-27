"use client";

import { useEffect, useRef } from "react";

const VISITOR_ID_KEY = "cs-visitor-id";
const PING_INTERVAL_MS = 20_000;

function getVisitorId(): string {
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

/* Pings /api/storefront/heartbeat so the seller (or UNIK's Brand Manager)
   can see who's live on the store right now -- browsing, has an active
   cart, or is at checkout. One call per storefront template's top-level
   component (each already owns its own cart state) plus the shared
   checkout page; the UNIK Labs static-HTML template pings separately from
   store.js since it renders inside an iframe outside this React tree. */
export function useLiveVisitorPing(
  sellerId: string | undefined,
  opts: { cartItemCount?: number; cartValue?: number; checkout?: boolean; customerName?: string; customerEmail?: string }
) {
  const { cartItemCount = 0, cartValue = 0, checkout = false, customerName, customerEmail } = opts;
  const visitorIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!sellerId) return;
    if (!visitorIdRef.current) visitorIdRef.current = getVisitorId();

    const send = () => {
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
        }),
      }).catch(() => {});
    };

    send();
    const id = setInterval(send, PING_INTERVAL_MS);
    return () => clearInterval(id);
  }, [sellerId, cartItemCount, cartValue, checkout, customerName, customerEmail]);
}
