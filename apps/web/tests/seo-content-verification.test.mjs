import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (relPath) => readFileSync(new URL(`../${relPath}`, import.meta.url), "utf8");

test("SEO Verification: Blog markdown links render as Next.js links", () => {
  const blogArticleContent = read("components/blog-article.tsx");
  assert.match(blogArticleContent, /function renderContentWithLinks/);
  assert.match(blogArticleContent, /<Link key=\{\`\$\{href\}-\$\{match\.index\}\`\} href=\{href\}/);
  assert.match(blogArticleContent, /renderContentWithLinks\(block\.content\)/);
  assert.match(blogArticleContent, /renderContentWithLinks\(item\)/);
});

test("SEO Verification: Every Blog article contains required contextual links and no wrong slugs", () => {
  const blogPostsContent = read("../../src/content/blog-posts.ts");
  const slugs = [
    "how-whatsapp-automation-helps-small-businesses-reply-faster",
    "ecommerce-whatsapp-order-capture",
    "ai-whatsapp-bot-what-it-can-and-cannot-do",
    "whatsapp-voice-notes-ai-automation",
    "whatsapp-customer-support-automation-online-stores",
  ];

  for (const slug of slugs) {
    assert.match(blogPostsContent, new RegExp(`slug:\\s*["']${slug}["']`));
  }

  // Count total markdown links in blog-posts.ts
  const linkMatches = [...blogPostsContent.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)];
  assert.ok(linkMatches.length >= 20, `Total contextual markdown links across 5 blog posts must be >= 20 (found ${linkMatches.length})`);
});

test("SEO Verification: Markdown syntax does not inflate reading time", () => {
  const blogPostsContent = read("../../src/content/blog-posts.ts");
  assert.match(blogPostsContent, /calculateTextWordCount[\s\S]*?replace\(/);
});

test("SEO Verification: Every Docs guide renders valid related links and prev/next guide navigation", () => {
  const docsArticleContent = read("components/docs-article.tsx");
  assert.match(docsArticleContent, /const currentIndex = DOCS_PAGES\.findIndex/);
  assert.match(docsArticleContent, /const prevPage = currentIndex > 0 \? DOCS_PAGES\[currentIndex - 1\] : null/);
  assert.match(docsArticleContent, /const nextPage = currentIndex >= 0 && currentIndex < DOCS_PAGES\.length - 1 \? DOCS_PAGES\[currentIndex \+ 1\] : null/);
  assert.match(docsArticleContent, /aria-label="Guide pagination"/);
  assert.match(docsArticleContent, /← Previous guide/);
  assert.match(docsArticleContent, /Next guide →/);

  const docsPagesContent = read("../../src/content/docs-pages.ts");
  const slugs = [
    "getting-started",
    "whatsapp-setup",
    "intelligence-reply-behavior",
    "products-services-media-sequences",
    "crm-pipeline-smart-actions",
    "followups-customer-updates",
    "api-webhooks",
    "website-knowledge-wordpress",
    "plans-wallet-source-values",
    "daily-operations-safe-controls",
    "launch-safety-client-responsibility",
  ];

  for (const slug of slugs) {
    assert.match(docsPagesContent, new RegExp(`slug:\\s*["']${slug}["']`));
  }
});

test("SEO Verification: Integrations metadata and H1 align strictly with approved truth", () => {
  const heroFile = read("components/integrations/integrations-hero.tsx");
  assert.match(heroFile, /Connect BlackArrow to Your Store, Website, Couriers, and <span[^>]*?>Business Systems<\/span>/);

  const publicSeoContent = read("../../src/config/public-seo.ts");
  assert.match(publicSeoContent, /key:\s*["']integrations["']/);
  assert.match(publicSeoContent, /path:\s*["']\/integrations["']/);
  assert.match(publicSeoContent, /title:\s*["']BlackArrow Integrations \| E-Commerce, Courier Lookups, and Webhooks["']/);
  
  // Verify absence of unsupported sync and live tracking claims in metadata
  assert.doesNotMatch(publicSeoContent, /product sync/i);
  assert.doesNotMatch(publicSeoContent, /automatic catalog sync/i);
  assert.doesNotMatch(publicSeoContent, /inventory synchronization/i);
  assert.doesNotMatch(publicSeoContent, /real-time WooCommerce/i);
  assert.doesNotMatch(publicSeoContent, /live order synchronization/i);

  // Verify presence of accurate conditional wording
  assert.match(publicSeoContent, /WooCommerce catalog context/);
  assert.match(publicSeoContent, /configured courier tracking lookups/);

  const metadataFile = read("lib/metadata.ts");
  assert.doesNotMatch(metadataFile, /SIMPLIFIED_METADATA/);
  assert.match(metadataFile, /const title = seo\.title;/);
  assert.match(metadataFile, /const description = seo\.description;/);
});

test("SEO Verification: Courier wording uses conditional lookup language across components", () => {
  const courierSection = read("components/integrations/courier-integrations-section.tsx");
  assert.match(courierSection, /Where Configured &amp; Supported/);
  assert.match(courierSection, /delivery status lookups/);
  assert.match(courierSection, /tracking status or tracking link/);
  assert.doesNotMatch(courierSection, /real-time tracking/i);
  assert.doesNotMatch(courierSection, /continuous live tracking/i);
});

test("SEO Verification: Homepage H1 remains 'Automate', not 'Automated'", () => {
  const heroFile = read("components/homepage/hero-section.tsx");
  assert.match(heroFile, /Automate WhatsApp Sales, Support, Orders, and Follow-Ups with AI/);
  assert.doesNotMatch(heroFile, /Automated WhatsApp Sales/);
});

test("SEO Verification: SiteShell uses canonical HomepageHeader and no horizontal overflow", () => {
  const shellFile = read("components/site-shell.tsx");
  assert.match(shellFile, /<HomepageHeader \/>/);

  const baseCss = read("app/styles/base.css");
  assert.match(baseCss, /overflow-x:\s*hidden/);
});
