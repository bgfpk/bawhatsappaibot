import { unpublishedReplyPrice } from './reply-price-evidence';
import { normalizeBusinessFlow, type BusinessFlow } from "./business-flow-normalizer.ts";
import { isInstructionLikeFieldName } from "./customer-field-guard-service.ts";

export type CustomerReplyFacts = {
  customerName?: string;
  phone?: string;
  customerJid?: string;
  accountId?: string;
  botId?: string;
  source?: string;
  leadStatus?: string;
  dealStage?: string;
  productOrService?: string;
  appointmentDate?: string;
  appointmentTime?: string;
  quantity?: string;
  budget?: string;
  cityOrLocation?: string;
  assignedUser?: string;
  nextFollowUp?: string;
  latestActivity?: string;
  preferences?: string;
  pauseOrHandoff?: string;
  recentNotes?: string;
  recentConversationFacts?: string;
  complaintOrConfusion?: string;
  customFields?: Record<string, string>;
  knownCustomFieldNames?: string[];
  businessFlow: BusinessFlow; businessTrainingText?: string;
};

function clean(value: any, max = 240) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function norm(value: any) {
  return clean(value, 1200).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}

function hasValue(value: any) {
  return clean(value).length > 0;
}

function pick(...values: any[]) {
  return values.find((value) => hasValue(value)) || "";
}

function readCustom(customFields: any, patterns: RegExp[]) {
  for (const [key, value] of Object.entries(customFields || {})) {
    const label = norm(key);
    if (hasValue(value) && patterns.some((pattern) => pattern.test(label))) return clean(value);
  }
  return "";
}

function cleanCustomFields(customFields: any) {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(customFields || {})) {
    const name = clean(key, 80);
    const text = clean(value, 240);
    if (isInstructionLikeFieldName(name)) continue;
    if (name && text) result[name] = text;
  }
  return result;
}

function normalizePhone(value: any) {
  return String(value || "").replace(/\D/g, "").slice(-12);
}

function latestReferencesRememberedProductOrMedia(input: {
  latestUserText?: any;
  knownProductOrService?: any;
  rememberedMediaContextUseful?: boolean;
}) {
  const latest = norm(input.latestUserText);
  const knownProduct = norm(input.knownProductOrService);
  if (!latest) return false;
  if (knownProduct && latest.includes(knownProduct)) return true;
  if (/\b(slimsip|that product|this product|the product|product i sent|product i showed|image i sent|image i shared|photo i sent|photo i shared|remember the product|remember it|did you forget about it|did you forget|that image|this image|that item|this item)\b/.test(latest)) {
    return true;
  }
  return input.rememberedMediaContextUseful === true
    && /\b(product|image|photo|label|package|packaging|brand|item|remember|forget)\b/.test(latest);
}

export function getBusinessVocabulary(businessType: any) {
  const text = norm(businessType);
  const serviceLike = /\b(service|services|lead|leads|clinic|doctor|hospital|appointment|booking|consultation|school|academy|agency|support|repair|salon|visit|meeting|property|estate|marketing)\b/.test(text);
  const productLike = /\b(product|products|ecommerce|e commerce|shop|store|fashion|catalog|retail|order|orders|delivery|cod)\b/.test(text);
  const flow = serviceLike && !productLike ? "service" : normalizeBusinessFlow(text);
  if (flow === "service") {
    return {
      flow,
      serviceLike: true,
      allowedTerms: "service, appointment, timing, doctor/staff, visit, booking, requirement, schedule, address/location, lead/property/marketing when relevant",
      avoidTerms: "product, catalog, shopping, delivery, courier, COD, stock unless explicitly configured",
      neutralHelp: "Aap service ya appointment ke bare mein apna sawal thora clear kar dein.",
    };
  }
  return {
    flow,
    serviceLike: false,
    allowedTerms: "product, catalog, price, order, delivery when relevant and known",
    avoidTerms: "appointment/doctor wording unless the customer asks for a booking",
    neutralHelp: "Aap product/order ke bare mein apna sawal thora clear kar dein.",
  };
}

export function findMatchingCrmLead(leads: any[] = [], input: { customerJid?: string; phone?: string; profile?: any; activeRecord?: any }) {
  const jid = clean(input.customerJid);
  const phone = normalizePhone(input.phone || input.profile?.customerPhone || input.profile?.phone || input.activeRecord?.customerPhone || jid);
  return (leads || []).find((lead) => {
    const leadJid = clean(lead?.customerJid);
    const leadPhone = normalizePhone(lead?.phone || leadJid);
    return (jid && leadJid && leadJid === jid) || (phone && leadPhone && leadPhone.endsWith(phone.slice(-10)));
  }) || null;
}

export function extractKnownCustomerFacts(input: {
  profile?: any;
  activeRecord?: any;
  structuredState?: any;
  crmLead?: any;
  customerJid?: string;
  accountId?: string;
  botId?: string;
  businessType?: any;
}): CustomerReplyFacts {
  const profile = input.profile || {};
  const record = input.activeRecord || {};
  const state = input.structuredState || {};
  const lead = input.crmLead || {};
  const customFields = { ...(profile.customFields || {}), ...(record.customFields || {}), ...(state.customFields || {}) };
  const knownCustomFields = cleanCustomFields(customFields);
  const vocabulary = getBusinessVocabulary(input.businessType || record.businessFlow || profile.business_type);
  const appointmentDate = pick(record.appointmentDate, record.preferredDate, profile.appointmentDate, profile.preferredDate, readCustom(customFields, [/\b(date|day|appointment date|preferred date|booking date|visit date)\b/]));
  const appointmentTime = pick(record.appointmentTime, record.preferredTime, profile.appointmentTime, profile.preferredTime, readCustom(customFields, [/\b(time|slot|timing|appointment time|preferred time|booking time|visit time)\b/]));

  // Customer360 correction protection: never resurrect refuted names or businesses
  const c360Raw = profile.customer360 || record.customer360;
  let c360: any = null;
  if (typeof c360Raw === "string") {
    try { c360 = JSON.parse(c360Raw); } catch {}
  } else if (typeof c360Raw === "object" && c360Raw !== null) {
    c360 = c360Raw;
  }
  const corrections = Array.isArray(c360?.corrections) ? c360.corrections : [];
  const refutedNames = corrections.filter((c: any) => c.field === "name" && c.refutedValue).map((c: any) => String(c.refutedValue).toLowerCase().trim());
  const correctedNameObj = corrections.filter((c: any) => c.field === "name" && c.correctedValue).slice(-1)[0];
  const correctedName = correctedNameObj?.correctedValue;

  const refutedBusinesses = corrections.filter((c: any) => c.field === "business" && c.refutedValue).map((c: any) => String(c.refutedValue).toLowerCase().trim());
  const correctedBizObj = corrections.filter((c: any) => c.field === "business" && c.correctedValue).slice(-1)[0];
  const activeBusiness = c360?.businessContext?.activeBusiness || correctedBizObj?.correctedValue;

  const candidateNames = [correctedName, lead.name, record.customerName, state.customerName, profile.customerName, profile.name, profile.imageContactName, profile.businessCardName].filter(Boolean);
  const validCustomerName = candidateNames.find((n) => !refutedNames.includes(String(n).toLowerCase().trim()));

  const candidateProducts = [activeBusiness, lead.productInterest, record.serviceName, record.productName, state.product, profile.latestProductName, profile.service, profile.companyName, profile.businessName].filter(Boolean);
  const validProductOrService = candidateProducts.find((p) => !refutedBusinesses.includes(String(p).toLowerCase().trim()));

  return {
    customerName: clean(validCustomerName || ""),
    phone: clean(pick(lead.phone, record.customerPhone, state.customerPhone, profile.customerPhone, profile.phone, profile.phoneNumber, profile.whatsapp_number, profile.imageContactPhone, profile.businessCardPhone, input.customerJid)),
    customerJid: clean(input.customerJid),
    accountId: clean(input.accountId),
    botId: clean(input.botId),
    source: clean(pick(lead.latestSource, lead.source, profile.leadSource, profile.source, "WhatsApp")),
    leadStatus: clean(pick(lead.status, profile.leadStatus, profile.status)),
    dealStage: clean(pick(lead.dealStage, profile.dealStage)),
    productOrService: clean(validProductOrService || ""),
    appointmentDate,
    appointmentTime,
    quantity: clean(pick(lead.quantity, record.quantity, state.quantity, profile.quantity)),
    budget: clean(pick(lead.budget, record.budget, state.priceText, profile.budget)),
    cityOrLocation: clean(pick(lead.location, lead.city, record.location, record.cityName, state.location, state.city, profile.location, profile.city, profile.address)),
    assignedUser: clean(pick(lead.assignedTo, profile.assignedTo)),
    nextFollowUp: clean(pick(lead.nextFollowUpAt, profile.nextFollowUpAt)),
    latestActivity: clean(pick(lead.latestActivityAt, profile.lastCustomerMessageAt, profile.lastInteractionAt)),
    preferences: clean(pick(profile.customerReplyPreference, profile.customerPersonaPreference, profile.preferences)),
    pauseOrHandoff: clean(pick(profile.aiPauseReason, profile.handoffReason, profile.customerAiPauseReason)),
    recentNotes: clean(pick(lead.notes, record.notes, profile.notes, profile.customerInstructions), 600),
    recentConversationFacts: clean(pick(profile.chatSummary, lead.summary), 600),
    complaintOrConfusion: "",
    customFields: knownCustomFields,
    knownCustomFieldNames: Object.keys(knownCustomFields),
    businessFlow: vocabulary.flow,
  };
}

export function buildCrmFirstPromptContext(facts: CustomerReplyFacts) {
  const payload = Object.fromEntries(Object.entries(facts).filter(([, value]) => value !== "" && value !== undefined && value !== null));
  const customFields = Object.entries(facts.customFields || {}).map(([key, value]) => `- ${key}: ${value}`).join("\n");
  return [
    "Known CRM/customer data:",
    "CRM/customer structured facts are the source of truth. Summaries are secondary.",
    "Never ask again for a field that is present here. If the customer says they already confirmed something, apologize briefly and use these known facts.",
    facts.phone ? `Customer phone/WhatsApp number is already known: ${facts.phone}. Do not ask for phone/contact/WhatsApp number again.` : "",
    "If an active incomplete record exists, still answer the customer's latest direct question first. Ask one missing field only after the answer, and only if it is still needed.",
    "Fields from WhatsApp profile, business card/image extraction, CRM lead, customer summary, and previous messages count as known fields.",
    JSON.stringify(payload),
    customFields ? `Known custom lead/order fields:\n${customFields}` : "Known custom lead/order fields: none detected.",
    "Customer summary must not override the known CRM/custom/order fields above.",
  ].filter(Boolean).join("\n");
}

export function buildStructuredLeadProfilePatch(input: { facts: CustomerReplyFacts; latestText?: any; nowSeconds?: number }) {
  const facts = input.facts;
  const text = clean(input.latestText, 500);
  const complaint = /\b(already|confirm|confirmed|diya|dia|bata|bataya|de chuka|de chuki|kar to diya|pehle)\b/i.test(text);
  const patch: any = { leadSource: facts.source || "WhatsApp", lastCustomerMessageAt: input.nowSeconds || Math.floor(Date.now() / 1000), lastCustomerMessageText: text, ...(complaint ? { lastCustomerComplaintSignal: text || "customer says details already confirmed" } : {}) };
  if (facts.phone || facts.customerJid) patch.customerPhone = facts.phone || facts.customerJid;
  if (facts.customerName) patch.customerName = facts.customerName;
  if (facts.productOrService) patch.latestProductName = facts.productOrService;
  if (facts.cityOrLocation) { patch.city = facts.cityOrLocation; patch.location = facts.cityOrLocation; }
  return patch;
}

function isShortAffirmation(text: string) { return /^(g|ji|jee|han|haan|yes|ok|okay|theek|thik|done|fine|sure|acha|achha|👍|👌)$/i.test(norm(text)); }
function saysAlreadyConfirmed(text: string) { const key = norm(text); return /\b(time|date|appointment|slot|timing)\b/.test(key) && /\b(confirm|confirmed|diya|dia|bata|bataya|already|pehle)\b/.test(key); }

export function buildDeterministicServiceReply(input: { facts: CustomerReplyFacts; latestText?: any; businessType?: any; language?: any }) {
  const vocabulary = getBusinessVocabulary(input.businessType || input.facts.businessFlow);
  if (!vocabulary.serviceLike || !input.facts.appointmentDate || !input.facts.appointmentTime) return "";
  const text = clean(input.latestText, 500);
  if (!isShortAffirmation(text) && !saysAlreadyConfirmed(text)) return "";
  const service = input.facts.productOrService ? ` for ${input.facts.productOrService}` : "";
  const detail = `aapka appointment${service} ${input.facts.appointmentDate} ko ${input.facts.appointmentTime} ke liye confirm hai`;
  if (saysAlreadyConfirmed(text)) return `Ji, sorry. ${detail}. Agar aap time change karna chahen to bata dein.`;
  return `Ji, ${detail}. Agar aap time change karna chahen to bata dein.`;
}

export function getEchoSimilarityScore(a: string, b: string) {
  const aTokens = new Set(norm(a).split(" ").filter((token) => token.length > 1));
  const bTokens = new Set(norm(b).split(" ").filter((token) => token.length > 1));
  if (!aTokens.size || !bTokens.size) return 0;
  let shared = 0;
  for (const token of aTokens) if (bTokens.has(token)) shared += 1;
  return shared / Math.min(aTokens.size, bTokens.size);
}

function similarity(a: string, b: string) { return getEchoSimilarityScore(a, b); }

export function isMostlyEchoOfLatestCustomerMessage(replyText: any, latestUserText: any) {
  const reply = clean(replyText, 2000);
  const latest = clean(latestUserText, 1000);
  const replyKey = norm(reply);
  const latestKey = norm(latest);
  if (!replyKey || !latestKey) return false;
  if (replyKey === latestKey) return true;
  const score = getEchoSimilarityScore(reply, latest);
  const replyWords = replyKey.split(" ").filter(Boolean).length;
  const latestWords = latestKey.split(" ").filter(Boolean).length;
  const lengthRatio = replyKey.length / Math.max(1, latestKey.length);
  const hasAnswerSignals = /\b(yes|no|sure|thanks|thank you|ji|jee|bilkul|sorry|price|cost|plan|package|available|included|includes|timing|confirm|confirmed|saved|next|help|setup|delivery|order|appointment|service|product|trial|support|details?)\b/i.test(reply);
  const asksUsefulNextQuestion = /\?/.test(reply) && /\b(do you|would you|should i|can i|chahte|chahiye|continue|next|confirm|start|share|help)\b/i.test(reply);
  if ((hasAnswerSignals || asksUsefulNextQuestion) && lengthRatio >= 1.25 && replyWords >= latestWords + 3) return false;
  return score >= 0.94 && lengthRatio <= 1.35;
}

function replyIncludesKnownAppointment(replyText: string, facts: CustomerReplyFacts) {
  const reply = norm(replyText);
  const hasDate = !facts.appointmentDate || reply.includes(norm(facts.appointmentDate));
  const hasTime = !facts.appointmentTime || reply.includes(norm(facts.appointmentTime));
  return hasDate && hasTime;
}
export function isAskingForCustomerNameAgain(replyText: any) {
  const text = clean(replyText, 1200);
  const key = norm(text);
  if (!key || !/\b(name|naam)\b/.test(key)) return false;
  if (/\b(my name|i am|i m|i'm|this is|bot name|assistant name|company name|business name|our name|mera naam|humara naam|hamara naam)\b/i.test(text)) return false;
  if (/\b(thanks|thank you|shukriya|ji|dear)\b.{0,40}\b(name|naam)\b/i.test(text) && !/\b(share|send|provide|tell|confirm|bata|batain|bataen|may i know|what is|what's)\b/i.test(text)) return false;
  return /\b(what is|what's|may i know|can i know|can you|please|kindly|share|send|provide|tell|confirm)\b.{0,50}\b(your\s+)?(name|naam)\b/i.test(text) ||
    /\b(apna|aapka|aap ka|ap ka|your)\b.{0,25}\b(name|naam)\b.{0,40}\b(bata|batain|bataen|share|send|provide|confirm|likh|dein|den)\b/i.test(text) ||
    /\b(name|naam)\b.{0,35}\b(bata|batain|bataen|share|send|provide|confirm|likh|dein|den)\b/i.test(text);
}

export function isAskingForCustomerPhoneAgain(replyText: any) {
  const text = clean(replyText, 1200);
  const key = norm(text);
  if (!key || !/\b(phone|number|mobile|whatsapp|contact|cell|call)\b/.test(key)) return false;
  if (/\b(automates?|automation|messages?|message limit|package|plan|pricing|starter|connect your whatsapp number with the bot|connect whatsapp|linked devices?|whatsapp replies|whatsapp bot|whatsapp automation|daily messages?)\b/i.test(text) && !/\b(share|send|provide|confirm|tell me|may i know|what is|what's)\b/i.test(text)) return false;
  return /\b(please|kindly|can you|could you|share|send|provide|confirm|tell me|may i know|what is|what's)\b.{0,60}\b(your\s+)?(phone|mobile|whatsapp|contact|cell)(\s+number)?\b/i.test(text) ||
    /\b(apna|aapka|aap ka|ap ka|your)\b.{0,30}\b(phone|mobile|whatsapp|contact|cell)(\s+number)?\b.{0,40}\b(share|send|provide|confirm|bata|batain|bataen|dein|den)\b/i.test(text) ||
    /\b(phone|mobile|whatsapp|contact|cell)(\s+number)?\b.{0,40}\b(share|send|provide|confirm|bata|batain|bataen|dein|den)\b/i.test(text);
}

export function hasInventedPricing(replyText: string, trainingText: string = "") {
  const allowsCalculation = /\b(calculate|discount|%|percent|multiply|add|total|tax)\b/i.test(trainingText);
  if (allowsCalculation) return false;

  return unpublishedReplyPrice(replyText,trainingText);
}

export function buildGuardRepairInstruction(reason: string) {
  if (reason === "echo_latest_customer_message") return "The previous answer mostly repeated the customer's latest message. Write a fresh direct answer. Do not quote or mirror the customer except for a tiny phrase when needed. Use business/CRM context, answer first, then ask one useful next question.";
  if (reason === "duplicate_phone_question") return "The previous answer asked for the customer's phone/WhatsApp/contact number again. Do not ask for phone. Answer the customer's latest question directly. Ask at most one useful non-phone follow-up.";
  if (reason === "duplicate_name_question") return "The previous answer asked for the customer's name again. Do not ask for name. If the customer asked the bot/business name, answer that directly. Otherwise answer the customer's latest question and ask at most one non-name follow-up.";
  if (reason === "invented_pricing") return "The previous answer included a price, cost, or fee that is NOT present in the provided business training or CRM data. Do not invent numbers. Only quote prices exactly as written in the training. If pricing is not in the training, naturally tell the customer you don't have the exact price right now.";
  if (reason === "team_confirmation_fallback") return "The previous answer was replaced by a generic team or admin confirmation line. Do not send that. Answer the customer's supported question directly from the business training and latest relevant context.";
  return "Answer the customer's latest message directly and avoid repeating already known CRM/customer facts.";
}

function splitReplyIntoCleanupSegments(replyText: string) {
  return replyText
    .split(/(?<=[.!?])\s+|\n+/)
    .map((segment) => clean(segment, 1200))
    .filter(Boolean);
}

function removeDuplicatePhoneClauseFromSegment(segment: string) {
  const patterns = [
    /(?:^|[\s,;:-])(?:and\s+)?(?:please|kindly|can you|could you|share|send|provide|confirm|tell me|may i know|what(?:'s| is))\b[^.!?\n]{0,120}\b(?:your\s+)?(?:phone|mobile|whatsapp|contact|cell)(?:\s+number)?\b[^.!?\n]{0,80}[?.!]*$/i,
    /(?:^|[\s,;:-])(?:and\s+)?(?:apna|aapka|aap ka|ap ka|your)\b[^.!?\n]{0,40}\b(?:phone|mobile|whatsapp|contact|cell)(?:\s+number)?\b[^.!?\n]{0,80}\b(?:share|send|provide|confirm|bata|batain|bataen|dein|den)\b[^.!?\n]{0,40}[?.!]*$/i,
    /(?:^|[\s,;:-])(?:and\s+)?(?:phone|mobile|whatsapp|contact|cell)(?:\s+number)?\b[^.!?\n]{0,80}\b(?:share|send|provide|confirm|bata|batain|bataen|dein|den)\b[^.!?\n]{0,40}[?.!]*$/i,
  ];
  let next = segment;
  for (const pattern of patterns) {
    next = next.replace(pattern, "");
  }
  return next
    .replace(/\s+,/g, ",")
    .replace(/\s{2,}/g, " ")
    .replace(/[,:;]\s*[.!?]$/g, ".")
    .trim();
}

export function stripDuplicateKnownPhoneQuestionFromReply(replyText: string) {
  const segments = splitReplyIntoCleanupSegments(replyText);
  const kept: string[] = [];
  let removedAny = false;

  for (const segment of segments) {
    if (isAskingForCustomerPhoneAgain(segment)) {
      removedAny = true;
      continue;
    }
    const trimmedSegment = removeDuplicatePhoneClauseFromSegment(segment);
    if (trimmedSegment !== segment) removedAny = true;
    if (trimmedSegment && !isAskingForCustomerPhoneAgain(trimmedSegment)) {
      kept.push(trimmedSegment);
    }
  }

  if (!removedAny) return "";
  return kept
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .trim();
}

function hasCustomerProvidedProductMarketingContext(input: {
  latestUserText?: any;
  businessType?: any;
  allowProductMarketingContext?: boolean;
  latestMediaKind?: string;
  latestMediaContextUseful?: boolean;
  rememberedMediaContextUseful?: boolean;
  knownProductOrService?: any;
}) {
  if (input.allowProductMarketingContext === true) return true;
  const latest = norm(input.latestUserText);
  const businessType = norm(input.businessType);
  const latestHasProductContext = /\b(product|item|image|photo|label|package|packaging|brand)\b/.test(latest);
  const latestHasMarketingContext = /\b(market|marketing|sell|sale|promot|campaign|advertis|business)\b/.test(latest);
  const latestHasRememberedContext = latestReferencesRememberedProductOrMedia({
    latestUserText: input.latestUserText,
    knownProductOrService: input.knownProductOrService,
    rememberedMediaContextUseful: input.rememberedMediaContextUseful,
  });
  const businessAllowsMarketingContext = /\b(marketing|lead|agency|service|support)\b/.test(businessType);
  const usefulImageContext = input.latestMediaKind === "image" && input.latestMediaContextUseful === true;
  return (
    latestHasRememberedContext
    || (
      businessAllowsMarketingContext && (
    (latestHasProductContext && latestHasMarketingContext)
    || usefulImageContext
      )
    )
  );
}

function containsServiceBusinessFulfillmentTerms(value: any) {
  const text = norm(value);
  return /\b(catalog|shopping|courier|cash on delivery|delivery|deliver|cod|stock|shipping|ship|dispatch|checkout|cart|buy now|place order|place an order|order now|nationwide delivery)\b/.test(text);
}

function contextAllowsServiceBusinessFulfillmentTerms(input: {
  latestUserText?: any;
  facts: CustomerReplyFacts;
}) {
  const latest = norm(input.latestUserText);
  const training = norm(input.facts.businessTrainingText);
  return /\b(catalog|shopping|courier|cash on delivery|delivery|deliver|cod|stock|shipping|ship|dispatch|order)\b/.test(latest)
    || /\b(catalog|shopping|courier|cash on delivery|delivery|deliver|cod|stock|shipping|ship|dispatch|order)\b/.test(training);
}

function containsAllowedServiceBusinessProductContext(value: any) {
  const text = norm(value);
  return /\b(product|service|package|plan|automation|whatsapp|marketing|business|details?|features?)\b/.test(text);
}

export function canUseOriginalServiceBusinessReplyAfterGuardFailure(input: {
  replyText: string;
  latestUserText?: any;
  facts: CustomerReplyFacts;
  businessType?: any;
  allowProductMarketingContext?: boolean;
  latestMediaKind?: string;
  latestMediaContextUseful?: boolean;
  rememberedMediaContextUseful?: boolean;
}) {
  const reply = clean(input.replyText, 2000);
  if (!reply || containsServiceBusinessFulfillmentTerms(reply)) return false;
  const latest = norm(input.latestUserText);
  const training = norm(input.facts.businessTrainingText);
  const allowProductMarketingContext = hasCustomerProvidedProductMarketingContext(input);
  const latestReferencesRememberedContext = latestReferencesRememberedProductOrMedia({
    latestUserText: input.latestUserText,
    knownProductOrService: input.facts.productOrService,
    rememberedMediaContextUseful: input.rememberedMediaContextUseful,
  });
  const latestBusinessQuestion = /\b(product|service|services|package|plan|business|automation|whatsapp|marketing|details?|features?)\b/.test(latest);
  const trainingHasSoftProductContext = /\b(product|service|package|plan|automation|whatsapp|marketing)\b/.test(training);
  const knownProduct = norm(input.facts.productOrService);
  const replyHasAllowedContext = containsAllowedServiceBusinessProductContext(reply)
    || (Boolean(knownProduct) && norm(reply).includes(knownProduct));
  return replyHasAllowedContext && (
    latestBusinessQuestion
    || trainingHasSoftProductContext
    || allowProductMarketingContext
    || latestReferencesRememberedContext
    || Boolean(knownProduct)
  );
}

export function guardCustomerReply(input: {
  replyText: string;
  latestUserText?: any;
  facts: CustomerReplyFacts;
  businessType?: any;
  allowProductMarketingContext?: boolean;
  latestMediaKind?: string;
  latestMediaContextUseful?: boolean;
  rememberedMediaContextUseful?: boolean;
}) {
  const reply = clean(input.replyText, 2000);
  const latest = clean(input.latestUserText, 1000);
  const vocabulary = getBusinessVocabulary(input.businessType || input.facts.businessFlow);
  const replyKey = norm(reply);
  const latestKey = norm(latest);
  const hasActiveContext = Boolean(input.facts.productOrService || input.facts.appointmentDate || input.facts.appointmentTime || input.facts.cityOrLocation || Object.keys(input.facts.customFields || {}).length > 0);
  const isGenericProductFallback = /\b(business\s*\/\s*product|business product|sirf business|only help with business|product,\s*price|price ya delivery|order,?\s*or delivery)\b/i.test(reply);
  const allowProductMarketingContext = hasCustomerProvidedProductMarketingContext(input);
  const latestReferencesRememberedContext = latestReferencesRememberedProductOrMedia({
    latestUserText: input.latestUserText,
    knownProductOrService: input.facts.productOrService,
    rememberedMediaContextUseful: input.rememberedMediaContextUseful,
  });
  const replyHasFulfillmentTerms = containsServiceBusinessFulfillmentTerms(reply);
  const latestAllowsFulfillmentTerms = contextAllowsServiceBusinessFulfillmentTerms({
    latestUserText: input.latestUserText,
    facts: input.facts,
  });
  const replyHasDescriptiveImageTerms = /\b(product|label|package|packaging|brand|ingredients?|benefits?|marketing|campaign|promot|sell)\b/i.test(reply);
  const latestAskedForHuman = /\b(human|admin|manager|owner|agent|representative|call me|talk to someone|insan|admin se baat|manager se baat|owner se baat)\b/i.test(latest);
  const replyHasTeamFallback = /\b(forwarded this to the team|needs confirmation from the team|forwarded this to the admin|sent this to the admin|team se confirmation|admin ko bhej|admin ko forward)\b/i.test(reply);
  const block = (reason: string) => ({ blocked: true, reason, replyText: "" });
  if (latest && replyKey && isMostlyEchoOfLatestCustomerMessage(reply, latest)) return block("echo_latest_customer_message");
  if (replyHasTeamFallback && !latestAskedForHuman) return block("team_confirmation_fallback");
  if (isGenericProductFallback && (vocabulary.serviceLike || hasActiveContext || !/\b(product|products|ecommerce|shop|store|fashion|catalog|retail|delivery)\b/i.test(clean(input.businessType)))) return block("generic_product_fallback_not_contextual");
  if (
    vocabulary.serviceLike
    && replyHasFulfillmentTerms
    && !/\b(delivery address|property|properties|medical product|medicine)\b/i.test(reply)
    && !(allowProductMarketingContext && (
      (replyHasDescriptiveImageTerms && !replyHasFulfillmentTerms)
      || latestAllowsFulfillmentTerms
    ))
    && !(latestReferencesRememberedContext && replyHasDescriptiveImageTerms && !replyHasFulfillmentTerms)
  ) return block("service_business_product_wording");
  const asks = /\?|\b(which|what|when|where|please share|kindly share|bata|batain|prefer|chahiye|chahte|share|send|provide|confirm|may i know|can you)\b/i.test(reply);
  if (asks) {
    if ((input.facts.appointmentDate && input.facts.appointmentTime) && /\b(date|time|slot|timing|appointment)\b/i.test(reply) && !replyIncludesKnownAppointment(reply, input.facts)) return block("duplicate_appointment_question");
    if (input.facts.cityOrLocation && /\b(city|location|address|area|kahan|kidhar)\b/i.test(reply) && /\b(share|send|provide|confirm|bata|batain|where|what|which)\b/i.test(reply)) return block("duplicate_location_question");
    if (input.facts.productOrService && /\b(product|service|requirement|interest|kis cheez|which item)\b/i.test(reply) && /\b(share|send|provide|confirm|bata|batain|which|what)\b/i.test(reply)) return block("duplicate_interest_question");
    if (input.facts.customerName && isAskingForCustomerNameAgain(reply)) return block("duplicate_name_question");
    if (input.facts.phone && isAskingForCustomerPhoneAgain(reply)) return block("duplicate_phone_question");
    if (input.facts.budget && /\b(budget|range)\b/i.test(reply) && /\b(share|send|provide|confirm|bata|batain|what|which)\b/i.test(reply)) return block("duplicate_budget_question");
    if (input.facts.quantity && /\b(quantity|qty|kitne|pieces?)\b/i.test(reply) && /\b(share|send|provide|confirm|bata|batain|how many|kitne)\b/i.test(reply)) return block("duplicate_quantity_question");
    for (const fieldName of input.facts.knownCustomFieldNames || []) {
      const normalizedField = norm(fieldName);
      if (normalizedField && replyKey.includes(normalizedField) && /\b(please|kindly|share|send|provide|confirm|bata|batain|what|which)\b/i.test(reply)) return block("duplicate_custom_field_question");
    }
  }
  if (input.facts.businessTrainingText && hasInventedPricing(reply, input.facts.businessTrainingText)) {
    return block("invented_pricing");
  }
  return { blocked: false, reason: "", replyText: reply };
}
