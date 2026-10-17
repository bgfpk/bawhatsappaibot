import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCustomerResponseStrategyInstruction,
  planCustomerResponse,
} from "./customer-response-planner-service.ts";

test("SaaS recommendation uses one short recommendation instead of full comparison", () => {
  const plan = planCustomerResponse({
    latestCustomerMessage: "I'm confused between these options. What should I choose for my current setup?",
    previousBotMessage: "Here are the plans:\n\n*Starter* - basic AI replies\n*Growth* - CRM and broadcasts\n*Pro* - API and priority support",
    businessType: "saas marketing automation",
    availableBusinessKnowledge: "There are multiple plans with different limits and automation features.",
    knownCustomerFacts: { quantity: "30 customers", preferences: "basic automation" },
  });

  assert.equal(plan.intent, "recommendation");
  assert.equal(plan.answerDepth, "short");
  assert.equal(plan.replyShape, "direct_answer");
  assert.equal(plan.shouldRecommendOne, true);
  assert.equal(plan.shouldListAllOptions, false);
  assert.equal(plan.avoidRepeatingPreviousDetails, true);
  assert.equal(plan.maxChars, 450);
  assert.equal(plan.scope, "recommendation_focus");
});

test("E-commerce beginner question still maps to recommendation without full catalog", () => {
  const plan = planCustomerResponse({
    latestCustomerMessage: "Which product is better for a beginner?",
    previousBotMessage: "Available options:\n1. Starter kit\n2. Advanced kit\n3. Pro kit",
    businessType: "ecommerce store",
    availableBusinessKnowledge: "The business sells beginner and advanced product bundles.",
    knownCustomerFacts: { productOrService: "starter kit", budget: "entry level" },
  });

  assert.equal(plan.intent, "recommendation");
  assert.equal(plan.shouldRecommendOne, true);
  assert.equal(plan.shouldListAllOptions, false);
  assert.equal(plan.replyShape, "direct_answer");
});

test("Clinic recommendation can ask one clarifying question when context is thin", () => {
  const plan = planCustomerResponse({
    latestCustomerMessage: "Which service is suitable?",
    businessType: "clinic services",
    availableBusinessKnowledge: "Clinic offers consultation and treatment services.",
    knownCustomerFacts: { businessFlow: "service" },
  });

  assert.equal(plan.intent, "recommendation");
  assert.equal(plan.replyShape, "clarifying_question");
  assert.equal(plan.shouldAskFollowup, true);
  assert.equal(plan.shouldRecommendOne, false);
});

test("Education recommendation can recommend one course when enough learner context exists", () => {
  const plan = planCustomerResponse({
    latestCustomerMessage: "Which course should I start with?",
    businessType: "academy course training",
    previousBotMessage: "We have Beginner English, Intermediate English, and IELTS preparation.",
    availableBusinessKnowledge: "Beginner English is for new learners. Intermediate English needs prior fluency.",
    knownCustomerFacts: { preferences: "beginner", recentConversationFacts: "customer said they are starting from zero" },
  });

  assert.equal(plan.intent, "recommendation");
  assert.equal(plan.replyShape, "direct_answer");
  assert.equal(plan.shouldRecommendOne, true);
});

test("Comparison request stays comparison and can still recommend at the end", () => {
  const plan = planCustomerResponse({
    latestCustomerMessage: "What is the difference between these options?",
    previousBotMessage: "Available options:\n*Basic* - entry level\n*Growth* - adds CRM\n*Scale* - high limits",
    businessType: "saas",
    availableBusinessKnowledge: "Each option has different limits and features.",
  });

  assert.equal(plan.intent, "comparison");
  assert.equal(plan.replyShape, "comparison");
  assert.equal(plan.shouldListAllOptions, false);
  assert.equal(plan.shouldRecommendOne, true);
});

test("Full details request allows structured detailed list", () => {
  const plan = planCustomerResponse({
    latestCustomerMessage: "Share all plans and full details.",
    businessType: "saas",
    availableBusinessKnowledge: "There are several plans with pricing and features.",
  });

  assert.equal(plan.intent, "details");
  assert.equal(plan.answerDepth, "detailed");
  assert.equal(plan.replyShape, "bullet_list");
  assert.equal(plan.shouldListAllOptions, true);
});

test("Pricing request prefers direct price answer", () => {
  const plan = planCustomerResponse({
    latestCustomerMessage: "What is the price?",
    businessType: "ecommerce",
    availableBusinessKnowledge: "Pricing is available in the product catalog.",
  });

  assert.equal(plan.intent, "pricing");
  assert.equal(plan.replyShape, "direct_answer");
  assert.equal(plan.answerDepth, "short");
});

test("Setup request becomes short steps", () => {
  const plan = planCustomerResponse({
    latestCustomerMessage: "How does the setup process work?",
    businessType: "software service",
  });

  assert.equal(plan.intent, "setup");
  assert.equal(plan.replyShape, "steps");
  assert.equal(plan.answerDepth, "short");
  assert.equal(plan.shouldListAllOptions, false);
  assert.equal(plan.maxChars, 450);
  assert.equal(plan.scope, "setup_process");
});

test("How does setup work maps to setup intent", () => {
  const plan = planCustomerResponse({
    latestCustomerMessage: "How does setup work?",
    businessType: "software service",
  });

  assert.equal(plan.intent, "setup");
  assert.equal(plan.replyShape, "steps");
  assert.equal(plan.maxChars, 450);
});

test("How can I start maps to setup process", () => {
  const plan = planCustomerResponse({
    latestCustomerMessage: "How can I start?",
    businessType: "saas software",
  });

  assert.equal(plan.intent, "setup");
  assert.equal(plan.replyShape, "steps");
});

test("What is the process maps to setup process", () => {
  const plan = planCustomerResponse({
    latestCustomerMessage: "What is the process?",
    businessType: "service agency",
  });

  assert.equal(plan.intent, "setup");
  assert.equal(plan.replyShape, "steps");
});

test("How do I book appointment maps to setup process for clinic", () => {
  const plan = planCustomerResponse({
    latestCustomerMessage: "How do I book appointment?",
    businessType: "clinic services",
  });

  assert.equal(plan.intent, "setup");
  assert.equal(plan.scope, "setup_process");
  assert.match(plan.allowedTopics.join(" "), /appointment|booking/i);
});

test("How to order maps to setup process for ecommerce", () => {
  const plan = planCustomerResponse({
    latestCustomerMessage: "How to order?",
    businessType: "ecommerce store",
  });

  assert.equal(plan.intent, "setup");
  assert.equal(plan.scope, "setup_process");
});

test("Previous detailed bot reply makes follow-up decision question avoid repetition", () => {
  const plan = planCustomerResponse({
    latestCustomerMessage: "What do you suggest I start with?",
    previousBotMessage: "Here are all services:\n\n1. Consultation - initial check\n2. Premium consultation - extended time\n3. Full treatment plan - long term care",
    businessType: "clinic services",
    availableBusinessKnowledge: "Multiple services exist for different needs.",
  });

  assert.equal(plan.intent, "recommendation");
  assert.equal(plan.avoidRepeatingPreviousDetails, true);
  assert.equal(plan.shouldListAllOptions, false);
});

test("Planner instruction stays generic and plan-driven", () => {
  const instruction = buildCustomerResponseStrategyInstruction({
    intent: "recommendation",
    answerDepth: "short",
    replyShape: "direct_answer",
    shouldRecommendOne: true,
    shouldListAllOptions: false,
    shouldAskFollowup: false,
    avoidRepeatingPreviousDetails: true,
    allowedTopics: ["single best recommendation", "short reasons"],
    avoidTopics: ["full comparison", "old unrelated context"],
    maxChars: 450,
    maxBullets: 4,
    maxSections: 2,
    formatStyle: "whatsapp_direct",
    emojiStyle: "light",
    scope: "recommendation_focus",
  });

  assert.match(instruction, /Intent: recommendation/);
  assert.match(instruction, /Answer scope: only single best recommendation, short reasons/);
  assert.match(instruction, /Avoid: full comparison, old unrelated context/);
  assert.match(instruction, /Limit: max 450 chars, max 4 bullets\/steps, max 2 sections/);
  assert.match(instruction, /Recommend one best option first\./);
  assert.match(instruction, /Do not list all options unless the customer explicitly asked/);
  assert.match(instruction, /Avoid repeating details already given in the previous bot reply\./);
  assert.doesNotMatch(instruction, /BlackArrow|SlimSip|Starter|Growth|Pro/);
});
