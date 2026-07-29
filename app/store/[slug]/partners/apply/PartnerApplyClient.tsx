"use client";

import { FormEvent, useState } from "react";

export default function PartnerApplyClient({ storeName }: { storeName: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const values = new FormData(event.currentTarget);
    const fullName = String(values.get("fullName") || "").trim();
    const email = String(values.get("email") || "").trim().toLowerCase();
    const password = String(values.get("password") || "");

    const res = await fetch("/api/unik/partners/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName, email, password }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(payload.error || "Could not submit your application");
      setBusy(false);
      return;
    }
    setSubmitted(true);
    setBusy(false);
  }

  return (
    <main className="pnr-page">
      <div className="pnr-card">
        <img className="pnr-logo" src="/private-templates/unik-labs/assets/unik-logo-v3-header.png" alt={storeName} />
        <p className="pnr-kicker">{storeName} Partner Program</p>
        {submitted ? (
          <>
            <h1>Application received</h1>
            <p className="pnr-sub">We'll review your application and email you once it's approved. You can sign in any time to check its status.</p>
            <a className="pnr-primary pnr-link-btn" href="login">Go to sign in</a>
          </>
        ) : (
          <>
            <h1>Become a partner</h1>
            <p className="pnr-sub">Get your own discount code and referral link, and earn a commission on every sale you drive.</p>
            <form onSubmit={submit}>
              <label>Full name<input name="fullName" type="text" autoComplete="name" required /></label>
              <label>Email address<input name="email" type="email" autoComplete="email" required /></label>
              <label>Password<input name="password" type="password" autoComplete="new-password" minLength={8} required /></label>
              {error && <p className="pnr-error">{error}</p>}
              <button className="pnr-primary" disabled={busy}>{busy ? "Submitting…" : "Submit application"}</button>
            </form>
            <a className="pnr-forgot" href="login">Already applied? Sign in</a>
          </>
        )}
      </div>

      <style jsx global>{`
        html,body{margin:0;background:#060606;color:#f7f7f4;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        .pnr-page{min-height:100dvh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 92% 2%,rgba(244,61,50,.09),transparent 30%),#060606}
        .pnr-card{width:min(400px,100%);padding:30px 26px;border:1px solid #27272a;border-radius:22px;background:linear-gradient(145deg,rgba(18,18,20,.98),rgba(11,11,12,.98));box-shadow:0 24px 70px rgba(0,0,0,.38)}
        .pnr-logo{height:26px;width:auto;display:block;margin:0 0 16px}
        .pnr-kicker{color:#f43d32;font-size:10px;font-weight:900;letter-spacing:.16em;text-transform:uppercase;margin:0 0 10px}
        .pnr-card h1{margin:0 0 10px;font-size:26px;letter-spacing:-.04em}
        .pnr-sub{margin:0 0 20px;color:#c0c0ba;font-size:13px;line-height:1.55}
        .pnr-card form{display:grid;gap:14px}
        .pnr-card label{display:grid;gap:7px;color:#c0c0ba;font-size:9px;font-weight:800;letter-spacing:.11em;text-transform:uppercase}
        .pnr-card input{min-height:46px;padding:0 13px;color:#fff;border:1px solid #27272a;border-radius:12px;outline:none;background:#111113;font-size:14px}
        .pnr-card input:focus{border-color:rgba(244,61,50,.55);box-shadow:0 0 0 3px rgba(244,61,50,.08)}
        .pnr-error{margin:0;color:#ff8b84;font-size:12px;line-height:1.5}
        .pnr-primary{margin-top:4px;min-height:46px;border:1px solid #f43d32;border-radius:13px;background:#f43d32;color:#fff;font-weight:800;cursor:pointer;box-shadow:0 12px 30px rgba(244,61,50,.18)}
        .pnr-primary:disabled{opacity:.6;cursor:wait}
        .pnr-link-btn{display:flex;align-items:center;justify-content:center;text-decoration:none}
        .pnr-forgot{display:block;margin-top:16px;text-align:center;color:#999994;font-size:12px;text-decoration:none}
        .pnr-forgot:hover{color:#fff}
      `}</style>
    </main>
  );
}
