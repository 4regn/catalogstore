"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";

/* Password reset landing page.

   Flow:
   1. Seller hits "Forgot?" on /login
   2. Supabase sends them a recovery email with a link pointing here
      (the link puts a recovery access_token in the URL hash)
   3. Supabase's client picks up the token automatically and fires a
      PASSWORD_RECOVERY auth event. We listen for that and unlock the
      "set new password" form.
   4. They type a new password, we call supabase.auth.updateUser, then
      redirect to the dashboard. */

export default function ResetPassword() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const passwordChecks = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
  };
  const allChecks = Object.values(passwordChecks).every(Boolean);
  const matches = password === confirm && confirm !== "";

  useEffect(() => {
    /* Two paths get us here with a usable session:
       a) the email-link redirect just fired and supabase processed the
          hash → onAuthStateChange('PASSWORD_RECOVERY') fires
       b) the user already has an active recovery session (e.g. refreshed)
          → getSession returns it */
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setReady(true);
        setCheckingSession(false);
      }
    });

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) setReady(true);
      setCheckingSession(false);
    })();

    return () => { sub.subscription.unsubscribe(); };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!allChecks) { setError("Password does not meet all requirements."); return; }
    if (!matches) { setError("Passwords do not match."); return; }
    setSubmitting(true);
    const { error: updErr } = await supabase.auth.updateUser({ password });
    if (updErr) { setError(updErr.message); setSubmitting(false); return; }
    setDone(true);
    setTimeout(() => router.push("/dashboard"), 1500);
  };

  const Check = ({ ok, label }: { ok: boolean; label: string }) => (
    <li style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: ok ? "#22c55e" : "rgba(245,245,245,0.4)", lineHeight: 1.8 }}>
      <span style={{ width: 14, height: 14, borderRadius: "50%", background: ok ? "rgba(34,197,94,0.18)" : "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 900, color: ok ? "#22c55e" : "rgba(245,245,245,0.3)" }}>{ok ? "✓" : "○"}</span>
      {label}
    </li>
  );

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
          {checkingSession ? (
            <>
              <h1 style={s.title}>CHECKING LINK…</h1>
              <p style={s.subtitle}>Hang on a second.</p>
            </>
          ) : done ? (
            <>
              <h1 style={s.title}>PASSWORD UPDATED</h1>
              <p style={s.subtitle}>Taking you to your dashboard…</p>
            </>
          ) : !ready ? (
            <>
              <h1 style={s.title}>LINK EXPIRED</h1>
              <p style={s.subtitle}>This reset link isn&apos;t valid anymore — they expire after a short time for security. Request a new one from the login page.</p>
              <a href="/login" style={{ ...s.btn, display: "inline-block", textAlign: "center", textDecoration: "none", padding: "14px 24px", marginTop: 16 }}>
                BACK TO LOGIN
              </a>
            </>
          ) : (
            <>
              <h1 style={s.title}>SET A NEW PASSWORD</h1>
              <p style={s.subtitle}>Pick something you&apos;ll remember. You&apos;ll be signed in straight after.</p>

              {error && <div style={s.error} role="alert">{error}</div>}

              <form onSubmit={handleSubmit} style={s.form}>
                <div style={s.field}>
                  <label style={s.label}>NEW PASSWORD</label>
                  <div style={s.passWrap}>
                    <input type={showPassword ? "text" : "password"} placeholder="At least 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" autoFocus style={{ ...s.input, paddingRight: 48 }} />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"} style={s.eyeBtn}><Eye open={showPassword} /></button>
                  </div>
                  {password && (
                    <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0" }}>
                      <Check ok={passwordChecks.length} label="At least 8 characters" />
                      <Check ok={passwordChecks.uppercase} label="One uppercase letter" />
                      <Check ok={passwordChecks.lowercase} label="One lowercase letter" />
                      <Check ok={passwordChecks.special} label="One symbol (e.g. !@#)" />
                    </ul>
                  )}
                </div>

                <div style={s.field}>
                  <label style={s.label}>CONFIRM NEW PASSWORD</label>
                  <input type={showPassword ? "text" : "password"} placeholder="Type it again" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" style={s.input} />
                  {confirm && !matches && <div style={{ fontSize: 11, color: "#ff3d6e", marginTop: 6 }}>Passwords don&apos;t match yet.</div>}
                </div>

                <button type="submit" disabled={submitting || !allChecks || !matches} style={{ ...s.btn, opacity: submitting || !allChecks || !matches ? 0.6 : 1, cursor: submitting || !allChecks || !matches ? "not-allowed" : "pointer" }}>
                  {submitting ? "UPDATING…" : "UPDATE PASSWORD"}
                </button>
              </form>
            </>
          )}
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
  input: { width: "100%", padding: "14px 16px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, color: "#f5f5f5", fontSize: 14, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none" },
  passWrap: { position: "relative" as const },
  eyeBtn: { position: "absolute" as const, right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" },
  btn: { width: "100%", padding: "16px 24px", background: "linear-gradient(135deg, #ff6b35, #ff3d6e)", color: "#fff", border: "none", borderRadius: 100, fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 13, fontWeight: 800, textAlign: "center" as const, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginTop: 8, boxShadow: "0 0 30px rgba(255,107,53,0.15)" },
  error: { padding: "12px 16px", background: "rgba(255,61,110,0.08)", border: "1px solid rgba(255,61,110,0.15)", borderRadius: 12, color: "#ff3d6e", fontSize: 13, marginBottom: 8 },
};
