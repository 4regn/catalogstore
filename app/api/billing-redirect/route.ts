import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
  if (entry.count >= 5) return false;
  entry.count++;
  return true;
}

// Pre-launch: a single tier with everything included. Keeping the 'starter' key for
// backwards-compat with any existing references; the marketing page now calls it
// 'Catalogstore Plan'. Pro tier removed -- the Pro features got merged into Starter
// (all templates, custom domain support, no 'Powered by CatalogStore' badge, personal
// onboarding). When we have proof we can sell, we can add a higher tier back.
const PLANS: Record<string, { name: string; recurringAmount: number; trialDays: number }> = {
  starter: {
    name: "Catalogstore",
    recurringAmount: 149.00,
    trialDays: 14,
  },
};

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(ip)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  try {
    const { sellerId, planId, returnOrigin, intent } = await req.json();

    if (!sellerId || !planId) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const plan = PLANS[planId];
    if (!plan) {
      return NextResponse.json({ error: "Invalid plan." }, { status: 400 });
    }

    const isReactivation = intent === "reactivate";

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: seller, error } = await supabase
      .from("sellers")
      .select("id, email, store_name, trial_ends_at")
      .eq("id", sellerId)
      .single();

    if (error || !seller) {
      return NextResponse.json({ error: "Seller not found." }, { status: 404 });
    }

    const merchantId = process.env.PAYFAST_MERCHANT_ID!;
    const merchantKey = process.env.PAYFAST_MERCHANT_KEY!;
    const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || "https://catalogstore.co.za";
    const safeOrigin = (raw: unknown): string => {
      if (typeof raw !== "string") return APP_ORIGIN;
      try {
        const u = new URL(raw);
        const host = u.host.toLowerCase();
        const allowed = new URL(APP_ORIGIN).host.toLowerCase();
        if (host === allowed) return u.origin;
        if (host.endsWith("." + allowed)) return u.origin;
        if (host === "localhost" || host.startsWith("localhost:") || host.startsWith("127.0.0.1")) return u.origin;
        return APP_ORIGIN;
      } catch { return APP_ORIGIN; }
    };
    const escAttr = (v: unknown): string => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    const origin = safeOrigin(returnOrigin);

    // Reactivation: charge R149 today. New signup during trial: R0 today,
    // first R149 charge after trial ends.
    const billingDate = new Date();
    if (!isReactivation) {
      if (seller.trial_ends_at) {
        const trialEnd = new Date(seller.trial_ends_at);
        if (trialEnd > billingDate) billingDate.setTime(trialEnd.getTime());
        else billingDate.setDate(billingDate.getDate() + plan.trialDays);
      } else {
        billingDate.setDate(billingDate.getDate() + plan.trialDays);
      }
    }
    const billingDateStr = billingDate.toISOString().split("T")[0];

    const todayAmount = isReactivation ? plan.recurringAmount.toFixed(2) : "0.00";
    const recurringAmount = plan.recurringAmount.toFixed(2);
    const itemName = `CatalogStore — R${plan.recurringAmount.toFixed(0)}/month`;
    const itemDescription = isReactivation
      ? `R${plan.recurringAmount.toFixed(0)}/month subscription. Cancel anytime from your dashboard.`
      : `14-day free trial (R0 today). After the trial, R${plan.recurringAmount.toFixed(0)}/month. Cancel anytime from your dashboard.`;

    const fields: Record<string, string> = {
      merchant_id: merchantId,
      merchant_key: merchantKey,

      amount: todayAmount,

      item_name: itemName,
      item_description: itemDescription,

      name_first: seller.store_name || "Seller",
      email_address: seller.email,
      m_payment_id: seller.id,
      custom_str1: seller.id,
      custom_str2: planId,
      custom_str3: isReactivation ? "reactivate" : "signup",

      return_url: `${origin}/dashboard/billing?status=success&plan=${planId}`,
      cancel_url: `${origin}/dashboard/billing?status=cancelled`,
      /* notify_url is always our configured APP_ORIGIN, not derived from
         the browser request, so the PayFast ITN can't be redirected to
         an attacker-controlled host. */
      notify_url: `${APP_ORIGIN}/api/subscription/notify`,

      // Subscription settings
      subscription_type: "1",                              // Recurring subscription
      recurring_amount: recurringAmount,
      frequency: "3",                                      // Monthly
      cycles: "0",                                         // Never stops
      billing_date: billingDateStr,
    };

    // Build the auto-submitting PayFast form
    const formHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Redirecting to PayFast...</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
        </head>
        <body style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:#030303;font-family:sans-serif;color:#fff;margin:0;flex-direction:column;gap:16px">
          <svg width="40" height="40" viewBox="0 0 72 72" fill="none">
            <path d="M54 12 A26 26 0 1 0 54 60" stroke="#ff6b35" stroke-width="9" stroke-linecap="round" fill="none"/>
            <circle cx="57" cy="36" r="6" fill="#ff6b35"/>
          </svg>
          <p style="font-size:16px;font-weight:600;margin:0">Redirecting to PayFast...</p>
          <p style="font-size:13px;color:rgba(255,255,255,0.4);margin:0">Please wait</p>
          <form id="pf" method="POST" action="https://www.payfast.co.za/eng/process">
            ${Object.entries(fields)
              .map(([k, v]) => `<input type="hidden" name="${escAttr(k)}" value="${escAttr(v)}" />`)
              .join("\n            ")}
          </form>
          <script>document.getElementById("pf").submit();</script>
        </body>
      </html>
    `;

    return new NextResponse(formHtml, {
      headers: { "Content-Type": "text/html" },
    });

  } catch (err) {
    console.error("Billing redirect error:", err);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}