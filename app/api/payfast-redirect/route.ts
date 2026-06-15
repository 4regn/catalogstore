import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientIP } from "../../../lib/rate-limit";
import { getAdmin } from "../../../lib/supabase-admin";
const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || "https://catalogstore.co.za";

/* Strict HTML attribute escaping — the previous version only handled `"`,
   so a seller's store_name or a customer's name containing < / > / &
   could break out of the value="" context and inject markup on a
   money-handling page. */
function escAttr(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* return/cancel/notify URLs are server-determined, but we still let the
   browser tell us its current origin for sub-domain support. Validate
   the origin matches the configured app domain or a permitted subdomain
   (*.catalogstore.co.za, localhost for dev). Anything else is dropped
   and APP_ORIGIN is used. Previously an attacker could set notify_url
   to their own host. */
function safeOrigin(raw: unknown): string {
  if (typeof raw !== "string") return APP_ORIGIN;
  try {
    const u = new URL(raw);
    const host = u.host.toLowerCase();
    const allowed = new URL(APP_ORIGIN).host.toLowerCase();
    if (host === allowed) return u.origin;
    if (host.endsWith("." + allowed)) return u.origin;
    if (host === "localhost" || host.startsWith("localhost:") || host.startsWith("127.0.0.1")) return u.origin;
    return APP_ORIGIN;
  } catch {
    return APP_ORIGIN;
  }
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIP(req);
    const rl = rateLimit("pf-redirect:" + ip, 5, 60);
    if (!rl.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    const { orderId, slug, firstName, lastName, email, phone, returnOrigin } = await req.json();
    if (!orderId || !slug) return NextResponse.json({ error: "Missing data" }, { status: 400 });

    // Get seller checkout config server-side (never exposed to client)
    const { data: seller } = await getAdmin().from("sellers").select("id, checkout_config, store_name").eq("subdomain", slug).single();
    if (!seller) return NextResponse.json({ error: "Seller not found" }, { status: 404 });

    const { data: order } = await getAdmin().from("orders").select("*").eq("id", orderId).single();
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    // Verify order belongs to this seller
    if (order.seller_id !== seller.id) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    /* Refuse to redirect for an order that's already paid or completed.
       Without this check an attacker could replay /api/payfast-redirect for
       any past order (their own or someone else's once orderId is known),
       producing a fresh PayFast form for an already-fulfilled order. */
    if (order.payment_status === "paid" || order.status === "confirmed" || order.status === "delivered" || order.status === "cancelled") {
      return NextResponse.json({ error: "Order is not eligible for payment" }, { status: 409 });
    }

    const cartEncoded = Buffer.from(JSON.stringify(order.items || [])).toString("base64");

    const cc = seller.checkout_config as any;
    if (!cc?.payfast_enabled || !cc?.payfast_merchant_id || !cc?.payfast_merchant_key) {
      return NextResponse.json({ error: "PayFast not configured" }, { status: 400 });
    }

    const origin = safeOrigin(returnOrigin);

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
      /* notify_url is always our own configured APP_ORIGIN, not derived
         from the request — defense against attackers setting their own
         host as the ITN destination. */
      notify_url: APP_ORIGIN + "/api/payfast/notify",
      custom_str1: orderId,
    };

    // Build auto-submit HTML form (merchant key never exposed to JS)
    const formHtml = `<!DOCTYPE html>
<html>
  <head><title>Redirecting to PayFast...</title><meta name="viewport" content="width=device-width, initial-scale=1"></head>
  <body style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:#030305;font-family:sans-serif;color:#fff;margin:0">
    <div style="text-align:center">
      <p style="font-size:16px;margin-bottom:12px">Redirecting to PayFast...</p>
      <p style="font-size:13px;color:rgba(255,255,255,0.4)">Please wait</p>
    </div>
    <form id="pf" method="POST" action="https://www.payfast.co.za/eng/process">
      ${Object.entries(fields).map(([k, v]) => `<input type="hidden" name="${escAttr(k)}" value="${escAttr(v)}" />`).join("\n      ")}
    </form>
    <script>document.getElementById("pf").submit();</script>
  </body>
</html>`;

    return new NextResponse(formHtml, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    console.error("PayFast redirect error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}