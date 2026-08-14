import type { Metadata } from "next";

// Scoped to just /dashboard (not the root layout) so this doesn't change
// "Add to Home Screen" behavior for seller storefronts, only the seller's
// own admin dashboard. Without appleWebApp.capable + a linked manifest,
// iOS Safari's "Add to Home Screen" only creates a bookmark shortcut that
// still opens inside Safari's chrome -- it LOOKS like an app icon (it
// already picks up metadata.icons.apple from the root layout) but iOS
// never treats it as an installed web app, and the Push API
// (window.PushManager, see the enableOrderPush() flow in page.tsx) is
// only exposed to genuinely standalone-launched web apps on iOS. This is
// what actually unlocks that, not the icon itself.
export const metadata: Metadata = {
  manifest: "/dashboard-manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "CatalogStore",
  },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
