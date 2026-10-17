import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relPath) {
  return readFileSync(new URL(`../${relPath}`, import.meta.url), "utf8");
}

test("M3.5B: /docs page integrity, H1, QR scanner instructions, pricing, and claim controls", () => {
  const docsPage = read("app/docs/page.tsx");
  const docsContent = read("components/docs/docs-page-content.tsx");
  const docsHero = read("components/docs/docs-hero.tsx");
  const quickStart = read("components/docs/quick-start-journey.tsx");
  const categories = read("components/docs/docs-categories-section.tsx");
  const instanceConn = read("components/docs/instance-connection-guide.tsx");
  const aiConfig = read("components/docs/ai-configuration-guide.tsx");
  const mediaSeq = read("components/docs/media-sequences-guide.tsx");
  const custOps = read("components/docs/customer-operations-guide.tsx");
  const devInteg = read("components/docs/integration-developer-guide.tsx");
  const walletBilling = read("components/docs/wallet-billing-guide.tsx");
  const safety = read("components/docs/safety-responsibility-section.tsx");
  const trouble = read("components/docs/troubleshooting-guide.tsx");
  const faqData = read("components/docs/docs-faq-data.ts");
  const faqSection = read("components/docs/docs-faq-section.tsx");
  const search = read("components/docs/docs-search.tsx");

  const fullSource = `${docsPage}\n${docsContent}\n${docsHero}\n${quickStart}\n${categories}\n${instanceConn}\n${aiConfig}\n${mediaSeq}\n${custOps}\n${devInteg}\n${walletBilling}\n${safety}\n${trouble}\n${faqData}\n${faqSection}\n${search}`;

  // 1. Single H1
  assert.match(docsHero, /<h1[^>]*>BlackArrow Documentation<\/h1>/);

  // 2. Quick setup & QR instructions use WhatsApp scanner (no ordinary phone camera wording)
  assert.match(quickStart, /Quick Setup Journey/);
  assert.match(quickStart, /use the WhatsApp scanner to scan the QR code/);
  assert.doesNotMatch(fullSource, /phone camera/i);

  // 3. Linked Devices wording (no Meta Cloud API claims)
  assert.match(fullSource, /WhatsApp Linked Devices/i);
  assert.doesNotMatch(fullSource, /uses Meta Cloud API|official Meta partner|official Meta connection/i);

  // 4. Absence of Bearer token examples and unproven REST API claims
  assert.doesNotMatch(fullSource, /Bearer YOUR_TOKEN|Authorization: Bearer/i);

  // 5. Accurate WooCommerce wording (no automatic import or order retrieval claims)
  assert.match(fullSource, /Configured or imported WooCommerce product catalog data/);
  assert.doesNotMatch(fullSource, /automatic WooCommerce import|real-time inventory sync|WooCommerce order retrieval/i);

  // 6. Absence of unverified plan capacities
  assert.doesNotMatch(walletBilling, /1 WhatsApp Instance included|2 WhatsApp Instances included|5 WhatsApp Instances included/i);

  // 7. Optional Full Setup Service: $49
  assert.match(walletBilling, /Optional Full Setup Service:\s*\$49/i);

  // 8. Absence of exact internal command syntax (.0, .00, .1, .bot off)
  assert.doesNotMatch(fullSource, /\s\.0\s|\s\.00\s|\s\.1\s|\.bot off|bot off/i);

  // 9. Exact approved pricing and usage rates
  assert.match(walletBilling, /\$9/);
  assert.match(walletBilling, /\$29/);
  assert.match(walletBilling, /\$89/);
  assert.match(walletBilling, /\$0\.003/);
  assert.match(walletBilling, /\$0\.007/);
  assert.match(walletBilling, /\$0\.010/);
  assert.match(walletBilling, /\$0\.020/);
  assert.match(walletBilling, /\$0\.0005/);
  assert.match(walletBilling, /\$0\.001/);

  // 10. Media Library vs Media Group vs Sequence Group
  assert.match(mediaSeq, /Media Library/);
  assert.match(mediaSeq, /Media Group/);
  assert.match(mediaSeq, /Sequence Group/);

  // 11. Safety & Responsibility
  assert.match(safety, /Launch Safety/);
  assert.match(safety, /Platform Risk/);

  // 12. Documentation Search accessibility
  assert.match(search, /label htmlFor=\{searchInputId\}[^>]*>\s*Search documentation topics/);
  assert.match(search, /id=\{searchInputId\}/);

  // 13. No fake update dates, version numbers, or exposed credentials
  assert.doesNotMatch(fullSource, /v[0-9]+\.[0-9]+\.[0-9]+|Last updated on|2027|2028|sk_live_|ghp_/i);
});

test("M3.5B: Supporting core routes remain unchanged and accessible", () => {
  const homepage = read("components/homepage/workflow-section.tsx");
  const features = read("app/features/page.tsx");
  const pricing = read("app/pricing/page.tsx");
  const integrations = read("app/integrations/page.tsx");
  const about = read("app/about/page.tsx");
  const contact = read("app/contact/page.tsx");

  assert.match(homepage, /Four-Step Workflow/);
  assert.match(features, /Features/i);
  assert.match(pricing, /Pricing/i);
  assert.match(integrations, /Integrations/i);
  assert.match(about, /About/i);
  assert.match(contact, /Contact/i);
});
