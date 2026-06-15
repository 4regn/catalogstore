import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Analytics } from "@vercel/analytics/react";
import AffiliateRefTracker from "./components/AffiliateRefTracker";
import AffiliateReferralBanner from "./components/AffiliateReferralBanner";
import ImpersonationBanner from "./components/ImpersonationBanner";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://catalogstore.co.za"),
  title: {
    default: "CatalogStore — From Catalog to Checkout, in Minutes",
    template: "%s · CatalogStore",
  },
  description:
    "Turn your WhatsApp Business catalog into a professional online store. Accept card payments. No coding needed. Built for South African sellers.",
  keywords: [
    "online store builder South Africa",
    "WhatsApp catalog to store",
    "PayFast checkout",
    "Yoco alternative",
    "South African e-commerce",
    "CatalogStore",
  ],
  openGraph: {
    type: "website",
    siteName: "CatalogStore",
    title: "CatalogStore — From Catalog to Checkout, in Minutes",
    description:
      "Turn your WhatsApp Business catalog into a professional online store. Accept card payments. No coding needed.",
    locale: "en_ZA",
  },
  twitter: {
    card: "summary_large_image",
    title: "CatalogStore — From Catalog to Checkout, in Minutes",
    description:
      "Turn your WhatsApp Business catalog into a professional online store. No coding needed.",
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
        <ImpersonationBanner />
        <AffiliateRefTracker />
        <AffiliateReferralBanner />
        {children}
        <Analytics />
      </body>
    </html>
  );
}