import type { Metadata } from "next";
import "./globals.css";
import { Analytics } from "@vercel/analytics/react";
import AffiliateRefTracker from "./components/AffiliateRefTracker";
import AffiliateReferralBanner from "./components/AffiliateReferralBanner";

export const metadata: Metadata = {
  title: "CatalogStore — Built for South African Sellers",
  description:
    "Open a real online store in minutes. Accept card payments online — no more chasing WhatsApp orders. R149/month, zero commission. Built for South African sellers.",
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