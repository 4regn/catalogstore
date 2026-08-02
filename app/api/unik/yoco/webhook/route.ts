import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function secureEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function validSignature(req: NextRequest, rawBody: string, secret: string) {
  const id = req.headers.get("webhook-id") || "";
  const timestamp = req.headers.get("webhook-timestamp") || "";
  const signatures = req.headers.get("webhook-signature") || "";
  const timestampNumber = Number(timestamp);
  if (!id || !Number.isFinite(timestampNumber) || Math.abs(Date.now() / 1000 - timestampNumber) > 180) return false;
  const encodedSecret = secret.startsWith("whsec_") ? secret.slice(6) : "";
  if (!encodedSecret) return false;
  let secretBytes: Buffer;
  try { secretBytes = Buffer.from(encodedSecret, "base64"); } catch { return false; }
  const expected = crypto.createHmac("sha256", secretBytes).update(`${id}.${timestamp}.${rawBody}`).digest("base64");
  return signatures.split(" ").some((entry) => {
    const [version, signature] = entry.split(",", 2);
    return version === "v1" && Boolean(signature) && secureEqual(expected, signature);
  });
}

export async function POST(req: NextRequest) {
  const secret = process.env.YOCO_UNIK_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook is not configured" }, { status: 503 });
  const rawBody = await req.text();
  if (!validSignature(req, rawBody, secret)) return NextResponse.json({ error: "Invalid webhook signature" }, { status: 403 });

  let event: any;
  try { event = JSON.parse(rawBody); } catch { return NextResponse.json({ error: "Invalid payload" }, { status: 400 }); }
  if (event?.type !== "payment.succeeded" || event?.payload?.status !== "succeeded") {
    return NextResponse.json({ status: "ignored" });
  }

  const checkoutId = String(event?.payload?.metadata?.checkoutId || "");
  const paymentId = String(event?.payload?.id || "");
  const eventId = String(event?.id || "");
  if (!checkoutId || !paymentId || !eventId) return NextResponse.json({ error: "Payment reference missing" }, { status: 400 });

  const admin = getAdmin();
  const { data: order, error: lookupError } = await admin
    .from("orders")
    .select("id, total, items, payment_status")
    .eq("yoco_checkout_id", checkoutId)
    .maybeSingle();
  if (lookupError || !order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.payment_status === "paid") return NextResponse.json({ status: "ok", note: "already paid" });

  const receivedCents = Number(event.payload.amount);
  const expectedCents = Math.round(Number(order.total) * 100);
  if (!Number.isInteger(receivedCents) || receivedCents !== expectedCents || event.payload.currency !== "ZAR") {
    console.error("UNIK Yoco amount mismatch", { checkoutId, expectedCents, receivedCents, currency: event.payload.currency });
    return NextResponse.json({ error: "Payment amount mismatch" }, { status: 409 });
  }

  const { data: updated, error: updateError } = await admin.from("orders").update({
    payment_status: "paid",
    status: "confirmed",
    yoco_payment_id: paymentId,
    yoco_event_id: eventId,
  }).eq("id", order.id).eq("payment_status", "pending").select("id");
  if (updateError) return NextResponse.json({ error: "Could not confirm order" }, { status: 500 });
  if (!updated?.length) return NextResponse.json({ status: "ok", note: "already processed" });

  const designIds = (Array.isArray(order.items) ? order.items : []).map((item: any) => item?.designId || item?.options?.designId).filter((value: unknown) => typeof value === "string");
  if (designIds.length) await admin.from("unik_designs").update({ status: "paid", updated_at: new Date().toISOString() }).in("id", designIds);

  try {
    await fetch(new URL("/api/notify-order", req.nextUrl.origin), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: order.id }),
    });
  } catch (cause) {
    console.error("UNIK order notification failed", cause);
  }
  return NextResponse.json({ status: "ok" });
}
