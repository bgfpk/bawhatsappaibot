import * as dbService from "./db-service.ts";
import { buildCustomerStateSummary, extractCustomerOrderState } from "./customer-state-extractor-service.ts";
import { compactAiText } from "./ai-cost-control-service.ts";
import { buildCompactTimeline } from "./compact-chat-summary-service.ts";
import { getMissingOrderFields } from "./order-required-fields-service.ts";
import { getMissingLeadFields, normalizeRecordType } from "./record-flow-service.ts";
import { filterMissingFieldsAgainstKnownValues, getFieldCollectionLockReason } from "./customer-field-guard-service.ts";

function clean(value: any) {
  return String(value || "").trim();
}

function normalize(value: any) {
  return clean(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeTime(value: any) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : 0;
}

export async function getLatestCustomerOrderState(dataOwnerKey: string, customerJid: string, profile: any = {}) {
  const activeRecord = await dbService.findLatestCustomerRecord(dataOwnerKey, customerJid, profile).catch(() => null);
  if (activeRecord?.order_data) return activeRecord.order_data;

  const latestOrderRef = clean(profile?.latestOrderRef);
  if (latestOrderRef) {
    const byRef = await dbService.findOrder(dataOwnerKey, { orderReference: latestOrderRef }).catch(() => []);
    if (Array.isArray(byRef) && byRef[0]) return byRef[0];
  }

  const phone = clean(profile?.customerPhone || profile?.phone || profile?.phoneNumber || profile?.whatsapp_number);
  if (phone) {
    const byPhone = await dbService.findOrder(dataOwnerKey, { phoneNumber: phone }).catch(() => []);
    if (Array.isArray(byPhone) && byPhone.length > 0) {
      return [...byPhone].sort((a: any, b: any) => {
        return normalizeTime(b?.updatedAt || b?.createdAt || b?.created_at) - normalizeTime(a?.updatedAt || a?.createdAt || a?.created_at);
      })[0];
    }
  }

  return null;
}

export async function buildFreshCustomerChatSummary(input: {
  dataOwnerKey: string;
  customerJid: string;
  profile?: any;
  history?: any[];
  configuredFields?: any[];
}) {
  const profile = input.profile || await dbService.getCustomerProfile(input.dataOwnerKey, input.customerJid).catch(() => null) || {};
  const history = input.history || await dbService.getChatHistory(input.dataOwnerKey, input.customerJid, 60).catch(() => []);
  const latestOrder = await getLatestCustomerOrderState(input.dataOwnerKey, input.customerJid, profile);
  const state = extractCustomerOrderState({ profile, history, latestOrder, configuredFields: input.configuredFields || [] });
  return compactAiText(buildCompleteCustomerSummary({ profile, history, latestOrder, state }), 2500);
}

function summarizeText(value: any, limit = 140) {
  return compactAiText(value, limit);
}

function isMeaningfulSummaryValue(value: any) {
  const normalized = normalize(value);
  return Boolean(normalized) &&
    !["n/a", "na", "unknown", "not provided", "service request"].includes(normalized);
}

function filterPlaceholderMissingFields(missingFields: string[] = []) {
  return missingFields.filter((item) => normalize(item) !== "service");
}

const POST_CONFIRMATION_FULFILLMENT_FIELDS = new Set([
  "tracking id",
  "tracking number",
  "tracking",
  "status",
  "order status",
  "courier status",
  "shipping charge",
  "delivery charge",
]);

function isConfirmedOrder(latestOrder: any, state: any) {
  const status = normalize(latestOrder?.recordStatus || latestOrder?.transactionStatus || latestOrder?.orderStatus || state?.orderStatus);
  return Boolean(
    status.includes("confirm") ||
    status.includes("complete") ||
    latestOrder?.orderReferenceNumber ||
    latestOrder?.orderRefNumber
  );
}

function filterCustomerRequiredMissingFields(missingFields: string[] = [], latestOrder: any = {}, state: any = {}) {
  const reconciled = filterMissingFieldsAgainstKnownValues({ missingFields, latestOrder, state });
  reconciled.ignoredInstructionLike.forEach((field) => console.info(`instruction_like_field_ignored field=${field.slice(0, 80)}`));
  if (reconciled.ignoredKnownValue.length > 0) console.info("summary_missing_fields_ignored reason=crm_has_values");
  const base = filterPlaceholderMissingFields(reconciled.filtered);
  if (!isConfirmedOrder(latestOrder, state)) return base;
  return base.filter((item) => !POST_CONFIRMATION_FULFILLMENT_FIELDS.has(normalize(item)));
}

function deriveConversationFacts(history: any[] = []) {
  const joinedUser = history
    .filter((entry) => normalize(entry?.role) === "user")
    .map((entry) => clean(entry?.text))
    .join("\n");
  const joinedBot = history
    .filter((entry) => normalize(entry?.role) !== "user")
    .map((entry) => clean(entry?.text))
    .join("\n");

  const askedOrderLimit = /\border limit\b/i.test(joinedUser);
  const askedSetup = /\bhow to setup\b|\bhow do i setup\b|\bhow i can set it up\b|\bset it up\b|\bsetup\b/i.test(joinedUser);
  const askedCustomPlan = /\bcustom\s+plan\b/i.test(joinedUser);
  const schoolUseCase = /\b(school|students?|parents?|attendance|homework|leave|leaves|notices?)\b/i.test(joinedUser);
  const starterPricingExplained = /\b300\b/i.test(joinedBot) && /\border/i.test(joinedBot) && /\$?\s*9\s*\/\s*month|\$?\s*9\s*month/i.test(joinedBot);
  const setupGuided = /\bsetup\b|\baccount creation\b|\bqr\b|\btutorial\b/i.test(joinedBot);
  const trialGuided = /\btrial\b/i.test(joinedBot) && /\b7[- ]?day\b/i.test(joinedBot);
  const linksSent = /\bhttps?:\/\/|\bsign\s*up\b|\bsignup\b|\btutorial\b|\bsetup video\b/i.test(joinedBot);

  return {
    interest: (askedCustomPlan && schoolUseCase)
      ? "Custom plan for school parent communication"
      : (askedCustomPlan ? "Custom plan" : (askedOrderLimit || askedSetup || starterPricingExplained)
      ? "BlackArrow Starter plan, order limit, and setup"
      : ""),
    status: (askedCustomPlan && schoolUseCase)
      ? "warm school lead asking setup and custom-plan fit"
      : (trialGuided || askedSetup)
      ? "interested in trial/setup guidance"
      : "",
    pending: (askedCustomPlan && schoolUseCase)
      ? "Ask number of parents/students, expected monthly messages, WhatsApp instances, and whether broadcasts, follow-ups, media, templates, or admin approval are needed."
      : (askedSetup || setupGuided)
      ? "Help customer start setup or answer setup questions."
      : (trialGuided ? "Help customer start the 7-day free trial or answer setup questions." : ""),
    businessUseCase: schoolUseCase ? "School communication" : "",
    requestedNeed: schoolUseCase ? "Parent messaging for attendance, leave updates, homework, and important school notices" : "",
    planInterest: askedCustomPlan ? "Custom plan" : "",
    setupInterest: askedSetup ? "Asked how to set it up" : "",
    linksSent,
    hasContext: askedCustomPlan || schoolUseCase || askedOrderLimit || askedSetup || starterPricingExplained || setupGuided || trialGuided,
  };
}

function scrubPrivateText(value: any, limit = 180) {
  return summarizeText(value, limit)
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[phone omitted]")
    .replace(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi, "[email omitted]")
    .trim();
}

function isUsefulTimelineMessage(entry: any) {
  const text = clean(entry?.text);
  if (!text) return false;
  if (/^voice note received,\s*transcript unavailable\.?$/i.test(text)) return false;
  return !/^(ok|okay|k|ji|jee|hmm|hm|thanks|thank you|thx)[.!?]*$/i.test(text) || normalize(entry?.role) !== "user";
}

function buildMessageByMessageTimeline(history: any[] = [], limit = 8) {
  const useful = history.filter(isUsefulTimelineMessage).slice(-limit);
  const lines: string[] = [];
  for (let index = 0; index < useful.length; index += 1) {
    const entry = useful[index];
    const role = normalize(entry?.role) === "user" ? "Customer" : "Bot/AI";
    const text = scrubPrivateText(entry?.text, 180);
    if (!text) continue;
    lines.push(`${index + 1}. ${role} ${role === "Customer" ? "asked/shared" : "replied"}: "${text}"`);
  }
  return lines;
}

function buildFuturePlanLines(profile: any = {}) {
  const pending = Array.isArray(profile?.plannedCustomerUpdates)
    ? profile.plannedCustomerUpdates.filter((item: any) => item && item.status === "pending")
    : [];
  if (pending.length === 0) return [];

  return pending
    .slice(0, 3)
    .map((item: any) => {
      const scheduledAt = Number(item?.scheduledAt) > 0 ? new Date(Number(item.scheduledAt) * 1000).toISOString() : "";
      const summary = summarizeText(item?.summary || item?.requestedText || item?.message || "Planned follow-up", 120);
      return scheduledAt ? `Ask customer update: ${summary} at ${scheduledAt}` : `Ask customer update: ${summary}`;
    });
}

function formatMissingFields(missingFields: string[] = []) {
  if (missingFields.length === 0) return "";
  if (missingFields.length === 1) return missingFields[0];
  if (missingFields.length === 2) return `${missingFields[0]} and ${missingFields[1]}`;
  return `${missingFields.slice(0, -1).join(", ")}, and ${missingFields[missingFields.length - 1]}`;
}

function resolveMissingFields(latestOrder: any, state: any) {
  const savedMissing = Array.isArray(latestOrder?.missingFields) && latestOrder.missingFields.length > 0
    ? latestOrder.missingFields.map((item: any) => clean(item)).filter(Boolean)
    : (Array.isArray(latestOrder?.missingCustomFields) ? latestOrder.missingCustomFields.map((item: any) => clean(item)).filter(Boolean) : []);
  if (savedMissing.length > 0) return filterCustomerRequiredMissingFields(savedMissing, latestOrder, state);
  if (isConfirmedOrder(latestOrder, state)) return [];
  if (latestOrder?.recordType === "lead") {
    return filterCustomerRequiredMissingFields(getMissingLeadFields(latestOrder), latestOrder, state);
  }
  const hasSavedOrderState = Boolean(
    clean(latestOrder?.customerPhone) ||
    clean(latestOrder?.productName) ||
    clean(latestOrder?.serviceName) ||
    clean(latestOrder?.deliveryAddress) ||
    clean(latestOrder?.location) ||
    clean(latestOrder?.orderReferenceNumber)
  );
  if (!hasSavedOrderState) {
    return filterCustomerRequiredMissingFields(Array.isArray(state?.missingCustomFields) ? state.missingCustomFields : [], latestOrder, state);
  }
  const inferredMissing = getMissingOrderFields(latestOrder || {}, []);
  return inferredMissing.length > 0
    ? filterCustomerRequiredMissingFields(inferredMissing, latestOrder, state)
    : filterCustomerRequiredMissingFields(Array.isArray(state?.missingCustomFields) ? state.missingCustomFields : [], latestOrder, state);
}

function buildPendingLines(input: { profile: any; latestOrder: any; state: any; history?: any[] }) {
  const conversationFacts = deriveConversationFacts(input.history);
  const fieldCollectionLocked = getFieldCollectionLockReason(input);
  const missingFields = resolveMissingFields(input.latestOrder, input.state);
  if (fieldCollectionLocked) console.info(`field_collection_locked reason=${fieldCollectionLocked}`);
  const plannedLines = buildFuturePlanLines(input.profile);
  const lines = [
    !fieldCollectionLocked && missingFields.length > 0 ? `Ask only for ${formatMissingFields(missingFields)}.` : "",
    input.state.confirmationDetected && input.state.orderStatus !== "confirmed" ? "Ask customer to confirm the collected details." : "",
    !conversationFacts.hasContext && input.state.orderStatus === "inquiry" && !input.state.product && !input.state.customerName && !input.state.customerPhone
      ? "Ask customer what they need."
      : "",
    conversationFacts.pending,
    ...plannedLines,
  ].filter(Boolean);
  return { lines, missingFields };
}

export function buildCompleteCustomerSummary(input: {
  profile: any;
  history: any[];
  latestOrder: any;
  state: any;
}) {
  const conversationFacts = deriveConversationFacts(input.history);
  const snapshot = buildCustomerStateSummary(input.state);
  const timeline = buildCompactTimeline({
    history: input.history,
    profile: input.profile,
    latestOrder: input.latestOrder,
    state: input.state,
  });
  const pending = buildPendingLines(input);
  const recordType = normalizeRecordType(input.latestOrder?.recordType, input.latestOrder?.businessFlow);
  const productOrService = isMeaningfulSummaryValue(input.state.product)
    ? `${recordType === "lead" ? "Service" : "Product"}: ${[input.state.product, input.state.variant].filter(Boolean).join(", ")}`
    : "";
  const statusLine = conversationFacts.status || input.state.orderStatus || "collecting details";
  const currentLines = [
    conversationFacts.interest ? `- Interest: ${conversationFacts.interest}` : "",
    statusLine ? `- Status: ${statusLine}` : "",
    productOrService ? `- ${productOrService}` : "",
    isMeaningfulSummaryValue(input.state.priceText) ? `- Price: ${input.state.priceText}` : "",
    isMeaningfulSummaryValue(input.state.paymentMethod) ? `- Payment: ${input.state.paymentMethod}` : "",
    isMeaningfulSummaryValue(input.state.location) ? `- Location: ${input.state.location}` : "",
    isMeaningfulSummaryValue(input.state.address) ? `- Delivery: ${summarizeText(input.state.address, 120)}` : "",
    input.state.latestLanguage ? `- Language: ${input.state.latestLanguage}` : "",
    ...Object.entries(input.state.customFields || {})
      .filter(([key, value]) => isMeaningfulSummaryValue(key) && isMeaningfulSummaryValue(value))
      .slice(0, 8)
      .map(([key, value]) => `- ${key}: ${summarizeText(value, 100)}`),
  ].filter(Boolean);
  const noteLines = [
    pending.missingFields.length > 0 ? `- Missing: ${pending.missingFields.join(", ")}` : "",
    input.state.priceObjectionDetected ? "- Note: price objection detected" : "",
  ].filter(Boolean);

  const finalCurrentLines = currentLines.length > 0
    ? currentLines
    : [
        `- Status: ${input.state.orderStatus || "collecting details"}`,
      ].filter(Boolean);

  const finalPendingLines = pending.lines.length > 0
    ? pending.lines
    : (input.state.orderStatus === "confirmed" || conversationFacts.hasContext ? [] : ["Wait for customer to share the next needed detail."]);
  const currentNeed = conversationFacts.requestedNeed || conversationFacts.interest || (productOrService ? productOrService.replace(/^(Service|Product):\s*/i, "") : "Customer needs help from the business.");
  const missingInfo = pending.missingFields.length > 0
    ? pending.missingFields.join(", ")
    : (conversationFacts.businessUseCase === "School communication"
      ? "number of parents/students, WhatsApp instances, monthly message volume, and broadcast/follow-up/media/template/admin approval needs"
      : "No critical missing info detected from recent messages.");
  const summaryLines = [
    `- Current customer need: ${currentNeed}`,
    `- Current stage: ${statusLine || "collecting details"}`,
    `- Important missing info: ${missingInfo}`,
    `- Next best action: ${finalPendingLines[0] || "Wait for customer to share the next needed detail."}`,
  ];
  const messageTimeline = buildMessageByMessageTimeline(input.history);
  const leadBusinessLines = [
    conversationFacts.businessUseCase ? `- Business/use case: ${conversationFacts.businessUseCase}` : "",
    conversationFacts.requestedNeed ? `- Requested need: ${conversationFacts.requestedNeed}` : "",
    conversationFacts.planInterest ? `- Plan interest: ${conversationFacts.planInterest}` : "",
    conversationFacts.setupInterest ? `- Setup interest: ${conversationFacts.setupInterest}` : "",
    ...currentLines.filter((line) => /^- [^:]+:/.test(line)).slice(0, 8),
    noteLines.length ? noteLines.join("\n") : "",
  ].filter(Boolean);
  const instructionLines = [
    conversationFacts.linksSent ? "- Bot sent signup/setup links after setup interest." : "",
    conversationFacts.planInterest ? "- Bot should ask practical custom-plan qualification questions before suggesting a quote." : "",
    conversationFacts.linksSent ? "- Bot should not repeat setup links again unless asked or useful." : "",
    "- Bot should avoid long generic replies for filler messages like ok.",
    "- Bot should avoid asking already answered questions.",
  ].filter(Boolean);
  const privateAdminNote = conversationFacts.businessUseCase === "School communication"
    ? "- Warm school lead asking for custom communication use case. Next ask number of students/parents and monthly message volume, then suggest suitable plan or custom quote."
    : "";

  return [
    `Conversation Summary:\n${summaryLines.join("\n")}`,
    messageTimeline.length > 0
      ? `Message-by-message timeline:\n${messageTimeline.slice(-8).map((item) => `- ${item}`).join("\n")}`
      : (timeline.length > 0 ? `Message-by-message timeline:\n${timeline.slice(-8).map((item, index) => `- ${index + 1}. ${item}`).join("\n")}` : ""),
    leadBusinessLines.length ? `Lead/Business details:\n${leadBusinessLines.slice(0, 8).join("\n")}` : (finalCurrentLines.length ? `Lead/Business details:\n${finalCurrentLines.slice(0, 6).join("\n")}` : (snapshot ? `Lead/Business details:\n${snapshot.split("\n").slice(0, 6).map((line) => `- ${line}`).join("\n")}` : "")),
    instructionLines.length ? `Instruction-following notes:\n${instructionLines.slice(0, 5).join("\n")}` : "",
    privateAdminNote ? `Private Notes:\n${privateAdminNote}` : "",
  ].filter(Boolean).join("\n\n");
}
