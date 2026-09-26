"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usesCleanStorePaths } from "../../../../lib/store-url";
import { FOUR_REGN_TRACKING_STAGES } from "../../../../lib/four-regn-tracking";

type Seller = { subdomain: string; store_name: string; logo_url?: string | null };
type AccountData = { customer: any; orders: any[]; wishlist: any[]; laybuyPlans: any[] };
const statusLabel = (s: string) => (s || "pending").replace(/_/g, " ");
const orderReference = (order: any) => order.external_id
  ? String(order.external_id).replace(/^#?/, "#")
  : `#${order.order_number}D`;

export default function FourRegnAccountClient({ seller }: { seller: Seller }) {
  const router = useRouter();
  const storeHref = (suffix = "") => typeof window !== "undefined" && usesCleanStorePaths(window.location.hostname) ? (suffix || "/") : `/store/${seller.subdomain}${suffix}`;
  const [data, setData] = useState<AccountData | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"login" | "email" | "activate">("login");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [code, setCode] = useState("");
  const [error, setError] = useState(""); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  const [activeOrder, setActiveOrder] = useState<any | null>(null);
  const [laybuyAmounts, setLaybuyAmounts] = useState<Record<string, string>>({});
  const [laybuyBusyId, setLaybuyBusyId] = useState("");
  const [laybuyPayError, setLaybuyPayError] = useState("");

  const load = async () => {
    const res = await fetch(`/api/customer-account/me?slug=${encodeURIComponent(seller.subdomain)}`, { cache: "no-store" });
    if (res.ok) {
      const accountData: AccountData = await res.json();
      // Merge hearts saved before sign-in/activation into the server-backed
      // wishlist, preserving the Shopify-like guest-to-account journey.
      try {
        const local: any[] = JSON.parse(localStorage.getItem(`catalogstore-wishlist-v1:${seller.subdomain.toLowerCase()}`) || "[]");
        const serverIds = new Set(accountData.wishlist.map((p) => p.id));
        const missing = local.filter((p) => p?.id && !serverIds.has(p.id));
        await Promise.all(missing.map((p) => fetch("/api/customer-account/wishlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: seller.subdomain, productId: p.id }) })));
        accountData.wishlist = [...accountData.wishlist, ...missing];
        localStorage.setItem(`catalogstore-wishlist-v1:${seller.subdomain.toLowerCase()}`, JSON.stringify(accountData.wishlist));
      } catch {}
      setData(accountData);
      setActiveOrder((current: any | null) => current ? accountData.orders.find((order) => order.id === current.id) || current : current);
    }
    setLoading(false);
  };
  useEffect(() => {
    load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") load(); }, 30_000);
    return () => window.clearInterval(timer);
  }, []);
  // Same self-heal reasoning as the checkout return page (order-status) --
  // landing back here after a Lay-Buy top-up checks that specific payment
  // directly in case Yoco's webhook is late, then refreshes the balance
  // immediately instead of waiting on it. Runs once on mount only.
  useEffect(() => {
    const paymentId = new URLSearchParams(window.location.search).get("laybuy_paid");
    if (!paymentId) return;
    window.history.replaceState(null, "", window.location.pathname);
    fetch(`/api/customer-account/laybuy/status?paymentId=${encodeURIComponent(paymentId)}&slug=${encodeURIComponent(seller.subdomain)}`)
      .then(() => load())
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const payLaybuy = async (planId: string, remaining: number) => {
    const raw = laybuyAmounts[planId];
    const amount = Math.round(Number(raw ?? remaining) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) { setLaybuyPayError("Enter a valid amount"); return; }
    if (amount > remaining) { setLaybuyPayError(`Your remaining balance is R${remaining.toFixed(2)}`); return; }
    setLaybuyPayError("");
    setLaybuyBusyId(planId);
    try {
      const res = await fetch("/api/customer-account/laybuy/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: seller.subdomain, planId, amount, returnOrigin: window.location.origin }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.redirectUrl) { setLaybuyPayError(json.error || "Could not start payment"); setLaybuyBusyId(""); return; }
      window.location.href = json.redirectUrl;
    } catch {
      setLaybuyPayError("Network error starting payment");
      setLaybuyBusyId("");
    }
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(""); setMessage("");
    const endpoint = mode === "login" ? "login" : mode === "email" ? "request-code" : "activate";
    const res = await fetch(`/api/customer-account/${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: seller.subdomain, email, password, code }) });
    const json = await res.json().catch(() => ({})); setBusy(false);
    if (!res.ok) { setError(json.error || "Something went wrong"); return; }
    if (mode === "email") { setMessage(json.message); setMode("activate"); return; }
    await load();
  };
  const logout = async () => { await fetch("/api/customer-account/logout", { method: "POST" }); setData(null); setMode("login"); };
  const removeWish = async (productId: string) => { await fetch("/api/customer-account/wishlist", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: seller.subdomain, productId }) }); setData((d) => { if (!d) return d; const wishlist = d.wishlist.filter((p) => p.id !== productId); try { localStorage.setItem(`catalogstore-wishlist-v1:${seller.subdomain.toLowerCase()}`, JSON.stringify(wishlist)); } catch {} return { ...d, wishlist }; }); };

  return <main className="fa">
    <style>{CSS + `.guesttrack{display:block;text-align:center;margin-top:14px;color:#333;font-size:10px}.sectionhead a{font-size:9px;text-transform:uppercase;letter-spacing:.15em;color:#777}.trackingtime{color:#333!important;font-weight:700}.trackingcancelled{margin:22px 0;padding:16px;border-radius:12px;background:#fff0ed;color:#a92d23;font-size:12px;font-weight:700}.customernote{white-space:pre-wrap;margin:0 0 22px;padding:15px;border-radius:12px;background:#ecece8;color:#555;font-size:12px;line-height:1.6}.customernote strong{display:block;color:#222;font-size:9px;text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px}.deliverymethod{margin:0 0 22px;padding:14px;border-radius:12px;background:#ecece8;font-size:10px;text-transform:uppercase;letter-spacing:.08em}.deliverymethod strong{display:block;margin-top:5px;color:#222}`}</style>
    <header><a href="../" className="brand">{seller.logo_url ? <img src={seller.logo_url} alt={seller.store_name}/> : seller.store_name}</a>{data && <button onClick={logout}>Sign out</button>}</header>
    {loading ? <div className="loading">Loading your account…</div> : !data ? <section className="auth">
      <div><span className="eyebrow">4REGN MEMBERS</span><h1>Your wardrobe.<br/>Your orders.<br/>One place.</h1><p>Save favourites, follow every delivery, and keep your order history close.</p></div>
      <form onSubmit={submit}><div className="formtop"><span>{mode === "login" ? "WELCOME BACK" : mode === "email" ? "ACTIVATE ACCOUNT" : "CONFIRM YOUR EMAIL"}</span><h2>{mode === "login" ? "Sign in" : mode === "email" ? "Find your account" : "Create your password"}</h2></div>
        <label>Email<input type="email" required value={email} onChange={(e)=>setEmail(e.target.value)} autoComplete="email"/></label>
        {mode === "activate" && <label>6-digit code<input inputMode="numeric" maxLength={6} required value={code} onChange={(e)=>setCode(e.target.value.replace(/\D/g,""))}/></label>}
        {mode !== "email" && <label>Password<input type="password" required minLength={8} value={password} onChange={(e)=>setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"}/></label>}
        {message && <p className="success">{message}</p>}{error && <p className="error">{error}</p>}
        <button className="primary" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : mode === "email" ? "Send confirmation code" : "Activate account"}</button>
        <button type="button" className="switch" onClick={()=>{setMode(mode === "login" ? "email" : "login");setError("");setMessage("")}}>{mode === "login" ? "First time here? Link your existing account" : "Already activated? Sign in"}</button>
        <a className="guesttrack" href={storeHref("/track")}>Track an order without signing in</a>
      </form>
    </section> : <section className="dash">
      <div className="hello"><span className="eyebrow">YOUR 4REGN ACCOUNT</span><h1>Hey, {data.customer.first_name || "there"}.</h1><p>{data.orders.length} orders · {data.wishlist.length} saved products</p></div>
      {data.laybuyPlans.length > 0 && <section className="laybuysec">
        <div className="sectionhead"><h2>Lay-Buy</h2><span>{data.laybuyPlans.filter((p) => p.status === "active").length} active</span></div>
        {data.laybuyPlans.map((plan) => {
          const remaining = Math.max(0, Math.round((Number(plan.total_amount) - Number(plan.paid_amount)) * 100) / 100);
          const pct = Math.min(100, Math.round((Number(plan.paid_amount) / Number(plan.total_amount)) * 100));
          return (
            <div className="laybuyplan" key={plan.id}>
              <div className="laybuyplan-top">
                <div><strong>{orderReference(plan.order)}</strong><small>{new Date(plan.created_at).toLocaleDateString("en-ZA")}</small></div>
                <span className={`status ${plan.status === "paid_off" ? "delivered" : ""}`}>{plan.status === "paid_off" ? "Paid off" : "Active"}</span>
              </div>
              <div className="laybuybar"><div style={{ width: `${pct}%` }} /></div>
              <div className="laybuyplan-nums"><span>R{Number(plan.paid_amount).toFixed(0)} paid</span><span>R{Number(plan.total_amount).toFixed(0)} total</span></div>
              {plan.status === "active" && (
                <div className="laybuypay">
                  <input
                    type="number"
                    min={1}
                    max={remaining}
                    placeholder={`Up to R${remaining.toFixed(0)}`}
                    value={laybuyAmounts[plan.id] ?? ""}
                    onChange={(e) => setLaybuyAmounts((a) => ({ ...a, [plan.id]: e.target.value }))}
                  />
                  <button disabled={laybuyBusyId === plan.id} onClick={() => payLaybuy(plan.id, remaining)}>
                    {laybuyBusyId === plan.id ? "Starting…" : `Pay R${(laybuyAmounts[plan.id] ? Number(laybuyAmounts[plan.id]) || 0 : remaining).toFixed(0)}`}
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {laybuyPayError && <p className="error">{laybuyPayError}</p>}
      </section>}
      {data.laybuyPlans.length === 0 && <section className="laybuypromo">
        <div className="laybuypromo-inner">
          <span className="eyebrow">No Credit Check &middot; Pay Over Time</span>
          <h2>Shop now.<br/>Pay over time.</h2>
          <p>Pay a 30% deposit at checkout, clear the rest whenever you like &mdash; any amount, any time, right here in your account. No interest, no fixed schedule.</p>
          <div className="laybuypromo-stats">
            <div><strong>30%</strong><span>Deposit to start</span></div>
            <div><strong>0%</strong><span>Interest</span></div>
            <div><strong>&infin;</strong><span>Time to pay off</span></div>
          </div>
          <a className="laybuypromo-cta" href={storeHref("/laybuy")}>Explore 4REGN Lay-Buy</a>
        </div>
      </section>}
      <div className="grid"><section><div className="sectionhead"><h2>Orders</h2><a href={storeHref("/track")}>Track without login</a></div>{data.orders.length ? data.orders.map((o)=><button className="order" key={o.id} onClick={()=>setActiveOrder(o)}><div><strong>{orderReference(o)}</strong><small>{new Date(o.created_at).toLocaleDateString("en-ZA")}</small></div><span className={`status ${o.status}`}>{statusLabel(o.status)}</span><b>R{o.total}</b></button>) : <div className="empty">Your orders from #3540D onward will appear here.</div>}</section>
      <section><div className="sectionhead"><h2>Wishlist</h2><span>{data.wishlist.length} saved</span></div><div className="wishes">{data.wishlist.length ? data.wishlist.map((p)=><article key={p.id}><a href={storeHref(`/products/${p.handle || p.id}`)}><img src={p.image_url || ""} alt=""/><strong>{p.name}</strong><span>R {Number(p.price).toLocaleString("en-ZA")}</span></a><button onClick={()=>removeWish(p.id)}>Remove</button></article>) : <div className="empty">Tap the heart on any product to save it here.</div>}</div></section></div>
    </section>}
    {activeOrder && <div className="modal" onClick={()=>setActiveOrder(null)}><div className="orderdetail" onClick={(e)=>e.stopPropagation()}><button className="close" onClick={()=>setActiveOrder(null)}>×</button><span className="eyebrow">ORDER TRACKING</span><h2>{orderReference(activeOrder)}</h2><p>{new Date(activeOrder.created_at).toLocaleString("en-ZA")}</p>{activeOrder.tracking?.updatedAt && <p className="trackingtime">Latest update: {new Date(activeOrder.tracking.updatedAt).toLocaleString("en-ZA")}</p>}{activeOrder.tracking?.cancelled ? <div className="trackingcancelled">This order was cancelled.</div> : <ol>{(activeOrder.tracking?.stages || FOUR_REGN_TRACKING_STAGES).map((stage:any)=><li className={stage.complete?"done":""} key={stage.key}><i/>{stage.label || statusLabel(stage.key)}</li>)}</ol>}{activeOrder.tracking?.customerNote && <p className="customernote"><strong>Update from 4REGN</strong>{activeOrder.tracking.customerNote}</p>}{activeOrder.tracking?.shippingOption && <p className="deliverymethod">Delivery method <strong>{activeOrder.tracking.shippingOption}</strong></p>}<div className="items">{(activeOrder.items||[]).map((it:any,i:number)=><div key={i}>{it.image&&<img src={it.image} alt=""/>}<span><strong>{it.name}</strong><small>{it.variant} · Qty {it.qty}</small></span><b>R{Number(it.price*it.qty).toFixed(0)}</b></div>)}</div></div></div>}
  </main>;
}

const CSS = `*{box-sizing:border-box}.fa{min-height:100vh;background:#f0f0ee;color:#292735;font-family:Arial,sans-serif;padding-bottom:80px}.fa header{height:82px;padding:0 clamp(22px,5vw,70px);display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #dadad6;background:rgba(255,255,255,.72);backdrop-filter:blur(18px)}.fa header button,.switch{border:0;background:none;text-transform:uppercase;letter-spacing:.12em;font-size:10px;cursor:pointer}.brand{font-weight:900;font-size:25px;color:#222;text-decoration:none}.brand img{display:block;max-width:118px;max-height:48px}.auth{max-width:1180px;margin:0 auto;padding:clamp(60px,9vw,120px) 28px;display:grid;grid-template-columns:1.1fr .75fr;gap:9vw;align-items:center}.eyebrow{font-size:10px;font-weight:800;letter-spacing:.2em}.auth h1,.hello h1{font-family:Georgia,serif;font-size:clamp(48px,7vw,96px);font-weight:400;line-height:.92;margin:20px 0 25px}.auth>div p,.hello p{color:#777;line-height:1.7}.auth form{background:#fff;border:1px solid #ddd;border-radius:22px;padding:34px;box-shadow:0 20px 60px rgba(0,0,0,.07)}.formtop span,label{font-size:9px;font-weight:700;letter-spacing:.15em;text-transform:uppercase}.formtop h2{font-family:Georgia,serif;font-size:36px;font-weight:400;margin:9px 0 28px}label{display:block;margin:15px 0}input{display:block;width:100%;height:52px;margin-top:8px;border:1px solid #d4d4d0;border-radius:10px;padding:0 14px;font-size:15px;outline:none}.primary{width:100%;height:54px;border:0;border-radius:999px;background:#111;color:#fff;text-transform:uppercase;letter-spacing:.12em;font-weight:700;margin-top:10px}.switch{width:100%;padding:18px 5px 0;color:#777}.error{color:#bd3025;font-size:12px}.success{color:#177533;font-size:12px}.loading{min-height:70vh;display:grid;place-items:center}.dash{max-width:1220px;margin:auto;padding:70px 28px}.hello h1{font-size:clamp(48px,7vw,82px);margin-bottom:12px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-top:55px}.laybuysec{margin-top:55px}.laybuypromo{margin-top:55px}.laybuypromo-inner{background:#0a0a0a;color:#f4f2ee;border-radius:22px;padding:clamp(36px,5vw,60px);text-align:center}.laybuypromo .eyebrow{color:#e0806f;display:block;margin-bottom:16px}.laybuypromo h2{font-family:Georgia,serif;font-weight:400;font-size:clamp(30px,4.5vw,46px);line-height:1.05;letter-spacing:-.02em;text-transform:uppercase;margin:0 0 18px}.laybuypromo p{color:rgba(244,242,238,.68);font-size:14px;line-height:1.7;max-width:480px;margin:0 auto 34px}.laybuypromo-stats{display:flex;justify-content:center;gap:clamp(20px,5vw,56px);margin-bottom:36px;flex-wrap:wrap}.laybuypromo-stats div{display:grid;gap:6px}.laybuypromo-stats strong{font-family:Georgia,serif;font-size:30px;font-weight:400}.laybuypromo-stats span{font-size:9px;text-transform:uppercase;letter-spacing:.14em;color:rgba(244,242,238,.5)}.laybuypromo-cta{display:inline-block;background:#fff;color:#0a0a0a;text-decoration:none;text-transform:uppercase;letter-spacing:.12em;font-size:11px;font-weight:800;padding:16px 34px;border-radius:999px}.laybuyplan{background:#fff;border:1px solid #ddd;border-radius:14px;padding:18px;margin-bottom:12px}.laybuyplan-top{display:flex;align-items:center;justify-content:space-between}.laybuyplan-top div{display:grid;gap:4px}.laybuyplan-top small{color:#888}.laybuybar{height:6px;border-radius:99px;background:#eee;margin:14px 0 8px;overflow:hidden}.laybuybar div{height:100%;background:#171717;border-radius:99px}.laybuyplan-nums{display:flex;justify-content:space-between;font-size:11px;color:#777}.laybuypay{display:flex;gap:10px;margin-top:14px}.laybuypay input{height:44px;flex:1;border:1px solid #d4d4d0;border-radius:10px;padding:0 12px;font-size:13px;outline:none;margin:0}.laybuypay button{flex:none;height:44px;padding:0 20px;border:0;border-radius:999px;background:#111;color:#fff;text-transform:uppercase;letter-spacing:.08em;font-size:11px;font-weight:700;cursor:pointer}.laybuypay button:disabled{opacity:.6;cursor:default}.sectionhead{display:flex;align-items:end;justify-content:space-between;margin:0 3px 14px}.sectionhead h2{font-family:Georgia,serif;font-size:30px;font-weight:400;margin:0}.sectionhead span{font-size:9px;text-transform:uppercase;letter-spacing:.15em;color:#888}.order{width:100%;display:grid;grid-template-columns:1fr auto auto;gap:18px;align-items:center;text-align:left;background:#fff;border:1px solid #ddd;border-radius:14px;padding:18px;margin-bottom:10px;cursor:pointer}.order div{display:grid;gap:5px}.order small{color:#888}.status{text-transform:uppercase;font-size:9px;letter-spacing:.1em;background:#eee;padding:7px 10px;border-radius:99px}.status.delivered{background:#e4f4e8;color:#15752e}.wishes{display:grid;grid-template-columns:1fr 1fr;gap:12px}.wishes article{position:relative;background:#fff;border-radius:14px;padding:10px;border:1px solid #ddd}.wishes a{text-decoration:none;color:inherit;display:grid;gap:7px}.wishes img{width:100%;aspect-ratio:4/5;object-fit:cover;border-radius:9px;background:#e5e5e2}.wishes strong{font-size:12px}.wishes span{font-size:12px}.wishes button{border:0;background:none;color:#888;font-size:10px;padding:10px 0 2px;cursor:pointer}.empty{padding:36px;border:1px dashed #bbb;border-radius:14px;color:#888;font-size:12px;line-height:1.6;grid-column:1/-1}.modal{position:fixed;inset:0;z-index:1000;background:rgba(20,20,20,.7);backdrop-filter:blur(10px);display:grid;place-items:center;padding:20px}.orderdetail{position:relative;width:min(620px,100%);max-height:90vh;overflow:auto;background:#f7f7f5;border-radius:24px;padding:32px}.close{position:absolute;right:18px;top:18px;border:0;background:#e5e5e1;border-radius:50%;width:36px;height:36px;font-size:24px}.orderdetail h2{font-family:Georgia,serif;font-size:42px;font-weight:400;margin:15px 0 3px}.orderdetail>p{color:#888;font-size:11px}.orderdetail ol{list-style:none;padding:15px 0;margin:25px 0}.orderdetail li{position:relative;padding:0 0 22px 28px;text-transform:uppercase;font-size:10px;letter-spacing:.1em;color:#aaa}.orderdetail li:after{content:'';position:absolute;left:5px;top:12px;width:1px;height:22px;background:#ccc}.orderdetail li:last-child:after{display:none}.orderdetail li i{position:absolute;left:0;top:0;width:11px;height:11px;border:2px solid #aaa;border-radius:50%}.orderdetail li.done{color:#171717}.orderdetail li.done i{background:#171717;border-color:#171717}.items>div{display:grid;grid-template-columns:50px 1fr auto;align-items:center;gap:12px;padding:10px 0;border-top:1px solid #ddd}.items img{width:50px;height:60px;object-fit:cover}.items span{display:grid;gap:5px}.items small{color:#888}@media(max-width:760px){.auth,.grid{grid-template-columns:1fr}.auth{padding-top:55px;gap:45px}.fa header{height:68px}.dash{padding-top:48px}.wishes{grid-template-columns:1fr 1fr}.order{grid-template-columns:1fr auto}.order>b{grid-column:2}.auth h1{font-size:52px}}`;
