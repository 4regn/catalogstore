import type { Metadata } from "next";
import "./globals.css";
import { Analytics } from "@vercel/analytics/react";
import AffiliateRefTracker from "./components/AffiliateRefTracker";
import AffiliateReferralBanner from "./components/AffiliateReferralBanner";

export const metadata: Metadata = {
  title: "CatalogStore - From Catalog to Checkout, in Minutes",
  description:
    "Turn your WhatsApp Business catalog into a professional online store. Accept card payments. No coding needed. Built for South African sellers.",
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