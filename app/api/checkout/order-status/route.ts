import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";
import { getYocoCheckout, isYocoCheckoutPaid, YOCO_TERMINAL_FAILURE_STATUSES } from "../../../../lib/yoco";
import { markUnikOrderPaid, markUnikOrderFailed } from "../../../../lib/unik-orders";
import { activateSetlaPlanAfterPayment, setlaFirstChargeAmountCents, type SetlaFirstChargeMeta } from "../../../../lib/setla-instalments";
import { activateFourRegnLaybuyPlan } from "../../../../lib/four-regn-laybuy";
import { getStitchPaymentLink } from "../../../../lib/stitch";

export const dynamic = "force-dynamic";

const ORDER_SELECT = "id, seller_id, order_number, external_id, customer_name, customer_email, customer_phone, items, total, shipping_cost, shipping_option, shipping_address, fulfillment_method, payment_method, payment_status, status, discount_code, yoco_checkout_id, stitch_link_id, setla_pending_stitch_meta, four_regn_laybuy_pending_meta, created_at";

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
  stitch_link_id?: string | null;
  setla_pending_stitch_meta?: unknown;
  four_regn_laybuy_pending_meta?: unknown;
  created_at?: string | null;
};

function publicOrder(order: CheckoutOrder) {
  const safeOrder = { ...order } as Omit<CheckoutOrder, "seller_id" | "yoco_checkout_id" | "stitch_link_id" | "setla_pending_stitch_meta" | "four_regn_laybuy_pending_meta"> & Partial<Pick<CheckoutOrder, "seller_id" | "yoco_checkout_id" | "stitch_link_id" | "setla_pending_stitch_meta" | "four_regn_laybuy_pending_meta">>;
  delete safeOrder.seller_id;
  delete safeOrder.yoco_checkout_id;
  delete safeOrder.stitch_link_id;
  delete safeOrder.setla_pending_stitch_meta;
  delete safeOrder.four_regn_laybuy_pending_meta;
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
        const setlaMeta = order.payment_method === "setla" && (order.setla_pending_stitch_meta as SetlaFirstChargeMeta | null)?.kind === "setla_first_charge"
          ? order.setla_pending_stitch_meta as SetlaFirstChargeMeta
          : null;
        // Same reasoning as setlaMeta above -- the 4REGN Lay-Buy deposit
        // checkout is for the deposit amount, not the order's own total,
        // so the self-heal path needs to know that expected amount too
        // (see four_regn_laybuy_pending_meta's own migration comment).
        const laybuyMeta = order.four_regn_laybuy_pending_meta as { kind?: string; orderId?: string; depositAmountCents?: number } | null;
        const isLaybuyDeposit = laybuyMeta?.kind === "four_regn_laybuy_deposit";
        const expectedCents = setlaMeta
          ? setlaFirstChargeAmountCents(setlaMeta)
          : isLaybuyDeposit
          ? Number(laybuyMeta!.depositAmountCents) || 0
          : Math.round(Number(order.total || 0) * 100);
        const amountMatches = !checkout.amount || Math.abs(expectedCents - Number(checkout.amount || 0)) <= 1;
        if (amountMatches) {
          const result = setlaMeta
            ? ((await activateSetlaPlanAfterPayment(admin, setlaMeta, checkout.paymentId, Number(checkout.amount) || expectedCents, null)).ok ? "paid" : "update_failed")
            : isLaybuyDeposit
            ? ((await activateFourRegnLaybuyPlan(admin, { orderId: order.id, depositAmountCents: expectedCents }, checkout.paymentId, Number(checkout.amount) || expectedCents, null)).ok ? "paid" : "update_failed")
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

  // Stitch uses the same idempotent confirmation path as its signed webhook,
  // but also verifies the link directly when the customer returns. This
  // prevents a successful payment from remaining pending merely because a
  // webhook was delayed or its endpoint configuration drifted.
  if (order.payment_status !== "paid" && order.payment_method === "stitch" && order.stitch_link_id) {
    try {
      const payment = await getStitchPaymentLink(order.stitch_link_id);
      if (payment?.status === "PAID") {
        const expectedCents = Math.round(Number(order.total || 0) * 100);
        const amountMatches = payment.amountCents > 0 && Math.abs(expectedCents - payment.amountCents) <= 1;
        const referenceMatches = !payment.merchantReference || payment.merchantReference === order.id;
        if (amountMatches && referenceMatches) {
          const result = await markUnikOrderPaid(admin, order, payment.paymentId, null, "stitch");
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
          console.error("Stitch self-heal verification mismatch", {
            orderId,
            expectedCents,
            stitchAmount: payment.amountCents,
            merchantReference: payment.merchantReference,
            linkId: order.stitch_link_id,
          });
        }
      } else if (
        order.payment_status === "pending" &&
        (payment?.status === "CANCELLED" || payment?.status === "EXPIRED" || (payment?.attemptCount ?? 0) >= 1)
      ) {
        // Two different signals land here, both treated as "stop waiting,
        // let the customer retry":
        //  - CANCELLED/EXPIRED: a definitive terminal outcome on the LINK
        //    itself.
        //  - attemptCount >= 1 (link otherwise still PENDING): Stitch never
        //    flips a Payment Link's own status on a plain declined charge
        //    (the link stays open for another try), so this is the only
        //    signal available for "the customer actually tried and it
        //    didn't go through" -- the link's own `payments` array has at
        //    least one entry and none of them is PAID. Deliberate,
        //    accepted tradeoff (see this route's own history/discussion):
        //    this can, in principle, fire moments before a still-settling
        //    attempt clears, which would leave the customer able to place
        //    a second, separate order while the first also eventually pays
        //    -- recoverPaidStitchOrders (lib/unik-orders.ts, run via
        //    app/api/cron/recover-stitch-orders) still catches that later
        //    revenue-wise, it just becomes a duplicate paid order needing a
        //    manual refund rather than a lost payment. Preferred over
        //    leaving a customer who was visibly declined staring at
        //    "Almost there..." for up to 90 seconds.
        await markUnikOrderFailed(admin, order.id);
        const { data: refreshed } = await admin
          .from("orders")
          .select(ORDER_SELECT)
          .eq("id", orderId)
          .eq("seller_id", seller.id)
          .maybeSingle<CheckoutOrder>();
        if (refreshed) order = refreshed;
      }
    } catch (error) {
      console.error("Stitch self-heal failed", { orderId, linkId: order.stitch_link_id, error });
    }
  }

  // The confirmation page needs to tell a Lay-Buy customer "you paid the
  // deposit, here's what's left" rather than the generic "being prepared"
  // message -- that breakdown lives on the plan, not the order itself, so
  // it's folded into this same response the confirmation page already
  // polls instead of adding a second round trip.
  let laybuyPlan: { total_amount: number; paid_amount: number; status: string } | null = null;
  if (order.payment_method === "four-regn-laybuy") {
    const { data: plan } = await admin
      .from("four_regn_laybuy_plans")
      .select("total_amount, paid_amount, status")
      .eq("order_id", order.id)
      .maybeSingle();
    laybuyPlan = plan || null;
  }

  return NextResponse.json({ order: publicOrder(order), laybuyPlan }, { headers: { "Cache-Control": "no-store" } });
}
