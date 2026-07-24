"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabase";

type Manager = {
  fullName: string;
  email: string;
  avatarUrl: string | null;
  campaignCode: string | null;
  campaignDiscountPercent: number;
};

type OrderRow = {
  id: string;
  order_number: string;
  customer_name: string;
  items: Array<{ name: string; qty: number; price: number }>;
  total: number;
  status: string;
  payment_status: string;
  created_at: string;
};

type Overview = {
  manager: Manager;
  metrics: { ordersToday: number; salesToday: number; ordersThisMonth: number; salesThisMonth: number };
  recentOrders: OrderRow[];
};

type Panel = "overview" | "sales" | "growth" | "support" | "academy" | "settings";

const PANEL_TITLES: Record<Panel, string> = {
  overview: "Brand Manager overview",
  sales: "Sales",
  growth: "Growth Tools",
  support: "Live Support",
  academy: "UNIK Academy",
  settings: "Settings",
};

function money(n: number) {
  return "R" + Math.round(Number(n) || 0).toLocaleString("en-ZA");
}

export default function BrandManagerClient({ storeName }: { storeName: string }) {
  const [sessionReady, setSessionReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loadError, setLoadError] = useState("");
  const [panel, setPanel] = useState<Panel>("overview");
  const [toastText, setToastText] = useState("");

  const showToast = useCallback((text: string) => {
    setToastText(text);
    window.setTimeout(() => setToastText(""), 2200);
  }, []);

  const load = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setSessionReady(true);
      setSignedIn(false);
      return;
    }
    setSignedIn(true);
    try {
      const res = await fetch("/api/unik/brand-manager/overview", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Could not load your dashboard");
      setOverview(payload);
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : "Could not load your dashboard");
    }
    setSessionReady(true);
  }, []);

  useEffect(() => {
    load();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") { setSignedIn(false); setOverview(null); }
    });
    return () => data.subscription.unsubscribe();
  }, [load]);

  useEffect(() => {
    if (sessionReady && !signedIn) window.location.href = "team/login";
  }, [sessionReady, signedIn]);

  async function signOut() {
    await fetch("/api/unik/brand-manager/session", { method: "DELETE" });
    await supabase.auth.signOut();
    window.location.href = "team/login";
  }

  async function authedFetch(path: string, init: RequestInit = {}) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return fetch(path, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
  }

  if (!sessionReady) return <main className="bm-loading">Connecting your secure session…</main>;
  if (!signedIn) return <main className="bm-loading">Redirecting to sign in…</main>;
  if (loadError) return <main className="bm-loading">{loadError}</main>;
  if (!overview) return <main className="bm-loading">Loading your dashboard…</main>;

  return (
    <div className="bm-app">
      <aside className="bm-sidebar">
        <div className="bm-brand">
          <div className="bm-logo-mark"><b>UN<span>I</span>K</b></div>
          <div><span className="bm-brand-name">UNIK</span><span className="bm-brand-sub">Brand Manager HQ</span></div>
        </div>
        <nav className="bm-navigation" aria-label="Dashboard navigation">
          {(Object.keys(PANEL_TITLES) as Panel[]).map((key) => (
            <button key={key} type="button" className={"bm-nav-link" + (panel === key ? " active" : "")} onClick={() => setPanel(key)}>
              {PANEL_TITLES[key].replace("Brand Manager overview", "Overview")}
            </button>
          ))}
        </nav>
        <div className="bm-sidebar-profile">
          <div className="bm-tiny-label">Logged in as</div>
          <div className="bm-sidebar-profile-row">
            <div className="bm-avatar bm-avatar-small">{overview.manager.avatarUrl ? <img src={overview.manager.avatarUrl} alt="" /> : <div className="bm-avatar-fallback">{overview.manager.fullName.charAt(0)}</div>}</div>
            <div><span className="bm-profile-name">{overview.manager.fullName}</span><span className="bm-profile-role">Brand Manager</span></div>
          </div>
          <button type="button" className="bm-signout" onClick={signOut}>Sign out</button>
        </div>
      </aside>

      <main className="bm-main">
        <header className="bm-topbar">
          <div><h1 className="bm-page-title">{PANEL_TITLES[panel]}</h1></div>
        </header>

        {panel === "overview" && (
          <section>
            <article className="bm-manager-banner">
              <div className="bm-manager-copy">
                <div className="bm-manager-kicker">{storeName}</div>
                <h2 className="bm-manager-name">{overview.manager.fullName}</h2>
                <p className="bm-manager-sub">Manage brand activity, customers, campaigns and personal earnings.</p>
                <span className="bm-role-chip">Brand Manager</span>
              </div>
            </article>

            <div className="bm-grid">
              <article className="bm-card bm-metric"><span className="bm-metric-label">Orders today</span><div className="bm-metric-value">{overview.metrics.ordersToday}</div></article>
              <article className="bm-card bm-metric"><span className="bm-metric-label">Sales today</span><div className="bm-metric-value">{money(overview.metrics.salesToday)}</div></article>
              <article className="bm-card bm-metric"><span className="bm-metric-label">Orders this month</span><div className="bm-metric-value">{overview.metrics.ordersThisMonth}</div></article>
              <article className="bm-card bm-metric"><span className="bm-metric-label">Sales this month</span><div className="bm-metric-value">{money(overview.metrics.salesThisMonth)}</div></article>

              <article className="bm-card bm-orders-card">
                <div className="bm-section-head"><h2 className="bm-section-title">Recent orders</h2><p className="bm-section-desc">Latest AI Studio and custom-upload purchases</p></div>
                {overview.recentOrders.length === 0 ? <p className="bm-empty">No orders yet.</p> : (
                  <div className="bm-table">
                    <div className="bm-row bm-row-header"><div>Customer</div><div>Value</div><div>Status</div></div>
                    {overview.recentOrders.map((order) => (
                      <div className="bm-row" key={order.id}>
                        <div>{order.customer_name || "Customer"}</div>
                        <div>{money(order.total)}</div>
                        <div><span className={"bm-status" + (order.payment_status === "paid" ? "" : " pending")}>{order.payment_status === "paid" ? order.status.replace(/_/g, " ") : order.payment_status.replace(/_/g, " ")}</span></div>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            </div>
          </section>
        )}

        {panel === "sales" && <SalesPanel recentOrders={overview.recentOrders} metrics={overview.metrics} />}
        {panel === "growth" && <GrowthPanel manager={overview.manager} authedFetch={authedFetch} onSaved={(m) => setOverview({ ...overview, manager: m })} toast={showToast} />}
        {panel === "support" && <SupportPanel />}
        {panel === "academy" && <AcademyPanel />}
        {panel === "settings" && <SettingsPanel manager={overview.manager} authedFetch={authedFetch} onProfileSaved={(m) => setOverview({ ...overview, manager: m })} toast={showToast} />}
      </main>

      {toastText && <div className="bm-toast show">{toastText}</div>}

      <style jsx global>{`
        html,body{margin:0;min-height:100vh;background:radial-gradient(circle at 92% 2%,rgba(244,61,50,.09),transparent 30%),#060606;color:#f7f7f4;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        *{box-sizing:border-box}
        button{font:inherit;cursor:pointer}
        .bm-loading{min-height:100dvh;display:grid;place-items:center;color:#999994;background:#060606}
        .bm-app{display:grid;grid-template-columns:264px minmax(0,1fr);min-height:100vh}
        .bm-sidebar{position:sticky;top:0;height:100vh;z-index:30;padding:22px 17px;display:flex;flex-direction:column;border-right:1px solid #27272a;background:rgba(7,7,8,.96)}
        .bm-brand{display:flex;align-items:center;gap:12px;padding:5px 8px 27px}
        .bm-logo-mark{width:44px;height:44px;display:grid;place-items:center;border:1px solid rgba(244,61,50,.48);border-radius:14px;background:#0c0c0d;font-size:12px;font-weight:950;letter-spacing:-.04em}
        .bm-logo-mark span{color:#f43d32}
        .bm-brand-name{display:block;font-size:16px;font-weight:900;letter-spacing:.2em}
        .bm-brand-sub{display:block;margin-top:4px;color:#999994;font-size:9px;font-weight:750;letter-spacing:.13em;text-transform:uppercase}
        .bm-navigation{display:grid;gap:7px}
        .bm-nav-link{min-height:47px;padding:0 13px;display:flex;align-items:center;gap:12px;color:#969691;border:1px solid transparent;border-radius:14px;background:none;text-align:left;transition:.18s ease}
        .bm-nav-link:hover{color:#fff;background:#131315}
        .bm-nav-link.active{color:#fff;border-color:rgba(244,61,50,.28);background:linear-gradient(90deg,rgba(244,61,50,.13),rgba(255,255,255,.02))}
        .bm-sidebar-profile{margin-top:auto;padding:14px;border:1px solid #27272a;border-radius:18px;background:linear-gradient(145deg,#111113,#09090a)}
        .bm-tiny-label{color:#999994;font-size:9px;font-weight:800;letter-spacing:.11em;text-transform:uppercase}
        .bm-sidebar-profile-row{display:flex;align-items:center;gap:11px;margin-top:11px}
        .bm-avatar{overflow:hidden;border-radius:50%;background:#1b1b1d;border:1px solid #39393d;flex:0 0 auto;width:54px;height:54px}
        .bm-avatar img{width:100%;height:100%;object-fit:cover;display:block}
        .bm-avatar-fallback{width:100%;height:100%;display:grid;place-items:center;font-weight:800}
        .bm-profile-name{display:block;font-size:13px;font-weight:800}
        .bm-profile-role{display:block;margin-top:3px;color:#999994;font-size:10px}
        .bm-signout{width:100%;margin-top:12px;padding:10px;border:1px solid #27272a;border-radius:12px;background:#111113;color:#c0c0ba;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em}
        .bm-signout:hover{background:rgba(244,61,50,.13);color:#fff}
        .bm-main{min-width:0;padding:28px 30px 58px}
        .bm-topbar{margin-bottom:22px}
        .bm-page-title{margin:0;font-size:clamp(29px,3vw,44px);line-height:1.03;letter-spacing:-.05em}
        .bm-manager-banner{margin-bottom:18px;padding:24px 26px;border:1px solid #27272a;border-radius:25px;background:linear-gradient(120deg,rgba(244,61,50,.15),rgba(18,18,20,.96) 38%,rgba(10,10,11,.98));box-shadow:0 24px 70px rgba(0,0,0,.38)}
        .bm-manager-kicker{color:#ff8b84;font-size:10px;font-weight:900;letter-spacing:.15em;text-transform:uppercase}
        .bm-manager-name{margin:8px 0 0;font-size:clamp(25px,3vw,39px);letter-spacing:-.045em}
        .bm-manager-sub{margin:7px 0 0;color:#c0c0ba;font-size:13px}
        .bm-role-chip{display:inline-flex;margin-top:15px;padding:7px 11px;border-radius:999px;border:1px solid rgba(244,61,50,.27);background:rgba(244,61,50,.13);font-size:10px;font-weight:850;color:#ff918b}
        .bm-grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:18px}
        .bm-card{min-width:0;padding:20px;border:1px solid #27272a;border-radius:22px;background:linear-gradient(145deg,rgba(18,18,20,.98),rgba(11,11,12,.98));box-shadow:0 24px 70px rgba(0,0,0,.38)}
        .bm-metric{grid-column:span 3;min-height:120px}
        .bm-metric-label{color:#c0c0ba;font-size:12px}
        .bm-metric-value{margin-top:21px;font-size:29px;font-weight:850;letter-spacing:-.045em}
        .bm-orders-card{grid-column:span 12}
        .bm-section-head{margin-bottom:18px}
        .bm-section-title{margin:0;font-size:17px;letter-spacing:-.02em}
        .bm-section-desc{margin:5px 0 0;color:#999994;font-size:11px;line-height:1.5}
        .bm-table{display:grid;gap:8px}
        .bm-row{display:grid;grid-template-columns:minmax(100px,1.2fr) minmax(90px,.9fr) minmax(90px,.9fr);gap:10px;align-items:center;padding:13px 14px;border-radius:14px;font-size:11px}
        .bm-row-header{padding-top:0;color:#999994;font-size:8px;font-weight:850;letter-spacing:.1em;text-transform:uppercase}
        .bm-row:not(.bm-row-header){border:1px solid #222225;background:#0b0b0c}
        .bm-status{width:max-content;padding:6px 9px;border:1px solid rgba(114,227,157,.2);border-radius:999px;background:rgba(114,227,157,.11);color:#72e39d;font-size:8px;font-weight:900;text-transform:uppercase}
        .bm-status.pending{color:#edc96c;border-color:rgba(237,201,108,.2);background:rgba(237,201,108,.1)}
        .bm-empty{color:#999994;font-size:12px}
        .bm-toast{position:fixed;right:22px;bottom:22px;z-index:150;padding:12px 15px;border:1px solid #27272a;border-radius:13px;background:#171719;box-shadow:0 20px 55px rgba(0,0,0,.5);font-size:10px;font-weight:850}
        .bm-form-card{padding:20px;border:1px solid #27272a;border-radius:20px;background:#0d0d0f}
        .bm-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:13px}
        .bm-field{display:grid;gap:7px}
        .bm-field.full{grid-column:1/-1}
        .bm-field label{color:#c0c0ba;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.08em}
        .bm-input,.bm-select{width:100%;min-height:44px;padding:0 12px;color:#fff;border:1px solid #27272a;border-radius:12px;outline:none;background:#111113;font-size:14px}
        .bm-input:focus,.bm-select:focus{border-color:rgba(244,61,50,.55);box-shadow:0 0 0 3px rgba(244,61,50,.08)}
        .bm-form-actions{display:flex;gap:9px;align-items:center;margin-top:16px}
        .bm-primary-btn{padding:0 17px;min-height:44px;border-radius:13px;font-weight:800;border:1px solid #f43d32;color:#fff;background:#f43d32}
        .bm-secondary-btn{padding:0 15px;min-height:44px;border-radius:13px;font-weight:800;border:1px solid #27272a;color:#fff;background:#111113}
        .bm-code-box{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 15px;border:1px dashed #3a3a3e;border-radius:16px;background:#09090a;margin-bottom:16px}
        .bm-code-value{font-size:17px;font-weight:950;letter-spacing:.11em}
        .bm-security-note{padding:12px;border:1px solid rgba(114,227,157,.17);border-radius:14px;background:rgba(114,227,157,.11);color:#c8f6d8;font-size:10px;line-height:1.5;margin-bottom:16px}
        .bm-summary-strip{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin:14px 0}
        .bm-summary-box{padding:11px;border:1px solid #27272a;border-radius:13px;background:#0a0a0b}
        .bm-summary-box span{display:block;color:#999994;font-size:8px}
        .bm-summary-box strong{display:block;margin-top:5px;font-size:12px}
        .bm-clean-list{display:grid;gap:9px;margin-top:14px}
        .bm-list-item{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 13px;border:1px solid #27272a;border-radius:14px;background:#0b0b0c}
        .bm-list-item strong{font-size:11px}
        .bm-badge{padding:6px 9px;border-radius:999px;border:1px solid rgba(244,61,50,.25);background:rgba(244,61,50,.13);color:#ff8c85;font-size:8px;font-weight:900;text-transform:uppercase}
        .bm-error{color:#ff8b84;font-size:12px;margin:0 0 12px}
        @media(max-width:900px){.bm-app{grid-template-columns:1fr}.bm-sidebar{display:none}.bm-metric{grid-column:span 6}.bm-form-grid{grid-template-columns:1fr}}
      `}</style>
    </div>
  );
}

function SalesPanel({ recentOrders, metrics }: { recentOrders: OrderRow[]; metrics: Overview["metrics"] }) {
  return (
    <section>
      <article className="bm-card" style={{ marginBottom: 18 }}>
        <div className="bm-section-head"><h2 className="bm-section-title">Sales workspace</h2><p className="bm-section-desc">Orders, values and operational status</p></div>
        <div className="bm-summary-strip">
          <div className="bm-summary-box"><span>Today</span><strong>{money(metrics.salesToday)}</strong></div>
          <div className="bm-summary-box"><span>This month</span><strong>{money(metrics.salesThisMonth)}</strong></div>
          <div className="bm-summary-box"><span>Orders this month</span><strong>{metrics.ordersThisMonth}</strong></div>
        </div>
      </article>
      <article className="bm-card">
        <div className="bm-section-head"><h2 className="bm-section-title">Recent orders</h2><p className="bm-section-desc">Full order tracking with status updates is coming in the next pass — this shows your latest orders for now.</p></div>
        {recentOrders.length === 0 ? <p className="bm-empty">No orders yet.</p> : (
          <div className="bm-table">
            <div className="bm-row bm-row-header"><div>Customer</div><div>Value</div><div>Status</div></div>
            {recentOrders.map((order) => (
              <div className="bm-row" key={order.id}>
                <div>{order.customer_name || "Customer"}</div>
                <div>{money(order.total)}</div>
                <div><span className={"bm-status" + (order.payment_status === "paid" ? "" : " pending")}>{order.payment_status === "paid" ? order.status.replace(/_/g, " ") : order.payment_status.replace(/_/g, " ")}</span></div>
              </div>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}

function GrowthPanel({ manager, authedFetch, onSaved, toast }: { manager: Manager; authedFetch: (path: string, init?: RequestInit) => Promise<Response>; onSaved: (m: Manager) => void; toast: (text: string) => void }) {
  const [code, setCode] = useState(manager.campaignCode || "");
  const [discount, setDiscount] = useState(String(manager.campaignDiscountPercent || 0));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const res = await authedFetch("/api/unik/brand-manager/campaign-code", { method: "PATCH", body: JSON.stringify({ code, discountPercent: Number(discount) }) });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) { setError(payload.error || "Could not save"); setBusy(false); return; }
    setCode(payload.code);
    onSaved({ ...manager, campaignCode: payload.code, campaignDiscountPercent: payload.discountPercent });
    toast("Campaign code saved");
    setBusy(false);
  }

  return (
    <section>
      <article className="bm-card">
        <div className="bm-section-head"><h2 className="bm-section-title">Campaign code</h2><p className="bm-section-desc">Used for trackable offers and campaigns — not as her job title or source of authority.</p></div>
        <div className="bm-code-box"><span className="bm-code-value">{manager.campaignCode || "No code set"}</span>{manager.campaignCode && <span className="bm-badge">{manager.campaignDiscountPercent}% discount</span>}</div>
        <form onSubmit={save} className="bm-form-grid">
          <div className="bm-field full"><label>Campaign code</label><input className="bm-input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={20} required /></div>
          <div className="bm-field full"><label>Customer discount</label>
            <select className="bm-select" value={discount} onChange={(e) => setDiscount(e.target.value)}>
              <option value="0">No discount</option><option value="5">5%</option><option value="10">10%</option><option value="15">15%</option><option value="20">20%</option>
            </select>
          </div>
          {error && <div className="bm-field full"><p className="bm-error">{error}</p></div>}
          <div className="bm-field full bm-form-actions"><button className="bm-primary-btn" disabled={busy}>{busy ? "Saving…" : "Save campaign code"}</button></div>
        </form>
      </article>
    </section>
  );
}

function SupportPanel() {
  return (
    <section>
      <article className="bm-card">
        <div className="bm-section-head"><h2 className="bm-section-title">Customer conversations</h2><p className="bm-section-desc">Live chat is being wired up next — this will show real customer messages from the UNIK Labs storefront.</p></div>
        <p className="bm-empty">Coming soon.</p>
      </article>
    </section>
  );
}

function AcademyPanel() {
  const modules = ["Products and pricing", "Customer support", "Refunds and escalation", "Campaign reporting"];
  return (
    <section>
      <article className="bm-card">
        <div className="bm-section-head"><h2 className="bm-section-title">Brand Manager training</h2><p className="bm-section-desc">Short operational modules tied to the role</p></div>
        <div className="bm-clean-list">
          {modules.map((m) => <div className="bm-list-item" key={m}><strong>{m}</strong><span className="bm-badge">Coming soon</span></div>)}
        </div>
      </article>
    </section>
  );
}

function SettingsPanel({ manager, authedFetch, onProfileSaved, toast }: { manager: Manager; authedFetch: (path: string, init?: RequestInit) => Promise<Response>; onProfileSaved: (m: Manager) => void; toast: (text: string) => void }) {
  const [firstName, lastNameGuess] = manager.fullName.split(/ (.+)/);
  const [first, setFirst] = useState(firstName || "");
  const [last, setLast] = useState(lastNameGuess || "");
  const [email, setEmail] = useState(manager.email);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState("");

  const [holder, setHolder] = useState("");
  const [bank, setBank] = useState("");
  const [accountType, setAccountType] = useState("");
  const [branchCode, setBranchCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [payoutBusy, setPayoutBusy] = useState(false);
  const [payoutError, setPayoutError] = useState("");
  const [payoutSaved, setPayoutSaved] = useState(false);

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setProfileBusy(true);
    setProfileError("");
    const fullName = `${first.trim()} ${last.trim()}`.trim();
    const res = await authedFetch("/api/unik/brand-manager/profile", { method: "PATCH", body: JSON.stringify({ fullName, email }) });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) { setProfileError(payload.error || "Could not save"); setProfileBusy(false); return; }
    onProfileSaved({ ...manager, fullName, email });
    toast("Profile saved");
    setProfileBusy(false);
  }

  async function savePayout(event: FormEvent) {
    event.preventDefault();
    setPayoutBusy(true);
    setPayoutError("");
    const res = await authedFetch("/api/unik/brand-manager/payout", { method: "PATCH", body: JSON.stringify({ accountHolder: holder, bank, accountType, branchCode, accountNumber }) });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) { setPayoutError(payload.error || "Could not save"); setPayoutBusy(false); return; }
    setPayoutSaved(true);
    setAccountNumber("");
    toast("Personal earnings account updated");
    setPayoutBusy(false);
  }

  return (
    <section>
      <div className="bm-form-grid" style={{ marginBottom: 18 }}>
        <div className="bm-form-card">
          <div className="bm-section-head"><h2 className="bm-section-title">Profile details</h2><p className="bm-section-desc">Public account information</p></div>
          <form onSubmit={saveProfile} className="bm-form-grid">
            <div className="bm-field"><label>First name</label><input className="bm-input" value={first} onChange={(e) => setFirst(e.target.value)} required /></div>
            <div className="bm-field"><label>Last name</label><input className="bm-input" value={last} onChange={(e) => setLast(e.target.value)} required /></div>
            <div className="bm-field full"><label>Email address</label><input className="bm-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
            {profileError && <div className="bm-field full"><p className="bm-error">{profileError}</p></div>}
            <div className="bm-field full bm-form-actions"><button className="bm-primary-btn" disabled={profileBusy}>{profileBusy ? "Saving…" : "Save profile"}</button></div>
          </form>
        </div>
      </div>

      <article className="bm-card">
        <div className="bm-section-head"><h2 className="bm-section-title">Personal earnings payout account</h2><p className="bm-section-desc">Used only for her approved personal earnings.</p></div>
        <div className="bm-security-note"><strong>Company money stays separate.</strong><br />This account does not receive customer payments, company revenue, refunds or operating funds.</div>
        <div className="bm-summary-strip">
          <div className="bm-summary-box"><span>Bank</span><strong>{bank || "Not added"}</strong></div>
          <div className="bm-summary-box"><span>Account</span><strong>{payoutSaved ? "Saved" : "Not added"}</strong></div>
          <div className="bm-summary-box"><span>Status</span><strong>{payoutSaved ? "Ready for verification" : "Setup required"}</strong></div>
        </div>
        <form onSubmit={savePayout} className="bm-form-grid">
          <div className="bm-field full"><label>Account holder</label><input className="bm-input" value={holder} onChange={(e) => setHolder(e.target.value)} required /></div>
          <div className="bm-field"><label>Bank</label>
            <select className="bm-select" value={bank} onChange={(e) => setBank(e.target.value)} required>
              <option value="">Select bank</option>{["Absa", "Capitec", "FNB", "Nedbank", "Standard Bank", "TymeBank"].map((b) => <option key={b}>{b}</option>)}
            </select>
          </div>
          <div className="bm-field"><label>Account type</label>
            <select className="bm-select" value={accountType} onChange={(e) => setAccountType(e.target.value)} required>
              <option value="">Select type</option>{["Cheque / Current", "Savings", "Transmission"].map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="bm-field"><label>Branch code</label><input className="bm-input" inputMode="numeric" maxLength={6} value={branchCode} onChange={(e) => setBranchCode(e.target.value)} placeholder="000000" required /></div>
          <div className="bm-field"><label>Account number</label><input className="bm-input" inputMode="numeric" maxLength={16} value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="Enter account number" required /></div>
          {payoutError && <div className="bm-field full"><p className="bm-error">{payoutError}</p></div>}
          <div className="bm-field full bm-form-actions"><button className="bm-primary-btn" disabled={payoutBusy}>{payoutBusy ? "Saving…" : "Update payout account"}</button></div>
        </form>
      </article>
    </section>
  );
}
