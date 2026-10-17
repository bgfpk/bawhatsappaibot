import * as dbService from "./db-service.ts";
import type { GeminiProviderContext } from "./gemini-provider-service.ts";
import { getGeminiCacheTelemetry } from "./gemini-cache-service.ts";
import { recordClientGeminiCacheTelemetry } from "./client-gemini-cache-telemetry-service.ts";
import { emitLiveConsoleEvent } from "./live-console-event-service.ts";
import { recordAiCallAudit } from "./ai-call-audit-service.ts";
import { recordAiProviderCallLedger, updateAiProviderCallSendOutcome } from "./ai-provider-call-ledger-service.ts";
import {
  GEMINI_CLIENT_TEXT_CACHE_PATH_BLOCKED,
  GEMINI_CUSTOMER_REPLY_CONTEXT_BLOCKED,
  GEMINI_TTS_ALLOWED_FINAL_TEXT_ONLY,
  assertGeminiAllowedForPurpose,
  classifyGeminiPurpose,
  getGeminiTextBlockedReason,
  hasNonGeminiAudioUnderstandingProvider,
} from "./ai-provider-policy-service.ts";

function clean(value: any) {
  return String(value || "").trim();
}

function safePart(value: any) {
  return clean(value).replace(/[^a-zA-Z0-9@._:-]+/g, "_").slice(0, 120);
}

function maskCustomerJid(value: any) {
  const jid = safePart(value);
  if (!jid) return "";
  const [local, domain] = jid.split("@");
  const maskedLocal = local.length <= 6 ? local : `${local.slice(0, 3)}...${local.slice(-2)}`;
  return domain ? `${maskedLocal}@${domain}` : maskedLocal;
}

export function getClientGeminiPurposeLabel(purpose: any) {
  const value = clean(purpose).toLowerCase();
  if (value.includes("explicit_cache")) return "explicit cache create/update";
  if (value.includes("compact_fallback")) return "AI fallback generation";
  if (value.includes("combined_reply_memory")) return "AI reply + memory generation";
  if (value.includes("reply_repair") || value.includes("repair")) return "reply repair";
  if (value.includes("missing_order_field")) return "missing-field prompt";
  if (value.includes("tool_followup")) return "tool follow-up generation";
  if (value.includes("customer_ai_reply") || value === "reply") return "AI reply generation";
  if (value.includes("order_lead_summary")) return "order/lead summary";
  if (value.includes("customer_summary") || value.includes("summary")) return "AI summary";
  if (value.includes("smart_followup")) return "AI Smart Follow-up generation";
  if (value.includes("smart_sales")) return "Smart Sales generation";
  if (value.includes("image") || value.includes("vision")) return "image understanding";
  if (value.includes("manual_learning")) return "manual learning";
  if (value.includes("manual_")) return "manual media understanding";
  if (value.includes("tts") || value.includes("voice")) return "voice reply generation";
  if (value.includes("test")) return "API key test";
  return value ? value.replace(/_/g, " ") : "AI request";
}

function getClientGeminiCycleDescription(purpose: any) {
  const value = clean(purpose).toLowerCase();
  if (value.includes("smart_followup") || value.includes("wait_check")) return "Custom Gemini: Follow-up";
  if (value.includes("customer_update")) return "Custom Gemini: Customer update";
  if (value.includes("summary")) return "Custom Gemini: Summary";
  if (value.includes("broadcast")) return "Custom Gemini: Broadcast";
  if (value.includes("test")) return "Custom Gemini AI cycle";
  if (value.includes("customer_ai_reply") || value.includes("reply") || value.includes("repair") || value.includes("missing_order_field") || value.includes("tool_followup") || value.includes("compact_fallback")) {
    return "Custom Gemini: AI reply";
  }
  return "Custom Gemini AI cycle";
}

export function buildClientGeminiBillingGroupKey(input: GeminiProviderContext) {
  return clean(
    input.billingContext?.billingGroupKey ||
    input.billingContext?.eventId ||
    input.billingContext?.messageId ||
    input.billingContext?.requestId
  );
}

export function buildClientGeminiCycleDescription(input: GeminiProviderContext & { accountId?: string; dedupeKey?: string }) {
  return getClientGeminiCycleDescription(input.purpose);
}

export function buildClientGeminiCacheBoostDescription(input: GeminiProviderContext & { accountId?: string; dedupeKey?: string }) {
  return "Gemini Cache Boost";
}

function isDeferredTtsCustomerBilling(provider: any, options?: { deferCustomerBillingUntilConfirmed?: boolean }) {
  return Boolean(options?.deferCustomerBillingUntilConfirmed) &&
    provider?.provider === "client_custom_gemini" &&
    /tts|voice/i.test(clean(provider?.purpose));
}

function buildDeferredTtsLogReason(reason: any, fallback: string) {
  return safePart(reason || fallback) || fallback;
}

function buildClientGeminiBillingLogContext(input: GeminiProviderContext & { accountId?: string; dedupeKey?: string; cacheBoostEnabled?: boolean; cacheUsed?: boolean; cacheCharged?: boolean; cachedTokens?: number; cacheMissReason?: string }) {
  const parts = [
    "provider=client_custom_gemini",
    `purpose=${safePart(input.purpose || "ai_request")}`,
  ];
  const botId = safePart(input.botId || input.dataOwnerKey);
  if (botId) parts.push(`bot=${botId}`);
  const customer = maskCustomerJid(input.billingContext?.customerJid);
  if (customer) parts.push(`customer=${customer}`);
  const billingGroupKey = safePart(buildClientGeminiBillingGroupKey(input));
  if (billingGroupKey) parts.push(`billingGroupKey=${billingGroupKey}`);
  if (input.dedupeKey) parts.push(`idempotency=${safePart(input.dedupeKey)}`);
  if (typeof input.cacheBoostEnabled === "boolean") parts.push(`cacheBoostEnabled=${input.cacheBoostEnabled}`);
  if (typeof input.cacheUsed === "boolean") parts.push(`cacheUsed=${input.cacheUsed}`);
  if (typeof input.cacheCharged === "boolean") parts.push(`cacheCharged=${input.cacheCharged}`);
  if (typeof input.cachedTokens === "number") parts.push(`cachedTokens=${input.cachedTokens}`);
  if (input.cacheMissReason) parts.push(`cacheMissReason=${safePart(input.cacheMissReason)}`);
  return parts.join(" ");
}

const clientGeminiBillingDeps = {
  buildUsageChargeDedupeKey: dbService.buildUsageChargeDedupeKey,
  chargeUsageAction: dbService.chargeUsageAction,
  canSendCustomerFacingMessage: dbService.canSendCustomerFacingMessage,
  logUsageChargeFailure: dbService.logUsageChargeFailure,
};

export function __setClientGeminiBillingTestDeps(overrides: Partial<typeof clientGeminiBillingDeps>) {
  Object.assign(clientGeminiBillingDeps, overrides || {});
}

export function __resetClientGeminiBillingTestDeps() {
  Object.assign(clientGeminiBillingDeps, {
    buildUsageChargeDedupeKey: dbService.buildUsageChargeDedupeKey,
    chargeUsageAction: dbService.chargeUsageAction,
    canSendCustomerFacingMessage: dbService.canSendCustomerFacingMessage,
    logUsageChargeFailure: dbService.logUsageChargeFailure,
  });
}

function isPrimaryCustomerReplyPurpose(value: any) {
  const purpose = clean(value).toLowerCase();
  return purpose === "customer_ai_reply" || purpose === "combined_reply_memory";
}

function buildGeminiPolicyInput(provider: any) {
  const purpose = clean(provider?.purpose || "gemini_request");
  const lower = purpose.toLowerCase();
  const modality = /tts/i.test(lower)
    ? "tts"
    : /audio|voice|transcription/i.test(lower)
      ? "audio_input"
      : /image|vision|extract/i.test(lower)
        ? "image"
        : "text";
  return {
    purpose,
    modality,
    isTts: modality === "tts",
    hasAudio: modality === "audio_input",
    hasImage: modality === "image",
    hasMedia: modality === "image" || modality === "audio_input",
    isVoiceUnderstanding: modality === "audio_input",
    isImageRecognition: modality === "image",
    deepInfraVisionAvailable: false,
    nonGeminiAudioAvailable: hasNonGeminiAudioUnderstandingProvider(),
  } as const;
}

function assertGeminiProviderRequestAllowed(provider: any, options: { viaClientTextPath?: boolean } = {}) {
  const policyInput = buildGeminiPolicyInput(provider);
  const classification = classifyGeminiPurpose(policyInput);
  if (classification === "tts_allowed") {
    console.info(`[GeminiProviderPolicy] ${GEMINI_TTS_ALLOWED_FINAL_TEXT_ONLY} purpose=${policyInput.purpose}`);
    return;
  }

  const reasonLabels: string[] = [];
  try {
    assertGeminiAllowedForPurpose(policyInput);
  } catch (error: any) {
    reasonLabels.push(String(error?.code || getGeminiTextBlockedReason()));
  }
  if (policyInput.modality === "text" && provider?.billingContext?.customerJid) {
    reasonLabels.push(GEMINI_CUSTOMER_REPLY_CONTEXT_BLOCKED);
  }
  if (policyInput.modality === "text" && options.viaClientTextPath) {
    reasonLabels.push(GEMINI_CLIENT_TEXT_CACHE_PATH_BLOCKED);
  }

  const uniqueLabels = Array.from(new Set(reasonLabels.filter(Boolean)));
  uniqueLabels.forEach((code) => {
    console.warn(`[GeminiProviderPolicy] ${code} purpose=${policyInput.purpose}`);
  });

  const error: any = new Error(uniqueLabels[0] || String(classification));
  error.code = uniqueLabels[0] || String(classification);
  error.reasonLabels = uniqueLabels;
  error.classification = classification;
  error.purpose = policyInput.purpose;
  throw error;
}

async function assertHelperGeminiEligible(provider: any) {
  const userId = clean(provider?.accountId || provider?.userId);
  if (!userId || isPrimaryCustomerReplyPurpose(provider?.purpose)) return;
  const access = await clientGeminiBillingDeps.canSendCustomerFacingMessage(userId).catch((error: any) => ({
    allowed: false,
    reason: error?.message || "eligibility_check_failed",
  }));
  if (access.allowed) return;
  const reason = clean(access.reason) || "account_access_expired";
  console.info(`[AiCallBudget] helper_cost_path=${safePart(provider?.purpose || "gemini_helper")} skipped_not_eligible reason=${safePart(reason)}`);
  const error: any = new Error(reason);
  error.code = reason;
  error.helperGeminiSkipped = true;
  throw error;
}

export async function chargeClientGeminiMessageCycle(input: GeminiProviderContext & {
  accountId?: string;
  provider?: string;
}) {
  if (input.provider !== "client_custom_gemini") return { charged: false, skipped: true, reason: "not_client_provider" };
  const userId = clean(input.accountId || input.userId);
  if (!userId) return { charged: false, reason: "missing_user" };
  const billingGroupKey = buildClientGeminiBillingGroupKey(input) || `ungrouped:${safePart(input.purpose || "ai_cycle")}:${Date.now()}`;
  const dedupeKey = clientGeminiBillingDeps.buildUsageChargeDedupeKey("client_gemini_message_cycle", [
    userId,
    input.botId || input.dataOwnerKey,
    input.billingContext?.customerJid,
    billingGroupKey,
  ]);
  const result = await clientGeminiBillingDeps.chargeUsageAction(userId, "client_gemini_message_cycle", {
    amount: 1,
    dedupeKey,
    description: buildClientGeminiCycleDescription({ ...input, dedupeKey }),
  });
  if (!result?.charged && !result?.duplicate) {
    clientGeminiBillingDeps.logUsageChargeFailure({
      action: "client_gemini_message_cycle",
      userId,
      botId: input.botId || input.dataOwnerKey,
      customerJid: input.billingContext?.customerJid,
      eventId: input.billingContext?.eventId,
      messageId: input.billingContext?.messageId,
      reason: result?.reason || "not_charged",
    });
    emitLiveConsoleEvent({
      type: "wallet_not_charged",
      level: "warn",
      scope: "bot",
      accountId: userId,
      botId: input.botId || input.dataOwnerKey,
      customerJid: input.billingContext?.customerJid,
      title: "Custom Gemini not charged",
      message: "Custom Gemini AI cycle did not create a wallet charge.",
      reason: result?.reason || "not_charged",
      metadata: { purpose: input.purpose || "" },
    });
  } else if (result?.charged || result?.duplicate) {
    console.info(`[ClientGeminiBilling] cycle_${result?.charged ? "charged" : "duplicate"} ${buildClientGeminiBillingLogContext({ ...input, dedupeKey })}`);
    emitLiveConsoleEvent({
      type: "custom_gemini_cycle_charged",
      level: "success",
      scope: "bot",
      accountId: userId,
      botId: input.botId || input.dataOwnerKey,
      customerJid: input.billingContext?.customerJid,
      title: "Custom Gemini charged",
      message: result?.charged ? "Custom Gemini AI cycle charged." : "Custom Gemini cycle already charged; no new wallet debit.",
      status: result?.charged ? "charged" : "duplicate",
      metadata: { purpose: input.purpose || "", cost: result?.cost || 0 },
    });
  }
  return { ...result, dedupeKey, billingGroupKey };
}

export async function chargeClientGeminiApiRequest(input: GeminiProviderContext & {
  accountId?: string;
  provider?: string;
}) {
  return chargeClientGeminiMessageCycle(input);
}

export async function chargeClientGeminiExplicitCacheBoost(input: GeminiProviderContext & {
  accountId?: string;
  provider?: string;
  explicitCacheBoostEnabled?: boolean;
  cachedTokens?: number;
  usageMetadata?: any;
  cacheAttempted?: boolean;
  cacheAttached?: boolean;
  cacheMissReason?: string;
}) {
  if (input.provider !== "client_custom_gemini") return { charged: false, skipped: true, reason: "not_client_provider" };
  if (!input.explicitCacheBoostEnabled) return { charged: false, skipped: true, reason: "cache_boost_disabled" };
  const cachedTokens = Math.max(0, Number(input.cachedTokens ?? input.usageMetadata?.cachedContentTokenCount ?? input.usageMetadata?.cached_content_token_count ?? 0));
  const cacheAttached = input.cacheAttached === undefined ? true : Boolean(input.cacheAttached);
  if (!cacheAttached) return { charged: false, skipped: true, reason: input.cacheMissReason || "cache_not_attached", cachedTokens };
  if (cachedTokens <= 0) {
    const reason = input.cacheMissReason || "cache_miss_zero_cached_tokens";
    console.info(`[ClientGeminiBilling] cache_boost_not_charged ${buildClientGeminiBillingLogContext({
      ...input,
      cacheBoostEnabled: true,
      cacheUsed: Boolean(input.cacheAttached),
      cacheCharged: false,
      cachedTokens,
      cacheMissReason: reason,
    })}`);
    emitLiveConsoleEvent({
      type: "wallet_not_charged",
      level: "info",
      scope: "bot",
      accountId: clean(input.accountId || input.userId),
      botId: input.botId || input.dataOwnerKey,
      customerJid: input.billingContext?.customerJid,
      title: "Cache Boost not charged",
      message: "Gemini Cache Boost was not charged because Google reported zero cached tokens.",
      reason,
      metadata: { purpose: input.purpose || "", cachedTokens },
    });
    return { charged: false, skipped: true, reason, cachedTokens };
  }
  const userId = clean(input.accountId || input.userId);
  if (!userId) return { charged: false, reason: "missing_user" };
  const billingGroupKey = buildClientGeminiBillingGroupKey(input) || `ungrouped:${safePart(input.purpose || "cache_boost")}:${Date.now()}`;
  const dedupeKey = clientGeminiBillingDeps.buildUsageChargeDedupeKey("client_gemini_explicit_cache_boost", [
    userId,
    input.botId || input.dataOwnerKey,
    input.billingContext?.customerJid,
    billingGroupKey,
  ]);
  const result = await clientGeminiBillingDeps.chargeUsageAction(userId, "client_gemini_explicit_cache_boost", {
    amount: 1,
    dedupeKey,
    description: buildClientGeminiCacheBoostDescription({ ...input, dedupeKey }),
  });
  if (!result?.charged && !result?.duplicate) {
    clientGeminiBillingDeps.logUsageChargeFailure({
      action: "client_gemini_explicit_cache_boost",
      userId,
      botId: input.botId || input.dataOwnerKey,
      customerJid: input.billingContext?.customerJid,
      eventId: input.billingContext?.eventId,
      messageId: input.billingContext?.messageId,
      reason: result?.reason || "not_charged",
    });
    emitLiveConsoleEvent({
      type: "wallet_not_charged",
      level: "warn",
      scope: "bot",
      accountId: userId,
      botId: input.botId || input.dataOwnerKey,
      customerJid: input.billingContext?.customerJid,
      title: "Cache Boost not charged",
      message: "Gemini Cache Boost did not create a wallet charge.",
      reason: result?.reason || "not_charged",
      metadata: { purpose: input.purpose || "" },
    });
  } else if (result?.charged || result?.duplicate) {
    console.info(`[ClientGeminiBilling] cache_boost_${result?.charged ? "charged" : "duplicate"} ${buildClientGeminiBillingLogContext({
      ...input,
      dedupeKey,
      cacheBoostEnabled: true,
      cacheUsed: true,
      cacheCharged: Boolean(result?.charged),
      cachedTokens,
    })}`);
    emitLiveConsoleEvent({
      type: "gemini_cache_boost_charged",
      level: "success",
      scope: "bot",
      accountId: userId,
      botId: input.botId || input.dataOwnerKey,
      customerJid: input.billingContext?.customerJid,
      title: "Gemini Cache Boost charged",
      message: result?.charged ? "Gemini Cache Boost charged." : "Cache Boost already charged for this cycle; no new wallet debit.",
      status: result?.charged ? "charged" : "duplicate",
      metadata: { purpose: input.purpose || "", cost: result?.cost || 0 },
    });
  }
  return { ...result, dedupeKey, billingGroupKey, cachedTokens };
}

function hasUsageMetadata(result: any) {
  return Boolean(result?.usageMetadata || result?.usage_metadata);
}

function buildCacheTelemetryContext(provider: any) {
  const context = provider?.cacheTelemetryContext || {};
  return {
    cacheBoostEnabled: Boolean(context.cacheBoostEnabled),
    cacheEligible: Boolean(context.cacheEligible),
    cacheAttempted: Boolean(context.cacheAttempted),
    cacheAttached: Boolean(context.cacheAttached),
    cacheMissReason: clean(context.cacheMissReason),
    cacheNameHash: clean(context.cacheNameHash),
  };
}

function normalizeCacheTelemetryReason(reason: any) {
  const value = clean(reason);
  if (value === "stable_prefix_below_min_tokens" || value === "missing_stable_prefix" || value === "cache_skipped_small_context") return "small_context";
  if (value === "sdk_cache_api_unavailable" || value === "cache_skipped_unsupported_path") return "model_not_supported";
  if (value === "disabled") return "disabled";
  if (value === "provider_not_client_gemini" || value === "not_client_provider") return "provider_not_client_gemini";
  if (value === "usage_metadata_missing") return "usage_metadata_missing";
  if (value === "cache_miss_zero_cached_tokens") return "no_cached_tokens_reported";
  return value;
}

async function recordSuccessfulClientGeminiTelemetry(provider: any, result: any, cacheBoostResult?: any) {
  const userId = clean(provider.accountId || provider.userId);
  if (!userId) return;
  const cacheContext = buildCacheTelemetryContext(provider);
  if (!hasUsageMetadata(result) && !cacheContext.cacheAttempted && !cacheContext.cacheAttached && !cacheContext.cacheBoostEnabled && !cacheContext.cacheEligible && !cacheContext.cacheMissReason) return;
  const telemetry = getGeminiCacheTelemetry(result);
  const cacheMissReason = !hasUsageMetadata(result)
    ? "usage_metadata_missing"
    : telemetry.cachedTokens > 0
    ? ""
    : normalizeCacheTelemetryReason(cacheContext.cacheMissReason || (cacheContext.cacheAttached ? "no_cached_tokens_reported" : cacheContext.cacheAttempted ? "unavailable" : ""));
  await recordClientGeminiCacheTelemetry({
    userId,
    provider: provider.provider || "platform_gemini",
    model: provider.model,
    cachedTokens: telemetry.cachedTokens,
    uncachedInputTokens: telemetry.uncachedInputTokens,
    inputTokens: telemetry.inputTokens,
    outputTokens: telemetry.outputTokens,
    thoughtTokens: telemetry.thoughtTokens,
    totalTokens: telemetry.totalTokens,
    cacheAttempted: cacheContext.cacheAttempted,
    cacheEligible: cacheContext.cacheEligible,
    cacheBoostEnabled: cacheContext.cacheBoostEnabled,
    cacheAttached: cacheContext.cacheAttached,
    cacheHit: telemetry.cachedTokens > 0,
    cacheMissReason,
    cacheNameHash: cacheContext.cacheNameHash,
    cacheBoostCharged: Boolean(cacheBoostResult?.charged || cacheBoostResult?.duplicate),
    purpose: provider.purpose,
    path: provider.purpose,
    botId: provider.botId || provider.dataOwnerKey,
  }).catch(() => {});
}

export async function runGeminiRequestWithClientBilling<T>(
  provider: any,
  request: () => Promise<T>,
  options?: { deferCustomerBillingUntilConfirmed?: boolean },
) {
  assertGeminiProviderRequestAllowed(provider, { viaClientTextPath: false });
  await assertHelperGeminiEligible(provider);
  let result: T;
  try {
    result = await request();
  } catch (error: any) {
    await recordAiProviderCallLedger({
      provider,
      finalSendOutcome: "no_send",
      chargeOutcome: "no_charge",
      reasonLabels: [error?.code || error?.message || "provider_error"],
    }).catch(() => {});
    throw error;
  }
  let cacheBoostResult: any = null;
  let cycleResult: any = null;
  const deferredTtsBilling = isDeferredTtsCustomerBilling(provider, options);
  if (provider?.provider === "client_custom_gemini" && !deferredTtsBilling) {
    cycleResult = await chargeClientGeminiMessageCycle({
      provider: provider.provider,
      userId: provider.userId,
      accountId: provider.accountId,
      botId: provider.botId,
      purpose: provider.purpose,
      billingContext: provider.billingContext,
    }).catch((error: any) => {
      console.warn(`[ClientGeminiBilling] charge_failed reason=${String(error?.message || error || "unknown").slice(0, 120)}`);
    });
    const cacheContext = buildCacheTelemetryContext(provider);
    if (provider.explicitCacheBoostEnabled && (cacheContext.cacheAttempted || cacheContext.cacheAttached)) {
      const telemetry = getGeminiCacheTelemetry(result);
      cacheBoostResult = await chargeClientGeminiExplicitCacheBoost({
        provider: provider.provider,
        userId: provider.userId,
        accountId: provider.accountId,
        botId: provider.botId,
        purpose: "customer_ai_explicit_cache",
        billingContext: provider.billingContext,
        explicitCacheBoostEnabled: Boolean(provider.explicitCacheBoostEnabled),
        cachedTokens: hasUsageMetadata(result) ? telemetry.cachedTokens : 0,
        cacheAttempted: cacheContext.cacheAttempted,
        cacheAttached: cacheContext.cacheAttached,
        cacheMissReason: hasUsageMetadata(result) ? cacheContext.cacheMissReason : "usage_metadata_missing",
      }).catch((error: any) => {
        console.warn(`[ClientGeminiBilling] cache_boost_charge_failed reason=${String(error?.message || error || "unknown").slice(0, 120)}`);
        return { charged: false, reason: "charge_exception" };
      });
    }
  }
  await recordSuccessfulClientGeminiTelemetry(provider, result, cacheBoostResult);
  recordAiCallAudit({
    provider,
    result,
    charged: Boolean(cycleResult?.charged || cycleResult?.duplicate),
    cacheBoostCharged: Boolean(cacheBoostResult?.charged || cacheBoostResult?.duplicate),
  });
  await recordAiProviderCallLedger({
    provider,
    result,
    finalSendOutcome: deferredTtsBilling ? "pending" : undefined,
    chargeOutcome: deferredTtsBilling
      ? "no_charge"
      : (cycleResult?.charged || cycleResult?.duplicate ? "charged" : "unknown"),
    reasonLabels: deferredTtsBilling ? ["tts_billing_deferred"] : undefined,
  }).catch(() => {});
  if (deferredTtsBilling) {
    console.info(`[ClientGeminiBilling] tts_billing_deferred reason=waiting_for_whatsapp_voice_delivery ${buildClientGeminiBillingLogContext({
      ...provider,
      cacheBoostEnabled: Boolean(provider?.explicitCacheBoostEnabled),
    })}`);
  }
  return result;
}

export async function finalizeDeferredGeminiTtsCustomerBilling(input: {
  provider: any;
  result: any;
  finalSendOutcome: "sent" | "failed" | "skipped" | "blocked";
  reason?: string;
  receiptId?: string;
  messageId?: string;
}) {
  const provider = input.provider || {};
  const reason = buildDeferredTtsLogReason(input.reason, input.finalSendOutcome === "sent" ? "voice_delivery_success" : "voice_delivery_failed");
  const idempotencyKey = buildClientGeminiBillingGroupKey(provider) || clean(provider?.billingContext?.eventId || provider?.billingContext?.messageId || provider?.billingContext?.requestId);

  if (input.finalSendOutcome !== "sent") {
    await updateAiProviderCallSendOutcome({
      accountId: provider.accountId || provider.userId,
      userId: provider.userId || provider.accountId,
      botId: provider.botId || provider.dataOwnerKey,
      customerJid: provider.billingContext?.customerJid,
      idempotencyKey,
      eventId: provider.billingContext?.eventId,
      receiptId: input.receiptId,
      messageId: input.messageId,
      finalSendOutcome: input.finalSendOutcome,
      chargeOutcome: "no_charge",
      reasonLabel: reason,
    }).catch(() => {});
    console.info(`[ClientGeminiBilling] tts_billing_skipped reason=${reason} ${buildClientGeminiBillingLogContext(provider)}`);
    return { charged: false, skipped: true, reason };
  }

  let cycleResult: any = null;
  let cacheBoostResult: any = null;
  if (provider?.provider === "client_custom_gemini") {
    cycleResult = await chargeClientGeminiMessageCycle({
      provider: provider.provider,
      userId: provider.userId,
      accountId: provider.accountId,
      botId: provider.botId,
      purpose: provider.purpose,
      billingContext: provider.billingContext,
    }).catch((error: any) => ({ charged: false, reason: error?.message || "charge_exception" }));

    const cacheContext = buildCacheTelemetryContext(provider);
    if (provider.explicitCacheBoostEnabled && (cacheContext.cacheAttempted || cacheContext.cacheAttached)) {
      const telemetry = getGeminiCacheTelemetry(input.result);
      cacheBoostResult = await chargeClientGeminiExplicitCacheBoost({
        provider: provider.provider,
        userId: provider.userId,
        accountId: provider.accountId,
        botId: provider.botId,
        purpose: "customer_ai_explicit_cache",
        billingContext: provider.billingContext,
        explicitCacheBoostEnabled: Boolean(provider.explicitCacheBoostEnabled),
        cachedTokens: hasUsageMetadata(input.result) ? telemetry.cachedTokens : 0,
        cacheAttempted: cacheContext.cacheAttempted,
        cacheAttached: cacheContext.cacheAttached,
        cacheMissReason: hasUsageMetadata(input.result) ? cacheContext.cacheMissReason : "usage_metadata_missing",
      }).catch((error: any) => ({ charged: false, reason: error?.message || "charge_exception" }));
    }
  }

  const chargeOutcome = cycleResult?.charged || cycleResult?.duplicate || cacheBoostResult?.charged || cacheBoostResult?.duplicate
    ? "charged"
    : "unknown";
  await updateAiProviderCallSendOutcome({
    accountId: provider.accountId || provider.userId,
    userId: provider.userId || provider.accountId,
    botId: provider.botId || provider.dataOwnerKey,
    customerJid: provider.billingContext?.customerJid,
    idempotencyKey,
    eventId: provider.billingContext?.eventId,
    receiptId: input.receiptId,
    messageId: input.messageId,
    finalSendOutcome: "sent",
    chargeOutcome,
    reasonLabel: reason,
  }).catch(() => {});
  console.info(`[ClientGeminiBilling] tts_billing_charged reason=voice_delivery_success ${buildClientGeminiBillingLogContext(provider)}`);
  return {
    charged: Boolean(cycleResult?.charged || cycleResult?.duplicate || cacheBoostResult?.charged || cacheBoostResult?.duplicate),
    cycleResult,
    cacheBoostResult,
    reason,
  };
}
