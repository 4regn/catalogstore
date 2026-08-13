export default function CheckoutLoading() {
  const block = { background: "#ececec", borderRadius: 8 } as const;
  return (
    <div aria-busy="true" aria-label="Loading checkout" style={{ minHeight: "100vh", background: "#fff", color: "#050505", fontFamily: '"Helvetica Neue",Helvetica,Arial,sans-serif' }}>
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: 3, overflow: "hidden", zIndex: 10, background: "rgba(37,99,235,.1)" }}>
        <div style={{ width: "38%", height: "100%", background: "#2563eb", animation: "checkout-progress .85s ease-in-out infinite" }} />
      </div>
      <header style={{ height: 82, borderBottom: "1px solid #e4e4e4", display: "flex", alignItems: "center" }}>
        <div style={{ width: "100%", maxWidth: 1220, margin: "0 auto", padding: "0 30px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ ...block, width: 150, height: 30 }} /><div style={{ ...block, width: 112, height: 14 }} />
        </div>
      </header>
      <main className="checkout-loading-grid" style={{ maxWidth: 1220, margin: "0 auto", display: "grid", gridTemplateColumns: "minmax(0,1.08fr) minmax(380px,.92fr)" }}>
        <section style={{ padding: "52px 64px 60px 30px" }}>
          <div style={{ ...block, width: 86, height: 10, marginBottom: 12 }} /><div style={{ ...block, width: 250, height: 38, marginBottom: 38 }} />
          {[1, 2, 3].map((row) => <div key={row} style={{ ...block, width: "100%", height: 56, marginBottom: 10 }} />)}
          <div style={{ ...block, width: "100%", height: 120, marginTop: 30 }} />
        </section>
        <aside style={{ borderLeft: "1px solid #e3e3e3", padding: "52px 30px 60px 52px" }}>
          <div style={{ ...block, width: 120, height: 12, marginBottom: 20 }} />
          <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 26 }}><div style={{ ...block, width: 82, height: 104 }} /><div style={{ flex: 1 }}><div style={{ ...block, width: "75%", height: 16, marginBottom: 10 }} /><div style={{ ...block, width: "45%", height: 12 }} /></div></div>
          <div style={{ ...block, width: "100%", height: 1, marginBottom: 20 }} /><div style={{ ...block, width: "100%", height: 18, marginBottom: 12 }} /><div style={{ ...block, width: "100%", height: 28 }} />
        </aside>
      </main>
      <style>{`@keyframes checkout-progress{from{transform:translateX(-100%)}to{transform:translateX(300%)}}@media(max-width:900px){.checkout-loading-grid{display:flex!important;flex-direction:column}.checkout-loading-grid aside{order:-1;border-left:0!important;border-bottom:1px solid #e3e3e3;padding:28px 18px!important}.checkout-loading-grid section{padding:32px 18px!important}}`}</style>
    </div>
  );
}
