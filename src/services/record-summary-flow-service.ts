import crypto from "crypto";
import { cleanOrderFieldValue, sanitizeOrderCustomFields } from "./order-field-value-service.ts";

function clean(value: any) {
  return cleanOrderFieldValue(value);
}

function stableJson(value: any): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? "");
}

export function buildRecordSummaryFingerprint(recordData: any = {}, configuredFields: any[] = []) {
  const customFields = sanitizeOrderCustomFields(recordData?.customFields || {}, configuredFields);
  const payload = {
    recordType: clean(recordData.recordType || recordData.businessFlow),
    customerName: clean(recordData.customerName || recordData.customer_name),
    customerPhone: clean(recordData.customerPhone || recordData.phone),
    productName: clean(recordData.productName || recordData.product_name || recordData.serviceName),
    quantity: clean(recordData.quantity),
    totalPrice: clean(recordData.totalPrice || recordData.codAmount || recordData.priceText),
    city: clean(recordData.cityName || recordData.city || recordData.location),
    address: clean(recordData.deliveryAddress || recordData.orderAddress || recordData.address),
    payment: clean(recordData.paymentMethod || customFields["Payment Method"]),
    customFields,
  };
  return crypto.createHash("sha1").update(stableJson(payload)).digest("hex").slice(0, 24);
}

export function isCustomerConfirmationText(value: any) {
  const text = clean(value).toLowerCase();
  if (!text) return false;
  return /^(ok|okay|yes|y|ji|jee|g|han|haan|done|confirm|confirmed|theek|thik|fine|proceed)$/i.test(text) ||
    /\b(confirm|confirmed|done|proceed|final|book it|place order|yes correct|details are correct)\b/i.test(text);
}

export function getRecordSummaryDecision(input: {
  profile?: any;
  recordData?: any;
  configuredFields?: any[];
  latestCustomerText?: any;
  confirmationDetected?: boolean;
}) {
  const profile = input.profile || {};
  const recordData = input.recordData || {};
  const complete = clean(recordData.recordStatus).toLowerCase() === "complete";
  const fingerprint = buildRecordSummaryFingerprint(recordData, input.configuredFields || []);
  const previousFingerprint = clean(profile.leadOrderSummaryFingerprint);
  const summaryAlreadySent = profile.leadOrderSummarySent === true && previousFingerprint === fingerprint;
  const customerConfirmed = input.confirmationDetected === true || isCustomerConfirmationText(input.latestCustomerText);
  const shouldMarkConfirmed = complete && summaryAlreadySent && customerConfirmed;
  const shouldSendSummary = complete && (!summaryAlreadySent || previousFingerprint !== fingerprint);
  const changedAfterSummary = complete && profile.leadOrderSummarySent === true && previousFingerprint && previousFingerprint !== fingerprint;
  return {
    complete,
    fingerprint,
    shouldSendSummary,
    shouldMarkConfirmed,
    changedAfterSummary,
    summaryAlreadySent,
  };
}

export function buildRecordSummarySentPatch(input: {
  profile?: any;
  recordData?: any;
  configuredFields?: any[];
  summaryText?: any;
  messageId?: any;
  confirmed?: boolean;
  source?: string;
}) {
  const fingerprint = buildRecordSummaryFingerprint(input.recordData || {}, input.configuredFields || []);
  const confirmed = input.confirmed === true;
  return {
    leadOrderSummarySent: true,
    leadOrderSummarySentAt: Math.floor(Date.now() / 1000),
    leadOrderSummaryFingerprint: fingerprint,
    leadOrderSummaryText: clean(input.summaryText).slice(0, 1800),
    leadOrderSummaryMessageId: clean(input.messageId),
    leadOrderSummarySource: clean(input.source),
    leadOrderAwaitingCustomerConfirmation: !confirmed,
    leadOrderConfirmed: confirmed,
    leadOrderConfirmedAt: confirmed ? Math.floor(Date.now() / 1000) : Number(input.profile?.leadOrderConfirmedAt || 0),
    leadOrderFlowState: confirmed ? "confirmed" : "awaiting_customer_confirmation",
    doNotRestartQuestions: true,
    missingCustomFields: [],
  };
}

export function buildRecordSummaryConfirmedPatch(profile: any = {}) {
  return {
    leadOrderAwaitingCustomerConfirmation: false,
    leadOrderConfirmed: true,
    leadOrderConfirmedAt: Math.floor(Date.now() / 1000),
    leadOrderFlowState: "confirmed",
    doNotRestartQuestions: true,
    leadOrderSummarySent: profile.leadOrderSummarySent === true,
  };
}
