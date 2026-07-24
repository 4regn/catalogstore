"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { usesCleanStorePaths } from "../../lib/store-url";

/* Hidden once a visitor is inside the app proper — a seller working in their
   own dashboard/editor has already signed up; showing "Referred by X" there
   is stale noise, not a trust signal, and on /dashboard/editor it competes
   with the iframe for header space. Also hidden on any seller's own
   storefront subdomain (mystore.catalogstore.co.za) -- their customers were
   never referred to CatalogStore, so the banner has no business appearing
   there regardless of path. /login and /reset-password are utility auth
   pages, not marketing/discovery pages -- referral trust-building doesn't
   belong there either. */
const HIDDEN_PREFIXES = ["/store", "/dashboard", "/admin", "/affiliate", "/checkout", "/login", "/reset-password"];

/**
 * AffiliateReferralBanner
 *
 * Reads the `affiliate_ref_session` sessionStorage flag (set by
 * AffiliateRefTracker only when `?ref=` is present in the URL) and shows a
 * polished banner: "Referred by [Name]". Deliberately NOT keyed off the
 * `affiliate_ref` cookie -- that cookie lives for 30 days for attribution
 * purposes, but the banner should only appear for the browsing session
 * where the visitor actually landed via the referral link, not resurface
 * on every unrelated page for a month.
 *
 * - Sits at top of page (scrolls with content, not sticky — intentional)
 * - Solid dark background with orange accent for high contrast
 * - Clear typographic hierarchy: small uppercase label + bold name
 * - Dismissible with session-storage memory
 * - Renders nothing outside an active referral session or with an invalid slug
 */
export default function AffiliateReferralBanner() {
  const pathname = usePathname();
  const [name, setName] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [onSellerSubdomain, setOnSellerSubdomain] = useState(false);

  useEffect(() => {
    setMounted(true);
    setOnSellerSubdomain(usesCleanStorePaths(window.location.hostname));
    try {
      const wasDismissed = sessionStorage.getItem("affiliate_banner_dismissed");
      if (wasDismissed === "1") {
        setDismissed(true);
        return;
      }

      const slug = sessionStorage.getItem("affiliate_ref_session");
      if (!slug) return;

      supabase
        .from("affiliate_public_profile")
        .select("full_name")
        .eq("slug", slug)
        .maybeSingle()
        .then(({ data, error }) => {
          if (error || !data?.full_name) return;
          setName(data.full_name);
        });
    } catch {
      // silently fail
    }
  }, []);

  function dismiss() {
    try {
      sessionStorage.setItem("affiliate_banner_dismissed", "1");
    } catch {}
    setDismissed(true);
  }

  if (!mounted || !name || dismissed || onSellerSubdomain) return null;
  if (!pathname || HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  return (
    <div style={styles.banner}>
      <div style={styles.inner}>
        <div style={styles.iconWrap}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={styles.icon}
          >
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        </div>

        <div style={styles.text}>
          <span style={styles.label}>Referred by</span>
          <span style={styles.name}>{name}</span>
        </div>

        <button
          onClick={dismiss}
          style={styles.close}
          aria-label="Dismiss"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ width: 14, height: 14 }}
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  banner: {
    position: "relative",
    zIndex: 60,
    background: "#0e0e14",
    borderBottom: "1px solid rgba(255,107,53,0.2)",
    fontFamily: "'Schibsted Grotesk', sans-serif",
    boxShadow: "0 1px 0 rgba(255,107,53,0.05)",
  },
  inner: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 16px",
    maxWidth: 1200,
    margin: "0 auto",
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    background:
      "linear-gradient(135deg,rgba(255,107,53,0.15),rgba(255,61,110,0.15))",
    border: "1px solid rgba(255,107,53,0.25)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    color: "#ff6b35",
  },
  icon: {
    width: 14,
    height: 14,
  },
  text: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 1,
    minWidth: 0,
  },
  label: {
    fontSize: 9,
    letterSpacing: "0.22em",
    textTransform: "uppercase",
    fontWeight: 700,
    color: "#ff6b35",
    lineHeight: 1,
  },
  name: {
    fontSize: 14,
    fontWeight: 700,
    color: "#f5f5f5",
    letterSpacing: "-0.01em",
    lineHeight: 1.2,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  close: {
    width: 26,
    height: 26,
    borderRadius: "50%",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    color: "rgba(245,245,245,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    padding: 0,
    flexShrink: 0,
    fontFamily: "inherit",
  },
};
