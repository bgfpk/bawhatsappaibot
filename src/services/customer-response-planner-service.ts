export type CustomerResponseIntent =
  | "recommendation"
  | "comparison"
  | "details"
  | "pricing"
  | "setup"
  | "support"
  | "order"
  | "appointment"
  | "complaint"
  | "lead_collection"
  | "unknown";

export type CustomerResponsePlan = {
  intent: CustomerResponseIntent;
  answerDepth: "short" | "medium" | "detailed";
  replyShape: "direct_answer" | "bullet_list" | "comparison" | "steps" | "clarifying_question";
  shouldRecommendOne: boolean;
  shouldListAllOptions: boolean;
  shouldAskFollowup: boolean;
  avoidRepeatingPreviousDetails: boolean;
  allowedTopics: string[];
  avoidTopics: string[];
  maxChars: number;
  maxBullets: number;
  maxSections: number;
  formatStyle: "whatsapp_direct" | "whatsapp_steps" | "whatsapp_comparison" | "whatsapp_list";
  emojiStyle: "none" | "light" | "careful";
  scope: "setup_process" | "pricing_direct" | "recommendation_focus" | "comparison_focus" | "full_details" | "support_resolution" | "order_next_step" | "appointment_next_step" | "general";
};

export type CustomerResponsePlannerInput = {
  latestCustomerMessage?: string;
  previousBotMessage?: string;
  businessType?: string;
  businessFlow?: string;
  availableBusinessKnowledge?: string;
  knownCustomerFacts?: Record<string, any> | string;
};

function clean(value: any, max = 4000) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanMultiline(value: any, max = 4000) {
  return String(value || "").replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim().slice(0, max);
}

function normalize(value: any, max = 4000) {
  return clean(value, max).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function countMatches(text: string, patterns: RegExp[]) {
  return patterns.reduce((score, pattern) => score + (pattern.test(text) ? 1 : 0), 0);
}

function stringifyFacts(knownCustomerFacts: Record<string, any> | string | undefined) {
  if (!knownCustomerFacts) return "";
  if (typeof knownCustomerFacts === "string") return clean(knownCustomerFacts, 1200);
  return Object.entries(knownCustomerFacts)
    .filter(([, value]) => value !== "" && value !== undefined && value !== null && value !== false)
    .map(([key, value]) => `${key}:${String(value)}`)
    .join(" ");
}

function detectServiceLikeBusiness(input: CustomerResponsePlannerInput) {
  const text = normalize(`${input.businessType || ""} ${input.businessFlow || ""}`);
  return /\b(service|services|clinic|doctor|hospital|appointment|booking|consultation|salon|academy|school|course|agency|marketing|property|estate|repair|support)\b/.test(text);
}

function hasPreviousDetailedReply(previousBotMessage: string) {
  const text = cleanMultiline(previousBotMessage, 2500);
  if (!text) return false;
  const nonEmptyLines = text.split("\n").map((line) => line.trim()).filter(Boolean).length;
  const numberedItems = (text.match(/(?:^|\n)\s*\d+\.\s+/gmu) || []).length;
  const bulletItems = (text.match(/(?:^|\n)\s*[-•✅⭐🟢🚀]\s+/gmu) || []).length;
  const boldOptionItems = (text.match(/(?:^|\n)\s*\*[A-Z][^*\n]{1,40}\*\s*[-=:]/gmu) || []).length;
  const headingSignals = /\b(here are|available|options|plans|packages|services|courses|doctors)\b/i.test(text);
  const optionLines = numberedItems + bulletItems + boldOptionItems;
  return optionLines >= 2 || (headingSignals && nonEmptyLines >= 4) || (nonEmptyLines >= 6 && text.length >= 220);
}

function hasEnoughContextToRecommend(input: CustomerResponsePlannerInput) {
  const previousDetailed = hasPreviousDetailedReply(String(input.previousBotMessage || ""));
  const knowledgeText = clean(input.availableBusinessKnowledge, 2500);
  const factsText = stringifyFacts(input.knownCustomerFacts);
  const factCount = factsText ? factsText.split(/\s+/).filter(Boolean).length : 0;
  return previousDetailed || knowledgeText.length >= 160 || factCount >= 6;
}

function buildPlan(base: CustomerResponsePlan, overrides: Partial<CustomerResponsePlan> = {}): CustomerResponsePlan {
  return { ...base, ...overrides };
}

function buildDefaultPlan(intent: CustomerResponseIntent): CustomerResponsePlan {
  switch (intent) {
    case "details":
      return {
        intent,
        answerDepth: "detailed",
        replyShape: "bullet_list",
        shouldRecommendOne: false,
        shouldListAllOptions: true,
        shouldAskFollowup: false,
        avoidRepeatingPreviousDetails: false,
        allowedTopics: ["requested details", "full option list"],
        avoidTopics: ["old unrelated context"],
        maxChars: 1200,
        maxBullets: 8,
        maxSections: 4,
        formatStyle: "whatsapp_list",
        emojiStyle: "light",
        scope: "full_details",
      };
    case "comparison":
      return {
        intent,
        answerDepth: "short",
        replyShape: "comparison",
        shouldRecommendOne: false,
        shouldListAllOptions: false,
        shouldAskFollowup: false,
        avoidRepeatingPreviousDetails: false,
        allowedTopics: ["short option comparison"],
        avoidTopics: ["full catalog", "long sales explanation", "old unrelated context"],
        maxChars: 450,
        maxBullets: 4,
        maxSections: 2,
        formatStyle: "whatsapp_comparison",
        emojiStyle: "light",
        scope: "comparison_focus",
      };
    case "pricing":
      return {
        intent,
        answerDepth: "short",
        replyShape: "direct_answer",
        shouldRecommendOne: false,
        shouldListAllOptions: false,
        shouldAskFollowup: false,
        avoidRepeatingPreviousDetails: false,
        allowedTopics: ["direct price answer"],
        avoidTopics: ["full setup process", "full comparison", "old unrelated context"],
        maxChars: 300,
        maxBullets: 2,
        maxSections: 2,
        formatStyle: "whatsapp_direct",
        emojiStyle: "light",
        scope: "pricing_direct",
      };
    case "setup":
      return {
        intent,
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
      };
    case "support":
    case "complaint":
      return {
        intent,
        answerDepth: "short",
        replyShape: "direct_answer",
        shouldRecommendOne: false,
        shouldListAllOptions: false,
        shouldAskFollowup: true,
        avoidRepeatingPreviousDetails: true,
        allowedTopics: ["issue resolution", "next useful question"],
        avoidTopics: ["salesy comparisons", "playful tone", "old unrelated context"],
        maxChars: 450,
        maxBullets: 3,
        maxSections: 2,
        formatStyle: "whatsapp_direct",
        emojiStyle: "careful",
        scope: "support_resolution",
      };
    case "order":
      return {
        intent,
        answerDepth: "short",
        replyShape: "clarifying_question",
        shouldRecommendOne: false,
        shouldListAllOptions: false,
        shouldAskFollowup: true,
        avoidRepeatingPreviousDetails: true,
        allowedTopics: ["order steps", "next required action"],
        avoidTopics: ["full comparison", "old unrelated context"],
        maxChars: 450,
        maxBullets: 4,
        maxSections: 2,
        formatStyle: "whatsapp_steps",
        emojiStyle: "light",
        scope: "order_next_step",
      };
    case "appointment":
    case "lead_collection":
      return {
        intent,
        answerDepth: "short",
        replyShape: "clarifying_question",
        shouldRecommendOne: false,
        shouldListAllOptions: false,
        shouldAskFollowup: true,
        avoidRepeatingPreviousDetails: true,
        allowedTopics: ["appointment or service process", "next required action"],
        avoidTopics: ["full comparison", "old unrelated context"],
        maxChars: 450,
        maxBullets: 4,
        maxSections: 2,
        formatStyle: "whatsapp_steps",
        emojiStyle: "light",
        scope: "appointment_next_step",
      };
    case "recommendation":
      return {
        intent,
        answerDepth: "short",
        replyShape: "direct_answer",
        shouldRecommendOne: true,
        shouldListAllOptions: false,
        shouldAskFollowup: false,
        avoidRepeatingPreviousDetails: true,
        allowedTopics: ["single best recommendation", "short reasons"],
        avoidTopics: ["full comparison", "full catalog", "old unrelated context"],
        maxChars: 450,
        maxBullets: 4,
        maxSections: 2,
        formatStyle: "whatsapp_direct",
        emojiStyle: "light",
        scope: "recommendation_focus",
      };
    default:
      return {
        intent: "unknown",
        answerDepth: "medium",
        replyShape: "direct_answer",
        shouldRecommendOne: false,
        shouldListAllOptions: false,
        shouldAskFollowup: false,
        avoidRepeatingPreviousDetails: false,
        allowedTopics: ["latest customer question"],
        avoidTopics: ["old unrelated context"],
        maxChars: 800,
        maxBullets: 5,
        maxSections: 3,
        formatStyle: "whatsapp_direct",
        emojiStyle: "light",
        scope: "general",
      };
  }
}

export function planCustomerResponse(input: CustomerResponsePlannerInput): CustomerResponsePlan {
  const latest = clean(input.latestCustomerMessage, 1200);
  const normalized = normalize(latest, 1200);
  const previousDetailed = hasPreviousDetailedReply(String(input.previousBotMessage || ""));
  const enoughContextToRecommend = hasEnoughContextToRecommend(input);
  const serviceLikeBusiness = detectServiceLikeBusiness(input);
  const asksHow = /\b(how|what is the process|what s the process|what is the procedure|what s the procedure|steps)\b/.test(normalized);
  const setupActionSignal = /\b(setup|set up|start|begin|activate|connect|install|integrate|configure|onboard|onboarding|use|works|book|booking|order|checkout|enroll|enrollment|register)\b/.test(normalized);
  const setupContextSignal = /\b(process|procedure|workflow|how it works|how does it work|how can i use it|how to use it|how can i start|how to start|steps to begin)\b/.test(normalized);
  const actionHowSignal = asksHow && setupActionSignal;

  const recommendationScore = countMatches(normalized, [
    /\b(recommend|recommended|suggest|suggestion|best|better|suitable|suits|right fit|good fit|ideal)\b/,
    /\b(choose|select|pick|start with|go with|confused|decide|decision|which one|which option)\b/,
    /\b(for me|for my|for our|for current|should i|what should i|which should i)\b/,
  ]);
  const comparisonScore = countMatches(normalized, [
    /\b(compare|comparison|difference|different|vs|versus)\b/,
    /\b(between these|between them|which is better between)\b/,
  ]);
  const detailsScore = countMatches(normalized, [
    /\b(all|full|complete|entire)\b/,
    /\b(details|detail|list|menu|catalog|catalogue|options|services|plans|packages|products)\b/,
    /\b(show me|share|send)\b/,
  ]);
  const pricingScore = countMatches(normalized, [
    /\b(price|pricing|cost|rate|charges|fee|budget|how much|qeemat|kitna|kitne|pkr|rs)\b/,
  ]);
  const setupScore =
    (setupContextSignal ? 2 : 0) +
    (actionHowSignal ? 2 : 0) +
    (asksHow && /\b(appointment|booking|book|order|checkout|course|enroll|service|software|account|whatsapp|install|connect)\b/.test(normalized) ? 1 : 0) +
    (countMatches(normalized, [
      /\b(setup|set up|process|procedure|workflow|onboard|onboarding|activate|connect|install|configure|enroll|register|steps to begin|start using)\b/,
    ]));
  const supportScore = countMatches(normalized, [
    /\b(issue|problem|not working|error|bug|support|help|fix|broken|stuck|unable)\b/,
  ]);
  const complaintScore = countMatches(normalized, [
    /\b(complaint|refund|return|angry|upset|not happy|bad service|late|delay|fraud|scam)\b/,
  ]);
  const orderScore = countMatches(normalized, [
    /\b(order|buy|purchase|checkout|delivery|shipping|cod|stock|available)\b/,
  ]);
  const appointmentScore = countMatches(normalized, [
    /\b(appointment|book|booking|slot|timing|schedule|doctor|visit|consultation)\b/,
  ]);
  const leadCollectionScore = countMatches(normalized, [
    /\b(contact me|call me|quote|quotation|inquiry|enquiry|requirement|need info|more info)\b/,
  ]);

  const explicitAllDetails = /\b(all plans|all packages|all options|all services|full details|complete details|price list|catalog|menu)\b/.test(normalized);
  const explicitDecisionHelp = recommendationScore > 0 || /\b(what should i start with|what should i choose|which is suitable|what do you suggest)\b/.test(normalized);
  const explicitSetupIntent = setupScore >= 2 || (asksHow && setupActionSignal);

  let intent: CustomerResponseIntent = "unknown";
  if (complaintScore > 0) intent = "complaint";
  else if (supportScore > 0) intent = "support";
  else if (explicitAllDetails || (detailsScore > 0 && recommendationScore === 0 && comparisonScore === 0)) intent = "details";
  else if (pricingScore > 0 && recommendationScore === 0) intent = "pricing";
  else if (explicitSetupIntent) intent = "setup";
  else if (recommendationScore > 0 && (comparisonScore === 0 || explicitDecisionHelp)) intent = "recommendation";
  else if (comparisonScore > 0) intent = explicitDecisionHelp ? "recommendation" : "comparison";
  else if (appointmentScore > 0 && serviceLikeBusiness) intent = "appointment";
  else if (orderScore > 0 && !serviceLikeBusiness) intent = "order";
  else if (leadCollectionScore > 0) intent = "lead_collection";

  const plan = buildDefaultPlan(intent);
  const avoidRepeatingPreviousDetails = previousDetailed && intent !== "details";

  if (intent === "recommendation") {
    if (!enoughContextToRecommend && serviceLikeBusiness) {
      return buildPlan(plan, {
        replyShape: "clarifying_question",
        shouldRecommendOne: false,
        shouldAskFollowup: true,
        avoidRepeatingPreviousDetails,
      });
    }
    return buildPlan(plan, { avoidRepeatingPreviousDetails });
  }

  if (intent === "comparison") {
    return buildPlan(plan, {
      shouldRecommendOne: enoughContextToRecommend,
      shouldAskFollowup: !enoughContextToRecommend && serviceLikeBusiness,
      avoidRepeatingPreviousDetails,
    });
  }

  if (intent === "details") {
    return buildPlan(plan, {
      answerDepth: explicitAllDetails ? "detailed" : "medium",
      shouldAskFollowup: false,
      avoidRepeatingPreviousDetails: false,
    });
  }

  if (intent === "pricing") {
    return buildPlan(plan, {
      shouldAskFollowup: serviceLikeBusiness && !enoughContextToRecommend,
      avoidRepeatingPreviousDetails,
    });
  }

  if (intent === "setup") {
    return buildPlan(plan, {
      shouldAskFollowup: serviceLikeBusiness || appointmentScore > 0 || orderScore > 0,
      avoidRepeatingPreviousDetails: true,
      allowedTopics: appointmentScore > 0
        ? ["appointment or booking steps"]
        : orderScore > 0
          ? ["order or checkout steps"]
          : ["setup/process steps"],
    });
  }

  if (intent === "appointment" || intent === "order" || intent === "lead_collection") {
    return buildPlan(plan, {
      replyShape: enoughContextToRecommend ? "direct_answer" : "clarifying_question",
      shouldAskFollowup: true,
      avoidRepeatingPreviousDetails,
    });
  }

  if (intent === "support" || intent === "complaint") {
    return buildPlan(plan, {
      replyShape: "direct_answer",
      shouldAskFollowup: true,
      avoidRepeatingPreviousDetails,
    });
  }

  return buildPlan(plan, {
    avoidRepeatingPreviousDetails: avoidRepeatingPreviousDetails || explicitSetupIntent,
  });
}

function describeReplyShape(shape: CustomerResponsePlan["replyShape"]) {
  switch (shape) {
    case "bullet_list": return "bullet list";
    case "comparison": return "short comparison";
    case "steps": return "short steps";
    case "clarifying_question": return "one clarifying question";
    default: return "direct answer";
  }
}

export function buildCustomerResponseStrategyInstruction(plan: CustomerResponsePlan) {
  const lines = [
    "Customer response strategy:",
    `- Intent: ${plan.intent}`,
    `- Answer scope: only ${plan.allowedTopics.join(", ") || "the latest customer topic"}`,
    `- Avoid: ${plan.avoidTopics.join(", ") || "old unrelated context"}`,
    `- Depth: ${plan.answerDepth}`,
    `- Shape: ${describeReplyShape(plan.replyShape)}`,
    `- Limit: max ${plan.maxChars} chars, max ${plan.maxBullets} bullets/steps, max ${plan.maxSections} sections`,
    `- Formatting: ${plan.formatStyle.replace(/^whatsapp_/, "WhatsApp ")}; preserve *bold labels*; ${plan.emojiStyle === "careful" ? "use little or no emoji if the topic is sensitive" : "use light emoji if appropriate"}`,
  ];
  if (plan.shouldRecommendOne) lines.push("- Recommend one best option first.");
  if (plan.shouldListAllOptions) lines.push("- Give the full structured list because the customer asked for details or all options.");
  else lines.push("- Do not list all options unless the customer explicitly asked for full details or comparison.");
  if (plan.avoidRepeatingPreviousDetails) lines.push("- Avoid repeating details already given in the previous bot reply.");
  if (plan.intent === "pricing") lines.push("- Answer price directly if it is known.");
  if (plan.intent === "setup") lines.push("- Explain the process in short steps.");
  if (plan.intent === "support" || plan.intent === "complaint") lines.push("- Keep the tone calm and careful. Avoid playful emoji unless clearly appropriate.");
  lines.push(plan.shouldAskFollowup ? "- End with one useful follow-up question only if it is needed." : "- End with one short CTA question only when useful.");
  if (plan.answerDepth === "short") lines.push("- Keep the reply concise, ideally 3-6 short lines.");
  return lines.join("\n");
}
