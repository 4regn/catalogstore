"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../../../lib/supabase";

type AccountData = {
  profile: { email: string; full_name: string | null; avatar_url: string | null; created_at: string };
  designs: Array<{
    id: string; source: string | null; name: string | null; garment: string | null; colour: string | null; size: string | null; style: string | null;
    options: Record<string, unknown> | null; preview_url: string | null; mockup_url: string | null; mockup_back_url: string | null;
    original_front_url: string | null; original_back_url: string | null; created_at: string;
  }>;
  orders: Array<{ id: string; order_number: string | null; items: Array<{ name?: string; image?: string; preview?: string }> | null; total: number; status: string; payment_status: string; created_at: string }>;
  generationLimit: { used: number; limit: number; remaining: number };
};

type OrderDetail = {
  id: string; status: string; paymentStatus: string; total: number; orderNumber: string | null;
  items: Array<{ name?: string; image?: string; preview?: string; qty?: number; price?: number }> | null;
  createdAt: string; fulfillmentMethod: string | null; shippingOption: string | null;
  shippingAddress: { address?: string; apartment?: string; city?: string; province?: string; postal_code?: string } | null;
  shippingCost: number | null;
};

const TRACK_STEPS: Array<{ key: string; label: string }> = [
  { key: "pending", label: "Pending fulfilment" },
  { key: "fulfilled", label: "Order fulfilled" },
  { key: "awaiting_pickup", label: "Awaiting courier pick up" },
  { key: "picked_up", label: "Picked up" },
  { key: "in_transit", label: "In transit" },
  { key: "out_for_delivery", label: "Out for delivery" },
  { key: "delivered", label: "Delivered" },
];
const trackIndex = (status: string) => { const s = status === "confirmed" ? "pending" : status; const i = TRACK_STEPS.findIndex((t) => t.key === s); return i < 0 ? 0 : i; };

const money = (value: number) => new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(Number(value || 0));
const date = (value: string) => new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));

export default function UnikAccountClient({ storeName }: { storeName: string }) {
  const [sessionReady, setSessionReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [account, setAccount] = useState<AccountData | null>(null);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selectedDesign, setSelectedDesign] = useState<AccountData["designs"][number] | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [orderDetail, setOrderDetail] = useState<OrderDetail | null>(null);
  const [orderDetailError, setOrderDetailError] = useState("");

  const loadAccount = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    setSignedIn(Boolean(token));
    setSessionReady(true);
    if (!token) { setAccount(null); return; }

    const sessionResponse = await fetch("/api/unik/auth/session", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken: token }),
      cache: "no-store",
    });
    const sessionPayload = await sessionResponse.json().catch(() => ({}));
    if (!sessionResponse.ok) {
      throw new Error(sessionPayload.error || "Could not connect your UNIK session");
    }

    const sessionCheck = await fetch("/api/unik/auth/session", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
    if (!sessionCheck.ok) {
      throw new Error("Your sign-in could not be connected to the Studio. Please sign in again.");
    }

    const response = await fetch("/api/unik/account", { credentials: "include", headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Could not load your account");
    setAccount(payload);
    const next = new URLSearchParams(window.location.search).get("next");
    if (next?.startsWith("/") && !next.startsWith("//") && !next.startsWith("/account")) {
      window.location.replace(next);
    }
  }, []);

  useEffect(() => {
    loadAccount().catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load your account"));
    const { data } = supabase.auth.onAuthStateChange(() => {
      window.setTimeout(() => loadAccount().catch(() => undefined), 0);
    });
    return () => data.subscription.unsubscribe();
  }, [loadAccount]);

  async function googleSignIn() {
    setBusy(true); setError("");
    const redirectTo = window.location.href.split("#")[0];
    const { error: authError } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
    if (authError) { setError(authError.message); setBusy(false); }
  }

  async function emailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    const values = new FormData(event.currentTarget);
    const email = String(values.get("email") || "").trim().toLowerCase();
    const password = String(values.get("password") || "");
    const fullName = String(values.get("fullName") || "").trim();

    if (mode === "signup") {
      const { data, error: authError } = await supabase.auth.signUp({
        email, password,
        options: { data: { full_name: fullName }, emailRedirectTo: window.location.href.split("#")[0] },
      });
      if (authError) setError(authError.message);
      else if (!data.session) setMessage("Check your email to confirm your account, then return here to sign in.");
      else await loadAccount();
    } else {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) setError(authError.message);
      else await loadAccount();
    }
    setBusy(false);
  }

  useEffect(() => {
    if (!selectedOrderId) { setOrderDetail(null); setOrderDetailError(""); return; }
    let cancelled = false;
    setOrderDetail(null); setOrderDetailError("");
    fetch(`/api/unik/orders/${encodeURIComponent(selectedOrderId)}`, { credentials: "include", cache: "no-store" })
      .then(async (res) => { const payload = await res.json().catch(() => ({})); if (!res.ok) throw new Error(payload.error || "Could not load this order"); return payload; })
      .then((payload) => { if (!cancelled) setOrderDetail(payload.order || null); })
      .catch((cause) => { if (!cancelled) setOrderDetailError(cause instanceof Error ? cause.message : "Could not load this order"); });
    return () => { cancelled = true; };
  }, [selectedOrderId]);

  async function signOut() {
    setBusy(true);
    await fetch("/api/unik/auth/session", { method: "DELETE", credentials: "include" });
    await supabase.auth.signOut();
    setAccount(null); setSignedIn(false); setBusy(false);
  }

  function addDesignToCart(design: AccountData["designs"][number]) {
    const key = "unik-labs-cart-v1";
    let items: Array<Record<string, unknown>> = [];
    try { items = JSON.parse(localStorage.getItem(key) || "[]"); } catch { items = []; }
    const isHoodie = design.garment === "hoodie";
    items.push({
      id: `unik-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      qty: 1,
      addedAt: new Date().toISOString(),
      source: "ai-studio",
      name: design.name || "UNIK Labs AI Design",
      meta: [isHoodie ? "Hoodie" : "Tee", design.colour, design.size, design.style?.replaceAll("_", " ")].filter(Boolean).join(" · "),
      price: isHoodie ? 399 : 349,
      compareAtPrice: isHoodie ? 500 : 450,
      preview: design.mockup_url,
      options: { ...(design.options || {}), designId: design.id, garment: design.garment, colour: design.colour, size: design.size, style: design.style, name: design.name },
    });
    localStorage.setItem(key, JSON.stringify(items));
    window.location.href = "/private-templates/unik-labs/checkout.html";
  }

  const firstName = useMemo(() => (account?.profile.full_name || account?.profile.email || "Member").split(/[ @]/)[0], [account]);

  return (
    <main className="ua-page">
      <header className="ua-nav">
        <a href="/" className="ua-logo" aria-label="UNIK home"><img src="/private-templates/unik-labs/assets/unik-logo-v3-header.png" alt="UNIK — For you. And only you" /></a>
        <a href="/" className="ua-return">Return to studio</a>
      </header>

      {!sessionReady ? <section className="ua-loading">Connecting your secure UNIK session…</section> : !signedIn ? (
        <section className="ua-auth">
          <div className="ua-intro">
            <p className="ua-kicker">UNIK Labs membership</p>
            <h1>Your archive.<br />Your pieces.</h1>
            <p>Sign in to save AI generations, return to unfinished pieces and track every custom order.</p>
          </div>
          <div className="ua-card">
            <button className="ua-google" type="button" onClick={googleSignIn} disabled={busy}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.41Z"/><path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.63-2.43l-3.24-2.54c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.77-5.61-4.14H3.04v2.62A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.39 13.85A6 6 0 0 1 6.08 12c0-.64.11-1.27.31-1.85V7.53H3.04A10 10 0 0 0 2 12c0 1.61.39 3.14 1.04 4.47l3.35-2.62Z"/><path fill="#EA4335" d="M12 6.01c1.47 0 2.79.51 3.83 1.5l2.87-2.88A9.65 9.65 0 0 0 12 2a10 10 0 0 0-8.96 5.53l3.35 2.62C7.18 7.78 9.39 6.01 12 6.01Z"/></svg>
              Continue with Google
            </button>
            <div className="ua-or"><span />or use email<span /></div>
            <form onSubmit={emailSubmit}>
              {mode === "signup" && <label>Full name<input name="fullName" autoComplete="name" required /></label>}
              <label>Email address<input name="email" type="email" autoComplete="email" required /></label>
              <label>Password<input name="password" type="password" minLength={8} autoComplete={mode === "signup" ? "new-password" : "current-password"} required /></label>
              {error && <p className="ua-error">{error}</p>}
              {message && <p className="ua-message">{message}</p>}
              <button className="ua-primary" disabled={busy}>{busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}</button>
            </form>
            <button className="ua-switch" type="button" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); setMessage(""); }}>
              {mode === "signin" ? "New to UNIK? Create an account" : "Already a member? Sign in"}
            </button>
          </div>
        </section>
      ) : !account ? (
        <section className="ua-loading">Signing you in securely…{error && <small>{error}</small>}</section>
      ) : (
        <section className="ua-dashboard">
          <div className="ua-dashboard-head">
            <div><p className="ua-kicker">{storeName} member</p><h1>Welcome, {firstName}.</h1><p>{account.profile.email}</p></div>
            <button className="ua-signout" onClick={signOut} disabled={busy}>Sign out</button>
          </div>
          <div className="ua-allowance"><span>AI allowance</span><strong>{account.generationLimit.remaining} of 3 remaining</strong><small>Rolling 24-hour window</small></div>
          <div className="ua-grid">
            <section><div className="ua-section-head"><h2>Generation history</h2><span>{account.designs.length} pieces</span></div>
              <div className="ua-list">{account.designs.length ? account.designs.map((design) => <button className="ua-item" key={design.id} type="button" onClick={() => setSelectedDesign(design)}>
                {(design.mockup_url || design.preview_url) ? <img src={design.mockup_url || design.preview_url || ""} alt="" /> : <div className="ua-thumb" />}
                <div><strong>{design.name || "UNIK AI Design"}</strong><p>{[design.garment, design.colour, design.size, design.style].filter(Boolean).join(" · ")}</p><small>{date(design.created_at)} · View piece</small></div>
              </button>) : <div className="ua-empty">Your saved generations will appear here.<br /><a href="/">Create your first piece</a></div>}</div>
            </section>
            <section><div className="ua-section-head"><h2>Order history</h2><span>{account.orders.length} orders</span></div>
              <div className="ua-list">{account.orders.length ? account.orders.map((order) => { const preview = order.items?.find((item) => item.image || item.preview); return <button className="ua-item" key={order.id} type="button" onClick={() => setSelectedOrderId(order.id)}>
                {(preview?.image || preview?.preview) ? <img src={preview.image || preview.preview || ""} alt="" /> : <div className="ua-thumb" />}
                <div><strong>{order.order_number || order.id.slice(0, 8).toUpperCase()}</strong><p>{money(order.total)} · {(order.payment_status === "paid" ? order.status : order.payment_status).replace(/_/g, " ")}</p><small>{date(order.created_at)} · Track order</small></div>
              </button>; }) : <div className="ua-empty">No orders yet.<br /><a href="/">Design your first garment</a></div>}</div>
            </section>
          </div>
        </section>
      )}
      {selectedDesign && (() => {
        const isCustom = selectedDesign.source === "custom-upload";
        const zone = isCustom ? String((selectedDesign.options as any)?.zone || "") : "";
        const both = zone === "both";
        const slots: Array<{ src: string | null; alt: string; caption: string }> = isCustom
          ? [
              { src: selectedDesign.mockup_url, alt: "Front garment mockup", caption: both ? "Front mockup" : "Garment mockup" },
              ...(both ? [{ src: selectedDesign.mockup_back_url, alt: "Back garment mockup", caption: "Back mockup" }] : []),
              { src: selectedDesign.original_front_url, alt: "Uploaded design (front)", caption: both ? "Uploaded design (front)" : "Uploaded design" },
              ...(both ? [{ src: selectedDesign.original_back_url, alt: "Uploaded design (back)", caption: "Uploaded design (back)" }] : []),
            ]
          : [
              { src: selectedDesign.mockup_url, alt: "Garment mockup", caption: "Garment mockup" },
              { src: selectedDesign.preview_url, alt: "Watermarked generated design", caption: "Watermarked design" },
            ];
        return (
          <div className="ua-design-modal" role="dialog" aria-modal="true" aria-label="Saved UNIK design" onClick={() => setSelectedDesign(null)}>
            <section className="ua-design-card" onClick={(event) => event.stopPropagation()}>
              <button className="ua-design-close" type="button" onClick={() => setSelectedDesign(null)} aria-label="Close">×</button>
              <div className={`ua-design-images${slots.length > 2 ? " four" : ""}`}>
                {slots.map((slot, i) => (
                  <figure key={i}>
                    {slot.src ? <img src={slot.src} alt={slot.alt} onClick={() => setLightbox(slot.src)} style={{ cursor: "zoom-in" }} /> : <div className="ua-design-placeholder" />}
                    <figcaption>{slot.caption}</figcaption>
                  </figure>
                ))}
              </div>
              <div className="ua-design-info">
                <p className="ua-kicker">{isCustom ? "Custom upload" : "Saved generation"}</p>
                <h2>{selectedDesign.name || "UNIK AI Design"}</h2>
                <p>{[selectedDesign.garment, selectedDesign.colour, selectedDesign.size, selectedDesign.style?.replaceAll("_", " ")].filter(Boolean).join(" · ")}</p>
                {!isCustom && <button className="ua-design-cart" type="button" onClick={() => addDesignToCart(selectedDesign)}>Add to cart · {money(selectedDesign.garment === "hoodie" ? 399 : 349)}</button>}
              </div>
            </section>
          </div>
        );
      })()}
      {lightbox && <div className="ua-lightbox" role="dialog" aria-modal="true" aria-label="Full size image" onClick={() => setLightbox(null)}>
        <button className="ua-design-close" type="button" onClick={() => setLightbox(null)} aria-label="Close">×</button>
        <img src={lightbox} alt="" />
      </div>}
      {selectedOrderId && <div className="ua-design-modal" role="dialog" aria-modal="true" aria-label="Order tracking" onClick={() => setSelectedOrderId(null)}>
        <section className="ua-order-card" onClick={(event) => event.stopPropagation()}>
          <button className="ua-design-close" type="button" onClick={() => setSelectedOrderId(null)} aria-label="Close">×</button>
          {orderDetailError ? <p className="ua-error">{orderDetailError}</p> : !orderDetail ? <p className="ua-order-loading">Loading order…</p> : (
            <>
              <p className="ua-kicker">Order {orderDetail.orderNumber || orderDetail.id.slice(0, 8).toUpperCase()}</p>
              <h2>{money(orderDetail.total)}</h2>
              <p className="ua-order-meta">{date(orderDetail.createdAt)} · {orderDetail.fulfillmentMethod === "pickup" ? "Studio pickup" : (orderDetail.shippingOption || "Delivery")}</p>
              {orderDetail.paymentStatus !== "paid" ? (
                <p className="ua-order-pending">Payment {orderDetail.paymentStatus}. Tracking begins once payment is confirmed.</p>
              ) : orderDetail.status === "cancelled" ? (
                <p className="ua-order-cancelled">This order was cancelled.</p>
              ) : (
                <ol className="ua-track">
                  {TRACK_STEPS.map((step, i) => {
                    const current = trackIndex(orderDetail.status);
                    const state = i < current ? "done" : i === current ? "current" : "todo";
                    return <li key={step.key} className={state}><span className="ua-track-dot" />{step.label}</li>;
                  })}
                </ol>
              )}
              {orderDetail.shippingAddress && orderDetail.fulfillmentMethod !== "pickup" && (
                <div className="ua-order-address">
                  <p className="ua-kicker">Delivery address</p>
                  <p>{[orderDetail.shippingAddress.address, orderDetail.shippingAddress.apartment, orderDetail.shippingAddress.city, orderDetail.shippingAddress.province, orderDetail.shippingAddress.postal_code].filter(Boolean).join(", ")}</p>
                </div>
              )}
              <div className="ua-order-items">
                {(orderDetail.items || []).map((item, i) => (
                  <div className="ua-order-item" key={i}>
                    {(item.image || item.preview) ? <img src={item.image || item.preview} alt="" /> : <div className="ua-thumb" />}
                    <div><strong>{item.name}</strong><small>Qty {item.qty} · {money(Number(item.price) || 0)}</small></div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>}
      <style jsx global>{`
        *{box-sizing:border-box}html,body{margin:0;background:#080909;color:#f4f1e9;font-family:Arial,sans-serif}.ua-page{min-height:100dvh;background:radial-gradient(circle at 15% 0%,#1a1d1b 0,transparent 34%),#080909}.ua-nav{height:78px;border-bottom:1px solid #292c29;display:flex;align-items:center;justify-content:space-between;padding:0 max(22px,calc((100vw - 1160px)/2))}.ua-logo{color:#fff;text-decoration:none;font-size:28px;letter-spacing:.28em;font-weight:300}.ua-logo span{display:block;font-size:5px;letter-spacing:.48em;margin-top:4px}.ua-return,.ua-signout{color:#d8d5cd;font-size:10px;letter-spacing:.14em;text-transform:uppercase;text-decoration:none;background:none;border:0;cursor:pointer}.ua-auth,.ua-dashboard{width:min(1160px,calc(100% - 36px));margin:0 auto;padding:72px 0 100px}.ua-auth{display:grid;grid-template-columns:1.1fr .9fr;gap:70px;align-items:center}.ua-kicker{font-size:10px!important;letter-spacing:.24em;text-transform:uppercase;color:#969a93!important;margin:0 0 18px!important}.ua-intro h1,.ua-dashboard-head h1{font-family:Georgia,serif;font-weight:400;text-transform:uppercase;line-height:.86;margin:0;font-size:clamp(58px,9vw,112px)}.ua-intro>p:last-child{color:#a6a8a2;max-width:540px;line-height:1.7}.ua-card{background:#111311;border:1px solid #30332f;border-radius:24px;padding:30px}.ua-google,.ua-primary{width:100%;height:52px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.08em;cursor:pointer}.ua-google{background:#fff;color:#111;border:0;display:flex;align-items:center;justify-content:center;gap:12px}.ua-google svg{width:19px}.ua-or{display:flex;align-items:center;gap:12px;color:#777b74;font-size:9px;text-transform:uppercase;letter-spacing:.16em;margin:24px 0}.ua-or span{height:1px;background:#30332f;flex:1}.ua-card label{display:grid;gap:7px;font-size:9px;text-transform:uppercase;letter-spacing:.16em;color:#94978f;margin:14px 0}.ua-card input{height:48px;border:1px solid #363934;border-radius:12px;background:#090a09;color:#fff;padding:0 14px;font-size:14px;outline:none}.ua-card input:focus{border-color:#d9d7ce}.ua-primary{border:1px solid #007517;background:#007517;color:#fff;margin-top:10px}.ua-switch{width:100%;background:none;border:0;color:#b8bab4;font-size:10px;margin-top:20px;cursor:pointer}.ua-error,.ua-message{font-size:11px;line-height:1.5}.ua-error{color:#ff8d82}.ua-message{color:#8bd69a}.ua-loading{min-height:calc(100dvh - 78px);display:grid;place-content:center;text-align:center;color:#a6a8a2;letter-spacing:.08em}.ua-loading small{display:block;margin-top:12px;color:#ff8d82}.ua-dashboard-head{display:flex;align-items:end;justify-content:space-between;gap:24px}.ua-dashboard-head h1{font-size:clamp(52px,7vw,90px)}.ua-dashboard-head p{color:#989b94}.ua-signout{border:1px solid #41443f;border-radius:999px;padding:13px 18px}.ua-allowance{display:grid;grid-template-columns:1fr auto;gap:5px 20px;background:#101210;border:1px solid #2c2f2b;border-radius:18px;padding:20px;margin:42px 0 28px}.ua-allowance span,.ua-allowance small{font-size:9px;letter-spacing:.15em;text-transform:uppercase;color:#969991}.ua-allowance strong{grid-row:span 2;font-size:16px;align-self:center}.ua-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}.ua-grid>section{min-width:0}.ua-section-head{display:flex;justify-content:space-between;align-items:center;margin:16px 2px}.ua-section-head h2{font-size:11px;text-transform:uppercase;letter-spacing:.18em;margin:0}.ua-section-head span{font-size:9px;color:#898c85;text-transform:uppercase;letter-spacing:.12em}.ua-list{display:grid;gap:10px}.ua-item{display:grid;grid-template-columns:74px 1fr;gap:15px;padding:12px;background:#111311;border:1px solid #2c2f2b;border-radius:16px;align-items:center}.ua-item img,.ua-thumb{width:74px;aspect-ratio:3/4;object-fit:cover;border-radius:10px;background:#1a1c1a}.ua-item strong{font-size:12px}.ua-item p,.ua-item small{color:#92958e;font-size:10px;line-height:1.5}.ua-item p{margin:6px 0}.ua-empty{border:1px dashed #343732;border-radius:16px;padding:34px;text-align:center;color:#8e918a;font-size:11px;line-height:1.7}.ua-empty a{color:#fff}.ua-google:disabled,.ua-primary:disabled{opacity:.55;cursor:wait}@media(max-width:800px){.ua-auth,.ua-grid{grid-template-columns:1fr}.ua-auth{gap:42px;padding-top:46px}.ua-dashboard-head{align-items:flex-start;flex-direction:column}.ua-logo{font-size:21px}.ua-return{font-size:8px}.ua-allowance{grid-template-columns:1fr}.ua-allowance strong{grid-row:auto}}
        .ua-logo{display:flex;align-items:center;text-decoration:none;line-height:0}
        .ua-logo img{display:block;width:124px;height:auto;object-fit:contain}
        @media(max-width:800px){.ua-logo img{width:110px}}
        button.ua-item{width:100%;color:inherit;text-align:left;font:inherit;cursor:pointer;transition:border-color .2s,transform .2s}button.ua-item:hover{border-color:#666b62;transform:translateY(-1px)}
        .ua-design-modal{position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.82);backdrop-filter:blur(12px);display:grid;place-items:center;padding:20px}.ua-design-card{position:relative;width:min(960px,100%);max-height:92vh;overflow:auto;background:#101210;border:1px solid #3b3f39;border-radius:24px;padding:24px;display:grid;grid-template-columns:1.35fr .65fr;gap:28px}.ua-design-close{position:absolute;right:16px;top:14px;z-index:2;width:38px;height:38px;border:1px solid #4a4e47;border-radius:50%;background:rgba(10,11,10,.78);color:#fff;font-size:24px;cursor:pointer}.ua-design-images{display:grid;grid-template-columns:1fr 1fr;gap:12px}.ua-design-images.four{grid-template-columns:1fr 1fr}.ua-design-images figure{margin:0;min-width:0}.ua-design-images img,.ua-design-placeholder{display:block;width:100%;aspect-ratio:3/4;object-fit:contain;border-radius:14px;background:#20231f}.ua-design-images figcaption{margin-top:9px;color:#8f938b;font-size:8px;letter-spacing:.16em;text-transform:uppercase}.ua-design-info{align-self:center}.ua-design-info h2{font-family:Georgia,serif;font-size:clamp(34px,5vw,58px);font-weight:400;line-height:.9;text-transform:uppercase;margin:0 0 18px}.ua-design-info>p:not(.ua-kicker){color:#9da098;font-size:10px;line-height:1.7;text-transform:uppercase;letter-spacing:.1em}.ua-design-cart{width:100%;min-height:52px;margin-top:18px;border:0;border-radius:999px;background:#007517;color:#fff;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;cursor:pointer}@media(max-width:760px){.ua-design-card{grid-template-columns:1fr;padding:18px}.ua-design-images{gap:8px}.ua-design-info{padding:4px}.ua-design-close{right:10px;top:10px}}
        .ua-lightbox{position:fixed;inset:0;z-index:1100;background:rgba(0,0,0,.92);display:grid;place-items:center;padding:30px;cursor:zoom-out}.ua-lightbox img{max-width:100%;max-height:90vh;object-fit:contain;border-radius:8px}
        .ua-order-card{position:relative;width:min(640px,100%);max-height:92vh;overflow:auto;background:#101210;border:1px solid #3b3f39;border-radius:24px;padding:28px}.ua-order-card h2{font-family:Georgia,serif;font-size:clamp(30px,5vw,44px);font-weight:400;margin:2px 0 10px}.ua-order-meta{color:#9da098;font-size:10px;letter-spacing:.1em;text-transform:uppercase;margin:0 0 20px}.ua-order-loading{color:#a6a8a2;text-align:center;padding:40px 0}
        .ua-order-pending{color:#ffcf8d;font-size:11px;letter-spacing:.05em;background:#1c1712;border:1px solid #3a2f20;border-radius:12px;padding:14px 16px;margin:0 0 20px}.ua-order-cancelled{color:#ff8d82;font-size:11px;letter-spacing:.05em;background:#1c1212;border:1px solid #3a2020;border-radius:12px;padding:14px 16px;margin:0 0 20px}
        .ua-track{list-style:none;margin:0 0 24px;padding:0;display:grid;gap:0}.ua-track li{position:relative;padding:0 0 20px 26px;font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:#6d7069}.ua-track li:last-child{padding-bottom:0}.ua-track li::before{content:'';position:absolute;left:5px;top:14px;bottom:-6px;width:1px;background:#2c2f2b}.ua-track li:last-child::before{display:none}.ua-track-dot{position:absolute;left:0;top:2px;width:11px;height:11px;border-radius:50%;background:#1a1c1a;border:2px solid #3a3d38}.ua-track li.done{color:#8bd69a}.ua-track li.done .ua-track-dot{background:#007517;border-color:#007517}.ua-track li.current{color:#f4f1e9;font-weight:700}.ua-track li.current .ua-track-dot{background:#007517;border-color:#007517;box-shadow:0 0 0 4px rgba(0,117,23,.25)}
        .ua-order-address{border:1px solid #2c2f2b;border-radius:14px;padding:14px 16px;margin-bottom:20px}.ua-order-address p:not(.ua-kicker){color:#c9c7bd;font-size:11px;line-height:1.6;margin:0}
        .ua-order-items{display:grid;gap:10px}.ua-order-item{display:grid;grid-template-columns:52px 1fr;gap:12px;align-items:center;padding:8px;background:#0d0f0d;border:1px solid #262924;border-radius:12px}.ua-order-item img,.ua-order-item .ua-thumb{width:52px;aspect-ratio:3/4;object-fit:cover;border-radius:8px}.ua-order-item strong{font-size:11px;display:block;margin-bottom:4px}.ua-order-item small{color:#8f928a;font-size:10px}
        @media(max-width:760px){.ua-order-card{padding:18px}}
      `}</style>
    </main>
  );
}
