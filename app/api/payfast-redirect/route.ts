import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { orderId, slug, firstName, lastName, email, phone, returnOrigin } = await req.json();
    if (!orderId || !slug) return NextResponse.json({ error: "Missing data" }, { status: 400 });

    // Get seller checkout config server-side (never exposed to client)
    const { data: seller } = await supabase.from("sellers").select("checkout_config, store_name").eq("subdomain", slug).single();
    if (!seller) return NextResponse.json({ error: "Seller not found" }, { status: 404 });

    const { data: order } = await supabase.from("orders").select("*").eq("id", orderId).single();
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    const cartEncoded = Buffer.from(JSON.stringify(order.items || [])).toString("base64");

    const cc = seller.checkout_config as any;
    if (!cc?.payfast_enabled || !cc?.payfast_merchant_id || !cc?.payfast_merchant_key) {
      return NextResponse.json({ error: "PayFast not configured" }, { status: 400 });
    }

    const origin = returnOrigin || "https://catalogstore.co.za";

    const fields: Record<string, string> = {
      merchant_id: cc.payfast_merchant_id,
      merchant_key: cc.payfast_merchant_key,
      amount: order.total.toFixed(2),
      item_name: "Order from " + seller.store_name,
      name_first: firstName || "",
      name_last: lastName || "",
      email_address: email || "",
      cell_number: phone || "",
      return_url: origin + "/store/" + slug + "/checkout?paid=" + orderId,
      cancel_url: origin + "/store/" + slug + "/checkout?cancelled=1&cart=" + cartEncoded,
      notify_url: origin + "/api/payfast/notify",
      custom_str1: orderId,
    };

    // Build auto-submit HTML form (merchant key never exposed to JS)
    const formHtml = `
      <!DOCTYPE html>
      <html>
        <head><title>Redirecting to PayFast...</title></head>
        <body style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:#030305;font-family:sans-serif;color:#fff;margin:0">
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

    return new NextResponse(formHtml, {
      headers: { "Content-Type": "text/html" },
    });
  } catch (err) {
    console.error("PayFast redirect error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}