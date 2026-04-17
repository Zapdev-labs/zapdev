import type { NextConfig } from "next";

// Security headers for all routes
const securityHeaders = [
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "X-XSS-Protection",
    value: "1; mode=block",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

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
    // Apply security headers to all routes
    {
      source: "/:path*",
      headers: securityHeaders,
    },
    {
      source: "/projects/:path*",
      headers: [
        ...securityHeaders,
        { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      ],
    },
    {
      source: "/api/uploadthing/:path*",
      headers: [
        ...securityHeaders,
        { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      ],
    },
    // API routes should not be framed
    {
      source: "/api/:path*",
      headers: [
        ...securityHeaders,
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Content-Security-Policy", value: "default-src 'none'; frame-ancestors 'none'" },
      ],
    },
  ],
};

export default nextConfig;
