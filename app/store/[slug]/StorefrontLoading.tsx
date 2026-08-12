const skeleton = {
  borderRadius: 16,
  background:
    "linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 37%, #e5e7eb 63%)",
  backgroundSize: "400% 100%",
  animation: "cs-storefront-shimmer 1.25s ease-in-out infinite",
} as const;

export default function StorefrontLoading() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      style={{
        position: "fixed",
        inset: 0,
        background: "#fff",
        color: "#0f172a",
        zIndex: 199,
        overflow: "hidden",
      }}
    >
      <div
        role="status"
        aria-label="Loading"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          overflow: "hidden",
          zIndex: 200,
          pointerEvents: "none",
          background: "rgba(37, 99, 235, 0.08)",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            height: "100%",
            width: "35%",
            background: "#2563eb",
            borderRadius: "0 2px 2px 0",
            animation: "cs-storefront-progress 1.05s ease-in-out infinite",
          }}
        />
      </div>

      <div
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          padding: "84px 20px 28px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            marginBottom: 22,
          }}
        >
          <div style={{ width: 152, height: 30, ...skeleton }} />
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ width: 42, height: 42, ...skeleton, borderRadius: 999 }} />
            <div style={{ width: 42, height: 42, ...skeleton, borderRadius: 999 }} />
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gap: 18,
            gridTemplateColumns: "minmax(0, 1.2fr) minmax(280px, 0.8fr)",
            alignItems: "start",
          }}
        >
          <div
            style={{
              minHeight: 360,
              borderRadius: 28,
              padding: 24,
              border: "1px solid rgba(148, 163, 184, 0.2)",
              background: "#fafafa",
              boxShadow: "0 16px 40px rgba(15, 23, 42, 0.06)",
            }}
          >
            <div style={{ width: "48%", height: 18, marginBottom: 12, ...skeleton }} />
            <div style={{ width: "68%", height: 52, marginBottom: 18, ...skeleton }} />
            <div style={{ width: "100%", height: 210, marginBottom: 18, ...skeleton, borderRadius: 24 }} />
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <div style={{ width: 150, height: 46, ...skeleton, borderRadius: 999 }} />
              <div style={{ width: 150, height: 46, ...skeleton, borderRadius: 999 }} />
            </div>
          </div>

          <div style={{ display: "grid", gap: 14 }}>
            <div
              style={{
                borderRadius: 24,
                padding: 20,
                border: "1px solid rgba(148, 163, 184, 0.2)",
                background: "#fafafa",
              }}
            >
              <div style={{ width: "42%", height: 16, marginBottom: 14, ...skeleton }} />
              <div style={{ width: "88%", height: 16, marginBottom: 10, ...skeleton }} />
              <div style={{ width: "72%", height: 16, ...skeleton }} />
            </div>

            <div
              style={{
                borderRadius: 24,
                padding: 20,
                border: "1px solid rgba(148, 163, 184, 0.2)",
                background: "#fafafa",
              }}
            >
              <div style={{ width: "34%", height: 16, marginBottom: 14, ...skeleton }} />
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ width: "100%", height: 52, ...skeleton }} />
                <div style={{ width: "100%", height: 52, ...skeleton }} />
                <div style={{ width: "100%", height: 52, ...skeleton }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes cs-storefront-progress {
          0% { transform: translateX(-40%); }
          100% { transform: translateX(300%); }
        }
        @keyframes cs-storefront-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
