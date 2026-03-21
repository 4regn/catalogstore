import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PAYFAST_PASSPHRASE = process.env.PAYFAST_PASSPHRASE || "";

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
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!rateLimit("sub-notify-" + clientIp, 30, 60000)) {
      return NextResponse.json({ status: "rate_limited" }, { status: 429 });
    }

    const body = await req.text();
    const params = new URLSearchParams(body);
    const data: Record<string, string> = {};
    params.forEach((value, key) => { data[key] = value; });

    // Verify signature
    if (data.signature && PAYFAST_PASSPHRASE) {
      if (!verifySignature(data, data.signature)) {
        console.error("Subscription webhook signature verification failed");
        return NextResponse.json({ status: "error", reason: "invalid signature" }, { status: 403 });
      }
    }

    const sellerId = data.custom_str1;
    const planId = data.custom_str2;
    const paymentStatus = data.payment_status;
    const token = data.token;

    if (!sellerId) {
      return NextResponse.json({ status: "error", reason: "no seller id" }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (paymentStatus === "COMPLETE") {
      await supabase.from("sellers").update({
        subscription_status: "active",
        subscription_plan: planId || "starter",
        subscription_started_at: new Date().toISOString(),
        plan: planId || "starter",
        payfast_subscription_token: token || null,
      }).eq("id", sellerId);

      return NextResponse.json({ status: "ok", action: "activated" });
    }

    if (paymentStatus === "CANCELLED") {
      await supabase.from("sellers").update({
        subscription_status: "expired",
      }).eq("id", sellerId);

      return NextResponse.json({ status: "ok", action: "cancelled" });
    }

    return NextResponse.json({ status: "ignored", payment_status: paymentStatus });
  } catch (err) {
    console.error("Subscription notify error:", err);
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
}