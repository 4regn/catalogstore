import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

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

  try {
    const body = await req.text();
    const params = new URLSearchParams(body);
    const data: Record<string, string> = {};
    params.forEach((value, key) => { data[key] = value; });

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

      // Work out which charge this is based on amount.
      // R49 = first promotional month after trial; anything higher = the recurring R149.
      const isFirstCharge = amountGross <= 49;
      const nextBillingDate = new Date();
      nextBillingDate.setDate(nextBillingDate.getDate() + 30);

      // Successful charge clears any grace period the seller may have been in.
      await supabase.from("sellers").update({
        subscription_status: "active",
        subscription_plan: planId,
        subscription_started_at: new Date().toISOString(),
        plan: planId,
        payfast_subscription_token: token || null,
        trial_ends_at: null, // Clear trial once active
        subscription_grace_until: null, // Clear grace -- payment recovered
      }).eq("id", sellerId);

      // If this was the R49 first charge, update the PayFast subscription so that from
      // the next cycle onwards we charge the full recurring R149/mo.
      if (isFirstCharge && token && planId === "starter") {
        try {
          const merchantId = process.env.PAYFAST_MERCHANT_ID!;
          const merchantKey = process.env.PAYFAST_MERCHANT_KEY!;

          // Update the subscription recurring amount to R149.
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
              amount: 14900, // R149 in cents
            }),
          });
        } catch (updateErr) {
          // Log but don't fail — seller is still activated, we'll catch up later.
          console.error("Failed to update subscription to R149:", updateErr);
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

    // FAILED payment -- start (or keep) 7-day grace period instead of freezing immediately.
    // PayFast will keep retrying automatically; if a retry succeeds, the COMPLETE branch
    // above clears the grace. If 7 days pass with no success, the daily cron flips the
    // seller to 'expired' and freezes the storefront.
    if (paymentStatus === "FAILED") {
      // Only set grace_until on the FIRST failure of this billing cycle. If the seller
      // is already past_due, leave the original grace window intact so retries don't
      // keep extending the deadline.
      const { data: existing } = await supabase
        .from("sellers")
        .select("subscription_status, subscription_grace_until")
        .eq("id", sellerId)
        .maybeSingle();

      if (existing?.subscription_status === "past_due" && existing.subscription_grace_until) {
        // Already in grace; nothing to do.
        return NextResponse.json({ status: "ok", action: "failed_already_grace" });
      }

      const graceUntil = new Date();
      graceUntil.setDate(graceUntil.getDate() + 7);

      await supabase.from("sellers").update({
        subscription_status: "past_due",
        subscription_grace_until: graceUntil.toISOString(),
      }).eq("id", sellerId);

      return NextResponse.json({ status: "ok", action: "past_due" });
    }

    return NextResponse.json({ status: "ignored", payment_status: paymentStatus });

  } catch (err) {
    console.error("Subscription notify error:", err);
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
}