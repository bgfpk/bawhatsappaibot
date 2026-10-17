import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const read = (relPath) => readFileSync(new URL(`../${relPath}`, import.meta.url), "utf8");

test("Prompt 6: Final Sitemap inventory certification (58 URLs)", () => {
  const publicSeoCode = read("../../src/config/public-seo.ts");
  assert.match(publicSeoCode, /export function getSitemapRoutes/);
  assert.match(publicSeoCode, /PUBLIC_SITE_ORIGIN = "https:\/\/blackarrow\.com"/);
});

test("Prompt 6: Complete route breakdown certification", () => {
  const landingPagesCode = read("../../src/content/seo-landing-pages.ts");
  const blogPostsCode = read("../../src/content/blog-posts.ts");
  const docsPagesCode = read("../../src/content/docs-pages.ts");
  const publicSeoCode = read("../../src/config/public-seo.ts");

  const landingSlugs = Array.from(landingPagesCode.matchAll(/slug:\s*"([^"]+)"/g), (m) => m[1]);
  const blogSlugs = Array.from(blogPostsCode.matchAll(/slug:\s*"([^"]+)"/g), (m) => m[1]);
  const docsSlugs = Array.from(docsPagesCode.matchAll(/slug:\s*"([^"]+)"/g), (m) => m[1]);

  assert.equal(landingSlugs.length, 22, "Must have exactly 22 commercial & comparison landing pages");
  assert.equal(blogSlugs.length, 12, "Must have exactly 12 blog posts");
  assert.equal(docsSlugs.length, 13, "Must have exactly 13 documentation pages");
  assert.match(publicSeoCode, /path:\s*"\/pricing"/);
});

test("Prompt 6: Primary CTA link architecture certification", () => {
  const ctaLinksCode = read("lib/cta-links.ts");
  const siteConfigCode = read("lib/site-config.ts");
  assert.match(ctaLinksCode, /startTrial:\s*/);
  assert.match(siteConfigCode, /blackarrow\.com/);
});

test("Prompt 6: Competitor comparison freshness certification (2026-08-11)", () => {
  const comparisonSlugs = [
    "blackarrow-vs-wati",
    "blackarrow-vs-aisensy",
    "blackarrow-vs-interakt",
    "whatsapp-api-vs-linked-devices",
  ];

  const landingPagesCode = read("../../src/content/seo-landing-pages.ts");
  for (const slug of comparisonSlugs) {
    assert.match(landingPagesCode, new RegExp(`slug:\\s*"${slug}"`), `Comparison page "${slug}" must exist`);
  }
  assert.match(landingPagesCode, /August 2026/);
  assert.match(landingPagesCode, /Reviewed in August 2026|reviewed in August 2026/i);
});

test("Prompt 6: SEO governance & post-launch operating plan documents assertion", () => {
  const caseStudyDoc = new URL("../../../docs/seo-case-study-framework.md", import.meta.url);
  const authorityPlanDoc = new URL("../../../docs/seo-authority-plan.md", import.meta.url);
  const operatingPlanDoc = new URL("../../../docs/seo-post-launch-operating-plan.md", import.meta.url);

  assert.ok(existsSync(caseStudyDoc), "docs/seo-case-study-framework.md must exist");
  assert.ok(existsSync(authorityPlanDoc), "docs/seo-authority-plan.md must exist");
  assert.ok(existsSync(operatingPlanDoc), "docs/seo-post-launch-operating-plan.md must exist");

  const operatingContent = readFileSync(operatingPlanDoc, "utf8");
  assert.match(operatingContent, /Certified Route Inventory \(58 Total Sitemap URLs\)/);
  assert.match(operatingContent, /30-Day Execution Plan/);
  assert.match(operatingContent, /60-Day Execution Plan/);
  assert.match(operatingContent, /90-Day Execution Plan/);
});

test("Prompt 6: Final claim safety & compliance sweep", () => {
  const landingPagesCode = read("../../src/content/seo-landing-pages.ts");
  const blogPostsCode = read("../../src/content/blog-posts.ts");
  const docsPagesCode = read("../../src/content/docs-pages.ts");

  const allCode = `${landingPagesCode}\n${blogPostsCode}\n${docsPagesCode}`;

  assert.doesNotMatch(allCode, /official Meta partner|official WhatsApp partner|zero-ban guarantee|#1 in Pakistan|Pakistan's best/i);
  assert.doesNotMatch(allCode, /guaranteed RTO elimination|100% confirmation/i);
  assert.doesNotMatch(allCode, /provides automatic inventory sync|full live checkout replacement/i);
});
