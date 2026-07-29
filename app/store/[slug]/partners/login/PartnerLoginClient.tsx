"use client";

import { FormEvent, useState } from "react";
import { supabase } from "../../../../../lib/supabase";

export default function PartnerLoginClient({ storeName }: { storeName: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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

    const res = await fetch("/api/unik/partners/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken: signInData.session.access_token }),
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

  return (
    <main className="pnr-page">
      <div className="pnr-card">
        <img className="pnr-logo" src="/private-templates/unik-labs/assets/unik-logo-v3-header.png" alt={storeName} />
        <p className="pnr-kicker">{storeName} Partner Program</p>
        <h1>Sign in</h1>
        <form onSubmit={submit}>
          <label>Email address<input name="email" type="email" autoComplete="email" required /></label>
          <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
          {error && <p className="pnr-error">{error}</p>}
          <button className="pnr-primary" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        </form>
        <a className="pnr-forgot" href="/reset-password">Forgot your password?</a>
        <a className="pnr-forgot" href="apply">Not a partner yet? Apply here</a>
      </div>

      <style jsx global>{`
        html,body{margin:0;background:#060606;color:#f7f7f4;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        .pnr-page{min-height:100dvh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 92% 2%,rgba(244,61,50,.09),transparent 30%),#060606}
        .pnr-card{width:min(380px,100%);padding:30px 26px;border:1px solid #27272a;border-radius:22px;background:linear-gradient(145deg,rgba(18,18,20,.98),rgba(11,11,12,.98));box-shadow:0 24px 70px rgba(0,0,0,.38)}
        .pnr-logo{height:26px;width:auto;display:block;margin:0 0 16px}
        .pnr-kicker{color:#f43d32;font-size:10px;font-weight:900;letter-spacing:.16em;text-transform:uppercase;margin:0 0 10px}
        .pnr-card h1{margin:0 0 22px;font-size:28px;letter-spacing:-.04em}
        .pnr-card form{display:grid;gap:14px}
        .pnr-card label{display:grid;gap:7px;color:#c0c0ba;font-size:9px;font-weight:800;letter-spacing:.11em;text-transform:uppercase}
        .pnr-card input{min-height:46px;padding:0 13px;color:#fff;border:1px solid #27272a;border-radius:12px;outline:none;background:#111113;font-size:14px}
        .pnr-card input:focus{border-color:rgba(244,61,50,.55);box-shadow:0 0 0 3px rgba(244,61,50,.08)}
        .pnr-error{margin:0;color:#ff8b84;font-size:12px;line-height:1.5}
        .pnr-primary{margin-top:4px;min-height:46px;border:1px solid #f43d32;border-radius:13px;background:#f43d32;color:#fff;font-weight:800;cursor:pointer;box-shadow:0 12px 30px rgba(244,61,50,.18)}
        .pnr-primary:disabled{opacity:.6;cursor:wait}
        .pnr-forgot{display:block;margin-top:16px;text-align:center;color:#999994;font-size:12px;text-decoration:none}
        .pnr-forgot:hover{color:#fff}
      `}</style>
    </main>
  );
}
