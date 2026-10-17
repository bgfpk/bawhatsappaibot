import { pickPreferredCustomerName } from "./customer-identity-service.ts";
import { mergeStructuredOrderState } from "./customer-state-extractor-service.ts";
import { cleanOrderFieldValue, sanitizeOrderCustomFields } from "./order-field-value-service.ts";
import { getMissingOrderFields } from "./order-required-fields-service.ts";
import { getMissingLeadFields, normalizeBusinessFlow, withRecordMetadata } from "./record-flow-service.ts";

type DraftInput = {
  businessFlow?: any;
  latestText?: any;
  isVoice?: boolean;
  hasImage?: boolean;
  profile?: any;
  activeRecord?: any;
  structuredState?: any;
  configuredFields?: any[];
  customerJid: string;
};

const LOW_SIGNAL_TEXTS = new Set([
  "hi",
  "hello",
  "hey",
  "salam",
  "assalam o alaikum",
  "aoa",
  "ok",
  "okay",
  "ji",
  "jee",
  "hmm",
  "hm",
  "yes",
  "no",
  "thanks",
  "thank you",
]);

const INQUIRY_PATTERNS = [
  /\b(price|rate|cost|details?|info|information|available|stock|delivery|shipping|address|city|cod|payment)\b/i,
  /\b(product|item|order|buy|purchase|service|booking|appointment|visit|quote|estimate|plan|package)\b/i,
  /\b(interested|need|looking for|want|mangwana|khareed|book|confirm|laga do|kar dein)\b/i,
  /\b(qeemat|kitna|kitne|service|booking|appointment|price|details|plan|package)\b/i,
];

const FIELD_PATTERNS = [
  /(?:\+|00)?\d[\d\s().-]{7,}\d/,
  /\b(?:my name is|i am|this is|name\s*[:\-])\b/i,
  /\b(address|street|road|plot|house|flat|block|phase|city|location|near|opp|opposite)\b/i,
];

function clean(value: any) {
  return String(value || "").trim();
}

function normalize(value: any) {
  return clean(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function appendUniqueNote(existingValue: any, nextValue: any) {
  const existing = cleanOrderFieldValue(existingValue);
  const next = cleanOrderFieldValue(nextValue);
  if (!next) return existing;
  if (!existing) return next;
  const existingKey = normalize(existing);
  const nextKey = normalize(next);
  if (!nextKey || existingKey.includes(nextKey)) return existing;
  return `${existing}\n${next}`.slice(0, 900);
}

function hasStructuredDraftData(state: any = {}) {
  return Boolean(
    clean(state.customerName) ||
    clean(state.customerPhone) ||
    clean(state.product) ||
    clean(state.address) ||
    clean(state.location) ||
    clean(state.city) ||
    clean(state.paymentMethod) ||
    Object.keys(state.customFields || {}).length > 0
  );
}

export function shouldCreateOrUpdateDraftRecord(input: DraftInput) {
  const text = clean(input.latestText);
  const normalized = normalize(text);
  const activeIncomplete = clean(input.activeRecord?.recordStatus).toLowerCase() === "incomplete";

  if (activeIncomplete && (text || input.isVoice || input.hasImage || hasStructuredDraftData(input.structuredState))) {
    return true;
  }

  if (!text && !input.isVoice && !input.hasImage) return false;
  if (normalized && LOW_SIGNAL_TEXTS.has(normalized) && !hasStructuredDraftData(input.structuredState)) return false;
  if (FIELD_PATTERNS.some((pattern) => pattern.test(text))) return true;
  if (INQUIRY_PATTERNS.some((pattern) => pattern.test(text))) return true;
  if ((input.isVoice || input.hasImage) && (hasStructuredDraftData(input.structuredState) || normalized.length >= 6)) return true;
  return false;
}

function buildBaseRecord(input: DraftInput) {
  const profile = input.profile || {};
  const activeRecord = input.activeRecord || {};
  const structuredState = input.structuredState || {};
  const configuredFields = input.configuredFields || [];
  const customFields = sanitizeOrderCustomFields({
    ...(profile?.customFields || {}),
    ...(activeRecord?.customFields || {}),
    ...(structuredState.customFields || {}),
  }, configuredFields);
  const customerName = pickPreferredCustomerName(
    structuredState.customerName,
    activeRecord?.customerName,
    profile?.customerName,
    profile?.name,
  );

  return mergeStructuredOrderState({
    ...activeRecord,
    customerName,
    customerPhone: cleanOrderFieldValue(
      structuredState.customerPhone ||
      activeRecord?.customerPhone ||
      profile?.customerPhone ||
      profile?.phone ||
      profile?.phoneNumber ||
      profile?.whatsapp_number
    ),
    deliveryAddress: cleanOrderFieldValue(structuredState.address || activeRecord?.deliveryAddress || activeRecord?.orderAddress || profile?.deliveryAddress || profile?.address),
    orderAddress: cleanOrderFieldValue(structuredState.address || activeRecord?.orderAddress || activeRecord?.deliveryAddress || profile?.deliveryAddress || profile?.address),
    cityName: cleanOrderFieldValue(structuredState.city || activeRecord?.cityName || profile?.cityName || profile?.city),
    location: cleanOrderFieldValue(structuredState.location || activeRecord?.location || profile?.location || profile?.city || profile?.cityName),
    productName: cleanOrderFieldValue(structuredState.product || activeRecord?.productName || profile?.latestProductName),
    serviceName: cleanOrderFieldValue(structuredState.product || activeRecord?.serviceName || profile?.latestProductName),
    variation: cleanOrderFieldValue(structuredState.variant || activeRecord?.variation || profile?.latestVariant),
    paymentMethod: cleanOrderFieldValue(structuredState.paymentMethod || activeRecord?.paymentMethod || profile?.paymentMethod || profile?.payment_method),
    priceText: cleanOrderFieldValue(structuredState.priceText || activeRecord?.priceText || profile?.latestPrice),
    totalPrice: Number(activeRecord?.totalPrice || activeRecord?.codAmount || structuredState.priceAmount) || 0,
    codAmount: Number(activeRecord?.codAmount || activeRecord?.totalPrice || structuredState.priceAmount) || 0,
    customFields,
    customerJid: input.customerJid,
    createdAt: activeRecord?.createdAt || new Date().toISOString(),
    notes: appendUniqueNote(activeRecord?.notes, input.latestText),
    transactionNotes: appendUniqueNote(activeRecord?.transactionNotes || activeRecord?.notes, input.latestText),
  }, structuredState);
}

export function buildIncompleteDraftRecord(input: DraftInput) {
  if (!shouldCreateOrUpdateDraftRecord(input)) return null;

  const businessFlow = normalizeBusinessFlow(input.businessFlow);
  const baseRecord = buildBaseRecord(input);

  if (businessFlow === "service") {
    const missingFields = getMissingLeadFields(baseRecord, input.configuredFields || []);
    const complete = missingFields.length === 0;
    return withRecordMetadata({
      recordData: {
        ...baseRecord,
        recordType: "lead",
        businessFlow: "service",
        productName: cleanOrderFieldValue(baseRecord.serviceName || baseRecord.productName) || "Service request",
        serviceName: cleanOrderFieldValue(baseRecord.serviceName || baseRecord.productName),
        quantity: Number(baseRecord.quantity) > 0 ? Number(baseRecord.quantity) : 1,
        transactionStatus: complete ? "Lead complete" : "Lead incomplete",
      },
      businessFlow: "service",
      recordType: "lead",
      missingFields,
      recordStatus: complete ? "complete" : "incomplete",
    });
  }

  const missingFields = getMissingOrderFields(baseRecord, input.configuredFields || []);
  const complete = missingFields.length === 0;
  return withRecordMetadata({
    recordData: {
      ...baseRecord,
      recordType: "order",
      businessFlow: "product",
      transactionStatus: complete ? "Order complete" : "Order incomplete",
    },
    businessFlow: "product",
    recordType: "order",
    missingFields,
    recordStatus: complete ? "complete" : "incomplete",
  });
}

export function buildDraftProfilePatch(recordData: any, savedRef: any = {}) {
  const recordType = clean(recordData?.recordType).toLowerCase();
  const isLead = recordType === "lead";
  return {
    orderStatus: isLead ? "Lead incomplete" : "collecting details",
    latestOrderRef: savedRef?.order_id || clean(recordData?.orderReferenceNumber) || "",
    customFields: recordData?.customFields || {},
    missingCustomFields: recordData?.missingFields || recordData?.missingCustomFields || [],
    customerPhone: cleanOrderFieldValue(recordData?.customerPhone || recordData?.phone),
    customerName: pickPreferredCustomerName(recordData?.customerName, recordData?.customer_name),
    latestProductName: cleanOrderFieldValue(recordData?.serviceName || recordData?.productName || recordData?.product_name),
    ...(recordData?.recordStatus === "complete" ? { missingCustomFields: [] } : {}),
    ...(isLead ? {} : { hasPlacedOrder: false }),
  };
}
