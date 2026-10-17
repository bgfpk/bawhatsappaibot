// src/services/whatsapp-cloud-api-runtime-config.ts
import { WhatsAppProviderConfig } from "./whatsapp-provider-config.ts";
import {
  evaluateCloudApiRuntimeActivation,
  isCloudApiPlatformRolloutEnabled,
} from "./whatsapp-cloud-api-runtime-decision.ts";
import { isCloudWebhookSecurityConfigured } from "./whatsapp-cloud-api-webhook.ts";

export interface CloudApiRuntimeConfigResult {
  runtimeEnabled: boolean;
  activeRuntimeProvider: "whatsapp_web" | "whatsapp_cloud_api";
  reason?: string;
  phoneNumberId?: string;
  businessAccountId?: string;
  accessToken?: string;
  errorMessage?: string;
  missingFields?: string[];
}

export interface ResolveCloudApiRuntimeConfigOptions {
  decryptSecret?: (encryptedRef: string) => string | Promise<string>;
  isPlatformRolloutEnabled?: boolean;
  webhookSecurityConfigured?: boolean;
  env?: Record<string, string | undefined>;
  logger?: {
    info?: (...args: any[]) => void;
    warn?: (...args: any[]) => void;
    error?: (...args: any[]) => void;
  };
}

/**
 * Prepares the Official Cloud API runtime configuration from provider settings.
 * Validates readiness and decrypts credentials using an injected decryption function.
 * Inputs are never mutated and secrets are never exposed in log outputs.
 */
export async function resolveCloudApiRuntimeConfig(
  providerConfig: WhatsAppProviderConfig,
  options?: ResolveCloudApiRuntimeConfigOptions
): Promise<CloudApiRuntimeConfigResult> {
  const logger = options?.logger;
  
  if (!providerConfig || providerConfig.providerType !== "whatsapp_cloud_api") {
    return {
      runtimeEnabled: false,
      activeRuntimeProvider: "whatsapp_web",
      reason: "provider_not_cloud_api",
      missingFields: [],
    };
  }

  // Check platform rollout flag first
  const rolloutEnabled = isCloudApiPlatformRolloutEnabled(options?.isPlatformRolloutEnabled);
  if (!rolloutEnabled) {
    if (logger?.info) {
      logger.info("[CloudApiRuntimeConfig] Cloud API runtime is globally disabled via platform flag.");
    }
    return {
      runtimeEnabled: false,
      activeRuntimeProvider: "whatsapp_cloud_api",
      reason: "platform_disabled",
      phoneNumberId: providerConfig.phoneNumberId,
      businessAccountId: providerConfig.businessAccountId,
      missingFields: [],
    };
  }

  if (!providerConfig.phoneNumberId) {
    if (logger?.warn) {
      logger.warn("[CloudApiRuntimeConfig] Not ready: phoneNumberId is missing.");
    }
    return {
      runtimeEnabled: false,
      activeRuntimeProvider: "whatsapp_cloud_api",
      reason: "missing_phone_number_id",
      missingFields: ["phoneNumberId"],
    };
  }

  if (!providerConfig.encryptedAccessTokenRef) {
    if (logger?.warn) {
      logger.warn("[CloudApiRuntimeConfig] Not ready: encryptedAccessTokenRef is missing.");
    }
    return {
      runtimeEnabled: false,
      activeRuntimeProvider: "whatsapp_cloud_api",
      reason: "missing_token_ref",
      phoneNumberId: providerConfig.phoneNumberId,
      businessAccountId: providerConfig.businessAccountId,
      missingFields: ["encryptedAccessTokenRef"],
    };
  }

  if (!options?.decryptSecret) {
    if (logger?.error) {
      logger.error("[CloudApiRuntimeConfig] Error: Decryption function was not injected.");
    }
    return {
      runtimeEnabled: false,
      activeRuntimeProvider: "whatsapp_cloud_api",
      reason: "missing_decrypt_function",
      phoneNumberId: providerConfig.phoneNumberId,
      businessAccountId: providerConfig.businessAccountId,
      missingFields: [],
    };
  }

  let decryptedToken: string | undefined;
  let decryptError: string | undefined;

  try {
    const res = await options.decryptSecret(providerConfig.encryptedAccessTokenRef);
    if (!res || !String(res).trim()) {
      throw new Error("Decryption returned empty token.");
    }
    decryptedToken = String(res).trim();
  } catch (err: any) {
    decryptError = err?.message || String(err);
    if (logger?.error) {
      logger.error(`[CloudApiRuntimeConfig] Decryption failed: ${decryptError}`);
    }
  }

  const webhookSecurityConfigured =
    options?.webhookSecurityConfigured ??
    isCloudWebhookSecurityConfigured(options?.env ?? process.env);

  const decision = evaluateCloudApiRuntimeActivation({
    providerType: providerConfig.providerType,
    isPlatformRolloutEnabled: rolloutEnabled,
    phoneNumberId: providerConfig.phoneNumberId,
    encryptedAccessTokenRef: providerConfig.encryptedAccessTokenRef,
    decryptedAccessToken: decryptedToken,
    decryptError,
    webhookSecurityConfigured,
  });

  return {
    runtimeEnabled: decision.runtimeEnabled,
    activeRuntimeProvider: decision.activeRuntimeProvider,
    reason: decision.reason,
    phoneNumberId: providerConfig.phoneNumberId,
    businessAccountId: providerConfig.businessAccountId,
    accessToken: decision.runtimeEnabled ? decryptedToken : undefined,
    errorMessage: decryptError,
    missingFields: decision.missingFields,
  };
}

/**
 * Prepares a safe log-ready summary of the runtime configuration result.
 * Never includes raw secrets or encrypted secret references.
 */
export function summarizeCloudApiRuntimeConfig(result: CloudApiRuntimeConfigResult) {
  return {
    runtimeEnabled: result.runtimeEnabled,
    activeRuntimeProvider: result.activeRuntimeProvider,
    reason: result.reason,
    phoneNumberId: result.phoneNumberId,
    businessAccountId: result.businessAccountId,
    errorMessage: result.errorMessage,
    missingFields: result.missingFields,
    hasAccessToken: !!result.accessToken,
  };
}
