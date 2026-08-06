// Shown automatically by Next.js while this route segment's async Server
// Component (page.tsx) is resolving its data fetch -- covers real/hard
// navigations (typed URL, first visit, browser back/forward) that the
// in-app top progress bar can't see. Rendered before any seller/template
// data is available, so this stays intentionally generic: no template
// branding, just a centered spinner on a neutral background. Mirrors the
// ring + spin-animation visual language of app/components/Spinner.tsx
// (used across the dashboard), adapted to a light background since that
// component's track color is hardcoded for dark surfaces.
export default function Loading() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#fafafa",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        role="status"
        aria-label="Loading"
        style={{
          width: 32,
          height: 32,
          border: "3px solid rgba(0,0,0,0.08)",
          borderTopColor: "#ff6b35",
          borderRadius: "50%",
          animation: "cs-storefront-spin 0.9s linear infinite",
        }}
      />
      <style>{`@keyframes cs-storefront-spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
