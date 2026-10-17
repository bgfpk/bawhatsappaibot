// src/services/whatsapp-cloud-api-runtime-decision.ts
//
// Pure runtime activation decision service for WhatsApp Cloud API.
//
// Determines whether an instance is eligible to activate its Cloud API runtime
// based on global rollout flags, provider configuration, and decrypted credentials.
//
// INVARIANT:
//   If an instance has providerType === "whatsapp_cloud_api", activeRuntimeProvider
//   must NEVER silently report "whatsapp_web". Cloud remains Cloud.

export interface CloudApiRuntimeDecisionInput {
  providerType?: string;
  isPlatformRolloutEnabled?: boolean;
  phoneNumberId?: string;
  encryptedAccessTokenRef?: string;
  decryptedAccessToken?: string;
  decryptError?: string;
  webhookSecurityConfigured?: boolean;
}

export interface CloudApiRuntimeDecisionResult {
  runtimeEnabled: boolean;
  activeRuntimeProvider: "whatsapp_web" | "whatsapp_cloud_api";
  reason: string;
  missingFields: string[];
}

/**
 * Checks whether the platform-level Cloud API runtime switch is enabled.
 * Reads server-side environment variable WHATSAPP_CLOUD_API_RUNTIME_ENABLED.
 */
export function isCloudApiPlatformRolloutEnabled(override?: boolean): boolean {
  if (typeof override === "boolean") {
    return override;
  }
  if (typeof process !== "undefined" && process.env) {
    return process.env.WHATSAPP_CLOUD_API_RUNTIME_ENABLED === "true";
  }
  return false;
}

/**
 * Pure decision function evaluating Cloud API runtime activation.
 */
export function evaluateCloudApiRuntimeActivation(
  input: CloudApiRuntimeDecisionInput,
): CloudApiRuntimeDecisionResult {
  const providerType = input.providerType || "whatsapp_web";

  // 1. If provider is whatsapp_web, return standard Web state
  if (providerType !== "whatsapp_cloud_api") {
    return {
      runtimeEnabled: false,
      activeRuntimeProvider: "whatsapp_web",
      reason: "provider_not_cloud_api",
      missingFields: [],
    };
  }

  // 2. Provider is whatsapp_cloud_api: activeRuntimeProvider is ALWAYS whatsapp_cloud_api
  const isRolloutEnabled = isCloudApiPlatformRolloutEnabled(input.isPlatformRolloutEnabled);
  if (!isRolloutEnabled) {
    return {
      runtimeEnabled: false,
      activeRuntimeProvider: "whatsapp_cloud_api",
      reason: "platform_disabled",
      missingFields: [],
    };
  }

  const phoneId = String(input.phoneNumberId || "").trim();
  if (!phoneId) {
    return {
      runtimeEnabled: false,
      activeRuntimeProvider: "whatsapp_cloud_api",
      reason: "missing_phone_number_id",
      missingFields: ["phoneNumberId"],
    };
  }

  const tokenRef = String(input.encryptedAccessTokenRef || "").trim();
  if (!tokenRef) {
    return {
      runtimeEnabled: false,
      activeRuntimeProvider: "whatsapp_cloud_api",
      reason: "missing_token_ref",
      missingFields: ["encryptedAccessTokenRef"],
    };
  }

  if (input.decryptError || !input.decryptedAccessToken || !String(input.decryptedAccessToken).trim()) {
    return {
      runtimeEnabled: false,
      activeRuntimeProvider: "whatsapp_cloud_api",
      reason: "decrypt_failed",
      missingFields: [],
    };
  }

  if (input.webhookSecurityConfigured === false) {
    return {
      runtimeEnabled: false,
      activeRuntimeProvider: "whatsapp_cloud_api",
      reason: "webhook_security_not_configured",
      missingFields: [],
    };
  }

  return {
    runtimeEnabled: true,
    activeRuntimeProvider: "whatsapp_cloud_api",
    reason: "ready",
    missingFields: [],
  };
}
