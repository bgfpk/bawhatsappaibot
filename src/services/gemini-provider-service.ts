import { GoogleGenAI } from "@google/genai";

import * as dbService from "./db-service.ts";
import { getUsageBillingDefinition } from "../config/pricing.ts";
import { getGoogleGenAIClientOptions } from "./gemini-cache-service.ts";
import { decryptServerSecret, encryptServerSecret, hasExplicitServerSecretEncryptionKey, maskSecret, redactSecrets } from "./secret-crypto-service.ts";
import { generateBackendText, shouldUseDeepInfraTextProviderForPurpose, type DeepInfraChatMessage } from "./ai-text-provider-service.ts";
import { getDeepInfraTextModel, hasDeepInfraTextProviderKey } from "./deepinfra-text-provider-service.ts";
import {
  assertGeminiAllowedForPurpose,
  getDeepInfraTextBlockedReason,
  getGeminiTextBlockedReason,
  isTextOnlyModality,
} from "./ai-provider-policy-service.ts";
import { recordSuccessfulCustomerTurnAiCall } from "./customer-turn-ai-call-ledger-service.ts";

export type GeminiProviderKind = "client_custom_gemini" | "platform_gemini";

export type GeminiProviderContext = {
  userId?: string;
  accountId?: string;
  dataOwnerKey?: string;
  botId?: string;
  purpose?: string;
  billingAction?: string;
  billingContext?: {
    billingGroupKey?: string;
    eventId?: string;
    messageId?: string;
    requestId?: string;
    customerJid?: string;
  };
};

type ClientGeminiSetting = {
  enabled: boolean;
  encryptedApiKey: string;
  explicitCacheBoostEnabled: boolean;
  updatedAt?: number;
};

function clean(value: any) {
  return String(value || "").trim();
}

const geminiProviderDeps = {
  loadUserConfig: dbService.loadUserConfig,
  saveUserExtraConfigPatch: dbService.saveUserExtraConfigPatch,
  canSendCustomerFacingMessage: dbService.canSendCustomerFacingMessage,
  getUser: dbService.getUser,
  getPlatformClientOptions: getGoogleGenAIClientOptions,
};

export function __setGeminiProviderTestDeps(overrides: Partial<typeof geminiProviderDeps>) {
  Object.assign(geminiProviderDeps, overrides || {});
}

export function __resetGeminiProviderTestDeps() {
  Object.assign(geminiProviderDeps, {
    loadUserConfig: dbService.loadUserConfig,
    saveUserExtraConfigPatch: dbService.saveUserExtraConfigPatch,
    canSendCustomerFacingMessage: dbService.canSendCustomerFacingMessage,
    getUser: dbService.getUser,
    getPlatformClientOptions: getGoogleGenAIClientOptions,
  });
}

function settingFromConfig(config: any): ClientGeminiSetting {
  const setting = config?.clientGemini || config?.client_gemini || {};
  return {
    enabled: setting?.enabled === true || setting?.enabled === 1,
    encryptedApiKey: clean(setting?.encryptedApiKey || setting?.encrypted_api_key),
    explicitCacheBoostEnabled: setting?.explicitCacheBoostEnabled === true || setting?.explicit_cache_boost_enabled === true || setting?.cacheBoostEnabled === true,
    updatedAt: Number(setting?.updatedAt || setting?.updated_at || 0) || 0,
  };
}

function contextAccountId(context: GeminiProviderContext) {
  return clean(context.accountId || context.userId);
}

function fallbackAccountId(context: GeminiProviderContext) {
  return contextAccountId(context) || clean(process.env.USER_ID);
}

export function maskGeminiApiKey(value: any) {
  return maskSecret(value);
}

export function isGoogleAiStudioGeminiApiKey(value: any) {
  const apiKey = clean(value);
  if (!apiKey) return false;
  if (apiKey.startsWith("{") || /service_account|private_key|client_email|project_id|location|vertex/i.test(apiKey)) return false;
  return /^AIza[0-9A-Za-z_-]{20,}$/.test(apiKey);
}

function normalizeDeepInfraRole(role: any): DeepInfraChatMessage["role"] {
  const value = clean(role).toLowerCase();
  if (value === "system") return "system";
  if (value === "assistant" || value === "model") return "assistant";
  return "user";
}

function requestParts(request: any) {
  return (request?.contents || []).flatMap((content: any) => Array.isArray(content?.parts) ? content.parts : []);
}

function hasAudioPart(request: any) {
  return requestParts(request).some((part: any) => /audio/i.test(String(part?.inlineData?.mimeType || "")));
}

function hasMediaPart(request: any) {
  return requestParts(request).some((part: any) => Boolean(part?.inlineData));
}

function hasImagePart(request: any) {
  return requestParts(request).some((part: any) => /image/i.test(String(part?.inlineData?.mimeType || "")));
}

function isTextOnlyRequest(request: any) {
  const parts = requestParts(request);
  return parts.length > 0 && parts.every((part: any) => Boolean(clean(part?.text)) && !part.inlineData && !part.functionCall && !part.functionResponse);
}

function hasSchemaRequirement(config: any = {}) {
  return Boolean(
    config?.responseSchema ||
    config?.schema ||
    config?.response_format ||
    String(config?.responseMimeType || "").toLowerCase().includes("json")
  );
}

function hasConfiguredTools(config: any = {}) {
  const tools = config?.tools;
  if (!tools) return false;
  const list = Array.isArray(tools) ? tools : [tools];
  return list.some((entry: any) => Array.isArray(entry?.functionDeclarations) && entry.functionDeclarations.length > 0);
}

function latestUserText(request: any) {
  const contents = request?.contents || [];
  for (let index = contents.length - 1; index >= 0; index -= 1) {
    const item = contents[index];
    if (item?.role !== "user") continue;
    const text = (item.parts || []).map((part: any) => clean(part?.text)).filter(Boolean).join(" ");
    if (text) return text;
  }
  return "";
}

function looksLikeActualToolRequired(text: string) {
  const value = clean(text).toLowerCase();
  if (!value) return false;
  return /\b(confirm\s*(order|booking|appointment)?|place\s*(order|booking)|book\s*(appointment|slot|visit)|send\s*(photo|image|pic|video|media|catalog|catalogue|file)|show\s*(photo|image|pic|video|media|catalog|catalogue)|voice\s*(note|reply|message)|audio\s*(reply|message)|remember\s*this|learn\s*this)\b/i.test(value) ||
    (/\b(buy|purchase|order now|checkout)\b/i.test(value) && /\b(address|phone|delivery|cod|quantity|confirm|place)\b/i.test(value));
}

function toDeepInfraMessages(request: any): DeepInfraChatMessage[] {
  return (request?.contents || [])
    .map((item: any): DeepInfraChatMessage => ({
      role: normalizeDeepInfraRole(item?.role),
      content: (item.parts || []).map((part: any) => clean(part?.text)).filter(Boolean).join("\n"),
    }))
    .filter((item: DeepInfraChatMessage) => Boolean(clean(item.content)));
}

function extractGeminiText(response: any) {
  try {
    if (typeof response?.text === "function") return clean(response.text());
  } catch {}
  if (response?.text) return clean(response.text);
  const parts = response?.candidates?.[0]?.content?.parts || [];
  return parts.map((part: any) => clean(part?.text)).filter(Boolean).join(" ").trim();
}

function toGeminiLikeResponse(result: any) {
  return {
    text: result.text || "",
    candidates: [{
      finishReason: result.text ? "STOP" : "",
      content: { parts: result.text ? [{ text: result.text }] : [] },
    }],
    provider: result.provider,
    model: result.model,
    backendTextProvider: true,
    providerTelemetry: result.telemetry,
    fallbackUsed: Boolean(result.fallbackUsed),
    fallbackReason: result.fallbackReason || "",
    usageMetadata: {
      promptTokenCount: Number(result.promptTokens || 0),
      candidatesTokenCount: Number(result.completionTokens || 0),
      totalTokenCount: Number(result.promptTokens || 0) + Number(result.completionTokens || 0),
      cachedContentTokenCount: Number(result.cachedTokens || 0),
    },
  };
}

function emitBackendTextLog(resolved: any, type: "info" | "warning", msg: string) {
  const line = `[BackendTextProvider] ${msg}`;
  if (type === "warning") console.warn(line);
  else console.info(line);
  resolved?.io?.emit?.("system-log", { type, msg });
}

function backendTextDecisionForRequest(resolved: any, request: any) {
  const purpose = clean(resolved?.purpose || "customer_ai_reply") || "customer_ai_reply";
  const config = request?.config || {};
  const hasAudio = hasAudioPart(request);
  const hasMedia = hasMediaPart(request);
  const toolsConfigured = hasConfiguredTools(config);
  const toolRequired = toolsConfigured && looksLikeActualToolRequired(latestUserText(request));
  const decision = shouldUseDeepInfraTextProviderForPurpose({
    purpose,
    hasMedia: hasMedia && !hasAudio,
    hasAudio,
    requiresVoice: /voice|tts|transcription/i.test(purpose),
    requiresGeminiTools: toolRequired,
    requiresSchema: hasSchemaRequirement(config),
    providerConfigured: hasDeepInfraTextProviderKey(),
  });
  if (!isTextOnlyRequest(request) && (request?.contents || []).length > 0) {
    return { ...decision, useDeepInfra: false, skipReason: hasAudio ? "audio_required" : "media_required" };
  }
  return decision;
}

function ensureGeminiPolicyForRequest(resolved: any, request: any) {
  const purpose = clean(resolved?.purpose || "customer_ai_reply") || "customer_ai_reply";
  assertGeminiAllowedForPurpose({
    purpose,
    hasImage: hasImagePart(request),
    hasAudio: hasAudioPart(request),
    hasMedia: hasMediaPart(request),
    isTts: /tts/i.test(purpose),
    isVoiceUnderstanding: /audio|voice|transcription/i.test(purpose),
    isImageRecognition: /image|vision|extract/i.test(purpose),
  });
}

export function wrapGeminiClientWithBackendTextProvider(baseAi: any, resolved: any) {
  const baseGenerateContent = baseAi?.models?.generateContent?.bind(baseAi.models);
  if (typeof baseGenerateContent !== "function") return baseAi;
  return {
    ...baseAi,
    models: {
      ...(baseAi?.models || {}),
      generateContent: async (request: any) => {
        if (request?.config?.skipBackendTextProvider) {
          return baseGenerateContent(request);
        }
        const purpose = clean(resolved?.purpose || "customer_ai_reply") || "customer_ai_reply";
        const decision = backendTextDecisionForRequest(resolved, request);
        emitBackendTextLog(resolved, "info", `backend_text_provider_decision purpose=${purpose} useDeepInfra=${decision.useDeepInfra} skipReason=${decision.skipReason}`);
        if (!decision.useDeepInfra) {
          if (isTextOnlyRequest(request)) {
            if (decision.skipReason === "provider_not_configured") {
              emitBackendTextLog(resolved, "warning", `${getDeepInfraTextBlockedReason()} purpose=${purpose} requestStatus=missing_key`);
              const blocked: any = new Error(getDeepInfraTextBlockedReason());
              blocked.code = getDeepInfraTextBlockedReason();
              blocked.provider = "deepinfra";
              blocked.purpose = purpose;
              blocked.requestStatus = "missing_key";
              throw blocked;
            }
            if (decision.skipReason !== "gemini_tool_required") {
              try {
                ensureGeminiPolicyForRequest(resolved, request);
              } catch (error: any) {
                emitBackendTextLog(resolved, "warning", `${getGeminiTextBlockedReason()} purpose=${purpose} modality=text`);
                throw error;
              }
            }
          }
          emitBackendTextLog(resolved, "info", `backend_text_provider_skipped provider=gemini skipReason=${decision.skipReason}`);
          const geminiResult = await baseGenerateContent(request);
          const customerTurnId = resolved?.customerTurnId || resolved?.billingContext?.customerTurnId;
          if (customerTurnId && geminiResult) {
            const providerCallId = resolved?.providerCallId || resolved?.billingContext?.providerCallId || `call_gemini_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
            recordSuccessfulCustomerTurnAiCall({
              customerTurnId,
              providerCallId,
              botId: resolved?.botId || resolved?.dataOwnerKey,
              accountId: resolved?.accountId || resolved?.userId,
              purpose,
              provider: "gemini",
              model: String(request?.model || "gemini"),
            });
          }
          return geminiResult;
        }
        emitBackendTextLog(resolved, "info", `backend_text_provider_call provider=deepinfra model=${getDeepInfraTextModel()} purpose=${purpose}`);
        const customerTurnId = resolved?.customerTurnId || resolved?.billingContext?.customerTurnId;
        const providerCallId = resolved?.providerCallId || resolved?.billingContext?.providerCallId;
        const result = await generateBackendText({
          purpose,
          accountId: resolved?.accountId || resolved?.userId,
          botId: resolved?.botId || resolved?.dataOwnerKey,
          customerJid: resolved?.billingContext?.customerJid,
          customerTurnId,
          providerCallId,
          stablePrompt: clean(request?.config?.systemInstruction || "BlackArrow customer reply runtime."),
          messages: toDeepInfraMessages(request),
          maxTokens: Number(request?.config?.maxOutputTokens || 900),
        });
        if (result.requestStatus !== "success" || !clean(result.text)) {
          emitBackendTextLog(resolved, "warning", `${getDeepInfraTextBlockedReason()} purpose=${purpose} requestStatus=${result.requestStatus}`);
          const blocked: any = new Error(getDeepInfraTextBlockedReason());
          blocked.code = getDeepInfraTextBlockedReason();
          blocked.provider = "deepinfra";
          blocked.purpose = purpose;
          blocked.requestStatus = result.requestStatus;
          throw blocked;
        }
        const telemetry = result.telemetry || {};
        emitBackendTextLog(resolved, "info", `backend_text_provider_result provider=${result.provider} model=${result.model} purpose=${purpose} fallbackUsed=${Boolean(result.fallbackUsed)} fallbackReason=${result.fallbackReason || ""} promptTokens=${Number(result.promptTokens || 0)} completionTokens=${Number(result.completionTokens || 0)} cachedTokens=${Number(result.cachedTokens || 0)} promptCacheKeyAttached=${Boolean(telemetry.promptCacheKeyAttached)} promptCacheKeyHash=${telemetry.promptCacheKeyHash || ""} stablePromptHash=${telemetry.stablePromptHash || ""} account=${telemetry.accountId || ""} bot=${telemetry.botId || ""} customer=${telemetry.customerJid || ""}`);
        return toGeminiLikeResponse(result);
      },
    },
  };
}

export async function getClientGeminiStatus(userId: string) {
  const config = await geminiProviderDeps.loadUserConfig(userId).catch(() => null);
  const setting = settingFromConfig(config || {});
  let maskedKey = "";
  if (setting.encryptedApiKey) {
    try {
      maskedKey = maskGeminiApiKey(decryptServerSecret(setting.encryptedApiKey));
    } catch {
      maskedKey = "****";
    }
  }
  return {
    enabled: Boolean(setting.enabled && setting.encryptedApiKey),
    hasKey: Boolean(setting.encryptedApiKey),
    maskedKey,
    cacheBoostEnabled: Boolean(setting.explicitCacheBoostEnabled && setting.enabled && setting.encryptedApiKey),
    updatedAt: setting.updatedAt || 0,
  };
}

export async function getClientGeminiApiKeyForServer(userId: string) {
  const config = await geminiProviderDeps.loadUserConfig(userId).catch(() => null);
  const setting = settingFromConfig(config || {});
  if (!setting.enabled || !setting.encryptedApiKey) return "";
  const apiKey = decryptServerSecret(setting.encryptedApiKey);
  if (!isGoogleAiStudioGeminiApiKey(apiKey)) throw new Error("invalid_google_ai_studio_gemini_api_key");
  return apiKey;
}

export async function saveClientGeminiSetting(userId: string, input: { enabled?: boolean; apiKey?: string; cacheBoostEnabled?: boolean }) {
  const existing = await geminiProviderDeps.loadUserConfig(userId).catch(() => null);
  const current = settingFromConfig(existing || {});
  const apiKey = clean(input.apiKey);
  if (apiKey && !isGoogleAiStudioGeminiApiKey(apiKey)) {
    throw new Error("Invalid Google AI Studio Gemini API key.");
  }
  if (apiKey && !hasExplicitServerSecretEncryptionKey()) {
    console.warn("[ClientGemini] BLACKARROW_SECRET_ENCRYPTION_KEY or SECRET_ENCRYPTION_KEY is not set; client keys require server-side encryption and are never saved as plaintext.");
  }
  const nextSetting = {
    enabled: input.enabled === undefined ? current.enabled : Boolean(input.enabled),
    encryptedApiKey: apiKey ? encryptServerSecret(apiKey) : current.encryptedApiKey,
    explicitCacheBoostEnabled: input.cacheBoostEnabled === undefined ? current.explicitCacheBoostEnabled : Boolean(input.cacheBoostEnabled),
    updatedAt: Math.floor(Date.now() / 1000),
  };
  await geminiProviderDeps.saveUserExtraConfigPatch(userId, { clientGemini: nextSetting });
  return getClientGeminiStatus(userId);
}

export async function removeClientGeminiSetting(userId: string) {
  await geminiProviderDeps.saveUserExtraConfigPatch(userId, {
    clientGemini: { enabled: false, encryptedApiKey: "", explicitCacheBoostEnabled: false, updatedAt: Math.floor(Date.now() / 1000) },
  });
  return getClientGeminiStatus(userId);
}

export async function resolveGeminiProvider(context: GeminiProviderContext = {}) {
  const accountId = fallbackAccountId(context);
  if (accountId) {
    const config = await geminiProviderDeps.loadUserConfig(accountId).catch(() => null);
    const setting = settingFromConfig(config || {});
    if (setting.enabled && setting.encryptedApiKey) {
      const access = await geminiProviderDeps.canSendCustomerFacingMessage(accountId);
      if (!access.allowed) {
        const error: any = new Error(access.reason || "account_access_expired");
        error.code = access.reason || "account_access_expired";
        error.provider = "client_custom_gemini";
        throw error;
      }
      const user = await geminiProviderDeps.getUser(accountId).catch(() => null) as any;
      const required = getUsageBillingDefinition("client_gemini_message_cycle").priceUsd;
      if (Math.max(0, Number(user?.wallet_balance || 0)) < required) {
        const error: any = new Error("insufficient_wallet");
        error.code = "insufficient_wallet";
        error.provider = "client_custom_gemini";
        throw error;
      }
      const apiKey = decryptServerSecret(setting.encryptedApiKey);
      if (!apiKey) throw new Error("client_gemini_key_empty");
      if (!isGoogleAiStudioGeminiApiKey(apiKey)) {
        const error: any = new Error("invalid_google_ai_studio_gemini_api_key");
        error.code = "invalid_google_ai_studio_gemini_api_key";
        error.provider = "client_custom_gemini";
        throw error;
      }
      return {
        provider: "client_custom_gemini" as const,
        accountId,
        userId: accountId,
        botId: clean(context.botId || context.dataOwnerKey),
        purpose: clean(context.purpose),
        billingAction: clean(context.billingAction || "client_gemini_message_cycle"),
        billingContext: context.billingContext || {},
        clientOptions: { apiKey },
        explicitCacheBoostEnabled: Boolean(setting.explicitCacheBoostEnabled),
        apiKeyMask: maskGeminiApiKey(apiKey),
        redact: (value: any) => redactSecrets(value, [apiKey]),
      };
    }
  }

  const clientOptions = geminiProviderDeps.getPlatformClientOptions();
  if (!clientOptions) throw new Error("ai_provider_not_configured");
  return {
    provider: "platform_gemini" as const,
    accountId,
    userId: accountId,
    botId: clean(context.botId || context.dataOwnerKey),
    purpose: clean(context.purpose),
    billingAction: "",
    billingContext: context.billingContext || {},
    clientOptions,
    apiKeyMask: "",
    redact: (value: any) => String(value || ""),
  };
}

export async function createGeminiClient(context: GeminiProviderContext = {}) {
  const resolved = await resolveGeminiProvider(context);
  const ai = new GoogleGenAI(resolved.clientOptions as any);
  return {
    ...resolved,
    ai: wrapGeminiClientWithBackendTextProvider(ai, resolved),
  };
}

export function isClientGeminiProvider(provider: any) {
  return provider?.provider === "client_custom_gemini";
}
