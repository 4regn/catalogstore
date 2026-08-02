"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";

// Same in-page forgot/recovery pattern already fixed on the Partner and
// Brand Manager login pages this session (request link -> Supabase
// redirects back here with a recovery session -> PASSWORD_RECOVERY ->
// set new password), rather than linking off to a page that may not
// exist for this route tree.
export default function SetlaAdminLoginClient() {
  const [view, setView] = useState<"form" | "forgot" | "recovery">("form");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [recoveryPassword, setRecoveryPassword] = useState("");
  const [recoveryConfirm, setRecoveryConfirm] = useState("");

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
    const res = await fetch("/api/setla/admin/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken }),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      await supabase.auth.signOut();
      setError(payload.error || "This account doesn't have SETLA Admin access");
      setBusy(false);
      return;
    }
    window.location.href = "/setla-admin";
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
    <main className="sal-page">
      <div className="sal-card">
        <p className="sal-kicker">SETLA Payments — Admin</p>
        {view === "recovery" ? (
          <>
            <h1>Set a new password</h1>
            <form onSubmit={recoverySubmit}>
              <label>New password<input type="password" value={recoveryPassword} onChange={(e) => setRecoveryPassword(e.target.value)} minLength={8} autoComplete="new-password" autoFocus required /></label>
              <label>Confirm new password<input type="password" value={recoveryConfirm} onChange={(e) => setRecoveryConfirm(e.target.value)} minLength={8} autoComplete="new-password" required /></label>
              {error && <p className="sal-error">{error}</p>}
              <button className="sal-primary" disabled={busy}>{busy ? "Updating…" : "Update password"}</button>
            </form>
          </>
        ) : view === "forgot" ? (
          <>
            <h1>Reset password</h1>
            {resetSent ? (
              <>
                <p className="sal-sub">Check {resetEmail} for a link to reset your password.</p>
                <button type="button" className="sal-primary" style={{ border: "1px solid #27272a", background: "transparent" }} onClick={() => { setView("form"); setResetSent(false); setError(""); }}>Back to sign in</button>
              </>
            ) : (
              <form onSubmit={requestPasswordReset}>
                <label>Email address<input type="email" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} autoComplete="email" required autoFocus /></label>
                {error && <p className="sal-error">{error}</p>}
                <button className="sal-primary" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</button>
                <a className="sal-forgot" href="#" onClick={(e) => { e.preventDefault(); setView("form"); setError(""); }}>Back to sign in</a>
              </form>
            )}
          </>
        ) : (
          <>
            <h1>Admin sign in</h1>
            <form onSubmit={submit}>
              <label>Email address<input name="email" type="email" autoComplete="email" required /></label>
              <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
              {error && <p className="sal-error">{error}</p>}
              <button className="sal-primary" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
            </form>
            <a className="sal-forgot" href="#" onClick={(e) => { e.preventDefault(); setView("forgot"); setError(""); }}>Forgot your password?</a>
          </>
        )}
      </div>

      <style jsx global>{`
        html,body{margin:0;background:#050505;color:#f5f7f4;font-family:'DM Sans',Arial,sans-serif}
        .sal-page{min-height:100dvh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 92% 2%,rgba(0,117,23,.12),transparent 30%),#050505}
        .sal-card{width:min(380px,100%);padding:30px 26px;border:1px solid #2a2f2a;border-radius:24px;background:linear-gradient(145deg,rgba(18,22,18,.98),rgba(11,13,11,.98));box-shadow:0 24px 70px rgba(0,0,0,.38)}
        .sal-kicker{color:#4ade80;font-size:10px;font-weight:900;letter-spacing:.16em;text-transform:uppercase;margin:0 0 16px}
        .sal-card h1{margin:0 0 22px;font-size:26px;letter-spacing:-.03em;font-weight:700}
        .sal-card form{display:grid;gap:14px}
        .sal-card label{display:grid;gap:7px;color:#9ba29b;font-size:9px;font-weight:800;letter-spacing:.11em;text-transform:uppercase}
        .sal-card input{min-height:46px;padding:0 13px;color:#fff;border:1px solid #2a2f2a;border-radius:12px;outline:none;background:#0d100d;font-size:14px;width:100%}
        .sal-card input:focus{border-color:rgba(0,117,23,.6);box-shadow:0 0 0 3px rgba(0,117,23,.12)}
        .sal-sub{margin:0 0 20px;color:#9ba29b;font-size:13px;line-height:1.55}
        .sal-error{margin:0;color:#ff8b84;font-size:12px;line-height:1.5}
        .sal-primary{margin-top:4px;min-height:46px;border:1px solid #007517;border-radius:13px;background:#007517;color:#fff;font-weight:800;cursor:pointer;box-shadow:0 12px 30px rgba(0,117,23,.22)}
        .sal-primary:disabled{opacity:.6;cursor:wait}
        .sal-forgot{display:block;margin-top:16px;text-align:center;color:#9ba29b;font-size:12px;text-decoration:none}
        .sal-forgot:hover{color:#fff}
      `}</style>
    </main>
  );
}
