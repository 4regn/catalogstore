"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

// Shared SETLA review UI, mounted both standalone (app/setla-admin/SetlaAdminClient.tsx)
// and as a tab inside Brand Manager HQ (app/store/[slug]/team/BrandManagerClient.tsx) --
// one implementation of the review workflow, two front doors into the same auth-gated
// /api/setla/admin/* routes (see lib/setla-admin.ts for how both logins are accepted).

export const money = (value: number) => `R${Number(value || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const dateShort = (value: string | null) => (value ? new Date(value).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" }) : "—");

export function OverviewPanel({ authedFetch }: { authedFetch: (path: string, init?: RequestInit) => Promise<Response> }) {
  const [data, setData] = useState<{ pendingApplications: number; pendingBankReviews: number; pendingAppeals: number; overdueInstalments: number; openSupportConversations: number; totalSignups: number; applicationsSubmitted: number } | null>(null);

  useEffect(() => {
    authedFetch("/api/setla/admin/overview").then((res) => res.json()).then(setData).catch(() => {});
  }, [authedFetch]);

  if (!data) return <p className="sad-empty">Loading…</p>;

  const conversionPct = data.totalSignups ? Math.round((data.applicationsSubmitted / data.totalSignups) * 100) : 0;
  const notApplied = Math.max(0, data.totalSignups - data.applicationsSubmitted);

  return (
    <div>
      <div className="sad-card">
        <strong style={{ fontSize: 13, display: "block", marginBottom: 12 }}>Signup → application funnel</strong>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 12 }}>
          <div><strong style={{ display: "block", fontSize: 26 }}>{data.totalSignups}</strong><small style={{ color: "#9ba29b", fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".06em" }}>Signed up</small></div>
          <div><strong style={{ display: "block", fontSize: 26 }}>{data.applicationsSubmitted}</strong><small style={{ color: "#9ba29b", fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".06em" }}>Submitted an application</small></div>
          <div><strong style={{ display: "block", fontSize: 26, color: notApplied ? "#facc15" : undefined }}>{notApplied}</strong><small style={{ color: "#9ba29b", fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".06em" }}>Signed up, never applied</small></div>
        </div>
        <div style={{ height: 6, borderRadius: 999, background: "#1c1f1c", overflow: "hidden" }}><div style={{ height: "100%", width: `${conversionPct}%`, background: "linear-gradient(90deg,#007517,#4ade80)" }} /></div>
        <p className="sad-empty" style={{ marginTop: 8, marginBottom: 0 }}>{conversionPct}% of signups have submitted an application. Everyone who hasn't yet still shows up in Customers, tagged "not applied".</p>
      </div>
      <div className="sad-grid-4">
        <div className="sad-card sad-stat"><strong>{data.pendingApplications}</strong><small>Pending applications</small></div>
        <div className="sad-card sad-stat"><strong>{data.pendingBankReviews}</strong><small>Bank reviews</small></div>
        <div className="sad-card sad-stat"><strong>{data.pendingAppeals}</strong><small>Open appeals</small></div>
        <div className="sad-card sad-stat"><strong>{data.overdueInstalments}</strong><small>Overdue instalments</small></div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

type AnalyticsData = {
  days: number; totalViews: number; uniqueVisitors: number; viewsToday: number;
  topPages: Array<{ path: string; count: number }>;
  topHosts: Array<{ host: string; count: number }>;
  daily: Array<{ date: string; count: number }>;
  truncated: boolean;
};

const PAGE_LABELS: Record<string, string> = {
  "index.html": "Landing page", "": "Landing page", "signup.html": "Sign up", "login.html": "Log in",
  "apply.html": "Apply", "dashboard.html": "Dashboard", "checkout.html": "Checkout",
  "order-confirmed.html": "Order confirmed", "faq.html": "FAQs", "forgot-password.html": "Forgot password",
  "reset-password.html": "Reset password",
};

export function AnalyticsPanel({ authedFetch }: { authedFetch: (path: string, init?: RequestInit) => Promise<Response> }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<AnalyticsData | null>(null);

  useEffect(() => {
    setData(null);
    authedFetch(`/api/setla/admin/analytics?days=${days}`).then((res) => res.json()).then(setData).catch(() => {});
  }, [authedFetch, days]);

  if (!data) return <p className="sad-empty">Loading…</p>;
  const max = Math.max(1, ...data.daily.map((d) => d.count));
  const maxPage = Math.max(1, ...data.topPages.map((p) => p.count));
  const showEveryNth = Math.ceil(data.daily.length / 12);

  return (
    <div>
      <div className="sad-tabs">
        {[7, 30, 90].map((d) => (
          <button key={d} type="button" className={"sad-tab" + (days === d ? " active" : "")} onClick={() => setDays(d)}>Last {d} days</button>
        ))}
      </div>
      <div className="sad-grid-4">
        <div className="sad-card sad-stat"><strong>{data.totalViews}</strong><small>Page views</small></div>
        <div className="sad-card sad-stat"><strong>{data.uniqueVisitors}</strong><small>Unique visitors</small></div>
        <div className="sad-card sad-stat"><strong>{data.viewsToday}</strong><small>Views today</small></div>
      </div>
      <div className="sad-card">
        <strong style={{ fontSize: 13, display: "block", marginBottom: 14 }}>Daily views</strong>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 110 }}>
          {data.daily.map((d) => (
            <div key={d.date} title={`${d.date}: ${d.count} view${d.count === 1 ? "" : "s"}`} style={{ flex: 1, minWidth: 2, height: `${Math.max(2, (d.count / max) * 100)}%`, borderRadius: 3, background: "linear-gradient(180deg,#4ade80,#007517)" }} />
          ))}
        </div>
        <div style={{ display: "flex", gap: 3, marginTop: 6 }}>
          {data.daily.map((d, i) => (
            <div key={d.date} style={{ flex: 1, minWidth: 2, textAlign: "center", fontSize: 8.5, color: "#7f877f" }}>{i % showEveryNth === 0 ? d.date.slice(5) : ""}</div>
          ))}
        </div>
      </div>
      <div className="sad-card">
        <strong style={{ fontSize: 13, display: "block", marginBottom: 14 }}>Top pages</strong>
        {data.topPages.length === 0 ? <p className="sad-empty" style={{ marginBottom: 0 }}>No page views recorded yet.</p> : (
          <div style={{ display: "grid", gap: 10 }}>
            {data.topPages.map((p) => (
              <div key={p.path}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginBottom: 5 }}><span>{PAGE_LABELS[p.path] || p.path}</span><span style={{ color: "#9ba29b" }}>{p.count}</span></div>
                <div style={{ height: 6, borderRadius: 999, background: "#1c1f1c", overflow: "hidden" }}><div style={{ height: "100%", width: `${(p.count / maxPage) * 100}%`, background: "linear-gradient(90deg,#007517,#4ade80)" }} /></div>
              </div>
            ))}
          </div>
        )}
        {data.truncated && <p className="sad-empty" style={{ marginTop: 12, marginBottom: 0 }}>Showing the most recent 20,000 views in this window -- totals above may undercount very high-traffic periods.</p>}
      </div>
      {data.topHosts.length > 1 && (
        <div className="sad-card">
          <strong style={{ fontSize: 13, display: "block", marginBottom: 4 }}>Traffic by domain</strong>
          <p className="sad-empty" style={{ marginBottom: 14 }}>These are the same SETLA pages, reachable from more than one domain -- useful for telling how much traffic the setla.4regn.com landing page is driving on its own.</p>
          <div style={{ display: "grid", gap: 10 }}>
            {data.topHosts.map((h) => (
              <div key={h.host}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginBottom: 5 }}><span>{h.host}</span><span style={{ color: "#9ba29b" }}>{h.count}</span></div>
                <div style={{ height: 6, borderRadius: 999, background: "#1c1f1c", overflow: "hidden" }}><div style={{ height: "100%", width: `${(h.count / data.topHosts[0].count) * 100}%`, background: "linear-gradient(90deg,#007517,#4ade80)" }} /></div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

type ApplicationRow = {
  id: string; monthly_income: number; monthly_expenses: number; status: string; submitted_at: string;
  setla_customers: { id: string; first_name: string; last_name: string; email: string; phone: string; id_number: string | null } | null;
};

export function ApplicationsPanel({ authedFetch, toast }: { authedFetch: (path: string, init?: RequestInit) => Promise<Response>; toast: (text: string) => void }) {
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

export function BankAccountsPanel({ authedFetch, toast }: { authedFetch: (path: string, init?: RequestInit) => Promise<Response>; toast: (text: string) => void }) {
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

export function CustomersPanel({ authedFetch, toast }: { authedFetch: (path: string, init?: RequestInit) => Promise<Response>; toast: (text: string) => void }) {
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<CustomerRow[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await authedFetch(`/api/setla/admin/customers${search ? `?search=${encodeURIComponent(search)}` : ""}`);
    const payload = await res.json().catch(() => ({}));
    setRows(res.ok ? payload.customers || [] : []);
  }, [authedFetch, search]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  if (selectedId) return <CustomerDetail id={selectedId} authedFetch={authedFetch} toast={toast} onBack={() => setSelectedId(null)} />;

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

function CustomerDetail({ id, authedFetch, toast, onBack }: { id: string; authedFetch: (path: string, init?: RequestInit) => Promise<Response>; toast: (text: string) => void; onBack: () => void }) {
  const [data, setData] = useState<any>(null);
  const [newLimit, setNewLimit] = useState("");
  const [limitReason, setLimitReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await authedFetch(`/api/setla/admin/customers/${id}`);
    const payload = await res.json().catch(() => null);
    setData(res.ok ? payload : null);
  }, [id, authedFetch]);

  useEffect(() => { load(); }, [load]);

  async function adjustLimit() {
    if (!newLimit || Number(newLimit) <= 0) { toast("Enter a valid limit"); return; }
    setBusy(true);
    const res = await authedFetch(`/api/setla/admin/customers/${id}/adjust-limit`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newLimit: Number(newLimit), reason: limitReason }),
    });
    const payload = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { toast(payload.error || "Could not adjust this limit"); return; }
    toast("Limit updated");
    setNewLimit(""); setLimitReason("");
    load();
  }

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
      {customer.application_status === "approved" && (
        <div className="sad-card">
          <strong style={{ fontSize: 13, display: "block", marginBottom: 4 }}>Adjust spending limit</strong>
          <p className="sad-empty" style={{ marginBottom: 12 }}>Reward good repayment behaviour with a higher limit, or correct it if needed. Their available balance shifts by the same amount so any existing spend still counts.</p>
          <div className="sad-form-row"><label>New approved limit (R)</label><input className="sad-input" type="number" min="0" value={newLimit} onChange={(e) => setNewLimit(e.target.value)} placeholder={String(customer.approved_limit)} /></div>
          <div className="sad-form-row"><label>Note (optional, included in the customer's email)</label><textarea className="sad-textarea" value={limitReason} onChange={(e) => setLimitReason(e.target.value)} /></div>
          <button type="button" className="sad-btn" disabled={busy} onClick={adjustLimit}>{busy ? "Saving…" : "Update limit"}</button>
        </div>
      )}
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

export function AdminsPanel({ authedFetch, toast, role }: { authedFetch: (path: string, init?: RequestInit) => Promise<Response>; toast: (text: string) => void; role: "reviewer" | "super_admin" }) {
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
