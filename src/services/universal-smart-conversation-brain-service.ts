import {
  DEFAULT_SMART_BRAIN_RESULT,
  SMART_BRAIN_BUSINESS_TYPES,
  SMART_BRAIN_INTENTS,
  SMART_BRAIN_LEAD_QUALITIES,
  SMART_BRAIN_NEXT_BEST_ACTIONS,
  SMART_BRAIN_REPLY_STYLES,
  SMART_BRAIN_RISK_LEVELS,
  SMART_BRAIN_STAGES,
  type SmartBrainBusinessType,
  type SmartBrainDefaultInput,
  type SmartBrainLogSummary,
  type UniversalSmartConversationBrainResult,
} from "./universal-smart-conversation-brain-schema.ts";
import { compactAiText } from "./ai-cost-control-service.ts";
import type { GeminiProviderContext } from "./gemini-provider-service.ts";
import { generateBackendText } from "./ai-text-provider-service.ts";

const MAX_STRING_LENGTH = 180;
const MAX_CACHE_KEY_LENGTH = 80;
const MAX_ARRAY_ITEMS = 8;
const MAX_CONTEXT_KEYS = 10;
const MAX_CONTEXT_VALUE_LENGTH = 120;
const MAX_RECENT_MESSAGES = 6;

export type SmartBrainRecentMessage = {
  role: string;
  text: string;
};

export type GenerateSmartBrainPlanInput = SmartBrainDefaultInput & {
  latestText?: any;
  recentMessages?: SmartBrainRecentMessage[];
  businessInstructions?: any;
  customerSummary?: any;
  productOrServiceMatches?: any[];
  safeFlags?: Record<string, any>;
  providerContext?: GeminiProviderContext;
};

export type SmartBrainPlanResult = {
  result: UniversalSmartConversationBrainResult;
  generated: boolean;
  skippedReason: string;
  parseFailed: boolean;
  model: string;
  durationMs: number;
  errorReason: string;
};

export type SmartBrainGuidanceDecision = {
  useGuidance: boolean;
  reason: string;
};

export type SmartBrainIntelligenceDecision = {
  save: boolean;
  reason: string;
  limited: boolean;
};

const brainServiceDeps = {
  generateBackendText,
};

export function __setSmartBrainServiceTestDeps(overrides: Partial<typeof brainServiceDeps>) {
  Object.assign(brainServiceDeps, overrides || {});
}

export function __resetSmartBrainServiceTestDeps() {
  Object.assign(brainServiceDeps, {
    generateBackendText,
  });
}

function clean(value: any) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function truncate(value: any, limit = MAX_STRING_LENGTH) {
  const text = clean(value);
  return text.length > limit ? text.slice(0, limit).trim() : text;
}

function enumValue<T extends readonly string[]>(value: any, allowed: T, fallback: T[number]): T[number] {
  const text = clean(value).toLowerCase();
  return (allowed as readonly string[]).includes(text) ? text as T[number] : fallback;
}

export function normalizeSmartBrainBusinessType(value: any): SmartBrainBusinessType {
  const text = clean(value).toLowerCase();
  if (["product", "products", "store", "shop", "retail"].includes(text)) return "ecommerce";
  if (["services", "lead", "leads"].includes(text)) return "service";
  if (["doctor", "doctors", "medical", "healthcare"].includes(text)) return "clinic";
  return enumValue(text, SMART_BRAIN_BUSINESS_TYPES, "other");
}

export function clampSmartBrainConfidence(value: any) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(1, Math.max(0, numeric));
}

export function sanitizeSmartBrainStringArray(value: any, limit = MAX_ARRAY_ITEMS) {
  const items = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const text = truncate(item);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
    if (result.length >= limit) break;
  }
  return result;
}

export function sanitizeSmartBrainContextObject(value: any) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, string | number | boolean | null> = {};
  for (const [rawKey, rawValue] of Object.entries(value).slice(0, MAX_CONTEXT_KEYS)) {
    const key = truncate(rawKey, 50).replace(/[^a-zA-Z0-9_:-]+/g, "_");
    if (!key) continue;
    if (typeof rawValue === "boolean" || rawValue === null) {
      result[key] = rawValue === null ? null : Boolean(rawValue);
    } else if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
      result[key] = Number(rawValue);
    } else {
      const text = truncate(rawValue, MAX_CONTEXT_VALUE_LENGTH);
      if (text) result[key] = text;
    }
  }
  return result;
}

export function buildSmartBrainStableContextKey(input: { businessType?: any; version?: any } = {}) {
  const businessType = normalizeSmartBrainBusinessType(input.businessType);
  const version = truncate(input.version || "phase_b", 24).replace(/[^a-zA-Z0-9_-]+/g, "_") || "phase_b";
  return `smart_brain:${version}:${businessType}`.slice(0, MAX_CACHE_KEY_LENGTH);
}

export function sanitizeSmartBrainResult(raw: any): UniversalSmartConversationBrainResult {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    ...DEFAULT_SMART_BRAIN_RESULT,
    business_type: normalizeSmartBrainBusinessType(source.business_type),
    intent: enumValue(source.intent, SMART_BRAIN_INTENTS, DEFAULT_SMART_BRAIN_RESULT.intent),
    stage: enumValue(source.stage, SMART_BRAIN_STAGES, DEFAULT_SMART_BRAIN_RESULT.stage),
    risk_level: enumValue(source.risk_level, SMART_BRAIN_RISK_LEVELS, DEFAULT_SMART_BRAIN_RESULT.risk_level),
    lead_quality: enumValue(source.lead_quality, SMART_BRAIN_LEAD_QUALITIES, DEFAULT_SMART_BRAIN_RESULT.lead_quality),
    missing_required_fields: sanitizeSmartBrainStringArray(source.missing_required_fields),
    missing_optional_fields: sanitizeSmartBrainStringArray(source.missing_optional_fields),
    next_best_action: enumValue(source.next_best_action, SMART_BRAIN_NEXT_BEST_ACTIONS, DEFAULT_SMART_BRAIN_RESULT.next_best_action),
    recommended_reply_style: enumValue(source.recommended_reply_style, SMART_BRAIN_REPLY_STYLES, DEFAULT_SMART_BRAIN_RESULT.recommended_reply_style),
    facts_to_use: sanitizeSmartBrainStringArray(source.facts_to_use),
    facts_to_avoid: sanitizeSmartBrainStringArray(source.facts_to_avoid),
    product_or_service_matches: sanitizeSmartBrainStringArray(source.product_or_service_matches),
    appointment_or_booking_context: sanitizeSmartBrainContextObject(source.appointment_or_booking_context),
    medical_safety_context: sanitizeSmartBrainContextObject(source.medical_safety_context),
    school_admission_context: sanitizeSmartBrainContextObject(source.school_admission_context),
    service_quote_context: sanitizeSmartBrainContextObject(source.service_quote_context),
    handoff_reason: truncate(source.handoff_reason),
    follow_up_reason: truncate(source.follow_up_reason),
    confidence: clampSmartBrainConfidence(source.confidence),
    should_use_flash: typeof source.should_use_flash === "boolean" ? source.should_use_flash : true,
    should_handoff: source.should_handoff === true,
    should_skip_reply: source.should_skip_reply === true,
    cache_context_key: truncate(source.cache_context_key, MAX_CACHE_KEY_LENGTH),
  };
}

export function createDefaultSmartBrainResult(input: SmartBrainDefaultInput = {}) {
  const activeRecord = input.activeRecord || {};
  const missingFields = Array.isArray(activeRecord?.missingFields)
    ? activeRecord.missingFields
    : (Array.isArray(activeRecord?.missingCustomFields) ? activeRecord.missingCustomFields : []);
  return sanitizeSmartBrainResult({
    ...DEFAULT_SMART_BRAIN_RESULT,
    business_type: normalizeSmartBrainBusinessType(input.businessType),
    stage: missingFields.length > 0 ? "waiting" : "new",
    missing_required_fields: missingFields,
    next_best_action: missingFields.length > 0 ? "ask_one_field" : "answer",
    cache_context_key: input.cacheContextKey || buildSmartBrainStableContextKey({ businessType: input.businessType }),
  });
}

export function summarizeSmartBrainForLog(result: UniversalSmartConversationBrainResult): SmartBrainLogSummary {
  const safe = sanitizeSmartBrainResult(result);
  return {
    business_type: safe.business_type,
    intent: safe.intent,
    stage: safe.stage,
    risk_level: safe.risk_level,
    lead_quality: safe.lead_quality,
    next_best_action: safe.next_best_action,
    confidence: safe.confidence,
    enabled: false,
    source: "phase_a_default",
    reason: "logging_only_no_behavior_change",
  };
}

export function summarizeSmartBrainPlanForLog(plan: SmartBrainPlanResult) {
  const safe = sanitizeSmartBrainResult(plan.result);
  return {
    business_type: safe.business_type,
    intent: safe.intent,
    stage: safe.stage,
    risk_level: safe.risk_level,
    lead_quality: safe.lead_quality,
    next_best_action: safe.next_best_action,
    confidence: safe.confidence,
    should_handoff: safe.should_handoff,
    should_use_flash: safe.should_use_flash,
    enabled: plan.generated,
    model: truncate(plan.model, 80),
    generated: plan.generated,
    skipped_reason: truncate(plan.skippedReason, 80),
    parse_failed: plan.parseFailed,
    duration_ms: Math.max(0, Math.round(Number(plan.durationMs || 0))),
    source: plan.generated ? "phase_b_flash_lite" : "phase_b_default",
    reason: plan.generated ? "logging_only_no_behavior_change" : (plan.skippedReason || "logging_only_no_behavior_change"),
  };
}

function compactBrainTextForSafety(result: UniversalSmartConversationBrainResult) {
  return [
    result.business_type,
    result.intent,
    result.stage,
    result.next_best_action,
    result.recommended_reply_style,
    result.handoff_reason,
    result.follow_up_reason,
    ...result.facts_to_use,
    ...result.facts_to_avoid,
    ...result.missing_required_fields,
    ...Object.values(result.medical_safety_context || {}).map(String),
    ...Object.values(result.school_admission_context || {}).map(String),
    ...Object.values(result.service_quote_context || {}).map(String),
  ].join(" ").toLowerCase();
}

function hasUnsafeSmartBrainClaims(result: UniversalSmartConversationBrainResult) {
  const safetyText = compactBrainTextForSafety(result);
  const medicalBusiness = ["clinic", "hospital"].includes(result.business_type);
  if (medicalBusiness && /\b(diagnos|treat|treatment|dosage|dose|medicine|medication|emergency|urgent care|er|icu|chest pain|bleeding|unconscious)\b/i.test(safetyText)) {
    return "unsafe_medical_guidance";
  }
  if (/\b(in stock|stock is|available stock|price is|fee is|admission approved|seat confirmed|exact quote|guarantee|guaranteed|roas|ranking)\b/i.test(safetyText)) {
    return "unverified_claim_risk";
  }
  return "";
}

export function getSmartBrainGuidanceDecision(input: SmartBrainPlanResult | UniversalSmartConversationBrainResult): SmartBrainGuidanceDecision {
  const plan = (input as SmartBrainPlanResult)?.result ? input as SmartBrainPlanResult : null;
  const result = sanitizeSmartBrainResult(plan ? plan.result : input);
  if (plan && !plan.generated) return { useGuidance: false, reason: plan.skippedReason || "not_generated" };
  if (plan?.parseFailed) return { useGuidance: false, reason: "parse_failed" };
  if (result.confidence < 0.78) return { useGuidance: false, reason: "low_confidence" };
  if (result.risk_level === "high") return { useGuidance: false, reason: "high_risk" };
  if (result.should_handoff) return { useGuidance: false, reason: "handoff_requested" };
  if (result.should_skip_reply) return { useGuidance: false, reason: "skip_reply_requested" };
  if (["handoff", "skip_reply"].includes(result.next_best_action)) return { useGuidance: false, reason: "unsafe_next_action" };
  if (!SMART_BRAIN_BUSINESS_TYPES.includes(result.business_type)) return { useGuidance: false, reason: "invalid_business_type" };
  if (!SMART_BRAIN_INTENTS.includes(result.intent)) return { useGuidance: false, reason: "invalid_intent" };
  if (!SMART_BRAIN_STAGES.includes(result.stage)) return { useGuidance: false, reason: "invalid_stage" };
  if (!SMART_BRAIN_NEXT_BEST_ACTIONS.includes(result.next_best_action)) return { useGuidance: false, reason: "invalid_next_action" };

  const safetyText = compactBrainTextForSafety(result);
  const unsafeClaim = hasUnsafeSmartBrainClaims(result);
  if (unsafeClaim) return { useGuidance: false, reason: unsafeClaim };
  if (/\b(refund|payment dispute|legal|court|police|lawsuit|fraud|scam|loan|financial)\b/i.test(safetyText)) {
    return { useGuidance: false, reason: "sensitive_case_needs_caution" };
  }
  return { useGuidance: true, reason: "safe_high_confidence" };
}

export function getSmartBrainIntelligenceDecision(plan: SmartBrainPlanResult): SmartBrainIntelligenceDecision {
  const result = sanitizeSmartBrainResult(plan.result);
  if (!plan.generated) return { save: false, reason: plan.skippedReason || "not_generated", limited: false };
  if (plan.parseFailed) return { save: false, reason: "parse_failed", limited: false };
  if (result.confidence < 0.78) return { save: false, reason: "low_confidence", limited: false };
  if (hasUnsafeSmartBrainClaims(result)) return { save: false, reason: hasUnsafeSmartBrainClaims(result), limited: false };
  if (result.should_skip_reply || result.next_best_action === "skip_reply") return { save: false, reason: "skip_reply_requested", limited: false };
  if (!SMART_BRAIN_BUSINESS_TYPES.includes(result.business_type)) return { save: false, reason: "invalid_business_type", limited: false };
  if (!SMART_BRAIN_INTENTS.includes(result.intent)) return { save: false, reason: "invalid_intent", limited: false };
  if (!SMART_BRAIN_STAGES.includes(result.stage)) return { save: false, reason: "invalid_stage", limited: false };
  if (!SMART_BRAIN_NEXT_BEST_ACTIONS.includes(result.next_best_action)) return { save: false, reason: "invalid_next_action", limited: false };
  const sensitive = result.risk_level === "high" ||
    result.should_handoff ||
    result.next_best_action === "handoff" ||
    /\b(refund|complaint|legal|financial|human_request)\b/i.test(result.intent);
  return { save: true, reason: sensitive ? "safe_limited_sensitive_intelligence" : "safe_intelligence", limited: sensitive };
}

function sanitizeAdminNoteText(value: any, limit = 300) {
  return truncate(value, limit)
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[phone omitted]")
    .replace(/\b(diagnos(?:is|e|ed)?|dosage|dose|treatment|prescription|medicine)\b/gi, "safe handling")
    .replace(/\b(guaranteed?|guarantee|ROAS|ranking|admission approved|seat confirmed|exact quote)\b/gi, "unverified claim")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function firstUseful(value: string[]) {
  return value.map((item) => sanitizeAdminNoteText(item, 80)).find(Boolean) || "";
}

export function buildSmartBrainPrivateAdminNote(resultInput: UniversalSmartConversationBrainResult) {
  const result = sanitizeSmartBrainResult(resultInput);
  const quality = result.lead_quality === "hot" ? "Hot lead" : result.lead_quality === "warm" ? "Warm lead" : "Cold lead";
  const missing = firstUseful(result.missing_required_fields);
  const avoid = firstUseful(result.facts_to_avoid);
  const next = missing
    ? `Next: ask ${missing}.`
    : result.next_best_action === "send_media"
      ? "Next: send relevant media if verified."
      : "Next: ask one useful qualifying question.";
  const intentLabel = result.intent.replace(/_/g, " ");
  const byType: Record<string, string> = {
    ecommerce: `${quality}. Asked about ${intentLabel}. ${next}`,
    service: `${quality}. Needs service quote. ${next}`,
    agency: `${quality}. Interested in marketing service. Next: ask monthly budget and main goal.`,
    clinic: "Appointment inquiry. Keep response safe. Next: ask department/preferred time or hand off if urgent.",
    hospital: "Appointment inquiry. Keep response safe. Next: ask department/preferred time or hand off if urgent.",
    school: "Admission inquiry. Next: confirm class/grade, child age, and campus/visit preference.",
    other: `${quality}. Intent: ${intentLabel}. ${next}`,
  };
  return sanitizeAdminNoteText([byType[result.business_type] || byType.other, avoid ? `Avoid: ${avoid}.` : ""].filter(Boolean).join(" "));
}

export function buildSmartBrainFollowUpReason(resultInput: UniversalSmartConversationBrainResult) {
  const result = sanitizeSmartBrainResult(resultInput);
  const explicit = sanitizeAdminNoteText(result.follow_up_reason, 180);
  if (explicit) return explicit;
  const missing = firstUseful(result.missing_required_fields);
  if (result.business_type === "school") return missing ? `Parent asked admission details but has not shared ${missing}.` : "Parent asked admission details but has not confirmed next step.";
  if (["clinic", "hospital"].includes(result.business_type)) return missing ? `Patient asked appointment info but ${missing} is missing.` : "Patient asked appointment info but preferred time is missing.";
  if (result.business_type === "agency") return missing ? `Agency lead asked about services but ${missing} is missing.` : "Agency lead asked about services but budget is missing.";
  if (result.business_type === "service") return missing ? `Customer needs quotation but ${missing} is missing.` : "Customer needs quotation after sharing service interest.";
  if (result.business_type === "ecommerce") return "Customer asked price but did not confirm order.";
  return missing ? `Customer needs follow-up because ${missing} is missing.` : "";
}

export function buildSmartBrainCustomerIntelligencePatch(plan: SmartBrainPlanResult, nowSeconds = Math.floor(Date.now() / 1000)) {
  const decision = getSmartBrainIntelligenceDecision(plan);
  const result = sanitizeSmartBrainResult(plan.result);
  if (!decision.save) return { patch: {}, decision };
  const safeHandoffReason = sanitizeAdminNoteText(result.handoff_reason, 180);
  const limitedPatch = {
    smartCustomerStage: result.stage,
    smartRiskLevel: result.risk_level,
    ...(safeHandoffReason ? { smartHandoffReason: safeHandoffReason } : {}),
    smartBrainUpdatedAt: nowSeconds,
  };
  if (decision.limited) return { patch: limitedPatch, decision };

  const followUpReason = buildSmartBrainFollowUpReason(result);
  const privateNote = buildSmartBrainPrivateAdminNote(result);
  return {
    patch: {
      smartLeadQuality: result.lead_quality,
      smartCustomerStage: result.stage,
      smartIntent: result.intent,
      smartRiskLevel: result.risk_level,
      smartNextBestAction: result.next_best_action,
      ...(followUpReason ? { smartFollowUpReason: followUpReason } : {}),
      ...(safeHandoffReason ? { smartHandoffReason: safeHandoffReason } : {}),
      ...(privateNote ? { smartPrivateAdminNote: privateNote } : {}),
      smartBrainUpdatedAt: nowSeconds,
    },
    decision,
  };
}

export function isSmartBrainResultUsableForLoggingOnly(result: any) {
  const safe = sanitizeSmartBrainResult(result);
  return Boolean(safe.business_type && safe.intent && safe.stage && safe.risk_level);
}

export function shouldUseBrainGuidance(result: SmartBrainPlanResult | UniversalSmartConversationBrainResult) {
  return getSmartBrainGuidanceDecision(result).useGuidance;
}

export function canSmartBrainOverrideSourceOfTruth(_result?: any) {
  return false;
}

function hasActiveIncompleteRecord(activeRecord: any = {}) {
  const status = clean(activeRecord?.recordStatus || activeRecord?.transactionStatus || activeRecord?.orderStatus).toLowerCase();
  const missing = Array.isArray(activeRecord?.missingFields)
    ? activeRecord.missingFields
    : (Array.isArray(activeRecord?.missingCustomFields) ? activeRecord.missingCustomFields : []);
  return status.includes("incomplete") || missing.length > 0;
}

function classifySmartBrainNeed(input: GenerateSmartBrainPlanInput) {
  const text = clean(input.latestText);
  const normalized = text.toLowerCase();
  if (!text) return { shouldRun: false, reason: "empty_text" };
  if (/^(ok|okay|k|ji|jee|hmm|hm|thanks|thank you|thx|jazakallah|shukriya|yes|no|done)[.!?]*$/i.test(text)) {
    return { shouldRun: false, reason: "trivial_or_filler" };
  }
  if (hasActiveIncompleteRecord(input.activeRecord)) return { shouldRun: true, reason: "active_incomplete_record" };
  const businessType = normalizeSmartBrainBusinessType(input.businessType);
  if (/\b(refund|return|complaint|fraud|scam|fake|legal|court|police|lawsuit|angry|human|agent|manager|owner|representative)\b/i.test(text)) {
    return { shouldRun: true, reason: "complaint_or_handoff_risk" };
  }
  if (/\b(quote|estimate|service|visit|inspection|project|budget|urgent|booking)\b/i.test(text)) {
    return { shouldRun: true, reason: "service_or_quote_inquiry" };
  }
  if (/\b(appointment|doctor|clinic|hospital|department|symptom|pain|emergency)\b/i.test(text) || ["clinic", "hospital"].includes(businessType)) {
    return { shouldRun: true, reason: "medical_or_appointment_inquiry" };
  }
  if (/\b(admission|school|class|grade|curriculum|fee|fees|campus|demo)\b/i.test(text) || businessType === "school") {
    return { shouldRun: true, reason: "school_admission_inquiry" };
  }
  if (/\b(marketing|ads|agency|leads|seo|ranking|roas|campaign|business goal|package)\b/i.test(text) || businessType === "agency") {
    return { shouldRun: true, reason: "agency_lead_inquiry" };
  }
  if (/\b(compare|confused|which one|better|recommend|suggest|interested|buy|order|price|details)\b/i.test(normalized)) {
    return { shouldRun: true, reason: "semantic_buying_or_comparison" };
  }
  return { shouldRun: false, reason: "low_value_for_brain" };
}

export function shouldGenerateSmartBrainPlan(input: GenerateSmartBrainPlanInput) {
  return classifySmartBrainNeed(input);
}

function safeRecentMessages(messages: SmartBrainRecentMessage[] = []) {
  return messages
    .filter((message) => clean(message?.text))
    .slice(-MAX_RECENT_MESSAGES)
    .map((message) => ({
      role: clean(message.role).toLowerCase() === "model" ? "model" : "user",
      text: compactAiText(clean(message.text).replace(/\+?\d[\d\s().-]{7,}\d/g, "[phone omitted]"), 260),
    }));
}

function compactActiveRecord(activeRecord: any = {}) {
  if (!activeRecord || typeof activeRecord !== "object") return {};
  return sanitizeSmartBrainContextObject({
    recordType: activeRecord.recordType,
    recordStatus: activeRecord.recordStatus,
    businessFlow: activeRecord.businessFlow,
    missingFields: Array.isArray(activeRecord.missingFields) ? activeRecord.missingFields.join(", ") : "",
    productOrService: activeRecord.productName || activeRecord.serviceName,
    locationKnown: Boolean(activeRecord.location || activeRecord.cityName || activeRecord.city),
    hasCustomerPhone: Boolean(activeRecord.customerPhone || activeRecord.phone),
    hasAddress: Boolean(activeRecord.deliveryAddress || activeRecord.orderAddress || activeRecord.address),
  });
}

function buildSmartBrainSystemInstruction(businessType: SmartBrainBusinessType) {
  return `
You are BlackArrow's Universal Smart Conversation Brain.
Return only compact JSON matching the requested schema. No markdown, no explanation.
You are backend planning only. You do not write customer-facing replies.

Universal safety:
- Ecommerce: do not invent stock, price, delivery, discount, or courier status.
- Services: do not promise an exact quote or site visit unless the provided context says it is configured.
- Agencies: do not guarantee leads, sales, ranking, ROAS, or results.
- Clinics, hospitals, and doctors: no diagnosis, dosage, emergency medical advice, or treatment claims. Appointment and department triage only. High-risk medical cases should mark handoff.
- Schools: do not invent fees, admission approval, seats, or official policy.
- Complaints, refunds, legal, financial, and other sensitive cases should be cautious and usually mark handoff or Flash handling.

Business type hint: ${businessType}
`.trim();
}

function buildSmartBrainPrompt(input: GenerateSmartBrainPlanInput) {
  const businessType = normalizeSmartBrainBusinessType(input.businessType);
  return `
Return this JSON shape:
{
  "business_type": "ecommerce|service|agency|clinic|hospital|school|other",
  "intent": "price|product|service_quote|appointment|admission|support|complaint|order|booking|follow_up|human_request|general",
  "stage": "new|browsing|interested|comparing|ready|waiting|blocked|handoff_needed",
  "risk_level": "low|medium|high",
  "lead_quality": "cold|warm|hot",
  "missing_required_fields": [],
  "missing_optional_fields": [],
  "next_best_action": "answer|ask_one_field|send_media|save_draft|handoff|skip_reply",
  "recommended_reply_style": "concise|reassuring|qualifying|confirmation|handoff_safe",
  "facts_to_use": [],
  "facts_to_avoid": [],
  "product_or_service_matches": [],
  "appointment_or_booking_context": {},
  "medical_safety_context": {},
  "school_admission_context": {},
  "service_quote_context": {},
  "handoff_reason": "",
  "follow_up_reason": "",
  "confidence": 0,
  "should_use_flash": true,
  "should_handoff": false,
  "should_skip_reply": false,
  "cache_context_key": "${buildSmartBrainStableContextKey({ businessType })}"
}

Compact context:
${JSON.stringify({
    business_type: businessType,
    business_rules_summary: compactAiText(input.businessInstructions || "", 700),
    latest_customer_message: compactAiText(clean(input.latestText), 500),
    recent_messages: safeRecentMessages(input.recentMessages || []),
    active_record: compactActiveRecord(input.activeRecord || {}),
    customer_summary: compactAiText(input.customerSummary || "", 600),
    product_or_service_matches: sanitizeSmartBrainStringArray(input.productOrServiceMatches || [], 5),
    safe_flags: sanitizeSmartBrainContextObject(input.safeFlags || {}),
  })}
`.trim();
}

function parseBrainJson(value: any) {
  const text = clean(value).replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  if (!text) throw new Error("empty_brain_json");
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error("invalid_brain_json");
  }
}

export async function generateSmartBrainPlan(input: GenerateSmartBrainPlanInput): Promise<SmartBrainPlanResult> {
  const startedAt = Date.now();
  const defaultResult = createDefaultSmartBrainResult(input);
  const runDecision = shouldGenerateSmartBrainPlan(input);
  if (!runDecision.shouldRun) {
    return { result: defaultResult, generated: false, skippedReason: runDecision.reason, parseFailed: false, model: "", durationMs: Date.now() - startedAt, errorReason: "" };
  }

  let model = "";
  try {
    const businessType = normalizeSmartBrainBusinessType(input.businessType);
    const providerContext = input.providerContext;
    const response = await brainServiceDeps.generateBackendText({
      purpose: providerContext?.purpose || "universal_smart_brain_plan",
      accountId: providerContext?.accountId || providerContext?.userId,
      botId: providerContext?.botId || providerContext?.dataOwnerKey,
      customerJid: providerContext?.billingContext?.customerJid,
      stablePrompt: buildSmartBrainSystemInstruction(businessType),
      latestCustomerMessage: buildSmartBrainPrompt(input),
      maxTokens: 900,
      jsonMode: true,
    });
    if (response.requestStatus !== "success" || !response.text) {
      const error: any = new Error(response.fallbackReason || response.requestStatus || "deepinfra_unavailable_text_generation_blocked");
      error.code = response.fallbackReason || response.requestStatus || "deepinfra_unavailable_text_generation_blocked";
      throw error;
    }
    model = clean(response.model);
    const rawText = response.text;
    const parsed = parseBrainJson(rawText);
    const result = sanitizeSmartBrainResult({
      ...parsed,
      cache_context_key: parsed?.cache_context_key || buildSmartBrainStableContextKey({ businessType }),
    });
    return { result, generated: true, skippedReason: "", parseFailed: false, model, durationMs: Date.now() - startedAt, errorReason: "" };
  } catch (error: any) {
    const parseFailed = /json|parse/i.test(String(error?.message || error?.code || ""));
    return {
      result: defaultResult,
      generated: false,
      skippedReason: parseFailed ? "parse_failed" : "brain_generation_failed",
      parseFailed,
      model,
      durationMs: Date.now() - startedAt,
      errorReason: truncate(error?.code || error?.message || "unknown", 80),
    };
  }
}
