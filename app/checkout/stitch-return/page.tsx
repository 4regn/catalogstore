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
   entries). The actual destination (which store's checkout page, or
   UNIK's own /setla/order-confirmed.html for a SETLA Pay Later order) is
   carried across the redirect via sessionStorage as a fully-formed
   {returnOrigin, returnPath} pair, written by whichever caller navigates
   here (CheckoutPageClient.tsx for the generic-storefront checkout,
   public/setla/setla.js for a SETLA Pay Later plan) right before sending
   the customer to Stitch -- this page has no per-flow branching of its
   own, it just bounces to whatever path it's told. */
export default function StitchReturn() {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // One-time mount check reacting to an external system (sessionStorage
    // left by the caller before the Stitch redirect) -- the happy path
    // never touches React state at all, it just navigates the browser
    // away; setFailed only fires on the rare path where there's nothing
    // to act on.
    const ctx = readStitchReturnCtx();
    if (!ctx) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFailed(true);
      return;
    }
    window.location.href = ctx.returnOrigin + ctx.returnPath;
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
