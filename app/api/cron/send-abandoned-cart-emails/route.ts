import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";
import { ORDER_ABANDON_MS } from "../../../../lib/unik-orders";
import { UNRESOLVED_GATEWAY_PAYMENT_METHODS } from "../../../../lib/order-payment-methods";
import { isUnsubscribed } from "../../../../lib/marketing-unsubscribe";
import { sendAbandonedCartRecoveryEmail, type AbandonedCartOrderItem } from "../../../../lib/four-regn-abandoned-cart-email";

export const dynamic = "force-dynamic";

// Runs once daily (see vercel.json) -- picks up anything that became
// eligible since the last run. The lower bound (older than
// ORDER_ABANDON_MS) keeps this from emailing someone who is still mid
// payment attempt right now; the upper bound (48h) keeps a first deploy
// from suddenly emailing a backlog of months-old abandoned orders, and
// keeps a missed run from re-surfacing very stale carts once it's caught
// up. abandoned_cart_email_sent_at is the dedup flag -- once set, an
// order is never picked up by this query again regardless of how many
// more times the cron runs.
const MAX_AGE_MS = 48 * 60 * 60 * 1000;

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
      .from("orders")
      .select("id, seller_id, customer_name, customer_email, items")
      .eq("seller_id", seller.id)
      .in("payment_method", UNRESOLVED_GATEWAY_PAYMENT_METHODS)
      .in("payment_status", ["pending", "abandoned", "failed"])
      .is("abandoned_cart_email_sent_at", null)
      .lt("created_at", new Date(now - ORDER_ABANDON_MS).toISOString())
      .gt("created_at", new Date(now - MAX_AGE_MS).toISOString());
    if (error) throw error;

    let sent = 0;
    let skipped = 0;
    for (const order of candidates || []) {
      try {
        if (!order.customer_email) { skipped++; continue; }
        const unsubscribed = await isUnsubscribed(admin, seller.id, order.customer_email);
        if (!unsubscribed) {
          await sendAbandonedCartRecoveryEmail({
            seller_id: order.seller_id,
            customer_name: order.customer_name,
            customer_email: order.customer_email,
            items: (order.items || []) as AbandonedCartOrderItem[],
          });
          sent++;
        } else {
          skipped++;
        }
      } catch (sendError) {
        console.error("Abandoned cart email failed for order", order.id, sendError);
        continue; // Leave abandoned_cart_email_sent_at unset -- retried on tomorrow's run.
      }
      await admin.from("orders").update({ abandoned_cart_email_sent_at: new Date().toISOString() }).eq("id", order.id);
    }

    return NextResponse.json({ status: "ok", sent, skipped, candidates: (candidates || []).length });
  } catch (error: any) {
    console.error("Abandoned cart email cron failed", error);
    return NextResponse.json({ status: "error", error: error?.message || "Cron failed" }, { status: 500 });
  }
}
