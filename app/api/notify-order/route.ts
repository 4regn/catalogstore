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
                    ${(order.items || []).map((i: any) => `<div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.04);"><span>${i.name} x${i.qty}${i.variant ? " (" + i.variant + ")" : ""}</span><span style="font-weight: 700;">R${(i.price * i.qty).toFixed(0)}</span></div>`).join("")}
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

    // 2. Build WhatsApp notification URL (stored for dashboard to use)
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