"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Helpers
const fromCents = (c: number) => (c / 100).toFixed(0);
const formatR = (cents: number) =>
  `R${(cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

type Affiliate = {
  id: string;
  slug: string;
  fullName: string;
  email: string;
  availableBalance: number;
  totalEarned: number;
  totalPaidOut: number;
  bankName: string | null;
  accountNumber: string | null;
};

type Referral = {
  id: string;
  seller_id: string;
  referred_at: string;
  payments_counted: number;
  total_earned_from_seller: number;
  status: "trial" | "active" | "past_due" | "disconnected";
  sellers: { store_name?: string; email?: string; slug?: string } | null;
};

type Withdrawal = {
  id: string;
  amount: number;
  status: string;
  requested_at: string;
  paid_at: string | null;
  bank_snapshot: any;
};

type Stats = {
  totalReferred: number;
  activePaying: number;
  inTrial: number;
  conversionRate: number;
};

export default function AffiliateDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [affiliate, setAffiliate] = useState<Affiliate | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [tab, setTab] = useState<"all" | "active" | "trial">("all");
  const [toast, setToast] = useState("");

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push("/affiliate/login");
        return;
      }

      const res = await fetch("/api/affiliate/me", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 404) {
          // User is logged in but not an affiliate
          router.push("/affiliate/signup");
          return;
        }
        throw new Error(data.error || "Failed to load");
      }

      setAffiliate(data.affiliate);
      setReferrals(data.referrals);
      setWithdrawals(data.withdrawals);
      setStats(data.stats);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 2200);
  }

  async function copyLink() {
    if (!affiliate) return;
    const link = `https://catalogstore.co.za/?ref=${affiliate.slug}`;
    try {
      await navigator.clipboard.writeText(link);
      showToast("Link copied");
    } catch {
      showToast("Copy failed");
    }
  }

  async function handleWithdraw() {
    if (!affiliate) return;
    if (affiliate.availableBalance < 15000) {
      showToast(`Need at least R150 to withdraw`);
      return;
    }
    if (!confirm(`Request withdrawal of ${formatR(affiliate.availableBalance)}?`)) return;
    showToast("Withdrawal feature coming soon");
    // TODO: wire up withdrawal request endpoint
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/affiliate/login");
  }

  if (loading) {
    return (
      <div style={styles.loading}>
        <div style={styles.spinner} />
      </div>
    );
  }

  if (error || !affiliate) {
    return (
      <div style={styles.loading}>
        <div style={{ textAlign: "center", color: "rgba(245,245,245,0.6)" }}>
          <div style={{ marginBottom: 12 }}>{error || "Could not load dashboard"}</div>
          <button onClick={() => router.push("/affiliate/signup")} style={styles.btnSecondary}>
            Sign up as affiliate
          </button>
        </div>
      </div>
    );
  }

  const filteredReferrals = referrals.filter((r) => {
    if (tab === "all") return true;
    if (tab === "active") return r.status === "active";
    if (tab === "trial") return r.status === "trial";
    return true;
  });

  const firstName = affiliate.fullName.split(" ")[0];
  const initials = affiliate.fullName
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const canWithdraw = affiliate.availableBalance >= 15000;

  return (
    <div style={styles.page}>
      <div style={styles.atmosphere} />

      {/* NAV */}
      <nav style={styles.nav}>
        <div style={styles.navLogo}>
          <svg viewBox="0 0 24 24" fill="none" style={{ width: 20, height: 20 }}>
            <path
              d="M22 12C22 6.48 17.52 2 12 2S2 6.48 2 12s4.48 10 10 10c2.83 0 5.39-1.18 7.21-3.07l-2.13-2.13A6.99 6.99 0 0 1 12 19c-3.86 0-7-3.14-7-7s3.14-7 7-7 7 3.14 7 7h-3l4 4 4-4h-3z"
              fill="url(#g)"
            />
            <defs>
              <linearGradient id="g" x1="0" y1="0" x2="24" y2="24">
                <stop offset="0" stopColor="#ff6b35" />
                <stop offset="1" stopColor="#ff3d6e" />
              </linearGradient>
            </defs>
          </svg>
          Catalog<span style={styles.navLogoAccent}>Store</span>
          <span style={styles.navPill}>Affiliate</span>
        </div>
        <button onClick={signOut} style={styles.navAvatar} title={affiliate.fullName}>
          {initials}
        </button>
      </nav>

      <main style={styles.main}>
        {/* HEADER */}
        <div style={styles.ph}>
          <div style={styles.phGreet}>Welcome back</div>
          <h1 style={styles.phTitle}>
            Hey <em style={styles.phTitleEm}>{firstName}</em>
          </h1>
          <div style={styles.phSub}>
            {stats && stats.activePaying > 0 ? (
              <>
                You're earning from <strong style={{ color: "#fff" }}>{stats.activePaying} seller{stats.activePaying === 1 ? "" : "s"}</strong>.
              </>
            ) : (
              <>Share your link below to start earning <strong style={{ color: "#fff" }}>50%</strong> per seller.</>
            )}
          </div>
        </div>

        {/* HERO */}
        <section style={styles.hero}>
          <div style={styles.heroLabel}>
            <span style={styles.heroDot} />
            Earnings · all time
          </div>
          <div style={styles.heroAmount}>
            <span style={styles.heroCurrency}>R</span>
            {fromCents(affiliate.totalEarned).toLocaleString()}
          </div>
          <div style={styles.heroMeta}>
            {stats && stats.activePaying > 0
              ? `${stats.activePaying} active seller${stats.activePaying === 1 ? "" : "s"} paying you monthly.`
              : `Once your referrals start paying, your earnings grow here.`}
          </div>

          <button
            onClick={handleWithdraw}
            style={{
              ...styles.withdrawBtn,
              ...(canWithdraw ? {} : styles.withdrawBtnDisabled),
            }}
            disabled={!canWithdraw}
          >
            {canWithdraw
              ? `Withdraw ${formatR(affiliate.availableBalance)}`
              : `R${fromCents(affiliate.availableBalance)} available · min R150`}
          </button>

          <div style={styles.progressRow}>
            <span style={styles.progressLabel}>Available</span>
            <span style={styles.progressText}>
              {formatR(affiliate.availableBalance)}
              <span style={styles.progressTarget}>
                {" "}· min R150 {canWithdraw ? "✓" : ""}
              </span>
            </span>
          </div>
        </section>

        {/* REFERRAL LINK */}
        <section style={styles.refCard}>
          <div style={styles.refTitle}>Your referral link</div>
          <p style={styles.refSub}>
            Share anywhere. Sellers earn you <strong style={{ color: "#fff" }}>50%</strong> for 6 months.
          </p>

          <div style={styles.refLinkInput}>
            <span style={styles.refLinkText}>
              <span style={styles.refLinkDomain}>catalogstore.co.za/?ref=</span>
              {affiliate.slug}
            </span>
            <button onClick={copyLink} style={styles.copyBtn} aria-label="Copy link">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </button>
          </div>

          <div style={styles.shareRow}>
            <button
              style={styles.shareBtn}
              onClick={() => {
                const msg = encodeURIComponent(
                  `Want to set up a beautiful online store from your WhatsApp catalog? Check out CatalogStore: https://catalogstore.co.za/?ref=${affiliate.slug}`
                );
                window.open(`https://wa.me/?text=${msg}`, "_blank");
              }}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 16, height: 16 }}>
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884" />
              </svg>
              WhatsApp
            </button>
            <button
              style={styles.shareBtn}
              onClick={() => {
                const caption = `Set up your online store from your WhatsApp catalog 👀\n\ncatalogstore.co.za/?ref=${affiliate.slug}`;
                navigator.clipboard.writeText(caption);
                showToast("Caption copied");
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 16, height: 16 }}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              Caption
            </button>
            <button style={styles.shareBtn} onClick={copyLink}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 16, height: 16 }}>
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              Copy
            </button>
            <button style={styles.shareBtn} onClick={() => showToast("QR code coming soon")}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 16, height: 16 }}>
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
                <line x1="14" y1="17" x2="21" y2="17" />
              </svg>
              QR
            </button>
          </div>
        </section>

        {/* STATS */}
        <section style={styles.stats}>
          <div style={styles.stat}>
            <div style={styles.statLabel}>Referred</div>
            <div style={styles.statValue}>{stats?.totalReferred || 0}</div>
          </div>
          <div style={styles.stat}>
            <div style={styles.statLabel}>Paying</div>
            <div style={styles.statValue}>{stats?.activePaying || 0}</div>
          </div>
          <div style={styles.stat}>
            <div style={styles.statLabel}>Conversion</div>
            <div style={styles.statValue}>
              {stats?.conversionRate || 0}
              <span style={styles.statSmall}>%</span>
            </div>
          </div>
          <div style={styles.stat}>
            <div style={styles.statLabel}>Avg / seller</div>
            <div style={styles.statValue}>
              <span style={styles.statSmall}>R</span>147
            </div>
          </div>
        </section>

        {/* SELLERS LIST */}
        <div style={styles.sectionHead}>
          <div style={styles.sectionTitle}>
            Your sellers
            <span style={styles.sectionCount}>
              {String(referrals.length).padStart(2, "0")}
            </span>
          </div>
          <div style={styles.sectionTabs}>
            {(["all", "active", "trial"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  ...styles.sectionTab,
                  ...(tab === t ? styles.sectionTabActive : {}),
                }}
              >
                {t === "all" ? "All" : t === "active" ? "Paying" : "Trial"}
              </button>
            ))}
          </div>
        </div>

        <section style={styles.sellers}>
          {filteredReferrals.length === 0 ? (
            <div style={styles.empty}>
              <div style={styles.emptyIcon}>✦</div>
              <div style={styles.emptyTitle}>
                {referrals.length === 0
                  ? "No referrals yet"
                  : `No ${tab === "active" ? "paying" : "trial"} sellers`}
              </div>
              <div style={styles.emptySub}>
                {referrals.length === 0
                  ? "Share your link with sellers to start earning."
                  : "Try a different filter to see more."}
              </div>
            </div>
          ) : (
            filteredReferrals.map((r, i) => {
              const colors = ["s1", "s2", "s3", "s4", "s5"];
              const colorClass = colors[i % colors.length];
              const sellerName =
                r.sellers?.store_name || r.sellers?.email?.split("@")[0] || "Seller";
              const sellerInitials = sellerName.slice(0, 2).toUpperCase();
              const fillPct = (r.payments_counted / 6) * 100;

              return (
                <div key={r.id} style={styles.seller}>
                  <div
                    style={{
                      ...styles.sAvatar,
                      ...avatarColors[colorClass as keyof typeof avatarColors],
                    }}
                  >
                    {sellerInitials}
                  </div>
                  <div style={styles.sMain}>
                    <div style={styles.sTopRow}>
                      <div style={styles.sName}>{sellerName}</div>
                      <div
                        style={{
                          ...styles.sEarned,
                          ...(r.total_earned_from_seller === 0 ? styles.sEarnedZero : {}),
                        }}
                      >
                        <span style={styles.sCurrency}>R</span>
                        {fromCents(r.total_earned_from_seller)}
                      </div>
                    </div>
                    <div style={styles.sBottomRow}>
                      <span style={getBadgeStyle(r.status)}>
                        <span style={styles.sBadgeDot} />
                        {getBadgeLabel(r.status)}
                      </span>
                      <div style={styles.sWindow}>
                        {r.payments_counted > 0 && (
                          <div style={styles.sWindowBar}>
                            <div
                              style={{ ...styles.sWindowFill, width: `${fillPct}%` }}
                            />
                          </div>
                        )}
                        <span style={styles.sWindowText}>
                          {r.status === "active"
                            ? `${r.payments_counted}/6 mo`
                            : r.status === "trial"
                            ? "Starts on convert"
                            : r.status === "disconnected"
                            ? "Ended"
                            : ""}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </section>

        {/* WITHDRAWALS */}
        {withdrawals.length > 0 && (
          <>
            <div style={styles.sectionHead}>
              <div style={styles.sectionTitle}>
                Withdrawals
                <span style={styles.sectionCount}>
                  {String(withdrawals.length).padStart(2, "0")}
                </span>
              </div>
            </div>
            <section style={styles.history}>
              {withdrawals.map((w) => (
                <div key={w.id} style={styles.hRow}>
                  <div
                    style={{
                      ...styles.hIcon,
                      ...(w.status === "paid" ? {} : styles.hIconPending),
                    }}
                  >
                    {w.status === "paid" ? "✓" : "⏱"}
                  </div>
                  <div style={styles.hInfo}>
                    <div style={styles.hTop}>
                      <div style={styles.hAmt}>
                        <span style={styles.hCurrency}>R</span>
                        {fromCents(w.amount)}
                      </div>
                      <div
                        style={{
                          ...styles.hStatus,
                          ...(w.status === "paid" ? styles.hStatusPaid : styles.hStatusPending),
                        }}
                      >
                        {w.status}
                      </div>
                    </div>
                    <div style={styles.hBottom}>
                      <span>
                        {w.bank_snapshot?.bank_name || "Bank"} ····
                        {w.bank_snapshot?.account_number?.slice(-4) || "----"}
                      </span>
                      <span>
                        {new Date(w.requested_at).toLocaleDateString("en-ZA", {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </section>
          </>
        )}
      </main>

      {/* TOAST */}
      {toast && <div style={styles.toast}>✓ {toast}</div>}
    </div>
  );
}

// ─── STYLE HELPERS ──────────────────────────────────────
const avatarColors = {
  s1: { background: "linear-gradient(135deg,#ff6b35,#ff3d6e)" },
  s2: { background: "linear-gradient(135deg,#3b82f6,#8b5cf6)" },
  s3: { background: "linear-gradient(135deg,#22c55e,#10b981)" },
  s4: { background: "linear-gradient(135deg,#a855f7,#ec4899)" },
  s5: { background: "linear-gradient(135deg,#f59e0b,#ef4444)" },
};

function getBadgeStyle(status: string): React.CSSProperties {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 10,
    fontWeight: 700,
    padding: "3px 8px",
    borderRadius: 100,
  };
  if (status === "active")
    return {
      ...base,
      background: "rgba(34,197,94,0.1)",
      color: "#22c55e",
      border: "1px solid rgba(34,197,94,0.2)",
    };
  if (status === "trial")
    return {
      ...base,
      background: "rgba(255,107,53,0.1)",
      color: "#ff6b35",
      border: "1px solid rgba(255,107,53,0.2)",
    };
  return {
    ...base,
    background: "rgba(255,255,255,0.04)",
    color: "rgba(245,245,245,0.32)",
    border: "1px solid rgba(255,255,255,0.06)",
  };
}

function getBadgeLabel(status: string) {
  if (status === "active") return "Paying";
  if (status === "trial") return "Trial";
  if (status === "past_due") return "Past due";
  return "Disconnected";
}

// ─── STYLES ─────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#08080c",
    color: "#f5f5f5",
    fontFamily: "'Schibsted Grotesk', sans-serif",
    position: "relative",
    overflowX: "hidden",
  },
  atmosphere: {
    position: "fixed",
    inset: 0,
    background:
      "radial-gradient(ellipse 80% 40% at 50% -10%,rgba(255,107,53,0.08) 0%,transparent 60%),radial-gradient(ellipse 60% 30% at 0% 30%,rgba(255,61,110,0.04) 0%,transparent 60%)",
    pointerEvents: "none",
    zIndex: 0,
  },
  loading: {
    minHeight: "100vh",
    background: "#08080c",
    color: "#f5f5f5",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'Schibsted Grotesk', sans-serif",
  },
  spinner: {
    width: 32,
    height: 32,
    border: "3px solid rgba(255,107,53,0.2)",
    borderTopColor: "#ff6b35",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  nav: {
    position: "sticky",
    top: 0,
    zIndex: 50,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 18px",
    background: "rgba(8,8,12,0.85)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
  },
  navLogo: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: "-0.02em",
    textTransform: "uppercase",
  },
  navLogoAccent: {
    background: "linear-gradient(135deg,#ff6b35,#ff3d6e)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
  },
  navPill: {
    fontSize: 8,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    fontWeight: 700,
    color: "#ff6b35",
    background: "rgba(255,107,53,0.08)",
    border: "1px solid rgba(255,107,53,0.18)",
    padding: "3px 8px",
    borderRadius: 100,
    marginLeft: 4,
  },
  navAvatar: {
    width: 30,
    height: 30,
    borderRadius: "50%",
    background: "linear-gradient(135deg,#ff6b35,#ff3d6e)",
    border: "1px solid rgba(255,255,255,0.1)",
    color: "#fff",
    fontSize: 10,
    fontWeight: 800,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  main: { position: "relative", zIndex: 1, maxWidth: 520, margin: "0 auto", padding: "20px 18px 100px" },
  ph: { marginBottom: 20 },
  phGreet: {
    fontSize: 10,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    color: "rgba(245,245,245,0.32)",
    marginBottom: 4,
    fontWeight: 600,
  },
  phTitle: { fontSize: 32, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1, marginBottom: 8 },
  phTitleEm: {
    fontStyle: "normal",
    background: "linear-gradient(135deg,#ff6b35,#ff3d6e)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    fontWeight: 900,
  },
  phSub: { fontSize: 13, color: "rgba(245,245,245,0.55)", lineHeight: 1.5 },
  hero: {
    position: "relative",
    background: "#0e0e14",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 20,
    padding: 22,
    marginBottom: 14,
    overflow: "hidden",
  },
  heroLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    fontSize: 9,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    fontWeight: 700,
    color: "#ff6b35",
    background: "rgba(255,107,53,0.08)",
    border: "1px solid rgba(255,107,53,0.15)",
    padding: "5px 11px",
    borderRadius: 100,
    marginBottom: 14,
  },
  heroDot: { width: 5, height: 5, borderRadius: "50%", background: "#ff6b35", boxShadow: "0 0 8px #ff6b35" },
  heroAmount: {
    fontSize: 64,
    fontWeight: 900,
    lineHeight: 0.92,
    letterSpacing: "-0.04em",
    background: "linear-gradient(135deg,#fff 0%,#ff6b35 70%,#ff3d6e 100%)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    marginBottom: 6,
  },
  heroCurrency: { fontSize: "0.5em", fontWeight: 600, color: "rgba(245,245,245,0.32)", WebkitTextFillColor: "rgba(245,245,245,0.32)", marginRight: 3 },
  heroMeta: { fontSize: 13, color: "rgba(245,245,245,0.55)", lineHeight: 1.5, marginBottom: 18 },
  withdrawBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
    padding: 15,
    borderRadius: 14,
    background: "linear-gradient(135deg,#ff6b35,#ff3d6e)",
    color: "#fff",
    border: "none",
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    boxShadow: "0 0 0 1px rgba(255,255,255,0.1) inset, 0 12px 32px rgba(255,107,53,0.25)",
  },
  withdrawBtnDisabled: {
    background: "rgba(255,255,255,0.04)",
    color: "rgba(245,245,245,0.32)",
    boxShadow: "none",
    cursor: "not-allowed",
  },
  progressRow: { display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)" },
  progressLabel: { fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 600, color: "rgba(245,245,245,0.32)" },
  progressText: { fontSize: 11, color: "#f5f5f5", fontWeight: 700 },
  progressTarget: { color: "rgba(245,245,245,0.32)", fontWeight: 500 },
  refCard: { background: "#0e0e14", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 20, padding: 22, marginBottom: 14 },
  refTitle: { fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 4 },
  refSub: { fontSize: 12, color: "rgba(245,245,245,0.55)", marginBottom: 16, lineHeight: 1.5 },
  refLinkInput: {
    display: "flex",
    alignItems: "center",
    background: "#08080c",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 12,
    padding: "6px 6px 6px 14px",
    gap: 8,
  },
  refLinkText: {
    flex: 1,
    fontSize: 12,
    fontWeight: 600,
    color: "#f5f5f5",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    padding: "8px 0",
  },
  refLinkDomain: { color: "rgba(245,245,245,0.32)", fontWeight: 500 },
  copyBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 36,
    height: 36,
    background: "linear-gradient(135deg,#ff6b35,#ff3d6e)",
    border: "none",
    borderRadius: 8,
    color: "#fff",
    cursor: "pointer",
    flexShrink: 0,
  },
  shareRow: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginTop: 12 },
  shareBtn: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 5,
    padding: "10px 4px",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 10,
    color: "rgba(245,245,245,0.55)",
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: "0.04em",
  },
  stats: { display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10, marginBottom: 14 },
  stat: { background: "#0e0e14", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: 16 },
  statLabel: { fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 600, color: "rgba(245,245,245,0.32)", marginBottom: 10 },
  statValue: { fontSize: 30, fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1, color: "#f5f5f5" },
  statSmall: { fontSize: "0.55em", color: "rgba(245,245,245,0.32)", fontWeight: 600 },
  sectionHead: { display: "flex", alignItems: "center", justifyContent: "space-between", margin: "24px 0 10px" },
  sectionTitle: { fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em", display: "flex", alignItems: "baseline", gap: 8 },
  sectionCount: { fontSize: 11, color: "rgba(245,245,245,0.32)", fontWeight: 600 },
  sectionTabs: { display: "flex", gap: 3, background: "#0e0e14", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 100, padding: 3 },
  sectionTab: {
    padding: "5px 10px",
    fontSize: 10,
    fontWeight: 700,
    color: "rgba(245,245,245,0.32)",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    borderRadius: 100,
    fontFamily: "inherit",
  },
  sectionTabActive: { background: "rgba(255,255,255,0.06)", color: "#f5f5f5" },
  sellers: { background: "#0e0e14", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 18, overflow: "hidden" },
  empty: { padding: "32px 20px", textAlign: "center" },
  emptyIcon: { fontSize: 32, color: "#ff6b35", marginBottom: 10, opacity: 0.5 },
  emptyTitle: { fontSize: 14, fontWeight: 700, marginBottom: 4 },
  emptySub: { fontSize: 12, color: "rgba(245,245,245,0.55)" },
  seller: {
    display: "flex",
    alignItems: "center",
    padding: "14px 16px",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    gap: 12,
  },
  sAvatar: {
    width: 40,
    height: 40,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontWeight: 800,
    color: "#fff",
    flexShrink: 0,
  },
  sMain: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 },
  sTopRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 },
  sName: { fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  sEarned: { fontSize: 14, fontWeight: 800, whiteSpace: "nowrap", flexShrink: 0 },
  sEarnedZero: { color: "rgba(245,245,245,0.32)", fontWeight: 600 },
  sCurrency: { fontSize: "0.7em", color: "rgba(245,245,245,0.32)", fontWeight: 600, marginRight: 1 },
  sBottomRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 },
  sBadgeDot: { width: 4, height: 4, borderRadius: "50%", background: "currentColor" },
  sWindow: { flex: 1, display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "rgba(245,245,245,0.32)", fontWeight: 600 },
  sWindowBar: { flex: 1, height: 3, background: "rgba(255,255,255,0.05)", borderRadius: 100, overflow: "hidden" },
  sWindowFill: { height: "100%", background: "linear-gradient(135deg,#ff6b35,#ff3d6e)", borderRadius: 100 },
  sWindowText: { whiteSpace: "nowrap", flexShrink: 0 },
  history: { background: "#0e0e14", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 18, overflow: "hidden" },
  hRow: {
    display: "flex",
    alignItems: "center",
    padding: "14px 16px",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    gap: 12,
  },
  hIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    background: "rgba(34,197,94,0.08)",
    border: "1px solid rgba(34,197,94,0.15)",
    color: "#22c55e",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    fontSize: 14,
    fontWeight: 800,
  },
  hIconPending: { background: "rgba(255,107,53,0.08)", borderColor: "rgba(255,107,53,0.15)", color: "#ff6b35" },
  hInfo: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 },
  hTop: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 },
  hAmt: { fontSize: 15, fontWeight: 800, letterSpacing: "-0.02em" },
  hCurrency: { fontSize: "0.65em", color: "rgba(245,245,245,0.32)", fontWeight: 600, marginRight: 1 },
  hStatus: { fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", padding: "3px 8px", borderRadius: 100, border: "1px solid", flexShrink: 0 },
  hStatusPaid: { color: "#22c55e", borderColor: "rgba(34,197,94,0.2)", background: "rgba(34,197,94,0.08)" },
  hStatusPending: { color: "#ff6b35", borderColor: "rgba(255,107,53,0.2)", background: "rgba(255,107,53,0.08)" },
  hBottom: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 11, color: "rgba(245,245,245,0.32)", fontWeight: 500 },
  toast: {
    position: "fixed",
    bottom: 24,
    left: "50%",
    transform: "translateX(-50%)",
    background: "rgba(20,20,28,0.96)",
    backdropFilter: "blur(16px)",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "#f5f5f5",
    padding: "11px 18px",
    borderRadius: 100,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.04em",
    boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
    zIndex: 1000,
  },
  btnSecondary: {
    padding: "12px 20px",
    background: "rgba(255,255,255,0.04)",
    color: "#f5f5f5",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 12,
    fontFamily: "inherit",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  },
};
