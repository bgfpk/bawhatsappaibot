import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("M3.5A: /about page integrity, H1, operational layers, and claim controls", () => {
  const pageSrc = read("app/about/page.tsx");
  const heroSrc = read("components/about/about-hero.tsx");
  const whySrc = read("components/about/why-blackarrow-exists.tsx");
  const layersSrc = read("components/about/operational-layers.tsx");
  const prinSrc = read("components/about/product-principles.tsx");
  const humanSrc = read("components/about/human-control-section.tsx");
  const scopeSrc = read("components/about/current-product-scope.tsx");
  const transSrc = read("components/about/restrained-transparency-section.tsx");
  const ctaSrc = read("components/about/about-final-cta.tsx");
  const cssSrc = read("components/about/about.module.css");

  const fullContent = pageSrc + heroSrc + whySrc + layersSrc + prinSrc + humanSrc + scopeSrc + transSrc + ctaSrc;

  // Exact H1
  assert.match(heroSrc, /Building a More Practical Way to Run <span[^>]*?>WhatsApp Sales and Support<\/span>/);

  // Single H1 per page
  const h1Count = (fullContent.match(/<h1\b/g) || []).length;
  assert.equal(h1Count, 1, "/about page must contain exactly one H1 element");

  // Operational layers present
  assert.match(layersSrc, /Understand/);
  assert.match(layersSrc, /Respond/);
  assert.match(layersSrc, /Organize/);
  assert.match(layersSrc, /Control/);

  // Unsupported statistic absent
  assert.doesNotMatch(fullContent, /millions of businesses|primary commerce channel for millions/i);
  assert.match(whySrc, /Businesses that manage customer conversations through WhatsApp can face operational bottlenecks as message volume grows\./);

  // Bot commands absent and approved phrasing present
  assert.doesNotMatch(fullContent, /'\.0'|'\.bot off'|'\.1'|'\.00'|"\.0"|"\.bot off"|"\.1"|"\.00"/i);
  assert.match(humanSrc, /Staff can pause AI replies, take over a conversation, and resume automation where supported\./);

  // Prohibited claims absent
  assert.doesNotMatch(fullContent, /official Meta partner|official WhatsApp Cloud API|guaranteed 100% uptime|zero ban risk|market leader|industry leading/i);

  // No blue glow CSS
  assert.doesNotMatch(cssSrc, /#3b82f6|#2563eb|#1d4ed8|#0066ff|blue|rgba\(59,|rgba\(37,|rgba\(29,/i);

  // Structured data imports
  assert.match(pageSrc, /buildBreadcrumbSchema/);
});

test("M3.5A: /contact page integrity, H1, verified channels, and security warning", () => {
  const pageSrc = read("app/contact/page.tsx");
  const heroSrc = read("components/contact/contact-hero.tsx");
  const optSrc = read("components/contact/contact-options.tsx");
  const emailSrc = read("components/contact/email-contact-interface.tsx");
  const guideSrc = read("components/contact/contact-guidance-section.tsx");
  const pathsSrc = read("components/contact/existing-customer-paths.tsx");
  const nextSrc = read("components/contact/what-happens-next.tsx");
  const faqSrc = read("components/contact/contact-faq-section.tsx");
  const ctaSrc = read("components/contact/contact-final-cta.tsx");
  const cssSrc = read("components/contact/contact.module.css");

  const fullContent = pageSrc + heroSrc + optSrc + emailSrc + guideSrc + pathsSrc + nextSrc + faqSrc + ctaSrc;

  // Exact H1
  assert.match(heroSrc, /Talk to BlackArrow About Your <span[^>]*?>WhatsApp Workflow<\/span>/);

  // Single H1 per page
  const h1Count = (fullContent.match(/<h1\b/g) || []).length;
  assert.equal(h1Count, 1, "/contact page must contain exactly one H1 element");

  // Verified support email and security notice
  assert.match(fullContent, /contact-086473cbd844@example.invalid/);
  assert.match(emailSrc, /Contact BlackArrow support directly at/i);
  assert.match(emailSrc, /Security Notice/i);
  assert.match(emailSrc, /Do not send account passwords/i);

  // Unverified organisation label absent
  assert.doesNotMatch(fullContent, /Firdosi Digital|Remote Support/i);

  // Unverified phone number absent
  assert.doesNotMatch(fullContent, /\+92\s*313\s*6923129|923136923129|wa\.me/i);

  // Departmental team labels absent; topic-based actions present
  assert.doesNotMatch(fullContent, /Email Setup Team|Email Billing Team|Email Tech Team/i);
  assert.match(optSrc, /Email Support About Sales/);
  assert.match(optSrc, /Email Support About Setup/);
  assert.match(optSrc, /Email Support About Billing/);
  assert.match(optSrc, /Email Support About Technical Issues/);

  // Prohibited claims and response time promises absent
  assert.doesNotMatch(fullContent, /official Meta partner|official WhatsApp Cloud API|guaranteed 100% uptime|zero ban risk|24\/7 response|immediate response|guaranteed response time/i);

  // No blue glow CSS
  assert.doesNotMatch(cssSrc, /#3b82f6|#2563eb|#1d4ed8|#0066ff|blue|rgba\(59,|rgba\(37,|rgba\(29,/i);

  // Structured data imports
  assert.match(pageSrc, /buildBreadcrumbSchema/);
  assert.match(pageSrc, /buildContactPageSchema/);
  assert.doesNotMatch(pageSrc, /buildFaqSchema/);
});
