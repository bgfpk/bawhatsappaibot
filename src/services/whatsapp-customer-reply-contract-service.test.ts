import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeWhatsAppCustomerReply,
  validateWhatsAppCustomerReply,
  repairWhatsAppCustomerReplyFormatting,
  assertCommercialFactsPreserved,
  extractCommercialFacts,
} from "./whatsapp-customer-reply-contract-service.ts";

test("1. Converts markdown bold **bold** to WhatsApp *bold*", () => {
  const input = "This is **important** and this is **critical**.";
  const normalized = normalizeWhatsAppCustomerReply(input);
  assert.equal(normalized, "This is *important* and this is *critical*.");
});

test("2. Converts markdown headings to WhatsApp *bold* and removes hash markers", () => {
  const input = "## Service Overview\n\nWe provide 24/7 customer support.";
  const normalized = normalizeWhatsAppCustomerReply(input);
  assert.match(normalized, /^\*Service Overview\*/);
  assert.doesNotMatch(normalized, /#/);
});

test("3. Converts markdown tables into readable bullet points", () => {
  const table = `| Plan | Price | Features |
|---|---|---|
| Starter | $9 | Basic AI |
| Pro | $29 | Full AI |`;
  const normalized = normalizeWhatsAppCustomerReply(table);
  assert.doesNotMatch(normalized, /\|---\|/);
  assert.match(normalized, /• \*Plan:\* Starter/);
  assert.match(normalized, /• \*Plan:\* Pro/);
});

test("4. Preserves URLs, emails, phone numbers without mangling", () => {
  const input = "Visit https://blackarrow-source.offline.invalid/pricing?ref=wa or email contact-086473cbd844@example.invalid or call +92 300 1234567.";
  const normalized = normalizeWhatsAppCustomerReply(input);
  assert.match(normalized, /https:\/\/blackarrow\.com\/pricing\?ref=wa/);
  assert.match(normalized, /support@blackarrow\.com/);
  assert.match(normalized, /\+92 300 1234567/);
});

test("5. Preserves prices and percentages accurately", () => {
  const input = "Starter package is Rs. 15,000 with a 20% performance fee on total sales ($500 minimum).";
  const normalized = normalizeWhatsAppCustomerReply(input);
  assert.match(normalized, /Rs\. 15,000/);
  assert.match(normalized, /20%/);
  assert.match(normalized, /\$500/);

  const factsPreserved = assertCommercialFactsPreserved(input, normalized);
  assert.equal(factsPreserved.preserved, true);
});

test("6. Multilingual support: Urdu, Roman Urdu, and English", () => {
  const urdu = "ہماری سروس کے چارجز 5000 روپے ہیں۔\n\nکیا آپ آرڈر کنفرم کرنا چاہتے ہیں؟";
  const normUrdu = normalizeWhatsAppCustomerReply(urdu);
  assert.match(normUrdu, /ہماری سروس کے چارجز/);

  const romanUrdu = "Humara package *Growth* Rs. 8,000 ka hai.\n\nSetup complete honay mein 2 din lagtay hain.";
  const normRoman = normalizeWhatsAppCustomerReply(romanUrdu);
  assert.match(normRoman, /Humara package \*Growth\* Rs\. 8,000 ka hai\./);

  const valUrdu = validateWhatsAppCustomerReply(normUrdu);
  assert.equal(valUrdu.ok, true);

  const valRoman = validateWhatsAppCustomerReply(normRoman);
  assert.equal(valRoman.ok, true);
});

test("7. Rejects standalone filler acknowledgement when customer expects an answer", () => {
  const filler1 = "Sure!";
  const val1 = validateWhatsAppCustomerReply(filler1);
  assert.equal(val1.ok, false);
  assert.equal(val1.isFillerOnly, true);

  const filler2 = "Let me check.";
  const val2 = validateWhatsAppCustomerReply(filler2);
  assert.equal(val2.ok, false);
  assert.equal(val2.isFillerOnly, true);
});

test("8. Detects unfinished trailing conjunction or sentence ending", () => {
  const incomplete = "We offer two different packages and";
  const val = validateWhatsAppCustomerReply(incomplete);
  assert.equal(val.ok, false);
  assert.match(val.errors.join(" "), /dangling_trailing_conjunction/);
});

test("9. Detects and repairs trailing empty bullets or numbers", () => {
  const textWithEmptyBullet = "Here are the steps:\n1. Open dashboard\n2. Link WhatsApp\n3.";
  const val = validateWhatsAppCustomerReply(textWithEmptyBullet);
  assert.equal(val.ok, false);
  assert.match(val.errors.join(" "), /unfinished_numbering_at_end/);

  const repaired = repairWhatsAppCustomerReplyFormatting(textWithEmptyBullet);
  const valRepaired = validateWhatsAppCustomerReply(repaired);
  assert.equal(valRepaired.ok, true);
  assert.doesNotMatch(repaired, /3\.\s*$/);
});

test("10. Detects and fixes broken bullet layouts where bullets are on one line", () => {
  const joinedBullets = "• Option A: 500 PKR • Option B: 1000 PKR";
  const repaired = repairWhatsAppCustomerReplyFormatting(joinedBullets);
  assert.match(repaired, /• Option A: 500 PKR\n• Option B: 1000 PKR/);
});

test("11. Rejects internal reasoning or leaked metadata", () => {
  const leaked = "According to the system instructions, I cannot invent prices. The customer is asking for pricing.";
  const val = validateWhatsAppCustomerReply(leaked);
  assert.equal(val.ok, false);
  assert.match(val.errors.join(" "), /contains_internal_reasoning_or_metadata/);
});

test("12. Ensures commercial fact preservation assertion fails if price is altered", () => {
  const original = "The price is $100.";
  const altered = "The price is $50.";
  const result = assertCommercialFactsPreserved(original, altered);
  assert.equal(result.preserved, false);
  assert.match(result.discrepancies.join(" "), /Missing or mutated price: \$100/);
});
