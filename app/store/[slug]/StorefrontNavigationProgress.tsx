"use client";

export default function StorefrontNavigationProgress({ active, color = "#111" }: { active: boolean; color?: string }) {
  if (!active) return null;
  return (
    <div className="cs-navigation-progress" aria-label="Loading next page" role="progressbar">
      <span style={{ background: color }} />
      <style>{`
        .cs-navigation-progress{position:fixed;inset:0 0 auto;height:3px;z-index:2147483647;pointer-events:none;overflow:hidden;background:rgba(127,127,127,.12)}
        .cs-navigation-progress span{display:block;width:100%;height:100%;transform-origin:left center;animation:cs-natural-progress 10s cubic-bezier(.1,.65,.2,1) forwards;box-shadow:0 0 8px currentColor}
        @keyframes cs-natural-progress{0%{transform:scaleX(.04)}18%{transform:scaleX(.42)}48%{transform:scaleX(.7)}76%{transform:scaleX(.86)}100%{transform:scaleX(.94)}}
        @media (prefers-reduced-motion:reduce){.cs-navigation-progress span{animation:none;transform:scaleX(.75)}}
      `}</style>
    </div>
  );
}
