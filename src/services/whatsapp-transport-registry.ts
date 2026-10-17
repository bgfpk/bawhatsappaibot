/*
 * Transport Registry Foundation for WhatsApp providers
 * Allows registering factory functions for each provider type and creating
 * providers from a configuration without side effects.
 */
import { WhatsAppProviderType } from "./whatsapp-transport-types.ts";
import { WhatsAppTransportProvider } from "./whatsapp-transport-types.ts";
import { WhatsAppProviderConfig, normalizeWhatsAppProviderConfig } from "./whatsapp-provider-config.ts";

type ProviderFactory = (config: WhatsAppProviderConfig, dependencies?: any) => WhatsAppTransportProvider;

/** Internal registry map */
const registry = new Map<WhatsAppProviderType, ProviderFactory>();

/** Register a factory for a specific provider type. */
export function registerWhatsAppTransportProvider(
  providerType: WhatsAppProviderType,
  factory: ProviderFactory,
): void {
  registry.set(providerType, factory);
}

/** Retrieve a factory for a provider type (may be undefined). */
export function getWhatsAppTransportProviderFactory(
  providerType: WhatsAppProviderType,
): ProviderFactory | undefined {
  return registry.get(providerType);
}

/**
 * Create a provider instance from a raw config object.
 * - Normalizes the config (defaults providerType).
 * - Looks up a registered factory; if missing, falls back to "whatsapp_web".
 * - Returns the instance from the factory.
 */
export function createWhatsAppTransportProviderFromConfig(
  rawConfig: any,
  dependencies?: any,
): WhatsAppTransportProvider {
  const config = normalizeWhatsAppProviderConfig(rawConfig);
  const type: WhatsAppProviderType = config.providerType ?? "whatsapp_web";
  const factory = registry.get(type) ?? registry.get("whatsapp_web");
  if (!factory) {
    throw new Error(`No transport provider factory registered for type ${type}`);
  }
  return factory(config, dependencies);
}

/** Helper for tests – clear the registry (not exported in production). */
export function __clearRegistryForTests(): void {
  registry.clear();
}
