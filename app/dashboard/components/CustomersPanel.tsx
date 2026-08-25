"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";

type Audience = "all" | "email" | "sms" | "both";

interface CustomerRow {
  id: string;
  external_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  accepts_email_marketing: boolean;
  accepts_sms_marketing: boolean;
  marketing_consent_updated_at: string | null;
  total_spent: number | null;
  total_orders: number | null;
  tags: string[] | null;
  source: string | null;
  created_at: string;
}

interface CustomerResponse {
  customers: CustomerRow[];
  counts: { total: number; email: number; sms: number; both: number };
  pagination: { page: number; pageSize: number; total: number; pages: number };
}

const EMPTY_DATA: CustomerResponse = {
  customers: [],
  counts: { total: 0, email: 0, sms: 0, both: 0 },
  pagination: { page: 1, pageSize: 50, total: 0, pages: 1 },
};

const cardStyle = { background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 16 };

export default function CustomersPanel() {
  const [data, setData] = useState<CustomerResponse>(EMPTY_DATA);
  const [audience, setAudience] = useState<Audience>("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState<Audience | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      setSearch(searchInput.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Your session expired. Please sign in again.");
      const response = await fetch("/api/dashboard/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: token, audience, search, page, page_size: 50 }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load customers.");
      setData(result);
    } catch (loadError: any) {
      setError(loadError?.message || "Could not load customers.");
    } finally {
      setLoading(false);
    }
  }, [audience, page, search]);

  useEffect(() => { void loadCustomers(); }, [loadCustomers]);

  const changeAudience = (next: Audience) => {
    setAudience(next);
    setPage(1);
  };

  const exportAudience = async (kind: Exclude<Audience, "all">) => {
    setExporting(kind);
    setError("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Your session expired. Please sign in again.");
      const response = await fetch("/api/dashboard/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: token, audience: kind, format: "csv" }),
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "Could not export this audience.");
      }
      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = `catalogstore-${kind}-marketing-audience.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(href);
    } catch (exportError: any) {
      setError(exportError?.message || "Could not export this audience.");
    } finally {
      setExporting(null);
    }
  };

  const audienceCards: { key: Audience; label: string; value: number; color: string; description: string }[] = [
    { key: "all", label: "All customers", value: data.counts.total, color: "#60a5fa", description: "Imported customer records" },
    { key: "email", label: "Email audience", value: data.counts.email, color: "#a78bfa", description: "Explicit email opt-in" },
    { key: "sms", label: "SMS audience", value: data.counts.sms, color: "#22c55e", description: "Explicit SMS opt-in" },
    { key: "both", label: "Both channels", value: data.counts.both, color: "#fbbf24", description: "Opted into email and SMS" },
  ];

  return <div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
      <div>
        <h1 style={{ fontSize: "clamp(20px, 4vw, 28px)", fontWeight: 900, letterSpacing: "-0.04em", textTransform: "uppercase", marginBottom: 4 }}>Customers</h1>
        <p style={{ fontSize: 14, color: "var(--muted)", maxWidth: 720 }}>Your customer directory and consent-safe marketing audiences. Only explicit email or SMS opt-ins are eligible for future campaigns.</p>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={() => void exportAudience("email")} disabled={!!exporting || data.counts.email === 0} style={actionButtonStyle}> {exporting === "email" ? "Preparing…" : "Export email audience"}</button>
        <button onClick={() => void exportAudience("sms")} disabled={!!exporting || data.counts.sms === 0} style={actionButtonStyle}>{exporting === "sms" ? "Preparing…" : "Export SMS audience"}</button>
      </div>
    </div>

    <div className="customer-stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12, marginBottom: 16 }}>
      {audienceCards.map((card) => <button key={card.key} onClick={() => changeAudience(card.key)} style={{ ...cardStyle, padding: "18px 18px", textAlign: "left", color: "var(--text)", cursor: "pointer", outline: audience === card.key ? `2px solid ${card.color}` : "none", outlineOffset: -2 }}>
        <div style={{ fontSize: 10, color: card.color, textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 800, marginBottom: 9 }}>{card.label}</div>
        <div style={{ fontSize: 32, lineHeight: 1, fontWeight: 900, letterSpacing: "-.04em" }}>{card.value.toLocaleString("en-ZA")}</div>
        <div style={{ fontSize: 11, color: "var(--muted-2)", marginTop: 7 }}>{card.description}</div>
      </button>)}
    </div>

    <div style={{ ...cardStyle, padding: 16, marginBottom: 14 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search name, email, phone or Shopify customer ID…" style={{ flex: "1 1 320px", minWidth: 0, padding: "12px 13px", background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--text)", fontSize: 12, outline: "none" }} />
        <span style={{ fontSize: 11, color: "var(--muted-2)" }}>{data.pagination.total.toLocaleString("en-ZA")} matching customer{data.pagination.total === 1 ? "" : "s"}</span>
      </div>
    </div>

    {error && <div style={{ padding: 13, marginBottom: 14, borderRadius: 12, background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.2)", color: "#f87171", fontSize: 12 }}>{error}</div>}

    <div style={{ ...cardStyle, overflow: "hidden" }}>
      <div className="customer-table-head" style={{ display: "grid", gridTemplateColumns: "minmax(220px,1.4fr) minmax(220px,1.35fr) 160px 130px 140px", gap: 14, padding: "12px 16px", borderBottom: "1px solid var(--border)", color: "var(--muted-2)", fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em" }}>
        <span>Customer</span><span>Contact</span><span>Marketing consent</span><span>Orders</span><span>Consent record</span>
      </div>
      {loading ? <div style={{ padding: "55px 20px", textAlign: "center", color: "var(--muted-2)", fontSize: 12 }}>Loading customers…</div>
        : data.customers.length === 0 ? <div style={{ padding: "55px 20px", textAlign: "center" }}><div style={{ fontWeight: 800, textTransform: "uppercase", marginBottom: 7 }}>No matching customers</div><div style={{ color: "var(--muted-2)", fontSize: 12 }}>Try another search or consent filter.</div></div>
        : data.customers.map((customer) => {
          const name = [customer.first_name, customer.last_name].filter(Boolean).join(" ") || "Unnamed customer";
          return <div key={customer.id} className="customer-table-row" style={{ display: "grid", gridTemplateColumns: "minmax(220px,1.4fr) minmax(220px,1.35fr) 160px 130px 140px", gap: 14, alignItems: "center", padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div><div style={{ fontSize: 10, color: "var(--muted-2)", marginTop: 3 }}>{customer.external_id ? `Shopify ${customer.external_id}` : "Customer record"}</div></div>
            <div style={{ minWidth: 0 }}><div style={contactLineStyle}>{customer.email || "No email"}</div><div style={{ ...contactLineStyle, marginTop: 4 }}>{customer.phone || "No phone"}</div></div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              <ConsentBadge channel="Email" active={customer.accepts_email_marketing && !!customer.email} />
              <ConsentBadge channel="SMS" active={customer.accepts_sms_marketing && !!customer.phone} />
            </div>
            <div><div style={{ fontSize: 13, fontWeight: 800 }}>{customer.total_orders ?? 0} orders</div><div style={{ fontSize: 10, color: "var(--muted-2)", marginTop: 3 }}>R{Number(customer.total_spent || 0).toLocaleString("en-ZA", { maximumFractionDigits: 0 })} spent</div></div>
            <div><div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--muted)" }}>{customer.source === "import" ? "Shopify import" : customer.source || "Unknown"}</div><div style={{ fontSize: 10, color: "var(--muted-2)", marginTop: 4 }}>{customer.marketing_consent_updated_at ? new Date(customer.marketing_consent_updated_at).toLocaleDateString("en-ZA") : "No opt-in date"}</div></div>
          </div>;
        })}
    </div>

    {data.pagination.pages > 1 && <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 10, marginTop: 16 }}>
      <button disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))} style={pagerButtonStyle}>Previous</button>
      <span style={{ fontSize: 11, color: "var(--muted-2)" }}>Page {data.pagination.page} of {data.pagination.pages}</span>
      <button disabled={page >= data.pagination.pages || loading} onClick={() => setPage((value) => value + 1)} style={pagerButtonStyle}>Next</button>
    </div>}

    <style jsx>{`
      @media (max-width: 920px) {
        .customer-stats-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        .customer-table-head { display: none !important; }
        .customer-table-row { grid-template-columns: 1fr 1fr !important; }
      }
      @media (max-width: 560px) {
        .customer-table-row { grid-template-columns: 1fr !important; gap: 10px !important; }
      }
    `}</style>
  </div>;
}

function ConsentBadge({ channel, active }: { channel: string; active: boolean }) {
  return <span style={{ padding: "5px 8px", borderRadius: 100, fontSize: 8, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".05em", background: active ? "rgba(34,197,94,.12)" : "var(--input-bg)", color: active ? "#22c55e" : "var(--muted-2)", border: `1px solid ${active ? "rgba(34,197,94,.2)" : "var(--border)"}` }}>{channel} {active ? "opted in" : "not subscribed"}</span>;
}

const actionButtonStyle = { padding: "10px 14px", borderRadius: 100, border: "1px solid var(--border)", background: "var(--panel-2)", color: "var(--text)", fontSize: 10, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: ".05em", cursor: "pointer" };
const pagerButtonStyle = { ...actionButtonStyle, padding: "9px 15px" };
const contactLineStyle = { fontSize: 11, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const };
