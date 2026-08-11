export default function StorefrontLoading() {
  return (
    <div className="cs-storefront-loading" aria-busy="true" aria-label="Loading store">
      <div className="cs-storefront-progress" role="status" aria-label="Loading">
        <span />
      </div>

      <div className="cs-storefront-shell" aria-hidden="true">
        <header className="cs-storefront-loading-header">
          <div className="cs-storefront-loading-menu" />
          <div className="cs-storefront-loading-logo" />
          <div className="cs-storefront-loading-bag" />
        </header>

        <main className="cs-storefront-loading-main">
          <section className="cs-storefront-loading-hero">
            <div className="cs-storefront-loading-copy">
              <div className="cs-storefront-loading-line cs-storefront-loading-line--short" />
              <div className="cs-storefront-loading-title" />
              <div className="cs-storefront-loading-title cs-storefront-loading-title--small" />
              <div className="cs-storefront-loading-line" />
              <div className="cs-storefront-loading-pill" />
            </div>
          </section>

          <section className="cs-storefront-loading-grid">
            <div />
            <div />
            <div />
            <div />
          </section>
        </main>
      </div>

      <style>{`
        .cs-storefront-loading{position:fixed;inset:0;z-index:199;background:#050505;color:#fff;overflow:hidden}
        .cs-storefront-progress{position:fixed;top:0;left:0;right:0;height:4px;z-index:201;overflow:hidden;background:rgba(74,222,128,0.14);pointer-events:none}
        .cs-storefront-progress span{position:absolute;top:0;left:0;height:100%;width:42%;border-radius:0 999px 999px 0;background:#007517;box-shadow:0 0 18px rgba(0,117,23,0.55);animation:cs-storefront-progress 0.82s ease-in-out infinite;will-change:transform}
        .cs-storefront-shell{min-height:100%;padding:18px clamp(16px,4vw,34px) 28px}
        .cs-storefront-loading-header{display:grid;grid-template-columns:44px 1fr 44px;align-items:center;gap:18px;max-width:1180px;margin:0 auto 24px}
        .cs-storefront-loading-menu,.cs-storefront-loading-bag{width:42px;height:42px;border-radius:999px;background:linear-gradient(90deg,#141414,#242424,#141414);background-size:220% 100%;animation:cs-storefront-shimmer 1.15s ease-in-out infinite}
        .cs-storefront-loading-logo{justify-self:center;width:min(210px,42vw);height:38px;border-radius:999px;background:linear-gradient(90deg,#101010,#2a2a2a,#101010);background-size:220% 100%;animation:cs-storefront-shimmer 1.15s ease-in-out infinite}
        .cs-storefront-loading-main{max-width:1180px;margin:0 auto}
        .cs-storefront-loading-hero{min-height:min(560px,58vh);border-radius:28px;background:radial-gradient(circle at 18% 18%,rgba(255,255,255,0.05),transparent 28%),linear-gradient(135deg,#0b0b0b,#141414);display:flex;align-items:flex-end;padding:clamp(22px,5vw,54px);overflow:hidden}
        .cs-storefront-loading-copy{width:min(520px,86vw)}
        .cs-storefront-loading-line,.cs-storefront-loading-title,.cs-storefront-loading-pill,.cs-storefront-loading-grid div{background:linear-gradient(90deg,#131313,#242424,#131313);background-size:220% 100%;animation:cs-storefront-shimmer 1.15s ease-in-out infinite}
        .cs-storefront-loading-line{width:68%;height:14px;border-radius:999px;margin:0 0 18px}
        .cs-storefront-loading-line--short{width:32%}
        .cs-storefront-loading-title{width:100%;height:54px;border-radius:14px;margin:0 0 12px}
        .cs-storefront-loading-title--small{width:78%}
        .cs-storefront-loading-pill{width:190px;height:52px;border-radius:999px;margin-top:26px}
        .cs-storefront-loading-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px;margin-top:22px}
        .cs-storefront-loading-grid div{min-height:220px;border-radius:22px}
        @keyframes cs-storefront-progress{from{transform:translateX(-45%)}to{transform:translateX(255%)}}
        @keyframes cs-storefront-shimmer{0%{background-position:120% 0}100%{background-position:-120% 0}}
        @media (max-width:760px){
          .cs-storefront-shell{padding:14px 14px 22px}
          .cs-storefront-loading-header{grid-template-columns:38px 1fr 38px;margin-bottom:16px}
          .cs-storefront-loading-menu,.cs-storefront-loading-bag{width:38px;height:38px}
          .cs-storefront-loading-logo{height:34px}
          .cs-storefront-loading-hero{min-height:62vh;border-radius:22px;padding:24px}
          .cs-storefront-loading-title{height:46px}
          .cs-storefront-loading-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
          .cs-storefront-loading-grid div{min-height:150px}
        }
        @media (prefers-reduced-motion:reduce){
          .cs-storefront-progress span,.cs-storefront-loading-menu,.cs-storefront-loading-bag,.cs-storefront-loading-logo,.cs-storefront-loading-line,.cs-storefront-loading-title,.cs-storefront-loading-pill,.cs-storefront-loading-grid div{animation:none}
        }
      `}</style>
    </div>
  );
}
