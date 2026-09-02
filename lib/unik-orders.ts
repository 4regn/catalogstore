import { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "./email";
import { sendOrderPushToSeller } from "./push-notify";
import { activateSetlaPlanAfterPayment, setlaFirstChargeAmountCents, type SetlaFirstChargeMeta, voidStillbornPayLaterPlan } from "./setla-instalments";
import { FOUR_REGN_ACCOUNT_URL, FOUR_REGN_TRACKING_URL, fourRegnOrderReference } from "./four-regn-orders";
import { getYocoCheckout, isYocoCheckoutPaid } from "./yoco";
import { getStitchPaymentLink } from "./stitch";

// How long a UNIK order can sit unpaid before we stop calling it "pending"
// (implies "still in progress, fulfilment is coming") and start calling it
// "abandoned" (customer left checkout, no payment ever came through). This
// is purely a display/labelling threshold -- an order that pays after this
// window still gets marked "paid" normally via the webhook or self-heal,
// since both of those only ever check payment_status = "pending" and update
// unconditionally on real confirmation, before this sweep gets a chance to
// touch it.
export const ORDER_ABANDON_MS = 60 * 60 * 1000; // 1 hour

// UNRESOLVED_GATEWAY_PAYMENT_METHODS lives in lib/order-payment-methods.ts,
// not here -- that module is dependency-free, importable from the
// dashboard's client-side page. This module is server-only (web-push, via
// lib/push-notify.ts, isn't safe in a browser bundle), so importing that
// constant from here instead broke the dashboard's client build.

/* Fallback for a missed Stitch webhook AND a customer who closes the tab
   before the checkout return page can self-heal. Every candidate is checked
   against Stitch server-to-server, with amount and merchant-reference guards,
   before the normal idempotent paid-order path sends confirmations. */
export async function recoverPaidStitchOrders(
  admin: SupabaseClient,
  sellerId?: string,
): Promise<{ checked: number; recovered: number }> {
  const reconciliationWindow = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  let query = admin
    .from("orders")
    .select("id, seller_id, total, items, customer_name, customer_email, payment_status, stitch_link_id")
    .eq("payment_method", "stitch")
    .in("payment_status", ["pending", "abandoned", "failed"])
    .not("stitch_link_id", "is", null)
    .gte("created_at", reconciliationWindow)
    .order("created_at", { ascending: false })
    .limit(sellerId ? 20 : 50);
  if (sellerId) query = query.eq("seller_id", sellerId);

  const { data: candidates, error } = await query;
  if (error) {
    console.error("recoverPaidStitchOrders: candidate query failed", error);
    return { checked: 0, recovered: 0 };
  }

  let checked = 0;
  let recovered = 0;
  for (const order of candidates || []) {
    if (!order.stitch_link_id) continue;
    checked += 1;
    try {
      const payment = await getStitchPaymentLink(order.stitch_link_id);
      if (payment?.status !== "PAID") continue;
      const expectedCents = Math.round(Number(order.total || 0) * 100);
      const amountMatches = payment.amountCents > 0 && Math.abs(expectedCents - payment.amountCents) <= 1;
      const referenceMatches = !payment.merchantReference || payment.merchantReference === order.id;
      if (!amountMatches || !referenceMatches) {
        console.error("Stitch scheduled recovery verification mismatch", {
          orderId: order.id,
          expectedCents,
          stitchAmount: payment.amountCents,
          merchantReference: payment.merchantReference,
          linkId: order.stitch_link_id,
        });
        continue;
      }
      const result = await markUnikOrderPaid(admin, order, payment.paymentId, null, "stitch");
      if (result === "paid") recovered += 1;
    } catch (providerError) {
      console.error("Stitch scheduled recovery provider check failed", {
        orderId: order.id,
        linkId: order.stitch_link_id,
        error: providerError,
      });
    }
  }
  return { checked, recovered };
}

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
// Custom Upload Studio products (see CUSTOM_PRINT_FRONT_TAG in
// FourRegnStore.tsx) carry the customer's uploaded design as a plain URL
// on the line item -- surfaced in both the seller notification (so they
// can actually open the file to fulfill/print it) and the customer's own
// confirmation (a quick "yes, this is what we received" reassurance).
function customArtworkLinksHtml(item: any): string {
  if (!item?.customArtwork?.frontUrl) return "";
  const links = [`<a href="${item.customArtwork.frontUrl}" style="color:#0070f3;">Front design</a>`];
  if (item.customArtwork.backUrl) links.push(`<a href="${item.customArtwork.backUrl}" style="color:#0070f3;">Back design</a>`);
  return `<p style="margin:2px 0 4px;font-size:13px;">${links.join(" &middot; ")}</p>`;
}

export async function markUnikOrderPaid(
  admin: SupabaseClient,
  order: { id: string; seller_id: string; total: number; items: any; customer_name: string; customer_email: string; payment_status: string },
  paymentId: string,
  eventId: string | null,
  provider: "yoco" | "stitch" | "float" = "yoco"
): Promise<"paid" | "already_paid" | "amount_mismatch" | "update_failed"> {
  if (order.payment_status === "paid") return "already_paid";

  const providerColumns = provider === "stitch"
    ? { stitch_payment_id: paymentId, ...(eventId ? { stitch_event_id: eventId } : {}) }
    : provider === "float"
      ? { float_checkout_id: paymentId }
      : { yoco_payment_id: paymentId, ...(eventId ? { yoco_event_id: eventId } : {}) };

  const { data: updated, error } = await admin
    .from("orders")
    .update({ payment_status: "paid", status: "confirmed", ...providerColumns })
    .eq("id", order.id)
    .in("payment_status", ["pending", "abandoned", "failed"])
    .select("id, order_number, external_id")
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

  const { data: seller } = await admin.from("sellers").select("email, store_name, logo_url, subdomain").eq("id", order.seller_id).maybeSingle();
  const itemsHtml = (order.items || []).map((i: any) => `<p style="margin:0 0 4px">${i.name} x${i.qty} — R${Math.round(i.price * i.qty)}</p>${customArtworkLinksHtml(i)}`).join("");

  if (seller?.email) {
    await sendEmail({
      seller,
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
  await sendOrderPushToSeller(admin, order.seller_id, {
    title: `New order — R${Math.round(Number(order.total))}`,
    body: `${order.customer_name} · ${(order.items || []).length} item${(order.items || []).length === 1 ? "" : "s"}`,
    url: "/dashboard?tab=orders",
  });
  await sendOrderConfirmationEmail(admin, { ...order, id: updated.id, order_number: updated.order_number, external_id: updated.external_id }, seller);

  return "paid";
}

/* Customer-facing "your order is confirmed" email -- factored out of
   markUnikOrderPaid (which still calls this on the real first-paid
   transition) so a seller can also trigger it on demand for an order
   that's already paid, e.g. after correcting a typo'd email address the
   confirmation went to the first time. Takes the seller row rather than
   re-fetching it so the original call site (which already has it) doesn't
   pay for a second query. */
export async function sendOrderConfirmationEmail(
  admin: SupabaseClient,
  order: { id: string; order_number: number | null; external_id: string | null; seller_id: string; total: number; items: any; customer_name: string; customer_email: string },
  seller: { email?: string | null; store_name: string; logo_url?: string | null; subdomain?: string | null } | null
): Promise<void> {
  if (!order.customer_email) return;
  const itemsHtml = (order.items || []).map((i: any) => `<p style="margin:0 0 4px">${i.name} x${i.qty} — R${Math.round(i.price * i.qty)}</p>${customArtworkLinksHtml(i)}`).join("");
  const isFourRegn = seller?.subdomain === "4regn";
  const reference = isFourRegn ? fourRegnOrderReference(order) : "";
  const fourRegnTracking = isFourRegn ? `<div style="background:#eef6ef;border:1px solid #d6ead8;border-radius:12px;padding:20px;margin:18px 0;"><h3 style="font-size:12px;color:#177533;text-transform:uppercase;letter-spacing:.08em;margin:0 0 8px;">Track your order</h3><p style="margin:0 0 16px;font-size:13px;color:#5f6c61;line-height:1.65;">Your order number is <strong>${reference}</strong>. Track it with the email address or mobile number used at checkout. You can enter the number with or without the # and D.</p><a href="${FOUR_REGN_TRACKING_URL}" style="display:block;text-align:center;padding:15px;background:#111;color:#fff;border-radius:100px;text-decoration:none;font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:.08em;">Track Order</a></div><a href="${FOUR_REGN_ACCOUNT_URL}" style="display:block;text-align:center;padding:14px;border:1px solid #222;color:#222;border-radius:100px;text-decoration:none;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.06em;">View My Account</a>` : "";
  await sendEmail({
    seller,
    to: order.customer_email,
    from: seller ? `${seller.store_name} <orders@catalogstore.co.za>` : undefined,
    subject: `Order confirmed — ${seller?.store_name || "UNIK Labs"}`,
    html: `<div style="font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto;color:#111">
      ${seller?.logo_url ? `<img src="${seller.logo_url}" alt="" style="height:40px;margin-bottom:16px" />` : `<h2 style="margin:0 0 12px">${seller?.store_name || "UNIK Labs"}</h2>`}
      <p style="margin:0 0 12px">Thanks ${order.customer_name}, your payment was received and your order is confirmed:</p>
      <div style="background:#f4f1eb;border-radius:10px;padding:16px 18px;margin-bottom:16px">${itemsHtml}<p style="margin:12px 0 0;font-weight:700">Total: R${Math.round(Number(order.total))}</p></div>${fourRegnTracking}
    </div>`,
  });
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
   separate real-time notification lifecycle of their own -- Yoco/Stitch
   (direct card) and both SETLA plan types (their first charge is a Yoco
   checkout too, same webhook, see lib/setla-instalments.ts) -- so it never touches
   EFT (never reaches "pending" in the first place, see place-order's own
   "awaiting_payment" status for that method) or PayFast, which has its own
   ITN-driven lifecycle. Despite the name, this was never actually UNIK-
   specific (sellerId-scoped from the start) -- now genuinely used by any
   seller's checkout, not just UNIK's. Safe to call on every account/order
   read -- it's a plain conditional UPDATE, a no-op when nothing qualifies. */
export async function sweepAbandonedOrders(admin: SupabaseClient, sellerId: string): Promise<void> {
  const cutoff = new Date(Date.now() - ORDER_ABANDON_MS).toISOString();

  // Never label a genuinely paid Stitch order abandoned merely because its
  // webhook was missed. Dashboard visits provide an additional recovery
  // trigger alongside the dedicated scheduled job.
  await recoverPaidStitchOrders(admin, sellerId);

  // Recover paid SETLA checkouts before labelling anything abandoned.
  // The gateway only collects instalment #1 here, so verification must use
  // the SETLA schedule amount rather than the full order total. This also
  // covers customers who paid successfully but closed the return page while
  // a Yoco webhook was delayed or missed: opening the seller dashboard will
  // now create the real plan, confirm the order and send both emails through
  // activateSetlaPlanAfterPayment's normal idempotent path.
  const reconciliationWindow = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: unresolvedSetla } = await admin
    .from("orders")
    .select("id, yoco_checkout_id, setla_pending_stitch_meta")
    .eq("seller_id", sellerId)
    .eq("payment_method", "setla")
    .in("payment_status", ["pending", "abandoned", "failed"])
    .not("yoco_checkout_id", "is", null)
    .gte("created_at", reconciliationWindow)
    .order("created_at", { ascending: false })
    .limit(20);

  for (const candidate of unresolvedSetla || []) {
    const meta = candidate.setla_pending_stitch_meta as SetlaFirstChargeMeta | null;
    if (!candidate.yoco_checkout_id || meta?.kind !== "setla_first_charge") continue;
    try {
      const checkout = await getYocoCheckout(candidate.yoco_checkout_id);
      if (!isYocoCheckoutPaid(checkout)) continue;
      const expectedCents = setlaFirstChargeAmountCents(meta);
      if (checkout.amount && Math.abs(expectedCents - Number(checkout.amount)) > 1) {
        console.error("SETLA reconciliation amount mismatch", {
          orderId: candidate.id,
          expectedCents,
          yocoAmount: checkout.amount,
          checkoutId: candidate.yoco_checkout_id,
        });
        continue;
      }
      const result = await activateSetlaPlanAfterPayment(
        admin,
        meta,
        checkout.paymentId,
        Number(checkout.amount) || expectedCents,
        null
      );
      if (!result.ok) console.error("SETLA reconciliation failed", { orderId: candidate.id, error: result.error });
    } catch (error) {
      console.error("SETLA reconciliation provider check failed", { orderId: candidate.id, error });
    }
  }

  // Historical cleanup only: app/api/checkout/setla-create/route.ts and
  // app/api/setla/checkout/create/route.ts no longer claim available_limit
  // or write payment_method="setla_pay_later" before Yoco confirms payment
  // (see activateSetlaPlanAfterPayment in lib/setla-instalments.ts) -- a
  // brand-new pending SETLA order sits at payment_method="setla" with
  // nothing claimed at all, so there's nothing for a NEW abandoned order
  // to release. This block only still matters for any order created
  // before that change that's still stuck with a live claim.
  //
  // payment_method must include "setla" (the generic storefront's
  // pre-fix label -- setla-create never updated it) alongside
  // "setla_pay_later" (what a pre-fix UNIK order was written with
  // directly, since that route always knew the plan type at insert time).
  // payment_status must include "abandoned" too: the blanket update below
  // already ran on an earlier sweep call for these exact rows (before
  // this payment_method fix existed) and flipped them straight to
  // "abandoned" -- past "pending" is exactly where a genuinely stuck
  // claim needs releasing, not disqualifying.
  const { data: candidates } = await admin
    .from("orders")
    .select("id")
    .eq("seller_id", sellerId)
    .in("payment_method", ["setla", "setla_pay_later"])
    .in("payment_status", ["pending", "abandoned"])
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
    .in("payment_method", ["yoco", "stitch", "float", "setla", "setla_pay_later", "setla_laybuy"])
    .eq("payment_status", "pending")
    .lt("created_at", cutoff);
  if (error) console.error("sweepAbandonedOrders: update failed", error);
}
