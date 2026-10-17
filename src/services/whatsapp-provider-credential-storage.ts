// src/services/whatsapp-provider-credential-storage.ts
import { WhatsAppProviderConfig, normalizeWhatsAppProviderConfig } from "./whatsapp-provider-config.ts";

export interface PrepareOptions {
  encryptSecret?: (raw: string) => string | Promise<string>;
}

/**
 * Prepares dashboard/server input for the Official WhatsApp Cloud API.
 * Encrypts raw accessToken using the injected encryptSecret function.
 * Defaults providerType to "whatsapp_web" unless a valid "whatsapp_cloud_api" is specified.
 */
export async function prepareCloudApiProviderConfigInput(
  input: any,
  options?: PrepareOptions
): Promise<Record<string, any>> {
  if (!input || typeof input !== "object") {
    return { providerType: "whatsapp_web" };
  }

  const out: Record<string, any> = {};

  // Safely default providerType to whatsapp_web unless whatsapp_cloud_api is explicitly requested
  const reqType = input.providerType;
  if (reqType === "whatsapp_cloud_api") {
    out.providerType = "whatsapp_cloud_api";
  } else {
    out.providerType = "whatsapp_web";
  }

  // Handle safe provider fields
  const allowedFields = [
    "phoneNumberId",
    "businessAccountId",
    "encryptedAccessTokenRef",
    "webhookVerifyToken",
    "templateSyncStatus",
    "officialApiCapabilities",
    "providerStatus",
    "providerLastError",
  ];

  for (const f of allowedFields) {
    if (input[f] !== undefined) {
      out[f] = input[f];
    }
  }

  // Identify and encrypt any raw access token provided
  const rawToken = input.accessToken || input.access_token || input.token;
  if (rawToken && typeof rawToken === "string" && rawToken.trim().length > 0) {
    if (options?.encryptSecret) {
      try {
        const encrypted = await options.encryptSecret(rawToken.trim());
        out.encryptedAccessTokenRef = encrypted;
      } catch (err: any) {
        out.providerLastError = `encryption_failed: ${err?.message || err}`;
      }
    } else {
      out.providerLastError = "encryption_failed: no encryptSecret function injected";
    }
  }

  // Clean the output to ensure no raw secrets leak
  return stripRawProviderSecrets(out);
}

/**
 * Strips raw secrets/credentials keys (such as accessToken, token, apiKey, secret, appSecret).
 * Retains safe provider fields (including encryptedAccessTokenRef and webhookVerifyToken).
 */
export function stripRawProviderSecrets(input: any): Record<string, any> {
  if (!input || typeof input !== "object") {
    return {};
  }
  const out = { ...input };
  const unsafeKeys = [
    "accessToken",
    "access_token",
    "token",
    "apiKey",
    "api_key",
    "secret",
    "clientSecret",
    "client_secret",
    "appSecret",
    "app_secret"
  ];

  for (const key of Object.keys(out)) {
    const lowerKey = key.toLowerCase();
    const isUnsafe = unsafeKeys.some(uk => {
      const lowerUk = uk.toLowerCase();
      // Match exact unsafe key names
      if (lowerKey === lowerUk) return true;
      // Match general secret/token suffixes, avoiding false positives on safe fields
      if (lowerKey.endsWith("_token") && lowerKey !== "encryptedaccesstokenref") return true;
      if (lowerKey.endsWith("token") && lowerKey !== "encryptedaccesstokenref" && lowerKey !== "webhookverifytoken") return true;
      if (lowerKey.endsWith("secret")) return true;
      if (lowerKey.endsWith("key") && lowerKey !== "phoneid" && lowerKey !== "phonenumberid" && lowerKey !== "businessaccountid") return true;
      return false;
    });

    if (isUnsafe) {
      delete out[key];
    }
  }

  return out;
}
