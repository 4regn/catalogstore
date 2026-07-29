"use client";

import { FormEvent, useState } from "react";

function EyeIcon({ off }: { off: boolean }) {
  return off ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="16" height="16"><path d="M3 3l18 18" /><path d="M10.6 5.1A10.9 10.9 0 0112 5c6 0 10 6 10 7-.5.9-1.6 2.4-3.2 3.7M6.6 6.6C4.4 8 3 10.3 2 12c0 1 4 7 10 7 1.4 0 2.7-.3 3.9-.8" /><path d="M9.9 10a3 3 0 004.2 4.2" /></svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="16" height="16"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
  );
}

export default function PartnerApplyClient({ storeName }: { storeName: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [reusedExistingAccount, setReusedExistingAccount] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const values = new FormData(event.currentTarget);
    const fullName = String(values.get("fullName") || "").trim();
    const email = String(values.get("email") || "").trim().toLowerCase();
    const phone = String(values.get("phone") || "").trim();
    const password = String(values.get("password") || "");
    const confirmPassword = String(values.get("confirmPassword") || "");

    if (password !== confirmPassword) {
      setError("Passwords don't match");
      setBusy(false);
      return;
    }

    const res = await fetch("/api/unik/partners/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName, email, phone, password, confirmPassword }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(payload.error || "Could not submit your application");
      setBusy(false);
      return;
    }
    setReusedExistingAccount(!!payload.reusedExistingAccount);
    setSubmitted(true);
    setBusy(false);
  }

  return (
    <main className="pnr-page">
      <div className="pnr-card">
        <img className="pnr-logo" src="/private-templates/unik-labs/assets/unik-logo-v3-header.png" alt={storeName} />
        <p className="pnr-kicker">{storeName} — Official Partner</p>
        {submitted ? (
          <>
            <h1>Application received</h1>
            <p className="pnr-sub">
              We'll review your application and email you once it's approved. You can sign in any time to check its status.
              {reusedExistingAccount && " You already had an account with us, so sign in with your existing password — the one you just typed here wasn't set on that account."}
            </p>
            <a className="pnr-primary pnr-link-btn" href="login">Go to sign in</a>
          </>
        ) : (
          <>
            <h1>Become a partner</h1>
            <p className="pnr-sub">Get your own discount code and referral link, and earn a commission on every sale you drive.</p>
            <form onSubmit={submit}>
              <label>Full name<input name="fullName" type="text" autoComplete="name" required /></label>
              <label>Email address<input name="email" type="email" autoComplete="email" required /></label>
              <label>Phone number<input name="phone" type="tel" placeholder="e.g. 082 123 4567" autoComplete="tel" required /></label>
              <label>
                Password
                <div className="pnr-password-row">
                  <input name="password" type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={8} required />
                  <button type="button" className="pnr-eye-btn" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((v) => !v)}>
                    <EyeIcon off={showPassword} />
                  </button>
                </div>
              </label>
              <label>
                Confirm password
                <div className="pnr-password-row">
                  <input name="confirmPassword" type={showConfirm ? "text" : "password"} autoComplete="new-password" minLength={8} required />
                  <button type="button" className="pnr-eye-btn" aria-label={showConfirm ? "Hide password" : "Show password"} onClick={() => setShowConfirm((v) => !v)}>
                    <EyeIcon off={showConfirm} />
                  </button>
                </div>
              </label>
              {error && <p className="pnr-error">{error}</p>}
              <button className="pnr-primary" disabled={busy}>{busy ? "Submitting…" : "Submit application"}</button>
            </form>
            <a className="pnr-forgot" href="login">Already applied? Sign in</a>
          </>
        )}
      </div>

      <style jsx global>{`
        html,body{margin:0;background:#060606;color:#f7f7f4;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        .pnr-page{min-height:100dvh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 92% 2%,rgba(0,117,23,.12),transparent 30%),#060606}
        .pnr-card{width:min(400px,100%);padding:30px 26px;border:1px solid #27272a;border-radius:22px;background:linear-gradient(145deg,rgba(18,18,20,.98),rgba(11,11,12,.98));box-shadow:0 24px 70px rgba(0,0,0,.38)}
        .pnr-logo{height:26px;width:auto;display:block;margin:0 0 16px}
        .pnr-kicker{color:#16a34a;font-size:10px;font-weight:900;letter-spacing:.16em;text-transform:uppercase;margin:0 0 10px}
        .pnr-card h1{margin:0 0 10px;font-size:26px;letter-spacing:-.03em;font-weight:700}
        .pnr-sub{margin:0 0 20px;color:#c0c0ba;font-size:13px;line-height:1.55}
        .pnr-card form{display:grid;gap:14px}
        .pnr-card label{display:grid;gap:7px;color:#c0c0ba;font-size:9px;font-weight:800;letter-spacing:.11em;text-transform:uppercase}
        .pnr-card input{min-height:46px;padding:0 13px;color:#fff;border:1px solid #27272a;border-radius:12px;outline:none;background:#111113;font-size:14px;width:100%}
        .pnr-card input:focus{border-color:rgba(0,117,23,.6);box-shadow:0 0 0 3px rgba(0,117,23,.12)}
        .pnr-password-row{position:relative;display:flex}
        .pnr-password-row input{padding-right:42px}
        .pnr-eye-btn{position:absolute;right:6px;top:0;bottom:0;width:32px;display:grid;place-items:center;background:none;border:0;color:#8f8f89;cursor:pointer}
        .pnr-eye-btn:hover{color:#fff}
        .pnr-error{margin:0;color:#ff8b84;font-size:12px;line-height:1.5}
        .pnr-primary{margin-top:4px;min-height:46px;border:1px solid #007517;border-radius:13px;background:#007517;color:#fff;font-weight:800;cursor:pointer;box-shadow:0 12px 30px rgba(0,117,23,.22)}
        .pnr-primary:disabled{opacity:.6;cursor:wait}
        .pnr-link-btn{display:flex;align-items:center;justify-content:center;text-decoration:none}
        .pnr-forgot{display:block;margin-top:16px;text-align:center;color:#999994;font-size:12px;text-decoration:none}
        .pnr-forgot:hover{color:#fff}
      `}</style>
    </main>
  );
}
