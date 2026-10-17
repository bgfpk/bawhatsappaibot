/*
 * WhatsApp Provider Configuration Helper
 * Provides type definitions, normalization, validation, and safe log summarization.
 */
import { WhatsAppProviderType } from "./whatsapp-transport-types.ts";

/**
 * Configuration object for a WhatsApp instance.
 */
export interface WhatsAppProviderConfig {
  /** Provider type – web (Baileys) or official Cloud API */
  providerType?: WhatsAppProviderType;
  /** Optional status string for runtime tracking */
  providerStatus?: string;
  /** Cloud API only – Phone Number ID (e.g. "1277547175") */
  phoneNumberId?: string;
  /** Cloud API only – Business Account ID */
  businessAccountId?: string;
  /** Cloud API only – Verify token for webhook validation */
  webhookVerifyToken?: string;
  /** Encrypted reference to the access token (do NOT store raw token) */
  encryptedAccessTokenRef?: string;
  /** Optional references for Meta App credentials (if needed later) */
  appIdRef?: string;
  appSecretRef?: string;
  /** Optional sync status for templates */
  templateSyncStatus?: string;
  /** Optional capabilities object for future use */
  officialApiCapabilities?: Record<string, unknown>;
  /** Last error that occurred while using this provider (redacted in logs) */
  providerLastError?: string;
}

/**
 * Normalizes raw input into a proper WhatsAppProviderConfig.
 * - Missing or invalid providerType defaults to "whatsapp_web".
 * - Unknown fields are ignored.
 */
export function normalizeWhatsAppProviderConfig(input: any = {}): WhatsAppProviderConfig {
  const out: WhatsAppProviderConfig = {};
  const type = input.providerType;
  if (type === "whatsapp_web" || type === "whatsapp_cloud_api") {
    out.providerType = type;
  } else {
    out.providerType = "whatsapp_web";
  }
  // Copy only known optional fields if present
  const fields = [
    "providerStatus",
    "phoneNumberId",
    "businessAccountId",
    "webhookVerifyToken",
    "encryptedAccessTokenRef",
    "appIdRef",
    "appSecretRef",
    "templateSyncStatus",
    "officialApiCapabilities",
    "providerLastError",
  ];
  for (const f of fields) {
    if (input?.[f] !== undefined) {
      // @ts-ignore – dynamic field assignment
      out[f] = input[f];
    }
  }
  return out;
}

/**
 * Validates a normalized config.
 * Returns an array of error messages – empty array means valid.
 */
export function validateWhatsAppProviderConfig(config: WhatsAppProviderConfig): string[] {
  const errors: string[] = [];
  if (config.providerType === "whatsapp_cloud_api") {
    if (!config.phoneNumberId) {
      errors.push("whatsapp_cloud_api requires phoneNumberId");
    }
    if (!config.encryptedAccessTokenRef) {
      errors.push("whatsapp_cloud_api requires encryptedAccessTokenRef");
    }
  } else {
    // For whatsapp_web we explicitly disallow Cloud‑API‑only fields (optional safety)
    const illegal = [
      "phoneNumberId",
      "businessAccountId",
      "encryptedAccessTokenRef",
      "appIdRef",
      "appSecretRef",
    ];
    for (const f of illegal) {
      // @ts-ignore – dynamic field read
      if (config[f] !== undefined) {
        errors.push(`field ${f} is not applicable for whatsapp_web`);
      }
    }
  }
  return errors;
}

/**
 * Produces a safe, redacted summary suitable for logs.
 * Token‑like values are replaced with "<redacted>".
 */
export function summarizeProviderConfigForLogs(config: WhatsAppProviderConfig): Record<string, unknown> {
  const redacted = (value: any) => {
    if (typeof value === "string" && value.length > 0) {
      // Simple heuristic: if it looks like a token (contains letters/numbers and is long), redact
      if (value.match(/^[A-Za-z0-9_\-]{8,}$/)) {
        return "<redacted>";
      }
    }
    return value;
  };

  const summary: Record<string, unknown> = {
    providerType: config.providerType ?? "whatsapp_web",
    providerStatus: config.providerStatus ?? undefined,
    phoneNumberId: config.phoneNumberId ?? undefined,
    businessAccountId: config.businessAccountId ?? undefined,
    webhookVerifyToken: redacted(config.webhookVerifyToken),
    encryptedAccessTokenRef: redacted(config.encryptedAccessTokenRef),
    appIdRef: redacted(config.appIdRef),
    appSecretRef: redacted(config.appSecretRef),
    templateSyncStatus: config.templateSyncStatus ?? undefined,
    officialApiCapabilities: config.officialApiCapabilities ?? undefined,
  };

  if (config.providerLastError) {
    // Truncate to 200 chars and redact any token‑like substrings
    let err = config.providerLastError;
    if (err.length > 200) err = err.slice(0, 200) + "...";
    summary.providerLastError = redacted(err);
  }

  return summary;
}
