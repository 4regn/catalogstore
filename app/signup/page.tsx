"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";

export default function SignUp() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [storeName, setStoreName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [refCode, setRefCode] = useState("");
  const [refLocked, setRefLocked] = useState(false);
  const [refAffiliateName, setRefAffiliateName] = useState<string | null>(null);
  const [refLookupTimer, setRefLookupTimer] = useState<NodeJS.Timeout | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [plan, setPlan] = useState<"free" | "starter">("starter");

  const passwordChecks = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
  };

  const allChecksPassed = Object.values(passwordChecks).every(Boolean);
  const passwordsMatch = password === confirmPassword && confirmPassword !== "";

  // Read affiliate cookie on mount and pre-fill the referral code field
  useEffect(() => {
    try {
      const cookieRow = document.cookie
        .split(";")
        .map((c) => c.trim())
        .find((c) => c.startsWith("affiliate_ref="));
      if (!cookieRow) return;
      const slug = cookieRow.split("=")[1];
      if (!slug) return;
      setRefCode(slug);
      setRefLocked(true);
      lookupAffiliate(slug);
    } catch {}
  }, []);

  async function lookupAffiliate(slug: string) {
    if (!slug || slug.length < 2) {
      setRefAffiliateName(null);
      return;
    }
    const cleaned = slug.toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (!cleaned) {
      setRefAffiliateName(null);
      return;
    }
    const { data } = await supabase
      .from("affiliate_public_profile")
      .select("full_name")
      .eq("slug", cleaned)
      .maybeSingle();
    setRefAffiliateName(data?.full_name || null);
  }

  function handleRefCodeChange(value: string) {
    const cleaned = value.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32);
    setRefCode(cleaned);
    setRefAffiliateName(null);
    if (refLookupTimer) clearTimeout(refLookupTimer);
    if (cleaned.length >= 2) {
      const t = setTimeout(() => lookupAffiliate(cleaned), 400);
      setRefLookupTimer(t);
    }
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    /* Up-front validation. Email + password are validated by Supabase
       already, but the seller-profile fields are not. */
    const name = storeName.trim();
    if (!name) { setError("Store name is required."); return; }
    if (name.length < 2) { setError("Store name must be at least 2 characters."); return; }
    if (name.length > 60) { setError("Store name must be 60 characters or fewer."); return; }

    const phoneDigits = whatsapp.replace(/\D/g, "");
    /* SA mobile: starts with 0 (10 digits) or 27 (11 digits) */
    if (!/^(?:0[6-8]\d{8}|27[6-8]\d{8})$/.test(phoneDigits)) {
      setError("Please enter a valid South African mobile number (e.g. 0671234567).");
      return;
    }
    const normalizedWhatsapp = phoneDigits.startsWith("0") ? "27" + phoneDigits.substring(1) : phoneDigits;

    if (!allChecksPassed) { setError("Password does not meet all requirements."); return; }
    if (!passwordsMatch) { setError("Passwords do not match."); return; }
    setLoading(true);

    /* Resolve a unique subdomain BEFORE we create the auth user.
       Otherwise a collision creates an orphan auth account with no seller row. */
    const baseSubdomain = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "store";
    let subdomain = baseSubdomain;
    let suffix = 1;
    while (suffix < 50) {
      const { data: taken } = await supabase.from("sellers").select("id").eq("subdomain", subdomain).maybeSingle();
      if (!taken) break;
      suffix += 1;
      subdomain = `${baseSubdomain}-${suffix}`;
    }
    if (suffix >= 50) {
      /* DB unique constraint is the safety net, but this many collisions
         means someone's trying to grief; fall back to a timestamp suffix */
      subdomain = `${baseSubdomain}-${Date.now().toString(36)}`;
    }

    const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
    if (authError) { setError(authError.message); setLoading(false); return; }

    if (authData.user) {
      // Pro signups don't get "trial" (and the access that comes with it) until
      // they've actually completed the PayFast subscription mandate -- "pending"
      // has no dashboard/storefront access. /api/subscription/notify flips this
      // to "active" once PayFast confirms the mandate; that ITN also carries the
      // 14-day-free-then-billed terms via its own billing_date, so the trial
      // promise still holds even though the label here skips straight to "active".
      const sellerRow = plan === "free"
        ? { id: authData.user.id, email, store_name: name, whatsapp_number: normalizedWhatsapp, subdomain,
            subscription_status: "free", subscription_plan: "free", trial_ends_at: null, template: "soft-luxury" }
        : { id: authData.user.id, email, store_name: name, whatsapp_number: normalizedWhatsapp, subdomain,
            subscription_status: "pending", subscription_plan: "starter", trial_ends_at: null };
      const { error: profileError } = await supabase.from("sellers").insert(sellerRow);
      if (profileError) {
        /* The seller insert failed (race condition on subdomain, RLS, etc).
           The auth user is now orphaned. Surface a clear message and the
           user can retry — the auth.signUp call is idempotent on email so
           a retry won't create another auth account. */
        setError("Could not create your store: " + profileError.message + ". Please try a different store name.");
        setLoading(false);
        return;
      }

      // If user typed a ref code, set it as the cookie before attribution.
      // This unifies the two attribution paths (link click vs typed code).
      if (refCode) {
        const expires = new Date();
        expires.setDate(expires.getDate() + 30);
        const isProd = window.location.hostname.includes("catalogstore.co.za");
        const domain = isProd ? "; domain=.catalogstore.co.za" : "";
        document.cookie = `affiliate_ref=${refCode}; expires=${expires.toUTCString()}; path=/; SameSite=Lax${domain}`;
      }

      // Attribute affiliate referral. Never block signup on failure.
      try {
        const accessToken = authData.session?.access_token || "";
        await fetch("/api/affiliate/attribute", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ sellerId: authData.user.id }),
        });
      } catch {}

      // Free plan skips card verification entirely — straight to the dashboard.
      router.push(plan === "free" ? "/dashboard" : "/dashboard/billing");
    }
    setLoading(false);
  };

  const Eye = ({ open }: { open: boolean }) => open ? (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(245,245,245,0.3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
  ) : (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(245,245,245,0.3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
  );

  return (
    <div style={s.page}>
      <div style={s.glow1} />
      <div style={s.glow2} />

      <div style={s.container}>
        <a href="/" style={s.logo}>
          <span style={s.logoText}>CATALOG</span>
          <span style={s.logoAccent}>STORE</span>
        </a>

        <div style={s.card}>
          <h1 style={s.title}>CREATE YOUR STORE</h1>
          <p style={s.subtitle}>Set up your CatalogStore account in 30 seconds.</p>

          {error && <div style={s.error}>{error}</div>}

          <form onSubmit={handleSignUp} style={s.form}>
            <div style={s.field}>
              <label style={s.label}>CHOOSE YOUR PLAN</label>
              <div style={s.planGrid}>
                <button
                  type="button"
                  onClick={() => setPlan("free")}
                  style={{ ...s.planCard, ...(plan === "free" ? s.planCardActive : {}) }}
                >
                  <div style={s.planName}>Free</div>
                  <div style={s.planPrice}>R0<span style={s.planPriceSuffix}>/mo</span></div>
                  <ul style={s.planFeatures}>
                    <li style={s.planFeatureItem}>1 store template</li>
                    <li style={s.planFeatureItem}>Up to 4 products</li>
                    <li style={s.planFeatureItem}>5 photos per product</li>
                    <li style={s.planFeatureItem}>No custom domain</li>
                  </ul>
                </button>
                <button
                  type="button"
                  onClick={() => setPlan("starter")}
                  style={{ ...s.planCard, ...(plan === "starter" ? s.planCardActive : {}) }}
                >
                  <div style={s.planPopular}>14-day free trial</div>
                  <div style={s.planName}>Starter</div>
                  <div style={s.planPrice}>R199<span style={s.planPriceSuffix}>/mo</span></div>
                  <ul style={s.planFeatures}>
                    <li style={s.planFeatureItem}>All 5 store templates</li>
                    <li style={s.planFeatureItem}>Up to 50 products</li>
                    <li style={s.planFeatureItem}>20 photos per product</li>
                    <li style={s.planFeatureItem}>Custom domain support</li>
                  </ul>
                </button>
              </div>
            </div>

            <div style={s.field}>
              <label style={s.label}>STORE NAME</label>
              <input type="text" placeholder="e.g. NALA Studio" value={storeName} onChange={(e) => setStoreName(e.target.value)} required style={s.input} />
              {storeName && (
                <div style={s.hint}>Your store URL: <span style={{ color: "#ff6b35" }}>{storeName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}</span>.catalogstore.co.za</div>
              )}
            </div>

            <div style={s.field}>
              <label style={s.label}>WHATSAPP NUMBER</label>
              <input type="tel" placeholder="e.g. 0671234567" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} required style={s.input} />
            </div>

            <div style={s.field}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <label style={s.label}>REFERRAL CODE (OPTIONAL)</label>
                {refLocked && (
                  <button
                    type="button"
                    onClick={() => { setRefLocked(false); }}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#ff6b35",
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    Edit
                  </button>
                )}
              </div>
              <div style={{ position: "relative" }}>
                <input
                  type="text"
                  placeholder="Have a referral code? Paste it here"
                  value={refCode}
                  onChange={(e) => handleRefCodeChange(e.target.value)}
                  disabled={refLocked}
                  style={{
                    ...s.input,
                    paddingRight: refAffiliateName ? 36 : 14,
                    opacity: refLocked ? 0.7 : 1,
                  }}
                />
                {refAffiliateName && (
                  <div style={{
                    position: "absolute",
                    right: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    background: "rgba(34,197,94,0.15)",
                    border: "1px solid rgba(34,197,94,0.4)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#22c55e",
                    fontSize: 11,
                    fontWeight: 800,
                  }}>✓</div>
                )}
              </div>
              {refAffiliateName && (
                <div style={{
                  marginTop: 8,
                  fontSize: 12,
                  color: "#22c55e",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  Referred by {refAffiliateName} — you&apos;ll pay R149/month instead of R199/month
                </div>
              )}
            </div>

            <div style={s.field}>
              <label style={s.label}>EMAIL</label>
              <input type="email" placeholder="you@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required style={s.input} />
            </div>

            <div style={s.field}>
              <label style={s.label}>PASSWORD</label>
              <div style={s.passWrap}>
                <input type={showPassword ? "text" : "password"} placeholder="At least 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ ...s.input, paddingRight: 48 }} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} style={s.eyeBtn}><Eye open={showPassword} /></button>
              </div>
              {password && (
                <div style={s.checks}>
                  {[
                    { ok: passwordChecks.length, text: "At least 8 characters" },
                    { ok: passwordChecks.uppercase, text: "One uppercase letter" },
                    { ok: passwordChecks.lowercase, text: "One lowercase letter" },
                    { ok: passwordChecks.special, text: "One special character" },
                  ].map((c, i) => (
                    <div key={i} style={{ ...s.checkItem, color: c.ok ? "#ff6b35" : "rgba(245,245,245,0.2)" }}>
                      {c.ok ? "\u2713" : "\u2717"} {c.text}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={s.field}>
              <label style={s.label}>CONFIRM PASSWORD</label>
              <div style={s.passWrap}>
                <input type={showConfirm ? "text" : "password"} placeholder="Type your password again" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required style={{ ...s.input, paddingRight: 48 }} />
                <button type="button" onClick={() => setShowConfirm(!showConfirm)} style={s.eyeBtn}><Eye open={showConfirm} /></button>
              </div>
              {confirmPassword && (
                <div style={{ ...s.checkItem, marginTop: 6, color: passwordsMatch ? "#ff6b35" : "#ff3d6e" }}>
                  {passwordsMatch ? "\u2713 Passwords match" : "\u2717 Passwords do not match"}
                </div>
              )}
            </div>

            <button type="submit" disabled={loading || !allChecksPassed || !passwordsMatch} style={{ ...s.btn, opacity: loading || !allChecksPassed || !passwordsMatch ? 0.4 : 1, cursor: loading || !allChecksPassed || !passwordsMatch ? "not-allowed" : "pointer" }}>
              {loading ? "CREATING YOUR STORE..." : plan === "free" ? "CREATE MY FREE STORE" : "START MY 14-DAY FREE TRIAL"}
            </button>
          </form>

          <p style={s.footer}>Already have an account? <a href="/login" style={s.link}>Log in</a></p>
        </div>
      </div>
    </div>
  );
}

const s: { [key: string]: React.CSSProperties } = {
  page: { minHeight: "100vh", background: "#030303", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Schibsted Grotesk', sans-serif", position: "relative", overflow: "hidden", padding: "40px 20px", color: "#f5f5f5" },
  glow1: { position: "fixed", width: 500, height: 500, top: -200, right: -100, background: "radial-gradient(circle, rgba(255,107,53,0.06) 0%, transparent 65%)", filter: "blur(120px)", pointerEvents: "none" },
  glow2: { position: "fixed", width: 400, height: 400, bottom: -150, left: -100, background: "radial-gradient(circle, rgba(255,61,110,0.04) 0%, transparent 65%)", filter: "blur(100px)", pointerEvents: "none" },
  container: { width: "100%", maxWidth: 440, position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 32 },
  logo: { display: "flex", alignItems: "center", gap: 0, textDecoration: "none", fontSize: 20, fontWeight: 900, letterSpacing: "-0.04em", textTransform: "uppercase" as const },
  logoText: { color: "#f5f5f5" },
  logoAccent: { background: "linear-gradient(135deg, #ff6b35, #ff3d6e)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" },
  card: { width: "100%", background: "rgba(255,255,255,0.03)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 20, padding: "40px 32px" },
  title: { fontSize: 24, fontWeight: 900, letterSpacing: "-0.03em", textTransform: "uppercase" as const, marginBottom: 8 },
  subtitle: { fontSize: 14, color: "rgba(245,245,245,0.35)", lineHeight: 1.6, marginBottom: 28, fontWeight: 400 },
  form: { display: "flex", flexDirection: "column", gap: 20 },
  field: { display: "flex", flexDirection: "column", gap: 6 },
  label: { fontSize: 11, fontWeight: 700, color: "rgba(245,245,245,0.35)", letterSpacing: "0.1em", textTransform: "uppercase" as const },
  input: { width: "100%", padding: "14px 16px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, color: "#f5f5f5", fontSize: 14, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none", transition: "border-color 0.2s" },
  passWrap: { position: "relative" as const },
  eyeBtn: { position: "absolute" as const, right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" },
  checks: { display: "flex", flexDirection: "column", gap: 4, marginTop: 8 },
  checkItem: { fontSize: 11, fontWeight: 600, letterSpacing: "0.02em" },
  hint: { fontSize: 11, color: "rgba(245,245,245,0.25)", marginTop: 2 },
  btn: { width: "100%", padding: "16px 24px", background: "linear-gradient(135deg, #ff6b35, #ff3d6e)", color: "#fff", border: "none", borderRadius: 100, fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 13, fontWeight: 800, textAlign: "center" as const, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginTop: 8, boxShadow: "0 0 30px rgba(255,107,53,0.15)" },
  error: { padding: "12px 16px", background: "rgba(255,61,110,0.08)", border: "1px solid rgba(255,61,110,0.15)", borderRadius: 12, color: "#ff3d6e", fontSize: 13, marginBottom: 8 },
  planGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  planCard: { position: "relative" as const, textAlign: "left" as const, padding: "16px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, cursor: "pointer", fontFamily: "'Schibsted Grotesk', sans-serif", display: "flex", flexDirection: "column" as const, gap: 4 },
  planCardActive: { background: "rgba(255,107,53,0.06)", border: "1px solid rgba(255,107,53,0.35)" },
  planPopular: { position: "absolute" as const, top: -9, left: 12, padding: "2px 10px", background: "linear-gradient(135deg, #ff6b35, #ff3d6e)", color: "#fff", borderRadius: 100, fontSize: 8, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase" as const },
  planName: { fontSize: 12, fontWeight: 800, color: "#f5f5f5", textTransform: "uppercase" as const, letterSpacing: "0.04em", marginTop: 2 },
  planPrice: { fontSize: 22, fontWeight: 900, color: "#fff", letterSpacing: "-0.03em" },
  planPriceSuffix: { fontSize: 11, fontWeight: 600, color: "rgba(245,245,245,0.35)" },
  planFeatures: { listStyle: "none", padding: 0, margin: "6px 0 0", display: "flex", flexDirection: "column" as const, gap: 3 },
  planFeatureItem: { fontSize: 10, color: "rgba(245,245,245,0.4)", fontWeight: 500 },
  footer: { textAlign: "center" as const, fontSize: 13, color: "rgba(245,245,245,0.25)", marginTop: 24 },
  link: { color: "#ff6b35", textDecoration: "none", fontWeight: 700 },
};