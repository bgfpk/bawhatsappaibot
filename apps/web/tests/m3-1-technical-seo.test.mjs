import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("M3.1: Next.js permanent redirects configured for legacy routes", () => {
  const nextConfig = read("next.config.mjs");
  assert.match(nextConfig, /source:\s*["']\/homepage-prototype["']/);
  assert.match(nextConfig, /destination:\s*["']\/["']/);
  assert.match(nextConfig, /source:\s*["']\/documentation["']/);
  assert.match(nextConfig, /destination:\s*["']\/docs["']/);
  assert.match(nextConfig, /permanent:\s*true/);
});

test("M3.1: Retired Docs URLs have permanent 1-hop redirects and are excluded from sitemap", () => {
  const nextConfig = read("next.config.mjs");
  const docsRedirects = [
    { source: "/docs/media-sequences", destination: "/docs/products-services-media-sequences" },
    { source: "/docs/orders-crm", destination: "/docs/crm-pipeline-smart-actions" },
    { source: "/docs/wallet-billing", destination: "/docs/plans-wallet-source-values" },
    { source: "/docs/integrations-webhooks", destination: "/docs/api-webhooks" },
    { source: "/docs/team-handoff", destination: "/docs/daily-operations-safe-controls" },
    { source: "/docs/qr-scanner-connection", destination: "/docs/whatsapp-setup" },
    { source: "/docs/safety-best-practices", destination: "/docs/launch-safety-client-responsibility" },
    { source: "/docs/troubleshooting", destination: "/docs/launch-safety-client-responsibility" },
    { source: "/docs/products-customers-orders", destination: "/docs/products-services-media-sequences" },
    { source: "/docs/voice-notes-cost-control", destination: "/docs/plans-wallet-source-values" },
  ];

  for (const { source, destination } of docsRedirects) {
    const escapedSource = source.replace(/\//g, "\\/");
    const escapedDest = destination.replace(/\//g, "\\/");
    const pattern = new RegExp(`source:\\s*["']${escapedSource}["'][\\s\\S]*?destination:\\s*["']${escapedDest}["'][\\s\\S]*?permanent:\\s*true`);
    assert.match(nextConfig, pattern, `Redirect for ${source} -> ${destination} must be configured in next.config.mjs`);
  }

  const sharedRoutes = read("../../src/shared/public-content/routes.ts");
  assert.match(sharedRoutes, /PUBLIC_SITEMAP_PATHS/);
});

test("M3.1: custom 404 page is created with clear messaging and valid navigation", () => {
  assert.equal(existsSync(new URL("../app/not-found.tsx", import.meta.url)), true);
  const notFound = read("app/not-found.tsx");
  assert.match(notFound, /<h1[\s\S]*?>\s*Page Not Found\s*<\/h1>/);
  assert.match(notFound, /404 Error/);
  assert.match(notFound, /href="\/"/);
  assert.match(notFound, /href="\/docs"/);
  assert.doesNotMatch(notFound, /<input/i); // No fake search box
  assert.doesNotMatch(notFound, /24\/7|guarantee|sla/i); // No unsupported promises
});

test("M3.1: route segment error boundary is created with safe error logging", () => {
  assert.equal(existsSync(new URL("../app/error.tsx", import.meta.url)), true);
  const errorPage = read("app/error.tsx");
  assert.match(errorPage, /"use client";/);
  assert.match(errorPage, /export default function ErrorBoundary/);
  assert.match(errorPage, /onClick=\{\(\) => reset\(\)\}/);
  assert.match(errorPage, /href="\/"/);
  assert.match(errorPage, /console\.error/);
  assert.doesNotMatch(errorPage, /error\.message/); // Must not log error.message in production client console
  assert.doesNotMatch(errorPage, /error\.stack/); // Must not log error.stack
});

test("M3.1: robots exclusions include dashboard and api routes without blocking preview noindex discovery", () => {
  const sharedRoutes = read("../../src/shared/public-content/routes.ts");
  assert.doesNotMatch(sharedRoutes, /"\/design-preview\/"/);
  assert.doesNotMatch(sharedRoutes, /"\/design-system-preview\/"/);
  assert.match(sharedRoutes, /"\/global_dashboard"/);
  assert.match(sharedRoutes, /"\/api\/"/);

  const robotsPage = read("app/robots.ts");
  assert.match(robotsPage, /disallow:\s*DASHBOARD_ROUTE_EXCLUSION_LIST/);
});

test("M3.1: pricing structured data calculates low and high prices dynamically from plans", () => {
  const structuredData = read("components/structured-data.tsx");
  assert.match(structuredData, /export function buildPricingOffersSchema/);
  assert.match(structuredData, /Math\.min/);
  assert.match(structuredData, /Math\.max/);
  assert.match(structuredData, /AggregateOffer/);

  const pricingPage = read("app/pricing/page.tsx");
  assert.match(pricingPage, /buildPricingOffersSchema/);
  assert.match(pricingPage, /<StructuredData data=\{buildPricingOffersSchema\(PRICING_PLANS\)\}/);
});

test("M3.1: contact structured data uses ContactPoint and does not use sameAs for WhatsApp link", () => {
  const structuredData = read("components/structured-data.tsx");
  assert.match(structuredData, /export function buildContactPageSchema/);
  assert.match(structuredData, /ContactPage/);
  assert.match(structuredData, /ContactPoint/);
  assert.match(structuredData, /contactType:\s*["']sales and support["']/);
  assert.match(structuredData, /PUBLIC_SITE_CONFIG\.supportEmail/);
  assert.doesNotMatch(structuredData, /\+923136923129/);
  assert.doesNotMatch(structuredData, /https:\/\/wa\.me\/923136923129/);
  assert.doesNotMatch(structuredData, /sameAs/); // sameAs must NOT be used for direct WhatsApp chat link
  assert.doesNotMatch(structuredData, /ratingValue|reviewCount|openingHours|streetAddress/);

  const siteConfig = read("lib/site-config.ts");
  assert.match(siteConfig, /supportEmail:\s*["']support@blackarrow\.com["']/);

  const contactPage = read("app/contact/page.tsx");
  assert.match(contactPage, /buildContactPageSchema/);
  assert.match(contactPage, /<StructuredData data=\{buildContactPageSchema\(\)\} \/>/);
});

test("M3.1: no Next.js /login or /signup pages exist in apps/web/app", () => {
  assert.equal(existsSync(new URL("../app/login/page.tsx", import.meta.url)), false);
  assert.equal(existsSync(new URL("../app/signup/page.tsx", import.meta.url)), false);
  assert.equal(existsSync(new URL("../app/login.tsx", import.meta.url)), false);
  assert.equal(existsSync(new URL("../app/signup.tsx", import.meta.url)), false);
});

test("M3.1: trial CTA link is environment-configured with blackarrow-source.offline.invalid fallback", () => {
  const ctaLinks = read("lib/cta-links.ts");
  assert.match(ctaLinks, /startTrial:\s*PUBLIC_SITE_CONFIG\.signupUrl/);

  const siteConfig = read("lib/site-config.ts");
  assert.match(siteConfig, /signupUrl:\s*fallbackUrl\(process\.env\.NEXT_PUBLIC_BLACKARROW_SIGNUP_URL,\s*["']https:\/\/blackarrow\.com\/signup["']\)/);
  assert.doesNotMatch(ctaLinks, /futureDashboardHost/);
});
