import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeWhatsAppCustomerReply,
  validateWhatsAppCustomerReply,
  repairWhatsAppCustomerReplyFormatting,
} from "./whatsapp-customer-reply-contract-service.ts";

test("Format: Website markdown bold converted to WhatsApp *bold*", () => {
  const input = "Here is **our latest update** with **great pricing**!";
  const normalized = normalizeWhatsAppCustomerReply(input);
  assert.equal(normalized.includes("**"), false);
  assert.match(normalized, /\*our latest update\*/);
  assert.match(normalized, /\*great pricing\*/);
});

test("Format: Heading syntax converted to *Title*", () => {
  const input = "## Service Catalog\n\n### Web Design & Ads\n\nWe provide complete services.";
  const normalized = normalizeWhatsAppCustomerReply(input);
  assert.equal(normalized.includes("##"), false);
  assert.equal(normalized.includes("###"), false);
  assert.match(normalized, /\*Service Catalog\*/);
  assert.match(normalized, /\*Web Design & Ads\*/);
});

test("Format: Tables converted to bullet points without table markers", () => {
  const input = `
Here is our pricing structure:

| Package | Price | Support |
|---|---|---|
| Starter | $99 | Email |
| Growth | $299 | 24/7 WhatsApp |
  `.trim();

  const normalized = normalizeWhatsAppCustomerReply(input);
  assert.equal(normalized.includes("|---|"), false);
  assert.match(normalized, /• \*Package:\* Starter \| \*Price:\* \$99 \| \*Support:\* Email/);
  assert.match(normalized, /• \*Package:\* Growth \| \*Price:\* \$299 \| \*Support:\* 24\/7 WhatsApp/);
});

test("Format: Bullet paragraphs and nested lists formatted line-by-line", () => {
  const input = "Here are the features:\n* Strategy call\n* Creative testing\n- Audience optimization";
  const normalized = normalizeWhatsAppCustomerReply(input);
  const lines = normalized.split("\n").filter((l) => l.startsWith("•"));
  assert.equal(lines.length, 3);
});

test("Format: Numbered lists complete and on separate lines", () => {
  const input = "Steps to start: 1. Send your catalog. 2. We set up campaigns. 3. Launch within 48 hours.";
  const normalized = normalizeWhatsAppCustomerReply(input);
  assert.match(normalized, /1\.\s+Send your catalog\./);
  assert.match(normalized, /2\.\s+We set up campaigns\./);
  assert.match(normalized, /3\.\s+Launch within 48 hours\./);

  const validation = validateWhatsAppCustomerReply(normalized);
  assert.equal(validation.ok, true);
});

test("Format: Unfinished numbering repaired deterministically", () => {
  const input = "Here are our packages:\n\n1. Starter plan\n2. Growth plan\n3.";
  const repaired = repairWhatsAppCustomerReplyFormatting(input);
  assert.equal(/3\.\s*$/.test(repaired), false);
  assert.ok(repaired.includes("2. Growth plan"));

  const val = validateWhatsAppCustomerReply(repaired);
  assert.equal(val.ok, true);
});

test("Format: Truncated sentence detected by validator", () => {
  const input = "Thanks for connecting with Starts Digital! Regarding our performance marketing service, we";
  const val = validateWhatsAppCustomerReply(input);
  assert.equal(val.ok, false);
  assert.ok(val.errors.includes("incomplete_sentence_ending"));
});

test("Format: Giant dense paragraphs separated by blank lines", () => {
  const input = "Welcome to BlackArrow. We help you automate WhatsApp sales.\nOur platform integrates directly with your catalog.\nSetup takes only 5 minutes.";
  const normalized = normalizeWhatsAppCustomerReply(input);
  // Separate thoughts have blank lines between them
  assert.ok(normalized.includes("\n\n"));
});

test("Format: Broken emphasis markers repaired cleanly", () => {
  const input = "Check out our *special discount offer for this week only!";
  const repaired = repairWhatsAppCustomerReplyFormatting(input);
  const count = (repaired.match(/\*/g) || []).length;
  assert.equal(count % 2, 0, "Asterisk markers must be balanced");
});

test("Format: URL, email, and phone numbers preserved without corruption", () => {
  const input = "Visit https://startsdigital.com/pricing or email contact-a5af4ce83c22@example.invalid or call +92 300 1234567 for info.";
  const normalized = normalizeWhatsAppCustomerReply(input);
  assert.ok(normalized.includes("https://startsdigital.com/pricing"));
  assert.ok(normalized.includes("contact-a5af4ce83c22@example.invalid"));
  assert.ok(normalized.includes("+92 300 1234567"));
});

test("Format: Currency and percentage preserved exactly", () => {
  const input = "Our rate is 4% of total order value or Rs. 15,000 / $250 flat fee with 15% discount.";
  const normalized = normalizeWhatsAppCustomerReply(input);
  assert.ok(normalized.includes("4%"));
  assert.ok(normalized.includes("Rs. 15,000"));
  assert.ok(normalized.includes("$250"));
  assert.ok(normalized.includes("15%"));
});

test("Format: Multilingual text (English, Urdu, Roman Urdu, mixed)", () => {
  // English
  const en = "Thank you for contacting us. We will assist you shortly.";
  assert.equal(validateWhatsAppCustomerReply(normalizeWhatsAppCustomerReply(en)).ok, true);

  // Urdu
  const ur = "ہماری سروس کے چارجز کل آرڈر ویلیو کا 4 فیصد ہیں۔ کیا آپ تفصیلات جاننا چاہتے ہیں؟";
  assert.equal(validateWhatsAppCustomerReply(normalizeWhatsAppCustomerReply(ur)).ok, true);

  // Roman Urdu
  const ru = "Hamari marketing fee total order value ka 4% hai. Kya aap onboarding call schedule karna chahte hain?";
  assert.equal(validateWhatsAppCustomerReply(normalizeWhatsAppCustomerReply(ru)).ok, true);

  // Mixed Urdu / English
  const mixed = "Starts Digital ke sath campaign start karne ke liye $500 setup fee hai aur 4% performance charges hain. Kya hum onboarding details share karein?";
  assert.equal(validateWhatsAppCustomerReply(normalizeWhatsAppCustomerReply(mixed)).ok, true);
});
