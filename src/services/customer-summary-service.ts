import * as dbService from "./db-service.ts";
import { SUMMARY_COOLDOWN_SECONDS, SUMMARY_MIN_NEW_MESSAGES, compactAiText } from "./ai-cost-control-service.ts";
import { buildFreshCustomerChatSummary, getLatestCustomerOrderState } from "./customer-summary-state-service.ts";
import { cleanCustomerBusinessSummary } from "./customer-summary-cleaner-service.ts";
import { buildCustomerChatSummaryWithAiFallback } from "./ai-customer-summary-service.ts";
import { extractCustomerOrderState } from "./customer-state-extractor-service.ts";
import { choosePersistedCustomerSummary } from "./customer-summary-persistence-policy-service.ts";
import { runCustomerSummaryQualityGate, shouldAdvanceSummaryRefreshMarker } from "./customer-summary-quality-gate-service.ts";
import { emitLiveConsoleEvent } from "./live-console-event-service.ts";
import { classifyCustomerSummaryRefreshNeed } from "./customer-summary-refresh-policy-service.ts";
import { isVoiceNoteMeaningText, isVoiceTranscriptUnavailableText } from "./voice-note-history-service.ts";

const MAX_SUMMARY_LENGTH = 3500;

type SummaryInput = {
  dataOwnerKey: string;
  customerJid: string;
  userId?: string;
  billingGroupKey?: string;
  io?: any;
};

type QueueState = {
  input: SummaryInput;
  rerun: boolean;
  promise: Promise<void>;
};

const queues = new Map<string, QueueState>();

const summaryDeps = {
  getCustomerProfile: dbService.getCustomerProfile,
  getChatHistory: dbService.getChatHistory,
  updateCustomerProfile: dbService.updateCustomerProfile,
  canSendCustomerFacingMessage: dbService.canSendCustomerFacingMessage,
  buildCustomerChatSummaryWithAiFallback,
  emitLiveConsoleEvent,
  now: () => Math.floor(Date.now() / 1000),
};

export function __setCustomerSummaryTestDeps(overrides: Partial<typeof summaryDeps>) {
  Object.assign(summaryDeps, overrides || {});
}

export function __resetCustomerSummaryTestDeps() {
  Object.assign(summaryDeps, {
    getCustomerProfile: dbService.getCustomerProfile,
    getChatHistory: dbService.getChatHistory,
    updateCustomerProfile: dbService.updateCustomerProfile,
    canSendCustomerFacingMessage: dbService.canSendCustomerFacingMessage,
    buildCustomerChatSummaryWithAiFallback,
    emitLiveConsoleEvent,
    now: () => Math.floor(Date.now() / 1000),
  });
}

function cleanText(value: any, limit = 4000) {
  return compactAiText(value, limit);
}

function normalizeTimestamp(value: any) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : 0;
}

function isMeaningfulCustomerMessage(message: any) {
  const role = String(message?.role || "").toLowerCase();
  const text = cleanText(message?.text || "", 500);
  if (role !== "user" || !text) return false;
  if (isVoiceTranscriptUnavailableText(text)) return false;
  if (isVoiceNoteMeaningText(text)) return true;
  if (/^(ok|okay|yes|no|ji|jee|haan|han|hmm|thanks|thank you)[.!?]*$/i.test(text)) return false;
  return /[\p{L}\p{N}]{3,}/u.test(text);
}

function isTrivialSummarySkipReason(reason: string) {
  return [
    "short_confirmation",
    "emoji_only",
    "too_short",
    "duplicate_message",
    "repeated_known_detail",
    "repeated_delivery_request",
    "short_repeated_delivery_or_contact",
    "no_new_customer_text",
  ].includes(reason);
}

function joinedRecentCustomerText(history: any[] = []) {
  return history
    .filter((message) => String(message?.role || "").toLowerCase() === "user")
    .slice(-10)
    .map((message) => cleanText(message?.text || "", 500))
    .join("\n")
    .toLowerCase();
}

export function hasStaleCustomerSummaryConflict(existingSummary: any, history: any[] = []) {
  const existing = cleanText(existingSummary, MAX_SUMMARY_LENGTH).toLowerCase();
  const recent = joinedRecentCustomerText(history);
  if (!existing || !recent) return false;
  const currentSchool = /\b(school|students?|parents?|attendance|homework|leave|leaves|admission|class|grade)\b/i.test(recent);
  const currentCustomPlan = /\bcustom\s+plan\b|\bmonthly messages?\b|\bwhatsapp instances?\b/i.test(recent);
  const staleRestaurant = /\b(restaurant|menu|food|dining|table booking)\b/i.test(existing);
  const staleEcommerce = /\b(ecommerce|product order|delivery address|courier|cod|restaurant)\b/i.test(existing);
  return Boolean((currentSchool && (staleRestaurant || staleEcommerce)) || (currentCustomPlan && staleRestaurant));
}

function getQueueKey(input: SummaryInput) {
  return `${input.dataOwnerKey}::${input.customerJid}`;
}

async function refreshCustomerChatSummaryOnce(input: SummaryInput) {
  if (!input.dataOwnerKey || !input.customerJid) return;

  const [profile, history] = await Promise.all([
    summaryDeps.getCustomerProfile(input.dataOwnerKey, input.customerJid).catch(() => null),
    summaryDeps.getChatHistory(input.dataOwnerKey, input.customerJid, 36).catch(() => []),
  ]);

  if (!history.length && !profile?.latestOrderRef) {
    console.warn("[CustomerSummary] skipped reason=no_history_or_order");
    emitLiveConsoleEvent({
      type: "summary_skipped",
      level: "warn",
      scope: "bot",
      accountId: input.userId,
      botId: input.dataOwnerKey,
      customerJid: input.customerJid,
      title: "Summary skipped",
      message: "No chat history or saved order was available.",
      reason: "no_history_or_order",
    });
    return;
  }

  const latestMessageAt = (history as any[]).reduce<number>((latest, message) => {
    return Math.max(latest, normalizeTimestamp(message.timestamp));
  }, 0);
  const latestCustomerMessageAt = (history as any[]).reduce<number>((latest, message) => {
    return String(message?.role || "").toLowerCase() === "user"
      ? Math.max(latest, normalizeTimestamp(message.timestamp))
      : latest;
  }, 0);
  const latestSummaryRelevantMessageAt = latestCustomerMessageAt || latestMessageAt;
  const lastSummarizedAt = normalizeTimestamp(profile?.chatSummaryLastMessageAt);
  const latestOrderRef = String(profile?.latestOrderRef || "").trim();
  const lastSummaryOrderRef = String(profile?.chatSummaryOrderRef || "").trim();
  const orderStateChanged = Boolean(latestOrderRef && latestOrderRef !== lastSummaryOrderRef);
  if (!orderStateChanged && latestSummaryRelevantMessageAt && lastSummarizedAt >= latestSummaryRelevantMessageAt) {
    console.warn("[CustomerSummary] skipped reason=already_current");
    console.info("[AiCallBudget] ai_call_budget_skipped_summary reason=already_current");
    emitLiveConsoleEvent({
      type: "summary_skipped",
      level: "info",
      scope: "bot",
      accountId: input.userId,
      botId: input.dataOwnerKey,
      customerJid: input.customerJid,
      title: "Summary skipped",
      message: "Customer summary is already current.",
      reason: "already_current",
    });
    return;
  }

  const nowSeconds = summaryDeps.now();
  const summaryUpdatedAt = normalizeTimestamp(profile?.chatSummaryUpdatedAt) || lastSummarizedAt;
  const newMessages = (history as any[]).filter(message => (
    String(message?.role || "").toLowerCase() === "user" &&
    normalizeTimestamp(message.timestamp) > lastSummarizedAt
  ));
  const hasMeaningfulRecentCustomerMessage = newMessages.some(isMeaningfulCustomerMessage);
  const hasExistingSummary = Boolean(cleanText(profile?.chatSummary, MAX_SUMMARY_LENGTH));
  const cooldownActive = summaryUpdatedAt && nowSeconds - summaryUpdatedAt < SUMMARY_COOLDOWN_SECONDS;
  if (!orderStateChanged) {
    if (!hasExistingSummary && history.length < 1) {
      console.warn("[CustomerSummary] skipped reason=no_meaningful_history");
      console.info("[AiCallBudget] ai_call_budget_skipped_summary reason=no_meaningful_history");
      console.info("[AiCallBudget] helper_cost_path=summary skipped_not_meaningful");
      emitLiveConsoleEvent({
        type: "summary_skipped",
        level: "warn",
        scope: "bot",
        accountId: input.userId,
        botId: input.dataOwnerKey,
        customerJid: input.customerJid,
        title: "Summary skipped",
        message: "Not enough meaningful customer history yet.",
        reason: "no_meaningful_history",
      });
      return;
    }
    if (hasExistingSummary && newMessages.length < SUMMARY_MIN_NEW_MESSAGES && cooldownActive && !hasMeaningfulRecentCustomerMessage) {
      console.warn("[CustomerSummary] skipped reason=cooldown");
      console.info("[AiCallBudget] helper_cost_path=summary skipped_recently_summarized");
      emitLiveConsoleEvent({
        type: "summary_skipped",
        level: "info",
        scope: "bot",
        accountId: input.userId,
        botId: input.dataOwnerKey,
        customerJid: input.customerJid,
        title: "Summary skipped",
        message: "Summary refresh cooldown is still active.",
        reason: "cooldown",
      });
      return;
    }
    if (hasExistingSummary && newMessages.length < SUMMARY_MIN_NEW_MESSAGES && !hasMeaningfulRecentCustomerMessage) {
      console.warn("[CustomerSummary] skipped reason=no_meaningful_change");
      console.info("[AiCallBudget] ai_call_budget_skipped_summary reason=no_meaningful_change");
      console.info("[AiCallBudget] helper_cost_path=summary skipped_not_meaningful");
      emitLiveConsoleEvent({
        type: "summary_skipped",
        level: "info",
        scope: "bot",
        accountId: input.userId,
        botId: input.dataOwnerKey,
        customerJid: input.customerJid,
        title: "Summary skipped",
        message: "No meaningful customer detail changed since the last summary.",
        reason: "no_meaningful_change",
      });
      return;
    }
  }

  const rawExistingSummary = cleanText(profile?.chatSummary, MAX_SUMMARY_LENGTH);
  const existingSummary = cleanCustomerBusinessSummary(rawExistingSummary, MAX_SUMMARY_LENGTH);
  const refreshNeed = classifyCustomerSummaryRefreshNeed({
    newMessages,
    profile,
    existingSummary,
    history,
  });
  if (!orderStateChanged && refreshNeed.reason === "voice_transcript_missing") {
    console.warn("[CustomerSummary] skipped reason=voice_transcript_missing");
    console.info("[CustomerSummary] summary_voice_transcript_missing");
    emitLiveConsoleEvent({
      type: "summary_skipped",
      level: "info",
      scope: "bot",
      accountId: input.userId,
      botId: input.dataOwnerKey,
      customerJid: input.customerJid,
      title: "Summary skipped",
      message: "Voice note transcript was unavailable, so summary memory was not advanced.",
      reason: "voice_transcript_missing",
    });
    return;
  }
  if (!orderStateChanged && !refreshNeed.needsAiSummary && isTrivialSummarySkipReason(refreshNeed.reason)) {
    console.warn(`[CustomerSummary] skipped reason=${refreshNeed.reason}`);
    console.info(`[CustomerSummary] summary_skipped_trivial reason=${refreshNeed.reason}`);
    console.info(`[AiCallBudget] ai_call_budget_skipped_summary reason=${refreshNeed.reason}`);
    console.info(`[AiCallBudget] helper_cost_path=summary skipped_not_meaningful reason=${refreshNeed.reason}`);
    emitLiveConsoleEvent({
      type: "summary_skipped",
      level: "info",
      scope: "bot",
      accountId: input.userId,
      botId: input.dataOwnerKey,
      customerJid: input.customerJid,
      title: "Summary skipped",
      message: "Tiny or repeated customer message did not change customer memory.",
      reason: refreshNeed.reason,
    });
    return;
  }
  if (!orderStateChanged && hasExistingSummary && !refreshNeed.needsAiSummary) {
    console.warn(`[CustomerSummary] skipped reason=${refreshNeed.reason}`);
    if (refreshNeed.reason === "voice_transcript_missing") {
      console.info("[CustomerSummary] summary_voice_transcript_missing");
    } else if (isTrivialSummarySkipReason(refreshNeed.reason)) {
      console.info(`[CustomerSummary] summary_skipped_trivial reason=${refreshNeed.reason}`);
    }
    console.info(`[AiCallBudget] ai_call_budget_skipped_summary reason=${refreshNeed.reason}`);
    console.info(`[AiCallBudget] helper_cost_path=summary skipped_not_meaningful reason=${refreshNeed.reason}`);
    if (latestSummaryRelevantMessageAt) {
      await summaryDeps.updateCustomerProfile(input.dataOwnerKey, input.customerJid, {
        chatSummaryLastMessageAt: latestSummaryRelevantMessageAt,
        ...(latestOrderRef ? { chatSummaryOrderRef: latestOrderRef } : {}),
      }).catch(() => {});
    }
    emitLiveConsoleEvent({
      type: "summary_skipped",
      level: "info",
      scope: "bot",
      accountId: input.userId,
      botId: input.dataOwnerKey,
      customerJid: input.customerJid,
      title: "Summary skipped",
      message: "No meaningful new customer detail changed since the last summary.",
      reason: refreshNeed.reason,
    });
    return;
  }
  if (input.userId) {
    const eligibility = await summaryDeps.canSendCustomerFacingMessage(input.userId).catch((error: any) => ({
      allowed: false,
      reason: error?.message || "eligibility_check_failed",
    }));
    if (!eligibility.allowed) {
      console.info(`[AiCallBudget] helper_cost_path=summary skipped_not_eligible reason=${eligibility.reason || "not_allowed"}`);
      emitLiveConsoleEvent({
        type: "summary_skipped",
        level: "warn",
        scope: "bot",
        accountId: input.userId,
        botId: input.dataOwnerKey,
        customerJid: input.customerJid,
        title: "Summary skipped",
        message: "Customer summary AI refresh was skipped because account access or billing is not eligible.",
        reason: "skipped_not_eligible",
        metadata: { helperCostPath: "summary", eligibilityReason: eligibility.reason || "not_allowed" },
      });
      return;
    }
  }
  console.info("[AiCallBudget] helper_cost_path=summary routed_to_flash_lite");
  emitLiveConsoleEvent({
    type: "summary_queued",
    level: "info",
    scope: "bot",
    accountId: input.userId,
    botId: input.dataOwnerKey,
    customerJid: input.customerJid,
    title: "Summary queued",
    message: "Customer chat summary refresh queued.",
  });
  const latestOrder = await getLatestCustomerOrderState(input.dataOwnerKey, input.customerJid, profile);
  const state = extractCustomerOrderState({ profile, history, latestOrder });
  const softwareSummary = cleanText(await buildFreshCustomerChatSummary({
    dataOwnerKey: input.dataOwnerKey,
    customerJid: input.customerJid,
    profile,
    history,
  }), MAX_SUMMARY_LENGTH);
  const aiSummary = await summaryDeps.buildCustomerChatSummaryWithAiFallback({
    existingSummary: rawExistingSummary,
    profile,
    history,
    latestOrder,
    state,
    customFields: [],
    softwareSummary,
    providerContext: {
      userId: input.userId,
      accountId: input.userId,
      dataOwnerKey: input.dataOwnerKey,
      botId: input.dataOwnerKey,
      purpose: "ai_customer_summary",
      billingContext: {
        customerJid: input.customerJid,
        billingGroupKey: input.billingGroupKey || "",
        eventId: input.billingGroupKey || `summary:${input.customerJid}:${latestSummaryRelevantMessageAt || latestOrderRef || summaryDeps.now()}`,
      },
    },
  }, { logger: console });
  let persistence = choosePersistedCustomerSummary({
    existingSummary,
    existingSource: profile?.chatSummarySource,
    candidateSummary: cleanText(aiSummary.summary, MAX_SUMMARY_LENGTH),
    candidateSource: aiSummary.source,
    fallbackReason: aiSummary.reason,
  });
  const staleSummaryConflict = hasStaleCustomerSummaryConflict(existingSummary, history as any[]);
  if (staleSummaryConflict && softwareSummary) {
    const fallbackQuality = runCustomerSummaryQualityGate(softwareSummary);
    if (fallbackQuality.accepted) {
      console.info("[CustomerSummary] summary_replaced_stale_conflict");
      persistence = {
        summary: fallbackQuality.summary,
        source: "software_fallback",
        preservedExisting: false,
        fallbackReason: "summary_replaced_stale_conflict",
      };
    }
  }
  let quality = runCustomerSummaryQualityGate(cleanText(persistence.summary, MAX_SUMMARY_LENGTH));

  if (!quality.accepted) {
    const rejectedReasons = quality.reasons;
    console.warn(`[CustomerSummary] quality_gate_rejected reason=${quality.reasons.join(",") || "unknown"}`);
    if (quality.reasons.some((reason) => reason.startsWith("duplicate_field:"))) {
      console.info("[CustomerSummary] summary_rejected_duplicate_noise");
    }
    console.info(`[CustomerSummary] summary_rejected_weak reason=${quality.reasons.join(",") || "unknown"}`);
    emitLiveConsoleEvent({
      type: "summary_rejected",
      level: "warn",
      scope: "bot",
      accountId: input.userId,
      botId: input.dataOwnerKey,
      customerJid: input.customerJid,
      title: "Summary rejected",
      message: "Generated customer summary did not pass quality checks.",
      reason: quality.reasons.join(",") || "unknown",
    });
    const fallbackQuality = runCustomerSummaryQualityGate(softwareSummary);
    const existingQuality = runCustomerSummaryQualityGate(existingSummary);
    if (fallbackQuality.accepted && (staleSummaryConflict || !existingQuality.accepted)) {
      console.info(staleSummaryConflict ? "[CustomerSummary] summary_replaced_stale_conflict" : "[CustomerSummary] summary_fallback_recent_timeline_used");
      quality = fallbackQuality;
      persistence = {
        summary: fallbackQuality.summary,
        source: "software_fallback",
        preservedExisting: false,
        fallbackReason: staleSummaryConflict ? "summary_replaced_stale_conflict" : "summary_fallback_recent_timeline_used",
      };
    } else if (existingQuality.accepted && !staleSummaryConflict) {
      console.info("[CustomerSummary] summary_kept_existing reason=weak_candidate");
      quality = existingQuality;
      persistence = {
        summary: existingQuality.summary,
        source: profile?.chatSummarySource || "software_fallback",
        preservedExisting: true,
        fallbackReason: `quality_gate_rejected:${rejectedReasons.join(",") || "unknown"}`,
      };
    } else if (fallbackQuality.accepted) {
      console.info("[CustomerSummary] summary_fallback_recent_timeline_used");
      quality = fallbackQuality;
      persistence = {
        summary: fallbackQuality.summary,
        source: "software_fallback",
        preservedExisting: false,
        fallbackReason: "summary_fallback_recent_timeline_used",
      };
    } else {
      console.warn("[CustomerSummary] quality_gate_kept_empty reason=no_acceptable_existing_summary");
      emitLiveConsoleEvent({
        type: "summary_skipped",
        level: "warn",
        scope: "bot",
        accountId: input.userId,
        botId: input.dataOwnerKey,
        customerJid: input.customerJid,
        title: "Summary skipped",
        message: "No acceptable summary was available after quality checks.",
        reason: "no_acceptable_existing_summary",
      });
      return;
    }
  }

  const nextSummary = quality.summary;
  const changed = Boolean(nextSummary && nextSummary !== existingSummary);
  const currentSource = String(profile?.chatSummarySource || "").trim();
  const shouldUpdateSource = changed || (persistence.source && currentSource !== persistence.source);
  const currentFallbackReason = String(profile?.chatSummaryFallbackReason || "").trim();
  const shouldUpdateFallbackMeta = currentFallbackReason !== String(persistence.fallbackReason || "").trim();
  const processedPatch = {
    ...(latestSummaryRelevantMessageAt ? { chatSummaryLastMessageAt: latestSummaryRelevantMessageAt } : {}),
    ...(latestOrderRef ? { chatSummaryOrderRef: latestOrderRef } : {}),
  };
  const keepExistingWeakFallback = persistence.preservedExisting && !changed;
  const shouldTouchSummaryUpdatedAt = !keepExistingWeakFallback && (nextSummary || shouldUpdateSource || shouldUpdateFallbackMeta);
  const shouldAdvanceLastMessageMarker = shouldAdvanceSummaryRefreshMarker({
    gateAccepted: quality.accepted,
    preservedExisting: keepExistingWeakFallback,
  });
  const metadataPatch = shouldAdvanceLastMessageMarker
    ? processedPatch
    : {
        ...(latestOrderRef ? { chatSummaryOrderRef: latestOrderRef } : {}),
      };

  if (changed || shouldUpdateSource || shouldUpdateFallbackMeta) {
    await summaryDeps.updateCustomerProfile(input.dataOwnerKey, input.customerJid, {
      ...metadataPatch,
      ...(nextSummary ? { chatSummary: nextSummary } : {}),
      ...(shouldTouchSummaryUpdatedAt ? { chatSummaryUpdatedAt: summaryDeps.now() } : {}),
      ...(shouldUpdateSource ? { chatSummarySource: persistence.source } : {}),
      ...(persistence.fallbackReason
        ? {
            chatSummaryFallbackReason: persistence.fallbackReason,
            chatSummaryFallbackAt: summaryDeps.now(),
          }
        : {
            chatSummaryFallbackReason: "",
            chatSummaryFallbackAt: 0,
          }),
    });
    input.io?.emit?.("system-log", {
      type: "info",
      msg: persistence.preservedExisting
        ? "Kept existing customer AI summary because fallback was weaker."
        : "Updated customer chat summary.",
    });
    console.info(persistence.preservedExisting ? "[CustomerSummary] summary_kept_existing" : "[CustomerSummary] summary_updated");
    emitLiveConsoleEvent({
      type: "summary_updated",
      level: "success",
      scope: "bot",
      accountId: input.userId,
      botId: input.dataOwnerKey,
      customerJid: input.customerJid,
      title: persistence.preservedExisting ? "Summary kept" : "Summary updated",
      message: persistence.preservedExisting
        ? "Kept existing customer AI summary because fallback was weaker."
        : "Updated customer chat summary.",
      status: persistence.source,
      reason: persistence.fallbackReason,
    });
    return;
  }

  if (latestSummaryRelevantMessageAt && shouldAdvanceLastMessageMarker) {
    await summaryDeps.updateCustomerProfile(input.dataOwnerKey, input.customerJid, processedPatch);
  }
}

async function drainSummaryQueue(key: string) {
  const state = queues.get(key);
  if (!state) return;

  do {
    state.rerun = false;
    try {
      await refreshCustomerChatSummaryOnce(state.input);
    } catch (e: any) {
      console.error("[CustomerSummary] Failed:", e?.message || e);
      emitLiveConsoleEvent({
        type: "summary_failed",
        level: "error",
        scope: "bot",
        accountId: state.input.userId,
        botId: state.input.dataOwnerKey,
        customerJid: state.input.customerJid,
        title: "Summary failed",
        message: e?.message || "Customer summary refresh failed.",
      });
    }
  } while (state.rerun);

  if (queues.get(key) === state) {
    queues.delete(key);
  }
}

export function queueCustomerChatSummaryRefresh(input: SummaryInput) {
  const key = getQueueKey(input);
  const existing = queues.get(key);
  if (existing) {
    existing.input = input;
    existing.rerun = true;
    return existing.promise;
  }

  const state: QueueState = {
    input,
    rerun: false,
    promise: Promise.resolve(),
  };
  queues.set(key, state);
  state.promise = drainSummaryQueue(key);
  return state.promise;
}
