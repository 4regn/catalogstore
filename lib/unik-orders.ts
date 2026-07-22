import { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "./email";

/* Idempotently marks a UNIK order paid + its linked designs paid, and
   emails both sides. Shared between the Yoco webhook (the primary path)
   and a self-heal check on the order-status endpoint (in case the
   webhook is slow or never arrives -- see getYocoCheckout in lib/yoco.ts).
   The update is scoped to payment_status = "pending" so calling this
   twice for the same order (webhook AND self-heal both firing) is safe. */
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
    .eq("payment_status", "pending")
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
