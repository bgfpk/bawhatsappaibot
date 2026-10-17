// src/services/whatsapp-provider-bot-config-adapter.ts
import { WhatsAppProviderConfig } from "./whatsapp-provider-config.ts";
import {
  parseConfigSettings,
  readProviderConfigFromSettings,
  mergeProviderConfigIntoSettings
} from "./whatsapp-provider-config-storage.ts";

/**
 * Safely extracts the config_settings object from a bot document.
 * Supports config_settings as a JSON string, a plain object, or missing/invalid values.
 */
export function getConfigSettingsFromBotDocument(botDoc: any): Record<string, any> {
  if (!botDoc) {
    return {};
  }
  return parseConfigSettings(botDoc.config_settings);
}

/**
 * Reads provider configuration from a bot document.
 * Safely defaults providerType to "whatsapp_web" if missing or invalid.
 */
export function readProviderConfigFromBotDocument(botDoc: any): WhatsAppProviderConfig {
  const configSettings = getConfigSettingsFromBotDocument(botDoc);
  return readProviderConfigFromSettings(configSettings);
}

/**
 * Merges provider configuration into a bot document's config_settings.
 * Preserves existing bot document fields and unrelated config settings.
 * Returns a new document object without mutating the original.
 */
export function mergeProviderConfigIntoBotDocument(
  botDoc: any,
  providerConfig: any
): Record<string, any> {
  const docCopy = botDoc ? { ...botDoc } : {};
  const existingConfig = getConfigSettingsFromBotDocument(docCopy);
  const mergedConfig = mergeProviderConfigIntoSettings(existingConfig, providerConfig);

  // Preserve the original shape of config_settings (string vs object)
  if (botDoc && typeof botDoc.config_settings === "string") {
    docCopy.config_settings = JSON.stringify(mergedConfig);
  } else {
    docCopy.config_settings = mergedConfig;
  }

  return docCopy;
}
