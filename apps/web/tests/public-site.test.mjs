import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const home = read("components/home/home-page.tsx");
const homeData = read("components/home/home-data.ts");
const features = read("app/features/page.tsx") + read("components/features/features-hero.tsx");
const integrationsPage = read("app/integrations/page.tsx") + read("components/integrations/integrations-hero.tsx");
const pricingPage = read("app/pricing/page.tsx") + read("components/pricing/pricing-hero.tsx");

test("public site uses the shared matte theme with an accessible persistent toggle", () => {
  const theme = read("app/styles/blackarrow-theme.css");
  const matte = read("app/styles/matte-components.css");
  const base = read("app/styles/base.css");
  const shell = read("app/styles/shell.css");
  const toggle = read("components/theme-toggle.tsx");
  const layout = read("app/layout.tsx");

  for (const token of [
    "--ca-canvas", "--ca-surface-1", "--ca-surface-2", "--ca-border",
    "--ca-text-primary", "--ca-text-secondary", "--ca-brand", "--ca-shadow-soft",
  ]) assert.match(theme, new RegExp(token));
  assert.match(theme, /:root\[data-theme="dark"\]/);
  assert.match(theme, /:root\[data-theme="light"\]/);
  assert.match(theme, /--ca-canvas: #0a0c0d/);
  assert.match(theme, /--ca-canvas: #f0f2f1/);
  assert.doesNotMatch(base, /radial-gradient|background-size: 44px 44px/);
  assert.doesNotMatch(shell, /backdrop-filter/);
  assert.match(matte, /\.button-link-primary[\s\S]*background: #36d986/);
  assert.match(matte, /\.nav,[\s\S]*background: var\(--ca-surface-1\)/);
  assert.match(matte, /backdrop-filter: none/);
  assert.match(toggle, /aria-label=\{label\}/);
  assert.match(toggle, /localStorage\.setItem\(THEME_KEY, nextTheme\)/);
  assert.match(layout, /blackarrow-public-theme/);
  assert.match(layout, /suppressHydrationWarning/);
});

test("homepage follows the simplified buyer journey", () => {
  assert.match(home, /<h1\b[^>]*>[\s\S]*Turn WhatsApp Into Your[\s\S]*Sales &amp; Support System/);
  assert.match(home, /Deploy intelligent AI that understands context, handles complex inquiries/);
  assert.match(home, /Start Free Trial/);
  assert.match(home, /View Product Demo/);
  assert.match(home, /Trial: 7-day trial or 100 hosted AI replies/);
  assert.match(home, /Total Inbox Control/);
  assert.match(home, /AI That Knows Your Business Deeply/);
  assert.match(read("components/home/home-visual.tsx"), /Which plan is best for my business/);
  assert.match(home, /Can I turn AI replies off instantly\?/);

  const stepsBlock = homeData.match(/export const homeHowItWorks = \[([\s\S]*?)\] as const;/)?.[1] || "";
  assert.equal((stepsBlock.match(/"0[1-3]"/g) || []).length, 3);
  const outcomesBlock = homeData.match(/export const homeOutcomes = \[([\s\S]*?)\] as const;/)?.[1] || "";
  assert.equal((outcomesBlock.match(/\[\s*"0[1-4]"/g) || []).length, 4);
});

test("navigation, feature groups, pricing, and integration labels remain honest", () => {
  const navigation = read("components/site-navigation.tsx");
  for (const label of ["Product", "How It Works", "Integrations", "Pricing", "Resources"]) {
    assert.match(navigation, new RegExp(`label: "${label}"`));
  }
  assert.match(read("components/site-auth-actions.tsx"), /Login/);
  assert.match(read("components/site-auth-actions.tsx"), /Start Free/);

  const integrations = read("lib/integrations.ts");
  for (const name of ["WooCommerce", "WordPress & Website Knowledge", "PostEx Courier", "Leopards Courier", "Public REST API", "Event Webhooks"]) {
    assert.match(integrations, new RegExp(`name: "${name}"`));
  }
});

test("visual polish keeps approved hero copy and conversion hierarchy", () => {
  const heroSrc = read("components/features/features-hero.tsx");
  assert.match(heroSrc, /One WhatsApp Workspace for AI Sales, Support, Orders, and Follow-Ups/);
  assert.match(integrationsPage, /Connect BlackArrow to Your Store, Website, Couriers, and <span[^>]*?>Business Systems<\/span>/);
  assert.match(integrationsPage, /BlackArrow connects with supported commerce platforms, website knowledge bases, courier tracking systems, public APIs, and webhooks where configured\./);
  assert.match(pricingPage, /Simple Plans for Your[\s\S]*WhatsApp AI Workspace/);
  assert.match(home, /Turn WhatsApp Into Your[\s\S]*Sales &amp; Support System/);
  assert.match(home, /<AuthAwareCta showArrow className="bg-primary[^>]*">Start Free Trial<\/AuthAwareCta>/);
  assert.match(read("components/auth-aware-cta.tsx"), /isLoggedIn \? "Dashboard" : children/);
});

test("visual polish preserves counts, statuses, and accessible structure", () => {
  const outcomes = homeData.match(/export const homeOutcomes = \[([\s\S]*?)\] as const;/)?.[1] || "";
  assert.equal((outcomes.match(/\[\s*"0[1-4]"/g) || []).length, 4);

  for (const source of [home, features, integrationsPage, pricingPage]) {
    assert.equal((source.match(/<h1\b/g) || []).length, 1);
  }

  assert.match(integrationsPage, /Connect BlackArrow to Your Store/);
  assert.match(integrationsPage, /Integrations &amp; Data Flow|Integrations & Data Flow/);
  const polish = read("app/styles/polish.css");
  assert.match(polish, /main, \.footer \{ overflow: clip; \}/);
  assert.match(polish, /\.faq-item/);
});

test("pricing presentation uses source values without changing calculations", () => {
  const pricingSource = readFileSync(new URL("../../../src/config/pricing.ts", import.meta.url), "utf8");
  const betaPrices = [...pricingSource.matchAll(/monthlyPrice: (9|29|89),/g)].map((match) => Number(match[1]));
  assert.deepEqual(betaPrices.slice(0, 3), [9, 29, 89]);
  assert.match(pricingSource, /WALLET_TOPUP_AMOUNTS = \[5, 10, 25, 50, 100\]/);
  assert.match(pricingSource, /FULL_SETUP_PRICE = 49/);
});

test("footer naming and trademark wording are consistent", () => {
  const footer = read("components/site-shell.tsx");
  assert.match(footer, /WhatsApp is a trademark of Meta Platforms, Inc\. BlackArrow is not affiliated with or endorsed by WhatsApp or Meta\./);
  assert.doesNotMatch(footer, /No official WhatsApp API claim/);
  assert.doesNotMatch(footer, /Black Arrow/);
});

test("metadata, structured data, sitemap, robots, docs, and legal routes remain present", () => {
  for (const path of [
    "app/page.tsx", "app/features/page.tsx", "app/pricing/page.tsx", "app/integrations/page.tsx",
    "app/about/page.tsx", "app/contact/page.tsx", "app/docs/page.tsx", "app/privacy/page.tsx",
    "app/terms/page.tsx", "app/disclaimer/page.tsx", "app/sitemap.ts", "app/robots.ts",
  ]) assert.equal(existsSync(new URL(`../${path}`, import.meta.url)), true, path);
  assert.match(read("app/layout.tsx"), /buildOrganizationSchema/);
  assert.match(read("app/layout.tsx"), /buildSoftwareSchema/);
  assert.match(read("lib/metadata.ts"), /alternates:/);
  assert.match(read("app/health/route.ts"), /service: "blackarrow-public-web"/);
  assert.doesNotMatch(read("app/health/route.ts"), /process\.env|database|secret|api.?key/i);
});

test("generated output remains excluded from the maintainable source list", () => {
  const sourceFiles = [
    "app/health/route.ts",
    "app/integrations/page.tsx",
    "components/site-navigation.tsx",
    "tests/public-site.test.mjs",
  ];
  for (const path of sourceFiles) assert.equal(existsSync(new URL(`../${path}`, import.meta.url)), true, path);
  assert.equal(sourceFiles.some((path) => path.includes("/.next") || path.endsWith(".tsbuildinfo")), false);
});

test("homepage does not contain forbidden claims", () => {
  const forbiddenClaims = [
    "Official Meta Partner",
    "SOC2",
    "Salesforce",
    "Shopify",
    "Google Sheets",
    "Instagram automation",
    "Facebook automation",
    "Unlimited AI Logic",
    "Enterprise Pro",
    "50\\+ languages",
    "custom API connection for higher volumes",
    "auto-recharge thresholds",
    "billed per transaction",
    "matte-intelligent",
    "hours to milliseconds",
    "without human intervention until discovery",
  ];
  for (const claim of forbiddenClaims) {
    assert.doesNotMatch(home, new RegExp(claim, "i"), `Homepage contains forbidden claim: ${claim}`);
  }
});

test("additional homepage structure checks", () => {
  // 1. FAQ initial state checks (state should initialize to null)
  assert.match(home, /useState<string \| null>\(null\)/, "FAQ state must initialize to null");

  // 2. Copyright does not contain 2024 and does dynamically check year
  assert.doesNotMatch(home, /© 2024/, "Copyright must not hardcode 2024");
  assert.match(home, /new Date\(\)\.getFullYear\(\)/, "Copyright must use dynamic getFullYear");

  // 3. Third pricing plan is Pro
  assert.match(home, /PRO<\/div>/i, "Third plan must be named Pro");
});

test("blog components strictly use semantic theme tokens for light and dark readability", () => {
  const blogCss = read("components/blog/blog.module.css");
  const blogArticle = read("components/blog-article.tsx");
  const blogIndex = read("components/blog/blog-index-content.tsx");

  // Semantic text and background tokens must be used
  assert.match(blogCss, /\.articleSectionTitle[\s\S]*color:\s*var\(--ca-text-primary\)/);
  assert.match(blogCss, /\.paragraph[\s\S]*color:\s*var\(--ca-text-primary\)/);
  assert.match(blogCss, /\.bulletItem[\s\S]*color:\s*var\(--ca-text-primary\)/);
  assert.match(blogCss, /\.articleMainLayout[\s\S]*background-color:\s*var\(--ca-canvas\)/);
  assert.match(blogCss, /\.tocSidebar[\s\S]*background-color:\s*var\(--ca-surface-1\)/);
  assert.match(blogCss, /\.articleCard[\s\S]*background-color:\s*var\(--ca-surface-1\)/);

  // Dark-only hardcoded values must not exist for body text / section titles
  assert.doesNotMatch(blogCss, /\.paragraph\s*\{[^}]*#d1dce5/);
  assert.doesNotMatch(blogCss, /\.articleSectionTitle\s*\{[^}]*#ffffff/);
  assert.doesNotMatch(blogCss, /\.bulletItem\s*\{[^}]*#d1dce5/);

  // Inline markdown link renderer must use semantic brand-strong token
  assert.match(blogArticle, /color:\s*"var\(--ca-brand-strong\)"/);
  // Blog index search section must use semantic class instead of hardcoded dark background
  assert.match(blogIndex, /className=\{styles\.searchSection\}/);
});

test("docs and 404 components strictly use semantic theme tokens for light and dark readability", () => {
  const docsCss = read("components/docs/docs.module.css");
  const docsPageContent = read("components/docs/docs-page-content.tsx");
  const docsArticle = read("components/docs-article.tsx");
  const notFound = read("app/not-found.tsx");

  // Docs module css must use semantic canvas and surfaces
  assert.match(docsCss, /\.section\s*\{[\s\S]*background-color:\s*var\(--ca-canvas\)/);
  assert.match(docsCss, /\.stepCard\s*\{[\s\S]*background:\s*var\(--ca-surface-1\)/);
  assert.match(docsCss, /\.categoryCard\s*\{[\s\S]*background:\s*var\(--ca-surface-1\)/);
  assert.doesNotMatch(docsCss, /\.section\s*\{[^}]*#0a0c0d/);
  assert.doesNotMatch(docsCss, /\.stepCard\s*\{[^}]*#121619/);

  // Docs page content must use searchSection class instead of inline dark color
  assert.match(docsPageContent, /className=\{styles\.searchSection\}/);
  assert.doesNotMatch(docsPageContent, /backgroundColor:\s*"#0a0c0d"/);

  // Docs article links must use semantic brand token with high contrast
  assert.match(docsArticle, /color:\s*"var\(--ca-brand-strong\)"/);
  assert.doesNotMatch(docsArticle, /color:\s*"#32cf91"/);

  // 404 Return Home CTA must use theme-aware inverted text instead of fixed #0B0F17
  assert.match(notFound, /color:\s*"var\(--ca-text-inverse\)"/);
  assert.doesNotMatch(notFound, /backgroundColor:\s*"var\(--ca-brand[^"]*"\s*,\s*color:\s*"#0B0F17"/);
});
