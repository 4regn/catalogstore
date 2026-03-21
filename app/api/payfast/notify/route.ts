import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PAYFAST_PASSPHRASE = process.env.PAYFAST_PASSPHRASE || "";

// Valid PayFast server IPs
const PAYFAST_IPS = [
  "197.97.145.144", "197.97.145.145", "197.97.145.146", "197.97.145.147",
  "197.97.145.148", "197.97.145.149", "197.97.145.150", "197.97.145.151",
  "41.74.179.194", "41.74.179.195", "41.74.179.196", "41.74.179.197",
];

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
    // Rate limit: max 30 webhook calls per minute
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!rateLimit("payfast-notify-" + clientIp, 30, 60000)) {
      return NextResponse.json({ status: "rate_limited" }, { status: 429 });
    }

    const body = await req.text();
    const params = new URLSearchParams(body);
    const data: Record<string, string> = {};
    params.forEach((value, key) => { data[key] = value; });

    // Verify signature
    if (data.signature && PAYFAST_PASSPHRASE) {
      if (!verifySignature(data, data.signature)) {
        console.error("PayFast signature verification failed");
        return NextResponse.json({ status: "error", reason: "invalid signature" }, { status: 403 });
      }
    }

    // Verify payment status
    if (data.payment_status !== "COMPLETE") {
      return NextResponse.json({ status: "ignored", reason: "payment not complete" });
    }

    const orderId = data.custom_str1;
    if (!orderId) {
      return NextResponse.json({ status: "error", reason: "no order id" }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { error } = await supabase
      .from("orders")
      .update({ payment_status: "paid", status: "confirmed" })
      .eq("id", orderId);

    if (error) {
      console.error("Failed to update order:", error);
      return NextResponse.json({ status: "error", reason: error.message }, { status: 500 });
    }

    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error("PayFast notify error:", err);
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
}