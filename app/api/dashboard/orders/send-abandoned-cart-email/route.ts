import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { isUnsubscribed } from "../../../../../lib/marketing-unsubscribe";
import { sendAbandonedCartRecoveryEmail, type AbandonedCartOrderItem } from "../../../../../lib/four-regn-abandoned-cart-email";

export const dynamic = "force-dynamic";

// Manual trigger for the same recovery email the cron (send-abandoned-
// cart-emails) sends automatically -- lets a seller clear a backlog (e.g.
// everything abandoned in the last 24h, right after this feature shipped)
// without waiting for the cron's own schedule. Stamps the exact same
// abandoned_cart_email_sent_at column, so a manually-sent order is
// permanently excluded from the automated cron afterward -- no double send
// from that side.
//
// Unlike the cron, a manual click is allowed to resend even if
// abandoned_cart_email_sent_at is already set -- a seller might have fixed
// a typo'd email after the first send and now needs it to actually reach
// the customer, and that's a deliberate call only the seller should make,
// not something the dedup guard (built to stop the automated cron from
// re-sending the same order every run) should block.
export async function POST(req: NextRequest) {
  try {
    const { access_token, orderId } = await req.json();
    if (!access_token || !orderId) return NextResponse.json({ error: "Missing access_token or orderId" }, { status: 400 });

    const admin = getAdmin();
    const { data: userData, error: userErr } = await admin.auth.getUser(access_token);
    if (userErr || !userData.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

    const { data: order, error: orderErr } = await admin
      .from("orders")
      .select("id, seller_id, customer_name, customer_email, items, abandoned_cart_email_sent_at")
      .eq("id", orderId)
      .eq("seller_id", userData.user.id)
      .maybeSingle();
    if (orderErr) throw orderErr;
    if (!order) return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
    if (!order.customer_email) return NextResponse.json({ ok: false, reason: "no_email" });
    const items = (order.items || []) as AbandonedCartOrderItem[];
    if (!items.length) return NextResponse.json({ ok: false, reason: "no_items" });
    if (await isUnsubscribed(admin, order.seller_id, order.customer_email)) {
      return NextResponse.json({ ok: false, reason: "unsubscribed" });
    }

    await sendAbandonedCartRecoveryEmail({
      seller_id: order.seller_id,
      customer_name: order.customer_name,
      customer_email: order.customer_email,
      items,
    });

    const sentAt = new Date().toISOString();
    const { error: updateErr } = await admin.from("orders").update({ abandoned_cart_email_sent_at: sentAt }).eq("id", order.id);
    if (updateErr) throw updateErr;

    return NextResponse.json({ ok: true, sentAt });
  } catch (e: any) {
    console.error("Manual abandoned cart email send failed:", e);
    return NextResponse.json({ error: e.message || "Internal error" }, { status: 500 });
  }
}
