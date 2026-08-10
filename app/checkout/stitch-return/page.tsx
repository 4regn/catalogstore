"use client";

import { useEffect, useState } from "react";
import { storePath } from "../../../lib/store-url";

function readStitchReturnCtx(): { orderId: string; slug: string; returnOrigin: string } | null {
  try {
    const raw = sessionStorage.getItem("stitch_return_ctx");
    if (!raw) return null;
    const ctx = JSON.parse(raw);
    sessionStorage.removeItem("stitch_return_ctx");
    if (!ctx?.orderId || !ctx?.slug || !ctx?.returnOrigin) return null;
    return ctx;
  } catch {
    return null;
  }
}

/* Static bridge page Stitch redirects the customer's browser back to after
   a Card Consent flow finishes (success OR cancellation -- Stitch doesn't
   distinguish the two via the return URL itself, and this platform relies
   on the webhook + CheckoutPageClient's own poll-and-confirm loop for the
   real payment outcome, not anything encoded here).

   This is the ONE static URL registered with Stitch (see
   lib/stitch.ts's registerStitchRedirectUrl for why a dynamic per-order
   URL isn't used -- Stitch caps registered redirect URLs at 5 exact
   entries). The actual order/store to bounce back to is carried across
   the redirect via sessionStorage, written by CheckoutPageClient right
   before navigating to Stitch. */
export default function StitchReturn() {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // One-time mount check reacting to an external system (sessionStorage
    // left by CheckoutPageClient before the Stitch redirect) -- the happy
    // path never touches React state at all, it just navigates the
    // browser away; setFailed only fires on the rare path where there's
    // nothing to act on.
    const ctx = readStitchReturnCtx();
    if (!ctx) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFailed(true);
      return;
    }
    const path = storePath(ctx.returnOrigin, ctx.slug, "/checkout?paid=" + ctx.orderId);
    window.location.href = ctx.returnOrigin + path;
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
