import {
  buildDeepInfraPromptCacheKey,
  buildDeepInfraTelemetry,
  generateWithDeepInfraTextProvider,
  hasDeepInfraTextProviderKey,
  convertGeminiSchemaToOpenAi,
  convertGeminiToolsToDeepInfra,
  type DeepInfraChatMessage,
  type DeepInfraTextProviderInput,
  type DeepInfraTextProviderResult,
  type DeepInfraToolDefinition,
  type DeepInfraParsedToolCall,
} from "./deepinfra-text-provider-service.ts";
import {
  getDeepInfraTextBlockedReason,
  isDeepInfraRequiredForPurpose,
} from "./ai-provider-policy-service.ts";
import { recordAiProviderCallLedger } from "./ai-provider-call-ledger-service.ts";
import {
  previewAiProviderCallBilling,
  chargeAiProviderCallBilling,
} from "./ai-provider-call-billing-service.ts";
import { recordSuccessfulCustomerTurnAiCall } from "./customer-turn-ai-call-ledger-service.ts";

export type AiTextProviderInput = DeepInfraTextProviderInput & {
  fallbackGenerate?: () => Promise<{ text?: string; provider?: string; model?: string; raw?: any }>;
  maxDeepInfraAttempts?: number;
  billingAction?: string;
  customerTurnId?: string;
  providerCallId?: string;
};

export type AiTextProviderResult = {
  text: string;
  toolCalls?: DeepInfraParsedToolCall[];
  finishReason?: string;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  estimatedCost: number;
  promptCacheKeyAttached?: boolean;
  requestStatus: string;
  fallbackUsed: boolean;
  fallbackReason?: string;
  skipReason?: string;
  rawUsageSafe: Record<string, any>;
  latencyMs: number;
  telemetry: Record<string, any>;
};

export type BackendTextProviderRequestSafety = {
  purpose?: string;
  hasImage?: boolean;
  hasAudio?: boolean;
  hasMedia?: boolean;
  mediaContextAsText?: boolean;
  mediaContextType?: "image" | "audio" | "";
  wantsVoice?: boolean;
  requiresVoice?: boolean;
  hasToolCalls?: boolean;
  requiresGeminiTools?: boolean;
  requiresSchema?: boolean;
  strictSchema?: boolean;
  providerConfigured?: boolean;
  requireKnownPurpose?: boolean;
};

export type BackendTextProviderSkipReason =
  | "text_only_supported"
  | "text_only_supported_after_media_context"
  | "media_required"
  | "audio_required"
  | "gemini_tool_required"
  | "provider_not_configured"
  | "unsupported_purpose"
  | "deepinfra_required";

export type BackendTextProviderDecision = { useDeepInfra: boolean; purpose: string; skipReason: BackendTextProviderSkipReason };
export { hasDeepInfraTextProviderKey, convertGeminiSchemaToOpenAi, convertGeminiToolsToDeepInfra };
export type { DeepInfraChatMessage, DeepInfraToolDefinition, DeepInfraParsedToolCall };

const textProviderDeps = {
  previewAiProviderCallBilling,
  chargeAiProviderCallBilling,
  recordAiProviderCallLedger,
  recordSuccessfulCustomerTurnAiCall,
};

export function __setAiTextProviderTestDeps(overrides: Partial<typeof textProviderDeps>) {
  Object.assign(textProviderDeps, overrides || {});
}

export function __resetAiTextProviderTestDeps() {
  Object.assign(textProviderDeps, {
    previewAiProviderCallBilling,
    chargeAiProviderCallBilling,
    recordAiProviderCallLedger,
    recordSuccessfulCustomerTurnAiCall,
  });
}

function clean(value: any, max = 12000) { return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max); }
function cacheTelemetryFields(result?: Pick<DeepInfraTextProviderResult, "rawUsageSafe"> | null) {
  const raw = result?.rawUsageSafe || {};
  return {
    promptCacheKeyAttached: Boolean(raw.prompt_cache_key_attached),
    promptCacheKeyHash: clean(raw.prompt_cache_key_hash, 32),
    stablePromptHash: clean(raw.stable_prompt_hash, 32),
  };
}

function buildEmptyProviderResult(input: AiTextProviderInput, requestStatus: string, fallbackUsed = false, fallbackReason = ""): AiTextProviderResult {
  return {
    text: "",
    provider: "deepinfra",
    model: "",
    promptTokens: 0,
    completionTokens: 0,
    cachedTokens: 0,
    estimatedCost: 0,
    requestStatus,
    fallbackUsed,
    fallbackReason,
    rawUsageSafe: {},
    latencyMs: 0,
    telemetry: buildDeepInfraTelemetry({ purpose: input.purpose, requestStatus, fallbackUsed, fallbackReason, accountId: input.accountId, botId: input.botId, customerJid: input.customerJid }),
  };
}

export function shouldUseDeepInfraTextProviderForPurpose(input: BackendTextProviderRequestSafety = {}): BackendTextProviderDecision {
  const purpose = clean(input.purpose || "customer_ai_reply", 120) || "customer_ai_reply";
  if (input.mediaContextAsText && (input.hasAudio || input.hasImage || input.hasMedia)) {
    return { useDeepInfra: true, purpose, skipReason: "text_only_supported_after_media_context" };
  }
  if (input.hasAudio) return { useDeepInfra: false, purpose, skipReason: "audio_required" };
  if (input.hasImage || input.hasMedia) return { useDeepInfra: false, purpose, skipReason: "media_required" };
  if (input.requiresGeminiTools) return { useDeepInfra: false, purpose, skipReason: "gemini_tool_required" };
  if (!isDeepInfraRequiredForPurpose({ purpose, modality: "text" })) return { useDeepInfra: false, purpose, skipReason: "unsupported_purpose" };
  if (input.providerConfigured === false) return { useDeepInfra: false, purpose, skipReason: "provider_not_configured" };
  return { useDeepInfra: true, purpose, skipReason: "text_only_supported" };
}

export function canUseDeepInfraForBackendText(input: BackendTextProviderRequestSafety = {}) {
  const decision = shouldUseDeepInfraTextProviderForPurpose(input);
  return { allowed: decision.useDeepInfra, reason: decision.skipReason };
}

function needsFallback(result: DeepInfraTextProviderResult): boolean {
  if (result.requestStatus === "missing_key") return false;
  return result.requestStatus !== "success" || (!clean(result.text) && (!result.toolCalls || result.toolCalls.length === 0));
}

async function runDeepInfraAttempts(input: AiTextProviderInput): Promise<DeepInfraTextProviderResult> {
  const maxAttempts = Math.max(1, Math.min(3, Number(input.maxDeepInfraAttempts || 2)));
  let last: DeepInfraTextProviderResult = buildEmptyProviderResult(input, "not_attempted", false) as DeepInfraTextProviderResult;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    last = await generateWithDeepInfraTextProvider({
      ...input,
      promptCacheKey: input.promptCacheKey || buildDeepInfraPromptCacheKey({ accountId: input.accountId, botId: input.botId, purpose: input.purpose }),
    });

    await textProviderDeps.recordAiProviderCallLedger({
      provider: {
        provider: "deepinfra",
        accountId: input.accountId,
        botId: input.botId,
        purpose: input.purpose,
        model: last.model,
        billingContext: input.billingContext,
        retryAttempt: attempt + 1,
      },
      result: last,
    }).catch(() => ({ recorded: false, reason: "write_failed" }));

    if (!needsFallback(last)) return last;
    if (last.requestStatus === "missing_key") break;
  }
  return last;
}

export async function generateBackendText(input: AiTextProviderInput): Promise<AiTextProviderResult> {
  const decision = shouldUseDeepInfraTextProviderForPurpose({ purpose: input.purpose, providerConfigured: hasDeepInfraTextProviderKey() });
  if (!decision.useDeepInfra && decision.skipReason !== "provider_not_configured") return buildEmptyProviderResult(input, "skipped", false, decision.skipReason);

  if (input.accountId) {
    const preview: any = await textProviderDeps.previewAiProviderCallBilling({
      accountId: input.accountId,
      purpose: input.purpose,
      billingAction: input.billingAction,
    }).catch(() => ({ allowed: true, billable: false, cost: 0 }));
    if (!preview.allowed) {
      return buildEmptyProviderResult(input, "insufficient_wallet", false, preview?.reason || "insufficient_wallet");
    }
  }

  const deepInfra = await runDeepInfraAttempts(input);
  if (deepInfra && deepInfra.requestStatus === "success" && (clean(deepInfra.text) || (deepInfra.toolCalls && deepInfra.toolCalls.length > 0))) {
    const customerTurnId = input.customerTurnId || input.billingContext?.customerTurnId;
    if (customerTurnId) {
      const providerCallId = input.providerCallId || input.billingContext?.providerCallId || `call_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      textProviderDeps.recordSuccessfulCustomerTurnAiCall({
        customerTurnId,
        providerCallId,
        provider: "deepinfra",
        botId: input.botId,
        accountId: input.accountId,
        canonicalCustomerId: input.billingContext?.canonicalCustomerId,
        conversationId: input.billingContext?.conversationId,
        purpose: input.purpose,
        model: deepInfra.model,
      });
    }

    if (input.accountId) {
      await textProviderDeps.chargeAiProviderCallBilling({
        accountId: input.accountId,
        botId: input.botId,
        customerJid: input.customerJid,
        purpose: input.purpose,
        billingAction: input.billingAction,
        callId: input.billingContext?.callId || input.billingContext?.eventId || input.billingContext?.requestId,
        requestId: input.billingContext?.requestId,
      }).catch(() => {});
    }

    return {
      ...deepInfra,
      fallbackUsed: false,
      telemetry: buildDeepInfraTelemetry({
        purpose: input.purpose,
        model: deepInfra.model,
        promptTokens: deepInfra.promptTokens,
        completionTokens: deepInfra.completionTokens,
        cachedTokens: deepInfra.cachedTokens,
        estimatedCost: deepInfra.estimatedCost,
        requestStatus: deepInfra.requestStatus,
        fallbackUsed: false,
        latencyMs: deepInfra.latencyMs,
        accountId: input.accountId,
        botId: input.botId,
        customerJid: input.customerJid,
        ...cacheTelemetryFields(deepInfra),
      }),
    };
  }

  const fallbackReason = getDeepInfraTextBlockedReason();

  if (!deepInfra) return buildEmptyProviderResult(input, "failed", false, fallbackReason);
  return {
    ...deepInfra,
    fallbackUsed: false,
    fallbackReason,
    telemetry: buildDeepInfraTelemetry({
      purpose: input.purpose,
      model: deepInfra.model,
      promptTokens: deepInfra.promptTokens,
      completionTokens: deepInfra.completionTokens,
      cachedTokens: deepInfra.cachedTokens,
      estimatedCost: deepInfra.estimatedCost,
      requestStatus: deepInfra.requestStatus,
      fallbackUsed: false,
      fallbackReason,
      latencyMs: deepInfra.latencyMs,
      accountId: input.accountId,
      botId: input.botId,
      customerJid: input.customerJid,
      ...cacheTelemetryFields(deepInfra),
    }),
  };
}
