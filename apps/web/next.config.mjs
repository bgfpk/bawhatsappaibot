import { fileURLToPath } from "node:url";
import path from "node:path";

const appRoot = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: ".next-web",
  experimental: {
    externalDir: true,
  },
  turbopack: {
    root: path.resolve(appRoot, "../.."),
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/homepage-prototype",
        destination: "/",
        permanent: true,
      },
      {
        source: "/documentation",
        destination: "/docs",
        permanent: true,
      },
      {
        source: "/ai-whatsapp-bot-259",
        destination: "/ai-whatsapp-bot",
        permanent: true,
      },
      {
        source: "/docs/media-sequences",
        destination: "/docs/products-services-media-sequences",
        permanent: true,
      },
      {
        source: "/docs/orders-crm",
        destination: "/docs/crm-pipeline-smart-actions",
        permanent: true,
      },
      {
        source: "/docs/wallet-billing",
        destination: "/docs/plans-wallet-source-values",
        permanent: true,
      },
      {
        source: "/docs/integrations-webhooks",
        destination: "/docs/api-webhooks",
        permanent: true,
      },
      {
        source: "/docs/team-handoff",
        destination: "/docs/daily-operations-safe-controls",
        permanent: true,
      },
      {
        source: "/docs/qr-scanner-connection",
        destination: "/docs/whatsapp-setup",
        permanent: true,
      },
      {
        source: "/docs/safety-best-practices",
        destination: "/docs/launch-safety-client-responsibility",
        permanent: true,
      },
      {
        source: "/docs/troubleshooting",
        destination: "/docs/launch-safety-client-responsibility",
        permanent: true,
      },
      {
        source: "/docs/products-customers-orders",
        destination: "/docs/products-services-media-sequences",
        permanent: true,
      },
      {
        source: "/docs/voice-notes-cost-control",
        destination: "/docs/plans-wallet-source-values",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
