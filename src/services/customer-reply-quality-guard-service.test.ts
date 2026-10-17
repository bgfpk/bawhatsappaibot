import test from "node:test";
import assert from "node:assert/strict";

import {
  buildGuardRepairInstruction,
  canUseOriginalServiceBusinessReplyAfterGuardFailure,
  buildCrmFirstPromptContext,
  buildDeterministicServiceReply,
  extractKnownCustomerFacts,
  findMatchingCrmLead,
  getBusinessVocabulary,
  guardCustomerReply,
  isAskingForCustomerNameAgain,
  isAskingForCustomerPhoneAgain,
  stripDuplicateKnownPhoneQuestionFromReply,
} from "./customer-reply-quality-guard-service.ts";

const appointmentFacts = extractKnownCustomerFacts({
  businessType: "clinic appointment",
  customerJid: "contact-e4ed32210a80@example.invalid",
  profile: { customerPhone: "195545134641" },
  activeRecord: {
    serviceName: "Doctor visit",
    customerPhone: "195545134641",
    customFields: {
      "Appointment Date": "23 June",
      "Appointment Time": "2:00 PM to 3:00 PM",
      City: "Lahore",
    },
  },
});

test("appointment date and time known prevents asking again after short confirmation", () => {
  const reply = buildDeterministicServiceReply({
    facts: appointmentFacts,
    latestText: "G",
    businessType: "clinic",
  });

  assert.match(reply, /23 June/);
  assert.match(reply, /2:00 PM to 3:00 PM/);
  assert.doesNotMatch(reply, /which date|prefer/i);
});

test("already confirmed complaint apologizes and uses CRM appointment fields", () => {
  const reply = buildDeterministicServiceReply({
    facts: appointmentFacts,
    latestText: "Time or date confirm kar to diya ha my ny",
    businessType: "clinic",
  });

  assert.match(reply, /sorry/i);
  assert.match(reply, /23 June/);
  assert.match(reply, /2:00 PM to 3:00 PM/);
});

test("service business guard blocks product/catalog/delivery fallback", () => {
  const result = guardCustomerReply({
    replyText: "Aapko product, catalog ya delivery ke bare mein help chahiye?",
    latestUserText: "G",
    facts: appointmentFacts,
    businessType: "service",
  });

  assert.equal(result.blocked, true);
  assert.equal(result.reason, "service_business_product_wording");
  assert.doesNotMatch(result.replyText, /catalog|delivery/i);
});

test("service-like marketing business can reply about customer-provided product marketing context", () => {
  const facts = extractKnownCustomerFacts({
    businessType: "marketing agency",
    customerJid: "contact-e4ed32210a80@example.invalid",
    profile: { customerPhone: "195545134641" },
  });
  const result = guardCustomerReply({
    replyText: "This product can be marketed around its visible benefits and packaging clarity.",
    latestUserText: "Please check this product I also have this to market",
    facts,
    businessType: "marketing agency",
    latestMediaKind: "image",
    latestMediaContextUseful: true,
  });

  assert.equal(result.blocked, false);
});

test("service business reply mentioning product service package and plan is allowed for automation questions", () => {
  const facts = extractKnownCustomerFacts({
    businessType: "whatsapp automation service",
    customerJid: "contact-e4ed32210a80@example.invalid",
    profile: { customerPhone: "195545134641" },
  });
  facts.businessTrainingText = "We offer WhatsApp automation service packages, product explanation flows, and support plans for businesses.";
  const replyText = "Our WhatsApp automation product includes service packages and support plans for customer replies.";
  const result = guardCustomerReply({
    replyText,
    latestUserText: "What services and automation plans do you offer for WhatsApp business replies?",
    facts,
    businessType: "whatsapp automation service",
  });

  assert.equal(result.blocked, false);
  assert.equal(canUseOriginalServiceBusinessReplyAfterGuardFailure({
    replyText,
    latestUserText: "What services and automation plans do you offer for WhatsApp business replies?",
    facts,
    businessType: "whatsapp automation service",
  }), true);
});

test("useful latest image context allows product or package wording for service-like marketing help", () => {
  const facts = extractKnownCustomerFacts({
    businessType: "lead generation service",
    customerJid: "contact-e4ed32210a80@example.invalid",
    profile: { customerPhone: "195545134641" },
  });
  const result = guardCustomerReply({
    replyText: "The product package is clear, so you can market it by highlighting the label and benefits.",
    latestUserText: "Can you help me market this product?",
    facts,
    businessType: "lead generation service",
    latestMediaKind: "image",
    latestMediaContextUseful: true,
  });

  assert.equal(result.blocked, false);
});

test("voice request plus remembered product question is allowed to answer the product first", () => {
  const facts = extractKnownCustomerFacts({
    businessType: "service support",
    customerJid: "contact-e4ed32210a80@example.invalid",
    profile: {
      customerPhone: "195545134641",
      latestProductName: "SlimSip",
    },
  });
  const result = guardCustomerReply({
    replyText: "Yes, I remember SlimSip. BlackArrow can help with this product on WhatsApp by understanding the product image and answering customer questions.",
    latestUserText: "Tell me in voice message, do you remember SlimSip?",
    facts,
    businessType: "service support",
    rememberedMediaContextUseful: true,
  });

  assert.equal(result.blocked, false);
});

test("remembered product context still blocks invented COD or courier promises", () => {
  const facts = extractKnownCustomerFacts({
    businessType: "service support",
    customerJid: "contact-e4ed32210a80@example.invalid",
    profile: {
      customerPhone: "195545134641",
      latestProductName: "SlimSip",
    },
  });
  const result = guardCustomerReply({
    replyText: "Yes, I remember SlimSip, and you can offer COD courier delivery nationwide.",
    latestUserText: "Tell me in voice message, do you remember SlimSip?",
    facts,
    businessType: "service support",
    rememberedMediaContextUseful: true,
  });

  assert.equal(result.blocked, true);
  assert.equal(result.reason, "service_business_product_wording");
});

test('"Check this out" plus useful image context does not trigger service_business_product_wording', () => {
  const facts = extractKnownCustomerFacts({
    businessType: "service support",
    customerJid: "contact-e4ed32210a80@example.invalid",
    profile: { customerPhone: "195545134641" },
  });
  const result = guardCustomerReply({
    replyText: "This product label is clear, and the packaging highlights the main ingredients and benefits well.",
    latestUserText: "Check this out",
    facts,
    businessType: "service support",
    latestMediaKind: "image",
    latestMediaContextUseful: true,
  });

  assert.equal(result.blocked, false);
});

test("exact bad business/product fallback is blocked when active CRM fields exist", () => {
  const result = guardCustomerReply({
    replyText: "Maazrat, main sirf business/product related help kar sakta hun. Product, price ya delivery ke bare mein help chahiye ho to bata dein.",
    latestUserText: "Time or date confirm kar to diya ha my ny",
    facts: appointmentFacts,
    businessType: "clinic",
  });

  assert.equal(result.blocked, true);
  assert.equal(result.reason, "generic_product_fallback_not_contextual");
  assert.doesNotMatch(result.replyText, /business\/product|product, price|delivery/i);
});

test("product business still allows product wording", () => {
  const facts = extractKnownCustomerFacts({ businessType: "ecommerce", profile: { customerPhone: "92300" } });
  const result = guardCustomerReply({
    replyText: "Which product or delivery detail do you need?",
    latestUserText: "Need help",
    facts,
    businessType: "ecommerce",
  });

  assert.equal(result.blocked, false);
});

test("latest customer text cannot be echoed as bot reply", () => {
  const result = guardCustomerReply({
    replyText: "Time or date confirm kar to diya ha my ny",
    latestUserText: "Time or date confirm kar to diya ha my ny",
    facts: appointmentFacts,
    businessType: "clinic",
  });

  assert.equal(result.blocked, true);
  assert.equal(result.reason, "echo_latest_customer_message");
});

test("known fields block duplicate question patterns", () => {
  const result = guardCustomerReply({
    replyText: "Which date and time would you prefer for appointment?",
    latestUserText: "ok",
    facts: appointmentFacts,
    businessType: "clinic",
  });

  assert.equal(result.blocked, true);
  assert.equal(result.reason, "duplicate_appointment_question");
  assert.equal(result.replyText, "");
});

test("duplicate phone question is blocked for AI repair without fixed fallback send", () => {
  const facts = extractKnownCustomerFacts({
    businessType: "services",
    customerJid: "contact-e4ed32210a80@example.invalid",
    profile: { customerPhone: "195545134641" },
  });
  const result = guardCustomerReply({
    replyText: "Please share your WhatsApp phone number?",
    latestUserText: "What is the setup cost?",
    facts,
    businessType: "services",
  });

  assert.equal(result.blocked, true);
  assert.equal(result.reason, "duplicate_phone_question");
  assert.equal(result.replyText, "");
});

test("duplicate phone cleanup keeps the useful answer and strips only the phone ask", () => {
  const reply = "Our setup cost depends on your selected plan and monthly volume. Please share your WhatsApp phone number so I can proceed.";
  const cleaned = stripDuplicateKnownPhoneQuestionFromReply(reply);

  assert.equal(cleaned, "Our setup cost depends on your selected plan and monthly volume.");
  assert.equal(isAskingForCustomerPhoneAgain(cleaned), false);
});

test("duplicate phone cleanup returns empty when the reply is only a phone request", () => {
  const cleaned = stripDuplicateKnownPhoneQuestionFromReply("Please share your WhatsApp phone number so I can proceed.");

  assert.equal(cleaned, "");
});

test("guard blocks supported-answer mistakes without replacing them with team fallback text", () => {
  const result = guardCustomerReply({
    replyText: "This needs confirmation from the team.",
    latestUserText: "What are your services?",
    facts: extractKnownCustomerFacts({
      businessType: "services",
      profile: {},
    }),
    businessType: "services",
  });

  assert.equal(result.blocked, true);
  assert.equal(result.replyText, "");
});

test("phone question is allowed when contact number is truly missing", () => {
  const facts = {
    ...extractKnownCustomerFacts({
      businessType: "services",
      customerJid: "",
      profile: {},
    }),
    phone: "",
    customerPhone: "",
  };
  const result = guardCustomerReply({
    replyText: "Please share your WhatsApp phone number so I can proceed.",
    latestUserText: "How do I continue?",
    facts,
    businessType: "services",
  });

  assert.equal(result.blocked, false);
});

test("strict service account still blocks invented COD or courier flow without customer product marketing context", () => {
  const facts = extractKnownCustomerFacts({
    businessType: "clinic service",
    customerJid: "contact-e4ed32210a80@example.invalid",
    profile: { customerPhone: "195545134641" },
  });
  const result = guardCustomerReply({
    replyText: "Aap COD aur courier delivery ke sath order place kar sakte hain.",
    latestUserText: "Need help",
    facts,
    businessType: "clinic service",
  });

  assert.equal(result.blocked, true);
  assert.equal(result.reason, "service_business_product_wording");
});

test("useful image context still blocks invented COD or courier promises when customer did not ask fulfillment", () => {
  const facts = extractKnownCustomerFacts({
    businessType: "marketing service",
    customerJid: "contact-e4ed32210a80@example.invalid",
    profile: { customerPhone: "195545134641" },
  });
  const result = guardCustomerReply({
    replyText: "This product looks strong, and you can offer COD courier delivery nationwide.",
    latestUserText: "Check this out",
    facts,
    businessType: "marketing service",
    latestMediaKind: "image",
    latestMediaContextUseful: true,
  });

  assert.equal(result.blocked, true);
  assert.equal(result.reason, "service_business_product_wording");
  assert.equal(canUseOriginalServiceBusinessReplyAfterGuardFailure({
    replyText: "This product looks strong, and you can offer COD courier delivery nationwide.",
    latestUserText: "Check this out",
    facts,
    businessType: "marketing service",
    latestMediaKind: "image",
    latestMediaContextUseful: true,
  }), false);
});

test("duplicate phone guard repair instruction answers directly without asking phone again", () => {
  const instruction = buildGuardRepairInstruction("duplicate_phone_question");

  assert.match(instruction, /Do not ask for phone/i);
  assert.match(instruction, /Answer the customer's latest question directly/i);
});

test("duplicate name helper blocks only requests for customer's name", () => {
  assert.equal(isAskingForCustomerNameAgain("What is your name?"), true);
  assert.equal(isAskingForCustomerNameAgain("Please share your name."), true);
  assert.equal(isAskingForCustomerNameAgain("Apna naam bata dein."), true);
  assert.equal(isAskingForCustomerNameAgain("May I know your name?"), true);

  assert.equal(isAskingForCustomerNameAgain("I am BlackArrow."), false);
  assert.equal(isAskingForCustomerNameAgain("Thanks, Chaudhry Salman Akhtar."), false);
  assert.equal(isAskingForCustomerNameAgain("Ghousia Estate & Marketing is a property marketing company."), false);
  assert.equal(isAskingForCustomerNameAgain("How can I help with your property marketing?"), false);
});

test("duplicate name guard allows bot name and business-card name usage", () => {
  const facts = extractKnownCustomerFacts({
    businessType: "real estate marketing",
    customerJid: "contact-e4ed32210a80@example.invalid",
    profile: {
      customerName: "Chaudhry Salman Akhtar",
      companyName: "Ghousia Estate & Marketing",
      customerPhone: "195545134641",
    },
  });

  assert.equal(guardCustomerReply({ replyText: "I am BlackArrow, your WhatsApp assistant.", latestUserText: "Your name pls", facts, businessType: "real estate marketing" }).blocked, false);
  assert.equal(guardCustomerReply({ replyText: "Thanks, Chaudhry Salman Akhtar. Ghousia Estate & Marketing looks like a property marketing company.", latestUserText: "May I know your name pls", facts, businessType: "real estate marketing" }).blocked, false);
  const blocked = guardCustomerReply({ replyText: "May I know your name?", latestUserText: "Waiting your reply", facts, businessType: "real estate marketing" });
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.reason, "duplicate_name_question");
});

test("duplicate phone helper blocks only requests for customer's phone", () => {
  assert.equal(isAskingForCustomerPhoneAgain("Please share your phone number."), true);
  assert.equal(isAskingForCustomerPhoneAgain("Can you send your WhatsApp number?"), true);
  assert.equal(isAskingForCustomerPhoneAgain("What is your mobile number?"), true);
  assert.equal(isAskingForCustomerPhoneAgain("Apna phone number share kar dein."), true);

  assert.equal(isAskingForCustomerPhoneAgain("BlackArrow automates WhatsApp replies."), false);
  assert.equal(isAskingForCustomerPhoneAgain("Starter package is PKR 2,500/month."), false);
  assert.equal(isAskingForCustomerPhoneAgain("How many WhatsApp messages do you receive daily?"), false);
  assert.equal(isAskingForCustomerPhoneAgain("You can connect your WhatsApp number with the bot."), false);
  assert.equal(isAskingForCustomerPhoneAgain("Message limit depends on your package."), false);
  assert.equal(isAskingForCustomerPhoneAgain("Our AI can collect order details."), false);
});

test("duplicate phone guard allows WhatsApp/package/number wording when not asking for phone", () => {
  const facts = extractKnownCustomerFacts({
    businessType: "services",
    customerJid: "contact-e4ed32210a80@example.invalid",
    profile: { customerPhone: "195545134641" },
  });

  const allowedReplies = [
    "BlackArrow automates WhatsApp replies for your business.",
    "Starter package is PKR 2,500/month.",
    "How many WhatsApp messages do you receive daily?",
    "You can connect your WhatsApp number with the bot.",
    "Message limit depends on your package.",
    "Our AI can collect order details.",
  ];

  for (const replyText of allowedReplies) {
    assert.equal(guardCustomerReply({ replyText, latestUserText: "Waiting your reply", facts, businessType: "services" }).blocked, false, replyText);
  }
});

test("good answer to customer question is not replaced by noted fallback", () => {
  const result = guardCustomerReply({
    replyText: "Ji, appointment 23 June ko 2:00 PM to 3:00 PM ke darmiyan hai. Aap confirm rakhna chahte hain ya time change karna hai?",
    latestUserText: "mera time kab hai?",
    facts: appointmentFacts,
    businessType: "clinic",
  });

  assert.equal(result.blocked, false);
  assert.doesNotMatch(result.replyText, /details noted|details note|requirement bata/i);
});

test("duplicate custom field fallback is specific instead of generic", () => {
  const facts = extractKnownCustomerFacts({
    businessType: "service",
    activeRecord: {
      serviceName: "School messaging",
      customFields: {
        "Students Count": "250",
        Location: "Lahore",
      },
    },
  });
  const result = guardCustomerReply({
    replyText: "Please share Students Count?",
    latestUserText: "students already bata diye",
    facts,
    businessType: "school",
  });

  assert.equal(result.blocked, true);
  assert.equal(result.reason, "duplicate_custom_field_question");
  assert.equal(result.replyText, "");
});

test("voice output preference message is not treated like a duplicate field or interest issue by itself", () => {
  const facts = extractKnownCustomerFacts({
    businessType: "services",
    customerJid: "contact-e4ed32210a80@example.invalid",
    profile: { customerPhone: "195545134641" },
    activeRecord: {
      serviceName: "School messaging",
      customFields: {
        Location: "Lahore",
        "Students Count": "250",
      },
    },
  });

  const result = guardCustomerReply({
    replyText: "I can help with that. Here are the details we already have on record.",
    latestUserText: "reply in voice message",
    facts,
    businessType: "services",
  });

  assert.equal(result.blocked, false);
});

test("CRM lead matching uses JID or phone", () => {
  const match = findMatchingCrmLead([
    { id: "lead_1", customerJid: "contact-e4ed32210a80@example.invalid", phone: "195545134641" },
  ], { customerJid: "contact-e4ed32210a80@example.invalid" });

  assert.equal(match?.id, "lead_1");
});

test("CRM-first prompt context is marked source of truth and answer-first", () => {
  const context = buildCrmFirstPromptContext(appointmentFacts);
  assert.match(context, /source of truth/i);
  assert.match(context, /phone\/whatsapp number is already known/i);
  assert.match(context, /latest direct question first/i);
  assert.match(context, /Known CRM\/customer data/i);
  assert.match(context, /Known custom lead\/order fields/i);
  assert.match(context, /appointmentDate/);
  assert.match(context, /23 June/);
});

test("business vocabulary maps clinic support and property marketing to service wording", () => {
  assert.equal(getBusinessVocabulary("clinic booking").flow, "service");
  assert.equal(getBusinessVocabulary("customer support").serviceLike, true);
  assert.equal(getBusinessVocabulary("real estate property marketing").serviceLike, true);
  assert.equal(getBusinessVocabulary("fashion ecommerce").flow, "product");
});

import { hasInventedPricing } from "./customer-reply-quality-guard-service.ts";

test("hasInventedPricing blocks invented price when not in training", () => {
  assert.equal(hasInventedPricing("The price is $500", "Our standard cost is $200."), true);
  assert.equal(hasInventedPricing("Fee is PKR 8,500", "Service charges are PKR 5,000."), true);
});

test("hasInventedPricing allows valid price from training", () => {
  assert.equal(hasInventedPricing("The price is $500", "We charge $500 for the service."), false);
  assert.equal(hasInventedPricing("Fee is PKR 8,500", "Our fee is PKR 8,500."), false);
  assert.equal(hasInventedPricing("Cost is 500", "Item 1 is $500."), false);
});

test("hasInventedPricing allows calculated values if calculation terms are present in training", () => {
  assert.equal(hasInventedPricing("The discounted price is $450", "The base price is $500, and you get a 10% discount."), false);
  assert.equal(hasInventedPricing("Total is $600", "Cost is $500 plus tax."), false);
});

test("hasInventedPricing ignores small numbers/quantities unless labelled as cost", () => {
  assert.equal(hasInventedPricing("We will deliver 2 items", "Delivery in 2 days."), false);
  assert.equal(hasInventedPricing("Cost is 5", "No pricing available."), true);
});
