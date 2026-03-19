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
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) { setError(authError.message); setLoading(false); return; }
    router.push("/dashboard");
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
          <h1 style={s.title}>WELCOME BACK</h1>
          <p style={s.subtitle}>Log in to manage your store.</p>

          {error && <div style={s.error}>{error}</div>}

          <form onSubmit={handleLogin} style={s.form}>
            <div style={s.field}>
              <label style={s.label}>EMAIL</label>
              <input type="email" placeholder="you@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required style={s.input} />
            </div>

            <div style={s.field}>
              <label style={s.label}>PASSWORD</label>
              <div style={s.passWrap}>
                <input type={showPassword ? "text" : "password"} placeholder="Your password" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ ...s.input, paddingRight: 48 }} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} style={s.eyeBtn}><Eye open={showPassword} /></button>
              </div>
            </div>

            <button type="submit" disabled={loading} style={{ ...s.btn, opacity: loading ? 0.6 : 1, cursor: loading ? "not-allowed" : "pointer" }}>
              {loading ? "LOGGING IN..." : "LOG IN"}
            </button>
          </form>

          <p style={s.footer}>{"Don't have an account? "}<a href="/signup" style={s.link}>Create your store</a></p>
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
  footer: { textAlign: "center" as const, fontSize: 13, color: "rgba(245,245,245,0.25)", marginTop: 24 },
  link: { color: "#ff6b35", textDecoration: "none", fontWeight: 700 },
};
