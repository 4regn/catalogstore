"use client";

import { useEffect, useState } from "react";

function readStitchReturnCtx(): { returnOrigin: string; returnPath: string } | null {
  try {
    const raw = sessionStorage.getItem("stitch_return_ctx");
    if (!raw) return null;
    const ctx = JSON.parse(raw);
    sessionStorage.removeItem("stitch_return_ctx");
    if (!ctx?.returnOrigin || !ctx?.returnPath) return null;
    return ctx;
  } catch {
    return null;
  }
}

/* Static bridge page Stitch redirects the customer's browser back to after
   a Card Consent OR Payment Link flow finishes (success OR cancellation --
   Stitch doesn't distinguish the two via the return URL itself, and this
   platform relies on the webhook + the destination page's own
   poll-and-confirm loop for the real payment outcome, not anything encoded
   here).

   This is the ONE static URL registered with Stitch (see
   lib/stitch.ts's registerStitchRedirectUrl for why a dynamic per-order
   URL isn't used -- Stitch caps registered redirect URLs at 5 exact
   entries). The actual destination (which store's checkout page) is
   normally carried across the redirect via sessionStorage as a fully-formed
   {returnOrigin, returnPath} pair, written by whichever caller navigates
   here (CheckoutPageClient.tsx for the generic-storefront checkout,
   public/setla/setla.js for a SETLA Pay Later plan) right before sending
   the customer to Stitch.

   That sessionStorage handoff only survives when this page happens to
   share an origin with wherever it was written -- true for a root-domain/
   path-based checkout, but NOT for the common case of a seller subdomain
   or connected custom domain, since sessionStorage is strictly per-origin
   and this bridge page always lives on the platform's own static origin.
   For that (majority) case, /api/checkout/stitch-return-target resolves
   the same destination from Stitch's own `reference` query param instead
   (always our order id -- see that route's own comment), with no
   client-side storage involved. Only when BOTH the sessionStorage handoff
   AND that lookup come up empty (a truly unrecognisable order id, or the
   endpoint itself unreachable) does this page give up and show a dead
   end. */
export default function StitchReturn() {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // One-time mount check reacting to an external system (sessionStorage
    // left by the caller before the Stitch redirect, or Stitch's own
    // `reference` query param as a fallback) -- the happy path never
    // touches React state at all, it just navigates the browser away;
    // setFailed only fires once both resolution paths are exhausted.
    const ctx = readStitchReturnCtx();
    if (ctx) {
      window.location.href = ctx.returnOrigin + ctx.returnPath;
      return;
    }
    const orderId = new URLSearchParams(window.location.search).get("reference") || "";
    if (!orderId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFailed(true);
      return;
    }
    fetch(`/api/checkout/stitch-return-target?orderId=${encodeURIComponent(orderId)}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.redirectUrl) window.location.href = json.redirectUrl;
        else setFailed(true);
      })
      .catch(() => setFailed(true));
  }, []);

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "-apple-system, sans-serif", color: "#111", textAlign: "center" as const, padding: 24 }}>
      {failed ? (
        <div>
          <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Could not return to your order automatically.</p>
          <p style={{ fontSize: 13, color: "#666" }}>Please check your order confirmation email, or go back to the store you were checking out on.</p>
        </div>
      ) : (
        <p style={{ fontSize: 14, color: "#666" }}>Finishing up your order…</p>
      )}
    </div>
  );
}
