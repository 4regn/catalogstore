import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { sellerId, planId, returnOrigin } = await req.json();
    if (!sellerId || !planId) return NextResponse.json({ error: "Missing data" }, { status: 400 });

    const { data: seller } = await supabase.from("sellers").select("id, email, store_name").eq("id", sellerId).single();
    if (!seller) return NextResponse.json({ error: "Seller not found" }, { status: 404 });

    const merchantId = process.env.PAYFAST_MERCHANT_ID;
    const merchantKey = process.env.PAYFAST_MERCHANT_KEY;
    if (!merchantId || !merchantKey) return NextResponse.json({ error: "Payment not configured" }, { status: 500 });

    const isPromo = true; // Launch promo active
    const plans: Record<string, { name: string; price: number; promoPrice?: number }> = {
      starter: { name: "Starter", price: 99, promoPrice: 49 },
      pro: { name: "Pro", price: 249 },
    };
    const plan = plans[planId];
    if (!plan) return NextResponse.json({ error: "Invalid plan" }, { status: 400 });

    const recurringAmount = (isPromo && plan.promoPrice) ? plan.promoPrice : plan.price;
    const origin = returnOrigin || "https://catalogstore.co.za";

    const fields: Record<string, string> = {
      merchant_id: merchantId,
      merchant_key: merchantKey,
      amount: planId === "starter" ? "1.00" : recurringAmount.toFixed(2),
      item_name: planId === "starter" ? "CatalogStore " + plan.name + " - Card Verification" : "CatalogStore " + plan.name + " Plan",
      item_description: planId === "starter" ? "R1 verification. " + plan.name + " plan R" + recurringAmount + "/mo starts after 7-day trial." : plan.name + " plan - R" + recurringAmount + "/mo",
      name_first: seller.store_name,
      email_address: seller.email,
      m_payment_id: seller.id,
      custom_str1: seller.id,
      custom_str2: planId,
      return_url: origin + "/dashboard/billing?status=success&plan=" + planId,
      cancel_url: origin + "/dashboard/billing?status=cancelled",
      notify_url: origin + "/api/subscription/notify",
      subscription_type: "1",
      recurring_amount: recurringAmount.toFixed(2),
      frequency: "3",
      cycles: "0",
    };

    const formHtml = `
      <!DOCTYPE html>
      <html>
        <head><title>Redirecting to PayFast...</title></head>
        <body style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:#030303;font-family:sans-serif;color:#fff;margin:0">
          <div style="text-align:center">
            <p style="font-size:16px;margin-bottom:12px">Redirecting to PayFast...</p>
            <p style="font-size:13px;color:rgba(255,255,255,0.4)">Please wait</p>
          </div>
          <form id="pf" method="POST" action="https://www.payfast.co.za/eng/process">
            ${Object.entries(fields).map(([k, v]) => `<input type="hidden" name="${k}" value="${v.replace(/"/g, "&quot;")}" />`).join("\n")}
          </form>
          <script>document.getElementById("pf").submit();</script>
        </body>
      </html>
    `;

    return new NextResponse(formHtml, { headers: { "Content-Type": "text/html" } });
  } catch (err) {
    console.error("Billing redirect error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
