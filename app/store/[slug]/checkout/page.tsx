"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../../../lib/supabase";
import { useParams, useSearchParams } from "next/navigation";

interface Seller {
  id: string; store_name: string; whatsapp_number: string; subdomain: string;
  primary_color: string; logo_url: string;
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
  const searchParams = useSearchParams();
  const slug = params.slug as string;
  const [seller, setSeller] = useState<Seller | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
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

  useEffect(() => { load(); }, [slug]);

  const load = async () => {
    const { data: sd } = await supabase.from("sellers").select("*").eq("subdomain", slug).single();
    if (sd) setSeller(sd);
    try { const c = JSON.parse(atob(searchParams.get("cart") || "")); if (Array.isArray(c)) setCart(c); } catch {}
    if (!sd?.checkout_config?.delivery_enabled && sd?.checkout_config?.pickup_enabled) setFulfillment("pickup");
    if (sd?.checkout_config?.payfast_enabled) setPaymentMethod("payfast");
    else if (sd?.checkout_config?.eft_enabled) setPaymentMethod("eft");
    setLoading(false);
  };

  const cc = seller?.checkout_config || {} as any;
  const accent = seller?.primary_color || "#9c7c62";
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const shipping = fulfillment === "pickup" ? 0 : (cc.shipping_options?.[shippingOption]?.price || 0);
  const total = subtotal + shipping;
  const itemCount = cart.reduce((s, i) => s + i.qty, 0);

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
          return_url: window.location.origin + "/store/" + slug + "?order=success",
          cancel_url: window.location.origin + "/store/" + slug + "?order=cancelled",
        };
        Object.entries(fields).forEach(([k, v]) => { const input = document.createElement("input"); input.type = "hidden"; input.name = k; input.value = v; form.appendChild(input); });
        document.body.appendChild(form);
        form.submit();
        return;
      }
    }
    setPlacing(false);
  };

  if (loading) return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Jost', sans-serif", background: "#f6f3ef" }}><p style={{ color: "#8a8690" }}>Loading checkout...</p></div>;

  if (orderPlaced && paymentMethod === "eft") return (
    <div style={{ minHeight: "100vh", background: "#f6f3ef", fontFamily: "'Jost', sans-serif", color: "#2a2a2e" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500&family=Jost:wght@300;400;500;600;700&display=swap');`}</style>
      <div style={{ maxWidth: 600, margin: "0 auto", padding: "60px 24px" }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          {seller?.logo_url ? <img src={seller.logo_url} alt="" style={{ height: 40, marginBottom: 20, objectFit: "contain" }} /> : <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 300, marginBottom: 20 }}>{seller?.store_name}</h2>}
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#22c55e", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
          <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, fontWeight: 400, marginBottom: 8 }}>Order Placed!</h1>
          <p style={{ color: "#8a8690", fontSize: 14 }}>Order #{orderNumber}</p>
        </div>
        <div style={{ background: "#fff", borderRadius: 16, padding: 28, marginBottom: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>EFT / Direct Deposit Payment Instructions</h3>
          <div style={{ fontSize: 14, lineHeight: 1.8, color: "#2a2a2e" }}>
            {cc.eft_bank_name && <p><strong>Bank:</strong> {cc.eft_bank_name}</p>}
            {cc.eft_account_number && <p><strong>Account Number:</strong> {cc.eft_account_number}</p>}
            {cc.eft_account_name && <p><strong>Account Name:</strong> {cc.eft_account_name}</p>}
            {cc.eft_branch_code && <p><strong>Branch Code:</strong> {cc.eft_branch_code}</p>}
            {cc.eft_account_type && <p><strong>Account Type:</strong> {cc.eft_account_type}</p>}
          </div>
          {cc.eft_instructions && <div style={{ marginTop: 20, padding: 20, background: "#f6f3ef", borderRadius: 12, fontSize: 14, lineHeight: 1.7, color: "#2a2a2e", whiteSpace: "pre-wrap" }}>{cc.eft_instructions}</div>}
        </div>
        <div style={{ textAlign: "center" }}>
          <a href={"/store/" + slug} style={{ display: "inline-block", padding: "16px 48px", background: "#2a2a2e", color: "#f6f3ef", borderRadius: 100, fontSize: 13, fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", textDecoration: "none" }}>Return to Store</a>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#f6f3ef", fontFamily: "'Jost', sans-serif", color: "#2a2a2e" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500&family=Jost:wght@300;400;500;600;700&display=swap');@media(max-width:768px){.ck-grid{grid-template-columns:1fr!important}.ck-summary{position:static!important;border-left:none!important;padding-top:0!important}}`}</style>

      {/* HEADER */}
      <div style={{ borderBottom: "1px solid rgba(0,0,0,0.06)", padding: "16px 24px", background: "rgba(246,243,239,0.95)", backdropFilter: "blur(20px)", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <a href={"/store/" + slug} style={{ textDecoration: "none" }}>
            {seller?.logo_url ? <img src={seller.logo_url} alt="" style={{ height: 36, objectFit: "contain" }} /> : <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 300, letterSpacing: "0.06em", textTransform: "uppercase", color: "#2a2a2e" }}>{seller?.store_name}</span>}
          </a>
          <button onClick={() => setShowSummary(!showSummary)} style={{ background: "none", border: "none", fontSize: 13, color: accent, cursor: "pointer", fontFamily: "'Jost', sans-serif", display: "flex", alignItems: "center", gap: 6 }}>
            Order summary <span style={{ fontWeight: 600 }}>R{total.toFixed(0)}</span> <span style={{ fontSize: 10 }}>{showSummary ? "\u25B2" : "\u25BC"}</span>
          </button>
        </div>
      </div>

      {/* MOBILE SUMMARY DROPDOWN */}
      {showSummary && (
        <div style={{ maxWidth: 1000, margin: "0 auto", padding: "0 24px" }}>
          <div style={{ padding: "20px 0", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
            {cart.map((item, i) => (
              <div key={i} style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "center" }}>
                <div style={{ position: "relative" }}>
                  {item.image ? <img src={item.image} alt="" style={{ width: 56, height: 68, borderRadius: 8, objectFit: "cover", border: "1px solid rgba(0,0,0,0.06)" }} /> : <div style={{ width: 56, height: 68, borderRadius: 8, background: "#e0d5ca" }} />}
                  <span style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", background: "#8a8690", color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{item.qty}</span>
                </div>
                <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 500 }}>{item.name}</div>{item.variant && <div style={{ fontSize: 12, color: "#8a8690" }}>{item.variant}</div>}</div>
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
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 400, marginBottom: 20 }}>Contact</h2>
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: "100%", padding: "16px", border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, fontSize: 14, fontFamily: "'Jost', sans-serif", outline: "none", marginBottom: 12, background: "#fff" }} />
          <input type="tel" placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} style={{ width: "100%", padding: "16px", border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, fontSize: 14, fontFamily: "'Jost', sans-serif", outline: "none", marginBottom: 32, background: "#fff" }} />

          {/* DELIVERY vs PICKUP */}
          {(cc.delivery_enabled || cc.pickup_enabled) && (
            <div style={{ marginBottom: 32 }}>
              <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 400, marginBottom: 16 }}>Fulfillment</h2>
              <div style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 14, overflow: "hidden" }}>
                {cc.delivery_enabled && (
                  <div onClick={() => setFulfillment("delivery")} style={{ padding: "16px 20px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, background: fulfillment === "delivery" ? "rgba(156,124,98,0.04)" : "#fff", borderBottom: cc.pickup_enabled ? "1px solid rgba(0,0,0,0.06)" : "none" }}>
                    <div style={{ width: 20, height: 20, borderRadius: "50%", border: fulfillment === "delivery" ? "6px solid " + accent : "2px solid rgba(0,0,0,0.15)" }} />
                    <span style={{ fontSize: 14, fontWeight: fulfillment === "delivery" ? 600 : 400 }}>Delivery</span>
                  </div>
                )}
                {cc.pickup_enabled && (
                  <div onClick={() => setFulfillment("pickup")} style={{ padding: "16px 20px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, background: fulfillment === "pickup" ? "rgba(156,124,98,0.04)" : "#fff" }}>
                    <div style={{ width: 20, height: 20, borderRadius: "50%", border: fulfillment === "pickup" ? "6px solid " + accent : "2px solid rgba(0,0,0,0.15)" }} />
                    <div><span style={{ fontSize: 14, fontWeight: fulfillment === "pickup" ? 600 : 400 }}>Pickup</span>{cc.pickup_address && <div style={{ fontSize: 12, color: "#8a8690", marginTop: 2 }}>{cc.pickup_address}</div>}</div>
                  </div>
                )}
              </div>
              {fulfillment === "pickup" && cc.pickup_instructions && (
                <div style={{ marginTop: 12, padding: 16, background: "#fff", borderRadius: 12, border: "1px solid rgba(0,0,0,0.06)", fontSize: 13, color: "#8a8690", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{cc.pickup_instructions}</div>
              )}
            </div>
          )}

          {/* DELIVERY ADDRESS */}
          {fulfillment === "delivery" && (
            <div style={{ marginBottom: 32 }}>
              <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 400, marginBottom: 16 }}>Delivery Address</h2>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <input type="text" placeholder="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} style={{ padding: "16px", border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, fontSize: 14, fontFamily: "'Jost', sans-serif", outline: "none", background: "#fff" }} />
                <input type="text" placeholder="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} style={{ padding: "16px", border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, fontSize: 14, fontFamily: "'Jost', sans-serif", outline: "none", background: "#fff" }} />
              </div>
              <input type="text" placeholder="Address" value={address} onChange={(e) => setAddress(e.target.value)} style={{ width: "100%", padding: "16px", border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, fontSize: 14, fontFamily: "'Jost', sans-serif", outline: "none", marginTop: 12, background: "#fff" }} />
              <input type="text" placeholder="Apartment, suite, etc. (optional)" value={apartment} onChange={(e) => setApartment(e.target.value)} style={{ width: "100%", padding: "16px", border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, fontSize: 14, fontFamily: "'Jost', sans-serif", outline: "none", marginTop: 12, background: "#fff" }} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
                <input type="text" placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} style={{ padding: "16px", border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, fontSize: 14, fontFamily: "'Jost', sans-serif", outline: "none", background: "#fff" }} />
                <select value={province} onChange={(e) => setProvince(e.target.value)} style={{ padding: "16px", border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, fontSize: 14, fontFamily: "'Jost', sans-serif", outline: "none", background: "#fff", appearance: "none" }}>
                  {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <input type="text" placeholder="Postal code" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} style={{ width: "100%", padding: "16px", border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, fontSize: 14, fontFamily: "'Jost', sans-serif", outline: "none", marginTop: 12, background: "#fff" }} />
            </div>
          )}

          {fulfillment === "pickup" && (
            <div style={{ marginBottom: 32 }}>
              <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 400, marginBottom: 16 }}>Your Details</h2>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <input type="text" placeholder="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} style={{ padding: "16px", border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, fontSize: 14, fontFamily: "'Jost', sans-serif", outline: "none", background: "#fff" }} />
                <input type="text" placeholder="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} style={{ padding: "16px", border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, fontSize: 14, fontFamily: "'Jost', sans-serif", outline: "none", background: "#fff" }} />
              </div>
            </div>
          )}

          {/* SHIPPING METHOD */}
          {fulfillment === "delivery" && cc.shipping_options?.length > 0 && (
            <div style={{ marginBottom: 32 }}>
              <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 400, marginBottom: 16 }}>Shipping Method</h2>
              <div style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 14, overflow: "hidden" }}>
                {cc.shipping_options.map((opt: { name: string; price: number }, i: number) => (
                  <div key={i} onClick={() => setShippingOption(i)} style={{ padding: "16px 20px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", background: shippingOption === i ? "rgba(156,124,98,0.04)" : "#fff", borderBottom: i < cc.shipping_options.length - 1 ? "1px solid rgba(0,0,0,0.06)" : "none" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 20, height: 20, borderRadius: "50%", border: shippingOption === i ? "6px solid " + accent : "2px solid rgba(0,0,0,0.15)" }} />
                      <span style={{ fontSize: 14, fontWeight: shippingOption === i ? 600 : 400 }}>{opt.name}</span>
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{opt.price === 0 ? "Free" : "R" + opt.price}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PAYMENT */}
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 400, marginBottom: 8 }}>Payment</h2>
          <p style={{ fontSize: 13, color: "#8a8690", marginBottom: 16 }}>All transactions are secure and encrypted.</p>
          <div style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 14, overflow: "hidden", marginBottom: 32 }}>
            {cc.payfast_enabled && (
              <div>
                <div onClick={() => setPaymentMethod("payfast")} style={{ padding: "16px 20px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", background: paymentMethod === "payfast" ? "rgba(156,124,98,0.04)" : "#fff", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 20, height: 20, borderRadius: "50%", border: paymentMethod === "payfast" ? "6px solid " + accent : "2px solid rgba(0,0,0,0.15)" }} />
                    <span style={{ fontSize: 14, fontWeight: paymentMethod === "payfast" ? 600 : 400 }}>PayFast</span>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <span style={{ padding: "2px 6px", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 4, fontSize: 10, fontWeight: 700 }}>VISA</span>
                    <span style={{ padding: "2px 6px", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 4, fontSize: 10, fontWeight: 700 }}>MC</span>
                    <span style={{ padding: "2px 6px", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 4, fontSize: 10, fontWeight: 700 }}>EFT</span>
                  </div>
                </div>
                {paymentMethod === "payfast" && <div style={{ padding: "16px 20px", background: "#fff", fontSize: 13, color: "#8a8690", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>You'll be redirected to PayFast to complete your payment.</div>}
              </div>
            )}
            {cc.eft_enabled && (
              <div>
                <div onClick={() => setPaymentMethod("eft")} style={{ padding: "16px 20px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, background: paymentMethod === "eft" ? "rgba(156,124,98,0.04)" : "#fff" }}>
                  <div style={{ width: 20, height: 20, borderRadius: "50%", border: paymentMethod === "eft" ? "6px solid " + accent : "2px solid rgba(0,0,0,0.15)" }} />
                  <span style={{ fontSize: 14, fontWeight: paymentMethod === "eft" ? 600 : 400 }}>EFT / Direct Deposit</span>
                </div>
                {paymentMethod === "eft" && (
                  <div style={{ padding: "20px", background: "#fff", fontSize: 13, lineHeight: 1.7, color: "#2a2a2e" }}>
                    <p style={{ fontWeight: 700, marginBottom: 12 }}>Banking Details:</p>
                    {cc.eft_bank_name && <p>Bank: {cc.eft_bank_name}</p>}
                    {cc.eft_account_number && <p>Account: {cc.eft_account_number}</p>}
                    {cc.eft_account_name && <p>Name: {cc.eft_account_name}</p>}
                    {cc.eft_branch_code && <p>Branch: {cc.eft_branch_code}</p>}
                    {cc.eft_account_type && <p>Type: {cc.eft_account_type}</p>}
                    {cc.eft_instructions && <div style={{ marginTop: 16, padding: 16, background: "#f6f3ef", borderRadius: 10, whiteSpace: "pre-wrap" }}>{cc.eft_instructions}</div>}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* PLACE ORDER */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
            <a href={"/store/" + slug} style={{ fontSize: 13, color: accent, textDecoration: "none" }}>&larr; Return to store</a>
            <button onClick={placeOrder} disabled={placing} style={{ padding: "18px 48px", background: "#22c55e", color: "#fff", border: "none", borderRadius: 100, fontFamily: "'Jost', sans-serif", fontSize: 14, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", cursor: placing ? "not-allowed" : "pointer", opacity: placing ? 0.6 : 1 }}>{placing ? "Placing..." : paymentMethod === "payfast" ? "Pay Now - R" + total.toFixed(0) : "Complete Order - R" + total.toFixed(0)}</button>
          </div>
        </div>

        {/* RIGHT - ORDER SUMMARY */}
        <div className="ck-summary" style={{ padding: "32px 24px", borderLeft: "1px solid rgba(0,0,0,0.06)", background: "rgba(0,0,0,0.015)" }}>
          <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 400, marginBottom: 20 }}>Order Summary</h3>
          {cart.map((item, i) => (
            <div key={i} style={{ display: "flex", gap: 14, marginBottom: 16, alignItems: "center" }}>
              <div style={{ position: "relative" }}>
                {item.image ? <img src={item.image} alt="" style={{ width: 60, height: 72, borderRadius: 10, objectFit: "cover", border: "1px solid rgba(0,0,0,0.06)" }} /> : <div style={{ width: 60, height: 72, borderRadius: 10, background: "#e0d5ca" }} />}
                <span style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", background: "#8a8690", color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{item.qty}</span>
              </div>
              <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 500 }}>{item.name}</div>{item.variant && <div style={{ fontSize: 12, color: "#8a8690" }}>{item.variant}</div>}</div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>R{(item.price * item.qty).toFixed(0)}</div>
            </div>
          ))}
          <div style={{ borderTop: "1px solid rgba(0,0,0,0.06)", paddingTop: 16, marginTop: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 14, color: "#8a8690" }}><span>Subtotal ({itemCount} item{itemCount !== 1 ? "s" : ""})</span><span>R{subtotal.toFixed(0)}</span></div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 14, color: "#8a8690" }}><span>Shipping</span><span>{shipping === 0 ? (fulfillment === "pickup" ? "Pickup" : "Free") : "R" + shipping}</span></div>
          </div>
          <div style={{ borderTop: "1px solid rgba(0,0,0,0.06)", paddingTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>Total</span>
            <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 500 }}>R{total.toFixed(0)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
