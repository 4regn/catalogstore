"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * AffiliateReferralBanner
 *
 * Reads the `affiliate_ref` cookie (set by AffiliateRefTracker), looks up the
 * affiliate's public name from the `affiliate_public_profile` view, and shows
 * a thin neutral banner: "Referred by [Name]".
 *
 * - Renders nothing if no cookie or invalid slug
 * - Renders nothing while loading (no flash)
 * - Sticky at top so it stays visible while scrolling
 * - Dismissible (sets a session-only flag so it doesn't reappear during the same session)
 */
export default function AffiliateReferralBanner() {
  const [name, setName] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      // Check session dismissal flag first
      const wasDismissed = sessionStorage.getItem("affiliate_banner_dismissed");
      if (wasDismissed === "1") {
        setDismissed(true);
        return;
      }

      // Read cookie
      const cookieRow = document.cookie
        .split(";")
        .map((c) => c.trim())
        .find((c) => c.startsWith("affiliate_ref="));
      if (!cookieRow) return;

      const slug = cookieRow.split("=")[1];
      if (!slug) return;

      // Look up the affiliate's public name (slug + full_name only — view is locked down)
      supabase
        .from("affiliate_public_profile")
        .select("full_name")
        .eq("slug", slug)
        .maybeSingle()
        .then(({ data, error }) => {
          if (error || !data?.full_name) return;
          setName(data.full_name);
        });
    } catch (e) {
      // silently fail
    }
  }, []);

  function dismiss() {
    try {
      sessionStorage.setItem("affiliate_banner_dismissed", "1");
    } catch {}
    setDismissed(true);
  }

  if (!name || dismissed) return null;

  return (
    <div style={styles.banner}>
      <div style={styles.inner}>
        <span style={styles.dot} />
        <span style={styles.label}>Referred by</span>
        <span style={styles.name}>{name}</span>
        <button
          onClick={dismiss}
          style={styles.close}
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  banner: {
    position: "relative",
    zIndex: 60,
    background:
      "linear-gradient(90deg,rgba(255,107,53,0.08) 0%,rgba(255,61,110,0.08) 100%)",
    borderBottom: "1px solid rgba(255,107,53,0.18)",
    fontFamily: "'Schibsted Grotesk', sans-serif",
  },
  inner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "8px 36px 8px 16px",
    fontSize: 12,
    color: "rgba(245,245,245,0.85)",
    position: "relative",
    maxWidth: 1200,
    margin: "0 auto",
    flexWrap: "wrap",
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "linear-gradient(135deg,#ff6b35,#ff3d6e)",
    boxShadow: "0 0 8px rgba(255,107,53,0.6)",
    flexShrink: 0,
  },
  label: {
    fontSize: 10,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    fontWeight: 600,
    color: "rgba(245,245,245,0.5)",
  },
  name: {
    fontSize: 12,
    fontWeight: 700,
    background: "linear-gradient(135deg,#ff6b35,#ff3d6e)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    letterSpacing: "-0.01em",
  },
  close: {
    position: "absolute",
    right: 10,
    top: "50%",
    transform: "translateY(-50%)",
    background: "transparent",
    border: "none",
    color: "rgba(245,245,245,0.4)",
    fontSize: 18,
    cursor: "pointer",
    padding: "0 6px",
    lineHeight: 1,
    fontFamily: "inherit",
  },
};
