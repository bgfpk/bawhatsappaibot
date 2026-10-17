import { WhatsAppProviderType, ProviderCapabilities } from "./whatsapp-transport-types.ts";

export const DEFAULT_PROVIDER_TYPE: WhatsAppProviderType = "whatsapp_web";

export function normalizeProviderType(value: any): WhatsAppProviderType {
    if (!value) return DEFAULT_PROVIDER_TYPE;
    
    const normalized = String(value).trim().toLowerCase();
    
    if (normalized === "whatsapp_cloud_api") {
        return "whatsapp_cloud_api";
    }
    
    // Default to whatsapp_web for unknown, missing, invalid, or legacy values
    return DEFAULT_PROVIDER_TYPE;
}

export function getProviderCapabilities(providerType: WhatsAppProviderType | string): ProviderCapabilities {
    const type = normalizeProviderType(providerType);
    
    if (type === "whatsapp_cloud_api") {
        return {
            supportsQrAuth: false, // Cloud API uses tokens, not QR
            supportsWebhook: true, // Cloud API requires webhook
            supportsGroups: false, // Subject to official-doc confirmation, generally no standard group chat
            supportsGroupLibraryTracking: false, // No group libraries
            supportsNativeForwarding: false, // Cannot forward messages naturally
            supportsFreeformOutsideWindow: false, // Requires templates outside 24h window
            supportsTemplates: true, // Core feature of Cloud API
            supportsMediaUpload: true, // Media must be uploaded first
            supportsMediaDownload: true, // Media downloaded via API endpoint
            supportsVoiceSend: true, // Requires correct MIME type
            supportsReadReceipts: true, // Webhook statuses
            supportsTypingPresence: false, // No typing presence supported in Cloud API
        };
    }
    
    // Baileys / WhatsApp Web
    return {
        supportsQrAuth: true,
        supportsWebhook: false,
        supportsGroups: true,
        supportsGroupLibraryTracking: true,
        supportsNativeForwarding: true,
        supportsFreeformOutsideWindow: true, // Baileys doesn't enforce 24h window locally
        supportsTemplates: false, // Baileys doesn't send official HSM templates natively
        supportsMediaUpload: false, // Direct buffer send
        supportsMediaDownload: true, // Direct buffer download
        supportsVoiceSend: true,
        supportsReadReceipts: true,
        supportsTypingPresence: true,
    };
}
