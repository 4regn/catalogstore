"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";

// Helpers
const fromCents = (c: number) => (c / 100).toFixed(0);

// Light/dark theme — same role names as the main dashboard's THEME map,
// scoped to this page's own CSS custom properties so its hardcoded dark
// styles object can flip without a full rewrite of every inline color.
const AFFILIATE_THEME = {
  dark: {
    "--a-bg": "#08080c", "--a-card": "#0e0e14",
    "--a-border": "rgba(255,255,255,0.06)", "--a-border-md": "rgba(255,255,255,0.08)",
    "--a-border-strong": "rgba(255,255,255,0.1)", "--a-border-strong2": "rgba(255,255,255,0.12)",
    "--a-text": "#f5f5f5", "--a-text-2": "rgba(245,245,245,0.55)",
    "--a-muted": "rgba(245,245,245,0.32)", "--a-muted-2": "rgba(245,245,245,0.4)",
    "--a-input": "rgba(255,255,255,0.04)", "--a-input-strong": "#08080c",
    "--a-hover": "rgba(255,255,255,0.06)", "--a-nav": "rgba(8,8,12,0.85)",
    "--a-tooltip": "#181820", "--a-tooltip-border": "rgba(255,255,255,0.12)",
    "--a-chart-grid": "rgba(255,255,255,0.05)", "--a-chart-axis": "rgba(245,245,245,0.3)",
    "--a-atmosphere-2": "rgba(255,61,110,0.04)",
  },
  light: {
    "--a-bg": "#f5f5f6", "--a-card": "#ffffff",
    "--a-border": "rgba(0,0,0,0.08)", "--a-border-md": "rgba(0,0,0,0.1)",
    "--a-border-strong": "rgba(0,0,0,0.12)", "--a-border-strong2": "rgba(0,0,0,0.14)",
    "--a-text": "#131316", "--a-text-2": "rgba(19,19,22,0.65)",
    "--a-muted": "rgba(19,19,22,0.42)", "--a-muted-2": "rgba(19,19,22,0.52)",
    "--a-input": "rgba(0,0,0,0.035)", "--a-input-strong": "#eeede9",
    "--a-hover": "rgba(0,0,0,0.05)", "--a-nav": "rgba(245,245,246,0.85)",
    "--a-tooltip": "#ffffff", "--a-tooltip-border": "rgba(0,0,0,0.1)",
    "--a-chart-grid": "rgba(0,0,0,0.07)", "--a-chart-axis": "rgba(19,19,22,0.4)",
    "--a-atmosphere-2": "rgba(255,61,110,0.05)",
  },
} as const;
const affiliateThemeVars = (t: keyof typeof AFFILIATE_THEME) =>
  Object.entries(AFFILIATE_THEME[t]).map(([k, v]) => `${k}:${v};`).join("");

const SA_BANKS = [
  { name: "FNB", branch: "250655" },
  { name: "Standard Bank", branch: "051001" },
  { name: "Absa", branch: "632005" },
  { name: "Capitec", branch: "470010" },
  { name: "Nedbank", branch: "198765" },
  { name: "TymeBank", branch: "678910" },
  { name: "Discovery Bank", branch: "679000" },
  { name: "African Bank", branch: "430000" },
  { name: "Investec", branch: "580105" },
  { name: "Bidvest Bank", branch: "462005" },
];

/* Commission policy lives here, not sprinkled as magic numbers. */
const COMMISSION_MONTHS = 6;
const MIN_WITHDRAW_CENTS = 15000; // R150
const MIN_WITHDRAW_R = MIN_WITHDRAW_CENTS / 100;
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
  accountHolder: string | null;
  accountType: "cheque" | "savings" | null;
  branchCode: string | null;
  photoUrl: string | null;
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

  const [theme, setTheme] = useState<"dark" | "light">("dark");
  useEffect(() => {
    const saved = localStorage.getItem("cs_affiliate_theme");
    if (saved === "light" || saved === "dark") setTheme(saved);
  }, []);
  const toggleTheme = () => setTheme((t) => { const next = t === "dark" ? "light" : "dark"; localStorage.setItem("cs_affiliate_theme", next); return next; });
  const [affiliate, setAffiliate] = useState<Affiliate | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [tab, setTab] = useState<"all" | "active" | "trial">("all");
  const [toast, setToast] = useState("");

  // Earnings graph
  const [earningsRange, setEarningsRange] = useState<"7" | "30" | "custom">("30");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [earningsPoints, setEarningsPoints] = useState<{ date: string; cents: number }[]>([]);
  const [earningsLoading, setEarningsLoading] = useState(false);
  const [hoverPoint, setHoverPoint] = useState<{ date: string; cents: number; x: number; y: number } | null>(null);

  // Profile popover — photo, name, log out
  const [showProfile, setShowProfile] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState("");

  // Inline referral-code editing on the main page (mirrors the Settings modal)
  const [editingCodeInline, setEditingCodeInline] = useState(false);

  // Settings modal — referral code + banking details
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"code" | "banking">("code");
  const [slugInput, setSlugInput] = useState("");
  const [slugStatus, setSlugStatus] = useState<"idle" | "checking" | "available" | "taken" | "unchanged">("idle");
  const [slugTimer, setSlugTimer] = useState<NodeJS.Timeout | null>(null);
  const [savingSlug, setSavingSlug] = useState(false);
  const [bankName, setBankName] = useState(SA_BANKS[0].name);
  const [accountNumber, setAccountNumber] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [accountType, setAccountType] = useState<"cheque" | "savings">("cheque");
  const [savingBanking, setSavingBanking] = useState(false);
  const [settingsError, setSettingsError] = useState("");

  useEffect(() => {
    loadDashboard();
  }, []);

  useEffect(() => {
    if (!affiliate) return;
    setSlugInput(affiliate.slug);
    setBankName(affiliate.bankName || SA_BANKS[0].name);
    setAccountNumber(affiliate.accountNumber || "");
    setAccountHolder(affiliate.accountHolder || "");
    setAccountType(affiliate.accountType || "cheque");
    const nameParts = affiliate.fullName.trim().split(/\s+/);
    setEditFirstName(nameParts[0] || "");
    setEditLastName(nameParts.slice(1).join(" "));
  }, [affiliate]);

  async function saveName() {
    if (!affiliate) return;
    const combined = `${editFirstName.trim()} ${editLastName.trim()}`.trim();
    if (!combined) { setNameError("Enter at least a first name"); return; }
    setSavingName(true);
    setNameError("");
    try {
      const res = await authedFetch("/api/affiliate/me", { method: "PATCH", body: JSON.stringify({ fullName: combined }) });
      const data = await res.json();
      if (!res.ok) { setNameError(data.error || "Could not save name"); return; }
      setAffiliate({ ...affiliate, fullName: combined });
      showToast("Name updated");
    } catch {
      setNameError("Network error — please try again");
    } finally {
      setSavingName(false);
    }
  }

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

  /* Derive the public origin from the current page (so staging / preview
     deploys generate working referral links) and fall back to the production
     domain only as a last resort. */
  const appOrigin = (typeof window !== "undefined" && window.location.origin)
    || process.env.NEXT_PUBLIC_APP_URL
    || "https://catalogstore.co.za";
  const refLink = (slug: string) => `${appOrigin}/?ref=${slug}`;

  async function copyLink() {
    if (!affiliate) return;
    try {
      await navigator.clipboard.writeText(refLink(affiliate.slug));
      showToast("Link copied");
    } catch {
      showToast("Copy failed — link unavailable in this browser");
    }
  }

  async function handleWithdraw() {
    if (!affiliate) return;
    if (affiliate.availableBalance < MIN_WITHDRAW_CENTS) {
      showToast(`Need at least R${MIN_WITHDRAW_R} to withdraw`);
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

  function handleSlugChange(value: string) {
    const cleaned = value.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32);
    setSlugInput(cleaned);
    setSlugStatus("idle");
    if (slugTimer) clearTimeout(slugTimer);
    if (!affiliate) return;
    if (cleaned === affiliate.slug) { setSlugStatus("unchanged"); return; }
    if (cleaned.length >= 2) {
      setSlugStatus("checking");
      const t = setTimeout(async () => {
        const { data } = await supabase
          .from("affiliate_public_profile")
          .select("slug")
          .eq("slug", cleaned)
          .maybeSingle();
        setSlugStatus(data ? "taken" : "available");
      }, 400);
      setSlugTimer(t);
    }
  }

  useEffect(() => {
    if (!affiliate) return;
    if (earningsRange === "custom" && (!customFrom || !customTo)) return;
    (async () => {
      setEarningsLoading(true);
      try {
        const params = earningsRange === "custom"
          ? `from=${customFrom}&to=${customTo}`
          : `range=${earningsRange}`;
        const res = await authedFetch(`/api/affiliate/earnings?${params}`);
        if (res.ok) {
          const data = await res.json();
          setEarningsPoints(data.points || []);
        }
      } catch { /* keep last-known points on network hiccup */ }
      setEarningsLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [affiliate, earningsRange, customFrom, customTo]);

  async function authedFetch(path: string, init: RequestInit = {}) {
    const { data: { session } } = await supabase.auth.getSession();
    return fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token || ""}`,
        ...(init.headers || {}),
      },
    });
  }

  async function saveSlug(): Promise<boolean> {
    if (!affiliate || slugStatus === "taken" || slugInput.length < 2) return false;
    if (slugInput === affiliate.slug) return true;
    setSavingSlug(true);
    setSettingsError("");
    try {
      const res = await authedFetch("/api/affiliate/me", {
        method: "PATCH",
        body: JSON.stringify({ slug: slugInput }),
      });
      const data = await res.json();
      if (!res.ok) { setSettingsError(data.error || "Could not save referral code"); return false; }
      setAffiliate({ ...affiliate, slug: data.slug });
      showToast("Referral code updated");
      return true;
    } catch {
      setSettingsError("Network error — please try again");
      return false;
    } finally {
      setSavingSlug(false);
    }
  }

  async function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !affiliate) return;
    if (file.size > 5 * 1024 * 1024) { setPhotoError("Photo must be under 5MB"); return; }
    setUploadingPhoto(true);
    setPhotoError("");
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `affiliate/${affiliate.id}/photo-${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("store-assets").upload(path, file, { upsert: true });
      if (uploadErr) { setPhotoError("Could not upload photo"); return; }
      const { data } = supabase.storage.from("store-assets").getPublicUrl(path);
      const photoUrl = data.publicUrl;
      const res = await authedFetch("/api/affiliate/me", { method: "PATCH", body: JSON.stringify({ photoUrl }) });
      if (!res.ok) { setPhotoError("Could not save photo"); return; }
      setAffiliate({ ...affiliate, photoUrl });
      showToast("Photo updated");
    } catch {
      setPhotoError("Network error — please try again");
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function saveBanking() {
    if (!affiliate) return;
    if (!accountNumber.trim() || accountNumber.trim().length < 6) {
      setSettingsError("Enter a valid account number");
      return;
    }
    if (!accountHolder.trim()) {
      setSettingsError("Enter the account holder name");
      return;
    }
    setSavingBanking(true);
    setSettingsError("");
    try {
      const branchCode = SA_BANKS.find((b) => b.name === bankName)?.branch || "";
      const res = await authedFetch("/api/affiliate/me", {
        method: "PATCH",
        body: JSON.stringify({
          bankName,
          accountNumber: accountNumber.trim(),
          accountHolder: accountHolder.trim(),
          accountType,
          branchCode,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setSettingsError(data.error || "Could not save banking details"); return; }
      setAffiliate({
        ...affiliate,
        bankName, accountNumber: accountNumber.trim(), accountHolder: accountHolder.trim(), accountType,
      });
      showToast("Banking details updated");
    } catch {
      setSettingsError("Network error — please try again");
    } finally {
      setSavingBanking(false);
    }
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
  const canWithdraw = affiliate.availableBalance >= MIN_WITHDRAW_CENTS;

  return (
    <div style={styles.page} data-theme={theme}>
      <style>{`
        [data-theme="dark"] { ${affiliateThemeVars("dark")} color-scheme: dark; }
        [data-theme="light"] { ${affiliateThemeVars("light")} color-scheme: light; }
      `}</style>
      <div style={styles.atmosphere} />

      {/* NAV */}
      <nav style={styles.nav}>
        <div style={styles.navLogo}>
          <svg width={20} height={20} viewBox="0 0 72 72" fill="none">
            <defs>
              <linearGradient id="navLg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#ff5a36" />
                <stop offset="100%" stopColor="#ff3d6e" />
              </linearGradient>
            </defs>
            <path d="M54 12 A26 26 0 1 0 54 60" stroke="url(#navLg)" strokeWidth={9} strokeLinecap="round" fill="none" />
            <circle cx="57" cy="36" r="6" fill="url(#navLg)" />
            <circle cx="57" cy="36" r="2.4" fill="var(--a-bg)" />
          </svg>
          Catalog<span style={styles.navLogoAccent}>Store</span>
          <span style={styles.navPill}>Affiliate</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={toggleTheme} style={styles.navSettingsBtn} title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
            {theme === "dark"
              ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" style={{ width: 15, height: 15 }}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></svg>
              : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15 }}><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" /></svg>}
          </button>
          <button
            onClick={() => { setShowSettings(true); setSettingsTab("code"); setSettingsError(""); }}
            style={styles.navSettingsBtn}
            title="Settings"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </nav>

      <main style={styles.main}>
        {/* HEADER */}
        <div style={{ ...styles.ph, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={styles.phGreet}>Welcome back</div>
            <h1 style={styles.phTitle}>
              Hey <em style={styles.phTitleEm}>{firstName}</em>
            </h1>
            <div style={styles.phSub}>
              {stats && stats.activePaying > 0 ? (
                <>
                  You're earning from <strong style={{ color: "var(--a-text)" }}>{stats.activePaying} seller{stats.activePaying === 1 ? "" : "s"}</strong>.
                </>
              ) : (
                <>Share your link below to start earning <strong style={{ color: "var(--a-text)" }}>50%</strong> per seller.</>
              )}
            </div>
          </div>
          <div style={{ position: "relative", flexShrink: 0 }}>
            <button onClick={() => setShowProfile((v) => !v)} style={{ ...styles.navAvatar, width: 60, height: 60, fontSize: 19, ...(affiliate.photoUrl ? { padding: 0, overflow: "hidden" } : {}) }} title={affiliate.fullName}>
              {affiliate.photoUrl ? <img src={affiliate.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} /> : initials}
            </button>
            {showProfile && (
              <>
                <div onClick={() => setShowProfile(false)} style={{ position: "fixed", inset: 0, zIndex: 59 }} />
                <div style={styles.profilePopover}>
                  <div style={styles.profilePopoverPhotoWrap}>
                    {affiliate.photoUrl ? (
                      <img src={affiliate.photoUrl} alt="" style={styles.profilePopoverPhoto} />
                    ) : (
                      <div style={{ ...styles.profilePopoverPhoto, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 800, background: "linear-gradient(135deg,#ff6b35,#ff3d6e)" }}>{initials}</div>
                    )}
                    <button onClick={() => photoInputRef.current?.click()} disabled={uploadingPhoto} style={styles.profilePhotoBtn}>
                      {uploadingPhoto ? "Uploading..." : "Change Photo"}
                    </button>
                    <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoSelect} style={{ display: "none" }} />
                    {photoError && <p style={{ ...styles.modalStatusErr, textAlign: "center" }}>{photoError}</p>}
                  </div>
                  <div style={styles.profileNameRow}>
                    <input
                      value={editFirstName}
                      onChange={(e) => setEditFirstName(e.target.value)}
                      placeholder="First name"
                      style={styles.profileNameInput}
                    />
                    <input
                      value={editLastName}
                      onChange={(e) => setEditLastName(e.target.value)}
                      placeholder="Last name"
                      style={styles.profileNameInput}
                    />
                  </div>
                  {nameError && <p style={{ ...styles.modalStatusErr, textAlign: "center" }}>{nameError}</p>}
                  {(editFirstName.trim() !== affiliate.fullName.trim().split(/\s+/)[0] || editLastName.trim() !== affiliate.fullName.trim().split(/\s+/).slice(1).join(" ")) && (
                    <button onClick={saveName} disabled={savingName} style={styles.profileSaveNameBtn}>
                      {savingName ? "Saving..." : "Save Name"}
                    </button>
                  )}
                  <div style={styles.profilePopoverEmail}>{affiliate.email}</div>
                  <button onClick={signOut} style={styles.profileLogoutBtn}>Log Out</button>
                </div>
              </>
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
            style={{ ...styles.withdrawBtn, ...styles.withdrawBtnDisabled }}
            disabled
            title="Withdrawals will open once the payout system is live"
          >
            {canWithdraw
              ? `${formatR(affiliate.availableBalance)} available · Withdrawals coming soon`
              : `R${fromCents(affiliate.availableBalance)} available · min R${MIN_WITHDRAW_R} to withdraw`}
          </button>

          <div style={styles.progressRow}>
            <span style={styles.progressLabel}>Available</span>
            <span style={styles.progressText}>
              {formatR(affiliate.availableBalance)}
              <span style={styles.progressTarget}>
                {" "}· min R{MIN_WITHDRAW_R} {canWithdraw ? "✓" : ""}
              </span>
            </span>
          </div>
        </section>

        {/* EARNINGS GRAPH */}
        <EarningsChart
          points={earningsPoints}
          loading={earningsLoading}
          range={earningsRange}
          setRange={setEarningsRange}
          customFrom={customFrom}
          customTo={customTo}
          setCustomFrom={setCustomFrom}
          setCustomTo={setCustomTo}
        />

        {/* REFERRAL LINK */}
        <section style={styles.refCard}>
          <div style={styles.refTitle}>Your referral link</div>
          <p style={styles.refSub}>
            Share anywhere. Sellers earn you <strong style={{ color: "var(--a-text)" }}>50%</strong> for {COMMISSION_MONTHS} months.
          </p>

          <div style={{ ...styles.refCodeRow, alignItems: editingCodeInline ? "flex-start" : "center" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={styles.refCodeLabel}>Your Code</div>
              {editingCodeInline ? (
                <>
                  <input
                    value={slugInput}
                    onChange={(e) => handleSlugChange(e.target.value)}
                    autoFocus
                    style={styles.refCodeEditInput}
                  />
                  <div style={{ marginTop: 4 }}>
                    {slugStatus === "checking" && <span style={styles.modalStatusMuted}>Checking availability...</span>}
                    {slugStatus === "available" && <span style={styles.modalStatusOk}>Available</span>}
                    {slugStatus === "taken" && <span style={styles.modalStatusErr}>Already taken</span>}
                    {settingsError && <span style={styles.modalStatusErr}>{settingsError}</span>}
                  </div>
                </>
              ) : (
                <div style={styles.refCodeValue}>{affiliate.slug.toUpperCase()}</div>
              )}
            </div>
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              {editingCodeInline ? (
                <>
                  <button
                    onClick={async () => { const ok = await saveSlug(); if (ok) setEditingCodeInline(false); }}
                    disabled={savingSlug || slugStatus === "taken" || slugInput.length < 2}
                    style={{ ...styles.refCodeCopyBtn, opacity: (savingSlug || slugStatus === "taken" || slugInput.length < 2) ? 0.5 : 1 }}
                  >
                    {savingSlug ? "Saving..." : "Save"}
                  </button>
                  <button
                    onClick={() => { setSlugInput(affiliate.slug); setSlugStatus("idle"); setSettingsError(""); setEditingCodeInline(false); }}
                    style={{ ...styles.refCodeCopyBtn, background: "transparent" }}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => setEditingCodeInline(true)} style={styles.refCodeCopyBtn} title="Edit referral code">
                    Edit
                  </button>
                  <button
                    onClick={async () => {
                      try { await navigator.clipboard.writeText(affiliate.slug.toUpperCase()); showToast("Code copied"); }
                      catch { showToast("Copy failed — code unavailable in this browser"); }
                    }}
                    style={styles.refCodeCopyBtn}
                  >
                    Copy
                  </button>
                </>
              )}
            </div>
          </div>

          <div style={styles.refLinkInput}>
            <span style={styles.refLinkText}>
              <span style={styles.refLinkDomain}>{appOrigin.replace(/^https?:\/\//, "")}/?ref=</span>
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
                  `Want to open a real online store and take card payments online? Check out CatalogStore — built for SA sellers: ${refLink(affiliate.slug)}`
                );
                window.open(`https://wa.me/?text=${msg}`, "_blank", "noopener,noreferrer");
              }}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 16, height: 16 }}>
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884" />
              </svg>
              WhatsApp
            </button>
            <button
              style={styles.shareBtn}
              onClick={async () => {
                const caption = `Open a real online store and take card payments online 👀\nBuilt for SA sellers — zero commission.\nSign up with my link and pay R149/month instead of R199/month 🎉\n\n${refLink(affiliate.slug)}`;
                try {
                  await navigator.clipboard.writeText(caption);
                  showToast("Caption copied");
                } catch {
                  showToast("Copy unavailable in this browser");
                }
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
          </div>
        </section>

        {/* STATS */}
        <section style={{ ...styles.stats, gridTemplateColumns: "repeat(3,1fr)" }}>
          <div style={styles.stat}>
            <div style={styles.statIcon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#ff6b35" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
                <path d="M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19" /><circle cx="9.5" cy="7.5" r="3.5" /><path d="M19 19v-1.5a3 3 0 0 0-2-2.83" /><path d="M14.5 4.2a3.5 3.5 0 0 1 0 6.6" />
              </svg>
            </div>
            <div style={styles.statLabel}>Referred</div>
            <div style={styles.statValue}>{stats?.totalReferred || 0}</div>
          </div>
          <div style={styles.stat}>
            <div style={styles.statIcon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
                <path d="M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19" /><circle cx="9.5" cy="7.5" r="3.5" /><path d="m15 11 2 2 3.5-3.5" />
              </svg>
            </div>
            <div style={styles.statLabel}>Paying</div>
            <div style={styles.statValue}>{stats?.activePaying || 0}</div>
          </div>
          <div style={styles.stat}>
            <div style={styles.statIcon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#ff6b35" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
                <path d="M3 17 9 11l4 4 8-8" /><path d="M15 7h6v6" />
              </svg>
            </div>
            <div style={styles.statLabel}>Conversion</div>
            <div style={styles.statValue}>
              {stats?.conversionRate || 0}
              <span style={styles.statSmall}>%</span>
            </div>
          </div>
        </section>

        {/* SELLER BREAKDOWN RINGS */}
        <section style={styles.stats}>
          <StatRing
            label="Paying vs Free"
            value={stats?.activePaying || 0}
            total={stats?.totalReferred || 0}
            color="#22c55e"
            subLabel="of referred sellers are paying"
          />
          <StatRing
            label="Active vs Inactive"
            value={referrals.filter((r) => r.status !== "disconnected").length}
            total={stats?.totalReferred || 0}
            color="#ff6b35"
            subLabel="still active (not disconnected)"
          />
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
              const fillPct = (r.payments_counted / COMMISSION_MONTHS) * 100;

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
                            ? `${r.payments_counted}/${COMMISSION_MONTHS} mo`
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

      {/* SETTINGS MODAL */}
      {showSettings && (
        <div style={styles.modalOverlay} onClick={() => setShowSettings(false)}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Settings</h3>
              <button onClick={() => setShowSettings(false)} style={styles.modalClose}>&times;</button>
            </div>

            <div style={styles.modalTabs}>
              <button
                onClick={() => { setSettingsTab("code"); setSettingsError(""); }}
                style={{ ...styles.modalTabBtn, ...(settingsTab === "code" ? styles.modalTabBtnActive : {}) }}
              >
                Referral Code
              </button>
              <button
                onClick={() => { setSettingsTab("banking"); setSettingsError(""); }}
                style={{ ...styles.modalTabBtn, ...(settingsTab === "banking" ? styles.modalTabBtnActive : {}) }}
              >
                Banking Details
              </button>
            </div>

            {settingsTab === "code" ? (
              <div style={styles.modalBody}>
                <label style={styles.modalLabel}>Your referral code</label>
                <input
                  type="text"
                  value={slugInput}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  style={{
                    ...styles.modalInput,
                    ...(slugStatus === "taken" ? { borderColor: "rgba(255,61,110,0.5)" } : {}),
                    ...(slugStatus === "available" ? { borderColor: "rgba(34,197,94,0.5)" } : {}),
                  }}
                />
                <p style={styles.modalHint}>
                  Your link: <strong style={{ color: "var(--a-text)" }}>{appOrigin}/?ref={slugInput || "…"}</strong>
                </p>
                {slugStatus === "checking" && <p style={styles.modalStatusMuted}>Checking availability...</p>}
                {slugStatus === "available" && <p style={styles.modalStatusOk}>✓ Available</p>}
                {slugStatus === "taken" && <p style={styles.modalStatusErr}>✕ Already taken — try another code</p>}
                {slugStatus !== "taken" && slugInput !== affiliate.slug && slugInput.length >= 2 && (
                  <p style={styles.modalStatusWarn}>
                    ⚠ Changing your code breaks any links you've already shared using "{affiliate.slug}" — they'll no longer attribute new sign-ups to you.
                  </p>
                )}
                {settingsError && <p style={styles.modalStatusErr}>{settingsError}</p>}
                <button
                  onClick={saveSlug}
                  disabled={savingSlug || slugStatus === "taken" || slugInput === affiliate.slug || slugInput.length < 2}
                  style={{ ...styles.modalSaveBtn, opacity: (savingSlug || slugStatus === "taken" || slugInput === affiliate.slug || slugInput.length < 2) ? 0.5 : 1 }}
                >
                  {savingSlug ? "Saving..." : "Save Referral Code"}
                </button>
              </div>
            ) : (
              <div style={styles.modalBody}>
                <label style={styles.modalLabel}>Bank</label>
                <select value={bankName} onChange={(e) => setBankName(e.target.value)} style={styles.modalInput}>
                  {SA_BANKS.map((b) => <option key={b.name} value={b.name}>{b.name}</option>)}
                </select>

                <label style={styles.modalLabel}>Account number</label>
                <input
                  type="text"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))}
                  style={styles.modalInput}
                />

                <label style={styles.modalLabel}>Account holder name</label>
                <input
                  type="text"
                  value={accountHolder}
                  onChange={(e) => setAccountHolder(e.target.value)}
                  style={styles.modalInput}
                />

                <label style={styles.modalLabel}>Account type</label>
                <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
                  {(["cheque", "savings"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setAccountType(t)}
                      style={{ ...styles.modalToggleBtn, ...(accountType === t ? styles.modalToggleBtnActive : {}) }}
                    >
                      {t === "cheque" ? "Cheque" : "Savings"}
                    </button>
                  ))}
                </div>

                {settingsError && <p style={styles.modalStatusErr}>{settingsError}</p>}
                <button onClick={saveBanking} disabled={savingBanking} style={{ ...styles.modalSaveBtn, opacity: savingBanking ? 0.5 : 1, marginTop: 12 }}>
                  {savingBanking ? "Saving..." : "Save Banking Details"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// A ring is a stat tile, not a categorical pie — one accent arc against a
// receded track, with the number as the actual headline. See dataviz skill's
// "emphasis: highlight one, gray the rest" pattern for why this reads better
// than a 2-slice pie for exactly two buckets.
function StatRing({ label, value, total, color, subLabel }: { label: string; value: number; total: number; color: string; subLabel: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  const r = 40;
  const c = 2 * Math.PI * r;
  return (
    <div style={styles.stat}>
      <div style={styles.statLabel}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 10 }}>
        <div style={{ position: "relative", width: 72, height: 72, flexShrink: 0 }}>
          <svg width={72} height={72} viewBox="0 0 96 96">
            <circle cx="48" cy="48" r={r} fill="none" stroke="var(--a-border-strong)" strokeWidth={10} />
            {total > 0 && (
              <circle
                cx="48" cy="48" r={r} fill="none" stroke={color} strokeWidth={10} strokeLinecap="round"
                strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)}
                transform="rotate(-90 48 48)" style={{ transition: "stroke-dashoffset 0.4s" }}
              />
            )}
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 900, color: "var(--a-text)" }}>{pct}%</div>
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: "-0.02em", color: "var(--a-text)" }}>
            {value}<span style={{ fontSize: 12, color: "var(--a-muted)", fontWeight: 600 }}> / {total}</span>
          </div>
          <div style={{ fontSize: 11, color: "var(--a-text-2)", lineHeight: 1.4 }}>{subLabel}</div>
        </div>
      </div>
    </div>
  );
}

function EarningsChart({ points, loading, range, setRange, customFrom, customTo, setCustomFrom, setCustomTo }: {
  points: { date: string; cents: number }[];
  loading: boolean;
  range: "7" | "30" | "custom";
  setRange: (r: "7" | "30" | "custom") => void;
  customFrom: string; customTo: string;
  setCustomFrom: (v: string) => void; setCustomTo: (v: string) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const W = 600, H = 180, PAD_L = 6, PAD_R = 6, PAD_T = 14, PAD_B = 22;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const n = points.length;
  const maxCents = Math.max(1, ...points.map((p) => p.cents));
  const xAt = (i: number) => PAD_L + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2);
  const yAt = (cents: number) => PAD_T + plotH - (cents / maxCents) * plotH;
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(1)} ${yAt(p.cents).toFixed(1)}`).join(" ");
  const areaPath = n > 0 ? `${linePath} L ${xAt(n - 1).toFixed(1)} ${(PAD_T + plotH).toFixed(1)} L ${xAt(0).toFixed(1)} ${(PAD_T + plotH).toFixed(1)} Z` : "";
  const totalCents = points.reduce((s, p) => s + p.cents, 0);

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (n === 0 || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * W;
    let closest = 0, closestDist = Infinity;
    for (let i = 0; i < n; i++) { const d = Math.abs(xAt(i) - relX); if (d < closestDist) { closestDist = d; closest = i; } }
    setHover({ i: closest, x: xAt(closest), y: yAt(points[closest].cents) });
  };

  const fmtDate = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-ZA", { day: "numeric", month: "short", timeZone: "UTC" });

  return (
    <section style={styles.hero}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div style={styles.heroLabel}><span style={styles.heroDot} />Earnings over time</div>
        <div style={{ display: "flex", gap: 3, background: "var(--a-input-strong)", border: "1px solid var(--a-border-md)", borderRadius: 100, padding: 3 }}>
          {(["7", "30", "custom"] as const).map((r) => (
            <button key={r} onClick={() => setRange(r)} style={{ padding: "6px 12px", borderRadius: 100, border: "none", background: range === r ? "rgba(255,107,53,0.12)" : "transparent", color: range === r ? "#ff6b35" : "var(--a-muted-2)", fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", cursor: "pointer", fontFamily: "inherit", textTransform: "uppercase" }}>
              {r === "7" ? "7D" : r === "30" ? "30D" : "Custom"}
            </button>
          ))}
        </div>
      </div>
      {range === "custom" && (
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          <input type="date" value={customFrom} max={customTo || undefined} onChange={(e) => setCustomFrom(e.target.value)} style={styles.dateInput} />
          <input type="date" value={customTo} min={customFrom || undefined} onChange={(e) => setCustomTo(e.target.value)} style={styles.dateInput} />
        </div>
      )}
      <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.02em", marginBottom: 12, color: "var(--a-text)" }}>
        R{fromCents(totalCents).toLocaleString()} <span style={{ fontSize: 11, color: "var(--a-muted)", fontWeight: 600 }}>in this range</span>
      </div>
      {loading ? (
        <div style={{ height: 180, display: "flex", alignItems: "center", justifyContent: "center" }}><div style={styles.spinner} /></div>
      ) : n === 0 ? (
        <div style={{ height: 180, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--a-muted)", fontSize: 12 }}>No earnings in this range yet</div>
      ) : (
        <div style={{ position: "relative" }}>
          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%" height={180} onMouseMove={handleMove} onMouseLeave={() => setHover(null)} style={{ display: "block", overflow: "visible", cursor: "crosshair" }}>
            <defs>
              <linearGradient id="earningsFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ff6b35" stopOpacity="0.32" />
                <stop offset="100%" stopColor="#ff6b35" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0.25, 0.5, 0.75].map((f) => (
              <line key={f} x1={PAD_L} x2={W - PAD_R} y1={PAD_T + plotH * f} y2={PAD_T + plotH * f} stroke="var(--a-chart-grid)" strokeWidth={1} />
            ))}
            <path d={areaPath} fill="url(#earningsFill)" stroke="none" />
            <path d={linePath} fill="none" stroke="#ff6b35" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            {hover && (
              <>
                <line x1={hover.x} x2={hover.x} y1={PAD_T} y2={PAD_T + plotH} stroke="var(--a-border-strong2)" strokeWidth={1} />
                <circle cx={hover.x} cy={hover.y} r={4} fill="#ff6b35" stroke="var(--a-card)" strokeWidth={2} />
              </>
            )}
            <text x={PAD_L} y={H - 6} fontSize="9" fill="var(--a-chart-axis)">{fmtDate(points[0].date)}</text>
            <text x={W - PAD_R} y={H - 6} fontSize="9" fill="var(--a-chart-axis)" textAnchor="end">{fmtDate(points[n - 1].date)}</text>
          </svg>
          {hover && (
            <div style={{ position: "absolute", left: `${(hover.x / W) * 100}%`, top: 0, transform: hover.x > W * 0.7 ? "translateX(-100%)" : "translateX(0)", pointerEvents: "none" }}>
              <div style={{ background: "var(--a-tooltip)", border: "1px solid var(--a-tooltip-border)", borderRadius: 10, padding: "8px 12px", fontSize: 11, whiteSpace: "nowrap", boxShadow: "0 8px 24px rgba(0,0,0,0.25)" }}>
                <div style={{ color: "var(--a-text-2)", marginBottom: 2 }}>{fmtDate(points[hover.i].date)}</div>
                <div style={{ fontWeight: 800, color: "var(--a-text)" }}>R{fromCents(points[hover.i].cents)}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
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
    background: "var(--a-input)",
    color: "var(--a-muted)",
    border: "1px solid var(--a-border)",
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
    background: "var(--a-bg)",
    color: "var(--a-text)",
    fontFamily: "'Schibsted Grotesk', sans-serif",
    position: "relative",
    overflowX: "hidden",
  },
  atmosphere: {
    position: "fixed",
    inset: 0,
    background:
      "radial-gradient(ellipse 80% 40% at 50% -10%,rgba(255,107,53,0.08) 0%,transparent 60%),radial-gradient(ellipse 60% 30% at 0% 30%,var(--a-atmosphere-2) 0%,transparent 60%)",
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
    background: "var(--a-nav)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    borderBottom: "1px solid var(--a-border)",
  },
  navLogo: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: "-0.02em",
    textTransform: "uppercase",
    color: "var(--a-text)",
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
    border: "1px solid var(--a-border-strong)",
    color: "#fff",
    fontSize: 10,
    fontWeight: 800,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  profilePopover: {
    position: "absolute", top: "calc(100% + 10px)", right: 0, zIndex: 60,
    width: 240, background: "var(--a-card)", border: "1px solid var(--a-border-strong)",
    borderRadius: 16, padding: 18, boxShadow: "0 24px 60px rgba(0,0,0,0.35)",
    display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
  },
  profilePopoverPhotoWrap: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8, marginBottom: 8 },
  profilePopoverPhoto: { width: 64, height: 64, borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(255,107,53,0.4)", color: "#fff" },
  profilePhotoBtn: {
    padding: "6px 12px", background: "var(--a-hover)", border: "1px solid var(--a-border-strong)",
    borderRadius: 100, color: "var(--a-text)", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
  },
  profilePopoverName: { fontSize: 13, fontWeight: 800, textAlign: "center", color: "var(--a-text)" },
  profileNameRow: { display: "flex", gap: 6, width: "100%", marginBottom: 4 },
  profileNameInput: {
    flex: 1, minWidth: 0, padding: "8px 10px", background: "var(--a-input)", border: "1px solid var(--a-border-strong)",
    borderRadius: 8, color: "var(--a-text)", fontSize: 12, fontFamily: "inherit", outline: "none", textAlign: "center",
  },
  profileSaveNameBtn: {
    width: "100%", padding: 9, background: "rgba(255,107,53,0.1)", border: "1px solid rgba(255,107,53,0.25)",
    borderRadius: 100, color: "#ff6b35", fontSize: 11, fontWeight: 800, letterSpacing: "0.04em",
    textTransform: "uppercase", cursor: "pointer", fontFamily: "inherit", marginBottom: 10,
  },
  profilePopoverEmail: { fontSize: 11, color: "var(--a-muted-2)", textAlign: "center", marginBottom: 12, wordBreak: "break-all" },
  profileLogoutBtn: {
    width: "100%", padding: 12, background: "rgba(255,61,110,0.08)", border: "1px solid rgba(255,61,110,0.2)",
    borderRadius: 10, color: "#ff3d6e", fontSize: 12, fontWeight: 800, letterSpacing: "0.04em",
    textTransform: "uppercase", cursor: "pointer", fontFamily: "inherit",
  },
  refCodeRow: {
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
    background: "rgba(255,107,53,0.06)", border: "1px solid rgba(255,107,53,0.18)",
    borderRadius: 12, padding: "10px 14px", marginBottom: 12,
  },
  refCodeLabel: { fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 700, color: "var(--a-muted-2)", marginBottom: 2 },
  refCodeValue: { fontSize: 16, fontWeight: 900, letterSpacing: "0.04em", color: "#ff6b35" },
  refCodeEditInput: {
    width: "100%", padding: "6px 8px", background: "var(--a-input-strong)", border: "1px solid rgba(255,107,53,0.4)",
    borderRadius: 8, color: "#ff6b35", fontSize: 16, fontWeight: 900, letterSpacing: "0.04em", fontFamily: "inherit", outline: "none",
  },
  refCodeCopyBtn: {
    padding: "8px 16px", background: "var(--a-hover)", border: "1px solid var(--a-border-strong)",
    borderRadius: 100, color: "var(--a-text)", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
  },
  navSettingsBtn: {
    width: 30,
    height: 30,
    borderRadius: "50%",
    background: "var(--a-input)",
    border: "1px solid var(--a-border-md)",
    color: "var(--a-text-2)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  main: { position: "relative", zIndex: 1, maxWidth: 520, margin: "0 auto", padding: "20px 18px 100px" },
  ph: { marginBottom: 20 },
  phGreet: {
    fontSize: 10,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    color: "var(--a-muted)",
    marginBottom: 4,
    fontWeight: 600,
  },
  phTitle: { fontSize: 32, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1, marginBottom: 8, color: "var(--a-text)" },
  phTitleEm: {
    fontStyle: "normal",
    background: "linear-gradient(135deg,#ff6b35,#ff3d6e)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    fontWeight: 900,
  },
  phSub: { fontSize: 13, color: "var(--a-text-2)", lineHeight: 1.5 },
  hero: {
    position: "relative",
    background: "var(--a-card)",
    border: "1px solid var(--a-border)",
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
    background: "linear-gradient(135deg,var(--a-text) 0%,#ff6b35 70%,#ff3d6e 100%)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    marginBottom: 6,
  },
  heroCurrency: { fontSize: "0.5em", fontWeight: 600, color: "var(--a-muted)", WebkitTextFillColor: "var(--a-muted)", marginRight: 3 },
  heroMeta: { fontSize: 13, color: "var(--a-text-2)", lineHeight: 1.5, marginBottom: 18 },
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
    background: "var(--a-input)",
    color: "var(--a-muted)",
    boxShadow: "none",
    cursor: "not-allowed",
  },
  progressRow: { display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--a-border)" },
  progressLabel: { fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 600, color: "var(--a-muted)" },
  progressText: { fontSize: 11, color: "var(--a-text)", fontWeight: 700 },
  progressTarget: { color: "var(--a-muted)", fontWeight: 500 },
  refCard: { background: "var(--a-card)", border: "1px solid var(--a-border)", borderRadius: 20, padding: 22, marginBottom: 14 },
  refTitle: { fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 4, color: "var(--a-text)" },
  refSub: { fontSize: 12, color: "var(--a-text-2)", marginBottom: 16, lineHeight: 1.5 },
  refLinkInput: {
    display: "flex",
    alignItems: "center",
    background: "var(--a-input-strong)",
    border: "1px solid var(--a-border-strong2)",
    borderRadius: 12,
    padding: "6px 6px 6px 14px",
    gap: 8,
  },
  refLinkText: {
    flex: 1,
    fontSize: 12,
    fontWeight: 600,
    color: "var(--a-text)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    padding: "8px 0",
  },
  refLinkDomain: { color: "var(--a-muted)", fontWeight: 500 },
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
    background: "var(--a-input)",
    border: "1px solid var(--a-border)",
    borderRadius: 10,
    color: "var(--a-text-2)",
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: "0.04em",
  },
  stats: { display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10, marginBottom: 14 },
  stat: { background: "var(--a-card)", border: "1px solid var(--a-border)", borderRadius: 16, padding: 16 },
  statIcon: { width: 30, height: 30, borderRadius: 9, background: "var(--a-input)", border: "1px solid var(--a-border-md)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10 },
  dateInput: { padding: "9px 12px", background: "var(--a-input-strong)", border: "1px solid var(--a-border-strong)", borderRadius: 10, color: "var(--a-text)", fontSize: 12, fontFamily: "inherit", outline: "none" },
  statLabel: { fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 600, color: "var(--a-muted)", marginBottom: 10 },
  statValue: { fontSize: 30, fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1, color: "var(--a-text)" },
  statSmall: { fontSize: "0.55em", color: "var(--a-muted)", fontWeight: 600 },
  sectionHead: { display: "flex", alignItems: "center", justifyContent: "space-between", margin: "24px 0 10px" },
  sectionTitle: { fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em", display: "flex", alignItems: "baseline", gap: 8, color: "var(--a-text)" },
  sectionCount: { fontSize: 11, color: "var(--a-muted)", fontWeight: 600 },
  sectionTabs: { display: "flex", gap: 3, background: "var(--a-card)", border: "1px solid var(--a-border)", borderRadius: 100, padding: 3 },
  sectionTab: {
    padding: "5px 10px",
    fontSize: 10,
    fontWeight: 700,
    color: "var(--a-muted)",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    borderRadius: 100,
    fontFamily: "inherit",
  },
  sectionTabActive: { background: "var(--a-hover)", color: "var(--a-text)" },
  sellers: { background: "var(--a-card)", border: "1px solid var(--a-border)", borderRadius: 18, overflow: "hidden" },
  empty: { padding: "32px 20px", textAlign: "center" },
  emptyIcon: { fontSize: 32, color: "#ff6b35", marginBottom: 10, opacity: 0.5 },
  emptyTitle: { fontSize: 14, fontWeight: 700, marginBottom: 4, color: "var(--a-text)" },
  emptySub: { fontSize: 12, color: "var(--a-text-2)" },
  seller: {
    display: "flex",
    alignItems: "center",
    padding: "14px 16px",
    borderBottom: "1px solid var(--a-border)",
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
  sName: { fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "var(--a-text)" },
  sEarned: { fontSize: 14, fontWeight: 800, whiteSpace: "nowrap", flexShrink: 0, color: "var(--a-text)" },
  sEarnedZero: { color: "var(--a-muted)", fontWeight: 600 },
  sCurrency: { fontSize: "0.7em", color: "var(--a-muted)", fontWeight: 600, marginRight: 1 },
  sBottomRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 },
  sBadgeDot: { width: 4, height: 4, borderRadius: "50%", background: "currentColor" },
  sWindow: { flex: 1, display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "var(--a-muted)", fontWeight: 600 },
  sWindowBar: { flex: 1, height: 3, background: "var(--a-hover)", borderRadius: 100, overflow: "hidden" },
  sWindowFill: { height: "100%", background: "linear-gradient(135deg,#ff6b35,#ff3d6e)", borderRadius: 100 },
  sWindowText: { whiteSpace: "nowrap", flexShrink: 0 },
  history: { background: "var(--a-card)", border: "1px solid var(--a-border)", borderRadius: 18, overflow: "hidden" },
  hRow: {
    display: "flex",
    alignItems: "center",
    padding: "14px 16px",
    borderBottom: "1px solid var(--a-border)",
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
  hAmt: { fontSize: 15, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--a-text)" },
  hCurrency: { fontSize: "0.65em", color: "var(--a-muted)", fontWeight: 600, marginRight: 1 },
  hStatus: { fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", padding: "3px 8px", borderRadius: 100, border: "1px solid", flexShrink: 0 },
  hStatusPaid: { color: "#22c55e", borderColor: "rgba(34,197,94,0.2)", background: "rgba(34,197,94,0.08)" },
  hStatusPending: { color: "#ff6b35", borderColor: "rgba(255,107,53,0.2)", background: "rgba(255,107,53,0.08)" },
  hBottom: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 11, color: "var(--a-muted)", fontWeight: 500 },
  toast: {
    position: "fixed",
    bottom: 24,
    left: "50%",
    transform: "translateX(-50%)",
    background: "var(--a-tooltip)",
    backdropFilter: "blur(16px)",
    border: "1px solid var(--a-tooltip-border)",
    color: "var(--a-text)",
    padding: "11px 18px",
    borderRadius: 100,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.04em",
    boxShadow: "0 16px 40px rgba(0,0,0,0.3)",
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
  modalOverlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000,
    display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
  },
  modalCard: {
    background: "var(--a-card)", border: "1px solid var(--a-border-strong)", borderRadius: 20,
    maxWidth: 420, width: "100%", maxHeight: "85vh", overflowY: "auto",
    boxShadow: "0 24px 60px rgba(0,0,0,0.35)",
  },
  modalHeader: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "20px 24px 0",
  },
  modalTitle: { fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--a-text)" },
  modalClose: {
    background: "var(--a-hover)", border: "none", color: "var(--a-text-2)",
    width: 28, height: 28, borderRadius: "50%", fontSize: 16, cursor: "pointer",
  },
  modalTabs: {
    display: "flex", gap: 6, padding: "16px 24px 0", borderBottom: "1px solid var(--a-border)",
  },
  modalTabBtn: {
    padding: "10px 4px", marginRight: 16, background: "none", border: "none",
    borderBottom: "2px solid transparent", color: "var(--a-muted-2)",
    fontSize: 12, fontWeight: 700, letterSpacing: "0.02em", cursor: "pointer", fontFamily: "inherit",
  },
  modalTabBtnActive: { color: "var(--a-text)", borderBottomColor: "#ff6b35" },
  modalBody: { padding: "20px 24px 24px", display: "flex", flexDirection: "column" },
  modalLabel: {
    fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
    color: "var(--a-muted-2)", marginBottom: 6, marginTop: 14,
  },
  modalInput: {
    padding: "12px 14px", background: "var(--a-input)", border: "1px solid var(--a-border-strong)",
    borderRadius: 10, color: "var(--a-text)", fontSize: 13, fontFamily: "inherit", outline: "none",
  },
  modalHint: { fontSize: 11, color: "var(--a-muted-2)", marginTop: 8, wordBreak: "break-all" },
  modalStatusMuted: { fontSize: 11, color: "var(--a-muted)", marginTop: 6, fontWeight: 600 },
  modalStatusOk: { fontSize: 11, color: "#22c55e", marginTop: 6, fontWeight: 700 },
  modalStatusErr: { fontSize: 11, color: "#ff3d6e", marginTop: 6, fontWeight: 700 },
  modalStatusWarn: { fontSize: 11, color: "#fbbf24", marginTop: 8, lineHeight: 1.5, fontWeight: 600 },
  modalSaveBtn: {
    marginTop: 16, padding: 14, background: "linear-gradient(135deg,#ff6b35,#ff3d6e)", color: "#fff",
    border: "none", borderRadius: 100, fontSize: 12, fontWeight: 800, letterSpacing: "0.04em",
    textTransform: "uppercase", cursor: "pointer", fontFamily: "inherit",
  },
  modalToggleBtn: {
    flex: 1, padding: 12, background: "var(--a-input)", border: "1px solid var(--a-border-md)",
    borderRadius: 10, color: "var(--a-muted-2)", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
  },
  modalToggleBtnActive: {
    background: "rgba(255,107,53,0.1)", border: "1px solid rgba(255,107,53,0.3)", color: "#ff6b35",
  },
};
