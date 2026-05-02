"use client";

import { useEffect } from "react";

/**
 * AffiliateRefTracker
 *
 * Mounts once in the root layout. On every page load:
 * 1. Reads `?ref=X` from the URL
 * 2. If present and no `affiliate_ref` cookie exists, sets it for 30 days
 * 3. First-touch wins — never overwrites an existing cookie
 *
 * The cookie is then read at seller signup time to credit the referral.
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
