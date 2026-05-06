"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";

export default function AffiliateLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("Enter your email and password");
      return;
    }

    setLoading(true);
    try {
      const { data, error: signInErr } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (signInErr) throw signInErr;
      if (!data.user) throw new Error("Login failed");

      // Check if this user is an affiliate
      const { data: aff, error: affErr } = await supabase
        .from("affiliates")
        .select("id")
        .eq("user_id", data.user.id)
        .maybeSingle();

      if (affErr) throw affErr;

      if (!aff) {
        // Logged in but not an affiliate — sign out and redirect to signup
        await supabase.auth.signOut();
        setError("This account isn't registered as an affiliate. Sign up first.");
        setLoading(false);
        return;
      }

      router.push("/affiliate/dashboard");
    } catch (e: any) {
      setError(e.message || "Login failed");
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.atmosphere} />

      <div style={styles.wrap}>
        <div style={styles.header}>
          <div style={styles.logo}>
            <svg viewBox="0 0 24 24" fill="none" style={{ width: 22, height: 22 }}>
              <path
                d="M22 12C22 6.48 17.52 2 12 2S2 6.48 2 12s4.48 10 10 10c2.83 0 5.39-1.18 7.21-3.07l-2.13-2.13A6.99 6.99 0 0 1 12 19c-3.86 0-7-3.14-7-7s3.14-7 7-7 7 3.14 7 7h-3l4 4 4-4h-3z"
                fill="url(#login-grad)"
              />
              <defs>
                <linearGradient id="login-grad" x1="0" y1="0" x2="24" y2="24">
                  <stop offset="0" stopColor="#ff6b35" />
                  <stop offset="1" stopColor="#ff3d6e" />
                </linearGradient>
              </defs>
            </svg>
            Catalog<span style={styles.logoAccent}>Store</span>
            <span style={styles.pill}>Affiliate</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={styles.card}>
          <h1 style={styles.title}>Welcome back</h1>
          <p style={styles.sub}>Sign in to your affiliate account.</p>

          <div style={styles.field}>
            <label style={styles.label}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              autoFocus
              style={styles.input}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              style={styles.input}
            />
          </div>

          {error && <div style={styles.error}>{error}</div>}

          <button type="submit" disabled={loading} style={styles.btnPrimary}>
            {loading ? "Signing in..." : "Sign in"}
          </button>

          <div style={styles.divider}>
            <span style={styles.dividerLine} />
            <span style={styles.dividerText}>or</span>
            <span style={styles.dividerLine} />
          </div>

          <a href="/affiliate/signup" style={styles.btnSecondary}>
            Create an affiliate account
          </a>

          <p style={styles.legal}>
            <a href="/affiliate/forgot" style={styles.link}>
              Forgot your password?
            </a>
          </p>
        </form>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#08080c",
    color: "#f5f5f5",
    fontFamily: "'Schibsted Grotesk', sans-serif",
    position: "relative",
    padding: "24px 18px 60px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  },
  atmosphere: {
    position: "fixed",
    inset: 0,
    background:
      "radial-gradient(ellipse 80% 40% at 50% -10%,rgba(255,107,53,0.08) 0%,transparent 60%),radial-gradient(ellipse 60% 30% at 0% 30%,rgba(255,61,110,0.04) 0%,transparent 60%)",
    pointerEvents: "none",
    zIndex: 0,
  },
  wrap: { position: "relative", zIndex: 1, width: "100%", maxWidth: 420 },
  header: { textAlign: "center", marginBottom: 24 },
  logo: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    fontWeight: 900,
    letterSpacing: "-0.02em",
    textTransform: "uppercase",
  },
  logoAccent: {
    background: "linear-gradient(135deg,#ff6b35,#ff3d6e)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
  },
  pill: {
    fontSize: 9,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    fontWeight: 700,
    color: "#ff6b35",
    background: "rgba(255,107,53,0.08)",
    border: "1px solid rgba(255,107,53,0.18)",
    padding: "3px 9px",
    borderRadius: 100,
    marginLeft: 4,
  },
  card: {
    background: "#0e0e14",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 20,
    padding: 26,
  },
  title: { fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 6 },
  sub: { fontSize: 13, color: "rgba(245,245,245,0.55)", lineHeight: 1.5, marginBottom: 22 },
  field: { marginBottom: 14 },
  label: {
    display: "block",
    fontSize: 10,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    fontWeight: 600,
    color: "rgba(245,245,245,0.5)",
    marginBottom: 6,
  },
  input: {
    width: "100%",
    padding: "12px 14px",
    background: "#08080c",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 10,
    color: "#f5f5f5",
    fontSize: 14,
    fontFamily: "inherit",
    outline: "none",
  },
  error: {
    background: "rgba(239,68,68,0.08)",
    border: "1px solid rgba(239,68,68,0.25)",
    color: "#fca5a5",
    padding: "10px 14px",
    borderRadius: 10,
    fontSize: 12,
    marginBottom: 14,
  },
  btnPrimary: {
    width: "100%",
    padding: "14px",
    background: "linear-gradient(135deg,#ff6b35,#ff3d6e)",
    color: "#fff",
    border: "none",
    borderRadius: 12,
    fontFamily: "inherit",
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    cursor: "pointer",
    boxShadow: "0 0 0 1px rgba(255,255,255,0.1) inset, 0 12px 32px rgba(255,107,53,0.25)",
  },
  divider: { display: "flex", alignItems: "center", gap: 10, margin: "18px 0" },
  dividerLine: { flex: 1, height: 1, background: "rgba(255,255,255,0.08)" },
  dividerText: {
    fontSize: 10,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    fontWeight: 600,
    color: "rgba(245,245,245,0.32)",
  },
  btnSecondary: {
    display: "block",
    width: "100%",
    padding: "13px",
    background: "rgba(255,255,255,0.04)",
    color: "#f5f5f5",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 12,
    fontFamily: "inherit",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    textAlign: "center",
    textDecoration: "none",
    cursor: "pointer",
    boxSizing: "border-box",
  },
  legal: { fontSize: 12, color: "rgba(245,245,245,0.4)", textAlign: "center", marginTop: 16 },
  link: { color: "#ff6b35", textDecoration: "none", fontWeight: 600 },
};
