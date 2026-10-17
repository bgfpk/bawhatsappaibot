import { normalizeOrderCreatedAt, toOrderCreatedAtIso } from "./order-persistence-service.ts";
import { normalizePhoneDigits } from "../utils/whatsapp-jid.ts";
import { isOrderEditable, normalizeRecordStatus, normalizeRecordType } from "./record-flow-service.ts";

const SAME_DAY_UPDATE_SECONDS = 24 * 60 * 60;
const TERMINAL_STATUSES = new Set(["completed", "canceled", "cancelled", "refunded", "returned"]);
const ORDER_UPDATE_TIME_ZONE = process.env.ORDER_UPDATE_TIME_ZONE || process.env.TZ || "Asia/Karachi";

function clean(value: any) {
  return String(value || "").trim();
}

function normalizePhone(value: any) {
  const digits = normalizePhoneDigits(value);
  if (!digits) return "";
  if (digits.startsWith("00")) return digits.slice(2);
  return digits;
}

function customerKeys(orderData: any) {
  const keys = new Set<string>();
  const jid = clean(orderData?.customerJid || orderData?.jid);
  if (jid) keys.add(jid.toLowerCase());
  const customerId = jid ? jid.split("@")[0] : "";
  if (customerId) keys.add(customerId);
  for (const value of [orderData?.customerPhone, orderData?.phone, orderData?.phoneNumber, orderData?.whatsapp_number]) {
    const phone = normalizePhone(value);
    if (phone) {
      keys.add(phone);
      keys.add(phone.slice(-10));
    }
  }
  return keys;
}

function getStatus(orderData: any) {
  return clean(orderData?.transactionStatus || orderData?.orderStatus || orderData?.latestTrackingStatus).toLowerCase();
}

function dayKey(epochSeconds: number) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ORDER_UPDATE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(epochSeconds * 1000));
}

export function explicitOrderReference(orderData: any, profile: any = {}) {
  return clean(
    orderData?.orderReferenceNumber ||
    orderData?.orderRefNumber ||
    orderData?.orderReference ||
    profile?.latestOrderRef
  ).replace(/[^a-zA-Z0-9_]/g, "_").replace(/_+/g, "_").slice(0, 80);
}

export function isSameOrderCustomer(existingData: any, incomingData: any) {
  const existingKeys = customerKeys(existingData);
  const incomingKeys = customerKeys(incomingData);
  for (const key of incomingKeys) {
    if (key && existingKeys.has(key)) return true;
  }
  return false;
}

export function canUpdateExistingOrder(existingData: any, incomingData: any, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!isSameOrderCustomer(existingData, incomingData)) return false;
  if (TERMINAL_STATUSES.has(getStatus(existingData))) return false;
  const existingRecordStatus = normalizeRecordStatus(existingData?.recordStatus, existingData, existingData?.missingFields || existingData?.missingCustomFields || []);
  const incomingRecordStatus = normalizeRecordStatus(incomingData?.recordStatus, incomingData, incomingData?.missingFields || incomingData?.missingCustomFields || []);
  if (existingRecordStatus === "complete" && incomingRecordStatus === "incomplete") return false;
  if (!isOrderEditable(existingData, nowSeconds)) return false;
  if (normalizeRecordType(existingData?.recordType, existingData?.businessFlow) === "lead") return true;
  const existingCreatedAt = normalizeOrderCreatedAt(existingData?.createdAt || existingData?.created_at, 0);
  if (!existingCreatedAt) return false;
  return dayKey(existingCreatedAt) === dayKey(nowSeconds) &&
    nowSeconds - existingCreatedAt >= 0 &&
    nowSeconds - existingCreatedAt <= SAME_DAY_UPDATE_SECONDS;
}

export function mergeOrderUpdate(existingData: any, incomingData: any, orderRef: string, createdAt: number) {
  return {
    ...existingData,
    ...incomingData,
    orderReferenceNumber: orderRef,
    orderRefNumber: existingData?.orderRefNumber || incomingData?.orderRefNumber || orderRef,
    createdAt,
    createdAtIso: existingData?.createdAtIso || incomingData?.createdAtIso || toOrderCreatedAtIso(createdAt),
    updatedAt: Math.floor(Date.now() / 1000),
    updatedAtIso: new Date().toISOString(),
  };
}
