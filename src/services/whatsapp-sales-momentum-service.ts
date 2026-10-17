/**
 * WhatsApp Sales Momentum & Context-Aware Engine
 *
 * Implements structured entity separation (preventing business/brand names
 * from contaminating personal customer identity), stage awareness,
 * pain-based selling, direct buying-signal answers, and grounding rules.
 */

export type SalesStage =
  | "NEW_INQUIRY"
  | "DISCOVERY"
  | "PAIN_IDENTIFIED"
  | "SOLUTION_DISCUSSION"
  | "PRICING"
  | "OBJECTION"
  | "BUYING_INTENT"
  | "CLOSING"
  | "HUMAN_HANDOVER"
  | "EXISTING_CUSTOMER_SUPPORT";

export interface StructuredEntities {
  personName?: string;
  businessName?: string;
  brandName?: string;
  productOrService?: string;
  websiteOrPlatform?: string;
  businessProblem?: string;
  goal?: string;
}

export interface SalesMomentumContext {
  stage: SalesStage;
  entities: StructuredEntities;
  isSalesContext: boolean;
  hasBuyingIntent: boolean;
  hasIdentifiedPain: boolean;
  hasConfirmedPersonName: boolean;
  previousPricingAnswered: boolean;
  discoveredFacts: string[];
}

const COMMON_BUSINESS_TERMS = new Set([
  "agency", "store", "shop", "digital", "solutions", "services", "technologies",
  "tech", "media", "ventures", "enterprises", "company", "co", "ltd", "llc", "inc",
  "group", "holdings", "marketing", "consulting", "software", "labs", "logistics",
  "brand", "boutique", "fashion", "apparel", "wear", "couture", "online", "pk",
  "mart", "traders", "studio", "printers", "printing", "hospital", "clinic",
  "school", "college", "academy", "firm", "global", "systems", "network",
]);

const PLATFORM_TERMS = [
  "shopify", "woocommerce", "wordpress", "daraz", "amazon", "ebay", "etsy",
  "magento", "wix", "squarespace", "custom site", "website", "landing page",
  "facebook page", "instagram page", "tiktok shop", "meta ads", "google ads",
];

const BUYING_SIGNAL_PATTERNS = [
  /\b(how much|price|cost|charges|fee|pricing|package|packages|rate|rates|quote|fees)\b/i,
  /\b(kitnay ka|kitna price|kya charges|kya fee|package kya hai|qeemat)\b/i,
  /\b(how to start|get started|onboarding|sign up|subscribe|setup|process to start)\b/i,
  /\b(start karna|shuru karna|kaise shuru|shuru karein|join karna)\b/i,
  /\b(payment method|how to pay|bank transfer|card payment|advance|jazzcash|easypaisa)\b/i,
  /\b(payment kaise|paise kaise|advance dena)\b/i,
  /\b(contract|agreement|terms|deliverables|timeline|how long|turnaround)\b/i,
  /\b(what is included|what do you provide|what do i get|kya shamil hai)\b/i,
];

const PAIN_PATTERNS = [
  /\b(low sales|sales dropped|not getting orders|no orders|zero orders|low conversion|ads not working|high cpc|low roas|negative roas|burning cash|wasting budget)\b/i,
  /\b(sales nahi aa rahi|orders nahi aa rahe|ads se result nahi|roas bohot kam|nuqsaan ho raha|loss mein|budget waste)\b/i,
  /\b(slow response|delayed replies|abandoned carts|unanswered leads|missing follow-ups|manual work|too much time)\b/i,
  /\b(reply late|customers bhag jatay|leads zaya|follow up nahi hota|manual manage karna mushkil)\b/i,
  /\b(fake orders|high rto|return ratio|cash on delivery issues|dispatch delays)\b/i,
  /\b(returns bohot zyada|rto high|fake orders aa rahe)\b/i,
];

const SUPPORT_PATTERNS = [
  /\b(complaint|issue|not working|broken|bug|error|refund|money back|damaged|defective)\b/i,
  /\b(tracking|where is my order|courier|dispatch status|delivery delay|order status)\b/i,
  /\b(shikayat|chal nahi raha|kharab|pesay wapis|order kahan hai|tracking id|ab tak nahi mila)\b/i,
  /\b(cancel my subscription|cancel subscription|pause account|delete account)\b/i,
];

/**
 * Checks whether a word or phrase represents a business, company, or brand name,
 * rather than a personal human name.
 */
export function isBusinessOrBrandName(candidate: string): boolean {
  const clean = String(candidate || "").trim().toLowerCase();
  if (!clean) return false;

  // Domain or URL
  if (/\.[a-z]{2,}\b/i.test(clean) || clean.includes("www.") || clean.includes("http")) {
    return true;
  }

  const words = clean.split(/[\s_-]+/).filter(Boolean);
  if (words.some((w) => COMMON_BUSINESS_TERMS.has(w))) {
    return true;
  }

  if (PLATFORM_TERMS.some((p) => clean.includes(p))) {
    return true;
  }

  // Starts Digital specific safeguard
  if (clean.includes("starts digital") || clean.includes("startsdigital")) {
    return true;
  }

  return false;
}

/**
 * Extracts structured entities from conversation text, strictly separating
 * personal human names from company, brand, product, and platform names.
 */
export function extractStructuredEntities(
  textOrHistory: string | any[],
  history: any[] = [],
  existingProfile: any = {}
): StructuredEntities {
  let raw = "";
  let fullHistory: any[] = [];
  if (Array.isArray(textOrHistory)) {
    fullHistory = textOrHistory;
    raw = textOrHistory.map((m: any) => String(m?.text || m?.message?.conversation || m?.message?.extendedTextMessage?.text || "")).join("\n");
  } else {
    raw = String(textOrHistory || "").trim();
    fullHistory = history;
  }
  const lower = raw.toLowerCase();
  const entities: StructuredEntities = {};

  // 1. Website or Platform
  const urlMatch = raw.match(/https?:\/\/[^\s<>)"]+|www\.[^\s<>)"]+|\b[a-zA-Z0-9-]+\.(?:com|pk|org|net|co|io|store|site|ai|shop)\b/i);
  if (urlMatch) {
    entities.websiteOrPlatform = urlMatch[0];
  } else {
    for (const p of PLATFORM_TERMS) {
      if (lower.includes(p)) {
        entities.websiteOrPlatform = p;
        break;
      }
    }
  }

  // 2. Explicit Brand or Business mention:
  // "brand is X", "brand name is X", "company is X", "we are X", "our store is X", "this is Starts Digital"
  const businessMatches = [
    /(?:brand(?:\s+name)?|company(?:\s+name)?|business(?:\s+name)?|store(?:\s+name)?|agency(?:\s+name)?)\s*(?:is|:|=)\s*([A-Za-z0-9&' -]+?)(?=\s+(?:and|we|which|who|with|for|\.|\!|\?|,|;|$))/i,
    /(?:we are|our brand is|our store is|our business is|our agency is)\s+([A-Za-z0-9&' -]+?)(?=\s+(?:and|we|which|who|with|for|\.|\!|\?|,|;|$))/i,
    /(?:from|at)\s+([A-Za-z0-9&' -]+?\b(?:digital|store|shop|agency|media|wear|apparel|brand|co|ltd|solutions|consulting|marketing|tech|logistics))/i,
    /(?:this is|main)\s+([A-Za-z0-9&' -]+?\b(?:digital|store|shop|agency|media|wear|apparel|brand|co|ltd|solutions|consulting|marketing|tech|logistics))/i,
    /\b(starts\s+digital)\b/i,
  ];

  for (const regex of businessMatches) {
    const match = raw.match(regex);
    if (match?.[1]) {
      const captured = match[1].trim().replace(/[.,;:]+$/, "");
      if (captured && !entities.businessName) {
        entities.businessName = captured;
        entities.brandName = captured;
        break;
      }
    }
  }

  // 3. Explicit Person Name:
  // ONLY treat as person name when preceded by explicit personal introduction
  // and NOT matching a business term! Stop before prepositions like "from", "at", "with", "and"
  const personalNameMatches = [
    /\bmy name is\s+([A-Za-z' -]+?)(?=\s+(?:from|at|with|and|of|\.|\!|\?|,|;|$))/i,
    /\bi am\s+([A-Za-z' -]+?)(?=\s+(?:from|at|with|and|of|\.|\!|\?|,|;|$))/i,
    /(?:^|\n)\s*(?:name|customer name|full name)\s*[:：-]\s*([A-Za-z' -]+?)(?=\s+(?:from|at|with|and|of|\.|\!|\?|,|;|$))/i,
    /\bmera naam\s+([A-Za-z' -]+?)\s+hai\b/i,
  ];

  // If already confirmed in profile, preserve confirmed person name
  const confirmedProfileName = String(existingProfile?.deliveryName || existingProfile?.customerName || existingProfile?.name || "").trim();
  if (confirmedProfileName && !isBusinessOrBrandName(confirmedProfileName)) {
    entities.personName = confirmedProfileName;
  } else {
    for (const regex of personalNameMatches) {
      const match = raw.match(regex);
      if (match?.[1]) {
        const candidate = match[1].trim().replace(/[.,;:]+$/, "");
        // CRITICAL: NEVER treat a business, brand, or platform as a person's name!
        if (candidate && !isBusinessOrBrandName(candidate)) {
          entities.personName = candidate;
          break;
        }
      }
    }
  }

  // 4. Business Problem / Pain
  for (const regex of PAIN_PATTERNS) {
    const match = raw.match(regex);
    if (match) {
      entities.businessProblem = match[0].trim();
      break;
    }
  }

  // 5. Goal
  const goalMatch = raw.match(/(?:goal|aim|target|objective|want to|need to achieve|chahtay hain)\s*(?:is|to|:)?\s*([^.!?\n]{5,60})/i);
  if (goalMatch?.[1]) {
    entities.goal = goalMatch[1].trim();
  }

  return entities;
}

export const separateCustomerEntities = extractStructuredEntities;

/**
 * Determines current conversation sales/support stage.
 */
export function determineSalesStage(input: {
  text?: string;
  history?: any[];
  profile?: any;
  userConfig?: any;
  previousStage?: SalesStage;
  isSalesContext?: boolean;
} | any[], options?: { isSalesContext?: boolean }): SalesStage {
  let text = "";
  let history: any[] = [];
  let userConfig: any;

  if (Array.isArray(input)) {
    history = input;
    const lastUser = [...input].reverse().find((m: any) => m.role === "user" || !m.role);
    text = String(lastUser?.text || lastUser?.message?.conversation || lastUser?.message?.extendedTextMessage?.text || "");
    userConfig = options?.isSalesContext ? { business_type: "sales" } : undefined;
  } else if (input && typeof input === "object") {
    text = String(input.text || "");
    history = input.history || [];
    userConfig = input.userConfig;
  }

  const raw = text.trim();
  const lower = raw.toLowerCase();

  // 1. Existing customer / support context
  const isSupportConfig = String(userConfig?.business_type || "").toLowerCase().includes("support") ||
    String(userConfig?.ai_prompt || "").toLowerCase().includes("customer service");

  if (SUPPORT_PATTERNS.some((p) => p.test(raw))) {
    return "EXISTING_CUSTOMER_SUPPORT";
  }

  // 2. Human handover requests
  if (/\b(human|agent|representative|manager|owner se baat|call me|call karain|insaan se)\b/i.test(raw)) {
    return "HUMAN_HANDOVER";
  }

  // 3. Buying Intent / Closing: questions about starting, payment, signup, booking
  if (
    /\b(how to start|start kaise|shuru kaise|payment method|where to pay|sign up link|book now|proceed with order|confirm order|let'?s do it)\b/i.test(raw)
  ) {
    return "BUYING_INTENT";
  }

  // 4. Pricing / Cost questions
  if (BUYING_SIGNAL_PATTERNS.some((p) => p.test(raw))) {
    return "PRICING";
  }

  // 5. Objections
  if (
    /\b(too expensive|mehnga|discount|kam karein|another seller|market rate|cheaper somewhere)\b/i.test(raw)
  ) {
    return "OBJECTION";
  }

  // 6. Pain Identified
  if (PAIN_PATTERNS.some((p) => p.test(raw))) {
    return "PAIN_IDENTIFIED";
  }

  // 7. Check history for previous stage progression
  if (history.length > 2) {
    // If pain was already identified in history, advance to solution discussion or buying intent
    const historyText = history.map((m: any) => String(m.message?.conversation || m.text || "")).join(" ");
    if (PAIN_PATTERNS.some((p) => p.test(historyText))) {
      return "SOLUTION_DISCUSSION";
    }
    return "DISCOVERY";
  }

  return isSupportConfig ? "EXISTING_CUSTOMER_SUPPORT" : "NEW_INQUIRY";
}

export const detectSalesStage = determineSalesStage;

/**
 * Builds the sales momentum prompt policy injected into the model context.
 *
 * Directs:
 * - Understand -> Find Pain -> Recommend -> Explain Value -> Close
 * - Stops discovery once pain is clear
 * - Direct answers on buying intent / pricing first
 * - Grounding in configured commercial facts
 * - Never treats business name as customer name
 * - Unknown policy confirmed by team rather than fabricated
 */
export function buildSalesMomentumPromptInstruction(context: SalesMomentumContext): string {
  if (!context.isSalesContext) {
    return `
CUSTOMER SERVICE / SUPPORT POLICY:
- Solve the customer's support or inquiry directly using verified knowledge.
- Do not push unsolicited sales pitches to existing support or complaint inquiries.
- Follow configured human handover or support escalation rules if an issue cannot be resolved.
`.trim();
  }

  return `
WHATSAPP SALES MOMENTUM & COMMERCIAL GROUNDING RULES:
1. Sales Flow: Follow Understand -> Find Pain -> Recommend -> Explain Value -> Close.
2. Stop Discovery When Pain Is Identified: Once the customer's commercial problem or need is known (e.g. low sales, ads not converting, slow response), STOP asking discovery questions. Transition immediately to:
   - What service fits their need
   - What the business will specifically do
   - Commercial value and practical result
   - Next configured action
3. Ask Fewer Questions: Ask at most ONE important question at a time, only when essential for the next step. Do not ask for details already stated (e.g. company name, platform, website, budget, goals, or problems already mentioned).
4. Buying Signals & Direct Answers: Treat questions about price, packages, setup, timeline, payment, deliverables, and start steps as strong buying intent. Answer the question DIRECTLY first, then provide the simplest next action.
5. Entity Identity Separation:
   - If the customer mentions a brand, website, business name, or platform (such as "Starts Digital", "Shopify", "LuxWear"), NEVER treat that as the customer's personal name.
   - Address the customer by personal name ONLY if an explicit human name was given (e.g. "My name is Bilal"). If no personal name is known, address them naturally without guessing.
6. Pricing & Commercial Fact Authority:
   - Configured business instructions, catalog, and pricing are strictly authoritative.
   - NEVER invent fees, discounts, minimums, percentage terms, or guarantees.
   - For performance fees: use the configured business rule for total attributable sales/revenue. Do NOT invent a restriction that fees apply only to courier-delivered/collected orders unless explicitly stated in business configuration.
7. Unknown Policies: If a specific policy, term, or condition is not in configured business knowledge, state naturally that the team needs to confirm that specific point. Do not guess an "industry standard".
8. Native WhatsApp Structure:
   - Short paragraphs (1-3 sentences max).
   - Blank line between distinct thoughts.
   - Bullets each on separate lines.
   - WhatsApp *bold* for emphasis. No markdown headings (#) or tables.
   - Keep answers concise (roughly 20-80 words). Never cut off thoughts midway.
`.trim();
}

/**
 * Answers a direct pricing question using configured business pricing.
 * Preserves the exact configured basis (e.g. total attributable order value).
 */
export function formatDirectPricingAnswer(customerQuestion: string, configuredPricing: string): string {
  const clean = String(configuredPricing || "").trim();
  if (!clean) {
    return "Our team will confirm the exact pricing package tailored to your business.";
  }
  return clean;
}

/**
 * Answers a buying intent signal directly first before providing the next conversion step.
 */
export function formatDirectBuyingSignalAnswer(customerQuestion: string, configuredAnswer: string): string {
  return String(configuredAnswer || "").trim();
}

/**
 * Checks if a question pertains to a policy that might not be configured,
 * requiring explicit team confirmation rather than model fabrication.
 */
export function isUnknownPolicyQuery(question: string): boolean {
  const text = String(question || "").toLowerCase();
  return /\b(guarantee|100%|money back|refund policy|penalty|legal agreement|chargeback|sla)\b/i.test(text);
}
