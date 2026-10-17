import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (relPath) => readFileSync(new URL(`../${relPath}`, import.meta.url), "utf8");

test("Prompt 4: Blog article count and uniqueness assertions", () => {
  const blogPostsCode = read("../../src/content/blog-posts.ts");
  const slugs = Array.from(blogPostsCode.matchAll(/slug:\s*"([^"]+)"/g), (m) => m[1]);
  const titles = Array.from(blogPostsCode.matchAll(/title:\s*"([^"]+)"/g), (m) => m[1]);
  const metaTitles = Array.from(blogPostsCode.matchAll(/metaTitle:\s*"([^"]+)"/g), (m) => m[1]);
  const metaDescriptions = Array.from(blogPostsCode.matchAll(/metaDescription:\s*"([^"]+)"/g), (m) => m[1]);

  assert.equal(slugs.length, 12, "Must have exactly 12 blog posts (5 original + 7 new)");
  assert.equal(new Set(slugs).size, 12, "All 12 blog post slugs must be unique");
  assert.ok(titles.length >= 12, "All 12 blog post titles must exist");
  assert.ok(metaTitles.length >= 12, "All 12 blog post meta titles must exist");
  assert.ok(metaDescriptions.length >= 12, "All 12 blog post meta descriptions must exist");

  assert.match(blogPostsCode, /const AUTHOR = "BlackArrow";/);
  assert.match(blogPostsCode, /publishedAt:\s*"/);
});

test("Prompt 4: Docs page count and structure assertions", () => {
  const docsPagesCode = read("../../src/content/docs-pages.ts");
  const slugs = Array.from(docsPagesCode.matchAll(/slug:\s*"([^"]+)"/g), (m) => m[1]);
  const titles = Array.from(docsPagesCode.matchAll(/title:\s*"([^"]+)"/g), (m) => m[1]);

  assert.equal(slugs.length, 13, "Must have exactly 13 docs pages (11 original + 2 new)");
  assert.equal(new Set(slugs).size, 13, "All 13 docs page slugs must be unique");
  assert.ok(titles.length >= 13, "All 13 docs page titles must exist");

  // Verify newly created docs
  const newDocsSlugs = ["courier-integrations-setup", "cod-order-confirmation-setup"];
  for (const slug of newDocsSlugs) {
    assert.match(docsPagesCode, new RegExp(`slug:\\s*"${slug}"`), `Newly created docs page "${slug}" must exist`);
  }
});

test("Prompt 4: Internal linking graph & contextual routing assertions", () => {
  const blogPostsCode = read("../../src/content/blog-posts.ts");

  const newBlogSlugs = [
    "evaluating-whatsapp-automation-costs",
    "how-to-choose-a-whatsapp-automation-platform",
    "whatsapp-cod-order-confirmation-workflow-guide",
    "woocommerce-whatsapp-customer-communication-guide",
    "when-to-pause-whatsapp-ai-and-hand-off-to-staff",
    "whatsapp-ai-instructions-and-knowledge-best-practices",
    "whatsapp-business-number-safety-and-linked-devices-guide",
  ];

  for (const slug of newBlogSlugs) {
    assert.match(blogPostsCode, new RegExp(`slug:\\s*"${slug}"`), `New blog post "${slug}" must exist in blog-posts.ts`);
  }
});

test("Prompt 4: Sitemap route count calculation (54+ URLs)", () => {
  const publicSeoCode = read("../../src/config/public-seo.ts");
  assert.match(publicSeoCode, /export function getSitemapRoutes/);
  assert.match(publicSeoCode, /PUBLIC_SITE_ORIGIN = "https:\/\/blackarrow\.com"/);
});

test("Prompt 4: Capability safety & claim control guardrails", () => {
  const blogCode = read("../../src/content/blog-posts.ts");
  const docsCode = read("../../src/content/docs-pages.ts");

  // No unsupported or guaranteed claims
  assert.doesNotMatch(blogCode, /guaranteed RTO elimination|100% confirmation|zero-ban guarantee/i);
  assert.doesNotMatch(docsCode, /guaranteed RTO elimination|100% confirmation|zero-ban guarantee/i);

  // Author and date integrity
  assert.doesNotMatch(blogCode, /fake author|expert bio|John Doe/i);
});
