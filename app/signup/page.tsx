"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";

export default function SignUp() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [storeName, setStoreName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const passwordChecks = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
  };

  const allChecksPassed = Object.values(passwordChecks).every(Boolean);
  const passwordsMatch = password === confirmPassword && confirmPassword !== "";

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!allChecksPassed) {
      setError("Password does not meet all requirements.");
      return;
    }

    if (!passwordsMatch) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    if (authData.user) {
      const subdomain = storeName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      const { error: profileError } = await supabase.from("sellers").insert({
        id: authData.user.id,
        email: email,
        store_name: storeName,
        whatsapp_number: whatsapp,
        subdomain: subdomain,
      });

      if (profileError) {
        setError(profileError.message);
        setLoading(false);
        return;
      }

      router.push("/dashboard");
    }

    setLoading(false);
  };

  const EyeOpen = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(238,238,242,0.45)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
  );

  const EyeClosed = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(238,238,242,0.45)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
  );

  return (
    <div style={styles.page}>
      <div style={styles.ambient}>
        <div style={{ ...styles.orb, ...styles.orb1 }} />
        <div style={{ ...styles.orb, ...styles.orb2 }} />
      </div>

      <div style={styles.container}>
        <a href="/" style={styles.logo}>
          <div style={styles.logoIcon}>C</div>
          <div style={styles.logoText}>
            Catalog<span style={{ color: "#00d4aa" }}>Store</span>
          </div>
        </a>

        <div style={styles.card}>
          <h1 style={styles.title}>Create your store</h1>
          <p style={styles.subtitle}>
            Set up your CatalogStore account in 30 seconds.
          </p>

          {error && <div style={styles.error}>{error}</div>}

          <form onSubmit={handleSignUp} style={styles.form}>
            <div style={styles.field}>
              <label style={styles.label}>Store Name</label>
              <input
                type="text"
                placeholder="e.g. NALA Studio"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                required
                style={styles.input}
              />
              {storeName && (
                <div style={styles.hint}>
                  Your store URL:{" "}
                  <span style={{ color: "#00d4aa" }}>
                    {storeName
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, "-")
                      .replace(/^-|-$/g, "")}
                  </span>
                  .catalogstore.co.za
                </div>
              )}
            </div>

            <div style={styles.field}>
              <label style={styles.label}>WhatsApp Number</label>
              <input
                type="tel"
                placeholder="e.g. 0678577919"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                required
                style={styles.input}
              />
            </div>

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
              <div style={styles.passwordWrap}>
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  style={{ ...styles.input, paddingRight: 48 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={styles.eyeBtn}
                >
                  {showPassword ? <EyeClosed /> : <EyeOpen />}
                </button>
              </div>

              {password && (
                <div style={styles.checks}>
                  <div style={{ ...styles.checkItem, color: passwordChecks.length ? "#00d4aa" : "rgba(238,238,242,0.35)" }}>
                    {passwordChecks.length ? "\u2713" : "\u2717"} At least 8 characters
                  </div>
                  <div style={{ ...styles.checkItem, color: passwordChecks.uppercase ? "#00d4aa" : "rgba(238,238,242,0.35)" }}>
                    {passwordChecks.uppercase ? "\u2713" : "\u2717"} One uppercase letter
                  </div>
                  <div style={{ ...styles.checkItem, color: passwordChecks.lowercase ? "#00d4aa" : "rgba(238,238,242,0.35)" }}>
                    {passwordChecks.lowercase ? "\u2713" : "\u2717"} One lowercase letter
                  </div>
                  <div style={{ ...styles.checkItem, color: passwordChecks.special ? "#00d4aa" : "rgba(238,238,242,0.35)" }}>
                    {passwordChecks.special ? "\u2713" : "\u2717"} One special character
                  </div>
                </div>
              )}
            </div>

            <div style={styles.field}>
              <label style={styles.label}>Confirm Password</label>
              <div style={styles.passwordWrap}>
                <input
                  type={showConfirm ? "text" : "password"}
                  placeholder="Type your password again"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  style={{ ...styles.input, paddingRight: 48 }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  style={styles.eyeBtn}
                >
                  {showConfirm ? <EyeClosed /> : <EyeOpen />}
                </button>
              </div>
              {confirmPassword && (
                <div style={{ ...styles.checkItem, marginTop: 6, color: passwordsMatch ? "#00d4aa" : "#f87171" }}>
                  {passwordsMatch ? "\u2713 Passwords match" : "\u2717 Passwords do not match"}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || !allChecksPassed || !passwordsMatch}
              style={{
                ...styles.btnPrimary,
                opacity: loading || !allChecksPassed || !passwordsMatch ? 0.4 : 1,
                cursor: loading || !allChecksPassed || !passwordsMatch ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "Creating your store..." : "Create My Store"}
            </button>
          </form>

          <p style={styles.footer}>
            Already have an account?{" "}
            <a href="/login" style={styles.link}>
              Log in
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
  passwordWrap: {
    position: "relative",
  },
  eyeBtn: {
    position: "absolute",
    right: 14,
    top: "50%",
    transform: "translateY(-50%)",
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  checks: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    marginTop: 8,
  },
  checkItem: {
    fontSize: 12,
    fontWeight: 500,
  },
  hint: {
    fontSize: 12,
    color: "rgba(238,238,242,0.35)",
    marginTop: 2,
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
    textAlign: "center",
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
    textAlign: "center",
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
