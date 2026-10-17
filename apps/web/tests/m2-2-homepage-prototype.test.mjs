import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("M2.3 production homepage route / and /homepage-prototype exist and render approved Homepage", () => {
  const prodRoute = "app/page.tsx";
  const protoRoute = "app/homepage-prototype/page.tsx";
  assert.equal(existsSync(new URL(`../${prodRoute}`, import.meta.url)), true, `${prodRoute} must exist`);
  assert.equal(existsSync(new URL(`../${protoRoute}`, import.meta.url)), true, `${protoRoute} must exist`);

  const prodContent = read(prodRoute);
  const protoContent = read(protoRoute);

  assert.match(prodContent, /Homepage/);
  assert.match(protoContent, /Homepage/);
  assert.match(prodContent, /@\/components\/homepage\/homepage/);
  assert.match(protoContent, /@\/components\/homepage\/homepage/);
});

test("M2.3 production header and footer use official BlackArrow brand asset images", () => {
  const header = read("components/homepage/homepage-header.tsx");
  const footer = read("components/homepage/homepage-footer.tsx");

  assert.match(header, /\/brand\/blackarrow-logo-dark\.png/);
  assert.match(header, /\/brand\/blackarrow-logo-light\.png/);
  assert.match(footer, /\/brand\/blackarrow-logo-dark\.png/);
  assert.match(footer, /\/brand\/blackarrow-logo-light\.png/);
  assert.doesNotMatch(header, /logoIcon.*>C</);
  assert.doesNotMatch(footer, /logoIcon.*>C</);
});

test("M2.3 mobile drawer uses React portal createPortal to document.body", () => {
  const header = read("components/homepage/homepage-header.tsx");
  const css = read("components/homepage/homepage.module.css");

  assert.match(header, /createPortal/);
  assert.match(header, /document\.body/);
  assert.match(css, /\.mobileMenuDrawer/);
  assert.match(css, /z-index:\s*999999/);
});

test("M2.3 section wording uses approved customer-facing product copy and no internal terms", () => {
  const proof = read("components/homepage/product-proof-section.tsx");

  assert.match(proof, /See BlackArrow in Action/);
  assert.match(proof, /Explore how BlackArrow connects your WhatsApp, follows your business instructions, handles customer requests, and keeps your team in control\./);

  const internalTerms = [
    "Real Product Proof Showcase",
    "reconstructed interfaces",
    "verified technical capabilities",
    "Verified Source",
    "Platform Proof",
    "source verification",
  ];
  for (const term of internalTerms) {
    assert.doesNotMatch(proof, new RegExp(term, "i"), `Product proof section contains internal term: ${term}`);
  }
});

test("M2.3 mobile drawer includes all 10 required navigation items", () => {
  const header = read("components/homepage/homepage-header.tsx");

  const requiredItems = [
    "Features",
    "Sales &amp; Orders",
    "Customer Support",
    "Follow-Ups",
    "Industry Use Cases",
    "(Docs|Documentation)",
    "Blog",
    "Pricing",
    "Sign In",
    "Start Free Trial",
  ];
  for (const item of requiredItems) {
    assert.match(header, new RegExp(item), `Mobile header missing item: ${item}`);
  }
});

test("M2.3 hero section uses exact approved headline, supporting copy, and CTA hierarchy", () => {
  const hero = read("components/homepage/hero-section.tsx");
  assert.match(hero, /Automate WhatsApp Sales, Support, Orders, and Follow-Ups with AI/i);
  assert.match(hero, /Connect (a business WhatsApp number|your business WhatsApp)/i);
  assert.match(hero, /Includes a 7-day trial and \$1 AI test credit\./);
  assert.match(hero, /Start Free Trial/);
  assert.match(hero, /See (BlackArrow in Action|How It Works)/i);
  assert.match(hero, /(#product-proof|#how-it-works)/i);
});

test("M2.3 contains all required section IDs and anchors", () => {
  const proof = read("components/homepage/product-proof-section.tsx");
  const workflow = read("components/homepage/workflow-section.tsx");
  const knowledge = read("components/homepage/knowledge-ai-section.tsx");
  const sequences = read("components/homepage/sequences-media-section.tsx");
  const ops = read("components/homepage/customer-operations-section.tsx");
  const control = read("components/homepage/human-control-section.tsx");
  const integrations = read("components/homepage/integrations-section.tsx");
  const usecases = read("components/homepage/use-cases-section.tsx");
  const pricing = read("components/homepage/pricing-faq-section.tsx");
  const footer = read("components/homepage/homepage-footer.tsx");

  assert.match(proof, /id="product-proof"/);
  assert.match(workflow, /id="how-it-works"/);
  assert.match(knowledge, /id="knowledge-ai"/);
  assert.match(sequences, /id="sequences-media"/);
  assert.match(ops, /id="customer-operations"/);
  assert.match(control, /id="human-control"/);
  assert.match(integrations, /id="integrations"/);
  assert.match(usecases, /id="use-cases"/);
  assert.match(pricing, /id="pricing"/);
  assert.match(footer, /id="final-cta"/);
});

test("M2.3 uses approved human control and WhatsApp safety wording", () => {
  const control = read("components/homepage/human-control-section.tsx");
  const footer = read("components/homepage/homepage-footer.tsx");

  assert.match(control, /Pause automated replies and continue the conversation manually when staff intervention is needed\./);
  assert.match(control, /Clients remain responsible for safe, relevant and compliant WhatsApp usage\./);
  assert.match(footer, /Clients remain responsible for safe, relevant and compliant WhatsApp usage\./);
});

test("M2.3 pricing uses shared pricing data and itemized rates", () => {
  const pricing = read("components/homepage/pricing-faq-section.tsx");
  assert.match(pricing, /BILLING_PLAN_DETAILS/);
  assert.match(pricing, /Choose Starter/);
  assert.match(pricing, /Choose Growth/);
  assert.match(pricing, /Choose Pro/);
  assert.match(pricing, /\$0\.003 \/ reply/);
  assert.match(pricing, /\$0\.007 \/ image/);
  assert.match(pricing, /\$0\.010 \/ voice note/);
  assert.match(pricing, /from \$0\.020 \/ reply/);
  assert.match(pricing, /\$0\.0005 \/ item/);
  assert.match(pricing, /\$0\.001 \/ file/);
});

test("M2.3 production homepage does not contain prohibited 555 numbers, fake order totals, or invalid internal links", () => {
  const homepageFiles = [
    "app/page.tsx",
    "app/homepage-prototype/page.tsx",
    "components/homepage/homepage.tsx",
    "components/homepage/homepage-header.tsx",
    "components/homepage/hero-section.tsx",
    "components/homepage/product-proof-section.tsx",
    "components/homepage/workflow-section.tsx",
    "components/homepage/knowledge-ai-section.tsx",
    "components/homepage/sequences-media-section.tsx",
    "components/homepage/customer-operations-section.tsx",
    "components/homepage/human-control-section.tsx",
    "components/homepage/integrations-section.tsx",
    "components/homepage/use-cases-section.tsx",
    "components/homepage/pricing-faq-section.tsx",
    "components/homepage/homepage-footer.tsx",
  ];

  for (const file of homepageFiles) {
    const content = read(file);
    assert.doesNotMatch(content, /555/, `File ${file} contains fake 555 phone number`);
    assert.doesNotMatch(content, /\$29\.00|\$3\.50|free delivery over \$50/i, `File ${file} contains fake order amounts`);
    assert.doesNotMatch(content, /\/design-system-preview/, `File ${file} links to internal design-system-preview`);
    assert.doesNotMatch(content, /Official Meta Partner/i, `File ${file} contains unauthorized partner claim`);
  }
});

test("M2.3 ButtonLink component strictly requires non-empty href: string and does not fallback to /", () => {
  const buttonLinkContent = read("components/button-link.tsx");
  assert.match(buttonLinkContent, /href:\s*string;/, "ButtonLinkProps must strictly require href: string");
  assert.doesNotMatch(buttonLinkContent, /href\s*=\s*"\/";?/, "ButtonLink must not default href to /");
  assert.doesNotMatch(buttonLinkContent, /safeHref/, "ButtonLink must not use safeHref fallback");
});

test("M2.3 Homepage uses server-safe HOMEPAGE_FAQS source for visible accordion without deprecated FAQPage schema", () => {
  const faqsSource = read("lib/homepage-faqs.ts");
  const prodPage = read("app/page.tsx");
  const pricingSection = read("components/homepage/pricing-faq-section.tsx");

  assert.match(faqsSource, /export const HOMEPAGE_FAQS/);
  assert.doesNotMatch(prodPage, /buildFaqSchema/);
  assert.match(pricingSection, /import \{ HOMEPAGE_FAQS \} from "@\/lib\/homepage-faqs"/);
});

test("M2.3 Authentication CTA destination integrity and process ownership (no self-navigation loops)", () => {
  const siteConfigContent = read("lib/site-config.ts");
  const ctaLinksContent = read("lib/cta-links.ts");
  const deployDocContent = readFileSync(new URL("../../../docs/public-web-production-deployment.md", import.meta.url), "utf8");

  // 1. signIn & startTrial CTA destinations are non-empty
  assert.match(ctaLinksContent, /signIn:\s*PUBLIC_SITE_CONFIG\.loginUrl/);
  assert.match(ctaLinksContent, /startTrial:\s*PUBLIC_SITE_CONFIG\.signupUrl/);

  // 2. Destinations do not equal relative /login or /signup (no self-loop)
  assert.doesNotMatch(siteConfigContent, /loginUrl:\s*["']\/login["']/);
  assert.doesNotMatch(siteConfigContent, /signupUrl:\s*["']\/signup["']/);

  // 3. Documented auth process ownership (Vite dashboard/auth process blackarrow)
  assert.match(deployDocContent, /Vite dashboard\/auth/);
  assert.match(deployDocContent, /blackarrow/);
});
