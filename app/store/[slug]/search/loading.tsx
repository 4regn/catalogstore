// Same fallback as c/[collection]/loading.tsx -- see that file's own
// comment for why the explicit white background and minimal top-bar-only
// styling matter. This route (mode="search") is the same kind of
// force-dynamic, searchParams-driven page, so it needs the identical
// fallback while its own data fetch resolves.
export default function Loading() {
  return (
    <div style={{ position: "fixed", inset: 0, background: "#fff", zIndex: 199 }}>
      <div
        role="status"
        aria-label="Loading"
        style={{ position: "fixed", top: 0, left: 0, right: 0, height: 3, overflow: "hidden", zIndex: 200, pointerEvents: "none" }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            height: "100%",
            width: "40%",
            background: "#000",
            borderRadius: "0 2px 2px 0",
            animation: "cs-storefront-progress 0.8s ease-in-out infinite",
          }}
        />
        <style>{`@keyframes cs-storefront-progress{from{transform:translateX(-40%)}to{transform:translateX(250%)}}`}</style>
      </div>
    </div>
  );
}
