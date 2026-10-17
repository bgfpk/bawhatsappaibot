import test from "node:test";
import assert from "node:assert/strict";

import { prepareOutgoingWhatsAppText } from "./outbound-message-sanitizer.ts";
import {
  formatWhatsappReply,
  isCustomerVisibleToolMetaText,
  isIncompleteOrderSummaryReply,
  isProbablyIncompleteCustomerReply,
  sanitizeCustomerFacingReply,
  stripMarkdownTextWrappers,
} from "./reply-style-service.ts";

test("short valid customer replies are not marked incomplete", () => {
  const validReplies = [
    "Yes, I can help. What would you like to know?",
    "Ji, Urdu mein baat kar leta hoon. Aap kya poochna chahte hain?",
    "Sure, which product are you interested in?",
    "I have bike covers available. Which size do you need?",
    "Ji Urdu mein baat kar leta hoon aap kya poochna chahte hain",
  ];

  for (const reply of validReplies) {
    assert.equal(isProbablyIncompleteCustomerReply(reply), false, reply);
  }
});

test("truly incomplete replies are still blocked", () => {
  const incompleteReplies = [
    "",
    "Looking for",
    "I can help with",
    "The best option is...",
    "Sure,",
    "Thanks for sharing about Bari Engineering!\n\nHow",
    "How can",
    "Would you like to",
    "Can you please",
    "Please share",
    "Do you want to",
  ];

  for (const reply of incompleteReplies) {
    assert.equal(isProbablyIncompleteCustomerReply(reply), true, reply);
  }
});

test("complete short helpful reply still passes", () => {
  assert.equal(isProbablyIncompleteCustomerReply("Sure, I can help."), false);
  assert.equal(isProbablyIncompleteCustomerReply("Yes, it is available."), false);
});

test("partial order summaries are blocked by order-summary detector", () => {
  assert.equal(isIncompleteOrderSummaryReply("Order details:\nBike cover: Large"), true);
});

test("customer-visible voice/tool metadata is blocked", () => {
  assert.equal(isCustomerVisibleToolMetaText("[Voice Note]: I've sent you a voice note."), true);
  assert.equal(isCustomerVisibleToolMetaText("[Voice Note]"), true);
  assert.equal(isCustomerVisibleToolMetaText("tool result: voice sent"), true);
  assert.equal(isCustomerVisibleToolMetaText("I've sent you a voice note."), true);
  assert.equal(isCustomerVisibleToolMetaText("Sure, I can explain the product details."), false);
});

test("sanitizer preserves safe single-star WhatsApp bold", () => {
  assert.equal(sanitizeCustomerFacingReply("Please *Create an account* today."), "Please *Create an account* today.");
});

test("sanitizer removes double-star bold markers", () => {
  assert.equal(sanitizeCustomerFacingReply("Please **Create an account** today."), "Please Create an account today.");
});

test("sanitizer removes underscore italic and bold markers", () => {
  assert.equal(sanitizeCustomerFacingReply("Please _scan your QR code_ now."), "Please scan your QR code now.");
  assert.equal(sanitizeCustomerFacingReply("Please __add your business details__ now."), "Please add your business details now.");
});

test("sanitizer keeps numbered list formatting", () => {
  const text = sanitizeCustomerFacingReply([
    "1. *Create an account* on blackarrow-source.offline.invalid",
    "2. *Scan your WhatsApp QR code*",
    "3. *Add your business details*",
  ].join("\n"));

  assert.match(text, /1\. \*Create an account on blackarrow\.com\*/);
  assert.match(text, /2\. \*Scan your WhatsApp QR code\*/);
  assert.match(text, /3\. \*Add your business details\*/);
});

test("sanitizer keeps URLs intact", () => {
  const text = sanitizeCustomerFacingReply("Open **https://blackarrow-source.offline.invalid/signup?ref=wa_bot** to continue.");

  assert.equal(text, "Open https://blackarrow-source.offline.invalid/signup?ref=wa_bot to continue.");
});

test("final outgoing text keeps only WhatsApp-safe single-star list emphasis", () => {
  const prepared = prepareOutgoingWhatsAppText([
    "1. *Create an account* on blackarrow-source.offline.invalid",
    "2. **Scan your WhatsApp QR code**",
    "3. _Add your business details_",
  ].join("\n"));

  assert.match(prepared.text, /1\. \*Create an account on blackarrow\.com\*/);
  assert.doesNotMatch(prepared.text, /\*\*[^*\n]+\*\*/);
  assert.doesNotMatch(prepared.text, /_[^_\n]+_/);
});

test("markdown wrapper stripper keeps non-wrapper asterisks", () => {
  assert.equal(stripMarkdownTextWrappers("SKU A*B stays, but *wrapped text* is cleaned."), "SKU A*B stays, but wrapped text is cleaned.");
});

test("final reply cleaner removes excessive line breaks", () => {
  const text = sanitizeCustomerFacingReply("Thanks, Ahad.\n\nI can help you book an appointment\nwith Dr.\n\nIhsan Karim for physiotherapy.\n\nCould you please share your preferred\ndate and time for the appointment?");
  assert.equal(
    text,
    "Thanks, Ahad.\n\nI can help you book an appointment with Dr. Ihsan Karim for physiotherapy.\n\nCould you please share your preferred date and time for the appointment?"
  );
});

test("final reply cleaner does not break after every full stop", () => {
  const text = sanitizeCustomerFacingReply("This looks like a premium restaurant-style logo with golden Urdu calligraphy. It is suitable for a food, catering, or restaurant brand.");
  assert.doesNotMatch(text, /calligraphy\.\nIt is suitable/);
  assert.match(text, /calligraphy\.\n\nIt is suitable|calligraphy\. It is suitable/);
});

test("final reply cleaner keeps names and business entities on the same line where possible", () => {
  const text = sanitizeCustomerFacingReply("Thanks, Ahad.\n\nI can help you book an appointment\nwith Dr.\n\nIhsan Karim for Bari Engineering physiotherapy service.");
  assert.match(text, /with Dr\. Ihsan Karim for Bari Engineering physiotherapy service\./);
  assert.doesNotMatch(text, /Dr\.\n/);
  assert.doesNotMatch(text, /Bari Engineering\n/);
});

test("final reply cleaner keeps WhatsApp-safe bold labels", () => {
  const text = formatWhatsappReply("Here are the details:\n\n*Name:* Customer Name\n*Date:* July 1\n*Time:* 12 PM");
  assert.equal(text, "Here are the details:\n\n*Name:* Customer Name\n*Date:* July 1\n*Time:* 12 PM");
});

test("final reply cleaner expands safe shortcut words", () => {
  const text = sanitizeCustomerFacingReply("pls share ur appt with doc asap by msg");
  assert.equal(text, "please share your appointment with doctor as soon as possible by message");
});

test("formatWhatsappReply preserves emojis, bullets, and blank lines", () => {
  const text = formatWhatsappReply("Sure 😊\n\n• *Starter* - $9/mo\n✅ *Growth* - $29/mo\n⭐ *Pro* - $89/mo\n\n*CTA:* Want to test it?");
  assert.match(text, /^Sure 😊/);
  assert.match(text, /• \*Starter\* - \$9\/mo/);
  assert.match(text, /✅ \*Growth\* - \$29\/mo/);
  assert.match(text, /⭐ \*Pro\* - \$89\/mo/);
  assert.match(text, /\n\n\*CTA:\* Want to test it\?/);
});

test("formatWhatsappReply strips markdown tables, HTML, code fences, and headings", () => {
  const text = formatWhatsappReply("# Plans\n<table><tr><td>Starter</td></tr></table>\n| Plan | Price |\n| --- | --- |\n```html\n<div>ignore</div>\n```\nStarter - $9/mo");
  assert.match(text, /Plans/);
  assert.match(text, /\*Starter\* - \$9\/mo/);
  assert.doesNotMatch(text, /<table|<div|```|\| Plan |# /);
});

test("plan comparison reply stays readable with separate sections", () => {
  const text = sanitizeCustomerFacingReply("Sure 😊 Here are the plans: Starter - $9/mo Best for small businesses. Growth - $29/mo Adds CRM and automation. Pro - $89/mo Full access and priority support. Do you want to test it on WhatsApp?");
  assert.match(text, /^Sure 😊/);
  assert.match(text, /\n\n\*Starter\* - \$9\/mo/);
  assert.match(text, /\n\n\*Growth\* - \$29\/mo/);
  assert.match(text, /\n\n\*Pro\* - \$89\/mo/);
  assert.match(text, /Do you want to test it on WhatsApp\?/);
});

test("simple helpful reply stays simple", () => {
  const text = sanitizeCustomerFacingReply("Yes, we can help 😊 Please share what you need.");
  assert.equal(text, "Yes, we can help 😊 Please share what you need.");
});

test("short response plan keeps replies concise without changing the chosen answer", () => {
  const text = sanitizeCustomerFacingReply(
    "Sure 😊 Here are the plans: Starter - $9/mo Best for small businesses. Growth - $29/mo Adds CRM, tasks, broadcasts, and staff assignment. Pro - $89/mo Full access with API connectors and priority support. For your current setup, *Starter plan is best* 😊 You can upgrade later when your volume grows. Do you want to test it on your WhatsApp?",
    {
      responsePlan: {
        intent: "recommendation",
        answerDepth: "short",
        replyShape: "direct_answer",
        shouldRecommendOne: true,
        shouldListAllOptions: false,
        shouldAskFollowup: false,
        avoidRepeatingPreviousDetails: true,
        allowedTopics: ["best-fit recommendation"],
        avoidTopics: ["full comparison", "old unrelated context"],
        maxChars: 450,
        maxBullets: 3,
        maxSections: 2,
        formatStyle: "whatsapp_direct",
        emojiStyle: "light",
        scope: "recommendation_focus",
      },
    }
  );
  assert.match(text, /Starter/i);
  assert.ok(text.length <= 450, text);
});

test("short response plan limits line count", () => {
  const text = sanitizeCustomerFacingReply(
    "For your current setup, *Starter plan is best* 😊\n\n*Starter* - $9/mo\nIt is enough for 30 customers.\nIt includes basic AI replies and lead collection.\nYou can upgrade later when your volume grows.\nDo you want to test it on your WhatsApp?",
    {
      responsePlan: {
        intent: "recommendation",
        answerDepth: "short",
        replyShape: "direct_answer",
        shouldRecommendOne: true,
        shouldListAllOptions: false,
        shouldAskFollowup: false,
        avoidRepeatingPreviousDetails: true,
        allowedTopics: ["best-fit recommendation"],
        avoidTopics: ["full comparison", "old unrelated context"],
        maxChars: 450,
        maxBullets: 3,
        maxSections: 2,
        formatStyle: "whatsapp_direct",
        emojiStyle: "light",
        scope: "recommendation_focus",
      },
    }
  );
  assert.match(text, /^For your current setup, \*Starter plan is best\*/i);
  assert.ok(text.split("\n").filter((line) => line.trim()).length <= 6, text);
  assert.ok(text.length <= 450, text);
});

test("detailed response plan can keep the full formatted list", () => {
  const text = sanitizeCustomerFacingReply(
    "Here are the plans: Starter - $9/mo Best for small businesses. Growth - $29/mo Adds CRM and automation. Pro - $89/mo Full access and priority support.",
    {
      responsePlan: {
        intent: "details",
        answerDepth: "detailed",
        replyShape: "bullet_list",
        shouldRecommendOne: false,
        shouldListAllOptions: true,
        shouldAskFollowup: false,
        avoidRepeatingPreviousDetails: false,
        allowedTopics: ["requested details"],
        avoidTopics: ["old unrelated context"],
        maxChars: 1200,
        maxBullets: 6,
        maxSections: 4,
        formatStyle: "whatsapp_list",
        emojiStyle: "light",
        scope: "full_details",
      },
    }
  );
  assert.match(text, /Starter/i);
  assert.match(text, /Growth/i);
  assert.match(text, /Pro/i);
});

test("comparison response plan can still allow a short comparison", () => {
  const text = sanitizeCustomerFacingReply(
    "*Starter* = basic AI replies + leads.\n*Growth* = CRM, tasks, broadcasts, staff assignment.\n*Pro* = higher limits, API/connectors, priority support.\n\nFor your current volume, *Starter is enough* 😊",
    {
      responsePlan: {
        intent: "comparison",
        answerDepth: "short",
        replyShape: "comparison",
        shouldRecommendOne: true,
        shouldListAllOptions: false,
        shouldAskFollowup: false,
        avoidRepeatingPreviousDetails: false,
        allowedTopics: ["short comparison"],
        avoidTopics: ["full details", "old unrelated context"],
        maxChars: 550,
        maxBullets: 4,
        maxSections: 3,
        formatStyle: "whatsapp_comparison",
        emojiStyle: "light",
        scope: "comparison_focus",
      },
    }
  );
  assert.match(text, /\*Starter\* =/);
  assert.match(text, /\*Growth\* =/);
  assert.match(text, /\*Pro\* =/);
});

test("setup response plan trims unrelated plan and pricing paragraphs", () => {
  const text = sanitizeCustomerFacingReply(
    "Here are the plans: Starter - $9/mo. Growth - $29/mo. Pro - $89/mo.\n\nSure 😊\n\n*Setup is simple:*\n1. Create your account\n2. Scan the WhatsApp QR\n3. Add business details and training\n4. Bot starts replying automatically\n\nNo coding needed.\n\nDo you want to start today?",
    {
      responsePlan: {
        intent: "setup",
        answerDepth: "short",
        replyShape: "steps",
        shouldRecommendOne: false,
        shouldListAllOptions: false,
        shouldAskFollowup: true,
        avoidRepeatingPreviousDetails: true,
        allowedTopics: ["setup/process steps"],
        avoidTopics: ["full pricing", "full comparison", "full catalog", "old unrelated context"],
        maxChars: 450,
        maxBullets: 4,
        maxSections: 2,
        formatStyle: "whatsapp_steps",
        emojiStyle: "light",
        scope: "setup_process",
      },
    }
  );
  assert.match(text, /Setup is simple/i);
  assert.match(text, /1\. \*Create your account\*/);
  assert.doesNotMatch(text, /\$9\/mo|\$29\/mo|\$89\/mo/);
  assert.ok(text.length <= 450, text);
});

test("final reply cleaner does not hardcode example wording into unrelated businesses", () => {
  const text = sanitizeCustomerFacingReply("Your AC service request is received. Please confirm the site location so our technician can proceed.");
  assert.match(text, /AC service request/i);
  assert.match(text, /site location/i);
  assert.doesNotMatch(text, /\b(appointment|doctor|restaurant|blackarrow)\b/i);
});

test("final reply cleaner preserves the selected account business type, tone, instructions, and flow", () => {
  const text = sanitizeCustomerFacingReply("Please share the tractor model and farm location so our fertilizer team can recommend the right product.");
  assert.match(text, /tractor model/i);
  assert.match(text, /farm location/i);
  assert.match(text, /fertilizer team/i);
  assert.match(text, /right product/i);
});

test("3+ item list is formatted with line breaks and bold item names", () => {
  const text = sanitizeCustomerFacingReply("Here are the available options: 1. Dr\nAhmad Ammar Asif - Cardiologist 2. Dr\nSara Khan - Dermatologist 3. Dr\nUsman Ali - ENT Specialist");
  assert.match(text, /Here are the available options:/);
  assert.match(text, /1\. \*Dr\. Ahmad Ammar Asif\*/);
  assert.match(text, /2\. \*Dr\. Sara Khan\*/);
  assert.match(text, /3\. \*Dr\. Usman Ali\*/);
  assert.match(text, /\n\n2\. \*/);
});

test("numbered list is not compressed into one paragraph", () => {
  const text = sanitizeCustomerFacingReply("Available services: 1. Skin consultation - 20 minutes 2. Hair consultation - 15 minutes 3. Laser guidance - 10 minutes");
  assert.match(text, /1\. \*Skin consultation\*/);
  assert.match(text, /2\. \*Hair consultation\*/);
  assert.match(text, /3\. \*Laser guidance\*/);
  assert.doesNotMatch(text, /1\.[^\n]+2\./);
});

test("formatted list prevents isolated title-only lines", () => {
  const text = sanitizeCustomerFacingReply("Yeh available options hain:\n1. Dr\nAreeba Noor\n2. Dr\nHamza Ali\n3. Dr\nSana Tariq");
  assert.doesNotMatch(text, /\nDr\.?\n/);
  assert.match(text, /1\. \*Dr\. Areeba Noor\*/);
  assert.match(text, /2\. \*Dr\. Hamza Ali\*/);
  assert.match(text, /3\. \*Dr\. Sana Tariq\*/);
});

test("long list uses readable WhatsApp spacing", () => {
  const text = sanitizeCustomerFacingReply("Available options: 1. Basic package - setup support 2. Standard package - setup plus training 3. Premium package - priority support 4. Enterprise package - custom workflow");
  assert.match(text, /\n\n2\. \*/);
  assert.match(text, /\n\n3\. \*/);
  assert.match(text, /\n\n4\. \*/);
});

test("list reply can keep a professional emoji heading", () => {
  const text = sanitizeCustomerFacingReply("📋 Available options: 1. Starter package - 100 leads 2. Growth package - 300 leads 3. Scale package - custom support");
  assert.match(text, /^📋 Available options:/);
  assert.match(text, /1\. \*Starter package\*/);
});

test("Roman Urdu list formatting is clean", () => {
  const text = sanitizeCustomerFacingReply("Yeh available options hain: 1. Skin consultation - 20 minute 2. Dental checkup - 30 minute 3. Eye exam - 15 minute\n\nAap kis option ke baare mein detail chahte hain?");
  assert.match(text, /Yeh available options hain:/);
  assert.match(text, /1\. \*Skin consultation\*/);
  assert.match(text, /Aap kis option ke baare mein detail chahte hain\?/);
});

test("English list formatting is clean", () => {
  const text = sanitizeCustomerFacingReply("Here are the available options: 1. Accounting service - monthly support 2. Tax filing - annual support 3. Payroll setup - team onboarding\n\nWhich option would you like to know more about?");
  assert.match(text, /Here are the available options:/);
  assert.match(text, /1\. \*Accounting service\*/);
  assert.match(text, /Which option would you like to know more about\?/);
});

test("reply sanitizer keeps only one clean conversation stage", () => {
  const text = sanitizeCustomerFacingReply("Please share the patient's gender.\n\nYour appointment details are:\nName: Safdar Ali\nDate: July 1\n\nPlease confirm if everything is correct.");
  assert.match(text, /patient's gender/i);
  assert.doesNotMatch(text, /Your appointment details are:/i);
  assert.doesNotMatch(text, /Please confirm if everything is correct/i);
});
