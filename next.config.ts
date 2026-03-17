import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "utfs.io",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
