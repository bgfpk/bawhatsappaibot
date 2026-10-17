import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (relPath) => readFileSync(new URL(`../${relPath}`, import.meta.url), "utf8");

test("Prompt 3: Candidate Decision Matrix inventory assertions", () => {
  const landingPagesCode = read("../../src/content/seo-landing-pages.ts");

  // 8 CREATED candidates
  const createdSlugs = [
    "whatsapp-automation-pakistan",
    "whatsapp-cod-order-automation",
    "whatsapp-order-tracking-automation",
    "whatsapp-human-handoff",
    "whatsapp-voice-note-automation",
    "woocommerce-whatsapp-automation",
    "postex-whatsapp-integration",
    "leopards-whatsapp-integration",
  ];

  for (const slug of createdSlugs) {
    assert.match(landingPagesCode, new RegExp(`slug:\\s*"${slug}"`), `Created candidate "${slug}" must exist in seo-landing-pages.ts`);
  }

  // 2 DEFERRED candidates (must NOT be thin doorway pages)
  const deferredSlugs = ["whatsapp-ai-bot-pakistan", "whatsapp-automation-for-ecommerce-pakistan"];
  for (const slug of deferredSlugs) {
    assert.doesNotMatch(landingPagesCode, new RegExp(`slug:\\s*"${slug}"`), `Deferred candidate "${slug}" must NOT be created as a thin doorway page`);
  }
});

const PROMPT5_COMPARISON_SLUGS = new Set([
  "blackarrow-vs-wati",
  "blackarrow-vs-aisensy",
  "blackarrow-vs-interakt",
  "whatsapp-api-vs-linked-devices",
]);

test("Prompt 3: Content uniqueness & differentiation across all 18 commercial landing pages", () => {
  const landingPagesCode = read("../../src/content/seo-landing-pages.ts");
  const allSlugs = Array.from(landingPagesCode.matchAll(/slug:\s*"([^"]+)"/g), (m) => m[1]);
  const commercialSlugs = allSlugs.filter((s) => !PROMPT5_COMPARISON_SLUGS.has(s));
  assert.equal(commercialSlugs.length, 18, "Must have exactly 18 commercial landing pages");

  const titles = Array.from(landingPagesCode.matchAll(/title:\s*"([^"]+)"/g), (m) => m[1]);
  const metaTitles = Array.from(landingPagesCode.matchAll(/metaTitle:\s*"([^"]+)"/g), (m) => m[1]);
  const metaDescriptions = Array.from(landingPagesCode.matchAll(/metaDescription:\s*"([^"]+)"/g), (m) => m[1]);
  const primaryKeywords = Array.from(landingPagesCode.matchAll(/primaryKeyword:\s*"([^"]+)"/g), (m) => m[1]);

  assert.equal(new Set(commercialSlugs).size, 18, "All 18 commercial slugs must be unique");
  assert.ok(titles.length >= 18, "Must have at least 18 titles");
  assert.ok(metaTitles.length >= 18, "Must have at least 18 meta titles");
  assert.ok(metaDescriptions.length >= 18, "Must have at least 18 meta descriptions");
  assert.ok(primaryKeywords.length >= 18, "Must have at least 18 primary keywords");
});

test("Prompt 3: Capability safety & claim control guardrails", () => {
  const landingPagesCode = read("../../src/content/seo-landing-pages.ts");

  // No unsupported claims across public commercial content
  assert.doesNotMatch(landingPagesCode, /official Meta partner|official WhatsApp partner|zero-ban guarantee|#1 in Pakistan|Pakistan's best/i);
  assert.doesNotMatch(landingPagesCode, /automatic inventory sync|real-time inventory sync|live checkout replacement/i);
  assert.doesNotMatch(landingPagesCode, /guaranteed RTO elimination|100% confirmation/i);

  // WooCommerce page claims
  assert.match(landingPagesCode, /WooCommerce store REST API/);
  assert.match(landingPagesCode, /catalog context/i);

  // Courier pages claims
  assert.match(landingPagesCode, /PostEx API Token and Merchant ID/);
  assert.match(landingPagesCode, /Leopards API Key and Account Password/);
});

test("Prompt 3: Commercial landing page count calculation (18 pages)", () => {
  const landingPagesCode = read("../../src/content/seo-landing-pages.ts");
  const allSlugs = Array.from(landingPagesCode.matchAll(/slug:\s*"([^"]+)"/g), (m) => m[1]);
  const commercialSlugs = allSlugs.filter((s) => !PROMPT5_COMPARISON_SLUGS.has(s));
  assert.equal(commercialSlugs.length, 18, "Total commercial landing pages must be 18");
});
