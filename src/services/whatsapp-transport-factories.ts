// src/services/whatsapp-transport-factories.ts
import { WhatsAppProviderType, WhatsAppTransportProvider } from "./whatsapp-transport-types.ts";
import { WhatsAppProviderConfig } from "./whatsapp-provider-config.ts";
import { registerWhatsAppTransportProvider } from "./whatsapp-transport-registry.ts";
import { BaileysTransportProvider } from "./baileys-transport-provider.ts";
import { WhatsAppCloudApiTransportProvider } from "./whatsapp-cloud-api-transport-provider.ts";

/**
 * Baileys factory – creates a BaileysTransportProvider.
 * `deps` can include a fake `socket` for testing.
 */
export function createBaileysFactory(
  config: WhatsAppProviderConfig,
  deps?: { socket?: any }
): WhatsAppTransportProvider {
  // The BaileysTransportProvider constructor accepts {socket, botId, logger}
  return new BaileysTransportProvider({
    socket: deps?.socket,
    botId: config.providerStatus, // just an example placeholder, not used currently
  });
}

/**
 * Factory for the official WhatsApp Cloud API.
 * Returns a provider that reports unsupported operations if no httpClient is provided.
 */
export function createWhatsAppCloudApiPlaceholderFactory(
  config: WhatsAppProviderConfig,
  deps?: any
): WhatsAppTransportProvider {
  return new WhatsAppCloudApiTransportProvider({
    phoneNumberId: config.phoneNumberId,
    httpClient: deps?.httpClient,
    logger: deps?.logger,
  });
}

/**
 * Register the default factories for both provider types.
 * This function is side‑effect free until called – it does not run on import.
 */
export function registerDefaultWhatsAppTransportFactories(): void {
  // Register Web/Baileys factory
  registerWhatsAppTransportProvider("whatsapp_web", createBaileysFactory);
  // Register Cloud API factory
  registerWhatsAppTransportProvider(
    "whatsapp_cloud_api",
    createWhatsAppCloudApiPlaceholderFactory
  );
}

