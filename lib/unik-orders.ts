import { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "./email";
import { voidStillbornPayLaterPlan } from "./setla-instalments";

// How long a UNIK order can sit unpaid before we stop calling it "pending"
// (implies "still in progress, fulfilment is coming") and start calling it
// "abandoned" (customer left checkout, no payment ever came through). This
// is purely a display/labelling threshold -- an order that pays after this
// window still gets marked "paid" normally via the webhook or self-heal,
// since both of those only ever check payment_status = "pending" and update
// unconditionally on real confirmation, before this sweep gets a chance to
// touch it.
export const ORDER_ABANDON_MS = 60 * 60 * 1000; // 1 hour

/* Idempotently marks a UNIK order paid + its linked designs paid, and
   emails both sides. Shared between the Yoco webhook (the primary path)
   and a self-heal check on the order-status endpoint (in case the
   webhook is slow or never arrives -- see getYocoCheckout in lib/yoco.ts).
   The update is scoped to payment_status IN (pending, abandoned, failed)
   rather than just "pending" -- an order can get swept to "abandoned" by
   ORDER_ABANDON_MS before a genuinely late webhook/self-heal confirmation
   arrives, and a real payment confirmation must always be able to correct
   that label, not silently no-op against it. Calling this twice for the
   same order (webhook AND self-heal both firing) is still safe either way. */
export async function markUnikOrderPaid(
  admin: SupabaseClient,
  order: { id: string; seller_id: string; total: number; items: any; customer_name: string; customer_email: string; payment_status: string },
  paymentId: string,
  eventId: string | null
): Promise<"paid" | "already_paid" | "amount_mismatch" | "update_failed"> {
  if (order.payment_status === "paid") return "already_paid";

  const { data: updated, error } = await admin
    .from("orders")
    .update({ payment_status: "paid", status: "confirmed", yoco_payment_id: paymentId, ...(eventId ? { yoco_event_id: eventId } : {}) })
    .eq("id", order.id)
    .in("payment_status", ["pending", "abandoned", "failed"])
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("markUnikOrderPaid: update failed", error);
    return "update_failed";
  }
  if (!updated) return "already_paid";

  const designIds = (order.items || []).map((i: any) => i?.customization?.designId).filter(Boolean);
  if (designIds.length) {
    await admin.from("unik_designs").update({ status: "paid", saved_at: new Date().toISOString() }).in("id", designIds);
  }

  const { data: seller } = await admin.from("sellers").select("email, store_name, logo_url").eq("id", order.seller_id).maybeSingle();
  const itemsHtml = (order.items || []).map((i: any) => `<p style="margin:0 0 4px">${i.name} x${i.qty} — R${Math.round(i.price * i.qty)}</p>`).join("");

  if (seller?.email) {
    await sendEmail({
      to: seller.email,
      subject: `New paid order — ${order.customer_name}`,
      html: `<div style="font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto;color:#111">
        <h2 style="margin:0 0 12px">New Order — Paid</h2>
        <p style="margin:0 0 4px"><strong>${order.customer_name}</strong> (${order.customer_email})</p>
        ${itemsHtml}
        <p style="margin:12px 0 0;font-size:15px;font-weight:600">Total: R${Math.round(Number(order.total))}</p>
      </div>`,
    });
  }
  if (order.customer_email) {
    await sendEmail({
      to: order.customer_email,
      from: seller ? `${seller.store_name} <orders@catalogstore.co.za>` : undefined,
      subject: `Order confirmed — ${seller?.store_name || "UNIK Labs"}`,
      html: `<div style="font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto;color:#111">
        ${seller?.logo_url ? `<img src="${seller.logo_url}" alt="" style="height:40px;margin-bottom:16px" />` : `<h2 style="margin:0 0 12px">${seller?.store_name || "UNIK Labs"}</h2>`}
        <p style="margin:0 0 12px">Thanks ${order.customer_name}, your payment was received and your order is confirmed:</p>
        <div style="background:#f4f1eb;border-radius:10px;padding:16px 18px;margin-bottom:16px">${itemsHtml}<p style="margin:12px 0 0;font-weight:700">Total: R${Math.round(Number(order.total))}</p></div>
      </div>`,
    });
  }

  return "paid";
}

/* Marks a UNIK order as a failed payment attempt (Yoco reported the
   payment itself failed/declined -- not "customer never tried", see
   sweepAbandonedUnikOrders for that case). Only ever moves an order OUT
   of "pending" -- never touches an order that's already paid, already
   failed, or already swept to abandoned, so a failure event that arrives
   out of order after some other resolution can't clobber it. */
export async function markUnikOrderFailed(
  admin: SupabaseClient,
  orderId: string
): Promise<"failed" | "no_change"> {
  const { data: updated, error } = await admin
    .from("orders")
    .update({ payment_status: "failed", status: "failed" })
    .eq("id", orderId)
    .eq("payment_status", "pending")
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("markUnikOrderFailed: update failed", error);
    return "no_change";
  }
  return updated ? "failed" : "no_change";
}

/* Orders that never received a payment confirmation (no webhook, no
   self-heal match) sit at payment_status = "pending" forever otherwise --
   indistinguishable from "still checking out right now" to the customer
   and seller. Anything past ORDER_ABANDON_MS with no resolution gets
   relabelled "abandoned". Scoped to this seller and to gateways with no
   separate real-time notification lifecycle of their own -- Yoco (direct
   card) and both SETLA plan types (their first charge is a Yoco checkout
   too, same webhook, see lib/setla-instalments.ts) -- so it never touches
   EFT (never reaches "pending" in the first place, see place-order's own
   "awaiting_payment" status for that method) or PayFast, which has its own
   ITN-driven lifecycle. Despite the name, this was never actually UNIK-
   specific (sellerId-scoped from the start) -- now genuinely used by any
   seller's checkout, not just UNIK's. Safe to call on every account/order
   read -- it's a plain conditional UPDATE, a no-op when nothing qualifies. */
export async function sweepAbandonedOrders(admin: SupabaseClient, sellerId: string): Promise<void> {
  const cutoff = new Date(Date.now() - ORDER_ABANDON_MS).toISOString();

  // A "setla_pay_later" order about to be swept below claimed a chunk of
  // the customer's available_limit the moment its plan was created (see
  // the optimistic-lock claim in app/api/setla/checkout/create/route.ts
  // and app/api/checkout/setla-create/route.ts) -- if instalment #1 never
  // got a webhook at all (customer just closed the tab at Yoco, no
  // payment.failed event ever fires), that claimed limit would otherwise
  // sit gone forever. Same voidStillbornPayLaterPlan() this abandonment
  // maps to as an explicit payment.failed webhook does -- release the
  // limit and void the plan before relabelling the order below. SETLA
  // Laybuy never claims against available_limit at all (see that route's
  // own comment), so it has nothing to release here.
  const { data: candidates } = await admin
    .from("orders")
    .select("id")
    .eq("seller_id", sellerId)
    .eq("payment_method", "setla_pay_later")
    .eq("payment_status", "pending")
    .lt("created_at", cutoff);
  if (candidates && candidates.length) {
    const { data: setlaOrders } = await admin
      .from("setla_orders")
      .select("id")
      .in("unik_order_id", candidates.map((o) => o.id));
    if (setlaOrders && setlaOrders.length) {
      const { data: plans } = await admin
        .from("setla_payment_plans")
        .select("id")
        .in("order_id", setlaOrders.map((o) => o.id))
        .eq("plan_type", "pay_later")
        .eq("status", "active");
      for (const plan of plans || []) {
        await voidStillbornPayLaterPlan(admin, plan.id);
      }
    }
  }

  const { error } = await admin
    .from("orders")
    .update({ payment_status: "abandoned", status: "abandoned" })
    .eq("seller_id", sellerId)
    .in("payment_method", ["yoco", "setla_pay_later", "setla_laybuy"])
    .eq("payment_status", "pending")
    .lt("created_at", cutoff);
  if (error) console.error("sweepAbandonedOrders: update failed", error);
}
