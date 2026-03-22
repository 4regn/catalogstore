"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../../../lib/supabase";
import { useParams } from "next/navigation";

interface Seller {
  id: string; store_name: string; whatsapp_number: string; subdomain: string;
  primary_color: string; logo_url: string; template: string;
  checkout_config: {
    eft_enabled: boolean; eft_bank_name: string; eft_account_number: string; eft_account_name: string;
    eft_branch_code: string; eft_account_type: string; eft_instructions: string;
    payfast_enabled: boolean; payfast_merchant_id: string; payfast_merchant_key: string;
    delivery_enabled: boolean; pickup_enabled: boolean; pickup_address: string; pickup_instructions: string;
    shipping_options: { name: string; price: number }[];
  };
}

interface CartItem { name: string; price: number; qty: number; variant: string; image: string; }

const PROVINCES = ["Eastern Cape", "Free State", "Gauteng", "KwaZulu-Natal", "Limpopo", "Mpumalanga", "North West", "Northern Cape", "Western Cape"];

export default function CheckoutPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [seller, setSeller] = useState<Seller | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [sellerProducts, setSellerProducts] = useState<{ id: string; name: string; category: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [address, setAddress] = useState("");
  const [apartment, setApartment] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("Gauteng");
  const [postalCode, setPostalCode] = useState("");

  const [fulfillment, setFulfillment] = useState<"delivery" | "pickup">("delivery");
  const [shippingOption, setShippingOption] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<"eft" | "payfast">("eft");
  const [billingSame, setBillingSame] = useState(true);
  const [showSummary, setShowSummary] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [orderNumber, setOrderNumber] = useState("");
  const [discountCode, setDiscountCode] = useState("");
  const [discountApplied, setDiscountApplied] = useState<{ code: string; type: string; value: number; applies_to: string; product_ids: string[]; collection_names: string[] } | null>(null);
  const [discountError, setDiscountError] = useState("");
  const [applyingDiscount, setApplyingDiscount] = useState(false);
  const [paidOrder, setPaidOrder] = useState<{ order_number: string; total: number; items: any[]; customer_name: string } | null>(null);

  useEffect(() => { load(); }, [slug]);

  const load = async () => {
    const { data: sd } = await supabase.from("sellers").select("*").eq("subdomain", slug).single();
    if (sd) {
      setSeller(sd);
      const { data: prods } = await supabase.from("products").select("id, name, category").eq("seller_id", sd.id);
      if (prods) setSellerProducts(prods);
    }
    const p = new URLSearchParams(window.location.search);
    // Check if returning from PayFast payment
    const paidId = p.get("paid");
    if (paidId) {
      const { data: order } = await supabase.from("orders").select("*").eq("id", paidId).single();
      if (order) { setPaidOrder(order); setLoading(false); return; }
    }
    try { const c = JSON.parse(atob(p.get("cart") || "")); if (Array.isArray(c)) setCart(c); } catch {}
    if (!sd?.checkout_config?.delivery_enabled && sd?.checkout_config?.pickup_enabled) setFulfillment("pickup");
    if (sd?.checkout_config?.payfast_enabled) setPaymentMethod("payfast");
    else if (sd?.checkout_config?.eft_enabled) setPaymentMethod("eft");
    setLoading(false);
  };

  const cc = seller?.checkout_config || {} as any;
  const accent = seller?.primary_color || "#9c7c62";
  const isGC = seller?.template === "glass-futuristic" || seller?.template === "glass-chrome";
  const T = isGC ? {
    bg: "#030305", card: "#0b0b0f", text: "#f0f0f0", muted: "rgba(255,255,255,0.4)", border: "rgba(255,255,255,0.08)",
    inputBg: "rgba(255,255,255,0.04)", inputBorder: "rgba(255,255,255,0.1)", inputText: "#f0f0f0",
    btnBg: "#fff", btnText: "#000", btnRadius: "6px",
    headFont: "'Bebas Neue', sans-serif", bodyFont: "'DM Sans', sans-serif",
    selectBg: "rgba(34,197,94,0.08)", eftBg: "rgba(255,255,255,0.03)",
    fonts: "@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600;700&family=Share+Tech+Mono&display=swap');",
    summaryBg: "rgba(255,255,255,0.02)", summaryBorder: "rgba(255,255,255,0.06)",
    badgeBg: "rgba(255,255,255,0.06)", badgeText: "#fff",
  } : {
    bg: "#f6f3ef", card: "#fff", text: "#2a2a2e", muted: "#8a8690", border: "rgba(0,0,0,0.12)",
    inputBg: "#fff", inputBorder: "rgba(0,0,0,0.12)", inputText: "#2a2a2e",
    btnBg: "#2a2a2e", btnText: "#f6f3ef", btnRadius: "100px",
    headFont: "'Cormorant Garamond', serif", bodyFont: "'Jost', sans-serif",
    selectBg: "rgba(156,124,98,0.04)", eftBg: "#f6f3ef",
    fonts: "@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500&family=Jost:wght@300;400;500;600;700&display=swap');",
    summaryBg: "rgba(0,0,0,0.015)", summaryBorder: "rgba(0,0,0,0.06)",
    badgeBg: "#8a8690", badgeText: "#fff",
  };
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const shipping = fulfillment === "pickup" ? 0 : (cc.shipping_options?.[shippingOption]?.price || 0);

  // Calculate discount based on type
  const calcDiscount = () => {
    if (!discountApplied) return 0;
    const da = discountApplied;

    if (da.applies_to === "cart") {
      return da.type === "percentage" ? subtotal * (da.value / 100) : Math.min(da.value, subtotal);
    }

    if (da.applies_to === "product") {
      // Match product IDs to names using sellerProducts lookup
      const eligibleNames = sellerProducts.filter((p) => da.product_ids?.includes(p.id)).map((p) => p.name.toLowerCase());
      const eligibleTotal = cart.filter((i) => eligibleNames.includes(i.name.toLowerCase())).reduce((s, i) => s + i.price * i.qty, 0);
      return da.type === "percentage" ? eligibleTotal * (da.value / 100) : Math.min(da.value, eligibleTotal);
    }

    if (da.applies_to === "collection") {
      // Match collection names to products, then match cart items
      const eligibleNames = sellerProducts.filter((p) => da.collection_names?.includes(p.category)).map((p) => p.name.toLowerCase());
      const eligibleTotal = cart.filter((i) => eligibleNames.includes(i.name.toLowerCase())).reduce((s, i) => s + i.price * i.qty, 0);
      return da.type === "percentage" ? eligibleTotal * (da.value / 100) : Math.min(da.value, eligibleTotal);
    }

    if (da.applies_to === "shipping") {
      const shippingDisc = da.type === "percentage" ? shipping * (da.value / 100) : Math.min(da.value, shipping);
      return Math.min(shippingDisc, shipping); // Can never exceed shipping cost
    }

    return 0;
  };
  const discountAmount = calcDiscount();
  const isShippingDiscount = discountApplied?.applies_to === "shipping";
  const total = isShippingDiscount ? Math.max(0, subtotal + shipping - discountAmount) : Math.max(0, subtotal - discountAmount + shipping);
  const itemCount = cart.reduce((s, i) => s + i.qty, 0);

  const applyDiscount = async () => {
    if (!discountCode.trim() || !seller) return;
    setApplyingDiscount(true); setDiscountError("");
    const { data, error: dcErr } = await supabase.from("discount_codes").select("*").eq("seller_id", seller.id).eq("code", discountCode.trim().toUpperCase()).eq("active", true).single();
    if (!data || dcErr) { setDiscountError("Invalid discount code"); setApplyingDiscount(false); return; }
    if (data.expires_at && new Date(data.expires_at) < new Date()) { setDiscountError("This code has expired"); setApplyingDiscount(false); return; }
    if (data.max_uses && data.used_count >= data.max_uses) { setDiscountError("This code has reached its usage limit"); setApplyingDiscount(false); return; }
    if (data.min_order > 0 && subtotal < data.min_order) { setDiscountError("Minimum order of R" + data.min_order + " required"); setApplyingDiscount(false); return; }
    if ((data.applies_to === "product") && data.product_ids?.length > 0) {
      const eligibleNames = sellerProducts.filter((p) => data.product_ids.includes(p.id)).map((p) => p.name.toLowerCase());
      const hasEligible = cart.some((i) => eligibleNames.includes(i.name.toLowerCase()));
      if (!hasEligible) { setDiscountError("No eligible products in your cart for this code"); setApplyingDiscount(false); return; }
    }
    if ((data.applies_to === "collection") && data.collection_names?.length > 0) {
      const eligibleNames = sellerProducts.filter((p) => data.collection_names.includes(p.category)).map((p) => p.name.toLowerCase());
      const hasEligible = cart.some((i) => eligibleNames.includes(i.name.toLowerCase()));
      if (!hasEligible) { setDiscountError("No products from eligible collections in your cart"); setApplyingDiscount(false); return; }
    }
    if (data.applies_to === "shipping" && shipping === 0) { setDiscountError("No shipping fee to discount"); setApplyingDiscount(false); return; }
    setDiscountApplied({ code: data.code, type: data.type, value: data.value, applies_to: data.applies_to || "cart", product_ids: data.product_ids || [], collection_names: data.collection_names || [] });
    setApplyingDiscount(false);
  };

  const placeOrder = async () => {
    if (!seller) return;
    if (!email || !firstName || !lastName) { alert("Please fill in your contact details"); return; }
    if (fulfillment === "delivery" && (!address || !city || !postalCode)) { alert("Please fill in your delivery address"); return; }
    setPlacing(true);
    const { data, error } = await supabase.from("orders").insert({
      seller_id: seller.id,
      customer_name: firstName + " " + lastName,
      customer_phone: phone,
      customer_email: email,
      items: cart.map((i) => ({ name: i.name, qty: i.qty, price: i.price, variant: i.variant, image: i.image })),
      total,
      status: "pending",
      payment_status: paymentMethod === "eft" ? "awaiting_payment" : "pending",
      shipping_address: fulfillment === "delivery" ? { address, apartment, city, province, postal_code: postalCode } : null,
      fulfillment_method: fulfillment,
      shipping_option: fulfillment === "delivery" ? cc.shipping_options?.[shippingOption]?.name : "Pickup",
      shipping_cost: shipping,
      payment_method: paymentMethod,
    }).select().single();

    if (data) {
      setOrderNumber(data.order_number || data.id?.substring(0, 8));
      setOrderPlaced(true);

      // Send notification to seller (non-blocking)
      fetch("/api/notify-order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: data.id, sellerId: seller.id }) }).catch(() => {});

      // Increment discount code usage
      if (discountApplied && seller) {
        const { data: dc } = await supabase.from("discount_codes").select("id, used_count").eq("seller_id", seller.id).eq("code", discountApplied.code.toUpperCase()).single();
        if (dc) await supabase.from("discount_codes").update({ used_count: (dc.used_count || 0) + 1 }).eq("id", dc.id);
      }

      if (paymentMethod === "payfast" && cc.payfast_merchant_id) {
        const form = document.createElement("form");
        form.method = "POST";
        form.action = "https://www.payfast.co.za/eng/process";
        const fields: Record<string, string> = {
          merchant_id: cc.payfast_merchant_id,
          merchant_key: cc.payfast_merchant_key,
          amount: total.toFixed(2),
          item_name: "Order from " + seller.store_name,
          name_first: firstName,
          name_last: lastName,
          email_address: email,
          cell_number: phone,
          return_url: window.location.origin + "/store/" + slug + "/checkout?paid=" + data.id,
          cancel_url: window.location.origin + "/store/" + slug + "/checkout?cart=" + btoa(JSON.stringify(cart)),
          notify_url: window.location.origin + "/api/payfast/notify",
          custom_str1: data.id,
        };
        Object.entries(fields).forEach(([k, v]) => { const input = document.createElement("input"); input.type = "hidden"; input.name = k; input.value = v; form.appendChild(input); });
        document.body.appendChild(form);
        form.submit();
        return;
      }
    }
    setPlacing(false);
  };

  if (loading) return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: T.bodyFont, background: T.bg }}><p style={{ color: T.muted }}>Loading checkout...</p></div>;

  // PayFast payment success confirmation
  if (paidOrder) return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: T.bodyFont, color: T.text }}>
      <style>{T.fonts + `body,html{background:${T.bg};margin:0}`}</style>
      <div style={{ maxWidth: 600, margin: "0 auto", padding: "60px 24px" }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          {seller?.logo_url ? <img src={seller.logo_url} alt="" style={{ height: 40, marginBottom: 20, objectFit: "contain" }} /> : <h2 style={{ fontFamily: T.headFont, fontSize: 28, fontWeight: 300, marginBottom: 20 }}>{seller?.store_name}</h2>}
          <div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(34,197,94,0.12)", border: "2px solid #22c55e", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }}><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
          <h1 style={{ fontFamily: T.headFont, fontSize: 32, fontWeight: isGC ? 400 : 300, marginBottom: 8 }}>Payment Successful!</h1>
          <p style={{ color: T.muted, fontSize: 14 }}>Order #{paidOrder.order_number}</p>
        </div>
        <div style={{ background: T.card, borderRadius: 16, padding: 28, marginBottom: 24, border: "1px solid " + T.border }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: "#22c55e", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>Order Confirmed</h3>
          <p style={{ fontSize: 14, lineHeight: 1.8, color: T.muted, marginBottom: 20 }}>Thank you {paidOrder.customer_name}! Your payment has been received and your order is being processed. You'll receive updates via email.</p>
          <div style={{ borderTop: "1px solid " + T.border, paddingTop: 16 }}>
            {(paidOrder.items || []).map((item: any, i: number) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", fontSize: 14 }}>
                <span style={{ color: T.text }}>{item.name} x{item.qty}{item.variant ? " (" + item.variant + ")" : ""}</span>
                <span style={{ fontWeight: 700 }}>R{(item.price * item.qty).toFixed(0)}</span>
              </div>
            ))}
            <div style={{ borderTop: "1px solid " + T.border, paddingTop: 12, marginTop: 8, display: "flex", justifyContent: "space-between", fontSize: 18, fontWeight: 900 }}>
              <span>Total</span>
              <span>R{paidOrder.total}</span>
            </div>
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <a href={"/store/" + slug} style={{ display: "inline-block", padding: "16px 48px", background: T.btnBg, color: T.btnText, borderRadius: T.btnRadius, fontSize: 13, fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", textDecoration: "none" }}>Continue Shopping</a>
        </div>
      </div>
    </div>
  );

  if (orderPlaced && paymentMethod === "eft") return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: T.bodyFont, color: T.text }}>
      <style>{T.fonts + `body,html{background:${T.bg};margin:0}` + (isGC ? ` input::placeholder{color:rgba(255,255,255,0.3)!important}` : ``)}</style>
      <div style={{ maxWidth: 600, margin: "0 auto", padding: "60px 24px" }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          {seller?.logo_url ? <img src={seller.logo_url} alt="" style={{ height: 40, marginBottom: 20, objectFit: "contain" }} /> : <h2 style={{ fontFamily: T.headFont, fontSize: 28, fontWeight: 300, marginBottom: 20 }}>{seller?.store_name}</h2>}
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#22c55e", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
          <h1 style={{ fontFamily: T.headFont, fontSize: 32, fontWeight: 400, marginBottom: 8 }}>Order Placed!</h1>
          <p style={{ color: T.muted, fontSize: 14 }}>Order #{orderNumber}</p>
        </div>
        <div style={{ background: T.card, borderRadius: 16, padding: 28, marginBottom: 24, border: "1px solid " + T.border }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>EFT / Direct Deposit Payment Instructions</h3>
          <div style={{ fontSize: 14, lineHeight: 1.8, color: T.text }}>
            {cc.eft_bank_name && <p><strong>Bank:</strong> {cc.eft_bank_name}</p>}
            {cc.eft_account_number && <p><strong>Account Number:</strong> {cc.eft_account_number}</p>}
            {cc.eft_account_name && <p><strong>Account Name:</strong> {cc.eft_account_name}</p>}
            {cc.eft_branch_code && <p><strong>Branch Code:</strong> {cc.eft_branch_code}</p>}
            {cc.eft_account_type && <p><strong>Account Type:</strong> {cc.eft_account_type}</p>}
          </div>
          {cc.eft_instructions && <div style={{ marginTop: 20, padding: 20, background: T.selectBg, borderRadius: 12, fontSize: 14, lineHeight: 1.7, color: T.text, whiteSpace: "pre-wrap" }}>{cc.eft_instructions}</div>}
        </div>
        <div style={{ textAlign: "center" }}>
          <a href={"/store/" + slug} style={{ display: "inline-block", padding: "16px 48px", background: T.btnBg, color: T.btnText, borderRadius: T.btnRadius, fontSize: 13, fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", textDecoration: "none" }}>Return to Store</a>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: T.bodyFont, color: T.text }}>
      <style>{T.fonts + `body,html{background:${T.bg};margin:0}` + (isGC ? `input::placeholder,select{color:rgba(255,255,255,0.3)!important}option{background:#0b0b0f;color:#f0f0f0}` : ``) + `@media(max-width:768px){.ck-grid{grid-template-columns:1fr!important}.ck-summary{position:static!important;border-left:none!important;padding-top:0!important}}`}</style>

      {/* HEADER */}
      <div style={{ borderBottom: "1px solid " + T.summaryBorder, padding: "16px 24px", background: isGC ? "rgba(3,3,5,0.95)" : "rgba(246,243,239,0.95)", backdropFilter: "blur(20px)", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <a href={"/store/" + slug} style={{ textDecoration: "none" }}>
            {seller?.logo_url ? <img src={seller.logo_url} alt="" style={{ height: 36, objectFit: "contain" }} /> : <span style={{ fontFamily: T.headFont, fontSize: 22, fontWeight: 300, letterSpacing: "0.06em", textTransform: "uppercase", color: T.text }}>{seller?.store_name}</span>}
          </a>
          <button onClick={() => setShowSummary(!showSummary)} style={{ background: "none", border: "none", fontSize: 13, color: accent, cursor: "pointer", fontFamily: T.bodyFont, display: "flex", alignItems: "center", gap: 6 }}>
            Order summary <span style={{ fontWeight: 600 }}>R{total.toFixed(0)}</span> <span style={{ fontSize: 10 }}>{showSummary ? "\u25B2" : "\u25BC"}</span>
          </button>
        </div>
      </div>

      {/* MOBILE SUMMARY DROPDOWN */}
      {showSummary && (
        <div style={{ maxWidth: 1000, margin: "0 auto", padding: "0 24px" }}>
          <div style={{ padding: "20px 0", borderBottom: "1px solid " + T.summaryBorder }}>
            {cart.map((item, i) => (
              <div key={i} style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "center" }}>
                <div style={{ position: "relative" }}>
                  {item.image ? <img src={item.image} alt="" style={{ width: 56, height: 68, borderRadius: 8, objectFit: "cover", border: "1px solid " + T.summaryBorder }} /> : <div style={{ width: 56, height: 68, borderRadius: 8, background: isGC ? "rgba(255,255,255,0.04)" : "#e0d5ca" }} />}
                  <span style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", background: T.badgeBg, color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{item.qty}</span>
                </div>
                <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 500, color: T.text }}>{item.name}</div>{item.variant && <div style={{ fontSize: 12, color: T.muted }}>{item.variant}</div>}</div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>R{(item.price * item.qty).toFixed(0)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="ck-grid" style={{ maxWidth: 1000, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 380px", gap: 0 }}>

        {/* LEFT - FORM */}
        <div style={{ padding: "32px 24px 60px" }}>

          {/* CONTACT */}
          <h2 style={{ fontFamily: T.headFont, fontSize: 24, fontWeight: 400, marginBottom: 20 }}>Contact</h2>
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: "100%", padding: "16px", border: "1px solid " + T.border, borderRadius: 12, fontSize: 14, fontFamily: T.bodyFont, outline: "none", marginBottom: 12, background: T.card, color: T.text }} />
          <input type="tel" placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} style={{ width: "100%", padding: "16px", border: "1px solid " + T.border, borderRadius: 12, fontSize: 14, fontFamily: T.bodyFont, outline: "none", marginBottom: 32, background: T.card, color: T.text }} />

          {/* DELIVERY vs PICKUP */}
          {(cc.delivery_enabled || cc.pickup_enabled) && (
            <div style={{ marginBottom: 32 }}>
              <h2 style={{ fontFamily: T.headFont, fontSize: 24, fontWeight: 400, marginBottom: 16 }}>Fulfillment</h2>
              <div style={{ border: "1px solid " + T.border, borderRadius: 14, overflow: "hidden" }}>
                {cc.delivery_enabled && (
                  <div onClick={() => setFulfillment("delivery")} style={{ padding: "16px 20px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, background: fulfillment === "delivery" ? T.selectBg : T.card, borderBottom: cc.pickup_enabled ? "1px solid " + T.summaryBorder : "none" }}>
                    <div style={{ width: 20, height: 20, borderRadius: "50%", border: fulfillment === "delivery" ? "6px solid #22c55e" : "2px solid " + T.muted }} />
                    <span style={{ fontSize: 14, fontWeight: fulfillment === "delivery" ? 600 : 400 }}>Delivery</span>
                  </div>
                )}
                {cc.pickup_enabled && (
                  <div onClick={() => setFulfillment("pickup")} style={{ padding: "16px 20px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, background: fulfillment === "pickup" ? T.selectBg : T.card }}>
                    <div style={{ width: 20, height: 20, borderRadius: "50%", border: fulfillment === "pickup" ? "6px solid #22c55e" : "2px solid " + T.muted }} />
                    <div><span style={{ fontSize: 14, fontWeight: fulfillment === "pickup" ? 600 : 400 }}>Pickup</span>{cc.pickup_address && <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{cc.pickup_address}</div>}</div>
                  </div>
                )}
              </div>
              {fulfillment === "pickup" && cc.pickup_instructions && (
                <div style={{ marginTop: 12, padding: 16, background: T.card, borderRadius: 12, border: "1px solid " + T.summaryBorder, fontSize: 13, color: T.muted, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{cc.pickup_instructions}</div>
              )}
            </div>
          )}

          {/* DELIVERY ADDRESS */}
          {fulfillment === "delivery" && (
            <div style={{ marginBottom: 32 }}>
              <h2 style={{ fontFamily: T.headFont, fontSize: 24, fontWeight: 400, marginBottom: 16 }}>Delivery Address</h2>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <input type="text" placeholder="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} style={{ padding: "16px", border: "1px solid " + T.border, borderRadius: 12, fontSize: 14, fontFamily: T.bodyFont, outline: "none", background: T.card, color: T.text }} />
                <input type="text" placeholder="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} style={{ padding: "16px", border: "1px solid " + T.border, borderRadius: 12, fontSize: 14, fontFamily: T.bodyFont, outline: "none", background: T.card, color: T.text }} />
              </div>
              <input type="text" placeholder="Address" value={address} onChange={(e) => setAddress(e.target.value)} style={{ width: "100%", padding: "16px", border: "1px solid " + T.border, borderRadius: 12, fontSize: 14, fontFamily: T.bodyFont, outline: "none", marginTop: 12, background: T.card, color: T.text }} />
              <input type="text" placeholder="Apartment, suite, etc. (optional)" value={apartment} onChange={(e) => setApartment(e.target.value)} style={{ width: "100%", padding: "16px", border: "1px solid " + T.border, borderRadius: 12, fontSize: 14, fontFamily: T.bodyFont, outline: "none", marginTop: 12, background: T.card, color: T.text }} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
                <input type="text" placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} style={{ padding: "16px", border: "1px solid " + T.border, borderRadius: 12, fontSize: 14, fontFamily: T.bodyFont, outline: "none", background: T.card, color: T.text }} />
                <select value={province} onChange={(e) => setProvince(e.target.value)} style={{ padding: "16px", border: "1px solid " + T.border, borderRadius: 12, fontSize: 14, fontFamily: T.bodyFont, outline: "none", background: T.card, color: T.text, appearance: "none" }}>
                  {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <input type="text" placeholder="Postal code" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} style={{ width: "100%", padding: "16px", border: "1px solid " + T.border, borderRadius: 12, fontSize: 14, fontFamily: T.bodyFont, outline: "none", marginTop: 12, background: T.card, color: T.text }} />
            </div>
          )}

          {fulfillment === "pickup" && (
            <div style={{ marginBottom: 32 }}>
              <h2 style={{ fontFamily: T.headFont, fontSize: 24, fontWeight: 400, marginBottom: 16 }}>Your Details</h2>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <input type="text" placeholder="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} style={{ padding: "16px", border: "1px solid " + T.border, borderRadius: 12, fontSize: 14, fontFamily: T.bodyFont, outline: "none", background: T.card, color: T.text }} />
                <input type="text" placeholder="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} style={{ padding: "16px", border: "1px solid " + T.border, borderRadius: 12, fontSize: 14, fontFamily: T.bodyFont, outline: "none", background: T.card, color: T.text }} />
              </div>
            </div>
          )}

          {/* SHIPPING METHOD */}
          {fulfillment === "delivery" && cc.shipping_options?.length > 0 && (
            <div style={{ marginBottom: 32 }}>
              <h2 style={{ fontFamily: T.headFont, fontSize: 24, fontWeight: 400, marginBottom: 16 }}>Shipping Method</h2>
              <div style={{ border: "1px solid " + T.border, borderRadius: 14, overflow: "hidden" }}>
                {cc.shipping_options.map((opt: { name: string; price: number }, i: number) => (
                  <div key={i} onClick={() => setShippingOption(i)} style={{ padding: "16px 20px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", background: shippingOption === i ? T.selectBg : T.card, borderBottom: i < cc.shipping_options.length - 1 ? "1px solid " + T.summaryBorder : "none" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 20, height: 20, borderRadius: "50%", border: shippingOption === i ? "6px solid #22c55e" : "2px solid " + T.muted }} />
                      <span style={{ fontSize: 14, fontWeight: shippingOption === i ? 600 : 400 }}>{opt.name}</span>
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{opt.price === 0 ? "Free" : "R" + opt.price}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* DISCOUNT CODE */}
          <div style={{ marginBottom: 32 }}>
            <h2 style={{ fontFamily: T.headFont, fontSize: 24, fontWeight: 400, marginBottom: 16 }}>Discount Code</h2>
            {discountApplied ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", background: "rgba(34,197,94,0.04)", border: "1px solid rgba(34,197,94,0.15)", borderRadius: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ color: "#22c55e", fontSize: 14 }}>&#10003;</span>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{discountApplied.code}</span>
                  <span style={{ fontSize: 13, color: T.muted }}>{discountApplied.type === "percentage" ? discountApplied.value + "% off" : "R" + discountApplied.value + " off"} {discountApplied.applies_to !== "cart" ? "(" + discountApplied.applies_to + ")" : ""}</span>
                </div>
                <button onClick={() => { setDiscountApplied(null); setDiscountCode(""); }} style={{ background: "none", border: "none", color: T.muted, fontSize: 12, cursor: "pointer", textDecoration: "underline", fontFamily: T.bodyFont }}>Remove</button>
              </div>
            ) : (
              <div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input type="text" value={discountCode} onChange={(e) => { setDiscountCode(e.target.value.toUpperCase()); setDiscountError(""); }} onKeyDown={(e) => { if (e.key === "Enter") applyDiscount(); }} placeholder="Enter discount code" style={{ flex: 1, padding: "14px 16px", border: "1px solid " + T.border, borderRadius: 12, fontSize: 14, fontFamily: T.bodyFont, outline: "none", background: T.card, color: T.text, textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }} />
                  <button onClick={applyDiscount} disabled={applyingDiscount || !discountCode.trim()} style={{ padding: "14px 24px", background: T.btnBg, color: T.btnText, border: "none", borderRadius: 12, fontFamily: T.bodyFont, fontSize: 13, fontWeight: 500, cursor: (applyingDiscount || !discountCode.trim()) ? "not-allowed" : "pointer", opacity: (applyingDiscount || !discountCode.trim()) ? 0.5 : 1, letterSpacing: "0.04em" }}>{applyingDiscount ? "..." : "Apply"}</button>
                </div>
                {discountError && <p style={{ fontSize: 12, color: "#e53e3e", marginTop: 8 }}>{discountError}</p>}
              </div>
            )}
          </div>

          {/* PAYMENT */}
          <h2 style={{ fontFamily: T.headFont, fontSize: 24, fontWeight: 400, marginBottom: 8 }}>Payment</h2>
          <p style={{ fontSize: 13, color: T.muted, marginBottom: 16 }}>All transactions are secure and encrypted.</p>
          <div style={{ border: "1px solid " + T.border, borderRadius: 14, overflow: "hidden", marginBottom: 32 }}>
            {cc.payfast_enabled && (
              <div>
                <div onClick={() => setPaymentMethod("payfast")} style={{ padding: "16px 20px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", background: paymentMethod === "payfast" ? T.selectBg : T.card, borderBottom: "1px solid " + T.summaryBorder }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 20, height: 20, borderRadius: "50%", border: paymentMethod === "payfast" ? "6px solid #22c55e" : "2px solid " + T.muted }} />
                    <span style={{ fontSize: 14, fontWeight: paymentMethod === "payfast" ? 600 : 400 }}>PayFast</span>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                      <span style={{ padding: "2px 4px", background: isGC ? "rgba(255,255,255,0.06)" : "#fff", border: "1px solid " + T.border, borderRadius: 4, display: "flex", alignItems: "center" }}><img src="/checkout/visa.png" alt="Visa" style={{ height: 16, objectFit: "contain" }} /></span>
                      <span style={{ padding: "2px 4px", background: isGC ? "rgba(255,255,255,0.06)" : "#fff", border: "1px solid " + T.border, borderRadius: 4, display: "flex", alignItems: "center" }}><img src="/checkout/mastercard.png" alt="Mastercard" style={{ height: 16, objectFit: "contain" }} /></span>
                      <span style={{ padding: "2px 4px", background: isGC ? "rgba(255,255,255,0.06)" : "#fff", border: "1px solid " + T.border, borderRadius: 4, display: "flex", alignItems: "center" }}><img src="/checkout/applepay.png" alt="Apple Pay" style={{ height: 16, objectFit: "contain" }} /></span>
                      <span style={{ width: 22, height: 22, borderRadius: 4, border: "1px solid " + T.border, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: T.muted, fontWeight: 700 }}>+</span>
                    </div>
                  </div>
                </div>
                {paymentMethod === "payfast" && <div style={{ padding: "16px 20px", background: T.selectBg, fontSize: 13, color: T.muted, borderBottom: "1px solid " + T.summaryBorder }}>You'll be redirected to PayFast to complete your payment.</div>}
              </div>
            )}
            {cc.eft_enabled && (
              <div>
                <div onClick={() => setPaymentMethod("eft")} style={{ padding: "16px 20px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, background: paymentMethod === "eft" ? T.selectBg : T.card }}>
                  <div style={{ width: 20, height: 20, borderRadius: "50%", border: paymentMethod === "eft" ? "6px solid #22c55e" : "2px solid " + T.muted }} />
                  <span style={{ fontSize: 14, fontWeight: paymentMethod === "eft" ? 600 : 400 }}>EFT / Direct Deposit</span>
                </div>
                {paymentMethod === "eft" && (
                  <div style={{ padding: "20px", background: T.selectBg, fontSize: 13, lineHeight: 1.7, color: T.text }}>
                    <p style={{ fontWeight: 700, marginBottom: 12 }}>Banking Details:</p>
                    {cc.eft_bank_name && <p>Bank: {cc.eft_bank_name}</p>}
                    {cc.eft_account_number && <p>Account: {cc.eft_account_number}</p>}
                    {cc.eft_account_name && <p>Name: {cc.eft_account_name}</p>}
                    {cc.eft_branch_code && <p>Branch: {cc.eft_branch_code}</p>}
                    {cc.eft_account_type && <p>Type: {cc.eft_account_type}</p>}
                    {cc.eft_instructions && <div style={{ marginTop: 16, padding: 16, background: T.bg, borderRadius: 10, whiteSpace: "pre-wrap" }}>{cc.eft_instructions}</div>}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* PLACE ORDER */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
            <a href={"/store/" + slug} style={{ fontSize: 13, color: accent, textDecoration: "none" }}>&larr; Return to store</a>
            <button onClick={placeOrder} disabled={placing} style={{ padding: "18px 48px", background: "#22c55e", color: "#fff", border: "none", borderRadius: T.btnRadius, fontFamily: T.bodyFont, fontSize: 14, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", cursor: placing ? "not-allowed" : "pointer", opacity: placing ? 0.6 : 1 }}>{placing ? "Placing..." : paymentMethod === "payfast" ? "Pay Now - R" + total.toFixed(0) : "Complete Order - R" + total.toFixed(0)}</button>
          </div>
        </div>

        {/* RIGHT - ORDER SUMMARY */}
        <div className="ck-summary" style={{ padding: "32px 24px", borderLeft: "1px solid " + T.summaryBorder, background: T.summaryBg }}>
          <h3 style={{ fontFamily: T.headFont, fontSize: 20, fontWeight: 400, marginBottom: 20 }}>Order Summary</h3>
          {cart.map((item, i) => (
            <div key={i} style={{ display: "flex", gap: 14, marginBottom: 16, alignItems: "center" }}>
              <div style={{ position: "relative" }}>
                {item.image ? <img src={item.image} alt="" style={{ width: 60, height: 72, borderRadius: 10, objectFit: "cover", border: "1px solid " + T.summaryBorder }} /> : <div style={{ width: 60, height: 72, borderRadius: 10, background: isGC ? "rgba(255,255,255,0.04)" : "#e0d5ca" }} />}
                <span style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", background: T.badgeBg, color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{item.qty}</span>
              </div>
              <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 500, color: T.text }}>{item.name}</div>{item.variant && <div style={{ fontSize: 12, color: T.muted }}>{item.variant}</div>}</div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>R{(item.price * item.qty).toFixed(0)}</div>
            </div>
          ))}
          <div style={{ borderTop: "1px solid " + T.summaryBorder, paddingTop: 16, marginTop: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 14, color: T.muted }}><span>Subtotal ({itemCount} item{itemCount !== 1 ? "s" : ""})</span><span>R{subtotal.toFixed(0)}</span></div>
            {discountApplied && discountAmount > 0 && <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 14, color: "#22c55e" }}><span>{discountApplied.code} {discountApplied.applies_to !== "cart" ? "(" + discountApplied.applies_to + ")" : ""}</span><span>-R{discountAmount.toFixed(0)}</span></div>}
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 14, color: T.muted }}><span>Shipping</span><span>{shipping === 0 ? (fulfillment === "pickup" ? "Pickup" : "Free") : "R" + shipping}</span></div>
          </div>
          <div style={{ borderTop: "1px solid " + T.summaryBorder, paddingTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>Total</span>
            <span style={{ fontFamily: T.headFont, fontSize: 28, fontWeight: 500 }}>R{total.toFixed(0)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}