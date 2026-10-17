import { normalizeOrderCreatedAt } from "./order-persistence-service.ts";
import { isInstructionLikeFieldName, sanitizeConfiguredCustomerFields } from "./customer-field-guard-service.ts";

import { normalizeBusinessFlow,type BusinessFlow } from "./business-flow-normalizer.ts";
export { normalizeBusinessFlow };
export type { BusinessFlow };
export type RecordType = "order" | "lead";
export type RecordStatus = "incomplete" | "complete";

const ONE_DAY_SECONDS = 24 * 60 * 60;
const SENT_STATUS_PATTERNS = [
  "sent",
  "dispatch",
  "dispatched",
  "shipped",
  "in transit",
  "out for delivery",
  "picked",
  "booked",
];

const OPTIONAL_HINTS = [
  "optional",
  "do not ask",
  "don't ask",
  "filled after",
  "filled from",
  "manual",
  "later",
];

const ASK_HINTS = [
  "ask customer",
  "ask the customer",
  "must ask",
  "customer must",
  "confirm from customer",
  "required",
];

const BOOKING_HINTS = [
  "booking",
  "appointment",
  "visit",
  "schedule",
  "consultation",
  "meeting",
  "date",
  "time",
  "slot",
];

function clean(value: any) {
  return String(value ?? "").trim();
}

function normalizeFieldName(value: any) {
  return clean(value).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function hasValue(value: any) {
  if (value === null || value === undefined) return false;
  if (typeof value === "number") return Number.isFinite(value) && value > 0;
  return clean(value).length > 0;
}

function readCustomField(customFields: any, fieldName: string) {
  const exact = customFields?.[fieldName];
  if (hasValue(exact)) return exact;
  const wanted = fieldName.toLowerCase();
  const key = Object.keys(customFields || {}).find((item) => item.toLowerCase() === wanted);
  return key ? customFields[key] : "";
}

function hasMeaningfulValue(value: any) {
  return hasValue(value) && clean(value).length > 1;
}

function leadContextText(recordData: any) {
  return clean([
    recordData?.serviceName,
    recordData?.productName,
    recordData?.notes,
    recordData?.transactionNotes,
    JSON.stringify(recordData?.customFields || {}),
  ].filter(Boolean).join(" ")).toLowerCase();
}

function leadNeedsLocation(recordData: any) {
  const text = leadContextText(recordData);
  return /\b(city|location|address|visit|onsite|home visit|branch|clinic|hospital|area|near)\b/i.test(text);
}

function leadNeedsPreferredDateTime(recordData: any, configuredFields: any[] = []) {
  const text = leadContextText(recordData);
  if (BOOKING_HINTS.some((hint) => text.includes(hint))) return true;
  return configuredFields.some((field) => {
    const name = normalizeFieldName(field?.name);
    return shouldRequireCustomField(field) && (name.includes("date") || name.includes("time") || name.includes("slot"));
  });
}


export function normalizeRecordType(value: any, businessFlow?: any): RecordType {
  const text = clean(value).toLowerCase();
  if (text === "lead") return "lead";
  if (text === "order") return "order";
  return normalizeBusinessFlow(businessFlow) === "service" ? "lead" : "order";
}

export function shouldRequireCustomField(field: any) {
  const name = clean(field?.name);
  if (!name) return false;
  if (isInstructionLikeFieldName(name)) return false;
  const lowerName = normalizeFieldName(name);
  const instructions = clean(field?.instructions).toLowerCase();
  if (lowerName.includes("tracking") || lowerName.includes("courier") || lowerName.includes("shipping")) {
    return ASK_HINTS.some((hint) => instructions.includes(hint));
  }
  if (OPTIONAL_HINTS.some((hint) => instructions.includes(hint))) return false;
  return true;
}

export function getMissingLeadFields(recordData: any, configuredFields: any[] = []) {
  const customFields = recordData?.customFields && typeof recordData.customFields === "object" ? recordData.customFields : {};
  const safeConfiguredFields = sanitizeConfiguredCustomerFields(configuredFields);
  const missing: string[] = [];
  const seen = new Set<string>();
  const addMissing = (label: string, value: any) => {
    if (!label || hasMeaningfulValue(value)) return;
    const key = normalizeFieldName(label);
    if (!seen.has(key)) {
      seen.add(key);
      missing.push(label);
    }
  };

  addMissing("Phone", recordData?.customerPhone || recordData?.phone);
  addMissing("Service", recordData?.serviceName || recordData?.productName || recordData?.service);
  if (leadNeedsLocation(recordData)) {
    addMissing("Location", recordData?.location || recordData?.cityName || recordData?.city || recordData?.deliveryAddress || recordData?.orderAddress);
  }
  if (leadNeedsPreferredDateTime(recordData, safeConfiguredFields)) {
    const preferredDate = readCustomField(customFields, "Preferred Date") ||
      readCustomField(customFields, "Preferred Time") ||
      recordData?.preferredDate ||
      recordData?.preferredTime;
    addMissing("Preferred Date/Time", preferredDate);
  }

  for (const field of safeConfiguredFields) {
    if (!shouldRequireCustomField(field)) continue;
    const name = clean(field?.name);
    if (!name) continue;
    const value = readCustomField(customFields, name) || recordData?.[name] || recordData?.[normalizeFieldName(name).replace(/\s+/g, "")];
    addMissing(name, value);
  }
  return missing;
}

export function collectFilledFields(recordData: any) {
  const filled: Record<string, any> = {};
  const customFields = recordData?.customFields && typeof recordData.customFields === "object" ? recordData.customFields : {};
  for (const [key, value] of Object.entries(customFields)) {
    if (clean(key) && hasValue(value)) filled[key] = value;
  }
  for (const key of ["customerName", "customerPhone", "productName", "serviceName", "cityName", "deliveryAddress", "orderAddress", "paymentMethod", "totalPrice"]) {
    if (hasValue(recordData?.[key])) filled[key] = recordData[key];
  }
  return filled;
}

function hasHardIncompleteStatus(value: any) {
  const text = clean(value).toLowerCase();
  if (!text) return false;
  return /\b(incomplete|uncomplete|pending|blocked|draft)\b/i.test(text) ||
    /\bnot\s+(?:complete|completed|ready|confirmed|done)\b/i.test(text) ||
    /\b(?:human|manual|handoff|refus|cannot provide|customer needed|customer-needed|pending customer)\b/i.test(text);
}

function hasPositiveCompleteStatus(value: any) {
  const text = clean(value).toLowerCase();
  if (!text) return false;
  return /\b(?:complete|completed|ready|confirmed|done)\b/i.test(text);
}

function canCompleteFromFilledRequiredFields(recordData: any) {
  const recordType = normalizeRecordType(recordData?.recordType, recordData?.businessFlow);
  if (recordType === "lead") {
    return hasMeaningfulValue(recordData?.customerPhone || recordData?.phone) &&
      hasMeaningfulValue(recordData?.serviceName || recordData?.productName || recordData?.service);
  }
  return hasMeaningfulValue(recordData?.customerPhone || recordData?.phone) &&
    hasMeaningfulValue(recordData?.productName || recordData?.product_name) &&
    hasMeaningfulValue(recordData?.deliveryAddress || recordData?.orderAddress || recordData?.address) &&
    hasMeaningfulValue(recordData?.quantity || recordData?.qty || 1) &&
    hasMeaningfulValue(recordData?.totalPrice || recordData?.codAmount || recordData?.priceText);
}

export function normalizeRecordStatus(value: any, recordData: any = {}, missingFields: string[] = []): RecordStatus {
  const text = clean(value).toLowerCase();
  if (missingFields.length > 0) return "incomplete";
  const statusText = clean(recordData?.transactionStatus || recordData?.orderStatus).toLowerCase();
  if (hasHardIncompleteStatus(statusText)) return "incomplete";
  if (hasHardIncompleteStatus(text) && text !== "incomplete" && text !== "draft") return "incomplete";
  if (hasPositiveCompleteStatus(text) || hasPositiveCompleteStatus(statusText) || recordData?.orderReferenceNumber || recordData?.orderRefNumber) return "complete";
  if (text === "incomplete" || text === "draft") {
    if (canCompleteFromFilledRequiredFields(recordData)) return "complete";
    return "incomplete";
  }
  return "incomplete";
}

export function withRecordMetadata(input: {
  recordData: any;
  businessFlow?: any;
  recordType?: any;
  missingFields?: string[];
  recordStatus?: any;
  completedAt?: any;
}) {
  const businessFlow = normalizeBusinessFlow(input.businessFlow || input.recordData?.businessFlow);
  const recordType = normalizeRecordType(input.recordType || input.recordData?.recordType, businessFlow);
  const missingFields = Array.isArray(input.missingFields) ? input.missingFields.filter(Boolean) : [];
  const recordStatus = normalizeRecordStatus(input.recordStatus || input.recordData?.recordStatus, input.recordData, missingFields);
  const nowIso = new Date().toISOString();
  return {
    ...(input.recordData || {}),
    recordType,
    recordStatus,
    businessFlow,
    missingFields,
    collectedFields: collectFilledFields(input.recordData || {}),
    lastUpdatedByAI: nowIso,
    ...(recordStatus === "complete" ? { completedAt: input.recordData?.completedAt || input.completedAt || nowIso } : {}),
  };
}

export function hasTrackingIdentifier(orderData: any) {
  return Boolean(clean(orderData?.trackingNumber || orderData?.tracking_id || orderData?.awb || orderData?.trackingId));
}

export function isSentOrDispatchedOrder(orderData: any) {
  const text = clean([
    orderData?.transactionStatus,
    orderData?.orderStatus,
    orderData?.latestTrackingStatus,
    orderData?.postexStatus,
    orderData?.courierStatus,
  ].filter(Boolean).join(" ")).toLowerCase();
  return SENT_STATUS_PATTERNS.some((pattern) => text.includes(pattern));
}

export function isOrderEditable(orderData: any, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (normalizeRecordType(orderData?.recordType, orderData?.businessFlow) === "lead") return true;
  if (hasTrackingIdentifier(orderData)) return false;
  if (isSentOrDispatchedOrder(orderData)) return false;
  const createdAt = normalizeOrderCreatedAt(orderData?.createdAt || orderData?.created_at, 0);
  if (!createdAt) return true;
  return nowSeconds - createdAt <= ONE_DAY_SECONDS;
}
