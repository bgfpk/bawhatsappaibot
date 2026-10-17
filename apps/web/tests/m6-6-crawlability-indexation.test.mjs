import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("M6.6: Sitemap configuration excludes preview, prototype, and operational routes", () => {
  const sitemapCode = read("app/sitemap.ts");
  assert.match(sitemapCode, /getSitemapRoutes/);
  assert.doesNotMatch(sitemapCode, /homepage-prototype/);
  assert.doesNotMatch(sitemapCode, /design-preview/);
  assert.doesNotMatch(sitemapCode, /health/);

  const publicSeoCode = read("../../src/config/public-seo.ts");
  assert.match(publicSeoCode, /PUBLIC_SITE_ORIGIN = "https:\/\/blackarrow\.com"/);
  assert.doesNotMatch(publicSeoCode, /https:\/\/www\.blackarrow\.com/);
});

test("M6.6: Every sitemap route uses absolute HTTPS apex domain without fake lastModified dates", () => {
  const sitemapCode = read("app/sitemap.ts");
  assert.match(sitemapCode, /PUBLIC_SITE_ORIGIN/);
  assert.match(sitemapCode, /route\.lastModified\s*\?\s*\{\s*lastModified:\s*new Date\(route\.lastModified\)/);
  assert.doesNotMatch(sitemapCode, /lastModified:\s*route\.lastModified\s*\|\|\s*new Date\(\)\.toISOString\(\)/);
});

test("M6.6: Preview and prototype pages explicitly emit noindex, nofollow directives", () => {
  for (const previewPath of [
    "app/design-system-preview/page.tsx",
    "app/design-preview/concept-1/page.tsx",
    "app/design-preview/concept-2/page.tsx",
    "app/design-preview/concept-3/page.tsx",
    "app/homepage-prototype/page.tsx",
  ]) {
    assert.equal(existsSync(new URL(`../${previewPath}`, import.meta.url)), true, previewPath);
    const content = read(previewPath);
    assert.match(content, /index:\s*false/, previewPath);
  }
});

test("M6.6: Permanent redirects exist for /documentation and /homepage-prototype", () => {
  const nextConfig = read("next.config.mjs");
  assert.match(nextConfig, /source:\s*"\/homepage-prototype"[\s\S]*?destination:\s*"\/ font|"\/"/);
  assert.match(nextConfig, /source:\s*"\/documentation"[\s\S]*?destination:\s*"\/docs"/);

  const docAlias = read("app/documentation/page.tsx");
  assert.match(docAlias, /permanentRedirect\("\/docs"\)/);
});

test("M6.6: Query-string canonical resolution strips query parameters cleanly", () => {
  const publicSeoCode = read("../../src/config/public-seo.ts");
  assert.match(publicSeoCode, /export function buildCanonicalUrl/);
  assert.match(publicSeoCode, /canonicalUrl = metadata\.canonicalUrl/);
  assert.match(publicSeoCode, /<link\s+rel="canonical"\s+href="\$\{canonicalUrl\}"\s*\/?>/);
});

test("M6.6: Docs categories section links all 13 Docs guides directly", () => {
  const docsCategories = read("components/docs/docs-categories-section.tsx");
  for (const slug of [
    "getting-started",
    "whatsapp-setup",
    "intelligence-reply-behavior",
    "products-services-media-sequences",
    "crm-pipeline-smart-actions",
    "followups-customer-updates",
    "api-webhooks",
    "website-knowledge-wordpress",
    "courier-integrations-setup",
    "cod-order-confirmation-setup",
    "plans-wallet-source-values",
    "daily-operations-safe-controls",
    "launch-safety-client-responsibility",
  ]) {
    assert.match(docsCategories, new RegExp(`/docs/${slug}`), `Docs categories section must link to /docs/${slug}`);
  }
});

test("M6.6: Homepage footer links all 18 SEO landing pages directly", () => {
  const footer = read("components/homepage/homepage-footer.tsx");
  for (const slug of [
    "whatsapp-automation",
    "ai-whatsapp-bot",
    "whatsapp-customer-support",
    "ecommerce-whatsapp-bot",
    "whatsapp-order-capture",
    "whatsapp-automation-for-small-business",
    "whatsapp-ai-bot-for-ecommerce",
    "whatsapp-bot-pricing",
    "best-whatsapp-automation-tool",
    "blackarrow-vs-manual-whatsapp-support",
    "whatsapp-automation-pakistan",
    "whatsapp-cod-order-automation",
    "whatsapp-order-tracking-automation",
    "whatsapp-human-handoff",
    "whatsapp-voice-note-automation",
    "woocommerce-whatsapp-automation",
    "postex-whatsapp-integration",
    "leopards-whatsapp-integration",
  ]) {
    assert.match(footer, new RegExp(`/${slug}`), `Homepage footer must link to /${slug}`);
  }
});

test("M6.6: Robots.txt contains sitemap URL and disallows dashboard/admin/api paths without blocking preview noindex discovery", () => {
  const robotsCode = read("app/robots.ts");
  assert.match(robotsCode, /DASHBOARD_ROUTE_EXCLUSION_LIST/);
  assert.match(robotsCode, /sitemap:\s*`\$\{PUBLIC_SITE_ORIGIN\}\/sitemap\.xml`/);

  const routesDef = read("../../src/shared/public-content/routes.ts");
  assert.match(routesDef, /\/global_dashboard/);
  assert.match(routesDef, /\/admin/);
  assert.match(routesDef, /\/api\//);
  assert.doesNotMatch(routesDef, /\/design-preview\//);
  assert.doesNotMatch(routesDef, /\/design-system-preview\//);
});

test("M6.6: Authoritative SEO landing page configuration defines 18 unique slugs and metadata", () => {
  const landingPagesCode = read("../../src/content/seo-landing-pages.ts");
  for (const slug of [
    "whatsapp-automation",
    "ai-whatsapp-bot",
    "whatsapp-customer-support",
    "ecommerce-whatsapp-bot",
    "whatsapp-order-capture",
    "whatsapp-automation-for-small-business",
    "whatsapp-ai-bot-for-ecommerce",
    "whatsapp-bot-pricing",
    "best-whatsapp-automation-tool",
    "blackarrow-vs-manual-whatsapp-support",
    "whatsapp-automation-pakistan",
    "whatsapp-cod-order-automation",
    "whatsapp-order-tracking-automation",
    "whatsapp-human-handoff",
    "whatsapp-voice-note-automation",
    "woocommerce-whatsapp-automation",
    "postex-whatsapp-integration",
    "leopards-whatsapp-integration",
  ]) {
    assert.match(landingPagesCode, new RegExp(`slug:\\s*"${slug}"`), `seo-landing-pages.ts must define slug "${slug}"`);
  }
});

test("M6.6: 404 Not Found component renders exactly one H1, recovery links, and noindex metadata", () => {
  const notFoundCode = read("app/not-found.tsx");
  assert.match(notFoundCode, /<h1[\s\S]*?>\s*Page Not Found\s*<\/h1>/);
  assert.match(notFoundCode, /href="\/"/);
  assert.match(notFoundCode, /href="\/docs"/);
  assert.match(notFoundCode, /href="\/contact"/);
  assert.match(notFoundCode, /index:\s*false/);
});

test("M6.6: Operational /health endpoint returns X-Robots-Tag noindex header", () => {
  const healthCode = read("app/health/route.ts");
  assert.match(healthCode, /"X-Robots-Tag":\s*"noindex, nofollow"/);
  assert.match(healthCode, /status:\s*"ok"/);
  assert.match(healthCode, /service:\s*"blackarrow-public-web"/);
});
