export const MARKETING_AUDIENCE_NOT_ORDERED = "not_ordered";
export const MARKETING_AUDIENCE_ORDERED = "ordered";
export const MARKETING_AUDIENCE_ALL = "all";
export const MARKETING_AUDIENCE_INCOMPLETE = "incomplete_lead";

export function normalizeMarketingAudience(value: any) {
  const normalized = String(value || "").trim();
  if (normalized === MARKETING_AUDIENCE_ORDERED) return MARKETING_AUDIENCE_ORDERED;
  if (normalized === MARKETING_AUDIENCE_ALL) return MARKETING_AUDIENCE_ALL;
  if (normalized === MARKETING_AUDIENCE_INCOMPLETE) return MARKETING_AUDIENCE_INCOMPLETE;
  return MARKETING_AUDIENCE_NOT_ORDERED;
}

function isTruthyOrderMarker(value: any) {
  if (value === true || value === 1) return true;
  const normalized = String(value || "").trim().toLowerCase();
  return ["true", "1", "yes", "ordered", "confirmed", "completed", "delivered"].includes(normalized);
}

function hasTextOrderMarker(value: any) {
  return String(value || "").trim().length > 0;
}

function hasPurchaseReplyMarker(value: any) {
  const text = String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!text) return false;
  const negative = /\b(not|no|never|haven't|have not|didn't|did not|nahi|nahin|nai|ni)\b.{0,24}\b(order|ordered|buy|bought|purchase|purchased|liya|lia)\b/.test(text);
  if (negative) return false;
  return [
    /\b(i|we)\s+(already\s+)?(bought|ordered|purchased)\b/,
    /\b(bought|ordered|purchased)\s+already\b/,
    /\b(i|we)\s+have\s+(already\s+)?(bought|ordered|purchased)\b/,
    /\border\s+(already\s+)?(done|confirmed|placed)\b/,
    /\b(pehle|already)\s+(le|lay|lia|liya)\s+(hai|tha)?\b/,
    /\b(order|product)\s+(le|lay|lia|liya)\s+(hai|tha)\b/,
  ].some((pattern) => pattern.test(text));
}

function normalizeOrderTime(value: any) {
  const num = Number(value);
  if (!num) return 0;
  return num > 100000000000 ? Math.floor(num / 1000) : Math.floor(num);
}

function parseProfile(value: any) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function parseMaybeJson(value: any) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function hasMissingRequiredCustomFields(profile: any = {}) {
  const explicitMissing = profile?.missingRequiredCustomFields || profile?.missingCustomFields || profile?.requiredFieldsMissing;
  if (Array.isArray(explicitMissing) && explicitMissing.length > 0) return true;
  if (typeof explicitMissing === "string" && explicitMissing.trim()) return true;
  const metadata = parseMaybeJson(profile?.recordMetadata || profile?.activeRecordMetadata) || {};
  const metadataMissing = metadata?.missingFields || metadata?.missingRequiredFields || metadata?.requiredFieldsMissing;
  if (Array.isArray(metadataMissing) && metadataMissing.length > 0) return true;
  if (typeof metadataMissing === "string" && metadataMissing.trim()) return true;

  const required = Array.isArray(profile?.requiredCustomFields) ? profile.requiredCustomFields : [];
  const values = profile?.customFieldValues || profile?.customFields || {};
  return required.some((field: any) => {
    const key = String(field?.key || field?.name || field || "").trim();
    return key && !String(values?.[key] || "").trim();
  });
}

export function hasIncompleteLeadOrOrder(customer: any = {}, profile: any = parseProfile(customer?.profile)) {
  const customerProfile = profile || {};
  const recordMetadata = parseMaybeJson(customerProfile?.recordMetadata || customer?.recordMetadata || customer?.activeRecordMetadata) || {};
  const statusValues = [
    customer?.recordStatus,
    customer?.orderStatus,
    customer?.leadStatus,
    customerProfile?.recordStatus,
    customerProfile?.orderStatus,
    customerProfile?.leadStatus,
    customerProfile?.transactionStatus,
    recordMetadata?.recordStatus,
    recordMetadata?.status,
  ].map((value) => String(value || "").toLowerCase().replace(/[_-]+/g, " ").trim());
  const typeValues = [
    customer?.recordType,
    customerProfile?.recordType,
    recordMetadata?.recordType,
    recordMetadata?.type,
  ].map((value) => String(value || "").toLowerCase().trim());
  const incompleteStatus = statusValues.some((status) =>
    [
      "incomplete",
      "order incomplete",
      "lead incomplete",
      "new order",
      "in progress",
      "collecting details",
      "collecting detail",
      "awaiting confirmation",
      "awaiting details",
      "awaiting detail",
      "pending confirmation",
      "pending details",
      "details pending",
      "missing details",
      "inquiry",
      "lead",
    ].includes(status)
  );
  const activeIncompleteMetadata = Boolean(
    recordMetadata?.activeIncompleteRecord ||
    recordMetadata?.active === true && statusValues.includes("incomplete") ||
    typeValues.some((type) => ["lead", "order"].includes(type)) && incompleteStatus
  );
  return incompleteStatus || activeIncompleteMetadata || hasMissingRequiredCustomFields(customerProfile);
}

export function hasCustomerOrder(customer: any = {}, profile: any = parseProfile(customer?.profile)) {
  const customerProfile = profile || {};
  return Boolean(
    customer?.marketingOrderEvidence ||
    isTruthyOrderMarker(customer?.hasPlacedOrder) ||
    isTruthyOrderMarker(customer?.has_placed_order) ||
    isTruthyOrderMarker(customerProfile?.hasPlacedOrder) ||
    isTruthyOrderMarker(customerProfile?.has_placed_order) ||
    normalizeOrderTime(customer?.last_order_at || customer?.lastOrderAt || customerProfile?.lastOrderAt || customerProfile?.last_order_at) > 0 ||
    hasTextOrderMarker(customer?.last_order_id || customer?.latestOrderRef || customer?.order_id) ||
    hasTextOrderMarker(customerProfile?.latestOrderRef || customerProfile?.lastOrderRef || customerProfile?.orderReferenceNumber) ||
    hasTextOrderMarker(customerProfile?.trackingId || customerProfile?.orderStatus || customerProfile?.latestTrackingStatus) ||
    hasPurchaseReplyMarker(customerProfile?.lastMessage || customer?.lastMessage || customer?.last_message || customerProfile?.chatSummary)
  );
}

export function mergeMarketingOrderEvidence(existingCustomer: any, incomingCustomer: any) {
  return hasCustomerOrder(existingCustomer, parseProfile(existingCustomer?.profile)) ||
    hasCustomerOrder(incomingCustomer, parseProfile(incomingCustomer?.profile));
}

export function isCustomerInMarketingAudience(customer: any, profile: any, audience: any) {
  const normalized = normalizeMarketingAudience(audience);
  if (normalized === MARKETING_AUDIENCE_ALL) return true;
  const ordered = hasCustomerOrder(customer, profile);
  if (normalized === MARKETING_AUDIENCE_INCOMPLETE) {
    return hasIncompleteLeadOrOrder(customer, profile);
  }
  return normalized === MARKETING_AUDIENCE_ORDERED ? ordered : !ordered;
}

export function getMarketingAudienceLabel(audience: any) {
  const normalized = normalizeMarketingAudience(audience);
  if (normalized === MARKETING_AUDIENCE_ORDERED) return "Only ordered";
  if (normalized === MARKETING_AUDIENCE_ALL) return "All customers";
  if (normalized === MARKETING_AUDIENCE_INCOMPLETE) return "Incomplete lead/order";
  return "Not ordered";
}
