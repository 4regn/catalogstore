"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../../../lib/supabase";

type AccountData = {
  profile: { email: string; full_name: string | null; avatar_url: string | null; created_at: string };
  designs: Array<{ id: string; name: string | null; garment: string | null; colour: string | null; size: string | null; style: string | null; preview_url: string | null; mockup_url: string | null; created_at: string }>;
  orders: Array<{ id: string; order_number: string | null; items: Array<{ name?: string; image?: string; preview?: string }> | null; total: number; status: string; payment_status: string; created_at: string }>;
  generationLimit: { used: number; limit: number; remaining: number };
};

const money = (value: number) => new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(Number(value || 0));
const date = (value: string) => new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));

export default function UnikAccountClient({ storeName }: { storeName: string }) {
  const [sessionReady, setSessionReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [account, setAccount] = useState<AccountData | null>(null);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadAccount = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    setSignedIn(Boolean(token));
    setSessionReady(true);
    if (!token) { setAccount(null); return; }

    const sessionResponse = await fetch("/api/unik/auth/session", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken: token }),
      cache: "no-store",
    });
    const sessionPayload = await sessionResponse.json().catch(() => ({}));
    if (!sessionResponse.ok) {
      throw new Error(sessionPayload.error || "Could not connect your UNIK session");
    }

    const sessionCheck = await fetch("/api/unik/auth/session", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
    if (!sessionCheck.ok) {
      throw new Error("Your sign-in could not be connected to the Studio. Please sign in again.");
    }

    const response = await fetch("/api/unik/account", { credentials: "include", headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Could not load your account");
    setAccount(payload);
    const next = new URLSearchParams(window.location.search).get("next");
    if (next?.startsWith("/") && !next.startsWith("//") && !next.startsWith("/account")) {
      window.location.replace(next);
    }
  }, []);

  useEffect(() => {
    loadAccount().catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load your account"));
    const { data } = supabase.auth.onAuthStateChange(() => {
      window.setTimeout(() => loadAccount().catch(() => undefined), 0);
    });
    return () => data.subscription.unsubscribe();
  }, [loadAccount]);

  async function googleSignIn() {
    setBusy(true); setError("");
    const redirectTo = window.location.href.split("#")[0];
    const { error: authError } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
    if (authError) { setError(authError.message); setBusy(false); }
  }

  async function emailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    const values = new FormData(event.currentTarget);
    const email = String(values.get("email") || "").trim().toLowerCase();
    const password = String(values.get("password") || "");
    const fullName = String(values.get("fullName") || "").trim();

    if (mode === "signup") {
      const { data, error: authError } = await supabase.auth.signUp({
        email, password,
        options: { data: { full_name: fullName }, emailRedirectTo: window.location.href.split("#")[0] },
      });
      if (authError) setError(authError.message);
      else if (!data.session) setMessage("Check your email to confirm your account, then return here to sign in.");
      else await loadAccount();
    } else {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) setError(authError.message);
      else await loadAccount();
    }
    setBusy(false);
  }

  async function signOut() {
    setBusy(true);
    await fetch("/api/unik/auth/session", { method: "DELETE", credentials: "include" });
    await supabase.auth.signOut();
    setAccount(null); setSignedIn(false); setBusy(false);
  }

  const firstName = useMemo(() => (account?.profile.full_name || account?.profile.email || "Member").split(/[ @]/)[0], [account]);

  return (
    <main className="ua-page">
      <header className="ua-nav">
        <a href="/" className="ua-logo" aria-label="UNIK home"><img src="/private-templates/unik-labs/assets/unik-logo-v3-header.png" alt="UNIK — For you. And only you" /></a>
        <a href="/" className="ua-return">Return to studio</a>
      </header>

      {!sessionReady ? <section className="ua-loading">Opening your private archive…</section> : !signedIn ? (
        <section className="ua-auth">
          <div className="ua-intro">
            <p className="ua-kicker">UNIK Labs membership</p>
            <h1>Your archive.<br />Your pieces.</h1>
            <p>Sign in to save AI generations, return to unfinished pieces and track every custom order.</p>
          </div>
          <div className="ua-card">
            <button className="ua-google" type="button" onClick={googleSignIn} disabled={busy}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.41Z"/><path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.63-2.43l-3.24-2.54c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.77-5.61-4.14H3.04v2.62A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.39 13.85A6 6 0 0 1 6.08 12c0-.64.11-1.27.31-1.85V7.53H3.04A10 10 0 0 0 2 12c0 1.61.39 3.14 1.04 4.47l3.35-2.62Z"/><path fill="#EA4335" d="M12 6.01c1.47 0 2.79.51 3.83 1.5l2.87-2.88A9.65 9.65 0 0 0 12 2a10 10 0 0 0-8.96 5.53l3.35 2.62C7.18 7.78 9.39 6.01 12 6.01Z"/></svg>
              Continue with Google
            </button>
            <div className="ua-or"><span />or use email<span /></div>
            <form onSubmit={emailSubmit}>
              {mode === "signup" && <label>Full name<input name="fullName" autoComplete="name" required /></label>}
              <label>Email address<input name="email" type="email" autoComplete="email" required /></label>
              <label>Password<input name="password" type="password" minLength={8} autoComplete={mode === "signup" ? "new-password" : "current-password"} required /></label>
              {error && <p className="ua-error">{error}</p>}
              {message && <p className="ua-message">{message}</p>}
              <button className="ua-primary" disabled={busy}>{busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}</button>
            </form>
            <button className="ua-switch" type="button" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); setMessage(""); }}>
              {mode === "signin" ? "New to UNIK? Create an account" : "Already a member? Sign in"}
            </button>
          </div>
        </section>
      ) : !account ? (
        <section className="ua-loading">Preparing your private archive…{error && <small>{error}</small>}</section>
      ) : (
        <section className="ua-dashboard">
          <div className="ua-dashboard-head">
            <div><p className="ua-kicker">{storeName} member</p><h1>Welcome, {firstName}.</h1><p>{account.profile.email}</p></div>
            <button className="ua-signout" onClick={signOut} disabled={busy}>Sign out</button>
          </div>
          <div className="ua-allowance"><span>AI allowance</span><strong>{account.generationLimit.remaining} of 3 remaining</strong><small>Rolling 24-hour window</small></div>
          <div className="ua-grid">
            <section><div className="ua-section-head"><h2>Generation history</h2><span>{account.designs.length} pieces</span></div>
              <div className="ua-list">{account.designs.length ? account.designs.map((design) => <article className="ua-item" key={design.id}>
                {(design.mockup_url || design.preview_url) ? <img src={design.mockup_url || design.preview_url || ""} alt="" /> : <div className="ua-thumb" />}
                <div><strong>{design.name || "UNIK AI Design"}</strong><p>{[design.garment, design.colour, design.size, design.style].filter(Boolean).join(" · ")}</p><small>{date(design.created_at)}</small></div>
              </article>) : <div className="ua-empty">Your saved generations will appear here.<br /><a href="/">Create your first piece</a></div>}</div>
            </section>
            <section><div className="ua-section-head"><h2>Order history</h2><span>{account.orders.length} orders</span></div>
              <div className="ua-list">{account.orders.length ? account.orders.map((order) => { const preview = order.items?.find((item) => item.image || item.preview); return <article className="ua-item" key={order.id}>
                {(preview?.image || preview?.preview) ? <img src={preview.image || preview.preview || ""} alt="" /> : <div className="ua-thumb" />}
                <div><strong>{order.order_number || order.id.slice(0, 8).toUpperCase()}</strong><p>{money(order.total)} · {order.payment_status}</p><small>{date(order.created_at)}</small></div>
              </article>; }) : <div className="ua-empty">No orders yet.<br /><a href="/">Design your first garment</a></div>}</div>
            </section>
          </div>
        </section>
      )}
      <style jsx global>{`
        *{box-sizing:border-box}html,body{margin:0;background:#080909;color:#f4f1e9;font-family:Arial,sans-serif}.ua-page{min-height:100dvh;background:radial-gradient(circle at 15% 0%,#1a1d1b 0,transparent 34%),#080909}.ua-nav{height:78px;border-bottom:1px solid #292c29;display:flex;align-items:center;justify-content:space-between;padding:0 max(22px,calc((100vw - 1160px)/2))}.ua-logo{color:#fff;text-decoration:none;font-size:28px;letter-spacing:.28em;font-weight:300}.ua-logo span{display:block;font-size:5px;letter-spacing:.48em;margin-top:4px}.ua-return,.ua-signout{color:#d8d5cd;font-size:10px;letter-spacing:.14em;text-transform:uppercase;text-decoration:none;background:none;border:0;cursor:pointer}.ua-auth,.ua-dashboard{width:min(1160px,calc(100% - 36px));margin:0 auto;padding:72px 0 100px}.ua-auth{display:grid;grid-template-columns:1.1fr .9fr;gap:70px;align-items:center}.ua-kicker{font-size:10px!important;letter-spacing:.24em;text-transform:uppercase;color:#969a93!important;margin:0 0 18px!important}.ua-intro h1,.ua-dashboard-head h1{font-family:Georgia,serif;font-weight:400;text-transform:uppercase;line-height:.86;margin:0;font-size:clamp(58px,9vw,112px)}.ua-intro>p:last-child{color:#a6a8a2;max-width:540px;line-height:1.7}.ua-card{background:#111311;border:1px solid #30332f;border-radius:24px;padding:30px}.ua-google,.ua-primary{width:100%;height:52px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.08em;cursor:pointer}.ua-google{background:#fff;color:#111;border:0;display:flex;align-items:center;justify-content:center;gap:12px}.ua-google svg{width:19px}.ua-or{display:flex;align-items:center;gap:12px;color:#777b74;font-size:9px;text-transform:uppercase;letter-spacing:.16em;margin:24px 0}.ua-or span{height:1px;background:#30332f;flex:1}.ua-card label{display:grid;gap:7px;font-size:9px;text-transform:uppercase;letter-spacing:.16em;color:#94978f;margin:14px 0}.ua-card input{height:48px;border:1px solid #363934;border-radius:12px;background:#090a09;color:#fff;padding:0 14px;font-size:14px;outline:none}.ua-card input:focus{border-color:#d9d7ce}.ua-primary{border:1px solid #007517;background:#007517;color:#fff;margin-top:10px}.ua-switch{width:100%;background:none;border:0;color:#b8bab4;font-size:10px;margin-top:20px;cursor:pointer}.ua-error,.ua-message{font-size:11px;line-height:1.5}.ua-error{color:#ff8d82}.ua-message{color:#8bd69a}.ua-loading{min-height:calc(100dvh - 78px);display:grid;place-content:center;text-align:center;color:#a6a8a2;letter-spacing:.08em}.ua-loading small{display:block;margin-top:12px;color:#ff8d82}.ua-dashboard-head{display:flex;align-items:end;justify-content:space-between;gap:24px}.ua-dashboard-head h1{font-size:clamp(52px,7vw,90px)}.ua-dashboard-head p{color:#989b94}.ua-signout{border:1px solid #41443f;border-radius:999px;padding:13px 18px}.ua-allowance{display:grid;grid-template-columns:1fr auto;gap:5px 20px;background:#101210;border:1px solid #2c2f2b;border-radius:18px;padding:20px;margin:42px 0 28px}.ua-allowance span,.ua-allowance small{font-size:9px;letter-spacing:.15em;text-transform:uppercase;color:#969991}.ua-allowance strong{grid-row:span 2;font-size:16px;align-self:center}.ua-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}.ua-grid>section{min-width:0}.ua-section-head{display:flex;justify-content:space-between;align-items:center;margin:16px 2px}.ua-section-head h2{font-size:11px;text-transform:uppercase;letter-spacing:.18em;margin:0}.ua-section-head span{font-size:9px;color:#898c85;text-transform:uppercase;letter-spacing:.12em}.ua-list{display:grid;gap:10px}.ua-item{display:grid;grid-template-columns:74px 1fr;gap:15px;padding:12px;background:#111311;border:1px solid #2c2f2b;border-radius:16px;align-items:center}.ua-item img,.ua-thumb{width:74px;aspect-ratio:3/4;object-fit:cover;border-radius:10px;background:#1a1c1a}.ua-item strong{font-size:12px}.ua-item p,.ua-item small{color:#92958e;font-size:10px;line-height:1.5}.ua-item p{margin:6px 0}.ua-empty{border:1px dashed #343732;border-radius:16px;padding:34px;text-align:center;color:#8e918a;font-size:11px;line-height:1.7}.ua-empty a{color:#fff}.ua-google:disabled,.ua-primary:disabled{opacity:.55;cursor:wait}@media(max-width:800px){.ua-auth,.ua-grid{grid-template-columns:1fr}.ua-auth{gap:42px;padding-top:46px}.ua-dashboard-head{align-items:flex-start;flex-direction:column}.ua-logo{font-size:21px}.ua-return{font-size:8px}.ua-allowance{grid-template-columns:1fr}.ua-allowance strong{grid-row:auto}}
        .ua-logo{display:flex;align-items:center;text-decoration:none;line-height:0}
        .ua-logo img{display:block;width:124px;height:auto;object-fit:contain}
        @media(max-width:800px){.ua-logo img{width:110px}}
      `}</style>
    </main>
  );
}
