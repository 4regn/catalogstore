"use client";

import { useState, useEffect } from "react";

export default function Home() {
  const [scrolled, setScrolled] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const toggleFaq = (i: number) => setOpenFaq(openFaq === i ? null : i);

  const faqs = [
    {
      q: "Do I need a registered business?",
      a: "No. Yoco accepts sole proprietors - all you need is your SA ID, a selfie, and a personal bank account. Most WhatsApp sellers qualify instantly.",
    },
    {
      q: "How do payments work?",
      a: "Customers pay with card on your store. Money goes directly to your bank account via Yoco. We never touch your money - it is yours the moment a customer pays.",
    },
    {
      q: "Can I import my WhatsApp catalog?",
      a: "Yes. Connect your WhatsApp Business account and we will pull your products in automatically. You can also add products manually through your dashboard.",
    },
    {
      q: "How does delivery work?",
      a: "You handle delivery your way - just like you do now. Use your own courier, do local delivery yourself, or offer collection. Your business, your rules.",
    },
    {
      q: "Can I cancel anytime?",
      a: "Yes. No contracts, no lock-in periods. Cancel from your dashboard whenever you want. Your store stays active until the end of your billing period.",
    },
    {
      q: "Do I need to know how to code?",
      a: "Not at all. Pick a template, add your products, and your store is live. If you can post on Instagram, you can run a CatalogStore.",
    },
  ];

  return (
    <>
      {/* AMBIENT */}
      <div className="ambient">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
        <div className="noise" />
      </div>

      {/* HEADER */}
      <header className={`header ${scrolled ? "scrolled" : ""}`}>
        <div className="container">
          <div className="header-inner">
            <a href="#" className="logo">
              <div className="logo-icon">C</div>
              <div className="logo-text">
                Catalog<span>Store</span>
              </div>
            </a>

            <nav className="nav">
              <a href="#how">How It Works</a>
              <a href="#features">Features</a>
              <a href="#pricing">Pricing</a>
              <a href="#faq">FAQ</a>
            </nav>

            <div className="header-cta">
              <a href="#" className="btn-sm btn-sm-ghost">
                Login
              </a>
              <a href="#pricing" className="btn-sm btn-sm-accent">
                Sign Up Free
              </a>
            </div>

            <button className="menu-toggle">&#9776;</button>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="hero">
        <div className="container">
          <div className="hero-whatsapp-badge glass">
            <svg viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
              <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z" />
            </svg>
            Built for WhatsApp Sellers
          </div>

          <h1>
            From Catalog to Checkout
            <br />
            <span className="accent-text">- in Minutes.</span>
          </h1>

          <p className="subtitle">
            Turn your WhatsApp Business catalog into a professional online store.
            Accept card payments. Get your own website. No coding needed.
          </p>

          <div className="hero-actions">
            <a href="#pricing" className="btn-primary">
              Create My Store
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </a>
            <a href="#how" className="btn-outline">
              See How It Works
            </a>
          </div>

          <p className="hero-note">
            7-day free trial - No credit card required - Cancel anytime
          </p>
        </div>
      </section>

      {/* SOCIAL PROOF */}
      <section className="proof-bar">
        <div className="container">
          <div className="proof-grid">
            <div className="proof-item">
              <div className="proof-number">5 min</div>
              <div className="proof-label">Setup Time</div>
            </div>
            <div className="proof-item">
              <div className="proof-number">R0</div>
              <div className="proof-label">To Start</div>
            </div>
            <div className="proof-item">
              <div className="proof-number">0</div>
              <div className="proof-label">Code Needed</div>
            </div>
            <div className="proof-item">
              <div className="proof-number">100%</div>
              <div className="proof-label">Your Revenue</div>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="how-it-works" id="how">
        <div className="container">
          <div className="section-label">
            <span className="line" />
            How It Works
          </div>
          <h2 className="section-title">Three steps. That is it.</h2>
          <p className="section-subtitle">
            No developers. No complicated setup. If you can post on WhatsApp,
            you can launch your store.
          </p>

          <div className="steps-grid">
            <div className="step-card glass">
              <div className="step-number">01</div>
              <div className="step-icon step-icon-1">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#25d366" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12" y2="18"/></svg>
              </div>
              <h3>Sign Up and Connect</h3>
              <p>
                Create your account in 30 seconds. Connect your WhatsApp
                Business catalog or add products manually through your
                dashboard.
              </p>
            </div>
            <div className="step-card glass">
              <div className="step-number">02</div>
              <div className="step-icon step-icon-2">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#00d4aa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
              </div>
              <h3>Pick Your Look</h3>
              <p>
                Choose from premium templates designed to make your brand look
                professional. Customise colours, logo, and text - no design
                skills needed.
              </p>
            </div>
            <div className="step-card glass">
              <div className="step-number">03</div>
              <div className="step-icon step-icon-3">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13"/><path d="M22 2L15 22l-4-9-9-4 20-7z"/></svg>
              </div>
              <h3>Go Live</h3>
              <p>
                Connect Yoco for card payments, share your store link on
                WhatsApp, and start taking orders. Money goes straight to your
                bank account.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="features" id="features">
        <div className="container">
          <div className="section-label">
            <span className="line" />
            Everything You Need
          </div>
          <h2 className="section-title">Built for how you already sell.</h2>
          <p className="section-subtitle">
            We handle the tech. You handle the hustle.
          </p>

          <div className="features-grid">
            <div className="feature-card glass">
              <span className="feature-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00d4aa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
              </span>
              <h4>Yoco Card Payments</h4>
              <p>
                Accept card payments instantly. No business registration needed
                - Yoco works with your SA ID and personal bank account. Money
                hits your account directly.
              </p>
            </div>
            <div className="feature-card glass">
              <span className="feature-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00d4aa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
              </span>
              <h4>Your Own Website</h4>
              <p>
                Get a professional store at yourname.catalogstore.co.za. Share
                the link on WhatsApp, Instagram, Facebook - anywhere your
                customers are.
              </p>
            </div>
            <div className="feature-card glass">
              <span className="feature-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00d4aa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              </span>
              <h4>WhatsApp Integration</h4>
              <p>
                Order notifications go straight to your WhatsApp. Customers can
                chat with you directly. It works with how you already
                communicate.
              </p>
            </div>
            <div className="feature-card glass">
              <span className="feature-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00d4aa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg>
              </span>
              <h4>Seller Dashboard</h4>
              <p>
                Track orders, manage products, see your sales stats - all in one
                place. Simple enough to use from your phone.
              </p>
            </div>
            <div className="feature-card glass">
              <span className="feature-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00d4aa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              </span>
              <h4>Premium Templates</h4>
              <p>
                Beautiful, mobile-first store designs that make your brand look
                established. Not the generic stuff - templates with real
                aesthetic quality.
              </p>
            </div>
            <div className="feature-card glass">
              <span className="feature-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00d4aa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </span>
              <h4>Secure and Trusted</h4>
              <p>
                SSL encryption on every store. We never see customer card
                details - Yoco handles that. Your money never touches us. It
                goes straight to you.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* PREVIEW */}
      <section className="preview">
        <div className="container">
          <div className="preview-layout">
            <div className="preview-text">
              <div className="section-label">
                <span className="line" />
                Your Store
              </div>
              <h2 className="section-title">Professional from day one.</h2>
              <p>
                Every CatalogStore looks like a premium e-commerce site - not a
                basic link page. Your customers get a real shopping experience
                with cart, checkout, and payment.
              </p>
              <ul className="preview-features">
                <li>
                  <span className="check">&#10003;</span> Mobile-first responsive
                  design
                </li>
                <li>
                  <span className="check">&#10003;</span> Product filtering and
                  categories
                </li>
                <li>
                  <span className="check">&#10003;</span> Shopping cart and secure
                  checkout
                </li>
                <li>
                  <span className="check">&#10003;</span> WhatsApp chat button built
                  in
                </li>
                <li>
                  <span className="check">&#10003;</span> Your brand, your colours,
                  your story
                </li>
              </ul>
            </div>

            <div className="preview-mockup">
              <div className="mockup-bar">
                <div className="mockup-dots">
                  <span />
                  <span />
                  <span />
                </div>
                <div className="mockup-url">
                  <span>yourname</span>.catalogstore.co.za
                </div>
              </div>
              <div className="mockup-body">
                <div className="mockup-hero">
                  <div className="m-title">Your Brand Name</div>
                  <div className="m-sub">
                    Premium curated collection - Shop now
                  </div>
                </div>
                <div className="mockup-product mp-1">
                  <div className="m-swatch" />
                  <div className="m-name">Oversized Tee</div>
                  <div className="m-price">R349</div>
                </div>
                <div className="mockup-product mp-2">
                  <div className="m-swatch" />
                  <div className="m-name">Cargo Pants</div>
                  <div className="m-price">R599</div>
                </div>
                <div className="mockup-product mp-3">
                  <div className="m-swatch" />
                  <div className="m-name">Puffer Vest</div>
                  <div className="m-price">R799</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="pricing" id="pricing">
        <div className="container">
          <div className="section-label" style={{ justifyContent: "center" }}>
            <span className="line" />
            Pricing
          </div>
          <h2 className="section-title">Simple, honest pricing.</h2>
          <p className="section-subtitle">
            No hidden fees. No contracts. Start free and upgrade when you are
            ready.
          </p>

          <div className="pricing-grid">
            {/* STARTER */}
            <div className="pricing-card glass">
              <div className="plan-name">Starter</div>
              <div className="plan-desc">
                For sellers just getting started with their first online store.
              </div>
              <div className="plan-price">
                <span className="currency">R</span>
                <span className="amount">79</span>
                <span className="period">/month</span>
              </div>
              <div className="plan-billing">
                7-day free trial - Cancel anytime
              </div>
              <ul className="plan-features">
                <li>
                  <span className="tick">&#10003;</span> Up to 20 products
                </li>
                <li>
                  <span className="tick">&#10003;</span> 1 premium template
                </li>
                <li>
                  <span className="tick">&#10003;</span> Yoco card payments
                </li>
                <li>
                  <span className="tick">&#10003;</span> WhatsApp order notifications
                </li>
                <li>
                  <span className="tick">&#10003;</span> yourname.catalogstore.co.za
                </li>
                <li>
                  <span className="cross">&#10007;</span>
                  <span style={{ color: "var(--text-muted)" }}>
                    SMS notifications
                  </span>
                </li>
                <li>
                  <span className="cross">&#10007;</span>
                  <span style={{ color: "var(--text-muted)" }}>
                    Sales analytics
                  </span>
                </li>
              </ul>
              <a href="#" className="plan-btn plan-btn-outline">
                Start Free Trial
              </a>
            </div>

            {/* PRO */}
            <div className="pricing-card glass featured">
              <div className="popular-badge">Most Popular</div>
              <div className="plan-name">Pro</div>
              <div className="plan-desc">
                For growing sellers who want the full toolkit and all templates.
              </div>
              <div className="plan-price">
                <span className="currency">R</span>
                <span className="amount">149</span>
                <span className="period">/month</span>
              </div>
              <div className="plan-billing">
                7-day free trial - Cancel anytime
              </div>
              <ul className="plan-features">
                <li>
                  <span className="tick">&#10003;</span> Up to 100 products
                </li>
                <li>
                  <span className="tick">&#10003;</span> All premium templates
                </li>
                <li>
                  <span className="tick">&#10003;</span> Yoco card payments
                </li>
                <li>
                  <span className="tick">&#10003;</span> WhatsApp + SMS notifications
                </li>
                <li>
                  <span className="tick">&#10003;</span> Sales analytics dashboard
                </li>
                <li>
                  <span className="tick">&#10003;</span> WhatsApp catalog import
                </li>
                <li>
                  <span className="tick">&#10003;</span> yourname.catalogstore.co.za
                </li>
              </ul>
              <a href="#" className="plan-btn plan-btn-accent">
                Start Free Trial
              </a>
            </div>

            {/* BUSINESS */}
            <div className="pricing-card glass">
              <div className="plan-name">Business</div>
              <div className="plan-desc">
                For established sellers ready to own their brand fully.
              </div>
              <div className="plan-price">
                <span className="currency">R</span>
                <span className="amount">299</span>
                <span className="period">/month</span>
              </div>
              <div className="plan-billing">
                7-day free trial - Cancel anytime
              </div>
              <ul className="plan-features">
                <li>
                  <span className="tick">&#10003;</span> Unlimited products
                </li>
                <li>
                  <span className="tick">&#10003;</span> All premium templates
                </li>
                <li>
                  <span className="tick">&#10003;</span> Yoco card payments
                </li>
                <li>
                  <span className="tick">&#10003;</span> WhatsApp + SMS notifications
                </li>
                <li>
                  <span className="tick">&#10003;</span> Advanced analytics
                </li>
                <li>
                  <span className="tick">&#10003;</span> Custom domain (yourbrand.co.za)
                </li>
                <li>
                  <span className="tick">&#10003;</span> Priority support
                </li>
              </ul>
              <a href="#" className="plan-btn plan-btn-outline">
                Start Free Trial
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="faq" id="faq">
        <div className="container">
          <div className="faq-layout">
            <div>
              <div className="section-label">
                <span className="line" />
                FAQ
              </div>
              <h2 className="section-title">Got questions?</h2>
              <p className="section-subtitle">
                Everything you need to know before launching your store.
              </p>
            </div>

            <div className="faq-list">
              {faqs.map((faq, i) => (
                <div
                  key={i}
                  className={`faq-item ${openFaq === i ? "open" : ""}`}
                >
                  <button
                    className="faq-question"
                    onClick={() => toggleFaq(i)}
                  >
                    {faq.q}
                    <span className="plus">+</span>
                  </button>
                  <div className="faq-answer">
                    <p>{faq.a}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="final-cta">
        <div className="container">
          <div className="cta-box">
            <h2>
              Your customers are ready to pay by card.
              <br />
              Give them a way to.
            </h2>
            <p>
              Stop losing sales to &ldquo;I will EFT you later.&rdquo; Get a
              professional store with real checkout - in minutes, not months.
            </p>
            <a href="#pricing" className="btn-primary">
              Create My Store - Free to Start
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </a>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="footer">
        <div className="container">
          <div className="footer-inner">
            <div className="footer-left">
              <div className="footer-logo">
                Catalog<span>Store</span>
              </div>
              <span className="footer-copy">
                &copy; 2026 CatalogStore - South Africa
              </span>
            </div>
            <div className="footer-links">
              <a href="#">Privacy</a>
              <a href="#">Terms</a>
              <a href="#">Contact</a>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
