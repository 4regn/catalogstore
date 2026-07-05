import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Analytics } from "@vercel/analytics/react";
import AffiliateRefTracker from "./components/AffiliateRefTracker";
import AffiliateReferralBanner from "./components/AffiliateReferralBanner";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://catalogstore.co.za"),
  title: {
    default: "CatalogStore — Built for South African Sellers",
    template: "%s · CatalogStore",
  },
  description:
    "Open a real online store in minutes. Accept card payments online — no more chasing WhatsApp orders. 14-day free trial, then R149/month. Zero commission. Built for South African sellers.",
  keywords: [
    "online store builder South Africa",
    "WhatsApp catalog to store",
    "PayFast checkout",
    "Yoco alternative",
    "South African e-commerce",
    "CatalogStore",
  ],
  // Icons declared as metadata (not via /app/favicon.ico file convention) so child
  // layouts can override them with per-seller favicons. File-based icons in /app
  // would always win precedence over a child layout's metadata.icons; declaring
  // them here keeps everything on the same metadata.icons override hierarchy.
  icons: {
    icon: [
      { url: "/cs-favicon.ico", sizes: "any" },
      { url: "/cs-icon.png", type: "image/png" },
    ],
    shortcut: [{ url: "/cs-favicon.ico" }],
    apple: [{ url: "/cs-apple-icon.png" }],
  },
  openGraph: {
    type: "website",
    siteName: "CatalogStore",
    title: "CatalogStore — Built for South African Sellers",
    description:
      "Open a real online store in minutes. Accept card payments online — no more chasing WhatsApp orders.",
    locale: "en_ZA",
  },
  twitter: {
    card: "summary_large_image",
    title: "CatalogStore — Built for South African Sellers",
    description:
      "Open a real online store in minutes. Accept card payments online — no more chasing WhatsApp orders.",
  },
  robots: {
    index: true,
    follow: true,
  },
  formatDetection: {
    email: false,
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#030303",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <AffiliateRefTracker />
        <AffiliateReferralBanner />
        {children}
        <Analytics />
      </body>
    </html>
  );
}