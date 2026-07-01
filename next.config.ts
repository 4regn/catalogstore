import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow next/image to optimize images served from Supabase Storage. The wildcard hostname
  // covers our single project today and any future projects we route through next/image —
  // adjust to a narrower hostname if we want to lock it down.
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
