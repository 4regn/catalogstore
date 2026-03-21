"use client";

import { useEffect, useState } from "react";

const Logo = ({ size = 32 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id={"alg" + size} x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#ff5a36"/><stop offset="100%" stopColor="#ff3d6e"/></linearGradient></defs>
    <path d="M54 12 A26 26 0 1 0 54 60" stroke={"url(#alg" + size + ")"} strokeWidth="9" strokeLinecap="round" fill="none"/>
    <circle cx="57" cy="36" r="6" fill={"url(#alg" + size + ")"}/>
    <circle cx="57" cy="36" r="2.4" fill="#0a0a0a"/>
  </svg>
);

export default function Home() {
  const [loaded, setLoaded] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
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
          --text-muted: rgba(245,245,245,0.18);
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

        @media (max-width: 768px) {
          .nav-link-desktop { display: none !important; }
          .hero-buttons { flex-direction: column !important; }
          .hero-buttons a { width: 100% !important; text-align: center !important; }
          .features-grid-3 { grid-template-columns: 1fr !important; }
          .pricing-grid-2 { gap: 3px !important; }
          .pricing-grid-2 > div { padding: 24px 16px !important; }
          .pricing-grid-2 .price-num { font-size: 36px !important; }
          .demo-grid-4 { grid-template-columns: repeat(2, 1fr) !important; }
          .pain-grid-2 { grid-template-columns: 1fr !important; }
          .sleep-flex { flex-direction: column !important; }
        }
      `}</style>

      {/* AMBIENT FX */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}>
        <div style={{ position: "absolute", width: 600, height: 600, top: -200, right: -150, background: "radial-gradient(circle, rgba(255,107,53,0.06) 0%, transparent 65%)", filter: "blur(120px)", animation: "pulse 8s infinite ease-in-out" }} />
        <div style={{ position: "absolute", width: 500, height: 500, bottom: -200, left: -100, background: "radial-gradient(circle, rgba(255,61,110,0.05) 0%, transparent 65%)", filter: "blur(100px)", animation: "pulse 10s infinite ease-in-out 2s" }} />
      </div>

      {/* SCANLINES */}
      <div style={{ position: "fixed", inset: 0, zIndex: 1, pointerEvents: "none", opacity: 0.02, background: "repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(255,255,255,0.03) 1px, rgba(255,255,255,0.03) 2px)" }} />

      <div style={{ position: "relative", zIndex: 2, maxWidth: 1200, margin: "0 auto", padding: "0 24px" }}>

        {/* NAV */}
        <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, padding: "12px 24px" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 6px 10px 20px", background: "rgba(3,3,3,0.75)", backdropFilter: "blur(40px)", WebkitBackdropFilter: "blur(40px)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: 100 }}>
            <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
              <Logo size={28} />
              <span style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.04em", textTransform: "uppercase" as const, color: "var(--text)" }}>
                CATALOG<span style={{ background: "var(--grad)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>STORE</span>
              </span>
            </a>
            <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
              {["Features", "Pricing", "FAQ"].map((item) => (
                <a key={item} href={"#" + item.toLowerCase()} className="nav-link-desktop" style={{ textDecoration: "none", color: "var(--text-dim)", fontSize: 12, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" as const }}>{item}</a>
              ))}
              <a href="/login" style={{ textDecoration: "none", color: "var(--text-dim)", fontSize: 12, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" as const }}>Login</a>
              <a href="/signup" style={{ padding: "11px 24px", borderRadius: 100, background: "var(--grad)", color: "#fff", fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase" as const, textDecoration: "none" }}>Sign Up</a>
            </div>
          </div>
        </nav>

        {/* HERO */}
        <section style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center" as const, paddingTop: 80 }}>
          <div style={{ maxWidth: 800 }}>
            <div style={{ display: "inline-flex", gap: 10, alignItems: "center", padding: "8px 20px 8px 12px", marginBottom: 36, borderRadius: 100, background: "var(--neon-soft)", border: "1px solid rgba(255,107,53,0.15)", fontSize: 11, color: "var(--neon)", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase" as const, animation: loaded ? "fu 0.6s ease both" : "none" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--neon)", animation: "blink 1.5s infinite" }} />
              Launch Promo - R49 First Month
            </div>

            <h1 style={{ fontSize: "clamp(42px, 8vw, 96px)", fontWeight: 900, lineHeight: 0.95, letterSpacing: "-0.06em", textTransform: "uppercase" as const, marginBottom: 28, animation: loaded ? "fu 0.6s 0.1s ease both" : "none" }}>
              Your catalog.<br />
              <span style={{ background: "var(--grad)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Amplified.</span>
            </h1>

            <p style={{ fontSize: 17, lineHeight: 1.8, color: "var(--text-dim)", maxWidth: 520, margin: "0 auto 48px", fontWeight: 400, animation: loaded ? "fu 0.6s 0.2s ease both" : "none" }}>
              Build a professional online store in minutes. Accept payments automatically. Make money while you sleep. No coding required.
            </p>

            <div className="hero-buttons" style={{ display: "flex", gap: 12, justifyContent: "center", animation: loaded ? "fu 0.6s 0.3s ease both" : "none" }}>
              <a href="/signup" style={{ padding: "18px 48px", background: "var(--grad)", color: "#fff", border: "none", borderRadius: 100, fontSize: 14, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase" as const, textDecoration: "none", boxShadow: "0 0 40px rgba(255,107,53,0.2)" }}>Start Your Free Trial</a>
              <a href="#features" style={{ padding: "18px 48px", background: "transparent", color: "var(--text)", border: "2px solid rgba(255,255,255,0.1)", borderRadius: 100, fontSize: 14, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" as const, textDecoration: "none" }}>Learn More</a>
            </div>

            <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 20, animation: loaded ? "fu 0.6s 0.4s ease both" : "none" }}>7-day free trial. Cancel anytime.</p>
          </div>
        </section>

        {/* PRICING */}
        <section id="pricing" style={{ padding: "40px 0 100px" }}>
          <div style={{ fontSize: 11, textTransform: "uppercase" as const, letterSpacing: "0.15em", color: "var(--neon)", fontWeight: 800, marginBottom: 16, textAlign: "center" as const }}>Pricing</div>
          <h2 style={{ textAlign: "center" as const, fontSize: "clamp(32px, 5vw, 56px)", fontWeight: 900, letterSpacing: "-0.05em", textTransform: "uppercase" as const, marginBottom: 20 }}>Pick your fuel</h2>
          <p style={{ textAlign: "center" as const, fontSize: 14, color: "var(--text-dim)", marginBottom: 16 }}>7-day free trial on Starter. Cancel anytime.</p>
          <div style={{ textAlign: "center" as const, marginBottom: 48 }}>
            <span style={{ display: "inline-block", padding: "8px 24px", background: "var(--neon-soft)", border: "1px solid rgba(255,107,53,0.12)", borderRadius: 100, fontSize: 11, fontWeight: 800, color: "var(--neon)", letterSpacing: "0.08em", textTransform: "uppercase" as const }}>Launch Promo - R49 First Month on Starter</span>
          </div>
          <div className="pricing-grid-2" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 3, maxWidth: 800, margin: "0 auto" }}>
            {[
              { name: "Starter", price: "R49", fullPrice: "R99", period: "/mo", promo: "First month only, then R99/mo", features: ["15 Products", "5 Images Per Product", "5 Collections", "2 Templates", "Store Editor", "All Payment Methods", "WhatsApp Checkout", "Subdomain Included"], hot: false, btn: "Start with Starter", radius: "20px 4px 4px 20px" },
              { name: "Pro", price: "R249", fullPrice: null, period: "/mo", promo: null, features: ["100 Products", "20 Images Per Product", "20 Collections", "All Templates (Current + Future)", "Custom Domain Support", "No 'Powered by CatalogStore'", "Priority Support", "Everything in Starter"], hot: true, btn: "Start with Pro", radius: "4px 20px 20px 4px" },
            ].map((plan) => (
              <div key={plan.name} style={{ padding: "40px 28px", background: plan.hot ? "var(--neon-soft)" : "var(--glass)", border: plan.hot ? "2px solid rgba(255,107,53,0.15)" : "1px solid var(--glass-b)", borderRadius: plan.radius, position: "relative" as const, display: "flex", flexDirection: "column" }}>
                {plan.hot && <div style={{ position: "absolute" as const, top: -12, left: "50%", transform: "translateX(-50%)", padding: "4px 20px", background: "var(--grad)", borderRadius: 100, fontSize: 9, fontWeight: 800, color: "#fff", letterSpacing: "0.1em", textTransform: "uppercase" as const }}>Most Popular</div>}
                <div style={{ fontSize: 11, textTransform: "uppercase" as const, letterSpacing: "0.12em", color: plan.hot ? "var(--neon)" : "var(--text-dim)", fontWeight: 800, marginBottom: 20 }}>{plan.name}</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 52, fontWeight: 900, letterSpacing: "-0.05em" }}>{plan.price}</span>
                  {plan.fullPrice && <span style={{ fontSize: 20, fontWeight: 900, textDecoration: "line-through", color: "var(--text-dim)" }}>{plan.fullPrice}</span>}
                  <span style={{ fontSize: 13, color: "var(--text-dim)" }}>{plan.period}</span>
                </div>
                {plan.promo && <div style={{ fontSize: 12, color: "var(--neon)", marginBottom: 24 }}>{plan.promo}</div>}
                {!plan.promo && <div style={{ height: 18, marginBottom: 24 }} />}
                <ul style={{ listStyle: "none", marginBottom: 32, flex: 1 }}>
                  {plan.features.map((f) => (
                    <li key={f} style={{ padding: "10px 0", fontSize: 13, color: "var(--text-dim)", borderBottom: "1px solid rgba(255,255,255,0.03)", fontWeight: 400, display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ color: plan.hot ? "var(--neon)" : "#22c55e", fontSize: 12 }}>&#10003;</span>{f}
                    </li>
                  ))}
                </ul>
                <a href="/signup" style={{
                  display: "block", width: "100%", padding: 16, borderRadius: 100, textAlign: "center" as const, textDecoration: "none",
                  fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase" as const,
                  background: plan.hot ? "var(--grad)" : "#f5f5f5",
                  color: plan.hot ? "#fff" : "#030303",
                  boxShadow: plan.hot ? "0 0 30px rgba(255,107,53,0.15)" : "none",
                }}>{plan.btn}</a>
              </div>
            ))}
          </div>
        </section>

        {/* TEMPLATES PREVIEW */}
        <section id="templates" style={{ padding: "60px 0 100px" }}>
          <div style={{ fontSize: 11, textTransform: "uppercase" as const, letterSpacing: "0.15em", color: "var(--neon)", fontWeight: 800, marginBottom: 16, textAlign: "center" as const }}>Templates</div>
          <h2 style={{ textAlign: "center" as const, fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 900, letterSpacing: "-0.04em", textTransform: "uppercase" as const, marginBottom: 48 }}>Choose your look</h2>
          <div style={{ background: "var(--glass)", backdropFilter: "blur(40px)", WebkitBackdropFilter: "blur(40px)", border: "1px solid var(--glass-b)", borderRadius: 20, padding: 4, boxShadow: "0 30px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,107,53,0.03)", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(255,255,255,0.08)" }} />
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(255,255,255,0.08)" }} />
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(255,255,255,0.08)" }} />
              <span style={{ flex: 1, textAlign: "center" as const, fontSize: 11, color: "var(--text-dim)", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" as const }}>yourstore.catalogstore.co.za</span>
            </div>
            <div className="demo-grid-4" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 3, padding: 3, minHeight: 360 }}>
              {[...Array(8)].map((_, i) => (
                <div key={i} style={{ aspectRatio: "3/4", background: "linear-gradient(160deg, rgba(255,255,255,0.02), rgba(255,255,255,0.005))", borderRadius: 4 }} />
              ))}
            </div>
          </div>
        </section>

        {/* SOUND FAMILIAR */}
        <section style={{ padding: "80px 0" }}>
          <div style={{ fontSize: 11, textTransform: "uppercase" as const, letterSpacing: "0.15em", color: "var(--neon)", fontWeight: 800, marginBottom: 16, textAlign: "center" as const }}>Sound Familiar?</div>
          <h2 style={{ textAlign: "center" as const, fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 900, letterSpacing: "-0.04em", textTransform: "uppercase" as const, marginBottom: 48 }}>The struggle is real</h2>
          <div className="pain-grid-2" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 3 }}>
            {[
              { title: "Endless DMs", desc: "Replying to the same questions over and over. 'Is this still available?' 'What sizes do you have?'" },
              { title: "Lost customers", desc: "They screenshot your products, promise to come back, and never do. No way to follow up." },
              { title: "Sleeping on sales", desc: "While you're offline, potential customers are browsing - but there's nowhere to buy." },
              { title: "Tech overwhelm", desc: "You tried Shopify, WooCommerce, or building your own site. It felt like learning to code." },
            ].map((p, i) => (
              <div key={i} style={{ padding: "32px 28px", background: "var(--glass)", border: "1px solid var(--glass-b)", borderRadius: i === 0 ? "20px 4px 4px 4px" : i === 1 ? "4px 20px 4px 4px" : i === 2 ? "4px 4px 4px 20px" : "4px 4px 20px 4px" }}>
                <h3 style={{ fontSize: 14, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.02em", marginBottom: 8 }}>{p.title}</h3>
                <p style={{ fontSize: 14, lineHeight: 1.7, color: "var(--text-dim)", fontWeight: 400 }}>{p.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="features" style={{ padding: "100px 0" }}>
          <div style={{ fontSize: 11, textTransform: "uppercase" as const, letterSpacing: "0.15em", color: "var(--neon)", fontWeight: 800, marginBottom: 16, textAlign: "center" as const }}>How It Works</div>
          <h2 style={{ textAlign: "center" as const, fontSize: "clamp(32px, 5vw, 56px)", fontWeight: 900, letterSpacing: "-0.05em", textTransform: "uppercase" as const, marginBottom: 64 }}>Simple setup</h2>
          <div className="features-grid-3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 3 }}>
            {[
              { num: "01", title: "Sign Up", desc: "Pick a store name, choose your look. Your store URL is ready instantly. Already on WhatsApp Business? Import your catalog in seconds.", radius: "20px 4px 4px 20px" },
              { num: "02", title: "Customize", desc: "Upload products, set prices, organize collections. Use the visual editor to make it yours - colors, logo, banners, policies.", radius: "4px" },
              { num: "03", title: "Sell", desc: "Share your link. Customers browse, select variants, add to cart, and checkout. Orders and payments flow to you automatically.", radius: "4px 20px 20px 4px" },
            ].map((step) => (
              <div key={step.num} style={{ padding: "40px 28px", background: "var(--glass)", border: "1px solid var(--glass-b)", borderRadius: step.radius }}>
                <div style={{ fontSize: 64, fontWeight: 900, letterSpacing: "-0.06em", color: "rgba(255,107,53,0.06)", lineHeight: 1, marginBottom: 16 }}>{step.num}</div>
                <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 10, letterSpacing: "-0.02em", textTransform: "uppercase" as const }}>{step.title}</h3>
                <p style={{ fontSize: 14, lineHeight: 1.7, color: "var(--text-dim)", fontWeight: 400 }}>{step.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* MONEY WHILE YOU SLEEP */}
        <section style={{ padding: "80px 0" }}>
          <div className="sleep-flex" style={{ display: "flex", gap: 3, alignItems: "stretch" }}>
            <div style={{ flex: 1, padding: "48px 36px", background: "var(--glass)", border: "1px solid var(--glass-b)", borderRadius: "20px 4px 4px 20px" }}>
              <div style={{ fontSize: 11, textTransform: "uppercase" as const, letterSpacing: "0.15em", color: "var(--neon)", fontWeight: 800, marginBottom: 16 }}>The Philosophy</div>
              <h2 style={{ fontSize: "clamp(24px, 3.5vw, 36px)", fontWeight: 900, letterSpacing: "-0.04em", textTransform: "uppercase" as const, marginBottom: 20 }}>Money while you sleep</h2>
              <p style={{ fontSize: 15, color: "var(--text-dim)", lineHeight: 1.8, marginBottom: 16 }}>
                Imagine waking up to 3 new orders. You didn't DM anyone. You didn't negotiate prices. You didn't screenshot bank details.
              </p>
              <p style={{ fontSize: 15, color: "var(--text-dim)", lineHeight: 1.8 }}>
                Your store did the work while you slept. Set it up once, and let your products sell around the clock.
              </p>
            </div>
            <div style={{ flex: 1, padding: "48px 36px", background: "var(--neon-soft)", border: "1px solid rgba(255,107,53,0.12)", borderRadius: "4px 20px 20px 4px", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center" as const }}>
              <div style={{ fontSize: 72, fontWeight: 900, letterSpacing: "-0.06em", background: "var(--grad)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginBottom: 8 }}>24/7</div>
              <p style={{ fontSize: 14, color: "var(--text-dim)", maxWidth: 280 }}>Your store never closes. Orders come in while you sleep, eat, and live your life.</p>
            </div>
          </div>
        </section>

        {/* YOUR MONEY IS YOURS */}
        <section style={{ padding: "60px 0" }}>
          <div style={{ padding: "48px 40px", background: "var(--glass)", border: "1px solid var(--glass-b)", borderRadius: 20, textAlign: "center" as const }}>
            <h3 style={{ fontSize: "clamp(20px, 3vw, 28px)", fontWeight: 900, textTransform: "uppercase" as const, letterSpacing: "-0.03em", marginBottom: 16 }}>100% of your sales are yours</h3>
            <p style={{ fontSize: 15, color: "var(--text-dim)", lineHeight: 1.7, maxWidth: 500, margin: "0 auto 28px" }}>
              We charge a simple monthly subscription. We never take a cut of your sales. No transaction fees. No commission. Your customers pay you directly.
            </p>
            <div style={{ display: "flex", justifyContent: "center", gap: 32, flexWrap: "wrap" as const }}>
              {["No transaction fees", "No commission", "No hidden charges"].map((t, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: "#22c55e", fontSize: 12 }}>&#10003;</span>
                  <span style={{ fontSize: 13, color: "var(--text-dim)", fontWeight: 500 }}>{t}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" style={{ padding: "100px 0" }}>
          <div style={{ fontSize: 11, textTransform: "uppercase" as const, letterSpacing: "0.15em", color: "var(--neon)", fontWeight: 800, marginBottom: 16, textAlign: "center" as const }}>FAQ</div>
          <h2 style={{ textAlign: "center" as const, fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 900, letterSpacing: "-0.04em", textTransform: "uppercase" as const, marginBottom: 48 }}>Common questions</h2>
          <div style={{ maxWidth: 700, margin: "0 auto", display: "flex", flexDirection: "column", gap: 3 }}>
            {[
              { q: "Do I need technical skills?", a: "Not at all. If you can post on social media, you can build a store on CatalogStore. Everything is click-to-edit with a visual editor." },
              { q: "Can my customers pay online?", a: "Yes. You connect your own payment provider like PayFast or set up EFT payments. Customers pay you directly through your store - we never touch your money." },
              { q: "What happens after the free trial?", a: "After 7 days, your chosen plan activates automatically. Your R1 card verification converts to your first subscription payment." },
              { q: "Can I use my own domain?", a: "Yes, on the Pro plan. You get a free subdomain (yourstore.catalogstore.co.za) on all plans, with custom domain support on Pro for a once-off R199 setup fee." },
              { q: "Do you take a percentage of my sales?", a: "Never. We charge a flat monthly subscription. 100% of your sales revenue goes directly to your account." },
              { q: "Can I import my WhatsApp Business catalog?", a: "Yes. If you already sell on WhatsApp Business, you can import your products automatically. You can also add products manually if you prefer." },
            ].map((faq, i) => (
              <div key={i} style={{ background: "var(--glass)", border: "1px solid var(--glass-b)", borderRadius: i === 0 ? "20px 20px 4px 4px" : i === 5 ? "4px 4px 20px 20px" : "4px", overflow: "hidden" }}>
                <button onClick={() => setOpenFaq(openFaq === i ? null : i)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", background: "none", border: "none", cursor: "pointer", fontFamily: "'Schibsted Grotesk', sans-serif", color: "var(--text)", textAlign: "left" as const }}>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{faq.q}</span>
                  <span style={{ fontSize: 18, color: "var(--text-dim)", transition: "transform 0.2s", transform: openFaq === i ? "rotate(45deg)" : "rotate(0)" }}>+</span>
                </button>
                {openFaq === i && (
                  <div style={{ padding: "0 24px 20px" }}>
                    <p style={{ fontSize: 14, color: "var(--text-dim)", lineHeight: 1.7 }}>{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section style={{ padding: "100px 0" }}>
          <div style={{ textAlign: "center" as const, padding: "80px 32px", background: "var(--glass)", border: "1px solid var(--glass-b)", borderRadius: 20, position: "relative" as const, overflow: "hidden" }}>
            <div style={{ position: "absolute" as const, top: 0, left: 0, right: 0, height: 2, background: "var(--grad)", opacity: 0.3 }} />
            <h2 style={{ fontSize: "clamp(28px, 5vw, 56px)", fontWeight: 900, letterSpacing: "-0.05em", textTransform: "uppercase" as const, marginBottom: 16 }}>Stop sleeping on your catalog</h2>
            <p style={{ fontSize: 16, color: "var(--text-dim)", maxWidth: 440, margin: "0 auto 40px", lineHeight: 1.7, fontWeight: 400 }}>Every hour without a store is money left on the table. Your customers are waiting.</p>
            <a href="/signup" style={{ display: "inline-block", padding: "18px 48px", background: "var(--grad)", color: "#fff", borderRadius: 100, fontSize: 14, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase" as const, textDecoration: "none", boxShadow: "0 0 40px rgba(255,107,53,0.2)" }}>Start Your Free Trial</a>
            <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 16 }}>7 days free. Cancel anytime.</p>
          </div>
        </section>

        {/* FOOTER */}
        <footer style={{ padding: "48px 0", borderTop: "1px solid var(--glass-b)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" as const, gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Logo size={22} />
              <span style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase" as const }}>
                CATALOG<span style={{ background: "var(--grad)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>STORE</span>
              </span>
            </div>
            <p style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase" as const }}>
              &copy; {new Date().getFullYear()} CatalogStore. Built in South Africa.
            </p>
            <div style={{ display: "flex", gap: 20 }}>
              {["Instagram", "Facebook", "WhatsApp"].map((l) => <a key={l} href="#" style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>{l}</a>)}
            </div>
          </div>
        </footer>

      </div>
    </>
  );
}
