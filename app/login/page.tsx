"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    router.push("/dashboard");
  };

  return (
    <div style={styles.page}>
      {/* Ambient */}
      <div style={styles.ambient}>
        <div style={{ ...styles.orb, ...styles.orb1 }} />
        <div style={{ ...styles.orb, ...styles.orb2 }} />
      </div>

      <div style={styles.container}>
        {/* Logo */}
        <a href="/" style={styles.logo}>
          <div style={styles.logoIcon}>C</div>
          <div style={styles.logoText}>
            Catalog<span style={{ color: "#00d4aa" }}>Store</span>
          </div>
        </a>

        <div style={styles.card}>
          <h1 style={styles.title}>Welcome back</h1>
          <p style={styles.subtitle}>Log in to manage your store.</p>

          {error && <div style={styles.error}>{error}</div>}

          <form onSubmit={handleLogin} style={styles.form}>
            <div style={styles.field}>
              <label style={styles.label}>Email</label>
              <input
                type="email"
                placeholder="you@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={styles.input}
              />
            </div>

            <div style={styles.field}>
              <label style={styles.label}>Password</label>
              <input
                type="password"
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={styles.input}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                ...styles.btnPrimary,
                opacity: loading ? 0.6 : 1,
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "Logging in..." : "Log In"}
            </button>
          </form>

          <p style={styles.footer}>
            Don&apos;t have an account?{" "}
            <a href="/signup" style={styles.link}>
              Create your store
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  page: {
    minHeight: "100vh",
    background: "#06060b",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    position: "relative",
    overflow: "hidden",
    padding: "40px 20px",
  },
  ambient: {
    position: "fixed",
    inset: 0,
    zIndex: 0,
    pointerEvents: "none",
  },
  orb: {
    position: "absolute",
    borderRadius: "50%",
    filter: "blur(140px)",
    opacity: 0.15,
  },
  orb1: {
    width: 600,
    height: 600,
    background: "radial-gradient(circle, #00d4aa 0%, transparent 70%)",
    top: -200,
    right: -100,
  },
  orb2: {
    width: 400,
    height: 400,
    background: "radial-gradient(circle, #8b5cf6 0%, transparent 70%)",
    bottom: -100,
    left: -100,
  },
  container: {
    width: "100%",
    maxWidth: 440,
    position: "relative",
    zIndex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 32,
  },
  logo: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    textDecoration: "none",
  },
  logoIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    background: "linear-gradient(135deg, #00d4aa 0%, #8b5cf6 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 16,
    fontWeight: 800,
    color: "#06060b",
    fontFamily: "'Bricolage Grotesque', sans-serif",
  },
  logoText: {
    fontFamily: "'Bricolage Grotesque', sans-serif",
    fontSize: 22,
    fontWeight: 700,
    color: "#eeeef2",
    letterSpacing: "-0.02em",
  },
  card: {
    width: "100%",
    background: "rgba(255,255,255,0.03)",
    backdropFilter: "blur(24px)",
    WebkitBackdropFilter: "blur(24px)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 20,
    padding: "40px 32px",
  },
  title: {
    fontFamily: "'Bricolage Grotesque', sans-serif",
    fontSize: 28,
    fontWeight: 700,
    color: "#eeeef2",
    marginBottom: 8,
    letterSpacing: "-0.02em",
  },
  subtitle: {
    fontSize: 15,
    color: "rgba(238,238,242,0.55)",
    lineHeight: 1.6,
    marginBottom: 28,
    fontWeight: 300,
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 20,
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: 500,
    color: "rgba(238,238,242,0.55)",
  },
  input: {
    width: "100%",
    padding: "14px 16px",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 12,
    color: "#eeeef2",
    fontSize: 15,
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    outline: "none",
    transition: "border-color 0.2s",
  },
  btnPrimary: {
    width: "100%",
    padding: "15px 24px",
    background: "#00d4aa",
    color: "#06060b",
    border: "none",
    borderRadius: 100,
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    fontSize: 15,
    fontWeight: 700,
    textAlign: "center" as const,
    textDecoration: "none",
    display: "block",
    marginTop: 8,
  },
  error: {
    padding: "12px 16px",
    background: "rgba(239,68,68,0.1)",
    border: "1px solid rgba(239,68,68,0.2)",
    borderRadius: 12,
    color: "#f87171",
    fontSize: 13,
    marginBottom: 8,
  },
  footer: {
    textAlign: "center" as const,
    fontSize: 14,
    color: "rgba(238,238,242,0.35)",
    marginTop: 24,
  },
  link: {
    color: "#00d4aa",
    textDecoration: "none",
    fontWeight: 600,
  },
};
