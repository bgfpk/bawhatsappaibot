// src/services/whatsapp-cloud-api-webhook.ts
import crypto from "node:crypto";

export interface WebhookChallengeInput {
  mode?: string;
  verifyToken?: string;
  challenge?: string;
  expectedVerifyToken?: string;
}

export interface WebhookChallengeResult {
  success: boolean;
  challenge?: string;
  reason?: string;
}

export interface VerifyMetaSignatureInput {
  body: string | Buffer;
  signature?: string; // x-hub-signature-256 header value
  appSecret?: string;
}

export interface WebhookEvent {
  object: string;
  entryId: string;
  phoneNumberId?: string;
  displayPhoneNumber?: string;
  contactName?: string;
  contactWaId?: string;
  message?: {
    id: string;
    from: string;
    timestamp: number;
    type: string;
    textBody?: string;
    rawPayload: any;
  };
  status?: {
    id: string;
    status: string;
    timestamp: number;
    recipientId: string;
    rawPayload: any;
  };
  templateStatus?: {
    wabaId: string;
    templateId?: string;
    templateName: string;
    language?: string;
    event: string;
    reason?: string;
    rawPayload: any;
  };
}

/**
 * Checks whether server-side Meta webhook security credentials (app secret + verify token)
 * are configured in the environment using standard server aliases.
 * Never logs or exposes the credential values.
 */
export function isCloudWebhookSecurityConfigured(
  env: Record<string, string | undefined> = process.env
): boolean {
  const appSecret =
    env.WHATSAPP_CLOUD_APP_SECRET ||
    env.META_APP_SECRET ||
    env.WHATSAPP_APP_SECRET ||
    "";

  const verifyToken =
    env.WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN ||
    env.WHATSAPP_VERIFY_TOKEN ||
    env.META_WEBHOOK_VERIFY_TOKEN ||
    "";

  return Boolean(appSecret.trim() && verifyToken.trim());
}

/**
 * Verifies the hub challenge verification parameters sent by Meta webhooks during registration.
 */
export function verifyCloudApiWebhookChallenge(input: WebhookChallengeInput): WebhookChallengeResult {
  try {
    const { mode, verifyToken, challenge, expectedVerifyToken } = input;
    if (!mode || !verifyToken || !challenge || !expectedVerifyToken) {
      return { success: false, reason: "missing_parameters" };
    }
    if (mode !== "subscribe") {
      return { success: false, reason: "invalid_mode" };
    }
    if (verifyToken !== expectedVerifyToken) {
      return { success: false, reason: "token_mismatch" };
    }
    return { success: true, challenge };
  } catch {
    return { success: false, reason: "error" };
  }
}

/**
 * Validates the signature header x-hub-signature-256 sent by Meta.
 * Uses timing-safe string comparison to protect against timing attacks.
 */
export function verifyMetaWebhookSignature(input: VerifyMetaSignatureInput): boolean {
  try {
    const { body, signature, appSecret } = input;
    if (body === undefined || body === null || !signature || !appSecret) {
      return false;
    }

    const parts = signature.split("=");
    if (parts.length !== 2 || parts[0] !== "sha256") {
      return false;
    }
    const expectedSignature = parts[1];

    const hmac = crypto.createHmac("sha256", appSecret);
    hmac.update(body);
    const computedSignature = hmac.digest("hex");

    if (computedSignature.length !== expectedSignature.length) {
      return false;
    }

    return crypto.timingSafeEqual(
      Buffer.from(computedSignature, "hex"),
      Buffer.from(expectedSignature, "hex")
    );
  } catch {
    return false;
  }
}

/**
 * Extracts messaging and status events from raw Meta webhook JSON payload.
 * Safely ignores malformed or unrelated entries.
 */
export function extractCloudApiWebhookEvents(payload: any): WebhookEvent[] {
  const events: WebhookEvent[] = [];
  if (!payload || typeof payload !== "object") {
    return events;
  }

  const objectType = String(payload.object || "");
  const entries = Array.isArray(payload.entry) ? payload.entry : [];

  for (const entry of entries) {
    const entryId = String(entry?.id || "");
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];

    for (const change of changes) {
      const value = change?.value;
      if (!value) continue;

      const metadata = value.metadata;
      const phoneNumberId = metadata?.phone_number_id ? String(metadata.phone_number_id) : undefined;
      const displayPhoneNumber = metadata?.display_phone_number ? String(metadata.display_phone_number) : undefined;

      const contacts = Array.isArray(value.contacts) ? value.contacts : [];
      const mainContact = contacts[0];
      const contactName = mainContact?.profile?.name ? String(mainContact.profile.name) : undefined;
      const contactWaId = mainContact?.wa_id ? String(mainContact.wa_id) : undefined;

      // Extract messages
      const messages = Array.isArray(value.messages) ? value.messages : [];
      for (const msg of messages) {
        if (!msg || !msg.id) continue;
        events.push({
          object: objectType,
          entryId,
          phoneNumberId,
          displayPhoneNumber,
          contactName,
          contactWaId,
          message: {
            id: String(msg.id),
            from: String(msg.from || ""),
            timestamp: Number(msg.timestamp || 0),
            type: String(msg.type || ""),
            textBody: msg.text?.body ? String(msg.text.body) : undefined,
            rawPayload: msg,
          }
        });
      }

      // Extract statuses
      const statuses = Array.isArray(value.statuses) ? value.statuses : [];
      for (const st of statuses) {
        if (!st || !st.id) continue;
        events.push({
          object: objectType,
          entryId,
          phoneNumberId,
          displayPhoneNumber,
          status: {
            id: String(st.id),
            status: String(st.status || ""),
            timestamp: Number(st.timestamp || 0),
            recipientId: String(st.recipient_id || ""),
            rawPayload: st,
          }
        });
      }

      // Extract template status updates (message_template_status_update)
      const field = String(change?.field || "");
      if (
        field === "message_template_status_update" ||
        value.message_template_id ||
        value.message_template_name
      ) {
        const tplName = String(value.message_template_name || value.template_name || "");
        const tplEvent = String(value.event || value.status || "").toUpperCase();
        if (tplName && tplEvent) {
          events.push({
            object: objectType,
            entryId,
            templateStatus: {
              wabaId: entryId,
              templateId: value.message_template_id ? String(value.message_template_id) : undefined,
              templateName: tplName,
              language: value.message_template_language ? String(value.message_template_language) : undefined,
              event: tplEvent,
              reason: value.reason ? String(value.reason) : undefined,
              rawPayload: value,
            },
          });
        }
      }
    }
  }

  return events;
}

/**
 * Prepares a safe log-ready summary of a webhook event.
 * Never includes raw secrets or verification signatures.
 */
export function summarizeCloudApiWebhookEvent(event: WebhookEvent) {
  return {
    object: event.object,
    entryId: event.entryId,
    phoneNumberId: event.phoneNumberId,
    displayPhoneNumber: event.displayPhoneNumber,
    contactWaId: event.contactWaId,
    hasMessage: !!event.message,
    messageId: event.message?.id,
    messageType: event.message?.type,
    hasStatus: !!event.status,
    statusId: event.status?.id,
    statusType: event.status?.status,
    hasTemplateStatus: !!event.templateStatus,
    templateName: event.templateStatus?.templateName,
    templateStatusEvent: event.templateStatus?.event,
  };
}
