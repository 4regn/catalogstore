import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";
import { getYocoCheckout, isYocoCheckoutPaid, YOCO_TERMINAL_FAILURE_STATUSES } from "../../../../lib/yoco";
import { markUnikOrderPaid, markUnikOrderFailed } from "../../../../lib/unik-orders";
import { activateSetlaPlanAfterPayment, type SetlaFirstChargeMeta } from "../../../../lib/setla-instalments";

export const dynamic = "force-dynamic";

const ORDER_SELECT = "id, seller_id, order_number, external_id, customer_name, customer_email, customer_phone, items, total, shipping_cost, shipping_option, shipping_address, fulfillment_method, payment_method, payment_status, status, discount_code, yoco_checkout_id, setla_pending_stitch_meta, created_at";

type CheckoutOrder = {
  id: string;
  seller_id: string;
  order_number?: number | string | null;
  external_id?: string | null;
  customer_name: string;
  customer_email: string;
  customer_phone?: string | null;
  items: unknown;
  total: number;
  shipping_cost?: number | null;
  shipping_option?: string | null;
  shipping_address?: unknown;
  fulfillment_method?: string | null;
  payment_method?: string | null;
  payment_status: string;
  status?: string | null;
  discount_code?: string | null;
  yoco_checkout_id?: string | null;
  setla_pending_stitch_meta?: unknown;
  created_at?: string | null;
};

function publicOrder(order: CheckoutOrder) {
  const safeOrder = { ...order } as Omit<CheckoutOrder, "seller_id" | "yoco_checkout_id" | "setla_pending_stitch_meta"> & Partial<Pick<CheckoutOrder, "seller_id" | "yoco_checkout_id" | "setla_pending_stitch_meta">>;
  delete safeOrder.seller_id;
  delete safeOrder.yoco_checkout_id;
  delete safeOrder.setla_pending_stitch_meta;
  return safeOrder;
}

export async function GET(req: NextRequest) {
  const orderId = req.nextUrl.searchParams.get("orderId") || "";
  const slug = req.nextUrl.searchParams.get("slug") || "";
  if (!/^[0-9a-f-]{36}$/i.test(orderId) || !slug) {
    return NextResponse.json({ error: "Invalid order" }, { status: 400 });
  }

  const admin = getAdmin();
  const { data: seller } = await admin.from("sellers").select("id").eq("subdomain", slug).maybeSingle();
  if (!seller) return NextResponse.json({ error: "Store not found" }, { status: 404 });

  // customer_email/phone, shipping_address and discount_code are included
  // alongside the confirmation-page fields above so a customer bounced
  // back from a cancelled/declined gateway attempt (see
  // CheckoutPageClient.tsx's load()) can have the checkout form refilled
  // from their own already-placed order, instead of retyping everything.
  // Same unauthenticated-but-orderId-gated trust model this route (and
  // every other ?paid=<orderId>/?cancelled=1 return link on this
  // platform) already relies on -- an unguessable UUID standing in for
  // auth, not a new exposure class introduced by adding these columns.
  let { data: order } = await admin
    .from("orders")
    .select(ORDER_SELECT)
    .eq("id", orderId)
    .eq("seller_id", seller.id)
    .maybeSingle<CheckoutOrder>();

  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  // If Yoco's webhook is late/missed, a real paid order can still look
  // abandoned/pending locally. The checkout return page polls this endpoint,
  // so do the same provider-side verification the UNIK dashboard routes do:
  // check Yoco directly, then mark paid through the normal confirmation path
  // (including seller/customer emails) when the checkout has a paymentId.
  if (order.payment_status !== "paid" && order.yoco_checkout_id) {
    try {
      const checkout = await getYocoCheckout(order.yoco_checkout_id);
      if (isYocoCheckoutPaid(checkout)) {
        const expectedCents = Math.round(Number(order.total || 0) * 100);
        const amountMatches = !checkout.amount || Math.abs(expectedCents - Number(checkout.amount || 0)) <= 1;
        if (amountMatches) {
          const setlaMeta = order.payment_method === "setla" && (order.setla_pending_stitch_meta as SetlaFirstChargeMeta | null)?.kind === "setla_first_charge"
            ? order.setla_pending_stitch_meta as SetlaFirstChargeMeta
            : null;
          const result = setlaMeta
            ? ((await activateSetlaPlanAfterPayment(admin, setlaMeta, checkout.paymentId, Number(checkout.amount) || expectedCents, null)).ok ? "paid" : "update_failed")
            : await markUnikOrderPaid(admin, order, checkout.paymentId, null, "yoco");
          if (result === "paid" || result === "already_paid") {
            const { data: refreshed } = await admin
              .from("orders")
              .select(ORDER_SELECT)
              .eq("id", orderId)
              .eq("seller_id", seller.id)
              .maybeSingle<CheckoutOrder>();
            if (refreshed) order = refreshed;
          }
        } else {
          console.error("Yoco self-heal amount mismatch", {
            orderId,
            expectedCents,
            yocoAmount: checkout.amount,
            checkoutId: order.yoco_checkout_id,
          });
        }
      } else if (checkout?.status && YOCO_TERMINAL_FAILURE_STATUSES.has(checkout.status.toLowerCase()) && order.payment_status === "pending") {
        await markUnikOrderFailed(admin, order.id);
      }
    } catch (error) {
      console.error("Yoco self-heal failed", { orderId, error });
    }
  }

  return NextResponse.json({ order: publicOrder(order) }, { headers: { "Cache-Control": "no-store" } });
}
