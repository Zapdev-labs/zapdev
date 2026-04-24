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
  deploymentId:
    process.env.VERCEL_DEPLOYMENT_ID ||
    process.env.RAILWAY_DEPLOYMENT_ID ||
    "development",

  // CRITICAL: Standalone output for Railway Docker deployment
  output: "standalone",
  distDir: ".next",

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
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60 * 60 * 24 * 365,
  },

  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  productionBrowserSourceMaps: false,

  // Redirects
  redirects: async () => [
    {
      source: "/dashboard",
      destination: "/",
      permanent: true,
    },
    {
      source: "/dashboard/:path*",
      destination: "/",
      permanent: true,
    },
  ],

  // Headers
  headers: async () => [
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
    {
      source: "/api/:path*",
      headers: [
        ...securityHeaders,
        { key: "X-Frame-Options", value: "DENY" },
        {
          key: "Content-Security-Policy",
          value: "default-src 'none'; frame-ancestors 'none'",
        },
      ],
    },
    {
      source: "/api/inngest",
      headers: [
        {
          key: "Cache-Control",
          value: "no-store, no-cache, must-revalidate, proxy-revalidate",
        },
        { key: "Pragma", value: "no-cache" },
        { key: "Expires", value: "0" },
      ],
    },
    {
      source: "/api/auth/:path*",
      headers: [
        { key: "Access-Control-Allow-Credentials", value: "true" },
        {
          key: "Access-Control-Allow-Methods",
          value: "GET,POST,PUT,DELETE,OPTIONS",
        },
        {
          key: "Access-Control-Allow-Headers",
          value: "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization",
        },
      ],
    },
    {
      source: "/sitemap.xml",
      headers: [
        { key: "Content-Type", value: "application/xml" },
        {
          key: "Cache-Control",
          value: "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      ],
    },
    {
      source: "/api/rss",
      headers: [
        { key: "Content-Type", value: "application/xml; charset=utf-8" },
        {
          key: "Cache-Control",
          value: "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      ],
    },
  ],

  // Experimental optimizations
  experimental: {
    optimizeCss: true,
    scrollRestoration: true,
  },

  // Turbopack config
  turbopack: {},
};

export default nextConfig;
