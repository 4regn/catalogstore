import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { requireCustomerAccount } from "../../../../../lib/customer-account";
import { getYocoCheckout, isYocoCheckoutPaid } from "../../../../../lib/yoco";
import { markFourRegnLaybuyPaymentPaid } from "../../../../../lib/four-regn-laybuy";

export const dynamic = "force-dynamic";

/* Same self-heal reasoning as /api/checkout/order-status -- the account
   page calls this once when it lands back on ?laybuy_paid=<paymentId>, in
   case the Yoco webhook is late or missed, so the balance updates
   immediately instead of only whenever the webhook eventually arrives. */
export async function GET(req: NextRequest) {
  const paymentId = req.nextUrl.searchParams.get("paymentId") || "";
  const slug = req.nextUrl.searchParams.get("slug") || "";
  if (!/^[0-9a-f-]{36}$/i.test(paymentId)) return NextResponse.json({ error: "Invalid payment" }, { status: 400 });

  const auth = await requireCustomerAccount(req, slug);
  if ("response" in auth) return auth.response;

  const admin = getAdmin();
  const { data: payment } = await admin
    .from("four_regn_laybuy_payments")
    .select("id, plan_id, status, yoco_checkout_id, four_regn_laybuy_plans!inner(customer_id)")
    .eq("id", paymentId)
    .maybeSingle<{ id: string; plan_id: string; status: string; yoco_checkout_id: string | null; four_regn_laybuy_plans: { customer_id: string } }>();
  if (!payment || payment.four_regn_laybuy_plans.customer_id !== auth.account.customer_id) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  if (payment.status === "pending" && payment.yoco_checkout_id) {
    try {
      const checkout = await getYocoCheckout(payment.yoco_checkout_id);
      if (isYocoCheckoutPaid(checkout)) {
        await markFourRegnLaybuyPaymentPaid(admin, { paymentId: payment.id, providerReference: checkout.paymentId, eventId: null });
      }
    } catch (error) {
      console.error("4REGN Lay-Buy self-heal failed", { paymentId, error });
    }
  }

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
