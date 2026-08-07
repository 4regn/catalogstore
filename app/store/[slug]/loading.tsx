// Shown automatically by Next.js while this route segment's async Server
// Component (page.tsx) is resolving its data fetch -- covers real/hard
// navigations (typed URL, first visit, browser back/forward), plus any
// in-app transition slow enough that React commits before the new
// segment's data is ready (the in-app top bar -- .fr-progress in
// FourRegnStore.tsx, shown the moment a navigation starts pending -- can't
// cover that later window on its own).
//
// Deliberately just a thin top progress bar on a plain (unstyled/white)
// background -- no spinner, no full-screen gray takeover -- so reaching
// this fallback still feels like a native browser page load (the
// address bar's own progress indicator) instead of the page visibly
// blanking out. A Suspense fallback can't literally keep the previous
// page's pixels on screen (there's nothing here to diff against, it's a
// full route replace), so this is the closest practical approximation:
// don't paint anything that reads as "the old page is gone," just the bar.
// Rendered before any seller/template data is available, so this stays
// intentionally generic: no template branding.
export default function Loading() {
  return (
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
  );
}
