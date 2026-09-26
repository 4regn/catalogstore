"use client";

/* First-touch traffic attribution -- captures where a visitor actually came
   from (Google, WhatsApp, Instagram, direct URL entry, etc.) ONCE per
   visitor and caches it in localStorage, so later internal navigation
   (which always has document.referrer pointing at the store's own previous
   page) never overwrites the real, original source. Read by
   useLiveVisitorPing (sends it on the first heartbeat) and by
   CheckoutPageClient.tsx (denormalizes it onto the order at place-order
   time, see orders.traffic_source/traffic_attribution). */

const ATTRIBUTION_KEY = "cs-traffic-attribution";

export type TrafficAttribution = {
  source: string;
  referrer: string | null;
  referrerHost: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  landingPath: string;
};

const SOURCE_HOST_PATTERNS: Array<{ pattern: RegExp; source: string }> = [
  { pattern: /(^|\.)google\./i, source: "google" },
  { pattern: /(^|\.)googleadservices\.com$/i, source: "google" },
  { pattern: /(^|\.)wa\.me$/i, source: "whatsapp" },
  { pattern: /(^|\.)whatsapp\.com$/i, source: "whatsapp" },
  { pattern: /(^|\.)instagram\.com$/i, source: "instagram" },
  { pattern: /(^|\.)l\.instagram\.com$/i, source: "instagram" },
  { pattern: /(^|\.)facebook\.com$/i, source: "facebook" },
  { pattern: /(^|\.)fb\.com$/i, source: "facebook" },
  { pattern: /(^|\.)l\.facebook\.com$/i, source: "facebook" },
  { pattern: /(^|\.)tiktok\.com$/i, source: "tiktok" },
  { pattern: /(^|\.)youtube\.com$/i, source: "youtube" },
  { pattern: /(^|\.)youtu\.be$/i, source: "youtube" },
  { pattern: /(^|\.)bing\.com$/i, source: "bing" },
  { pattern: /(^|\.)duckduckgo\.com$/i, source: "duckduckgo" },
  { pattern: /(^|\.)yahoo\.com$/i, source: "yahoo" },
  { pattern: /(^|\.)twitter\.com$/i, source: "twitter" },
  { pattern: /(^|\.)x\.com$/i, source: "twitter" },
  { pattern: /(^|\.)pinterest\./i, source: "pinterest" },
  { pattern: /(^|\.)snapchat\.com$/i, source: "snapchat" },
];

function classifySource(utmSource: string | null, referrerHost: string | null, currentHost: string): string {
  if (utmSource) return utmSource.trim().toLowerCase().slice(0, 40);
  if (!referrerHost) return "direct";
  if (referrerHost === currentHost) return "direct";
  for (const { pattern, source } of SOURCE_HOST_PATTERNS) {
    if (pattern.test(referrerHost)) return source;
  }
  return "referral";
}

function captureFirstTouch(): TrafficAttribution {
  const params = new URLSearchParams(window.location.search);
  const utmSource = params.get("utm_source")?.trim().slice(0, 100) || null;
  const utmMedium = params.get("utm_medium")?.trim().slice(0, 100) || null;
  const utmCampaign = params.get("utm_campaign")?.trim().slice(0, 100) || null;
  const utmTerm = params.get("utm_term")?.trim().slice(0, 100) || null;
  const utmContent = params.get("utm_content")?.trim().slice(0, 100) || null;

  const referrer = document.referrer || null;
  let referrerHost: string | null = null;
  if (referrer) {
    try { referrerHost = new URL(referrer).hostname.toLowerCase(); } catch { referrerHost = null; }
  }

  const source = classifySource(utmSource, referrerHost, window.location.hostname.toLowerCase());

  return {
    source,
    referrer,
    referrerHost,
    utmSource,
    utmMedium,
    utmCampaign,
    utmTerm,
    utmContent,
    landingPath: window.location.pathname.slice(0, 300),
  };
}

/* Returns the cached first-touch attribution, capturing it now if this is
   the first time this visitor has been seen. Safe to call repeatedly --
   every call after the first just returns the cached value untouched, even
   if the visitor is now three pages deep with a referrer of the store's own
   previous page. */
export function getTrafficAttribution(): TrafficAttribution {
  try {
    const cached = localStorage.getItem(ATTRIBUTION_KEY);
    if (cached) return JSON.parse(cached) as TrafficAttribution;
  } catch {
    // fall through to a fresh (uncached) capture
  }
  const captured = captureFirstTouch();
  try { localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(captured)); } catch {
    // Private browsing / storage blocked -- this visitor's attribution just
    // won't persist across page loads, a cosmetic loss, not a functional one.
  }
  return captured;
}
