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

const PLANS: Record<string, { name: string; firstAmount: number; recurringAmount: number; trialDays: number }> = {
  starter: {
    name: "Starter",
    firstAmount: 49.00,      // R49 after 7-day trial
    recurringAmount: 99.00,  // R99 every month after
    trialDays: 7,
  },
  pro: {
    name: "Pro",
    firstAmount: 249.00,     // R249 after 7-day trial
    recurringAmount: 249.00, // R249 every month after
    trialDays: 7,
  },
};

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(ip)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  try {
    const { sellerId, planId, returnOrigin } = await req.json();

    if (!sellerId || !planId) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const plan = PLANS[planId];
    if (!plan) {
      return NextResponse.json({ error: "Invalid plan." }, { status: 400 });
    }

    // Get seller details from Supabase (server side — keys never exposed)
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: seller, error } = await supabase
      .from("sellers")
      .select("id, email, store_name")
      .eq("id", sellerId)
      .single();

    if (error || !seller) {
      return NextResponse.json({ error: "Seller not found." }, { status: 404 });
    }

    const merchantId = process.env.PAYFAST_MERCHANT_ID!;
    const merchantKey = process.env.PAYFAST_MERCHANT_KEY!;
    const origin = returnOrigin || "https://catalogstore.co.za";

    // Calculate billing date — first charge after 7-day trial
    const billingDate = new Date();
    billingDate.setDate(billingDate.getDate() + plan.trialDays);
    const billingDateStr = billingDate.toISOString().split("T")[0]; // YYYY-MM-DD

    const fields: Record<string, string> = {
      merchant_id: merchantId,
      merchant_key: merchantKey,

      // R0 today — free trial, first charge hits on billing_date
      amount: "0.00",

      item_name: `CatalogStore ${plan.name} Plan`,
      item_description: planId === "starter"
        ? `7-day free trial, then R49 first month, then R99/month. Cancel anytime.`
        : `7-day free trial, then R249/month. Cancel anytime.`,

      name_first: seller.store_name || "Seller",
      email_address: seller.email,
      m_payment_id: seller.id,
      custom_str1: seller.id,
      custom_str2: planId,

      return_url: `${origin}/dashboard/billing?status=success&plan=${planId}`,
      cancel_url: `${origin}/dashboard/billing?status=cancelled`,
      notify_url: `${origin}/api/subscription/notify`,

      // Subscription settings — 7-day trial then R49, then R99
      subscription_type: "1",                              // Recurring subscription
      recurring_amount: plan.firstAmount.toFixed(2),       // R49 first charge after trial
      frequency: "3",                                      // Monthly
      cycles: "0",                                         // Never stops
      billing_date: billingDateStr,                        // First charge after 7-day trial
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
              .map(([k, v]) => `<input type="hidden" name="${k}" value="${v.replace(/"/g, "&quot;")}" />`)
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