import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { orderId, sellerId } = await req.json();
    if (!orderId || !sellerId) return NextResponse.json({ error: "Missing data" }, { status: 400 });

    // Get seller and order details
    const [{ data: seller }, { data: order }] = await Promise.all([
      supabase.from("sellers").select("*").eq("id", sellerId).single(),
      supabase.from("orders").select("*").eq("id", orderId).single(),
    ]);

    if (!seller || !order) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const items = (order.items || []).map((i: any) => `${i.name} x${i.qty} — R${(i.price * i.qty).toFixed(0)}${i.variant ? " (" + i.variant + ")" : ""}`).join("\n");
    const orderSummary = `New Order #${order.order_number}\n\nCustomer: ${order.customer_name}\nEmail: ${order.customer_email || "N/A"}\nPhone: ${order.customer_phone || "N/A"}\n\nItems:\n${items}\n\nShipping: R${order.shipping_cost || 0}\nTotal: R${order.total}\n\nPayment: ${order.payment_method?.toUpperCase() || "N/A"}\nFulfillment: ${order.fulfillment_method || "delivery"}${order.shipping_address ? "\nAddress: " + order.shipping_address.address + ", " + order.shipping_address.city + ", " + order.shipping_address.province : ""}`;

    // 1. Send email notification via Resend (if API key exists)
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey && seller.email) {
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: process.env.RESEND_FROM_EMAIL || "CatalogStore <orders@catalogstore.co.za>",
            to: [seller.email],
            subject: `New Order #${order.order_number} — R${order.total}`,
            html: `
              <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; background: #030303; color: #f5f5f5; border-radius: 12px; overflow: hidden;">
                <div style="padding: 24px 28px; background: linear-gradient(135deg, #ff6b35, #ff3d6e);">
                  <h1 style="margin: 0; font-size: 20px; font-weight: 800; color: #fff;">New Order Received!</h1>
                </div>
                <div style="padding: 28px;">
                  <div style="margin-bottom: 20px;">
                    <span style="font-size: 28px; font-weight: 900;">Order #${order.order_number}</span>
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
        const storeUrl = `https://catalogstore.co.za/store/${seller.subdomain}`;
        const accent = seller.primary_color || "#ff6b35";
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: process.env.RESEND_FROM_EMAIL || `${seller.store_name} <orders@catalogstore.co.za>`,
            to: [order.customer_email],
            subject: `Order Confirmed — #${order.order_number}`,
            html: `
              <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; background: #fafafa; border-radius: 12px; overflow: hidden;">
                <div style="padding: 28px; background: #fff; text-align: center; border-bottom: 1px solid #eee;">
                  ${seller.logo_url ? `<img src="${seller.logo_url}" alt="${seller.store_name}" style="height: 40px; margin-bottom: 16px;" />` : `<h2 style="margin: 0 0 8px; font-size: 22px; font-weight: 300; letter-spacing: 0.06em; text-transform: uppercase;">${seller.store_name}</h2>`}
                </div>
                <div style="padding: 32px 28px;">
                  <div style="text-align: center; margin-bottom: 28px;">
                    <div style="width: 56px; height: 56px; border-radius: 50%; background: #e8f5e9; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px; font-size: 24px;">&#10003;</div>
                    <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #2a2a2e;">Order Confirmed!</h1>
                    <p style="margin: 8px 0 0; color: #8a8690; font-size: 14px;">Thank you for your order, ${order.customer_name}.</p>
                    <p style="margin: 4px 0 0; color: #8a8690; font-size: 13px;">Order #${order.order_number}</p>
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
                    <p style="margin: 0; font-size: 13px; color: #8a8690;">Please complete your payment using the banking details provided at checkout. Reference your order number <strong>#${order.order_number}</strong>.</p>
                  </div>` : `
                  <div style="background: #fff; border-radius: 12px; padding: 20px; border: 1px solid #eee; margin-bottom: 16px;">
                    <h3 style="font-size: 12px; color: #22c55e; text-transform: uppercase; letter-spacing: 0.08em; margin: 0 0 8px;">Payment Received</h3>
                    <p style="margin: 0; font-size: 13px; color: #8a8690;">Your payment via PayFast has been received. Your order is being processed.</p>
                  </div>`}
                  <a href="${storeUrl}" style="display: block; text-align: center; padding: 16px; background: #2a2a2e; color: #fff; border-radius: 100px; text-decoration: none; font-weight: 600; font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em;">Continue Shopping</a>
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

    // 3. Build WhatsApp notification URL (stored for dashboard to use)
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