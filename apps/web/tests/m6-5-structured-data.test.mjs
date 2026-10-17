import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("M6.5: Root layout emits unified graph schema with stable entity @ids", () => {
  const layout = read("app/layout.tsx");
  assert.match(layout, /buildRootGraphSchema/);
  assert.match(layout, /<StructuredData data=\{buildRootGraphSchema\(\)\} \/>/);

  const structuredDataCode = read("components/structured-data.tsx");
  assert.match(structuredDataCode, /"@id":\s*`\$\{PUBLIC_SITE_CONFIG\.siteUrl\}\/#organization`/);
  assert.match(structuredDataCode, /"@id":\s*`\$\{PUBLIC_SITE_CONFIG\.siteUrl\}\/#website`/);
  assert.match(structuredDataCode, /"@id":\s*`\$\{PUBLIC_SITE_CONFIG\.siteUrl\}\/#software`/);
  assert.match(structuredDataCode, /"@graph":\s*\[/);
});

test("M6.5: WebPage schemas reference shared graph nodes without duplicate entities", () => {
  const structuredDataCode = read("components/structured-data.tsx");
  assert.match(structuredDataCode, /export function buildWebPageSchema/);
  assert.match(structuredDataCode, /isPartOf:\s*\{\s*["']@id["']:\s*`\$\{PUBLIC_SITE_CONFIG\.siteUrl\}\/#website`/);
  assert.match(structuredDataCode, /about:\s*\{\s*["']@id["']:\s*`\$\{PUBLIC_SITE_CONFIG\.siteUrl\}\/#software`/);
  assert.match(structuredDataCode, /publisher:\s*\{\s*["']@id["']:\s*`\$\{PUBLIC_SITE_CONFIG\.siteUrl\}\/#organization`/);
});

test("M6.5: Breadcrumb schema generates sequential positions and absolute URLs", () => {
  const structuredDataCode = read("components/structured-data.tsx");
  assert.match(structuredDataCode, /export function buildBreadcrumbSchema/);
  assert.match(structuredDataCode, /"@type":\s*"BreadcrumbList"/);
  assert.match(structuredDataCode, /position:\s*index\s*\+\s*1/);
});

test("M6.5: FAQPage schema is deprecated and not emitted in compliance with Google 2026 guidelines", () => {
  const structuredDataCode = read("components/structured-data.tsx");
  assert.doesNotMatch(structuredDataCode, /"@type":\s*"FAQPage"/, "FAQPage schema must not be emitted");
  assert.doesNotMatch(structuredDataCode, /export function buildFaqSchema/, "buildFaqSchema must be removed");
});

test("M6.5: BlogPosting and TechArticle schemas use entity graph attribution", () => {
  const structuredDataCode = read("components/structured-data.tsx");
  assert.match(structuredDataCode, /export function buildBlogPostingSchema/);
  assert.match(structuredDataCode, /"@type":\s*"BlogPosting"/);

  assert.match(structuredDataCode, /export function buildTechArticleSchema/);
  assert.match(structuredDataCode, /"@type":\s*"TechArticle"/);

  const blogArticle = read("components/blog-article.tsx");
  assert.match(blogArticle, /buildBlogPostingSchema/);

  const docsArticle = read("components/docs-article.tsx");
  assert.match(docsArticle, /buildTechArticleSchema/);
});

test("M6.5: Pricing offer schema reflects published plan pricing without fake claims", () => {
  const structuredDataCode = read("components/structured-data.tsx");
  assert.match(structuredDataCode, /export function buildPricingOffersSchema/);
  assert.match(structuredDataCode, /"@type":\s*"AggregateOffer"/);
  assert.match(structuredDataCode, /priceCurrency:\s*"USD"/);
});

test("M6.5: Codebase audit confirms no forbidden claims, fake reviews or addresses in schema", () => {
  const structuredDataCode = read("components/structured-data.tsx");
  assert.doesNotMatch(structuredDataCode, /AggregateRating/i);
  assert.doesNotMatch(structuredDataCode, /reviewCount/i);
  assert.doesNotMatch(structuredDataCode, /LocalBusiness/i);
  assert.doesNotMatch(structuredDataCode, /Cloud API/i);
  assert.doesNotMatch(structuredDataCode, /official partner/i);
  assert.doesNotMatch(structuredDataCode, /zero ban/i);
  assert.doesNotMatch(structuredDataCode, /guaranteed sales/i);
});

test("M6.5: Deterministic test asserts no duplicate @id entity definition conflicts for key scalar values", () => {
  const structuredDataCode = read("components/structured-data.tsx");
  const fnMatch = structuredDataCode.match(/export function buildPricingOffersSchema[\s\S]*?\n\}/);
  assert.ok(fnMatch, "buildPricingOffersSchema must exist");
  const softwareSection = fnMatch[0].split("offers:")[0];
  assert.match(softwareSection, /"@type":\s*"SoftwareApplication"/);
  assert.match(softwareSection, /url:\s*PUBLIC_SITE_CONFIG\.siteUrl/);
  assert.doesNotMatch(softwareSection, /\/pricing/);
});

test("M6.5: Core route pages emit buildWebPageSchema", () => {
  for (const pagePath of [
    "app/page.tsx",
    "app/features/page.tsx",
    "app/pricing/page.tsx",
    "app/integrations/page.tsx",
    "app/about/page.tsx",
    "app/contact/page.tsx",
    "app/docs/page.tsx",
    "app/blog/page.tsx",
    "components/legal-document.tsx",
    "components/seo-landing-article.tsx",
  ]) {
    assert.equal(existsSync(new URL(`../${pagePath}`, import.meta.url)), true, pagePath);
    assert.match(read(pagePath), /buildWebPageSchema/, pagePath);
  }
});

test("M6.5: Pricing plan truth test confirms Starter ($9), Growth ($29), Pro ($89), no Scale plan, and clean AggregateOffer schema", () => {
  const pricingConfig = read("../../src/config/pricing.ts");
  assert.match(pricingConfig, /name:\s*"Starter"/);
  assert.match(pricingConfig, /monthlyPrice:\s*9/);
  assert.match(pricingConfig, /name:\s*"Growth"/);
  assert.match(pricingConfig, /monthlyPrice:\s*29/);
  assert.match(pricingConfig, /name:\s*"Pro"/);
  assert.match(pricingConfig, /monthlyPrice:\s*89/);
  assert.doesNotMatch(pricingConfig, /"Scale"/i);

  const structuredDataCode = read("components/structured-data.tsx");
  assert.doesNotMatch(structuredDataCode, /"Scale"/i);
  assert.doesNotMatch(structuredDataCode, /"@type":\s*"AggregateRating"/);
  assert.doesNotMatch(structuredDataCode, /"@type":\s*"Review"/);
});
