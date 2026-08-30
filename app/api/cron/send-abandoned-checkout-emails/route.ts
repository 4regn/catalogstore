import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";
import { isUnsubscribed } from "../../../../lib/marketing-unsubscribe";
import { sendAbandonedCartRecoveryEmail, type AbandonedCartOrderItem } from "../../../../lib/four-regn-abandoned-cart-email";

export const dynamic = "force-dynamic";

// Tier 2: someone reached checkout, typed their name/email, and left
// WITHOUT clicking "Place Order" -- no orders row exists for these at all
// (see send-abandoned-cart-emails, the Tier 1 cron, for that case), so
// there's nothing there to find. The only record of this happening is
// store_visitor_sessions (identity, backfilled live as they type -- see
// the heartbeat route's own comment) and store_visitor_events (the actual
// cart contents, from whichever heartbeat last carried them).
//
// Runs every 15 minutes (see vercel.json). "Abandoned" here means no
// heartbeat in the last CHECKOUT_ABANDON_MS -- the heartbeat pings every
// ~20s while the tab is open, so a stretch that long with no ping is a
// reliable signal the visitor is actually gone, not just reading a page
// slowly. MAX_AGE_MS is a backstop so a missed run (or this feature's
// first rollout) never suddenly emails a days-old stale session.
const CHECKOUT_ABANDON_MS = 30 * 60 * 1000; // 30 minutes
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = getAdmin();
  try {
    const { data: seller } = await admin.from("sellers").select("id").eq("subdomain", "4regn").maybeSingle();
    if (!seller) return NextResponse.json({ status: "ok", sent: 0, skipped: 0, note: "4regn seller not found" });

    const now = Date.now();
    const { data: candidates, error } = await admin
      .from("store_visitor_sessions")
      .select("visitor_id, session_date, customer_name, customer_email")
      .eq("seller_id", seller.id)
      .eq("reached_checkout", true)
      .not("customer_email", "is", null)
      .is("abandoned_checkout_email_sent_at", null)
      .lt("last_seen_at", new Date(now - CHECKOUT_ABANDON_MS).toISOString())
      .gt("last_seen_at", new Date(now - MAX_AGE_MS).toISOString());
    if (error) throw error;

    let sent = 0;
    let skipped = 0;
    for (const session of candidates || []) {
      try {
        // Already has a real order (whether Tier 1 will separately email it,
        // or they actually completed purchase) -- don't double up.
        const { data: existingOrder } = await admin
          .from("orders")
          .select("id")
          .eq("seller_id", seller.id)
          .ilike("customer_email", session.customer_email)
          .limit(1)
          .maybeSingle();
        if (existingOrder) { skipped++; continue; }

        const unsubscribed = await isUnsubscribed(admin, seller.id, session.customer_email);
        if (unsubscribed) { skipped++; continue; }

        // The session row only has aggregate cart value/count, not product
        // detail -- pull the most recent event for this visitor that
        // actually carried real cart_items.
        const { data: recentEvents } = await admin
          .from("store_visitor_events")
          .select("cart_items")
          .eq("seller_id", seller.id)
          .eq("visitor_id", session.visitor_id)
          .order("created_at", { ascending: false })
          .limit(20);
        const items = ((recentEvents || []).find((e: any) => Array.isArray(e.cart_items) && e.cart_items.length > 0)?.cart_items || []) as AbandonedCartOrderItem[];
        if (!items.length) { skipped++; continue; }

        await sendAbandonedCartRecoveryEmail({
          seller_id: seller.id,
          customer_name: session.customer_name,
          customer_email: session.customer_email,
          items,
        });
        sent++;
      } catch (sendError) {
        console.error("Abandoned checkout email failed for visitor", session.visitor_id, sendError);
        continue; // Leave abandoned_checkout_email_sent_at unset -- retried on the next run.
      }
      await admin
        .from("store_visitor_sessions")
        .update({ abandoned_checkout_email_sent_at: new Date().toISOString() })
        .eq("seller_id", seller.id)
        .eq("visitor_id", session.visitor_id)
        .eq("session_date", session.session_date);
    }

    return NextResponse.json({ status: "ok", sent, skipped, candidates: (candidates || []).length });
  } catch (error: any) {
    console.error("Abandoned checkout email cron failed", error);
    return NextResponse.json({ status: "error", error: error?.message || "Cron failed" }, { status: 500 });
  }
}
