"use client";

// Shared UNIK Labs footer for pages rendered as real Next.js routes (outside
// the iframe that hosts the static /private-templates/unik-labs/*.html
// pages). Those static pages get the same footer injected by store.js's
// initFooter() -- this component is the React-side twin so the visual
// system stays identical wherever the footer appears.

export default function UnikFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="unik-footer" aria-label="Site footer">
      <div className="uf-inner">
        <div className="uf-grid">
          <div className="uf-brand">
            <a className="uf-logo" href="/private-templates/unik-labs/index.html" aria-label="UNIK home">
              <img src="/private-templates/unik-labs/assets/unik-logo-v3-header.png" alt="UNIK — For you. And only you" />
            </a>
            <p className="uf-desc">AI-powered apparel design, made uniquely yours. Create custom artwork, preview it on premium garments and bring your ideas to life.</p>
            <p className="uf-location">Built in Durban, South Africa.</p>
          </div>
          <nav className="uf-col" aria-label="Products">
            <h3>Products</h3>
            <ul>
              <li><a href="/private-templates/unik-labs/studio.html">AI Design Studio</a></li>
              <li><a href="/private-templates/unik-labs/upload.html">Custom Upload</a></li>
              <li><span className="uf-soon">Plain Garments <em>Coming Soon</em></span></li>
            </ul>
          </nav>
          <nav className="uf-col" aria-label="Support">
            <h3>Support</h3>
            <ul>
              <li><a href="/store/unik/help">Help Centre</a></li>
              <li><a href="/store/unik/faq">FAQs</a></li>
              <li><a href="/store/unik/contact">Contact Us</a></li>
            </ul>
          </nav>
          <nav className="uf-col" aria-label="Company">
            <h3>Company</h3>
            <ul>
              <li><a href="/store/unik/about">About UNIK Labs</a></li>
              <li><a href="/store/unik/about#our-story">Our Story</a></li>
            </ul>
          </nav>
          <nav className="uf-col" aria-label="Legal">
            <h3>Legal</h3>
            <ul>
              <li><a href="/store/unik/terms">Terms of Service</a></li>
              <li><a href="/store/unik/privacy">Privacy Policy</a></li>
              <li><a href="/store/unik/refund-policy">Refund &amp; Returns Policy</a></li>
              <li><a href="/store/unik/shipping-policy">Shipping Policy</a></li>
              <li><a href="/store/unik/cookie-policy">Cookie Policy</a></li>
              <li><a href="/store/unik/acceptable-use">Acceptable Use Policy</a></li>
              <li><a href="/store/unik/intellectual-property">Intellectual Property Policy</a></li>
            </ul>
          </nav>
        </div>
        <div className="uf-pay">
          <div className="uf-pay-accept">
            <span className="uf-pay-label">We accept</span>
            <span className="uf-pay-logos">
              <img src="/checkout/yoco.png" alt="Yoco" className="uf-pay-logo uf-pay-logo--flush" />
              <img src="/checkout/visa.png" alt="Visa" className="uf-pay-logo" />
              <img src="/checkout/mastercard.png" alt="Mastercard" className="uf-pay-logo" />
              <img src="/checkout/applepay.png" alt="Apple Pay" className="uf-pay-logo" />
            </span>
          </div>
          <div className="uf-pay-delivery">
            <span className="uf-flag" role="img" aria-label="South Africa">🇿🇦</span>
            <div className="uf-pay-delivery-text">
              <strong>Delivery within South Africa only</strong>
              <span>We currently deliver to all major cities and towns across South Africa.</span>
            </div>
          </div>
        </div>
        <p className="uf-secure">Secure payments processed through our payment partners.</p>
        <div className="uf-bottom">
          <span>© {year} UNIK Labs. All rights reserved.</span>
          <div className="uf-bottom-links">
            <a href="/store/unik/privacy">Privacy</a>
            <a href="/store/unik/terms">Terms</a>
            <a href="/store/unik/cookie-policy">Cookies</a>
          </div>
        </div>
      </div>
      <style jsx global>{`
        .unik-footer{background:#000;color:#d8d5cc;border-top:1px solid rgba(255,255,255,.08);font-family:'Manrope',Arial,sans-serif}
        .uf-inner{width:min(1200px,calc(100% - 48px));margin:0 auto;padding:64px 0 32px}
        .uf-grid{display:grid;grid-template-columns:1.6fr 1fr 1fr 1fr 1fr;gap:40px;padding-bottom:44px}
        .uf-brand{max-width:340px;min-width:0}
        .uf-logo{display:inline-block;line-height:0;margin-bottom:18px}
        .uf-logo img{width:150px;height:auto;display:block}
        .uf-desc{font-size:13px;line-height:1.7;color:#a9a7a0;margin:0 0 14px}
        .uf-location{font-size:12px;color:#8b8b85;margin:0}
        .uf-col{min-width:0}
        .uf-col h3{font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#fff;margin:0 0 20px}
        .uf-col ul{list-style:none;margin:0;padding:0;display:grid;gap:14px}
        .uf-col a{color:#a9a7a0;text-decoration:none;font-size:13px;transition:color .2s;display:inline-block;min-height:20px}
        .uf-col a:hover,.uf-col a:focus-visible{color:#fff}
        .uf-col a:focus-visible{outline:2px solid #007517;outline-offset:3px;border-radius:2px}
        .uf-soon{display:flex;align-items:center;gap:8px;font-size:13px;color:#5f5f5a;cursor:default}
        .uf-soon em{font-style:normal;font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#8b8b85;border:1px solid #333;border-radius:999px;padding:3px 9px}
        .uf-pay{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:24px;padding:28px 0;border-top:1px solid rgba(255,255,255,.08)}
        .uf-pay-accept{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
        .uf-pay-label{font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#8b8b85}
        .uf-pay-logos{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
        .uf-pay-logo{height:22px;width:auto;object-fit:contain;display:block;background:#fff;border-radius:6px;padding:4px 8px}
        .uf-pay-logo--flush{height:26px;background:none;padding:0;border-radius:0}
        .uf-pay-delivery{display:flex;align-items:center;gap:12px;text-align:left}
        .uf-flag{font-size:22px;line-height:1}
        .uf-pay-delivery-text strong{display:block;font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#fff;margin-bottom:3px}
        .uf-pay-delivery-text span{font-size:12px;color:#8b8b85;line-height:1.5}
        .uf-secure{margin:0;padding:18px 0 0;font-size:11px;color:#6f6f6a;border-top:1px solid rgba(255,255,255,.06)}
        .uf-bottom{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:14px;padding-top:18px;font-size:11px;color:#77776f}
        .uf-bottom-links{display:flex;gap:18px}
        .uf-bottom-links a{color:#77776f;text-decoration:none}
        .uf-bottom-links a:hover,.uf-bottom-links a:focus-visible{color:#fff}
        .uf-bottom-links a:focus-visible{outline:2px solid #007517;outline-offset:2px;border-radius:2px}
        @media(max-width:980px){.uf-grid{grid-template-columns:1fr 1fr 1fr;row-gap:36px}.uf-brand{grid-column:1/-1;max-width:none}}
        @media(max-width:620px){.uf-grid{grid-template-columns:1fr 1fr;gap:32px 20px}.uf-inner{padding:48px 0 28px}.uf-pay{flex-direction:column;align-items:flex-start}.uf-bottom{flex-direction:column;align-items:flex-start}}
      `}</style>
    </footer>
  );
}
