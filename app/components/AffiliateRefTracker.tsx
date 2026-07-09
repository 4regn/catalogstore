"use client";

import { useEffect } from "react";

/**
 * AffiliateRefTracker
 *
 * Mounts once in the root layout. On every page load where `?ref=X` is
 * present in the URL:
 * 1. Sets the `affiliate_ref` cookie for 30 days, first-touch wins (never
 *    overwrites an existing cookie) — this is pure attribution bookkeeping,
 *    read only at seller signup time to credit the referral.
 * 2. Separately marks this browser *session* (sessionStorage, not the
 *    30-day cookie) as an active referral session — this is what
 *    AffiliateReferralBanner displays against. Splitting these two matters:
 *    attribution should survive 30 days so a slow-to-convert visitor still
 *    credits the affiliate, but the "Referred by X" banner should only
 *    show for the visit where they actually arrived via the link, not
 *    resurface for a month on every unrelated page load.
 */
export default function AffiliateRefTracker() {
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const ref = params.get("ref");
      if (!ref) return;

      // Sanitize — only allow letters, numbers, hyphens, underscores (matches our slug rules)
      const cleanRef = ref.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32);
      if (!cleanRef) return;

      try {
        sessionStorage.setItem("affiliate_ref_session", cleanRef);
      } catch {}

      // Check if cookie already exists — first-touch wins
      const existing = document.cookie
        .split(";")
        .map((c) => c.trim())
        .find((c) => c.startsWith("affiliate_ref="));

      if (existing) return;

      // Set cookie for 30 days
      const expires = new Date();
      expires.setDate(expires.getDate() + 30);

      const isProd = window.location.hostname.includes("catalogstore.co.za");
      const domain = isProd ? "; domain=.catalogstore.co.za" : "";

      document.cookie = `affiliate_ref=${cleanRef}; expires=${expires.toUTCString()}; path=/; SameSite=Lax${domain}`;

      // Optional: store in localStorage too as a fallback
      try {
        localStorage.setItem("affiliate_ref", cleanRef);
        localStorage.setItem("affiliate_ref_at", new Date().toISOString());
      } catch {}
    } catch (e) {
      // silently fail — never break the app over tracking
      console.warn("AffiliateRefTracker error:", e);
    }
  }, []);

  return null;
}
