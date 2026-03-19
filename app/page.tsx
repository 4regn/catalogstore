"use client";

import { useEffect, useState } from "react";

export default function Home() {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setLoaded(true); }, []);

  return (
    <>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;500;600;700;800;900&display=swap');

        * { margin: 0; padding: 0; box-sizing: border-box; }

        :root {
          --bg: #030303;
          --glass: rgba(255,255,255,0.03);
          --glass-b: rgba(255,255,255,0.06);
          --text: #f5f5f5;
          --text-dim: rgba(245,245,245,0.35);
          --neon: #ff6b35;
          --neon2: #ff3d6e;
          --neon-soft: rgba(255,107,53,0.08);
          --grad: linear-gradient(135deg, #ff6b35 0%, #ff3d6e 100%);
        }

        html { scroll-behavior: smooth; }
        body { font-family: 'Schibsted Grotesk', sans-serif; background: var(--bg); color: var(--text); overflow-x: hidden; }

        @keyframes pulse { 0%,100% { opacity:0.6; transform:scale(1) } 50% { opacity:1; transform:scale(1.1) } }
        @keyframes blink { 0%,100% { opacity:1 } 50% { opacity:0.3 } }
        @keyframes fu { from { opacity:0; transform:translateY(24px) } to { opacity:1; transform:translateY(0) } }
      `}</style>

      {/* AMBIENT FX */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}>
        <div style={{ position: "absolute", width: 600, height: 600, top: -200, right: -150, background: "radial-gradient(circle, rgba(255,107,53,0.06) 0%, transparent 65%)", filter: "blur(120px)", animation: "pulse 8s infinite ease-in-out" }} />
        <div style={{ position: "absolute", width: 500, height: 500, bottom: -200, left: -100, background: "radial-gradient(circle, rgba(255,61,110,0.05) 0%, transparent 65%)", filter: "blur(100px)", animation: "pulse 10s infinite ease-in-out 2s" }} />
      </div>

      {/* SCANLINES */}
      <div style={{ position: "fixed", inset: 0, zIndex: 1, pointerEvents: "none", opacity: 0.02, background: "repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(255,255,255,0.03) 1px, rgba(255,255,255,0.03) 2px)" }} />

      <div style={{ position: "relative", zIndex: 2, maxWidth: 1200, margin: "0 auto", padding: "0 32px" }}>

        {/* NAV */}
        <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, padding: "12px 32px" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 6px 12px 24px", background: "rgba(3,3,3,0.75)", backdropFilter: "blur(40px)", WebkitBackdropFilter: "blur(40px)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: 100 }}>
            <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.04em", textTransform: "uppercase" as const }}>
              CATALOG<span style={{ background: "var(--grad)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>STORE</span>
            </div>
            <div style={{ display: "flex", gap: 28, alignItems: "center" }}>
              {["Features", "Pricing", "Templates"].map((item) => (
                <a key={item} href={"#" + item.toLowerCase()} style={{ textDecoration: "none", color: "var(--text-dim)", fontSize: 13, fontWeight: 600, letterSpacing: "0.02em", textTransform: "uppercase" as const, transition: "color 0.3s" }}>{item}</a>
              ))}
              <a href="/signup" style={{ padding: "12px 28px", borderRadius: 100, border: "none", background: "var(--grad)", color: "#fff", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 12, fontWeight: 800, cursor: "pointer", letterSpacing: "0.06em", textTransform: "uppercase" as const, textDecoration: "none", transition: "all 0.3s" }}>Get Started</a>
            </div>
          </div>
        </nav>

        {/* HERO */}
        <section style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center" as const, paddingTop: 80 }}>
          <div style={{ maxWidth: 800 }}>
            <div style={{ display: "inline-flex", gap: 10, alignItems: "center", padding: "8px 20px 8px 12px", marginBottom: 36, borderRadius: 100, background: "var(--neon-soft)", border: "1px solid rgba(255,107,53,0.15)", fontSize: 11, color: "var(--neon)", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase" as const, animation: loaded ? "fu 0.6s ease both" : "none" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--neon)", animation: "blink 1.5s infinite" }} />
              WhatsApp to storefront
            </div>

            <h1 style={{ fontSize: "clamp(48px, 8vw, 96px)", fontWeight: 900, lineHeight: 0.95, letterSpacing: "-0.06em", textTransform: "uppercase" as const, marginBottom: 28, animation: loaded ? "fu 0.6s 0.1s ease both" : "none" }}>
              Your catalog.<br />
              <span style={{ background: "var(--grad)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Amplified.</span>
            </h1>

            <p style={{ fontSize: 17, lineHeight: 1.8, color: "var(--text-dim)", maxWidth: 500, margin: "0 auto 48px", fontWeight: 400, animation: loaded ? "fu 0.6s 0.2s ease both" : "none" }}>
              Turn your WhatsApp Business catalog into a branded, high-converting online store. Zero code. Zero friction.
            </p>

            <div style={{ display: "flex", gap: 12, justifyContent: "center", animation: loaded ? "fu 0.6s 0.3s ease both" : "none" }}>
              <a href="/signup" style={{ padding: "18px 48px", background: "var(--grad)", color: "#fff", border: "none", borderRadius: 100, fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 14, fontWeight: 800, cursor: "pointer", letterSpacing: "0.04em", textTransform: "uppercase" as const, textDecoration: "none", boxShadow: "0 0 40px rgba(255,107,53,0.2)", transition: "all 0.3s" }}>Launch Free</a>
              <a href="#features" style={{ padding: "18px 48px", background: "transparent", color: "var(--text)", border: "2px solid rgba(255,255,255,0.1)", borderRadius: 100, fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 14, fontWeight: 600, cursor: "pointer", letterSpacing: "0.04em", textTransform: "uppercase" as const, textDecoration: "none", transition: "all 0.3s" }}>See Demo</a>
            </div>
          </div>
        </section>

        {/* DEMO FRAME */}
        <section style={{ padding: "40px 0 120px", animation: loaded ? "fu 0.6s 0.5s ease both" : "none" }}>
          <div style={{ background: "var(--glass)", backdropFilter: "blur(40px)", WebkitBackdropFilter: "blur(40px)", border: "1px solid var(--glass-b)", borderRadius: 20, padding: 4, boxShadow: "0 30px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,107,53,0.03)", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(255,255,255,0.08)" }} />
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(255,255,255,0.08)" }} />
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(255,255,255,0.08)" }} />
              <span style={{ flex: 1, textAlign: "center" as const, fontSize: 11, color: "var(--text-dim)", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" as const }}>yourstore.catalogstore.co.za</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 3, padding: 3, minHeight: 360 }}>
              {[...Array(8)].map((_, i) => (
                <div key={i} style={{ aspectRatio: "3/4", background: "linear-gradient(160deg, rgba(255,255,255,0.02), rgba(255,255,255,0.005))", borderRadius: 4 }} />
              ))}
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section id="features" style={{ padding: "100px 0" }}>
          <div style={{ fontSize: 11, textTransform: "uppercase" as const, letterSpacing: "0.15em", color: "var(--neon)", fontWeight: 800, marginBottom: 16, textAlign: "center" as const }}>How It Works</div>
          <h2 style={{ textAlign: "center" as const, fontSize: "clamp(36px, 5vw, 56px)", fontWeight: 900, letterSpacing: "-0.05em", textTransform: "uppercase" as const, marginBottom: 64 }}>Dead simple</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 3 }}>
            {[
              { num: "01", title: "Import", desc: "Link your WhatsApp Business number. Your products, images, and prices appear in seconds.", radius: "20px 4px 4px 20px" },
              { num: "02", title: "Design", desc: "Pick a template. Set your colors. Upload your logo. Your store is uniquely yours.", radius: "4px" },
              { num: "03", title: "Sell", desc: "Go live instantly. Customers browse, add to bag, checkout via WhatsApp or card.", radius: "4px 20px 20px 4px" },
            ].map((step) => (
              <div key={step.num} style={{ padding: "40px 28px", background: "var(--glass)", border: "1px solid var(--glass-b)", borderRadius: step.radius, transition: "all 0.3s" }}>
                <div style={{ fontSize: 64, fontWeight: 900, letterSpacing: "-0.06em", color: "rgba(255,107,53,0.06)", lineHeight: 1, marginBottom: 16 }}>{step.num}</div>
                <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 10, letterSpacing: "-0.02em", textTransform: "uppercase" as const }}>{step.title}</h3>
                <p style={{ fontSize: 14, lineHeight: 1.7, color: "var(--text-dim)", fontWeight: 400 }}>{step.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* PRICING */}
        <section id="pricing" style={{ padding: "100px 0" }}>
          <div style={{ fontSize: 11, textTransform: "uppercase" as const, letterSpacing: "0.15em", color: "var(--neon)", fontWeight: 800, marginBottom: 16, textAlign: "center" as const }}>Pricing</div>
          <h2 style={{ textAlign: "center" as const, fontSize: "clamp(36px, 5vw, 56px)", fontWeight: 900, letterSpacing: "-0.05em", textTransform: "uppercase" as const, marginBottom: 64 }}>Pick your fuel</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 3 }}>
            {[
              { name: "Starter", price: "Free", period: "Forever", features: ["15 Products", "1 Template", "WhatsApp Checkout", "CatalogStore Branding"], hot: false, btn: "Get Started", radius: "20px 4px 4px 20px" },
              { name: "Pro", price: "R149", period: "/month", features: ["Unlimited Products", "All Templates", "Card Payments", "Custom Domain"], hot: true, btn: "Start Free Trial", radius: "4px" },
              { name: "Business", price: "R349", period: "/month", features: ["Everything in Pro", "Analytics", "Priority Support", "Multiple Stores"], hot: false, btn: "Contact Sales", radius: "4px 20px 20px 4px" },
            ].map((plan) => (
              <div key={plan.name} style={{ padding: "40px 28px", background: plan.hot ? "var(--neon-soft)" : "var(--glass)", border: plan.hot ? "1px solid rgba(255,107,53,0.12)" : "1px solid var(--glass-b)", borderRadius: plan.radius, transition: "all 0.3s" }}>
                <div style={{ fontSize: 11, textTransform: "uppercase" as const, letterSpacing: "0.12em", color: plan.hot ? "var(--neon)" : "var(--text-dim)", fontWeight: 800, marginBottom: 20 }}>{plan.name}</div>
                <div style={{ fontSize: 52, fontWeight: 900, letterSpacing: "-0.05em", marginBottom: 4 }}>{plan.price}</div>
                <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 32, fontWeight: 400 }}>{plan.period}</div>
                <ul style={{ listStyle: "none", marginBottom: 32 }}>
                  {plan.features.map((f) => (
                    <li key={f} style={{ padding: "10px 0", fontSize: 13, color: "var(--text-dim)", borderBottom: "1px solid rgba(255,255,255,0.03)", fontWeight: 400, textTransform: "uppercase" as const, letterSpacing: "0.03em" }}>{f}</li>
                  ))}
                </ul>
                <a href="/signup" style={{
                  display: "block", width: "100%", padding: 14, borderRadius: 100, textAlign: "center" as const, textDecoration: "none",
                  fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 12, fontWeight: 800, cursor: "pointer",
                  textTransform: "uppercase" as const, letterSpacing: "0.06em", transition: "all 0.3s",
                  background: plan.hot ? "var(--grad)" : "rgba(255,255,255,0.04)",
                  border: plan.hot ? "none" : "1px solid var(--glass-b)",
                  color: plan.hot ? "#fff" : "var(--text)",
                  boxShadow: plan.hot ? "0 0 30px rgba(255,107,53,0.15)" : "none",
                }}>{plan.btn}</a>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section style={{ padding: "100px 0" }}>
          <div style={{ textAlign: "center" as const, padding: "80px 40px", background: "var(--glass)", border: "1px solid var(--glass-b)", borderRadius: 20, position: "relative" as const, overflow: "hidden" }}>
            <div style={{ position: "absolute" as const, top: 0, left: 0, right: 0, height: 2, background: "var(--grad)", opacity: 0.3 }} />
            <h2 style={{ fontSize: "clamp(36px, 5vw, 56px)", fontWeight: 900, letterSpacing: "-0.05em", textTransform: "uppercase" as const, marginBottom: 16 }}>Stop sleeping on your catalog</h2>
            <p style={{ fontSize: 16, color: "var(--text-dim)", maxWidth: 440, margin: "0 auto 40px", lineHeight: 1.7, fontWeight: 400 }}>Hundreds of SA sellers are already live. Your customers are waiting.</p>
            <a href="/signup" style={{ display: "inline-block", padding: "18px 48px", background: "var(--grad)", color: "#fff", border: "none", borderRadius: 100, fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 14, fontWeight: 800, cursor: "pointer", letterSpacing: "0.04em", textTransform: "uppercase" as const, textDecoration: "none", boxShadow: "0 0 40px rgba(255,107,53,0.2)", transition: "all 0.3s" }}>Launch Your Store Free</a>
          </div>
        </section>

        {/* FOOTER */}
        <footer style={{ padding: "48px 0", textAlign: "center" as const, borderTop: "1px solid var(--glass-b)" }}>
          <p style={{ fontSize: 12, color: "var(--text-dim)", fontWeight: 500, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>
            &copy; 2026 <a href="/" style={{ background: "var(--grad)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", textDecoration: "none", fontWeight: 800 }}>CatalogStore</a>. Made in South Africa.
          </p>
        </footer>

      </div>
    </>
  );
}
