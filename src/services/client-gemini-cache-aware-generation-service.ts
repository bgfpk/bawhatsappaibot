import { createHash } from "crypto";

import { buildExplicitCacheRequestConfig, getOrCreateGeminiExplicitCache } from "./gemini-explicit-cache-service.ts";
import { runGeminiRequestWithClientBilling } from "./client-gemini-billing-service.ts";
import { isUnsupportedThinkingConfigError, stripThinkingConfig, withLowThinkingConfig } from "./ai-generation-config-service.ts";
import { CUSTOMER_AI_MODEL } from "./ai-cost-control-service.ts";
import { isCheapModelUnavailableError, markCheapModelFailed } from "./ai-model-routing-service.ts";
import { generateBackendText, shouldUseDeepInfraTextProviderForPurpose, type DeepInfraChatMessage } from "./ai-text-provider-service.ts";
import {
  GEMINI_CLIENT_TEXT_CACHE_PATH_BLOCKED,
  GEMINI_CUSTOMER_REPLY_CONTEXT_BLOCKED,
  assertGeminiAllowedForPurpose,
  classifyGeminiPurpose,
  getDeepInfraTextBlockedReason,
  getGeminiTextBlockedReason,
  hasNonGeminiAudioUnderstandingProvider,
} from "./ai-provider-policy-service.ts";

function clean(value: any) { return String(value || "").trim(); }
function textBlock(parts: any[] = []) { return parts.map((part) => clean(part)).filter(Boolean).join("\n\n").trim(); }
function hashText(value: any) { return createHash("sha1").update(clean(value)).digest("hex").slice(0, 24); }
function estimateTokens(text: string) { return Math.max(0, Math.ceil(clean(text).length / 4)); }
function normalizeCacheMissReason(reason: any) { const value = clean(reason); if (!value) return ""; if (value === "stable_prefix_below_min_tokens" || value === "missing_stable_prefix") return "small_context"; if (value === "sdk_cache_api_unavailable") return "model_not_supported"; if (value === "disabled") return "disabled"; return value; }
function canProviderUseExplicitCache(provider: any) { return provider?.provider === "platform_gemini" || provider?.provider === "client_custom_gemini"; }

export type CacheAwareGenerateInput = {
  provider: any;
  model: string;
  purpose: string;
  purposeGroup?: string;
  stableContextParts?: any[];
  dynamicContextParts?: any[];
  contents?: any[];
  config?: any;
  tools?: any;
  toolConfig?: any;
  maxOutputTokens?: number;
  modelRoute?: string;
  fallbackModel?: string;
  skipBackendTextProvider?: boolean;
  request?: (request: any) => Promise<any>;
};

export function buildCacheAwareGeminiRequest(input: CacheAwareGenerateInput & { cachedContentName?: string }) {
  const stableContext = textBlock(input.stableContextParts || []);
  const dynamicContext = textBlock(input.dynamicContextParts || []);
  const dynamicContents = input.contents || (dynamicContext ? [{ role: "user", parts: [{ text: dynamicContext }] }] : []);
  const baseConfig = { ...withLowThinkingConfig(input.config || {}, input.purpose || input.purposeGroup), ...(typeof input.maxOutputTokens === "number" ? { maxOutputTokens: input.maxOutputTokens } : {}) };
  return { model: input.model, contents: dynamicContents, config: buildExplicitCacheRequestConfig({ systemInstruction: stableContext, tools: input.tools, toolConfig: input.toolConfig, cachedContentName: input.cachedContentName || "", baseConfig }) };
}

function normalizeDeepInfraRole(role: any): DeepInfraChatMessage["role"] { const value = clean(role).toLowerCase(); if (value === "system") return "system"; if (value === "assistant" || value === "model") return "assistant"; return "user"; }
function hasConfiguredTools(tools: any) { if (!tools) return false; const list = Array.isArray(tools) ? tools : [tools]; return list.some((entry) => Array.isArray(entry?.functionDeclarations) && entry.functionDeclarations.length > 0); }
function contentParts(contents: any[] = []) { return (contents || []).flatMap((content) => Array.isArray(content?.parts) ? content.parts : []); }
function hasAudioPart(contents: any[] = []) { return contentParts(contents).some((part) => /audio/i.test(String(part?.inlineData?.mimeType || ""))); }
function hasMediaPart(contents: any[] = []) { return contentParts(contents).some((part) => Boolean(part?.inlineData)); }
function isTextOnlyContents(contents: any[] = []) { if (!Array.isArray(contents)) return false; return contentParts(contents).every((part) => Boolean(clean(part?.text)) && !part.inlineData && !part.functionCall && !part.functionResponse); }
function latestUserText(contents: any[] = []) { for (let index = contents.length - 1; index >= 0; index -= 1) { const item = contents[index]; if (item?.role !== "user") continue; const text = (item.parts || []).map((part: any) => clean(part?.text)).filter(Boolean).join(" "); if (text) return text; } return ""; }

function looksLikeWhatsappToolRequired(text: string) {
  const value = clean(text).toLowerCase();
  if (!value) return false;
  return /\b(confirm\s*(order|booking|appointment)?|place\s*(order|booking)|book\s*(appointment|slot|visit)|send\s*(photo|image|pic|video|media|catalog|catalogue|file)|show\s*(photo|image|pic|video|media|catalog|catalogue)|voice\s*(note|reply|message)|audio\s*(reply|message)|remember\s*this|learn\s*this)\b/i.test(value) ||
    (/\b(buy|purchase|order now|checkout)\b/i.test(value) && /\b(address|phone|delivery|cod|quantity|confirm|place)\b/i.test(value));
}

function hasSchemaRequirement(config: any = {}) { return Boolean(config?.responseSchema || config?.schema || config?.response_format || String(config?.responseMimeType || "").toLowerCase().includes("json")); }
function buildTextProviderResponse(providerResult: any) { return { text: providerResult.text || "", candidates: [{ finishReason: providerResult.text ? "STOP" : "", content: { parts: providerResult.text ? [{ text: providerResult.text }] : [] } }], provider: providerResult.provider, model: providerResult.model, providerTelemetry: providerResult.telemetry, backendTextProvider: true, fallbackUsed: Boolean(providerResult.fallbackUsed), fallbackReason: providerResult.fallbackReason || "", usageMetadata: { promptTokenCount: Number(providerResult.promptTokens || 0), candidatesTokenCount: Number(providerResult.completionTokens || 0), totalTokenCount: Number(providerResult.promptTokens || 0) + Number(providerResult.completionTokens || 0), cachedContentTokenCount: Number(providerResult.cachedTokens || 0) } }; }
function isCustomerFacingTextPurpose(purpose: string) { return /customer_ai_reply|customer_support_reply|sales_reply|product_service_question|smart_sales_text|ai_smart_followup/i.test(purpose); }
function buildHotfixStableInstruction(purpose: string) { if (!isCustomerFacingTextPurpose(purpose)) return ""; return "Hotfix reply guidance: Use DeepInfra for the final customer-facing text only. Preserve BlackArrow's sales/support quality: answer directly, use CRM/order/lead/product/service/business instructions and chat history, match English/Urdu/Roman Urdu, avoid generic one-line replies, and ask one useful next question. Do not echo the customer message."; }
function backendMaxTokens(input: CacheAwareGenerateInput, purpose: string) { return Number(input.maxOutputTokens || input.config?.maxOutputTokens || (isCustomerFacingTextPurpose(purpose) ? 900 : 700)); }

function shouldAttemptBackendTextProvider(input: CacheAwareGenerateInput, request: any, stableContext: string, purpose: string) {
  if (input.skipBackendTextProvider) return { useDeepInfra: false, skipReason: "disabled" };
  if (!stableContext) return { useDeepInfra: false, skipReason: "unsupported_purpose" };
  const contents = request.contents || [];
  const media = hasMediaPart(contents);
  const audio = hasAudioPart(contents);
  const toolsConfigured = hasConfiguredTools(input.tools);
  const toolRequired = toolsConfigured && looksLikeWhatsappToolRequired(latestUserText(contents));
  const schemaRequired = hasSchemaRequirement(input.config);
  const purposeNeedsVoice = /voice|tts|transcription/i.test(purpose);
  const decision = shouldUseDeepInfraTextProviderForPurpose({ purpose, hasMedia: media && !audio, hasAudio: audio, requiresVoice: purposeNeedsVoice, requiresGeminiTools: toolRequired, requiresSchema: schemaRequired });
  if (!isTextOnlyContents(contents) && contents.length > 0) return { useDeepInfra: false, skipReason: audio ? "audio_required" : "media_required" };
  return decision;
}

function toDeepInfraMessages(contents: any[] = []): DeepInfraChatMessage[] { return contents.map((item: any): DeepInfraChatMessage => ({ role: normalizeDeepInfraRole(item?.role), content: (item.parts || []).map((part: any) => clean(part?.text)).filter(Boolean).join("\n") })).filter((item: DeepInfraChatMessage) => Boolean(clean(item.content))); }

function assertGeminiPathAllowed(input: CacheAwareGenerateInput, requestPreview: any, purpose: string) {
  const hasAudio = hasAudioPart(requestPreview.contents || []);
  const hasMedia = hasMediaPart(requestPreview.contents || []);
  const hasImage = hasMedia && !hasAudio;
  const policyInput = {
    purpose,
    modality: /tts/i.test(purpose) ? "tts" : hasAudio ? "audio_input" : hasImage ? "image" : "text",
    hasImage,
    hasAudio,
    hasMedia,
    isTts: /tts/i.test(purpose),
    isVoiceUnderstanding: /audio|voice|transcription/i.test(purpose),
    isImageRecognition: /image|vision|extract/i.test(purpose),
    deepInfraVisionAvailable: false,
    nonGeminiAudioAvailable: hasNonGeminiAudioUnderstandingProvider(),
  } as const;
  const classification = classifyGeminiPurpose(policyInput);
  if (classification === "tts_allowed") return;
  try {
    assertGeminiAllowedForPurpose(policyInput);
  } catch (error: any) {
    const reasonLabels = [String(error?.code || getGeminiTextBlockedReason())];
    if (policyInput.modality === "text" && input.provider?.billingContext?.customerJid) {
      reasonLabels.push(GEMINI_CUSTOMER_REPLY_CONTEXT_BLOCKED);
      reasonLabels.push(GEMINI_CLIENT_TEXT_CACHE_PATH_BLOCKED);
    }
    Array.from(new Set(reasonLabels)).forEach((code) => {
      console.warn(`[AITextProvider] ${code} purpose=${purpose} modality=${policyInput.modality}`);
    });
    const blocked: any = new Error(reasonLabels[0]);
    blocked.code = reasonLabels[0];
    blocked.reasonLabels = Array.from(new Set(reasonLabels));
    blocked.classification = classification;
    throw blocked;
  }
}

export async function generateWithClientGeminiCacheAware(input: CacheAwareGenerateInput): Promise<any> {
  const provider = input.provider || {};
  const stableContext = textBlock(input.stableContextParts || []);
  const purpose = clean(input.purpose || provider.purpose || "gemini_request");
  const purposeGroup = clean(input.purposeGroup || purpose);
  const requestPreview = buildCacheAwareGeminiRequest({ ...input, cachedContentName: "" });
  const backendDecision = shouldAttemptBackendTextProvider(input, requestPreview, stableContext, purpose);
  if (backendDecision.useDeepInfra) {
    const startedAt = Date.now();
    const providerResult = await generateBackendText({
      purpose,
      accountId: provider.accountId || provider.userId,
      botId: provider.botId || provider.dataOwnerKey,
      customerJid: provider.billingContext?.customerJid,
      stablePrompt: [stableContext, buildHotfixStableInstruction(purpose)].filter(Boolean).join("\n\n"),
      messages: toDeepInfraMessages(requestPreview.contents || []),
      maxTokens: backendMaxTokens(input, purpose),
      jsonMode: hasSchemaRequirement(input.config),
    });
    if (providerResult.requestStatus !== "success" || !clean(providerResult.text)) {
      console.warn(`[AITextProvider] ${getDeepInfraTextBlockedReason()} purpose=${purpose} requestStatus=${providerResult.requestStatus}`);
      const blocked: any = new Error(getDeepInfraTextBlockedReason());
      blocked.code = getDeepInfraTextBlockedReason();
      blocked.provider = "deepinfra";
      blocked.purpose = purpose;
      blocked.requestStatus = providerResult.requestStatus;
      throw blocked;
    }
    const telemetry = providerResult.telemetry || {};
    console.info(`[AITextProvider] provider=${telemetry.provider || providerResult.provider} model=${telemetry.model || providerResult.model} purpose=${telemetry.purpose || purpose} fallbackUsed=${Boolean(providerResult.fallbackUsed)} fallbackReason=${providerResult.fallbackReason || ""} skipReason=${backendDecision.skipReason || ""} promptTokens=${Number(providerResult.promptTokens || 0)} completionTokens=${Number(providerResult.completionTokens || 0)} cachedTokens=${Number(providerResult.cachedTokens || 0)} promptCacheKeyAttached=${Boolean(telemetry.promptCacheKeyAttached)} promptCacheKeyHash=${telemetry.promptCacheKeyHash || ""} stablePromptHash=${telemetry.stablePromptHash || ""} latencyMs=${Date.now() - startedAt} account=${telemetry.accountId || ""} bot=${telemetry.botId || ""} customer=${telemetry.customerJid || ""}`);
    return buildTextProviderResponse(providerResult);
  }
  if (!input.skipBackendTextProvider) console.info(`[AITextProvider] provider=gemini purpose=${purpose} skipReason=${backendDecision.skipReason || "unsupported_purpose"}`);
  if (backendDecision.skipReason === "provider_not_configured" && isTextOnlyContents(requestPreview.contents || [])) {
    console.warn(`[AITextProvider] ${getDeepInfraTextBlockedReason()} purpose=${purpose} requestStatus=missing_key`);
    const blocked: any = new Error(getDeepInfraTextBlockedReason());
    blocked.code = getDeepInfraTextBlockedReason();
    blocked.provider = "deepinfra";
    blocked.purpose = purpose;
    blocked.requestStatus = "missing_key";
    throw blocked;
  }
  assertGeminiPathAllowed(input, requestPreview, purpose);

  const clientCacheBoostBillingEnabled = Boolean(provider.provider === "client_custom_gemini" && provider.explicitCacheBoostEnabled);
  const explicitCacheAllowed = provider.provider === "platform_gemini" || clientCacheBoostBillingEnabled;
  const stableHash = hashText(`${purposeGroup}\n${stableContext}`);
  const tokenEstimate = estimateTokens(stableContext);
  const botId = clean(provider.botId || provider.dataOwnerKey || provider.accountId || provider.userId || "account");
  let cachedContentName = "";
  let cacheMissReason = explicitCacheAllowed ? "model_not_supported" : (provider.provider === "client_custom_gemini" ? "disabled" : (canProviderUseExplicitCache(provider) ? "disabled" : "provider_cache_unavailable"));
  let cacheEligible = false;
  let cacheAttempted = false;
  let cacheNameHash = "";
  if (explicitCacheAllowed) {
    const result = await getOrCreateGeminiExplicitCache({ aiClient: provider.ai, model: input.model, botId, stablePrefix: stableContext, stablePrefixHash: stableHash, stablePrefixTokenEstimate: tokenEstimate, systemInstruction: stableContext, tools: input.tools, toolConfig: input.toolConfig, cacheBoostEnabled: provider.provider === "client_custom_gemini" ? clientCacheBoostBillingEnabled : undefined });
    cachedContentName = result.cachedContentName || "";
    cacheEligible = Boolean(result.telemetry.explicitCacheEligible);
    cacheAttempted = Boolean(result.telemetry.explicitCacheRequestAttempted);
    cacheNameHash = result.cacheKey ? hashText(result.cacheKey) : "";
    cacheMissReason = cachedContentName ? "" : normalizeCacheMissReason(result.telemetry.fallbackReason);
  }
  const request = buildCacheAwareGeminiRequest({ ...input, cachedContentName });
  const providerForBilling = { ...provider, model: input.model, purpose, cacheTelemetryContext: { cacheBoostEnabled: clientCacheBoostBillingEnabled, cacheEligible, cacheAttempted, cacheAttached: Boolean(cachedContentName), cacheMissReason, cacheNameHash } };
  const requestOnce = (nextRequest: any) => (input.request ? input.request(nextRequest) : provider.ai.models.generateContent(nextRequest));
  return runGeminiRequestWithClientBilling(providerForBilling, async () => {
    try { return await requestOnce(request); }
    catch (error: any) { if (!request?.config?.thinkingConfig || !isUnsupportedThinkingConfigError(error)) throw error; console.warn(`[GeminiGeneration] thinking_config_fallback purpose=${purpose} reason=${clean(error?.code || error?.message).slice(0, 120)}`); return requestOnce({ ...request, config: stripThinkingConfig(request.config) }); }
  }).catch(async (error: any) => {
    const fallbackModel = clean(input.fallbackModel || CUSTOMER_AI_MODEL);
    if (!fallbackModel || fallbackModel === input.model || !/flash-lite/i.test(input.model) || !isCheapModelUnavailableError(error)) throw error;
    await markCheapModelFailed(error);
    console.warn(`[GeminiGeneration] model_route=cheap_failed_fallback purpose=${purpose} helper_model=${input.model} fallback_model=${fallbackModel} fallback_reason=${clean(error?.code || error?.message).slice(0, 120)}`);
    const fallbackRequest = buildCacheAwareGeminiRequest({ ...input, model: fallbackModel, cachedContentName: "" });
    return runGeminiRequestWithClientBilling({ ...providerForBilling, model: fallbackModel }, () => requestOnce(fallbackRequest));
  });
}
