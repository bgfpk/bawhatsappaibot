import * as dbService from "./db-service.ts";
import {
  PHONE_NUMBER_MANUAL_REQUEST_TEXT,
  PHONE_NUMBER_REQUEST_TEXT,
  buildPhoneConsentPatch,
  buildPhoneNumberRequestPatch,
  isLidOnlyCustomer,
  shouldRequestPhoneNumber,
} from "./phone-number-consent-service.ts";
import { hasRecentPhoneRequestLock, markPhoneRequestLock } from "./phone-number-request-lock-service.ts";
import { publishSharedPhoneIdentity } from "./shared-phone-directory-service.ts";
import { assertCustomerFacingSendAllowed } from "./customer-facing-send-guard-service.ts";

type PhoneRecoveryDeps = {
  sock: any;
  io: any;
  botSentMessageIds?: Set<string>;
};

type PhoneNumberRequestInput = PhoneRecoveryDeps & {
  userId?: string;
  jid: string;
  dataOwnerKey: string;
  profile?: any;
};

export async function sendPhoneNumberRequestIfNeeded(input: PhoneNumberRequestInput) {
  const { sock, io, botSentMessageIds, jid, dataOwnerKey, profile = {} } = input;
  if (!sock || !isLidOnlyCustomer(jid, profile)) return { requested: false };
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!shouldRequestPhoneNumber(profile, nowSeconds)) {
    return { requested: false, skipped: true };
  }
  if (hasRecentPhoneRequestLock(dataOwnerKey, jid, nowSeconds)) {
    return { requested: false, skipped: true, reason: "recent_lock" };
  }
  const access = await assertCustomerFacingSendAllowed({
    userId: input.userId,
    context: "phone_number_recovery_prompt",
    customerJid: jid,
    io,
    logger: console,
  });
  if (!access.allowed) {
    return { requested: false, skipped: true, reason: access.reason };
  }
  markPhoneRequestLock(dataOwnerKey, jid, nowSeconds);

  const nativeRequestEnabled = String(process.env.WHATSAPP_NATIVE_PHONE_REQUEST_ENABLED || "").toLowerCase() === "true" ||
    process.env.WHATSAPP_NATIVE_PHONE_REQUEST_ENABLED === "1";
  const requestText = nativeRequestEnabled ? PHONE_NUMBER_REQUEST_TEXT : PHONE_NUMBER_MANUAL_REQUEST_TEXT;
  const promptMsg = await sock.sendMessage(jid, { text: requestText });
  if (promptMsg?.key?.id) botSentMessageIds?.add(promptMsg.key.id);
  const requestMsg = nativeRequestEnabled
    ? await sock.sendMessage(jid, { requestPhoneNumber: true } as any)
    : null;
  if (requestMsg?.key?.id) botSentMessageIds?.add(requestMsg.key.id);

  await dbService.saveMessage(dataOwnerKey, jid, "model", requestText, promptMsg?.key?.id || requestMsg?.key?.id);
  await dbService.updateCustomerProfile(dataOwnerKey, jid, buildPhoneNumberRequestPatch(profile, nowSeconds));
  io.emit("whatsapp-message", {
    from: jid,
    text: requestText,
    isFromMe: true,
    timestamp: Date.now()
  });
  io.emit("system-log", { type: "info", msg: `Requested WhatsApp number from ${jid.split("@")[0]} for delivery updates and offers.` });

  return { requested: true, messageId: requestMsg?.key?.id || promptMsg?.key?.id };
}

type SaveSharedPhoneInput = {
  io: any;
  jid: string;
  dataOwnerKey: string;
  phone: string;
  messageId?: string;
  senderName?: string;
};

export async function saveSharedPhoneNumberConsent(input: SaveSharedPhoneInput) {
  const { io, jid, dataOwnerKey, phone, messageId, senderName } = input;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const isLidJid = jid.endsWith("@lid") || jid.endsWith("@hosted.lid");
  const consentPatch = {
    ...buildPhoneConsentPatch(phone, nowSeconds),
    jid,
    ...(isLidJid ? { lidJid: jid } : {}),
  };
  const phoneJid = String((consentPatch as any).phoneJid || "");

  await dbService.saveMessage(dataOwnerKey, jid, "user", "[Shared WhatsApp number]", messageId, senderName);
  await dbService.updateCustomerProfile(dataOwnerKey, jid, consentPatch);
  if (phoneJid && phoneJid !== jid) {
    await dbService.updateCustomerProfile(dataOwnerKey, phoneJid, {
      ...consentPatch,
      jid: phoneJid,
      ...(isLidJid ? { lidJid: jid } : {}),
    });
  }
  await publishSharedPhoneIdentity({
    jid,
    phone,
    profilePatch: consentPatch,
    source: "customer_shared_number",
  }).catch(() => {});
  io.emit("system-log", { type: "info", msg: `Saved verified WhatsApp number for ${senderName || jid.split("@")[0]}.` });
}
