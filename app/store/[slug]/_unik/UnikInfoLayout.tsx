"use client";

import UnikFooter from "./UnikFooter";

// Shared shell for UNIK Labs' informational/legal pages (About, Contact,
// Help, FAQs, and the legal policy placeholders). Mirrors the dark visual
// system already used on the account page (UnikAccountClient.tsx) so a
// customer bouncing between the storefront, their account and these pages
// doesn't see a jarring style change.
export default function UnikInfoLayout({
  kicker,
  title,
  subtitle,
  lastUpdated,
  wide,
  basePath = "/store/unik",
  children,
}: {
  kicker: string;
  title: string;
  subtitle?: React.ReactNode;
  lastUpdated?: string;
  wide?: boolean;
  basePath?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="ui-page">
      <header className="ui-nav">
        <a href="/private-templates/unik-labs/index.html" className="ui-logo" aria-label="UNIK home">
          <img src="/private-templates/unik-labs/assets/unik-logo-v3-header.png" alt="UNIK — For you. And only you" />
        </a>
        <a href="/private-templates/unik-labs/index.html" className="ui-return">Return to store</a>
      </header>
      <article className={`ui-content${wide ? " wide" : ""}`}>
        <p className="ui-kicker">{kicker}</p>
        <h1>{title}</h1>
        {subtitle && <p className="ui-subtitle">{subtitle}</p>}
        {lastUpdated && <p className="ui-updated">Last updated: {lastUpdated}</p>}
        <div className="ui-body">{children}</div>
      </article>
      <UnikFooter basePath={basePath} />
      <style jsx global>{`
        *{box-sizing:border-box}
        html,body{margin:0;background:#080909;color:#f4f1e9;font-family:'Manrope',Arial,sans-serif;scroll-behavior:smooth}
        .ui-page{min-height:100dvh;display:flex;flex-direction:column;background:radial-gradient(circle at 15% 0%,#1a1d1b 0,transparent 34%),#080909}
        .ui-nav{height:78px;border-bottom:1px solid #292c29;display:flex;align-items:center;justify-content:space-between;padding:0 max(22px,calc((100vw - 1160px)/2))}
        .ui-logo{display:flex;align-items:center;text-decoration:none;line-height:0}
        .ui-logo img{display:block;width:124px;height:auto;object-fit:contain}
        .ui-return{color:#d8d5cd;font-size:10px;letter-spacing:.14em;text-transform:uppercase;text-decoration:none}
        .ui-return:hover,.ui-return:focus-visible{color:#fff}
        .ui-content{flex:1;width:min(820px,calc(100% - 36px));margin:0 auto;padding:64px 0 100px;scroll-margin-top:24px}
        .ui-content.wide{width:min(1000px,calc(100% - 36px))}
        .ui-kicker{font-size:10px;letter-spacing:.24em;text-transform:uppercase;color:#969a93;margin:0 0 16px}
        .ui-content h1{font-family:Georgia,serif;font-weight:400;text-transform:uppercase;line-height:.94;margin:0 0 10px;font-size:clamp(36px,6vw,58px)}
        .ui-subtitle{color:#a6a8a2;font-size:15px;line-height:1.7;max-width:640px;margin:0 0 20px}
        .ui-updated{color:#8b8e86;font-size:11px;letter-spacing:.08em;text-transform:uppercase;margin:0 0 40px}
        .ui-body{color:#c9c7bd;font-size:15px;line-height:1.8}
        .ui-body p{margin:0 0 20px}
        .ui-body h2{font-family:Georgia,serif;font-weight:400;text-transform:uppercase;font-size:clamp(20px,3vw,26px);margin:36px 0 14px;color:#f4f1e9;scroll-margin-top:24px}
        .ui-body h3{font-size:15px;font-weight:700;margin:26px 0 10px;color:#f4f1e9}
        .ui-body ul{margin:0 0 20px;padding-left:20px}
        .ui-body li{margin-bottom:8px}
        .ui-body a{color:#f4f1e9}
        .ui-notice{margin-top:8px;padding:18px 20px;border:1px solid #2c2f2b;border-radius:14px;background:#111312;color:#a6a8a2;font-size:13px;line-height:1.7}

        /* Chip row: quick jump-links to a section id on the same page */
        .ui-chips{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 44px;padding:0;list-style:none}
        .ui-chips a{display:inline-flex;align-items:center;height:36px;padding:0 16px;border:1px solid #2c2f2b;border-radius:999px;background:#111312;color:#c9c7bd;text-decoration:none;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;transition:border-color .2s,color .2s}
        .ui-chips a:hover,.ui-chips a:focus-visible{border-color:#007517;color:#fff}

        /* Card grid: Help Centre category cards */
        .ui-cards{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:0 0 44px}
        .ui-card{display:block;padding:20px 22px;border:1px solid #2c2f2b;border-radius:16px;background:#111312;text-decoration:none;transition:border-color .2s,transform .2s}
        .ui-card:hover,.ui-card:focus-visible{border-color:#007517;transform:translateY(-1px)}
        .ui-card strong{display:block;font-size:13px;color:#f4f1e9;margin-bottom:6px}
        .ui-card span{display:block;font-size:12px;color:#8f928a;line-height:1.6}

        /* Accordion: FAQ, built on native <details> -- no JS needed */
        .ui-faq{border-top:1px solid #2c2f2b;margin:0 0 44px}
        .ui-faq details{border-bottom:1px solid #2c2f2b}
        .ui-faq summary{list-style:none;cursor:pointer;padding:18px 30px 18px 0;position:relative;font-size:14px;font-weight:700;color:#f4f1e9}
        .ui-faq summary::-webkit-details-marker{display:none}
        .ui-faq summary::after{content:'+';position:absolute;right:2px;top:16px;font-size:20px;font-weight:400;color:#8f928a;transition:transform .2s}
        .ui-faq details[open] summary::after{transform:rotate(45deg)}
        .ui-faq summary:focus-visible{outline:2px solid #007517;outline-offset:3px;border-radius:2px}
        .ui-faq .ui-faq-a{margin:0 0 20px;color:#a9a7a0;font-size:13px;line-height:1.75}
        .ui-faq .ui-faq-a ul{margin:8px 0 0;padding-left:18px}
        .ui-faq .ui-faq-a li{margin-bottom:6px}

        /* Numbered steps: About "How it works" */
        .ui-steps{display:grid;gap:18px;margin:0 0 20px;padding:0;list-style:none;counter-reset:ui-step}
        .ui-steps li{counter-increment:ui-step;display:grid;grid-template-columns:38px 1fr;gap:16px;padding:20px;border:1px solid #2c2f2b;border-radius:16px;background:#111312}
        .ui-steps li::before{content:counter(ui-step);width:38px;height:38px;border-radius:50%;background:#007517;color:#fff;display:grid;place-items:center;font-family:Georgia,serif;font-size:16px}
        .ui-steps strong{display:block;font-size:13px;color:#f4f1e9;margin-bottom:6px;text-transform:uppercase;letter-spacing:.04em}
        .ui-steps span{display:block;font-size:13px;color:#a9a7a0;line-height:1.7}

        /* Feature grid: About "What makes UNIK Labs different" */
        .ui-features{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:0 0 20px}
        .ui-feature{padding:20px 22px;border:1px solid #2c2f2b;border-radius:16px;background:#111312}
        .ui-feature strong{display:block;font-size:13px;color:#f4f1e9;margin-bottom:6px}
        .ui-feature span{display:block;font-size:12px;color:#8f928a;line-height:1.65}

        /* CTA banner: About page footer call-to-action */
        .ui-cta{margin:52px 0 0;padding:40px;border:1px solid #2c2f2b;border-radius:22px;background:#111312;text-align:center}
        .ui-cta h2{margin:0 0 12px !important}
        .ui-cta p{color:#a9a7a0;max-width:480px;margin:0 auto 24px}
        .ui-cta-actions{display:flex;justify-content:center;gap:12px;flex-wrap:wrap}
        .ui-cta-actions a{display:inline-flex;align-items:center;justify-content:center;height:50px;padding:0 26px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;text-decoration:none}
        .ui-cta-primary{background:#007517;color:#fff}
        .ui-cta-secondary{border:1px solid #3b3f39;color:#f4f1e9}
        .ui-cta-actions a:hover,.ui-cta-actions a:focus-visible{opacity:.88}

        /* Social row: Contact page */
        .ui-social{display:grid;gap:10px;margin:0 0 20px}
        .ui-social a{display:flex;align-items:center;gap:14px;padding:16px 18px;border:1px solid #2c2f2b;border-radius:14px;background:#111312;color:#f4f1e9;text-decoration:none;font-size:13px;font-weight:700;transition:border-color .2s}
        .ui-social a:hover,.ui-social a:focus-visible{border-color:#007517}
        .ui-social svg{flex:none;width:20px;height:20px}

        @media(max-width:760px){.ui-cards,.ui-features{grid-template-columns:1fr}}
        @media(max-width:620px){.ui-nav{padding:0 18px}.ui-logo img{width:110px}.ui-cta{padding:28px 22px}}
      `}</style>
    </main>
  );
}
