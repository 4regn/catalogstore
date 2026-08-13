"use client";

import { FormEvent, useState } from "react";

type Seller = { subdomain: string; store_name: string; logo_url?: string | null };
const STAGES = ["confirmed", "processing", "shipped", "in_transit", "out_for_delivery", "delivered"];
const label = (value: string) => (value || "confirmed").replace(/_/g, " ");

export default function FourRegnTrackingClient({ seller }: { seller: Seller }) {
  const [orderNumber, setOrderNumber] = useState("");
  const [contact, setContact] = useState("");
  const [order, setOrder] = useState<any | null>(null);
  const [legacyUrl, setLegacyUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(""); setOrder(null); setLegacyUrl("");
    const response = await fetch("/api/customer-account/track-order", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: seller.subdomain, orderNumber, contact }),
    });
    const json = await response.json().catch(() => ({})); setBusy(false);
    if (!response.ok) { setError(json.error || "We could not match those details."); return; }
    if (json.legacy) { setLegacyUrl(json.legacyUrl); return; }
    setOrder(json.order);
  };

  const currentStage = order ? Math.max(0, STAGES.indexOf(order.status)) : 0;
  return <main className="ft">
    <style>{CSS}</style>
    <header><a href="/">{seller.logo_url ? <img src={seller.logo_url} alt={seller.store_name}/> : seller.store_name}</a><a className="account" href="/account">My account</a></header>
    <section className="hero">
      <div className="intro"><span>4REGN ORDER TRACKING</span><h1>Follow your<br/>order.</h1><p>Enter the order number from your confirmation email and the email address or mobile number used at checkout.</p></div>
      <form onSubmit={submit}>
        <label>Order number<input value={orderNumber} onChange={(e)=>setOrderNumber(e.target.value)} placeholder="#3540D" autoComplete="off" required/></label>
        <label>Email address or mobile number<input value={contact} onChange={(e)=>setContact(e.target.value)} placeholder="name@email.com or 071 234 5678" autoComplete="email" required/></label>
        {error && <p className="error">{error}</p>}
        <button disabled={busy}>{busy ? "Finding your order…" : "Track order"}</button>
        <small>Order numbers work with or without the # and D.</small>
      </form>
    </section>
    {legacyUrl && <section className="result legacy"><span>LEGACY ORDER</span><h2>This order uses our previous tracker.</h2><p>Orders up to #3539D remain available on the original 4REGN tracking system.</p><a href={legacyUrl}>Open legacy tracking</a></section>}
    {order && <section className="result tracking"><div className="resulthead"><div><span>ORDER FOUND</span><h2>{order.reference}</h2><p>{new Date(order.created_at).toLocaleDateString("en-ZA", { day:"numeric", month:"long", year:"numeric" })}</p></div><b>R {Number(order.total).toLocaleString("en-ZA")}</b></div>
      <ol>{STAGES.map((stage,index)=><li className={index<=currentStage?"done":""} key={stage}><i/><span>{label(stage)}</span></li>)}</ol>
      {order.shipping_option && <p className="shipping">Delivery method <strong>{order.shipping_option}</strong></p>}
      <div className="items">{(order.items||[]).map((item:any,index:number)=><div key={index}>{item.image?<img src={item.image} alt=""/>:<i/>}<span><strong>{item.name}</strong><small>{item.variant ? `${item.variant} · ` : ""}Qty {item.qty}</small></span></div>)}</div>
      <p className="accountnote">Want all your orders and saved products in one place? <a href="/account">Log into your account</a>.</p>
    </section>}
  </main>;
}

const CSS = `*{box-sizing:border-box}.ft{min-height:100vh;background:#f0f0ee;color:#292735;font-family:Arial,sans-serif;padding-bottom:90px}.ft header{height:82px;padding:0 clamp(22px,5vw,70px);display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #dadad6;background:rgba(255,255,255,.76);backdrop-filter:blur(18px)}.ft header>a:first-child{font-weight:900;font-size:24px;color:#222;text-decoration:none}.ft header img{display:block;max-width:118px;max-height:48px}.account{text-decoration:none;color:#292735;text-transform:uppercase;letter-spacing:.14em;font-size:10px;font-weight:700}.hero{max-width:1180px;margin:auto;padding:clamp(58px,8vw,110px) 28px 70px;display:grid;grid-template-columns:1.05fr .75fr;gap:9vw;align-items:center}.intro>span,.result span{font-size:10px;font-weight:800;letter-spacing:.2em}.intro h1{font:400 clamp(58px,8vw,104px)/.88 Georgia,serif;margin:20px 0 26px}.intro p{max-width:500px;color:#737373;line-height:1.8}.hero form{background:#fff;border:1px solid #dcdcd7;border-radius:22px;padding:34px;box-shadow:0 22px 65px rgba(0,0,0,.07)}label{display:block;margin:0 0 18px;font-size:9px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}input{display:block;width:100%;height:54px;margin-top:8px;border:1px solid #d1d1cc;border-radius:11px;padding:0 15px;font-size:15px;outline:none}input:focus{border-color:#222}.hero button,.legacy a{display:block;width:100%;height:54px;border:0;border-radius:999px;background:#111;color:#fff;text-transform:uppercase;letter-spacing:.13em;font-size:10px;font-weight:800;cursor:pointer}.hero button:disabled{opacity:.55}.hero form small{display:block;text-align:center;color:#888;font-size:10px;margin-top:15px}.error{font-size:12px;color:#a92d23;line-height:1.5}.result{max-width:800px;margin:0 auto 30px;background:#fff;border:1px solid #dcdcd7;border-radius:24px;padding:clamp(28px,5vw,48px);box-shadow:0 18px 55px rgba(0,0,0,.06)}.legacy{text-align:center}.legacy h2,.resulthead h2{font:400 38px Georgia,serif;margin:12px 0}.legacy p{color:#777;line-height:1.7}.legacy a{width:auto;height:auto;padding:17px 28px;text-decoration:none;margin-top:24px}.resulthead{display:flex;justify-content:space-between;gap:20px;align-items:start}.resulthead p{color:#888;font-size:11px}.resulthead>b{font-size:18px}.tracking ol{display:grid;grid-template-columns:repeat(6,1fr);list-style:none;padding:35px 0;margin:28px 0;border-top:1px solid #ddd;border-bottom:1px solid #ddd}.tracking li{position:relative;text-align:center;color:#aaa;font-size:8px;text-transform:uppercase;letter-spacing:.08em}.tracking li:before{content:'';position:absolute;top:6px;left:0;width:100%;height:1px;background:#ccc}.tracking li i{position:relative;z-index:1;display:block;width:13px;height:13px;margin:0 auto 12px;border:2px solid #aaa;border-radius:50%;background:#fff}.tracking li.done{color:#111}.tracking li.done:before,.tracking li.done i{background:#111;border-color:#111}.shipping{font-size:11px;color:#888}.shipping strong{display:block;color:#222;font-size:12px;margin-top:5px;text-transform:uppercase}.items{margin-top:24px}.items>div{display:grid;grid-template-columns:54px 1fr;gap:13px;align-items:center;border-top:1px solid #eee;padding:12px 0}.items img,.items>div>i{width:54px;height:64px;object-fit:cover;background:#eee}.items span{display:grid;gap:5px}.items strong{font-size:12px}.items small{font-size:10px;color:#888}.accountnote{margin:26px 0 0;padding:18px;border-radius:12px;background:#f1f1ee;color:#666;font-size:12px;text-align:center}.accountnote a{color:#111;font-weight:700}@media(max-width:760px){.ft header{height:68px}.hero{grid-template-columns:1fr;gap:42px;padding-top:52px}.intro h1{font-size:62px}.tracking ol{grid-template-columns:1fr;text-align:left;padding:18px}.tracking li{text-align:left;padding:0 0 20px 28px}.tracking li:before{width:1px;height:100%;left:6px;top:8px}.tracking li i{position:absolute;left:0;top:0;margin:0}.resulthead{align-items:end}.resulthead h2{font-size:34px}}`;
