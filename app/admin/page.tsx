"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { CSSProperties } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import { canonicalStoreUrl } from "../../lib/store-url";

const ADMIN_EMAIL = "info@4regn.com";

interface Seller {
  id: string; email: string; store_name: string; whatsapp_number: string; subdomain: string;
  template: string; plan: string; primary_color: string; logo_url: string; banner_url: string;
  tagline: string; description: string; collections: string[]; created_at: string;
  subscription_status: string; subscription_plan: string; trial_ends_at: string;
}

interface Product {
  id: string; seller_id: string; name: string; price: number; image_url: string | null;
  category: string; in_stock: boolean; status: string; created_at: string;
}

interface Order {
  id: string; seller_id: string; order_number: number; customer_name: string; customer_email: string;
  customer_phone: string; items: { name: string; qty: number; price: number; variant?: string; image?: string }[];
  total: number; status: string; payment_status: string; payment_method: string;
  fulfillment_method: string; shipping_cost: number; created_at: string;
}

interface AffiliateReferral {
  id: string; seller_id: string; status: "trial" | "active"; referred_at: string;
  first_payment_at: string | null; last_payment_at: string | null; payments_counted: number;
  total_earned_from_seller: number;
  sellers: { store_name: string; subdomain: string; email: string; subscription_status: string; created_at: string } | null;
}

interface Affiliate {
  id: string; slug: string; full_name: string; email: string; phone: string; status: string;
  email_verified: boolean; available_balance: number; pending_balance: number; total_earned: number;
  total_paid_out: number; created_at: string;
  referrals: AffiliateReferral[];
  stats: { totalReferred: number; activePaying: number; inTrial: number };
}

interface AffiliateTotals {
  affiliates: number; totalReferred: number; activePaying: number;
  totalEarnedCents: number; pendingBalanceCents: number; totalPaidOutCents: number;
}

interface Conversation {
  id: string; visitor_id: string; name: string | null; email: string | null;
  status: "open" | "closed"; admin_unread: number; last_message_at: string;
  last_message_preview: string; created_at: string;
}

interface SupportMessage {
  id: string; sender: "visitor" | "admin"; body: string; created_at: string;
}

const F = "'Schibsted Grotesk', sans-serif";
const N = "#ff6b35";
const G = "linear-gradient(135deg, #ff6b35, #ff3d6e)";

const THEME_CSS = `
[data-theme="dark"]{--bg:#030303;--panel:rgba(255,255,255,0.02);--panel-2:rgba(255,255,255,0.04);--border:rgba(255,255,255,0.07);--text:#f5f5f5;--muted:rgba(245,245,245,0.45);--muted-2:rgba(245,245,245,0.25);--input-bg:rgba(255,255,255,0.04);}
[data-theme="light"]{--bg:#f5f5f6;--panel:#ffffff;--panel-2:#fafafa;--border:rgba(0,0,0,0.08);--text:#131316;--muted:rgba(19,19,22,0.55);--muted-2:rgba(19,19,22,0.35);--input-bg:rgba(0,0,0,0.03);}
@keyframes spin{to{transform:rotate(360deg)}}
@media(max-width:768px){
  .admin-stats{grid-template-columns:repeat(2,1fr)!important}
  .admin-seller-row{flex-direction:column!important;align-items:flex-start!important}
  .admin-support-grid{grid-template-columns:1fr!important}
  .admin-support-list{max-height:300px}
  .admin-detail-grid{grid-template-columns:1fr!important}
}
`;

const fmtR = (c: number) => "R" + (c / 100).toLocaleString("en-ZA", { maximumFractionDigits: 2 });

const timeAgo = (d: string) => {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  if (s < 604800) return Math.floor(s / 86400) + "d ago";
  return new Date(d).toLocaleDateString();
};

// Shared style fragments
const card: CSSProperties = { background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 16 };
const badge = (bg: string, color: string): CSSProperties => ({ padding: "4px 12px", borderRadius: 100, fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", background: bg, color });
const greenBadge = badge("rgba(34,197,94,0.1)", "#22c55e");
const amberBadge = badge("rgba(251,191,36,0.08)", "#fbbf24");
const redBadge = badge("rgba(255,61,110,0.08)", "#ff3d6e");

export default function AdminDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [pinLocked, setPinLocked] = useState(true);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [tab, setTab] = useState<"overview" | "sellers" | "orders" | "affiliates" | "support">("overview");
  const [selectedSeller, setSelectedSeller] = useState<Seller | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [orderFilter, setOrderFilter] = useState("all");
  const [showSellerProducts, setShowSellerProducts] = useState(false);
  const [showSellerOrders, setShowSellerOrders] = useState(false);

  // Affiliates
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [affTotals, setAffTotals] = useState<AffiliateTotals | null>(null);
  const [affLoaded, setAffLoaded] = useState(false);
  const [affLoading, setAffLoading] = useState(false);
  const [affSearch, setAffSearch] = useState("");
  const [expandedAffiliate, setExpandedAffiliate] = useState<string | null>(null);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  // Support
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [convFilter, setConvFilter] = useState<"all" | "open" | "closed">("all");
  const [activeConvoId, setActiveConvoId] = useState<string | null>(null);
  const [activeConvo, setActiveConvo] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("cs_admin_theme") : null;
    if (saved === "light" || saved === "dark") setTheme(saved);
    checkAdmin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleTheme = () => {
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      try { localStorage.setItem("cs_admin_theme", next); } catch { /* ignore */ }
      return next;
    });
  };

  const checkAdmin = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.email !== ADMIN_EMAIL) { router.push("/login"); return; }
    setAuthorized(true);

    const { data: sd } = await supabase.from("sellers").select("*").order("created_at", { ascending: false });
    if (sd) setSellers(sd);
    const { data: pd } = await supabase.from("products").select("*").order("created_at", { ascending: false });
    if (pd) setAllProducts(pd);
    const { data: od } = await supabase.from("orders").select("*").order("created_at", { ascending: false });
    if (od) setAllOrders(od);
    setLoading(false);
  };

  const submitPin = () => {
    fetch("/api/verify-admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: pinInput }) })
      .then((r) => { if (r.ok) setPinLocked(false); else { setPinError(true); setPinInput(""); } });
  };

  // Authenticated fetch helper (admin Supabase access token as Bearer)
  const authedFetch = async (url: string, init?: RequestInit) => {
    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = {
      ...(init?.headers as Record<string, string> | undefined),
      Authorization: "Bearer " + (session?.access_token || ""),
    };
    if (init?.body) headers["Content-Type"] = "application/json";
    return fetch(url, { ...init, headers });
  };

  // ---- Affiliates ----
  const loadAffiliates = async () => {
    setAffLoading(true);
    try {
      const r = await authedFetch("/api/admin/affiliates");
      if (r.ok) {
        const d = await r.json();
        setAffiliates(d.affiliates || []);
        setAffTotals(d.totals || null);
      }
    } catch { /* network error - keep prior state */ }
    setAffLoading(false);
    setAffLoaded(true);
  };

  useEffect(() => {
    if (!authorized || pinLocked) return;
    if (tab === "affiliates" && !affLoaded) loadAffiliates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, authorized, pinLocked]);

  const copySlug = (slug: string) => {
    try { navigator.clipboard.writeText(slug); } catch { /* ignore */ }
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug((c) => (c === slug ? null : c)), 1500);
  };

  // ---- Support ----
  const loadConversations = useCallback(async () => {
    try {
      const r = await authedFetch("/api/admin/support");
      if (r.ok) {
        const d = await r.json();
        setConversations(d.conversations || []);
      }
    } catch { /* ignore polling errors */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll list: 15s on support tab, 30s otherwise (for the unread badge)
  useEffect(() => {
    if (!authorized || pinLocked) return;
    loadConversations();
    const iv = setInterval(loadConversations, tab === "support" ? 15000 : 30000);
    return () => clearInterval(iv);
  }, [authorized, pinLocked, tab, loadConversations]);

  const loadThread = useCallback(async (id: string, silent = false) => {
    if (!silent) setThreadLoading(true);
    try {
      const r = await authedFetch("/api/admin/support/" + id);
      if (r.ok) {
        const d = await r.json();
        setActiveConvo(d.conversation || null);
        setMessages(d.messages || []);
        // Opening clears unread server-side; mirror locally
        setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, admin_unread: 0 } : c)));
      }
    } catch { /* ignore */ }
    if (!silent) setThreadLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll the open thread every 5s
  useEffect(() => {
    if (!activeConvoId || tab !== "support") return;
    const iv = setInterval(() => loadThread(activeConvoId, true), 5000);
    return () => clearInterval(iv);
  }, [activeConvoId, tab, loadThread]);

  // Keep thread scrolled to the newest message
  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [messages.length, activeConvoId, threadLoading]);

  const openConversation = (id: string) => {
    setActiveConvoId(id);
    setMessages([]);
    setActiveConvo(conversations.find((c) => c.id === id) || null);
    loadThread(id);
  };

  const sendReply = async () => {
    const text = replyText.trim();
    if (!text || !activeConvoId || sendingReply) return;
    setSendingReply(true);
    try {
      const r = await authedFetch("/api/admin/support/" + activeConvoId, { method: "POST", body: JSON.stringify({ message: text }) });
      if (r.ok) {
        setReplyText("");
        await loadThread(activeConvoId, true);
        loadConversations();
      }
    } catch { /* ignore */ }
    setSendingReply(false);
  };

  const setConvoStatus = async (id: string, status: "open" | "closed") => {
    try {
      const r = await authedFetch("/api/admin/support/" + id, { method: "PATCH", body: JSON.stringify({ status }) });
      if (r.ok) {
        setActiveConvo((p) => (p && p.id === id ? { ...p, status } : p));
        setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, status } : c)));
      }
    } catch { /* ignore */ }
  };

  const totalUnread = conversations.reduce((s, c) => s + (c.admin_unread || 0), 0);
  const filteredConversations = convFilter === "all" ? conversations : conversations.filter((c) => c.status === convFilter);

  // Stats
  const totalSellers = sellers.length;
  const totalProducts = allProducts.filter((p) => (p.status || "published") !== "trashed").length;
  const totalOrders = allOrders.length;
  const totalRevenue = allOrders.filter((o) => o.payment_status === "paid").reduce((s, o) => s + o.total, 0);
  const liveStores = sellers.filter((s) => s.subdomain).length;
  const ordersToday = allOrders.filter((o) => new Date(o.created_at).toDateString() === new Date().toDateString()).length;

  // Seller stats helper
  const getSellerStats = (sellerId: string) => {
    const prods = allProducts.filter((p) => p.seller_id === sellerId && (p.status || "published") !== "trashed").length;
    const ords = allOrders.filter((o) => o.seller_id === sellerId);
    const rev = ords.filter((o) => o.payment_status === "paid").reduce((s, o) => s + o.total, 0);
    return { products: prods, orders: ords.length, revenue: rev };
  };

  // Filtered sellers
  const filteredSellers = searchQuery
    ? sellers.filter((s) => s.store_name.toLowerCase().includes(searchQuery.toLowerCase()) || s.email.toLowerCase().includes(searchQuery.toLowerCase()) || s.subdomain?.toLowerCase().includes(searchQuery.toLowerCase()))
    : sellers;

  // Filtered orders
  const filteredOrders = orderFilter === "all" ? allOrders : allOrders.filter((o) => o.payment_status === orderFilter);

  const getSellerName = (sellerId: string) => sellers.find((s) => s.id === sellerId)?.store_name || "Unknown";

  // Filtered affiliates
  const affQ = affSearch.trim().toLowerCase();
  const filteredAffiliates = affQ
    ? affiliates.filter((a) => (a.full_name || "").toLowerCase().includes(affQ) || (a.email || "").toLowerCase().includes(affQ) || (a.slug || "").toLowerCase().includes(affQ))
    : affiliates;

  const pageHeader = (title: string, subtitle: string) => (
    <>
      <h1 style={{ fontSize: 28, fontWeight: 900, letterSpacing: "-0.04em", textTransform: "uppercase", marginBottom: 4 }}>{title}</h1>
      <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 28 }}>{subtitle}</p>
    </>
  );

  const statCard = (n: string | number, l: string, c?: string) => (
    <div style={{ ...card, padding: "24px 20px" }}>
      <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: "-0.04em", marginBottom: 4, color: c || "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n}</div>
      <div style={{ fontSize: 10, color: "var(--muted-2)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>{l}</div>
    </div>
  );

  if (loading) return (
    <div data-theme={theme} style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: F }}>
      <style>{THEME_CSS}</style>
      <div style={{ width: 32, height: 32, border: "3px solid var(--border)", borderTopColor: N, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <p style={{ color: "var(--muted)", marginTop: 16 }}>Loading admin...</p>
    </div>
  );

  if (!authorized) return null;

  if (pinLocked) return (
    <div data-theme={theme} style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: F, padding: "40px 24px" }}>
      <style>{THEME_CSS}</style>
      <div style={{ maxWidth: 360, width: "100%", textAlign: "center" }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: "rgba(255,107,53,0.08)", border: "1px solid rgba(255,107,53,0.15)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px", fontSize: 24 }}>&#128274;</div>
        <h1 style={{ fontSize: 24, fontWeight: 900, color: "var(--text)", textTransform: "uppercase", letterSpacing: "-0.02em", marginBottom: 8 }}>Admin Access</h1>
        <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 32 }}>Enter your admin PIN to continue.</p>
        <input
          type="password"
          value={pinInput}
          onChange={(e) => { setPinInput(e.target.value); setPinError(false); }}
          onKeyDown={(e) => { if (e.key === "Enter") submitPin(); }}
          placeholder="Enter PIN"
          autoFocus
          style={{ width: "100%", padding: "16px 20px", background: "var(--input-bg)", border: pinError ? "2px solid #ff3d6e" : "1px solid var(--border)", borderRadius: 12, color: "var(--text)", fontSize: 18, fontFamily: F, outline: "none", textAlign: "center", letterSpacing: "0.2em", fontWeight: 700, marginBottom: 12 }}
        />
        {pinError && <p style={{ fontSize: 12, color: "#ff3d6e", marginBottom: 12 }}>Incorrect PIN. Try again.</p>}
        <button
          onClick={submitPin}
          style={{ width: "100%", padding: "14px", background: G, color: "#fff", border: "none", borderRadius: 100, fontSize: 12, fontWeight: 800, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: F }}
        >Unlock</button>
        <button onClick={() => router.push("/dashboard")} style={{ background: "none", border: "none", color: "var(--muted-2)", fontSize: 12, cursor: "pointer", marginTop: 16, fontFamily: F }}>&larr; Back to Dashboard</button>
      </div>
    </div>
  );

  return (
    <>
      <style>{THEME_CSS}</style>
      <div data-theme={theme} style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: F, color: "var(--text)" }}>

        {/* HEADER */}
        <header style={{ borderBottom: "1px solid var(--border)", background: "var(--panel-2)", padding: "0 32px" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <span style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.04em", textTransform: "uppercase" }}>CATALOG<span style={{ background: G, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>STORE</span></span>
              <span style={{ padding: "4px 12px", background: "rgba(255,107,53,0.08)", border: "1px solid rgba(255,107,53,0.15)", borderRadius: 100, fontSize: 9, fontWeight: 800, color: N, letterSpacing: "0.1em", textTransform: "uppercase" }}>Admin</span>
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <button
                onClick={toggleTheme}
                title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                aria-label="Toggle theme"
                style={{ width: 32, height: 32, borderRadius: 100, background: "var(--input-bg)", border: "1px solid var(--border)", color: "var(--muted)", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: F, lineHeight: 1 }}
              >{theme === "dark" ? "☀︎" : "☾"}</button>
              <a href="/dashboard" style={{ fontSize: 11, color: "var(--muted)", textDecoration: "none", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>Seller Dashboard</a>
              <button onClick={async () => { await supabase.auth.signOut(); router.push("/login"); }} style={{ fontSize: 11, color: "var(--muted-2)", background: "none", border: "none", cursor: "pointer", fontFamily: F, letterSpacing: "0.04em", textTransform: "uppercase" }}>Logout</button>
            </div>
          </div>
        </header>

        {/* TABS */}
        <div style={{ borderBottom: "1px solid var(--border)", background: "var(--panel-2)", padding: "0 32px", overflowX: "auto" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", gap: 4 }}>
            {(["overview", "sellers", "orders", "affiliates", "support"] as const).map((t) => (
              <button key={t} onClick={() => { setTab(t); setSelectedSeller(null); }} style={{ padding: "14px 20px", background: "transparent", border: "none", borderBottom: tab === t ? "2px solid " + N : "2px solid transparent", color: tab === t ? "var(--text)" : "var(--muted)", fontFamily: F, fontSize: 12, fontWeight: tab === t ? 800 : 500, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.06em", display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
                {t}
                {t === "support" && totalUnread > 0 && (
                  <span style={{ minWidth: 18, height: 18, padding: "0 5px", borderRadius: 100, background: G, color: "#fff", fontSize: 10, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{totalUnread}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 32px 60px" }}>

          {/* OVERVIEW */}
          {tab === "overview" && (
            <div>
              {pageHeader("Platform Overview", "CatalogStore admin dashboard")}

              <div className="admin-stats" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 40 }}>
                {[
                  { n: totalSellers, l: "Total Sellers", c: N },
                  { n: liveStores, l: "Live Stores" },
                  { n: totalProducts, l: "Total Products" },
                  { n: totalOrders, l: "Total Orders" },
                  { n: ordersToday, l: "Orders Today" },
                  { n: "R" + totalRevenue.toFixed(0), l: "Platform Revenue", c: N },
                ].map((s, i) => <div key={i}>{statCard(s.n, s.l, s.c)}</div>)}
              </div>

              {/* RECENT SELLERS */}
              <h3 style={{ fontSize: 14, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 16 }}>Recent Sellers</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 40 }}>
                {sellers.slice(0, 5).map((s) => {
                  const stats = getSellerStats(s.id);
                  return (
                    <div key={s.id} onClick={() => { setSelectedSeller(s); setTab("sellers"); setShowSellerProducts(false); setShowSellerOrders(false); }} style={{ ...card, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", cursor: "pointer", flexWrap: "wrap", gap: 12 }} onMouseEnter={(e) => e.currentTarget.style.borderColor = "rgba(255,107,53,0.3)"} onMouseLeave={(e) => e.currentTarget.style.borderColor = "var(--border)"}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        {s.logo_url ? <img src={s.logo_url} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: "contain" }} /> : <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--panel-2)", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: 14, color: "var(--muted-2)" }}>{s.store_name?.charAt(0)}</span></div>}
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, textTransform: "uppercase" }}>{s.store_name}</div>
                          <div style={{ fontSize: 11, color: "var(--muted-2)" }}>{s.email}</div>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 16, fontSize: 11, color: "var(--muted-2)" }}>
                        <span>{stats.products} products</span>
                        <span>{stats.orders} orders</span>
                        <span style={{ color: N }}>R{stats.revenue}</span>
                      </div>
                      <span style={s.subscription_status === "active" ? greenBadge : s.subscription_status === "trial" ? amberBadge : redBadge}>{s.subscription_status === "active" ? (s.subscription_plan || "starter") : (s.subscription_status || "none")}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* SELLERS */}
          {tab === "sellers" && (
            <div>
              {selectedSeller ? (
                <div>
                  <button onClick={() => setSelectedSeller(null)} style={{ padding: "10px 20px", background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 100, color: "var(--muted)", fontFamily: F, fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "uppercase", marginBottom: 24 }}>&larr; All Sellers</button>

                  <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 32 }}>
                    {selectedSeller.logo_url ? <img src={selectedSeller.logo_url} alt="" style={{ width: 56, height: 56, borderRadius: 14, objectFit: "contain" }} /> : <div style={{ width: 56, height: 56, borderRadius: 14, background: "var(--panel-2)", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: 24, color: "var(--muted-2)" }}>{selectedSeller.store_name?.charAt(0)}</span></div>}
                    <div>
                      <h1 style={{ fontSize: 24, fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.02em" }}>{selectedSeller.store_name}</h1>
                      <div style={{ fontSize: 13, color: "var(--muted)" }}>{selectedSeller.email} - {selectedSeller.subdomain}.catalogstore.co.za</div>
                    </div>
                  </div>

                  {/* SELLER STATS */}
                  {(() => {
                    const stats = getSellerStats(selectedSeller.id);
                    return (
                      <div className="admin-stats" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 32 }}>
                        {[{ n: stats.products, l: "Products" }, { n: stats.orders, l: "Orders" }, { n: "R" + stats.revenue, l: "Revenue", c: N }, { n: selectedSeller.subscription_plan || "none", l: "Plan" }, { n: selectedSeller.subscription_status || "none", l: "Status", c: selectedSeller.subscription_status === "active" ? "#22c55e" : selectedSeller.subscription_status === "trial" ? "#fbbf24" : "#ff3d6e" }].map((s, i) => <div key={i}>{statCard(s.n, s.l, s.c)}</div>)}
                      </div>
                    );
                  })()}

                  {/* SELLER DETAILS */}
                  <div className="admin-detail-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 32 }}>
                    <div style={{ ...card, padding: 20 }}>
                      <h3 style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12, color: N }}>Store Info</h3>
                      <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.8 }}>
                        <p><strong style={{ color: "var(--text)" }}>WhatsApp:</strong> {selectedSeller.whatsapp_number || "N/A"}</p>
                        <p><strong style={{ color: "var(--text)" }}>Template:</strong> {selectedSeller.template || "N/A"}</p>
                        <p><strong style={{ color: "var(--text)" }}>Tagline:</strong> {selectedSeller.tagline || "N/A"}</p>
                        <p><strong style={{ color: "var(--text)" }}>Joined:</strong> {new Date(selectedSeller.created_at).toLocaleDateString()}</p>
                        {selectedSeller.trial_ends_at && <p><strong style={{ color: "var(--text)" }}>Trial Ends:</strong> {new Date(selectedSeller.trial_ends_at).toLocaleDateString()}</p>}
                        <p><strong style={{ color: "var(--text)" }}>Collections:</strong> {(selectedSeller.collections || []).join(", ") || "None"}</p>
                      </div>
                    </div>
                    <div style={{ ...card, padding: 20 }}>
                      <h3 style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12, color: N }}>Quick Actions</h3>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {selectedSeller.subdomain && <a href={canonicalStoreUrl(selectedSeller.subdomain)} target="_blank" rel="noreferrer" style={{ display: "block", padding: "12px 16px", background: "rgba(255,107,53,0.06)", border: "1px solid rgba(255,107,53,0.12)", borderRadius: 10, color: N, fontSize: 12, fontWeight: 700, textAlign: "center", textDecoration: "none", textTransform: "uppercase", letterSpacing: "0.06em" }}>Visit Store</a>}
                        <a href={"/dashboard/editor?assist=" + selectedSeller.id} target="_blank" rel="noreferrer" style={{ display: "block", padding: "12px 16px", background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 10, color: "#8b5cf6", fontSize: 12, fontWeight: 700, textAlign: "center", textTransform: "uppercase", letterSpacing: "0.06em", textDecoration: "none", cursor: "pointer", fontFamily: F }} title="Open the visual editor for this seller. Their payment + bank details are never loaded.">🛡 Admin Assistance</a>
                      </div>
                    </div>
                  </div>

                  {/* SELLER PRODUCTS */}
                  <button onClick={() => setShowSellerProducts(!showSellerProducts)} style={{ ...card, width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", cursor: "pointer", marginBottom: showSellerProducts ? 8 : 32, fontFamily: F }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <h3 style={{ fontSize: 14, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em", margin: 0, color: "var(--text)" }}>Products</h3>
                      <span style={{ fontSize: 11, color: "var(--muted-2)" }}>({allProducts.filter((p) => p.seller_id === selectedSeller.id && (p.status || "published") !== "trashed").length})</span>
                    </div>
                    <span style={{ fontSize: 14, color: "var(--muted-2)", transition: "transform 0.2s", transform: showSellerProducts ? "rotate(180deg)" : "rotate(0)" }}>{"▼"}</span>
                  </button>
                  {showSellerProducts && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 32 }}>
                    {allProducts.filter((p) => p.seller_id === selectedSeller.id && (p.status || "published") !== "trashed").map((p) => (
                      <div key={p.id} style={{ ...card, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderRadius: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          {p.image_url ? <img src={p.image_url} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: "cover" }} /> : <div style={{ width: 36, height: 36, borderRadius: 6, background: "var(--panel-2)" }} />}
                          <div><div style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase" }}>{p.name}</div><div style={{ fontSize: 11, color: "var(--muted-2)" }}>{p.category || "No collection"} - {p.status || "published"}</div></div>
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 800 }}>R{p.price}</span>
                      </div>
                    ))}
                    {allProducts.filter((p) => p.seller_id === selectedSeller.id && (p.status || "published") !== "trashed").length === 0 && <p style={{ fontSize: 13, color: "var(--muted-2)", padding: "20px 0" }}>No products</p>}
                  </div>
                  )}

                  {/* SELLER ORDERS */}
                  <button onClick={() => setShowSellerOrders(!showSellerOrders)} style={{ ...card, width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", cursor: "pointer", marginBottom: showSellerOrders ? 8 : 0, fontFamily: F }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <h3 style={{ fontSize: 14, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em", margin: 0, color: "var(--text)" }}>Orders</h3>
                      <span style={{ fontSize: 11, color: "var(--muted-2)" }}>({allOrders.filter((o) => o.seller_id === selectedSeller.id).length})</span>
                    </div>
                    <span style={{ fontSize: 14, color: "var(--muted-2)", transition: "transform 0.2s", transform: showSellerOrders ? "rotate(180deg)" : "rotate(0)" }}>{"▼"}</span>
                  </button>
                  {showSellerOrders && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {allOrders.filter((o) => o.seller_id === selectedSeller.id).map((o) => (
                      <div key={o.id} style={{ ...card, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderRadius: 10, flexWrap: "wrap", gap: 10 }}>
                        <div><div style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase" }}>#{o.order_number}</div><div style={{ fontSize: 11, color: "var(--muted-2)" }}>{o.customer_name || "Customer"} - {new Date(o.created_at).toLocaleDateString()}</div></div>
                        <div style={{ fontSize: 15, fontWeight: 900 }}>R{o.total}</div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <span style={o.payment_status === "paid" ? greenBadge : amberBadge}>{o.payment_status?.replace("_", " ")}</span>
                          <span style={o.status === "delivered" ? greenBadge : amberBadge}>{o.status}</span>
                        </div>
                      </div>
                    ))}
                    {allOrders.filter((o) => o.seller_id === selectedSeller.id).length === 0 && <p style={{ fontSize: 13, color: "var(--muted-2)", padding: "20px 0" }}>No orders</p>}
                  </div>
                  )}
                </div>
              ) : (
                <div>
                  {pageHeader("Sellers", "All registered sellers on CatalogStore")}

                  <input type="text" placeholder="Search sellers by name, email, or subdomain..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ width: "100%", maxWidth: 500, padding: "12px 16px", background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--text)", fontSize: 13, fontFamily: F, outline: "none", marginBottom: 24 }} />

                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {filteredSellers.map((s) => {
                      const stats = getSellerStats(s.id);
                      return (
                        <div key={s.id} onClick={() => { setSelectedSeller(s); setShowSellerProducts(false); setShowSellerOrders(false); }} className="admin-seller-row" style={{ ...card, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", cursor: "pointer", flexWrap: "wrap", gap: 12 }} onMouseEnter={(e) => e.currentTarget.style.borderColor = "rgba(255,107,53,0.3)"} onMouseLeave={(e) => e.currentTarget.style.borderColor = "var(--border)"}>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            {s.logo_url ? <img src={s.logo_url} alt="" style={{ width: 40, height: 40, borderRadius: 10, objectFit: "contain" }} /> : <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--panel-2)", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: 16, fontWeight: 900, color: "var(--muted-2)" }}>{s.store_name?.charAt(0)}</span></div>}
                            <div>
                              <div style={{ fontSize: 14, fontWeight: 700, textTransform: "uppercase" }}>{s.store_name}</div>
                              <div style={{ fontSize: 11, color: "var(--muted-2)" }}>{s.email}</div>
                              {s.subdomain && <div style={{ fontSize: 10, color: "var(--muted-2)" }}>{s.subdomain}.catalogstore.co.za</div>}
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 20, fontSize: 11, color: "var(--muted-2)", alignItems: "center" }}>
                            <span>{stats.products} products</span>
                            <span>{stats.orders} orders</span>
                            <span style={{ color: N, fontWeight: 700 }}>R{stats.revenue}</span>
                            <span style={s.subscription_status === "active" ? greenBadge : s.subscription_status === "trial" ? amberBadge : redBadge}>{s.subscription_status === "active" ? (s.subscription_plan || "starter") : (s.subscription_status || "none")}</span>
                          </div>
                          <span style={{ fontSize: 10, color: "var(--muted-2)" }}>Joined {new Date(s.created_at).toLocaleDateString()}</span>
                        </div>
                      );
                    })}
                    {filteredSellers.length === 0 && <p style={{ fontSize: 13, color: "var(--muted-2)", padding: "40px 0", textAlign: "center" }}>No sellers found</p>}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ORDERS */}
          {tab === "orders" && (
            <div>
              {pageHeader("All Orders", "Orders across all stores on the platform")}

              <div style={{ display: "flex", gap: 6, marginBottom: 24, flexWrap: "wrap" }}>
                {[{ k: "all", l: "All" }, { k: "awaiting_payment", l: "Awaiting" }, { k: "paid", l: "Paid" }, { k: "refunded", l: "Refunded" }].map((f) => (
                  <button key={f.k} onClick={() => setOrderFilter(f.k)} style={{ padding: "8px 18px", borderRadius: 100, background: orderFilter === f.k ? "rgba(255,107,53,0.08)" : "var(--panel)", border: orderFilter === f.k ? "1px solid rgba(255,107,53,0.3)" : "1px solid var(--border)", color: orderFilter === f.k ? N : "var(--muted)", fontFamily: F, fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" }}>{f.l} ({f.k === "all" ? allOrders.length : allOrders.filter((o) => o.payment_status === f.k).length})</button>
                ))}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {filteredOrders.map((o) => (
                  <div key={o.id} style={{ ...card, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", flexWrap: "wrap", gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase" }}>#{o.order_number} - {getSellerName(o.seller_id)}</div>
                      <div style={{ fontSize: 11, color: "var(--muted-2)" }}>{o.customer_name || "Customer"} - {o.customer_email || ""} - {new Date(o.created_at).toLocaleString()}</div>
                      <div style={{ fontSize: 10, color: "var(--muted-2)", marginTop: 2 }}>{o.payment_method || "N/A"} - {o.fulfillment_method || "delivery"}</div>
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 900 }}>R{o.total}</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <span style={o.payment_status === "paid" ? greenBadge : o.payment_status === "refunded" ? redBadge : amberBadge}>{o.payment_status?.replace("_", " ")}</span>
                      <span style={o.status === "delivered" ? greenBadge : o.status === "cancelled" ? redBadge : o.status === "shipped" ? badge("rgba(37,99,235,0.1)", "#2563eb") : amberBadge}>{o.status}</span>
                    </div>
                  </div>
                ))}
                {filteredOrders.length === 0 && <p style={{ fontSize: 13, color: "var(--muted-2)", padding: "40px 0", textAlign: "center" }}>No orders found</p>}
              </div>
            </div>
          )}

          {/* AFFILIATES */}
          {tab === "affiliates" && (
            <div>
              {pageHeader("Affiliates", "Affiliate programme performance and referred sellers")}

              {affLoading && !affLoaded ? (
                <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
                  <div style={{ width: 28, height: 28, border: "3px solid var(--border)", borderTopColor: N, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                </div>
              ) : (
                <>
                  <div className="admin-stats" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 16 }}>
                    {[
                      { n: affTotals?.affiliates ?? affiliates.length, l: "Total Affiliates", c: N },
                      { n: affTotals?.totalReferred ?? 0, l: "Total Referred" },
                      { n: affTotals?.activePaying ?? 0, l: "Active Paying", c: "#22c55e" },
                      { n: fmtR(affTotals?.totalEarnedCents ?? 0), l: "Total Commission Earned", c: N },
                      { n: fmtR(affTotals?.pendingBalanceCents ?? 0), l: "Pending Payouts", c: "#fbbf24" },
                    ].map((s, i) => <div key={i}>{statCard(s.n, s.l, s.c)}</div>)}
                  </div>

                  <p style={{ fontSize: 11, color: "var(--muted-2)", marginBottom: 24, lineHeight: 1.6 }}>
                    Commission model: affiliates earn 50% of each referred seller&apos;s payment for the seller&apos;s first 6 paid months. Referred sellers pay R149/mo instead of R199/mo.
                  </p>

                  <input type="text" placeholder="Search affiliates by name, email, or referral code..." value={affSearch} onChange={(e) => setAffSearch(e.target.value)} style={{ width: "100%", maxWidth: 500, padding: "12px 16px", background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--text)", fontSize: 13, fontFamily: F, outline: "none", marginBottom: 24 }} />

                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {filteredAffiliates.map((a) => {
                      const expanded = expandedAffiliate === a.id;
                      return (
                        <div key={a.id} style={{ ...card, overflow: "hidden" }}>
                          <div onClick={() => setExpandedAffiliate(expanded ? null : a.id)} className="admin-seller-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", cursor: "pointer", flexWrap: "wrap", gap: 12 }}>
                            <div style={{ minWidth: 220 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                <span style={{ fontSize: 14, fontWeight: 700, textTransform: "uppercase" }}>{a.full_name || "Affiliate"}</span>
                                <span
                                  onClick={(e) => { e.stopPropagation(); copySlug(a.slug); }}
                                  title="Click to copy referral code"
                                  style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 11, padding: "3px 10px", borderRadius: 100, background: "var(--input-bg)", border: "1px solid var(--border)", color: copiedSlug === a.slug ? "#22c55e" : "var(--muted)", cursor: "copy" }}
                                >{copiedSlug === a.slug ? "Copied!" : a.slug}</span>
                                {a.status && a.status !== "active" && <span style={amberBadge}>{a.status}</span>}
                              </div>
                              <div style={{ fontSize: 11, color: "var(--muted-2)", marginTop: 2 }}>{a.email}{a.email_verified ? "" : " (unverified)"}</div>
                            </div>
                            <div style={{ display: "flex", gap: 20, fontSize: 11, color: "var(--muted-2)", alignItems: "center", flexWrap: "wrap" }}>
                              <span>{a.stats?.totalReferred ?? a.referrals?.length ?? 0} referred</span>
                              <span style={{ color: "#22c55e" }}>{a.stats?.activePaying ?? 0} active</span>
                              <span style={{ color: N, fontWeight: 700 }}>{fmtR(a.total_earned || 0)} earned</span>
                              <span style={{ color: "#fbbf24" }}>{fmtR(a.pending_balance || 0)} pending</span>
                              <span style={{ fontSize: 12, color: "var(--muted-2)", transition: "transform 0.2s", transform: expanded ? "rotate(180deg)" : "rotate(0)" }}>{"▼"}</span>
                            </div>
                          </div>

                          {expanded && (
                            <div style={{ borderTop: "1px solid var(--border)", background: "var(--panel-2)", padding: "12px 16px" }}>
                              <div style={{ display: "flex", gap: 20, fontSize: 11, color: "var(--muted-2)", marginBottom: 12, flexWrap: "wrap" }}>
                                <span>Joined {new Date(a.created_at).toLocaleDateString()}</span>
                                {a.phone && <span>{a.phone}</span>}
                                <span>Available: <strong style={{ color: "var(--text)" }}>{fmtR(a.available_balance || 0)}</strong></span>
                                <span>Paid out: <strong style={{ color: "var(--text)" }}>{fmtR(a.total_paid_out || 0)}</strong></span>
                                <span>In trial: <strong style={{ color: "#fbbf24" }}>{a.stats?.inTrial ?? 0}</strong></span>
                              </div>
                              {(a.referrals || []).length === 0 ? (
                                <p style={{ fontSize: 12, color: "var(--muted-2)", padding: "8px 0" }}>No referred sellers yet</p>
                              ) : (
                                <div style={{ overflowX: "auto" }}>
                                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                                    <thead>
                                      <tr>
                                        {["Store", "Subdomain", "Status", "Payments", "Earned", "Referred"].map((h) => (
                                          <th key={h} style={{ textAlign: "left", padding: "8px 12px", fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted-2)", borderBottom: "1px solid var(--border)" }}>{h}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {a.referrals.map((r) => (
                                        <tr key={r.id}>
                                          <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", fontWeight: 700, textTransform: "uppercase", color: "var(--text)" }}>{r.sellers?.store_name || "Unknown store"}</td>
                                          <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
                                            {r.sellers?.subdomain ? (
                                              <a href={canonicalStoreUrl(r.sellers.subdomain)} target="_blank" rel="noreferrer" style={{ color: N, textDecoration: "none", fontWeight: 600 }}>{r.sellers.subdomain}</a>
                                            ) : <span style={{ color: "var(--muted-2)" }}>-</span>}
                                          </td>
                                          <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
                                            <span style={r.status === "active" ? greenBadge : amberBadge}>{r.status}</span>
                                          </td>
                                          <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", color: "var(--muted)" }}>{r.payments_counted || 0}/6 months</td>
                                          <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", color: N, fontWeight: 700 }}>{fmtR(r.total_earned_from_seller || 0)}</td>
                                          <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", color: "var(--muted-2)" }}>{new Date(r.referred_at).toLocaleDateString()}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {filteredAffiliates.length === 0 && <p style={{ fontSize: 13, color: "var(--muted-2)", padding: "40px 0", textAlign: "center" }}>{affQ ? "No affiliates match your search" : "No affiliates yet"}</p>}
                  </div>
                </>
              )}
            </div>
          )}

          {/* SUPPORT */}
          {tab === "support" && (
            <div>
              {pageHeader("Support Inbox", "Live chat conversations with visitors and sellers")}

              <div className="admin-support-grid" style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 16, alignItems: "start" }}>

                {/* CONVERSATION LIST */}
                <div className="admin-support-list" style={{ ...card, display: "flex", flexDirection: "column", overflow: "hidden", maxHeight: 620 }}>
                  <div style={{ display: "flex", gap: 6, padding: 12, borderBottom: "1px solid var(--border)" }}>
                    {(["all", "open", "closed"] as const).map((f) => (
                      <button key={f} onClick={() => setConvFilter(f)} style={{ padding: "6px 14px", borderRadius: 100, background: convFilter === f ? "rgba(255,107,53,0.08)" : "transparent", border: convFilter === f ? "1px solid rgba(255,107,53,0.3)" : "1px solid var(--border)", color: convFilter === f ? N : "var(--muted)", fontFamily: F, fontSize: 10, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" }}>
                        {f} ({f === "all" ? conversations.length : conversations.filter((c) => c.status === f).length})
                      </button>
                    ))}
                  </div>
                  <div style={{ overflowY: "auto", flex: 1 }}>
                    {filteredConversations.map((c) => (
                      <div key={c.id} onClick={() => openConversation(c.id)} style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)", cursor: "pointer", background: activeConvoId === c.id ? "var(--panel-2)" : "transparent", borderLeft: activeConvoId === c.id ? "2px solid " + N : "2px solid transparent" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 2 }}>
                          <span style={{ fontSize: 13, fontWeight: c.admin_unread > 0 ? 800 : 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name || "Visitor"}</span>
                          <span style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                            {c.status === "closed" && <span style={{ fontSize: 8, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted-2)", border: "1px solid var(--border)", borderRadius: 100, padding: "2px 7px" }}>Closed</span>}
                            <span style={{ fontSize: 10, color: "var(--muted-2)" }}>{c.last_message_at ? timeAgo(c.last_message_at) : timeAgo(c.created_at)}</span>
                          </span>
                        </div>
                        {c.email && <div style={{ fontSize: 10, color: "var(--muted-2)", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.email}</div>}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                          <span style={{ fontSize: 11, color: c.admin_unread > 0 ? "var(--muted)" : "var(--muted-2)", fontWeight: c.admin_unread > 0 ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.last_message_preview || "No messages yet"}</span>
                          {c.admin_unread > 0 && <span style={{ minWidth: 18, height: 18, padding: "0 5px", borderRadius: 100, background: G, color: "#fff", fontSize: 10, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{c.admin_unread}</span>}
                        </div>
                      </div>
                    ))}
                    {filteredConversations.length === 0 && <p style={{ fontSize: 12, color: "var(--muted-2)", padding: "40px 16px", textAlign: "center" }}>No conversations</p>}
                  </div>
                </div>

                {/* THREAD */}
                <div style={{ ...card, display: "flex", flexDirection: "column", height: 620, overflow: "hidden" }}>
                  {!activeConvoId ? (
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
                      <div style={{ fontSize: 28, opacity: 0.4 }}>&#128172;</div>
                      <p style={{ fontSize: 13, color: "var(--muted-2)" }}>Select a conversation to view the thread</p>
                    </div>
                  ) : (
                    <>
                      {/* Thread header */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 16px", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 800 }}>{activeConvo?.name || "Visitor"}</div>
                          <div style={{ fontSize: 11, color: "var(--muted-2)" }}>{activeConvo?.email || "No email provided"}</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={activeConvo?.status === "closed" ? redBadge : greenBadge}>{activeConvo?.status || "open"}</span>
                          <button
                            onClick={() => activeConvo && setConvoStatus(activeConvo.id, activeConvo.status === "closed" ? "open" : "closed")}
                            style={{ padding: "8px 16px", borderRadius: 100, background: "var(--input-bg)", border: "1px solid var(--border)", color: "var(--muted)", fontFamily: F, fontSize: 10, fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.04em" }}
                          >{activeConvo?.status === "closed" ? "Reopen" : "Close"}</button>
                        </div>
                      </div>

                      {/* Messages */}
                      <div ref={threadRef} style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
                        {threadLoading && messages.length === 0 ? (
                          <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
                            <div style={{ width: 24, height: 24, border: "3px solid var(--border)", borderTopColor: N, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                          </div>
                        ) : messages.length === 0 ? (
                          <p style={{ fontSize: 12, color: "var(--muted-2)", textAlign: "center", padding: "40px 0" }}>No messages in this conversation</p>
                        ) : messages.map((m) => (
                          <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: m.sender === "admin" ? "flex-end" : "flex-start" }}>
                            <div style={{
                              maxWidth: "75%", padding: "10px 14px", fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word",
                              ...(m.sender === "admin"
                                ? { background: G, color: "#fff", borderRadius: "14px 14px 4px 14px" }
                                : { background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: "14px 14px 14px 4px" }),
                            }}>{m.body}</div>
                            <span style={{ fontSize: 9, color: "var(--muted-2)", marginTop: 3, padding: "0 4px" }}>{timeAgo(m.created_at)}</span>
                          </div>
                        ))}
                      </div>

                      {/* Composer */}
                      <div style={{ display: "flex", gap: 8, padding: 12, borderTop: "1px solid var(--border)" }}>
                        <textarea
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                          placeholder="Type a reply... (Enter to send)"
                          rows={1}
                          style={{ flex: 1, padding: "12px 14px", background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--text)", fontSize: 13, fontFamily: F, outline: "none", resize: "none", lineHeight: 1.4 }}
                        />
                        <button
                          onClick={sendReply}
                          disabled={sendingReply || !replyText.trim()}
                          style={{ padding: "0 22px", background: G, color: "#fff", border: "none", borderRadius: 12, fontSize: 11, fontWeight: 800, cursor: sendingReply || !replyText.trim() ? "default" : "pointer", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: F, opacity: sendingReply || !replyText.trim() ? 0.5 : 1 }}
                        >{sendingReply ? "..." : "Send"}</button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
