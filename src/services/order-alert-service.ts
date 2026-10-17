import { normalizeOrderCreatedAt } from "./order-persistence-service.ts";
import { buildAdminOrderSummaryMessage } from "./order-summary-message-service.ts";
import { sendAdminOnlyText } from "./message-routing-guard-service.ts";

function cleanText(value: any, fallback = "Not specified") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function sanitizeOrderRef(value: string) {
  return value.replace(/[^a-zA-Z0-9_]/g, "_").replace(/_+/g, "_").slice(0, 80);
}

export function normalizeWhatsAppPhone(value: any) {
  let phone = String(value || "").replace(/@s\.whatsapp\.net$/i, "").replace(/[^0-9]/g, "");
  if (!phone) return "";
  if (phone.startsWith("00")) phone = phone.slice(2);
  if (phone.startsWith("0")) phone = `92${phone.slice(1)}`;
  if (phone.length === 10 && phone.startsWith("3")) phone = `92${phone}`;
  return phone;
}

export function buildConfirmedOrderReference(orderData: any) {
  const existing = cleanText(
    orderData?.orderReferenceNumber || orderData?.orderRefNumber || orderData?.orderReference,
    ""
  );
  if (existing) return sanitizeOrderRef(existing);

  const phone = normalizeWhatsAppPhone(orderData?.customerPhone || orderData?.phone).slice(-10) || "customer";
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 17);
  return sanitizeOrderRef(`ord_${phone}_${stamp}`);
}

export function buildOrderSavedPayload(input: {
  dataOwnerKey: string;
  orderData: any;
  savedRef: any;
}) {
  const createdAt = normalizeOrderCreatedAt(
    input.savedRef?.created_at || input.orderData?.createdAt || input.orderData?.created_at
  );

  return {
    isNew: Boolean(input.savedRef?.isNew),
    order: {
      bot_id: input.dataOwnerKey,
      order_id: input.savedRef?.order_id || input.orderData?.orderReferenceNumber,
      sr_no: input.savedRef?.sr_no || 0,
      created_at: createdAt,
      order_data: input.orderData,
    },
  };
}

export function emitOrderSaved(io: any, input: {
  dataOwnerKey: string;
  orderData: any;
  savedRef: any;
}) {
  io?.emit?.("order-saved", buildOrderSavedPayload(input));
}

export function buildAdminOrderAlert(orderData: any, savedRef: any) {
  return buildAdminOrderSummaryMessage(orderData, savedRef);
}

export async function notifyAdminOfConfirmedOrder(input: {
  sock: any;
  userConfig: any;
  sender: string;
  orderData: any;
  savedRef: any;
  io?: any;
}) {
  const alertsEnabled = input.userConfig?.order_alerts_enabled ?? input.userConfig?.orderAlertsEnabled;
  if (alertsEnabled === false || alertsEnabled === 0) {
    return false;
  }

  try {
    const routed = await sendAdminOnlyText({
      sock: input.sock,
      userConfig: input.userConfig,
      customerJid: input.sender,
      text: buildAdminOrderAlert(input.orderData, input.savedRef),
      label: "Admin order alert",
      io: input.io,
    });
    if (!routed.sent) return false;
    const sent = routed.message;
    if (!sent?.key?.id) throw new Error("WhatsApp did not return an admin alert message id.");
    return true;
  } catch (error: any) {
    input.io?.emit?.("system-log", { type: "error", msg: `Admin order alert failed: ${error?.message || "unknown error"}` });
    return false;
  }
}
