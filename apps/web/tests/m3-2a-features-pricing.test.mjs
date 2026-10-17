import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("M3.2A: /features page integrity, H1, section IDs and qualified claims", () => {
  const pageSrc = read("app/features/page.tsx");
  const heroSrc = read("components/features/features-hero.tsx");
  const integrationsSrc = read("components/features/integrations-hub-section.tsx");
  const walletSrc = read("components/features/wallet-visibility-section.tsx");
  const fullContent = pageSrc + heroSrc + integrationsSrc + walletSrc;

  // Exact H1 and configured business knowledge
  assert.match(heroSrc, /One WhatsApp Workspace for AI Sales, Support, Orders, and Follow-Ups/);
  assert.match(heroSrc, /configured business knowledge/);

  // Single H1 per page
  const h1Count = (fullContent.match(/<h1\b/g) || []).length;
  assert.equal(h1Count, 1, "/features page must contain exactly one H1 element");

  // All 6 usage rates present
  assert.match(walletSrc, /AI Text Response/);
  assert.match(walletSrc, /\$0\.003 \/ reply/);
  assert.match(walletSrc, /Image Understanding/);
  assert.match(walletSrc, /\$0\.007 \/ image/);
  assert.match(walletSrc, /Voice Note Understanding/);
  assert.match(walletSrc, /\$0\.010 \/ voice note/);
  assert.match(walletSrc, /Generated Voice Reply/);
  assert.match(walletSrc, /from \$0\.020 \/ reply/);
  assert.match(walletSrc, /Sequence \/ Template Send/);
  assert.match(walletSrc, /\$0\.0005 \/ item/);
  assert.match(walletSrc, /Media Group File Send/);
  assert.match(walletSrc, /\$0\.001 \/ file/);

  // Wallet minimum top-up, setup fee, and verified trial credit
  assert.match(walletSrc, /Minimum Wallet Top-Up: <strong>\$5<\/strong>/);
  assert.match(walletSrc, /FULL_SETUP_PRICE/);
  assert.match(walletSrc, /7-Day Trial Includes <strong>\$1 AI Credit<\/strong>/);

  // Prohibited claims checks
  assert.doesNotMatch(fullContent, /official Meta partner|official WhatsApp API|guaranteed 100% uptime|zero ban risk|fully autonomous/i);
  assert.doesNotMatch(fullContent, /JazzCash|EasyPaisa|TCS|M&P/i);
});

test("M3.2A: /pricing page integrity, H1, shared pricing source and structured data", () => {
  const pricingPage = read("app/pricing/page.tsx");
  const heroSrc = read("components/pricing/pricing-hero.tsx");
  const plansSrc = read("components/pricing/monthly-plans-section.tsx");
  const subVsWalletSrc = read("components/pricing/subscription-vs-wallet-section.tsx");
  const comparisonSrc = read("components/pricing/plan-comparison-section.tsx");
  const walletSrc = read("components/pricing/wallet-rates-section.tsx");
  const trialSrc = read("components/pricing/trial-setup-section.tsx");
  const addonsSrc = read("components/pricing/addons-section.tsx");
  const fitSrc = read("components/pricing/business-fit-section.tsx");
  const billingStructureSrc = read("components/pricing/billing-structure-section.tsx");
  const faqSrc = read("components/pricing/pricing-faq-section.tsx");
  const finalCtaSrc = read("components/pricing/pricing-final-cta-section.tsx");

  const fullContent = pricingPage + heroSrc + plansSrc + subVsWalletSrc + comparisonSrc + walletSrc + trialSrc + addonsSrc + fitSrc + billingStructureSrc + faqSrc + finalCtaSrc;

  // Exact H1
  assert.match(heroSrc, /Simple Plans for Your <span[^>]*?>WhatsApp AI Workspace<\/span>/);

  // Single H1 per page
  const h1Count = (fullContent.match(/<h1\b/g) || []).length;
  assert.equal(h1Count, 1, "/pricing page must contain exactly one H1 element");

  // Section IDs
  for (const id of ["plans", "billing-structure", "comparison", "wallet-rates", "trial-setup", "addons", "business-fit", "illustrative-billing", "faq"]) {
    assert.match(fullContent, new RegExp(`id="${id}"`), `pricing page must contain section id="${id}"`);
  }

  // Monthly plans from BILLING_PLAN_DETAILS
  assert.match(plansSrc, /BILLING_PLAN_DETAILS/);
  assert.match(plansSrc, /monthlyPrice/);
  assert.match(plansSrc, /Recommended for Growing Teams/);

  // AI Usage rates mapped from AI_USAGE_RATES
  assert.match(walletSrc, /AI_USAGE_RATES\.map/);
  const pricingSource = read("lib/public-content.ts");
  assert.match(pricingSource, /AI_USAGE_RATES/);

  // Structured data imports
  assert.match(pricingPage, /buildBreadcrumbSchema/);
  assert.match(pricingPage, /buildPricingOffersSchema/);
  assert.doesNotMatch(pricingPage, /buildFaqSchema/);

  // Verified trust badges & claim checks
  assert.match(heroSrc, /Usage Visible in Dashboard/);
  assert.doesNotMatch(fullContent, /No Lock-In Contract/i);
  assert.doesNotMatch(fullContent, /itemized log deduction guarantee/i);
  assert.match(comparisonSrc, /mobileComparisonStack/);

  // Prohibited unverified claims
  assert.doesNotMatch(fullContent, /official Meta partner|official WhatsApp API|guaranteed 100% uptime|zero ban risk|unlimited|most popular|lifetime|discount|save|JazzCash|EasyPaisa|TCS|M&P/i);
});
