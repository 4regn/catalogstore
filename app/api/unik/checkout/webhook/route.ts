import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { verifyYocoWebhookSignature } from "../../../../../lib/yoco";
import { sendEmail } from "../../../../../lib/email";

export const dynamic = "force-dynamic";

/* Yoco payment.succeeded webhook. Verifies the Svix-style signature, looks
   up the order by yoco_checkout_id (set when the checkout was created),
   and idempotently marks it paid -- the update is scoped to
   payment_status = "pending" so a retried webhook (Yoco retries on
   non-2xx) can't double-process, matching the PayFast ITN pattern used
   elsewhere in this app. */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("webhook-signature") || "";
  const id = req.headers.get("webhook-id") || "";
  const timestamp = req.headers.get("webhook-timestamp") || "";

  if (!verifyYocoWebhookSignature(rawBody, { id, timestamp, signature })) {
    console.error("UNIK Yoco webhook: signature verification failed");
    return NextResponse.json({ status: "error", reason: "invalid signature" }, { status: 403 });
  }

  let event: any;
  try { event = JSON.parse(rawBody); } catch {
    return NextResponse.json({ status: "error", reason: "invalid body" }, { status: 400 });
  }

  if (event?.type !== "payment.succeeded") {
    return NextResponse.json({ status: "ignored" });
  }

  const payload = event.payload || {};
  const checkoutId: string | undefined = payload.metadata?.checkoutId;
  const paymentId: string | undefined = payload.id;
  const amountCents: number = Number(payload.amount) || 0;
  const eventId: string | undefined = event.id;
  if (!checkoutId || !paymentId || !eventId) {
    return NextResponse.json({ status: "error", reason: "missing identifiers" }, { status: 400 });
  }

  const admin = getAdmin();
  const { data: order } = await admin
    .from("orders")
    .select("id, seller_id, total, items, customer_name, customer_email, payment_status")
    .eq("yoco_checkout_id", checkoutId)
    .maybeSingle();
  if (!order) {
    console.error("UNIK Yoco webhook: no order for checkoutId", checkoutId);
    return NextResponse.json({ status: "error", reason: "order not found" }, { status: 404 });
  }
  if (order.payment_status === "paid") {
    return NextResponse.json({ status: "ok", note: "already processed" });
  }

  const expectedCents = Math.round(Number(order.total) * 100);
  if (Math.abs(expectedCents - amountCents) > 1) {
    console.error("UNIK Yoco webhook: amount mismatch", { orderId: order.id, expectedCents, amountCents });
    return NextResponse.json({ status: "error", reason: "amount mismatch" }, { status: 409 });
  }

  const { data: updated, error } = await admin
    .from("orders")
    .update({ payment_status: "paid", status: "confirmed", yoco_payment_id: paymentId, yoco_event_id: eventId })
    .eq("id", order.id)
    .eq("payment_status", "pending")
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("UNIK Yoco webhook: order update failed", error);
    return NextResponse.json({ status: "error", reason: error.message }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json({ status: "ok", note: "already processed" });
  }

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

  return NextResponse.json({ status: "ok" });
}
