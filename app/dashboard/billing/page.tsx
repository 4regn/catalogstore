"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabase";
import { useRouter } from "next/navigation";

const PLANS = [
  {
    id: "starter", name: "Starter", price: 99, promoPrice: 49,
    features: ["15 products", "5 images per product", "5 collections", "2 templates", "Store editor", "All payment methods", "WhatsApp checkout", "Subdomain included"],
    limits: { products: 15, images: 5, collections: 5, templates: 2 }
  },
  {
    id: "pro", name: "Pro", price: 249, promoPrice: null,
    features: ["100 products", "20 images per product", "20 collections", "All templates (current + future)", "Custom domain support", "No 'Powered by CatalogStore'", "Priority support", "Everything in Starter"],
    limits: { products: 100, images: 20, collections: 20, templates: 99 }
  }
];

export default function BillingPage() {
  const router = useRouter();
  const [seller, setSeller] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }
    const { data } = await supabase.from("sellers").select("*").eq("id", user.id).single();
    if (data) setSeller(data);
    setLoading(false);
  };

  const isPromo = true; // Toggle this off after launch promo ends
  const trialActive = seller?.subscription_status === "trial" && seller?.trial_ends_at && new Date(seller.trial_ends_at) > new Date();
  const trialDaysLeft = seller?.trial_ends_at ? Math.max(0, Math.ceil((new Date(seller.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : 0;
  const isActive = seller?.subscription_status === "active";
  const isExpired = seller?.subscription_status === "expired" || (seller?.subscription_status === "trial" && seller?.trial_ends_at && new Date(seller.trial_ends_at) <= new Date());
  const needsVerification = trialActive && !seller?.payfast_subscription_token;

  const subscribePlan = (planId: string) => {
    if (!seller) return;
    setProcessing(true);
    const plan = PLANS.find((p) => p.id === planId)!;
    const recurringAmount = (isPromo && plan.promoPrice) ? plan.promoPrice : plan.price;

    const form = document.createElement("form");
    form.method = "POST";
    form.action = "https://www.payfast.co.za/eng/process";

    const fields: Record<string, string> = {
      merchant_id: "34217957",
      merchant_key: "1worde5oycuks",
      amount: planId === "starter" ? "1.00" : recurringAmount.toFixed(2),
      item_name: planId === "starter" ? "CatalogStore " + plan.name + " - Card Verification" : "CatalogStore " + plan.name + " Plan",
      item_description: planId === "starter" ? "R1 verification. " + plan.name + " plan R" + recurringAmount + "/mo starts after 7-day trial." : plan.name + " plan - R" + recurringAmount + "/mo",
      name_first: seller.store_name,
      email_address: seller.email,
      m_payment_id: seller.id,
      custom_str1: seller.id,
      custom_str2: planId,
      return_url: window.location.origin + "/dashboard/billing?status=success&plan=" + planId,
      cancel_url: window.location.origin + "/dashboard/billing?status=cancelled",
      notify_url: window.location.origin + "/api/subscription/notify",
      subscription_type: "1",
      recurring_amount: recurringAmount.toFixed(2),
      frequency: "3",
      cycles: "0",
    };

    Object.entries(fields).forEach(([k, v]) => {
      const input = document.createElement("input");
      input.type = "hidden"; input.name = k; input.value = v;
      form.appendChild(input);
    });
    document.body.appendChild(form);
    form.submit();
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    const status = p.get("status");
    const plan = p.get("plan");
    if (status === "success" && plan && seller) {
      supabase.from("sellers").update({
        subscription_status: "active",
        subscription_plan: plan,
        subscription_started_at: new Date().toISOString(),
        plan: plan,
      }).eq("id", seller.id).then(() => {
        setSeller({ ...seller, subscription_status: "active", subscription_plan: plan, plan });
        window.history.replaceState({}, "", "/dashboard/billing");
      });
    }
  }, [seller]);

  const N = "#ff6b35";
  const G = "linear-gradient(135deg, #ff6b35, #ff3d6e)";

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#030303", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Schibsted Grotesk', sans-serif" }}>
      <p style={{ color: "rgba(245,245,245,0.35)" }}>Loading billing...</p>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#030303", fontFamily: "'Schibsted Grotesk', sans-serif", color: "#f5f5f5" }}>

      {/* HEADER */}
      <div style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", padding: "16px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <a href="/dashboard" style={{ fontSize: 14, fontWeight: 900, letterSpacing: "-0.04em", textTransform: "uppercase", textDecoration: "none", color: "#f5f5f5" }}>
          CATALOG<span style={{ background: G, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>STORE</span>
        </a>
        {needsVerification ? <span style={{ fontSize: 11, color: "rgba(245,245,245,0.15)", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>Verify card to continue</span> : <a href="/dashboard" style={{ fontSize: 11, color: "rgba(245,245,245,0.4)", textDecoration: "none", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>&larr; Back to Dashboard</a>}
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px 80px" }}>

        <h1 style={{ fontSize: 32, fontWeight: 900, letterSpacing: "-0.04em", textTransform: "uppercase", textAlign: "center", marginBottom: 8 }}>
          {needsVerification ? "Verify Your Card" : isActive ? "Manage Subscription" : "Choose Your Plan"}
        </h1>
        <p style={{ fontSize: 14, color: "rgba(245,245,245,0.35)", textAlign: "center", marginBottom: 12 }}>
          {needsVerification ? "Verify your card with R1 to start your 7-day free trial and unlock your dashboard." : trialActive ? "You have " + trialDaysLeft + " days left on your free trial" : isActive ? "You're on the " + (seller?.subscription_plan || "starter") + " plan" : isExpired ? "Your trial has expired. Choose a plan to continue." : "Start selling online in minutes"}
        </p>

        {isPromo && !isActive && (
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <span style={{ display: "inline-block", padding: "8px 24px", background: "rgba(255,107,53,0.08)", border: "1px solid rgba(255,107,53,0.15)", borderRadius: 100, fontSize: 11, fontWeight: 800, color: N, letterSpacing: "0.08em", textTransform: "uppercase" }}>Launch Promo - R49 First Month on Starter</span>
          </div>
        )}

        {/* CURRENT STATUS */}
        {isActive && (
          <div style={{ padding: "24px", background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.15)", borderRadius: 16, marginBottom: 32, textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#22c55e", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Active Subscription</div>
            <div style={{ fontSize: 24, fontWeight: 900, textTransform: "uppercase" }}>{seller?.subscription_plan} Plan</div>
            {seller?.subscription_started_at && <div style={{ fontSize: 12, color: "rgba(245,245,245,0.25)", marginTop: 8 }}>Active since {new Date(seller.subscription_started_at).toLocaleDateString()}</div>}
          </div>
        )}

        {trialActive && (
          <div style={{ padding: "24px", background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.15)", borderRadius: 16, marginBottom: 32, textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#fbbf24", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Free Trial</div>
            <div style={{ fontSize: 20, fontWeight: 900 }}>{trialDaysLeft} days remaining</div>
            <p style={{ fontSize: 12, color: "rgba(245,245,245,0.25)", marginTop: 8 }}>Subscribe now to keep your store live after your trial ends</p>
          </div>
        )}

        {isExpired && (
          <div style={{ padding: "24px", background: "rgba(255,61,110,0.06)", border: "1px solid rgba(255,61,110,0.15)", borderRadius: 16, marginBottom: 32, textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#ff3d6e", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Trial Expired</div>
            <p style={{ fontSize: 13, color: "rgba(245,245,245,0.35)", marginTop: 4 }}>Choose a plan below to reactivate your store</p>
          </div>
        )}

        {/* PLANS */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {PLANS.map((plan) => {
            const isCurrent = isActive && seller?.subscription_plan === plan.id;
            return (
              <div key={plan.id} style={{ padding: "32px 28px", background: plan.id === "pro" ? "rgba(255,255,255,0.01)" : "rgba(255,255,255,0.02)", border: plan.id === "pro" ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(255,255,255,0.06)", borderRadius: 20, position: "relative", display: "flex", flexDirection: "column", opacity: plan.id === "pro" ? 0.5 : 1 }}>
                {plan.id === "pro" && <div style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)", padding: "4px 20px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 100, fontSize: 9, fontWeight: 800, color: "rgba(245,245,245,0.5)", letterSpacing: "0.1em", textTransform: "uppercase" }}>Coming Soon</div>}

                <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 16, color: plan.id === "pro" ? N : "rgba(245,245,245,0.5)" }}>{plan.name}</div>

                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
                  {isPromo && plan.promoPrice && !isActive && (
                    <span style={{ fontSize: 36, fontWeight: 900, letterSpacing: "-0.04em" }}>R{plan.promoPrice}</span>
                  )}
                  <span style={{ fontSize: isPromo && plan.promoPrice && !isActive ? 18 : 36, fontWeight: 900, letterSpacing: "-0.04em", textDecoration: isPromo && plan.promoPrice && !isActive ? "line-through" : "none", color: isPromo && plan.promoPrice && !isActive ? "rgba(245,245,245,0.25)" : "#f5f5f5" }}>R{plan.price}</span>
                  <span style={{ fontSize: 13, color: "rgba(245,245,245,0.25)" }}>/mo</span>
                </div>

                {!isActive && plan.id === "starter" && <p style={{ fontSize: 11, color: "#22c55e", marginBottom: 4 }}>7-day free trial - R1 card verification</p>}
                {isPromo && plan.promoPrice && !isActive && (
                  <p style={{ fontSize: 11, color: N, marginBottom: 16 }}>After 7-day trial: R{plan.promoPrice} first month, then R{plan.price}/mo</p>
                )}
                {(!isPromo || !plan.promoPrice) && !isActive && plan.id === "starter" && (
                  <p style={{ fontSize: 11, color: "rgba(245,245,245,0.25)", marginBottom: 16 }}>Then R{plan.price}/mo after trial</p>
                )}
                {(!isPromo || !plan.promoPrice) && !isActive && plan.id === "pro" && (
                  <p style={{ fontSize: 11, color: "rgba(245,245,245,0.25)", marginBottom: 16 }}>Billed monthly</p>
                )}

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
                  <button onClick={() => { if (plan.id === "pro") return; subscribePlan(plan.id); }} disabled={processing || plan.id === "pro"} style={{ padding: "16px", background: plan.id === "pro" ? "rgba(255,255,255,0.05)" : "#f5f5f5", color: plan.id === "pro" ? "rgba(245,245,245,0.25)" : "#030303", border: plan.id === "pro" ? "1px solid rgba(255,255,255,0.08)" : "none", borderRadius: 100, fontSize: 12, fontWeight: 800, cursor: plan.id === "pro" ? "not-allowed" : processing ? "not-allowed" : "pointer", opacity: (processing && plan.id !== "pro") ? 0.6 : 1, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "'Schibsted Grotesk', sans-serif" }}>{plan.id === "pro" ? "Coming Soon" : processing ? "Redirecting..." : isActive ? "Upgrade to " + plan.name : "Start 7-Day Free Trial"}</button>
                )}
              </div>
            );
          })}
        </div>

        <p style={{ textAlign: "center", fontSize: 11, color: "rgba(245,245,245,0.15)", marginTop: 24 }}>Starter: R1 card verification, 7-day free trial, then auto-billed monthly. Pro: billed immediately. Cancel anytime. Prices in ZAR.</p>

        {/* CANCEL SUBSCRIPTION */}
        {isActive && (
          <div style={{ marginTop: 48, padding: "28px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 16, textAlign: "center" }}>
            <h3 style={{ fontSize: 14, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Cancel Subscription</h3>
            <p style={{ fontSize: 13, color: "rgba(245,245,245,0.25)", marginBottom: 20, maxWidth: 400, margin: "0 auto 20px" }}>Your store will remain active until the end of your current billing period. After that, your store will go offline.</p>
            <button onClick={async () => { if (!confirm("Are you sure you want to cancel your subscription? Your store will go offline at the end of your billing period.")) return; await supabase.from("sellers").update({ subscription_status: "expired" }).eq("id", seller.id); setSeller({ ...seller, subscription_status: "expired" }); }} style={{ padding: "12px 32px", background: "transparent", border: "1px solid rgba(255,61,110,0.2)", borderRadius: 100, color: "#ff3d6e", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "'Schibsted Grotesk', sans-serif", textTransform: "uppercase", letterSpacing: "0.06em" }}>Cancel Subscription</button>
          </div>
        )}

      </div>
    </div>
  );
}