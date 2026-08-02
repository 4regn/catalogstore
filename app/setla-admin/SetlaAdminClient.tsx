"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { OverviewPanel, ApplicationsPanel, BankAccountsPanel, CustomersPanel, AdminsPanel } from "./SetlaReviewPanels";

type Panel = "overview" | "applications" | "bank-accounts" | "customers" | "admins";

const PANEL_TITLES: Record<Panel, string> = {
  overview: "Overview",
  applications: "Applications",
  "bank-accounts": "Bank accounts",
  customers: "Customers",
  admins: "Admins",
};

type AdminProfile = { fullName: string; email: string; role: "reviewer" | "super_admin" };

export default function SetlaAdminClient() {
  const [sessionReady, setSessionReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [adminProfile, setAdminProfile] = useState<AdminProfile | null>(null);
  const [panel, setPanel] = useState<Panel>("overview");
  const [toastText, setToastText] = useState("");

  const showToast = useCallback((text: string) => {
    setToastText(text);
    window.setTimeout(() => setToastText(""), 2600);
  }, []);

  const authedFetch = useCallback(async (path: string, init: RequestInit = {}) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return fetch(path, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } });
  }, []);

  const load = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) { setSessionReady(true); setSignedIn(false); return; }
    setSignedIn(true);
    try {
      const res = await fetch("/api/setla/admin/overview", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      if (res.ok) {
        const payload = await res.json();
        setAdminProfile(payload.admin);
      } else {
        setSignedIn(false);
      }
    } catch {
      setSignedIn(false);
    }
    setSessionReady(true);
  }, []);

  useEffect(() => {
    load();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") { setSignedIn(false); setAdminProfile(null); }
    });
    return () => data.subscription.unsubscribe();
  }, [load]);

  useEffect(() => {
    if (sessionReady && !signedIn) window.location.href = "/setla-admin/login";
  }, [sessionReady, signedIn]);

  async function signOut() {
    await fetch("/api/setla/admin/session", { method: "DELETE" });
    await supabase.auth.signOut();
    window.location.href = "/setla-admin/login";
  }

  if (!sessionReady) return <div className="sad-loading">Loading…</div>;
  if (!signedIn) return null;

  return (
    <div className="sad-shell">
      <aside className="sad-side">
        <div className="sad-brand">
          <span className="sad-brand-mark">S</span>
          <div><strong>SETLA</strong><small>Admin</small></div>
        </div>
        <nav>
          {(Object.keys(PANEL_TITLES) as Panel[]).map((key) => (
            <button key={key} type="button" className={"sad-nav-link" + (panel === key ? " active" : "")} onClick={() => setPanel(key)}>{PANEL_TITLES[key]}</button>
          ))}
        </nav>
        <div className="sad-side-foot">
          <div className="sad-admin-chip"><strong>{adminProfile?.fullName}</strong><small>{adminProfile?.role === "super_admin" ? "Super admin" : "Reviewer"}</small></div>
          <button type="button" className="sad-logout" onClick={signOut}>Log out</button>
        </div>
      </aside>
      <main className="sad-main">
        <h1 className="sad-title">{PANEL_TITLES[panel]}</h1>
        {panel === "overview" && <OverviewPanel authedFetch={authedFetch} />}
        {panel === "applications" && <ApplicationsPanel authedFetch={authedFetch} toast={showToast} />}
        {panel === "bank-accounts" && <BankAccountsPanel authedFetch={authedFetch} toast={showToast} />}
        {panel === "customers" && <CustomersPanel authedFetch={authedFetch} />}
        {panel === "admins" && adminProfile && <AdminsPanel authedFetch={authedFetch} toast={showToast} role={adminProfile.role} />}
      </main>
      {toastText && <div className="sad-toast">{toastText}</div>}

      <style jsx global>{`
        html,body{margin:0;background:#050505;color:#f5f7f4;font-family:'DM Sans',Arial,sans-serif}
        .sad-loading{min-height:100dvh;display:grid;place-items:center;color:#9ba29b;font-size:13px}
        .sad-shell{display:grid;grid-template-columns:220px 1fr;min-height:100dvh}
        .sad-side{background:#0a0c0a;border-right:1px solid #1c1f1c;padding:22px 16px;display:flex;flex-direction:column;gap:22px}
        .sad-brand{display:flex;align-items:center;gap:10px}
        .sad-brand-mark{width:32px;height:32px;border-radius:10px;background:#007517;color:#fff;display:grid;place-items:center;font-weight:900}
        .sad-brand strong{display:block;font-size:14px}
        .sad-brand small{color:#9ba29b;font-size:10px;text-transform:uppercase;letter-spacing:.08em}
        .sad-side nav{display:grid;gap:4px}
        .sad-nav-link{text-align:left;padding:11px 12px;border-radius:11px;border:0;background:transparent;color:#9ba29b;font-size:12.5px;font-weight:600;cursor:pointer}
        .sad-nav-link.active{background:#123418;color:#fff}
        .sad-nav-link:hover:not(.active){background:#111511;color:#fff}
        .sad-side-foot{margin-top:auto;display:grid;gap:10px}
        .sad-admin-chip{padding:10px 12px;border-radius:12px;background:#0d100d;border:1px solid #1c1f1c}
        .sad-admin-chip strong{display:block;font-size:12px}
        .sad-admin-chip small{color:#9ba29b;font-size:10px;text-transform:uppercase;letter-spacing:.06em}
        .sad-logout{padding:10px 12px;border-radius:11px;border:1px solid #2a2f2a;background:transparent;color:#9ba29b;font-size:11.5px;font-weight:700;cursor:pointer}
        .sad-logout:hover{color:#fff;border-color:#3a3f3a}
        .sad-main{padding:32px 36px 80px;overflow-x:hidden}
        .sad-title{font-size:24px;letter-spacing:-.02em;margin:0 0 22px}
        .sad-card{padding:20px;border:1px solid #1c1f1c;border-radius:20px;background:linear-gradient(145deg,#0d100d,#0a0c0a);margin-bottom:16px}
        .sad-empty{color:#9ba29b;font-size:12.5px}
        .sad-grid-4{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));margin-bottom:22px}
        .sad-stat strong{display:block;font-size:30px;letter-spacing:-.03em}
        .sad-stat small{color:#9ba29b;font-size:10.5px;text-transform:uppercase;letter-spacing:.08em}
        .sad-table{display:grid;gap:8px}
        .sad-row{display:grid;gap:10px;padding:13px 14px;border-radius:13px;background:rgba(255,255,255,.02);font-size:12.5px;align-items:center;cursor:pointer}
        .sad-row:hover{background:rgba(255,255,255,.05)}
        .sad-row-header{cursor:default;color:#9ba29b;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;background:transparent}
        .sad-row-header:hover{background:transparent}
        .sad-badge{display:inline-block;padding:4px 9px;border-radius:999px;font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:.04em}
        .sad-badge.pending{background:rgba(234,179,8,.14);color:#facc15}
        .sad-badge.approved,.sad-badge.verified{background:rgba(0,117,23,.16);color:#4ade80}
        .sad-badge.declined,.sad-badge.rejected{background:rgba(239,68,68,.14);color:#ff8b84}
        .sad-badge.manual_review{background:rgba(96,165,250,.14);color:#60a5fa}
        .sad-tabs{display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap}
        .sad-tab{padding:8px 14px;border-radius:999px;border:1px solid #1c1f1c;background:transparent;color:#9ba29b;font-size:11px;font-weight:700;cursor:pointer}
        .sad-tab.active{background:#123418;border-color:#123418;color:#fff}
        .sad-btn{padding:9px 16px;border-radius:11px;border:1px solid #007517;background:#007517;color:#fff;font-size:11.5px;font-weight:800;cursor:pointer}
        .sad-btn:disabled{opacity:.5;cursor:wait}
        .sad-btn-outline{padding:9px 16px;border-radius:11px;border:1px solid #2a2f2a;background:transparent;color:#fff;font-size:11.5px;font-weight:800;cursor:pointer}
        .sad-btn-danger{padding:9px 16px;border-radius:11px;border:1px solid rgba(239,68,68,.4);background:transparent;color:#ff8b84;font-size:11.5px;font-weight:800;cursor:pointer}
        .sad-detail-back{background:none;border:0;color:#9ba29b;font-size:11.5px;cursor:pointer;margin-bottom:16px;padding:0}
        .sad-detail-back:hover{color:#fff}
        .sad-detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
        .sad-field{font-size:12px}
        .sad-field small{display:block;color:#9ba29b;font-size:9.5px;text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px}
        .sad-docs{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:14px;margin-top:14px}
        .sad-doc-card{border:1px solid #1c1f1c;border-radius:14px;overflow:hidden;background:#0a0c0a}
        .sad-doc-card img{width:100%;aspect-ratio:3/4;object-fit:cover;display:block;background:#111}
        .sad-doc-card .sad-doc-meta{padding:10px 12px}
        .sad-doc-card .sad-doc-meta strong{display:block;font-size:11px;text-transform:capitalize}
        .sad-input,.sad-select,.sad-textarea{width:100%;min-height:42px;padding:0 12px;color:#fff;border:1px solid #1c1f1c;border-radius:11px;outline:none;background:#0a0c0a;font-size:13px}
        .sad-textarea{min-height:80px;padding:10px 12px}
        .sad-form-row{display:grid;gap:8px;margin-bottom:12px}
        .sad-form-row label{font-size:10px;color:#9ba29b;text-transform:uppercase;letter-spacing:.06em}
        .sad-toast{position:fixed;right:20px;bottom:20px;padding:13px 18px;border-radius:13px;background:#111511;border:1px solid #1c1f1c;color:#fff;font-size:12px;z-index:50}
        @media (max-width:850px){.sad-shell{grid-template-columns:1fr}.sad-side{flex-direction:row;align-items:center;padding:14px}.sad-side nav{display:flex;overflow-x:auto}.sad-side-foot{display:none}.sad-main{padding:20px}.sad-detail-grid{grid-template-columns:1fr}}
      `}</style>
    </div>
  );
}
