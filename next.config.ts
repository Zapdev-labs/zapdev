import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  deploymentId: process.env.VERCEL_DEPLOYMENT_ID || process.env.RAILWAY_DEPLOYMENT_ID || "development",
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
  headers: async () => [
    {
      source: "/projects/:path*",
      headers: [
        { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      ],
    },
    {
      source: "/api/uploadthing/:path*",
      headers: [
        { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      ],
    },
  ],
};

export default nextConfig;
