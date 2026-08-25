import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { sendEmail } from "../../../../lib/email";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PAYFAST_PASSPHRASE = process.env.PAYFAST_PASSPHRASE || "";
const PAYFAST_VALIDATE_HOSTS = ["www.payfast.co.za", "sandbox.payfast.co.za"];

const PAYFAST_IPS = new Set([
  "197.97.145.144", "197.97.145.145", "197.97.145.146", "197.97.145.147",
  "197.97.145.148", "197.97.145.149", "197.97.145.150", "197.97.145.151",
  "41.74.179.194", "41.74.179.195", "41.74.179.196", "41.74.179.197",
]);

function verifySignature(data: Record<string, string>, receivedSig: string): boolean {
  const ordered = Object.keys(data)
    .filter((k) => k !== "signature")
    .sort()
    .map((k) => `${k}=${encodeURIComponent(data[k]).replace(/%20/g, "+")}`)
    .join("&");
  const withPassphrase = PAYFAST_PASSPHRASE ? ordered + "&passphrase=" + encodeURIComponent(PAYFAST_PASSPHRASE) : ordered;
  return crypto.createHash("md5").update(withPassphrase).digest("hex") === receivedSig;
}

async function payfastValidate(rawBody: string): Promise<boolean> {
  for (const host of PAYFAST_VALIDATE_HOSTS) {
    try {
      const res = await fetch(`https://${host}/eng/query/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: rawBody,
      });
      if (res.ok && (await res.text()).trim() === "VALID") return true;
    } catch {
      // try next host
    }
  }
  return false;
}

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
function rateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxRequests) return false;
  entry.count++;
  return true;
}

/* Mirrors /api/payfast/notify (order ITN) exactly for the verification
   stack -- IP allowlist, passphrase, signature, server-to-server validate
   handshake -- but updates a `bookings` row instead of `orders`, keyed on
   custom_str1 = bookingId, and sends the booking-confirmed emails instead
   of the order ones. Kept as a fully separate route rather than a shared
   branch so a bug in one payment flow can't take down the other. */
export async function POST(req: NextRequest) {
  try {
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!rateLimit("pf-booking-notify-" + clientIp, 30, 60000)) {
      return NextResponse.json({ status: "rate_limited" }, { status: 429 });
    }
    if (clientIp !== "unknown" && !PAYFAST_IPS.has(clientIp)) {
      console.error("PayFast booking notify from non-allowlisted IP:", clientIp);
      return NextResponse.json({ status: "error", reason: "ip not allowed" }, { status: 403 });
    }
    if (!PAYFAST_PASSPHRASE) {
      console.error("PAYFAST_PASSPHRASE is not configured — rejecting ITN");
      return NextResponse.json({ status: "error", reason: "passphrase not configured" }, { status: 503 });
    }

    const body = await req.text();
    const params = new URLSearchParams(body);
    const data: Record<string, string> = {};
    params.forEach((value, key) => { data[key] = value; });

    if (!data.signature || !verifySignature(data, data.signature)) {
      console.error("PayFast booking signature verification failed");
      return NextResponse.json({ status: "error", reason: "invalid signature" }, { status: 403 });
    }
    if (!(await payfastValidate(body))) {
      console.error("PayFast booking validate handshake failed");
      return NextResponse.json({ status: "error", reason: "validate failed" }, { status: 403 });
    }
    if (data.payment_status !== "COMPLETE") {
      return NextResponse.json({ status: "ignored", reason: "payment not complete" });
    }

    const bookingId = data.custom_str1;
    if (!bookingId) return NextResponse.json({ status: "error", reason: "no booking id" }, { status: 400 });

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: booking, error: lookupErr } = await supabase
      .from("bookings")
      .select("id, seller_id, service_id, status, client_name, client_email, client_phone, date, time_slot, booking_type")
      .eq("id", bookingId)
      .single();
    if (lookupErr || !booking) return NextResponse.json({ status: "error", reason: "booking not found" }, { status: 404 });
    if (booking.status === "confirmed") return NextResponse.json({ status: "ok", note: "already confirmed" });

    const { data: service } = booking.service_id
      ? await supabase.from("services").select("name, price").eq("id", booking.service_id).single()
      : { data: null as any };

    const amountGross = parseFloat(data.amount_gross || "0");
    const expected = Number(service?.price) || 0;
    if (Math.abs(amountGross - expected) > 0.01) {
      console.error("PayFast booking amount mismatch", { bookingId, expected, received: amountGross });
      return NextResponse.json({ status: "error", reason: "amount mismatch" }, { status: 409 });
    }

    const { error } = await supabase
      .from("bookings")
      .update({ status: "confirmed", payfast_payment_id: data.pf_payment_id || null })
      .eq("id", bookingId)
      .eq("status", "awaiting_payment"); // idempotency
    if (error) {
      console.error("Failed to update booking:", error);
      return NextResponse.json({ status: "error", reason: error.message }, { status: 500 });
    }

    const { data: seller } = await supabase.from("sellers").select("store_name, email, logo_url, whatsapp_number, subdomain").eq("id", booking.seller_id).single();
    const dateLabel = new Date(booking.date + "T00:00:00").toLocaleDateString("en-ZA", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    const svcLine = service ? `${service.name} — R${Math.round(service.price)} (paid)` : "Service";

    if (seller?.email) {
      await sendEmail({
        seller,
        to: seller.email,
        subject: `Booking paid & confirmed — ${booking.client_name}`,
        html: `<div style="font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto;color:#2A1F18">
          <h2 style="margin:0 0 12px">Booking Confirmed &amp; Paid</h2>
          <p style="margin:0 0 4px"><strong>${booking.client_name}</strong> (${booking.client_phone})</p>
          <p style="margin:0 0 4px">${svcLine}</p>
          <p style="margin:0">${dateLabel} at ${booking.time_slot}</p>
        </div>`,
      });
    }
    if (booking.client_email) {
      await sendEmail({
        seller,
        to: booking.client_email,
        from: seller ? `${seller.store_name} <orders@catalogstore.co.za>` : undefined,
        subject: `Booking confirmed — ${seller?.store_name || "Your appointment"}`,
        html: `<div style="font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto;color:#2A1F18">
          ${seller?.logo_url ? `<img src="${seller.logo_url}" alt="" style="height:40px;margin-bottom:16px" />` : ""}
          <p style="margin:0 0 12px">Your payment was received and your appointment is confirmed:</p>
          <div style="background:#F5EDE3;border-radius:10px;padding:16px 18px">
            <p style="margin:0 0 4px">${svcLine}</p>
            <p style="margin:0">${dateLabel} at ${booking.time_slot}</p>
          </div>
        </div>`,
      });
    }

    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error("PayFast booking notify error:", err);
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
}
