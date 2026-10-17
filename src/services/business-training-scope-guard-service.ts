export type EscalationReasonCategory =
  | "human_requested"
  | "unsupported_business_question"
  | "high_risk_unverified_question"
  | "repeated_unclear_question"
  | "bargaining_or_price_push"
  | "broken_customer_reply"
  | "broken_customer_reply_unrepairable"
  | "bot_reply_unrelated"
  | "appointment_or_order_confirmation_risk";

type SafetyInput = {
  latestUserText?: any;
  replyText?: any;
  verifiedContextText?: any;
  recentBotReplyText?: any;
  knownProductOrService?: any;
  businessType?: any;
  recordConfirmed?: boolean;
  rememberedMediaContextUseful?: boolean;
  historyTexts?: string[];
  customerLanguage?: string;
};

function clean(value: any, max = 2000) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalize(value: any, max = 2000) {
  return clean(value, max).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function tokenize(value: any) {
  return normalize(value, 2400)
    .split(" ")
    .filter((token) => token.length >= 4)
    .filter((token) => ![
      "about", "admin", "agent", "call", "customer", "details", "human", "message",
      "please", "price", "reply", "team", "that", "this", "what", "when", "which",
    ].includes(token));
}

function overlapScore(a: any, b: any) {
  const aTokens = new Set(tokenize(a));
  const bTokens = new Set(tokenize(b));
  if (!aTokens.size || !bTokens.size) return 0;
  let shared = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) shared += 1;
  }
  return shared / Math.min(aTokens.size, bTokens.size);
}

const HUMAN_REQUEST_PATTERNS = [
  /\bhuman\b/, /\breal person\b/, /\brepresentative\b/, /\bagent\b/, /\badmin\b/,
  /\bmanager\b/, /\bowner\b/, /\bcall me\b/, /\bphone call\b/, /\btalk to someone\b/,
  /\bbaat karni hai\b/, /\badmin se baat\b/, /\bmanager se baat\b/, /\bowner se baat\b/,
  /\binsan se baat\b/, /\bkisi insan se\b/, /\bcall krain\b/, /\bmujhe call karo\b/,
  /\bmujhe banda chahiye\b/,
];

const REPEATED_CONFUSION_PATTERNS = [
  /\bsamajh nahi aai\b/, /\bsmj nhi ai\b/, /\bwhat do you mean\b/, /\bagain\b/,
  /\bsame question\b/, /\bfee kaha se saved hai\b/, /\bdidn t understand\b/, /\bdid not understand\b/,
];

const BARGAINING_PATTERNS = [
  /\blast price\b/, /\bfinal price\b/, /\bdiscount\b/, /\bkam karo\b/, /\bbohat mehnga\b/,
  /\btoo expensive\b/, /\bprice too much\b/, /\bfinal rate\b/, /\bbest price\b/,
];

const BUSINESS_SPECIFIC_PATTERNS = [
  /\bprice\b/, /\bfee\b/, /\bpackage\b/, /\bdiscount\b/, /\bfinal price\b/, /\beligibility\b/,
  /\bcoverage\b/, /\bapproval\b/, /\bwarranty\b/, /\brefund\b/, /\bstock\b/, /\bavailability\b/,
  /\bdelivery time\b/, /\bcourier status\b/, /\bbooking confirmation\b/, /\bappointment confirmation\b/,
  /\bsurgery\b/, /\boperation\b/, /\bclaim\b/, /\bquote\b/, /\bpayment proof\b/, /\badmission\b/,
];

const LIST_REQUEST_PATTERNS = [
  /\blist of\b/,
  /\bdoctor list\b/,
  /\bdoctors list\b/,
  /\bservices? list\b/,
  /\bproduct list\b/,
  /\bprice list\b/,
  /\brate list\b/,
  /\bavailable options?\b/,
  /\bwhat (services?|products?|packages?|courses?|options?|branches?|timings?|departments?)\b/,
  /\b(show|send|share|give|need|want|looking for|tell me)\b.*\b(list|catalog|catalogue|menu|services?|products?|packages?|doctors?|courses?|options?|branches?|timings?|price list|rate list|departments?)\b/,
  /\b(list|catalog|catalogue|menu|services?|products?|packages?|doctors?|courses?|options?|branches?|timings?|price list|rate list|departments?)\b/,
];

const HIGH_RISK_PATTERNS: Array<{ category: string; pattern: RegExp }> = [
  { category: "medical_or_treatment", pattern: /\b(treatment|medical|diagnos|medicine|prescription)\b/ },
  { category: "surgery_or_operation", pattern: /\b(surgery|operation|c section|procedure)\b/ },
  { category: "eligibility_or_coverage", pattern: /\b(eligible|eligibility|covered|coverage|included)\b/ },
  { category: "insurance_or_claim", pattern: /\b(insurance|claim|card approval|claim approval)\b/ },
  { category: "legal_or_complaint", pattern: /\b(legal|complaint|court|case)\b/ },
  { category: "refund_or_payment_dispute", pattern: /\b(refund|chargeback|payment dispute)\b/ },
  { category: "finance_or_loan", pattern: /\b(loan|finance|installment|emi)\b/ },
  { category: "official_admission_or_approval", pattern: /\b(admission|approval|approved)\b/ },
  { category: "exact_quote_or_contract", pattern: /\b(exact quote|final quote|contract|agreement|final deal)\b/ },
];

const BROKEN_REPLY_PATTERNS = [
  /\balready saved\b/i,
  /\bsaved hai\b/i,
  /\/time\b/i,
  /\/date\b/i,
  /\/field\b/i,
  /\bundefined\b/i,
  /\bnull\b/i,
  /\bNaN\b/i,
  /\[object Object\]/i,
  /\bcustom field\b/i,
  /\binternal\b/i,
  /\btool\b/i,
  /\bCRM says\b/i,
  /\brecord says\b/i,
  /\bsource:\b/i,
  /\bappointment \/time\b/i,
  /\bfee Rs already saved\b/i,
  /\bRs already saved\b/i,
  /\bko s Mon-Sat\b/i,
];

export function detectHumanAdminRequest(value: any) {
  const text = normalize(value);
  return Boolean(text) && HUMAN_REQUEST_PATTERNS.some((pattern) => pattern.test(text));
}

export function detectRepeatedConfusion(value: any, historyTexts: string[] = []) {
  const text = normalize(value);
  if (!text) return false;
  const repeated = historyTexts.filter((item) => overlapScore(item, text) >= 0.8).length >= 1;
  return repeated || REPEATED_CONFUSION_PATTERNS.some((pattern) => pattern.test(text));
}

export function detectBargainingSignals(value: any) {
  const text = normalize(value);
  return Boolean(text) && BARGAINING_PATTERNS.some((pattern) => pattern.test(text));
}

export function detectBusinessSpecificQuestion(value: any) {
  const text = normalize(value);
  return Boolean(text) && BUSINESS_SPECIFIC_PATTERNS.some((pattern) => pattern.test(text));
}

export function detectLatestListRequest(value: any) {
  const text = normalize(value, 1200);
  return Boolean(text) && LIST_REQUEST_PATTERNS.some((pattern) => pattern.test(text));
}

export function detectHighRiskCategory(value: any) {
  const text = normalize(value);
  const match = HIGH_RISK_PATTERNS.find((item) => item.pattern.test(text));
  return match?.category || "";
}

export function containsBrokenCustomerReplyText(value: any) {
  const text = clean(value, 2400);
  return Boolean(text) && BROKEN_REPLY_PATTERNS.some((pattern) => pattern.test(text));
}

function extractQuestionTopic(input: SafetyInput) {
  const latest = normalize(input.latestUserText, 800);
  const knownProduct = clean(input.knownProductOrService, 120);
  if (knownProduct && latest.includes(normalize(knownProduct, 120))) return knownProduct;
  if (/\b(price|fee|package|discount|final price)\b/.test(latest)) return "the exact price";
  if (/\b(coverage|covered|eligibility|included)\b/.test(latest)) return "that coverage or eligibility question";
  if (/\b(approval|admission|claim)\b/.test(latest)) return "that approval question";
  if (/\b(refund|payment dispute)\b/.test(latest)) return "that refund or payment issue";
  if (/\b(warranty)\b/.test(latest)) return "the warranty details";
  if (/\b(delivery|courier)\b/.test(latest)) return "the delivery timing";
  if (/\b(appointment|booking|order)\b/.test(latest) && /\b(confirm|confirmed)\b/.test(latest)) return "that confirmation";
  if (/\b(product|service|package|plan)\b/.test(latest)) return "that product or service";
  return clean(input.latestUserText, 120) || "that question";
}

function hasVerifiedSupport(input: SafetyInput, topic: string) {
  const context = normalize(input.verifiedContextText, 6000);
  const latest = normalize(input.latestUserText, 1200);
  if (!latest || !context) return false;
  if (/\bprice|fee|final price|discount\b/.test(latest)) {
    return /\b(price|fee|cost|pkr|rs|usd|\$|discount|package|plan)\b/.test(context);
  }
  if (/\bcoverage|covered|eligibility|included\b/.test(latest)) {
    return /\b(coverage|covered|eligible|eligibility|included|approval)\b/.test(context);
  }
  if (/\bapproval|claim|admission\b/.test(latest)) {
    return /\b(approval|approved|claim|admission)\b/.test(context);
  }
  if (/\brefund|warranty|delivery|courier|stock|availability\b/.test(latest)) {
    return overlapScore(latest, context) >= 0.3 || context.includes(normalize(topic, 120));
  }
  return overlapScore(latest, context) >= 0.3 || context.includes(normalize(topic, 120));
}

function hasConfirmationRisk(input: SafetyInput) {
  const reply = normalize(input.replyText, 1200);
  if (!reply) return false;
  if (input.recordConfirmed === true) return false;
  return (
    /\b(appointment|booking|order|lead)\b/.test(reply)
    && /\b(confirm|confirmed)\b/.test(reply)
  ) || /\bconfirm rakhna hai\b/.test(reply);
}

function detectLatestListReplyMismatch(input: SafetyInput) {
  if (!detectLatestListRequest(input.latestUserText)) return false;
  const latest = normalize(input.latestUserText, 1200);
  const reply = normalize(input.replyText, 1600);
  if (!reply) return false;
  const replyHasListSignals = /\b(list|catalog|catalogue|menu|services?|products?|packages?|doctors?|courses?|options?|branches?|timings?|price|rate|departments?|available)\b/.test(reply);
  const replyAsksFieldsFirst = /\b(share|tell|provide|send|mention|may i know|what is|please share|please send)\b/.test(reply)
    && /\b(age|gender|name|phone|number|date|time|timing|address|city|location)\b/.test(reply);
  const staleFlowSignals = /\b(appointment|booking|lead|stomach|infection|confirm|confirmed)\b/.test(reply);
  return !replyHasListSignals || replyAsksFieldsFirst || (staleFlowSignals && overlapScore(latest, reply) < 0.2);
}

export function evaluateLatestQuestionSafety(input: SafetyInput) {
  const latest = clean(input.latestUserText, 800);
  const latestListRequest = detectLatestListRequest(latest);
  const humanRequested = detectHumanAdminRequest(latest);
  const repeatedConfusion = detectRepeatedConfusion(latest, input.historyTexts || []);
  const bargaining = detectBargainingSignals(latest);
  const businessSpecific = detectBusinessSpecificQuestion(latest);
  const highRiskCategory = detectHighRiskCategory(latest);
  const topic = extractQuestionTopic(input);
  const brokenReply = containsBrokenCustomerReplyText(input.replyText);
  const verified = hasVerifiedSupport(input, topic);
  const confirmationRisk = hasConfirmationRisk(input);
  const latestListReplyMismatch = detectLatestListReplyMismatch(input);
  const unrelatedReply = !latestListRequest && Boolean(clean(input.replyText, 800))
    && overlapScore(input.latestUserText, input.replyText) < 0.12
    && overlapScore(input.replyText, input.recentBotReplyText) >= 0.5;

  let reasonCategory: EscalationReasonCategory | "" = "";
  if (humanRequested) reasonCategory = "human_requested";
  else if (brokenReply) reasonCategory = "broken_customer_reply";
  else if (confirmationRisk) reasonCategory = "appointment_or_order_confirmation_risk";
  else if (highRiskCategory && !verified) reasonCategory = "high_risk_unverified_question";
  else if (businessSpecific && !verified) reasonCategory = "unsupported_business_question";
  else if (bargaining && (repeatedConfusion || !verified)) reasonCategory = "bargaining_or_price_push";
  else if (repeatedConfusion) reasonCategory = "repeated_unclear_question";
  else if (unrelatedReply) reasonCategory = "bot_reply_unrelated";

  return {
    shouldEscalate: Boolean(reasonCategory),
    reasonCategory,
    topic,
    humanRequested,
    repeatedConfusion,
    bargaining,
    businessSpecific,
    highRiskCategory,
    verified,
    brokenReply,
    unrelatedReply,
    latestListRequest,
    latestListReplyMismatch,
    confirmationRisk,
    oldContextSuppressed: latestListReplyMismatch || unrelatedReply || ((businessSpecific || Boolean(highRiskCategory)) && !verified),
  };
}
