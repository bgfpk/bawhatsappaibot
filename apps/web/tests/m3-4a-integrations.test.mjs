import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("M3.4A: /integrations page integrity, H1, supported integrations, and claim controls", () => {
  const pageSrc = read("app/integrations/page.tsx");
  const heroSrc = read("components/integrations/integrations-hero.tsx");
  const wooSrc = read("components/integrations/woocommerce-section.tsx");
  const webKnowledgeSrc = read("components/integrations/website-knowledge-section.tsx");
  const courierSrc = read("components/integrations/courier-integrations-section.tsx");
  const apiSrc = read("components/integrations/api-webhooks-section.tsx");
  const flowSrc = read("components/integrations/data-flow-examples-section.tsx");
  const matrixSrc = read("components/integrations/supported-vs-unclaimed-section.tsx");
  const faqSrc = read("components/integrations/integrations-faq-section.tsx");
  const ctaSrc = read("components/integrations/integrations-final-cta-section.tsx");

  const fullContent = pageSrc + heroSrc + wooSrc + webKnowledgeSrc + courierSrc + apiSrc + flowSrc + matrixSrc + faqSrc + ctaSrc;

  // Exact H1
  assert.match(heroSrc, /Connect BlackArrow to Your Store, Website, Couriers, and <span[^>]*?>Business Systems<\/span>/);

  // Single H1 per page
  const h1Count = (fullContent.match(/<h1\b/g) || []).length;
  assert.equal(h1Count, 1, "/integrations page must contain exactly one H1 element");

  // Required Section IDs
  for (const id of ["integrations-hub", "woocommerce", "website-knowledge", "couriers", "developer-api", "data-flows", "comparison-matrix", "faq"]) {
    assert.match(fullContent, new RegExp(`id="${id}"`), `/integrations must contain section id="${id}"`);
  }

  // Supported integrations present
  assert.match(fullContent, /WooCommerce Integration/);
  assert.match(fullContent, /WordPress &amp; Website Knowledge|WordPress & Website Knowledge/);
  assert.match(fullContent, /PostEx Courier/);
  assert.match(fullContent, /Leopards Courier/);
  assert.match(fullContent, /Public REST API/);

  // Conditional status wording present
  assert.match(fullContent, /Where Configured/);
  assert.match(fullContent, /Where Configured &amp; Supported|Where Configured & Supported/);
  assert.match(fullContent, /Public Developer Interface/);

  // Prohibited unsupported claims & unverified claims absent
  assert.match(matrixSrc, /Not Currently Claimed/);
  assert.doesNotMatch(fullContent, /scoped API tokens|scoped REST API|scoped technical integration|authenticated REST API/i);
  assert.doesNotMatch(fullContent, /knowledge base syncing|live tracking status|in minutes/i);
  assert.doesNotMatch(fullContent, /order captured|human handoff requested|chat escalated/i);
  assert.doesNotMatch(fullContent, /retrieves WooCommerce order details|Connect your WooCommerce store credentials/i);
  assert.doesNotMatch(fullContent, /official Meta partner|official WhatsApp API|guaranteed 100% uptime|zero ban risk|signed webhook requests/i);

  // Verified implementation claims
  assert.match(wooSrc, /workspace order records/i);
  assert.match(courierSrc, /available tracking status or tracking link/i);

  // Structured data imports
  assert.match(pageSrc, /buildBreadcrumbSchema/);
  assert.match(pageSrc, /buildWebPageSchema/);
  assert.doesNotMatch(pageSrc, /buildFaqSchema/);
});
