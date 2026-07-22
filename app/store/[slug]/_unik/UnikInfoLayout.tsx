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
  lastUpdated,
  children,
}: {
  kicker: string;
  title: string;
  lastUpdated?: string;
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
      <article className="ui-content">
        <p className="ui-kicker">{kicker}</p>
        <h1>{title}</h1>
        {lastUpdated && <p className="ui-updated">Last updated: {lastUpdated}</p>}
        <div className="ui-body">{children}</div>
      </article>
      <UnikFooter />
      <style jsx global>{`
        *{box-sizing:border-box}
        html,body{margin:0;background:#080909;color:#f4f1e9;font-family:'Manrope',Arial,sans-serif}
        .ui-page{min-height:100dvh;display:flex;flex-direction:column;background:radial-gradient(circle at 15% 0%,#1a1d1b 0,transparent 34%),#080909}
        .ui-nav{height:78px;border-bottom:1px solid #292c29;display:flex;align-items:center;justify-content:space-between;padding:0 max(22px,calc((100vw - 1160px)/2))}
        .ui-logo{display:flex;align-items:center;text-decoration:none;line-height:0}
        .ui-logo img{display:block;width:124px;height:auto;object-fit:contain}
        .ui-return{color:#d8d5cd;font-size:10px;letter-spacing:.14em;text-transform:uppercase;text-decoration:none}
        .ui-return:hover,.ui-return:focus-visible{color:#fff}
        .ui-content{flex:1;width:min(820px,calc(100% - 36px));margin:0 auto;padding:64px 0 100px}
        .ui-kicker{font-size:10px;letter-spacing:.24em;text-transform:uppercase;color:#969a93;margin:0 0 16px}
        .ui-content h1{font-family:Georgia,serif;font-weight:400;text-transform:uppercase;line-height:.94;margin:0 0 10px;font-size:clamp(36px,6vw,58px)}
        .ui-updated{color:#8b8e86;font-size:11px;letter-spacing:.08em;text-transform:uppercase;margin:0 0 40px}
        .ui-body{color:#c9c7bd;font-size:15px;line-height:1.8}
        .ui-body p{margin:0 0 20px}
        .ui-body h2{font-family:Georgia,serif;font-weight:400;text-transform:uppercase;font-size:clamp(20px,3vw,26px);margin:36px 0 14px;color:#f4f1e9}
        .ui-body ul{margin:0 0 20px;padding-left:20px}
        .ui-body li{margin-bottom:8px}
        .ui-body a{color:#f4f1e9}
        .ui-notice{margin-top:8px;padding:18px 20px;border:1px solid #2c2f2b;border-radius:14px;background:#111312;color:#a6a8a2;font-size:13px;line-height:1.7}
        @media(max-width:620px){.ui-nav{padding:0 18px}.ui-logo img{width:110px}}
      `}</style>
    </main>
  );
}
