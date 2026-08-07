// Shown automatically by Next.js while this route segment's async Server
// Component (page.tsx) is resolving its data fetch -- covers real/hard
// navigations (typed URL, first visit, browser back/forward), plus any
// in-app transition slow enough that React commits before the new
// segment's data is ready (the in-app top bar -- .fr-progress in
// FourRegnStore.tsx, shown the moment a navigation starts pending -- can't
// cover that later window on its own).
//
// Explicit white background is required here, not optional: app/globals.css
// sets html{background-color:#030303} (true black) globally, since most of
// this platform's OTHER surfaces (dashboard, marketing site) are dark --
// every storefront template normally overrides that with its own root
// container's background, but this fallback replaces the ENTIRE route
// tree (nothing storefront-specific is mounted while it's showing), so
// without its own background here the page visibly goes black. Confirmed
// as a real regression from an earlier version of this file that omitted
// it, reported directly against the live site.
//
// Otherwise deliberately minimal -- just a thin top progress bar, no
// spinner, no dark overlay -- so reaching this fallback still feels like a
// native browser page load (the address bar's own progress indicator)
// rather than the page visibly swapping to a loading screen. Rendered
// before any seller/template data is available, so this stays
// intentionally generic: no template branding.
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
