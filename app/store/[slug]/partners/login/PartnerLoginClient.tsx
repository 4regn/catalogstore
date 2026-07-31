"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "../../../../../lib/supabase";

function EyeIcon({ off }: { off: boolean }) {
  return off ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="16" height="16"><path d="M3 3l18 18" /><path d="M10.6 5.1A10.9 10.9 0 0112 5c6 0 10 6 10 7-.5.9-1.6 2.4-3.2 3.7M6.6 6.6C4.4 8 3 10.3 2 12c0 1 4 7 10 7 1.4 0 2.7-.3 3.9-.8" /><path d="M9.9 10a3 3 0 004.2 4.2" /></svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="16" height="16"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
  );
}

// "Forgot your password?" used to link to a root-domain-only /reset-password
// page that 404'd from here (this page is always store-scoped, e.g.
// uniklabs.co.za/partners/login, and no equivalent route exists under
// app/store/[slug]/). Handled in-page instead, same pattern as the working
// UNIK customer account flow (UnikAccountClient.tsx): request a reset link,
// Supabase redirects back here with a recovery session, onAuthStateChange
// picks up PASSWORD_RECOVERY and swaps to the "set a new password" view.
export default function PartnerLoginClient({ storeName }: { storeName: string }) {
  const [view, setView] = useState<"form" | "forgot" | "recovery">("form");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [recoveryPassword, setRecoveryPassword] = useState("");
  const [recoveryConfirm, setRecoveryConfirm] = useState("");
  const [showRecoveryPassword, setShowRecoveryPassword] = useState(false);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setView("recovery");
        setError("");
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function finishLogin(accessToken: string) {
    const res = await fetch("/api/unik/partners/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken }),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      await supabase.auth.signOut();
      setError(payload.error || "This account doesn't have Partner access");
      setBusy(false);
      return;
    }
    window.location.href = "dashboard";
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const values = new FormData(event.currentTarget);
    const email = String(values.get("email") || "").trim().toLowerCase();
    const password = String(values.get("password") || "");

    const { data: signInData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError || !signInData.session) {
      setError(authError?.message || "Could not sign in");
      setBusy(false);
      return;
    }
    await finishLogin(signInData.session.access_token);
  }

  async function requestPasswordReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const trimmedEmail = resetEmail.trim().toLowerCase();
    const redirectTo = window.location.href.split("#")[0].split("?")[0];
    const { error: authError } = await supabase.auth.resetPasswordForEmail(trimmedEmail, { redirectTo });
    if (authError) setError(authError.message);
    else setResetSent(true);
    setBusy(false);
  }

  async function recoverySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (recoveryPassword.length < 8) { setError("Password must be at least 8 characters"); return; }
    if (recoveryPassword !== recoveryConfirm) { setError("Passwords don't match"); return; }
    setBusy(true);
    const { error: authError } = await supabase.auth.updateUser({ password: recoveryPassword });
    if (authError) { setError(authError.message); setBusy(false); return; }
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) { setError("Session expired — please sign in again."); setBusy(false); setView("form"); return; }
    await finishLogin(sessionData.session.access_token);
  }

  return (
    <main className="pnr-page">
      <div className="pnr-card">
        <img className="pnr-logo" src="/private-templates/unik-labs/assets/unik-logo-v3-header.png" alt={storeName} />
        <p className="pnr-kicker">{storeName} — Official Partner</p>
        {view === "recovery" ? (
          <>
            <h1>Set a new password</h1>
            <form onSubmit={recoverySubmit}>
              <label>
                New password
                <div className="pnr-password-row">
                  <input type={showRecoveryPassword ? "text" : "password"} value={recoveryPassword} onChange={(e) => setRecoveryPassword(e.target.value)} minLength={8} autoComplete="new-password" autoFocus required />
                  <button type="button" className="pnr-eye-btn" aria-label={showRecoveryPassword ? "Hide password" : "Show password"} onClick={() => setShowRecoveryPassword((v) => !v)}>
                    <EyeIcon off={showRecoveryPassword} />
                  </button>
                </div>
              </label>
              <label>Confirm new password<input type={showRecoveryPassword ? "text" : "password"} value={recoveryConfirm} onChange={(e) => setRecoveryConfirm(e.target.value)} minLength={8} autoComplete="new-password" required /></label>
              {error && <p className="pnr-error">{error}</p>}
              <button className="pnr-primary" disabled={busy}>{busy ? "Updating…" : "Update password"}</button>
            </form>
          </>
        ) : view === "forgot" ? (
          <>
            <h1>Reset password</h1>
            {resetSent ? (
              <>
                <p className="pnr-sub">Check {resetEmail} for a link to reset your password.</p>
                <button type="button" className="pnr-primary pnr-link-btn" style={{ border: "1px solid #27272a", background: "transparent" }} onClick={() => { setView("form"); setResetSent(false); setError(""); }}>Back to sign in</button>
              </>
            ) : (
              <form onSubmit={requestPasswordReset}>
                <label>Email address<input type="email" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} autoComplete="email" required autoFocus /></label>
                {error && <p className="pnr-error">{error}</p>}
                <button className="pnr-primary" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</button>
                <a className="pnr-forgot" href="#" onClick={(e) => { e.preventDefault(); setView("form"); setError(""); }}>Back to sign in</a>
              </form>
            )}
          </>
        ) : (
          <>
            <h1>Sign in</h1>
            <form onSubmit={submit}>
              <label>Email address<input name="email" type="email" autoComplete="email" required /></label>
              <label>
                Password
                <div className="pnr-password-row">
                  <input name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required />
                  <button type="button" className="pnr-eye-btn" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((v) => !v)}>
                    <EyeIcon off={showPassword} />
                  </button>
                </div>
              </label>
              {error && <p className="pnr-error">{error}</p>}
              <button className="pnr-primary" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
            </form>
            <a className="pnr-forgot" href="#" onClick={(e) => { e.preventDefault(); setView("forgot"); setError(""); }}>Forgot your password?</a>
            <a className="pnr-forgot" href="apply">Not a partner yet? Apply here</a>
          </>
        )}
      </div>

      <style jsx global>{`
        html,body{margin:0;background:#060606;color:#f7f7f4;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        .pnr-page{min-height:100dvh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 92% 2%,rgba(0,117,23,.12),transparent 30%),#060606}
        .pnr-card{width:min(380px,100%);padding:30px 26px;border:1px solid #27272a;border-radius:22px;background:linear-gradient(145deg,rgba(18,18,20,.98),rgba(11,11,12,.98));box-shadow:0 24px 70px rgba(0,0,0,.38)}
        .pnr-logo{height:26px;width:auto;display:block;margin:0 0 16px}
        .pnr-kicker{color:#16a34a;font-size:10px;font-weight:900;letter-spacing:.16em;text-transform:uppercase;margin:0 0 10px}
        .pnr-card h1{margin:0 0 22px;font-size:28px;letter-spacing:-.03em;font-weight:700}
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
        .pnr-forgot{display:block;margin-top:16px;text-align:center;color:#999994;font-size:12px;text-decoration:none}
        .pnr-forgot:hover{color:#fff}
      `}</style>
    </main>
  );
}
