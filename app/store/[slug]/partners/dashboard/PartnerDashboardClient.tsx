"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../../../../lib/supabase";
import { unikBusinessHoursStatus } from "../../../../../lib/unik-business-hours";

type Partner = {
  fullName: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  status: "pending" | "active" | "suspended";
  referralCode: string | null;
  commissionPercent: number | null;
  payoutAccountHolder: string | null;
  payoutBank: string | null;
  payoutAccountType: string | null;
  payoutBranchCode: string | null;
  payoutAccountLast4: string | null;
  availableBalanceCents: number;
  pendingBalanceCents: number;
  totalEarnedCents: number;
  totalPaidOutCents: number;
};

type DiscountCode = { code: string; type: string; value: number } | null;
type Panel = "overview" | "recap" | "support" | "settings";

const BANKS = ["Absa", "Capitec", "FNB", "Nedbank", "Standard Bank", "TymeBank"];
const ACCOUNT_TYPES = ["Cheque / Current", "Savings", "Transmission"];
const REFERRAL_DOMAIN = "https://uniklabs.co.za";

const NAV_ITEMS: { key: Panel; label: string; icon: string }[] = [
  { key: "overview", label: "Overview", icon: "M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-3H4zM14 7h6V4h-6z" },
  { key: "recap", label: "Recap", icon: "M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM10 9l5 3-5 3Z" },
  { key: "support", label: "Support", icon: "M4 5h16v11H8l-4 4Z" },
  { key: "settings", label: "Settings", icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a8 8 0 0 0-1.8-1L14.4 3h-4.8l-.4 3.1a8 8 0 0 0-1.8 1l-2.4-1-2 3.4L5.1 11a7 7 0 0 0 0 2L3 14.5l2 3.4 2.4-1a8 8 0 0 0 1.8 1l.4 3.1h4.8l.4-3.1a8 8 0 0 0 1.8-1l2.4 1 2-3.4-2.1-1.5a7 7 0 0 0 .1-1Z" },
];

function money(cents: number) {
  return "R" + Math.round(Number(cents) / 100 || 0).toLocaleString("en-ZA");
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function NavIcon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="18" height="18" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

export default function PartnerDashboardClient({ storeName }: { storeName: string }) {
  const [sessionReady, setSessionReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [sellerId, setSellerId] = useState<string | null>(null);
  const [partner, setPartner] = useState<Partner | null>(null);
  const [discountCode, setDiscountCode] = useState<DiscountCode>(null);
  const [loadError, setLoadError] = useState("");
  const [panel, setPanel] = useState<Panel>("overview");
  const [toastText, setToastText] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const showToast = useCallback((text: string) => {
    setToastText(text);
    window.setTimeout(() => setToastText(""), 2200);
  }, []);

  const authedFetch = useCallback(async (path: string, init: RequestInit = {}) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return fetch(path, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
  }, []);

  // Shared by both the tappable avatar on Overview and the "Change photo"
  // button in Settings, so there's one upload path instead of two.
  const handlePhotoSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { showToast("Photo must be under 5MB"); return; }
    setUploadingPhoto(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) { showToast("Your session has expired — please sign in again"); return; }
      const ext = file.name.split(".").pop() || "jpg";
      const path = `unik-partner/${userId}/photo-${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("store-assets").upload(path, file, { upsert: true });
      if (uploadErr) { showToast("Could not upload photo"); return; }
      const { data } = supabase.storage.from("store-assets").getPublicUrl(path);
      const avatarUrl = data.publicUrl;
      const res = await authedFetch("/api/unik/partners/profile", { method: "PATCH", body: JSON.stringify({ avatarUrl }) });
      if (!res.ok) { showToast("Could not save photo"); return; }
      setPartner((p) => (p ? { ...p, avatarUrl } : p));
      showToast("Photo updated");
    } catch {
      showToast("Network error — please try again");
    } finally {
      setUploadingPhoto(false);
    }
  }, [authedFetch, showToast]);

  const load = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setSessionReady(true);
      setSignedIn(false);
      return;
    }
    setSignedIn(true);
    try {
      const res = await fetch("/api/unik/partners/me", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Could not load your dashboard");
      setPartner(payload.partner);
      setDiscountCode(payload.discountCode);
      setSellerId(payload.sellerId);
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : "Could not load your dashboard");
    }
    setSessionReady(true);
  }, []);

  useEffect(() => {
    load();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") { setSignedIn(false); setPartner(null); }
    });
    return () => data.subscription.unsubscribe();
  }, [load]);

  useEffect(() => {
    if (sessionReady && !signedIn) window.location.href = "login";
  }, [sessionReady, signedIn]);

  async function signOut() {
    await fetch("/api/unik/partners/session", { method: "DELETE" });
    await supabase.auth.signOut();
    window.location.href = "login";
  }

  if (!sessionReady) return <main className="pnd-loading">Connecting your secure session…</main>;
  if (!signedIn) return <main className="pnd-loading">Redirecting to sign in…</main>;
  if (loadError) return <main className="pnd-loading">{loadError}</main>;
  if (!partner) return <main className="pnd-loading">Loading your dashboard…</main>;

  if (partner.status !== "active") {
    return (
      <main className="pnd-loading">
        <div className="pnd-review-card">
          <p className="pnd-kicker">{storeName} — Official Partner</p>
          {partner.status === "pending" ? (
            <>
              <h1>Your application is under review</h1>
              <p>We'll email you at {partner.email} once it's been approved. Check back here any time.</p>
            </>
          ) : (
            <>
              <h1>This account isn't active</h1>
              <p>Your partner access has been suspended. Contact {storeName} if you think this is a mistake.</p>
            </>
          )}
          <button type="button" className="pnd-signout" onClick={signOut}>Sign out</button>
        </div>
        <style jsx global>{`
          html,body{margin:0;background:#060606}
          .pnd-review-card{max-width:420px;padding:32px;border:1px solid #27272a;border-radius:20px;background:#0b0b0c;text-align:center}
          .pnd-review-card h1{font-size:22px;margin:0 0 10px}
          .pnd-review-card p{color:#c0c0ba;font-size:13px;line-height:1.6;margin:0 0 20px}
        `}</style>
      </main>
    );
  }

  const referralLink = partner.referralCode ? `${REFERRAL_DOMAIN}/?pref=${partner.referralCode}` : "";
  const firstName = partner.fullName.split(" ")[0];

  return (
    <div className="pnd-app">
      <aside className="pnd-sidebar">
        <div className="pnd-brand">
          <img className="pnd-logo-mark" src="/private-templates/unik-labs/assets/unik-logo-v3-header.png" alt="UNIK Labs" />
          <div><span className="pnd-brand-name">UNIK LABS</span><span className="pnd-brand-sub">Official Partner</span></div>
        </div>

        <button type="button" className="pnd-signout pnd-signout-inline" onClick={signOut} aria-label="Sign out">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="17" height="17"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg>
        </button>

        <nav className="pnd-navigation" aria-label="Dashboard navigation">
          {NAV_ITEMS.map((item) => (
            <button key={item.key} type="button" className={"pnd-nav-link" + (panel === item.key ? " active" : "")} onClick={() => setPanel(item.key)}>
              <NavIcon path={item.icon} /> {item.label}
            </button>
          ))}
        </nav>

        <button type="button" className="pnd-signout pnd-signout-desktop" onClick={signOut}>Sign out</button>
      </aside>

      <main className="pnd-main">
        {panel === "overview" && (
          <OverviewPanel partner={partner} firstName={firstName} discountCode={discountCode} referralLink={referralLink} authedFetch={authedFetch} toast={showToast} onSaved={(p) => setPartner(p)} onPickPhoto={() => photoInputRef.current?.click()} uploadingPhoto={uploadingPhoto} />
        )}
        {panel === "recap" && <RecapPanel />}
        {panel === "support" && <SupportChatPanel partner={partner} sellerId={sellerId} storeName={storeName} />}
        {panel === "settings" && (
          <SettingsPanel partner={partner} authedFetch={authedFetch} toast={showToast} onSaved={(p) => setPartner(p)} onPickPhoto={() => photoInputRef.current?.click()} uploadingPhoto={uploadingPhoto} />
        )}
      </main>

      <nav className="pnd-mobile-nav" aria-label="Mobile navigation">
        {NAV_ITEMS.map((item) => (
          <button key={item.key} type="button" className={"pnd-mobile-link" + (panel === item.key ? " active" : "")} onClick={() => setPanel(item.key)}>
            <NavIcon path={item.icon} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <input ref={photoInputRef} type="file" accept="image/*" hidden onChange={handlePhotoSelect} />

      {toastText && <div className="pnd-toast show">{toastText}</div>}

      <style jsx global>{`
        html,body{margin:0;min-height:100vh;background:radial-gradient(circle at 92% 2%,rgba(0,117,23,.1),transparent 30%),#060606;color:#f7f7f4;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
        *{box-sizing:border-box}
        button{font:inherit;cursor:pointer}
        .pnd-loading{min-height:100dvh;display:grid;place-items:center;background:#060606;color:#f7f7f4;font-size:13px}
        .pnd-app{display:grid;grid-template-columns:230px 1fr;min-height:100vh}
        .pnd-sidebar{border-right:1px solid #1c1c1e;padding:20px 16px;display:flex;flex-direction:column;gap:18px}
        .pnd-brand{display:flex;align-items:center;gap:9px}
        .pnd-logo-mark{height:24px;width:auto;display:block}
        .pnd-brand-name{display:block;font-weight:800;font-size:12px;letter-spacing:.02em}
        .pnd-brand-sub{display:block;font-size:9.5px;color:#8f8f89;letter-spacing:.06em;text-transform:uppercase}
        .pnd-navigation{display:flex;flex-direction:column;gap:4px;flex:1}
        .pnd-nav-link{display:flex;align-items:center;gap:10px;text-align:left;padding:10px 12px;border-radius:10px;background:transparent;border:0;color:#c0c0ba;font-size:13px;font-weight:600;transition:background .15s ease,color .15s ease}
        .pnd-nav-link.active{background:linear-gradient(135deg,rgba(0,117,23,.22),rgba(22,163,74,.1));color:#fff;box-shadow:inset 0 0 0 1px rgba(0,117,23,.3)}
        .pnd-nav-link:hover{background:#141416;color:#fff}
        .pnd-signout{padding:9px;border-radius:10px;border:1px solid #27272a;background:#111113;color:#c0c0ba;font-size:12px;font-weight:700}
        .pnd-signout:hover{color:#fff;border-color:#3a3a3d}
        .pnd-signout-desktop{width:100%}
        .pnd-signout-inline{display:none;width:36px;height:36px;flex:0 0 auto;margin-left:auto;place-items:center}
        .pnd-mobile-nav{display:none}
        .pnd-mobile-link{flex:1;height:100%;display:grid;place-items:center;gap:3px;border:0;background:none;color:#83837f;font-size:9.5px;font-weight:700;letter-spacing:.02em}
        .pnd-mobile-link.active{color:#4ade80}
        .pnd-welcome{display:flex;align-items:center;gap:12px;padding:16px 18px;border-radius:16px;background:linear-gradient(160deg,rgba(0,117,23,.14),rgba(22,163,74,.05));border:1px solid #1c1c1e;margin-bottom:18px}
        .pnd-avatar-ring{padding:2.5px;border-radius:50%;background:linear-gradient(135deg,#007517,#16a34a);flex:0 0 auto}
        .pnd-avatar-tap{border:0;background:none;padding:2.5px;border-radius:50%}
        .pnd-avatar-tap:disabled{opacity:.6;cursor:wait}
        .pnd-avatar{position:relative;width:48px;height:48px;border-radius:50%;overflow:hidden;background:#0b0b0c;display:grid;place-items:center;font-weight:700;font-size:17px;color:#f7f7f4}
        .pnd-avatar-edit{position:absolute;right:-2px;bottom:-2px;width:18px;height:18px;border-radius:50%;background:#007517;color:#fff;display:grid;place-items:center;border:2px solid #060606;font-size:10px}
        .pnd-avatar img{width:100%;height:100%;object-fit:cover;display:block}
        .pnd-welcome-text{display:flex;flex-direction:column;line-height:1.35}
        .pnd-greeting{font-size:11px;font-weight:700;letter-spacing:.04em;color:#4ade80}
        .pnd-profile-name{font-size:18px;font-weight:700}
        .pnd-main{padding:24px 26px 60px;max-width:920px}
        .pnd-h1{font-size:22px;margin:0 0 20px;letter-spacing:-.02em;font-weight:700}
        .pnd-hero{margin-bottom:18px}
        .pnd-hero-balance{border-radius:20px;padding:24px 26px;background:linear-gradient(150deg,#16a34a,#007517);color:#fff;box-shadow:0 20px 46px rgba(0,117,23,.24)}
        .pnd-hero-balance-label{font-size:10.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:rgba(255,255,255,.8)}
        .pnd-hero-balance-value{font-size:32px;font-weight:800;letter-spacing:-.03em;margin:6px 0 3px}
        .pnd-hero-balance-meta{font-size:12px;color:rgba(255,255,255,.85)}
        .pnd-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px}
        .pnd-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
        @media (max-width:700px){.pnd-grid-2{grid-template-columns:1fr}}
        .pnd-card{background:#0b0b0c;border:1px solid #1c1c1e;border-radius:14px;padding:16px}
        .pnd-metric-label{font-size:10px;color:#8f8f89;letter-spacing:.06em;text-transform:uppercase;display:block;margin-bottom:7px}
        .pnd-metric-value{font-size:20px;font-weight:700}
        .pnd-section{background:#0b0b0c;border:1px solid #1c1c1e;border-radius:14px;padding:18px;margin-bottom:14px}
        .pnd-section-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px}
        .pnd-section h2{font-size:14px;margin:0;font-weight:700}
        .pnd-section p{color:#8f8f89;font-size:12px;margin:0 0 12px;line-height:1.55}
        .pnd-edit-link{background:none;border:0;color:#4ade80;font-size:11px;font-weight:700;padding:2px 0}
        .pnd-edit-link:hover{color:#7fe8a4}
        .pnd-copy-row{display:flex;gap:8px;align-items:center}
        .pnd-copy-input{flex:1;min-height:40px;padding:0 12px;border-radius:10px;border:1px solid #27272a;background:#111113;color:#f7f7f4;font-size:12.5px}
        .pnd-copy-btn{padding:0 16px;min-height:40px;border-radius:10px;border:1px solid #007517;background:#007517;color:#fff;font-weight:700;font-size:12px}
        .pnd-code-chip{display:inline-block;padding:7px 14px;border-radius:100px;background:rgba(0,117,23,.16);color:#4ade80;font-weight:700;letter-spacing:.02em;font-size:13px}
        .pnd-iframe-wrap{border:1px solid #1c1c1e;border-radius:14px;overflow:hidden;height:80vh;background:#0a0a0a}
        .pnd-iframe-wrap iframe{width:100%;height:100%;border:0}
        .pnd-tabs{display:flex;gap:8px;margin-bottom:14px}
        .pnd-tab{padding:8px 16px;border-radius:100px;border:1px solid #27272a;background:#111113;color:#c0c0ba;font-size:12px;font-weight:700}
        .pnd-tab.active{background:#fff;color:#000;border-color:#fff}
        .pnd-form{display:grid;gap:12px;max-width:420px}
        .pnd-form label{display:grid;gap:6px;font-size:9px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#8f8f89}
        .pnd-form input,.pnd-form select{min-height:42px;padding:0 12px;border-radius:10px;border:1px solid #27272a;background:#111113;color:#fff;font-size:13px}
        .pnd-save-btn{margin-top:4px;min-height:42px;border-radius:10px;border:1px solid #007517;background:#007517;color:#fff;font-weight:700;max-width:180px}
        .pnd-error{color:#ff8b84;font-size:12px;margin:0}
        .pnd-toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%) translateY(8px);opacity:0;background:#fff;color:#000;padding:10px 18px;border-radius:100px;font-size:12px;font-weight:700;transition:all .2s;pointer-events:none;z-index:70}
        .pnd-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
        @media (max-width:860px){.pnd-toast{bottom:86px}}
        .pnd-avatar-row{display:flex;align-items:center;gap:16px;margin-bottom:16px}
        .pnd-avatar-lg{width:60px;height:60px;border-radius:50%;overflow:hidden;background:linear-gradient(135deg,#007517,#16a34a);display:grid;place-items:center;flex:0 0 auto;font-weight:700;font-size:20px;color:#f7f7f4}
        .pnd-avatar-lg img{width:100%;height:100%;object-fit:cover;display:block}
        .pnd-avatar-lg.pnd-avatar-tap{padding:0}
        .pnd-avatar-btn{padding:9px 14px;border-radius:10px;border:1px solid #27272a;background:#111113;color:#c0c0ba;font-size:12px;font-weight:700}
        .pnd-avatar-btn:hover{color:#fff;border-color:#3a3a3d}
        .pnd-inline-form{display:flex;gap:8px;align-items:center;max-width:420px}
        .pnd-inline-form input{flex:1;min-height:40px;padding:0 12px;border-radius:10px;border:1px solid #27272a;background:#111113;color:#fff;font-size:12.5px}
        .pnd-inline-form button{padding:0 16px;min-height:40px;border-radius:10px;border:1px solid #27272a;background:#111113;color:#fff;font-weight:700;font-size:12px}
        .pnd-chat-wrap{background:#0b0b0c;border:1px solid #1c1c1e;border-radius:14px;overflow:hidden;display:flex;flex-direction:column;height:70vh;max-height:640px}
        .pnd-chat-status-bar{display:flex;align-items:center;gap:7px;padding:12px 16px;border-bottom:1px solid #1c1c1e;font-size:12px;font-weight:700}
        .pnd-chat-status-bar .dot{width:7px;height:7px;border-radius:50%;background:#22c55e;box-shadow:0 0 6px 1px rgba(34,197,94,.7)}
        .pnd-chat-status-bar.offline .dot{background:#5a5b57;box-shadow:none}
        .pnd-chat-status-bar.offline{color:#9b9d97}
        .pnd-chat-offline-note{padding:12px 16px;background:rgba(255,255,255,.03);border-bottom:1px solid #1c1c1e;font-size:12px;color:#c0c0ba;line-height:1.55}
        .pnd-chat-body{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:9px}
        .pnd-chat-msg{max-width:75%;padding:9px 13px;border-radius:14px;background:#17171a;color:#f4f1e9;font-size:13px;line-height:1.5;border:1px solid #26262a}
        .pnd-chat-msg.out{margin-left:auto;background:#007517;border-color:#007517;color:#fff}
        .pnd-chat-form{display:flex;gap:8px;padding:12px 16px;border-top:1px solid #1c1c1e}
        .pnd-chat-form input{flex:1;min-width:0;background:#111113;border:1px solid #27272a;border-radius:10px;color:#fff;padding:10px 12px;font-size:13px;outline:none}
        .pnd-chat-send{background:#007517;color:#fff;border:0;border-radius:10px;padding:0 16px;font-weight:700}

        /* Mobile overrides -- kept as ONE block at the very end so every
           override here reliably wins the cascade against the desktop-first
           base rules above it (a rule placed *before* its base counterpart
           loses on specificity ties, even inside @media -- that's what
           silently broke the mobile nav the first time this was written). */
        @media (max-width:860px){
          .pnd-app{grid-template-columns:1fr}
          .pnd-sidebar{position:sticky;top:0;z-index:60;flex-direction:row;align-items:center;justify-content:space-between;border-right:0;border-bottom:1px solid #1c1c1e;background:rgba(6,6,6,.96);backdrop-filter:blur(16px);padding:12px 14px;gap:12px}
          .pnd-navigation{display:none}
          .pnd-signout-desktop{display:none}
          .pnd-signout-inline{display:grid}
          .pnd-mobile-nav{position:fixed;left:8px;right:8px;bottom:max(8px,env(safe-area-inset-bottom));z-index:60;display:flex;justify-content:space-around;align-items:center;height:62px;padding:0 4px;border:1px solid #27272a;border-radius:20px;background:rgba(12,12,13,.96);backdrop-filter:blur(20px);box-shadow:0 18px 48px rgba(0,0,0,.5)}
          .pnd-main{padding:20px 16px 96px}
          .pnd-welcome{padding:14px 16px}
          .pnd-avatar{width:42px;height:42px;font-size:15px}
          .pnd-toast{bottom:86px}
        }
      `}</style>
    </div>
  );
}

function OverviewPanel({ partner, firstName, discountCode, referralLink, authedFetch, toast, onSaved, onPickPhoto, uploadingPhoto }: {
  partner: Partner; firstName: string; discountCode: DiscountCode; referralLink: string;
  authedFetch: (path: string, init?: RequestInit) => Promise<Response>; toast: (text: string) => void; onSaved: (p: Partner) => void;
  onPickPhoto: () => void; uploadingPhoto: boolean;
}) {
  const [editingCode, setEditingCode] = useState(false);
  const [codeInput, setCodeInput] = useState(partner.referralCode || "");
  const [savingCode, setSavingCode] = useState(false);
  const [codeError, setCodeError] = useState("");

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => toast(`${label} copied`));
  }

  async function saveCode(event: FormEvent) {
    event.preventDefault();
    setSavingCode(true);
    setCodeError("");
    const res = await authedFetch("/api/unik/partners/profile", { method: "PATCH", body: JSON.stringify({ referralCode: codeInput }) });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) { setCodeError(payload.error || "Could not save referral code"); setSavingCode(false); return; }
    onSaved({ ...partner, referralCode: payload.referralCode });
    toast("Referral code updated");
    setSavingCode(false);
    setEditingCode(false);
  }

  return (
    <section>
      <div className="pnd-welcome">
        <button type="button" className="pnd-avatar-ring pnd-avatar-tap" onClick={onPickPhoto} disabled={uploadingPhoto} aria-label="Change profile photo">
          <div className="pnd-avatar">
            {partner.avatarUrl ? <img src={partner.avatarUrl} alt="" /> : <span>{partner.fullName.charAt(0)}</span>}
            <div className="pnd-avatar-edit">{uploadingPhoto ? "…" : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
            )}</div>
          </div>
        </button>
        <div className="pnd-welcome-text">
          <span className="pnd-greeting">{greeting()}</span>
          <span className="pnd-profile-name">{firstName}</span>
        </div>
      </div>

      <div className="pnd-hero">
        <div className="pnd-hero-balance">
          <span className="pnd-hero-balance-label">Available balance</span>
          <div className="pnd-hero-balance-value">{money(partner.availableBalanceCents)}</div>
          <span className="pnd-hero-balance-meta">{money(partner.pendingBalanceCents)} pending</span>
        </div>
      </div>

      <div className="pnd-grid">
        <div className="pnd-card"><span className="pnd-metric-label">Total earned</span><span className="pnd-metric-value">{money(partner.totalEarnedCents)}</span></div>
        <div className="pnd-card"><span className="pnd-metric-label">Commission rate</span><span className="pnd-metric-value">{partner.commissionPercent ?? 10}%</span></div>
        <div className="pnd-card"><span className="pnd-metric-label">Total paid out</span><span className="pnd-metric-value">{money(partner.totalPaidOutCents)}</span></div>
      </div>

      <div className="pnd-grid-2">
        <div className="pnd-section">
          <div className="pnd-section-head">
            <h2>Your referral link</h2>
            {!editingCode && <button type="button" className="pnd-edit-link" onClick={() => { setCodeInput(partner.referralCode || ""); setEditingCode(true); }}>Edit code</button>}
          </div>
          <p>Share this link — anyone who buys after clicking it earns you a commission, even if they don't use your discount code.</p>
          {editingCode ? (
            <form className="pnd-inline-form" onSubmit={saveCode}>
              <input value={codeInput} onChange={(e) => setCodeInput(e.target.value)} placeholder="e.g. nik" autoFocus />
              <button type="submit" disabled={savingCode}>{savingCode ? "Saving…" : "Save"}</button>
              <button type="button" onClick={() => setEditingCode(false)}>Cancel</button>
            </form>
          ) : (
            <div className="pnd-copy-row">
              <input className="pnd-copy-input" readOnly value={referralLink} />
              <button type="button" className="pnd-copy-btn" onClick={() => copy(referralLink, "Referral link")}>Copy</button>
            </div>
          )}
          {codeError && <p className="pnd-error" style={{ marginTop: 8 }}>{codeError}</p>}
        </div>

        <div className="pnd-section">
          <h2>Your discount code</h2>
          <p>Customers who use this code at checkout get a discount, and you earn a commission on the sale.</p>
          {discountCode ? (
            <span className="pnd-code-chip">{discountCode.code} — R{discountCode.value} off</span>
          ) : (
            <p>No discount code yet — get in touch if this seems wrong.</p>
          )}
        </div>
      </div>

      <div className="pnd-section">
        <h2>Visits &amp; conversions</h2>
        <p>Real numbers land here once link tracking goes live — coming in a follow-up update.</p>
      </div>
    </section>
  );
}

function RecapPanel() {
  const [tab, setTab] = useState<"studio" | "custom">("studio");
  return (
    <section>
      <h1 className="pnd-h1">Recap Builder</h1>
      <div className="pnd-tabs">
        <button type="button" className={"pnd-tab" + (tab === "studio" ? " active" : "")} onClick={() => setTab("studio")}>AI Studio</button>
        <button type="button" className={"pnd-tab" + (tab === "custom" ? " active" : "")} onClick={() => setTab("custom")}>Custom Upload</button>
      </div>
      <div className="pnd-iframe-wrap">
        <iframe src={tab === "studio" ? "/private-templates/unik-labs/recap.html" : "/private-templates/unik-labs/recap-custom.html"} title="Recap builder" />
      </div>
    </section>
  );
}

const PARTNER_CHAT_VISITOR_KEY = "unik-partner-support-visitor";
const PARTNER_CHAT_CONV_KEY = "unik-partner-support-conversation";

function partnerChatVisitorId() {
  let id = null;
  try { id = localStorage.getItem(PARTNER_CHAT_VISITOR_KEY); } catch {}
  if (!id) {
    id = "p-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    try { localStorage.setItem(PARTNER_CHAT_VISITOR_KEY, id); } catch {}
  }
  return id;
}

type ChatMessage = { id: string; sender: string; body: string; created_at: string };

function SupportChatPanel({ partner, sellerId, storeName }: { partner: Partner; sellerId: string | null; storeName: string }) {
  const [status, setStatus] = useState(() => unikBusinessHoursStatus());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setStatus(unikBusinessHoursStatus()), 60000);
    return () => clearInterval(timer);
  }, []);

  const poll = useCallback(async () => {
    let conversationId: string | null = null;
    try { conversationId = localStorage.getItem(PARTNER_CHAT_CONV_KEY); } catch {}
    if (!conversationId) return;
    try {
      const res = await fetch(`/api/support/messages?conversationId=${encodeURIComponent(conversationId)}&visitorId=${encodeURIComponent(partnerChatVisitorId())}`);
      const data = await res.json();
      if (data.messages) setMessages(data.messages);
    } catch {}
  }, []);

  useEffect(() => {
    poll();
    const timer = setInterval(poll, 5000);
    return () => clearInterval(timer);
  }, [poll]);

  async function send() {
    const text = input.trim();
    if (!text || !sellerId) return;
    setSending(true);
    setInput("");
    let conversationId: string | null = null;
    try { conversationId = localStorage.getItem(PARTNER_CHAT_CONV_KEY); } catch {}
    try {
      const res = await fetch("/api/support/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitorId: partnerChatVisitorId(),
          conversationId: conversationId || undefined,
          message: text,
          name: `Partner — ${partner.fullName}`,
          email: partner.email,
          category: "partner",
          storefrontSellerId: sellerId,
        }),
      });
      const data = await res.json();
      if (data.conversationId) { try { localStorage.setItem(PARTNER_CHAT_CONV_KEY, data.conversationId); } catch {} }
    } catch {}
    await poll();
    setSending(false);
  }

  return (
    <section>
      <h1 className="pnd-h1">Support</h1>
      <p style={{ color: "#8f8f89", fontSize: 12, margin: "-12px 0 16px" }}>Message the {storeName} team directly — this goes to the same inbox Brand Manager checks for customer support.</p>
      <div className="pnd-chat-wrap">
        <div className={"pnd-chat-status-bar" + (status.online ? "" : " offline")}>
          <span className="dot" />
          {status.online ? "We're online" : `We're offline — back ${status.nextOpenLabel}`}
        </div>
        {!status.online && (
          <div className="pnd-chat-offline-note">
            Sorry, we're offline right now. Leave a message below and we'll get back to you as soon as we're available.
          </div>
        )}
        <div className="pnd-chat-body">
          {messages.length === 0 ? (
            <p style={{ color: "#66665f", fontSize: 12 }}>No messages yet — say hello.</p>
          ) : messages.map((m) => (
            <div key={m.id} className={"pnd-chat-msg" + (m.sender !== "visitor" ? " out" : "")}>{m.body}</div>
          ))}
        </div>
        <div className="pnd-chat-form">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={status.online ? "Write a message" : "Leave a message"}
            onKeyDown={(e) => { if (e.key === "Enter") send(); }}
          />
          <button type="button" className="pnd-chat-send" disabled={sending || !input.trim()} onClick={send}>Send</button>
        </div>
      </div>
    </section>
  );
}

function SettingsPanel({ partner, authedFetch, toast, onSaved, onPickPhoto, uploadingPhoto }: {
  partner: Partner; authedFetch: (path: string, init?: RequestInit) => Promise<Response>; toast: (text: string) => void; onSaved: (p: Partner) => void;
  onPickPhoto: () => void; uploadingPhoto: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function saveBanking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const values = new FormData(event.currentTarget);
    const res = await authedFetch("/api/unik/partners/payout", {
      method: "PATCH",
      body: JSON.stringify({
        accountHolder: values.get("accountHolder"),
        bank: values.get("bank"),
        accountType: values.get("accountType"),
        branchCode: values.get("branchCode"),
        accountNumber: values.get("accountNumber"),
      }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) { setError(payload.error || "Could not save banking details"); setBusy(false); return; }
    toast("Banking details saved");
    setBusy(false);
  }

  return (
    <section>
      <h1 className="pnd-h1">Settings</h1>

      <div className="pnd-section">
        <h2>Profile</h2>
        <div className="pnd-avatar-row">
          <button type="button" className="pnd-avatar-lg pnd-avatar-tap" onClick={onPickPhoto} disabled={uploadingPhoto} aria-label="Change profile photo">
            {partner.avatarUrl ? <img src={partner.avatarUrl} alt="" /> : <span>{partner.fullName.charAt(0)}</span>}
          </button>
          <div>
            <button type="button" className="pnd-avatar-btn" disabled={uploadingPhoto} onClick={onPickPhoto}>{uploadingPhoto ? "Uploading…" : "Change photo"}</button>
          </div>
        </div>
        <p style={{ marginTop: 8 }}>{partner.fullName} · {partner.email}{partner.phone ? ` · ${partner.phone}` : ""}</p>
      </div>

      <div className="pnd-section">
        <h2>Banking details</h2>
        <p>Saved ahead of payout requests — that feature is coming in a follow-up update. Your details are stored ready to go.</p>
        <form className="pnd-form" onSubmit={saveBanking}>
          <label>Account holder<input name="accountHolder" defaultValue={partner.payoutAccountHolder || ""} required /></label>
          <label>Bank
            <select name="bank" defaultValue={partner.payoutBank || ""} required>
              <option value="" disabled>Choose a bank</option>
              {BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </label>
          <label>Account type
            <select name="accountType" defaultValue={partner.payoutAccountType || ""} required>
              <option value="" disabled>Choose account type</option>
              {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label>Branch code<input name="branchCode" defaultValue={partner.payoutBranchCode || ""} inputMode="numeric" required /></label>
          <label>Account number{partner.payoutAccountLast4 ? ` (on file: ···${partner.payoutAccountLast4})` : ""}<input name="accountNumber" inputMode="numeric" placeholder={partner.payoutAccountLast4 ? "Leave blank to keep on file" : ""} /></label>
          {error && <p className="pnd-error">{error}</p>}
          <button className="pnd-save-btn" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        </form>
      </div>
    </section>
  );
}
