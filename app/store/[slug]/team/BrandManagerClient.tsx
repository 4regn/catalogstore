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

type Panel = "overview" | "sales" | "customers" | "followups" | "growth" | "studio" | "content" | "support" | "partners" | "academy" | "settings";

const PANEL_TITLES: Record<Panel, string> = {
  overview: "Brand Manager overview",
  sales: "Sales",
  customers: "Customers",
  followups: "Follow-ups",
  growth: "Growth Tools",
  studio: "Studio",
  content: "Recap Builder",
  support: "Live Support",
  partners: "Partners",
  academy: "UNIK Academy",
  settings: "Settings",
};

const MOBILE_NAV_LABELS: Record<Panel, string> = {
  overview: "Home",
  sales: "Sales",
  customers: "Customers",
  followups: "Follow-up",
  growth: "Growth",
  studio: "Studio",
  content: "Recap",
  support: "Support",
  partners: "Partners",
  academy: "Academy",
  settings: "Settings",
};

const NAV_ICON_PATHS: Record<Panel, string> = {
  overview: "M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-3H4zM14 7h6V4h-6z",
  sales: "M3 6h18M6 3v6M18 3v6M5 11h14v9H5z",
  customers: "M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM4 21c0-4 3.6-7 8-7s8 3 8 7",
  followups: "M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z",
  growth: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM8 12h8M12 8v8",
  studio: "M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6L12 3ZM19 14l.7 2.3L22 17l-2.3.7L19 20l-.7-2.3L16 17l2.3-.7L19 14Z",
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

  // recap.html has no bearer-token plumbing of its own -- it relies on the
  // httpOnly unik-brand-manager-access cookie set at login. That cookie
  // expires after 55min with nothing to renew it, while this dashboard's
  // own Supabase session keeps refreshing itself indefinitely, so a
  // manager active for over an hour would look signed-in here but get
  // "Sign in required" from Recap Builder. Re-arm the cookie every time we
  // see a (possibly refreshed) token, not just at login.
  const syncRecapCookie = useCallback((token: string) => {
    fetch("/api/unik/brand-manager/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessToken: token }) }).catch(() => {});
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
    syncRecapCookie(token);
    try {
      const res = await fetch("/api/unik/brand-manager/overview", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Could not load your dashboard");
      setOverview(payload);
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : "Could not load your dashboard");
    }
    setSessionReady(true);
  }, [syncRecapCookie]);

  useEffect(() => {
    load();
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") { setSignedIn(false); setOverview(null); }
      if (event === "TOKEN_REFRESHED" && session?.access_token) syncRecapCookie(session.access_token);
    });
    return () => data.subscription.unsubscribe();
  }, [load, syncRecapCookie]);

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
        {panel === "customers" && <CustomersPanel authedFetch={authedFetch} toast={showToast} />}
        {panel === "followups" && <FollowUpsPanel authedFetch={authedFetch} />}
        {panel === "growth" && <GrowthPanel manager={overview.manager} authedFetch={authedFetch} onSaved={(m) => setOverview({ ...overview, manager: m })} toast={showToast} />}
        {panel === "studio" && <StudioPanel authedFetch={authedFetch} toast={showToast} />}
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
        .bm-row-customers{grid-template-columns:minmax(100px,1.3fr) minmax(60px,.6fr) minmax(80px,.8fr) minmax(80px,.7fr)}
        .bm-row-partners{grid-template-columns:minmax(90px,1fr) minmax(70px,.8fr) minmax(70px,.7fr) minmax(140px,1.1fr)}
        .bm-row-clickable{width:100%;color:inherit;text-align:left;cursor:pointer;transition:border-color .15s}
        .bm-row-clickable:hover{border-color:rgba(0,117,23,.3)}
        .bm-status-btn{padding:7px 14px;border-radius:100px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;cursor:pointer;border:1px solid #27272a;background:#111113;color:#c0c0ba}
        .bm-status-btn[data-active="true"]{border-color:rgba(0,117,23,.5);background:rgba(0,117,23,.13);color:#fff}
        .bm-status-btn:disabled{opacity:.6;cursor:wait}
        .bm-status{width:max-content;padding:6px 9px;border:1px solid rgba(114,227,157,.2);border-radius:999px;background:rgba(114,227,157,.11);color:#72e39d;font-size:8px;font-weight:900;text-transform:uppercase}
        .bm-status.pending{color:#edc96c;border-color:rgba(237,201,108,.2);background:rgba(237,201,108,.1)}
        .bm-empty{color:#999994;font-size:12px}
        .bm-design-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:14px;margin-top:14px}
        .bm-design-card{border:1px solid #222225;border-radius:14px;overflow:hidden;background:#0b0b0c}
        .bm-design-card img{width:100%;object-fit:contain;display:block;background:#151517}
        .bm-design-placeholder{width:100%;aspect-ratio:3/4;background:#151517}
        .bm-design-body{padding:10px 12px 12px}
        .bm-design-name{display:block;font-size:12.5px;font-weight:700}
        .bm-design-meta{display:block;font-size:10.5px;color:#999994;text-transform:capitalize;margin:2px 0 8px}
        .bm-design-tag{display:inline-block;margin-left:6px;padding:2px 7px;border-radius:100px;background:rgba(237,201,108,.13);color:#edc96c;font-size:8.5px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;vertical-align:middle}
        .bm-design-actions{display:flex;flex-direction:column;gap:6px}
        .bm-refphoto-row{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
        .bm-refphoto-row img{width:44px;height:44px;object-fit:cover;border-radius:8px;border:1px solid #27272a}
        .bm-design-actions button{padding:7px 10px;border-radius:8px;border:1px solid #27272a;background:#111113;color:#c0c0ba;font-size:11px;font-weight:700;text-align:left;cursor:pointer}
        .bm-design-actions button:hover{color:#fff;border-color:#3a3a3d}
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

type CustomerRow = {
  id: string; profileId: string | null; fullName: string | null; email: string | null; avatarUrl: string | null;
  createdAt: string; orderCount: number; totalSpent: number; designCount: number; lastOrderAt: string | null;
};
type CustomerDesign = {
  id: string; source: string; status: string; name: string | null; garment: string; colour: string; size: string; style: string | null;
  tagline: string | null; zone: string | null; mockupUrl: string | null; mockupBackUrl: string | null;
  hasOriginal: boolean; hasOriginalBack: boolean; hasRefPhotos: boolean; savedAt: string | null; createdAt: string; unpurchased: boolean;
};
type CustomerDetail = {
  customer: { id: string; profileId: string | null; fullName: string | null; email: string | null; phone: string | null; avatarUrl: string | null; createdAt: string | null };
  summary: { orderCount: number; totalSpent: number; designCount: number; unpurchasedCount: number };
  orders: OrderRow[];
  designs: CustomerDesign[];
};

function DesignCard({ d, onDownload, onFetchRefPhotos }: {
  d: CustomerDesign; onDownload: (designId: string, type: string) => void; onFetchRefPhotos: (designId: string) => Promise<string[]>;
}) {
  const [refPhotos, setRefPhotos] = useState<string[] | null>(null);
  const [loadingPhotos, setLoadingPhotos] = useState(false);

  async function toggleRefPhotos() {
    if (refPhotos) { setRefPhotos(null); return; }
    setLoadingPhotos(true);
    setRefPhotos(await onFetchRefPhotos(d.id));
    setLoadingPhotos(false);
  }

  return (
    <div className="bm-design-card">
      {d.mockupUrl ? <img src={d.mockupUrl} alt="" style={{ aspectRatio: d.garment === "hoodie" ? "2/3" : "1" }} /> : <div className="bm-design-placeholder" />}
      <div className="bm-design-body">
        <span className="bm-design-name">{d.name || "Untitled"}</span>
        <span className="bm-design-meta">{d.source === "ai-studio" ? "AI Studio" : "Custom Upload"} · {d.garment} · {d.colour} · {d.size}{d.unpurchased && <span className="bm-design-tag">Unpurchased</span>}</span>
        <div className="bm-design-actions">
          {d.hasOriginal && <button type="button" onClick={() => onDownload(d.id, "original")}>Download design</button>}
          {d.mockupUrl && <button type="button" onClick={() => onDownload(d.id, "mockup")}>Download mockup</button>}
          {d.hasOriginalBack && <button type="button" onClick={() => onDownload(d.id, "original-back")}>Download back design</button>}
          {d.mockupBackUrl && <button type="button" onClick={() => onDownload(d.id, "mockup-back")}>Download back mockup</button>}
          {d.hasRefPhotos && (
            <button type="button" onClick={toggleRefPhotos} disabled={loadingPhotos}>
              {loadingPhotos ? "Loading…" : refPhotos ? "Hide reference photos" : "View reference photos"}
            </button>
          )}
        </div>
        {refPhotos && (
          refPhotos.length ? (
            <div className="bm-refphoto-row">{refPhotos.map((src, i) => <img key={i} src={src} alt="Uploaded reference" />)}</div>
          ) : (
            <p className="bm-empty" style={{ marginTop: 8 }}>Reference photos are no longer available (kept for 30 days).</p>
          )
        )}
      </div>
    </div>
  );
}

function CustomersPanel({ authedFetch, toast }: { authedFetch: (path: string, init?: RequestInit) => Promise<Response>; toast: (text: string) => void }) {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);

  const loadCustomers = useCallback(async (targetPage: number, q: string) => {
    setLoading(true);
    const res = await authedFetch(`/api/unik/brand-manager/customers?page=${targetPage}&q=${encodeURIComponent(q)}`);
    const payload = await res.json().catch(() => ({}));
    if (res.ok) {
      setCustomers((prev) => (targetPage === 0 ? payload.customers : [...prev, ...payload.customers]));
      setHasMore(!!payload.hasMore);
      setPage(targetPage);
    }
    setLoading(false);
  }, [authedFetch]);

  useEffect(() => { loadCustomers(0, ""); }, [loadCustomers]);

  function runSearch(event: FormEvent) {
    event.preventDefault();
    loadCustomers(0, query);
  }

  const loadDetail = useCallback(async (id: string) => {
    setSelectedId(id);
    setDetail(null);
    const res = await authedFetch(`/api/unik/brand-manager/customers/${id}`);
    const payload = await res.json().catch(() => ({}));
    if (res.ok) setDetail(payload);
    else toast(payload.error || "Could not load customer");
  }, [authedFetch, toast]);

  const download = useCallback(async (designId: string, type: string) => {
    if (!selectedId) return;
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const res = await fetch(`/api/unik/brand-manager/customers/download?customerId=${encodeURIComponent(selectedId)}&designId=${encodeURIComponent(designId)}&type=${type}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { toast("Could not download"); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }, [selectedId, toast]);

  const fetchRefPhotos = useCallback(async (designId: string) => {
    const res = await authedFetch(`/api/unik/brand-manager/customers/ref-photos?id=${encodeURIComponent(designId)}`);
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) { toast(payload.error || "Could not load reference photos"); return []; }
    return (payload.photos || []) as string[];
  }, [authedFetch, toast]);

  if (selectedId) {
    const unpurchased = detail?.designs.filter((d) => d.unpurchased) || [];
    return (
      <section>
        <button type="button" className="bm-secondary-btn" style={{ marginBottom: 16 }} onClick={() => { setSelectedId(null); setDetail(null); }}>&larr; All customers</button>
        {!detail ? <p className="bm-empty">Loading customer…</p> : (
          <>
            <article className="bm-card" style={{ marginBottom: 16 }}>
              <div className="bm-section-head">
                <h2 className="bm-section-title">{detail.customer.fullName || "Unnamed customer"}</h2>
                <span className="bm-section-desc">{detail.customer.email || "No email on file"}{detail.customer.phone ? " · " + detail.customer.phone : ""}</span>
              </div>
              <div className="bm-summary-strip">
                <div className="bm-summary-box"><span>Orders</span><strong>{detail.summary.orderCount}</strong></div>
                <div className="bm-summary-box"><span>Total spent</span><strong>{money(detail.summary.totalSpent)}</strong></div>
                <div className="bm-summary-box"><span>Designs</span><strong>{detail.summary.designCount}</strong></div>
              </div>
            </article>

            <article className="bm-card" style={{ marginBottom: 16 }}>
              <div className="bm-section-head"><h2 className="bm-section-title">Order history</h2></div>
              {detail.orders.length === 0 ? <p className="bm-empty">No orders yet.</p> : (
                <div className="bm-table" style={{ marginTop: 14 }}>
                  <div className="bm-row bm-row-header"><div>Order</div><div>Value</div><div>Status</div></div>
                  {detail.orders.map((o) => (
                    <div key={o.id} className="bm-row">
                      <div>#{o.order_number}<br /><span style={{ color: "#999994", fontSize: 10 }}>{new Date(o.created_at).toLocaleDateString()}</span></div>
                      <div>{money(o.total)}</div>
                      <div><span className={"bm-status" + (o.payment_status === "paid" ? "" : " pending")}>{o.payment_status === "paid" ? o.status.replace(/_/g, " ") : o.payment_status.replace(/_/g, " ")}</span></div>
                    </div>
                  ))}
                </div>
              )}
            </article>

            <article className="bm-card" style={{ marginBottom: 16 }}>
              <div className="bm-section-head"><h2 className="bm-section-title">Generation history</h2><p className="bm-section-desc">Every AI Studio and Custom Upload design this customer has made — tap to download the artwork or the garment mockup</p></div>
              {detail.designs.length === 0 ? <p className="bm-empty">No designs yet.</p> : (
                <div className="bm-design-grid">
                  {detail.designs.map((d) => <DesignCard key={d.id} d={d} onDownload={download} onFetchRefPhotos={fetchRefPhotos} />)}
                </div>
              )}
            </article>

            <article className="bm-card">
              <div className="bm-section-head">
                <h2 className="bm-section-title">Saved / unpurchased designs</h2>
                <p className="bm-section-desc">Designs made or uploaded but never actually ordered. This isn't a live view of their cart — that only ever exists in their own browser and never reaches our servers — it's the closest signal we have.</p>
              </div>
              {unpurchased.length === 0 ? <p className="bm-empty">Nothing sitting unpurchased.</p> : (
                <div className="bm-design-grid">
                  {unpurchased.map((d) => <DesignCard key={d.id} d={d} onDownload={download} onFetchRefPhotos={fetchRefPhotos} />)}
                </div>
              )}
            </article>
          </>
        )}
      </section>
    );
  }

  return (
    <section>
      <article className="bm-card">
        <div className="bm-section-head"><h2 className="bm-section-title">Customers</h2><p className="bm-section-desc">Click a customer to view their order history, saved designs, and download their artwork/mockups</p></div>
        <form onSubmit={runSearch} style={{ display: "flex", gap: 8, margin: "14px 0" }}>
          <input className="bm-input" placeholder="Search by name or email" value={query} onChange={(e) => setQuery(e.target.value)} />
          <button type="submit" className="bm-secondary-btn">Search</button>
        </form>
        {customers.length === 0 && !loading ? <p className="bm-empty">No customers yet.</p> : (
          <div className="bm-table">
            <div className="bm-row bm-row-header bm-row-customers"><div>Customer</div><div>Orders</div><div>Total spent</div><div>Generations</div></div>
            {customers.map((c) => (
              <button key={c.id} type="button" className="bm-row bm-row-clickable bm-row-customers" onClick={() => loadDetail(c.id)}>
                <div>{c.fullName || "Unnamed"}<br /><span style={{ color: "#999994", fontSize: 10 }}>{c.email || "No email"}</span></div>
                <div>{c.orderCount}</div>
                <div>{money(c.totalSpent)}</div>
                <div>{c.designCount}</div>
              </button>
            ))}
          </div>
        )}
        {hasMore && <button type="button" className="bm-secondary-btn" style={{ marginTop: 14 }} disabled={loading} onClick={() => loadCustomers(page + 1, query)}>{loading ? "Loading…" : "Load more"}</button>}
      </article>
    </section>
  );
}

type GeneratedFollowUp = {
  authUserId: string; fullName: string | null; email: string | null; phone: string;
  designId: string; designName: string | null; style: string | null; previewUrl: string | null; mockupUrl: string | null; generatedAt: string;
};
type AbandonedFollowUp = {
  orderId: string; orderNumber: string; customerName: string | null; customerPhone: string; total: number; createdAt: string;
};

/* Strip non-digits, convert a leading 0 to South Africa's 27 -- same
   normalization SoftLuxuryStore.tsx uses for its own WhatsApp checkout
   link, duplicated here rather than shared since it's a two-line rule and
   the two call sites are otherwise unrelated. */
function normalizeWaNumber(raw: string): string {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("0") ? "27" + digits.slice(1) : digits;
}

function waHref(phone: string, message: string): string | null {
  const normalized = normalizeWaNumber(phone);
  return normalized ? `https://wa.me/${normalized}?text=${encodeURIComponent(message)}` : null;
}

function timeAgoLong(iso: string): string {
  const hours = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000));
  if (hours < 24) return hours <= 1 ? "about an hour ago" : `${hours} hours ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

function FollowUpsPanel({ authedFetch }: { authedFetch: (path: string, init?: RequestInit) => Promise<Response> }) {
  const [generated, setGenerated] = useState<GeneratedFollowUp[]>([]);
  const [abandoned, setAbandoned] = useState<AbandonedFollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await authedFetch("/api/unik/brand-manager/follow-ups");
      const payload = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (res.ok) {
        setGenerated(payload.generatedNotPurchased || []);
        setAbandoned(payload.abandonedCheckouts || []);
      } else {
        setError(payload.error || "Could not load follow-ups");
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [authedFetch]);

  if (loading) return <p className="bm-empty">Loading follow-ups…</p>;
  if (error) return <p className="bm-empty">{error}</p>;

  return (
    <section>
      <article className="bm-card" style={{ marginBottom: 16 }}>
        <div className="bm-section-head">
          <h2 className="bm-section-title">Generated, not purchased</h2>
          <p className="bm-section-desc">Customers who created a design in AI Studio over two hours ago and never opened checkout — only shown here because they opted in to a WhatsApp follow-up when they signed up.</p>
        </div>
        {generated.length === 0 ? (
          <p className="bm-empty">Nobody to follow up with right now.</p>
        ) : (
          <div className="bm-design-grid">
            {generated.map((g) => {
              const name = (g.fullName || "there").split(" ")[0];
              // Mockup (garment photo), not the flat watermarked artwork --
              // that's the shot that actually sells it. wa.me can't attach
              // a real image file (no such param exists in WhatsApp's
              // click-to-chat API), so the URL goes straight into the
              // message text -- most WhatsApp clients auto-unfurl a direct
              // image URL into a link-preview thumbnail in the chat. Not
              // guaranteed on every device, which is what the Download
              // button below is for.
              const image = g.mockupUrl || g.previewUrl;
              const message = `Hi ${name}! It's UNIK Labs 👋 Noticed you created "${g.designName || "a design"}" but didn't finish checking out — want a hand completing your order?${image ? `\n\n${image}` : ""}`;
              const href = waHref(g.phone, message);
              return (
                <div key={g.authUserId} className="bm-card" style={{ padding: 12 }}>
                  {image && <img src={image} alt="" style={{ width: "100%", aspectRatio: "3/4", objectFit: "cover", borderRadius: 10, background: "#1a1c1a" }} />}
                  <div style={{ marginTop: 10 }}>
                    <strong style={{ fontSize: 13 }}>{g.fullName || "Unnamed customer"}</strong>
                    <p style={{ margin: "4px 0", fontSize: 11, color: "#999994" }}>{g.designName || g.style || "Design"} · {timeAgoLong(g.generatedAt)}</p>
                  </div>
                  {href ? (
                    <div style={{ display: "flex", gap: 8 }}>
                      <a className="bm-primary-btn" style={{ flex: 1, textAlign: "center", textDecoration: "none" }} href={href} target="_blank" rel="noopener noreferrer">Message on WhatsApp</a>
                      {image && <a className="bm-secondary-btn" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }} href={image} download target="_blank" rel="noopener noreferrer" title="Download the mockup to attach it manually">Save photo</a>}
                    </div>
                  ) : (
                    <p className="bm-empty" style={{ padding: 8 }}>No valid phone number</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </article>

      <article className="bm-card">
        <div className="bm-section-head">
          <h2 className="bm-section-title">Abandoned checkout</h2>
          <p className="bm-section-desc">Started checkout, gave a phone number for delivery, but the order never got paid.</p>
        </div>
        {abandoned.length === 0 ? (
          <p className="bm-empty">No abandoned checkouts right now.</p>
        ) : (
          <div className="bm-table" style={{ marginTop: 14 }}>
            <div className="bm-row bm-row-header"><div>Order</div><div>Value</div><div /></div>
            {abandoned.map((o) => {
              const name = (o.customerName || "there").split(" ")[0];
              const message = `Hi ${name}! It's UNIK Labs — looks like order #${o.orderNumber} didn't go through. Want a hand finishing it up?`;
              const href = waHref(o.customerPhone, message);
              return (
                <div key={o.orderId} className="bm-row">
                  <div>#{o.orderNumber}<br /><span style={{ color: "#999994", fontSize: 10 }}>{o.customerName || "Unnamed"} · {timeAgoLong(o.createdAt)}</span></div>
                  <div>{money(o.total)}</div>
                  <div>{href ? <a className="bm-secondary-btn" style={{ textDecoration: "none", display: "inline-block" }} href={href} target="_blank" rel="noopener noreferrer">WhatsApp</a> : <span style={{ color: "#999994", fontSize: 11 }}>No phone</span>}</div>
                </div>
              );
            })}
          </div>
        )}
      </article>
    </section>
  );
}

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

const STUDIO_STYLE_META: { id: string; name: string; desc: string; badge?: string }[] = [
  { id: "TOUR_POSTER", name: "Tour Poster", desc: "Vintage distressed energy", badge: "Most Popular" },
  { id: "BOOTLEG", name: "Bootleg", desc: "90s rap aesthetic" },
  { id: "EDITORIAL", name: "Editorial", desc: "Art zine collage" },
  { id: "CHROME", name: "Chrome", desc: "Luxury metallic type" },
  { id: "GIANT_FACE", name: "Giant Face", desc: "Face fills the garment" },
  { id: "BLING_ERA", name: "Bling Era", desc: "3D type, airbrush glow" },
  { id: "PAPER_CUT", name: "Paper Cut", desc: "Hand-drawn annotated portrait" },
  { id: "VTG_BOOTLEG", name: "Vintage Bootleg", desc: "Collector concert poster" },
  { id: "TOON_DRIP", name: "Toon Drip", desc: "Chibi anime portrait", badge: "New" },
  { id: "CHROME_COLLAGE", name: "Chrome Collage", desc: "5-photo chrome bootleg", badge: "New" },
  { id: "I_LOVE_MY", name: "I Love My...", desc: "5-photo heart collage", badge: "New" },
];
const STUDIO_EXACT_PHOTO_COUNT: Record<string, number> = { GIANT_FACE: 1, TOON_DRIP: 1, PAPER_CUT: 1, CHROME_COLLAGE: 5, I_LOVE_MY: 5 };
const STUDIO_SIZES = ["XS", "S", "M", "L", "XL", "XXL"];

// Same pre-rendered example shots the storefront's studio.html and the
// partner dashboard's Studio tab use, so a brand manager can see what a
// garment/colour/style combination actually looks like before generating.
const DARK_STUDIO_ROOT = "/private-templates/unik-labs/assets/dark-studio/";
function darkStudioAsset(garment: string, colour: string, key: string) {
  return `${DARK_STUDIO_ROOT}${garment}-${colour}-${key}.jpg`;
}
function stylePreviewUrl(garment: string, colour: string, styleId: string) {
  return darkStudioAsset(garment, colour, styleId.toLowerCase().replace(/_/g, "-"));
}

type StudioDesign = { id: string; status: string; name: string; garment: string; colour: string; size: string; style: string; tagline: string; mockupUrl: string | null; createdAt: string };

// Mirrors studio.html's compressGenerationPhoto exactly (same 900px cap,
// same JPEG quality) -- the server-side size/format validation is tuned to
// what that produces.
function studioCompressPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read photo"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("One of your photos could not be prepared"));
      img.onload = () => {
        const scale = Math.min(1, 900 / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("Could not prepare photo")); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.76).split(",")[1]);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

/* A cut-down AI Studio built into the Brand Manager dashboard, ported from
   the partner dashboard's Studio tab (app/store/[slug]/partners/dashboard/
   PartnerDashboardClient.tsx): same generation pipeline, same no-watermark
   reasoning, same 3/day limit scoped to this manager's own account. Unlike
   the partner version, there's no cart/checkout here -- a brand manager is
   generating for their own brand's use (gifting, seeding creators, etc.),
   not reselling to a WhatsApp customer, so this is generate-and-save only. */
function StudioPanel({ authedFetch, toast }: {
  authedFetch: (path: string, init?: RequestInit) => Promise<Response>; toast: (text: string) => void;
}) {
  const [designs, setDesigns] = useState<StudioDesign[]>([]);
  const [loadingDesigns, setLoadingDesigns] = useState(true);
  const [showForm, setShowForm] = useState(true);

  const [garment, setGarment] = useState<"tee" | "hoodie">("tee");
  const [budget, setBudget] = useState(false);
  const [colour, setColour] = useState<"black" | "white">("black");
  const [subject, setSubject] = useState<"artist" | "personal">("personal");
  const [style, setStyle] = useState("TOUR_POSTER");
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [size, setSize] = useState("M");
  const [photos, setPhotos] = useState<File[]>([]);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const [remaining, setRemaining] = useState<number | null>(null);

  const isLoveMy = style === "I_LOVE_MY";
  const effectiveGarment = garment === "tee" && budget ? "tee-budget" : garment;
  const exactPhotoCount = STUDIO_EXACT_PHOTO_COUNT[style];

  const loadDesigns = useCallback(async () => {
    setLoadingDesigns(true);
    const res = await authedFetch("/api/unik/brand-manager/studio/designs", { method: "GET" });
    const payload = await res.json().catch(() => ({}));
    if (res.ok) setDesigns(payload.designs || []);
    setLoadingDesigns(false);
  }, [authedFetch]);

  useEffect(() => { loadDesigns(); }, [loadDesigns]);

  function handlePhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []).slice(0, 5);
    e.target.value = "";
    setPhotos(files);
  }

  async function generate() {
    setGenError("");
    const requiredCount = exactPhotoCount;
    if (requiredCount ? photos.length !== requiredCount : !photos.length) {
      setGenError(requiredCount ? `This style needs exactly ${requiredCount} photo${requiredCount === 1 ? "" : "s"}` : "Add between one and five photos");
      return;
    }
    const cleanedName = isLoveMy ? name.trim().replace(/\s+/g, " ").replace(/^i\s+love\s+my\s+/i, "").replace(/^my\s+/i, "").trim() : name.trim();
    if (!cleanedName) { setGenError(isLoveMy ? "Tell us who it's for" : "Add a name for your design"); return; }
    setGenerating(true);
    try {
      const compressed = await Promise.all(photos.map(studioCompressPhoto));
      const res = await authedFetch("/api/unik/brand-manager/studio/generate", {
        method: "POST",
        body: JSON.stringify({ garment: effectiveGarment, colour, subject, style, name: cleanedName, tagline: isLoveMy ? "" : tagline, size, photos: compressed }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) { setGenError(payload.error || "Generation failed"); setGenerating(false); return; }
      setRemaining(typeof payload.remaining === "number" ? payload.remaining : null);
      setName(""); setTagline(""); setPhotos([]);
      toast("Design generated");
      await loadDesigns();
      setShowForm(false);
    } catch {
      setGenError("Network error — please try again");
    } finally {
      setGenerating(false);
    }
  }

  async function download(id: string, type: "original" | "mockup") {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const res = await fetch(`/api/unik/brand-manager/studio/download?id=${encodeURIComponent(id)}&type=${type}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { toast("Could not download"); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = type === "original" ? `design-${id}.png` : `mockup-${id}.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  return (
    <section>
      <article className="bm-card">
        <div className="bm-section-head">
          <h2 className="bm-section-title">Create a design</h2>
          <p className="bm-section-desc">{remaining === null ? "3 generations / day" : `${remaining} of 3 left today`} — generate and save, no watermark.</p>
          <button type="button" className="bm-status-btn" data-active={showForm} onClick={() => setShowForm((v) => !v)} style={{ marginTop: 10 }}>{showForm ? "Hide" : "New design"}</button>
        </div>
        {showForm && (
          <div className="bms-form">
            <div className="bms-form-block">
              <span className="bms-block-label">Garment</span>
              <div className="bms-picker-grid">
                {(["tee", "hoodie"] as const).map((g) => (
                  <button key={g} type="button" className={"bms-picker-card" + (garment === g ? " sel" : "")} onClick={() => setGarment(g)}>
                    <img src={darkStudioAsset(g, colour, "flat")} alt={g === "tee" ? "Tee" : "Hoodie"} loading="lazy" />
                    <span className="bms-picker-label">{g === "tee" ? "Tee" : "Hoodie"}</span>
                  </button>
                ))}
              </div>
            </div>

            {garment === "tee" && (
              <label className="bms-checkbox">
                <input type="checkbox" checked={budget} onChange={(e) => setBudget(e.target.checked)} /> Budget print (A4)
              </label>
            )}

            <div className="bms-form-block">
              <span className="bms-block-label">Colour</span>
              <div className="bms-picker-grid">
                {(["black", "white"] as const).map((c) => (
                  <button key={c} type="button" className={"bms-picker-card" + (colour === c ? " sel" : "")} onClick={() => setColour(c)}>
                    <img src={darkStudioAsset(garment, c, "model")} alt={c === "black" ? "Black" : "White"} loading="lazy" />
                    <span className="bms-picker-label">{c === "black" ? "Black" : "White"}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="bms-form-block">
              <span className="bms-block-label">Portrait type</span>
              <div className="bms-segmented">
                <button type="button" className={"bms-seg-btn" + (subject === "personal" ? " sel" : "")} onClick={() => setSubject("personal")}>Personal portrait</button>
                <button type="button" className={"bms-seg-btn" + (subject === "artist" ? " sel" : "")} onClick={() => setSubject("artist")}>Artist</button>
              </div>
            </div>

            <div className="bms-form-block">
              <span className="bms-block-label">Style — see how it will actually look</span>
              <div className="bms-style-grid">
                {STUDIO_STYLE_META.map((s) => (
                  <button key={s.id} type="button" className={"bms-style-card" + (style === s.id ? " sel" : "")} onClick={() => setStyle(s.id)}>
                    {s.badge && <span className="bms-style-badge">{s.badge}</span>}
                    <img src={stylePreviewUrl(garment, colour, s.id)} alt={s.name} loading="lazy" />
                    <span className="bms-style-name">{s.name}</span>
                    <span className="bms-style-desc">{s.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="bm-field full">
              <label>{isLoveMy ? "Who do you love?" : "Name on the design"}</label>
              <input className="bm-input" value={name} onChange={(e) => setName(e.target.value)} placeholder={isLoveMy ? "e.g. Girlfriend, My Dog" : "e.g. Londeka Mpanza"} maxLength={80} />
            </div>
            {!isLoveMy && (
              <div className="bm-field full">
                <label>Tagline (optional)</label>
                <input className="bm-input" value={tagline} onChange={(e) => setTagline(e.target.value)} maxLength={100} placeholder="e.g. EST. 2026" />
              </div>
            )}
            <div className="bm-field full">
              <label>Size</label>
              <select className="bm-select" value={size} onChange={(e) => setSize(e.target.value)}>
                {STUDIO_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="bm-field full">
              <label>{exactPhotoCount ? `Photos (exactly ${exactPhotoCount})` : "Photos (1–5)"}</label>
              <input className="bm-input" type="file" accept="image/*" multiple onChange={handlePhotos} />
            </div>
            {photos.length > 0 && (
              <div className="bms-photo-row">{photos.map((f, i) => <img key={i} src={URL.createObjectURL(f)} alt="" />)}</div>
            )}
            {genError && <p className="bm-error">{genError}</p>}
            <button type="button" className="bm-primary-btn" disabled={generating} onClick={generate}>
              {generating ? "Generating…" : "Generate"}
            </button>
          </div>
        )}
      </article>

      <article className="bm-card">
        <div className="bm-section-head"><h2 className="bm-section-title">Your generations</h2></div>
        {loadingDesigns ? (
          <p className="bm-empty">Loading…</p>
        ) : designs.length === 0 ? (
          <p className="bm-empty">Nothing generated yet — create your first design above.</p>
        ) : (
          <div className="bm-design-grid">
            {designs.map((d) => (
              <div key={d.id} className="bm-design-card">
                {d.mockupUrl ? <img src={d.mockupUrl} alt={d.name} style={{ aspectRatio: d.garment === "hoodie" ? "2/3" : "1" }} /> : <div className="bm-design-placeholder" />}
                <div className="bm-design-body">
                  <span className="bm-design-name">{d.name}</span>
                  <span className="bm-design-meta">{d.garment} · {d.colour} · {d.size}</span>
                  <div className="bm-design-actions">
                    <button type="button" onClick={() => download(d.id, "original")}>Download design</button>
                    <button type="button" onClick={() => download(d.id, "mockup")}>Download mockup</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </article>

      <style jsx>{`
        .bms-form{display:grid;gap:16px;max-width:560px}
        .bms-form-block{display:grid;gap:0}
        .bms-block-label{display:block;font-size:9px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#8f8f89;margin-bottom:8px}
        .bms-checkbox{display:flex;align-items:center;gap:8px;font-size:12px;color:#c0c0ba;font-weight:600}
        .bms-checkbox input{width:auto}
        .bms-picker-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        .bms-picker-card{padding:0;border:1px solid #27272a;border-radius:14px;overflow:hidden;background:#111113;cursor:pointer;text-align:left;display:block}
        .bms-picker-card img{width:100%;aspect-ratio:1/1;object-fit:cover;display:block;background:#17171a}
        .bms-picker-card.sel{border-color:#007517;box-shadow:0 0 0 1px #007517,0 0 14px 2px rgba(0,117,23,.4)}
        .bms-picker-label{display:block;padding:9px 12px;font-size:12.5px;font-weight:700;color:#f7f7f4}
        .bms-segmented{display:flex;border:1px solid #27272a;border-radius:10px;overflow:hidden}
        .bms-seg-btn{flex:1;padding:11px 8px;background:#111113;color:#c0c0ba;font-size:12px;font-weight:700;border:0;border-right:1px solid #27272a}
        .bms-seg-btn:last-child{border-right:0}
        .bms-seg-btn.sel{background:#007517;color:#fff}
        .bms-style-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
        .bms-style-card{position:relative;padding:0;border:1px solid #27272a;border-radius:14px;overflow:hidden;background:#111113;cursor:pointer;text-align:left;display:block}
        .bms-style-card img{width:100%;aspect-ratio:3/4;object-fit:cover;display:block;background:#17171a}
        .bms-style-card.sel{border-color:#007517;box-shadow:0 0 0 1px #007517,0 0 14px 2px rgba(0,117,23,.4)}
        .bms-style-name{display:block;padding:9px 10px 2px;font-size:11.5px;font-weight:800;letter-spacing:.01em;color:#f7f7f4}
        .bms-style-desc{display:block;padding:0 10px 10px;font-size:10px;color:#8f8f89}
        .bms-style-badge{position:absolute;top:8px;left:8px;background:#007517;color:#fff;font-size:9px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;padding:3px 8px;border-radius:100px;z-index:1}
        .bms-photo-row{display:flex;gap:8px;flex-wrap:wrap}
        .bms-photo-row img{width:52px;height:52px;object-fit:cover;border-radius:8px;border:1px solid #27272a}
      `}</style>
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
  ad: {
    label: "Launch Ad",
    src: "/private-templates/unik-labs/launch-ad.html",
    title: "UNIK Labs Launch Ad",
    desc: "A ready-made ~25s brand video with voiceover and music -- the styles, the photo-to-mockup transformation, cart to dispatch. Play it, or screen-record/export it to repost as a story or reel.",
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
  discount_code: string | null;
  commission_percent: number | null;
  available_balance_cents: number;
  pending_balance_cents: number;
  total_earned_cents: number;
  created_at: string;
};

// Only one template exists today (the approval/welcome email, reusable as a
// manual "resend" for anyone approved before it existed) -- kept as a list
// rather than a single hardcoded option so a future template (e.g. a payout
// reminder) is just another entry here and in the PATCH route's action enum.
const PARTNER_EMAIL_TYPES: { value: "resend"; label: string; eligibleStatus: PartnerRow["status"] }[] = [
  { value: "resend", label: "Welcome & discount code email", eligibleStatus: "active" },
];

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

  async function review(partnerId: string, action: "approve" | "reject" | "resend") {
    setBusyId(partnerId);
    const res = await authedFetch("/api/unik/brand-manager/partners", { method: "PATCH", body: JSON.stringify({ partnerId, action }) });
    const payload = await res.json().catch(() => ({}));
    setBusyId(null);
    if (!res.ok) { toast(payload.error || "Could not update this application"); return; }
    toast(action === "approve" ? "Partner approved" : action === "reject" ? "Application rejected" : "Email sent");
    load();
    return res.ok;
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

      <SendPartnerEmailCard partners={partners} busyId={busyId} onSend={review} />

      <article className="bm-card bm-orders-card" style={{ marginTop: 16 }}>
        <div className="bm-section-head"><h2 className="bm-section-title">Active partners</h2><p className="bm-section-desc">Default commission rate: {defaultRate}% (per-partner override coming later)</p></div>
        {active.length === 0 ? <p className="bm-empty">No active partners yet.</p> : (
          <div className="bm-table">
            <div className="bm-row bm-row-header bm-row-partners"><div>Name</div><div>Code</div><div>Earned</div><div>Actions</div></div>
            {active.map((p) => (
              <div className="bm-row bm-row-partners" key={p.id}>
                <div>{p.full_name}</div>
                <div>{p.referral_code || "—"}</div>
                <div>R{Math.round(p.total_earned_cents / 100).toLocaleString("en-ZA")}</div>
                <div>—</div>
              </div>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}

// The dedicated "manually send an email" flow the brand manager asked for:
// pick the email, pick the partner, and the partner's name/email/discount
// code are pulled straight from their record (never re-typed), so the same
// approve-path email logic (unik-partner-email.ts) always renders correctly
// no matter who it's being resent to or why.
function SendPartnerEmailCard({ partners, busyId, onSend }: { partners: PartnerRow[]; busyId: string | null; onSend: (partnerId: string, action: "resend") => Promise<boolean | undefined> }) {
  const [emailType, setEmailType] = useState<(typeof PARTNER_EMAIL_TYPES)[number]["value"]>(PARTNER_EMAIL_TYPES[0].value);
  const [partnerId, setPartnerId] = useState("");

  const activeType = PARTNER_EMAIL_TYPES.find((t) => t.value === emailType)!;
  const eligible = partners.filter((p) => p.status === activeType.eligibleStatus);
  const selected = eligible.find((p) => p.id === partnerId) || null;

  // Switching email type can make the currently-picked partner ineligible
  // (e.g. not active) -- rather than silently keep a stale/invalid
  // selection, drop it so the send button re-disables until re-picked.
  useEffect(() => { if (partnerId && !eligible.some((p) => p.id === partnerId)) setPartnerId(""); }, [emailType]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSend() {
    if (!selected) return;
    const ok = await onSend(selected.id, emailType);
    if (ok) setPartnerId("");
  }

  return (
    <article className="bm-card bm-orders-card" style={{ marginTop: 16 }}>
      <div className="bm-section-head"><h2 className="bm-section-title">Send a partner email</h2><p className="bm-section-desc">Pick the email and the partner — their name, email and discount code are filled in for you.</p></div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", marginBottom: selected ? 14 : 0 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11, fontWeight: 700, color: "#999994", flex: "1 1 220px" }}>
          Email
          <select className="bm-select" value={emailType} onChange={(e) => setEmailType(e.target.value as typeof emailType)}>
            {PARTNER_EMAIL_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11, fontWeight: 700, color: "#999994", flex: "1 1 240px" }}>
          Partner
          <select className="bm-select" value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
            <option value="">{eligible.length ? "Select a partner…" : "No eligible partners"}</option>
            {eligible.map((p) => <option key={p.id} value={p.id}>{p.full_name} — {p.email}</option>)}
          </select>
        </label>
        <button
          type="button"
          disabled={!selected || busyId === selected?.id}
          onClick={handleSend}
          style={{ padding: "0 22px", height: 44, borderRadius: 12, border: "none", background: selected ? "#007517" : "#27272a", color: selected ? "#fff" : "#666", fontSize: 13, fontWeight: 700, cursor: selected ? "pointer" : "not-allowed" }}
        >
          {selected && busyId === selected.id ? "Sending…" : "Send email"}
        </button>
      </div>
      {selected && (
        <div style={{ padding: "12px 14px", borderRadius: 12, background: "rgba(255,255,255,.04)", fontSize: 12.5, color: "#c0c0ba", display: "grid", gap: 4 }}>
          <div><strong style={{ color: "#fff" }}>{selected.full_name}</strong> · {selected.email}</div>
          <div>Discount code: <strong style={{ color: "#fff" }}>{selected.discount_code || "—"}</strong></div>
        </div>
      )}
    </article>
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
