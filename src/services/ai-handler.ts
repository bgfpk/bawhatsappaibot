import { Type } from "@google/genai";
import * as dbService from './db-service.ts';
import { releaseOrderStock, reserveOrderStock } from './inventory-service.ts';
import { buildBackInStockTarget } from './stock-reminder-target-service.ts';
import { saveLearnedRule } from './learning-service.ts';
import { composeImplicitCacheInstruction, logGeminiCacheTelemetry } from './gemini-cache-service.ts';
import { withTimeout } from './async-timeout.ts';
import { buildAccountDataOwnerKey } from '../utils/account-data-owner.ts';
import { generateTtsContentWithRetry, getSafeTtsFailureReason } from './gemini-tts-service.ts';
import { buildConfirmedOrderReference, emitOrderSaved, notifyAdminOfConfirmedOrder } from './order-alert-service.ts';
import { buildSequenceAlreadySentMessage, buildStockUnavailableMessage, detectCustomerLanguage } from './customer-message-service.ts';
import { CONCISE_WHATSAPP_REPLY_RULES, buildCompleteReplyRepairPrompt, containsInternalReasoning, isCustomerVisibleToolMetaText, isIncompleteOrderSummaryReply, isProbablyIncompleteCustomerReply, sanitizeCustomerFacingReply } from './reply-style-service.ts';
import { waitRandomSequenceDelay } from './sequence-delay-service.ts';
import { buildSequenceHistoryFromDb } from './sequence-history-service.ts';
import { findMatchingSequence, getSequenceDisplayName, getSequenceFlag, getSequenceSentFlagKeys, getSequenceShortcut, getSequenceStableId, normalizeSequenceText, resolveSequenceForAiChoice } from './sequence-trigger-service.ts';
import { downloadWhatsAppMediaBuffer } from './whatsapp-media-download.ts';
import { CUSTOMER_AI_MODEL, CUSTOMER_AI_TIMEOUT_MS, CUSTOMER_DB_HISTORY_LIMIT, CUSTOMER_HISTORY_LIMIT, CUSTOMER_REPLY_MAX_OUTPUT_TOKENS, CUSTOMER_TIMEOUT_FALLBACK_MODEL, CUSTOMER_TIMEOUT_FALLBACK_MS, TOOL_FOLLOWUP_MAX_OUTPUT_TOKENS, compactAiText } from './ai-cost-control-service.ts';
import { shouldSendWelcomeSequenceNow } from './welcome-sequence-guard.ts';
import { deliverWelcomeSequence, resolveRuntimeWelcomePayload } from './welcome-sequence-delivery-service.ts';
import { deliverSequenceGroup, resolveRuntimeSequencePayload as resolveRuntimeSequencePayloadGroup } from './sequence-delivery-service.ts';
import { describeTemplateForHistory } from './sequence-delivery-log-service.ts';
import { findSequenceForAiChoice } from './sequence-ai-decision-service.ts';
import {
    buildAiFallbackClearedPatch,
} from './ai-fallback-guard-service.ts';
import { createAiReplyRetryableError, createAiReplySupersededError, isAiReplyRetryableError, isAiReplySupersededError } from './ai-reply-retry-error-service.ts';
import { ORDER_ADDRESS_VALIDATION_PROTOCOL, getMissingOrderFields } from './order-required-fields-service.ts';
import { validateDeliveryAddress } from './address-validation-service.ts';
import { extractCustomerAnswerFromQuotedMessage, extractQuotedReplyContext, normalizeGeminiHistoryRole } from './chat-history-sanitizer.ts';
import { buildCustomerOrderSummaryMessage } from './order-summary-message-service.ts';
import { buildAiGeneratedOrderLeadSummary } from './ai-order-lead-summary-service.ts';
import { notifyAdminForEscalation } from './admin-escalation-service.ts';
import { buildOrderDetail, buildTransactionNotes } from './postex-booking-payload-service.ts';
import { isTransientAiProviderError } from './transient-ai-error-service.ts';
import { cleanOrderFieldValue, isConfiguredFieldInstructionEcho, sanitizeOrderCustomFields } from './order-field-value-service.ts';
import {
    buildCustomerAiPausePatch,
    CUSTOMER_AI_PAUSE_CATEGORY_MANUAL_REVIEW,
    getCustomerAutoReplyStopState,
    shouldAdminHandleDifficultCustomer,
} from './difficult-customer-mode-service.ts';
import { buildVoiceReplyPlan, detectVoiceReplySignals, isVoiceOutputOnlyRequest } from './voice-reply-policy-service.ts';
import { type BillableUsageAction } from '../config/pricing.ts';
import { getSequenceStatusBlockReason } from './sequence-delivery-guard-service.ts';
import {
    canSendBillableAutomation,
} from './automation-send-billing-service.ts';
import { maybeSaveBackInStockReminder } from './customer-update-intent-service.ts';
import { buildDeliveryNameProfilePatch, getSavedDeliveryName, sanitizeOrderDeliveryName } from './delivery-name-service.ts';
import { deletePendingBackInStockRequestsForCustomerProduct } from './stock-reminder-request-service.ts';
import { publishSharedPhoneIdentity } from './shared-phone-directory-service.ts';
import { getFlashModelSequence } from './gemini-flash-fallback-service.ts';
import { runModelFallbackSequence } from './ai-provider-retry-policy-service.ts';
import { resolveCustomerReplyLanguage } from './customer-language-preference-service.ts';
import { extractCustomerOrderState, mergeStructuredOrderState } from './customer-state-extractor-service.ts';
import { handleIrrelevantCustomer } from './irrelevant-customer-service.ts';
import { getVoiceGender, resolveCustomerPersonaVoicePreference } from './customer-persona-preference-service.ts';
import { buildCustomerBotPromptAssembly } from './customer-bot-prompt-service.ts';
import { buildPriceObjectionReply } from './price-objection-service.ts';
import { buildFreshCustomerChatSummary } from './customer-summary-state-service.ts';
import { buildCustomerResponseStrategyInstruction, planCustomerResponse } from './customer-response-planner-service.ts';
import { previewUsageBillingAction } from './outbound-message-billing-service.ts';
import { createOutboundReceiptAttempt, updateOutboundReceipt } from './outbound-send-receipt-service.ts';
import { buildOutboundChargeDescription, sendUniversalOutboundText, type UniversalTextSendResult } from './universal-outbound-send-service.ts';
import { assertCompleteCustomerFacingText, containsBadCustomerFacingListFormatting, validateCompleteCustomerFacingText } from './customer-facing-message-guard-service.ts';
import { normalizeWhatsAppCustomerReply, validateWhatsAppCustomerReply } from './whatsapp-customer-reply-contract-service.ts';
import { globalSendDeduplicator } from './whatsapp-reply-recovery-service.ts';
import {
    appendSmartSalesDecisionLog,
    buildSmartSalesPromptLayer,
    findUnsupportedSmartSalesClaim,
} from './smart-sales-engine-service.ts';
import { sendUniversalAutomationRelay } from './universal-automation-relay-service.ts';
import { resolveBotAiChatReplyMode } from './bot-ai-chat-reply-mode-service.ts';
import {
    normalizeSequenceItemResult,
    summarizeSequenceItemResults,
} from './sequence-delivery-result-service.ts';
import { extractCustomerImageContext } from './customer-image-context-service.ts';
import { mergeCustomerMemorySummary } from './customer-memory-merge-service.ts';
import { cleanCustomerBusinessSummary } from './customer-summary-cleaner-service.ts';
import { runCustomerSummaryQualityGate } from './customer-summary-quality-gate-service.ts';
import {
    buildCombinedReplyMemoryInstruction,
    parseCombinedReplyMemoryJson,
    renderCombinedCustomerMemoryUpdate,
    shouldUseCombinedReplyMemoryForSimpleText,
} from './combined-reply-memory-service.ts';
import { buildPostConfirmationReply } from './post-confirmation-faq-service.ts';
import { MAX_INSTRUCTION_CHARS, MAX_LEARNED_CHARS, preserveClientTrainingText, restoreOriginalClientTrainingText } from './instruction-compaction-service.ts';
import {
    buildCustomerReplyPreferencePatch,
    detectCustomerReplyPreference,
    resolveEffectiveReplyBehavior,
} from './customer-reply-preference-service.ts';
import { ACCOUNT_USAGE_GUARDRAILS } from '../config/pricing.ts';
import { buildCustomerReplyUsageActions } from "./customer-ai-usage-charge-service.ts";
import { pickPreferredCustomerName } from "./customer-identity-service.ts";
import { buildStickerMessageContext } from "./sticker-message-context-service.ts";
import { getMissingLeadFields, normalizeBusinessFlow, withRecordMetadata } from "./record-flow-service.ts";
import { buildDraftProfilePatch, buildIncompleteDraftRecord } from "./customer-record-draft-service.ts";
import { assertCustomerFacingSendAllowed } from "./customer-facing-send-guard-service.ts";
import { createGeminiClient, getClientGeminiStatus } from "./gemini-provider-service.ts";
import { finalizeDeferredGeminiTtsCustomerBilling, runGeminiRequestWithClientBilling } from "./client-gemini-billing-service.ts";
import { buildVoiceNoteHistoryText, isUsableVoiceTranscript } from "./voice-note-history-service.ts";
import { buildMissingRequiredFieldQuestion } from "./missing-field-question-service.ts";
import { buildRecordSummaryConfirmedPatch, buildRecordSummarySentPatch, getRecordSummaryDecision } from "./record-summary-flow-service.ts";
import { buildSmartBrainCustomerIntelligencePatch, generateSmartBrainPlan, getSmartBrainGuidanceDecision, summarizeSmartBrainPlanForLog } from "./universal-smart-conversation-brain-service.ts";
import { decideTrivialAiRoute } from "./customer-ai-router-service.ts";
import { buildWebsiteKnowledgeAiContext, WEBSITE_KNOWLEDGE_AI_MAX_CHARS, WEBSITE_KNOWLEDGE_AI_MAX_ITEMS } from "./website-knowledge-service.ts";
import { listCrmLeads, upsertCrmLead } from "./crm-foundation-service.ts";
import {
    checkAndContinueCustomerLeadRouting,
    triggerAutomaticCustomerLeadRouting,
} from "./department-lead-routing-service.ts";
import { filterMissingFieldsAgainstKnownValues, getFieldCollectionLockReason, sanitizeConfiguredCustomerFields, shouldAllowFieldCollectionRestart } from "./customer-field-guard-service.ts";
import { normalizeGeminiAudioMimeType } from "./gemini-audio-preprocess-service.ts";
import { resolveLatestCustomerReplyRoutingState } from "./customer-reply-routing-state-service.ts";
import {
    buildGuardRepairInstruction,
    buildCrmFirstPromptContext,
    buildStructuredLeadProfilePatch,
    canUseOriginalServiceBusinessReplyAfterGuardFailure,
    extractKnownCustomerFacts,
    findMatchingCrmLead,
    guardCustomerReply,
    hasInventedPricing,
    stripDuplicateKnownPhoneQuestionFromReply,
} from "./customer-reply-quality-guard-service.ts";
import { detectLatestListRequest, evaluateLatestQuestionSafety } from "./business-training-scope-guard-service.ts";
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from 'ffmpeg-static';
import { Readable, PassThrough } from 'stream';
import { generateBackendText, shouldUseDeepInfraTextProviderForPurpose, hasDeepInfraTextProviderKey, convertGeminiToolsToDeepInfra, type DeepInfraChatMessage } from "./ai-text-provider-service.ts";
import { getTurnExtraAiCallsCount, getSuccessfulCustomerTurnAiCallsCount } from "./customer-turn-ai-call-ledger-service.ts";
import { getDeepInfraTextBlockedReason } from "./ai-provider-policy-service.ts";
import { buildMediaReplyContextAttachment, type MediaUnderstandingResult, understandLatestCustomerAudio, understandLatestCustomerImage } from "./customer-media-understanding-service.ts";
import { createWhatsAppOutboundSender } from "./whatsapp-outbound-sender.ts";
import { deliverVoiceReplyAudio } from "./voice-reply-delivery-service.ts";
import { decideImageOrderExtractor } from "./image-order-extractor-gate-service.ts";
import { buildBatchReplyGuidance, buildCustomerBatchContext, type CustomerBatchContextEntry } from "./customer-message-batch-context-service.ts";
import {
    classifyInboundMessageKind,
    collectPendingInboundMessageBatch,
    type PendingBatchSelectionOptions,
} from "./customer-message-batch-service.ts";
import { maybeRunCustomerIntelligenceScan } from "./customer-intelligence-scan-service.ts";
import {
    detectBotIntroducedTermContext,
    findRecentBotIntroducedTerm,
    suppressBotIntroducedTermText,
} from "./bot-hallucination-guard-service.ts";
import { getReadableMessageContent } from "./whatsapp-message-content.ts";
import {
    findBestSavedMediaContextForReference,
    buildMediaConfigFingerprint,
    buildMediaHash,
    buildMediaPayloadFingerprint,
    getSavedMediaContext,
    hasSameFailedMediaContext,
    hasUsefulSavedMediaContext,
    messageReferencesRememberedMedia,
    saveMediaContext,
    type DurableMediaContextType,
} from "./message-media-context-service.ts";
import {
    isSafeModeDisableTtsOutputEnabled,
    isSafeModeDurableMediaContextCacheEnabled,
    isSafeModeEnabled,
    isSafeModeMediaFailureTextFallbackEnabled,
} from "./safe-mode-config-service.ts";

function getAiTextHistory(aiMessages: any[]) {
    return (aiMessages || []).map((message: any) => ({
        role: message?.role,
        text: Array.isArray(message?.parts) ? message.parts.map((part: any) => part?.text || "").filter(Boolean).join("\n").trim() : "",
        timestamp: 0,
    })).filter((message: any) => message.role && message.text);
}

function getRecentBotReplyText(historyArray: any[] = []) {
    for (let index = historyArray.length - 1; index >= 0; index -= 1) {
        const message = historyArray[index];
        if (message?.key?.fromMe !== true) continue;
        const readable = getReadableMessageContent(message.message);
        const text = sanitizeCustomerFacingReply(readable.text || "");
        if (text) return text;
    }
    return "";
}

function emitReplyTimingLog(io: any, message: string) {
    io?.emit("system-log", { type: "info", msg: message });
}

function sanitizeBackgroundTaskReason(value: any, max = 160) {
    return String(value ?? "unknown").replace(/\s+/g, "_").slice(0, max) || "unknown";
}

function runPostReplyBackgroundTask(io: any, name: string, task: () => Promise<void>) {
    emitReplyTimingLog(io, `post_reply_background_task_started name=${name}`);
    Promise.resolve()
        .then(task)
        .catch((error: any) => {
            emitReplyTimingLog(io, `post_reply_background_task_failed name=${name} reason=${sanitizeBackgroundTaskReason(error?.message || error)}`);
        });
}

function buildVerifiedReplyContextText(input: {
    promptText?: string;
    crmFirstContext?: string;
    websiteKnowledgeText?: string;
    latestImageReplyContextText?: string;
    latestAudioReplyContextText?: string;
    rememberedMediaReplyContextText?: string;
    activeRecord?: any;
    customerFacts?: any;
}) {
    return [
        String(input.promptText || "").slice(0, 2500),
        String(input.crmFirstContext || "").slice(0, 1200),
        String(input.websiteKnowledgeText || "").slice(0, 1200),
        String(input.latestImageReplyContextText || "").slice(0, 900),
        String(input.latestAudioReplyContextText || "").slice(0, 900),
        String(input.rememberedMediaReplyContextText || "").slice(0, 900),
        JSON.stringify(input.activeRecord || {}).slice(0, 800),
        JSON.stringify(input.customerFacts || {}).slice(0, 800),
    ].filter(Boolean).join("\n\n");
}

function normalizeMediaPriorityText(value: any) {
    return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function isGenericLatestMediaCheckText(value: any) {
    const text = normalizeMediaPriorityText(value);
    if (!text) return false;
    return /^(check this out|see this|ye dekho|is ko check karein|isko check karein|what is this|what do you think|this product|please check this product)$/.test(text)
        || /^(check|see|review|inspect)\s+(this|it)$/i.test(String(value || "").trim())
        || /\b(check this out|see this|ye dekho|what is this|what do you think|please check this product)\b/.test(text);
}

function latestMessageExplicitlyReferencesPriorContext(value: any) {
    const text = normalizeMediaPriorityText(value);
    if (!text) return false;
    return /\b(same as previous|as discussed|continue that|continue this|related to|compare with previous image|previous image|previous plan|school parent messaging|old context|earlier chat)\b/.test(text);
}

function buildRememberedMediaPriorityPromptText(input: {
    mediaContextText?: string;
    latestText?: string;
}) {
    const mediaContextText = String(input.mediaContextText || "").trim();
    const latestText = compactAiText(String(input.latestText || "").trim(), 280);
    return [
        "REMEMBERED MEDIA CONTEXT:",
        "The customer is referring to a previously shared media/product. Answer that product/media reference first. Do not continue unrelated old CRM/service context unless the customer explicitly asks.",
        mediaContextText,
        latestText ? `Latest customer message: ${latestText}` : "",
    ].filter(Boolean).join("\n");
}

function buildLatestMediaPriorityPromptText(input: {
    mediaContextText?: string;
    latestText?: string;
    emphasizeFirst?: boolean;
}) {
    const mediaContextText = String(input.mediaContextText || "").trim();
    const latestText = compactAiText(String(input.latestText || "").trim(), 280);
    const lines = [
        input.emphasizeFirst ? "Answer this latest media/caption first." : "",
        mediaContextText,
        latestText ? `Latest customer caption/text: ${latestText}` : "",
    ].filter(Boolean);
    return lines.join("\n");
}

function buildOrderMemoryPatch(input: { orderData?: any; structuredState?: any; isVoice?: boolean; quotedContext?: any }) {
    const orderData = input.orderData || {};
    const structuredState = input.structuredState || {};
    const patch: any = {};
    const variant = cleanOrderFieldValue(orderData.variation || structuredState.variant);
    if (variant) {
        patch.latestVariant = variant;
        patch.latestOrderOption = variant;
        if (input.isVoice) {
            patch.lastVoiceOrderUpdate = `Selected option/color changed to ${variant} from voice note.`;
            patch.lastVoiceOrderUpdateAt = Math.floor(Date.now() / 1000);
        }
    }
    const product = cleanOrderFieldValue(orderData.productName || structuredState.product);
    if (product) patch.latestProductName = product;
    const price = cleanOrderFieldValue(orderData.priceText || orderData.totalPrice || structuredState.priceText);
    if (price) patch.latestPrice = price;
    if (input.quotedContext?.quotedField) {
        patch.lastQuotedReplyContext = {
            field: input.quotedContext.quotedField,
            answer: input.quotedContext.customerAnswer,
            updatedAt: Math.floor(Date.now() / 1000),
        };
    }
    return patch;
}

// Configure FFmpeg
if (ffmpegInstaller) {
    ffmpeg.setFfmpegPath(ffmpegInstaller);
}

async function applyHumanBehaviorDelay(
    sock: any,
    jid: string,
    userConfig: any,
    mode: "text" | "voice",
    textLength: number,
    profile: "default" | "normal_text_fast" = "default"
) {
    if (!sock || userConfig?.human_delay_enabled === 0) return 0;
    const presence = mode === "voice" ? "recording" : "composing";
    const chars = Math.max(1, Number(textLength) || 1);
    const fastTextProfile = mode === "text" && profile === "normal_text_fast";
    const baseDelay = mode === "voice"
        ? Math.max((chars / 6.25) * 1000, 2000)
        : fastTextProfile
            ? Math.max((chars / 25) * 1000, 250)
            : Math.max((chars / 3.3) * 1000, 1500);
    const cappedDelay = Math.min(baseDelay, mode === "voice" ? 20000 : fastTextProfile ? 1200 : 15000);
    const jitter = fastTextProfile
        ? Math.floor(Math.random() * 141) + 80
        : Math.floor(Math.random() * 1500) + 500;
    const totalDelayMs = Math.max(0, Math.round(cappedDelay + jitter));

    try {
        await sock.sendPresenceUpdate(presence, jid);
        await new Promise(resolve => setTimeout(resolve, totalDelayMs));
        await sock.sendPresenceUpdate("paused", jid);
    } catch(e) {}
    return totalDelayMs;
}

async function convertAudioToOpus(inputBuffer: Buffer, mimeType?: string): Promise<Buffer> {
    if (!inputBuffer || inputBuffer.length < 100) {
        throw new Error(`Input buffer too small: ${inputBuffer?.length || 0} bytes`);
    }

    return new Promise((resolve, reject) => {
        try {
            console.log(`[FFmpeg] Starting conversion of ${inputBuffer.length} bytes (MIME: ${mimeType || 'unknown'})...`);
            const inputStream = new Readable();
            inputStream.push(inputBuffer);
            inputStream.push(null);

            const chunks: Buffer[] = [];
            const outputStream = new PassThrough();

            outputStream.on('data', (chunk) => chunks.push(chunk));
            outputStream.on('end', () => {
                const finalBuffer = Buffer.concat(chunks);
                if (finalBuffer.length < 100) {
                    return reject(new Error("FFmpeg produced an empty or too small output buffer."));
                }
                console.log(`[FFmpeg] Finished conversion. Output size: ${finalBuffer.length} bytes`);
                resolve(finalBuffer);
            });
            outputStream.on('error', (err) => {
                console.error(`[FFmpeg] Output stream error: ${err.message}`);
                reject(new Error(`Output stream error: ${err.message}`));
            });

            let ff = ffmpeg(inputStream);

            // Handle Raw PCM/L16 from Gemini TTS
            // Gemini 2.5 TTS often returns audio/pcm or audio/l16 at 24kHz or 48kHz.
            // Using 24000 as default for PCM
            if (mimeType?.includes('pcm') || mimeType?.includes('l16') || mimeType?.includes('raw')) {
                ff = ff.inputFormat('s16le').inputOptions(['-ar 24000', '-ac 1']);
            }

            ff.toFormat('ogg')
                .audioCodec('libopus')
                .audioChannels(1)
                .audioFrequency(16000)
                .outputOptions([
                    '-fflags +bitexact',
                    '-application voip',
                    '-vbr on',
                    '-compression_level 10',
                    '-frame_duration 60',
                    '-metadata:s:a:0 encoder=opus'
                ])
                .on('start', (cmd) => console.log('[FFmpeg] Command:', cmd))
                .on('error', (err) => {
                    console.error('[FFmpeg] Runtime Error:', err.message);
                    reject(err);
                })
                .pipe(outputStream, { end: true });
        } catch (e: any) {
            console.error('[FFmpeg] Fatal Execution Error:', e.message);
            reject(e);
        }
    });
}

export async function generateContentWithRetry(aiClient: any, params: any, signal?: AbortSignal): Promise<any> {
    let retries = Math.max(1, Number(params.retries || 3));
    let delayMs = 1000;
    const timeoutMs = Math.max(5000, Number(params.timeoutMs || 45000));
    while(retries > 0) {
      if (signal?.aborted) throw new Error("Request aborted");
      try {
        const config: any = {};
        if (params.tools) config.tools = params.tools;
        if (params.toolConfig) config.toolConfig = params.toolConfig;
        if (params.config) Object.assign(config, params.config);
        if (typeof config.maxOutputTokens === "undefined") {
          config.maxOutputTokens = params.maxOutputTokens || CUSTOMER_REPLY_MAX_OUTPUT_TOKENS;
        }

        return await withTimeout<any>(aiClient.models.generateContent({
           model: params.model,
           contents: params.contents,
           config
        }), timeoutMs, `AI provider timed out after ${Math.round(timeoutMs / 1000)}s for model ${params.model}`);
      } catch (e: any) {
        if (e.name === 'AbortError' || signal?.aborted) throw e;
        retries--;
        console.error("Gemini API error. Retries left:", retries, e?.message);
        const retryable = (e?.message || e?.status || "").includes("503") || (e?.message || e?.status || "").includes("429") || (e?.message || e?.status || "").includes("UNAVAILABLE");
        if (retries === 0 || !retryable) {
           throw e;
        } else {
           await new Promise(r => setTimeout(r, delayMs));
           delayMs *= 2;
        }
      }
    }
}

async function sendAiTextMessage(input: {
    sock: any;
    sender: string;
    text: string;
    userConfig: any;
    userId?: string;
    dataOwnerKey: string;
    actualBotId?: string;
    actualBotJid?: string;
    customerTurnId?: string;
    eventId: string;
    contextType: string;
    smartSalesUsed?: boolean;
    smartSalesPromptVersion?: string;
    actualProvider?: string;
    billingAction?: BillableUsageAction;
    skipPlatformAiUsageCharges?: boolean;
    humanDelayProfile?: "default" | "normal_text_fast";
    extraAiCallsCount?: number;
    io?: any;
}) {
    const actualBotId = input.actualBotId || process.env.BOT_ID || "";
    const actualBotJid = input.actualBotJid || (input.sock?.user?.id ? `${String(input.sock.user.id).split(":")[0]}@s.whatsapp.net` : "");
    let safeText = "";
    try {
        const normalized = normalizeWhatsAppCustomerReply(input.text);
        const contractResult = validateWhatsAppCustomerReply(normalized);
        if (!contractResult.ok) {
            console.warn(`[AI-Process] WhatsApp reply contract rejection for ${input.sender}: ${contractResult.errors.join(", ")}`);
        }
        safeText = assertCompleteCustomerFacingText(normalized || input.text, "incomplete_output");
    } catch (error: any) {
        const blockedReason = String(error?.reason || error?.message || "incomplete_output");
        console.warn(`[AI-Process] ${blockedReason} blocked before WhatsApp send for ${input.sender}: ${blockedReason}`);
        throw createAiReplyRetryableError("AI reply was blocked before WhatsApp send.", blockedReason);
    }
    await assertLatestCustomerMessageStillCurrent({
        dataOwnerKey: input.dataOwnerKey,
        sender: input.sender,
        eventId: input.eventId,
        contextType: input.contextType,
    });
    const typingDelayMs = await applyHumanBehaviorDelay(
        input.sock,
        input.sender,
        input.userConfig,
        "text",
        safeText.length,
        input.humanDelayProfile || "default"
    );
    emitReplyTimingLog(input.io, `reply_timing_typing_delay_ms=${typingDelayMs}`);
    await assertLatestCustomerMessageStillCurrent({
        dataOwnerKey: input.dataOwnerKey,
        sender: input.sender,
        eventId: input.eventId,
        contextType: input.contextType,
    });
    const access = await assertCustomerFacingSendAllowed({
        userId: input.userId,
        context: input.contextType || "ai_text_reply",
        customerJid: input.sender,
        io: input.io,
        logger: console,
    });
    if (!access.allowed) {
        throw createAiReplyRetryableError(`AI text reply blocked before send: ${access.reason}`, access.reason || "send_blocked");
    }
    if (globalSendDeduplicator.isDuplicate(input.sender, safeText)) {
        console.warn(`[AI-Process] Duplicate send suppressed for ${input.sender}: identical reply sent recently.`);
        emitReplyTimingLog(input.io, `duplicate_send_suppressed customer=${input.sender}`);
        return {
            status: "skipped",
            reason: "duplicate_send_suppressed",
            messageId: "dedup-suppressed",
            receiptId: "dedup-suppressed",
            finalText: safeText,
        };
    }
    const isClientCustomGemini = input.actualProvider === "client_custom_gemini";
    const effectiveBillingAction: BillableUsageAction | undefined = (() => {
        if (input.billingAction !== undefined) return input.billingAction;
        if (isClientCustomGemini) return undefined;
        if (input.actualProvider === "deepinfra" || input.contextType === "ai_text_reply") {
            return "customer_ai_text_reply";
        }
        return input.skipPlatformAiUsageCharges ? undefined : "customer_ai_text_reply";
    })();
    const sendStartedAt = Date.now();
    const result = await (async () => {
        try {
            return await sendUniversalOutboundText({
                userId: input.userId,
                botId: input.dataOwnerKey,
                customerJid: input.sender,
                messageText: safeText,
                idempotencyKey: `${input.contextType}:${input.eventId}`,
                billingAction: effectiveBillingAction,
                customerTurnId: input.customerTurnId,
                extraAiCallsCount: input.extraAiCallsCount ?? (input.customerTurnId ? getTurnExtraAiCallsCount(input.customerTurnId) : undefined),
                contextType: input.contextType,
                contextId: input.customerTurnId || input.eventId,
                campaignType: "ai_reply",
                provider: input.actualProvider || "deepinfra",
                sendText: async (jid, text) => {
                    const sent = await input.sock.sendMessage(jid, { text });
                    return { messageId: String(sent?.key?.id || ""), remoteJid: jid, timestamp: Date.now() };
                },
                saveMessage: async (jid, text, messageId) => {
                    await dbService.saveMessage(input.dataOwnerKey, jid, "model", text, messageId, undefined, {
                        actualBotId,
                        actualBotJid,
                    });
                },
            });
        } finally {
            emitReplyTimingLog(input.io, `reply_timing_whatsapp_send_ms=${Math.max(0, Date.now() - sendStartedAt)}`);
        }
    })();
    if (result.status === "sent") {
        globalSendDeduplicator.recordSent(input.sender, safeText);
    }
    if (result.status === "failed" || result.status === "skipped") {
        await dbService.updateCustomerProfile(input.dataOwnerKey, input.sender, {
            lastAiReplyStatus: "ai_generated_pending_send",
            lastAiReplyRetryStatus: "retrying_whatsapp_send",
            lastAiReplyRetryAt: Math.floor(Date.now() / 1000),
            lastAiReplyRetryReason: result.reason || result.status,
            lastAiReplyRetryEventId: input.eventId,
            lastAiReplyCustomerSendSkipped: true,
        }).catch(() => {});
        if (input.smartSalesUsed) {
            appendSmartSalesDecisionLog({
                smartSalesUsed: true,
                smartSalesPromptVersion: input.smartSalesPromptVersion,
                extraChargeApplied: false,
                replyMessageId: result.messageId,
                reasonSkipped: result.reason || result.status,
                botId: input.dataOwnerKey,
                accountId: input.userId,
            });
        }
        throw createAiReplyRetryableError(`WhatsApp AI text send failed: ${result.reason || result.status}`, "whatsapp_send_failed", {
            phase: "whatsapp_send",
            generatedReplyText: safeText,
        });
    }
    if (input.smartSalesUsed && input.userId) {
        const charge: any = await dbService.chargeUsageAction(input.userId, "smart_sales_engine_reply", {
            amount: 1,
            dedupeKey: dbService.buildUsageChargeDedupeKey("smart_sales_engine_reply", [
                input.userId,
                input.dataOwnerKey,
                input.sender,
                input.eventId || result.messageId,
                "smart_sales_engine_reply",
            ]),
            description: "Smart Sales Engine debit",
        }).catch((error: any) => ({ charged: false, reason: error?.message || "charge_exception" }));
        appendSmartSalesDecisionLog({
            smartSalesUsed: true,
            smartSalesPromptVersion: input.smartSalesPromptVersion,
            extraChargeApplied: charge?.charged === true,
            replyMessageId: result.messageId,
            reasonSkipped: charge?.charged ? "" : (charge?.duplicate ? "duplicate_charge_marker" : charge?.reason || "not_charged"),
            botId: input.dataOwnerKey,
            accountId: input.userId,
        });
    }
    return result;
}

export async function sendStoredAiTextReply(input: {
    sock: any;
    sender: string;
    text: string;
    userConfig: any;
    userId?: string;
    dataOwnerKey: string;
    actualBotId?: string;
    actualBotJid?: string;
    eventId: string;
    contextType?: string;
    actualProvider?: string;
    billingAction?: BillableUsageAction;
    skipPlatformAiUsageCharges?: boolean;
}) {
    if (!resolveBotAiChatReplyMode(input.userConfig).allowAiReplyRetry) {
        throw createAiReplySupersededError("AI chat replies are disabled for this instance.", "ai_chat_replies_disabled");
    }
    return sendAiTextMessage({
        ...input,
        contextType: input.contextType || "ai_text_reply",
    });
}

async function assertLatestCustomerMessageStillCurrent(input: {
    dataOwnerKey: string;
    sender: string;
    eventId?: string;
    contextType: string;
}) {
    if (!input.eventId) return;
    const latestHistory = await dbService.getChatHistory(input.dataOwnerKey, input.sender, 8).catch(() => []);
    const latestUser = [...(latestHistory || [])].reverse().find((item: any) => item?.role === "user");
    const latestUserMessageId = String(latestUser?.messageId || "");
    if (latestUserMessageId && latestUserMessageId !== input.eventId) {
        const label = input.contextType === "ai_voice_reply"
            ? "stale_voice_reply_suppressed"
            : input.contextType === "ai_text_reply"
                ? "stale_text_reply_suppressed"
                : "stale_tool_followup_suppressed";
        console.warn(`[AI-Process] ${label} newer_customer_message_pending context=${input.contextType}`);
        throw createAiReplySupersededError(`A newer customer message arrived before this ${input.contextType} could be sent.`, "newer_customer_message_pending");
    }
}

function getWhatsappMessageTimestampSeconds(message: any) {
    const raw = message?.messageTimestamp;
    const timestamp = raw && typeof raw.toNumber === "function" ? raw.toNumber() : raw;
    const num = Number(timestamp || message?.timestamp || 0);
    if (!num) return Math.floor(Date.now() / 1000);
    return num > 100000000000 ? Math.floor(num / 1000) : Math.floor(num);
}

function normalizeLoggedTimestamp(value: any) {
    const num = Number(value || 0);
    if (!num) return 0;
    return num > 100000000000 ? Math.floor(num / 1000) : Math.floor(num);
}

function logBlockedAiReply(input: {
    io?: any;
    reason: string;
    originalLength: number;
    textWasEmpty: boolean;
    incompleteMatched: boolean;
    unsupportedClaim?: string;
    repairReturnedEmpty?: boolean;
    pendingLatestCustomerAt?: number;
    lastDeliveredBotAt?: number;
}) {
    const msg = [
        "ai_reply_blocked_reason",
        `reason=${input.reason}`,
        `len=${Math.max(0, Number(input.originalLength || 0))}`,
        `empty=${Boolean(input.textWasEmpty)}`,
        `incomplete=${Boolean(input.incompleteMatched)}`,
        `unsupportedClaim=${input.unsupportedClaim || "none"}`,
        `repairEmpty=${Boolean(input.repairReturnedEmpty)}`,
        `latestCustomerAt=${normalizeLoggedTimestamp(input.pendingLatestCustomerAt) || 0}`,
        `lastBotAt=${normalizeLoggedTimestamp(input.lastDeliveredBotAt) || 0}`,
    ].join(" ");
    console.warn(`[AI-Process] ${msg}`);
    input.io?.emit?.("system-log", { type: "warning", msg });
}

async function markAiReplyPendingRetry(input: {
    dataOwnerKey: string;
    userId?: string;
    sender: string;
    eventId?: string;
    reason: string;
    profile?: any;
    facts?: any;
    matchingCrmLead?: any;
    io?: any;
}) {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const reason = String(input.reason || "ai_reply_guard_failed").slice(0, 160);
    const eventKey = String(input.eventId || "unknown");
    const existingProfile = input.profile || {};
    const alreadyMarked = String(existingProfile.lastAiReplyRetryEventId || "") === eventKey &&
        String(existingProfile.lastAiReplyRetryReason || "") === reason;
    const profilePatch = {
        lastAiReplyStatus: "pending_ai_generation",
        lastAiReplyRetryStatus: "pending_ai_generation",
        lastAiReplyRetryAt: nowSeconds,
        lastAiReplyRetryReason: reason,
        lastAiReplyRetryEventId: eventKey,
        lastAiReplyNeedsReviewButRetryingAt: nowSeconds,
        lastAiReplyNeedsReviewButRetryingReason: reason,
        lastAiReplyCustomerSendSkipped: true,
        aiReplyFailurePaused: false,
        aiReplyFailurePausedForMessageId: "",
        aiReplyFailurePausedAt: 0,
        aiReplyFailureReason: "",
    };
    await dbService.updateCustomerProfile(input.dataOwnerKey, input.sender, profilePatch).catch((error: any) => {
        console.warn("[AI-Retry] profile_retry_mark_failed", error?.message || error);
    });
    console.warn(`[AI-Retry] ai_reply_needs_review_but_retrying reason=${reason} duplicate=${alreadyMarked}`);
    input.io?.emit?.("system-log", {
        type: "warning",
        msg: `pending_ai_reply_retry reason=${reason} status=pending_ai_generation customer_reply_sent=false no_fallback_sent=true`,
    });
    return { created: !alreadyMarked, reason };
}

function getUtcDayStamp(epochSeconds: number) {
    const date = new Date(epochSeconds * 1000);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    return `${year}${month}${day}`;
}

async function generateContentWithFlashFallback(aiClient: any, params: any, signal?: AbortSignal): Promise<any> {
    const models = getFlashModelSequence(params.model);
    return runModelFallbackSequence({
        models,
        maxAttemptsPerModel: params.maxAttemptsPerModel || 3,
        io: params.io,
        logger: console,
        attemptRequest: async (model, context) => {
            const resolvedRequest = typeof params.resolveRequestForModel === "function"
                ? await params.resolveRequestForModel(model)
                : null;
            const resolvedConfig = resolvedRequest?.config ?? (typeof params.resolveConfigForModel === "function"
                ? await params.resolveConfigForModel(model)
                : params.config);
            const resolvedContents = resolvedRequest?.contents ?? params.contents;
            if (resolvedRequest?.usedExplicitCache && context.attemptNumber > 1) {
                params.io?.emit?.("system-log", {
                    type: "warning",
                    msg: `[AI Reply] cache reused, provider failed, retrying same model`,
                });
            }
            if (typeof params.shouldHaltFallbackOnError === "function") {
                try {
                    return await generateContentWithRetry(aiClient, {
                        ...params,
                        model,
                        retries: 1,
                        contents: resolvedContents,
                        config: resolvedConfig,
                    }, signal);
                } catch (error: any) {
                    if (params.shouldHaltFallbackOnError(error, { model, index: context.modelIndex, models })) {
                        throw error;
                    }
                    throw error;
                }
            }
            return generateContentWithRetry(aiClient, {
                ...params,
                model,
                retries: 1,
                contents: resolvedContents,
                config: resolvedConfig,
            }, signal);
        },
        validateResponse: (response: any, context) => {
            if (params.requireCustomerOutput && !hasAiCustomerOutput(response)) {
                return { ok: false, reason: `empty response` };
            }
            return { ok: true };
        },
    });
}

async function attemptAiReplyRecovery(input: {
    io?: any;
    accountId?: string;
    botId: string;
    customerJid: string;
    purpose: string;
    systemInstruction: string;
    prompt: string;
    customerTurnId?: string;
    providerCallId?: string;
}) {
    const response = await generateBackendText({
        purpose: input.purpose,
        accountId: input.accountId || input.botId,
        botId: input.botId,
        customerJid: input.customerJid,
        customerTurnId: input.customerTurnId,
        providerCallId: input.providerCallId,
        stablePrompt: input.systemInstruction,
        latestCustomerMessage: input.prompt,
        maxTokens: 500,
    });
    if (response.requestStatus !== "success" || !String(response.text || "").trim()) {
        throw createAiReplyRetryableError("DeepInfra repair text generation failed.", getDeepInfraTextBlockedReason(), {
            phase: "ai_generation",
        });
    }
    return sanitizeCustomerFacingReply(response.text || "");
}

async function attemptSimpleCustomerReplySafetyRepair(input: {
    io?: any;
    accountId?: string;
    botId: string;
    customerJid: string;
    latestCustomerText: string;
    blockedReplyText?: string;
    customerLanguage?: string;
    businessTrainingText?: string;
    crmFirstContext?: string;
    reason: string;
    customerTurnId?: string;
}) {
    const systemInstruction = [
        "Output only one clean customer-facing WhatsApp reply.",
        "Reply according to the business training/instructions, catalog, templates, and latest relevant customer context.",
        "Do not invent exact business facts that are not available in the provided training/context.",
        "Do not mention internal systems, CRM, tools, hidden context, or debug text.",
        "Do not claim any appointment, order, or booking is confirmed unless it is actually confirmed in context.",
        CONCISE_WHATSAPP_REPLY_RULES,
    ].join("\n");
    const prompt = [
        `Blocked reply reason: ${input.reason}`,
        input.blockedReplyText ? `Blocked draft reply:\n${input.blockedReplyText}` : "",
        `Latest customer message:\n${input.latestCustomerText || ""}`,
        input.customerLanguage ? `Customer language: ${input.customerLanguage}` : "",
        input.businessTrainingText ? `Business training and prompt context:\n${String(input.businessTrainingText).slice(0, 3200)}` : "",
        input.crmFirstContext ? `Use these CRM facts only if directly relevant:\n${String(input.crmFirstContext).slice(0, 1200)}` : "",
        "Rewrite the reply naturally. If an exact business detail is unavailable, say naturally that the business should confirm that detail.",
    ].filter(Boolean).join("\n\n");
    const repaired = await attemptAiReplyRecovery({
        io: input.io,
        accountId: input.accountId,
        botId: input.botId,
        customerJid: input.customerJid,
        customerTurnId: input.customerTurnId,
        purpose: "customer_ai_reply_safety_repair",
        systemInstruction,
        prompt,
    });
    const validation = validateCompleteCustomerFacingText(repaired);
    return validation.ok ? validation.text : "";
}

function hasAiCustomerOutput(response: any) {
    if (response?.functionCalls?.length) return true;
    const directText = typeof response?.text === "function" ? response.text() : response?.text;
    if (String(directText || "").trim()) return true;
    const parts = response?.candidates?.[0]?.content?.parts || [];
    return parts.some((part: any) => String(part?.text || "").trim() || part?.functionCall);
}

async function chargeCustomerReplyUsage(input: {
    userId?: string;
    botId: string;
    customerJid: string;
    eventId: string;
    messageId?: string;
    hasIncomingImage?: boolean;
    hasIncomingAudio?: boolean;
    sentTextReply?: boolean;
    sentVoiceReply?: boolean;
    textReceiptId?: string;
    voiceReceiptId?: string;
    smartSalesUsed?: boolean;
    smartSalesPromptVersion?: string;
    skipPlatformAiUsageCharges?: boolean;
}) {
    if (!input.userId) return;
    const actions = buildCustomerReplyUsageActions({
        hasIncomingImage: input.hasIncomingImage,
        hasIncomingAudio: input.hasIncomingAudio,
        sentTextReply: input.sentTextReply,
        sentVoiceReply: input.sentVoiceReply,
        textReceiptId: input.textReceiptId,
        voiceReceiptId: input.voiceReceiptId,
        smartSalesUsed: input.smartSalesUsed,
        skipPlatformAiUsageCharges: input.skipPlatformAiUsageCharges,
    });
    if (actions.length === 0) return;

    const items = actions.map((action: BillableUsageAction) => ({
        action,
        amount: 1,
        dedupeKey: dbService.buildUsageChargeDedupeKey(action, [
            input.userId,
            input.botId,
            input.customerJid,
            input.eventId || input.messageId,
            action,
        ]),
        description: action === "customer_ai_voice_reply" && input.voiceReceiptId
                ? buildOutboundChargeDescription({ action, receiptId: input.voiceReceiptId, messageId: String(input.messageId || "") })
                : action === "smart_sales_engine_reply"
                    ? "Smart Sales Engine debit"
                : "",
    }));

    try {
        const result = await dbService.chargeUsageActions(input.userId, items);
        if (result?.charged || result?.duplicate) {
            if (input.smartSalesUsed) {
                appendSmartSalesDecisionLog({
                    smartSalesUsed: true,
                    smartSalesPromptVersion: input.smartSalesPromptVersion,
                    extraChargeApplied: result?.charged === true,
                    replyMessageId: input.messageId,
                    reasonSkipped: result?.duplicate ? "duplicate_charge_marker" : "",
                    botId: input.botId,
                    accountId: input.userId,
                });
            }
            if (input.voiceReceiptId && input.sentVoiceReply) {
                updateOutboundReceipt(input.voiceReceiptId, { charged: true, duplicateCharge: result?.duplicate === true });
            }
        }
        if (!result?.charged && !result?.duplicate) {
            if (input.smartSalesUsed) {
                appendSmartSalesDecisionLog({
                    smartSalesUsed: true,
                    smartSalesPromptVersion: input.smartSalesPromptVersion,
                    extraChargeApplied: false,
                    replyMessageId: input.messageId,
                    reasonSkipped: result?.reason || result?.message || "not_charged",
                    botId: input.botId,
                    accountId: input.userId,
                });
            }
            actions.forEach((action) => {
                dbService.logUsageChargeFailure({
                    action,
                    userId: input.userId,
                    botId: input.botId,
                    customerJid: input.customerJid,
                    eventId: input.eventId,
                    messageId: input.messageId,
                    reason: result?.reason || result?.message || "not_charged",
                });
            });
        }
    } catch (error: any) {
        actions.forEach((action) => {
            dbService.logUsageChargeFailure({
                action,
                userId: input.userId,
                botId: input.botId,
                customerJid: input.customerJid,
                eventId: input.eventId,
                messageId: input.messageId,
                reason: "charge_exception",
            });
        });
    }
}

function normalizeMediaRetryStatus(kind: "image" | "audio", existingStatus: any, sameEvent: boolean, success: boolean, blockedReason = "") {
    if (success) return kind === "image" ? "image_understood_pending_reply" : "audio_understood_pending_reply";
    if (blockedReason) {
        const value = String(blockedReason || "").toLowerCase();
        if (value.includes("wallet") || value.includes("insufficient")) return "media_understanding_blocked_insufficient_balance";
        if (value.includes("quota") || value.includes("limit")) return "media_understanding_blocked_quota_exceeded";
        if (value.includes("paused")) return "media_understanding_blocked_ai_paused";
        if (value.includes("disconnect")) return "media_understanding_blocked_instance_disconnected";
        return "media_understanding_blocked_subscription_expired";
    }
    const pending = kind === "image" ? "pending_image_understanding" : "pending_audio_understanding";
    const retrying = kind === "image" ? "retrying_image_understanding" : "retrying_audio_understanding";
    return sameEvent && String(existingStatus || "").includes(kind) ? retrying : pending;
}

async function updateMediaUnderstandingProfileState(input: {
    dataOwnerKey: string;
    sender: string;
    eventId?: string;
    kind: "image" | "audio";
    profile?: any;
    result?: MediaUnderstandingResult | null;
    reason?: string;
}) {
    const sameEvent = String(input.profile?.lastMediaUnderstandingEventId || "") === String(input.eventId || "");
    const success = Boolean(input.result?.useful);
    const state = normalizeMediaRetryStatus(
        input.kind,
        input.profile?.lastAiReplyRetryStatus,
        sameEvent,
        success,
        String(input.reason || ""),
    );
    const patch: any = {
        lastMediaUnderstandingKind: input.kind,
        lastMediaUnderstandingEventId: String(input.eventId || ""),
        lastMediaUnderstandingReason: String(input.reason || input.result?.reason || "").slice(0, 160),
        lastMediaUnderstandingStatus: state,
        lastAiReplyRetryStatus: state,
        lastAiReplyStatus: success ? state : "pending_ai_generation",
        lastMediaUnderstandingAt: Math.floor(Date.now() / 1000),
    };
    if (success && input.result) {
        patch.lastMediaUnderstandingProvider = input.result.provider;
        patch.lastMediaUnderstandingModel = input.result.model;
        patch.lastMediaUnderstandingDetectedType = input.result.detectedType;
        patch.lastMediaUnderstandingConfidence = input.result.confidence;
        patch.lastMediaUnderstandingChars = input.result.contextText.length;
    }
    await dbService.updateCustomerProfile(input.dataOwnerKey, input.sender, patch).catch(() => {});
}

async function chargeCustomerMediaUnderstanding(input: {
    userId?: string;
    botId: string;
    customerJid: string;
    eventId: string;
    kind: "image" | "audio";
    provider: string;
    usedProvider?: boolean;
    skipPlatformAiUsageCharges?: boolean;
}) {
    const action: BillableUsageAction = input.kind === "image"
        ? "customer_ai_image_understanding"
        : "customer_ai_audio_understanding";
    const skippedReason = input.skipPlatformAiUsageCharges
        ? "client_gemini_external_billing"
        : !input.userId
            ? "missing_user_context"
            : !input.usedProvider
                ? "existing_transcript_reused"
                : "";
    if (skippedReason) {
        console.info(`${input.kind}_understanding_billing_skipped reason=${skippedReason}`);
        return { charged: false, duplicate: false, reason: skippedReason };
    }

    try {
        const result = await dbService.chargeUsageAction(String(input.userId), action, {
            amount: 1,
            dedupeKey: dbService.buildUsageChargeDedupeKey(action, [
                input.userId,
                input.botId,
                input.customerJid,
                input.eventId,
                action,
            ]),
            description: input.kind === "image" ? "Successful image understanding debit" : "Successful audio understanding debit",
        });
        if (result?.charged) {
            console.info(`${input.kind}_understanding_billing_charged provider=${input.provider}`);
            console.info(`gemini_media_customer_charge status=charged reason=useful_${input.kind}_context`);
            return result;
        }
        console.info(`gemini_media_customer_charge status=skipped reason=${result?.duplicate ? "duplicate_charge_marker" : (result?.reason || "not_charged")}`);
        console.info(`${input.kind}_understanding_billing_skipped reason=${result?.duplicate ? "duplicate_charge_marker" : (result?.reason || "not_charged")}`);
        return result;
    } catch (error: any) {
        const reason = String(error?.message || "charge_exception").slice(0, 160);
        dbService.logUsageChargeFailure({
            action,
            userId: input.userId,
            botId: input.botId,
            customerJid: input.customerJid,
            eventId: input.eventId,
            reason,
        });
        console.info(`gemini_media_customer_charge status=skipped reason=${reason}`);
        console.info(`${input.kind}_understanding_billing_skipped reason=${reason}`);
        return { charged: false, duplicate: false, reason };
    }
}

function cleanSafeModeText(value: any, max = 600) {
    return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function buildSafeModeMediaFallbackText(input: {
    kind: "image" | "audio";
    language?: string;
}) {
    const language = String(input.language || "").toLowerCase();
    if (language === "english") {
        return input.kind === "image"
            ? "I could not clearly understand that image. Please resend a clearer image or describe what you want me to check."
            : "I could not clearly understand that voice note. Please resend the voice note or type your message.";
    }
    return input.kind === "image"
        ? "Main is image ko clear tor par samajh nahin saka. Meharbani karke clear image dobara bhej dein ya bata dein kya check karna hai."
        : "Main is voice note ko clear tor par samajh nahin saka. Meharbani karke voice note dobara bhej dein ya apna message type kar dein.";
}

function buildVoiceOutputUnavailableText(language?: string) {
    if (String(language || "").toLowerCase() === "english") {
        return "Voice reply is not available right now, but I can continue in text.";
    }
    return "Voice reply abhi available nahin hai, lekin main text mein continue kar sakta hun.";
}

function buildVoiceOutputOnlyAcknowledgement(language?: string) {
    if (String(language || "").toLowerCase() === "english") {
        return "Sure, I can reply by voice. Here is the response.";
    }
    return "Theek hai, main voice mein reply karta hun. Yeh response hai.";
}

function buildVoiceDeliveryFallbackText(replyText: string, language?: string) {
    const safeReply = String(replyText || "").trim();
    if (!safeReply) return buildVoiceOutputUnavailableText(language);
    if (String(language || "").toLowerCase() === "english") {
        return `I could not send a voice reply right now, but here is the text response:\n\n${safeReply}`;
    }
    return `Main abhi voice reply send nahin kar saka, lekin yeh text response hai:\n\n${safeReply}`;
}

function buildMediaUnderstandingResultFromStore(kind: DurableMediaContextType, record: any): MediaUnderstandingResult {
    const summary = cleanSafeModeText(record?.summary, 2000);
    const visibleText = cleanSafeModeText(record?.visibleText, 1200);
    const transcript = cleanSafeModeText(record?.transcript, 5000);
    const contextText = cleanSafeModeText(
        transcript
            ? [transcript ? `Transcript: ${transcript}` : "", summary].filter(Boolean).join(". ")
            : [summary, visibleText ? `Visible text: ${visibleText}` : ""].filter(Boolean).join(". "),
        5000,
    );
    return {
        kind,
        useful: record?.useful === true,
        provider: cleanSafeModeText(record?.provider, 120),
        model: cleanSafeModeText(record?.model, 120),
        requestStatus: record?.useful === true ? "success" : "failed",
        retryable: record?.useful !== true,
        reason: cleanSafeModeText(record?.failureReason, 240),
        confidence: Math.max(0, Math.min(1, Number(record?.confidence || 0))),
        detectedType: cleanSafeModeText(record?.type || kind, 80) || kind,
        contextText,
        transcriptText: transcript,
        usedProvider: false,
        sourceTag: "durable_media_context",
        summaryText: summary,
        visibleText,
        language: cleanSafeModeText(record?.language, 40),
    };
}

async function getSavedDurableMediaResult(input: {
    botId: string;
    customerJid: string;
    messageId: string;
    type: DurableMediaContextType;
    purpose: string;
    mediaBuffer?: Buffer;
    sourceMime?: string;
    normalizedMime?: string;
    latestCustomerText?: string;
    caption?: string;
    transcript?: string;
}) {
    if (!isSafeModeDurableMediaContextCacheEnabled() || !input.mediaBuffer?.length || !input.messageId) {
        return { saved: null, mediaHash: "", payloadFingerprint: "", configFingerprint: "", result: null as MediaUnderstandingResult | null };
    }
    const mediaHash = buildMediaHash(input.mediaBuffer);
    const payloadFingerprint = buildMediaPayloadFingerprint({
        mediaHash,
        sourceMime: input.sourceMime,
        normalizedMime: input.normalizedMime,
    });
    const configFingerprint = buildMediaConfigFingerprint({
        purpose: input.purpose,
        latestCustomerText: input.latestCustomerText,
        caption: input.caption,
        transcript: input.transcript,
    });
    const saved = await getSavedMediaContext({
        botId: input.botId,
        customerJid: input.customerJid,
        messageId: input.messageId,
        mediaHash,
        type: input.type,
        purpose: input.purpose,
    });
    if (hasUsefulSavedMediaContext(saved)) {
        return {
            saved,
            mediaHash,
            payloadFingerprint,
            configFingerprint,
            result: buildMediaUnderstandingResultFromStore(input.type, saved),
        };
    }
    if (hasSameFailedMediaContext(saved, { payloadFingerprint, configFingerprint })) {
        return {
            saved,
            mediaHash,
            payloadFingerprint,
            configFingerprint,
            result: buildMediaUnderstandingResultFromStore(input.type, saved),
        };
    }
    return { saved, mediaHash, payloadFingerprint, configFingerprint, result: null as MediaUnderstandingResult | null };
}

async function saveDurableMediaResult(input: {
    type: DurableMediaContextType;
    botId: string;
    customerJid: string;
    messageId: string;
    purpose: string;
    mediaHash: string;
    payloadFingerprint: string;
    configFingerprint: string;
    sourceMime?: string;
    normalizedMime?: string;
    result: MediaUnderstandingResult;
}) {
    if (!isSafeModeDurableMediaContextCacheEnabled() || !input.messageId || !input.mediaHash) return null;
    return saveMediaContext({
        type: input.type,
        provider: cleanSafeModeText(input.result.provider, 120),
        model: cleanSafeModeText(input.result.model, 120),
        botId: cleanSafeModeText(input.botId, 120),
        customerJid: cleanSafeModeText(input.customerJid, 180),
        messageId: cleanSafeModeText(input.messageId, 160),
        mediaHash: cleanSafeModeText(input.mediaHash, 80),
        purpose: cleanSafeModeText(input.purpose, 120),
        useful: input.result.useful === true,
        summary: cleanSafeModeText(input.result.summaryText || input.result.contextText, 4000),
        visibleText: cleanSafeModeText(input.result.visibleText, 2000),
        transcript: cleanSafeModeText(input.result.transcriptText, 5000),
        language: cleanSafeModeText(input.result.language, 40),
        confidence: input.result.confidence,
        failureReason: cleanSafeModeText(input.result.reason, 240),
        sourceMime: cleanSafeModeText(input.sourceMime, 120),
        normalizedMime: cleanSafeModeText(input.normalizedMime, 120),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
        payloadFingerprint: cleanSafeModeText(input.payloadFingerprint, 80),
        configFingerprint: cleanSafeModeText(input.configFingerprint, 80),
    });
}

async function processVoiceGeneration(
    sock: any,
    sender: string,
    text: string,
    userConfig: any,
    localGenAI: any,
    io: any,
    myJid: string,
    userId: string | undefined,
    voicePreference?: { selectedVoice?: string; effectiveGender?: string },
    billingEventId?: string,
    geminiProvider?: any,
    skipPlatformAiUsageCharges?: boolean
) {
    const safeText = String(text || "").trim();
    if (!safeText) {
        io?.emit("system-log", { type: "error", msg: "tts_failed provider=gemini reason=tts_empty_final_text" });
        io?.emit("system-log", { type: "warning", msg: "tts_billing_skipped reason=tts_generation_failed" });
        return { sent: false, messageId: "", failureReason: "tts_empty_final_text", receiptId: "", fallbackReasonType: "tts_failed" };
    }
    try {
        io?.emit("system-log", { type: "info", msg: "🎙️ Generating Voice Simulation..." });
        await assertLatestCustomerMessageStillCurrent({
            dataOwnerKey: myJid,
            sender,
            eventId: billingEventId,
            contextType: "ai_voice_reply",
        });
        const nowSeconds = Math.floor(Date.now() / 1000);
        const latestProfile = await dbService.getCustomerProfile(myJid, sender).catch(() => null) || {};
        const currentDay = getUtcDayStamp(nowSeconds);
        const voiceRepliesToday = String(latestProfile.voiceReplyDay || "") === currentDay
            ? Number(latestProfile.voiceReplyCount || 0)
            : 0;
        if (voiceRepliesToday >= ACCOUNT_USAGE_GUARDRAILS.voiceRepliesPerCustomerPerDay) {
            io?.emit("system-log", {
                type: "warning",
                msg: `Voice reply skipped for ${sender.split("@")[0]} because the daily voice cap was reached.`
            });
            io?.emit("system-log", { type: "warning", msg: "tts_billing_skipped reason=voice_delivery_failed" });
            return { sent: false, messageId: "", failureReason: "daily_voice_cap_reached", receiptId: "", fallbackReasonType: "send_failed" };
        }
        const voiceBilling = skipPlatformAiUsageCharges
            ? { allowed: true, cost: 0, reason: "" }
            : await previewUsageBillingAction(userId, "customer_ai_voice_reply");
        if (!voiceBilling.allowed) {
            io?.emit("system-log", {
                type: "warning",
                msg: `Voice reply skipped for ${sender.split("@")[0]} because wallet balance is too low.`
            });
            io?.emit("system-log", { type: "warning", msg: "tts_billing_skipped reason=voice_delivery_failed" });
            return { sent: false, messageId: "", failureReason: String(voiceBilling.reason || "insufficient_funds"), receiptId: "", fallbackReasonType: "send_failed" };
        }
        const selectedVoice = voicePreference?.selectedVoice || userConfig?.bot_voice || "Charon";
        const maleVoices = new Set(["Charon", "Fenrir", "Orus", "Puck", "Iapetus", "Enceladus", "Algieba", "Rasalgethi", "Algenib", "Schedar", "Achird", "Sadaltager"]);
        const femaleVoices = new Set(["Aoede", "Kore", "Leda", "Zephyr", "Autonoe", "Callirrhoe", "Despina", "Erinome", "Laomedeia", "Pulcherrima", "Vindemiatrix", "Sulafat"]);
        const effectiveGender = voicePreference?.effectiveGender || (maleVoices.has(selectedVoice)
            ? "male"
            : (femaleVoices.has(selectedVoice) ? "female" : userConfig?.bot_gender));
        console.log(`[AI-Voice] Starting TTS for ${sender}. voice=${selectedVoice}, effectiveGender=${effectiveGender || "unknown"}, textLength=${safeText.length}`);
        io?.emit("system-log", { type: "info", msg: `tts_started provider=gemini textChars=${safeText.length}` });
        const ttsBillingProvider = {
            ...geminiProvider,
            purpose: "reply_tts",
            billingContext: {
                ...(geminiProvider?.billingContext || {}),
                customerJid: sender,
                eventId: String(billingEventId || geminiProvider?.billingContext?.eventId || ""),
                messageId: String(geminiProvider?.billingContext?.messageId || ""),
                requestId: String(geminiProvider?.billingContext?.requestId || billingEventId || ""),
            },
            cacheTelemetryContext: {
                cacheBoostEnabled: Boolean((geminiProvider as any)?.explicitCacheBoostEnabled),
                cacheEligible: false,
                cacheAttempted: false,
                cacheAttached: false,
                cacheMissReason: "cache_skipped_unsupported_path",
            },
        };
        const ttsResponse = await runGeminiRequestWithClientBilling(
            ttsBillingProvider,
            () => generateTtsContentWithRetry({
                localGenAI,
                text: safeText,
                userConfig,
                effectiveGender,
                selectedVoice,
                geminiApiKey: String((geminiProvider as any)?.clientOptions?.apiKey || ""),
                io,
            }),
            { deferCustomerBillingUntilConfirmed: true }
        );
        io?.emit("system-log", { type: "info", msg: "gemini_tts_allowed_final_text_only=true" });
        io?.emit("system-log", { type: "info", msg: "tts_billing_deferred reason=waiting_for_whatsapp_voice_delivery" });
        const outboundSender = createWhatsAppOutboundSender({
            providerType: "whatsapp_web",
            baileysSendMessage: (jid, payload) => sock.sendMessage(jid, payload),
        });
        const voiceResult = await deliverVoiceReplyAudio({
            response: ttsResponse,
            io,
            convertAudioToOpus,
            beforeSend: async () => {
                await applyHumanBehaviorDelay(sock, sender, userConfig, "voice", safeText.length);
                await assertLatestCustomerMessageStillCurrent({
                    dataOwnerKey: myJid,
                    sender,
                    eventId: billingEventId,
                    contextType: "ai_voice_reply",
                });
                const access = await assertCustomerFacingSendAllowed({
                    userId,
                    context: "ai_voice_reply",
                    customerJid: sender,
                    io,
                    logger: console,
                });
                if (!access.allowed) {
                    throw new Error(String(access.reason || "voice_send_blocked"));
                }
            },
            createReceipt: () => createOutboundReceiptAttempt({
                userId,
                botId: myJid,
                customerJid: sender,
                messageType: "voice",
                contextType: "ai_voice_reply",
                contextId: String(billingEventId || ""),
                campaignType: "ai_reply",
                billingAction: skipPlatformAiUsageCharges ? undefined : "customer_ai_voice_reply",
                walletChargeAmount: Number(voiceBilling.cost || 0),
                idempotencyKey: `ai_voice_reply:${sender}:${billingEventId || safeText.slice(0, 24)}`,
            }),
            updateReceipt: (receiptId, patch) => updateOutboundReceipt(receiptId, {
                ...patch,
                remoteJid: sender,
            }),
            sendVoiceNote: async ({ buffer, mimetype, ptt }) => {
                const result = await outboundSender.sendMedia({
                    jid: sender,
                    buffer,
                    mimetype,
                    type: ptt ? "voice" : "audio",
                });
                return {
                    success: result.success,
                    providerMessageId: String(result.providerMessageId || ""),
                    errorMessage: result.errorMessage,
                };
            },
        });
        if (voiceResult.sent) {
            await finalizeDeferredGeminiTtsCustomerBilling({
                provider: ttsBillingProvider,
                result: ttsResponse,
                finalSendOutcome: "sent",
                reason: "voice_delivery_success",
                receiptId: voiceResult.receiptId,
                messageId: voiceResult.messageId,
            });
            io?.emit("system-log", { type: "success", msg: "tts_billing_charged reason=voice_delivery_success" });
            console.log(`[AI-Voice] Voice message dispatched to ${sender}`);
            io?.emit("system-log", { type: "success", msg: `Voice reply delivered. receipt=${voiceResult.receiptId.slice(0, 12)} message=${String(voiceResult.messageId || "").slice(0, 12)}` });
            await dbService.updateCustomerProfile(myJid, sender, {
                lastVoiceReplyAt: nowSeconds,
                voiceReplyDay: currentDay,
                voiceReplyCount: voiceRepliesToday + 1
            }).catch(() => {});
            return voiceResult;
        }
        const billingSkipReason = voiceResult.fallbackReasonType === "conversion_failed"
            ? "conversion_failed"
            : voiceResult.fallbackReasonType === "send_failed"
                ? "voice_delivery_failed"
                : "tts_generation_failed";
        await finalizeDeferredGeminiTtsCustomerBilling({
            provider: ttsBillingProvider,
            result: ttsResponse,
            finalSendOutcome: voiceResult.fallbackReasonType === "send_failed" ? "failed" : "skipped",
            reason: billingSkipReason,
            receiptId: voiceResult.receiptId,
            messageId: voiceResult.messageId,
        });
        io?.emit("system-log", { type: "warning", msg: `tts_billing_skipped reason=${billingSkipReason}` });
        return voiceResult;

        /*
            } catch (convErr: any) {
                console.error("[AI-Voice] Conversion fail:", convErr.message);
                console.error("[AI-Voice] Voice encoding failed. Text fallback will be sent.");
                io?.emit("system-log", { type: "error", msg: `❌ Encoding Failed: ${convErr.message}` });
                return { sent: false, messageId: "", failureReason: `voice encoding failed: ${convErr.message}`, receiptId: "" };
            }

            if (buffer.length > 500) {
                await applyHumanBehaviorDelay(sock, sender, userConfig, "voice", text.length);
                await assertLatestCustomerMessageStillCurrent({
                    dataOwnerKey: myJid,
                    sender,
                    eventId: billingEventId,
                    contextType: "ai_voice_reply",
                });
                const access = await assertCustomerFacingSendAllowed({
                    userId,
                    context: "ai_voice_reply",
                    customerJid: sender,
                    io,
                    logger: console,
                });
                if (!access.allowed) {
                    return { sent: false, messageId: "", failureReason: access.reason, receiptId: "" };
                }
                const receipt = createOutboundReceiptAttempt({
                    userId,
                    botId: myJid,
                    customerJid: sender,
                    messageType: "voice",
                    contextType: "ai_voice_reply",
                    contextId: String(billingEventId || ""),
                    campaignType: "ai_reply",
                    billingAction: skipPlatformAiUsageCharges ? undefined : "customer_ai_voice_reply",
                    walletChargeAmount: Number(voiceBilling.cost || 0),
                    idempotencyKey: `ai_voice_reply:${sender}:${billingEventId || text.slice(0, 24)}`,
                });
                updateOutboundReceipt(receipt.receiptId, { sendStatus: "sending", errorReason: "" });
                const sentMsg = await sock.sendMessage(sender, {
                    audio: buffer, 
                    mimetype: "audio/ogg; codecs=opus", 
                    ptt: true 
                });
                if (!sentMsg?.key?.id) {
                    updateOutboundReceipt(receipt.receiptId, { sendStatus: "failed", errorReason: "missing_message_id" });
                    throw new Error("WhatsApp did not return a message id for the voice reply.");
                }
                updateOutboundReceipt(receipt.receiptId, {
                    sendStatus: "sent",
                    messageId: String(sentMsg?.key?.id || ""),
                    remoteJid: sender,
                    sentTimestamp: Date.now(),
                    errorReason: "",
                });
                console.log(`[AI-Voice] Voice message dispatched to ${sender}`);
                io?.emit("system-log", { type: "success", msg: `Voice reply delivered. receipt=${receipt.receiptId.slice(0, 12)} message=${String(sentMsg?.key?.id || "").slice(0, 12)}` });
                await dbService.updateCustomerProfile(myJid, sender, {
                    lastVoiceReplyAt: nowSeconds,
                    voiceReplyDay: currentDay,
                    voiceReplyCount: voiceRepliesToday + 1
                }).catch(() => {});
                return { sent: true, messageId: String(sentMsg?.key?.id || ""), failureReason: "", receiptId: receipt.receiptId };
            } else {
                console.warn("[AI-Voice] Audio too small to send:", buffer.length);
                io?.emit("system-log", { type: "warning", msg: "⚠️ Generated audio was too short to deliver." });
            }
        } else {
            console.warn("[AI-Voice] No data in audio part.");
            io?.emit("system-log", { type: "error", msg: "❌ AI returned empty voice data." });
        }
        */
    } catch (ttsErr: any) {
        if (isAiReplySupersededError(ttsErr)) {
            io?.emit("system-log", { type: "warning", msg: "Stale voice reply suppressed; no customer message was sent." });
            throw ttsErr;
        }
        const rawReason = getSafeTtsFailureReason(ttsErr, "tts_request_failed");
        const safeReason = /no_verified_voice|returned_no_audio|no_audio/i.test(rawReason)
            ? "no_working_tts_voice"
            : rawReason;
        if (safeReason === "no_working_tts_voice") {
            io?.emit("system-log", { type: "warning", msg: "tts_voice_runtime_disabled reason=no_verified_voice" });
        }
        console.error("[AI-Voice] TTS failed:", ttsErr.message);
        io?.emit("system-log", { type: "error", msg: `tts_failed provider=gemini reason=${safeReason}` });
        io?.emit("system-log", { type: "warning", msg: "tts_billing_skipped reason=tts_generation_failed" });
        return { sent: false, messageId: "", failureReason: safeReason, receiptId: "", fallbackReasonType: "tts_failed" };
    }
    return { sent: false, messageId: "", receiptId: "" };
}

function normalizeLookup(value: string) {
    return (value || "")
        .toLowerCase()
        .replace(/[_-]+/g, " ")
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

export function findBestMediaTemplate(templates: any[] = [], requestedName: string, userText = "") {
    const rawChoice = String(requestedName || "").trim().replace(/^["']|["']$/g, "").replace(/^(?:id|item|media_item)[:\s]+/i, "").trim();
    if (!rawChoice || templates.length === 0) return null;
    const query = normalizeLookup(rawChoice);

    // 1. Direct match by stable ID (authoritative)
    const exactIdMatch = templates.find((t) => {
        const id = String(t?.id || t?.key?.id || t?.messageId || t?.originalMessage?.key?.id || t?.originalMessage?.id || "").trim();
        return id && (
            id.toLowerCase() === rawChoice.toLowerCase() ||
            id.toLowerCase() === query ||
            normalizeLookup(id) === query
        );
    });
    if (exactIdMatch) return exactIdMatch;

    // 2. Direct match by short name or filename
    const exactNameMatch = templates.find((t) => {
        const name = normalizeLookup(t?.name || t?.shortName || "");
        const fileName = normalizeLookup(t?.fileName || "");
        return (name && name === query) || (fileName && fileName === query);
    });
    if (exactNameMatch) return exactNameMatch;

    // 3. Direct match by exact caption
    const exactCaptionMatch = templates.find((t) => {
        const caption = normalizeLookup(t?.caption || "");
        return caption && caption === query;
    });
    if (exactCaptionMatch) return exactCaptionMatch;

    const indexMatch = query.match(/\b(?:media|file|image|photo|picture|pic|video|doc|document)?\s*(\d+)\b/);
    if (indexMatch) {
        const index = Number(indexMatch[1]) - 1;
        if (index >= 0 && index < templates.length) return templates[index];
    }

    const genericWords = new Set([
        "send", "show", "give", "me", "the", "a", "an", "file", "media",
        "image", "photo", "picture", "pic", "video", "document"
    ]);
    const queryWords = query.split(" ").filter(Boolean);
    const specificQueryWords = queryWords.filter(w => !genericWords.has(w));
    const fallbackWords = normalizeLookup(userText).split(" ").filter(w => w.length > 2 && !genericWords.has(w));
    const searchWords = specificQueryWords.length > 0 ? specificQueryWords : fallbackWords;

    let best: any = null;
    let bestScore = 0;
    templates.forEach((template, index) => {
        const caption = normalizeLookup(template?.caption || "");
        const name = normalizeLookup(template?.name || template?.shortName || "");
        const fileName = normalizeLookup(template?.fileName || "");
        const aliases = Array.isArray(template?.aliases) ? template.aliases.map((a: string) => normalizeLookup(a)) : [];
        const searchable = normalizeLookup(`${caption} ${name} ${fileName} ${template?.searchText || ""} ${aliases.join(" ")} media ${index + 1} media_${index + 1} ${index + 1}`);

        let score = 0;
        if (aliases.includes(query) || searchable.includes(`media ${index + 1}`) && query === `media ${index + 1}`) score += 100;
        if (name && (name === query || query.includes(name))) score += 90;
        if (caption && caption === query) score += 80;
        if (caption && (caption.includes(query) || query.includes(caption))) score += 60;
        for (const word of searchWords) {
            if (searchable.includes(word)) score += 12;
        }
        if (searchWords.length > 0 && searchWords.every(word => searchable.includes(word))) score += 25;

        if (score > bestScore) {
            bestScore = score;
            best = template;
        }
    });

    return bestScore >= 12 ? best : null;
}

export async function processMissedMessageSafe(
    sock: any,
    sender: string,
    historyArray: any[],
    botConfig: any,
    cachedKeywordSequences: any,
    cachedWelcomeTemplates: any,
    io?: any,
    options?: {
        batchSelection?: PendingBatchSelectionOptions;
        batchId?: string;
        timing?: {
            batchWaitMs?: number;
            batchMode?: string;
            normalTextBatchFastPath?: boolean;
        };
    }
) {
    if (!resolveBotAiChatReplyMode(botConfig).allowInboundAiReply) return false;
    console.log(`[AI-Process] Starting inbound AI processing.`);
    const replyPipelineStartedAt = Date.now();
    const batchWaitMs = Math.max(0, Number(options?.timing?.batchWaitMs || 0));
    // 1. Get user configuration
    const userId = process.env.USER_ID;
    const isTrialActive = userId ? await dbService.isTrialOrPaid(userId) : false;
    if (!isTrialActive) {
        console.warn(`[AI-Process] Trial/Paid not active for ${userId || 'unknown'}.`);
        return false;
    }

    const accountConfig = userId ? await dbService.loadUserConfig(userId) : null;
    let customerTurnId = "";
    const userConfig = {
        ...(accountConfig || {}),
        ...(botConfig || {}),
        ai_prompt: botConfig?.prompt ?? accountConfig?.ai_prompt,
        bot_voice: botConfig?.botVoice ?? botConfig?.bot_voice ?? accountConfig?.bot_voice,
        bot_gender: botConfig?.botGender ?? botConfig?.bot_gender ?? accountConfig?.bot_gender,
        bot_name: botConfig?.botName ?? botConfig?.bot_name ?? accountConfig?.bot_name,
        custom_fields: Array.isArray(botConfig?.customFields) ? botConfig.customFields : accountConfig?.custom_fields,
        business_type: botConfig?.business_type ?? accountConfig?.business_type,
        replyBehavior: botConfig?.reply_behavior ?? accountConfig?.replyBehavior ?? accountConfig?.reply_behavior,
        reply_behavior: botConfig?.reply_behavior ?? accountConfig?.reply_behavior ?? accountConfig?.replyBehavior,
        difficult_customer_mode: botConfig?.difficult_customer_mode ?? botConfig?.difficultCustomerMode ?? accountConfig?.difficult_customer_mode,
        human_delay_enabled: botConfig?.human_delay_enabled ?? accountConfig?.human_delay_enabled,
        voice_simulation_enabled: botConfig?.voice_simulation_enabled ?? accountConfig?.voice_simulation_enabled
    };
    const myJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";
    const dataOwnerKey = buildAccountDataOwnerKey(accountConfig || userId, myJid);
    emitReplyTimingLog(io, `reply_timing_batch_wait_ms=${batchWaitMs}`);

    const mediaFetchAgent = (sock as any)?.fetchAgent;

    // 2. Extract recent history
    const historyTemp = historyArray.filter((m: any) => {
        const raw = (m.message?.conversation || m.message?.extendedTextMessage?.text || (m.key?.fromMe ? "AI" : ""));
        const hasAudio = !!m.message?.audioMessage;
        const hasImage = !!m.message?.imageMessage;
        const validRaw = raw && !raw.toLowerCase().includes("(missed message recovery)") && !raw.toLowerCase().includes("waiting for this message");
        return validRaw || hasAudio || hasImage;
    }).slice(-CUSTOMER_HISTORY_LIMIT);

    console.log(`[AI-Process] History parts: ${historyTemp.length}`);
    const pendingBatch = collectPendingInboundMessageBatch(historyTemp, options?.batchSelection);
    const pendingBatchMessageIds = new Set(pendingBatch.messages.map((message: any) => String(message?.key?.id || "")).filter(Boolean));

    // Prepend missing history from database (which survives container restarts)
    const ownerHistory = await dbService.getChatHistory(dataOwnerKey, sender, CUSTOMER_DB_HISTORY_LIMIT);
    const legacyHistory = dataOwnerKey !== myJid ? await dbService.getChatHistory(myJid, sender, CUSTOMER_DB_HISTORY_LIMIT) : [];
    const dbHistory = [...legacyHistory, ...ownerHistory].slice(-CUSTOMER_DB_HISTORY_LIMIT);
    const existingMsgIds = new Set(historyTemp.map((m: any) => m.key?.id).filter(Boolean));
    const prependedAiMessages: any[] = [];
    
    for (const dm of dbHistory) {
        const role = normalizeGeminiHistoryRole(dm.role);
        if (!existingMsgIds.has(dm.messageId) && dm.text && role) {
            prependedAiMessages.push({
                role,
                parts: [{ text: dm.text }]
            });
        }
    }

    const sequenceDecisionHistory = [
        ...buildSequenceHistoryFromDb(dbHistory, sender),
        ...historyArray,
    ];
    const aiMessages: any[] = [...prependedAiMessages];
    let lastUserMsgText = "";
    let lastUserMsgIsVoice = false;
    let lastUserMsgHasImage = false;
    let lastUserMsgIsSticker = false;
    let lastUserMsgId = "";
    let lastUserMsgTimestampSeconds = 0;
    let lastUserVoiceUnreadable = false;
    let lastUserMsgPushName = "";
    let lastQuotedReplyContext: any = null;
    const lastUserHistoryIndex = (() => {
        for (let index = historyTemp.length - 1; index >= 0; index -= 1) {
            const messageId = String(historyTemp[index]?.key?.id || "");
            if (historyTemp[index]?.key?.fromMe) continue;
            if (pendingBatchMessageIds.size > 0 && !pendingBatchMessageIds.has(messageId)) continue;
            return index;
        }
        return -1;
    })();
    let latestUserImageContextInput: { imageBuffer: Buffer; mimeType: string; caption?: string } | null = null;
    let latestUserAudioContextInput: { audioBuffer: Buffer; mimeType: string; caption?: string; transcript?: string } | null = null;
    const batchImageInputs = new Map<string, { imageBuffer: Buffer; mimeType: string; caption?: string }>();
    const batchAudioInputs = new Map<string, { audioBuffer: Buffer; mimeType: string; caption?: string; transcript?: string }>();

    for (let index = 0; index < historyTemp.length; index += 1) {
        const m = historyTemp[index];
        const messageId = String(m?.key?.id || "");
        const role = m.key.fromMe ? "model" : "user";
        let rawText = m.message?.conversation || m.message?.extendedTextMessage?.text || (m.key?.fromMe ? "AI" : "");
        const parts: any[] = [];
        let audioDownloadFailed = false;

        if (m.message?.audioMessage) {
            try {
                const buffer = await downloadWhatsAppMediaBuffer(m.message.audioMessage, 'audio', mediaFetchAgent);
                const normalizedAudioMime = normalizeGeminiAudioMimeType(m.message.audioMessage.mimetype || "audio/ogg");
                console.info(`audio_downloaded bytes=${buffer.length} mime=${normalizedAudioMime} duration=${Number((m.message.audioMessage as any)?.seconds || 0) > 0 ? Number((m.message.audioMessage as any)?.seconds) : "unknown"}`);
                const transcriptText = [
                    (m.message.audioMessage as any).transcript,
                    (m.message.audioMessage as any).text,
                    (m.message.audioMessage as any).caption,
                ].find(isUsableVoiceTranscript) || "";
                parts.push({
                    inlineData: {
                        mimeType: normalizedAudioMime,
                        data: buffer.toString("base64")
                    }
                });
                rawText = rawText || buildVoiceNoteHistoryText({
                    transcript: transcriptText,
                    fallbackUnavailableText: "[Voice note received, transcript unavailable]",
                });
                if (role === "user" && index === lastUserHistoryIndex) {
                    latestUserAudioContextInput = {
                        audioBuffer: buffer,
                        mimeType: normalizedAudioMime,
                        caption: (m.message.audioMessage as any).caption,
                        transcript: transcriptText,
                    };
                }
                if (role === "user" && pendingBatchMessageIds.has(messageId)) {
                    batchAudioInputs.set(messageId, {
                        audioBuffer: buffer,
                        mimeType: normalizedAudioMime,
                        caption: (m.message.audioMessage as any).caption,
                        transcript: transcriptText,
                    });
                }
            } catch (e) {
                console.error("Audio download failed", e);
                io?.emit("system-log", { type: "warning", msg: `voice transcription failed for ${sender.split("@")[0]}.` });
                rawText = rawText || "[Voice note received, transcript unavailable]";
                audioDownloadFailed = true;
            }
        }

        if (m.message?.imageMessage) {
            try {
                const buffer = await downloadWhatsAppMediaBuffer(m.message.imageMessage, 'image', mediaFetchAgent);
                parts.push({
                    inlineData: {
                        mimeType: m.message.imageMessage.mimetype || "image/jpeg",
                        data: buffer.toString("base64")
                    }
                });
                if (role === "user") {
                    latestUserImageContextInput = {
                        imageBuffer: buffer,
                        mimeType: m.message.imageMessage.mimetype || "image/jpeg",
                        caption: m.message.imageMessage.caption || rawText || "",
                    };
                }
                if (role === "user" && pendingBatchMessageIds.has(messageId)) {
                    batchImageInputs.set(messageId, {
                        imageBuffer: buffer,
                        mimeType: m.message.imageMessage.mimetype || "image/jpeg",
                        caption: m.message.imageMessage.caption || rawText || "",
                    });
                }
                rawText = rawText || (m.message.imageMessage.caption ? `[Image]: ${m.message.imageMessage.caption}` : "[Image Message]");
            } catch (e) {
                console.error("Image download failed", e);
                rawText = rawText || "[Unreadable Image Metadata]";
            }
        }

        if (m.message?.stickerMessage) {
            rawText = rawText || "[Sticker Message]";
        }

        const quotedMessage = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (quotedMessage) {
             const quotedText = quotedMessage.conversation || quotedMessage.extendedTextMessage?.text || "";
             const quotedImage = !!quotedMessage.imageMessage;
             const quotedAudio = !!quotedMessage.audioMessage;
             
             let contextPrefix = "";
             if (quotedText) contextPrefix = `[Replying to: "${quotedText}"]`;
             else if (quotedImage) contextPrefix = `[Replying to an IMAGE]`;
             else if (quotedAudio) contextPrefix = `[Replying to a VOICE MESSAGE]`;

             if (contextPrefix) {
                 rawText = `${contextPrefix}\n${rawText}`;
             }
        }

        if (role === "user") {
            const quotedContext = extractQuotedReplyContext(rawText);
            rawText = extractCustomerAnswerFromQuotedMessage(rawText);
            if (quotedContext.quotedField && index === lastUserHistoryIndex) {
                lastQuotedReplyContext = quotedContext;
                parts.push({ text: `[Quoted reply context] field=${quotedContext.quotedField}; answer=${quotedContext.customerAnswer}` });
            }
        }

        if (!rawText.trim() && m.key?.fromMe) rawText = "AI";

        if (rawText && rawText.trim()) {
            parts.push({ text: rawText.trim() });
        }

        // Validate parts before pushing to avoid AI crashes
        const validParts = parts.filter(p => (p.text && p.text.trim() !== '') || p.inlineData);
        if (validParts.length > 0) {
            aiMessages.push({ role, parts: validParts });
        }

        if (role === "user") {
            lastUserMsgText = rawText;
            lastUserMsgIsVoice = !!m.message?.audioMessage;
            lastUserMsgHasImage = !!m.message?.imageMessage;
            lastUserMsgIsSticker = !!m.message?.stickerMessage;
            lastUserMsgId = String(m.key?.id || "");
            lastUserMsgTimestampSeconds = getWhatsappMessageTimestampSeconds(m);
            lastUserVoiceUnreadable = lastUserMsgIsVoice && audioDownloadFailed;
            lastUserMsgPushName = String((m as any)?.pushName || "");
        }
    }

    customerTurnId = lastUserMsgId || `turn_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    if (aiMessages.length === 0) return false;
    
    const lowerText = lastUserMsgText.toLowerCase().trim();
    const latestImageUnderstandingRequired = Boolean(
        lastUserMsgHasImage || (
            latestUserImageContextInput && (
                /\[replying to an image\]/i.test(lastUserMsgText) ||
                /\bwhat is this\b|\bwhat is in this\b|ye kya hai|iska matlab kya hai/i.test(lowerText)
            )
        )
    );
    const latestAudioUnderstandingRequired = Boolean(
        latestUserAudioContextInput && (
            lastUserMsgIsVoice ||
            /\[replying to a voice message\]/i.test(lastUserMsgText)
        )
    );
    const profile = await dbService.getCustomerProfile(dataOwnerKey, sender) || await dbService.getCustomerProfile(myJid, sender);
    if (profile && dataOwnerKey !== myJid) {
        dbService.updateCustomerProfile(dataOwnerKey, sender, profile).catch(() => {});
    }

    // Live AI-First Customer360 semantic understanding: extract facts early so reply uses fresh context
    if (lastUserMsgText) {
        try {
            const { extractAndMergeCustomer360Async } = await import("./customer-360-extraction-service.ts");
            const c360Result = await extractAndMergeCustomer360Async({
                botJid: dataOwnerKey,
                customerJid: sender,
                messageText: lastUserMsgText,
                role: "user",
                messageId: lastUserMsgId,
                senderName: lastUserMsgPushName || profile?.pushName || profile?.customerName,
                existingProfile: profile,
                customerTurnId,
                providerCallId: `c360_${customerTurnId}`,
            });
            if (c360Result && c360Result.hasChanges) {
                if (profile) {
                    profile.customer360 = c360Result.customer360;
                    Object.assign(profile, c360Result.topLevelPatches);
                }
                dbService.updateCustomerProfile(dataOwnerKey, sender, {
                    customer360: c360Result.customer360,
                    ...c360Result.topLevelPatches,
                }).catch(() => {});
            }
        } catch (c360Err: any) {
            console.error("[Customer360] Live turn extraction error:", c360Err?.message || c360Err);
        }
    }
    const clientGeminiStatusForBilling = userId ? await getClientGeminiStatus(userId).catch(() => null) : null;
    const skipPlatformAiUsageCharges = Boolean(clientGeminiStatusForBilling?.enabled);
    let imageContextPatch: any = null;
    const languagePreference = resolveCustomerReplyLanguage({
        profile: profile || {},
        preferredLanguage: userConfig?.preferredLanguage || userConfig?.preferred_language || userConfig?.selectedBotLanguage,
        latestText: lastUserMsgText,
    });
    if (languagePreference.patch) {
        dbService.updateCustomerProfile(dataOwnerKey, sender, languagePreference.patch).catch((e: any) => {
            console.error("[Language] Failed saving customer language preference:", e?.message || e);
        });
    }
    console.log(`[Language] Reply language for ${sender}: ${languagePreference.language} (preferred=${languagePreference.preferredLanguage}, detected=${languagePreference.actualLanguage || "unknown"}, changed=${languagePreference.changed})`);
    const personaPreference = resolveCustomerPersonaVoicePreference({
        profile: { ...(profile || {}), ...(languagePreference.patch || {}) },
        userConfig,
        latestText: lastUserMsgText,
    });
    if (personaPreference.patch) {
        dbService.updateCustomerProfile(dataOwnerKey, sender, personaPreference.patch).catch((e: any) => {
            console.error("[Persona] Failed saving customer persona/voice preference:", e?.message || e);
        });
    }
    const effectiveProfile = {
        ...(profile || {}),
        ...(imageContextPatch || {}),
        ...(languagePreference.patch || {}),
        ...(personaPreference.patch || {}),
    };

    // Customer Phone Recovery Continuation for Lead Routing
    const pendingLeadContinuation = await checkAndContinueCustomerLeadRouting({
        accountId: userId || dataOwnerKey,
        botId: dataOwnerKey,
        customerJid: sender,
        messageText: lastUserMsgText,
        profile: effectiveProfile,
        customerLanguage: languagePreference.language,
        countryContext: { defaultCountryCode: userConfig?.countryCode || userConfig?.country },
        sock,
        io,
    });
    if (pendingLeadContinuation.handled && pendingLeadContinuation.replyText) {
        await sendAiTextMessage({
            sock,
            sender,
            text: pendingLeadContinuation.replyText,
            userConfig,
            userId,
            dataOwnerKey,
            eventId: `lead_cont_${Date.now()}`,
            contextType: "lead_routing_continuation",
            skipPlatformAiUsageCharges,
        });
        return true;
    }
    const safeModeMediaCacheEnabled = isSafeModeDurableMediaContextCacheEnabled();
    const safeModeMediaFailureFallbackEnabled = isSafeModeMediaFailureTextFallbackEnabled();
    let latestImageUnderstanding: MediaUnderstandingResult | null = null;
    let latestAudioUnderstanding: MediaUnderstandingResult | null = null;
    let rememberedMediaUnderstanding: MediaUnderstandingResult | null = null;
    let latestImageReplyContextText = "";
    let latestAudioReplyContextText = "";
    let rememberedMediaReplyContextText = "";
    let batchHandledLatestImage = false;
    let batchHandledLatestAudio = false;
    let batchContextText = "";
    let batchReplyGuidance = "";
    const hallucinationGuard = detectBotIntroducedTermContext(historyTemp);
    const recentBotTermContext = findRecentBotIntroducedTerm(historyTemp);
    const latestMediaPriorityCandidate = lastUserMsgHasImage || lastUserMsgIsVoice || Boolean(latestUserImageContextInput) || Boolean(latestUserAudioContextInput);

    for (const ignored of pendingBatch.ignored) {
        io?.emit("system-log", { type: "info", msg: `internal_placeholder_ignored_as_customer_message reason=${ignored.reason}` });
    }
    if (hallucinationGuard?.term) {
        io?.emit("system-log", { type: "info", msg: `bot_introduced_term_detected term=${hallucinationGuard.term} source=bot_message` });
        io?.emit("system-log", { type: "info", msg: `customer_asked_about_bot_message term=${hallucinationGuard.term}` });
        io?.emit("system-log", { type: "info", msg: `bot_hallucination_guard_applied term=${hallucinationGuard.term} reason=latest_message_asks_about_bot_term` });
        io?.emit("system-log", { type: "info", msg: `bot_hallucination_context_suppressed term=${hallucinationGuard.term}` });
        io?.emit("system-log", { type: "info", msg: `bot_introduced_term_not_saved_as_customer_intent term=${hallucinationGuard.term}` });
    } else if (recentBotTermContext?.term) {
        io?.emit("system-log", { type: "info", msg: `bot_hallucination_guard_skipped term=${recentBotTermContext.term} reason=latest_message_unrelated` });
        io?.emit("system-log", { type: "info", msg: `bot_introduced_term_not_saved_as_customer_intent term=${recentBotTermContext.term}` });
    }

    if (pendingBatch.messages.length > 1) {
        const batchEntries: CustomerBatchContextEntry[] = [];
        for (const batchMessage of pendingBatch.messages) {
            const batchMessageId = String(batchMessage?.key?.id || "");
            const kind = classifyInboundMessageKind(batchMessage);
            const readable = getReadableMessageContent(batchMessage?.message);
            if (kind === "text") {
                batchEntries.push({ kind: "text", messageId: batchMessageId, latest: batchMessageId === lastUserMsgId, text: readable.text });
                continue;
            }
            if (kind === "image") {
                const imageInput = batchImageInputs.get(batchMessageId);
                if (batchMessageId === lastUserMsgId) {
                    io?.emit("system-log", { type: "info", msg: `latest_image_prioritized messageId=${batchMessageId.slice(0, 24)}` });
                }
                if (!imageInput) {
                    batchEntries.push({
                        kind: "image",
                        messageId: batchMessageId,
                        latest: batchMessageId === lastUserMsgId,
                        unclear: true,
                        failureReason: "missing_image_buffer",
                    });
                    continue;
                }
                const latestCustomerText = readable.text || lastUserMsgText;
                const savedImage = safeModeMediaCacheEnabled
                    ? await getSavedDurableMediaResult({
                        botId: dataOwnerKey,
                        customerJid: sender,
                        messageId: batchMessageId || `image:${Date.now()}`,
                        type: "image",
                        purpose: "customer_ai_image_understanding",
                        mediaBuffer: imageInput.imageBuffer,
                        sourceMime: imageInput.mimeType || "image/jpeg",
                        normalizedMime: imageInput.mimeType || "image/jpeg",
                        latestCustomerText,
                        caption: imageInput.caption,
                    })
                    : { result: null, mediaHash: "", payloadFingerprint: "", configFingerprint: "" };
                let imageUnderstanding = savedImage.result;
                if (imageUnderstanding) {
                    io?.emit("system-log", { type: "info", msg: `media_understanding_cache_hit type=image messageId=${batchMessageId.slice(0, 24)} useful=${imageUnderstanding.useful} source=durable` });
                } else {
                    imageUnderstanding = await understandLatestCustomerImage({
                        ...imageInput,
                        latestCustomerText,
                        providerContext: {
                            userId,
                            accountId: userId,
                            dataOwnerKey,
                            botId: dataOwnerKey,
                            purpose: "customer_ai_image_understanding",
                            billingContext: {
                                customerJid: sender,
                                eventId: batchMessageId || `image:${Date.now()}`,
                                messageId: batchMessageId || `image:${Date.now()}`,
                            },
                        },
                    });
                    if (safeModeMediaCacheEnabled) {
                        await saveDurableMediaResult({
                            type: "image",
                            botId: dataOwnerKey,
                            customerJid: sender,
                            messageId: batchMessageId || `image:${Date.now()}`,
                            purpose: "customer_ai_image_understanding",
                            mediaHash: savedImage.mediaHash,
                            payloadFingerprint: savedImage.payloadFingerprint,
                            configFingerprint: savedImage.configFingerprint,
                            sourceMime: imageInput.mimeType || "image/jpeg",
                            normalizedMime: imageInput.mimeType || "image/jpeg",
                            result: imageUnderstanding,
                        });
                        io?.emit("system-log", { type: "info", msg: `media_understanding_saved type=image messageId=${batchMessageId.slice(0, 24)} useful=${imageUnderstanding.useful} source=durable` });
                    }
                }
                if (imageUnderstanding.useful) {
                    if (!savedImage.result) {
                        await chargeCustomerMediaUnderstanding({
                            userId,
                            botId: dataOwnerKey,
                            customerJid: sender,
                            eventId: batchMessageId || `image:${Date.now()}`,
                            kind: "image",
                            provider: imageUnderstanding.provider,
                            usedProvider: imageUnderstanding.usedProvider,
                            skipPlatformAiUsageCharges,
                        });
                    }
                    batchEntries.push({
                        kind: "image",
                        messageId: batchMessageId,
                        latest: batchMessageId === lastUserMsgId,
                        usefulContext: imageUnderstanding.contextText,
                    });
                    if (batchMessageId === lastUserMsgId) {
                        latestImageUnderstanding = imageUnderstanding;
                        latestImageReplyContextText = buildMediaReplyContextAttachment(imageUnderstanding);
                        batchHandledLatestImage = true;
                    }
                } else {
                    batchEntries.push({
                        kind: "image",
                        messageId: batchMessageId,
                        latest: batchMessageId === lastUserMsgId,
                        unclear: true,
                        failureReason: String(imageUnderstanding.reason || "image_unreadable"),
                    });
                    if (batchMessageId === lastUserMsgId) {
                        latestImageUnderstanding = imageUnderstanding;
                        batchHandledLatestImage = true;
                        io?.emit("system-log", { type: "warning", msg: `image_unreadable_acknowledged messageId=${batchMessageId.slice(0, 24)}` });
                    }
                }
                continue;
            }
            if (kind === "audio") {
                const audioInput = batchAudioInputs.get(batchMessageId);
                if (!audioInput) {
                    batchEntries.push({
                        kind: "audio",
                        messageId: batchMessageId,
                        latest: batchMessageId === lastUserMsgId,
                        unclear: true,
                        failureReason: "missing_audio_buffer",
                    });
                    continue;
                }
                const normalizedAudioMime = normalizeGeminiAudioMimeType(audioInput.mimeType || "audio/ogg");
                const latestCustomerText = readable.text || lastUserMsgText;
                const savedAudio = safeModeMediaCacheEnabled
                    ? await getSavedDurableMediaResult({
                        botId: dataOwnerKey,
                        customerJid: sender,
                        messageId: batchMessageId || `audio:${Date.now()}`,
                        type: "audio",
                        purpose: "customer_ai_audio_understanding",
                        mediaBuffer: audioInput.audioBuffer,
                        sourceMime: audioInput.mimeType || "audio/ogg",
                        normalizedMime: normalizedAudioMime,
                        latestCustomerText,
                        caption: audioInput.caption,
                        transcript: audioInput.transcript,
                    })
                    : { result: null, mediaHash: "", payloadFingerprint: "", configFingerprint: "" };
                let audioUnderstanding = savedAudio.result;
                if (audioUnderstanding) {
                    io?.emit("system-log", { type: "info", msg: `media_understanding_cache_hit type=audio messageId=${batchMessageId.slice(0, 24)} useful=${audioUnderstanding.useful} source=durable` });
                } else {
                    audioUnderstanding = await understandLatestCustomerAudio({
                        ...audioInput,
                        latestCustomerText,
                        providerContext: {
                            userId,
                            accountId: userId,
                            dataOwnerKey,
                            botId: dataOwnerKey,
                            purpose: "customer_ai_audio_understanding",
                            billingContext: {
                                customerJid: sender,
                                eventId: batchMessageId || `audio:${Date.now()}`,
                                messageId: batchMessageId || `audio:${Date.now()}`,
                            },
                        },
                    });
                    if (safeModeMediaCacheEnabled) {
                        await saveDurableMediaResult({
                            type: "audio",
                            botId: dataOwnerKey,
                            customerJid: sender,
                            messageId: batchMessageId || `audio:${Date.now()}`,
                            purpose: "customer_ai_audio_understanding",
                            mediaHash: savedAudio.mediaHash,
                            payloadFingerprint: savedAudio.payloadFingerprint,
                            configFingerprint: savedAudio.configFingerprint,
                            sourceMime: audioInput.mimeType || "audio/ogg",
                            normalizedMime: normalizedAudioMime,
                            result: audioUnderstanding,
                        });
                        io?.emit("system-log", { type: "info", msg: `media_understanding_saved type=audio messageId=${batchMessageId.slice(0, 24)} useful=${audioUnderstanding.useful} source=durable` });
                    }
                }
                if (audioUnderstanding.useful) {
                    if (!savedAudio.result) {
                        await chargeCustomerMediaUnderstanding({
                            userId,
                            botId: dataOwnerKey,
                            customerJid: sender,
                            eventId: batchMessageId || `audio:${Date.now()}`,
                            kind: "audio",
                            provider: audioUnderstanding.provider,
                            usedProvider: audioUnderstanding.usedProvider,
                            skipPlatformAiUsageCharges,
                        });
                    }
                    batchEntries.push({
                        kind: "audio",
                        messageId: batchMessageId,
                        latest: batchMessageId === lastUserMsgId,
                        usefulContext: audioUnderstanding.transcriptText || audioUnderstanding.contextText,
                    });
                    if (batchMessageId === lastUserMsgId) {
                        latestAudioUnderstanding = audioUnderstanding;
                        latestAudioReplyContextText = buildMediaReplyContextAttachment(audioUnderstanding);
                        batchHandledLatestAudio = true;
                        if (audioUnderstanding.transcriptText) lastUserMsgText = audioUnderstanding.transcriptText;
                    }
                } else {
                    batchEntries.push({
                        kind: "audio",
                        messageId: batchMessageId,
                        latest: batchMessageId === lastUserMsgId,
                        unclear: true,
                        failureReason: String(audioUnderstanding.reason || "audio_unreadable"),
                    });
                    if (batchMessageId === lastUserMsgId) {
                        latestAudioUnderstanding = audioUnderstanding;
                        batchHandledLatestAudio = true;
                    }
                }
                continue;
            }
            if (kind === "video" || kind === "document" || kind === "sticker") {
                batchEntries.push({ kind, messageId: batchMessageId, latest: batchMessageId === lastUserMsgId, text: readable.text || `${kind} received` });
            }
        }
        batchContextText = buildCustomerBatchContext(batchEntries);
        batchReplyGuidance = buildBatchReplyGuidance(batchEntries);
    }

    if (latestImageUnderstandingRequired && !batchHandledLatestImage) {
        let latestImageSavedMeta = { result: null as MediaUnderstandingResult | null, mediaHash: "", payloadFingerprint: "", configFingerprint: "" };
        if (latestUserImageContextInput) {
            latestImageSavedMeta = safeModeMediaCacheEnabled
                ? await getSavedDurableMediaResult({
                    botId: dataOwnerKey,
                    customerJid: sender,
                    messageId: lastUserMsgId || `image:${Date.now()}`,
                    type: "image",
                    purpose: "customer_ai_image_understanding",
                    mediaBuffer: latestUserImageContextInput.imageBuffer,
                    sourceMime: latestUserImageContextInput.mimeType || "image/jpeg",
                    normalizedMime: latestUserImageContextInput.mimeType || "image/jpeg",
                    latestCustomerText: lastUserMsgText,
                    caption: latestUserImageContextInput.caption,
                })
                : latestImageSavedMeta;
            latestImageUnderstanding = latestImageSavedMeta.result;
            if (latestImageUnderstanding) {
                io?.emit("system-log", { type: "info", msg: `media_understanding_cache_hit type=image messageId=${lastUserMsgId.slice(0, 24)} useful=${latestImageUnderstanding.useful} source=durable` });
            } else {
                latestImageUnderstanding = await understandLatestCustomerImage({
                    ...latestUserImageContextInput,
                    latestCustomerText: lastUserMsgText,
                    providerContext: {
                        userId,
                        accountId: userId,
                        dataOwnerKey,
                        botId: dataOwnerKey,
                        purpose: "customer_ai_image_understanding",
                        billingContext: {
                            customerJid: sender,
                            eventId: lastUserMsgId || `image:${Date.now()}`,
                            messageId: lastUserMsgId || `image:${Date.now()}`,
                        },
                    },
                });
                if (safeModeMediaCacheEnabled) {
                    await saveDurableMediaResult({
                        type: "image",
                        botId: dataOwnerKey,
                        customerJid: sender,
                        messageId: lastUserMsgId || `image:${Date.now()}`,
                        purpose: "customer_ai_image_understanding",
                        mediaHash: latestImageSavedMeta.mediaHash,
                        payloadFingerprint: latestImageSavedMeta.payloadFingerprint,
                        configFingerprint: latestImageSavedMeta.configFingerprint,
                        sourceMime: latestUserImageContextInput.mimeType || "image/jpeg",
                        normalizedMime: latestUserImageContextInput.mimeType || "image/jpeg",
                        result: latestImageUnderstanding,
                    });
                    io?.emit("system-log", { type: "info", msg: `media_understanding_saved type=image messageId=${lastUserMsgId.slice(0, 24)} useful=${latestImageUnderstanding.useful} source=durable` });
                }
            }
        }
        if (!latestImageUnderstanding?.useful) {
            const reason = String(latestImageUnderstanding?.reason || "missing_image_buffer");
            await updateMediaUnderstandingProfileState({
                dataOwnerKey,
                sender,
                eventId: lastUserMsgId,
                kind: "image",
                profile,
                result: latestImageUnderstanding,
                reason,
            });
            if (safeModeMediaFailureFallbackEnabled) {
                const fallbackText = buildSafeModeMediaFallbackText({
                    kind: "image",
                    language: languagePreference.language,
                });
                io?.emit("system-log", { type: "warning", msg: `media_understanding_fallback_sent type=image reason=${reason}` });
                await sendAiTextMessage({
                    sock,
                    sender,
                    text: fallbackText,
                    userConfig,
                    userId,
                    dataOwnerKey,
                    eventId: lastUserMsgId || `image-fallback:${Date.now()}`,
                    contextType: "ai_media_fallback",
                    skipPlatformAiUsageCharges,
                });
                return true;
            }
            io?.emit("system-log", { type: "warning", msg: `image_understanding_retry_scheduled reason=${reason}` });
            console.info(`image_understanding_retry_scheduled reason=${reason}`);
            throw createAiReplyRetryableError("Latest customer image must be understood before reply.", reason, {
                phase: "media_understanding",
                mediaKind: "image",
            });
        }
        latestImageReplyContextText = buildMediaReplyContextAttachment(latestImageUnderstanding);
        if (latestImageReplyContextText) {
            io?.emit("system-log", { type: "info", msg: `image_context_attached_to_deepinfra_reply useful=true chars=${latestImageReplyContextText.length}` });
        }
        await updateMediaUnderstandingProfileState({
            dataOwnerKey,
            sender,
            eventId: lastUserMsgId,
            kind: "image",
            profile,
            result: latestImageUnderstanding,
        });
        if (!latestImageSavedMeta.result) {
            await chargeCustomerMediaUnderstanding({
                userId,
                botId: dataOwnerKey,
                customerJid: sender,
                eventId: lastUserMsgId || `image:${Date.now()}`,
                kind: "image",
                provider: latestImageUnderstanding.provider,
                usedProvider: latestImageUnderstanding.usedProvider,
                skipPlatformAiUsageCharges,
            });
        }
    }

    if (latestUserImageContextInput && latestImageUnderstanding?.useful) {
        const extractorDecision = decideImageOrderExtractor({
            latestCustomerText: lastUserMsgText,
            caption: latestUserImageContextInput.caption,
            detectedType: latestImageUnderstanding.detectedType,
            contextText: latestImageUnderstanding.contextText,
            containsCustomerOrderData: latestImageUnderstanding.containsCustomerOrderData,
        });
        if (extractorDecision.allow) {
            io?.emit("system-log", { type: "info", msg: `image_order_extractor_allowed reason=${extractorDecision.reason}` });
            imageContextPatch = await extractCustomerImageContext({
                ...latestUserImageContextInput,
                profile: profile || {},
                io,
                providerContext: {
                    userId,
                    accountId: userId,
                    dataOwnerKey,
                    botId: dataOwnerKey,
                    purpose: "customer_image_context",
                    billingContext: {
                        customerJid: sender,
                        eventId: lastUserMsgId || `image-context:${Date.now()}`,
                        messageId: lastUserMsgId || `image-context:${Date.now()}`,
                    },
                },
            }).catch((e: any) => {
                console.error("[ImageContext] Failed extracting customer image context:", e?.message || e);
                return null;
            });
            if (imageContextPatch && Object.keys(imageContextPatch).length > 0) {
                Object.assign(effectiveProfile, imageContextPatch);
                dbService.updateCustomerProfile(dataOwnerKey, sender, imageContextPatch).catch((e: any) => {
                    console.error("[ImageContext] Failed saving customer image context:", e?.message || e);
                });
                io?.emit("system-log", { type: "info", msg: `Saved possible customer details from image/card for ${sender.split("@")[0]}.` });
            }
        } else {
            io?.emit("system-log", { type: "info", msg: `image_order_extractor_skipped reason=${extractorDecision.reason}` });
        }
    }

    if ((lastUserMsgIsVoice || latestAudioUnderstandingRequired) && !batchHandledLatestAudio) {
        let latestAudioSavedMeta = { result: null as MediaUnderstandingResult | null, mediaHash: "", payloadFingerprint: "", configFingerprint: "" };
        if (lastUserVoiceUnreadable) {
            await dbService.updateCustomerProfile(dataOwnerKey, sender, {
                lastVoiceTranscriptionFailedMessageId: lastUserMsgId,
                lastVoiceTranscriptionFailedAt: Math.floor(Date.now() / 1000),
            }).catch(() => {});
        }
        const latestAudioNormalizedMime = normalizeGeminiAudioMimeType(latestUserAudioContextInput?.mimeType || "audio/ogg");
        if (latestUserAudioContextInput?.audioBuffer?.length) {
            latestAudioSavedMeta = safeModeMediaCacheEnabled
                ? await getSavedDurableMediaResult({
                    botId: dataOwnerKey,
                    customerJid: sender,
                    messageId: lastUserMsgId || `audio:${Date.now()}`,
                    type: "audio",
                    purpose: "customer_ai_audio_understanding",
                    mediaBuffer: latestUserAudioContextInput.audioBuffer,
                    sourceMime: latestUserAudioContextInput.mimeType || "audio/ogg",
                    normalizedMime: latestAudioNormalizedMime,
                    latestCustomerText: lastUserMsgText,
                    caption: latestUserAudioContextInput.caption,
                    transcript: latestUserAudioContextInput.transcript,
                })
                : latestAudioSavedMeta;
        }
        latestAudioUnderstanding = latestAudioSavedMeta.result;
        if (latestAudioUnderstanding) {
            io?.emit("system-log", { type: "info", msg: `media_understanding_cache_hit type=audio messageId=${lastUserMsgId.slice(0, 24)} useful=${latestAudioUnderstanding.useful} source=durable` });
        } else {
            latestAudioUnderstanding = await understandLatestCustomerAudio({
                audioBuffer: latestUserAudioContextInput?.audioBuffer,
                mimeType: latestUserAudioContextInput?.mimeType,
                caption: latestUserAudioContextInput?.caption,
                transcript: latestUserAudioContextInput?.transcript,
                latestCustomerText: lastUserMsgText,
                providerContext: {
                    userId,
                    accountId: userId,
                    dataOwnerKey,
                    botId: dataOwnerKey,
                    purpose: "customer_ai_audio_understanding",
                    billingContext: {
                        customerJid: sender,
                        eventId: lastUserMsgId || `audio:${Date.now()}`,
                        messageId: lastUserMsgId || `audio:${Date.now()}`,
                    },
                },
            });
            if (safeModeMediaCacheEnabled && latestUserAudioContextInput?.audioBuffer?.length) {
                await saveDurableMediaResult({
                    type: "audio",
                    botId: dataOwnerKey,
                    customerJid: sender,
                    messageId: lastUserMsgId || `audio:${Date.now()}`,
                    purpose: "customer_ai_audio_understanding",
                    mediaHash: latestAudioSavedMeta.mediaHash,
                    payloadFingerprint: latestAudioSavedMeta.payloadFingerprint,
                    configFingerprint: latestAudioSavedMeta.configFingerprint,
                    sourceMime: latestUserAudioContextInput.mimeType || "audio/ogg",
                    normalizedMime: latestAudioNormalizedMime,
                    result: latestAudioUnderstanding,
                });
                io?.emit("system-log", { type: "info", msg: `media_understanding_saved type=audio messageId=${lastUserMsgId.slice(0, 24)} useful=${latestAudioUnderstanding.useful} source=durable` });
            }
        }
        if (!latestAudioUnderstanding.useful) {
            const reason = String(latestAudioUnderstanding.reason || "missing_audio_buffer");
            await updateMediaUnderstandingProfileState({
                dataOwnerKey,
                sender,
                eventId: lastUserMsgId,
                kind: "audio",
                profile,
                result: latestAudioUnderstanding,
                reason,
            });
            if (safeModeMediaFailureFallbackEnabled) {
                const fallbackText = buildSafeModeMediaFallbackText({
                    kind: "audio",
                    language: languagePreference.language,
                });
                io?.emit("system-log", { type: "warning", msg: `media_understanding_fallback_sent type=audio reason=${reason}` });
                await sendAiTextMessage({
                    sock,
                    sender,
                    text: fallbackText,
                    userConfig,
                    userId,
                    dataOwnerKey,
                    eventId: lastUserMsgId || `audio-fallback:${Date.now()}`,
                    contextType: "ai_media_fallback",
                    skipPlatformAiUsageCharges,
                });
                return true;
            }
            io?.emit("system-log", { type: "warning", msg: `audio_understanding_retry_scheduled reason=${reason}` });
            console.info(`audio_understanding_retry_scheduled reason=${reason}`);
            throw createAiReplyRetryableError("Latest customer audio must be understood before reply.", reason, {
                phase: "media_understanding",
                mediaKind: "audio",
            });
        }
        latestAudioReplyContextText = buildMediaReplyContextAttachment(latestAudioUnderstanding);
        if (latestAudioReplyContextText) {
            io?.emit("system-log", { type: "info", msg: `audio_context_attached_to_deepinfra_reply useful=true chars=${latestAudioReplyContextText.length}` });
        }
        await updateMediaUnderstandingProfileState({
            dataOwnerKey,
            sender,
            eventId: lastUserMsgId,
            kind: "audio",
            profile,
            result: latestAudioUnderstanding,
        });
        if (!latestAudioSavedMeta.result) {
            await chargeCustomerMediaUnderstanding({
                userId,
                botId: dataOwnerKey,
                customerJid: sender,
                eventId: lastUserMsgId || `audio:${Date.now()}`,
                kind: "audio",
                provider: latestAudioUnderstanding.provider,
                usedProvider: latestAudioUnderstanding.usedProvider,
                skipPlatformAiUsageCharges,
            });
        }
        if (latestAudioUnderstanding.transcriptText) {
            lastUserMsgText = latestAudioUnderstanding.transcriptText;
        }
    }
    const latestMediaPriorityType = lastUserMsgHasImage
        ? "image"
        : lastUserMsgIsVoice
            ? "audio"
            : "";
    const latestMediaPriorityActive = Boolean(
        (latestMediaPriorityType === "image" && (latestImageReplyContextText || latestUserImageContextInput)) ||
        (latestMediaPriorityType === "audio" && (latestAudioReplyContextText || latestUserAudioContextInput))
    );
    const latestUsefulMediaPriorityActive = Boolean(
        latestMediaPriorityActive
        && (
            (latestMediaPriorityType === "image" && latestImageUnderstanding?.useful && latestImageReplyContextText)
            || (latestMediaPriorityType === "audio" && latestAudioUnderstanding?.useful && latestAudioReplyContextText)
        )
        && (
            lastUserMsgHasImage
            || lastUserMsgIsVoice
            || latestImageReplyContextText
            || latestAudioReplyContextText
        )
    );
    const latestTextIsGenericMediaCheck = latestUsefulMediaPriorityActive && isGenericLatestMediaCheckText(lastUserMsgText);
    const latestMessageReferencesPriorContext = latestUsefulMediaPriorityActive && latestMessageExplicitlyReferencesPriorContext(lastUserMsgText);
    const strictLatestMediaPriorityActive = Boolean(
        latestUsefulMediaPriorityActive
        && latestTextIsGenericMediaCheck
        && !latestMessageReferencesPriorContext
    );
    if (latestMediaPriorityActive && lastUserMsgId) {
        io?.emit("system-log", { type: "info", msg: `latest_media_context_prioritized type=${latestMediaPriorityType} messageId=${lastUserMsgId.slice(0, 24)}` });
        io?.emit("system-log", {
            type: "info",
            msg: `latest_media_reply_focus type=${latestMediaPriorityType} useful=${latestMediaPriorityType === "image" ? Boolean(latestImageUnderstanding?.useful) : Boolean(latestAudioUnderstanding?.useful)}`
        });
        io?.emit("system-log", { type: "info", msg: "old_summary_context_suppressed reason=latest_media_priority" });
        if (strictLatestMediaPriorityActive) {
            io?.emit("system-log", { type: "info", msg: "media_priority_old_context_suppressed=true" });
        }
    }
    if (latestMediaPriorityActive && recentBotTermContext?.term && !recentBotTermContext.latestMessageAsksAboutBotTerm) {
        io?.emit("system-log", { type: "info", msg: "old_bot_hallucination_context_suppressed reason=latest_message_not_about_bot_mistake" });
    }
    const rememberedMediaReferenceActive = Boolean(
        !lastUserMsgHasImage
        && !lastUserMsgIsVoice
        && !latestUserImageContextInput
        && !latestUserAudioContextInput
        && messageReferencesRememberedMedia(lastUserMsgText)
    );
    if (rememberedMediaReferenceActive) {
        const rememberedSavedMedia = await findBestSavedMediaContextForReference({
            botId: dataOwnerKey,
            customerJid: sender,
            latestUserText: lastUserMsgText,
        }).catch(() => null);
        if (rememberedSavedMedia && hasUsefulSavedMediaContext(rememberedSavedMedia)) {
            rememberedMediaUnderstanding = buildMediaUnderstandingResultFromStore(rememberedSavedMedia.type, rememberedSavedMedia);
            rememberedMediaReplyContextText = buildMediaReplyContextAttachment(rememberedMediaUnderstanding);
            if (rememberedMediaReplyContextText) {
                io?.emit("system-log", { type: "info", msg: "media_memory_context_attached source=durable" });
            }
        }
    }
    const deterministicPostOrderReply = (latestImageUnderstandingRequired || lastUserMsgIsVoice || latestAudioUnderstandingRequired)
        ? ""
        : buildPostConfirmationReply({
        latestText: lastUserMsgText,
        profile: effectiveProfile,
        userConfig,
        language: languagePreference.language,
    });
    if (deterministicPostOrderReply) {
        const sentResult = await sendAiTextMessage({
            sock,
            sender,
            text: deterministicPostOrderReply,
            userConfig,
            userId,
            dataOwnerKey,
            eventId: lastUserMsgId || `post-confirmation:${Date.now()}`,
            contextType: "post_confirmation_faq",
            skipPlatformAiUsageCharges,
        });
        await dbService.updateCustomerProfile(dataOwnerKey, sender, {
            lastPostConfirmationQuestion: lastUserMsgText,
            lastPostConfirmationReply: deterministicPostOrderReply,
            lastPostConfirmationAnsweredAt: Math.floor(Date.now() / 1000),
        }).catch(() => {});
        historyArray.push({
            key: { fromMe: true, remoteJid: sender, id: sentResult.messageId },
            message: { conversation: deterministicPostOrderReply },
            messageTimestamp: Math.floor(Date.now() / 1000)
        });
        return true;
    }
    if (lastUserMsgIsSticker) {
        const stickerContext = buildStickerMessageContext({
            profile: effectiveProfile,
            history: aiMessages.map((message: any) => ({
                role: message?.role,
                text: Array.isArray(message?.parts) ? message.parts.map((part: any) => part?.text || "").join(" ").trim() : "",
            })),
        });
        lastUserMsgText = stickerContext.historyText;
        Object.assign(effectiveProfile, { lastStickerSummary: stickerContext.summaryText });
        dbService.updateCustomerProfile(dataOwnerKey, sender, { lastStickerSummary: stickerContext.summaryText }).catch(() => {});
        for (let index = aiMessages.length - 1; index >= 0; index -= 1) {
            if (aiMessages[index]?.role !== "user") continue;
            aiMessages[index].parts = [{ text: stickerContext.historyText }];
            break;
        }
        if (!stickerContext.shouldReply) {
            io?.emit("system-log", { type: "info", msg: `Sticker noted for ${sender.split("@")[0]} without sending an unnecessary reply.` });
            return false;
        }
    }
    const instanceReplyBehavior = userConfig?.replyBehavior || userConfig?.reply_behavior || "text_preferred";
    const requestedReplyPreference = (instanceReplyBehavior === "preference" || instanceReplyBehavior === "text_preferred")
        ? detectCustomerReplyPreference(lastUserMsgText)
        : "";
    const replyPreferencePatch = requestedReplyPreference
        ? buildCustomerReplyPreferencePatch(requestedReplyPreference, effectiveProfile.chatSummary)
        : null;
    if (replyPreferencePatch) {
        Object.assign(effectiveProfile, replyPreferencePatch);
        dbService.updateCustomerProfile(dataOwnerKey, sender, replyPreferencePatch).catch((e: any) => {
            console.error("[ReplyPreference] Failed saving customer reply preference:", e?.message || e);
        });
        io?.emit("system-log", { type: "info", msg: `customer_text_preference_detected preference=${requestedReplyPreference}.` });
    }
    const effectiveVoicePreference = {
        selectedVoice: personaPreference.selectedVoice,
        effectiveGender: personaPreference.voiceGender || getVoiceGender(personaPreference.selectedVoice) || personaPreference.personaGender,
    };
    console.log(`[Persona] Reply persona for ${sender}: persona=${personaPreference.personaGender}, voice=${personaPreference.selectedVoice}/${effectiveVoicePreference.effectiveGender}, changed=${personaPreference.changed}`);
    const irrelevantHandled = await handleIrrelevantCustomer({
        sock,
        userConfig,
        dataOwnerKey,
        sender,
        latestText: lastUserMsgText,
        profile: effectiveProfile,
        language: languagePreference.language,
        io,
    });
    if (irrelevantHandled) {
        io?.emit("system-log", { type: "warning", msg: `Skipped AI reply for ${sender}; manual review is required.` });
        return true;
    }
    const stopState = getCustomerAutoReplyStopState(effectiveProfile || {});
    if (stopState.isStopped) {
        io?.emit("system-log", { type: "info", msg: `Missed reply check skipped because customer auto-reply is paused/stopped. (${stopState.message})` });
        return false;
    }
    const products = userId ? await dbService.listProducts(userId) : [];
    await maybeSaveBackInStockReminder({
        products,
        latestText: lastUserMsgText,
        history: [...dbHistory, ...historyTemp],
        dataOwnerKey,
        customerJid: sender,
        io,
    }).catch((e: any) => {
        console.error("[Stock] Failed checking customer stock reminder intent:", e?.message || e);
    });
    const sequenceBlockReason = getSequenceStatusBlockReason(profile);
    if (sequenceBlockReason) {
        console.log(`[SequenceGuard] New sequences skipped for ${sender}: ${sequenceBlockReason}.`);
    }

    // 3. Security/Sequence Check: Welcome Sequence
    const runtimeWelcome = resolveRuntimeWelcomePayload(botConfig, cachedWelcomeTemplates);
    const welcomeResult = await deliverWelcomeSequence({
        sock,
        customerJid: sender,
        templates: runtimeWelcome?.templates || cachedWelcomeTemplates,
        config: runtimeWelcome?.config || (botConfig?.groups || []).find((g: any) => g?.purpose === "welcome"),
        groupResetAt: runtimeWelcome?.groupResetAt,
        generationId: runtimeWelcome?.generationId,
        historyArray: sequenceDecisionHistory,
        source: "welcome_recovery",
        io,
        userId,
        botId: dataOwnerKey,
        dataOwnerKey,
    });
    if (welcomeResult.success || welcomeResult.skippedDueToClaim || welcomeResult.pending) {
        console.log(`[MissedMsg] Welcome Sequence handled for ${sender}: success=${welcomeResult.success}, completed=${welcomeResult.completed}, reason=${welcomeResult.reason || "ok"}`);
        return true; // We handled it
    }

    // 4. Sequence Check: Keyword Sequences
    if (cachedKeywordSequences && !sequenceBlockReason) {
        const sequenceMatch = findMatchingSequence(cachedKeywordSequences, [lastUserMsgText, lowerText], false);
        if (sequenceMatch?.sequence) {
            const seqName = sequenceMatch.key;
            const seqData = sequenceMatch.sequence;
            const runtimePayload = resolveRuntimeSequencePayloadGroup(botConfig, seqData, seqData.templates || []);
            const result = await deliverSequenceGroup({
                sock,
                customerJid: sender,
                customerDisplayName: profile?.name || sender.split("@")[0],
                sequence: runtimePayload?.sequence || seqData,
                fallbackKey: seqName,
                templates: runtimePayload?.templates || seqData.templates || [],
                groupResetAt: runtimePayload?.groupResetAt,
                generationId: runtimePayload?.generationId,
                source: "keyword_recovery",
                io,
                userId,
                botId: dataOwnerKey,
                dataOwnerKey,
            });
            if (result.success && result.completed) {
                console.log(`[MissedMsg] Safely sent Keyword Sequence '${seqName}' to ${sender}`);
                return true;
            } else if (result.alreadySent) {
                console.log(`[MissedMsg] Sequence '${seqName}' already sent for ${sender}. Continuing normal AI reply.`);
            } else if (result.skippedDueToClaim || result.pending) {
                return true;
            }
        }
    }

    // 5. Normal AI Generation
    const replyBehavior = resolveEffectiveReplyBehavior(instanceReplyBehavior, effectiveProfile);
    const instanceCustomFields = sanitizeConfiguredCustomerFields(Array.isArray(botConfig?.customFields)
        ? botConfig.customFields
        : (Array.isArray(userConfig?.custom_fields) ? userConfig.custom_fields : []));
    const businessFlow = normalizeBusinessFlow(userConfig?.business_type || botConfig?.business_type);
    let activeCustomerRecord = await dbService.findLatestCustomerRecord(dataOwnerKey, sender, effectiveProfile).catch(() => null);
    const structuredDraftState = extractCustomerOrderState({
        profile: effectiveProfile,
        history: getAiTextHistory(aiMessages),
        latestOrder: activeCustomerRecord?.order_data || null,
        configuredFields: instanceCustomFields,
    });
    const earlyDraftRecord = buildIncompleteDraftRecord({
        businessFlow,
        latestText: lastUserMsgText,
        isVoice: lastUserMsgIsVoice,
        hasImage: lastUserMsgHasImage,
        profile: effectiveProfile,
        activeRecord: activeCustomerRecord?.order_data || null,
        structuredState: structuredDraftState,
        configuredFields: instanceCustomFields,
        customerJid: sender,
    });
    if (earlyDraftRecord) {
        try {
            const savedDraft = await dbService.saveOrder(dataOwnerKey, earlyDraftRecord);
            await dbService.updateCustomerProfile(dataOwnerKey, sender, buildDraftProfilePatch(earlyDraftRecord, savedDraft)).catch(() => {});
            activeCustomerRecord = await dbService.findLatestCustomerRecord(dataOwnerKey, sender, effectiveProfile).catch(() => activeCustomerRecord);
            io?.emit("system-log", {
                type: "info",
                msg: `${earlyDraftRecord.recordType === "lead" ? "Lead" : "Order"} draft ${savedDraft?.isNew ? "created" : "updated"} for ${sender.split("@")[0]}.`,
            });
        } catch (draftError: any) {
            console.error("[AI-Draft] Failed saving incomplete record:", draftError?.message || draftError);
        }
    }
    const activeRecordForReplyQuality = activeCustomerRecord?.order_data || earlyDraftRecord || null;
    const normalTextReplyFastPath = !lastUserMsgHasImage && !lastUserMsgIsVoice;
    const deferCrmLeadSync = normalTextReplyFastPath;
    emitReplyTimingLog(io, `normal_text_fast_path=${normalTextReplyFastPath}`);
    const crmLeadRows = deferCrmLeadSync
        ? []
        : await listCrmLeads(dataOwnerKey).catch((error: any) => {
            console.warn("[CRMFirstContext] lead_load_failed", error?.message || error);
            return [];
        });
    const matchingCrmLead = deferCrmLeadSync
        ? null
        : findMatchingCrmLead(crmLeadRows, {
            customerJid: sender,
            profile: effectiveProfile,
            activeRecord: activeRecordForReplyQuality,
        });
    const customerReplyFacts = extractKnownCustomerFacts({
        profile: effectiveProfile,
        activeRecord: activeRecordForReplyQuality,
        structuredState: structuredDraftState,
        crmLead: matchingCrmLead,
        customerJid: sender,
        accountId: userId || dataOwnerKey,
        botId: dataOwnerKey,
        businessType: userConfig?.business_type || botConfig?.business_type,
    });
    const crmFirstContext = buildCrmFirstPromptContext(customerReplyFacts);
    const structuredProfilePatch = buildStructuredLeadProfilePatch({
        facts: customerReplyFacts,
        latestText: lastUserMsgText,
        nowSeconds: Math.floor(Date.now() / 1000),
    });
    await dbService.updateCustomerProfile(dataOwnerKey, sender, structuredProfilePatch).then(() => {
        Object.assign(effectiveProfile, structuredProfilePatch);
    }).catch((error: any) => {
        console.warn("[CRMFirstContext] profile_patch_failed", error?.message || error);
    });
    if (!deferCrmLeadSync) {
        await upsertCrmLead(dataOwnerKey, {
            id: matchingCrmLead?.id,
            botId: dataOwnerKey,
            customerJid: sender,
            phone: customerReplyFacts.phone || sender,
            name: customerReplyFacts.customerName,
            city: customerReplyFacts.cityOrLocation,
            location: customerReplyFacts.cityOrLocation,
            source: customerReplyFacts.source || "WhatsApp",
            status: matchingCrmLead?.status || "AI Replied",
            dealStage: customerReplyFacts.dealStage || matchingCrmLead?.dealStage || "Lead",
            assignedTo: customerReplyFacts.assignedUser,
            productInterest: customerReplyFacts.productOrService,
            budget: customerReplyFacts.budget,
            quantity: customerReplyFacts.quantity,
            notes: [
                customerReplyFacts.recentNotes,
                lastUserMsgText ? `Latest customer message: ${compactAiText(lastUserMsgText, 180)}` : "",
            ].filter(Boolean).join("\n").slice(0, 1200),
            latestActivityAt: Math.floor(Date.now() / 1000),
        }).catch((error: any) => {
            console.warn("[CRMFirstContext] crm_lead_upsert_failed", error?.message || error);
        });
    }
    const replyQualityContextLog = {
        businessFlow: customerReplyFacts.businessFlow,
        hasServiceOrProduct: Boolean(customerReplyFacts.productOrService),
        hasAppointment: Boolean(customerReplyFacts.appointmentDate || customerReplyFacts.appointmentTime),
        customFieldsCount: Object.keys(customerReplyFacts.customFields || {}).length,
        hasSummary: Boolean(effectiveProfile?.chatSummary),
    };
    console.info(`[ReplyDecision] ai_primary=true context=${JSON.stringify(replyQualityContextLog)}`);
    io?.emit("system-log", {
        type: "info",
        msg: `reply_context ai_primary=true flow=${replyQualityContextLog.businessFlow} appointment=${replyQualityContextLog.hasAppointment} custom_fields=${replyQualityContextLog.customFieldsCount} summary=${replyQualityContextLog.hasSummary}`,
    });
    const routerDecision = decideTrivialAiRoute({
        text: lastUserMsgText,
        hasAudio: lastUserMsgIsVoice,
        hasImage: lastUserMsgHasImage,
        activeRecord: activeCustomerRecord?.order_data || earlyDraftRecord || null,
        configuredFields: instanceCustomFields,
        autoReply: resolveBotAiChatReplyMode(botConfig).allowInboundAiReply,
    });
    console.info(`[CustomerAIRouter] router_decision action=${routerDecision.action === "skip_ai_no_reply" ? "skip_ai" : routerDecision.action} reason=${routerDecision.reason} ai_skipped_${routerDecision.action === "skip_ai_no_reply"}`);
    io?.emit("system-log", {
        type: "info",
        msg: `router_decision action=${routerDecision.action === "skip_ai_no_reply" ? "skip_ai" : routerDecision.action} reason=${routerDecision.reason} ai_skipped_${routerDecision.action === "skip_ai_no_reply"}`,
    });
    if (routerDecision.action === "skip_ai_no_reply") {
        console.info(`[AiCallBudget] ai_call_budget_skipped_customer_reply reason=${routerDecision.reason}`);
        return true;
    }
    const latestListRequestActive = detectLatestListRequest(lastUserMsgText);
    const latestListPriorityActive = latestListRequestActive && !latestMessageExplicitlyReferencesPriorContext(lastUserMsgText);
    const suppressedBotTerm = recentBotTermContext?.term && !recentBotTermContext.latestMessageAsksAboutBotTerm
        ? recentBotTermContext.term
        : "";
    const baseAiMessagesForPrompt = suppressedBotTerm
        ? aiMessages.map((message: any) => ({
            ...message,
            parts: Array.isArray(message?.parts)
                ? message.parts
                    .map((part: any) => part?.text
                        ? { ...part, text: suppressBotIntroducedTermText(String(part.text || ""), suppressedBotTerm) }
                        : part)
                    .filter((part: any) => part?.inlineData || String(part?.text || "").trim())
                : [],
        }))
        : aiMessages;
    let aiMessagesForPrompt = baseAiMessagesForPrompt;
    if (strictLatestMediaPriorityActive) {
        const latestUserPromptIndex = (() => {
            for (let index = baseAiMessagesForPrompt.length - 1; index >= 0; index -= 1) {
                if (String(baseAiMessagesForPrompt[index]?.role || "").toLowerCase() === "user") return index;
            }
            return -1;
        })();
        aiMessagesForPrompt = latestUserPromptIndex >= 0
            ? [baseAiMessagesForPrompt[latestUserPromptIndex]]
            : baseAiMessagesForPrompt.slice(-1);
        io?.emit("system-log", { type: "info", msg: `media_priority_history_filter_applied removedDbHistory=${prependedAiMessages.length}` });
    } else if (latestListPriorityActive) {
        const latestUserPromptIndex = (() => {
            for (let index = baseAiMessagesForPrompt.length - 1; index >= 0; index -= 1) {
                if (String(baseAiMessagesForPrompt[index]?.role || "").toLowerCase() === "user") return index;
            }
            return -1;
        })();
        aiMessagesForPrompt = latestUserPromptIndex >= 0
            ? [baseAiMessagesForPrompt[latestUserPromptIndex]]
            : baseAiMessagesForPrompt.slice(-1);
        io?.emit("system-log", { type: "info", msg: `latest_list_history_filter_applied removedDbHistory=${prependedAiMessages.length}` });
    }
    let geminiProvider: any = null;
    let localGenAI: any = null;
    const ensureGeminiClient = async (purpose = "reply_tts") => {
        if (geminiProvider && localGenAI) {
            return { geminiProvider, localGenAI };
        }
        geminiProvider = await createGeminiClient({
            userId,
            accountId: userId,
            dataOwnerKey,
            botId: dataOwnerKey,
            purpose,
            billingContext: {
                customerJid: sender,
                eventId: lastUserMsgId,
            },
        });
        console.log(`[AI-Process] Google GenAI provider: ${geminiProvider.provider} account=${geminiProvider.accountId || "unknown"} purpose=${purpose}`);
        emitReplyTimingLog(io, `gemini_client_created purpose=${purpose}`);
        localGenAI = geminiProvider.ai;
        return { geminiProvider, localGenAI };
    };
    if (normalTextReplyFastPath) {
        emitReplyTimingLog(io, "gemini_client_skipped reason=normal_text_fast_path");
    }
    let smartConversationGuidance: any = null;
    if (strictLatestMediaPriorityActive) {
        io?.emit("system-log", { type: "info", msg: "smart_brain_skipped reason=latest_media_priority" });
    } else if (normalTextReplyFastPath) {
        io?.emit("system-log", { type: "info", msg: "smart_brain_skipped reason=normal_text_fast_path" });
    } else {
        const smartBrainPlan = await generateSmartBrainPlan({
            businessType: userConfig?.business_type || botConfig?.business_type,
            activeRecord: activeCustomerRecord?.order_data || earlyDraftRecord || null,
            latestText: lastUserMsgText,
            recentMessages: getAiTextHistory(aiMessagesForPrompt).slice(-6),
            businessInstructions: userConfig?.ai_prompt || botConfig?.prompt || "",
            customerSummary: latestMediaPriorityActive ? "" : suppressBotIntroducedTermText(effectiveProfile?.chatSummary || "", suppressedBotTerm),
            safeFlags: {
                replyBehavior,
                hasImage: lastUserMsgHasImage,
                isVoice: lastUserMsgIsVoice,
                sequenceBlocked: Boolean(sequenceBlockReason),
                autoReplyStopped: false,
            },
            providerContext: {
                userId,
                accountId: userId,
                dataOwnerKey,
                botId: dataOwnerKey,
                purpose: "universal_smart_brain_plan",
                billingContext: {
                    customerJid: sender,
                    eventId: lastUserMsgId || `smart-brain:${Date.now()}`,
                },
            },
        });
        const smartBrainLog = summarizeSmartBrainPlanForLog(smartBrainPlan);
        const smartBrainGuidanceDecision = getSmartBrainGuidanceDecision(smartBrainPlan);
        smartConversationGuidance = smartBrainGuidanceDecision.useGuidance ? smartBrainPlan.result : null;
        const smartBrainIntelligence = buildSmartBrainCustomerIntelligencePatch(smartBrainPlan);
        let smartBrainIntelligenceSaved = false;
        if (Object.keys(smartBrainIntelligence.patch).length > 0) {
            await dbService.updateCustomerProfile(dataOwnerKey, sender, smartBrainIntelligence.patch).then(() => {
                smartBrainIntelligenceSaved = true;
            }).catch((error: any) => {
                console.warn("[SmartBrainPhaseD] intelligence_save_failed", error?.message || error);
            });
        }
        console.info(`[SmartBrainPhaseD] ${JSON.stringify({
            ...smartBrainLog,
            brain_guidance_used: smartBrainGuidanceDecision.useGuidance,
            brain_guidance_skipped_reason: smartBrainGuidanceDecision.useGuidance ? "" : smartBrainGuidanceDecision.reason,
            brain_intelligence_saved: smartBrainIntelligenceSaved,
            brain_intelligence_skipped_reason: smartBrainIntelligence.decision.save ? "" : smartBrainIntelligence.decision.reason,
        })}`);
        io?.emit("system-log", {
            type: "info",
            msg: `smart_brain_phase_c brain_generated=${smartBrainLog.generated} brain_guidance_used=${smartBrainGuidanceDecision.useGuidance} brain_guidance_skipped_reason=${smartBrainGuidanceDecision.useGuidance ? "none" : smartBrainGuidanceDecision.reason} parse_failed=${smartBrainLog.parse_failed} model=${smartBrainLog.model || "none"} business_type=${smartBrainLog.business_type} intent=${smartBrainLog.intent} stage=${smartBrainLog.stage} risk=${smartBrainLog.risk_level} action=${smartBrainLog.next_best_action} confidence=${smartBrainLog.confidence}`,
        });
        io?.emit("system-log", {
            type: "info",
            msg: `smart_brain_phase_d brain_intelligence_saved=${smartBrainIntelligenceSaved} skipped_reason=${smartBrainIntelligenceSaved ? "none" : smartBrainIntelligence.decision.reason} lead_quality=${smartBrainPlan.result.lead_quality} stage=${smartBrainPlan.result.stage} intent=${smartBrainPlan.result.intent} risk=${smartBrainPlan.result.risk_level} follow_up_reason_present=${Boolean((smartBrainIntelligence.patch as any).smartFollowUpReason)} private_note_present=${Boolean((smartBrainIntelligence.patch as any).smartPrivateAdminNote)}`,
        });
    }
    const basePrompt = preserveClientTrainingText(
        userConfig?.ai_prompt || restoreOriginalClientTrainingText(botConfig.prompt, botConfig.prompt_raw, MAX_INSTRUCTION_CHARS),
        MAX_INSTRUCTION_CHARS
    ) || "You are a helpful assistant.";
    const smartSalesLayer = await buildSmartSalesPromptLayer(userConfig).catch(() => ({
        enabled: false,
        promptText: "",
        promptVersion: "",
        extraCharge: 0.001,
    }));
    if (!smartSalesLayer.enabled) {
        appendSmartSalesDecisionLog({
            smartSalesUsed: false,
            reasonSkipped: "disabled",
            botId: dataOwnerKey,
            accountId: userId,
        });
    }
    const effectiveChatSummary = normalTextReplyFastPath
        ? (effectiveProfile?.chatSummary || "")
        : await buildFreshCustomerChatSummary({
            dataOwnerKey,
            customerJid: sender,
            profile: effectiveProfile,
            configuredFields: instanceCustomFields,
            history: aiMessagesForPrompt.map((message: any) => ({
                role: message?.role,
                text: Array.isArray(message?.parts) ? message.parts.map((part: any) => part?.text || "").join(" ").trim() : "",
                timestamp: 0,
            })),
        }).catch(() => effectiveProfile?.chatSummary || "");
    if (latestListPriorityActive) {
        io?.emit("system-log", { type: "info", msg: "latest_intent_override_applied reason=list_request" });
        io?.emit("system-log", { type: "info", msg: "old_context_suppressed reason=latest_list_request" });
    }
    const effectiveChatSummaryForPrompt = latestMediaPriorityActive || latestListPriorityActive
        ? ""
        : suppressBotIntroducedTermText(effectiveChatSummary, suppressedBotTerm);
    const savedDeliveryName = getSavedDeliveryName(effectiveProfile || {});
    const activeCustomerRecordForPrompt = strictLatestMediaPriorityActive || latestListPriorityActive ? null : (activeCustomerRecord?.order_data || null);
    const crmFirstContextForPrompt = strictLatestMediaPriorityActive || latestListPriorityActive ? "" : crmFirstContext;
    const smartConversationGuidanceForPrompt = strictLatestMediaPriorityActive || latestListPriorityActive ? null : smartConversationGuidance;
    const websiteKnowledgeContext = normalTextReplyFastPath
        ? { snippets: [], promptText: "", totalAvailable: 0 }
        : (userId ? await buildWebsiteKnowledgeAiContext(userId, {
            botId: dataOwnerKey,
            query: [
                lastUserMsgText,
                effectiveChatSummary,
                activeCustomerRecordForPrompt?.productName,
                activeCustomerRecordForPrompt?.serviceName,
            ].filter(Boolean).join(" "),
            maxItems: WEBSITE_KNOWLEDGE_AI_MAX_ITEMS,
            maxChars: WEBSITE_KNOWLEDGE_AI_MAX_CHARS,
        }).catch((error: any) => {
            console.warn("[WebsiteKnowledge] context_load_failed", error?.message || error);
            return { snippets: [], promptText: "", totalAvailable: 0 };
        }) : { snippets: [], promptText: "", totalAvailable: 0 });
    console.info(`[WebsiteKnowledge] ai_context bot=${dataOwnerKey || "unknown"} snippets=${websiteKnowledgeContext.snippets.length} available=${websiteKnowledgeContext.totalAvailable} chars=${websiteKnowledgeContext.promptText.length}`);
    io?.emit("system-log", {
        type: "info",
        msg: normalTextReplyFastPath
            ? "website_knowledge_context skipped=normal_text_fast_path"
            : `website_knowledge_context snippets=${websiteKnowledgeContext.snippets.length} available=${websiteKnowledgeContext.totalAvailable} chars=${websiteKnowledgeContext.promptText.length}`,
    });
    const recentBotReplyText = getRecentBotReplyText(historyArray);
    const responsePlan = planCustomerResponse({
        latestCustomerMessage: lastUserMsgText,
        previousBotMessage: recentBotReplyText,
        businessType: userConfig?.business_type || botConfig?.business_type || businessFlow,
        businessFlow,
        availableBusinessKnowledge: [basePrompt, websiteKnowledgeContext.promptText, effectiveChatSummaryForPrompt].filter(Boolean).join("\n\n"),
        knownCustomerFacts: customerReplyFacts,
    });
    const responseStrategyInstruction = buildCustomerResponseStrategyInstruction(responsePlan);
    const responsePlanLog = `response_plan intent=${responsePlan.intent} depth=${responsePlan.answerDepth} shape=${responsePlan.replyShape} maxChars=${responsePlan.maxChars} scope=${responsePlan.scope} recommendOne=${responsePlan.shouldRecommendOne} listAll=${responsePlan.shouldListAllOptions}`;
    const responsePlanScopeLog = `response_plan_scope avoid=${responsePlan.avoidTopics.map((topic) => topic.replace(/\s+/g, "_")).join(",")}`;
    console.info(`[ResponsePlanner] ${responsePlanLog}`);
    io?.emit("system-log", { type: "info", msg: responsePlanLog });
    io?.emit("system-log", { type: "info", msg: responsePlanScopeLog });
    io?.emit("system-log", { type: "info", msg: "response_plan_applied source=customer_response_planner" });
    const promptAssembly = buildCustomerBotPromptAssembly({
        userConfig,
        basePrompt,
        learnedRulesText: restoreOriginalClientTrainingText(userConfig?.learned_instructions, userConfig?.learned_instructions_raw, MAX_LEARNED_CHARS),
        instanceCustomFields,
        instanceReplyBehavior,
        products,
        cachedMediaTemplates: botConfig.cachedMediaTemplates || [],
        cachedKeywordSequences: cachedKeywordSequences || {},
        cachedWelcomeTemplates: cachedWelcomeTemplates || [],
        languagePreference,
        effectiveProfile,
        savedDeliveryName,
        replyBehavior,
        personaPreference,
        effectiveChatSummary: compactAiText(effectiveChatSummaryForPrompt, 900),
        customerInstructions: preserveClientTrainingText(effectiveProfile?.customerInstructions, 600),
        lastUserMsgText,
        lastUserMsgIsVoice,
        lastUserMsgHasImage,
        aiMessagesCount: aiMessagesForPrompt.length,
        sequenceBlockReason,
        activeCustomerRecord: activeCustomerRecordForPrompt,
        crmFirstContext: crmFirstContextForPrompt,
        smartSalesPromptText: smartSalesLayer.enabled ? smartSalesLayer.promptText : "",
        smartSalesPromptVersion: smartSalesLayer.enabled ? smartSalesLayer.promptVersion : "",
        smartConversationGuidance: smartConversationGuidanceForPrompt,
        websiteKnowledgeText: websiteKnowledgeContext.promptText,
    });
    const systemInstruction = composeImplicitCacheInstruction(promptAssembly.stablePrefix, promptAssembly.dynamicContext);
    const dynamicSystemInstruction = promptAssembly.dynamicContext;

    const tools = [{
      functionDeclarations: [
        {
          name: "save_order",
          description: "Saves a completed product/ecommerce order to the database. Call this ONLY for product businesses when the customer has confirmed intent to purchase and all required structured details are known. Do not call with fake/filler values such as ji, yes, ok, unknown city, customer provided address, or guessed address. If any required field is missing, ask only for the missing field instead.",
          parameters: {
            type: "OBJECT",
            properties: {
              customer_name: { type: "STRING", description: "Delivery/recipient name explicitly confirmed by customer chat or saved confirmed order/import. Never use ji/yes/ok, WhatsApp display name, business name, or random OCR text." },
              phone: { type: "STRING", description: "Customer phone/WhatsApp number explicitly provided or already saved." },
              address: { type: "STRING", description: "Confirmed delivery address only. Do not use placeholders. If address came from ID/card/image, customer must confirm it first." },
              product_name: { type: "STRING" },
              variation: { type: "STRING", description: "Product variation/color/size/flavor/model if customer selected or implied one." },
              quantity: { type: "INTEGER" },
              total_price: { type: "NUMBER" },
              city_name: { type: "STRING", description: "Customer delivery city if known." },
              items: { type: "INTEGER", description: "Number of pieces/parcels for courier booking. Use 1 unless known otherwise." },
              invoice_division: { type: "INTEGER", description: "PostEx invoiceDivision/pieces. Use 1 unless known otherwise." },
              order_type: { type: "STRING", description: "Courier order type. Use Normal unless Reverse or Replacement is clearly required." },
              pickup_address_code: { type: "STRING", description: "Optional PostEx pickup address code if the business provided one." },
              transaction_notes: { type: "STRING", description: "Optional customer instructions, order notes, special delivery notes, or follow-up notes for manual courier/admin review." },
              notes: { type: "STRING", description: "Any extra instructions or follow-ups the business should remember for this order." },
              shipping_charge: { type: "NUMBER", description: "Optional delivery, shipping, or courier charge if already known. PostEx fees are normally filled later from tracking." },
              custom_fields: { type: "OBJECT", description: "Key/value details for configured custom confirmation fields using exact field names." },
            },
            required: ["customer_name", "phone", "address", "product_name", "quantity", "total_price"],
          },
        },
        {
          name: "save_lead",
          description: "Saves or updates a service-business lead/request. Use for service businesses when the customer shares useful lead details. It can be incomplete; include collected fields and exact custom field names. Do not invent product order, stock, courier, COD, quantity, or delivery values unless the business explicitly requires them.",
          parameters: {
            type: "OBJECT",
            properties: {
              customer_name: { type: "STRING" },
              phone: { type: "STRING" },
              service_name: { type: "STRING" },
              location: { type: "STRING" },
              notes: { type: "STRING" },
              custom_fields: { type: "OBJECT", description: "Key/value details for configured custom confirmation fields using exact field names." },
            },
          },
        },
        {
          name: "update_order_memory",
          description: "Stores a clear customer-provided order fact before final confirmation, especially facts from voice notes or quoted replies such as name, product, color/option, price, city, address, or payment method. Do not use for unclear guesses; ask for confirmation instead.",
          parameters: {
            type: "OBJECT",
            properties: {
              customer_name: { type: "STRING" },
              product_name: { type: "STRING" },
              variation: { type: "STRING", description: "Selected option/color/size/model." },
              price_text: { type: "STRING" },
              city_name: { type: "STRING" },
              address: { type: "STRING" },
              payment_method: { type: "STRING" },
              source: { type: "STRING", description: "voice_note, quoted_reply, or customer_text." },
              note: { type: "STRING" },
            },
          },
        },
        {
          name: "update_lead_memory",
          description: "Stores a clear service lead/request fact before completion, especially facts from voice notes or quoted replies. Use exact custom field names where possible.",
          parameters: {
            type: "OBJECT",
            properties: {
              customer_name: { type: "STRING" },
              phone: { type: "STRING" },
              service_name: { type: "STRING" },
              location: { type: "STRING" },
              note: { type: "STRING" },
              custom_fields: { type: "OBJECT" },
            },
          },
        },
        {
          name: "sendSequence",
          description: "Use this tool to send a configured multi-step WhatsApp Automation Sequence when it directly matches what the customer needs or discusses. Do NOT call if marked ALREADY SENT. Use stable sequence_id.",
          parameters: {
            type: "OBJECT",
            properties: {
              sequence_id: { type: "STRING", description: "The stable sequence ID or shortcut from the automation sequences knowledge." }
            },
            required: ["sequence_id"],
          },
        },
        {
          name: "sendMediaFile",
          description: "Use this tool to send the best matching saved Media Library file or configured Sequence whenever the reusable-content knowledge shows that it is directly useful to the current customer conversation. Use stable IDs whenever possible. Do not type long captions as tool arguments.",
          parameters: {
            type: "OBJECT",
            properties: {
              media_name: { type: "STRING", description: "The stable ID (preferred, e.g. media ID or sequence ID), sequence shortcut/code, or short title from the reusable content knowledge." }
            },
            required: ["media_name"],
          },
        },
        {
          name: "reply_with_voice",
          description: "Sends a professional voice note to the customer. In text_preferred mode, use only when the customer explicitly asks for voice/audio or says they cannot read/type/write, are driving, or have a similar practical need. Never use it just because the customer sent an audio message. Use the customer's selected or detected language.",
          parameters: {
            type: "OBJECT",
            properties: {
              voice_text: { type: "STRING", description: "The customer-facing text to synthesize into a voice note." }
            },
            required: ["voice_text"],
          },
        },
        {
          name: "update_learned_rules",
          description: "Stores a reusable business rule, policy, stock rule, pricing rule, delivery rule, or customer-handling instruction the business or customer corrected. Use only for facts that should help future conversations for this WhatsApp instance.",
          parameters: {
            type: "OBJECT",
            properties: {
              new_rule: { type: "STRING", description: "One concise reusable rule to remember for future conversations." }
            },
            required: ["new_rule"],
          },
        }
      ],
    }];
    tools[0].functionDeclarations = tools[0].functionDeclarations.filter((tool: any) => {
        if (businessFlow === "service") return !["save_order"].includes(tool.name);
        return !["save_lead"].includes(tool.name);
    });
    const hasUnsentActiveSequences = Object.entries(cachedKeywordSequences || {}).some(([key, seq]: any) => {
        if (seq?.config?.enabled === false) return false;
        const candidateKeys = getSequenceSentFlagKeys(seq, key);
        return !candidateKeys.some((flagKey: string) => Boolean(effectiveProfile?.[flagKey]));
    });
    const combinedReplyMemoryMode = shouldUseCombinedReplyMemoryForSimpleText({
        lastUserMsgText,
        lastUserMsgIsVoice,
        lastUserMsgHasImage,
        lastUserMsgIsSticker,
        activeCustomerRecord,
        earlyDraftRecord,
        sequenceBlockReason,
        hasActiveSequences: hasUnsentActiveSequences,
    });
    const combinedReplyMemoryInstruction = combinedReplyMemoryMode ? buildCombinedReplyMemoryInstruction() : "";
    const identityRule = "IDENTITY RULE: Never claim to be Gemini, DeepSeek, DeepInfra, OpenAI, or any specific AI model/provider. If asked about your model or provider, naturally respond that you are the AI assistant for this business without exposing internal backend names or forcing canned robotic replies.";
    const trainingPriorityRule = "TRAINING PRIORITY RULE: The current account instructions, product data, and training context provided above are your absolute source of truth. If the current training contains pricing, use exactly that pricing. If it does not contain pricing, do not invent numbers or guess costs. If past conversation memory or CRM summaries conflict with the current training text, the current training ALWAYS wins.";
    const mediaFirstSystemInstruction = latestUsefulMediaPriorityActive
        ? `LATEST MEDIA PRIORITY:
The customer's latest useful media/context is the primary task. Answer the latest ${latestMediaPriorityType || "media"}/caption directly first. Do not continue an older CRM, lead, order, school, previous business-use-case, or old assistant topic unless the customer explicitly asks about it. Use old CRM/history only as secondary background when directly relevant to the latest media.`
        : "";
    const rememberedMediaSystemInstruction = rememberedMediaReplyContextText
        ? "REMEMBERED MEDIA CONTEXT:\nThe customer is referring to a previously shared media/product. Answer that product/media reference first. Do not continue unrelated old CRM/service context unless the customer explicitly asks."
        : "";
    const latestListPrioritySystemInstruction = latestListPriorityActive
        ? `LATEST LIST PRIORITY:
The customer's latest message is asking for a list, menu, catalog, services, packages, options, branches, timings, doctors, courses, departments, or pricing choices. Answer that requested list first.
Do not continue an older appointment, order, lead, CRM, or summary flow before giving the list.
Do not ask age, gender, name, phone, date, time, address, or other collection fields before the list.
After the list, ask only one short useful next-step question if needed.`
        : "";
    const baseSysInstruction = [
        systemInstruction,
        identityRule,
        trainingPriorityRule,
        responseStrategyInstruction,
        mediaFirstSystemInstruction,
        rememberedMediaSystemInstruction,
        latestListPrioritySystemInstruction,
    ].filter(Boolean).join("\n\n");
    const requestSystemInstruction = combinedReplyMemoryMode
        ? composeImplicitCacheInstruction(baseSysInstruction, combinedReplyMemoryInstruction)
        : baseSysInstruction;
    const requestDynamicSystemInstruction = combinedReplyMemoryMode
        ? composeImplicitCacheInstruction(dynamicSystemInstruction, combinedReplyMemoryInstruction)
        : dynamicSystemInstruction;
    const toolsForRequest = combinedReplyMemoryMode ? undefined : tools;

    if (combinedReplyMemoryMode) {
        console.info(`[GeminiModelRouting] model_route=default_reply purpose=combined_reply_memory model=${CUSTOMER_AI_MODEL}`);
    }
    const aiModel = CUSTOMER_AI_MODEL;

    try {
        io?.emit("system-log", { type: "info", msg: `🧠 Calling AI (${aiMessages.length} messages context)...` });
        console.log(`[AI-Process] Calling ${aiModel} (${aiMessages.length} messages in context)...`);
        
        const customerLanguage = languagePreference.language;
        let response: any;
        
        // --- DeepInfra Early Fast Path ---
        const purpose = combinedReplyMemoryMode ? "combined_reply_memory" : "customer_ai_reply";
        let msgParts = (aiMessages || []).flatMap((msg: any) => Array.isArray(msg?.parts) ? msg.parts : []);
        const conversationHasAudio = msgParts.some((part: any) => /audio/i.test(String(part?.inlineData?.mimeType || "")));
        const conversationHasMedia = msgParts.some((part: any) => Boolean(part?.inlineData));
        const latestUserMsg = aiMessages.slice().reverse().find((msg: any) => msg.role === "user");
        const latestMessageType = lastUserMsgHasImage ? "image" : (lastUserMsgIsVoice ? "audio" : "text");
        let latestUserHasAudio = (latestUserMsg?.parts || []).some((part: any) => /audio/i.test(String(part?.inlineData?.mimeType || "")));
        let latestUserHasImage = (latestUserMsg?.parts || []).some((part: any) => /image/i.test(String(part?.inlineData?.mimeType || "")));
        let latestUserHasMedia = (latestUserMsg?.parts || []).some((part: any) => Boolean(part?.inlineData));
        let latestUserTextStr = latestUserMsg ? (latestUserMsg.parts || []).map((part: any) => String(part?.text || "").trim()).filter(Boolean).join(" ") : "";

        if (lastUserMsgHasImage && latestUserMsg) {
            const hadImageInlineData = (latestUserMsg.parts || []).some((part: any) => /image/i.test(String(part?.inlineData?.mimeType || "")));
            if (hadImageInlineData) {
                latestUserMsg.parts = (latestUserMsg.parts || []).filter((part: any) => !/image/i.test(String(part?.inlineData?.mimeType || "")));
                const imageContextText = latestImageReplyContextText;
                const imagePriorityPromptText = buildLatestMediaPriorityPromptText({
                    mediaContextText: imageContextText,
                    latestText: lastUserMsgText,
                    emphasizeFirst: latestUsefulMediaPriorityActive,
                });
                if (imagePriorityPromptText) {
                    latestUserMsg.parts = [
                        { text: imagePriorityPromptText },
                        ...(latestUserMsg.parts || []).filter((part: any) => String(part?.text || "").trim() !== imagePriorityPromptText),
                    ];
                    io?.emit("system-log", { type: "info", msg: `media_context_converted_to_text_reply_input type=image useful=true chars=${imageContextText.length}` });
                }
                latestUserHasAudio = (latestUserMsg.parts || []).some((part: any) => /audio/i.test(String(part?.inlineData?.mimeType || "")));
                latestUserHasImage = (latestUserMsg.parts || []).some((part: any) => /image/i.test(String(part?.inlineData?.mimeType || "")));
                latestUserHasMedia = (latestUserMsg.parts || []).some((part: any) => Boolean(part?.inlineData));
                io?.emit("system-log", { type: "info", msg: "image_context_normalized_for_deepinfra=true" });
                console.info("[AI-Process] image_context_normalized_for_deepinfra=true");
            }
        }
        
        if (latestUserHasAudio && latestUserMsg) {
            const audioPartIndex = latestUserMsg.parts.findIndex((p: any) => p.inlineData && /audio/i.test(String(p.inlineData.mimeType)));
            if (audioPartIndex !== -1) {
                latestUserMsg.parts.splice(audioPartIndex, 1);
                const transcribedText = latestAudioReplyContextText;
                if (transcribedText) {
                    latestUserMsg.parts = (latestUserMsg.parts || []).filter((part: any) => !String(part?.text || "").toLowerCase().includes("transcript unavailable"));
                    const audioPriorityPromptText = buildLatestMediaPriorityPromptText({
                        mediaContextText: transcribedText,
                        latestText: lastUserMsgText,
                        emphasizeFirst: latestUsefulMediaPriorityActive,
                    });
                    latestUserMsg.parts = [
                        { text: audioPriorityPromptText },
                        ...latestUserMsg.parts,
                    ];
                    io?.emit("system-log", { type: "info", msg: `media_context_converted_to_text_reply_input type=audio useful=true chars=${transcribedText.length}` });
                    latestUserTextStr = transcribedText;
                    lastUserMsgText = transcribedText;
                }
                latestUserHasAudio = (latestUserMsg.parts || []).some((part: any) => /audio/i.test(String(part?.inlineData?.mimeType || "")));
                latestUserHasImage = (latestUserMsg.parts || []).some((part: any) => /image/i.test(String(part?.inlineData?.mimeType || "")));
                latestUserHasMedia = (latestUserMsg.parts || []).some((part: any) => Boolean(part?.inlineData));
                io?.emit("system-log", { type: "info", msg: "audio_context_normalized_for_deepinfra=true" });
                console.info("[AI-Process] audio_context_normalized_for_deepinfra=true");
            }
        }
        if (batchContextText && latestUserMsg) {
            const combinedBatchPrompt = [
                batchContextText,
                batchReplyGuidance,
                hallucinationGuard?.guidance || "",
            ].filter(Boolean).join("\n");
            if (combinedBatchPrompt && !(latestUserMsg.parts || []).some((part: any) => String(part?.text || "").includes("Customer sent this message batch:"))) {
                latestUserMsg.parts.push({ text: combinedBatchPrompt });
            }
        } else if (hallucinationGuard?.guidance && latestUserMsg) {
            latestUserMsg.parts.push({ text: hallucinationGuard.guidance });
        }
        if (rememberedMediaReplyContextText && latestUserMsg) {
            const rememberedMediaPromptText = buildRememberedMediaPriorityPromptText({
                mediaContextText: rememberedMediaReplyContextText,
                latestText: lastUserMsgText,
            });
            if (rememberedMediaPromptText && !(latestUserMsg.parts || []).some((part: any) => String(part?.text || "").includes("REMEMBERED MEDIA CONTEXT:"))) {
                latestUserMsg.parts = [
                    { text: rememberedMediaPromptText },
                    ...(latestUserMsg.parts || []),
                ];
                latestUserTextStr = rememberedMediaPromptText;
            }
        }
        
        const toolsConfigured = Boolean(toolsForRequest && Array.isArray(toolsForRequest) && toolsForRequest.some((entry: any) => Array.isArray(entry?.functionDeclarations) && entry.functionDeclarations.length > 0));
        const diTools = toolsConfigured ? convertGeminiToolsToDeepInfra(toolsForRequest) : undefined;

        const providerConfigured = hasDeepInfraTextProviderKey();
        const routingState = resolveLatestCustomerReplyRoutingState({
            latestMessageType,
            latestMessageId: lastUserMsgId,
            latestUserHasAudio,
            latestUserHasImage,
            latestUserHasMedia,
            conversationHasAudio,
            conversationHasMedia,
            profileLastMediaUnderstandingEventId: effectiveProfile?.lastMediaUnderstandingEventId,
            profileLastMediaUnderstandingStatus: effectiveProfile?.lastMediaUnderstandingStatus,
        });
        if (routingState.staleMediaRequirementCleared && routingState.forceTextOnly) {
            io?.emit("system-log", { type: "info", msg: "stale_media_requirement_cleared reason=newer_text_message latestMessageType=text" });
            if (routingState.shouldCancelPendingMediaRetry) {
                io?.emit("system-log", {
                    type: "info",
                    msg: `pending_media_retry_cancelled reason=newer_customer_text_message oldMessageId=${routingState.staleMessageId.slice(0, 24)}`,
                });
            }
            io?.emit("system-log", { type: "info", msg: "provider_routing_forced_text_only reason=latest_message_is_text" });
        }
        const mediaContextUseful = Boolean(
            (latestMessageType === "image" && latestImageReplyContextText) ||
            (latestMessageType === "audio" && latestAudioReplyContextText) ||
            rememberedMediaReplyContextText ||
            batchContextText
        );
        emitReplyTimingLog(io, `reply_timing_pre_ai_ms=${Math.max(0, Date.now() - replyPipelineStartedAt)}`);

        const backendDecision = shouldUseDeepInfraTextProviderForPurpose({
            purpose,
            hasMedia: routingState.hasMedia,
            hasAudio: routingState.hasAudio,
            hasImage: routingState.hasImage,
            mediaContextAsText: mediaContextUseful,
            mediaContextType: latestMessageType === "audio" ? "audio" : (latestMessageType === "image" ? "image" : ""),
            requiresSchema: combinedReplyMemoryMode, // Combined reply explicitly needs JSON
            providerConfigured,
        });

        io?.emit("system-log", { type: "info", msg: `backend_text_provider_decision purpose=${purpose} useDeepInfra=${backendDecision.useDeepInfra} skipReason=${backendDecision.skipReason || ""}` });
        
        if (backendDecision.useDeepInfra && !response) {
            io?.emit("system-log", { type: "info", msg: "gemini_text_reply_blocked reason=deepinfra_required" });
            console.info(`[AI-Process] backend_text_provider_decision purpose=${purpose} useDeepInfra=true skipReason=${backendDecision.skipReason || ""}`);
            
            const diMessages: DeepInfraChatMessage[] = aiMessagesForPrompt.map((item: any): DeepInfraChatMessage => ({
                role: String(item?.role || "").toLowerCase() === "user" ? "user" : "assistant",
                content: (item.parts || []).map((part: any) => String(part?.text || "").trim()).filter(Boolean).join("\n")
            })).filter((item: DeepInfraChatMessage) => Boolean(item.content));

            const sysInstruction = [requestSystemInstruction, "Use DeepInfra for the final customer-facing text and tool decisions. Preserve BlackArrow's sales/support quality: answer directly, use CRM/order/lead/product/service/business instructions and chat history, match English/Urdu/Roman Urdu, avoid generic one-line replies, and ask one useful next question. Do not echo the customer message. When a saved photo, image, video, document, catalog, or automation sequence directly helps answer the customer's question, matches the topic discussed, or is requested by the customer, call sendMediaFile with its stable ID."].filter(Boolean).join("\n\n");

            io?.emit("system-log", { type: "info", msg: `backend_text_provider_call provider=deepinfra model=deepseek-ai/DeepSeek-V4-Flash tools=${diTools?.length || 0}` });

            try {
                const { createHash } = await import("node:crypto");
                const safeCustomerKey = createHash("sha256").update(sender || "unknown").digest("hex").slice(0, 16);
                const safePromptCacheKey = `blackarrow:${dataOwnerKey}:${safeCustomerKey}:reply`;
                const deepInfraStartedAt = Date.now();
                const providerResult = await (async () => {
                    try {
                        return await generateBackendText({
                            purpose,
                            accountId: dataOwnerKey,
                            botId: dataOwnerKey,
                            customerJid: sender,
                            customerTurnId,
                            providerCallId: `call_reply_${customerTurnId}`,
                            promptCacheKey: safePromptCacheKey,
                            stablePrompt: sysInstruction,
                            messages: diMessages,
                            maxTokens: CUSTOMER_REPLY_MAX_OUTPUT_TOKENS || (combinedReplyMemoryMode ? 900 : 280),
                            tools: diTools,
                            tool_choice: diTools && diTools.length > 0 ? "auto" : undefined,
                        });
                    } finally {
                        emitReplyTimingLog(io, `reply_timing_deepinfra_ms=${Math.max(0, Date.now() - deepInfraStartedAt)}`);
                    }
                })();
                
                console.info(`[AI-Process] backend_text_provider_result provider=${providerResult.provider} model=${providerResult.model} purpose=${purpose} fallbackUsed=${Boolean(providerResult.fallbackUsed)} toolCalls=${providerResult.toolCalls?.length || 0}`);
                
                io?.emit("system-log", { type: "info", msg: `backend_text_provider_result provider=deepinfra cachedTokens=${providerResult.cachedTokens || 0} promptCacheKeyAttached=${Boolean(providerResult.telemetry?.promptCacheKeyAttached)} toolCalls=${providerResult.toolCalls?.length || 0}` });
                
                if (providerResult && providerResult.requestStatus === "success" && (providerResult.text || (providerResult.toolCalls && providerResult.toolCalls.length > 0))) {
                    io?.emit("system-log", { type: "info", msg: `deepinfra_final_text_reply_used latestMessageType=${latestMessageType} mediaContextUseful=${mediaContextUseful}` });
                    io?.emit("system-log", { type: "info", msg: `ai_effective_provider=deepinfra` });
                    io?.emit("system-log", { type: "info", msg: `ai_effective_model=deepseek-ai/DeepSeek-V4-Flash` });

                    const functionCalls = (providerResult.toolCalls || []).map((call) => ({
                        name: call.name,
                        args: call.arguments || {},
                    }));

                    response = {
                        text: providerResult.text || "",
                        functionCalls: functionCalls.length > 0 ? functionCalls : undefined,
                        candidates: [{
                            finishReason: providerResult.finishReason || (functionCalls.length > 0 ? "TOOL_CALLS" : "STOP"),
                            content: {
                                parts: [
                                    ...(providerResult.text ? [{ text: providerResult.text }] : []),
                                    ...functionCalls.map((fc) => ({ functionCall: fc })),
                                ]
                            }
                        }],
                        provider: providerResult.provider,
                        model: providerResult.model,
                        providerTelemetry: providerResult.telemetry,
                        backendTextProvider: true,
                        usageMetadata: {
                            promptTokenCount: providerResult.promptTokens || 0,
                            candidatesTokenCount: providerResult.completionTokens || 0,
                            totalTokenCount: (providerResult.promptTokens || 0) + (providerResult.completionTokens || 0),
                            cachedContentTokenCount: providerResult.cachedTokens || 0,
                        }
                    };
                } else {
                    const blockedReason = providerResult?.fallbackReason || getDeepInfraTextBlockedReason();
                    io?.emit("system-log", { type: "warning", msg: blockedReason });
                    throw createAiReplyRetryableError("DeepInfra text generation did not return a usable reply.", blockedReason, {
                        phase: "ai_generation",
                    });
                }
            } catch (diError: any) {
                console.error("[AI-Process] DeepInfra text generation failed:", diError);
                io?.emit("system-log", { type: "warning", msg: getDeepInfraTextBlockedReason() });
                throw createAiReplyRetryableError("DeepInfra text generation failed.", getDeepInfraTextBlockedReason(), {
                    phase: "ai_generation",
                });
            }
        } else {
            console.info(`[AI-Process] backend_text_provider_decision purpose=${purpose} useDeepInfra=false skipReason=${backendDecision.skipReason || ""}`);
            io?.emit("system-log", { type: "info", msg: `backend_text_provider_skipped provider=gemini skipReason=${backendDecision.skipReason || ""}` });
        }
        // --- End DeepInfra Early Fast Path ---

        const geminiCacheContext = {
            model: aiModel,
            botId: dataOwnerKey,
            stablePrefixHash: promptAssembly.stablePrefixHash,
            stablePrefixLength: promptAssembly.stablePrefixLength,
            stablePrefixTokenEstimate: promptAssembly.stablePrefixTokenEstimate,
            explicitCacheEnabled: false,
            explicitCacheUsed: false,
            explicitCacheCreated: false,
            explicitCacheNameShort: "",
            cacheFallbackReason: "",
        };

        if (!response) {
            io?.emit("system-log", { type: "warning", msg: getDeepInfraTextBlockedReason() });
            throw createAiReplyRetryableError("Customer reply generation requires DeepInfra text only.", getDeepInfraTextBlockedReason(), {
                phase: "ai_generation",
            });
        }

        const effectiveProvider = response?.provider || geminiProvider?.provider || "gemini";
        const effectiveModel = response?.model || aiModel;
        console.log(`[AI-Process] AI provider status: provider=${effectiveProvider} model=${effectiveModel} finishReason=${JSON.stringify(response?.candidates?.[0]?.finishReason)}`);
        let replyFinishReason = String(response.candidates?.[0]?.finishReason || "");
        if (effectiveProvider === "deepinfra" || response?.backendTextProvider) {
            const inputTokens = response?.usageMetadata?.promptTokenCount || 0;
            const outputTokens = response?.usageMetadata?.candidatesTokenCount || 0;
            const cachedTokens = response?.usageMetadata?.cachedContentTokenCount || 0;
            const cacheAttached = Boolean(response?.providerTelemetry?.promptCacheKeyAttached);
            io?.emit("system-log", { type: "info", msg: `[Backend Text Provider] customer-bot: provider=${effectiveProvider}, model=${effectiveModel}, input=${inputTokens}, output=${outputTokens}, cached=${cachedTokens}, promptCacheKeyAttached=${cacheAttached}` });
        } else {
            logGeminiCacheTelemetry(response, io, "customer-bot", geminiCacheContext);
        }
        io?.emit("system-log", { type: "info", msg: "✅ AI Response received." });
 
        let combinedReplyTextOverride = "";
        let combinedMemorySummaryForSave = "";
        if (combinedReplyMemoryMode) {
            const responseText = (() => {
                try {
                    if (response.text) return response.text;
                } catch {}
                return response.candidates?.[0]?.content?.parts?.filter((part: any) => part.text).map((part: any) => part.text).join(" ") || "";
            })();
            try {
                const combined = parseCombinedReplyMemoryJson(responseText);
                combinedReplyTextOverride = combined.reply;
                try {
                    combinedMemorySummaryForSave = renderCombinedCustomerMemoryUpdate(combined.customerMemoryUpdate);
                } catch (memoryError: any) {
                    console.warn(`[CombinedReplyMemory] memory_rejected_before_gate reason=${memoryError?.message || "invalid_memory"}`);
                    combinedMemorySummaryForSave = "";
                }
            } catch (parseError: any) {
                console.warn(`[CombinedReplyMemory] parse_failed reason=${parseError?.message || "invalid_json"}; using safe reply text only`);
                const replyOnly = sanitizeCustomerFacingReply(String(responseText || "")
                    .replace(/\{[\s\S]*\}/g, " ")
                    .replace(/\b(customerMemoryUpdate|currentFacts|pendingNextStep|doNotAskAgain)\b/gi, " ")
                    .trim());
                response = replyOnly && !isCustomerVisibleToolMetaText(replyOnly) && !containsInternalReasoning(replyOnly)
                    ? { ...response, text: replyOnly }
                    : { text: "" };
                combinedReplyTextOverride = "";
                combinedMemorySummaryForSave = "";
            }
        }

        const isIncomingVoice = lastUserMsgIsVoice;
        const isIncomingImage = lastUserMsgHasImage;
        const behavior = replyBehavior;
        const isCloudSocket = Boolean((sock as any)?.isCloud);
        const voiceSendSupported = (sock as any)?.supportsVoiceSend !== false;
        const voiceEnabled = voiceSendSupported
            && userConfig?.voice_simulation_enabled !== 0
            && userConfig?.voice_simulation_enabled !== false
            && !isSafeModeDisableTtsOutputEnabled();
        if (!voiceSendSupported && userConfig?.voice_simulation_enabled !== 0 && userConfig?.voice_simulation_enabled !== false) {
            console.log(`[AI-Process] Voice sending is not supported on this transport socket. Inbound customer reply will be delivered as text.`);
        }
        let voiceAlreadyHandled = false;
        let voiceReplyMessageId = "";
        let voiceReplyReceiptId = "";
        let voiceReplyFallbackReasonType = "";
        let voiceReplyFailureReason = "";
        let sendTextAlongsideVoice = false;
        let customerReplyAlreadySent = false;
        let deferredVoiceToolTextReply = "";
        let preferDeferredVoiceToolTextReply = false;
        let aiRequestedVoiceReply = false;
        let deferredMissingOrderFields: string[] = [];
        let deferredMissingRecordType = "order";
        let unsafeReplySkipped = false;
        
        const Baileys = await import("@whiskeysockets/baileys");

        if (response.functionCalls && response.functionCalls.length > 0) {
            for (const call of response.functionCalls) {
                io?.emit("system-log", { type: "info", msg: `🛠️ AI tool call: ${call.name}` });
                if (call.name === "save_order") {
                    const args = call.args as any;
                    const quantity = Math.max(1, Number(args.quantity) || 1);
                    const shippingCharge = Math.max(0, Number(args.shipping_charge) || 0);
                    const structuredState = extractCustomerOrderState({ profile: effectiveProfile, history: getAiTextHistory(aiMessages), configuredFields: instanceCustomFields });
                    const customFields = sanitizeOrderCustomFields({
                        ...(structuredState.customFields || {}),
                        ...(args.custom_fields && typeof args.custom_fields === "object" ? args.custom_fields : {}),
                    }, instanceCustomFields);
                    const savedPhone = profile?.customerPhone || profile?.phone || profile?.phoneNumber || profile?.whatsapp_number || "";
                    const savedName = getSavedDeliveryName(profile || {});
                    const customerName = pickPreferredCustomerName(
                        structuredState.customerName,
                        savedName,
                        cleanOrderFieldValue(args.customer_name),
                    );
                    const customerPhone = cleanOrderFieldValue(args.phone || structuredState.customerPhone || savedPhone);
                    const possibleImageAddress = effectiveProfile?.imageAddressNeedsConfirmation ? "" : effectiveProfile?.possibleImageAddress;
                    const orderAddress = cleanOrderFieldValue(args.address || structuredState.address || possibleImageAddress);
                    const productName = cleanOrderFieldValue(args.product_name || structuredState.product);
                    const variation = cleanOrderFieldValue(args.variation || structuredState.variant || customFields.Variation || customFields.Variant || customFields.Color || customFields.Size || "");
                    const itemMatch = products.find((p: any) => p.name.toLowerCase() === productName.toLowerCase() || p.sku === productName);
                    const productUnitCost = Math.max(0, Number(itemMatch?.cost_price) || 0);
                    const productCost = productUnitCost * quantity;
                    let orderData: any = {
                        customerName,
                        customerPhone,
                        orderAddress,
                        deliveryAddress: orderAddress,
                        cityName: cleanOrderFieldValue(args.city_name || structuredState.city || customFields.City || customFields.city || effectiveProfile?.possibleImageCity || ""),
                        productName,
                        quantity,
                        items: Math.max(1, Number(args.items) || quantity || 1),
                        invoiceDivision: Math.max(1, Number(args.invoice_division) || 1),
                        orderType: args.order_type || customFields["Order Type"] || "Normal",
                        pickupAddressCode: args.pickup_address_code || customFields["Pickup Address Code"] || "",
                        courierCompany: customFields["Courier Company"] || customFields.Courier || "",
                        variation,
                        transactionNotes: args.transaction_notes || args.notes || "",
                        notes: args.notes || args.transaction_notes || "",
                        productUnitCost,
                        productCost,
                        totalCost: productCost,
                        shippingCharge,
                        orderDetail: buildOrderDetail({
                            productName,
                            variation,
                            quantity,
                            customFields
                        }),
                        totalPrice: Number(args.total_price) || structuredState.priceAmount || 0,
                        codAmount: Number(args.total_price) || structuredState.priceAmount || 0,
                        customFields,
                        ...customFields,
                        customerJid: sender,
                        createdAt: new Date().toISOString(),
                        transactionStatus: "Confirmed order"
                    };
                    orderData = mergeStructuredOrderState(orderData, structuredState);
                    orderData = sanitizeOrderDeliveryName(orderData, profile || {});
                    const orderMemoryPatch = buildOrderMemoryPatch({
                        orderData,
                        structuredState,
                        isVoice: lastUserMsgIsVoice,
                        quotedContext: lastQuotedReplyContext,
                    });
                    if (Object.keys(orderMemoryPatch).length > 0) {
                        await dbService.updateCustomerProfile(dataOwnerKey, sender, orderMemoryPatch).catch(() => {});
                    }
                    if (effectiveProfile?.addressValidationValid === true) {
                        orderData.addressValidationValid = true;
                        orderData.addressValidationAccepted = true;
                    }
                    const addressValidation = validateDeliveryAddress({
                        address: orderData.deliveryAddress || orderData.orderAddress || orderData.address,
                        city: orderData.cityName || orderData.city,
                        notes: [orderData.transactionNotes, orderData.notes].filter(Boolean).join(" "),
                        customFields: orderData.customFields || {},
                    });
                    await dbService.updateCustomerProfile(dataOwnerKey, sender, {
                        addressValidationStatus: addressValidation.kind,
                        addressValidationValid: addressValidation.valid,
                        addressValidationMissing: addressValidation.missing,
                        ...(addressValidation.valid ? { addressValidationAccepted: true } : {}),
                        ...(addressValidation.note ? { addressValidationNote: addressValidation.note } : {}),
                    }).catch(() => {});
                    if (addressValidation.valid) {
                        orderData.addressValidationValid = true;
                        orderData.addressValidationAccepted = true;
                    }
                    const orderReferenceNumber = buildConfirmedOrderReference(orderData);
                    orderData.orderReferenceNumber = orderReferenceNumber;
                    orderData.orderRefNumber = orderReferenceNumber;

                    orderData.transactionNotes = buildTransactionNotes(orderData);
                    orderData.notes = orderData.transactionNotes;

                    const missingOrderFields = getMissingOrderFields(orderData, instanceCustomFields);
                    if (missingOrderFields.length > 0) {
                        const hasAddressMissing = missingOrderFields.some((field: string) => /^address\b/i.test(field) || /landmark|parcel receiving|shop\/office|market\/road/i.test(field));
                        const nextAddressFailureCount = hasAddressMissing ? (Number(effectiveProfile?.addressValidationFailedCount || 0) + 1) : 0;
                        deferredMissingOrderFields = missingOrderFields;
                        deferredMissingRecordType = "order";
                        const incompleteOrderData = withRecordMetadata({
                            recordData: {
                                ...orderData,
                                transactionStatus: "Order incomplete",
                                recordType: "order",
                                businessFlow: "product",
                            },
                            businessFlow: "product",
                            recordType: "order",
                            missingFields: missingOrderFields,
                            recordStatus: "incomplete",
                        });
                        await dbService.saveOrder(dataOwnerKey, incompleteOrderData).catch((e: any) => {
                            console.error("[AI-Tool] Failed saving incomplete order:", e?.message || e);
                        });
                        await dbService.updateCustomerProfile(dataOwnerKey, sender, {
                            orderStatus: "collecting details",
                            customFields: orderData.customFields || {},
                            missingCustomFields: missingOrderFields,
                            customerPhone: orderData.customerPhone || profile?.customerPhone || profile?.phone || profile?.phoneNumber || "",
                            customerName: orderData.customerName || profile?.customerName || profile?.name || "",
                            ...(hasAddressMissing ? { addressValidationFailedCount: nextAddressFailureCount } : {}),
                        }).catch(() => {});
                        io?.emit("system-log", { type: "warning", msg: `Order save paused. Missing confirmation: ${missingOrderFields.join(", ")}` });
                        continue;
                    }

                    const stockResult: any = userId ? await reserveOrderStock(userId, orderData) : { ok: false, message: "Stock cannot be checked without a user context.", alternatives: [] };
                    if (!stockResult.ok) {
                        if (stockResult.ambiguous) {
                            const clarifyStockMessage = customerLanguage === "english"
                                ? "Please confirm the exact product and color/option once, so I can check availability correctly."
                                : "Product aur color/option ek dafa exact confirm kar dein taa ke main availability sahi check kar sakun.";
                            const stockClarifyMsg = await sendAiTextMessage({
                                sock,
                                sender,
                                text: clarifyStockMessage,
                                userConfig,
                                userId,
                                dataOwnerKey,
                                eventId: lastUserMsgId || `stock-clarify:${Date.now()}`,
                                contextType: "order_stock_clarification",
                                skipPlatformAiUsageCharges,
                            });
                            customerReplyAlreadySent = true;
                            historyArray.push({
                                key: { fromMe: true, remoteJid: sender, id: stockClarifyMsg?.messageId || `stock-clarify-${Date.now()}` },
                                message: { conversation: clarifyStockMessage },
                                messageTimestamp: Math.floor(Date.now() / 1000)
                            });
                            io?.emit("system-log", { type: "warning", msg: `Stock check ambiguous for order: ${args.product_name}` });
                            continue;
                        }
                        const stockMessage = buildStockUnavailableMessage(stockResult, customerLanguage);
                        const stockSentMsg = await sendAiTextMessage({
                            sock,
                            sender,
                            text: stockMessage,
                            userConfig,
                            userId,
                            dataOwnerKey,
                            eventId: lastUserMsgId || `stock-unavailable:${Date.now()}`,
                            contextType: "order_stock_unavailable",
                            skipPlatformAiUsageCharges,
                        });
                        customerReplyAlreadySent = true;
                        historyArray.push({
                            key: { fromMe: true, remoteJid: sender, id: stockSentMsg?.messageId || `stock-${Date.now()}` },
                            message: { conversation: stockMessage },
                            messageTimestamp: Math.floor(Date.now() / 1000)
                        });
                        const stockTarget = buildBackInStockTarget(stockResult.product || itemMatch, stockResult.variationName, stockResult.optionName);
                        const blockedProductId = stockTarget?.productId || stockResult.product?.$id || stockResult.product?.id || itemMatch?.$id || itemMatch?.id || "";
                        const blockedProductName = stockTarget?.productName || stockResult.product?.name || itemMatch?.name || productName;
                        if (blockedProductId && blockedProductName) {
                            await dbService.saveBackInStockRequest(dataOwnerKey, sender, blockedProductId, blockedProductName).catch((e: any) => {
                                console.error("[Stock] Failed saving back-in-stock request:", e?.message || e);
                            });
                        }
                        io?.emit("system-log", { type: "warning", msg: `Stock blocked order: ${args.product_name}` });
                        continue;
                    }

                    orderData.stockReservedAt = new Date().toISOString();
                    orderData.stockProductId = stockResult.product?.$id || stockResult.product?.id || "";
                    orderData.stockVariationName = stockResult.variationName || "";
                    orderData.stockOptionName = stockResult.optionName || "";
                    orderData = withRecordMetadata({
                        recordData: {
                            ...orderData,
                            recordType: "order",
                            businessFlow: "product",
                        },
                        businessFlow: "product",
                        recordType: "order",
                        missingFields: [],
                        recordStatus: "complete",
                    });
                    
                    try {
                        const savedRef = await dbService.saveOrder(dataOwnerKey, orderData);
                        orderData.createdAt = savedRef.created_at || orderData.createdAt;
                        orderData = mergeStructuredOrderState(orderData, structuredState);
                        const deliveryNamePatch = buildDeliveryNameProfilePatch(orderData);
                        await dbService.updateCustomerProfile(dataOwnerKey, sender, {
                            hasPlacedOrder: true,
                            orderStatus: "Confirmed order",
                            latestOrderRef: savedRef.order_id,
                            customFields: orderData.customFields || {},
                            missingCustomFields: [],
                            ...deliveryNamePatch,
                            customerPhone: orderData.customerPhone
                        });
                        const orderedTarget = buildBackInStockTarget(stockResult.product, stockResult.variationName, stockResult.optionName);
                        if (orderedTarget?.baseProductId) {
                            await deletePendingBackInStockRequestsForCustomerProduct({
                                botJid: dataOwnerKey,
                                customerJid: sender,
                                baseProductId: orderedTarget.baseProductId,
                            }).catch((e: any) => console.error("[Stock] Failed clearing old stock reminders:", e?.message || e));
                        }
                        if (orderData.customerPhone) {
                            publishSharedPhoneIdentity({
                                jid: sender,
                                phone: orderData.customerPhone,
                                profilePatch: { jid: sender, ...deliveryNamePatch },
                                source: "confirmed_order",
                            }).catch(() => {});
                        }
                        const summaryDecision = getRecordSummaryDecision({
                            profile: effectiveProfile,
                            recordData: orderData,
                            configuredFields: instanceCustomFields,
                            latestCustomerText: lastUserMsgText,
                            confirmationDetected: true,
                        });
                        if (summaryDecision.shouldSendSummary) {
                            const orderConfirmText = await buildAiGeneratedOrderLeadSummary({
                                orderData,
                                savedRef,
                                language: customerLanguage,
                                configuredFields: instanceCustomFields,
                                chatContext: getAiTextHistory(aiMessages).map((item: any) => `${item.role}: ${item.text}`).join("\n"),
                                providerContext: {
                                    userId,
                                    accountId: userId,
                                    dataOwnerKey,
                                    botId: dataOwnerKey,
                                    purpose: "ai_order_lead_summary",
                                    billingContext: {
                                        customerJid: sender,
                                        eventId: String(savedRef?.order_id || orderReferenceNumber || lastUserMsgId || Date.now()),
                                    },
                                },
                            }).catch(() => buildCustomerOrderSummaryMessage(orderData, savedRef, customerLanguage));
                            const orderConfirmMsg = await sendAiTextMessage({
                                sock,
                                sender,
                                text: orderConfirmText,
                                userConfig,
                                userId,
                                dataOwnerKey,
                                eventId: String(savedRef?.order_id || orderReferenceNumber || lastUserMsgId || Date.now()),
                                contextType: "order_confirmation",
                                skipPlatformAiUsageCharges,
                            });
                            await dbService.updateCustomerProfile(dataOwnerKey, sender, buildRecordSummarySentPatch({
                                profile: effectiveProfile,
                                recordData: orderData,
                                configuredFields: instanceCustomFields,
                                summaryText: orderConfirmText,
                                messageId: orderConfirmMsg?.messageId,
                                confirmed: true,
                                source: summaryDecision.changedAfterSummary ? "order_summary_updated" : "order_summary_sent",
                            })).catch(() => {});
                            customerReplyAlreadySent = true;
                            historyArray.push({
                                key: { fromMe: true, remoteJid: sender, id: orderConfirmMsg?.messageId || `order-${Date.now()}` },
                                message: { conversation: orderConfirmText },
                                messageTimestamp: Math.floor(Date.now() / 1000)
                            });
                        } else if (summaryDecision.shouldMarkConfirmed) {
                            await dbService.updateCustomerProfile(dataOwnerKey, sender, buildRecordSummaryConfirmedPatch(effectiveProfile)).catch(() => {});
                        }
                        emitOrderSaved(io, { dataOwnerKey, orderData, savedRef });
                        await notifyAdminOfConfirmedOrder({ sock, userConfig, sender, orderData, savedRef, io });
                        if (!savedRef?.isNew) {
                            io?.emit("system-log", { type: "info", msg: `Order updated instead of duplicated: ${savedRef?.order_id || orderReferenceNumber}` });
                        }
                        io?.emit("system-log", { type: "success", msg: `📦 Order placed: ${args.product_name}` });
                    } catch(e: any) {
                        if (userId) {
                            await releaseOrderStock(userId, { ...orderData, stockReleasedAt: "" }).catch(() => {});
                        }
                        console.error("[AI-Tool] Failed saving order after stock reserve:", e?.message || e);
                        io?.emit("system-log", { type: "error", msg: `Order save failed after stock check: ${e?.message || "unknown error"}` });
                        await notifyAdminForEscalation({
                            sock,
                            userConfig,
                            dataOwnerKey,
                            sender,
                            latestUserText: lastUserMsgText,
                            replyText: `Order save failed: ${e?.message || "unknown error"}`,
                            historyArray,
                            io,
                        }).catch(() => {});
                    }
                } else if (call.name === "save_lead") {
                    const args = call.args as any;
                    const structuredState = extractCustomerOrderState({ profile: effectiveProfile, history: getAiTextHistory(aiMessages), configuredFields: instanceCustomFields });
                    const wasLeadComplete = String(activeCustomerRecord?.order_data?.recordStatus || "").trim().toLowerCase() === "complete";
                    const customFields = sanitizeOrderCustomFields({
                        ...(structuredState.customFields || {}),
                        ...(activeCustomerRecord?.order_data?.customFields || {}),
                        ...(args.custom_fields && typeof args.custom_fields === "object" ? args.custom_fields : {}),
                    }, instanceCustomFields);
                    const savedPhone = profile?.customerPhone || profile?.phone || profile?.phoneNumber || profile?.whatsapp_number || "";
                    const serviceName = cleanOrderFieldValue(args.service_name || structuredState.product || activeCustomerRecord?.order_data?.serviceName || activeCustomerRecord?.order_data?.productName || "");
                    let leadData: any = withRecordMetadata({
                        recordData: {
                            ...(activeCustomerRecord?.order_data || {}),
                            customerName: pickPreferredCustomerName(
                                structuredState.customerName,
                                activeCustomerRecord?.order_data?.customerName,
                                cleanOrderFieldValue(args.customer_name),
                            ),
                            customerPhone: cleanOrderFieldValue(args.phone || structuredState.customerPhone || savedPhone || activeCustomerRecord?.order_data?.customerPhone || ""),
                            serviceName,
                            productName: serviceName || "Service request",
                            location: cleanOrderFieldValue(args.location || structuredState.location || activeCustomerRecord?.order_data?.location || ""),
                            notes: cleanOrderFieldValue(args.notes || activeCustomerRecord?.order_data?.notes || ""),
                            transactionNotes: cleanOrderFieldValue(args.notes || activeCustomerRecord?.order_data?.transactionNotes || ""),
                            customFields,
                            customerJid: sender,
                            createdAt: activeCustomerRecord?.order_data?.createdAt || new Date().toISOString(),
                            transactionStatus: "Lead incomplete",
                        },
                        businessFlow: "service",
                        recordType: "lead",
                        missingFields: getMissingLeadFields({
                            ...(activeCustomerRecord?.order_data || {}),
                            customerPhone: cleanOrderFieldValue(args.phone || structuredState.customerPhone || savedPhone || activeCustomerRecord?.order_data?.customerPhone || ""),
                            serviceName,
                            location: cleanOrderFieldValue(args.location || structuredState.location || activeCustomerRecord?.order_data?.location || ""),
                            notes: cleanOrderFieldValue(args.notes || activeCustomerRecord?.order_data?.notes || ""),
                            transactionNotes: cleanOrderFieldValue(args.notes || activeCustomerRecord?.order_data?.transactionNotes || ""),
                            customFields,
                        }, instanceCustomFields),
                    });
                    const missingLeadFields = getMissingLeadFields(leadData, instanceCustomFields);
                    const leadConfirmed = structuredState.confirmationDetected;
                    const leadIsComplete = missingLeadFields.length === 0;
                    if (missingLeadFields.length > 0) {
                        deferredMissingOrderFields = missingLeadFields;
                        deferredMissingRecordType = "lead";
                    }
                    leadData = withRecordMetadata({
                        recordData: {
                            ...leadData,
                            transactionStatus: leadIsComplete ? "Lead complete" : "Lead incomplete",
                        },
                        businessFlow: "service",
                        recordType: "lead",
                        missingFields: missingLeadFields,
                        recordStatus: leadIsComplete ? "complete" : "incomplete",
                    });
                    const savedLead = await dbService.saveLead(dataOwnerKey, leadData, instanceCustomFields).catch((e: any) => {
                        console.error("[AI-Tool] Failed saving service lead:", e?.message || e);
                        return null;
                    });
                    await dbService.updateCustomerProfile(dataOwnerKey, sender, {
                        orderStatus: leadData.recordStatus === "complete" ? "Lead complete" : "Lead incomplete",
                        latestOrderRef: savedLead?.order_id || effectiveProfile?.latestOrderRef || "",
                        customFields: leadData.customFields || {},
                        missingCustomFields: missingLeadFields,
                        customerPhone: leadData.customerPhone || profile?.customerPhone || profile?.phone || profile?.phoneNumber || "",
                        customerName: leadData.customerName || profile?.customerName || profile?.name || "",
                        latestProductName: leadData.serviceName || leadData.productName || "",
                    }).catch(() => {});
                    if (savedLead && leadData.recordStatus === "complete") {
                        const summaryDecision = getRecordSummaryDecision({
                            profile: effectiveProfile,
                            recordData: leadData,
                            configuredFields: instanceCustomFields,
                            latestCustomerText: lastUserMsgText,
                            confirmationDetected: leadConfirmed,
                        });
                        if (summaryDecision.shouldSendSummary) {
                            const leadSummaryText = await buildAiGeneratedOrderLeadSummary({
                                orderData: leadData,
                                savedRef: savedLead,
                                language: customerLanguage,
                                configuredFields: instanceCustomFields,
                                chatContext: getAiTextHistory(aiMessages).map((item: any) => `${item.role}: ${item.text}`).join("\n"),
                                providerContext: {
                                    userId,
                                    accountId: userId,
                                    dataOwnerKey,
                                    botId: dataOwnerKey,
                                    purpose: "ai_order_lead_summary",
                                    billingContext: {
                                        customerJid: sender,
                                        eventId: String(savedLead?.order_id || lastUserMsgId || Date.now()),
                                    },
                                },
                            }).catch(() => "");
                            if (leadSummaryText) {
                                const leadSummaryMsg = await sendAiTextMessage({
                                    sock,
                                    sender,
                                    text: leadSummaryText,
                                    userConfig,
                                    userId,
                                    dataOwnerKey,
                                    eventId: String(savedLead?.order_id || lastUserMsgId || Date.now()),
                                    contextType: summaryDecision.changedAfterSummary ? "lead_confirmation_updated" : "lead_confirmation",
                                    skipPlatformAiUsageCharges,
                                });
                                await dbService.updateCustomerProfile(dataOwnerKey, sender, buildRecordSummarySentPatch({
                                    profile: effectiveProfile,
                                    recordData: leadData,
                                    configuredFields: instanceCustomFields,
                                    summaryText: leadSummaryText,
                                    messageId: leadSummaryMsg?.messageId,
                                    confirmed: leadConfirmed,
                                    source: summaryDecision.changedAfterSummary ? "lead_summary_updated" : "lead_summary_sent",
                                })).catch(() => {});
                                customerReplyAlreadySent = true;
                                historyArray.push({
                                    key: { fromMe: true, remoteJid: sender, id: leadSummaryMsg?.messageId || `lead-${Date.now()}` },
                                    message: { conversation: leadSummaryText },
                                    messageTimestamp: Math.floor(Date.now() / 1000)
                                });
                            }
                        } else if (summaryDecision.shouldMarkConfirmed) {
                            await dbService.updateCustomerProfile(dataOwnerKey, sender, buildRecordSummaryConfirmedPatch(effectiveProfile)).catch(() => {});
                        }
                        await notifyAdminOfConfirmedOrder({ sock, userConfig, sender, orderData: leadData, savedRef: savedLead, io });

                        // Automatic Department Lead Routing
                        const autoRouting = await triggerAutomaticCustomerLeadRouting({
                            accountId: userId || dataOwnerKey,
                            botId: dataOwnerKey,
                            customerJid: sender,
                            leadId: String(savedLead?.order_id || activeCustomerRecord?.order_data?.order_id || Date.now()),
                            leadData: {
                                customerName: leadData.customerName,
                                customerPhone: leadData.customerPhone,
                                serviceName: leadData.serviceName || leadData.productName,
                                notes: leadData.notes || leadData.transactionNotes,
                                location: leadData.location,
                                intent: lastUserMsgText,
                            },
                            customerLanguage: customerLanguage || languagePreference.language,
                            profile: effectiveProfile,
                            chatHistory: getAiTextHistory(aiMessages).map((item: any) => `${item.role}: ${item.text}`).join("\n"),
                            countryContext: { defaultCountryCode: userConfig?.countryCode || userConfig?.country },
                            sock,
                            userConfig,
                            io,
                        });
                        if (autoRouting.replyText && !customerReplyAlreadySent) {
                            const routingMsg = await sendAiTextMessage({
                                sock,
                                sender,
                                text: autoRouting.replyText,
                                userConfig,
                                userId,
                                dataOwnerKey,
                                eventId: `route_${savedLead?.order_id || Date.now()}`,
                                contextType: autoRouting.actionTaken === "phone_requested" ? "phone_request" : "lead_forward_acknowledgement",
                                skipPlatformAiUsageCharges,
                            });
                            customerReplyAlreadySent = true;
                            historyArray.push({
                                key: { fromMe: true, remoteJid: sender, id: routingMsg?.messageId || `route-${Date.now()}` },
                                message: { conversation: autoRouting.replyText },
                                messageTimestamp: Math.floor(Date.now() / 1000)
                            });
                        }
                    }
                    io?.emit("system-log", { type: leadData.recordStatus === "complete" ? "success" : "info", msg: `Service lead ${leadData.recordStatus}: ${missingLeadFields.join(", ") || "required fields collected"}` });
                } else if (call.name === "update_order_memory") {
                    const args = call.args as any;
                    const source = cleanOrderFieldValue(args.source || (lastUserMsgIsVoice ? "voice_note" : (lastQuotedReplyContext ? "quoted_reply" : "customer_text")));
                    const patch: any = {
                        ...(cleanOrderFieldValue(args.customer_name) ? { customerName: cleanOrderFieldValue(args.customer_name), deliveryName: cleanOrderFieldValue(args.customer_name) } : {}),
                        ...(cleanOrderFieldValue(args.product_name) ? { latestProductName: cleanOrderFieldValue(args.product_name) } : {}),
                        ...(cleanOrderFieldValue(args.variation) ? { latestVariant: cleanOrderFieldValue(args.variation), latestOrderOption: cleanOrderFieldValue(args.variation) } : {}),
                        ...(cleanOrderFieldValue(args.price_text) ? { latestPrice: cleanOrderFieldValue(args.price_text) } : {}),
                        ...(cleanOrderFieldValue(args.city_name) ? { cityName: cleanOrderFieldValue(args.city_name), city: cleanOrderFieldValue(args.city_name) } : {}),
                        ...(cleanOrderFieldValue(args.address) ? { deliveryAddress: cleanOrderFieldValue(args.address), address: cleanOrderFieldValue(args.address) } : {}),
                        ...(cleanOrderFieldValue(args.payment_method) ? { paymentMethod: cleanOrderFieldValue(args.payment_method) } : {}),
                        lastOrderMemoryUpdatedAt: Math.floor(Date.now() / 1000),
                        lastOrderMemorySource: source,
                        ...(cleanOrderFieldValue(args.note) ? { lastOrderMemoryNote: cleanOrderFieldValue(args.note) } : {}),
                    };
                    if (lastUserMsgIsVoice && patch.latestVariant) {
                        patch.lastVoiceOrderUpdate = `Selected option/color changed to ${patch.latestVariant} from voice note.`;
                        patch.lastVoiceOrderUpdateAt = Math.floor(Date.now() / 1000);
                    }
                    if (Object.keys(patch).length > 3) {
                        await dbService.updateCustomerProfile(dataOwnerKey, sender, patch).catch(() => {});
                        io?.emit("system-log", { type: "info", msg: `Saved order memory update from ${source || "customer message"}.` });
                    }
                } else if (call.name === "update_lead_memory") {
                    const args = call.args as any;
                    const customFields = sanitizeOrderCustomFields({
                        ...(effectiveProfile?.customFields || {}),
                        ...(activeCustomerRecord?.order_data?.customFields || {}),
                        ...(args.custom_fields && typeof args.custom_fields === "object" ? args.custom_fields : {}),
                    }, instanceCustomFields);
                    const patch: any = {
                        ...(cleanOrderFieldValue(args.customer_name) ? { customerName: cleanOrderFieldValue(args.customer_name), deliveryName: cleanOrderFieldValue(args.customer_name) } : {}),
                        ...(cleanOrderFieldValue(args.phone) ? { customerPhone: cleanOrderFieldValue(args.phone), phone: cleanOrderFieldValue(args.phone) } : {}),
                        ...(cleanOrderFieldValue(args.service_name) ? { latestProductName: cleanOrderFieldValue(args.service_name) } : {}),
                        ...(cleanOrderFieldValue(args.location) ? { location: cleanOrderFieldValue(args.location), cityName: cleanOrderFieldValue(args.location) } : {}),
                        customFields,
                        lastLeadMemoryUpdatedAt: Math.floor(Date.now() / 1000),
                        ...(cleanOrderFieldValue(args.note) ? { lastLeadMemoryNote: cleanOrderFieldValue(args.note) } : {}),
                    };
                    await dbService.updateCustomerProfile(dataOwnerKey, sender, patch).catch(() => {});
                    io?.emit("system-log", { type: "info", msg: "Saved service lead memory update." });
                } else if (call.name === "sendSequence") {
                    const args = call.args as any;
                    const sequenceChoice = String(args.sequence_id || args.media_name || "").trim();
                    const matchedEntry = resolveSequenceForAiChoice(cachedKeywordSequences || {}, sequenceChoice);
                    if (matchedEntry?.sequence?.templates?.length > 0) {
                        const matchedSeq = matchedEntry.sequence;
                        const rawSeqName = matchedEntry.key || matchedSeq.config?.name || "sequence";
                        const seqDisplayName = getSequenceDisplayName(rawSeqName, matchedSeq);
                        const runtimePayload = resolveRuntimeSequencePayloadGroup(botConfig, matchedSeq, matchedSeq.templates || []);
                        const deliveryResult = await deliverSequenceGroup({
                            sock,
                            customerJid: sender,
                            customerDisplayName: profile?.name || sender.split("@")[0],
                            sequence: runtimePayload?.sequence || matchedSeq,
                            fallbackKey: rawSeqName,
                            templates: runtimePayload?.templates || matchedSeq.templates || [],
                            groupResetAt: runtimePayload?.groupResetAt,
                            generationId: runtimePayload?.generationId,
                            source: "ai_semantic",
                            io,
                            userId,
                            botId: dataOwnerKey,
                            dataOwnerKey,
                        });
                        if (deliveryResult.success && deliveryResult.completed) {
                            io?.emit("system-log", { type: "success", msg: `Sequence triggered by AI: ${seqDisplayName}` });
                        } else if (deliveryResult.alreadySent) {
                            io?.emit("system-log", { type: "info", msg: `Sequence '${seqDisplayName}' already handled. Skipping duplicate send without overriding natural reply.` });
                        } else if (deliveryResult.reason === "wallet_balance_too_low") {
                            io?.emit("system-log", { type: "warning", msg: `Sequence '${seqDisplayName}' blocked: wallet balance is too low for paid automation sends.` });
                        }
                    }
                    Object.defineProperty(response, 'functionCalls', { value: response.functionCalls.filter((c:any) => c.name !== 'sendSequence'), writable: true, configurable: true });
                } else if (call.name === "sendMediaFile") {
                    const args = call.args as any;
                    const rawChoice = String(args.media_name || "").trim().replace(/^["']|["']$/g, "").replace(/^(?:id|item|media_item)[:\s]+/i, "").trim();
                    const mediaName = rawChoice.toLowerCase();
                    
                    // Determine whether mediaName is a Media template or a Sequence Group
                    // 1. Check if it matches a Sequence Group first (Requirement 24/25)
                    const sequenceMatch = resolveSequenceForAiChoice(cachedKeywordSequences || {}, rawChoice);
                    if (sequenceMatch?.sequence?.templates?.length > 0) {
                        const matchedSeq = sequenceMatch.sequence;
                        const rawSeqName = sequenceMatch.key || matchedSeq.config?.name || "sequence";
                        const seqDisplayName = getSequenceDisplayName(rawSeqName, matchedSeq);
                        const runtimePayload = resolveRuntimeSequencePayloadGroup(botConfig, matchedSeq, matchedSeq.templates || []);
                        const deliveryResult = await deliverSequenceGroup({
                            sock,
                            customerJid: sender,
                            customerDisplayName: profile?.name || sender.split("@")[0],
                            sequence: runtimePayload?.sequence || matchedSeq,
                            fallbackKey: rawSeqName,
                            templates: runtimePayload?.templates || matchedSeq.templates || [],
                            groupResetAt: runtimePayload?.groupResetAt,
                            generationId: runtimePayload?.generationId,
                            source: "ai_semantic",
                            io,
                            userId,
                            botId: dataOwnerKey,
                            dataOwnerKey,
                        });
                        if (deliveryResult.success && deliveryResult.completed) {
                            io?.emit("system-log", { type: "success", msg: `Sequence triggered by AI: ${seqDisplayName}` });
                        } else if (deliveryResult.alreadySent) {
                            io?.emit("system-log", { type: "info", msg: `Sequence '${seqDisplayName}' already handled. Skipping duplicate send without overriding natural reply.` });
                        } else if (deliveryResult.reason === "wallet_balance_too_low") {
                            io?.emit("system-log", { type: "warning", msg: `Sequence '${seqDisplayName}' blocked: wallet balance is too low for paid automation sends.` });
                        }
                        Object.defineProperty(response, 'functionCalls', { value: response.functionCalls.filter((c:any) => c.name !== 'sendMediaFile'), writable: true, configurable: true });
                        continue;
                    }

                    // 2. Otherwise handle individual Media template
                    const directMediaTemplate = findBestMediaTemplate(botConfig.cachedMediaTemplates || [], mediaName, lowerText);
                    let template = directMediaTemplate || findBestMediaTemplate(botConfig.cachedMediaTemplates || [], mediaName, lowerText);
                        
                        if (template) {
                            try {
                                const sendAllowed = await canSendBillableAutomation(userId, "media_group_file_send");
                                if (!sendAllowed.allowed) {
                                    io?.emit("system-log", { type: "warning", msg: `Media send '${mediaName}' blocked: wallet balance is too low for Media Group sends.` });
                                    await sendAiTextMessage({
                                        sock,
                                        sender,
                                        text: "Your account wallet is too low for this media send. Please top up Billing and try again.",
                                        userConfig,
                                        userId,
                                        dataOwnerKey,
                                        eventId: `ai-media-wallet:${lastUserMsgId || mediaName}`,
                                        contextType: "ai_media_wallet_blocked",
                                        skipPlatformAiUsageCharges,
                                    });
                                    continue;
                                }
                                const msgToForward = template.originalMessage || template;
                                const fwContent = Baileys.generateForwardMessageContent(msgToForward, false);
                                if (fwContent) {
                                    for (const key of Object.keys(fwContent)) {
                                        const section = (fwContent as any)[key];
                                        if (section?.contextInfo) {
                                            section.contextInfo.isForwarded = false;
                                            delete section.contextInfo.forwardingScore;
                                            delete section.contextInfo.quotedMessage;
                                        }
                                        if (typeof section?.caption !== "undefined") {
                                            section.caption = "";
                                        }
                                    }
                                    await sendUniversalAutomationRelay({
                                        userId,
                                        botId: botConfig?.botId || "",
                                        customerJid: sender,
                                        billingAction: "media_group_file_send",
                                        idempotencyKey: `ai-media:${sender}:${lastUserMsgId || mediaName}:${mediaName}`,
                                        messageType: "media_group",
                                        contextType: "ai_media_group",
                                        contextId: `ai-media:${sender}:${lastUserMsgId || mediaName}:${mediaName}`,
                                        campaignType: "media_send",
                                        mediaTitle: mediaName,
                                        source: "ai_media_group",
                                        template: msgToForward,
                                        buildMessageId: () => Baileys.generateMessageID(),
                                        relay: async (messageId) => {
                                            await sock.relayMessage(sender, fwContent, { messageId });
                                        },
                                        saveMessage: async (messageId) => {
                                            await dbService.saveMessage(dataOwnerKey, sender, "model", `[Sent Media]: ${mediaName}`, messageId);
                                        },
                                    });
                                    console.log(`[AI-Tool] Sent media ${mediaName} to ${sender}`);
                                    io?.emit("system-log", { type: "success", msg: `🖼️ Media sent: ${mediaName}` });
                                }
                            } catch(e: any) {
                                console.error("[AI-Tool] Media relay error:", e.message);
                                io?.emit("system-log", { type: "error", msg: `❌ Media Relay Error: ${e.message}` });
                            }
                        } else {
                            await sendAiTextMessage({
                                sock,
                                sender,
                                text: `I'm sorry, I couldn't find the media matching "${mediaName}" in my catalog.`,
                                userConfig,
                                userId,
                                dataOwnerKey,
                                eventId: `ai-media-missing:${lastUserMsgId || mediaName}`,
                                contextType: "ai_media_missing",
                                skipPlatformAiUsageCharges,
                            });
                        }
                } else if (call.name === "reply_with_voice") {
                    aiRequestedVoiceReply = true;
                    const args = call.args as any;
                    const voiceText = sanitizeCustomerFacingReply(args.voice_text || args.urdu_text);
                    const voicePlan = buildVoiceReplyPlan({
                        replyMode: behavior,
                        incomingMessageType: isIncomingVoice ? "voice" : (isIncomingImage ? "image" : "text"),
                        customerTextOrTranscript: lastUserMsgText,
                        savedCustomerPreference: effectiveProfile?.customerReplyPreference,
                        voiceEnabled,
                        aiRequestedVoiceReply: true,
                        replyText: voiceText,
                    });
                    if (voiceText && voicePlan.sendVoice) {
                        const geminiTtsClient = await ensureGeminiClient("reply_tts");
                        const voiceResult = await processVoiceGeneration(sock, sender, voiceText, userConfig, geminiTtsClient.localGenAI, io, dataOwnerKey, userId, effectiveVoicePreference, lastUserMsgId, geminiTtsClient.geminiProvider, skipPlatformAiUsageCharges);
                        voiceAlreadyHandled = voiceResult.sent;
                        voiceReplyMessageId = voiceResult.messageId || "";
                        voiceReplyFallbackReasonType = String(voiceResult.fallbackReasonType || "");
                        voiceReplyFailureReason = String(voiceResult.failureReason || "");
                        if (!voiceAlreadyHandled) {
                            deferredVoiceToolTextReply = voiceText;
                            preferDeferredVoiceToolTextReply = true;
                            io?.emit("system-log", { type: "warning", msg: `Voice tool call failed (${voiceResult.failureReason || "voice_reply_failed"}). Sending the voice reply text as fallback.` });
                        } else {
                            sendTextAlongsideVoice = voicePlan.sendText;
                            if (voicePlan.sendText) {
                                deferredVoiceToolTextReply = voiceText;
                                preferDeferredVoiceToolTextReply = true;
                            }
                        }
                    } else if (voiceText) {
                        deferredVoiceToolTextReply = voiceText;
                        io?.emit("system-log", { type: "info", msg: `Voice tool call converted to text fallback because ${voicePlan.reason}.` });
                    }
                } else if (call.name === "update_chat_summary") {
                    const args = call.args as any;
                    if (args.new_summary) {
                        try {
                            const db = (await import('./db-service'));
                            const latestProfile = await db.getCustomerProfile(dataOwnerKey, sender).catch(() => effectiveProfile);
                            await db.updateCustomerProfile(dataOwnerKey, sender, {
                                chatSummary: mergeCustomerMemorySummary(latestProfile?.chatSummary || effectiveProfile?.chatSummary, args.new_summary),
                                chatSummaryUpdatedAt: Math.floor(Date.now() / 1000),
                            });
                            io?.emit("system-log", { type: "info", msg: `📝 AI updated chat summary` });
                        } catch(e) {}
                    }
                } else if (call.name === "update_learned_rules") {
                    const args = call.args as any;
                    if (args.new_rule) {
                        try {
                            const updatedRules = await saveLearnedRule(process.env.BOT_ID, botConfig, args.new_rule);
                            if (updatedRules) {
                                botConfig.learned_instructions = updatedRules;
                                userConfig.learned_instructions = updatedRules;
                                io?.emit("system-log", { type: "info", msg: "AI learned a new reusable business rule." });
                            }
                        } catch(e) {}
                    }
                }
            }
        }

        let replyText = "";
        try {
            if (response.text) {
                replyText = response.text;
            }
        } catch(e) {}
        
        if (!replyText && response.candidates?.[0]?.content?.parts) {
            const textParts = response.candidates[0].content.parts.filter((p: any) => p.text);
            if (textParts.length > 0) {
                replyText = textParts.map(p => p.text).join(" ");
            }
        }
        if (combinedReplyTextOverride) {
            replyText = combinedReplyTextOverride;
        }
        if ((preferDeferredVoiceToolTextReply || !replyText) && deferredVoiceToolTextReply) {
            replyText = deferredVoiceToolTextReply;
        }

        if (latestListPriorityActive && deferredMissingOrderFields.length > 0) {
            deferredMissingOrderFields = [];
            io?.emit("system-log", { type: "info", msg: "latest_intent_override_applied reason=list_request" });
            io?.emit("system-log", { type: "info", msg: "old_context_suppressed reason=latest_list_request" });
        }

        if (deferredMissingOrderFields.length > 0) {
            const missingFieldDecision = filterMissingFieldsAgainstKnownValues({
                missingFields: deferredMissingOrderFields,
                profile: effectiveProfile,
                latestOrder: activeCustomerRecord?.order_data || activeCustomerRecord || {},
                state: structuredDraftState,
                record: activeCustomerRecord?.order_data || {},
            });
            missingFieldDecision.ignoredInstructionLike.forEach((field) => {
                io?.emit("system-log", { type: "info", msg: `instruction_like_field_ignored field=${field.slice(0, 80)}` });
            });
            if (missingFieldDecision.ignoredKnownValue.length > 0) {
                io?.emit("system-log", { type: "info", msg: "summary_missing_fields_ignored reason=crm_has_values" });
            }
            deferredMissingOrderFields = missingFieldDecision.filtered;
        }

        if (deferredMissingOrderFields.length > 0) {
            const fieldCollectionLockReason = getFieldCollectionLockReason({
                profile: effectiveProfile,
                latestOrder: activeCustomerRecord?.order_data || activeCustomerRecord || {},
                state: structuredDraftState,
                history: getAiTextHistory(aiMessages),
            });
            if (fieldCollectionLockReason && !shouldAllowFieldCollectionRestart(lastUserMsgText)) {
                io?.emit("system-log", { type: "info", msg: `field_collection_locked reason=${fieldCollectionLockReason}` });
                deferredMissingOrderFields = [];
            }
        }

        if (deferredMissingOrderFields.length > 0) {
            replyText = buildMissingRequiredFieldQuestion({
                missingFields: deferredMissingOrderFields,
                language: customerLanguage,
                recordType: deferredMissingRecordType,
            });
            try {
                if (replyText) {
                    io?.emit("system-log", { type: "info", msg: `Asked for next missing ${deferredMissingRecordType} field: ${deferredMissingOrderFields[0]}` });
                } else {
                const missingFieldSystemInstruction = composeImplicitCacheInstruction(systemInstruction, `Output one clean customer-facing WhatsApp reply.
Do not include internal notes or tool status.
${CONCISE_WHATSAPP_REPLY_RULES}`);
                const missingFieldResponse = await generateBackendText({
                    purpose: "customer_ai_missing_order_field",
                    accountId: userId || dataOwnerKey,
                    botId: dataOwnerKey,
                    customerJid: sender,
                    customerTurnId,
                    providerCallId: `call_missing_${customerTurnId}_${Date.now()}`,
                    stablePrompt: missingFieldSystemInstruction,
                    latestCustomerMessage: `The attempted ${deferredMissingRecordType} save was blocked because these details are still missing: ${deferredMissingOrderFields.join(", ")}.
Mention the useful ${deferredMissingRecordType} details already collected so far, then ask only for the single next missing required detail.
Do not present this as a final ${deferredMissingRecordType} summary or confirmation-ready ${deferredMissingRecordType}.
Follow this address protocol when the missing detail is address-related:
${ORDER_ADDRESS_VALIDATION_PROTOCOL}
Use the selected/customer language: ${customerLanguage}.
Output only one customer-facing WhatsApp message.`,
                    maxTokens: 500,
                });
                if (missingFieldResponse && missingFieldResponse.requestStatus === "success" && missingFieldResponse.text) {
                    replyText = missingFieldResponse.text;
                    replyFinishReason = "";
                }
                }
            } catch (e: any) {
                io?.emit("system-log", { type: "warning", msg: `Missing order detail AI prompt failed: ${e?.message || "unknown error"}` });
            }
        }
        
        if (!replyText && response.functionCalls?.length && deferredMissingOrderFields.length === 0) {
            console.log(`[AI-Process] Generating secondary text reply for tool calls...`);
            try {
                const visibleCall = response.functionCalls.find((c: any) => !["update_learned_rules"].includes(c.name));
                
                // Construct a simpler prompt for secondary string generation to avoid functionCall sequence errors
                const systemMsg = visibleCall
                    ? `You are a helpful assistant. You just performed this action: ${visibleCall.name}(${JSON.stringify(visibleCall.args)}).
Now write a short, friendly WhatsApp message to the user explaining the action or answering their last question based on this context.
${CONCISE_WHATSAPP_REPLY_RULES}`
                    : `Write a short, helpful WhatsApp reply to the customer's latest message based on the conversation context. Do not mention internal notes, summaries, tools, or hidden instructions.
${CONCISE_WHATSAPP_REPLY_RULES}`;
                
                const toolFollowupSystemInstruction = composeImplicitCacheInstruction(systemInstruction, `You are a helpful sales assistant. Output one clean WhatsApp message.
${CONCISE_WHATSAPP_REPLY_RULES}`);
                const followUpResponse = await generateBackendText({
                    purpose: "customer_ai_tool_followup",
                    accountId: userId || dataOwnerKey,
                    botId: dataOwnerKey,
                    customerJid: sender,
                    customerTurnId,
                    providerCallId: `call_tool_${customerTurnId}_${Date.now()}`,
                    stablePrompt: toolFollowupSystemInstruction,
                    latestCustomerMessage: systemMsg,
                    maxTokens: TOOL_FOLLOWUP_MAX_OUTPUT_TOKENS,
                });
                if (followUpResponse && followUpResponse.requestStatus === "success" && followUpResponse.text) {
                    replyFinishReason = "";
                    replyText = followUpResponse.text;
                }
                
            } catch(e: any) {
                console.error("[AI-Process] Secondary text generation failed:", e.message);
            }
        }
        
        console.log(`[AI-Process] Extracted replyText: "${replyText}"`);
        
        const rawReplyTextBeforeSanitize = replyText;
        const hadInternalReasoning = containsInternalReasoning(rawReplyTextBeforeSanitize);
        const hadBadListFormatting = latestListPriorityActive && containsBadCustomerFacingListFormatting(rawReplyTextBeforeSanitize);
        const originalReplyLengthForBlockLog = String(rawReplyTextBeforeSanitize || "").length;
        let unsupportedSmartSalesClaim = "";
        let repairReturnedEmpty = false;
        const lastDeliveredBotReplyAt = normalizeLoggedTimestamp(effectiveProfile?.lastBotMessageAt || effectiveProfile?.lastBotReplyAt || 0);
        if (hadBadListFormatting) {
            io?.emit("system-log", { type: "info", msg: "customer_reply_format_repair_started reason=bad_list_format" });
        }
        replyText = sanitizeCustomerFacingReply(replyText, { responsePlan });
        if (hadBadListFormatting) {
            const listFormattingRepaired = Boolean(replyText) && !containsBadCustomerFacingListFormatting(replyText);
            io?.emit("system-log", { type: "info", msg: `customer_reply_format_repair_applied=${listFormattingRepaired ? "true" : "false"}` });
        }
        const voiceNeedSignals = detectVoiceReplySignals(lastUserMsgText);
        if (voiceNeedSignals.explicitVoiceRequest) {
            io?.emit("system-log", { type: "info", msg: "output_preference_detected type=voice_reply" });
            io?.emit("system-log", { type: "info", msg: "output_preference_not_custom_field=true" });
        }
        if (voiceNeedSignals.hasAnyVoiceNeed && isVoiceOutputOnlyRequest(lastUserMsgText)) {
            replyText = buildVoiceOutputOnlyAcknowledgement(customerLanguage);
            io?.emit("system-log", { type: "info", msg: "voice_output_only_clean_reply_applied=true" });
        }
        if (!voiceEnabled && voiceNeedSignals.hasAnyVoiceNeed) {
            io?.emit("system-log", { type: "warning", msg: "Customer requested voice, but voice reply is disabled; sending AI text only." });
            if (isVoiceOutputOnlyRequest(lastUserMsgText)) {
                replyText = buildVoiceOutputUnavailableText(customerLanguage);
                io?.emit("system-log", { type: "info", msg: "voice_output_only_fallback_sent=true" });
            }
        }
        const replySafety = evaluateLatestQuestionSafety({
            latestUserText: lastUserMsgText,
            replyText,
            verifiedContextText: buildVerifiedReplyContextText({
                promptText: promptAssembly.stablePrefix,
                crmFirstContext,
                websiteKnowledgeText: websiteKnowledgeContext.promptText,
                latestImageReplyContextText,
                latestAudioReplyContextText,
                rememberedMediaReplyContextText,
                activeRecord: activeCustomerRecord?.order_data || activeCustomerRecord || {},
                customerFacts: customerReplyFacts,
            }),
            recentBotReplyText,
            knownProductOrService: customerReplyFacts.productOrService || effectiveProfile?.latestProductName || "",
            businessType: userConfig?.business_type || botConfig?.business_type,
            recordConfirmed: String(activeCustomerRecord?.order_data?.recordStatus || activeCustomerRecord?.recordStatus || "").toLowerCase() === "complete"
                || effectiveProfile?.leadOrderConfirmed === true
                || effectiveProfile?.hasPlacedOrder === true,
            rememberedMediaContextUseful: Boolean(rememberedMediaReplyContextText),
            historyTexts: getAiTextHistory(aiMessages).map((entry: any) => entry.text),
            customerLanguage,
        });
        if (replySafety.oldContextSuppressed) {
            io?.emit("system-log", {
                type: "info",
                msg: replySafety.latestListReplyMismatch
                    ? "old_context_suppressed reason=latest_list_request"
                    : "old_context_suppressed reason=latest_question_conflict",
            });
        }
        const needsSafetyRepair = replySafety.reasonCategory === "broken_customer_reply"
            || replySafety.reasonCategory === "appointment_or_order_confirmation_risk";
        if (needsSafetyRepair) {
            io?.emit("system-log", { type: "warning", msg: "customer_reply_blocked reason=internal_or_broken_text" });
            const repairedReply = await attemptSimpleCustomerReplySafetyRepair({
                io,
                accountId: userId,
                botId: dataOwnerKey,
                customerJid: sender,
                customerTurnId,
                latestCustomerText: lastUserMsgText,
                blockedReplyText: replyText,
                customerLanguage,
                businessTrainingText: promptAssembly.stablePrefix,
                crmFirstContext,
                reason: String(replySafety.reasonCategory || "blocked_customer_reply"),
            }).catch(() => "");
            if (repairedReply) {
                replyText = repairedReply;
                io?.emit("system-log", { type: "info", msg: "customer_reply_repaired_dynamic=true" });
            } else {
                io?.emit("system-log", { type: "warning", msg: "customer_reply_repaired_dynamic=false" });
                await notifyAdminForEscalation({
                    sock,
                    userConfig,
                    dataOwnerKey,
                    sender,
                    latestUserText: lastUserMsgText,
                    replyText,
                    historyArray,
                    io,
                    forcedReasonCategory: replySafety.reasonCategory === "appointment_or_order_confirmation_risk"
                        ? "high_risk_unverified_question"
                        : "broken_customer_reply_unrepairable",
                    forcedTopic: replySafety.topic,
                    customerReplyText: "",
                }).catch(() => ({ sent: false }));
                replyText = "";
                unsafeReplySkipped = true;
            }
        } else if (replySafety.reasonCategory === "human_requested" || replySafety.reasonCategory === "high_risk_unverified_question") {
            await notifyAdminForEscalation({
                sock,
                userConfig,
                dataOwnerKey,
                sender,
                latestUserText: lastUserMsgText,
                replyText,
                historyArray,
                io,
                forcedReasonCategory: replySafety.reasonCategory as any,
                forcedTopic: replySafety.topic,
                customerReplyText: "",
            }).catch(() => ({ sent: false }));
        }
        if (isConfiguredFieldInstructionEcho(replyText, instanceCustomFields)) {
            logBlockedAiReply({
                io,
                reason: "configured_field_instruction_echo",
                originalLength: originalReplyLengthForBlockLog,
                textWasEmpty: !String(replyText || "").trim(),
                incompleteMatched: false,
                pendingLatestCustomerAt: lastUserMsgTimestampSeconds,
                lastDeliveredBotAt: lastDeliveredBotReplyAt,
            });
            replyText = "";
            unsafeReplySkipped = true;
        }
        // Strip unsafe markdown while preserving WhatsApp-safe bold, bullets, numbers, and line breaks.
        replyText = replyText.replace(/_([^_]+)_/g, "$1"); // strip underscores used for italics, keep content
        replyText = replyText.replace(/__/g, ""); // strip double underscores
        replyText = replyText.replace(/~~/g, ""); // strip tildes
        replyText = replyText.replace(/`/g, ""); // strip backticks
        
        replyText = sanitizeCustomerFacingReply(replyText, { responsePlan });
        if (isCustomerVisibleToolMetaText(replyText)) {
            logBlockedAiReply({
                io,
                reason: "tool_meta_text_blocked",
                originalLength: originalReplyLengthForBlockLog,
                textWasEmpty: !String(replyText || "").trim(),
                incompleteMatched: false,
                pendingLatestCustomerAt: lastUserMsgTimestampSeconds,
                lastDeliveredBotAt: lastDeliveredBotReplyAt,
            });
            io?.emit("system-log", { type: "warning", msg: "tool_meta_text_blocked pending_retry_kept_for_latest_message" });
            replyText = "";
            unsafeReplySkipped = true;
        }
        if (hadInternalReasoning || containsInternalReasoning(replyText)) {
            logBlockedAiReply({
                io,
                reason: "internal_reasoning",
                originalLength: originalReplyLengthForBlockLog,
                textWasEmpty: !String(replyText || "").trim(),
                incompleteMatched: false,
                pendingLatestCustomerAt: lastUserMsgTimestampSeconds,
                lastDeliveredBotAt: lastDeliveredBotReplyAt,
            });
            replyText = "";
            unsafeReplySkipped = true;
        }
        if (smartSalesLayer.enabled && replyText) {
            const unsupportedClaim = findUnsupportedSmartSalesClaim(replyText, [
                promptAssembly.stablePrefix,
                effectiveChatSummary,
                lastUserMsgText,
            ].filter(Boolean).join("\n\n"));
            if (unsupportedClaim) {
                unsupportedSmartSalesClaim = unsupportedClaim;
                logBlockedAiReply({
                    io,
                    reason: "unsupported_smart_sales_claim",
                    originalLength: originalReplyLengthForBlockLog,
                    textWasEmpty: !String(replyText || "").trim(),
                    incompleteMatched: false,
                    unsupportedClaim,
                    pendingLatestCustomerAt: lastUserMsgTimestampSeconds,
                    lastDeliveredBotAt: lastDeliveredBotReplyAt,
                });
                appendSmartSalesDecisionLog({
                    smartSalesUsed: true,
                    smartSalesPromptVersion: smartSalesLayer.promptVersion,
                    extraChargeApplied: false,
                    reasonSkipped: `unsupported_claim:${unsupportedClaim}`,
                    botId: dataOwnerKey,
                    accountId: userId,
                });
                replyText = "";
                unsafeReplySkipped = true;
            }
        }
        let orderSummaryBlocked = isIncompleteOrderSummaryReply(replyText);
        let incompleteReplyMatched = Boolean(replyText && isProbablyIncompleteCustomerReply(replyText));
        if (replyText && (replyFinishReason === "MAX_TOKENS" || incompleteReplyMatched || orderSummaryBlocked)) {
            const incompleteRetryReason = orderSummaryBlocked ? "incomplete_output_ai_repair_failed" : "incomplete_output_ai_repair_failed";
            try {
                io?.emit("system-log", { type: "info", msg: "reply_quality_repair_started issue=incomplete_output attempt=1" });
                const repairSystemInstruction = `Output only one complete customer-facing WhatsApp reply.\n${CONCISE_WHATSAPP_REPLY_RULES}`;
                const repairPrompt = buildCompleteReplyRepairPrompt({
                    latestCustomerText: lastUserMsgText,
                    incompleteReply: replyText,
                    language: customerLanguage,
                    orderSummaryBlocked,
                });
                const repaired = await attemptAiReplyRecovery({
                    io,
                    accountId: userId,
                    botId: dataOwnerKey,
                    customerJid: sender,
                    customerTurnId,
                    providerCallId: `call_repair_${customerTurnId}_${Date.now()}`,
                    purpose: "customer_ai_reply_repair",
                    systemInstruction: repairSystemInstruction,
                    prompt: repairPrompt,
                });
                repairReturnedEmpty = !String(repaired || "").trim();
                if (repairReturnedEmpty) {
                    io?.emit("system-log", { type: "warning", msg: "ai_repair_empty_retry_kept" });
                }
                if (repaired && !isProbablyIncompleteCustomerReply(repaired) && !isIncompleteOrderSummaryReply(repaired)) {
                    replyText = repaired;
                } else {
                    io?.emit("system-log", { type: "warning", msg: "reply_quality_repair_skipped reason=max_attempts_reached" });
                }
            } catch (e: any) {
                io?.emit("system-log", { type: "warning", msg: `Incomplete reply repair failed: ${e?.message || "unknown error"}` });
            }
            orderSummaryBlocked = isIncompleteOrderSummaryReply(replyText);
            incompleteReplyMatched = isProbablyIncompleteCustomerReply(replyText);
            if (incompleteReplyMatched || orderSummaryBlocked) {
                logBlockedAiReply({
                    io,
                    reason: incompleteRetryReason,
                    originalLength: originalReplyLengthForBlockLog,
                    textWasEmpty: !String(replyText || "").trim(),
                    incompleteMatched: incompleteReplyMatched,
                    unsupportedClaim: unsupportedSmartSalesClaim,
                    repairReturnedEmpty,
                    pendingLatestCustomerAt: lastUserMsgTimestampSeconds,
                    lastDeliveredBotAt: lastDeliveredBotReplyAt,
                });
                replyText = "";
                unsafeReplySkipped = true;
            }
        }
        if (!customerReplyAlreadySent && shouldAdminHandleDifficultCustomer(userConfig)) {
            const escalationResult = await notifyAdminForEscalation({
                sock,
                userConfig,
                dataOwnerKey,
                sender,
                latestUserText: lastUserMsgText,
                replyText,
                historyArray,
                io,
            });
            if (escalationResult.sent) {
                await dbService.updateCustomerProfile(
                    dataOwnerKey,
                    sender,
                    buildCustomerAiPausePatch(
                        escalationResult.detection.reasons.join("; "),
                        Math.floor(Date.now() / 1000),
                        CUSTOMER_AI_PAUSE_CATEGORY_MANUAL_REVIEW
                    )
                ).catch(() => {});
                io?.emit("system-log", { type: "warning", msg: `AI paused for ${sender}; admin handoff required.` });
            }
        }
        if (customerReplyAlreadySent) {
            await dbService.updateCustomerProfile(dataOwnerKey, sender, buildAiFallbackClearedPatch()).catch(() => {});
            replyText = "";
        }
        if (!customerReplyAlreadySent && !replyText && !unsafeReplySkipped) {
            const priceObjectionReply = buildPriceObjectionReply({
                profile: effectiveProfile,
                history: historyArray,
                products,
                language: customerLanguage,
            });
            if (priceObjectionReply) {
                replyText = sanitizeCustomerFacingReply(priceObjectionReply, { responsePlan });
            }
        }
        if (replyText || (!voiceAlreadyHandled && !customerReplyAlreadySent)) {
            const latestProfileBeforeSend = await dbService.getCustomerProfile(dataOwnerKey, sender).catch(() => null);
            const latestStopState = getCustomerAutoReplyStopState(latestProfileBeforeSend || {});
            if (latestStopState.isStopped) {
                io?.emit("system-log", { type: "warning", msg: `AI reply skipped for ${sender.split("@")[0]} because auto-reply is stopped: ${latestStopState.message}.` });
                return false;
            }
        }
        
        if (replyText) {
            const latestMediaKindForGuard = latestImageUnderstanding?.useful || lastUserMsgHasImage
                ? "image"
                : ((latestAudioUnderstanding?.useful || lastUserMsgIsVoice)
                    ? "audio"
                    : (rememberedMediaUnderstanding?.useful ? rememberedMediaUnderstanding.kind : ""));
            const latestMediaContextUsefulForGuard = latestMediaKindForGuard === "image"
                ? (latestImageUnderstanding?.useful === true || rememberedMediaUnderstanding?.kind === "image")
                : (latestMediaKindForGuard === "audio"
                    ? (latestAudioUnderstanding?.useful === true || rememberedMediaUnderstanding?.kind === "audio")
                    : false);
            const originalGuardCandidateReply = sanitizeCustomerFacingReply(replyText, { responsePlan });
            const guardedReply = guardCustomerReply({
                replyText,
                latestUserText: lastUserMsgText,
                facts: { ...customerReplyFacts, businessTrainingText: promptAssembly.stablePrefix },
                businessType: userConfig?.business_type || botConfig?.business_type,
                latestMediaKind: latestMediaKindForGuard,
                latestMediaContextUseful: latestMediaContextUsefulForGuard,
                rememberedMediaContextUseful: Boolean(rememberedMediaReplyContextText),
            });
            if (guardedReply.blocked) {
                console.warn(`[ReplyQualityGuard] blocked=${guardedReply.reason} sender=${sender}`);
                io?.emit("system-log", { type: "warning", msg: `Reply quality guard blocked AI reply: ${guardedReply.reason}; attempting AI repair.` });
                let repairedAfterGuard = "";
                let repairBlockedReason = "";
                try {
                    const guardRepairSystemInstruction = `Output only one safe, complete customer-facing WhatsApp reply.
Reply according to the business training/instructions and latest customer message.
Do not echo the customer.
Do not ask for details already present in CRM/customer facts.
Do not include internal notes, tool status, summaries, or fallback/canned wording.
${buildGuardRepairInstruction(guardedReply.reason)}
${CONCISE_WHATSAPP_REPLY_RULES}`;
                    const guardRepairPrompt = [
                        `Rejected reply reason: ${guardedReply.reason}`,
                        `Rejected AI reply:\n${replyText}`,
                        `Latest customer language: ${customerLanguage}`,
                        `CRM/custom/order facts:\n${crmFirstContext}`,
                        customerReplyFacts.phone ? `Customer phone/WhatsApp number is already known: ${customerReplyFacts.phone}. Do not ask for phone/contact/WhatsApp number again.` : "",
                        effectiveChatSummary ? `Customer summary:\n${effectiveChatSummary}` : "",
                        `Latest customer message must be answered directly.`,
                    ].filter(Boolean).join("\n\n");
                    if (!replyText && guardedReply.reason === "duplicate_phone_question") {
                        throw new Error("guard_reply_missing_before_cleanup");
                    }
                    if (guardedReply.reason === "duplicate_phone_question") {
                        const cleanedOriginalReply = stripDuplicateKnownPhoneQuestionFromReply(originalGuardCandidateReply);
                        if (cleanedOriginalReply) {
                            const cleanedValidation = validateCompleteCustomerFacingText(cleanedOriginalReply);
                            if (cleanedValidation.ok
                                && !containsInternalReasoning(cleanedValidation.text)
                                && !isCustomerVisibleToolMetaText(cleanedValidation.text)
                                && !hasInventedPricing(cleanedValidation.text, promptAssembly.stablePrefix)) {
                                const cleanedGuard = guardCustomerReply({
                                    replyText: cleanedValidation.text,
                                    latestUserText: lastUserMsgText,
                                    facts: { ...customerReplyFacts, businessTrainingText: promptAssembly.stablePrefix },
                                    businessType: userConfig?.business_type || botConfig?.business_type,
                                    latestMediaKind: latestMediaKindForGuard,
                                    latestMediaContextUseful: latestMediaContextUsefulForGuard,
                                    rememberedMediaContextUseful: Boolean(rememberedMediaReplyContextText),
                                });
                                if (!cleanedGuard.blocked) {
                                    replyText = sanitizeCustomerFacingReply(cleanedGuard.replyText, { responsePlan });
                                    io?.emit("system-log", { type: "info", msg: "duplicate_phone_question_cleanup_applied=true" });
                                }
                            }
                        }
                    }
                    if (replyText) {
                        repairedAfterGuard = replyText;
                    } else {
                    io?.emit("system-log", { type: "info", msg: `reply_quality_repair_started issue=${String(guardedReply.reason || "guard_blocked").slice(0, 80)} attempt=1` });
                    repairedAfterGuard = await attemptAiReplyRecovery({
                        io,
                        accountId: userId,
                        botId: dataOwnerKey,
                        customerJid: sender,
                        customerTurnId,
                        providerCallId: `call_guard_${customerTurnId}_${Date.now()}`,
                        purpose: "customer_ai_reply_guard_repair",
                        systemInstruction: guardRepairSystemInstruction,
                        prompt: guardRepairPrompt,
                    });
                    if (repairedAfterGuard && !isProbablyIncompleteCustomerReply(repairedAfterGuard) && !isIncompleteOrderSummaryReply(repairedAfterGuard)) {
                        const repairedGuard = guardCustomerReply({
                            replyText: repairedAfterGuard,
                            latestUserText: lastUserMsgText,
                            facts: { ...customerReplyFacts, businessTrainingText: promptAssembly.stablePrefix },
                            businessType: userConfig?.business_type || botConfig?.business_type,
                            latestMediaKind: latestMediaKindForGuard,
                            latestMediaContextUseful: latestMediaContextUsefulForGuard,
                            rememberedMediaContextUseful: Boolean(rememberedMediaReplyContextText),
                        });
                        if (!repairedGuard.blocked) {
                            replyText = sanitizeCustomerFacingReply(repairedGuard.replyText, { responsePlan });
                        } else {
                            repairBlockedReason = repairedGuard.reason || "guard_repair_blocked";
                            replyText = "";
                            io?.emit("system-log", { type: "warning", msg: "reply_quality_repair_skipped reason=max_attempts_reached" });
                        }
                    } else {
                        repairBlockedReason = repairedAfterGuard ? "guard_repair_incomplete" : "guard_repair_empty";
                        replyText = "";
                        io?.emit("system-log", { type: "warning", msg: "reply_quality_repair_skipped reason=max_attempts_reached" });
                    }
                    }
                } catch (repairError: any) {
                    repairBlockedReason = `guard_repair_failed:${String(repairError?.message || "unknown").slice(0, 80)}`;
                    replyText = "";
                }
                if (!replyText && guardedReply.reason === "service_business_product_wording") {
                    const originalReplyValidation = validateCompleteCustomerFacingText(originalGuardCandidateReply);
                    const canKeepOriginalReply = originalReplyValidation.ok
                        && replySafety.reasonCategory !== "appointment_or_order_confirmation_risk"
                        && !containsInternalReasoning(originalReplyValidation.text)
                        && !isCustomerVisibleToolMetaText(originalReplyValidation.text)
                        && !hasInventedPricing(originalReplyValidation.text, promptAssembly.stablePrefix)
                        && canUseOriginalServiceBusinessReplyAfterGuardFailure({
                            replyText: originalReplyValidation.text,
                            latestUserText: lastUserMsgText,
                            facts: { ...customerReplyFacts, businessTrainingText: promptAssembly.stablePrefix },
                            businessType: userConfig?.business_type || botConfig?.business_type,
                            latestMediaKind: latestMediaKindForGuard,
                            latestMediaContextUseful: latestMediaContextUsefulForGuard,
                            rememberedMediaContextUseful: Boolean(rememberedMediaReplyContextText),
                        });
                    if (canKeepOriginalReply) {
                        replyText = originalReplyValidation.text;
                        repairBlockedReason = "";
                        io?.emit("system-log", { type: "info", msg: "service_business_product_wording_safe_original_kept=true" });
                    }
                }
                if (!replyText) {
                    const finalReason = repairBlockedReason === "guard_repair_incomplete" || repairBlockedReason === "guard_repair_empty" || guardedReply.reason === "duplicate_phone_question"
                        ? "ai_quality_repair_failed"
                        : repairBlockedReason || guardedReply.reason || "ai_quality_repair_failed";
                    unsafeReplySkipped = true;
                    logBlockedAiReply({
                        io,
                        reason: finalReason,
                        originalLength: originalReplyLengthForBlockLog,
                        textWasEmpty: !String(repairedAfterGuard || "").trim(),
                        incompleteMatched: repairedAfterGuard ? isProbablyIncompleteCustomerReply(repairedAfterGuard) : false,
                        repairReturnedEmpty: !String(repairedAfterGuard || "").trim(),
                        pendingLatestCustomerAt: lastUserMsgTimestampSeconds,
                        lastDeliveredBotAt: lastDeliveredBotReplyAt,
                    });
                    await markAiReplyPendingRetry({
                        dataOwnerKey,
                        userId,
                        sender,
                        eventId: lastUserMsgId,
                        reason: finalReason,
                        profile: effectiveProfile,
                        facts: customerReplyFacts,
                        matchingCrmLead,
                        io,
                    });
                    throw createAiReplyRetryableError(`AI reply guard repair failed: ${finalReason}`, finalReason);
                }
            } else {
                replyText = sanitizeCustomerFacingReply(guardedReply.replyText, { responsePlan });
            }
            const voicePlan = buildVoiceReplyPlan({
                replyMode: behavior,
                incomingMessageType: isIncomingVoice ? "voice" : (isIncomingImage ? "image" : "text"),
                customerTextOrTranscript: lastUserMsgText,
                savedCustomerPreference: effectiveProfile?.customerReplyPreference,
                voiceEnabled,
                aiRequestedVoiceReply,
                replyText,
            });
            const shouldSendVoice = voicePlan.sendVoice;
            const shouldSendText = voicePlan.sendText || sendTextAlongsideVoice;

            // If voice is already handled by a tool call, we don't need to do anything else for voice
            // but we might want to skip the text if it's the same content.
            
            if (shouldSendVoice && !voiceAlreadyHandled) {
                // Generate and send voice
                const geminiTtsClient = await ensureGeminiClient("reply_tts");
                const voiceResult = await processVoiceGeneration(sock, sender, replyText, userConfig, geminiTtsClient.localGenAI, io, dataOwnerKey, userId, effectiveVoicePreference, lastUserMsgId, geminiTtsClient.geminiProvider, skipPlatformAiUsageCharges);
                voiceAlreadyHandled = voiceResult.sent;
                voiceReplyMessageId = voiceResult.messageId || "";
                voiceReplyReceiptId = voiceResult.receiptId || "";
                voiceReplyFallbackReasonType = String(voiceResult.fallbackReasonType || "");
                voiceReplyFailureReason = String(voiceResult.failureReason || "");
                if (!voiceAlreadyHandled) {
                    io?.emit("system-log", { type: "warning", msg: `Voice reply was requested but delivery failed (${voiceResult.failureReason || "voice_reply_failed"}). Sending text fallback.` });
                }
            }
            const finalTextReply = shouldSendVoice && !voiceAlreadyHandled && voiceReplyFallbackReasonType
                ? buildVoiceDeliveryFallbackText(replyText, customerLanguage)
                : replyText;
            let postSendStartedAt = 0;

            // ONLY send text if voice wasn't handled OR if user specifically wants both (but current user said no)
            // We'll skip text if voice was handled to avoid duplication
            if (!voiceAlreadyHandled || shouldSendText) {
                const sentTextResult = await sendAiTextMessage({
                    sock,
                    sender,
                    text: finalTextReply,
                    userConfig,
                    userId,
                    dataOwnerKey,
                    customerTurnId,
                    eventId: lastUserMsgId || `ai-reply:${Date.now()}`,
                    contextType: "ai_text_reply",
                    actualProvider: effectiveProvider,
                    smartSalesUsed: smartSalesLayer.enabled,
                    smartSalesPromptVersion: smartSalesLayer.promptVersion,
                    skipPlatformAiUsageCharges: effectiveProvider === "client_custom_gemini",
                    humanDelayProfile: normalTextReplyFastPath ? "normal_text_fast" : "default",
                    extraAiCallsCount: getTurnExtraAiCallsCount(customerTurnId),
                    io,
                });
                const sentTextMessageId = String(sentTextResult.messageId || "");
                
                // Push to local history immediately
                historyArray.push({
                     key: { fromMe: true, remoteJid: sender, id: sentTextMessageId },
                     message: { conversation: finalTextReply }
                });
                postSendStartedAt = Date.now();
                await chargeCustomerReplyUsage({
                    userId,
                    botId: dataOwnerKey,
                    customerJid: sender,
                    eventId: lastUserMsgId,
                    messageId: sentTextMessageId || voiceReplyMessageId,
                    hasIncomingImage: isIncomingImage,
                    hasIncomingAudio: isIncomingVoice,
                    sentTextReply: true,
                    sentVoiceReply: voiceAlreadyHandled,
                    textReceiptId: sentTextResult.receiptId,
                    voiceReceiptId: voiceReplyReceiptId,
                    smartSalesUsed: false,
                    skipPlatformAiUsageCharges,
                });
                if (!voiceAlreadyHandled && voiceReplyFallbackReasonType) {
                    const fallbackReasonForLog = voiceReplyFailureReason === "no_working_tts_voice"
                        ? "no_working_tts_voice"
                        : voiceReplyFallbackReasonType;
                    io?.emit("system-log", { type: "warning", msg: `voice_reply_text_fallback_sent reason=${fallbackReasonForLog}` });
                    io?.emit("system-log", { type: "warning", msg: `tts_text_fallback_final reason=${fallbackReasonForLog}` });
                }
                io?.emit("system-log", {
                    type: "success",
                    msg: shouldSendVoice && voiceAlreadyHandled
                        ? `Text reply delivered. receipt=${String(sentTextResult.receiptId || "").slice(0, 12)} message=${sentTextMessageId.slice(0, 12)}`
                        : `Text reply delivered. receipt=${String(sentTextResult.receiptId || "").slice(0, 12)} message=${sentTextMessageId.slice(0, 12)}`
                });
            } else {
                // If we sent voice but skipped text, we STILL save to history so AI context stays intact
                historyArray.push({
                     key: { fromMe: true, remoteJid: sender, id: `voice-${Date.now()}` },
                     message: { conversation: replyText }
                });
                await dbService.saveMessage(dataOwnerKey, sender, "model", replyText, `voice-${Date.now()}`);
                postSendStartedAt = Date.now();
                await chargeCustomerReplyUsage({
                    userId,
                    botId: dataOwnerKey,
                    customerJid: sender,
                    eventId: lastUserMsgId,
                    messageId: voiceReplyMessageId,
                    hasIncomingImage: isIncomingImage,
                    hasIncomingAudio: isIncomingVoice,
                    sentTextReply: false,
                    sentVoiceReply: voiceAlreadyHandled,
                    voiceReceiptId: voiceReplyReceiptId,
                    smartSalesUsed: smartSalesLayer.enabled,
                    smartSalesPromptVersion: smartSalesLayer.promptVersion,
                    skipPlatformAiUsageCharges,
                });
                console.log(`[AI-Process] Skipped text reply because voice was sent (Mode: ${behavior})`);
            }
            if (combinedMemorySummaryForSave) {
                runPostReplyBackgroundTask(io, "combined_reply_memory_save", async () => {
                    const latestProfileForMemory = await dbService.getCustomerProfile(dataOwnerKey, sender).catch(() => effectiveProfile || {});
                    const existingSummary = cleanCustomerBusinessSummary(latestProfileForMemory?.chatSummary || "", 2500);
                    const mergedSummary = cleanCustomerBusinessSummary(mergeCustomerMemorySummary(existingSummary, combinedMemorySummaryForSave, {
                        preferCandidate: true,
                        dropGenericFallbackWhenCandidateSpecific: true,
                    }), 2500);
                    const memoryQuality = runCustomerSummaryQualityGate(mergedSummary);
                    if (memoryQuality.accepted) {
                        await dbService.updateCustomerProfile(dataOwnerKey, sender, {
                            chatSummary: memoryQuality.summary,
                            chatSummaryUpdatedAt: Math.floor(Date.now() / 1000),
                            chatSummarySource: "combined_reply_memory",
                            chatSummaryFallbackReason: "",
                            chatSummaryFallbackAt: 0,
                            ...(lastUserMsgTimestampSeconds ? { chatSummaryLastMessageAt: lastUserMsgTimestampSeconds } : {}),
                            ...(latestProfileForMemory?.latestOrderRef ? { chatSummaryOrderRef: latestProfileForMemory.latestOrderRef } : {}),
                        });
                        io?.emit("system-log", { type: "info", msg: "Updated customer memory from combined reply." });
                    } else {
                        console.warn(`[CombinedReplyMemory] quality_gate_rejected reason=${memoryQuality.reasons.join(",") || "unknown"}`);
                    }
                });
            }
            if (normalTextReplyFastPath) {
                runPostReplyBackgroundTask(io, "customer_intelligence_scan", async () => {
                    await maybeRunCustomerIntelligenceScan({
                        sock,
                        accountId: userId,
                        botId: dataOwnerKey,
                        dataOwnerKey,
                        customerJid: sender,
                        pushName: String(effectiveProfile?.pushName || effectiveProfile?.name || ""),
                        botConfig,
                        existingProfile: effectiveProfile,
                    });
                });
            }
            if (deferCrmLeadSync) {
                runPostReplyBackgroundTask(io, "crm_lead_sync", async () => {
                    const latestProfile = await dbService.getCustomerProfile(dataOwnerKey, sender).catch(() => effectiveProfile || {}) || effectiveProfile || {};
                    const latestLeadRows = await listCrmLeads(dataOwnerKey);
                    const latestMatchingCrmLead = findMatchingCrmLead(latestLeadRows, {
                        customerJid: sender,
                        profile: latestProfile,
                        activeRecord: activeRecordForReplyQuality,
                    });
                    const latestCustomerReplyFacts = extractKnownCustomerFacts({
                        profile: latestProfile,
                        activeRecord: activeRecordForReplyQuality,
                        structuredState: structuredDraftState,
                        crmLead: latestMatchingCrmLead,
                        customerJid: sender,
                        accountId: userId || dataOwnerKey,
                        botId: dataOwnerKey,
                        businessType: userConfig?.business_type || botConfig?.business_type,
                    });
                    await upsertCrmLead(dataOwnerKey, {
                        id: latestMatchingCrmLead?.id,
                        botId: dataOwnerKey,
                        customerJid: sender,
                        phone: latestCustomerReplyFacts.phone || sender,
                        name: latestCustomerReplyFacts.customerName,
                        city: latestCustomerReplyFacts.cityOrLocation,
                        location: latestCustomerReplyFacts.cityOrLocation,
                        source: latestCustomerReplyFacts.source || "WhatsApp",
                        status: latestMatchingCrmLead?.status || "AI Replied",
                        dealStage: latestCustomerReplyFacts.dealStage || latestMatchingCrmLead?.dealStage || "Lead",
                        assignedTo: latestCustomerReplyFacts.assignedUser,
                        productInterest: latestCustomerReplyFacts.productOrService,
                        budget: latestCustomerReplyFacts.budget,
                        quantity: latestCustomerReplyFacts.quantity,
                        notes: [
                            latestCustomerReplyFacts.recentNotes,
                            lastUserMsgText ? `Latest customer message: ${compactAiText(lastUserMsgText, 180)}` : "",
                        ].filter(Boolean).join("\n").slice(0, 1200),
                        latestActivityAt: Math.floor(Date.now() / 1000),
                    });
                });
            }
            await dbService.updateCustomerProfile(
                dataOwnerKey,
                sender,
                buildAiFallbackClearedPatch()
            ).catch(() => {});
            emitReplyTimingLog(io, `reply_timing_post_send_ms=${Math.max(0, Date.now() - postSendStartedAt)}`);
            emitReplyTimingLog(io, `reply_timing_total_ms=${Math.max(0, batchWaitMs + (Date.now() - replyPipelineStartedAt))}`);
            
            return true;
        } else if (!voiceAlreadyHandled && !customerReplyAlreadySent) {
             io?.emit("system-log", { type: "warning", msg: "⚠️ AI returned empty text reply." });
             console.warn("[AI-Process] AI returned empty text reply.");
             if (unsafeReplySkipped) {
                const finalReason = "unsafe_or_incomplete_after_repair";
                io?.emit("system-log", { type: "warning", msg: `ai_reply_blocked_reason reason=${finalReason} customer_reply_sent=false pending_retry=true` });
                throw createAiReplyRetryableError("AI reply was unsafe or incomplete after repair", finalReason);
             }
             io?.emit("system-log", { type: "warning", msg: "ai_reply_blocked_reason reason=empty_ai_reply" });
             throw createAiReplyRetryableError("AI returned empty text reply.", "empty_ai_reply");
        }
        return customerReplyAlreadySent || voiceAlreadyHandled;
    } catch(err: any) {
        if (isAiReplySupersededError(err)) {
            console.warn(`[MissedMsg] AI reply superseded for ${sender}: newer customer message arrived before send.`);
            io?.emit("system-log", { type: "info", msg: "Older pending reply merged into newer customer message batch." });
            return false;
        }
        if (isTransientAiProviderError(err) || isAiReplyRetryableError(err)) {
            const reason = String(err?.retryReason || err?.message || "retryable_ai_reply_failure").slice(0, 160);
            console.warn(`[MissedMsg] AI reply pending retry for ${sender}: ${reason}`);
            io?.emit("system-log", { type: "warning", msg: `pending_ai_reply_retry reason=${reason}` });
            throw err;
        }
        console.error("[MissedMsg] AI Error:", err.message);
        io?.emit("system-log", { type: "error", msg: `❌ AI Error: ${err.message}` });
        if (!shouldAdminHandleDifficultCustomer(userConfig)) {
            return false;
        }
        await notifyAdminForEscalation({
            sock,
            userConfig,
            dataOwnerKey,
            sender,
            latestUserText: lastUserMsgText,
            replyText: `AI Error: ${err.message}`,
            historyArray,
            io,
        }).catch(() => {});
    }
    return false;
}
