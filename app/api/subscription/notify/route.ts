import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PAYFAST_PASSPHRASE = process.env.PAYFAST_PASSPHRASE || "";
const PAYFAST_IPS = new Set([
  "197.97.145.144", "197.97.145.145", "197.97.145.146", "197.97.145.147",
  "197.97.145.148", "197.97.145.149", "197.97.145.150", "197.97.145.151",
  "41.74.179.194", "41.74.179.195", "41.74.179.196", "41.74.179.197",
]);
const PAYFAST_VALIDATE_HOSTS = ["www.payfast.co.za", "sandbox.payfast.co.za"];

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
  for (const host of PAYFAST_VALIDATE_HOSTS) {
    try {
      const res = await fetch(`https://${host}/eng/query/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: rawBody,
      });
      if (res.ok && (await res.text()).trim() === "VALID") return true;
    } catch { /* try next */ }
  }
  return false;
}

// Rate limiting
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
function rateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 30) return false;
  entry.count++;
  return true;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(ip)) {
    return NextResponse.json({ status: "rate_limited" }, { status: 429 });
  }
  if (ip !== "unknown" && !PAYFAST_IPS.has(ip)) {
    console.error("Subscription notify from non-allowlisted IP:", ip);
    return NextResponse.json({ status: "error", reason: "ip not allowed" }, { status: 403 });
  }
  if (!PAYFAST_PASSPHRASE) {
    console.error("PAYFAST_PASSPHRASE is not configured — rejecting subscription ITN");
    return NextResponse.json({ status: "error", reason: "passphrase not configured" }, { status: 503 });
  }

  try {
    const body = await req.text();
    const params = new URLSearchParams(body);
    const data: Record<string, string> = {};
    params.forEach((value, key) => { data[key] = value; });

    if (!data.signature || !verifySignature(data, data.signature)) {
      console.error("Subscription notify signature verification failed");
      return NextResponse.json({ status: "error", reason: "invalid signature" }, { status: 403 });
    }
    if (!(await payfastValidate(body))) {
      console.error("Subscription notify validate handshake failed");
      return NextResponse.json({ status: "error", reason: "validate failed" }, { status: 403 });
    }

    const sellerId = data.custom_str1;
    const planId = data.custom_str2 || "starter";
    const paymentStatus = data.payment_status;
    const token = data.token;
    const amountGross = parseFloat(data.amount_gross || "0");

    if (!sellerId) {
      return NextResponse.json({ status: "error", reason: "no seller id" }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (paymentStatus === "COMPLETE") {

      // Work out which charge this is based on amount
      // R49 = first month after trial, R99+ = recurring
      const isFirstCharge = amountGross <= 49;
      const nextBillingDate = new Date();
      nextBillingDate.setDate(nextBillingDate.getDate() + 30);

      await supabase.from("sellers").update({
        subscription_status: "active",
        subscription_plan: planId,
        subscription_started_at: new Date().toISOString(),
        plan: planId,
        payfast_subscription_token: token || null,
        trial_ends_at: null, // Clear trial once active
      }).eq("id", sellerId);

      // If this was the R49 first charge, update PayFast subscription
      // to charge R99 from next cycle using their API
      if (isFirstCharge && token && planId === "starter") {
        try {
          const merchantId = process.env.PAYFAST_MERCHANT_ID!;
          const merchantKey = process.env.PAYFAST_MERCHANT_KEY!;

          // Update the subscription recurring amount to R99
          await fetch(`https://api.payfast.co.za/subscriptions/${token}/update`, {
            method: "PUT",
            headers: {
              "merchant-id": merchantId,
              "version": "v1",
              "timestamp": new Date().toISOString(),
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              cycles: 0,
              frequency: 3,
              run_date: nextBillingDate.toISOString().split("T")[0],
              amount: 9900, // R99 in cents
            }),
          });
        } catch (updateErr) {
          // Log but don't fail — seller is still activated
          console.error("Failed to update subscription to R99:", updateErr);
        }
      }

      return NextResponse.json({ status: "ok", action: "activated" });
    }

    if (paymentStatus === "CANCELLED") {
      await supabase.from("sellers").update({
        subscription_status: "expired",
      }).eq("id", sellerId);

      return NextResponse.json({ status: "ok", action: "cancelled" });
    }

    // FAILED payment
    if (paymentStatus === "FAILED") {
      await supabase.from("sellers").update({
        subscription_status: "expired",
      }).eq("id", sellerId);

      return NextResponse.json({ status: "ok", action: "failed" });
    }

    return NextResponse.json({ status: "ignored", payment_status: paymentStatus });

  } catch (err) {
    console.error("Subscription notify error:", err);
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
}