"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";

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

export default function AdminDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [pinLocked, setPinLocked] = useState(true);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [tab, setTab] = useState<"overview" | "sellers" | "orders">("overview");
  const [selectedSeller, setSelectedSeller] = useState<Seller | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [orderFilter, setOrderFilter] = useState("all");
  const [showSellerProducts, setShowSellerProducts] = useState(false);
  const [showSellerOrders, setShowSellerOrders] = useState(false);

  useEffect(() => { checkAdmin(); }, []);

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

  const N = "#ff6b35";
  const G = "linear-gradient(135deg, #ff6b35, #ff3d6e)";

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

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#030303", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Schibsted Grotesk', sans-serif" }}>
      <div style={{ width: 32, height: 32, border: "3px solid rgba(255,255,255,0.06)", borderTopColor: "#ff6b35", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <p style={{ color: "rgba(245,245,245,0.35)", marginTop: 16 }}>Loading admin...</p>
    </div>
  );

  if (!authorized) return null;

  if (pinLocked) return (
    <div style={{ minHeight: "100vh", background: "#030303", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Schibsted Grotesk', sans-serif", padding: "40px 24px" }}>
      <div style={{ maxWidth: 360, width: "100%", textAlign: "center" }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: "rgba(255,107,53,0.08)", border: "1px solid rgba(255,107,53,0.15)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px", fontSize: 24 }}>&#128274;</div>
        <h1 style={{ fontSize: 24, fontWeight: 900, color: "#f5f5f5", textTransform: "uppercase", letterSpacing: "-0.02em", marginBottom: 8 }}>Admin Access</h1>
        <p style={{ fontSize: 13, color: "rgba(245,245,245,0.35)", marginBottom: 32 }}>Enter your admin PIN to continue.</p>
        <input
          type="password"
          value={pinInput}
          onChange={(e) => { setPinInput(e.target.value); setPinError(false); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              if (e.key === "Enter") { fetch("/api/verify-admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: pinInput }) }).then(r => { if (r.ok) setPinLocked(false); else { setPinError(true); setPinInput(""); } }); }
              else { setPinError(true); setPinInput(""); }
            }
          }}
          placeholder="Enter PIN"
          autoFocus
          style={{ width: "100%", padding: "16px 20px", background: "rgba(255,255,255,0.04)", border: pinError ? "2px solid #ff3d6e" : "1px solid rgba(255,255,255,0.08)", borderRadius: 12, color: "#f5f5f5", fontSize: 18, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none", textAlign: "center", letterSpacing: "0.2em", fontWeight: 700, marginBottom: 12 }}
        />
        {pinError && <p style={{ fontSize: 12, color: "#ff3d6e", marginBottom: 12 }}>Incorrect PIN. Try again.</p>}
        <button
          onClick={() => { fetch("/api/verify-admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: pinInput }) }).then(r => { if (r.ok) setPinLocked(false); else { setPinError(true); setPinInput(""); } }); }}
          style={{ width: "100%", padding: "14px", background: "linear-gradient(135deg, #ff6b35, #ff4444)", color: "#fff", border: "none", borderRadius: 100, fontSize: 12, fontWeight: 800, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "'Schibsted Grotesk', sans-serif" }}
        >Unlock</button>
        <button onClick={() => router.push("/dashboard")} style={{ background: "none", border: "none", color: "rgba(245,245,245,0.25)", fontSize: 12, cursor: "pointer", marginTop: 16, fontFamily: "'Schibsted Grotesk', sans-serif" }}>&larr; Back to Dashboard</button>
      </div>
    </div>
  );

  return (
    <>
      <style>{`
        @media(max-width:768px){.admin-stats{grid-template-columns:repeat(2,1fr)!important}.admin-seller-row{flex-direction:column!important;align-items:flex-start!important}}
        @keyframes spin{to{transform:rotate(360deg)}}
      `}</style>
      <div style={{ minHeight: "100vh", background: "#030303", fontFamily: "'Schibsted Grotesk', sans-serif", color: "#f5f5f5" }}>

        {/* HEADER */}
        <header style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", background: "#080808", padding: "0 32px" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <span style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.04em", textTransform: "uppercase" }}>CATALOG<span style={{ background: G, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>STORE</span></span>
              <span style={{ padding: "4px 12px", background: "rgba(255,107,53,0.08)", border: "1px solid rgba(255,107,53,0.15)", borderRadius: 100, fontSize: 9, fontWeight: 800, color: N, letterSpacing: "0.1em", textTransform: "uppercase" }}>Admin</span>
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <a href="/dashboard" style={{ fontSize: 11, color: "rgba(245,245,245,0.35)", textDecoration: "none", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>Seller Dashboard</a>
              <button onClick={async () => { await supabase.auth.signOut(); router.push("/login"); }} style={{ fontSize: 11, color: "rgba(245,245,245,0.25)", background: "none", border: "none", cursor: "pointer", fontFamily: "'Schibsted Grotesk', sans-serif", letterSpacing: "0.04em", textTransform: "uppercase" }}>Logout</button>
            </div>
          </div>
        </header>

        {/* TABS */}
        <div style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", background: "#080808", padding: "0 32px" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", gap: 4 }}>
            {(["overview", "sellers", "orders"] as const).map((t) => (
              <button key={t} onClick={() => { setTab(t); setSelectedSeller(null); }} style={{ padding: "14px 20px", background: "transparent", border: "none", borderBottom: tab === t ? "2px solid " + N : "2px solid transparent", color: tab === t ? "#f5f5f5" : "rgba(245,245,245,0.35)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 12, fontWeight: tab === t ? 800 : 500, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.06em" }}>{t}</button>
            ))}
          </div>
        </div>

        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 32px 60px" }}>

          {/* OVERVIEW */}
          {tab === "overview" && (
            <div>
              <h1 style={{ fontSize: 28, fontWeight: 900, letterSpacing: "-0.04em", textTransform: "uppercase", marginBottom: 4 }}>Platform Overview</h1>
              <p style={{ fontSize: 14, color: "rgba(245,245,245,0.35)", marginBottom: 32 }}>CatalogStore admin dashboard</p>

              <div className="admin-stats" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 40 }}>
                {[
                  { n: totalSellers, l: "Total Sellers", c: N },
                  { n: liveStores, l: "Live Stores" },
                  { n: totalProducts, l: "Total Products" },
                  { n: totalOrders, l: "Total Orders" },
                  { n: ordersToday, l: "Orders Today" },
                  { n: "R" + totalRevenue.toFixed(0), l: "Platform Revenue", c: N },
                ].map((s, i) => (
                  <div key={i} style={{ padding: "24px 20px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 14 }}>
                    <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: "-0.04em", marginBottom: 4, color: s.c || "#f5f5f5" }}>{s.n}</div>
                    <div style={{ fontSize: 10, color: "rgba(245,245,245,0.25)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>{s.l}</div>
                  </div>
                ))}
              </div>

              {/* RECENT SELLERS */}
              <h3 style={{ fontSize: 14, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 16 }}>Recent Sellers</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 40 }}>
                {sellers.slice(0, 5).map((s) => {
                  const stats = getSellerStats(s.id);
                  return (
                    <div key={s.id} onClick={() => { setSelectedSeller(s); setTab("sellers"); setShowSellerProducts(false); setShowSellerOrders(false); }} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: 12, cursor: "pointer", flexWrap: "wrap", gap: 12 }} onMouseEnter={(e) => e.currentTarget.style.borderColor = "rgba(255,107,53,0.15)"} onMouseLeave={(e) => e.currentTarget.style.borderColor = "rgba(255,255,255,0.04)"}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        {s.logo_url ? <img src={s.logo_url} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: "contain" }} /> : <div style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: 14, color: "rgba(245,245,245,0.1)" }}>{s.store_name?.charAt(0)}</span></div>}
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, textTransform: "uppercase" }}>{s.store_name}</div>
                          <div style={{ fontSize: 11, color: "rgba(245,245,245,0.25)" }}>{s.email}</div>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 16, fontSize: 11, color: "rgba(245,245,245,0.25)" }}>
                        <span>{stats.products} products</span>
                        <span>{stats.orders} orders</span>
                        <span style={{ color: N }}>R{stats.revenue}</span>
                      </div>
                      <span style={{ padding: "4px 12px", borderRadius: 100, fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", background: s.subscription_status === "active" ? "rgba(34,197,94,0.1)" : s.subscription_status === "trial" ? "rgba(251,191,36,0.08)" : "rgba(255,61,110,0.08)", color: s.subscription_status === "active" ? "#22c55e" : s.subscription_status === "trial" ? "#fbbf24" : "#ff3d6e" }}>{s.subscription_status === "active" ? (s.subscription_plan || "starter") : (s.subscription_status || "none")}</span>
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
                  <button onClick={() => setSelectedSeller(null)} style={{ padding: "10px 20px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 100, color: "rgba(245,245,245,0.4)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "uppercase", marginBottom: 24 }}>&larr; All Sellers</button>

                  <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 32 }}>
                    {selectedSeller.logo_url ? <img src={selectedSeller.logo_url} alt="" style={{ width: 56, height: 56, borderRadius: 14, objectFit: "contain" }} /> : <div style={{ width: 56, height: 56, borderRadius: 14, background: "rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: 24, color: "rgba(245,245,245,0.1)" }}>{selectedSeller.store_name?.charAt(0)}</span></div>}
                    <div>
                      <h1 style={{ fontSize: 24, fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.02em" }}>{selectedSeller.store_name}</h1>
                      <div style={{ fontSize: 13, color: "rgba(245,245,245,0.35)" }}>{selectedSeller.email} - {selectedSeller.subdomain}.catalogstore.co.za</div>
                    </div>
                  </div>

                  {/* SELLER STATS */}
                  {(() => {
                    const stats = getSellerStats(selectedSeller.id);
                    return (
                      <div className="admin-stats" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 32 }}>
                        {[{ n: stats.products, l: "Products" }, { n: stats.orders, l: "Orders" }, { n: "R" + stats.revenue, l: "Revenue", c: N }, { n: selectedSeller.subscription_plan || "none", l: "Plan" }, { n: selectedSeller.subscription_status || "none", l: "Status", c: selectedSeller.subscription_status === "active" ? "#22c55e" : selectedSeller.subscription_status === "trial" ? "#fbbf24" : "#ff3d6e" }].map((s, i) => (
                          <div key={i} style={{ padding: "20px 16px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 14 }}>
                            <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: "-0.04em", marginBottom: 4, color: s.c || "#f5f5f5" }}>{s.n}</div>
                            <div style={{ fontSize: 10, color: "rgba(245,245,245,0.25)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>{s.l}</div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  {/* SELLER DETAILS */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 32 }}>
                    <div style={{ padding: 20, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 16 }}>
                      <h3 style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12, color: N }}>Store Info</h3>
                      <div style={{ fontSize: 13, color: "rgba(245,245,245,0.35)", lineHeight: 1.8 }}>
                        <p><strong style={{ color: "#f5f5f5" }}>WhatsApp:</strong> {selectedSeller.whatsapp_number || "N/A"}</p>
                        <p><strong style={{ color: "#f5f5f5" }}>Template:</strong> {selectedSeller.template || "N/A"}</p>
                        <p><strong style={{ color: "#f5f5f5" }}>Tagline:</strong> {selectedSeller.tagline || "N/A"}</p>
                        <p><strong style={{ color: "#f5f5f5" }}>Joined:</strong> {new Date(selectedSeller.created_at).toLocaleDateString()}</p>
                        {selectedSeller.trial_ends_at && <p><strong style={{ color: "#f5f5f5" }}>Trial Ends:</strong> {new Date(selectedSeller.trial_ends_at).toLocaleDateString()}</p>}
                        <p><strong style={{ color: "#f5f5f5" }}>Collections:</strong> {(selectedSeller.collections || []).join(", ") || "None"}</p>
                      </div>
                    </div>
                    <div style={{ padding: 20, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 16 }}>
                      <h3 style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12, color: N }}>Quick Actions</h3>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {selectedSeller.subdomain && <a href={"/store/" + selectedSeller.subdomain} target="_blank" style={{ display: "block", padding: "12px 16px", background: "rgba(255,107,53,0.06)", border: "1px solid rgba(255,107,53,0.12)", borderRadius: 10, color: N, fontSize: 12, fontWeight: 700, textAlign: "center", textDecoration: "none", textTransform: "uppercase", letterSpacing: "0.06em" }}>Visit Store</a>}
                        <button onClick={async () => { const { error } = await supabase.auth.signInWithPassword({ email: selectedSeller.email, password: "" }); if (error) { alert("To impersonate, use Supabase Auth admin API. For now, visit their store directly."); } }} style={{ padding: "12px 16px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, color: "rgba(245,245,245,0.4)", fontSize: 12, fontWeight: 700, textAlign: "center", textTransform: "uppercase", letterSpacing: "0.06em", cursor: "pointer", fontFamily: "'Schibsted Grotesk', sans-serif" }}>Support Access (Coming Soon)</button>
                      </div>
                    </div>
                  </div>

                  {/* SELLER PRODUCTS */}
                  <button onClick={() => setShowSellerProducts(!showSellerProducts)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12, cursor: "pointer", marginBottom: showSellerProducts ? 8 : 32, fontFamily: "'Schibsted Grotesk', sans-serif" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <h3 style={{ fontSize: 14, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em", margin: 0, color: "#f5f5f5" }}>Products</h3>
                      <span style={{ fontSize: 11, color: "rgba(245,245,245,0.25)" }}>({allProducts.filter((p) => p.seller_id === selectedSeller.id && (p.status || "published") !== "trashed").length})</span>
                    </div>
                    <span style={{ fontSize: 14, color: "rgba(245,245,245,0.3)", transition: "transform 0.2s", transform: showSellerProducts ? "rotate(180deg)" : "rotate(0)" }}>{"\u25BC"}</span>
                  </button>
                  {showSellerProducts && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 32 }}>
                    {allProducts.filter((p) => p.seller_id === selectedSeller.id && (p.status || "published") !== "trashed").map((p) => (
                      <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          {p.image_url ? <img src={p.image_url} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: "cover" }} /> : <div style={{ width: 36, height: 36, borderRadius: 6, background: "rgba(255,255,255,0.04)" }} />}
                          <div><div style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase" }}>{p.name}</div><div style={{ fontSize: 11, color: "rgba(245,245,245,0.25)" }}>{p.category || "No collection"} - {p.status || "published"}</div></div>
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 800 }}>R{p.price}</span>
                      </div>
                    ))}
                    {allProducts.filter((p) => p.seller_id === selectedSeller.id && (p.status || "published") !== "trashed").length === 0 && <p style={{ fontSize: 13, color: "rgba(245,245,245,0.2)", padding: "20px 0" }}>No products</p>}
                  </div>
                  )}

                  {/* SELLER ORDERS */}
                  <button onClick={() => setShowSellerOrders(!showSellerOrders)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12, cursor: "pointer", marginBottom: showSellerOrders ? 8 : 0, fontFamily: "'Schibsted Grotesk', sans-serif" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <h3 style={{ fontSize: 14, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em", margin: 0, color: "#f5f5f5" }}>Orders</h3>
                      <span style={{ fontSize: 11, color: "rgba(245,245,245,0.25)" }}>({allOrders.filter((o) => o.seller_id === selectedSeller.id).length})</span>
                    </div>
                    <span style={{ fontSize: 14, color: "rgba(245,245,245,0.3)", transition: "transform 0.2s", transform: showSellerOrders ? "rotate(180deg)" : "rotate(0)" }}>{"\u25BC"}</span>
                  </button>
                  {showSellerOrders && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {allOrders.filter((o) => o.seller_id === selectedSeller.id).map((o) => (
                      <div key={o.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: 10, flexWrap: "wrap", gap: 10 }}>
                        <div><div style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase" }}>#{o.order_number}</div><div style={{ fontSize: 11, color: "rgba(245,245,245,0.25)" }}>{o.customer_name || "Customer"} - {new Date(o.created_at).toLocaleDateString()}</div></div>
                        <div style={{ fontSize: 15, fontWeight: 900 }}>R{o.total}</div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <span style={{ padding: "4px 10px", borderRadius: 100, fontSize: 9, fontWeight: 800, textTransform: "uppercase", background: o.payment_status === "paid" ? "rgba(34,197,94,0.1)" : "rgba(251,191,36,0.08)", color: o.payment_status === "paid" ? "#22c55e" : "#fbbf24" }}>{o.payment_status?.replace("_", " ")}</span>
                          <span style={{ padding: "4px 10px", borderRadius: 100, fontSize: 9, fontWeight: 800, textTransform: "uppercase", background: o.status === "delivered" ? "rgba(34,197,94,0.1)" : "rgba(251,191,36,0.08)", color: o.status === "delivered" ? "#22c55e" : "#fbbf24" }}>{o.status}</span>
                        </div>
                      </div>
                    ))}
                    {allOrders.filter((o) => o.seller_id === selectedSeller.id).length === 0 && <p style={{ fontSize: 13, color: "rgba(245,245,245,0.2)", padding: "20px 0" }}>No orders</p>}
                  </div>
                  )}
                </div>
              ) : (
                <div>
                  <h1 style={{ fontSize: 28, fontWeight: 900, letterSpacing: "-0.04em", textTransform: "uppercase", marginBottom: 4 }}>Sellers</h1>
                  <p style={{ fontSize: 14, color: "rgba(245,245,245,0.35)", marginBottom: 24 }}>All registered sellers on CatalogStore</p>

                  <input type="text" placeholder="Search sellers by name, email, or subdomain..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ width: "100%", maxWidth: 500, padding: "12px 16px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, color: "#f5f5f5", fontSize: 13, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none", marginBottom: 24 }} />

                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {filteredSellers.map((s) => {
                      const stats = getSellerStats(s.id);
                      return (
                        <div key={s.id} onClick={() => { setSelectedSeller(s); setShowSellerProducts(false); setShowSellerOrders(false); }} className="admin-seller-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: 12, cursor: "pointer", flexWrap: "wrap", gap: 12 }} onMouseEnter={(e) => e.currentTarget.style.borderColor = "rgba(255,107,53,0.15)"} onMouseLeave={(e) => e.currentTarget.style.borderColor = "rgba(255,255,255,0.04)"}>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            {s.logo_url ? <img src={s.logo_url} alt="" style={{ width: 40, height: 40, borderRadius: 10, objectFit: "contain" }} /> : <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: 16, fontWeight: 900, color: "rgba(245,245,245,0.1)" }}>{s.store_name?.charAt(0)}</span></div>}
                            <div>
                              <div style={{ fontSize: 14, fontWeight: 700, textTransform: "uppercase" }}>{s.store_name}</div>
                              <div style={{ fontSize: 11, color: "rgba(245,245,245,0.25)" }}>{s.email}</div>
                              {s.subdomain && <div style={{ fontSize: 10, color: "rgba(245,245,245,0.15)" }}>{s.subdomain}.catalogstore.co.za</div>}
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 20, fontSize: 11, color: "rgba(245,245,245,0.25)", alignItems: "center" }}>
                            <span>{stats.products} products</span>
                            <span>{stats.orders} orders</span>
                            <span style={{ color: N, fontWeight: 700 }}>R{stats.revenue}</span>
                            <span style={{ padding: "4px 12px", borderRadius: 100, fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", background: s.subscription_status === "active" ? "rgba(34,197,94,0.1)" : s.subscription_status === "trial" ? "rgba(251,191,36,0.08)" : "rgba(255,61,110,0.08)", color: s.subscription_status === "active" ? "#22c55e" : s.subscription_status === "trial" ? "#fbbf24" : "#ff3d6e" }}>{s.subscription_status === "active" ? (s.subscription_plan || "starter") : (s.subscription_status || "none")}</span>
                          </div>
                          <span style={{ fontSize: 10, color: "rgba(245,245,245,0.15)" }}>Joined {new Date(s.created_at).toLocaleDateString()}</span>
                        </div>
                      );
                    })}
                    {filteredSellers.length === 0 && <p style={{ fontSize: 13, color: "rgba(245,245,245,0.2)", padding: "40px 0", textAlign: "center" }}>No sellers found</p>}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ORDERS */}
          {tab === "orders" && (
            <div>
              <h1 style={{ fontSize: 28, fontWeight: 900, letterSpacing: "-0.04em", textTransform: "uppercase", marginBottom: 4 }}>All Orders</h1>
              <p style={{ fontSize: 14, color: "rgba(245,245,245,0.35)", marginBottom: 24 }}>Orders across all stores on the platform</p>

              <div style={{ display: "flex", gap: 6, marginBottom: 24, flexWrap: "wrap" }}>
                {[{ k: "all", l: "All" }, { k: "awaiting_payment", l: "Awaiting" }, { k: "paid", l: "Paid" }, { k: "refunded", l: "Refunded" }].map((f) => (
                  <button key={f.k} onClick={() => setOrderFilter(f.k)} style={{ padding: "8px 18px", borderRadius: 100, background: orderFilter === f.k ? "rgba(255,107,53,0.08)" : "rgba(255,255,255,0.02)", border: orderFilter === f.k ? "1px solid rgba(255,107,53,0.15)" : "1px solid rgba(255,255,255,0.06)", color: orderFilter === f.k ? N : "rgba(245,245,245,0.35)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" }}>{f.l} ({f.k === "all" ? allOrders.length : allOrders.filter((o) => o.payment_status === f.k).length})</button>
                ))}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {filteredOrders.map((o) => (
                  <div key={o.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: 12, flexWrap: "wrap", gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase" }}>#{o.order_number} - {getSellerName(o.seller_id)}</div>
                      <div style={{ fontSize: 11, color: "rgba(245,245,245,0.25)" }}>{o.customer_name || "Customer"} - {o.customer_email || ""} - {new Date(o.created_at).toLocaleString()}</div>
                      <div style={{ fontSize: 10, color: "rgba(245,245,245,0.15)", marginTop: 2 }}>{o.payment_method || "N/A"} - {o.fulfillment_method || "delivery"}</div>
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 900 }}>R{o.total}</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <span style={{ padding: "5px 10px", borderRadius: 100, fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em", background: o.payment_status === "paid" ? "rgba(34,197,94,0.1)" : o.payment_status === "refunded" ? "rgba(255,61,110,0.1)" : "rgba(251,191,36,0.08)", color: o.payment_status === "paid" ? "#22c55e" : o.payment_status === "refunded" ? "#ff3d6e" : "#fbbf24" }}>{o.payment_status?.replace("_", " ")}</span>
                      <span style={{ padding: "5px 10px", borderRadius: 100, fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em", background: o.status === "delivered" ? "rgba(34,197,94,0.1)" : o.status === "cancelled" ? "rgba(255,61,110,0.1)" : o.status === "shipped" ? "rgba(37,99,235,0.1)" : "rgba(251,191,36,0.08)", color: o.status === "delivered" ? "#22c55e" : o.status === "cancelled" ? "#ff3d6e" : o.status === "shipped" ? "#2563eb" : "#fbbf24" }}>{o.status}</span>
                    </div>
                  </div>
                ))}
                {filteredOrders.length === 0 && <p style={{ fontSize: 13, color: "rgba(245,245,245,0.2)", padding: "40px 0", textAlign: "center" }}>No orders found</p>}
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}