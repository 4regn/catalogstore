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
      await supabase.from("sellers").update({
        subscription_status: "active",
        subscription_plan: planId,
        subscription_started_at: new Date().toISOString(),
        plan: planId,
        payfast_subscription_token: token || null,
        trial_ends_at: null,
        subscription_grace_until: null,
      }).eq("id", sellerId);

      /* Affiliate commission: 50% of each payment from a referred seller,
         for that seller's first 6 paid months. Idempotent via the unique
         pf_payment_id on affiliate_commission_events — PayFast may retry
         the same ITN, but the second insert conflicts and we skip. */
      if (amountGross > 0) {
        try {
          const { data: referral } = await supabase
            .from("affiliate_referrals")
            .select("id, affiliate_id, payments_counted, total_earned_from_seller, first_payment_at")
            .eq("seller_id", sellerId)
            .maybeSingle();

          if (referral && (referral.payments_counted || 0) < 6) {
            const pfPaymentId = data.pf_payment_id || data.m_payment_id + "-" + (data.billing_date || new Date().toISOString().split("T")[0]);
            const commissionCents = Math.round(amountGross * 100 * 0.5);

            const { error: eventErr } = await supabase.from("affiliate_commission_events").insert({
              affiliate_id: referral.affiliate_id,
              referral_id: referral.id,
              seller_id: sellerId,
              pf_payment_id: pfPaymentId,
              amount_gross_cents: Math.round(amountGross * 100),
              commission_cents: commissionCents,
            });

            // Unique-violation (or any insert failure) = already processed; skip accrual.
            if (!eventErr) {
              const nowIso = new Date().toISOString();
              await supabase.from("affiliate_referrals").update({
                status: "active",
                payments_counted: (referral.payments_counted || 0) + 1,
                total_earned_from_seller: (referral.total_earned_from_seller || 0) + commissionCents,
                first_payment_at: referral.first_payment_at || nowIso,
                last_payment_at: nowIso,
                last_payment_status: "complete",
              }).eq("id", referral.id);

              const { data: aff } = await supabase
                .from("affiliates")
                .select("pending_balance, total_earned")
                .eq("id", referral.affiliate_id)
                .maybeSingle();
              if (aff) {
                await supabase.from("affiliates").update({
                  pending_balance: (aff.pending_balance || 0) + commissionCents,
                  total_earned: (aff.total_earned || 0) + commissionCents,
                }).eq("id", referral.affiliate_id);
              }
            }
          }
        } catch (commErr) {
          // Never fail the ITN over commission bookkeeping — seller is already activated.
          console.error("Affiliate commission accrual failed:", commErr);
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