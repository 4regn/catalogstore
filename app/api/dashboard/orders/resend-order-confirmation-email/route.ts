import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { sendOrderConfirmationEmail } from "../../../../../lib/unik-orders";

export const dynamic = "force-dynamic";

// Manual trigger for the customer-facing "order confirmed" email --
// normally only sent once, on the real payment-confirmed transition (see
// markUnikOrderPaid), but a seller sometimes needs to send it again on
// purpose: most commonly, a customer typo'd their email at checkout, the
// seller corrects customer_email on the order afterward, and the original
// confirmation never reached them. Always allowed to resend -- there's no
// automated process this could conflict with, unlike the abandoned-cart
// email's dedup guard against its own cron.
export async function POST(req: NextRequest) {
  try {
    const { access_token, orderId } = await req.json();
    if (!access_token || !orderId) return NextResponse.json({ error: "Missing access_token or orderId" }, { status: 400 });

    const admin = getAdmin();
    const { data: userData, error: userErr } = await admin.auth.getUser(access_token);
    if (userErr || !userData.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

    const { data: order, error: orderErr } = await admin
      .from("orders")
      .select("id, order_number, external_id, seller_id, customer_name, customer_email, items, total, payment_status")
      .eq("id", orderId)
      .eq("seller_id", userData.user.id)
      .maybeSingle();
    if (orderErr) throw orderErr;
    if (!order) return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
    if (!order.customer_email) return NextResponse.json({ ok: false, reason: "no_email" });
    if (order.payment_status !== "paid") return NextResponse.json({ ok: false, reason: "not_paid" });

    const { data: seller } = await admin.from("sellers").select("email, store_name, logo_url, subdomain").eq("id", order.seller_id).maybeSingle();
    await sendOrderConfirmationEmail(admin, order, seller);

    return NextResponse.json({ ok: true, sentAt: new Date().toISOString() });
  } catch (e: any) {
    console.error("Resend order confirmation email failed:", e);
    return NextResponse.json({ error: e.message || "Internal error" }, { status: 500 });
  }
}
