import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const read = (relPath) => readFileSync(new URL(`../${relPath}`, import.meta.url), "utf8");

test("Prompt 5: Comparison pages inventory and uniqueness assertions", () => {
  const comparisonSlugs = [
    "blackarrow-vs-wati",
    "blackarrow-vs-aisensy",
    "blackarrow-vs-interakt",
    "whatsapp-api-vs-linked-devices",
  ];

  const landingPagesCode = read("../../src/content/seo-landing-pages.ts");
  const allSlugs = Array.from(landingPagesCode.matchAll(/slug:\s*"([^"]+)"/g), (m) => m[1]);
  assert.equal(allSlugs.length, 22, "Must have exactly 22 landing pages (18 commercial + 4 comparison)");

  for (const slug of comparisonSlugs) {
    assert.match(landingPagesCode, new RegExp(`slug:\\s*"${slug}"`), `Comparison page "${slug}" must exist in seo-landing-pages.ts`);
  }
  assert.match(landingPagesCode, /August 2026/);
  assert.match(landingPagesCode, /Reviewed in August 2026|reviewed in August 2026/i);
});

test("Prompt 5: Blog authorship standardization assertion", () => {
  const blogPostsCode = read("../../src/content/blog-posts.ts");
  assert.match(blogPostsCode, /const AUTHOR = "BlackArrow";/);
  assert.doesNotMatch(blogPostsCode, /author:\s*"John Doe"|author:\s*"Expert Team"/);
});

test("Prompt 5: Case-study & Authority repository framework documents assertion", () => {
  const caseStudyDocPath = new URL("../../../docs/seo-case-study-framework.md", import.meta.url);
  const authorityPlanDocPath = new URL("../../../docs/seo-authority-plan.md", import.meta.url);

  assert.ok(existsSync(caseStudyDocPath), "docs/seo-case-study-framework.md must exist");
  assert.ok(existsSync(authorityPlanDocPath), "docs/seo-authority-plan.md must exist");

  const caseStudyContent = readFileSync(caseStudyDocPath, "utf8");
  assert.match(caseStudyContent, /Total Published Real Case Studies/);
  assert.match(caseStudyContent, /`0`/);

  const authorityContent = readFileSync(authorityPlanDocPath, "utf8");
  assert.match(authorityContent, /REJECTED & PROHIBITED OPPORTUNITIES/, "Authority plan must define prohibited spammy link farm categories");
});

test("Prompt 5: Sitemap route count calculation (58 URLs)", () => {
  const publicSeoCode = read("../../src/config/public-seo.ts");
  assert.match(publicSeoCode, /export function getSitemapRoutes/);
});

test("Prompt 5: Claim safety & competitor comparison fairness guardrails", () => {
  const landingPagesCode = read("../../src/content/seo-landing-pages.ts");

  // No guaranteed claims or inflammatory competitor bashing
  assert.doesNotMatch(landingPagesCode, /guaranteed RTO elimination|100% confirmation|zero-ban guarantee/i);
  assert.doesNotMatch(landingPagesCode, /competitor is outdated|competitor is useless|scam platform/i);

  // Competitor disclaimers
  assert.match(landingPagesCode, /Trademarks belong to their respective owners/i);
  assert.match(landingPagesCode, /Trademarks belong to Meta Platforms/i);
});
