// src/services/whatsapp-meta-onboarding-service.ts
//
// Authoritative server-side orchestration service for Meta Embedded Signup onboarding:
// 1. Authenticates ownership & validates short-lived onboarding attempt
// 2. Multi-tenant isolation & duplicate Phone Number ID attachment protection
// 3. Server-side authorization code exchange
// 4. Authoritative WABA phone number validation
// 5. WABA webhook subscription
// 6. 6-digit PIN phone registration
// 7. Encrypted credential persistence (tokens/PINs never stored or returned in plaintext)

import {
  MetaPlatformConfig,
  resolveMetaPlatformConfig,
} from "./whatsapp-meta-onboarding-config.ts";
import {
  validateAndConsumeOnboardingAttempt,
} from "./whatsapp-meta-onboarding-session.ts";
import {
  exchangeAuthorizationCode,
  getWabaPhoneNumbers,
  subscribeWabaApp,
  registerPhoneNumber,
  WabaPhoneRecord,
} from "./whatsapp-meta-onboarding-graph-client.ts";
import { parseConfigSettings } from "./whatsapp-provider-config-storage.ts";
import { encryptServerSecret } from "./secret-crypto-service.ts";

export interface CompleteMetaOnboardingInput {
  userId: string;
  botId: string;
  attemptId: string;
  state: string;
  code: string;
  wabaId: string;
  phoneNumberId: string;
  businessId?: string;
  pin: string;
}

export interface MetaOnboardingServiceDeps {
  getBotById: (botId: string) => Promise<any>;
  saveBotProviderConfig: (botId: string, config: any, opts?: any) => Promise<boolean>;
  listAllBots?: () => Promise<any[]>;
  platformConfig?: MetaPlatformConfig;
  encryptSecret?: (raw: string) => string | Promise<string>;
  fetchImpl?: typeof fetch;
  onWorkerReload?: (botId: string) => Promise<void>;
}

export interface OnboardingCompletionResult {
  success: boolean;
  botId: string;
  providerType: "whatsapp_cloud_api";
  providerStatus: "configured";
  phoneNumberId: string;
  displayPhoneNumber: string;
  verifiedName?: string;
  businessAccountId: string;
}

export interface DisconnectMetaCloudInput {
  userId: string;
  botId: string;
}

function clean(value: any): string {
  return String(value ?? "").trim();
}

/**
 * Checks if a Meta phoneNumberId is already attached to another BlackArrow account.
 */
export async function checkMetaPhoneNumberAttachment(
  phoneNumberId: string,
  currentUserId: string,
  currentBotId: string,
  listBotsFn?: () => Promise<any[]>
): Promise<{ allowed: boolean; reason?: string }> {
  if (!listBotsFn) {
    return { allowed: true };
  }

  try {
    const allBots = await listBotsFn();
    for (const b of allBots) {
      const bId = String(b.$id || b.id || "");
      const bUserId = String(b.user_id || "");

      // Ignore current bot
      if (bId === currentBotId) continue;

      const settings = parseConfigSettings(b.config_settings);
      const attachedPhoneId = clean(settings?.phoneNumberId || settings?.provider?.phoneNumberId);

      if (attachedPhoneId && attachedPhoneId === phoneNumberId) {
        if (bUserId !== currentUserId) {
          return {
            allowed: false,
            reason: "This WhatsApp number is already connected to another BlackArrow account.",
          };
        }
      }
    }
  } catch (err: any) {
    console.warn("[MetaOnboarding] Attachment check warning:", err?.message || err);
  }

  return { allowed: true };
}

/**
 * Completes customer Meta Embedded Signup onboarding.
 */
export async function completeMetaOnboarding(
  input: CompleteMetaOnboardingInput,
  deps: MetaOnboardingServiceDeps
): Promise<OnboardingCompletionResult> {
  const userId = clean(input.userId);
  const botId = clean(input.botId);
  const attemptId = clean(input.attemptId);
  const state = clean(input.state);
  const code = clean(input.code);
  const wabaId = clean(input.wabaId);
  const phoneNumberId = clean(input.phoneNumberId);
  const pin = clean(input.pin);

  // 1. Basic validation
  if (!userId || !botId || !attemptId || !state || !code || !wabaId || !phoneNumberId || !pin) {
    throw new Error("missing_required_onboarding_parameters");
  }

  if (!/^\d{6}$/.test(pin)) {
    throw new Error("invalid_registration_pin: PIN must be exactly 6 digits");
  }

  // 2. Authoritative Bot ownership verification
  const bot = await deps.getBotById(botId).catch(() => null);
  if (!bot || String(bot.user_id || "") !== userId) {
    throw new Error("bot_not_owned");
  }

  // 3. Validate & consume short-lived onboarding attempt
  const attemptValidation = validateAndConsumeOnboardingAttempt({
    attemptId,
    state,
    userId,
    botId,
  });

  if (!attemptValidation.valid) {
    throw new Error(`invalid_onboarding_session: ${attemptValidation.reason}`);
  }

  // 4. Duplicate attachment safety
  const attachmentCheck = await checkMetaPhoneNumberAttachment(
    phoneNumberId,
    userId,
    botId,
    deps.listAllBots
  );
  if (!attachmentCheck.allowed) {
    throw new Error(attachmentCheck.reason || "phone_number_already_attached");
  }

  // 5. Resolve platform config
  const platformConfig = deps.platformConfig || resolveMetaPlatformConfig();
  if (!platformConfig.isComplete) {
    throw new Error(`meta_platform_incomplete: missing [${platformConfig.missingFields.join(", ")}]`);
  }

  // 6. Exchange authorization code for integration access token server-side
  const tokenExchangeResult = await exchangeAuthorizationCode({
    appId: platformConfig.appId,
    appSecret: platformConfig.appSecret,
    redirectUri: platformConfig.redirectUri,
    code,
    graphVersion: platformConfig.graphVersion,
    fetchImpl: deps.fetchImpl,
  });

  const accessToken = tokenExchangeResult.accessToken;
  if (!accessToken) {
    throw new Error("token_exchange_failed: missing access_token");
  }

  // 7. Authoritative Asset Validation: Fetch WABA's phone numbers and verify phoneNumberId belongs to WABA
  const wabaPhones = await getWabaPhoneNumbers({
    wabaId,
    accessToken,
    graphVersion: platformConfig.graphVersion,
    fetchImpl: deps.fetchImpl,
  });

  const matchedPhone: WabaPhoneRecord | undefined = wabaPhones.find((p) => p.id === phoneNumberId);
  if (!matchedPhone) {
    throw new Error("asset_validation_failed: Phone Number ID does not belong to specified WABA");
  }

  // 8. Subscribe BlackArrow App to WABA
  await subscribeWabaApp({
    wabaId,
    accessToken,
    graphVersion: platformConfig.graphVersion,
    fetchImpl: deps.fetchImpl,
  });

  // 9. Register phone number with customer-selected 6-digit PIN
  await registerPhoneNumber({
    phoneNumberId,
    pin,
    accessToken,
    graphVersion: platformConfig.graphVersion,
    fetchImpl: deps.fetchImpl,
  });

  // 10. Encrypt credentials
  const encryptFn = deps.encryptSecret || encryptServerSecret;
  const encryptedAccessTokenRef = await encryptFn(accessToken);
  const encryptedRegistrationPinRef = await encryptFn(pin);

  if (!encryptedAccessTokenRef) {
    throw new Error("credential_encryption_failed: unable to encrypt access token");
  }

  // 11. Persist authoritative provider configuration
  const providerConfigData = {
    providerType: "whatsapp_cloud_api",
    providerStatus: "configured",
    phoneNumberId,
    businessAccountId: wabaId,
    displayPhoneNumber: matchedPhone.display_phone_number,
    verifiedName: matchedPhone.verified_name,
    qualityRating: matchedPhone.quality_rating,
    encryptedAccessTokenRef,
    encryptedRegistrationPinRef,
    connectedAt: Date.now(),
    lastOnboardingError: undefined,
  };

  const saveOk = await deps.saveBotProviderConfig(botId, providerConfigData, {
    encryptSecret: encryptFn,
  });

  if (!saveOk) {
    throw new Error("provider_config_persistence_failed");
  }

  // 12. Trigger worker reload if injected
  if (deps.onWorkerReload) {
    await deps.onWorkerReload(botId).catch((err) => {
      console.warn(`[MetaOnboarding] Worker reload notification failed for ${botId}:`, err?.message || err);
    });
  }

  // 13. Return safe summary (NEVER raw tokens or secrets)
  return {
    success: true,
    botId,
    providerType: "whatsapp_cloud_api",
    providerStatus: "configured",
    phoneNumberId,
    displayPhoneNumber: matchedPhone.display_phone_number,
    verifiedName: matchedPhone.verified_name,
    businessAccountId: wabaId,
  };
}

/**
 * Disconnects a Meta Cloud instance safely.
 * Stops worker, removes encrypted access token ref, sets providerStatus to "disconnected".
 * Does NOT deregister phone or delete WABA from Meta.
 */
export async function disconnectMetaCloudInstance(
  input: DisconnectMetaCloudInput,
  deps: MetaOnboardingServiceDeps
): Promise<{ success: boolean; botId: string; providerStatus: string }> {
  const userId = clean(input.userId);
  const botId = clean(input.botId);

  if (!userId || !botId) {
    throw new Error("missing_parameters");
  }

  const bot = await deps.getBotById(botId).catch(() => null);
  if (!bot || String(bot.user_id || "") !== userId) {
    throw new Error("bot_not_owned");
  }

  const disconnectConfig = {
    providerType: "whatsapp_cloud_api",
    providerStatus: "disconnected",
    encryptedAccessTokenRef: "",
    disconnectedAt: Date.now(),
  };

  const saveOk = await deps.saveBotProviderConfig(botId, disconnectConfig);
  if (!saveOk) {
    throw new Error("failed_to_save_disconnect_state");
  }

  if (deps.onWorkerReload) {
    await deps.onWorkerReload(botId).catch(() => {});
  }

  return {
    success: true,
    botId,
    providerStatus: "disconnected",
  };
}
