// src/services/whatsapp-provider-config-storage.ts
import { WhatsAppProviderConfig, normalizeWhatsAppProviderConfig } from "./whatsapp-provider-config.ts";

/**
 * Parses raw config settings which can be a plain object, JSON string, null/undefined, or invalid JSON.
 * Returns a plain object representation.
 */
export function parseConfigSettings(configSettings: any): Record<string, any> {
  if (!configSettings) {
    return {};
  }
  if (typeof configSettings === "object") {
    return { ...configSettings };
  }
  if (typeof configSettings === "string") {
    try {
      const parsed = JSON.parse(configSettings);
      if (parsed && typeof parsed === "object") {
        return parsed;
      }
    } catch {
      // Invalid JSON returns empty object
    }
  }
  return {};
}

/**
 * Reads provider configuration from the existing config_settings.
 * Safely defaults providerType to "whatsapp_web" if missing or invalid.
 */
export function readProviderConfigFromSettings(configSettings: any): WhatsAppProviderConfig {
  const parsed = parseConfigSettings(configSettings);
  return normalizeWhatsAppProviderConfig(parsed);
}

/**
 * Merges new provider configuration into existing config_settings.
 * Preserves unrelated settings and filters out raw secrets (such as raw access tokens).
 */
export function mergeProviderConfigIntoSettings(
  configSettings: any,
  providerConfig: any
): Record<string, any> {
  const existing = parseConfigSettings(configSettings);
  
  // Normalize new provider config using existing validator/normalizer (which drops raw keys)
  const normalizedProvider = normalizeWhatsAppProviderConfig(providerConfig || {});
  
  const cleanNormalized = { ...normalizedProvider };
  const rawSecretKeys = [
    "accessToken",
    "access_token",
    "token",
    "rawToken",
    "appSecret",
    "app_secret",
    "secret"
  ];
  
  // Delete any raw keys from the providerConfig if passed directly
  if (providerConfig && typeof providerConfig === "object") {
    for (const key of Object.keys(providerConfig)) {
      const lowerKey = key.toLowerCase();
      if (rawSecretKeys.some(sk => lowerKey === sk.toLowerCase())) {
        // @ts-ignore
        delete cleanNormalized[key];
      }
    }
  }

  // Remove any raw secret fields from the existing config to prevent leak propagation
  for (const key of Object.keys(existing)) {
    const lowerKey = key.toLowerCase();
    if (rawSecretKeys.some(sk => lowerKey === sk.toLowerCase())) {
      delete existing[key];
    }
  }

  // Merge them together, preserving unrelated fields in existing settings
  const merged = {
    ...existing,
    ...cleanNormalized,
  };

  return merged;
}
