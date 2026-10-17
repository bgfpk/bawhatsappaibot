/**
 * Customer 360 Continuous Learning & AI Extraction Service
 *
 * Automatically extracts structured business intelligence, sales context,
 * and customer preferences from customer conversations progressively.
 *
 * Architecture:
 * 1. Primary Layer: AI Structured Semantic Extraction (server-side LLM provider)
 * 2. Secondary / Fallback Layer: Deterministic Conservative Extractor
 * 3. Core Engine: Strict 4-tier Authority Merging, Field-Level Provenance,
 *    Timestamp-based Concurrency Guard, Negation Safety, and $0 Billing Impact.
 */

import { compactAiText } from "./ai-cost-control-service.ts";

export type Customer360FactSource =
  | "manual_verified"
  | "explicit_statement"
  | "order_data"
  | "conversational_inference";

export interface Customer360FactProvenance {
  value: any;
  source: Customer360FactSource;
  confidence: number;
  updatedAt: number;
  sourceMessageId?: string;
  isSuperseded?: boolean;
  supersededBy?: any;
  supersededAt?: number;
  refutationStatement?: string;
  isActive?: boolean;
}

export interface Customer360Correction {
  field: "name" | "business" | "budget" | "phone" | "requirement" | "other";
  refutedValue?: string;
  correctedValue?: string;
  rawStatement: string;
  timestamp?: number;
}

export interface Customer360KnownBusiness {
  name: string;
  type?: string;
  isActive?: boolean;
}

export interface Customer360BusinessContext {
  businessName?: string;
  businessType?: string;
  businessSize?: string;
  website?: string;
  social?: string;
  knownBusinesses?: Customer360KnownBusiness[];
  activeBusiness?: string;
}

export interface Customer360SalesContext {
  productInterest?: string;
  interestedProducts?: string[];
  requirements?: string[];
  budget?: string;
  quantity?: string;
  intendedUse?: string;
  purchaseTimeframe?: string;
  buyingStage?: "inquiry" | "evaluating" | "ready_to_buy" | "price_sensitive" | "post_purchase";
  questions?: string[];
  objections?: string[];
  preferredOption?: string;
  requestedPricing?: boolean;
}

export interface Customer360OrderSupportContext {
  existingOrderReference?: string;
  deliveryConcerns?: string;
  supportIssue?: string;
  requestedFollowUp?: string;
  preferredContactTime?: string;
}

export interface Customer360ConversationIntelligence {
  latestIntent?: string;
  preferredLanguage?: string;
  customerSummary?: string;
  lastExtractedAt?: number;
}

export interface Customer360Data {
  businessContext: Customer360BusinessContext;
  salesContext: Customer360SalesContext;
  orderSupportContext: Customer360OrderSupportContext;
  conversationIntelligence: Customer360ConversationIntelligence;
  provenance: Record<string, Customer360FactProvenance>;
  corrections?: Customer360Correction[];
}

export interface Customer360AiStructuredResult {
  identity?: {
    name?: string | null;
    company?: string | null;
    city?: string | null;
    preferredLanguage?: "en" | "ur" | "roman_urdu" | "ar" | "hi" | "pa" | null;
  };
  business?: {
    businessType?: string | null;
    website?: string | null;
    businessSize?: string | null;
    knownBusinesses?: Array<{ name: string; type?: string | null; isActive?: boolean }>;
    activeBusiness?: string | null;
  };
  sales?: {
    productInterest?: string | null;
    interestedProducts?: string[] | null;
    requirements?: string[] | null;
    budget?: string | null;
    quantity?: string | null;
    intendedUse?: string | null;
    purchaseTimeframe?: string | null;
    buyingStage?: "inquiry" | "evaluating" | "ready_to_buy" | "price_sensitive" | "post_purchase" | null;
    objections?: string[] | null;
    questions?: string[] | null;
    preferredOption?: string | null;
    requestedPricing?: boolean | null;
  };
  supportOrder?: {
    suppliedOrderReference?: string | null;
    deliveryConcern?: string | null;
    supportConcern?: string | null;
    requestedFollowUp?: string | null;
  };
  intelligence?: {
    currentIntent?: string | null;
    conciseSummary?: string | null;
  };
  corrections?: Array<{
    factType: "name" | "business" | "budget" | "phone" | "requirement" | "location" | "other";
    refutedValue?: string | null;
    correctedValue?: string | null;
    confidence?: number;
    customerStatement?: string;
    activeTopic?: string | null;
  }>;
  thirdPartyMentions?: Array<{
    name: string;
    role: "competitor" | "portfolio_example" | "supplier" | "contact_person" | "other_company" | "third_party";
  }>;
}

const SOURCE_PRIORITY: Record<Customer360FactSource, number> = {
  manual_verified: 4,
  explicit_statement: 3,
  order_data: 2,
  conversational_inference: 1,
};

function cleanText(value: any, maxLen = 500): string {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

// ---------------------------------------------------------------------------
// AI Structured Extraction Layer
// ---------------------------------------------------------------------------

export const CUSTOMER360_SYSTEM_INSTRUCTION = `You are the Customer360 intelligence extraction engine for BlackArrow.
Your job is to analyze the inbound customer message along with existing customer facts and recent conversational context, and extract strictly structured, non-hallucinated facts.
You must semantically understand natural messages in English, Urdu, Roman Urdu, Arabic, Hindi, Punjabi, and other languages WITHOUT relying on exact phrases, templates, or keyword matching.

CRITICAL RULES:
1. FACTUAL BOUNDEDNESS: Only extract information that the customer has explicitly stated or clearly indicated. If not stated, return null or omit the field. NEVER invent, assume, or manufacture details merely because they would be useful.
2. EXPLICIT FACT VS CONVERSATIONAL INFERENCE:
   - "explicit_statement": Customer directly states a fact (e.g., "My name is Ali", "We are in Lahore", "My budget is $50", "Shop name is ABC Traders").
   - "conversational_inference": Derived conversational context (e.g. customer is asking about pricing -> intent is "price_inquiry"; customer asks for recommendations -> stage is "inquiry").
   - Do NOT save inferences into factual fields (e.g., "I need something affordable" must NOT create a budget of $20 or a location of Lahore).
3. NEGATION HANDLING:
   - If customer says "I don't have a website", website must be null.
   - If customer says "I am not interested in Pro plan", productInterest must NOT be "Pro plan". Instead, record "Pro plan" in objections.
4. BUDGET SAFETY:
   - Only populate budget when money/amount is genuinely stated as the customer's budget (e.g., "My budget is around $50", "Under $100/mo").
   - Mentioning a plan price (e.g. "Your plan is $29") is NOT customer budget.
5. ORDER REFERENCE SAFETY:
   - Only extract an order reference when conversational context clearly identifies an order/tracking/parcel/invoice reference (e.g. "Order #12345", "Tracking ORD-992"). Do not treat arbitrary numbers (like phone numbers, quantities, or prices) as order references.
6. MULTILINGUAL SUPPORT:
   - Accurately understand natural messages in English, Urdu, Roman Urdu, Arabic, Hindi, and Punjabi without phrase lists or templates.
7. NO SENSITIVE PERSONAL ATTRIBUTES:
   - NEVER extract or infer religion, political beliefs, ethnicity, medical conditions, sexual orientation, or financial hardship. Only extract commercial/business relevant context.
8. EXPLICIT CORRECTIONS, REFUTATIONS, AND MULTIPLE BUSINESSES:
   - When customer corrects or refutes a fact:
     (e.g., 'I am not John, I am Robert', 'Mera naam Shamim nahi hai Farhan hai', 'We are not a bakery, we do logistics', 'I do not need Pro plan anymore', 'laysa ismi Ali, ana Tariq'):
     Extract into 'corrections' with 'factType', 'refutedValue', 'correctedValue', 'customerStatement', and 'confidence'.
     If customer merely refutes a fact without giving a new value (e.g., 'I am not Shamim'), set 'refutedValue' and leave 'correctedValue' as null.
   - When customer owns multiple businesses simultaneously (e.g., 'I run an electronics shop and also a clothing boutique'):
     Record both in 'knownBusinesses' with their name and type.
     Determine which business is CURRENTLY being discussed and set 'activeBusiness'.
   - When customer switches topics to discuss another business (e.g., 'Now for my second store ABC...'):
     Set 'activeBusiness' to that business while preserving the other businesses in 'knownBusinesses'.
9. THIRD-PARTY / PORTFOLIO / COMPETITOR CONTAMINATION PROTECTION:
   - Strictly distinguish facts directly about the customer vs entities mentioned as:
     * Examples or portfolio / case studies (e.g., 'I built the website for Careem' -> customer is NOT Careem, customer's company is NOT Careem).
     * Competitors or benchmarks (e.g., 'We want an app like Uber or Daraz' -> customer is NOT Uber or Daraz).
     * Suppliers or vendors (e.g., 'We buy fabric from Nishat Mills' -> customer is NOT Nishat Mills).
     * Third-party contacts or colleagues (e.g., 'My manager Usman asked me to message', 'Talk to Tariq' -> customer is NOT Usman or Tariq).
     * Quoted messages or referrals.
   - Extract any such mentioned third parties into 'thirdPartyMentions' with their name and role ('competitor' | 'portfolio_example' | 'supplier' | 'contact_person' | 'other_company' | 'third_party').
   - NEVER put a third-party person's name in 'identity.name' or a third-party company in 'identity.company'.

Return ONLY a valid JSON object matching this schema:
{
  "identity": {
    "name": "string or null",
    "company": "string or null",
    "city": "string or null",
    "preferredLanguage": "en | ur | roman_urdu | ar | hi | pa | null"
  },
  "business": {
    "businessType": "string or null",
    "website": "string or null",
    "businessSize": "string or null",
    "knownBusinesses": [
      { "name": "string", "type": "string or null", "isActive": true }
    ],
    "activeBusiness": "string or null"
  },
  "corrections": [
    {
      "factType": "name | business | budget | phone | requirement | location | other",
      "refutedValue": "string or null",
      "correctedValue": "string or null",
      "confidence": 0.95,
      "customerStatement": "string",
      "activeTopic": "string or null"
    }
  ],
  "thirdPartyMentions": [
    {
      "name": "string",
      "role": "competitor | portfolio_example | supplier | contact_person | other_company | third_party"
    }
  ],
  "sales": {
    "productInterest": "string or null",
    "interestedProducts": ["string"],
    "requirements": ["string"],
    "budget": "string or null",
    "quantity": "string or null",
    "intendedUse": "string or null",
    "purchaseTimeframe": "string or null",
    "buyingStage": "inquiry | evaluating | ready_to_buy | price_sensitive | post_purchase | null",
    "objections": ["string"],
    "questions": ["string"],
    "preferredOption": "string or null",
    "requestedPricing": boolean or null
  },
  "supportOrder": {
    "suppliedOrderReference": "string or null",
    "deliveryConcern": "string or null",
    "supportConcern": "string or null",
    "requestedFollowUp": "string or null"
  },
  "intelligence": {
    "currentIntent": "string or null",
    "conciseSummary": "string or null"
  },
  "extractedFacts": [
    { "field": "string", "value": "string", "source": "explicit_statement | conversational_inference", "confidence": 0.95 }
  ]
}`;

export function buildCustomer360AiPrompt(input: {
  messageText: string;
  existingCustomer360?: Partial<Customer360Data>;
  recentHistory?: Array<{ role?: string; text?: string }>;
  senderName?: string;
}): string {
  const { messageText, existingCustomer360, recentHistory, senderName } = input;

  const historyLines = (recentHistory || [])
    .slice(-4)
    .map((m) => `[${m.role || "user"}]: ${cleanText(m.text, 200)}`)
    .join("\n");

  const existingFacts = existingCustomer360
    ? {
        business: existingCustomer360.businessContext,
        sales: existingCustomer360.salesContext,
        orderSupport: existingCustomer360.orderSupportContext,
        intelligence: existingCustomer360.conversationIntelligence,
      }
    : {};

  return `EXISTING CUSTOMER 360 FACTS:
${JSON.stringify(existingFacts, null, 2)}

${historyLines ? `RECENT CONVERSATION CONTEXT:\n${historyLines}\n` : ""}${senderName ? `SENDER PUSH NAME: ${senderName}\n` : ""}NEW INBOUND CUSTOMER MESSAGE TO ANALYZE:
"${cleanText(messageText, 1000)}"

Extract customer intelligence now as JSON.`;
}

export function parseCustomer360AiJson(rawOutput: string): Customer360AiStructuredResult | null {
  if (!rawOutput) return null;
  try {
    const cleaned = rawOutput
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/i, "")
      .trim();
    const parsed = JSON.parse(cleaned);
    if (typeof parsed !== "object" || parsed === null) return null;
    return parsed;
  } catch {
    // Attempt relaxed regex extraction if JSON block is wrapped
    const jsonMatch = rawOutput.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (typeof parsed === "object" && parsed !== null) return parsed;
      } catch {}
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Structural Format Validators (Strictly Non-Conversational)
// ---------------------------------------------------------------------------

export function isValidPersonName(name: any): boolean {
  if (!name || typeof name !== "string") return false;
  const clean = cleanText(name);
  if (clean.length < 2 || clean.length > 50) return false;
  if (/^https?:\/\//i.test(clean)) return false;
  if (/^[\d\s+\-().]+$/.test(clean)) return false;
  return true;
}

export function isValidPhoneNumber(phone: any): boolean {
  if (!phone || typeof phone !== "string") return false;
  const digits = String(phone).replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 16;
}

export function isValidOrderReference(ref: any): boolean {
  if (!ref || typeof ref !== "string") return false;
  const clean = cleanText(ref);
  return clean.length >= 4 && clean.length <= 35 && /^[A-Za-z0-9#№_\-:]+$/.test(clean);
}

export function detectLanguage(text: string): string {
  if (!text) return "en";
  if (/[\u0600-\u06FF]/.test(text)) return "ur";
  return "en";
}

// Structural compatibility helpers (No phrase matching - strictly non-conversational)
export function extractCustomerName(text: string): { name: string; source: Customer360FactSource } | null {
  if (isValidPersonName(text)) {
    return { name: cleanText(text), source: "conversational_inference" };
  }
  return null;
}

export function extractBusinessName(text: string): { businessName: string; source: Customer360FactSource } | null {
  const clean = cleanText(text);
  if (clean.length >= 2 && clean.length <= 60 && !/^https?:\/\//i.test(clean)) {
    return { businessName: clean, source: "conversational_inference" };
  }
  return null;
}

export function extractLocation(text: string): { location: string; source: Customer360FactSource } | null {
  const clean = cleanText(text);
  if (clean.length >= 2 && clean.length <= 40) {
    return { location: clean, source: "conversational_inference" };
  }
  return null;
}

export function extractBudget(text: string): string | null {
  const clean = cleanText(text);
  if (/\d/.test(clean) && clean.length <= 30) {
    return clean;
  }
  return null;
}

export function extractBusinessType(_text: string): string | null {
  return null;
}

export function extractBusinessSize(_text: string): string | null {
  return null;
}

export function extractQuantity(_text: string): string | null {
  return null;
}

export function inferBuyingStage(_text: string): "inquiry" | "evaluating" | "ready_to_buy" | "price_sensitive" | "post_purchase" | null {
  return null;
}

export function inferCustomerIntent(_text: string): string | null {
  return null;
}

export function extractOrderReference(text: string): string | null {
  if (isValidOrderReference(text)) return cleanText(text);
  return null;
}

export function extractDeliveryConcerns(_text: string): string | null {
  return null;
}

export function extractSupportIssue(_text: string): string | null {
  return null;
}

export function extractRequestedFollowUp(_text: string): string | null {
  return null;
}

export function extractCustomerCorrections(_text: string, _nowMs = Date.now()): Customer360Correction[] {
  return [];
}

export function extractCustomerCorrection(_text: string, _nowMs = Date.now()): Customer360Correction | null {
  return null;
}

// ---------------------------------------------------------------------------
// Customer360 Profile Serialization & Safe Defaults
// ---------------------------------------------------------------------------

export function createEmptyCustomer360(): Customer360Data {
  return {
    businessContext: {},
    salesContext: {},
    orderSupportContext: {},
    conversationIntelligence: {},
    provenance: {},
  };
}

export function parseCustomer360FromProfile(profile: any): Customer360Data {
  const fallback = createEmptyCustomer360();
  if (!profile) return fallback;

  let raw = profile.customer360;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = null;
    }
  }

  if (!raw || typeof raw !== "object") {
    // Seed initial structure from existing legacy top-level profile fields if present
    const seeded = createEmptyCustomer360();
    if (profile.businessName || profile.company) {
      seeded.businessContext.businessName = cleanText(profile.businessName || profile.company);
      seeded.provenance["businessName"] = {
        value: seeded.businessContext.businessName,
        source: "explicit_statement",
        confidence: 0.8,
        updatedAt: Date.now(),
      };
    }
    if (profile.city || profile.location) {
      seeded.provenance["city"] = {
        value: cleanText(profile.city || profile.location),
        source: "explicit_statement",
        confidence: 0.8,
        updatedAt: Date.now(),
      };
    }
    return seeded;
  }

  return {
    businessContext: {
      businessName: cleanText(raw.businessContext?.businessName),
      businessType: cleanText(raw.businessContext?.businessType),
      businessSize: cleanText(raw.businessContext?.businessSize),
      website: cleanText(raw.businessContext?.website),
      social: cleanText(raw.businessContext?.social),
      knownBusinesses: Array.isArray(raw.businessContext?.knownBusinesses) ? raw.businessContext.knownBusinesses : undefined,
      activeBusiness: cleanText(raw.businessContext?.activeBusiness) || undefined,
    },
    salesContext: {
      productInterest: cleanText(raw.salesContext?.productInterest),
      interestedProducts: Array.isArray(raw.salesContext?.interestedProducts)
        ? raw.salesContext.interestedProducts.map((p: any) => cleanText(p)).filter(Boolean)
        : undefined,
      requirements: Array.isArray(raw.salesContext?.requirements)
        ? raw.salesContext.requirements.map((r: any) => cleanText(r)).filter(Boolean)
        : undefined,
      budget: cleanText(raw.salesContext?.budget),
      quantity: cleanText(raw.salesContext?.quantity),
      intendedUse: cleanText(raw.salesContext?.intendedUse),
      purchaseTimeframe: cleanText(raw.salesContext?.purchaseTimeframe),
      buyingStage: raw.salesContext?.buyingStage,
      questions: Array.isArray(raw.salesContext?.questions)
        ? raw.salesContext.questions.map((q: any) => cleanText(q)).filter(Boolean)
        : undefined,
      objections: Array.isArray(raw.salesContext?.objections)
        ? raw.salesContext.objections.map((o: any) => cleanText(o)).filter(Boolean)
        : undefined,
      preferredOption: cleanText(raw.salesContext?.preferredOption),
      requestedPricing: typeof raw.salesContext?.requestedPricing === "boolean" ? raw.salesContext.requestedPricing : undefined,
    },
    orderSupportContext: {
      existingOrderReference: cleanText(raw.orderSupportContext?.existingOrderReference),
      deliveryConcerns: cleanText(raw.orderSupportContext?.deliveryConcerns),
      supportIssue: cleanText(raw.orderSupportContext?.supportIssue),
      requestedFollowUp: cleanText(raw.orderSupportContext?.requestedFollowUp),
      preferredContactTime: cleanText(raw.orderSupportContext?.preferredContactTime),
    },
    conversationIntelligence: {
      latestIntent: cleanText(raw.conversationIntelligence?.latestIntent),
      preferredLanguage: cleanText(raw.conversationIntelligence?.preferredLanguage),
      customerSummary: cleanText(raw.conversationIntelligence?.customerSummary),
      lastExtractedAt: Number(raw.conversationIntelligence?.lastExtractedAt) || undefined,
    },
    provenance: raw.provenance && typeof raw.provenance === "object" ? raw.provenance : {},
    corrections: Array.isArray(raw.corrections) ? raw.corrections : [],
  };
}

// ---------------------------------------------------------------------------
// Provenance & Authority Enforcement Merge
// ---------------------------------------------------------------------------

/**
 * Merges a field value with strict authority rules:
 * - manual_verified (4) > explicit_statement (3) > order_data (2) > conversational_inference (1)
 * - Source message timestamp concurrency protection prevents older/stale messages from overwriting newer ones.
 */
export function mergeFactWithPriority(
  targetObj: Record<string, any>,
  provenanceMap: Record<string, Customer360FactProvenance>,
  fieldKey: string,
  newValue: any,
  newSource: Customer360FactSource,
  confidence: number,
  sourceMessageTimestampMs: number,
  sourceMessageId?: string
): boolean {
  if (newValue === undefined || newValue === null || newValue === "") return false;

  const existingProv = provenanceMap[fieldKey];
  if (existingProv) {
    const existingScore = SOURCE_PRIORITY[existingProv.source] || 0;
    const newScore = SOURCE_PRIORITY[newSource] || 0;

    // Reject overwrite if existing source has strictly higher authority
    if (existingScore > newScore) {
      return false;
    }

    // Concurrency protection: if same priority and existing fact is newer than incoming message timestamp, reject
    if (existingScore === newScore && existingProv.updatedAt && existingProv.updatedAt > sourceMessageTimestampMs) {
      return false;
    }
  }

  targetObj[fieldKey] = newValue;
  provenanceMap[fieldKey] = {
    value: newValue,
    source: newSource,
    confidence,
    updatedAt: sourceMessageTimestampMs,
    sourceMessageId,
    isActive: true,
    isSuperseded: false,
  };
  return true;
}

// ---------------------------------------------------------------------------
// AI Structured Merge Engine
// ---------------------------------------------------------------------------

export function mergeAiStructuredResultIntoCustomer360(input: {
  c360: Customer360Data;
  aiResult: Customer360AiStructuredResult;
  topLevelPatches: Record<string, any>;
  sourceMessageTimestampMs: number;
  sourceMessageId?: string;
}): boolean {
  const { c360, aiResult, topLevelPatches, sourceMessageTimestampMs, sourceMessageId } = input;
  const prov = c360.provenance;
  let changed = false;

  // Collect third party mentions to protect against contamination
  const thirdPartyNames = new Set<string>();
  if (Array.isArray(aiResult.thirdPartyMentions)) {
    for (const tp of aiResult.thirdPartyMentions) {
      if (tp && tp.name) {
        thirdPartyNames.add(cleanText(tp.name).toLowerCase());
      }
    }
  }

  // 0. Explicit Semantic Corrections & Fact Refutations (HIGHEST PRIORITY)
  if (Array.isArray(aiResult.corrections) && aiResult.corrections.length > 0) {
    if (!Array.isArray(c360.corrections)) {
      c360.corrections = [];
    }
    for (const corr of aiResult.corrections) {
      if (!corr || !corr.factType) continue;
      const factType = corr.factType;
      const refutedValue = cleanText(corr.refutedValue || "");
      const correctedValue = cleanText(corr.correctedValue || "");
      const customerStatement = cleanText(corr.customerStatement || "");

      c360.corrections = c360.corrections.filter(
        (c: any) => !(c.field === factType && c.refutedValue?.toLowerCase() === refutedValue.toLowerCase())
      );
      c360.corrections.push({
        field: factType as any,
        refutedValue: refutedValue || undefined,
        correctedValue: correctedValue || undefined,
        rawStatement: customerStatement,
        timestamp: sourceMessageTimestampMs,
      });

      if (factType === "name") {
        const oldNameFact = prov["name"] || c360.provenance["name"];
        if (oldNameFact) {
          oldNameFact.isSuperseded = true;
          oldNameFact.isActive = false;
          oldNameFact.supersededBy = correctedValue || "refuted";
          oldNameFact.supersededAt = sourceMessageTimestampMs;
          oldNameFact.refutationStatement = customerStatement;
          prov[`name_superseded_${sourceMessageTimestampMs}`] = { ...oldNameFact };
          c360.provenance[`name_superseded_${sourceMessageTimestampMs}`] = { ...oldNameFact };
        }
        if (topLevelPatches.customerName && refutedValue && topLevelPatches.customerName.toLowerCase() === refutedValue.toLowerCase()) {
          delete topLevelPatches.customerName;
        }
        if (correctedValue) {
          topLevelPatches.customerName = correctedValue;
          const fact: Customer360FactProvenance = {
            value: correctedValue,
            source: "explicit_statement",
            confidence: corr.confidence || 0.95,
            updatedAt: sourceMessageTimestampMs,
            sourceMessageId,
            isActive: true,
            isSuperseded: false,
          };
          prov["name"] = fact;
          c360.provenance["name"] = fact;
        } else if (oldNameFact) {
          delete prov["name"];
          delete c360.provenance["name"];
        }
        changed = true;
      } else if (factType === "business") {
        const oldBizFact = prov["businessName"] || c360.provenance["businessName"];
        if (oldBizFact) {
          oldBizFact.isSuperseded = true;
          oldBizFact.isActive = false;
          oldBizFact.supersededBy = correctedValue || "refuted";
          oldBizFact.supersededAt = sourceMessageTimestampMs;
          oldBizFact.refutationStatement = customerStatement;
          prov[`businessName_superseded_${sourceMessageTimestampMs}`] = { ...oldBizFact };
          c360.provenance[`businessName_superseded_${sourceMessageTimestampMs}`] = { ...oldBizFact };
        }
        if (refutedValue && c360.businessContext.businessName?.toLowerCase() === refutedValue.toLowerCase()) {
          delete c360.businessContext.businessName;
        }
        if (correctedValue) {
          c360.businessContext.businessName = correctedValue;
          c360.businessContext.activeBusiness = correctedValue;
          const fact: Customer360FactProvenance = {
            value: correctedValue,
            source: "explicit_statement",
            confidence: corr.confidence || 0.95,
            updatedAt: sourceMessageTimestampMs,
            sourceMessageId,
            isActive: true,
            isSuperseded: false,
          };
          prov["businessName"] = fact;
          c360.provenance["businessName"] = fact;
        } else if (oldBizFact) {
          delete prov["businessName"];
          delete c360.provenance["businessName"];
        }
        changed = true;
      } else if (factType === "requirement") {
        if (refutedValue) {
          const refLower = refutedValue.toLowerCase();
          if (Array.isArray(c360.salesContext.requirements)) {
            c360.salesContext.requirements = c360.salesContext.requirements.filter(
              (r) => !r.toLowerCase().includes(refLower) && !refLower.includes(r.toLowerCase())
            );
          }
          if (Array.isArray(c360.salesContext.interestedProducts)) {
            c360.salesContext.interestedProducts = c360.salesContext.interestedProducts.filter(
              (p) => !p.toLowerCase().includes(refLower) && !refLower.includes(p.toLowerCase())
            );
          }
          if (c360.salesContext.productInterest && (c360.salesContext.productInterest.toLowerCase().includes(refLower) || refLower.includes(c360.salesContext.productInterest.toLowerCase()))) {
            delete c360.salesContext.productInterest;
            delete prov["productInterest"];
            delete c360.provenance["productInterest"];
          }
        }
        changed = true;
      }
    }
  }

  // Collect current refuted values
  const refutedNames = new Set<string>();
  const refutedBusinesses = new Set<string>();
  if (Array.isArray(c360.corrections)) {
    for (const c of c360.corrections) {
      if (c.field === "name" && c.refutedValue) refutedNames.add(cleanText(c.refutedValue).toLowerCase());
      if (c.field === "business" && c.refutedValue) refutedBusinesses.add(cleanText(c.refutedValue).toLowerCase());
    }
  }

  // 1. Identity
  if (aiResult.identity) {
    if (aiResult.identity.name) {
      const cleanName = cleanText(aiResult.identity.name, 50);
      const lower = cleanName.toLowerCase();
      if (cleanName && isValidPersonName(cleanName) && !refutedNames.has(lower) && !thirdPartyNames.has(lower)) {
        if (mergeFactWithPriority(topLevelPatches, prov, "name", cleanName, "explicit_statement", 0.95, sourceMessageTimestampMs, sourceMessageId)) {
          topLevelPatches.customerName = cleanName;
          changed = true;
        }
      }
    }
    if (aiResult.identity.company) {
      const cleanCompany = cleanText(aiResult.identity.company, 60);
      const lower = cleanCompany.toLowerCase();
      if (cleanCompany && !refutedBusinesses.has(lower) && !thirdPartyNames.has(lower)) {
        if (mergeFactWithPriority(c360.businessContext, prov, "businessName", cleanCompany, "explicit_statement", 0.9, sourceMessageTimestampMs, sourceMessageId)) {
          c360.businessContext.businessName = cleanCompany;
          c360.businessContext.activeBusiness = cleanCompany;
          changed = true;
        }
      }
    }
    if (aiResult.identity.city) {
      const cleanCity = cleanText(aiResult.identity.city, 40);
      if (cleanCity && mergeFactWithPriority(topLevelPatches, prov, "city", cleanCity, "explicit_statement", 0.9, sourceMessageTimestampMs, sourceMessageId)) {
        topLevelPatches.location = cleanCity;
        changed = true;
      }
    }
    if (aiResult.identity.preferredLanguage) {
      if (mergeFactWithPriority(c360.conversationIntelligence, prov, "preferredLanguage", aiResult.identity.preferredLanguage, "conversational_inference", 0.9, sourceMessageTimestampMs, sourceMessageId)) {
        changed = true;
      }
    }
  }

  // 2. Business
  if (aiResult.business) {
    if (aiResult.business.businessType) {
      const type = cleanText(aiResult.business.businessType, 50);
      if (type && mergeFactWithPriority(c360.businessContext, prov, "businessType", type, "explicit_statement", 0.85, sourceMessageTimestampMs, sourceMessageId)) {
        changed = true;
      }
    }
    if (aiResult.business.website) {
      const site = cleanText(aiResult.business.website, 100);
      if (site && !/^(no|none|na|n\/a|don't have|website)$/i.test(site) && mergeFactWithPriority(c360.businessContext, prov, "website", site, "explicit_statement", 0.95, sourceMessageTimestampMs, sourceMessageId)) {
        changed = true;
      }
    }
    if (aiResult.business.businessSize) {
      const size = cleanText(aiResult.business.businessSize, 40);
      if (size && mergeFactWithPriority(c360.businessContext, prov, "businessSize", size, "explicit_statement", 0.85, sourceMessageTimestampMs, sourceMessageId)) {
        changed = true;
      }
    }
    if (aiResult.business.activeBusiness) {
      const active = cleanText(aiResult.business.activeBusiness, 60);
      const lower = active.toLowerCase();
      if (active && !refutedBusinesses.has(lower) && !thirdPartyNames.has(lower)) {
        c360.businessContext.activeBusiness = active;
        c360.businessContext.businessName = active;
        if (mergeFactWithPriority(c360.businessContext, prov, "businessName", active, "explicit_statement", 0.9, sourceMessageTimestampMs, sourceMessageId)) {
          changed = true;
        }
      }
    }
    // Multiple businesses owned simultaneously or business switching
    const kbList = (aiResult.business as any).knownBusinesses || (aiResult as any).knownBusinesses;
    if (Array.isArray(kbList) && kbList.length > 0) {
      if (!Array.isArray(c360.businessContext.knownBusinesses)) {
        c360.businessContext.knownBusinesses = [];
      }
      for (const kb of kbList) {
        if (!kb || !kb.name) continue;
        const kbName = cleanText(kb.name, 60);
        const lower = kbName.toLowerCase();
        if (thirdPartyNames.has(lower)) continue;
        const existing = c360.businessContext.knownBusinesses.find((b) => b.name.toLowerCase() === lower);
        const isActive = refutedBusinesses.has(lower) ? false : (typeof kb.isActive === "boolean" ? kb.isActive : true);
        if (existing) {
          existing.isActive = isActive;
          if (kb.type) existing.type = cleanText(kb.type, 50);
        } else {
          c360.businessContext.knownBusinesses.push({
            name: kbName,
            type: kb.type ? cleanText(kb.type, 50) : undefined,
            isActive,
          });
        }
      }
      const activeBiz = c360.businessContext.knownBusinesses.filter((b) => b.isActive).slice(-1)[0];
      if (activeBiz) {
        c360.businessContext.activeBusiness = activeBiz.name;
        c360.businessContext.businessName = activeBiz.name;
      }
      changed = true;
    }
  }

  // 3. Sales
  if (aiResult.sales) {
    if (aiResult.sales.productInterest) {
      const interest = cleanText(aiResult.sales.productInterest, 80);
      if (interest && mergeFactWithPriority(c360.salesContext, prov, "productInterest", interest, "explicit_statement", 0.9, sourceMessageTimestampMs, sourceMessageId)) {
        changed = true;
      }
    }
    if (Array.isArray(aiResult.sales.interestedProducts) && aiResult.sales.interestedProducts.length > 0) {
      const products = aiResult.sales.interestedProducts.map((p) => cleanText(p, 60)).filter(Boolean);
      if (products.length > 0) {
        c360.salesContext.interestedProducts = Array.from(new Set([...(c360.salesContext.interestedProducts || []), ...products]));
        changed = true;
      }
    }
    if (Array.isArray(aiResult.sales.requirements) && aiResult.sales.requirements.length > 0) {
      const reqs = aiResult.sales.requirements.map((r) => cleanText(r, 100)).filter(Boolean);
      if (reqs.length > 0) {
        c360.salesContext.requirements = Array.from(new Set([...(c360.salesContext.requirements || []), ...reqs]));
        changed = true;
      }
    }
    if (aiResult.sales.budget) {
      const budget = cleanText(aiResult.sales.budget, 40);
      if (budget && mergeFactWithPriority(c360.salesContext, prov, "budget", budget, "explicit_statement", 0.95, sourceMessageTimestampMs, sourceMessageId)) {
        changed = true;
      }
    }
    if (aiResult.sales.quantity) {
      const qty = cleanText(aiResult.sales.quantity, 30);
      if (qty && mergeFactWithPriority(c360.salesContext, prov, "quantity", qty, "explicit_statement", 0.9, sourceMessageTimestampMs, sourceMessageId)) {
        changed = true;
      }
    }
    if (aiResult.sales.intendedUse) {
      const use = cleanText(aiResult.sales.intendedUse, 100);
      if (use && mergeFactWithPriority(c360.salesContext, prov, "intendedUse", use, "explicit_statement", 0.85, sourceMessageTimestampMs, sourceMessageId)) {
        changed = true;
      }
    }
    if (aiResult.sales.buyingStage) {
      if (mergeFactWithPriority(c360.salesContext, prov, "buyingStage", aiResult.sales.buyingStage, "conversational_inference", 0.85, sourceMessageTimestampMs, sourceMessageId)) {
        changed = true;
      }
    }
    if (Array.isArray(aiResult.sales.objections) && aiResult.sales.objections.length > 0) {
      const objs = aiResult.sales.objections.map((o) => cleanText(o, 100)).filter(Boolean);
      if (objs.length > 0) {
        c360.salesContext.objections = Array.from(new Set([...(c360.salesContext.objections || []), ...objs]));
        changed = true;
      }
    }
    if (Array.isArray(aiResult.sales.questions) && aiResult.sales.questions.length > 0) {
      const qs = aiResult.sales.questions.map((q) => cleanText(q, 120)).filter(Boolean);
      if (qs.length > 0) {
        c360.salesContext.questions = Array.from(new Set([...(c360.salesContext.questions || []), ...qs]));
        changed = true;
      }
    }
    if (aiResult.sales.preferredOption) {
      const opt = cleanText(aiResult.sales.preferredOption, 80);
      if (opt && mergeFactWithPriority(c360.salesContext, prov, "preferredOption", opt, "explicit_statement", 0.85, sourceMessageTimestampMs, sourceMessageId)) {
        changed = true;
      }
    }
    if (typeof aiResult.sales.requestedPricing === "boolean") {
      c360.salesContext.requestedPricing = aiResult.sales.requestedPricing;
      changed = true;
    }
  }

  // 4. Support & Order
  if (aiResult.supportOrder) {
    if (aiResult.supportOrder.suppliedOrderReference) {
      const ref = cleanText(aiResult.supportOrder.suppliedOrderReference, 40);
      if (ref && mergeFactWithPriority(c360.orderSupportContext, prov, "existingOrderReference", ref, "explicit_statement", 0.95, sourceMessageTimestampMs, sourceMessageId)) {
        changed = true;
      }
    }
    if (aiResult.supportOrder.deliveryConcern) {
      const del = cleanText(aiResult.supportOrder.deliveryConcern, 120);
      if (del && mergeFactWithPriority(c360.orderSupportContext, prov, "deliveryConcerns", del, "explicit_statement", 0.9, sourceMessageTimestampMs, sourceMessageId)) {
        changed = true;
      }
    }
    if (aiResult.supportOrder.supportConcern) {
      const sup = cleanText(aiResult.supportOrder.supportConcern, 120);
      if (sup && mergeFactWithPriority(c360.orderSupportContext, prov, "supportIssue", sup, "explicit_statement", 0.9, sourceMessageTimestampMs, sourceMessageId)) {
        changed = true;
      }
    }
    if (aiResult.supportOrder.requestedFollowUp) {
      const fol = cleanText(aiResult.supportOrder.requestedFollowUp, 100);
      if (fol && mergeFactWithPriority(c360.orderSupportContext, prov, "requestedFollowUp", fol, "explicit_statement", 0.9, sourceMessageTimestampMs, sourceMessageId)) {
        changed = true;
      }
    }
  }

  // 5. Intelligence
  if (aiResult.intelligence) {
    if (aiResult.intelligence.currentIntent) {
      const intent = cleanText(aiResult.intelligence.currentIntent, 50);
      if (intent && mergeFactWithPriority(c360.conversationIntelligence, prov, "latestIntent", intent, "conversational_inference", 0.85, sourceMessageTimestampMs, sourceMessageId)) {
        changed = true;
      }
    }
    if (aiResult.intelligence.conciseSummary) {
      const sum = cleanText(aiResult.intelligence.conciseSummary, 200);
      if (sum) {
        c360.conversationIntelligence.customerSummary = sum;
        changed = true;
      }
    }
  }

  return changed;
}

// ---------------------------------------------------------------------------
// Public Enrichment API (Sync and Async)
// ---------------------------------------------------------------------------

export interface EnrichCustomer360Input {
  botJid?: string;
  customerJid?: string;
  messageText: string;
  role: "user" | "model";
  messageId?: string;
  senderName?: string;
  existingProfile?: any;
  nowMs?: number;
}

export interface EnrichCustomer360AsyncInput extends EnrichCustomer360Input {
  recentHistory?: Array<{ role?: string; text?: string; timestamp?: number }>;
  aiGenerateOverride?: (prompt: string, systemInstruction: string) => Promise<string>;
  customerTurnId?: string;
  providerCallId?: string;
  bypassCache?: boolean;
}

/**
 * Synchronous extractor.
 * Strictly non-conversational: only applies transport metadata (e.g. WhatsApp pushname)
 * when valid and not already established. No regex phrase matching.
 */
export function extractAndMergeCustomer360(input: EnrichCustomer360Input): {
  customer360: Customer360Data;
  topLevelPatches: Record<string, any>;
  hasChanges: boolean;
} {
  const { senderName, existingProfile, messageId } = input;
  const nowMs = input.nowMs || Date.now();

  const c360 = parseCustomer360FromProfile(existingProfile);
  const prov = { ...c360.provenance };
  let hasChanges = false;
  const topLevelPatches: Record<string, any> = {};

  // Transport metadata fallback:
  // Only adopt senderName if provided on transport, valid person name, not refuted, and no explicit name fact exists
  if (senderName && isValidPersonName(senderName) && !prov["name"]) {
    const isRefuted = Array.isArray(c360.corrections) && c360.corrections.some((c) => c.field === "name" && c.refutedValue?.toLowerCase() === senderName.toLowerCase());
    if (!isRefuted) {
      if (mergeFactWithPriority(topLevelPatches, prov, "name", senderName, "conversational_inference", 0.7, nowMs, messageId)) {
        topLevelPatches.customerName = senderName;
        hasChanges = true;
      }
    }
  }

  c360.provenance = prov;
  return {
    customer360: c360,
    topLevelPatches,
    hasChanges,
  };
}
const inFlightSemanticExtractions = new Map<string, Promise<{
  customer360: Customer360Data;
  topLevelPatches: Record<string, any>;
  hasChanges: boolean;
}>>();

const completedSemanticExtractions = new Map<string, {
  result: {
    customer360: Customer360Data;
    topLevelPatches: Record<string, any>;
    hasChanges: boolean;
  };
  timestamp: number;
}>();

export function clearSemanticExtractionCacheForTests() {
  inFlightSemanticExtractions.clear();
  completedSemanticExtractions.clear();
}

/**
 * Asynchronous Primary AI Semantic Understanding Extraction.
 *
 * Runs structured semantic intelligence extraction via server-side LLM provider.
 * Strictly AI-first: understands multilingual messages, active business topics,
 * refutations, and third-party contamination without regex phrase tables.
 * Has $0 direct wallet impact and never blocks incoming WhatsApp chat flows.
 */
export async function extractAndMergeCustomer360Async(input: EnrichCustomer360AsyncInput): Promise<{
  customer360: Customer360Data;
  topLevelPatches: Record<string, any>;
  hasChanges: boolean;
}> {
  const { messageText, role, messageId, senderName, existingProfile, recentHistory, aiGenerateOverride } = input;
  const nowMs = input.nowMs || Date.now();

  if (role !== "user" || !messageText) {
    return extractAndMergeCustomer360(input);
  }

  const dedupKey = String(input.customerTurnId || "").trim();
  if (dedupKey && !input.bypassCache) {
    const cached = completedSemanticExtractions.get(dedupKey);
    if (cached && (Date.now() - cached.timestamp < 300000)) {
      return JSON.parse(JSON.stringify(cached.result));
    }
    const inFlight = inFlightSemanticExtractions.get(dedupKey);
    if (inFlight) {
      return inFlight;
    }
  }

  const runExtraction = async (): Promise<{
    customer360: Customer360Data;
    topLevelPatches: Record<string, any>;
    hasChanges: boolean;
  }> => {
    const c360 = parseCustomer360FromProfile(existingProfile);
    const topLevelPatches: Record<string, any> = {};

    try {
      const prompt = buildCustomer360AiPrompt({
        messageText,
        existingCustomer360: c360,
        recentHistory,
        senderName,
      });

      let rawJson: string | null = null;

      if (typeof aiGenerateOverride === "function") {
        rawJson = await aiGenerateOverride(prompt, CUSTOMER360_SYSTEM_INSTRUCTION);
      } else {
        const { generateBackendText } = await import("./ai-text-provider-service.ts");
        const response = await generateBackendText({
          purpose: "customer_360_extraction",
          stablePrompt: CUSTOMER360_SYSTEM_INSTRUCTION,
          latestCustomerMessage: prompt,
          jsonMode: true,
          customerTurnId: input.customerTurnId,
          providerCallId: input.providerCallId,
          botId: input.botJid,
          customerJid: input.customerJid,
        }).catch(() => null);

        if (response && response.requestStatus === "success" && response.text) {
          rawJson = response.text;
        }
      }

      const aiResult = rawJson ? parseCustomer360AiJson(rawJson) : null;

      if (aiResult) {
        const changed = mergeAiStructuredResultIntoCustomer360({
          c360,
          aiResult,
          topLevelPatches,
          sourceMessageTimestampMs: nowMs,
          sourceMessageId: messageId,
        });

        c360.conversationIntelligence.lastExtractedAt = nowMs;

        return {
          customer360: c360,
          topLevelPatches,
          hasChanges: changed,
        };
      }
    } catch (err: any) {
      // Non-blocking diagnostic log
      console.warn("[Customer360] AI structured extraction error (safe fallback):", err?.message || err);
    }

    // Graceful fallback to non-conversational transport metadata only
    return extractAndMergeCustomer360(input);
  };

  const extractionPromise = runExtraction();

  if (dedupKey && !input.bypassCache) {
    inFlightSemanticExtractions.set(dedupKey, extractionPromise);
    extractionPromise
      .then((res) => {
        inFlightSemanticExtractions.delete(dedupKey);
        completedSemanticExtractions.set(dedupKey, { result: res, timestamp: Date.now() });
        if (completedSemanticExtractions.size > 500) {
          const cutoff = Date.now() - 300000;
          for (const [k, v] of completedSemanticExtractions.entries()) {
            if (v.timestamp < cutoff) completedSemanticExtractions.delete(k);
          }
        }
      })
      .catch(() => {
        inFlightSemanticExtractions.delete(dedupKey);
      });
  }

  return extractionPromise;
}
