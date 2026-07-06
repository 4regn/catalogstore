"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabase";
import { useRouter } from "next/navigation";
import Spinner from "../../components/Spinner";

// Pre-launch: one plan, everything currently buildable. Keeping the 'starter' id so
// existing sellers' subscription_plan = 'starter' rows keep matching. When we add a
// Pro tier back, append it here.
const PLANS = [
  {
    id: "starter",
    name: "Catalogstore",
    price: 199,
    features: [
      "Up to 20 products",
      "5 photos per product",
      "Up to 10 collections",
      "All 4 store templates",
      "Personal onboarding — we set you up 1-on-1",
      "Custom domain support — we help you connect it",
      "Free subdomain (yourstore.catalogstore.co.za)",
      "Visual store editor",
      "Card, EFT, Apple Pay, WhatsApp checkout",
      "Order notifications by email",
      "Cancel anytime",
    ],
    limits: { products: 20, images: 5, collections: 10, templates: 4 },
  },
];

export default function BillingPage() {
  const router = useRouter();
  const [seller, setSeller] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [pricing, setPricing] = useState<{ referred: boolean; price: number } | null>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }
    const { data } = await supabase.from("sellers").select("*").eq("id", user.id).single();
    if (data) setSeller(data);
    setLoading(false);
    // Referred sellers pay a permanently discounted rate — fetch which applies.
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token || "";
      const res = await fetch("/api/subscription/pricing", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setPricing(await res.json());
    } catch { /* fall back to standard price */ }
  };

  const monthlyPrice = pricing?.price ?? 199;
  const isReferred = pricing?.referred === true;

  const trialActive = seller?.subscription_status === "trial" && seller?.trial_ends_at && new Date(seller.trial_ends_at) > new Date();
  const trialDaysLeft = seller?.trial_ends_at ? Math.max(0, Math.ceil((new Date(seller.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : 0;
  const isActive = seller?.subscription_status === "active";
  const isPastDue = seller?.subscription_status === "past_due";
  const graceDaysLeft = seller?.subscription_grace_until ? Math.max(0, Math.ceil((new Date(seller.subscription_grace_until).getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : 0;
  const graceDateStr = seller?.subscription_grace_until ? new Date(seller.subscription_grace_until).toLocaleDateString("en-ZA", { day: "numeric", month: "short" }) : "";
  const isExpired = seller?.subscription_status === "expired" || seller?.subscription_status === "cancelled" || (seller?.subscription_status === "trial" && seller?.trial_ends_at && new Date(seller.trial_ends_at) <= new Date());

  const subscribePlan = async (planId: string, intent: "signup" | "reactivate" = "signup") => {
    if (!seller) return;
    setProcessing(true);
    const res = await fetch("/api/billing-redirect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sellerId: seller.id, planId, returnOrigin: window.location.origin, intent }),
    });
    if (res.ok) {
      const html = await res.text();
      document.open(); document.write(html); document.close();
    } else {
      alert("Error connecting to payment. Please try again.");
      setProcessing(false);
    }
  };

  const [justSubscribed, setJustSubscribed] = useState(false);
  const [paymentCancelled, setPaymentCancelled] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    const status = p.get("status");
    if (status === "success") {
      setJustSubscribed(true);
      window.history.replaceState({}, "", "/dashboard/billing");
      if (seller && !seller.payfast_subscription_token) {
        supabase.from("sellers").update({
          payfast_subscription_token: "pending_activation",
        }).eq("id", seller.id).then(() => {
          setSeller({ ...seller, payfast_subscription_token: "pending_activation" });
        });
      }
    } else if (status === "cancelled") {
      setPaymentCancelled(true);
      window.history.replaceState({}, "", "/dashboard/billing");
    }
  }, [seller?.id]);

  const N = "#ff6b35";
  const G = "linear-gradient(135deg, #ff6b35, #ff3d6e)";

  if (loading) return <Spinner fullscreen label="Loading billing" />;

  return (
    <div style={{ minHeight: "100vh", background: "#030303", fontFamily: "'Schibsted Grotesk', sans-serif", color: "#f5f5f5" }}>

      {/* HEADER */}
      <div style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", padding: "16px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <a href="/dashboard" style={{ fontSize: 14, fontWeight: 900, letterSpacing: "-0.04em", textTransform: "uppercase", textDecoration: "none", color: "#f5f5f5" }}>
          CATALOG<span style={{ background: G, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>STORE</span>
        </a>
        <a href="/dashboard" style={{ fontSize: 11, color: "#f5f5f5", textDecoration: "none", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", padding: "8px 14px", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 100, background: "rgba(255,255,255,0.04)" }}>&larr; Dashboard</a>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px 80px" }}>

        <h1 style={{ fontSize: 32, fontWeight: 900, letterSpacing: "-0.04em", textTransform: "uppercase", textAlign: "center", marginBottom: 8 }}>
          {isPastDue ? "Payment Failed" : isExpired ? "Reactivate Your Store" : isActive ? "Manage Subscription" : trialActive ? "Subscribe" : "Choose Your Plan"}
        </h1>
        <p style={{ fontSize: 14, color: "rgba(245,245,245,0.35)", textAlign: "center", marginBottom: 12 }}>
          {isPastDue ? "We couldn't charge your card. PayFast is retrying automatically." : trialActive ? "You have " + trialDaysLeft + " days left on your free trial. Subscribe to keep your store live." : isActive ? "You're on the Catalogstore plan" : isExpired ? "Your store is currently offline. Reactivate to bring it back." : "Start selling online in minutes"}
        </p>

        {justSubscribed && (
          <div style={{ maxWidth: 720, margin: "0 auto 24px", padding: "16px 20px", background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 14, display: "flex", alignItems: "center", gap: 12 }} role="status">
            <span style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(34,197,94,0.2)", display: "flex", alignItems: "center", justifyContent: "center", color: "#22c55e", fontSize: 14, fontWeight: 800 }}>✓</span>
            <div style={{ fontSize: 13, color: "#a7f3d0", lineHeight: 1.5 }}>
              <strong style={{ color: "#22c55e" }}>Payment received.</strong> Your subscription will activate within a few seconds — refresh the page if it doesn&apos;t update.
            </div>
          </div>
        )}
        {paymentCancelled && (
          <div style={{ maxWidth: 720, margin: "0 auto 24px", padding: "16px 20px", background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 14 }} role="status">
            <div style={{ fontSize: 13, color: "#fcd34d", lineHeight: 1.5 }}>
              Payment was cancelled. You can pick a plan below to try again.
            </div>
          </div>
        )}


        {/* CURRENT STATUS — clickable so a newly-subscribed seller has an
            obvious way back to the dashboard. The legacy subscription_plan
            value is "starter" but we collapsed to a single tier; show
            "Catalogstore" instead of the raw id. */}
        {isActive && (
          <a
            href="/dashboard"
            style={{
              display: "block",
              padding: "24px",
              background: "rgba(34,197,94,0.06)",
              border: "1px solid rgba(34,197,94,0.15)",
              borderRadius: 16,
              marginBottom: 16,
              textAlign: "center",
              textDecoration: "none",
              color: "inherit",
              cursor: "pointer",
              transition: "background 0.2s, border-color 0.2s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(34,197,94,0.1)"; e.currentTarget.style.borderColor = "rgba(34,197,94,0.25)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(34,197,94,0.06)"; e.currentTarget.style.borderColor = "rgba(34,197,94,0.15)"; }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: "#22c55e", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Active Subscription</div>
            <div style={{ fontSize: 24, fontWeight: 900, textTransform: "uppercase" }}>Catalogstore Plan</div>
            {seller?.subscription_started_at && <div style={{ fontSize: 12, color: "rgba(245,245,245,0.25)", marginTop: 8 }}>Active since {new Date(seller.subscription_started_at).toLocaleDateString()}</div>}
            <div style={{ marginTop: 14, fontSize: 11, fontWeight: 700, color: "#22c55e", textTransform: "uppercase", letterSpacing: "0.08em" }}>Go to dashboard &rarr;</div>
          </a>
        )}

        {trialActive && (
          <div style={{ padding: "24px", background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.15)", borderRadius: 16, marginBottom: 32, textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#fbbf24", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Free Trial</div>
            <div style={{ fontSize: 20, fontWeight: 900 }}>{trialDaysLeft} days remaining</div>
            <p style={{ fontSize: 12, color: "rgba(245,245,245,0.25)", marginTop: 8 }}>Subscribe now to keep your store live after your trial ends</p>
          </div>
        )}

        {isPastDue && (
          <div style={{ padding: "24px", background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)", borderRadius: 16, marginBottom: 32, textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#fbbf24", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Payment Failed</div>
            <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 8 }}>
              Your store goes offline in {graceDaysLeft} {graceDaysLeft === 1 ? "day" : "days"}{graceDateStr ? ` (${graceDateStr})` : ""}
            </div>
            <p style={{ fontSize: 13, color: "rgba(245,245,245,0.5)", maxWidth: 420, margin: "0 auto", lineHeight: 1.5 }}>
              Your last R{monthlyPrice} charge didn&apos;t go through. PayFast will keep retrying your card over the next {graceDaysLeft} {graceDaysLeft === 1 ? "day" : "days"}. Make sure your card has funds, or update it on PayFast — your store stays live in the meantime.
            </p>
          </div>
        )}

        {isExpired && (
          <div style={{ padding: "24px", background: "rgba(255,61,110,0.06)", border: "1px solid rgba(255,61,110,0.15)", borderRadius: 16, marginBottom: 32, textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#ff3d6e", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Store Offline</div>
            <p style={{ fontSize: 13, color: "rgba(245,245,245,0.5)", marginBottom: 20, maxWidth: 420, margin: "0 auto 20px", lineHeight: 1.5 }}>
              Your subscription ended and your storefront is showing visitors an unavailable page. Your products, orders, and settings are all preserved — reactivate to bring your store back instantly.
            </p>
            <button
              onClick={() => subscribePlan("starter", "reactivate")}
              disabled={processing}
              style={{ padding: "16px 32px", background: G, color: "#fff", border: "none", borderRadius: 100, fontSize: 12, fontWeight: 800, cursor: processing ? "not-allowed" : "pointer", opacity: processing ? 0.6 : 1, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "'Schibsted Grotesk', sans-serif" }}
            >
              {processing ? "Redirecting..." : `Reactivate Store — R${monthlyPrice}`}
            </button>
          </div>
        )}

        {/* PLANS -- hidden when expired since the Reactivate card above handles the CTA. */}
        {!isExpired && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {PLANS.map((plan) => {
            const isCurrent = isActive && seller?.subscription_plan === plan.id;
            return (
              <div key={plan.id} style={{ padding: "32px 28px", background: plan.id === "pro" ? "rgba(255,255,255,0.01)" : "rgba(255,255,255,0.02)", border: plan.id === "pro" ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(255,255,255,0.06)", borderRadius: 20, position: "relative", display: "flex", flexDirection: "column", opacity: plan.id === "pro" ? 0.5 : 1 }}>
                {plan.id === "pro" && <div style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)", padding: "4px 20px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 100, fontSize: 9, fontWeight: 800, color: "rgba(245,245,245,0.5)", letterSpacing: "0.1em", textTransform: "uppercase" }}>Coming Soon</div>}

                <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 16, color: plan.id === "pro" ? N : "rgba(245,245,245,0.5)" }}>{plan.name}</div>

                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 36, fontWeight: 900, letterSpacing: "-0.04em" }}>R{monthlyPrice}</span>
                  {isReferred && <span style={{ fontSize: 18, fontWeight: 900, textDecoration: "line-through", color: "rgba(245,245,245,0.25)" }}>R{plan.price}</span>}
                  <span style={{ fontSize: 13, color: "rgba(245,245,245,0.25)" }}>/mo</span>
                </div>

                {isReferred && <p style={{ fontSize: 11, color: N, marginBottom: 4, fontWeight: 700 }}>Referral discount — R{monthlyPrice}/month for life</p>}
                {!isActive && plan.id === "starter" && <p style={{ fontSize: 11, color: "#22c55e", marginBottom: 16 }}>14-day free trial — R0 today, no charge until day 15</p>}

                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28, flex: 1, marginTop: 16 }}>
                  {plan.features.map((f, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "rgba(245,245,245,0.5)" }}>
                      <span style={{ color: plan.id === "pro" ? N : "#22c55e", fontSize: 12 }}>&#10003;</span>
                      {f}
                    </div>
                  ))}
                </div>

                {isCurrent ? (
                  <div style={{ padding: "16px", background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.15)", borderRadius: 100, textAlign: "center", fontSize: 12, fontWeight: 800, color: "#22c55e", textTransform: "uppercase", letterSpacing: "0.06em" }}>Current Plan</div>
                ) : isActive && plan.id === "starter" ? (
                  <div style={{ padding: "16px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 100, textAlign: "center", fontSize: 12, fontWeight: 700, color: "rgba(245,245,245,0.25)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Downgrade</div>
                ) : (
                  <button onClick={() => { if (plan.id === "pro") return; subscribePlan(plan.id); }} disabled={processing || plan.id === "pro"} style={{ padding: "16px", background: plan.id === "pro" ? "rgba(255,255,255,0.05)" : "#f5f5f5", color: plan.id === "pro" ? "rgba(245,245,245,0.25)" : "#030303", border: plan.id === "pro" ? "1px solid rgba(255,255,255,0.08)" : "none", borderRadius: 100, fontSize: 12, fontWeight: 800, cursor: plan.id === "pro" ? "not-allowed" : processing ? "not-allowed" : "pointer", opacity: (processing && plan.id !== "pro") ? 0.6 : 1, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "'Schibsted Grotesk', sans-serif" }}>{plan.id === "pro" ? "Coming Soon" : processing ? "Redirecting..." : isActive ? "Upgrade to " + plan.name : trialActive ? `Subscribe — R${monthlyPrice}/mo` : "Start 14-Day Free Trial"}</button>
                )}
              </div>
            );
          })}
        </div>
        )}

        {!isExpired && <p style={{ textAlign: "center", fontSize: 11, color: "rgba(245,245,245,0.15)", marginTop: 24 }}>14-day free trial. Then R{monthlyPrice}/month{isReferred ? " with your referral discount" : ""}. Cancel anytime. Prices in ZAR.</p>}

        {/* CANCEL SUBSCRIPTION */}
        {isActive && (
          <div style={{ marginTop: 48, padding: "28px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 16, textAlign: "center" }}>
            <h3 style={{ fontSize: 14, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Cancel Subscription</h3>
            <p style={{ fontSize: 13, color: "rgba(245,245,245,0.25)", marginBottom: 20, maxWidth: 400, margin: "0 auto 20px" }}>Your store will remain active until the end of your current billing period. After that, your store will go offline.</p>
            <button onClick={async () => {
              if (!confirm("Are you sure you want to cancel your subscription? Your store will keep working until the end of the current billing period, then go offline.")) return;
              setProcessing(true);
              try {
                const session = await supabase.auth.getSession();
                const token = session.data.session?.access_token || "";
                const res = await fetch("/api/subscription/cancel", {
                  method: "POST",
                  headers: { Authorization: `Bearer ${token}` },
                });
                const j = await res.json().catch(() => ({}));
                if (!res.ok) { alert(j.error || "Could not cancel — please email support."); return; }
                setSeller({ ...seller, subscription_status: "cancelled" });
                alert("Your subscription has been cancelled. Your store will stay live until the end of the billing period.");
              } finally {
                setProcessing(false);
              }
            }} disabled={processing} style={{ padding: "12px 32px", background: "transparent", border: "1px solid rgba(255,61,110,0.2)", borderRadius: 100, color: "#ff3d6e", fontSize: 11, fontWeight: 700, cursor: processing ? "not-allowed" : "pointer", opacity: processing ? 0.5 : 1, fontFamily: "'Schibsted Grotesk', sans-serif", textTransform: "uppercase", letterSpacing: "0.06em" }}>{processing ? "Cancelling..." : "Cancel Subscription"}</button>
          </div>
        )}

      </div>
    </div>
  );
}