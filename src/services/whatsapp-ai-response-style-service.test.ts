import test from "node:test";
import assert from "node:assert/strict";

import {
  GLOBAL_WHATSAPP_RESPONSE_FORMAT_POLICY,
  CONCISE_WHATSAPP_REPLY_RULES,
  normalizeAiGeneratedWhatsAppReply,
  cleanTextForTts,
} from "./whatsapp-ai-response-style-service.ts";
import { formatWhatsappReply, sanitizeCustomerFacingReply } from "./reply-style-service.ts";
import { prepareOutgoingWhatsAppText } from "./outbound-message-sanitizer.ts";
import { buildCustomerBotPromptAssembly } from "./customer-bot-prompt-service.ts";

test("1. Simple one-sentence question remains concise with no unnecessary list or headings", () => {
  const input = "Yes, our shop is open from 9 AM to 10 PM today.";
  const output = sanitizeCustomerFacingReply(input);
  assert.equal(output, "Yes, our shop is open from 9 AM to 10 PM today.");
  assert.doesNotMatch(output, /^#/);
  assert.doesNotMatch(output, /^- /m);
  assert.doesNotMatch(output, /^\d+\./m);
});

test("2. Two unrelated questions/answers are separated clearly with a blank line", () => {
  const input = "Our store is located in Gulberg, Lahore.\n\nYes, we offer Cash on Delivery across Pakistan.";
  const output = sanitizeCustomerFacingReply(input);
  assert.equal(output, "Our store is located in Gulberg, Lahore.\n\nYes, we offer Cash on Delivery across Pakistan.");
  assert.match(output, /\n\n/);
});

test("3. Three features format as a readable bullet/list structure", () => {
  const input = "Here are the key features:\n- *Real-time sync:* Instant updates\n- *Automated replies:* 24/7 coverage\n- *Smart follow-ups:* Re-engage leads";
  const output = sanitizeCustomerFacingReply(input);
  assert.match(output, /- \*Real-time sync:\* Instant updates/);
  assert.match(output, /- \*Automated replies:\* 24\/7 coverage/);
  assert.match(output, /- \*Smart follow-ups:\* Re-engage leads/);
});

test("4. Five setup steps format as numbered steps on separate lines", () => {
  const input = "Setup instructions:\n1. Create an account on the dashboard\n2. Scan your WhatsApp QR code\n3. Add your business catalog\n4. Configure AI instructions\n5. Start receiving automated replies";
  const output = sanitizeCustomerFacingReply(input);
  assert.match(output, /1\. /);
  assert.match(output, /2\. /);
  assert.match(output, /3\. /);
  assert.match(output, /4\. /);
  assert.match(output, /5\. /);
  assert.doesNotMatch(output, /1\.[^\n]+2\.[^\n]+3\./);
});

test("5. Multiple prices are visually separated", () => {
  const input = "Here are the available packages:\n\n*Starter Plan*\n$9/month\n\n*Growth Plan*\n$29/month\n\n*Pro Plan*\n$89/month";
  const output = sanitizeCustomerFacingReply(input);
  assert.match(output, /\*Starter Plan\*\n\$9\/month/);
  assert.match(output, /\*Growth Plan\*\n\$29\/month/);
  assert.match(output, /\*Pro Plan\*\n\$89\/month/);
});

test("6. Paragraph response preserves blank lines through send pipeline", () => {
  const input = "Welcome to BlackArrow!\n\nWe provide WhatsApp AI automation for modern businesses.\n\nWould you like to see a demo?";
  const prepared = prepareOutgoingWhatsAppText(input);
  assert.equal(prepared.text, "Welcome to BlackArrow!\n\nWe provide WhatsApp AI automation for modern businesses.\n\nWould you like to see a demo?");
});

test("7. Existing \\n\\n is not collapsed to spaces", () => {
  const input = "First thought.\n\nSecond thought.\n\nThird thought.";
  const output = normalizeAiGeneratedWhatsAppReply(input);
  assert.equal(output, "First thought.\n\nSecond thought.\n\nThird thought.");
});

test("8. Excessive blank lines are normalized safely", () => {
  const input = "Section A\n\n\n\n\nSection B\n\n\nSection C";
  const output = normalizeAiGeneratedWhatsAppReply(input);
  assert.equal(output, "Section A\n\nSection B\n\nSection C");
});

test("9. URL in formatted reply is preserved exactly without broken formatting", () => {
  const input = "You can sign up here: https://blackarrow-source.offline.invalid/signup?ref=wa_bot\n\nLet me know once done!";
  const output = sanitizeCustomerFacingReply(input);
  assert.match(output, /https:\/\/blackarrow\.com\/signup\?ref=wa_bot/);
  assert.doesNotMatch(output, /https: \/\//);
});

test("10. WhatsApp *bold* syntax is preserved", () => {
  const input = "*Important Notice:* Your order has been *Confirmed*.";
  const output = sanitizeCustomerFacingReply(input);
  assert.equal(output, "*Important Notice:* Your order has been *Confirmed*.");
});

test("11. Roman Urdu response formatting works without English labels inserted", () => {
  const input = "Ji bilkul, hamari delivery poore Pakistan mein available hai.\n\n*Delivery Time:*\n- Lahore: 1-2 din\n- Doosray shehar: 3-4 din\n\nAap apna delivery address share kar dein?";
  const output = sanitizeCustomerFacingReply(input);
  assert.match(output, /Ji bilkul, hamari delivery poore Pakistan mein available hai\./);
  assert.match(output, /- \*Lahore:\* 1-2 din|- Lahore: 1-2 din/);
  assert.match(output, /- \*Doosray shehar:\* 3-4 din|- Doosray shehar: 3-4 din/);
  assert.doesNotMatch(output, /\b(Option A|Step 1|Summary:)\b/);
});

test("12. Long response is structured, not a one-line wall of text", () => {
  const input = "Thank you for reaching out.\n\n*Available Services:*\n- Web Design: Custom frontend development\n- WhatsApp Automation: AI-powered client chat\n- CRM Integration: Automated lead capture\n\nWhich service best matches your needs?";
  const output = sanitizeCustomerFacingReply(input);
  const lines = output.split("\n").filter(Boolean);
  assert.ok(lines.length >= 4, "Should have multiple structured lines");
  assert.doesNotMatch(output, /^Thank you[^\n]{150,}$/);
});

test("13. Very short response is not overformatted", () => {
  const input = "Ji available hai.";
  const output = sanitizeCustomerFacingReply(input);
  assert.equal(output, "Ji available hai.");
});

test("14. Voice/TTS path cleans formatting symbols without spoken artifacts", () => {
  const input = "Sure 😊\n\n*Available options:*\n- *Starter:* $9/month\n- *Growth:* $29/month\n\n1. Open settings\n2. Save changes\n\nVisit https://blackarrow-source.offline.invalid/signup for details.";
  const spoken = cleanTextForTts(input);
  assert.doesNotMatch(spoken, /\*/);
  assert.doesNotMatch(spoken, /^- /m);
  assert.match(spoken, /1, Open settings/);
  assert.match(spoken, /2, Save changes/);
  assert.match(spoken, /Visit blackarrow\.com for details\./);
  assert.doesNotMatch(spoken, /https:\/\//);
});

test("15. Baileys/Web WhatsApp send preserves line breaks", () => {
  const input = "Line 1\nLine 2\n\nLine 3";
  const prepared = prepareOutgoingWhatsAppText(input);
  assert.equal(prepared.text, "Line 1\nLine 2\n\nLine 3");
});

test("16. Transport pipeline formatting remains transport-neutral and preserves newlines", () => {
  const input = "*Title*\n- Item 1\n- Item 2\n\nClosing line.";
  const normalized = normalizeAiGeneratedWhatsAppReply(input);
  assert.equal(normalized, "*Title*\n- Item 1\n- Item 2\n\nClosing line.");
});

test("17. Manual saved reply with intentional custom layout is not corrupted", () => {
  const input = "Thank you for contacting us.\nOur bank details:\nBank: Meezan Bank\nAccount: 1234567890\nTitle: Black Arrow";
  const prepared = prepareOutgoingWhatsAppText(input);
  assert.match(prepared.text, /Meezan Bank/);
  assert.match(prepared.text, /1234567890/);
  assert.match(prepared.text, /Black Arrow/);
});

test("18. Sequence content preserves multi-line template structure", () => {
  const input = "Hi {name}!\n\nJust checking in on your inquiry.\n\nReply YES to continue.";
  const prepared = prepareOutgoingWhatsAppText(input);
  assert.equal(prepared.text, "Hi {name}!\n\nJust checking in on your inquiry.\n\nReply YES to continue.");
});

test("19. Broadcast content preserves custom message structure and variables", () => {
  const input = "Special Offer for {name}!\n\nGet 20% off on all items today.\nUse code: SAVE20\n\nOrder now: https://example.com/shop";
  const prepared = prepareOutgoingWhatsAppText(input);
  assert.match(prepared.text, /Special Offer for \{name\}!/);
  assert.match(prepared.text, /SAVE20/);
  assert.match(prepared.text, /https:\/\/example\.com\/shop/);
});

test("20. Tenant instructions still control facts, persona, and products", () => {
  const assembly = buildCustomerBotPromptAssembly({
    userConfig: { bot_name: "CustomBot", business_type: "bakery", preferred_language: "urdu" },
    basePrompt: "Hum fresh cakes aur pastries bechtay hain. Delivery charges Rs. 200 hain.",
    learnedRulesText: "Custom design cakes ke liye 24 ghante pehle order zaroori hai.",
    instanceCustomFields: [],
    instanceReplyBehavior: "text_only",
    products: [{ name: "Chocolate Cake", base_price: 1500, stock: 5 }],
    cachedMediaTemplates: [],
    cachedKeywordSequences: {},
    languagePreference: { language: "urdu", preferredLanguage: "urdu" },
    effectiveProfile: {},
    savedDeliveryName: "Ali",
    replyBehavior: "text_only",
    personaPreference: { personaGender: "female", voiceGender: "female", selectedVoice: "Kore" },
    effectiveChatSummary: "Customer inquired about chocolate cake.",
    customerInstructions: "Deliver in the evening.",
    lastUserMsgText: "Chocolate cake kitne ka hai?",
    lastUserMsgIsVoice: false,
    lastUserMsgHasImage: false,
    aiMessagesCount: 2,
  });

  assert.match(assembly.stablePrefix, /Hum fresh cakes aur pastries bechtay hain/);
  assert.match(assembly.stablePrefix, /Delivery charges Rs\. 200 hain/);
  assert.match(assembly.stablePrefix, /Custom design cakes ke liye 24 ghante pehle order zaroori hai/);
  assert.match(assembly.stablePrefix, /Chocolate Cake/);
  assert.match(assembly.stablePrefix, /WHATSAPP FORMATTING & READABILITY RULES/);
});

test("21. Regression Test: Outbound text path preserves multi-part newlines and list structure", () => {
  const input = "Yes, we can help.\n\n*Available options*\n- Option A\n- Option B\n\n1. Open settings\n2. Save changes";
  const prepared = prepareOutgoingWhatsAppText(input);
  
  assert.equal(
    prepared.text,
    "Yes, we can help.\n\n*Available options*\n- Option A\n- Option B\n\n1. Open settings\n2. Save changes"
  );
  
  // Must NEVER collapse into a single-line wall of text
  assert.notEqual(
    prepared.text,
    "Yes, we can help. *Available options* - Option A - Option B 1. Open settings 2. Save changes"
  );
});
