import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientIP } from "../../../lib/rate-limit";
import { getAdmin } from "../../../lib/supabase-admin";
import { canonicalStoreUrl } from "../../../lib/store-url";
import { sendOrderPushToSeller } from "../../../lib/push-notify";
import { FOUR_REGN_ACCOUNT_URL, FOUR_REGN_TRACKING_URL, fourRegnOrderReference } from "../../../lib/four-regn-orders";
import { getFourRegnResendFrom } from "../../../lib/email";
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIP(req);
    const rl = rateLimit("notify:" + ip, 10, 60);
    if (!rl.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    const { orderId } = await req.json();
    if (!orderId) return NextResponse.json({ error: "Missing data" }, { status: 400 });

    // Look up the order first; the seller is whoever owns the order, not
    // whoever the client says it is. (Previously this trusted a sellerId
    // from the request body and used it for "authorization" — meaningless.)
    const { data: order } = await getAdmin().from("orders").select("*").eq("id", orderId).single();
    if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { data: seller } = await getAdmin().from("sellers").select("*").eq("id", order.seller_id).single();
    if (!seller) return NextResponse.json({ error: "Seller not found" }, { status: 404 });

    const isFourRegn = seller.subdomain === "4regn";
    const displayOrderNumber = isFourRegn ? fourRegnOrderReference(order) : `#${order.order_number}`;

    const items = (order.items || []).map((i: any) => `${i.name} x${i.qty} — R${(i.price * i.qty).toFixed(0)}${i.variant ? " (" + i.variant + ")" : ""}`).join("\n");
    const orderSummary = `New Order ${displayOrderNumber}\n\nCustomer: ${order.customer_name}\nEmail: ${order.customer_email || "N/A"}\nPhone: ${order.customer_phone || "N/A"}\n\nItems:\n${items}\n\nShipping: R${order.shipping_cost || 0}\nTotal: R${order.total}\n\nPayment: ${order.payment_method?.toUpperCase() || "N/A"}\nFulfillment: ${order.fulfillment_method || "delivery"}${order.shipping_address ? "\nAddress: " + order.shipping_address.address + ", " + order.shipping_address.city + ", " + order.shipping_address.province : ""}`;

    // 1. Send email notification via Resend (if API key exists)
    const resendKey = isFourRegn ? process.env.FOUR_REGN_RESEND_API_KEY : process.env.RESEND_API_KEY;
    const resendFrom = isFourRegn
      ? getFourRegnResendFrom()
      : (process.env.RESEND_FROM_EMAIL || "CatalogStore <orders@catalogstore.co.za>");
    if (resendKey && seller.email) {
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: resendFrom,
            to: [seller.email],
            subject: `New Order ${displayOrderNumber} — R${order.total}`,
            html: `
              <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; background: #030303; color: #f5f5f5; border-radius: 12px; overflow: hidden;">
                <div style="padding: 24px 28px; background: linear-gradient(135deg, #ff6b35, #ff3d6e);">
                  <h1 style="margin: 0; font-size: 20px; font-weight: 800; color: #fff;">New Order Received!</h1>
                </div>
                <div style="padding: 28px;">
                  <div style="margin-bottom: 20px;">
                    <span style="font-size: 28px; font-weight: 900;">Order ${displayOrderNumber}</span>
                    <span style="display: block; font-size: 14px; color: rgba(245,245,245,0.4); margin-top: 4px;">${new Date(order.created_at).toLocaleString()}</span>
                  </div>
                  <div style="padding: 20px; background: rgba(255,255,255,0.04); border-radius: 12px; margin-bottom: 16px;">
                    <h3 style="font-size: 12px; color: #ff6b35; text-transform: uppercase; letter-spacing: 0.08em; margin: 0 0 12px;">Customer</h3>
                    <p style="margin: 0; font-size: 15px;">${order.customer_name}</p>
                    ${order.customer_email ? `<p style="margin: 4px 0 0; font-size: 13px; color: rgba(245,245,245,0.5);">${order.customer_email}</p>` : ""}
                    ${order.customer_phone ? `<p style="margin: 4px 0 0; font-size: 13px; color: rgba(245,245,245,0.5);">${order.customer_phone}</p>` : ""}
                  </div>
                  <div style="padding: 20px; background: rgba(255,255,255,0.04); border-radius: 12px; margin-bottom: 16px;">
                    <h3 style="font-size: 12px; color: #ff6b35; text-transform: uppercase; letter-spacing: 0.08em; margin: 0 0 12px;">Items</h3>
                    ${(order.items || []).map((i: any) => `<div style="display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.04);">${i.image ? `<img src="${i.image}" alt="" style="width: 48px; height: 56px; border-radius: 6px; object-fit: cover; flex-shrink: 0;" />` : `<div style="width: 48px; height: 56px; border-radius: 6px; background: rgba(255,255,255,0.06); flex-shrink: 0;"></div>`}<div style="flex: 1;"><span style="display: block; font-size: 14px;">${i.name} x${i.qty}</span>${i.variant ? `<span style="font-size: 12px; color: rgba(245,245,245,0.4);">${i.variant}</span>` : ""}</div><span style="font-weight: 700; white-space: nowrap;">R${(i.price * i.qty).toFixed(0)}</span></div>`).join("")}
                    ${order.shipping_cost > 0 ? `<div style="display: flex; justify-content: space-between; padding: 8px 0; color: rgba(245,245,245,0.4);"><span>Shipping</span><span>R${order.shipping_cost}</span></div>` : ""}
                    <div style="display: flex; justify-content: space-between; padding: 12px 0 0; border-top: 1px solid rgba(255,255,255,0.08); font-size: 20px; font-weight: 900;"><span>Total</span><span>R${order.total}</span></div>
                  </div>
                  <div style="padding: 16px 20px; background: rgba(255,255,255,0.04); border-radius: 12px;">
                    <span style="font-size: 11px; text-transform: uppercase; color: rgba(245,245,245,0.3); letter-spacing: 0.06em;">Payment: ${order.payment_method?.toUpperCase()}</span>
                    <span style="font-size: 11px; text-transform: uppercase; color: rgba(245,245,245,0.3); letter-spacing: 0.06em; margin-left: 16px;">Fulfillment: ${order.fulfillment_method}</span>
                  </div>
                  <a href="https://catalogstore.co.za/dashboard" style="display: block; text-align: center; margin-top: 24px; padding: 16px; background: linear-gradient(135deg, #ff6b35, #ff3d6e); color: #fff; border-radius: 100px; text-decoration: none; font-weight: 800; font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em;">View Order in Dashboard</a>
                </div>
              </div>
            `,
          }),
        });
      } catch (emailErr) {
        console.error("Email notification failed:", emailErr);
      }
    }

    // 2. Send confirmation email to CUSTOMER
    if (resendKey && order.customer_email) {
      try {
        const storeUrl = canonicalStoreUrl(seller.subdomain);
        const trackingUrl = isFourRegn ? FOUR_REGN_TRACKING_URL : canonicalStoreUrl(seller.subdomain, "/track");
        const accountUrl = isFourRegn ? FOUR_REGN_ACCOUNT_URL : canonicalStoreUrl(seller.subdomain, "/account");
        const accent = seller.primary_color || "#ff6b35";
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: resendFrom,
            to: [order.customer_email],
            subject: `Order Confirmed — ${displayOrderNumber}`,
            html: `
              <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; background: #fafafa; border-radius: 12px; overflow: hidden;">
                <div style="padding: 28px; background: #fff; text-align: center; border-bottom: 1px solid #eee;">
                  ${seller.logo_url ? `<img src="${seller.logo_url}" alt="${seller.store_name}" style="height: 40px; margin-bottom: 16px;" />` : `<h2 style="margin: 0 0 8px; font-size: 22px; font-weight: 300; letter-spacing: 0.06em; text-transform: uppercase;">${seller.store_name}</h2>`}
                </div>
                <div style="padding: 32px 28px;">
                  <div style="text-align: center; margin-bottom: 28px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 auto 16px;"><tr><td style="width: 64px; height: 64px; border-radius: 50%; background: #22c55e; text-align: center; vertical-align: middle; font-size: 28px; color: #fff; box-shadow: 0 0 20px rgba(34,197,94,0.4), 0 0 40px rgba(34,197,94,0.15);">&#10003;</td></tr></table>
                    <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #2a2a2e;">Order Confirmed!</h1>
                    <p style="margin: 8px 0 0; color: #8a8690; font-size: 14px;">Thank you for your order, ${order.customer_name}.</p>
                    <p style="margin: 4px 0 0; color: #8a8690; font-size: 13px;">Order ${displayOrderNumber}</p>
                  </div>
                  <div style="background: #fff; border-radius: 12px; padding: 20px; border: 1px solid #eee; margin-bottom: 16px;">
                    <h3 style="font-size: 12px; color: ${accent}; text-transform: uppercase; letter-spacing: 0.08em; margin: 0 0 12px;">Order Details</h3>
                    ${(order.items || []).map((i: any) => `<div style="display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid #f0f0f0;">${i.image ? `<img src="${i.image}" alt="" style="width: 48px; height: 56px; border-radius: 8px; object-fit: cover; flex-shrink: 0; border: 1px solid #eee;" />` : `<div style="width: 48px; height: 56px; border-radius: 8px; background: #f0f0f0; flex-shrink: 0;"></div>`}<div style="flex: 1;"><span style="display: block; font-size: 14px; color: #2a2a2e;">${i.name} x${i.qty}</span>${i.variant ? `<span style="font-size: 12px; color: #8a8690;">${i.variant}</span>` : ""}</div><span style="font-weight: 600; font-size: 14px; color: #2a2a2e; white-space: nowrap;">R${(i.price * i.qty).toFixed(0)}</span></div>`).join("")}
                    ${order.shipping_cost > 0 ? `<div style="display: flex; justify-content: space-between; padding: 10px 0; font-size: 14px; color: #8a8690;"><span>Shipping</span><span>R${order.shipping_cost}</span></div>` : ""}
                    <div style="display: flex; justify-content: space-between; padding: 14px 0 0; border-top: 2px solid #eee; margin-top: 4px; font-size: 18px; font-weight: 700; color: #2a2a2e;"><span>Total</span><span>R${order.total}</span></div>
                  </div>
                  ${order.fulfillment_method === "delivery" && order.shipping_address ? `
                  <div style="background: #fff; border-radius: 12px; padding: 20px; border: 1px solid #eee; margin-bottom: 16px;">
                    <h3 style="font-size: 12px; color: ${accent}; text-transform: uppercase; letter-spacing: 0.08em; margin: 0 0 8px;">Delivery Address</h3>
                    <p style="margin: 0; font-size: 14px; color: #2a2a2e; line-height: 1.6;">${order.shipping_address.address}${order.shipping_address.apartment ? ", " + order.shipping_address.apartment : ""}<br/>${order.shipping_address.city}, ${order.shipping_address.province}<br/>${order.shipping_address.postal_code || ""}</p>
                  </div>` : ""}
                  ${order.payment_method === "eft" ? `
                  <div style="background: #fff; border-radius: 12px; padding: 20px; border: 1px solid #eee; margin-bottom: 16px;">
                    <h3 style="font-size: 12px; color: ${accent}; text-transform: uppercase; letter-spacing: 0.08em; margin: 0 0 8px;">Payment: EFT / Direct Deposit</h3>
                    <p style="margin: 0; font-size: 13px; color: #8a8690;">Please complete your payment using the banking details provided at checkout. Reference your order number <strong>${displayOrderNumber}</strong>.</p>
                  </div>` : `
                  <div style="background: #fff; border-radius: 12px; padding: 20px; border: 1px solid #eee; margin-bottom: 16px;">
                    <h3 style="font-size: 12px; color: #22c55e; text-transform: uppercase; letter-spacing: 0.08em; margin: 0 0 8px;">Payment Received</h3>
                    <p style="margin: 0; font-size: 13px; color: #8a8690;">Your payment via PayFast has been received. Your order is being processed.</p>
                  </div>`}
                  ${isFourRegn ? `<div style="background:#eef6ef;border:1px solid #d6ead8;border-radius:12px;padding:20px;margin-bottom:16px;"><h3 style="font-size:12px;color:#177533;text-transform:uppercase;letter-spacing:.08em;margin:0 0 8px;">Track your order</h3><p style="margin:0 0 16px;font-size:13px;color:#5f6c61;line-height:1.65;">Use order number <strong>${displayOrderNumber}</strong> with the email address or mobile number used at checkout. You can type the order number with or without the # and D.</p><a href="${trackingUrl}" style="display:block;text-align:center;padding:15px;background:#111;color:#fff;border-radius:100px;text-decoration:none;font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:.08em;">Track Order</a></div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;"><tr><td style="padding-right:6px;"><a href="${accountUrl}" style="display:block;text-align:center;padding:14px;border:1px solid #2a2a2e;color:#2a2a2e;border-radius:100px;text-decoration:none;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.06em;">View My Account</a></td><td style="padding-left:6px;"><a href="${storeUrl}" style="display:block;text-align:center;padding:14px;border:1px solid #d8d8d4;color:#2a2a2e;border-radius:100px;text-decoration:none;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.06em;">Continue Shopping</a></td></tr></table>` : `<a href="${storeUrl}" style="display: block; text-align: center; padding: 16px; background: #2a2a2e; color: #fff; border-radius: 100px; text-decoration: none; font-weight: 600; font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em;">Continue Shopping</a>`}
                  ${seller.whatsapp_number ? `<p style="text-align: center; margin-top: 16px; font-size: 13px; color: #8a8690;">Questions? WhatsApp us at ${seller.whatsapp_number}</p>` : ""}
                </div>
              </div>
            `,
          }),
        });
      } catch (custErr) {
        console.error("Customer email failed:", custErr);
      }
    }

    // 3. Push notification to the seller's dashboard (real OS-level popup,
    // not just the in-tab Realtime toast) -- see lib/push-notify.ts. Never
    // allowed to block/fail this route; it already no-ops quietly if VAPID
    // env vars aren't configured or the seller never enabled it.
    await sendOrderPushToSeller(getAdmin(), order.seller_id, {
      title: `New order — R${order.total}`,
      body: `${order.customer_name} · ${(order.items || []).length} item${(order.items || []).length === 1 ? "" : "s"}`,
      url: "/dashboard?tab=orders",
    });

    // 4. Build WhatsApp notification URL (stored for dashboard to use)
    let whatsappUrl = "";
    if (seller.whatsapp_number) {
      const waNumber = seller.whatsapp_number.replace(/\D/g, "").replace(/^0/, "27");
      const waText = encodeURIComponent(orderSummary);
      whatsappUrl = `https://wa.me/${waNumber}?text=${waText}`;
    }

    return NextResponse.json({ success: true, whatsappUrl });
  } catch (err) {
    console.error("Notification error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
