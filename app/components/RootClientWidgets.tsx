"use client";

import dynamic from "next/dynamic";

/**
 * RootClientWidgets
 *
 * Mounts the three always-on-but-non-critical widgets the root layout
 * renders on every page (affiliate ref tracking, the affiliate referral
 * banner, and the support chat launcher). None of them contribute to first
 * paint -- each is itself a "use client" component that already renders
 * null until it has mounted -- so they're loaded with next/dynamic +
 * ssr:false to keep their code out of the initial server-rendered HTML and
 * out of the main hydration bundle, splitting them into their own chunk(s)
 * fetched after the page's real content has taken priority.
 *
 * next/dynamic's ssr:false option isn't allowed directly inside a Server
 * Component (app/layout.tsx has no "use client" -- it exports metadata/
 * viewport, which requires staying a Server Component), so this thin
 * client wrapper exists purely to host the dynamic() calls. DOM order is
 * kept identical to the previous direct-import order in app/layout.tsx:
 * AffiliateRefTracker, then AffiliateReferralBanner, then SupportChat --
 * AffiliateReferralBanner in particular relies on rendering ahead of
 * {children} since it's an inline (non-fixed) banner that pushes page
 * content down, not an overlay.
 */
const AffiliateRefTracker = dynamic(() => import("./AffiliateRefTracker"), {
  ssr: false,
});
const AffiliateReferralBanner = dynamic(
  () => import("./AffiliateReferralBanner"),
  { ssr: false }
);
const SupportChat = dynamic(() => import("./SupportChat"), { ssr: false });

export default function RootClientWidgets() {
  return (
    <>
      <AffiliateRefTracker />
      <AffiliateReferralBanner />
      <SupportChat />
    </>
  );
}
