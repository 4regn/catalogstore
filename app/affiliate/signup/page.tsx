"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 24);
}

export default function AffiliateSignup() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Step 1: Account
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  // Step 2: Banking
  const [bankName, setBankName] = useState(SA_BANKS[0].name);
  const [accountNumber, setAccountNumber] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [accountType, setAccountType] = useState<"cheque" | "savings">("cheque");
  const [agreeTerms, setAgreeTerms] = useState(false);

  const branchCode = SA_BANKS.find((b) => b.name === bankName)?.branch || "";

  function validateStep1() {
    if (!fullName.trim() || fullName.trim().length < 2) return "Enter your full name";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid email";
    if (!/^(\+27|0)[6-8][0-9]{8}$/.test(phone.replace(/\s/g, "")))
      return "Enter a valid SA phone number";
    if (password.length < 8) return "Password must be at least 8 characters";
    return "";
  }

  function validateStep2() {
    if (!accountNumber.trim() || accountNumber.length < 6) return "Enter a valid account number";
    if (!accountHolder.trim()) return "Enter the account holder name";
    if (!agreeTerms) return "You must agree to the terms";
    return "";
  }

  async function handleNext() {
    const err = validateStep1();
    if (err) return setError(err);
    setError("");
    setStep(2);
  }

  async function handleSubmit() {
    const err = validateStep2();
    if (err) return setError(err);
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/affiliate/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.replace(/\s/g, ""),
          password,
          bankName,
          accountNumber: accountNumber.trim(),
          accountHolder: accountHolder.trim(),
          accountType,
          branchCode,
          slug: slugify(fullName),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Signup failed");

      // Sign in with the new credentials
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (signInErr) throw signInErr;

      router.push("/affiliate/dashboard");
    } catch (e: any) {
      setError(e.message || "Something went wrong");
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
                fill="url(#logo-grad)"
              />
              <defs>
                <linearGradient id="logo-grad" x1="0" y1="0" x2="24" y2="24">
                  <stop offset="0" stopColor="#ff6b35" />
                  <stop offset="1" stopColor="#ff3d6e" />
                </linearGradient>
              </defs>
            </svg>
            Catalog<span style={styles.logoAccent}>Store</span>
            <span style={styles.pill}>Affiliate</span>
          </div>
        </div>

        <div style={styles.card}>
          <div style={styles.stepTrack}>
            <div style={{ ...styles.stepDot, ...(step >= 1 ? styles.stepDotActive : {}) }}>1</div>
            <div style={{ ...styles.stepLine, ...(step >= 2 ? styles.stepLineActive : {}) }} />
            <div style={{ ...styles.stepDot, ...(step >= 2 ? styles.stepDotActive : {}) }}>2</div>
          </div>

          {step === 1 ? (
            <>
              <h1 style={styles.title}>Become an affiliate</h1>
              <p style={styles.sub}>
                Earn <strong style={{ color: "#fff" }}>50%</strong> of every seller's subscription
                for the first <strong style={{ color: "#fff" }}>6 months</strong>. Paid out monthly.
              </p>

              <div style={styles.field}>
                <label style={styles.label}>Full name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Nkululeko Mathonsi"
                  style={styles.input}
                />
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  style={styles.input}
                />
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Phone (SA only)</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0821234567"
                  style={styles.input}
                />
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  style={styles.input}
                />
              </div>

              {error && <div style={styles.error}>{error}</div>}

              <button onClick={handleNext} style={styles.btnPrimary}>
                Continue → Banking details
              </button>

              <p style={styles.legal}>
                Already an affiliate?{" "}
                <a href="/affiliate/login" style={styles.link}>
                  Sign in
                </a>
              </p>
            </>
          ) : (
            <>
              <h1 style={styles.title}>Banking details</h1>
              <p style={styles.sub}>
                Where should we send your payouts? Minimum withdrawal{" "}
                <strong style={{ color: "#fff" }}>R150</strong>.
              </p>

              <div style={styles.field}>
                <label style={styles.label}>Bank</label>
                <select
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  style={styles.input}
                >
                  {SA_BANKS.map((b) => (
                    <option key={b.name} value={b.name}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Account holder name</label>
                <input
                  type="text"
                  value={accountHolder}
                  onChange={(e) => setAccountHolder(e.target.value)}
                  placeholder="Must match your full name"
                  style={styles.input}
                />
                <p style={styles.hint}>
                  Mismatched names will delay your first payout while we verify.
                </p>
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Account number</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))}
                  placeholder="62XXXXXXXXX"
                  style={styles.input}
                />
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Account type</label>
                <div style={styles.segmented}>
                  <button
                    onClick={() => setAccountType("cheque")}
                    style={{
                      ...styles.segment,
                      ...(accountType === "cheque" ? styles.segmentActive : {}),
                    }}
                  >
                    Cheque
                  </button>
                  <button
                    onClick={() => setAccountType("savings")}
                    style={{
                      ...styles.segment,
                      ...(accountType === "savings" ? styles.segmentActive : {}),
                    }}
                  >
                    Savings
                  </button>
                </div>
              </div>

              <label style={styles.checkRow}>
                <input
                  type="checkbox"
                  checked={agreeTerms}
                  onChange={(e) => setAgreeTerms(e.target.checked)}
                  style={styles.checkbox}
                />
                <span style={styles.checkText}>
                  I confirm these details are correct and agree to the{" "}
                  <a href="/affiliate/terms" style={styles.link}>
                    affiliate terms
                  </a>
                  .
                </span>
              </label>

              {error && <div style={styles.error}>{error}</div>}

              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setStep(1)} style={styles.btnSecondary} disabled={loading}>
                  ← Back
                </button>
                <button
                  onClick={handleSubmit}
                  style={{ ...styles.btnPrimary, flex: 1 }}
                  disabled={loading}
                >
                  {loading ? "Creating account..." : "Create affiliate account"}
                </button>
              </div>
            </>
          )}
        </div>
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
  },
  atmosphere: {
    position: "fixed",
    inset: 0,
    background:
      "radial-gradient(ellipse 80% 40% at 50% -10%,rgba(255,107,53,0.08) 0%,transparent 60%),radial-gradient(ellipse 60% 30% at 0% 30%,rgba(255,61,110,0.04) 0%,transparent 60%)",
    pointerEvents: "none",
    zIndex: 0,
  },
  wrap: { position: "relative", zIndex: 1, maxWidth: 460, margin: "0 auto" },
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
  stepTrack: { display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 22 },
  stepDot: {
    width: 26,
    height: 26,
    borderRadius: "50%",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.1)",
    color: "rgba(245,245,245,0.4)",
    fontSize: 11,
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  stepDotActive: {
    background: "linear-gradient(135deg,#ff6b35,#ff3d6e)",
    color: "#fff",
    border: "1px solid transparent",
  },
  stepLine: { flex: 1, height: 1, background: "rgba(255,255,255,0.08)", maxWidth: 80 },
  stepLineActive: { background: "linear-gradient(90deg,#ff6b35,#ff3d6e)" },
  title: { fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 6 },
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
  hint: { fontSize: 11, color: "rgba(245,245,245,0.35)", marginTop: 6, lineHeight: 1.4 },
  segmented: { display: "flex", gap: 4, background: "#08080c", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: 3 },
  segment: {
    flex: 1,
    padding: "10px",
    background: "transparent",
    border: "none",
    color: "rgba(245,245,245,0.55)",
    fontSize: 12,
    fontWeight: 600,
    fontFamily: "inherit",
    cursor: "pointer",
    borderRadius: 8,
  },
  segmentActive: { background: "rgba(255,255,255,0.06)", color: "#f5f5f5" },
  checkRow: { display: "flex", alignItems: "flex-start", gap: 10, margin: "16px 0 18px", cursor: "pointer" },
  checkbox: { marginTop: 3, accentColor: "#ff6b35" },
  checkText: { fontSize: 12, color: "rgba(245,245,245,0.6)", lineHeight: 1.4 },
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
  btnSecondary: {
    padding: "14px 18px",
    background: "rgba(255,255,255,0.04)",
    color: "rgba(245,245,245,0.7)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 12,
    fontFamily: "inherit",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    cursor: "pointer",
  },
  legal: { fontSize: 12, color: "rgba(245,245,245,0.4)", textAlign: "center", marginTop: 16 },
  link: { color: "#ff6b35", textDecoration: "none", fontWeight: 600 },
};
