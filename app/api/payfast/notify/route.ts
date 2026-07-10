import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PAYFAST_PASSPHRASE = process.env.PAYFAST_PASSPHRASE || "";
// Sandbox host (testing) and live host. ITN responses come from the matching
// validate host. Tolerate either so test integrations don't silently fail.
const PAYFAST_VALIDATE_HOSTS = ["www.payfast.co.za", "sandbox.payfast.co.za"];

// Valid PayFast server IPs (live + sandbox). See https://developers.payfast.co.za/
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
  const hash = crypto.createHash("md5").update(withPassphrase).digest("hex");
  return hash === receivedSig;
}

async function payfastValidate(rawBody: string): Promise<boolean> {
  // PayFast server-to-server "validate" handshake: post the raw ITN body back
  // and accept only a literal "VALID" response. This is the canonical proof
  // the request actually came from PayFast.
  for (const host of PAYFAST_VALIDATE_HOSTS) {
    try {
      const res = await fetch(`https://${host}/eng/query/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: rawBody,
      });
      if (res.ok) {
        const text = (await res.text()).trim();
        if (text === "VALID") return true;
      }
    } catch {
      // try next host
    }
  }
  return false;
}

// Simple in-memory rate limiter
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

export async function POST(req: NextRequest) {
  try {
    // Rate limit: max 30 webhook calls per minute per source
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!rateLimit("payfast-notify-" + clientIp, 30, 60000)) {
      return NextResponse.json({ status: "rate_limited" }, { status: 429 });
    }

    // IP allowlist — block obvious spoofs at the door
    if (clientIp !== "unknown" && !PAYFAST_IPS.has(clientIp)) {
      console.error("PayFast notify from non-allowlisted IP:", clientIp);
      return NextResponse.json({ status: "error", reason: "ip not allowed" }, { status: 403 });
    }

    // Refuse to process anything if the passphrase isn't configured. Without
    // it we can't authenticate the request and would otherwise be marking
    // arbitrary orders as paid based on a POST body.
    if (!PAYFAST_PASSPHRASE) {
      console.error("PAYFAST_PASSPHRASE is not configured — rejecting ITN");
      return NextResponse.json({ status: "error", reason: "passphrase not configured" }, { status: 503 });
    }

    const body = await req.text();
    const params = new URLSearchParams(body);
    const data: Record<string, string> = {};
    params.forEach((value, key) => { data[key] = value; });

    // Verify signature (always required now)
    if (!data.signature || !verifySignature(data, data.signature)) {
      console.error("PayFast signature verification failed");
      return NextResponse.json({ status: "error", reason: "invalid signature" }, { status: 403 });
    }

    // Server-to-server validate — confirms the payload actually came from PayFast
    if (!(await payfastValidate(body))) {
      console.error("PayFast validate handshake failed");
      return NextResponse.json({ status: "error", reason: "validate failed" }, { status: 403 });
    }

    // Only proceed for completed payments
    if (data.payment_status !== "COMPLETE") {
      return NextResponse.json({ status: "ignored", reason: "payment not complete" });
    }

    const orderId = data.custom_str1;
    if (!orderId) {
      return NextResponse.json({ status: "error", reason: "no order id" }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Look up the order and verify the amount matches before flipping to paid.
    // Also gives us idempotency — we can refuse to re-process an already-paid order.
    const { data: order, error: lookupErr } = await supabase
      .from("orders")
      .select("id, total, payment_status, payfast_payment_id")
      .eq("id", orderId)
      .single();
    if (lookupErr || !order) {
      return NextResponse.json({ status: "error", reason: "order not found" }, { status: 404 });
    }

    if (order.payment_status === "paid") {
      return NextResponse.json({ status: "ok", note: "already paid" });
    }

    const amountGross = parseFloat(data.amount_gross || "0");
    const expected = Number(order.total) || 0;
    // 1 cent tolerance for float rounding on either side
    if (Math.abs(amountGross - expected) > 0.01) {
      console.error("PayFast amount mismatch", { orderId, expected, received: amountGross });
      return NextResponse.json({ status: "error", reason: "amount mismatch" }, { status: 409 });
    }

    const { error } = await supabase
      .from("orders")
      .update({
        payment_status: "paid",
        status: "confirmed",
        payfast_payment_id: data.pf_payment_id || null,
      })
      .eq("id", orderId)
      .eq("payment_status", "pending"); // idempotency: only update if still pending

    if (error) {
      console.error("Failed to update order:", error);
      return NextResponse.json({ status: "error", reason: error.message }, { status: 500 });
    }

    // Only now -- payment actually confirmed -- does the seller get the
    // "New Order Received!" email. (For EFT/WhatsApp orders this happens
    // synchronously at checkout instead, since there's no payment-gateway
    // confirmation step to wait for.)
    try {
      await fetch(new URL("/api/notify-order", req.nextUrl.origin), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
    } catch (notifyErr) {
      console.error("Failed to send order notification email:", notifyErr);
    }

    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error("PayFast notify error:", err);
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
}