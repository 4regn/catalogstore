"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../../../lib/supabase";

type Manager = {
  fullName: string;
  email: string;
  avatarUrl: string | null;
  campaignCode: string | null;
  campaignDiscountPercent: number;
  payoutAccountHolder: string | null;
  payoutBank: string | null;
  payoutAccountType: string | null;
  payoutBranchCode: string | null;
  payoutAccountLast4: string | null;
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

type LiveVisitor = {
  id: string; visitor_id: string; status: "browsing" | "active_cart" | "checkout"; path: string | null;
  cart_item_count: number; cart_value: number; customer_name: string | null; customer_email: string | null;
  first_seen_at: string; last_seen_at: string;
};

type SessionAnalytics = {
  sessionsToday: number; ordersToday: number; salesToday: number;
  dailySessions: { date: string; sessions: number }[];
  topLocations: { country: string; region: string; city: string; count: number }[];
};

type Panel = "overview" | "sales" | "growth" | "content" | "support" | "partners" | "academy" | "settings";

const PANEL_TITLES: Record<Panel, string> = {
  overview: "Brand Manager overview",
  sales: "Sales",
  growth: "Growth Tools",
  content: "Recap Builder",
  support: "Live Support",
  partners: "Partners",
  academy: "UNIK Academy",
  settings: "Settings",
};

const MOBILE_NAV_LABELS: Record<Panel, string> = {
  overview: "Home",
  sales: "Sales",
  growth: "Growth",
  content: "Recap",
  support: "Support",
  partners: "Partners",
  academy: "Academy",
  settings: "Settings",
};

const NAV_ICON_PATHS: Record<Panel, string> = {
  overview: "M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-3H4zM14 7h6V4h-6z",
  sales: "M3 6h18M6 3v6M18 3v6M5 11h14v9H5z",
  growth: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM8 12h8M12 8v8",
  content: "M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM10 9l5 3-5 3Z",
  support: "M4 5h16v11H8l-4 4Z",
  partners: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM3 21c0-3.5 2.7-6 6-6s6 2.5 6 6M16 11a3.5 3.5 0 1 0 0-7M21 21c0-3-1.8-5.2-4.5-5.8",
  academy: "M5 4h14v16H5ZM8 8h8M8 12h6",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a8 8 0 0 0-1.8-1L14.4 3h-4.8l-.4 3.1a8 8 0 0 0-1.8 1l-2.4-1-2 3.4L5.1 11a7 7 0 0 0 0 2L3 14.5l2 3.4 2.4-1a8 8 0 0 0 1.8 1l.4 3.1h4.8l.4-3.1a8 8 0 0 0 1.8-1l2.4 1 2-3.4-2.1-1.5a7 7 0 0 0 .1-1Z",
};

function NavIcon({ panel }: { panel: Panel }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="19" height="19" aria-hidden="true">
      <path d={NAV_ICON_PATHS[panel]} />
    </svg>
  );
}

function MetricIcon({ path }: { path: string }) {
  return (
    <div className="bm-metric-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="17" height="17" aria-hidden="true">
        <path d={path} />
      </svg>
    </div>
  );
}

function money(n: number) {
  return "R" + Math.round(Number(n) || 0).toLocaleString("en-ZA");
}

function liveVisitorMeta(status: string): { bg: string; fg: string; label: string } {
  if (status === "checkout") return { bg: "rgba(34,197,94,0.15)", fg: "#22c55e", label: "At checkout" };
  if (status === "active_cart") return { bg: "rgba(251,191,36,0.1)", fg: "#eab308", label: "Active cart" };
  return { bg: "rgba(255,255,255,0.06)", fg: "#999994", label: "Browsing" };
}
function timeAgo(iso: string): string {
  const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  return mins + (mins === 1 ? " min ago" : " mins ago");
}

export default function BrandManagerClient({ storeName }: { storeName: string }) {
  const [sessionReady, setSessionReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [liveVisitors, setLiveVisitors] = useState<LiveVisitor[]>([]);
  const [sessionAnalytics, setSessionAnalytics] = useState<SessionAnalytics | null>(null);
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

  const authedFetch = useCallback(async (path: string, init: RequestInit = {}) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return fetch(path, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    const fetchLiveVisitors = async () => {
      try {
        const res = await authedFetch("/api/unik/brand-manager/live-visitors");
        const payload = await res.json().catch(() => ({}));
        if (!cancelled && res.ok && payload.visitors) setLiveVisitors(payload.visitors);
      } catch {}
    };
    fetchLiveVisitors();
    const id = setInterval(fetchLiveVisitors, 10000);
    return () => { cancelled = true; clearInterval(id); };
  }, [signedIn, authedFetch]);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    const fetchSessionAnalytics = async () => {
      try {
        const res = await authedFetch("/api/unik/brand-manager/session-analytics");
        const payload = await res.json().catch(() => ({}));
        if (!cancelled && res.ok) setSessionAnalytics(payload);
      } catch {}
    };
    fetchSessionAnalytics();
    const id = setInterval(fetchSessionAnalytics, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, [signedIn, authedFetch]);

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
              <NavIcon panel={key} />
              <span>{PANEL_TITLES[key].replace("Brand Manager overview", "Overview")}</span>
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
          <button type="button" className="bm-signout bm-signout-mobile" onClick={signOut}>Sign out</button>
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
              <div className="bm-avatar bm-avatar-banner">
                {overview.manager.avatarUrl ? <img src={overview.manager.avatarUrl} alt="" /> : <div className="bm-avatar-fallback">{overview.manager.fullName.charAt(0)}</div>}
              </div>
            </article>

            <div className="bm-grid">
              <article className="bm-card bm-metric"><div className="bm-metric-head"><span className="bm-metric-label">Orders today</span><MetricIcon path="M5 8h14l-1 12H6zM9 8a3 3 0 0 1 6 0" /></div><div className="bm-metric-value">{overview.metrics.ordersToday}</div></article>
              <article className="bm-card bm-metric"><div className="bm-metric-head"><span className="bm-metric-label">Sales today</span><MetricIcon path="M4 18V9M10 18V5M16 18v-7M22 18H2" /></div><div className="bm-metric-value">{money(overview.metrics.salesToday)}</div></article>
              <article className="bm-card bm-metric"><div className="bm-metric-head"><span className="bm-metric-label">Orders this month</span><MetricIcon path="M5 8h14l-1 12H6zM9 8a3 3 0 0 1 6 0" /></div><div className="bm-metric-value">{overview.metrics.ordersThisMonth}</div></article>
              <article className="bm-card bm-metric"><div className="bm-metric-head"><span className="bm-metric-label">Sales this month</span><MetricIcon path="M4 18V9M10 18V5M16 18v-7M22 18H2" /></div><div className="bm-metric-value">{money(overview.metrics.salesThisMonth)}</div></article>
              <article className="bm-card bm-metric"><div className="bm-metric-head"><span className="bm-metric-label">Live now</span><MetricIcon path="M6.5 6.5a5 5 0 0 0 0 7M13.5 6.5a5 5 0 0 1 0 7M4 4a9 9 0 0 0 0 12M16 4a9 9 0 0 1 0 12" /></div><div className="bm-metric-value">{liveVisitors.length}</div></article>
              <article className="bm-card bm-metric"><div className="bm-metric-head"><span className="bm-metric-label">Sessions today</span><MetricIcon path="M4 18V9M10 18V5M16 18v-7M22 18H2" /></div><div className="bm-metric-value">{sessionAnalytics?.sessionsToday ?? "—"}</div></article>

              {sessionAnalytics && (
                <article className="bm-card bm-orders-card">
                  <div className="bm-section-head"><h2 className="bm-section-title">Sessions by day &amp; top locations</h2><p className="bm-section-desc">Last 14 days · locations over the last 30 days</p></div>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginTop: 16 }}>
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 80 }}>
                      {sessionAnalytics.dailySessions.map((d) => {
                        const max = Math.max(1, ...sessionAnalytics.dailySessions.map((x) => x.sessions));
                        const dayLabel = new Date(d.date + "T00:00:00Z").getUTCDate();
                        return (
                          <div key={d.date} title={`${d.date}: ${d.sessions} session${d.sessions === 1 ? "" : "s"}`} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                            <div style={{ width: "100%", height: Math.max(2, Math.round((d.sessions / max) * 64)), background: "#007517", borderRadius: 3 }} />
                            <span style={{ fontSize: 8, color: "#66665f" }}>{dayLabel}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div>
                      {sessionAnalytics.topLocations.length === 0 ? (
                        <p style={{ fontSize: 12, color: "#66665f" }}>No location data yet.</p>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                          {sessionAnalytics.topLocations.map((loc, i) => (
                            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                              <span>{[loc.city, loc.region, loc.country].filter(Boolean).join(", ") || "Unknown"}</span>
                              <strong>{loc.count}</strong>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              )}

              <article className="bm-card bm-orders-card">
                <div className="bm-section-head" style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <h2 className="bm-section-title">Live visitors</h2>
                  {liveVisitors.length > 0 && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 0 4px rgba(34,197,94,0.18)" }} />}
                  <p className="bm-section-desc">Who's on the store right now -- refreshes every 10s</p>
                </div>
                {liveVisitors.length === 0 ? <p className="bm-empty">No one's on the store right now.</p> : (
                  <div className="bm-table">
                    <div className="bm-row bm-row-header"><div>Visitor</div><div>Cart</div><div>Status</div></div>
                    {liveVisitors.map((v) => {
                      const meta = liveVisitorMeta(v.status);
                      return (
                        <div className="bm-row" key={v.id}>
                          <div>{v.customer_name || v.customer_email || "Anonymous"} <span style={{ color: "#66665f", fontSize: 11 }}>· {timeAgo(v.last_seen_at)}</span></div>
                          <div>{v.cart_item_count > 0 ? `${money(v.cart_value)} · ${v.cart_item_count}` : "—"}</div>
                          <div><span className="bm-status" style={{ background: meta.bg, color: meta.fg }}>{meta.label}</span></div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </article>

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

        {panel === "sales" && <SalesPanel metrics={overview.metrics} authedFetch={authedFetch} toast={showToast} />}
        {panel === "growth" && <GrowthPanel manager={overview.manager} authedFetch={authedFetch} onSaved={(m) => setOverview({ ...overview, manager: m })} toast={showToast} />}
        {panel === "content" && <ContentPanel />}
        {panel === "support" && <SupportPanel authedFetch={authedFetch} />}
        {panel === "partners" && <PartnersPanel authedFetch={authedFetch} toast={showToast} />}
        {panel === "academy" && <AcademyPanel />}
        {panel === "settings" && <SettingsPanel manager={overview.manager} authedFetch={authedFetch} onProfileSaved={(m) => setOverview({ ...overview, manager: m })} toast={showToast} />}
      </main>

      <nav className="bm-mobile-nav" aria-label="Mobile navigation">
        {(Object.keys(PANEL_TITLES) as Panel[]).map((key) => (
          <button key={key} type="button" className={"bm-mobile-link" + (panel === key ? " active" : "")} onClick={() => setPanel(key)}>
            <NavIcon panel={key} />
            <span>{MOBILE_NAV_LABELS[key]}</span>
          </button>
        ))}
      </nav>

      {toastText && <div className="bm-toast show">{toastText}</div>}

      <style jsx global>{`
        html,body{margin:0;min-height:100vh;background:radial-gradient(circle at 92% 2%,rgba(0,117,23,.09),transparent 30%),#060606;color:#f7f7f4;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        *{box-sizing:border-box}
        button{font:inherit;cursor:pointer}
        .bm-loading{min-height:100dvh;display:grid;place-items:center;color:#999994;background:#060606}
        .bm-app{display:grid;grid-template-columns:264px minmax(0,1fr);min-height:100vh}
        .bm-sidebar{position:sticky;top:0;height:100vh;z-index:30;padding:22px 17px;display:flex;flex-direction:column;border-right:1px solid #27272a;background:rgba(7,7,8,.96)}
        .bm-brand{display:flex;align-items:center;gap:12px;padding:5px 8px 27px}
        .bm-logo-mark{width:44px;height:44px;display:grid;place-items:center;border:1px solid rgba(0,117,23,.48);border-radius:14px;background:#0c0c0d;font-size:12px;font-weight:950;letter-spacing:-.04em}
        .bm-logo-mark span{color:#007517}
        .bm-brand-name{display:block;font-size:16px;font-weight:900;letter-spacing:.2em}
        .bm-brand-sub{display:block;margin-top:4px;color:#999994;font-size:9px;font-weight:750;letter-spacing:.13em;text-transform:uppercase}
        .bm-navigation{display:grid;gap:7px}
        .bm-nav-link{min-height:47px;padding:0 13px;display:flex;align-items:center;gap:12px;color:#969691;border:1px solid transparent;border-radius:14px;background:none;text-align:left;transition:.18s ease}
        .bm-nav-link svg{flex:0 0 auto}
        .bm-nav-link:hover{color:#fff;background:#131315}
        .bm-nav-link.active{color:#fff;border-color:rgba(0,117,23,.28);background:linear-gradient(90deg,rgba(0,117,23,.13),rgba(255,255,255,.02))}
        .bm-sidebar-profile{margin-top:auto;padding:16px;border:1px solid #27272a;border-radius:20px;background:linear-gradient(145deg,#111113,#09090a);box-shadow:0 18px 40px rgba(0,0,0,.3)}
        .bm-tiny-label{color:#999994;font-size:9px;font-weight:800;letter-spacing:.11em;text-transform:uppercase}
        .bm-sidebar-profile-row{display:flex;align-items:center;gap:11px;margin-top:11px}
        .bm-avatar{overflow:hidden;border-radius:50%;background:#1b1b1d;border:1px solid #39393d;flex:0 0 auto;width:64px;height:64px;box-shadow:0 10px 26px rgba(0,0,0,.35)}
        .bm-avatar img{width:100%;height:100%;object-fit:cover;display:block}
        .bm-avatar-fallback{width:100%;height:100%;display:grid;place-items:center;font-weight:900;font-size:1.4em;background:linear-gradient(145deg,rgba(0,117,23,.32),rgba(0,117,23,.08));color:#4ade80}
        .bm-profile-name{display:block;font-size:13px;font-weight:800}
        .bm-profile-role{display:block;margin-top:3px;color:#999994;font-size:10px}
        .bm-signout{width:100%;margin-top:12px;padding:10px;border:1px solid #27272a;border-radius:12px;background:#111113;color:#c0c0ba;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em}
        .bm-signout:hover{background:rgba(0,117,23,.13);color:#fff}
        .bm-main{min-width:0;padding:28px 30px 58px}
        .bm-topbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:22px}
        .bm-signout-mobile{display:none;width:auto;margin-top:0;flex:0 0 auto}
        .bm-page-title{margin:0;font-size:clamp(29px,3vw,44px);line-height:1.03;letter-spacing:-.05em}
        .bm-manager-banner{display:flex;align-items:center;justify-content:space-between;gap:24px;margin-bottom:18px;padding:24px 26px;border:1px solid #27272a;border-radius:25px;background:linear-gradient(120deg,rgba(0,117,23,.15),rgba(18,18,20,.96) 38%,rgba(10,10,11,.98));box-shadow:0 24px 70px rgba(0,0,0,.38)}
        .bm-avatar-banner{width:112px;height:112px;flex:0 0 auto;border-width:3px;border-color:rgba(255,255,255,.16);box-shadow:0 16px 40px rgba(0,0,0,.4),0 0 0 6px rgba(0,117,23,.08)}
        @media(max-width:560px){.bm-manager-banner{align-items:flex-start;gap:14px;padding:20px}.bm-avatar-banner{width:58px;height:58px;border-width:2px}}
        .bm-manager-kicker{color:#4ade80;font-size:10px;font-weight:900;letter-spacing:.15em;text-transform:uppercase}
        .bm-manager-name{margin:8px 0 0;font-size:clamp(25px,3vw,39px);letter-spacing:-.045em}
        .bm-manager-sub{margin:7px 0 0;color:#c0c0ba;font-size:13px}
        .bm-role-chip{display:inline-flex;margin-top:15px;padding:7px 11px;border-radius:999px;border:1px solid rgba(0,117,23,.27);background:rgba(0,117,23,.13);font-size:10px;font-weight:850;color:#4ade80}
        .bm-grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:18px}
        .bm-card{min-width:0;padding:20px;border:1px solid #27272a;border-radius:22px;background:linear-gradient(145deg,rgba(18,18,20,.98),rgba(11,11,12,.98));box-shadow:0 24px 70px rgba(0,0,0,.38)}
        .bm-metric{grid-column:span 3;min-height:130px}
        .bm-metric-head{display:flex;align-items:center;justify-content:space-between;gap:10px}
        .bm-metric-label{color:#c0c0ba;font-size:12px}
        .bm-metric-icon{width:36px;height:36px;flex:0 0 auto;display:grid;place-items:center;border:1px solid #2d2d31;border-radius:11px;background:#18181b;color:#4ade80}
        .bm-metric-value{margin-top:21px;font-size:30px;font-weight:850;letter-spacing:-.045em}
        .bm-orders-card{grid-column:span 12}
        .bm-section-head{margin-bottom:18px}
        .bm-section-title{margin:0;font-size:17px;letter-spacing:-.02em}
        .bm-section-desc{margin:5px 0 0;color:#999994;font-size:11px;line-height:1.5}
        .bm-table{display:grid;gap:8px}
        .bm-row{display:grid;grid-template-columns:minmax(100px,1.2fr) minmax(90px,.9fr) minmax(90px,.9fr);gap:10px;align-items:center;padding:13px 14px;border-radius:14px;font-size:11px}
        .bm-row-header{padding-top:0;color:#999994;font-size:8px;font-weight:850;letter-spacing:.1em;text-transform:uppercase}
        .bm-row:not(.bm-row-header){border:1px solid #222225;background:#0b0b0c}
        .bm-row-clickable{width:100%;color:inherit;text-align:left;cursor:pointer;transition:border-color .15s}
        .bm-row-clickable:hover{border-color:rgba(0,117,23,.3)}
        .bm-status-btn{padding:7px 14px;border-radius:100px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;cursor:pointer;border:1px solid #27272a;background:#111113;color:#c0c0ba}
        .bm-status-btn[data-active="true"]{border-color:rgba(0,117,23,.5);background:rgba(0,117,23,.13);color:#fff}
        .bm-status-btn:disabled{opacity:.6;cursor:wait}
        .bm-status{width:max-content;padding:6px 9px;border:1px solid rgba(114,227,157,.2);border-radius:999px;background:rgba(114,227,157,.11);color:#72e39d;font-size:8px;font-weight:900;text-transform:uppercase}
        .bm-status.pending{color:#edc96c;border-color:rgba(237,201,108,.2);background:rgba(237,201,108,.1)}
        .bm-empty{color:#999994;font-size:12px}
        .bm-toast{position:fixed;right:22px;bottom:22px;z-index:150;padding:12px 15px;border:1px solid #27272a;border-radius:13px;background:#171719;box-shadow:0 20px 55px rgba(0,0,0,.5);font-size:10px;font-weight:850}
        .bm-settings-layout{display:grid;grid-template-columns:270px minmax(0,1fr);gap:18px}
        .bm-avatar-card{display:flex;flex-direction:column;align-items:center;text-align:center;padding:30px 18px}
        .bm-avatar-xl{width:160px;height:160px;margin-bottom:16px;border-width:3px;border-color:rgba(255,255,255,.14);box-shadow:0 20px 48px rgba(0,0,0,.42),0 0 0 7px rgba(0,117,23,.07)}
        .bm-avatar-xl .bm-avatar-fallback{font-size:2.4em}
        .bm-avatar-name{margin:0;font-size:19px;letter-spacing:-.01em}
        .bm-avatar-role{margin:4px 0 0;color:#999994;font-size:11px}
        .bm-photo-actions{display:flex;justify-content:center;flex-wrap:wrap;gap:8px;margin-top:16px}
        @media(max-width:900px){.bm-settings-layout{grid-template-columns:1fr}}
        .bm-form-card{padding:20px;border:1px solid #27272a;border-radius:20px;background:#0d0d0f}
        .bm-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:13px}
        .bm-field{display:grid;gap:7px}
        .bm-field.full{grid-column:1/-1}
        .bm-field label{color:#c0c0ba;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.08em}
        .bm-input,.bm-select{width:100%;min-height:44px;padding:0 12px;color:#fff;border:1px solid #27272a;border-radius:12px;outline:none;background:#111113;font-size:14px}
        .bm-input:focus,.bm-select:focus{border-color:rgba(0,117,23,.55);box-shadow:0 0 0 3px rgba(0,117,23,.08)}
        .bm-form-actions{display:flex;gap:9px;align-items:center;margin-top:16px}
        .bm-primary-btn{padding:0 17px;min-height:44px;border-radius:13px;font-weight:800;border:1px solid #007517;color:#fff;background:#007517}
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
        .bm-badge{padding:6px 9px;border-radius:999px;border:1px solid rgba(0,117,23,.25);background:rgba(0,117,23,.13);color:#4ade80;font-size:8px;font-weight:900;text-transform:uppercase}
        .bm-error{color:#ff8b84;font-size:12px;margin:0 0 12px}
        .bm-support-layout{display:grid;grid-template-columns:210px minmax(0,1fr);gap:13px}
        .bm-support-list{display:grid;gap:8px;align-content:start}
        .bm-conversation-label{position:relative;padding:12px;border:1px solid #27272a;border-radius:14px;background:#0b0b0c;text-align:left;color:inherit}
        .bm-conversation-label.active{border-color:rgba(0,117,23,.34);background:rgba(0,117,23,.13)}
        .bm-conversation-label strong{display:block;font-size:10px}
        .bm-conversation-label small{display:block;margin-top:4px;color:#999994;font-size:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .bm-unread-dot{position:absolute;top:10px;right:10px;width:7px;height:7px;border-radius:50%;background:#007517}
        .bm-partner-badge{display:inline-block;margin-left:6px;padding:2px 6px;border-radius:100px;background:rgba(118,87,255,.16);color:#a996ff;font-size:8px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;vertical-align:middle}
        .bm-chat{padding:14px;display:flex;flex-direction:column;min-height:305px;border:1px solid #27272a;border-radius:16px;background:#09090a}
        .bm-chat-thread{display:flex;flex-direction:column;gap:10px;flex:1;overflow-y:auto}
        .bm-message{max-width:78%;padding:10px 12px;border:1px solid #29292d;border-radius:14px;background:#17171a;font-size:12px;line-height:1.5}
        .bm-message.out{margin-left:auto;border-color:rgba(0,117,23,.2);background:rgba(0,117,23,.13)}
        .bm-reply{display:flex;gap:8px;margin-top:12px}
        .bm-reply .bm-input{flex:1;min-width:0}
        @media(max-width:900px){.bm-support-layout{grid-template-columns:1fr}}
        .bm-content-frame{width:100%;height:min(860px,calc(100vh - 220px));min-height:520px;border:0;display:block}
        .bm-mobile-nav{display:none}
        @media(max-width:900px){
          .bm-app{grid-template-columns:1fr}
          .bm-sidebar{display:none}
          .bm-main{padding:16px 13px 95px}
          .bm-signout-mobile{display:block}
          .bm-metric{grid-column:span 6}
          .bm-form-grid{grid-template-columns:1fr}
          .bm-mobile-nav{position:fixed;left:8px;right:8px;bottom:max(8px,env(safe-area-inset-bottom));z-index:80;display:flex;justify-content:space-around;align-items:center;gap:2px;height:64px;padding:0 4px;border:1px solid #27272a;border-radius:20px;background:rgba(14,14,15,.96);backdrop-filter:blur(20px);box-shadow:0 18px 48px rgba(0,0,0,.48);overflow-x:auto}
          .bm-mobile-link{flex:1 0 auto;min-width:52px;padding:6px 4px;display:grid;place-items:center;gap:3px;border:0;background:none;color:#83837f;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.03em}
          .bm-mobile-link svg{width:18px;height:18px}
          .bm-mobile-link.active{color:#4ade80}
        }
      `}</style>
    </div>
  );
}

const UNIK_ORDER_STATUSES = ["pending", "fulfilled", "awaiting_pickup", "picked_up", "in_transit", "out_for_delivery", "delivered", "cancelled"];
const PAYMENT_STATUSES = ["awaiting_payment", "pending", "paid", "failed", "abandoned", "refunded"];

type OrderDetail = OrderRow & {
  customer_email?: string;
  customer_phone?: string;
  payment_method?: string;
  shipping_address?: { address?: string; apartment?: string; city?: string; province?: string; postal_code?: string } | null;
  fulfillment_method?: string;
  shipping_option?: string;
  shipping_cost?: number;
  refund_amount?: number | null;
  notes?: string | null;
};

function SalesPanel({ metrics, authedFetch, toast }: { metrics: Overview["metrics"]; authedFetch: (path: string, init?: RequestInit) => Promise<Response>; toast: (text: string) => void }) {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [orderView, setOrderView] = useState<"active" | "stray">("active");

  const loadOrders = useCallback(async (targetPage: number) => {
    setLoading(true);
    const res = await authedFetch(`/api/unik/brand-manager/orders?page=${targetPage}`);
    const payload = await res.json().catch(() => ({}));
    if (res.ok) {
      setOrders((prev) => (targetPage === 0 ? payload.orders : [...prev, ...payload.orders]));
      setHasMore(!!payload.hasMore);
      setPage(targetPage);
    }
    setLoading(false);
  }, [authedFetch]);

  useEffect(() => { loadOrders(0); }, [loadOrders]);

  const loadDetail = useCallback(async (id: string) => {
    setSelectedId(id);
    setDetail(null);
    const res = await authedFetch(`/api/unik/brand-manager/orders/${id}`);
    const payload = await res.json().catch(() => ({}));
    if (res.ok) {
      setDetail(payload.order);
      setRefundAmount(String(payload.order.refund_amount ?? payload.order.total));
    }
  }, [authedFetch]);

  async function updateOrder(patch: { status?: string; paymentStatus?: string; refundAmount?: number }, confirmMessage?: string) {
    if (!selectedId || !detail) return;
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setDetailBusy(true);
    const res = await authedFetch(`/api/unik/brand-manager/orders/${selectedId}`, { method: "PATCH", body: JSON.stringify(patch) });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) { toast(payload.error || "Could not update order"); setDetailBusy(false); return; }
    const updated = {
      ...detail,
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.paymentStatus ? { payment_status: patch.paymentStatus } : {}),
      ...(patch.refundAmount !== undefined ? { refund_amount: patch.refundAmount } : {}),
    };
    setDetail(updated);
    setOrders((prev) => prev.map((o) => (o.id === selectedId ? { ...o, ...updated } : o)));
    toast("Order updated");
    setDetailBusy(false);
  }

  function markRefunded() {
    if (!detail) return;
    const amount = Number(refundAmount);
    if (!refundAmount.trim() || !Number.isFinite(amount) || amount < 0 || amount > detail.total) {
      toast(`Enter a refund amount between R0 and ${money(detail.total)}`);
      return;
    }
    if (!window.confirm(`Mark ${money(amount)} of ${money(detail.total)} as refunded? This only updates the order's status for tracking -- you still need to process the actual refund through Yoco's merchant portal.`)) return;
    updateOrder({ paymentStatus: "refunded", refundAmount: amount });
  }

  // Abandoned/failed checkouts never charged anyone -- they were sitting in
  // the same "All orders" list as real sales, told apart only by a small
  // badge that looked nearly identical to "pending". Split them out.
  const strayOrders = orders.filter((o) => o.payment_status === "abandoned" || o.payment_status === "failed");
  const activeOrders = orders.filter((o) => o.payment_status !== "abandoned" && o.payment_status !== "failed");
  const visibleOrders = orderView === "active" ? activeOrders : strayOrders;

  if (selectedId) {
    return (
      <section>
        <button type="button" className="bm-secondary-btn" style={{ marginBottom: 16 }} onClick={() => { setSelectedId(null); setDetail(null); }}>&larr; All orders</button>
        {!detail ? <p className="bm-empty">Loading order…</p> : (
          <>
            <article className="bm-card" style={{ marginBottom: 16 }}>
              <div className="bm-section-head"><h2 className="bm-section-title">Order #{detail.order_number}</h2><span className="bm-section-desc">{new Date(detail.created_at).toLocaleString()}</span></div>

              <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                <button type="button" className="bm-secondary-btn" disabled={detailBusy || detail.status === "cancelled"} onClick={() => updateOrder({ status: "cancelled" }, "Cancel this order? This only updates the order's status for tracking -- it does not refund the customer.")}>Cancel order</button>
              </div>

              <div style={{ marginBottom: 8, fontSize: 10, fontWeight: 800, color: "#999994", textTransform: "uppercase", letterSpacing: ".08em" }}>Refund</div>
              {detail.payment_status === "refunded" && detail.refund_amount != null && (
                <p className="bm-section-desc" style={{ margin: "0 0 8px" }}>Currently marked refunded: {money(detail.refund_amount)} of {money(detail.total)}</p>
              )}
              <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
                <input
                  className="bm-input"
                  style={{ maxWidth: 140 }}
                  type="number"
                  min={0}
                  max={detail.total}
                  step="0.01"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  aria-label="Refund amount"
                />
                <span className="bm-section-desc" style={{ margin: 0 }}>of {money(detail.total)} -- edit to refund only delivery, a single item, or a partial amount</span>
                <button type="button" className="bm-secondary-btn" disabled={detailBusy} onClick={markRefunded}>Mark refunded</button>
              </div>

              <div style={{ marginBottom: 8, fontSize: 10, fontWeight: 800, color: "#999994", textTransform: "uppercase", letterSpacing: ".08em" }}>Payment status</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
                {PAYMENT_STATUSES.map((s) => (
                  <button key={s} type="button" disabled={detailBusy} onClick={() => updateOrder({ paymentStatus: s })} className="bm-status-btn" data-active={detail.payment_status === s}>{s.replace(/_/g, " ")}</button>
                ))}
              </div>

              <div style={{ marginBottom: 8, fontSize: 10, fontWeight: 800, color: "#999994", textTransform: "uppercase", letterSpacing: ".08em" }}>Order status</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {UNIK_ORDER_STATUSES.map((s) => (
                  <button key={s} type="button" disabled={detailBusy} onClick={() => updateOrder({ status: s })} className="bm-status-btn" data-active={detail.status === s}>{s.replace(/_/g, " ")}</button>
                ))}
              </div>
            </article>

            <div className="bm-form-grid" style={{ marginBottom: 16 }}>
              <article className="bm-card">
                <div className="bm-section-title" style={{ marginBottom: 10 }}>Customer</div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{detail.customer_name || "N/A"}</div>
                {detail.customer_email && <div style={{ fontSize: 12, color: "#999994", marginTop: 4 }}>{detail.customer_email}</div>}
                {detail.customer_phone && <div style={{ fontSize: 12, color: "#999994", marginTop: 2 }}>{detail.customer_phone}</div>}
              </article>
              <article className="bm-card">
                <div className="bm-section-title" style={{ marginBottom: 10 }}>{detail.fulfillment_method === "pickup" ? "Pickup" : "Delivery"}</div>
                {detail.fulfillment_method === "pickup" ? <div style={{ fontSize: 12, color: "#999994" }}>Customer will pick up</div> : detail.shipping_address ? (
                  <div style={{ fontSize: 12, color: "#999994", lineHeight: 1.6 }}>{detail.shipping_address.address}{detail.shipping_address.apartment ? ", " + detail.shipping_address.apartment : ""}<br />{detail.shipping_address.city}, {detail.shipping_address.province}<br />{detail.shipping_address.postal_code}</div>
                ) : <div style={{ fontSize: 12, color: "#999994" }}>No address provided</div>}
              </article>
            </div>

            {detail.notes && (
              <article className="bm-card" style={{ marginBottom: 16 }}>
                <div className="bm-section-title" style={{ marginBottom: 10 }}>Special instructions</div>
                <div style={{ fontSize: 12, color: "#999994", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{detail.notes}</div>
              </article>
            )}

            <article className="bm-card">
              <div className="bm-section-title" style={{ marginBottom: 14 }}>Order items</div>
              {(detail.items || []).map((item, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: i < detail.items.length - 1 ? "1px solid #27272a" : "none", fontSize: 13 }}>
                  <span>{item.name} x{item.qty}</span><strong>{money(item.price * item.qty)}</strong>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 14, marginTop: 6, borderTop: "1px solid #27272a", fontSize: 16, fontWeight: 900 }}><span>Total</span><span>{money(detail.total)}</span></div>
            </article>
          </>
        )}
      </section>
    );
  }

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
        <div className="bm-section-head"><h2 className="bm-section-title">Orders</h2><p className="bm-section-desc">Click an order to view details, update its status, or cancel/refund it</p></div>
        <div style={{ display: "flex", gap: 8, margin: "14px 0 4px" }}>
          <button type="button" className="bm-status-btn" data-active={orderView === "active"} onClick={() => setOrderView("active")}>Active ({activeOrders.length}{hasMore ? "+" : ""})</button>
          <button type="button" className="bm-status-btn" data-active={orderView === "stray"} onClick={() => setOrderView("stray")}>Abandoned &amp; failed ({strayOrders.length})</button>
        </div>
        {orderView === "stray" && <p className="bm-section-desc" style={{ margin: "10px 0 0" }}>Checkout was started but no payment ever came through -- nothing was charged.</p>}
        {visibleOrders.length === 0 && !loading ? (
          <p className="bm-empty">{orderView === "active" ? "No orders yet." : "No abandoned or failed checkouts."}</p>
        ) : (
          <div className="bm-table" style={{ marginTop: 14 }}>
            <div className="bm-row bm-row-header"><div>Customer</div><div>Value</div><div>Status</div></div>
            {visibleOrders.map((order) => (
              <button key={order.id} type="button" className="bm-row bm-row-clickable" onClick={() => loadDetail(order.id)}>
                <div>{order.customer_name || "Customer"}</div>
                <div>{money(order.total)}</div>
                <div><span className={"bm-status" + (order.payment_status === "paid" ? "" : " pending")}>{order.payment_status === "paid" ? order.status.replace(/_/g, " ") : order.payment_status.replace(/_/g, " ")}</span></div>
              </button>
            ))}
          </div>
        )}
        {orderView === "active" && hasMore && <button type="button" className="bm-secondary-btn" style={{ marginTop: 14 }} disabled={loading} onClick={() => loadOrders(page + 1)}>{loading ? "Loading…" : "Load more"}</button>}
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

const RECAP_TOOLS = {
  ai: {
    label: "AI Studio Demo",
    src: "/private-templates/unik-labs/recap.html",
    title: "AI Studio Recap Builder",
    desc: "Turn a finished AI Studio generation into a shareable 9:16 story for Reels, TikTok or Stories -- garment, colour, the photos, the style, the name, the design reveal, the mockup and size, then export or screen-record it.",
  },
  custom: {
    label: "Custom Upload Demo",
    src: "/private-templates/unik-labs/recap-custom.html",
    title: "Custom Upload Recap Builder",
    desc: "Same idea for a Custom Upload order -- garment, colour, front (and optional back) artwork placed on the real print zone, size, then export or screen-record it. Leave Back artwork empty for a front-only order and it's excluded automatically, priced to match.",
  },
} as const;

function ContentPanel() {
  const [tool, setTool] = useState<keyof typeof RECAP_TOOLS>("ai");
  const active = RECAP_TOOLS[tool];
  return (
    <section>
      <article className="bm-card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="bm-section-head" style={{ padding: "20px 20px 0" }}>
          <h2 className="bm-section-title">Recap Builder</h2>
          <p className="bm-section-desc">{active.desc}</p>
          <div style={{ display: "flex", gap: 8, margin: "14px 0 4px" }}>
            {(Object.keys(RECAP_TOOLS) as Array<keyof typeof RECAP_TOOLS>).map((key) => (
              <button key={key} type="button" className="bm-status-btn" data-active={tool === key} onClick={() => setTool(key)}>{RECAP_TOOLS[key].label}</button>
            ))}
          </div>
        </div>
        <iframe key={tool} src={active.src} title={active.title} className="bm-content-frame" />
      </article>
    </section>
  );
}
type Conversation = { id: string; name: string | null; email: string | null; status: string; category: string; seller_unread: number; last_message_at: string; last_message_preview: string | null; created_at: string };
type ChatMessage = { id: string; sender: string; body: string; created_at: string };

function SupportPanel({ authedFetch }: { authedFetch: (path: string, init?: RequestInit) => Promise<Response> }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const loadConversations = useCallback(async () => {
    const res = await authedFetch("/api/unik/brand-manager/conversations");
    const payload = await res.json().catch(() => ({}));
    if (res.ok) setConversations(payload.conversations || []);
    setLoading(false);
  }, [authedFetch]);

  useEffect(() => {
    loadConversations();
    const timer = setInterval(loadConversations, 15000);
    return () => clearInterval(timer);
  }, [loadConversations]);

  const loadThread = useCallback(async (id: string) => {
    const res = await authedFetch(`/api/unik/brand-manager/conversations/${id}`);
    const payload = await res.json().catch(() => ({}));
    if (res.ok) setMessages(payload.messages || []);
  }, [authedFetch]);

  useEffect(() => {
    if (!activeId) return;
    loadThread(activeId);
    const timer = setInterval(() => loadThread(activeId), 5000);
    return () => clearInterval(timer);
  }, [activeId, loadThread]);

  async function sendReply() {
    if (!activeId || !reply.trim()) return;
    setSending(true);
    const res = await authedFetch(`/api/unik/brand-manager/conversations/${activeId}`, { method: "POST", body: JSON.stringify({ message: reply.trim() }) });
    if (res.ok) { setReply(""); loadThread(activeId); loadConversations(); }
    setSending(false);
  }

  return (
    <section>
      <article className="bm-card">
        <div className="bm-section-head"><h2 className="bm-section-title">Customer conversations</h2><p className="bm-section-desc">{conversations.filter((c) => c.seller_unread > 0).length} unread</p></div>
        <div className="bm-support-layout">
          <div className="bm-support-list">
            {loading ? <p className="bm-empty">Loading…</p> : conversations.length === 0 ? <p className="bm-empty">No conversations yet.</p> : conversations.map((c) => (
              <button key={c.id} type="button" className={"bm-conversation-label" + (activeId === c.id ? " active" : "")} onClick={() => setActiveId(c.id)}>
                <strong>{c.name || c.email || "Customer"}{c.category === "partner" && <span className="bm-partner-badge">Partner</span>}</strong>
                <small>{c.last_message_preview || "No messages yet"}</small>
                {c.seller_unread > 0 && <span className="bm-unread-dot" />}
              </button>
            ))}
          </div>
          <div className="bm-chat">
            {!activeId ? <p className="bm-empty">Select a conversation.</p> : (
              <>
                <div className="bm-chat-thread">
                  {messages.map((m) => <div key={m.id} className={"bm-message" + (m.sender !== "visitor" ? " out" : "")}>{m.body}</div>)}
                </div>
                <div className="bm-reply">
                  <input className="bm-input" value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply" onKeyDown={(e) => { if (e.key === "Enter") sendReply(); }} />
                  <button type="button" className="bm-primary-btn" disabled={sending || !reply.trim()} onClick={sendReply}>Send</button>
                </div>
              </>
            )}
          </div>
        </div>
      </article>
    </section>
  );
}

type PartnerRow = {
  id: string;
  full_name: string;
  email: string;
  status: "pending" | "active" | "suspended";
  referral_code: string | null;
  commission_percent: number | null;
  available_balance_cents: number;
  pending_balance_cents: number;
  total_earned_cents: number;
  created_at: string;
};

function PartnersPanel({ authedFetch, toast }: { authedFetch: (path: string, init?: RequestInit) => Promise<Response>; toast: (text: string) => void }) {
  const [partners, setPartners] = useState<PartnerRow[] | null>(null);
  const [defaultRate, setDefaultRate] = useState(10);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await authedFetch("/api/unik/brand-manager/partners");
    const payload = await res.json().catch(() => ({}));
    if (res.ok) {
      setPartners(payload.partners || []);
      setDefaultRate(payload.defaultCommissionPercent ?? 10);
    }
  }, [authedFetch]);

  useEffect(() => { load(); }, [load]);

  async function review(partnerId: string, action: "approve" | "reject") {
    setBusyId(partnerId);
    const res = await authedFetch("/api/unik/brand-manager/partners", { method: "PATCH", body: JSON.stringify({ partnerId, action }) });
    const payload = await res.json().catch(() => ({}));
    setBusyId(null);
    if (!res.ok) { toast(payload.error || "Could not update this application"); return; }
    toast(action === "approve" ? "Partner approved" : "Application rejected");
    load();
  }

  if (!partners) return <section className="bm-empty">Loading partners…</section>;

  const pending = partners.filter((p) => p.status === "pending");
  const active = partners.filter((p) => p.status === "active");

  return (
    <section>
      <article className="bm-card bm-orders-card">
        <div className="bm-section-head"><h2 className="bm-section-title">Pending applications</h2><p className="bm-section-desc">Approving generates their referral code and a real discount code, live immediately.</p></div>
        {pending.length === 0 ? <p className="bm-empty">No pending applications.</p> : (
          <div className="bm-table">
            <div className="bm-row bm-row-header"><div>Name</div><div>Email</div><div>Actions</div></div>
            {pending.map((p) => (
              <div className="bm-row" key={p.id}>
                <div>{p.full_name}</div>
                <div>{p.email}</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" disabled={busyId === p.id} onClick={() => review(p.id, "approve")} style={{ padding: "6px 12px", borderRadius: 100, border: "1px solid #22c55e", background: "rgba(34,197,94,0.12)", color: "#22c55e", fontSize: 11, fontWeight: 700 }}>Approve</button>
                  <button type="button" disabled={busyId === p.id} onClick={() => review(p.id, "reject")} style={{ padding: "6px 12px", borderRadius: 100, border: "1px solid #3a3a3d", background: "transparent", color: "#999994", fontSize: 11, fontWeight: 700 }}>Reject</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </article>

      <article className="bm-card bm-orders-card" style={{ marginTop: 16 }}>
        <div className="bm-section-head"><h2 className="bm-section-title">Active partners</h2><p className="bm-section-desc">Default commission rate: {defaultRate}% (per-partner override coming later)</p></div>
        {active.length === 0 ? <p className="bm-empty">No active partners yet.</p> : (
          <div className="bm-table">
            <div className="bm-row bm-row-header"><div>Name</div><div>Code</div><div>Earned</div></div>
            {active.map((p) => (
              <div className="bm-row" key={p.id}>
                <div>{p.full_name}</div>
                <div>{p.referral_code || "—"}</div>
                <div>R{Math.round(p.total_earned_cents / 100).toLocaleString("en-ZA")}</div>
              </div>
            ))}
          </div>
        )}
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

  const [holder, setHolder] = useState(manager.payoutAccountHolder || "");
  const [bank, setBank] = useState(manager.payoutBank || "");
  const [accountType, setAccountType] = useState(manager.payoutAccountType || "");
  const [branchCode, setBranchCode] = useState(manager.payoutBranchCode || "");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountLast4, setAccountLast4] = useState(manager.payoutAccountLast4 || "");
  const [payoutBusy, setPayoutBusy] = useState(false);
  const [payoutError, setPayoutError] = useState("");

  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const photoInputRef = useRef<HTMLInputElement>(null);

  async function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setPhotoError("Photo must be under 5MB"); return; }
    setUploadingPhoto(true);
    setPhotoError("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) { setPhotoError("Your session has expired -- please sign in again"); return; }
      const ext = file.name.split(".").pop() || "jpg";
      const path = `brand-manager/${userId}/photo-${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("store-assets").upload(path, file, { upsert: true });
      if (uploadErr) { setPhotoError("Could not upload photo"); return; }
      const { data } = supabase.storage.from("store-assets").getPublicUrl(path);
      const avatarUrl = data.publicUrl;
      const res = await authedFetch("/api/unik/brand-manager/profile", { method: "PATCH", body: JSON.stringify({ fullName: manager.fullName, email, avatarUrl }) });
      if (!res.ok) { setPhotoError("Could not save photo"); return; }
      onProfileSaved({ ...manager, avatarUrl });
      toast("Photo updated");
    } catch {
      setPhotoError("Network error -- please try again");
    } finally {
      setUploadingPhoto(false);
    }
  }

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
    if (payload.accountLast4) setAccountLast4(payload.accountLast4);
    setAccountNumber("");
    toast("Personal earnings account updated");
    setPayoutBusy(false);
  }

  return (
    <section>
      <div className="bm-settings-layout" style={{ marginBottom: 18 }}>
        <div className="bm-card bm-avatar-card">
          <div className="bm-avatar bm-avatar-xl">
            {manager.avatarUrl ? <img src={manager.avatarUrl} alt="" /> : <div className="bm-avatar-fallback">{manager.fullName.charAt(0)}</div>}
          </div>
          <h3 className="bm-avatar-name">{manager.fullName}</h3>
          <p className="bm-avatar-role">Brand Manager</p>
          <div className="bm-photo-actions">
            <button type="button" className="bm-secondary-btn" disabled={uploadingPhoto} onClick={() => photoInputRef.current?.click()}>{uploadingPhoto ? "Uploading…" : "Change photo"}</button>
          </div>
          <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoSelect} style={{ display: "none" }} />
          {photoError && <p className="bm-error" style={{ textAlign: "center", marginTop: 10 }}>{photoError}</p>}
        </div>

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
          <div className="bm-summary-box"><span>Account</span><strong>{accountLast4 ? `•••• ${accountLast4}` : "Not added"}</strong></div>
          <div className="bm-summary-box"><span>Status</span><strong>{accountLast4 ? "Ready for verification" : "Setup required"}</strong></div>
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
          <div className="bm-field"><label>Account number</label><input className="bm-input" inputMode="numeric" maxLength={16} value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder={accountLast4 ? `Currently •••• ${accountLast4} -- leave blank to keep` : "Enter account number"} required={!accountLast4} /></div>
          {payoutError && <div className="bm-field full"><p className="bm-error">{payoutError}</p></div>}
          <div className="bm-field full bm-form-actions"><button className="bm-primary-btn" disabled={payoutBusy}>{payoutBusy ? "Saving…" : "Update payout account"}</button></div>
        </form>
      </article>
    </section>
  );
}
