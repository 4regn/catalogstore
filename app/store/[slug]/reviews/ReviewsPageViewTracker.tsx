"use client";

import { useEffect } from "react";
import { trackStorefrontEvent } from "../../../../lib/use-live-visitor-ping";

// This page (page.tsx) is force-static server-rendered HTML with no other
// client-side code, unlike the main storefront (FourRegnStore.tsx) which
// already pings on every route change -- without this, a visit here (a
// shared link, a bookmark, a direct Google click-through) would be
// completely invisible to analytics, even though every click that LED here
// from inside the storefront is already tracked as reviews_link_clicked.
export default function ReviewsPageViewTracker({ sellerId }: { sellerId: string }) {
  useEffect(() => {
    if (!sellerId) return;
    trackStorefrontEvent({ sellerId, eventType: "reviews_page_viewed" });
  }, [sellerId]);
  return null;
}
