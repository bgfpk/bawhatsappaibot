import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relPath) {
  return readFileSync(new URL(`../${relPath}`, import.meta.url), "utf8");
}

test("M3.5D: /terms page integrity, H1, neutral purchase review, and removal of unapproved legal clauses", () => {
  const termsPage = read("app/terms/page.tsx");
  const legalContent = read("lib/legal-content.ts");
  const legalComp = read("components/legal-document.tsx");

  // 1. Page imports TERMS_DOCUMENT and renders LegalDocumentPage
  assert.match(termsPage, /import \{ TERMS_DOCUMENT \} from "@\/lib\/legal-content"/);
  assert.match(termsPage, /<LegalDocumentPage document=\{TERMS_DOCUMENT\} pathname="\/terms" \/>/);

  // 2. Document title & kicker
  assert.match(legalContent, /eyebrow:\s*"Terms of Service"/);
  assert.match(legalContent, /title:\s*"Terms that set expectations for platform usage, billing, and business responsibility"/);

  // 3. Single H1 in component layout
  assert.match(legalComp, /<h1>\{document\.title\}<\/h1>/);

  // 4. Neutral purchase review wording (No absolute non-refundable claims)
  assert.match(legalContent, /Refund eligibility, billing disputes, and setup-service adjustments are reviewed according to the applicable purchase circumstances/);
  assert.doesNotMatch(legalContent, /all payments are final and non-refundable|payments are final and non-refundable|suspended accounts receive no refund|non-refundable once setup/i);

  // 5. Support cancellation contact (No unproven self-service dashboard cancellation claim)
  assert.match(legalContent, /For subscription or account assistance, contact support@blackarrow\.com/);
  assert.doesNotMatch(legalContent, /clients can cancel through account settings|cancel at any time through account settings/i);

  // 6. Pricing links to /pricing
  assert.match(legalContent, /viewable at \/pricing/);

  // 7. WhatsApp Linked Devices wording & no Cloud API claims
  assert.match(legalContent, /standard WhatsApp Linked Devices protocol/);
  assert.doesNotMatch(legalContent, /official Meta partner|official WhatsApp partner|Meta Cloud API/i);

  // 8. Absence of unapproved legal clauses
  assert.doesNotMatch(legalContent, /Limitation of Liability/i);
  assert.doesNotMatch(legalContent, /consequential, or punitive damages/i);
  assert.doesNotMatch(legalContent, /complete agreement/i);
  assert.doesNotMatch(legalContent, /severability/i);
  assert.doesNotMatch(legalContent, /Acceptance of Terms/i);
  assert.doesNotMatch(legalContent, /continued use of the service following published updates constitutes acceptance/i);
  assert.doesNotMatch(legalContent, /reserve the right to modify, enhance, or adjust features/i);
  assert.doesNotMatch(legalContent, /"as is" and "as available"/i);

  // 9. Contact support link
  assert.match(legalContent, /support@blackarrow\.com/);
  assert.match(legalComp, /href="mailto:support@blackarrow\.com"/);
});

test("M3.5D: /privacy page integrity, conditional data flows, and absence of unapproved privacy claims", () => {
  const privacyPage = read("app/privacy/page.tsx");
  const legalContent = read("lib/legal-content.ts");

  // 1. Page imports PRIVACY_DOCUMENT
  assert.match(privacyPage, /import \{ PRIVACY_DOCUMENT \} from "@\/lib\/legal-content"/);

  // 2. Document title & kicker
  assert.match(legalContent, /eyebrow:\s*"Privacy Policy"/);

  // 3. Conditional provider wording
  assert.match(legalContent, /Information may also be processed by relevant service providers under their own policies/);

  // 4. System providers verified
  assert.match(legalContent, /Appwrite/);
  assert.match(legalContent, /Google Gemini AI/);
  assert.match(legalContent, /Creem/);
  assert.match(legalContent, /PostEx/);
  assert.match(legalContent, /Leopards/);

  // 5. No unapproved privacy commitments
  assert.doesNotMatch(legalContent, /does not sell client or end-customer data/i);
  assert.doesNotMatch(legalContent, /HTTPS\/TLS transport encryption/i);
  assert.doesNotMatch(legalContent, /GDPR|CCPA|HIPAA|SOC 2|ISO|end-to-end encryption/i);

  // 6. Corrected retention & deletion wording
  assert.match(legalContent, /Retention varies by data type, operational requirement, third-party service, and available workspace controls/);
  assert.doesNotMatch(legalContent, /Data is retained while the account is active|remain accessible while the account is active/i);
  assert.match(legalContent, /Contact support@blackarrow\.com to request assistance with account or stored-data controls/);
});

test("M3.5D: /disclaimer page integrity, platform risk, AI limits, and trademark notice", () => {
  const disclaimerPage = read("app/disclaimer/page.tsx");
  const legalContent = read("lib/legal-content.ts");

  // 1. Page imports DISCLAIMER_DOCUMENT
  assert.match(disclaimerPage, /import \{ DISCLAIMER_DOCUMENT \} from "@\/lib\/legal-content"/);

  // 2. Document title & kicker
  assert.match(legalContent, /eyebrow:\s*"Important Notice"/);

  // 3. Disclaimers for zero-ban, uptime, revenue, Meta partnership
  assert.match(legalContent, /WhatsApp and Meta are registered trademarks of Meta Platforms, Inc\./);
  assert.match(legalContent, /do not guarantee immunity or zero-ban operation/);
  assert.match(legalContent, /does not guarantee specific sales growth, revenue increases, conversion rate improvements, or 100% platform uptime/);
});

test("M3.5D: Legal navigation, footer links, and unverified WhatsApp sales link removal", () => {
  const siteShell = read("components/site-shell.tsx");
  const legalComp = read("components/legal-document.tsx");
  const homepage = read("components/homepage/workflow-section.tsx");
  const blogPostsContent = read("../../src/content/blog-posts.ts");

  // 1. Footer links to Terms, Privacy, Disclaimer
  assert.match(siteShell, /\{ href: "\/terms", label: "Terms" \}/);
  assert.match(siteShell, /\{ href: "\/privacy", label: "Privacy" \}/);
  assert.match(siteShell, /\{ href: "\/disclaimer", label: "Disclaimer" \}/);

  // 2. Unverified WhatsApp sales link & May 2026 date removed
  assert.doesNotMatch(siteShell, /wa\.me\/923136923129|WhatsApp sales chat/i);
  assert.doesNotMatch(legalComp, /May 2026|Last updated/i);
  assert.match(siteShell, /PUBLIC_SITE_CONFIG\.supportEmail/);

  // 3. Supporting pages remain untouched
  assert.match(homepage, /Four-Step Workflow/);
  assert.match(blogPostsContent, /AUTHOR = "BlackArrow"/);
});
