"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type Panel = "overview" | "applications" | "bank-accounts" | "customers" | "admins";

const PANEL_TITLES: Record<Panel, string> = {
  overview: "Overview",
  applications: "Applications",
  "bank-accounts": "Bank accounts",
  customers: "Customers",
  admins: "Admins",
};

type AdminProfile = { fullName: string; email: string; role: "reviewer" | "super_admin" };

const money = (value: number) => `R${Number(value || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateShort = (value: string | null) => (value ? new Date(value).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" }) : "—");

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

// ---------------------------------------------------------------------------

function OverviewPanel({ authedFetch }: { authedFetch: (path: string, init?: RequestInit) => Promise<Response> }) {
  const [data, setData] = useState<{ pendingApplications: number; pendingBankReviews: number; pendingAppeals: number; overdueInstalments: number; openSupportConversations: number } | null>(null);

  useEffect(() => {
    authedFetch("/api/setla/admin/overview").then((res) => res.json()).then(setData).catch(() => {});
  }, [authedFetch]);

  if (!data) return <p className="sad-empty">Loading…</p>;

  return (
    <div className="sad-grid-4">
      <div className="sad-card sad-stat"><strong>{data.pendingApplications}</strong><small>Pending applications</small></div>
      <div className="sad-card sad-stat"><strong>{data.pendingBankReviews}</strong><small>Bank reviews</small></div>
      <div className="sad-card sad-stat"><strong>{data.pendingAppeals}</strong><small>Open appeals</small></div>
      <div className="sad-card sad-stat"><strong>{data.overdueInstalments}</strong><small>Overdue instalments</small></div>
    </div>
  );
}

// ---------------------------------------------------------------------------

type ApplicationRow = {
  id: string; monthly_income: number; monthly_expenses: number; status: string; submitted_at: string;
  setla_customers: { id: string; first_name: string; last_name: string; email: string; phone: string; id_number: string | null } | null;
};

function ApplicationsPanel({ authedFetch, toast }: { authedFetch: (path: string, init?: RequestInit) => Promise<Response>; toast: (text: string) => void }) {
  const [status, setStatus] = useState("pending");
  const [rows, setRows] = useState<ApplicationRow[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(null);
    const res = await authedFetch(`/api/setla/admin/applications?status=${encodeURIComponent(status)}`);
    const payload = await res.json().catch(() => ({}));
    setRows(res.ok ? payload.applications || [] : []);
  }, [authedFetch, status]);

  useEffect(() => { load(); }, [load]);

  if (selectedId) return <ApplicationDetail id={selectedId} authedFetch={authedFetch} toast={toast} onBack={() => { setSelectedId(null); load(); }} />;

  return (
    <section>
      <div className="sad-tabs">
        {["pending", "manual_review", "approved", "declined"].map((s) => (
          <button key={s} type="button" className={"sad-tab" + (status === s ? " active" : "")} onClick={() => setStatus(s)}>{s.replace("_", " ")}</button>
        ))}
      </div>
      {!rows ? (
        <p className="sad-empty">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="sad-empty">Nothing here right now.</p>
      ) : (
        <div className="sad-table">
          <div className="sad-row sad-row-header" style={{ gridTemplateColumns: "1.4fr 1.4fr 1fr 1fr" }}><span>Name</span><span>Email</span><span>Income</span><span>Submitted</span></div>
          {rows.map((row) => (
            <div key={row.id} className="sad-row" style={{ gridTemplateColumns: "1.4fr 1.4fr 1fr 1fr" }} onClick={() => setSelectedId(row.id)}>
              <span>{row.setla_customers ? `${row.setla_customers.first_name} ${row.setla_customers.last_name}` : "—"}</span>
              <span>{row.setla_customers?.email || "—"}</span>
              <span>{money(row.monthly_income)}</span>
              <span>{dateShort(row.submitted_at)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

type ApplicationDetailData = {
  application: { id: string; customer_id: string; monthly_income: number; monthly_expenses: number; status: string; decision_reason: string | null; proposed_limit: number | null; submitted_at: string };
  customer: { id: string; first_name: string; last_name: string; email: string; phone: string; id_number: string | null; address: Record<string, string> | null; application_status: string } | null;
  documents: Array<{ id: string; document_type: string; review_status: string }>;
  bankAccounts: Array<{ id: string; bank_name: string; account_holder_name: string; account_type: string; account_last4: string; review_status: string }>;
};

function DocumentThumb({ documentId, label, authedFetch }: { documentId: string; label: string; authedFetch: (path: string, init?: RequestInit) => Promise<Response> }) {
  const [url, setUrl] = useState<string | null>(null);
  const [isPdf, setIsPdf] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    (async () => {
      const res = await authedFetch(`/api/setla/admin/documents/${documentId}`);
      if (!res.ok || cancelled) return;
      const blob = await res.blob();
      objectUrl = URL.createObjectURL(blob);
      setIsPdf(blob.type === "application/pdf");
      if (!cancelled) setUrl(objectUrl);
    })();
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [documentId, authedFetch]);

  return (
    <div className="sad-doc-card">
      {!url ? <div style={{ aspectRatio: "3/4", display: "grid", placeItems: "center", color: "#9ba29b", fontSize: 11 }}>Loading…</div>
        : isPdf ? <a href={url} target="_blank" rel="noreferrer" style={{ display: "grid", aspectRatio: "3/4", placeItems: "center", color: "#4ade80", fontSize: 11, textDecoration: "none" }}>Open PDF</a>
        : <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={label} /></a>}
      <div className="sad-doc-meta"><strong>{label.replace(/_/g, " ")}</strong></div>
    </div>
  );
}

function ApplicationDetail({ id, authedFetch, toast, onBack }: { id: string; authedFetch: (path: string, init?: RequestInit) => Promise<Response>; toast: (text: string) => void; onBack: () => void }) {
  const [data, setData] = useState<ApplicationDetailData | null>(null);
  const [busy, setBusy] = useState(false);
  const [proposedLimit, setProposedLimit] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    authedFetch(`/api/setla/admin/applications/${id}`).then((res) => res.json()).then(setData).catch(() => {});
  }, [id, authedFetch]);

  async function decide(decision: "approved" | "declined" | "manual_review") {
    if (decision === "approved" && (!proposedLimit || Number(proposedLimit) <= 0)) { toast("Enter a spending limit to approve"); return; }
    setBusy(true);
    const res = await authedFetch(`/api/setla/admin/applications/${id}/decision`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, proposedLimit: proposedLimit ? Number(proposedLimit) : undefined, reason }),
    });
    const payload = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { toast(payload.error || "Could not save this decision"); return; }
    toast(decision === "approved" ? "Application approved" : decision === "declined" ? "Application declined" : "Flagged for manual review");
    onBack();
  }

  if (!data) return <p className="sad-empty">Loading…</p>;
  const { application, customer, documents, bankAccounts } = data;
  const idDoc = documents.find((d) => d.document_type === "id_document");
  const selfie = documents.find((d) => d.document_type === "live_selfie");
  const otherDocs = documents.filter((d) => d.document_type !== "id_document" && d.document_type !== "live_selfie");
  const bank = bankAccounts[0];

  return (
    <section>
      <button type="button" className="sad-detail-back" onClick={onBack}>← Back to applications</button>
      <div className="sad-card">
        <div className="sad-detail-grid">
          <div className="sad-field"><small>Name</small>{customer ? `${customer.first_name} ${customer.last_name}` : "—"}</div>
          <div className="sad-field"><small>Status</small><span className={`sad-badge ${application.status}`}>{application.status.replace("_", " ")}</span></div>
          <div className="sad-field"><small>Email</small>{customer?.email || "—"}</div>
          <div className="sad-field"><small>Phone</small>{customer?.phone || "—"}</div>
          <div className="sad-field"><small>ID number</small>{customer?.id_number || "—"}</div>
          <div className="sad-field"><small>Address</small>{customer?.address ? [customer.address.address, customer.address.city, customer.address.province, customer.address.postal].filter(Boolean).join(", ") : "—"}</div>
          <div className="sad-field"><small>Monthly income</small>{money(application.monthly_income)}</div>
          <div className="sad-field"><small>Monthly expenses</small>{money(application.monthly_expenses)}</div>
          <div className="sad-field"><small>Bank</small>{bank ? `${bank.bank_name} · ${bank.account_holder_name} · •••• ${bank.account_last4}` : "—"}</div>
          <div className="sad-field"><small>Submitted</small>{dateShort(application.submitted_at)}</div>
        </div>
      </div>

      <div className="sad-card">
        <strong style={{ fontSize: 13, display: "block", marginBottom: 4 }}>Identity check</strong>
        <p className="sad-empty" style={{ marginBottom: 0 }}>Compare the ID document photo against the live selfie -- automated face-matching isn't wired up yet, this is a manual visual check.</p>
        <div className="sad-docs">
          {idDoc && <DocumentThumb documentId={idDoc.id} label="ID document" authedFetch={authedFetch} />}
          {selfie && <DocumentThumb documentId={selfie.id} label="Live selfie" authedFetch={authedFetch} />}
        </div>
      </div>

      <div className="sad-card">
        <strong style={{ fontSize: 13, display: "block", marginBottom: 4 }}>Other documents</strong>
        <div className="sad-docs">
          {otherDocs.map((doc) => <DocumentThumb key={doc.id} documentId={doc.id} label={doc.document_type} authedFetch={authedFetch} />)}
        </div>
      </div>

      {application.status !== "approved" && application.status !== "declined" && (
        <div className="sad-card">
          <strong style={{ fontSize: 13, display: "block", marginBottom: 12 }}>Decision</strong>
          <div className="sad-form-row"><label>Approved spending limit (R)</label><input className="sad-input" type="number" min="0" value={proposedLimit} onChange={(e) => setProposedLimit(e.target.value)} placeholder="e.g. 2500" /></div>
          <div className="sad-form-row"><label>Reason / note (shown to customer if declined)</label><textarea className="sad-textarea" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" className="sad-btn" disabled={busy} onClick={() => decide("approved")}>Approve</button>
            <button type="button" className="sad-btn-danger" disabled={busy} onClick={() => decide("declined")}>Decline</button>
            <button type="button" className="sad-btn-outline" disabled={busy} onClick={() => decide("manual_review")}>Flag for review</button>
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

type BankAccountRow = {
  id: string; bank_name: string; account_holder_name: string; account_type: string; account_last4: string; created_at: string;
  setla_customers: { first_name: string; last_name: string; email: string } | null;
};

function BankAccountsPanel({ authedFetch, toast }: { authedFetch: (path: string, init?: RequestInit) => Promise<Response>; toast: (text: string) => void }) {
  const [rows, setRows] = useState<BankAccountRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await authedFetch("/api/setla/admin/bank-accounts?status=pending");
    const payload = await res.json().catch(() => ({}));
    setRows(res.ok ? payload.bankAccounts || [] : []);
  }, [authedFetch]);

  useEffect(() => { load(); }, [load]);

  async function review(id: string, reviewStatus: "approved" | "rejected") {
    setBusyId(id);
    const res = await authedFetch(`/api/setla/admin/bank-accounts/${id}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reviewStatus }) });
    const payload = await res.json().catch(() => ({}));
    setBusyId(null);
    if (!res.ok) { toast(payload.error || "Could not save this review"); return; }
    toast(reviewStatus === "approved" ? "Bank account approved" : "Bank account rejected");
    load();
  }

  if (!rows) return <p className="sad-empty">Loading…</p>;
  if (rows.length === 0) return <p className="sad-empty">No bank accounts waiting for review.</p>;

  return (
    <div className="sad-table">
      <div className="sad-row sad-row-header" style={{ gridTemplateColumns: "1.2fr 1fr 1fr 1fr .8fr" }}><span>Customer</span><span>Bank</span><span>Holder</span><span>Account</span><span></span></div>
      {rows.map((row) => (
        <div key={row.id} className="sad-row" style={{ gridTemplateColumns: "1.2fr 1fr 1fr 1fr .8fr", cursor: "default" }}>
          <span>{row.setla_customers ? `${row.setla_customers.first_name} ${row.setla_customers.last_name}` : "—"}</span>
          <span>{row.bank_name}</span>
          <span>{row.account_holder_name}</span>
          <span>{row.account_type} •••• {row.account_last4}</span>
          <span style={{ display: "flex", gap: 6 }}>
            <button type="button" className="sad-btn" disabled={busyId === row.id} onClick={() => review(row.id, "approved")} style={{ padding: "6px 10px", fontSize: 10 }}>Approve</button>
            <button type="button" className="sad-btn-danger" disabled={busyId === row.id} onClick={() => review(row.id, "rejected")} style={{ padding: "6px 10px", fontSize: 10 }}>Reject</button>
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

type CustomerRow = { id: string; first_name: string; last_name: string; email: string; application_status: string; approved_limit: number; created_at: string };

function CustomersPanel({ authedFetch }: { authedFetch: (path: string, init?: RequestInit) => Promise<Response> }) {
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<CustomerRow[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await authedFetch(`/api/setla/admin/customers${search ? `?search=${encodeURIComponent(search)}` : ""}`);
    const payload = await res.json().catch(() => ({}));
    setRows(res.ok ? payload.customers || [] : []);
  }, [authedFetch, search]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  if (selectedId) return <CustomerDetail id={selectedId} authedFetch={authedFetch} onBack={() => setSelectedId(null)} />;

  return (
    <section>
      <input className="sad-input" placeholder="Search by name, email or ID number…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 16, maxWidth: 360 }} />
      {!rows ? <p className="sad-empty">Loading…</p> : rows.length === 0 ? <p className="sad-empty">No customers found.</p> : (
        <div className="sad-table">
          <div className="sad-row sad-row-header" style={{ gridTemplateColumns: "1.4fr 1.4fr 1fr 1fr" }}><span>Name</span><span>Email</span><span>Status</span><span>Limit</span></div>
          {rows.map((row) => (
            <div key={row.id} className="sad-row" style={{ gridTemplateColumns: "1.4fr 1.4fr 1fr 1fr" }} onClick={() => setSelectedId(row.id)}>
              <span>{row.first_name} {row.last_name}</span>
              <span>{row.email}</span>
              <span><span className={`sad-badge ${row.application_status}`}>{row.application_status.replace("_", " ")}</span></span>
              <span>{money(row.approved_limit)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function CustomerDetail({ id, authedFetch, onBack }: { id: string; authedFetch: (path: string, init?: RequestInit) => Promise<Response>; onBack: () => void }) {
  const [data, setData] = useState<any>(null);
  useEffect(() => { authedFetch(`/api/setla/admin/customers/${id}`).then((res) => res.json()).then(setData).catch(() => {}); }, [id, authedFetch]);
  if (!data) return <p className="sad-empty">Loading…</p>;
  const { customer, applications, bankAccounts } = data;
  return (
    <section>
      <button type="button" className="sad-detail-back" onClick={onBack}>← Back to customers</button>
      <div className="sad-card">
        <div className="sad-detail-grid">
          <div className="sad-field"><small>Name</small>{customer.first_name} {customer.last_name}</div>
          <div className="sad-field"><small>Status</small><span className={`sad-badge ${customer.application_status}`}>{customer.application_status.replace("_", " ")}</span></div>
          <div className="sad-field"><small>Email</small>{customer.email}</div>
          <div className="sad-field"><small>Phone</small>{customer.phone}</div>
          <div className="sad-field"><small>ID number</small>{customer.id_number || "—"}</div>
          <div className="sad-field"><small>Member since</small>{dateShort(customer.created_at)}</div>
          <div className="sad-field"><small>Approved limit</small>{money(customer.approved_limit)}</div>
          <div className="sad-field"><small>Available limit</small>{money(customer.available_limit)}</div>
        </div>
      </div>
      <div className="sad-card">
        <strong style={{ fontSize: 13, display: "block", marginBottom: 10 }}>Applications</strong>
        {applications.length === 0 ? <p className="sad-empty">No applications yet.</p> : applications.map((a: any) => (
          <div key={a.id} className="sad-row" style={{ gridTemplateColumns: "1fr 1fr 1fr", cursor: "default" }}>
            <span><span className={`sad-badge ${a.status}`}>{a.status.replace("_", " ")}</span></span>
            <span>{dateShort(a.submitted_at)}</span>
            <span>{a.proposed_limit ? money(a.proposed_limit) : "—"}</span>
          </div>
        ))}
      </div>
      <div className="sad-card">
        <strong style={{ fontSize: 13, display: "block", marginBottom: 10 }}>Bank accounts</strong>
        {bankAccounts.length === 0 ? <p className="sad-empty">None on file.</p> : bankAccounts.map((b: any) => (
          <div key={b.id} className="sad-row" style={{ gridTemplateColumns: "1fr 1fr 1fr", cursor: "default" }}>
            <span>{b.bank_name}</span>
            <span>•••• {b.account_last4}</span>
            <span><span className={`sad-badge ${b.review_status}`}>{b.review_status}</span></span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

type AdminRow = { id: string; full_name: string; email: string; role: string; active: boolean };

function AdminsPanel({ authedFetch, toast, role }: { authedFetch: (path: string, init?: RequestInit) => Promise<Response>; toast: (text: string) => void; role: "reviewer" | "super_admin" }) {
  const [rows, setRows] = useState<AdminRow[] | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await authedFetch("/api/setla/admin/admins");
    const payload = await res.json().catch(() => ({}));
    setRows(res.ok ? payload.admins || [] : []);
  }, [authedFetch]);

  useEffect(() => { load(); }, [load]);

  async function invite(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const res = await authedFetch("/api/setla/admin/admins", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fullName, email }) });
    const payload = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { toast(payload.error || "Could not invite this admin"); return; }
    toast("Invite sent");
    setFullName(""); setEmail("");
    load();
  }

  async function deactivate(id: string) {
    const res = await authedFetch(`/api/setla/admin/admins/${id}`, { method: "DELETE" });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) { toast(payload.error || "Could not remove this admin"); return; }
    toast("Access removed");
    load();
  }

  return (
    <section>
      {role === "super_admin" && (
        <div className="sad-card">
          <strong style={{ fontSize: 13, display: "block", marginBottom: 10 }}>Invite an admin</strong>
          <form onSubmit={invite} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div className="sad-form-row" style={{ flex: "1 1 180px", marginBottom: 0 }}><label>Full name</label><input className="sad-input" value={fullName} onChange={(e) => setFullName(e.target.value)} required /></div>
            <div className="sad-form-row" style={{ flex: "1 1 220px", marginBottom: 0 }}><label>Email</label><input className="sad-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
            <button className="sad-btn" disabled={busy} style={{ height: 42 }}>{busy ? "Sending…" : "Send invite"}</button>
          </form>
        </div>
      )}
      {!rows ? <p className="sad-empty">Loading…</p> : (
        <div className="sad-table">
          <div className="sad-row sad-row-header" style={{ gridTemplateColumns: "1.2fr 1.4fr .8fr .8fr" }}><span>Name</span><span>Email</span><span>Role</span><span></span></div>
          {rows.map((row) => (
            <div key={row.id} className="sad-row" style={{ gridTemplateColumns: "1.2fr 1.4fr .8fr .8fr", cursor: "default", opacity: row.active ? 1 : 0.5 }}>
              <span>{row.full_name}</span>
              <span>{row.email}</span>
              <span>{row.role === "super_admin" ? "Super admin" : "Reviewer"}</span>
              <span>{role === "super_admin" && row.active && <button type="button" className="sad-btn-danger" style={{ padding: "6px 10px", fontSize: 10 }} onClick={() => deactivate(row.id)}>Remove</button>}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
