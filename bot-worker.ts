import { isIncomingNotification } from './src/connections/incoming';


import express from "express";
import path from "path";

console.log(`[Worker] Process ${process.pid} booting for Bot: ${process.env.BOT_ID} on Port: ${process.env.PORT}`);

import http from "http";
import cookieParser from "cookie-parser";
import cors from "cors";
import { Server } from "socket.io";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import * as Baileys from "@whiskeysockets/baileys";
import pino from "pino";
import QRCode from "qrcode";
import { processAutomaticWelcomeSequence, processShortcut } from "./src/services/sequence-manager.ts";
import { deliverWelcomeSequence, resolveRuntimeWelcomePayload } from "./src/services/welcome-sequence-delivery-service.ts";
import { deliverSequenceGroup, resolveRuntimeSequencePayload as resolveRuntimeSequencePayloadGroup } from "./src/services/sequence-delivery-service.ts";
import fs from "fs";
import * as dbService from './src/services/db-service.ts';
import { resolveAccountDataOwnerKey } from './src/services/account-data-owner.ts';
import { describeManualMediaMessage } from './src/services/manual-media-context.ts';
import { getManualMessageInsight, isProgrammaticOutboundMessage } from './src/services/manual-message.ts';
import { learnFromManualOutboundMessage } from './src/services/manual-outbound-learning.ts';
import { createTrackedWhatsAppSocket } from './src/services/tracked-whatsapp-socket.ts';
import { getReadableMessageContent, isIgnorableWhatsappMessage } from './src/services/whatsapp-message-content.ts';
import {
  buildAutomationBillingEventId,
  buildAutomationTemplateKey,
  canSendBillableAutomation,
} from './src/services/automation-send-billing-service.ts';
import { buildContactIdentityUpdates, buildLidMappingIdentityUpdate } from './src/services/contact-identity-service.ts';
import {
  PHONE_NUMBER_SHARE_WINDOW_SECONDS,
  extractPhoneNumberFromText,
  extractSharedPhoneNumber,
  isNativePhoneNumberShareMessage,
} from './src/services/phone-number-consent-service.ts';
import { getPhoneNumberRequestDecision } from './src/services/phone-number-request-policy.ts';
import {
  saveSharedPhoneNumberConsent,
  sendPhoneNumberRequestIfNeeded,
} from './src/services/phone-number-recovery-flow.ts';
import { buildAdminGuidanceAction } from './src/services/admin-guidance-service.ts';
import { resolveAdminIdentityContext } from './src/services/admin-identity-service.ts';
import { verifyAdminPairingChallenge } from './src/services/admin-pairing-service.ts';
import { handleAdminBusinessAssistantMessage } from './src/services/admin-business-assistant-router.ts';
import { startAdminReminderScheduler } from './src/services/admin-reminder-service.ts';
import { isWorkerInternalRequest } from './src/services/worker-internal-auth-service.ts';
import { registerWorkerPort, unregisterWorkerPort } from './src/services/worker-port-registry-service.ts';
import { buildCustomerDisplayName, isUsableCustomerName } from './src/services/customer-display-name-service.ts';
import {
  isExactResetCommand,
  isAuthorizedResetSender,
  getMessageTimestampMs,
  filterMessagesAfterReset,
  filterHydrationStoresAndGroups,
  recordGroupResetTimestamp,
  serializeTemplateStoreWithMeta,
} from './src/content-library/content-library-reset-service.ts';
import { deriveMediaShortTitle } from './src/content-library/content-library-model.ts';
import {
  resolveCanonicalContactIdentity,
  recordLidPnMapping,
} from './src/services/whatsapp-contact-identity-resolver.ts';
import { hydrateSharedPhoneForCustomer, publishSharedPhoneIdentity } from './src/services/shared-phone-directory-service.ts';
import { syncInstanceNumberToMainBlacklist } from './src/services/main-account-blacklist-service.ts';
import { isMutedCustomer, removeMutedNumbers } from './src/services/muted-number-service.ts';
import {
  buildCustomerReplyControlPatch,
  describeCustomerReplyControl,
  getCustomerReplyPauseReason,
  parseCustomerReplyControlCommand,
} from './src/services/customer-reply-control-service.ts';
import { applyCustomerReplyControlToLinkedProfiles } from './src/services/customer-reply-control-apply-service.ts';
import {
  buildCallRejectionMessage,
  getCallChatJid,
  getCallRejectFromJid,
  isEnabledFlag,
  isIncomingCallOffer,
  shouldRejectIncomingCall,
} from './src/services/call-reply-mode-service.ts';
import { getSequenceFlag } from './src/services/sequence-trigger-service.ts';
import { getSequenceStatusBlockReason } from './src/services/sequence-delivery-guard-service.ts';
import { describeTemplateForHistory } from './src/services/sequence-delivery-log-service.ts';
import { buildStaticFollowupMessage } from './src/services/followup-message-service.ts';
import { chargeBillableOutboundText, previewBillableOutboundText } from './src/services/outbound-message-billing-service.ts';
import { readOutboundReceipt } from './src/services/outbound-send-receipt-service.ts';
import { sendMarketingFollowupMessage } from './src/services/marketing-followup-send-service.ts';
import { sendUniversalOutboundText } from './src/services/universal-outbound-send-service.ts';
import { findActiveBindingForGroup, ingestGroupMessage } from './src/services/workspace-service.ts';
import {
  claimDueRecipientJobs,
  markRecipientJobResult,
} from './src/services/customer-update-list-campaign-service.ts';
import { sendUniversalAutomationRelay } from './src/services/universal-automation-relay-service.ts';
import {
  isSequenceItemDelivered,
  normalizeSequenceItemResult,
  summarizeSequenceItemResults,
} from './src/services/sequence-delivery-result-service.ts';
import {
  buildSequenceProgressClearPatch,
  buildSequenceProgressPatch,
  getPendingSequenceItemIndexes,
  getSequenceProgressKey,
} from './src/services/sequence-progress-service.ts';
import {
  buildCourierBroadcastSummary,
  getCourierErrorMessage,
  parseCourierTrackingIds,
  sanitizeCourierText,
  type CourierBroadcastItemResult,
} from './src/services/courier-broadcast-service.ts';
import { buildAiSmartFollowupMessageWithMeta } from './src/services/ai-smart-followup-service.ts';
import { appendSmartSalesDecisionLog } from './src/services/smart-sales-engine-service.ts';
import { normalizeFollowupCampaignType } from './src/services/followup-campaign-type-service.ts';
import { assertCompleteCustomerFacingText } from './src/services/customer-facing-message-guard-service.ts';
import { createReplyPipelineTrace } from './src/services/whatsapp-reply-pipeline-tracer.ts';
import { checkFollowupStaleByLastMessage } from './src/services/followup-stale-guard-service.ts';
import { waitRandomSequenceDelay } from './src/services/sequence-delay-service.ts';
import {
  buildCustomerAiResumePatch,
  getCustomerAutoReplyStopState,
  isCustomerAiPaused,
  shouldAdminHandleDifficultCustomer,
} from './src/services/difficult-customer-mode-service.ts';
import {
  MISSED_MESSAGE_CHECK_INTERVAL_MS,
  MISSED_MESSAGE_GRACE_SECONDS,
  MISSED_MESSAGE_LOOKBACK_SECONDS,
  MISSED_MESSAGE_STARTUP_DELAY_MS,
  MISSED_MESSAGE_SWEEP_BATCH_SIZE,
  MISSED_MESSAGE_SWEEP_PAUSE_MS,
  buildSyntheticHistoryFromDb,
  findLatestIncomingMessage,
  getLatestCustomerRecoveryCandidate,
  getMessageTimestampSeconds,
  getProfileLastBotSeconds,
  mergeRecoveryHistories,
  normalizeCustomerJid,
} from './src/services/missed-message-recovery.ts';
import {
  MESSAGE_BATCH_MAX_PENDING_AUDIO_MESSAGES,
  MESSAGE_BATCH_MAX_PENDING_MEDIA_MESSAGES,
  MESSAGE_BATCH_MAX_PENDING_MESSAGES,
  buildBatchMessageCursor,
  classifyInboundMessageKind,
  collectPendingInboundMessageBatch,
  getMessageBatchDelayProfile,
  isRealInboundCustomerMessage,
  summarizePendingBatch,
} from './src/services/customer-message-batch-service.ts';
import {
  isTerminalBatchRecorded,
  loadCustomerMessageBatchState,
  saveCustomerMessageBatchState,
  withActiveBatchState,
  withBaselineHandledMessages,
  withHandledBatchMessages,
  type CustomerMessageBatchState,
} from './src/services/customer-message-batch-state-service.ts';
import {
  CUSTOMER_CONVERSATION_LEDGER_LIMIT,
  GROUP_CONVERSATION_LEDGER_LIMIT,
  TEMPLATE_CONVERSATION_LEDGER_LIMIT,
  appendMessageToConversationLedger,
} from './src/services/conversation-ledger.ts';
import {
  buildForcedMissedReplyHistory,
  describeForcedMissedReplyTarget,
  FORCE_REPLY_PENDING_DELIVERY_REASON,
  isMissedReplyForceShortcutText,
} from './src/services/missed-message-force-shortcut.ts';
import { composeImplicitCacheInstruction, logGeminiCacheTelemetry } from './src/services/gemini-cache-service.ts';
import {
  emitLiveConsoleEvent,
  listLiveConsoleEvents,
  setLiveConsoleEventBroadcaster,
} from './src/services/live-console-event-service.ts';
import { createGeminiClient } from './src/services/gemini-provider-service.ts';
import { generateWithClientGeminiCacheAware } from './src/services/client-gemini-cache-aware-generation-service.ts';
import { buildVoiceNoteHistoryText } from './src/services/voice-note-history-service.ts';
import { decideTrivialAiRoute, classifyCustomerText } from './src/services/customer-ai-router-service.ts';
import { buildProductFirstReply, findStrongMediaTemplate } from './src/services/product-first-router-service.ts';
import {
  isSafeModeDisableStartupBaselineScanEnabled,
  isSafeModeDisableStartupUnrepliedSweepEnabled,
  isSafeModeEnabled,
} from './src/services/safe-mode-config-service.ts';
import { verifyWhatsAppNumberLock } from './src/services/whatsapp-number-lock.ts';
import {
  cloudWebhookEventToInternalIncomingMessage,
  cloudWebhookStatusToInternalStatus,
  summarizeCloudApiInboundAdapterResult
} from "./src/services/whatsapp-cloud-api-inbound-adapter.ts";
import {
  createCloudWebhookDeduper,
  getCloudWebhookDedupKey,
  summarizeCloudWebhookDedupResult
} from "./src/services/whatsapp-cloud-api-webhook-dedup.ts";
import {
  claimCloudInboundMessage,
  updateCloudInboundMessageState,
} from "./src/services/whatsapp-cloud-api-durable-dedup.ts";
import { recordCloudWebhookActivity } from "./src/services/whatsapp-cloud-api-health-service.ts";
import { isCustomerChatJid, isStatusBroadcastJid, normalizeWhatsAppJid, resolveCustomerChatJid } from './src/utils/whatsapp-jid.ts';
import { resolveWhatsAppProxyUrl } from './src/services/whatsapp-proxy-resolver.ts';
import { parsePlannedCustomerUpdate } from './src/services/customer-update-schedule-service.ts';
import { maybeSaveBackInStockReminder } from './src/services/customer-update-intent-service.ts';
import { buildBackInStockUpdateMessage } from './src/services/customer-update-message-service.ts';
import { releaseUnconnectedProxyLease } from './src/services/proxy-lease-service.ts';
import { resolveCampaignSendingInstance } from './src/services/campaign-sending-instance-service.ts';
import { sanitizeProxyErrorMessage, shouldTreatAsGenericProxyFailure } from './src/services/proxy-health-service.ts';
import { buildWhatsAppConnectionRetryState } from './src/services/whatsapp-connection-retry-state-service.ts';
import { BACKGROUND_AI_MODEL, CUSTOMER_AI_MODEL, compactAiText } from './src/services/ai-cost-control-service.ts';
import { resolveAiModelForPurpose } from './src/services/ai-model-routing-service.ts';
import { CONCISE_WHATSAPP_REPLY_RULES, sanitizeCustomerFacingReply } from './src/services/reply-style-service.ts';
import { isTransientAiProviderError } from './src/services/transient-ai-error-service.ts';
import { notifyAdminForEscalation } from './src/services/admin-escalation-service.ts';
import { handleIrrelevantCustomer } from './src/services/irrelevant-customer-service.ts';
import { assertCustomerFacingSendAllowed } from './src/services/customer-facing-send-guard-service.ts';
import {
  buildAiReplyBlockedAlertMessage,
  canAccountUseBotForAiReply,
  shouldSendAiReplyBlockedAlert,
  type AccountAiReplyEligibility,
} from './src/services/account-ai-reply-eligibility-service.ts';
import {
  AI_REPLY_RETRY_ADMIN_ALERT_ATTEMPTS,
  AI_REPLY_RETRY_INTERVAL_MS,
  dueAiReplyRetries,
  claimAiReplyRetryForWorker,
  releaseAiReplyRetryWorkerClaim,
  getCustomerFacingAiDeliveryEvidence,
  getAiReplyRetryDelayMinutes,
  markAiReplyRetryAttempt,
  markAiReplyRetryAdminAlerted,
  markAiReplyRetryBillingBlocked,
  markAiReplyRetryDelivered,
  markAiReplyRetryFailed,
  markAiReplyGeneratedPendingSend,
  markAiReplyRetryPaused,
  markAiReplyRetryWaitingProvider,
  isDeliveredAfterLatestPendingCustomerMessage,
  pruneAiReplyRetryQueue,
  queueAiReplyRetry,
  resumeBlockedAiReplyRetry,
  resumePausedAiReplyRetriesForCustomer,
  shouldStopAiReplyRetry,
  supersedeAiReplyRetriesForCustomer,
  type PendingAiReplyRetry,
} from './src/services/ai-retry-schedule-service.ts';
import {
  scheduleNextAutoFollowup,
  cancelAutoFollowupOnCustomerReply,
  processDueAutoFollowups,
} from './src/services/intelligent-auto-followup-service.ts';
import { loadAiReplyRetryQueue, saveAiReplyRetryQueue } from './src/services/ai-retry-persistence-service.ts';
import {
  processBillingBlockedAdminAlert,
  clearBillingAdminAlertState,
} from './src/services/billing-blocked-admin-alert-service.ts';
import {
  canProcessInboundAiMessage,
  closePendingAiRepliesForBot,
  resolveBotAiChatReplyMode,
} from './src/services/bot-ai-chat-reply-mode-service.ts';
import { isPersonalInstance } from './src/services/instance-purpose-service.ts';
import { ingestPersonalContactInboundMessage } from './src/services/personal-contact-service.ts';
import { handleIncomingPersonalAssistantMessage } from './src/services/personal-incoming-reply-service.ts';
import { routePersonalInboundMessage } from './src/services/personal-outbound-routing-service.ts';
import { createAiReplyRetryableError, getAiReplyRetryMetadata, getAiReplyRetryReason, isAiReplyRetryableError } from './src/services/ai-reply-retry-error-service.ts';
import { createWhatsAppOutboundSender } from "./src/services/whatsapp-outbound-sender.ts";
import { decryptServerSecret } from "./src/services/secret-crypto-service.ts";
import { resolveCloudApiRuntimeConfig, summarizeCloudApiRuntimeConfig } from "./src/services/whatsapp-cloud-api-runtime-config.ts";
import { createWhatsAppCloudApiRuntimeProvider, summarizeCloudApiRuntimeProviderResult } from "./src/services/whatsapp-cloud-api-runtime-provider.ts";
import type { WhatsAppTransportProvider } from "./src/services/whatsapp-transport-types.ts";
import { createCloudApiTrackedSender } from "./src/services/whatsapp-cloud-api-tracked-sender.ts";
import type { CloudApiTrackedSender } from "./src/services/whatsapp-cloud-api-tracked-sender.ts";
import {
  cloudIncomingMessageToLocalHistoryMessage,
  summarizeCloudLocalHistoryMessage,
} from "./src/services/whatsapp-cloud-api-local-history-adapter.ts";
import {
  scheduleOrExecuteReadReceipt,
  cancelPendingReadsForInstance,
} from "./src/services/whatsapp-delayed-read-service.ts";
import * as shippingService from "./src/services/shipping-service.ts";
import * as inventoryService from "./src/services/inventory-service.ts";
import { resolveBackInStockTarget } from "./src/services/stock-reminder-target-service.ts";
import * as aiHandler from "./src/services/ai-handler.ts";
import {
  claimCrossIdentityMessage,
  recordVerifiedCustomerAlias,
} from "./src/services/customer-identity-resolver-service.ts";
import NodeCache from "node-cache";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const lamejs = require("lamejs");
const TRUSTED_APP_ORIGINS = new Set([
  "https://blackarrow-source.offline.invalid",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);
const manualSendRateStore = new Map<string, { count: number, resetAt: number }>();

// Fix lamejs ReferenceError: MPEGMode is not defined and other missing globals
try {
  (global as any).MPEGMode = require("lamejs/src/js/MPEGMode.js");
  (global as any).Lame = require("lamejs/src/js/Lame.js");
  (global as any).BitStream = require("lamejs/src/js/BitStream.js");
} catch (e) {
  console.error("Failed to inject lamejs globals", e);
}



const msgRetryCounterCache = new NodeCache();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = pino({ level: "silent" });

// Config Persistence
const CONFIG_FILE = path.join(__dirname, `bot_config_${process.env.BOT_ID}.json`);
let botConfig: {
  prompt: string;
  autoReply: boolean;
  ai_chat_replies_enabled?: boolean;
  ai_chat_replies_enabled_at?: number;
  ai_chat_replies_disabled_at?: number;
  googleSheetWebhookUrl?: string;
  groups?: { name: string, purpose: string, instructions?: string, jid?: string, shortcut_code?: string | null, templateCount?: number, autoSync?: boolean, trigger_keywords?: string }[];
  botVoice?: string;
  botGender?: string;
  botName?: string;
  preferredLanguage?: string;
  customFields?: { name: string, instructions: string }[];
  business_type?: string;
  reply_behavior?: string;
  reply_in_groups?: number;
  human_delay_enabled?: number;
  voice_simulation_enabled?: number;
  reject_calls?: number;
  learned_instructions?: string;
  followup_enabled?: number;
  auto_followup_enabled?: number;
  followup_hours?: number;
  followup_offer_context?: string;
  followups_json?: string;
  muted_numbers?: string[];
  autoReloadEnabled?: number;
  autoReloadMinutes?: number;
  difficult_customer_mode?: string;
  delayed_read_receipts_enabled?: boolean | number | string;
  delayedReadReceiptsEnabled?: boolean | number | string;
  read_receipt_delay_seconds?: number | string;
  readReceiptDelaySeconds?: number | string;
  groupResetAt?: Record<string, number>;
} = {
  prompt: "You are a helpful and friendly sales assistant. Always stay polite, professional, and clear. Default to natural English unless the customer clearly prefers another language.",
  autoReply: true,
  botVoice: "Aoede",
  botGender: "female",
  botName: "",
  preferredLanguage: "English",
  customFields: [],
  business_type: "products",
  reply_behavior: "text_preferred",
  reply_in_groups: 0,
  human_delay_enabled: 1,
  voice_simulation_enabled: 1,
  reject_calls: 0,
  learned_instructions: "",
  followup_enabled: 0,
  auto_followup_enabled: 0,
  followup_hours: 12,
  followup_offer_context: "",
  difficult_customer_mode: "admin_pause",
  muted_numbers: []
};

function sanitizeBotConfigSecrets(config: any) {
  if (!config || typeof config !== "object") return config;
  const clean = { ...config };
  const secretKeys = new Set([
    "accesstoken",
    "access_token",
    "token",
    "rawtoken",
    "apikey",
    "api_key",
    "secret",
    "clientsecret",
    "client_secret",
    "appsecret",
    "app_secret",
    "encryptedaccesstokenref",
    "encrypted_access_token_ref",
    "webhookverifytoken",
    "webhook_verify_token"
  ]);
  for (const key of Object.keys(clean)) {
    if (secretKeys.has(key.toLowerCase())) {
      delete clean[key];
    }
  }
  return clean;
}

let cloudApiRuntimeProvider: WhatsAppTransportProvider | null = null;
let cloudApiTrackedSender: CloudApiTrackedSender | null = null;

let providerRuntimeState = {
  providerType: "whatsapp_web",
  cloudApiSetupSaved: false,
  cloudApiRuntimeReady: false,
  cloudApiRuntimeEnabled: false,
  cloudApiProviderHydrated: false,
  cloudApiTrackedSenderHydrated: false,
  activeRuntimeProvider: "whatsapp_web",
  phoneNumberId: undefined as string | undefined,
  businessAccountId: undefined as string | undefined,
  missingCloudApiFields: [] as string[],
  readinessReason: "provider_not_cloud_api" as string | undefined,
};

async function hydrateProviderConfigFromDatabase() {
  const botId = process.env.BOT_ID;
  if (!botId) return;
  try {
    const providerConfig = await dbService.getBotProviderConfig(botId);

    // Resolve Cloud API readiness using injected decryption
    const resolution = await resolveCloudApiRuntimeConfig(providerConfig, {
      decryptSecret: decryptServerSecret,
    });
    // Log using only safe summaries
    const safeSummary = summarizeCloudApiRuntimeConfig(resolution);
    console.log(`[Config] Resolved Cloud API runtime readiness for ${botId}:`, JSON.stringify(safeSummary));

    if (providerConfig && providerConfig.providerType === "whatsapp_cloud_api") {
      let builderResult = null;
      if (resolution.runtimeEnabled) {
        builderResult = createWhatsAppCloudApiRuntimeProvider({
          runtimeConfig: resolution,
          timeoutMs: 15000,
          logger: {
            info: (msg: string) => console.log(`[CloudApiProvider] ${msg}`),
            warn: (msg: string) => console.warn(`[CloudApiProvider] ${msg}`),
            error: (msg: string) => console.error(`[CloudApiProvider] ${msg}`),
          }
        });
      }

      if (builderResult && builderResult.enabled) {
        cloudApiRuntimeProvider = builderResult.provider;
        const providerSummary = summarizeCloudApiRuntimeProviderResult(builderResult);
        console.log(`[Config] Hydrated Cloud API runtime provider:`, JSON.stringify(providerSummary));

        // Hydrate tracked sender with deterministic instance compatibility identity
        const botIdentityJid = `cloud_${botId}@internal`;
        cloudApiTrackedSender = createCloudApiTrackedSender({
          cloudProvider: cloudApiRuntimeProvider,
          sentIds: botSentMessageIds,
          botIdentityJid,
          logger: {
            info: (msg: string) => console.log(`[CloudTrackedSender] ${msg}`),
            warn: (msg: string) => console.warn(`[CloudTrackedSender] ${msg}`),
            error: (msg: string) => console.error(`[CloudTrackedSender] ${msg}`),
          }
        });

        providerRuntimeState = {
          providerType: "whatsapp_cloud_api",
          cloudApiSetupSaved: true,
          cloudApiRuntimeReady: true,
          cloudApiProviderHydrated: true,
          cloudApiTrackedSenderHydrated: true,
          cloudApiRuntimeEnabled: true,
          activeRuntimeProvider: "whatsapp_cloud_api",
          phoneNumberId: builderResult.phoneNumberId,
          businessAccountId: providerConfig.businessAccountId,
          missingCloudApiFields: [],
          readinessReason: resolution.reason || "ready",
        };
      } else {
        cloudApiRuntimeProvider = null;
        cloudApiTrackedSender = null;
        if (builderResult) {
          const providerSummary = summarizeCloudApiRuntimeProviderResult(builderResult);
          console.log(`[Config] Cloud API runtime provider build failed/disabled:`, JSON.stringify(providerSummary));
        }

        providerRuntimeState = {
          providerType: "whatsapp_cloud_api",
          cloudApiSetupSaved: !!providerConfig.phoneNumberId,
          cloudApiRuntimeReady: false,
          cloudApiProviderHydrated: false,
          cloudApiTrackedSenderHydrated: false,
          cloudApiRuntimeEnabled: false,
          activeRuntimeProvider: "whatsapp_cloud_api",
          phoneNumberId: providerConfig.phoneNumberId,
          businessAccountId: providerConfig.businessAccountId,
          missingCloudApiFields: resolution.missingFields || (
            resolution.reason === "missing_phone_number_id"
              ? ["phoneNumberId"]
              : resolution.reason === "missing_token_ref"
                ? ["encryptedAccessTokenRef"]
                : []
          ),
          readinessReason: builderResult ? builderResult.reason : (resolution.reason || "unknown"),
        };
      }
    } else {
      cloudApiRuntimeProvider = null;
      cloudApiTrackedSender = null;
      providerRuntimeState = {
        providerType: "whatsapp_web",
        cloudApiSetupSaved: false,
        cloudApiRuntimeReady: false,
        cloudApiProviderHydrated: false,
        cloudApiTrackedSenderHydrated: false,
        cloudApiRuntimeEnabled: false,
        activeRuntimeProvider: "whatsapp_web",
        phoneNumberId: undefined,
        businessAccountId: undefined,
        missingCloudApiFields: [],
        readinessReason: "provider_not_cloud_api",
      };
    }
  } catch (e: any) {
    console.error("[Config] Failed hydrating provider config from database:", e?.message || e);
  }
}

if (fs.existsSync(CONFIG_FILE)) {
  try {
    botConfig = sanitizeBotConfigSecrets(JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8")));
  } catch (e) {}
}

async function hydrateBotConfigFromDatabase() {
  const botId = process.env.BOT_ID;
  if (!botId) return;
  try {
    const dbConfig = await dbService.loadBotConfig(botId);
    if (dbConfig && typeof dbConfig === "object") {
      botConfig = sanitizeBotConfigSecrets({ ...botConfig, ...dbConfig });
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(botConfig));
      console.log(`[Config] Loaded instance config for ${botId} from database.`);
    }
    const userId = process.env.USER_ID;
    if (userId) {
      try {
        const userConfig = await dbService.loadUserConfig(userId);
        if (Array.isArray(userConfig?.groups) && userConfig.groups.length > 0) {
          const existingGroupJids = new Set((botConfig?.groups || []).map((g: any) => g.jid).filter(Boolean));
          const mergedGroups = [...(botConfig?.groups || [])];
          let didAdd = false;
          for (const ug of userConfig.groups) {
            if (ug && ug.jid && !existingGroupJids.has(ug.jid)) {
              mergedGroups.push(ug);
              didAdd = true;
            }
          }
          if (didAdd) {
            botConfig.groups = mergedGroups;
            fs.writeFileSync(CONFIG_FILE, JSON.stringify(botConfig));
            console.log(`[Config] Merged ${mergedGroups.length} configured groups from userConfig into botConfig.`);
          }
        }
      } catch {}
    }
    await hydrateProviderConfigFromDatabase();
  } catch (e: any) {
    console.error("[Config] Failed loading instance config from database:", e?.message || e);
  }
}

function firstPresent(...values: any[]) {
  return values.find(value => value !== undefined && value !== null && value !== "");
}

function normalizeOriginValue(rawOrigin: string | undefined) {
  const value = String(rawOrigin || "").trim();
  if (!value) return "";
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

function isTrustedAppOrigin(rawOrigin: string | undefined) {
  const origin = normalizeOriginValue(rawOrigin);
  return !!origin && TRUSTED_APP_ORIGINS.has(origin);
}

function isLoopbackAddress(rawAddress: string | undefined) {
  const value = String(rawAddress || "").trim().replace(/^::ffff:/, "");
  return value === "127.0.0.1" || value === "::1" || value === "::ffff:127.0.0.1";
}

function isWorkerRequestAllowed(req: any) {
  return isLoopbackAddress(req.socket?.remoteAddress) || isTrustedAppOrigin(req.get?.("origin"));
}

function checkManualSendRateLimit() {
  const key = `manual-send:${process.env.USER_ID || "unknown"}:${process.env.BOT_ID || "unknown"}`;
  const currentTime = Date.now();
  const existing = manualSendRateStore.get(key);
  if (!existing || existing.resetAt <= currentTime) {
    manualSendRateStore.set(key, { count: 1, resetAt: currentTime + 60 * 1000 });
    return { limited: false, retryAfterSeconds: 60 };
  }
  existing.count += 1;
  manualSendRateStore.set(key, existing);
  return {
    limited: existing.count > 25,
    retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - currentTime) / 1000)),
  };
}

function getMyJid(sock: any) {
  return sock?.user?.id?.split(":")[0] + "@s.whatsapp.net";
}

function normalizeCourierApi(value: any) {
  const courier = String(value || "").trim().toLowerCase();
  if (courier === "dhl express") return "dhl";
  if (courier === "leopards") return "leopard";
  return courier;
}

function looksLikeTrackingQuestion(text: any) {
  const value = String(text || "").toLowerCase();
  if (!value) return false;
  return /(track|tracking|status|parcel|shipment|awb|where.*order|where.*parcel|deliver|delivery)/i.test(value);
}

function buildDhlTrackingConfig(config: any = {}) {
  return {
    dhl_api_key: config?.dhl_api_key,
    dhl_service: config?.dhl_service || "express",
    dhl_requester_country_code: config?.dhl_requester_country_code || "",
    dhl_origin_country_code: config?.dhl_origin_country_code || "",
    dhl_language: config?.dhl_language || "",
  };
}

async function findMatchingOrder(userId: string, myJid: string, tracking: string, trackingInfo: any, dataOwnerKey?: string) {
  const orders = await dbService.listOrders(userId);
  const cleanTracking = String(tracking || "").trim().toLowerCase();
  const cleanPhone = String(trackingInfo.customerPhone || "").replace(/[^0-9]/g, "").slice(-10);
  const cleanRef = String(trackingInfo.orderRefNumber || "").trim().toLowerCase();
  const ownerKeys = new Set([dataOwnerKey, myJid, myJid.split("@")[0]].filter(Boolean));

  return orders.find((order: any) => {
    if (ownerKeys.size > 0 && !ownerKeys.has(order.bot_id)) return false;
    const data = order.order_data || {};
    const orderTracking = String(firstPresent(data.trackingNumber, data.tracking_id, data.awb) || "").trim().toLowerCase();
    const orderRef = String(firstPresent(data.orderRefNumber, data.orderReferenceNumber, data.orderReference, order.order_id) || "").trim().toLowerCase();
    const orderPhone = String(firstPresent(data.customerPhone, data.phone) || "").replace(/[^0-9]/g, "").slice(-10);
    return (
      (cleanTracking && orderTracking === cleanTracking) ||
      (cleanRef && orderRef === cleanRef) ||
      (cleanPhone && orderPhone && cleanPhone === orderPhone)
    );
  });
}

async function persistTrackingState(userId: string, myJid: string, tracking: string, api: string, trackingInfo: any, customerJid?: string, markNotified = false) {
  const dataOwnerKey = await resolveAccountDataOwnerKey(userId, myJid);
  const order = await findMatchingOrder(userId, myJid, tracking, trackingInfo, dataOwnerKey);
  const existingData = order?.order_data || {};
  const shippingCharge = trackingInfo.shippingCharge || Number(existingData.shippingCharge || 0);
  const normalizedApi = normalizeCourierApi(api);
  const updatedOrderData = {
    ...existingData,
    courierCompany: normalizedApi || api,
    trackingNumber: trackingInfo.trackingNumber || trackingInfo.tracking_id || tracking,
    tracking_id: trackingInfo.tracking_id || trackingInfo.trackingNumber || existingData.tracking_id,
    orderRefNumber: trackingInfo.orderRefNumber || existingData.orderRefNumber || existingData.orderReferenceNumber,
    customerName: trackingInfo.customerName || existingData.customerName,
    customerPhone: trackingInfo.customerPhone || existingData.customerPhone,
    deliveryAddress: trackingInfo.deliveryAddress || existingData.deliveryAddress || existingData.orderAddress,
    cityName: trackingInfo.cityName || existingData.cityName,
    shippingCharge,
    shipping_charge: shippingCharge,
    postexTransactionFee: trackingInfo.transactionFee ?? existingData.postexTransactionFee,
    postexTransactionTax: trackingInfo.transactionTax ?? existingData.postexTransactionTax,
    postexReversalFee: trackingInfo.reversalFee ?? existingData.postexReversalFee,
    postexReversalTax: trackingInfo.reversalTax ?? existingData.postexReversalTax,
    transactionStatus: trackingInfo.status || trackingInfo.current_status || existingData.transactionStatus,
    latestTrackingStatus: trackingInfo.status || trackingInfo.current_status || existingData.latestTrackingStatus,
    latestTrackingStatusCode: trackingInfo.statusCode || trackingInfo.status_code || existingData.latestTrackingStatusCode,
    latestTrackingSignature: trackingInfo.statusSignature || existingData.latestTrackingSignature || (normalizedApi === "dhl" ? `dhl:${trackingInfo.status_code || "unknown"}:${trackingInfo.latest_event_time || trackingInfo.current_status || "unknown"}` : ""),
    latestTrackingCategory: trackingInfo.status_category || existingData.latestTrackingCategory,
    latestTrackingEvent: trackingInfo.latest_event_description || existingData.latestTrackingEvent,
    latestTrackingEventTime: trackingInfo.latest_event_time || existingData.latestTrackingEventTime,
    latestTrackingLocation: trackingInfo.latest_location || existingData.latestTrackingLocation,
    estimatedDelivery: trackingInfo.estimated_delivery || existingData.estimatedDelivery,
    deliveredAt: trackingInfo.delivered_at || existingData.deliveredAt,
    isDelivered: normalizedApi === "dhl" ? (trackingInfo.is_delivered ? 1 : 0) : existingData.isDelivered,
    isTrackingException: normalizedApi === "dhl" ? (trackingInfo.is_exception ? 1 : 0) : existingData.isTrackingException,
    trackingEvents: Array.isArray(trackingInfo.events) ? trackingInfo.events : existingData.trackingEvents,
    trackingService: trackingInfo.service || existingData.trackingService,
    trackingProviderName: trackingInfo.provider_name || existingData.trackingProviderName,
    trackingProviderAttribution: normalizedApi === "dhl" ? "Delivered by Deutsche Post DHL Group" : existingData.trackingProviderAttribution,
    trackingLastSyncedAt: Math.floor(Date.now() / 1000),
    trackingSyncError: "",
    trackingUpdatedAt: Math.floor(Date.now() / 1000),
    ...(markNotified ? {
      lastCustomerTrackingNotificationKey: trackingInfo.statusSignature,
      lastCustomerTrackingNotificationAt: Math.floor(Date.now() / 1000)
    } : {}),
  };

  if (order?.$id || order?.id) {
    if (inventoryService.isReturnOrCancelStatus(updatedOrderData.transactionStatus) && !updatedOrderData.stockReleasedAt) {
      const released = await inventoryService.releaseOrderStock(userId, updatedOrderData).catch((e: any) => {
        console.error("[Inventory] Tracking stock release failed:", e?.message || e);
        return false;
      });
      if (released) {
        updatedOrderData.stockReleasedAt = new Date().toISOString();
        updatedOrderData.stockReleaseReason = String(updatedOrderData.transactionStatus || "returned/cancelled");
      }
    }
    await dbService.updateOrder(order.$id || order.id, updatedOrderData);
  } else {
    const fallbackCustomerJid = customerJid || (trackingInfo.customerPhone ? `${shippingService.normalizeWhatsAppPhone(trackingInfo.customerPhone)}@s.whatsapp.net` : "");
    if (fallbackCustomerJid && !fallbackCustomerJid.startsWith("@")) {
      await dbService.saveOrder(dataOwnerKey, {
        ...updatedOrderData,
        customerJid: fallbackCustomerJid,
        customerName: updatedOrderData.customerName || "Customer",
        customerPhone: updatedOrderData.customerPhone || trackingInfo.customerPhone,
        productName: updatedOrderData.productName || `Courier shipment ${tracking}`,
        orderDetail: updatedOrderData.orderDetail || `Tracking ID: ${tracking}`,
        orderReferenceNumber: updatedOrderData.orderReferenceNumber || updatedOrderData.orderRefNumber || `tracking_${tracking}`,
        orderRefNumber: updatedOrderData.orderRefNumber || updatedOrderData.orderReferenceNumber || `tracking_${tracking}`,
        quantity: updatedOrderData.quantity || 1,
        totalPrice: updatedOrderData.totalPrice || trackingInfo.invoicePayment || 0,
        codAmount: updatedOrderData.codAmount || trackingInfo.invoicePayment || 0,
        createdAt: new Date().toISOString(),
      }).catch((e: any) => console.error("[Tracking] Failed creating tracking order record:", e?.message || e));
    }
  }

  const phoneForJid = customerJid || (trackingInfo.customerPhone ? `${shippingService.normalizeWhatsAppPhone(trackingInfo.customerPhone)}@s.whatsapp.net` : "");
  if (phoneForJid && !phoneForJid.startsWith("@")) {
    await dbService.updateCustomerProfile(dataOwnerKey, phoneForJid, {
      hasPlacedOrder: true,
      trackingId: trackingInfo.trackingNumber || trackingInfo.tracking_id || tracking,
      courierCompany: normalizedApi || api,
      latestTrackingStatus: trackingInfo.status || trackingInfo.current_status,
      latestTrackingStatusCode: trackingInfo.statusCode || trackingInfo.status_code,
      latestTrackingEvent: trackingInfo.latest_event_description,
      latestTrackingEventTime: trackingInfo.latest_event_time,
      trackingProviderAttribution: normalizedApi === "dhl" ? "Delivered by Deutsche Post DHL Group" : undefined,
      lastTrackingSignature: trackingInfo.statusSignature || updatedOrderData.latestTrackingSignature,
      orderStatus: trackingInfo.status || trackingInfo.current_status || updatedOrderData.transactionStatus,
    }).catch(() => {});
  }

  return { order, updatedOrderData };
}

const LOCAL_STORE_FILE = path.join(__dirname, `local_store_${process.env.BOT_ID}.json`);
let localStore: Record<string, any[]> = {};
const botSentMessageIds = new Set<string>();
let currentKeyIndex = 0;

if (fs.existsSync(LOCAL_STORE_FILE)) {
  try {
    localStore = JSON.parse(
      fs.readFileSync(LOCAL_STORE_FILE, "utf-8"),
      Baileys.BufferJSON.reviver,
    );
    
    // Purge bad message history blocks from existing cache
    for (const key of Object.keys(localStore)) {
        if (Array.isArray(localStore[key])) {
            localStore[key] = localStore[key].filter((m: any) => {
                const text = m.message?.conversation || m.message?.extendedTextMessage?.text || "";
                if (text && (text.includes("(missed message recovery)") || text.includes("waiting for this message") || text.includes("missed message"))) {
                    return false;
                }
                return true;
            });
        }
    }

    console.log(
      `[Server] Loaded local store with ${Object.keys(localStore).length} chats.`,
    );
  } catch (e) {
    console.error("[Server] Error loading local store:", e);
  }
}

// Ensure DB templates are merged at startup

const currentlyReplying = new Set<string>();
const activeAIControllers = new Map<string, AbortController>();
type BatchLifecycleStatus =
  | "pending_debounce"
  | "processing_media"
  | "generating_reply"
  | "sending"
  | "sent"
  | "failed_retryable"
  | "failed_final"
  | "superseded_by_new_message"
  | "cancelled";
const messageBuffers = new Map<string, {
  batchId: string;
  botId: string;
  jid: string;
  transport: "socket" | "cloud";
  messageIds: string[];
  messageKinds: Array<ReturnType<typeof classifyInboundMessageKind>>;
  createdAt: number;
  lastUpdatedAt: number;
  extendedOnce: boolean;
  pendingWhileProcessing: boolean;
  latestGenerationMessageId: string;
  status: BatchLifecycleStatus;
  timer: NodeJS.Timeout | null;
}>();
const customerMessageBatchStateCache = new Map<string, CustomerMessageBatchState>();
const processedMessageIds = new Set<string>();
const cloudWebhookDeduper = createCloudWebhookDeduper({
  maxSize: 5000,
  ttlMs: 10 * 60 * 1000,
});

function cleanInboxTargetJid(input: unknown): string {
  const value = String(input || "").trim();

  if (!value || value.includes("account:") || value.includes("@gmail.com")) return "";

  // reject groups/status immediately
  if (value.endsWith("@g.us") || value === "status@broadcast") return "";

  // If it has @, clean only the local part, not the whole jid.
  if (value.includes("@")) {
    const [rawLocal, domain] = value.split("@");
    const local = rawLocal.split(":")[0].trim();
    const cleanDomain = String(domain || "").trim();

    if (!local || !cleanDomain) return "";

    if (cleanDomain === "s.whatsapp.net") {
      return `${local}@s.whatsapp.net`;
    }

    if (cleanDomain === "lid" || cleanDomain === "hosted.lid") {
      return `${local}@${cleanDomain}`;
    }

    return "";
  }

  // Phone digits only fallback.
  const digits = value.replace(/\D/g, "");
  if (digits.length >= 8 && digits.length <= 15) {
    return `${digits}@s.whatsapp.net`;
  }

  return "";
}

function isInboxSendableJid(jid: string): boolean {
  return /^\d{8,15}@s\.whatsapp\.net$/.test(jid)
    || /^[^@\s]+@(lid|hosted\.lid)$/.test(jid);
}

async function startServer() {
  console.log("[Server] Starting server function...");
  await hydrateBotConfigFromDatabase();
  const app = express();
  const corsOptions = {
    origin: (origin: string | undefined, callback: any) => {
      if (!origin) return callback(null, false);
      if (isTrustedAppOrigin(origin)) return callback(null, true);
      return callback(new Error("Origin not allowed"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
    optionsSuccessStatus: 204,
  };

  app.use((req, res, next) => {
    const isApiRoute = req.path.startsWith("/api/");
    if (isApiRoute) {
      if (isWorkerInternalRequest(req, process.env.INTERNAL_WORKER_SECRET)) {
        return next();
      }
      console.warn(`[Worker Security] Unauthorized internal worker API request: ${req.method} ${req.originalUrl} from ip=${req.socket?.remoteAddress || ""}`);
      return res.status(401).json({ error: "Unauthorized internal worker request" });
    }

    if (isWorkerRequestAllowed(req)) return next();
    console.warn(`[Security] blocked_origin ${JSON.stringify({
      origin: normalizeOriginValue(req.get("origin")) || req.get("origin") || "",
      remoteAddress: req.socket?.remoteAddress || "",
      method: req.method,
      path: req.originalUrl,
    })}`);
    return res.status(403).json({ error: "Origin not allowed" });
  });

  app.use(cors(corsOptions as any));
  app.use(express.json({ limit: "50mb" }));
  app.use(cookieParser());
  
  // --- Custom memory logger ---
  const logHistory: string[] = [];
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;

  console.log = (...args) => {
      const str = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
      logHistory.push(`[LOG ${new Date().toISOString()}] ${str}`);
      if (logHistory.length > 500) logHistory.shift();
      originalConsoleLog.apply(console, args);
  };

  console.error = (...args) => {
      const str = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
      logHistory.push(`[ERR ${new Date().toISOString()}] ${str}`);
      if (logHistory.length > 500) logHistory.shift();
      originalConsoleError.apply(console, args);
  };

  app.get("/api/server-logs", (req, res) => {
      res.json(logHistory);
  });
  // -----------------------------
app.get("/api/debug-store", (req, res) => {
    res.json({
        totalSenders: Object.keys(localStore).length,
        processedSize: botSentMessageIds.size,
        historyCounts: Object.entries(localStore).map(([k, v]) => ({ sender: k, count: v.length }))
    });
  });

  app.get("/api/debug-store/test", (req, res) => {
    const sender = Object.keys(localStore).find(k => !k.endsWith("@g.us") && k.includes("@s.whatsapp.net"));
    const msgs = sender ? localStore[sender].slice(-3) : [];
    res.json(msgs.map((m: any) => ({
      id: m.key.id,
      timestamp: m.messageTimestamp,
      calculated: (typeof m.messageTimestamp === 'number' ? m.messageTimestamp : Number(m.messageTimestamp) || 0) * 1000
    })));
  });

  app.get("/api/whatsapp-status", (req, res) => {
    res.json({ status: connectionStatus, isConnected: connectionStatus === "connected" });
  });

  app.post("/api/check-on-whatsapp", express.json({ limit: "64kb" }), async (req, res) => {
    try {
      if (!sock || connectionStatus !== "connected") {
        return res.status(503).json({ error: "WhatsApp instance is not connected", connected: false });
      }
      const rawNumbers = Array.isArray(req.body?.numbers) ? req.body.numbers : [];
      if (rawNumbers.length === 0) {
        return res.json({ success: true, results: [] });
      }
      const numbers = rawNumbers.map((n: any) => String(n || "").trim()).filter(Boolean);
      const onWaResults = await sock.onWhatsApp(...numbers);
      return res.json({
        success: true,
        connected: true,
        results: (onWaResults || []).map((r: any) => ({
          jid: r.jid,
          exists: r.exists ?? true,
        })),
      });
    } catch (err: any) {
      console.error("[Bot Worker] check-on-whatsapp failed:", err?.message || err);
      return res.status(500).json({ error: err?.message || "Failed to check WhatsApp existence" });
    }
  });

  app.get("/api/instance-participating-groups", async (req, res) => {
    try {
      if (!sock || connectionStatus !== "connected") {
        return res.status(503).json({ error: "WhatsApp instance is not connected", connected: false, groups: [] });
      }
      const chats = await sock.groupFetchAllParticipating();
      const rawUserJid = String(sock.user?.id || "").trim();
      const botPhone = rawUserJid.split("@")[0].split(":")[0];
      const botJid = botPhone ? `${botPhone}@s.whatsapp.net` : "";
      const rawLid = String((sock.user as any)?.lid || "").trim();
      const botLidNum = rawLid.split("@")[0].split(":")[0];
      const botLid = botLidNum ? `${botLidNum}@lid` : "";

      const groups = Object.values(chats).map((g: any) => {
        const participants = Array.isArray(g.participants) ? g.participants : [];
        const me = participants.find((p: any) => {
          const pId = String(p?.id || p?.jid || "").trim();
          const pClean = pId.split("@")[0].split(":")[0];
          return (botJid && pId === botJid) ||
                 (botLid && pId === botLid) ||
                 (botPhone && pClean === botPhone) ||
                 (botLidNum && pClean === botLidNum);
        });
        return {
          jid: g.id,
          name: g.subject || "Unnamed Group",
          description: g.desc || "",
          participantCount: participants.length,
          isBotParticipant: true,
          isBotAdmin: me?.admin === "admin" || me?.admin === "superadmin",
          botJid: botJid || rawUserJid,
        };
      });
      return res.json({ success: true, connected: true, groups });
    } catch (err: any) {
      console.error("[Bot Worker] instance-participating-groups failed:", err?.message || err);
      return res.status(500).json({ error: err?.message || "Failed to fetch participating groups", groups: [] });
    }
  });

  app.get("/api/debug-groups", async (req, res) => {
    try {
      if (!sock || connectionStatus !== "connected") {
        return res.status(400).json({ error: "Not connected" });
      }
      const chats = await sock.groupFetchAllParticipating();
      const groups = Object.values(chats).map((g: any) => ({id: g.id, subject: g.subject}));
      const keys = Object.keys(localStore);
      res.json({
        groups,
        storeKeys: keys,
        storeLengths: keys.reduce((acc, k) => ({...acc, [k]: localStore[k].length}), {}),
        welcomeGroupJid, mediaGroupJid, cachedKeywordSequences
      });
    } catch (e: any) {
      res.status(500).json({error: e.message});
    }
  });

  app.post("/api/sync-templates", async (req, res) => {
    if (!sock || connectionStatus !== "connected") {
      return res.status(400).json({ success: false, error: "WhatsApp not connected" });
    }
    
    // Safety: ensure worker has latest config before sync
    try {
      if (fs.existsSync(CONFIG_FILE)) {
          const freshConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
          botConfig = sanitizeBotConfigSecrets({ ...botConfig, ...freshConfig });
      }
      const botId = process.env.BOT_ID;
      if (botId) {
        const dbConfig = await dbService.loadBotConfig(botId);
        if (dbConfig && typeof dbConfig === "object") {
          botConfig = sanitizeBotConfigSecrets({ ...botConfig, ...dbConfig });
          fs.writeFileSync(CONFIG_FILE, JSON.stringify(botConfig));
          io.emit("config", getEnrichedConfig());
          setupAutoSync();
        }
      }
    } catch(e) {}

    isSyncingTemplates = true; 
    io.emit("sync-status", { isSyncing: true });
    io.emit("system-log", { type: "info", msg: "🚀 Sync Started: Fetching last 50 messages from each group to index templates..." });
    
    // RELOAD: Synced groups and loaded from existing RAM/Disk cache
    await syncTemplateGroup();

    const botIdEnv = process.env.BOT_ID;
    if (botIdEnv) {
      try {
        const restore = await hydrateTemplateStoreFromDatabase();
        if (restore.restored > 0) {
          saveLocalStore();
          io.emit("system-log", { type: "info", msg: `Restored ${restore.restored} template messages from database backup.` });
        }
      } catch (e) {
        console.error("[Sync] DB template restore failed:", e);
      }
    }

    // Fetch history
    const groupsToFetch = [];
    if (welcomeGroupJid) groupsToFetch.push({ gid: welcomeGroupJid, name: "Welcome" });
    if (mediaGroupJid) groupsToFetch.push({ gid: mediaGroupJid, name: "Media" });
    for (const [name, seq] of Object.entries(cachedKeywordSequences)) {
      if (seq.jid) groupsToFetch.push({ gid: seq.jid, name: name });
    }
    
    for (const item of groupsToFetch) {
       const gid = item.gid;
       // We rely on messages already synced in localStore or historical sync at connection
       try {
          if (localStore[gid]) {
             const count = localStore[gid].length;
             io.emit("system-log", { type: "info", msg: `📂 Group "${item.name}" found in memory. Total: ${count} messages.` });
             
             // If count is very low or 0, try one force fetch
             if (count === 0) {
                try {
                   io.emit("system-log", { type: "info", msg: `📥 Attempting to fetch history for empty group "${item.name}"...` });
                   // Use standardized Baileys query if possible, or wait
                   const history = typeof (sock as any).fetchMessagesFromWA === 'function' ? await (sock as any).fetchMessagesFromWA(gid, 50) : null;
                   if (history && Array.isArray(history)) {
                      localStore[gid] = history;
                      saveLocalStore();
                      io.emit("system-log", { type: "info", msg: `✅ Successfully fetched ${history.length} messages for "${item.name}".` });
                   }
                } catch(e) {
                    io.emit("system-log", { type: "warning", msg: `⚠️ Auto-fetch failed for "${item.name}". Please send 1 message in that group to trigger sync.` });
                }
             }
          } else {
             io.emit("system-log", { type: "warning", msg: `⚠️ Group "${item.name}" history not yet in memory. Please send a message in that group or wait for background sync.` });
          }
       } catch (e) {
          console.error(`[Sync] Error checking memory for ${gid}:`, e);
       }
    }

    await loadTemplates();
    
    const countSequences = Object.values(cachedKeywordSequences).reduce((acc, s) => acc + (s.templates?.length || 0), 0);
    const countTotal = cachedWelcomeTemplates.length + cachedMediaTemplates.length + countSequences;
    
    res.json({
      success: true,
      isSyncing: isSyncingTemplates,
      count: countTotal,
      countWelcome: cachedWelcomeTemplates.length,
      countMedia: cachedMediaTemplates.length,
      countSequences: countSequences,
      matched: matchedGroupNames
    });
  });

  app.post("/api/wipe-data", async (req, res) => {
    try {
      // WIPE: Clear all cached templates and groups from RAM and disk
      cachedWelcomeTemplates = [];
      cachedMediaTemplates = [];
      for (const seq of Object.values(cachedKeywordSequences)) {
          seq.templates = [];
      }
      
      // Filter localStore to keep only individual chats, wipe group context
      const filteredStore: Record<string, any[]> = {};
      const individualJids = Object.keys(localStore).filter(jid => !jid.endsWith('@g.us'));
      for (const jid of individualJids) {
          filteredStore[jid] = localStore[jid];
      }
      localStore = filteredStore;
      
      saveLocalStore({ allowEmptyTemplateWrite: true });
      io.emit("system-log", { type: "info", msg: "Bot Data Wiped (Templates & Group Data cleared from memory)." });
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/sync/stop", async (req, res) => {
    isSyncingTemplates = false;
    io.emit("sync-status", { isSyncing: false });
    res.json({ success: true, isSyncing: false });
  });

  app.get("/api/sync/status", async (req, res) => {
    res.json({ isSyncing: isSyncingTemplates, status: connectionStatus });
  });

  app.get("/api/templates-status", (req, res) => {
    const sequences = {};
    for (const [name, data] of Object.entries(cachedKeywordSequences)) {
      sequences[name] = {
        count: data.templates?.length || 0,
        jid: data.jid
      };
    }
    res.json({
      countWelcome: cachedWelcomeTemplates.length,
      countSequences: Object.values(cachedKeywordSequences).reduce((acc, s) => acc + (s.templates?.length || 0), 0),
      countMedia: cachedMediaTemplates.length,
      welcome: { count: cachedWelcomeTemplates.length },
      media: { count: cachedMediaTemplates.length },
      sequences
    });
  });

   app.post("/api/check-stock-reminders", async (req, res) => {
     await checkAndNotifyStockReminders();
     res.json({ success: true });
   });

  app.get("/api/templates/details", (req, res) => {
    const sequences = {};
    for (const [name, data] of Object.entries(cachedKeywordSequences)) {
      sequences[name] = {
        count: data.templates?.length || 0,
        templates: data.templates || []
      };
    }
    res.json({
      welcome: { count: cachedWelcomeTemplates.length, templates: cachedWelcomeTemplates },
      media: { count: cachedMediaTemplates.length, templates: cachedMediaTemplates },
      sequences
    });
  });

  app.post("/api/templates/reload", async (req, res) => {
    try {
      const buildTemplateBreakdown = () => {
        const breakdownList: string[] = [];
        if (cachedWelcomeTemplates.length > 0) breakdownList.push(`Welcome: ${cachedWelcomeTemplates.length}`);
        if (cachedMediaTemplates.length > 0) breakdownList.push(`Media: ${cachedMediaTemplates.length}`);
        for (const [seqName, seqData] of Object.entries(cachedKeywordSequences)) {
           if (seqData.templates?.length) breakdownList.push(`${seqName}: ${seqData.templates.length}`);
        }
        const breakdown = breakdownList.join(", ");
        const totalTpl = cachedWelcomeTemplates.length + cachedMediaTemplates.length + Object.values(cachedKeywordSequences).reduce((a, b: any) => a + (b.templates?.length || 0), 0);
        return { breakdownList, breakdown, totalTpl };
      };

      const restore = await hydrateTemplateStoreFromDatabase();
      if (restore.sources > 0) {
          saveLocalStore();
          await syncTemplateGroup();
          await loadTemplates();
          
          const { breakdownList, breakdown, totalTpl } = buildTemplateBreakdown();
          
          io.emit("system-log", { type: "info", msg: `🔄 Successfully reloaded templates from database. ${breakdownList.length > 0 ? '(' + breakdown + ')' : ''}` });
          
          emitLiveConsoleEvent({
            type: "config_reloaded",
            level: "success",
            scope: "bot",
            accountId: process.env.USER_ID,
            botId: process.env.BOT_ID,
            title: "Templates reloaded",
            message: `Reloaded ${totalTpl} template item(s).`,
            metadata: { breakdown },
          });
          return res.json({ success: true, count: totalTpl, breakdown });
      }

      await syncTemplateGroup();
      await loadTemplates();
      const { breakdown, totalTpl } = buildTemplateBreakdown();
      if (totalTpl > 0) {
        saveLocalStore();
        io.emit("system-log", { type: "info", msg: `No database backup existed yet. Promoted local templates to cloud backup. (${breakdown})` });
        return res.json({ success: true, count: totalTpl, breakdown: `${breakdown} - local backup promoted` });
      }

      io.emit("system-log", { type: "info", msg: "No remote template backup exists yet. Start live capture or send templates in a configured group first." });
      res.json({ success: true, count: 0, breakdown: "No templates indexed yet." });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/templates/group-reset", express.json(), async (req, res) => {
    if (!isWorkerInternalRequest(req)) {
      return res.status(403).json({ error: "Unauthorized internal worker access" });
    }
    const { groupJid, purpose, source } = req.body || {};
    if (!groupJid) {
      return res.status(400).json({ error: "Missing groupJid" });
    }
    try {
      const result = await executeGroupReset(groupJid, source || "api");
      res.json(result);
    } catch (e: any) {
      console.error("[Worker] Group reset error:", e);
      res.status(500).json({ error: e?.message || "Failed to reset group templates" });
    }
  });

  const syncHistoryToDb = async (botJid: string) => {
    const dataOwnerKey = await resolveAccountDataOwnerKey(process.env.USER_ID, botJid);
    io.emit("system-log", {
      type: "wa",
      msg: "[Sync] Starting background history sync to DB...",
    });

    const chats = Object.keys(localStore);
    let totalMessages = 0;

    for (const jid of chats) {
      if (jid.endsWith("@g.us")) continue; // Skip groups

      const msgsArray = localStore[jid] || [];

      for (const m of msgsArray) {
        if (!m.message) continue;
        const text =
          m.message.conversation ||
          m.message.extendedTextMessage?.text ||
          m.message.buttonsResponseMessage?.selectedButtonId ||
          m.message.imageMessage?.caption ||
          "";
        if (!text) continue;

        const role = m.key.fromMe ? "model" : "user";
        await dbService.saveMessage(dataOwnerKey, jid, role as any, text, m.key.id, undefined, getActualInstanceMeta());
        totalMessages++;
      }
    }
    io.emit("system-log", {
      type: "info",
      msg: `[Sync] DB sync completed. ${totalMessages} messages synced.`,
    });
  };

  const persistContactIdentityUpdates = async (updates: any[] = []) => {
    if (!sock || updates.length === 0) return;
    const myJid = sock.user?.id?.split(":")[0] + "@s.whatsapp.net";
    const dataOwnerKey = await resolveAccountDataOwnerKey(process.env.USER_ID, myJid);
    for (const update of updates) {
      if (!update?.jid || !update?.profilePatch) continue;
      await dbService.updateCustomerProfile(dataOwnerKey, update.jid, update.profilePatch).catch(() => {});
      await publishSharedPhoneIdentity({
        jid: update.jid,
        profilePatch: update.profilePatch,
        source: "whatsapp_contact_identity",
      }).catch(() => {});
    }
  };

  app.get("/api/history/:jid", async (req, res) => {
    const { jid } = req.params;
    const myJid = sock?.user?.id?.split(":")[0] + "@s.whatsapp.net";
    const dataOwnerKey = await resolveAccountDataOwnerKey(process.env.USER_ID, myJid);

    // First try DB for deep history
    if (myJid) {
      try {
        const firestoreHistory = await dbService.getChatHistory(dataOwnerKey, jid);
        if (firestoreHistory.length > 0) {
          return res.json(
            firestoreHistory.map((m) => ({
              role: m.role,
              text: m.text,
            })),
          );
        }
      } catch (e) {
        console.error("[History] DB fetch failed:", e);
      }
    }

    // Fallback to memory store
    const msgsArray = localStore[jid] || [];
    if (msgsArray.length === 0) return res.json([]);

    let result = msgsArray;

    const history = result
      .map((m: any) => ({
        role: m.key.fromMe ? "model" : "user",
        text:
          m.message?.conversation ||
          m.message?.extendedTextMessage?.text ||
          m.message?.buttonsResponseMessage?.selectedButtonId ||
          m.message?.imageMessage?.caption ||
          "",
      }))
      .filter((m) => m.text);

    res.json(history.slice(-20));
  });

  app.get("/api/track-order/:trackingNumber", async (req, res) => {
    const { trackingNumber } = req.params;
    const api = normalizeCourierApi(req.query?.api || "postex");
    const userId = process.env.USER_ID;
    const userConfig = userId ? await dbService.loadUserConfig(userId) : null;

    try {
      if (api === "dhl") {
        const data = await shippingService.trackDhlShipment(trackingNumber, buildDhlTrackingConfig(userConfig || {}));
        console.log(`[DHL] Track status: ${data.status_code} for ${trackingNumber}`);
        return res.json(data);
      }

      const token = userConfig?.postex_api_key;
      if (!token) return res.status(400).json({ error: "PostEx API token is missing" });
      const data = await shippingService.trackPostexOrder(trackingNumber, token);
      console.log(`[PostEx] Track status: ${data.statusCode} for ${trackingNumber}`);
      res.json(data);
    } catch (e: any) {
      res.status(Number(e?.status || 500)).json({ error: e?.userMessage || e.message });
    }
  });

  app.post("/api/broadcast-by-ids", async (req, res) => {
    const results: CourierBroadcastItemResult[] = [];
    try {
      const { trackingNumbers, type = "booked" } = req.body || {};
      const api = normalizeCourierApi(req.body?.api || "postex");
      const ids = parseCourierTrackingIds(Array.isArray(trackingNumbers) ? trackingNumbers.join("\n") : trackingNumbers);
      if (ids.length === 0) {
        return res.status(400).json({ error: "Tracking numbers list is required", ...buildCourierBroadcastSummary([]) });
      }

      if (!sock || connectionStatus !== "connected") {
        const summary = buildCourierBroadcastSummary(ids.map((trackingId) => ({ trackingId, status: "failed", reason: "WhatsApp is not connected" })));
        return res.status(400).json({ error: "WhatsApp is not connected", ...summary });
      }

      const userId = process.env.USER_ID;
      const userConfig = userId ? await dbService.loadUserConfig(userId) : null;
      const postexToken = userConfig?.postex_api_key;
      const lepApiKey = userConfig?.leopards_api_key;
      const lepApiPassword = userConfig?.leopards_api_password;
      const dhlConfig = buildDhlTrackingConfig(userConfig || {});
      if (api === "postex" && !postexToken) {
        const summary = buildCourierBroadcastSummary(ids.map((trackingId) => ({ trackingId, status: "failed", reason: "PostEx API token is missing" })));
        return res.status(400).json({ error: "PostEx API token is missing", ...summary });
      }
      if (api === "dhl" && !String(dhlConfig.dhl_api_key || "").trim()) {
        const summary = buildCourierBroadcastSummary(ids.map((trackingId) => ({ trackingId, status: "failed", reason: "DHL API key is missing" })));
        return res.status(400).json({ error: "DHL API key is missing", ...summary });
      }

      io.emit("system-log", {
        type: "wa",
        msg: `[Bulk ${type}] Starting broadcast (${api}) for ${ids.length} IDs...`,
      });

      for (const tracking of ids) {
        try {
          let phone = "";
          let name = "Customer";
          let trackingInfo: any = { trackingNumber: tracking, status: "", statusSignature: "" };

          if (api === "postex") {
            const data = await shippingService.trackPostexOrder(tracking, postexToken);
            trackingInfo = shippingService.getPostexTrackingData(data);
            phone = trackingInfo.customerPhone || "";
            name = trackingInfo.customerName || "Customer";
          } else if (api === "dhl") {
            trackingInfo = await shippingService.trackDhlShipment(tracking, dhlConfig);
          } else if (api === "leopard") {
            if (!lepApiKey || !lepApiPassword) throw new Error("Leopards credentials missing");
            const formData = new URLSearchParams();
            formData.append("api_key", lepApiKey);
            formData.append("api_password", lepApiPassword);
            formData.append("track_numbers", tracking);
            const r = await fetch("http://track.leopardscourier.com/api/trackBookedPacket/format/json/", {
              method: "POST",
              body: formData,
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
            });
            const contentType = r.headers.get("content-type") || "";
            if (!contentType.toLowerCase().includes("application/json")) throw new Error(`Leopards tracking returned non-JSON response (${r.status})`);
            const data = await r.json().catch(() => {
              throw new Error("Leopards tracking returned invalid JSON");
            });
            if (data && data.status === 1 && data.packet_list && data.packet_list.length > 0) {
              phone = data.packet_list[0].consignee_phone || data.packet_list[0].cons_phone || "";
              name = data.packet_list[0].consignee_name || data.packet_list[0].cons_name || "Customer";
              const lepStatus = data.packet_list[0].booked_packet_status || data.packet_list[0].packet_status || data.packet_list[0].status || "";
              trackingInfo = { trackingNumber: tracking, customerPhone: phone, customerName: name, status: lepStatus, statusSignature: `leopard:${lepStatus || tracking}` };
            } else {
              throw new Error("Leopards API failed to return tracking data");
            }
          }

          const myJidForMatch = getMyJid(sock);
          const dataOwnerKeyForMatch = await resolveAccountDataOwnerKey(userId, myJidForMatch);
          const matchedOrder = await findMatchingOrder(userId || "", myJidForMatch, tracking, trackingInfo, dataOwnerKeyForMatch);
          const matchedData = matchedOrder?.order_data || {};
          phone = phone || matchedData.customerPhone || matchedData.phone || "";
          name = name !== "Customer" ? name : (matchedData.customerName || matchedData.name || "Customer");
          trackingInfo.customerPhone = trackingInfo.customerPhone || phone;
          trackingInfo.customerName = trackingInfo.customerName || name;

          if (!phone) {
            results.push({ trackingId: tracking, status: "failed", reason: "No customer phone matched this tracking ID" });
            continue;
          }
          const jid = normalizeWhatsAppJid(phone);
          if (!jid) {
            results.push({ trackingId: tracking, status: "failed", reason: "Matched customer phone is not a valid WhatsApp target" });
            continue;
          }

          let message = "";
          if (type === "out-for-delivery") {
            message = `📦 *ڈیلیوری اپ ڈیٹ*\n\nاسلام علیکم ${name}! 👋\nٹریکنگ آئی ڈی: ${tracking}\n\nآپ کا پارسل ہمارے رائیڈر کے حوالے کر دیا گیا ہے اور وہ آج کسی بھی وقت ڈیلیور کر دے گا۔ 🛵\n\nکیا آپ کو ابھی تک رائیڈر کی کال آئی ہے؟ براہ کرم ہمیں بتائیں کہ کیا آپ پارسل موصول کرنے کے لیے موجود ہیں؟\n\nرائیڈر آپ کے علاقے میں پہنچ کر آپ کو کال کرے گا، براہ کرم بروقت ڈیلیوری کے لیے اس کی کال ضرور اٹھائیں۔ شکریہ! ✨`;
          } else if (type === "delivered") {
            message = `🎉 *ڈیلیوری مکمل*\n\nاسلام علیکم ${name}! 👋\nہمارے سسٹم کے مطابق آپ کا پارسل ڈیلیور کر دیا گیا ہے! ✨\n\nہمارے ساتھ شاپنگ کرنے کا بہت بہت شکریہ۔ 📸\n\nاس کے علاوہ، ہمیں آپ کے ریویو کا بھی انتظار رہے گا! آپ کی رائے ہمارے لیے بہت قیمتی ہے۔ شکریہ! ✨`;
          } else {
            message = `🛍️ *آرڈر کنفرمیشن*\n\nاسلام علیکم ${name}! 👋\nہم ہم سے خریداری کا شکریہ۔ آپ کا آرڈر کامیابی سے بُک ہو چکا ہے! ✅\n\n📦 *ٹریکنگ آئی ڈی (Tracking ID):* ${tracking}\n\nآپ کسی بھی وقت اس میسج کا جواب دے کر اپنے آرڈر کی لائیو صورتحال معلوم کر سکتے ہیں۔ شکریہ! ✨`;
          }

          io.emit("system-log", { type: "wa", msg: `[Bulk ${type}] Sending tracking update for ${sanitizeCourierText(tracking, 60)}...` });
          const myJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";
          const dataOwnerKey = await resolveAccountDataOwnerKey(userId, myJid);
          const sendResult = await sendUniversalOutboundText({
            userId,
            botId: process.env.BOT_ID || myJidForMatch,
            customerJid: jid,
            messageText: message,
            idempotencyKey: `broadcast:${type}:${tracking}:${jid}`,
            billingAction: "broadcast_tracking_text",
            contextType: "broadcast_tracking",
            contextId: `${type}:${tracking}`,
            campaignType: "broadcast",
            sendText: (targetJid, text) => sendUniversalTextViaActiveProvider(targetJid, text),
            saveMessage: async (targetJid, text, messageId) => {
              await dbService.saveMessage(dataOwnerKey, targetJid, "model", text, messageId, undefined, getActualInstanceMeta());
            },
          });
          if (sendResult.status !== "sent" && sendResult.status !== "duplicate") {
            results.push({ trackingId: tracking, status: sendResult.status === "skipped" ? "skipped" : "failed", reason: getCourierErrorMessage(sendResult.reason || sendResult.status, "WhatsApp send failed") });
            continue;
          }

          try {
            await dbService.updateCustomerProfile(dataOwnerKey, jid, { hasPlacedOrder: true, welcomeSequenceSent: true, trackingId: tracking, courierCompany: api });
            await persistTrackingState(userId || "", myJid, tracking, api, trackingInfo, jid, true);
          } catch(e) {}

          results.push({
            trackingId: tracking,
            status: sendResult.status === "duplicate" ? "duplicate_not_resent" : "sent_fresh",
            messageId: sendResult.messageId || "",
            reason: sendResult.status === "duplicate" ? "duplicate_attempt" : "",
          });
          await new Promise((r) => setTimeout(r, 2000));
        } catch (e: any) {
          const reason = getCourierErrorMessage(e, "Courier tracking failed");
          io.emit("system-log", { type: "error", msg: `[Broadcast] Failed tracking ${sanitizeCourierText(tracking, 60)} - ${reason}` });
          results.push({ trackingId: tracking, status: "failed", reason });
        }
      }

      return res.json(buildCourierBroadcastSummary(results));
    } catch (e: any) {
      const reason = getCourierErrorMessage(e, "Courier broadcast failed");
      console.error("[Broadcast] Route failure:", reason);
      return res.status(500).json({ error: reason, ...buildCourierBroadcastSummary(results) });
    }
  });

  app.post("/api/broadcast-by-ids-legacy", async (req, res) => {
    const { trackingNumbers, type = "booked", api = "postex" } = req.body;
    if (!Array.isArray(trackingNumbers) || trackingNumbers.length === 0) {
      return res.status(400).json({ error: "Tracking numbers list is required" });
    }

    if (!sock || connectionStatus !== "connected") {
      return res.status(400).json({ error: "WhatsApp is not connected" });
    }

    const userId = process.env.USER_ID;
    const userConfig = userId ? await dbService.loadUserConfig(userId) : null;
    const postexToken = userConfig?.postex_api_key;
    const lepApiKey = userConfig?.leopards_api_key;
    const lepApiPassword = userConfig?.leopards_api_password;
    const dhlConfig = buildDhlTrackingConfig(userConfig || {});
    if (api === "postex" && !postexToken) return res.status(400).json({ error: "PostEx API token is missing" });
    if (api === "dhl" && !String(dhlConfig.dhl_api_key || "").trim()) return res.status(400).json({ error: "DHL API key is missing" });

    let sentCount = 0;
    let failedCount = 0;

    io.emit("system-log", {
      type: "wa",
      msg: `[Bulk ${type}] Starting broadcast (${api}) for ${trackingNumbers.length} IDs...`,
    });

    for (const tracking of trackingNumbers) {
      try {
        let phone = "";
        let name = "Customer";
        let trackingInfo: any = { trackingNumber: tracking, status: "", statusSignature: "" };

        if (api === "postex") {
          const data = await shippingService.trackPostexOrder(tracking, postexToken);
          trackingInfo = shippingService.getPostexTrackingData(data);
          phone = trackingInfo.customerPhone || "";
          name = trackingInfo.customerName || "Customer";
        } else if (api === "dhl") {
          trackingInfo = await shippingService.trackDhlShipment(tracking, dhlConfig);
        } else if (api === "leopard") {
            if (!lepApiKey || !lepApiPassword) throw new Error("Leopards credentials missing");
            const formData = new URLSearchParams();
            formData.append('api_key', lepApiKey);
            formData.append('api_password', lepApiPassword);
            formData.append('track_numbers', tracking);

            const r = await fetch("http://track.leopardscourier.com/api/trackBookedPacket/format/json/", {
              method: 'POST', body: formData, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });
            const data = await r.json();
            if (data && data.status === 1 && data.packet_list && data.packet_list.length > 0) {
               phone = data.packet_list[0].consignee_phone || data.packet_list[0].cons_phone || "";
               name = data.packet_list[0].consignee_name || data.packet_list[0].cons_name || "Customer";
               const lepStatus = data.packet_list[0].booked_packet_status || data.packet_list[0].packet_status || data.packet_list[0].status || "";
               trackingInfo = { trackingNumber: tracking, customerPhone: phone, customerName: name, status: lepStatus, statusSignature: `leopard:${lepStatus || tracking}` };
               if (!phone) throw new Error("Phone not returned by Leopards");
            } else throw new Error("Leopards API failed to return data");
        }

        const myJidForMatch = getMyJid(sock);
        const dataOwnerKeyForMatch = await resolveAccountDataOwnerKey(userId, myJidForMatch);
        const matchedOrder = await findMatchingOrder(userId || "", myJidForMatch, tracking, trackingInfo, dataOwnerKeyForMatch);
        const matchedData = matchedOrder?.order_data || {};
        phone = phone || matchedData.customerPhone || matchedData.phone || "";
        name = name !== "Customer" ? name : (matchedData.customerName || matchedData.name || "Customer");
        trackingInfo.customerPhone = trackingInfo.customerPhone || phone;
        trackingInfo.customerName = trackingInfo.customerName || name;

        if (phone) {
          const jid = normalizeWhatsAppJid(phone);
          if (jid) {
            let message = "";

            if (type === "out-for-delivery") {
              message = `📦 *ڈیلیوری اپ ڈیٹ*\n\nاسلام علیکم ${name}! 👋\nٹریکنگ آئی ڈی: ${tracking}\n\nآپ کا پارسل ہمارے رائیڈر کے حوالے کر دیا گیا ہے اور وہ آج کسی بھی وقت ڈیلیور کر دے گا۔ 🛵\n\nکیا آپ کو ابھی تک رائیڈر کی کال آئی ہے؟ براہ کرم ہمیں بتائیں کہ کیا آپ پارسل موصول کرنے کے لیے موجود ہیں؟\n\nرائیڈر آپ کے علاقے میں پہنچ کر آپ کو کال کرے گا، براہ کرم بروقت ڈیلیوری کے لیے اس کی کال ضرور اٹھائیں۔ شکریہ! ✨`;
            } else if (type === "delivered") {
              message = `🎉 *ڈیلیوری مکمل*\n\nاسلام علیکم ${name}! 👋\nہمارے سسٹم کے مطابق آپ کا پارسل ڈیلیور کر دیا گیا ہے! ✨\n\nہمارے ساتھ شاپنگ کرنے کا بہت بہت شکریہ۔ 📸\n\nاس کے علاوہ، ہمیں آپ کے ریویو کا بھی انتظار رہے گا! آپ کی رائے ہمارے لیے بہت قیمتی ہے۔ شکریہ! ✨`;
            } else {
              message = `🛍️ *آرڈر کنفرمیشن*\n\nاسلام علیکم ${name}! 👋\nہم ہم سے خریداری کا شکریہ۔ آپ کا آرڈر کامیابی سے بُک ہو چکا ہے! ✅\n\n📦 *ٹریکنگ آئی ڈی (Tracking ID):* ${tracking}\n\nآپ کسی بھی وقت اس میسج کا جواب دے کر اپنے آرڈر کی لائیو صورتحال معلوم کر سکتے ہیں۔ شکریہ! ✨`;
            }

            io.emit("system-log", { type: "wa", msg: `[Bulk ${type}] Sending to ${name} (${jid.split("@")[0]})...` });
            const myJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";
            const dataOwnerKey = await resolveAccountDataOwnerKey(userId, myJid);
            const sendResult = await sendUniversalOutboundText({
              userId,
              botId: process.env.BOT_ID || myJidForMatch,
              customerJid: jid,
              messageText: message,
              idempotencyKey: `broadcast:${type}:${tracking}:${jid}`,
              billingAction: "broadcast_tracking_text",
              contextType: "broadcast_tracking",
              contextId: `${type}:${tracking}`,
              campaignType: "broadcast",
              sendText: (targetJid, text) => sendUniversalTextViaActiveProvider(targetJid, text),
              saveMessage: async (targetJid, text, messageId) => {
                await dbService.saveMessage(dataOwnerKey, targetJid, "model", text, messageId, undefined, getActualInstanceMeta());
              },
            });
            if (sendResult.status !== "sent" && sendResult.status !== "duplicate") {
              failedCount++;
              continue;
            }

            try {
              await dbService.updateCustomerProfile(dataOwnerKey, jid, { hasPlacedOrder: true, welcomeSequenceSent: true, trackingId: tracking, courierCompany: api });
              await persistTrackingState(userId || "", myJid, tracking, api, trackingInfo, jid, true);
            } catch(e) {}

            sentCount++;
            await new Promise((r) => setTimeout(r, 2000));
          } else {
            failedCount++;
          }
        } else {
          failedCount++;
        }
      } catch (e: any) {
        io.emit("system-log", { type: "error", msg: `[Broadcast] Failed tracking: ${tracking} - ${e.message}` });
        failedCount++;
      }
    }

    res.json({ success: true, sent: sentCount, failed: failedCount, message: `Broadcast complete. Sent: ${sentCount}, Failed: ${failedCount}.` });
  });

  app.post("/api/broadcast-tracking", async (req, res) => {
    io.emit("system-log", { type: "wa", msg: "[Broadcast] Request received" });
    if (!sock || connectionStatus !== "connected") {
      return res.status(400).json({ error: "WhatsApp is not connected" });
    }

    const { ids, customMessage, api } = req.body;
    let trackingNumbers = [];
    try {
       trackingNumbers = ids.split("\n").map((i: string)=>i.trim()).filter((i: string)=>i);
    } catch(e) {
       return res.status(400).json({ error: "Invalid IDs list" });
    }
    
    if (trackingNumbers.length === 0) {
       return res.status(400).json({ error: "No tracking IDs" });
    }

    const userId = process.env.USER_ID;
    const userConfig = userId ? await dbService.loadUserConfig(userId) : null;
    const postexToken = userConfig?.postex_api_key;
    const lepApiKey = userConfig?.leopards_api_key;
    const lepApiPassword = userConfig?.leopards_api_password;
    const dhlConfig = buildDhlTrackingConfig(userConfig || {});
    if ((api === "postex" || !api) && !postexToken) return res.status(400).json({ error: "PostEx API token is missing" });
    if (api === "dhl" && !String(dhlConfig.dhl_api_key || "").trim()) return res.status(400).json({ error: "DHL API key is missing" });

    let sentCount = 0;
    let failedCount = 0;

    for (const tracking of trackingNumbers) {
      try {
        let phone = "";
        let name = "Customer";
        let trackingInfo: any = { trackingNumber: tracking, status: "", statusSignature: "" };

        if (api === "postex" || !api) {
          const data = await shippingService.trackPostexOrder(tracking, postexToken);
          trackingInfo = shippingService.getPostexTrackingData(data);
          phone = trackingInfo.customerPhone || "";
          name = trackingInfo.customerName || "Customer";
        } else if (api === "dhl") {
          trackingInfo = await shippingService.trackDhlShipment(tracking, dhlConfig);
        } else if (api === "leopard") {
            if (!lepApiKey || !lepApiPassword) throw new Error("Leopards credentials missing");
            const formData = new URLSearchParams();
            formData.append('api_key', lepApiKey);
            formData.append('api_password', lepApiPassword);
            formData.append('track_numbers', tracking);

            const r = await fetch("http://track.leopardscourier.com/api/trackBookedPacket/format/json/", {
              method: 'POST', body: formData, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });
            const data = await r.json();
            if (data && data.status === 1 && data.packet_list && data.packet_list.length > 0) {
               phone = data.packet_list[0].consignee_phone || data.packet_list[0].cons_phone || "";
               name = data.packet_list[0].consignee_name || data.packet_list[0].cons_name || "Customer";
               const lepStatus = data.packet_list[0].booked_packet_status || data.packet_list[0].packet_status || data.packet_list[0].status || "";
               trackingInfo = { trackingNumber: tracking, customerPhone: phone, customerName: name, status: lepStatus, statusSignature: `leopard:${lepStatus || tracking}` };
               if (!phone) throw new Error("Phone missing in Leopards response");
            } else throw new Error("Leopards tracking failed");
        }

        const myJidForMatch = getMyJid(sock);
        const dataOwnerKeyForMatch = await resolveAccountDataOwnerKey(userId, myJidForMatch);
        const matchedOrder = await findMatchingOrder(userId || "", myJidForMatch, tracking, trackingInfo, dataOwnerKeyForMatch);
        const matchedData = matchedOrder?.order_data || {};
        phone = phone || matchedData.customerPhone || matchedData.phone || "";
        name = name !== "Customer" ? name : (matchedData.customerName || matchedData.name || "Customer");
        trackingInfo.customerPhone = trackingInfo.customerPhone || phone;
        trackingInfo.customerName = trackingInfo.customerName || name;

        if (phone) {
          const jid = normalizeWhatsAppJid(phone);
          if (jid) {
            let finalMsg = customMessage.replace(/{customer_name}/gi, name).replace(/{tracking_id}/gi, tracking);

            io.emit("system-log", { type: "wa", msg: `[Broadcast] Sending to ${name} (${jid.split("@")[0]})...` });
            const myJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";
            const dataOwnerKey = await resolveAccountDataOwnerKey(userId, myJid);
            const sendResult = await sendUniversalOutboundText({
              userId,
              botId: process.env.BOT_ID || myJidForMatch,
              customerJid: jid,
              messageText: finalMsg,
              idempotencyKey: `broadcast:custom:${tracking}:${jid}`,
              billingAction: "broadcast_tracking_text",
              contextType: "broadcast_tracking",
              contextId: `custom:${tracking}`,
              campaignType: "broadcast",
              sendText: (targetJid, text) => sendUniversalTextViaActiveProvider(targetJid, text),
              saveMessage: async (targetJid, text, messageId) => {
                await dbService.saveMessage(dataOwnerKey, targetJid, "model", text, messageId, undefined, getActualInstanceMeta());
              },
            });
            if (sendResult.status !== "sent" && sendResult.status !== "duplicate") {
              failedCount++;
              continue;
            }

            try {
              await dbService.updateCustomerProfile(dataOwnerKey, jid, { hasPlacedOrder: true, welcomeSequenceSent: true, trackingId: tracking, courierCompany: api });
              await persistTrackingState(userId || "", myJid, tracking, api || "postex", trackingInfo, jid, true);
            } catch(e) {}

            sentCount++;
            await new Promise((r) => setTimeout(r, 2000));
          } else {
            failedCount++;
          }
        } else {
          failedCount++;
        }
      } catch (e: any) {
        io.emit("system-log", { type: "error", msg: `[Broadcast Error] ${e.message}` });
        failedCount++;
      }
    }

    res.json({ message: `Successfully sent tracking numbers to ${sentCount} customers.`, count: sentCount, failed: failedCount });
  });

  app.get("/api/search-orders", async (req, res) => {
    try {
        const { phone, ref } = req.query;
        let results = await shippingService.searchPostexOrders(phone as string, ref as string);
        if (results.length === 0) {
            // fallback to Leopards
            const lepResp = await shippingService.searchLeopardsOrders((ref as string) || (phone as string));
            if (lepResp && lepResp.length > 0) {
                results = lepResp;
            }
        }
        res.json({ statusCode: "200", dist: results });
    } catch(e: any) {
        res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/bot/send-message", async (req, res) => {
    if (!sock || connectionStatus !== "connected") {
      return res.status(400).json({ error: "WhatsApp not connected" });
    }
    try {
      const manualSendLimit = checkManualSendRateLimit();
      if (manualSendLimit.limited) {
        console.warn(`[Security] rate_limit_hit ${JSON.stringify({
          limiter: "worker-manual-send",
          source: "http",
          botId: process.env.BOT_ID || "",
          userId: process.env.USER_ID || "",
        })}`);
        return res.status(429).json({
          error: "Too many manual send requests. Please wait before sending more messages.",
          code: "RATE_LIMITED",
          retryAfterSeconds: manualSendLimit.retryAfterSeconds,
        });
      }
      const { to, text, followup, offerContext } = req.body;
      const requestedAccountId = String(req.body?.accountId || req.body?.userId || "").trim();
      if (requestedAccountId && process.env.USER_ID && requestedAccountId !== process.env.USER_ID) {
        console.warn(`[Worker Security] Tenant boundary violation: Request for account ${requestedAccountId} on worker ${process.env.BOT_ID} owned by ${process.env.USER_ID}`);
        return res.status(403).json({ error: "Tenant boundary violation: Bot instance does not belong to requested account" });
      }
      const followupMeta = followup && typeof followup === "object" ? followup : (followup ? { enabled: true } : null);
      const isFollowupRequest = Boolean(followupMeta);
      const formattedTo = normalizeWhatsAppJid(to);
      if (!formattedTo) {
        return res.status(400).json({ error: `Cannot resolve a safe WhatsApp chat JID for ${to}.` });
      }
      
      let finalMsg = text;
      let dataOwnerKey = "";
      const myJid = sock.user?.id?.split(":")[0] + "@s.whatsapp.net";
      const dataOwnerKeyForCustomer = await resolveAccountDataOwnerKey(process.env.USER_ID, myJid);
      const controlCommand = !isFollowupRequest ? parseCustomerReplyControlCommand(finalMsg) : null;
      if (controlCommand) {
        const profile = await dbService.getCustomerProfile(dataOwnerKeyForCustomer, formattedTo).catch(() => null);
        const result = await applyReplyControlCommand({
          dataOwnerKey: dataOwnerKeyForCustomer,
          primaryJid: formattedTo,
          profile: profile || {},
          command: controlCommand,
          source: "manual send shortcode",
        });
        return res.json({ success: true, controlCommand: true, message: result.message, targets: result.targets });
      }
      let aiFollowupMeta: any = null;
      
      if (isFollowupRequest) {
         dataOwnerKey = dataOwnerKeyForCustomer;
         const campaignType = normalizeFollowupCampaignType(followupMeta?.campaignType);
         const profile = await dbService.getCustomerProfile(dataOwnerKey, formattedTo).catch(() => null);
         const triggerLastMessageAt = followupMeta?.triggerLastMessageAt || followupMeta?.customerLastMessageAt || followupMeta?.lastMessageAt || 0;
         const staleBeforeCompose = checkFollowupStaleByLastMessage({
           latestLastMessageAt: profile?.lastMessageAt || profile?.last_message_at,
           triggerLastMessageAt,
         });
         if (staleBeforeCompose.stale) {
           return res.json({ success: true, skipped: true, status: "skipped", reason: staleBeforeCompose.reason });
         }
         const stopState = getCustomerAutoReplyStopState(
           profile || {},
           Math.floor(Date.now() / 1000),
           {
             jid: formattedTo,
             altJid: profile?.phoneJid || profile?.phoneNumber || profile?.whatsapp_number,
             mutedNumbers: botConfig.muted_numbers || [],
           }
         );
         if (stopState.isStopped) {
             return res.json({ success: true, skipped: true, reason: stopState.message || "auto-reply is stopped" });
         }
          if (campaignType === "ai_smart_followup") {
            const aiFollowupBilling = await previewBillableOutboundText(process.env.USER_ID, "ai_smart_followup");
            if (!aiFollowupBilling.allowed) {
              console.info(`[SmartFollowup] generation_skipped reason=${aiFollowupBilling.reason || "billing_not_allowed"} customer=${formattedTo}`);
              return res.json({
                success: true,
                skipped: true,
                status: "skipped",
                reason: aiFollowupBilling.reason || "billing_not_allowed",
                chargeAmount: Number(aiFollowupBilling.cost || 0),
              });
            }
            const chatHistory = await dbService.getChatHistory(dataOwnerKey, formattedTo, 12).catch(() => []);
            const activeRecord = await dbService.findLatestCustomerRecord(dataOwnerKey, formattedTo, profile || {}).catch(() => null);
            try {
              aiFollowupMeta = await buildAiSmartFollowupMessageWithMeta({
                customer: { customer_id: formattedTo.split("@")[0], jid: formattedTo },
                profile: profile || {},
                activeRecord,
                customerSummary: String(profile?.chatSummary || profile?.summary || "").trim(),
                chatHistory: Array.isArray(chatHistory) ? chatHistory.map((message: any) => ({
                  role: message?.role,
                  text: String(message?.text || "").trim(),
                })) : [],
                businessInstructions: String(botConfig?.prompt || "").trim(),
                campaignInstruction: String(offerContext || text || "").trim(),
                botConfig,
                providerContext: {
                  userId: process.env.USER_ID,
                  accountId: process.env.USER_ID,
                  dataOwnerKey,
                  botId: process.env.BOT_ID || dataOwnerKey,
                  purpose: "ai_smart_followup_generation",
                  billingContext: {
                    customerJid: formattedTo,
                    eventId: String(followupMeta?.attemptKey || followupMeta?.billingDedupeKey || followupMeta?.followupId || formattedTo),
                  },
                },
              });
              finalMsg = aiFollowupMeta.text;
            } catch (error: any) {
              if (error?.code === "ai_incomplete_output" || error?.message === "ai_incomplete_output") {
                return res.json({ success: true, skipped: true, status: "skipped", reason: "incomplete_output" });
              }
              throw error;
            }
          } else {
            finalMsg = buildStaticFollowupMessage({ offerContext, text });
         }

         try {
           finalMsg = assertCompleteCustomerFacingText(finalMsg, "incomplete_output");
         } catch (error: any) {
           console.warn(`[Follow-up Bot] incomplete_output blocked for ${formattedTo}: ${error?.reason || error?.message || error}`);
           return res.json({ success: true, skipped: true, status: "skipped", reason: "incomplete_output" });
         }
         
         // Add human typing simulation
         const currentUserId = process.env.USER_ID;
         const userConfig = currentUserId ? await dbService.loadUserConfig(currentUserId) : null;
         if (userConfig?.human_delay_enabled !== 0) {
            await applyHumanDelay(formattedTo, finalMsg.length, false, userConfig);
         }
         const latestProfile = await dbService.getCustomerProfile(dataOwnerKey, formattedTo).catch(() => null);
         const staleBeforeSend = checkFollowupStaleByLastMessage({
           latestLastMessageAt: latestProfile?.lastMessageAt || latestProfile?.last_message_at,
           triggerLastMessageAt,
         });
         if (staleBeforeSend.stale) {
           return res.json({ success: true, skipped: true, status: "skipped", reason: staleBeforeSend.reason });
         }
      }

      if (!isFollowupRequest) {
        const access = await assertCustomerFacingSendAllowed({
          userId: process.env.USER_ID,
          context: "manual_api_send",
          customerJid: formattedTo,
          io,
          logger: console,
        });
        if (!access.allowed) {
          return res.status(403).json({ error: access.reason, status: "blocked" });
        }
      }

      if (!isFollowupRequest) {
        const forceTriggered = await forceMissedReplyFromShortcut(
          formattedTo,
          buildManualCommandMessage(formattedTo, finalMsg),
          finalMsg
        );
        if (forceTriggered) {
          return res.json({ success: true, message: "Missed reply recovery triggered." });
        }

        const shortcutMatched = await processShortcut(
          createTrackedWhatsAppSocket(sock, botSentMessageIds),
          formattedTo,
          formattedTo,
          { key: { fromMe: true }, message: { conversation: finalMsg } },
          finalMsg,
          cachedKeywordSequences,
          simulateTyping,
          forwardTemplate,
          pendingResponses,
          currentlyReplying,
          io,
          { templates: cachedWelcomeTemplates, config: (botConfig?.groups || []).find((g: any) => g?.purpose === 'welcome') }
        );
        if (shortcutMatched) {
          return res.json({ success: true, message: "Shortcut sequence triggered." });
        }
      }

      if (!String(finalMsg || "").trim()) {
        return res.status(400).json({ error: "Message text is empty." });
      }

      // Use formattedTo directly, Baileys handles self-send correctly using the base JID.
      const trackedSock = createTrackedWhatsAppSocket(sock, botSentMessageIds);
      let sent: any;
      if (isFollowupRequest) {
        const campaignType = normalizeFollowupCampaignType(followupMeta?.campaignType);
        const billingAction = campaignType === "ai_smart_followup" ? "ai_smart_followup_text" : "marketing_auto_bot_text";
        const result = await sendMarketingFollowupMessage({
          botId: process.env.BOT_ID || dataOwnerKey || dataOwnerKeyForCustomer,
          customerJid: formattedTo,
          messageText: finalMsg,
          eventId: String(followupMeta?.attemptKey || followupMeta?.billingDedupeKey || followupMeta?.followupId || ""),
          userId: process.env.USER_ID,
          previewBilling: () => previewBillableOutboundText(process.env.USER_ID, billingAction),
          sendText: async (jid: string, messageText: string) => {
            const response = await trackedSock.sendMessage(jid, { text: messageText });
            if (response?.key?.id) {
              botSentMessageIds.add(response.key.id);
            }
            return { messageId: String(response?.key?.id || "") };
          },
          saveMessage: async (jid: string, messageText: string, messageId: string) => {
            const ownerKey = dataOwnerKey || dataOwnerKeyForCustomer;
            await dbService.saveMessage(ownerKey, jid, "model", messageText, messageId, undefined, getActualInstanceMeta());
          },
          chargeBilling: (context) => chargeBillableOutboundText(process.env.USER_ID, billingAction, {
            botId: process.env.BOT_ID || dataOwnerKey || dataOwnerKeyForCustomer,
            customerJid: context.customerJid,
            eventId: String(followupMeta?.attemptKey || followupMeta?.billingDedupeKey || followupMeta?.followupId || context.eventId),
            messageId: context.messageId,
          }),
        });
        if (result.status === "skipped") {
          return res.json({ success: true, skipped: true, status: "skipped", reason: result.reason || "marketing follow-up skipped", chargeAmount: Number(result.chargeAmount || 0) });
        }
        if (result.status !== "sent" || !result.sentMessageId) {
          return res.status(400).json({ error: result.reason || "Marketing follow-up send failed.", status: result.status || "failed", chargeAmount: Number(result.chargeAmount || 0) });
        }
        if (campaignType === "ai_smart_followup" && aiFollowupMeta) {
          appendSmartSalesDecisionLog({
            smartSalesUsed: Boolean(aiFollowupMeta.smartSalesUsed),
            smartSalesPromptVersion: aiFollowupMeta.smartSalesPromptVersion,
            extraChargeApplied: false,
            reasonSkipped: aiFollowupMeta.reasonSkipped || "extra_charge_not_applied_for_followup",
            replyMessageId: result.sentMessageId,
            botId: process.env.BOT_ID || dataOwnerKey || dataOwnerKeyForCustomer,
            accountId: process.env.USER_ID,
          });
        }
        finalMsg = result.finalText || finalMsg;
        sent = { key: { id: result.sentMessageId } };
        io.emit("whatsapp-message", {
          from: formattedTo,
          text: finalMsg,
          isFromMe: true,
          timestamp: Date.now()
        });
        return res.json({ success: true, message: finalMsg, sentMessageId: result.sentMessageId, chargeAmount: Number(result.chargeAmount || 0), campaignType });
      } else {
        sent = await trackedSock.sendMessage(formattedTo, { text: finalMsg });
      }
      const sentMessageId = sent?.key?.id;
      if (!sentMessageId) {
        throw new Error("WhatsApp did not return a sent message id.");
      }
      botSentMessageIds.add(sentMessageId);
      if (isFollowupRequest) {
        if (!dataOwnerKey) {
          const myJid = sock.user?.id?.split(":")[0] + "@s.whatsapp.net";
          dataOwnerKey = await resolveAccountDataOwnerKey(process.env.USER_ID, myJid);
        }
        io.emit("whatsapp-message", {
          from: formattedTo,
          text: finalMsg,
          isFromMe: true,
          timestamp: Date.now()
        });
      }
      if (!isFollowupRequest) {
        await dbService.updateCustomerProfile(dataOwnerKeyForCustomer, formattedTo, buildCustomerAiResumePatch()).catch(() => {});
        learnFromManualOutboundMessage({
          sock,
          botConfig,
          io,
          jid: formattedTo,
          text: finalMsg.trim(),
          kind: "text",
          messageId: sent?.key?.id,
          userId: process.env.USER_ID,
          botId: process.env.BOT_ID,
        }).catch((e) => console.error("[ManualLearning] HTTP send-message failed:", e));
      }
      res.json({ success: true, message: finalMsg, sentMessageId });
    } catch(e: any) {
       res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/update-config", async (req, res) => {
    const previousMode = resolveBotAiChatReplyMode(botConfig);
    botConfig = sanitizeBotConfigSecrets({ ...botConfig, ...req.body });
    const nextMode = resolveBotAiChatReplyMode(botConfig);
    console.log(`ai_chat_reply_mode bot=${String(process.env.BOT_ID || "unknown").slice(0, 80)} enabled=${nextMode.enabled}`);
    if (previousMode.enabled && !nextMode.enabled) {
      await ensureAiReplyRetryQueueLoaded();
      const closed = closePendingAiRepliesForBot(pendingAiReplyRetries, process.env.BOT_ID || "", Date.now(), true);
      if (closed > 0) await persistAiReplyRetryQueue();
      console.log(`ai_chat_reply_pending_retries_closed count=${closed} reason=disabled`);
    }
    console.log(`ai_chat_reply_mode_changed enabled=${nextMode.enabled}`);
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(botConfig));
    await syncTemplateGroup();
    await loadTemplates();
    io.emit("config", getEnrichedConfig());
    setupAutoSync();
    emitLiveConsoleEvent({
      type: "config_reloaded",
      level: "success",
      scope: "bot",
      accountId: process.env.USER_ID,
      botId: process.env.BOT_ID,
      title: "Config reloaded",
      message: "Instance config and templates were reloaded.",
    });
    res.json({ status: "ok" });
  });

  

  function isCloudTextProcessingGateOpen(): boolean {
    return (
      providerRuntimeState.cloudApiRuntimeReady === true &&
      providerRuntimeState.cloudApiProviderHydrated === true &&
      providerRuntimeState.cloudApiTrackedSenderHydrated === true &&
      providerRuntimeState.cloudApiRuntimeEnabled === true &&
      providerRuntimeState.activeRuntimeProvider === "whatsapp_cloud_api" &&
      cloudApiRuntimeProvider !== null &&
      cloudApiTrackedSender !== null
    );
  }

  app.post("/api/cloud-webhook-event", async (req, res) => {
    try {
      const { botId, phoneNumberId, eventType, event } = req.body || {};

      if (!botId || !phoneNumberId || !eventType || !event) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      recordCloudWebhookActivity(
        process.env.BOT_ID || botId || "",
        eventType === "message" ? "inbound_message" : eventType === "status" ? "status" : "signed_webhook"
      );

      // 1. Resolve dedup key
      const dedupKey = getCloudWebhookDedupKey(req.body);
      if (!dedupKey) {
        emitLiveConsoleEvent({
          type: "whatsapp_cloud_webhook_failed",
          level: "warn",
          scope: "bot",
          accountId: process.env.USER_ID,
          botId: process.env.BOT_ID,
          title: "Cloud Webhook Ignored",
          message: `Ignored or malformed event: no dedup key resolved for eventType=${eventType}.`,
          metadata: {
            botId,
            phoneNumberId,
            eventType,
          },
        });
        return res.status(200).json({ success: true, received: true, ignored: true });
      }

      // 2. Perform check and record in deduper
      const dedupResult = cloudWebhookDeduper.checkAndRecord(dedupKey);
      const safeDedupSummary = summarizeCloudWebhookDedupResult(dedupResult);

      if (dedupResult.isDuplicate) {
        const safeMessageId = event?.message?.id;
        const safeStatusId = event?.status?.id;

        emitLiveConsoleEvent({
          type: "whatsapp_cloud_webhook_failed",
          level: "info",
          scope: "bot",
          accountId: process.env.USER_ID,
          botId: process.env.BOT_ID,
          title: "Cloud Webhook Duplicate",
          message: `Discarded duplicate event of type ${eventType}.`,
          metadata: {
            botId,
            phoneNumberId,
            eventType,
            messageId: safeMessageId || undefined,
            statusId: safeStatusId || undefined,
            ...safeDedupSummary,
          },
        });
        return res.status(200).json({ success: true, received: true, duplicate: true, ignored: true });
      }

      // 3. Normalization/Logging if new
      let result: any = null;
      if (eventType === "message") {
        result = cloudWebhookEventToInternalIncomingMessage(req.body);
      } else if (eventType === "status") {
        result = cloudWebhookStatusToInternalStatus(req.body);
        if (result && result.providerMessageId) {
          try {
            const { updateOutboundReceiptProviderStatus } = await import("./src/services/outbound-send-receipt-service.ts");
            const updated = updateOutboundReceiptProviderStatus(result.providerMessageId, result.status, {
              botId: process.env.BOT_ID || botId,
              userId: process.env.USER_ID,
              errorCode: result.rawPayload?.errors?.[0]?.code ? String(result.rawPayload.errors[0].code) : undefined,
            });
            if (updated) {
              console.log(`[Webhook] Updated outbound receipt ${updated.receiptId} providerStatus -> ${result.status} for ${result.providerMessageId}`);
            }
          } catch (e: any) {
            console.warn("[Webhook] Failed updating receipt provider status:", e?.message || e);
          }

          return res.status(200).json({
            success: true,
            received: true,
            statusProcessed: true,
            providerMessageId: result.providerMessageId,
            status: result.status,
          });
        }
      }

      const safeSummary = summarizeCloudApiInboundAdapterResult(result);

      let localHistoryMessage = null;
      let localHistorySummary: any = null;
      if (eventType === "message" && result) {
        localHistoryMessage = cloudIncomingMessageToLocalHistoryMessage(result);
        if (localHistoryMessage) {
          if (localHistoryMessage.key?.id) {
            const durableClaim = await claimCloudInboundMessage({
              accountId: process.env.USER_ID,
              botId: process.env.BOT_ID || botId,
              providerMessageId: localHistoryMessage.key.id,
            });
            if (durableClaim.isDuplicate) {
              return res.status(200).json({ success: true, received: true, duplicate: true, ignored: true });
            }
          }
          localHistorySummary = summarizeCloudLocalHistoryMessage(localHistoryMessage);
          console.log(`[Webhook] Converted Cloud API inbound message to local history shape:`, JSON.stringify(localHistorySummary));

          const gateOpen = isCloudTextProcessingGateOpen();
          if (!gateOpen) {
            const decisionLog = {
              cloudTextProcessingEligible: false,
              reason: "cloud_runtime_disabled",
              messageId: localHistoryMessage.key.id,
              customerJid: localHistoryMessage.key.remoteJid,
              textLength: (localHistoryMessage.message?.conversation || "").length,
            };
            console.log(`[Webhook] Cloud text processing blocked:`, JSON.stringify(decisionLog));

            const metadata: any = {
              botId,
              phoneNumberId,
              eventType,
              ...safeSummary,
              ...safeDedupSummary,
              localHistorySummary,
              decisionLog,
            };

            emitLiveConsoleEvent({
              type: "whatsapp_cloud_webhook_received",
              level: "info",
              scope: "bot",
              accountId: process.env.USER_ID,
              botId: process.env.BOT_ID,
              title: "Cloud Webhook Process Gate Closed",
              message: `Cloud text processing skipped: runtime is disabled.`,
              metadata,
            });

            return res.status(200).json({
              success: true,
              received: true,
              processingSkipped: true,
              reason: "cloud_runtime_disabled"
            });
          }

          // Process inbound customer message with tenant-safe data ownership
          const jid = localHistoryMessage.key.remoteJid;
          const fallbackBotJid = `cloud_${process.env.BOT_ID || botId || "instance"}@internal`;
          const botJid = cloudApiTrackedSender?.user?.id || fallbackBotJid;
          const dataOwnerKey = await resolveAccountDataOwnerKey(
            process.env.USER_ID,
            process.env.BOT_ID || botJid
          );

          // Initialize localStore entry if empty
          if (!localStore[jid]) {
            localStore[jid] = [];
          }

          // Append localStore
          const ledgerChanged = appendMessageToConversationLedger(localStore, jid, localHistoryMessage, {
            limit: CUSTOMER_CONVERSATION_LEDGER_LIMIT,
          });
          if (ledgerChanged) {
            saveLocalStore();
          }

          // Save message to DB
          await dbService.saveMessage(
            dataOwnerKey,
            jid,
            "user",
            localHistoryMessage.message.conversation,
            localHistoryMessage.key.id,
            localHistoryMessage.pushName,
            {
              actualBotId: process.env.BOT_ID,
              actualBotJid: botJid,
            }
          ).catch((e: any) => {
            console.error("[Webhook] Failed saving Cloud message to DB:", e?.message || e);
          });

          // Retrieve profile
          const existingProfile = await dbService.getCustomerProfile(dataOwnerKey, jid).catch(() => null);
          const customerDisplayName = localHistoryMessage.pushName || jid;

          if (isPersonalInstance(botConfig)) {
            let resolvedPersonalContact: any = null;
            let isNewContact = false;
            if (process.env.USER_ID) {
              const ingestRes = await ingestPersonalContactInboundMessage(process.env.USER_ID, botConfig, {
                remoteJid: jid,
                pushName: localHistoryMessage.pushName,
                text: localHistoryMessage.text,
                timestamp: localHistoryMessage.timestamp,
              }).catch((err) => {
                console.warn("[PersonalContact] Cloud inbound ingestion failed:", err?.message || err);
                return null;
              });
              resolvedPersonalContact = ingestRes?.contact || null;
              isNewContact = Boolean(ingestRes?.isNew);

              const missionRoute = await routePersonalInboundMessage({
                tenantId: process.env.USER_ID,
                personalInstanceId: (botConfig as any)?.$id || (botConfig as any)?.bot_id || dataOwnerKey,
                remoteJid: jid,
                messageId: localHistoryMessage.messageId || `cmsg_${Date.now()}`,
                textContent: localHistoryMessage.text,
                contact: resolvedPersonalContact,
                sock: {
                  sendMessage: async (targetJid: string, content: any) => {
                    return sendUniversalTextViaActiveProvider(targetJid, content.text);
                  },
                },
              }).catch((err) => {
                console.error("[PersonalOutboundRouting] Cloud error:", err?.message || err);
                return { handled: false };
              });

              if (!missionRoute.handled) {
                await handleIncomingPersonalAssistantMessage({
                  tenantId: process.env.USER_ID,
                  botConfig,
                  remoteJid: jid,
                  messageId: localHistoryMessage.messageId || `cmsg_${Date.now()}`,
                  textContent: localHistoryMessage.text,
                  isFromMe: false,
                  pushName: localHistoryMessage.pushName,
                  contact: resolvedPersonalContact,
                  isNewContact,
                  sock: {
                    sendMessage: async (targetJid: string, content: any) => {
                      return sendUniversalTextViaActiveProvider(targetJid, content.text);
                    },
                  },
                  botSentMessageIds,
                  io,
                  emitLiveConsoleEvent,
                }).catch((err) => {
                  console.error("[PersonalAssistant] Cloud message handling error:", err?.message || err);
                });
              }
            }
            return res.status(200).json({ success: true, received: true, personalAssistantHandled: true });
          }

          // Gates
          const stopState = getCustomerAutoReplyStopState(
            existingProfile || {},
            Math.floor(Date.now() / 1000),
            {
              jid,
              altJid: existingProfile?.phoneJid || existingProfile?.phoneNumber || existingProfile?.whatsapp_number,
              mutedNumbers: botConfig.muted_numbers || [],
            }
          );

          if (stopState.isStopped) {
            io.emit("system-log", {
              type: "info",
              msg: `[Cloud] Auto-reply skipped for ${customerDisplayName}: ${stopState.message || "auto-reply is stopped"}.`,
            });
            emitLiveConsoleEvent({
              type: "ai_skipped",
              level: "warn",
              scope: "bot",
              accountId: process.env.USER_ID,
              botId: dataOwnerKey,
              customerJid: jid,
              title: "AI skipped",
              message: "Auto-reply skipped for Cloud API customer.",
              reason: (stopState as any).reason || (stopState.kind === "admin_pause_temp" ? "customer_paused_temp" : stopState.kind === "admin_pause_permanent" ? "customer_paused_permanent" : (stopState.message || "customer_paused")),
            });
            return res.status(200).json({ success: true, received: true, processingSkipped: true, reason: "muted_or_stopped" });
          }

          if (isCustomerAiPaused(existingProfile || {})) {
            io.emit("system-log", {
              type: "info",
              msg: `[Cloud] Skipped reply because manual review is required for ${customerDisplayName}.`,
            });
            emitLiveConsoleEvent({
              type: "ai_skipped",
              level: "warn",
              scope: "bot",
              accountId: process.env.USER_ID,
              botId: dataOwnerKey,
              customerJid: jid,
              title: "AI skipped",
              message: "Manual review is required before replying.",
              reason: "manual_review_required",
            });
            return res.status(200).json({ success: true, received: true, processingSkipped: true, reason: "paused" });
          }

          const aiEligibility = await getAiReplyAccountEligibility(dataOwnerKey);
          if (!aiEligibility.eligible) {
            await blockAiReplyByBillingState({
              eligibility: aiEligibility,
              jid,
              source: "cloud incoming message",
            });
            return res.status(200).json({ success: true, received: true, processingSkipped: true, reason: "billing_blocked" });
          }
          const realInboundCheck = isRealInboundCustomerMessage(localHistoryMessage);
          if (!realInboundCheck.ok) {
            io.emit("system-log", { type: "info", msg: `internal_placeholder_ignored_as_customer_message reason=${realInboundCheck.reason}` });
            io.emit("system-log", { type: "info", msg: `fake_newer_customer_message_rejected reason=${realInboundCheck.reason}` });
            return res.status(200).json({ success: true, received: true, processingSkipped: true, reason: "not_real_customer_message" });
          }
          io.emit("system-log", { type: "info", msg: `real_inbound_customer_message_accepted messageId=${String(localHistoryMessage.key?.id || "").slice(0, 24)} type=${realInboundCheck.kind}` });

          await ensureAiReplyRetryQueueLoaded();
          queueAiReplyRetry(pendingAiReplyRetries, {
            botId: dataOwnerKey,
            jid,
            messageId: localHistoryMessage.key.id,
            source: "cloud incoming message",
            lastCustomerMessageAt: localHistoryMessage.messageTimestamp * 1000,
          });
          await persistAiReplyRetryQueue();
          await queueActiveMessageBatch({
            botId: dataOwnerKey,
            jid,
            message: localHistoryMessage,
            source: "cloud incoming message",
            transport: "cloud",
          });
          io.emit("system-log", {
            type: "info",
            msg: `[Cloud] pending_ai_reply_created: ${jid.split("@")[0]}.`,
          });
          if (localHistoryMessage?.key?.id) {
            await updateCloudInboundMessageState({
              claimKeyOrId: `${process.env.USER_ID}_${process.env.BOT_ID || botId}_cloud_${localHistoryMessage.key.id}`,
              state: "processed",
            }).catch(() => {});
          }
          return res.status(200).json({ success: true, received: true, processed: true, batched: true });
        }
      }

      if (result) {
        const metadata: any = {
          botId,
          phoneNumberId,
          eventType,
          ...safeSummary,
          ...safeDedupSummary,
        };
        if (localHistorySummary) {
          metadata.localHistorySummary = localHistorySummary;
        }

        emitLiveConsoleEvent({
          type: "whatsapp_cloud_webhook_received",
          level: "info",
          scope: "bot",
          accountId: process.env.USER_ID,
          botId: process.env.BOT_ID,
          title: "Cloud Webhook Normalized",
          message: `Normalized event: ${eventType}.`,
          metadata,
        });
        return res.status(200).json({ success: true, received: true });
      } else {
        emitLiveConsoleEvent({
          type: "whatsapp_cloud_webhook_failed",
          level: "warn",
          scope: "bot",
          accountId: process.env.USER_ID,
          botId: process.env.BOT_ID,
          title: "Cloud Webhook Ignored",
          message: `Ignored or malformed event after normalization: ${eventType}.`,
          metadata: {
            botId,
            phoneNumberId,
            eventType,
            ...safeSummary,
            ...safeDedupSummary,
          },
        });
        return res.status(200).json({ success: true, received: true, ignored: true });
      }
    } catch (e: any) {
      console.error("[Worker] Cloud Webhook processing failed:", e?.message || e);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  app.post("/api/reset-session", async (req, res) => {
    console.log("[WA] RESET SESSION INITIATED");
    res.json({ status: "ok" });
    setTimeout(() => { try { if (sock) { sock.end(undefined); sock.ws.close(); } if (initWhatsApp) initWhatsApp(); } catch(e: any) {} }, 1000);
  });

  app.post("/api/inbox/manual-reply", express.json(), async (req, res) => {
    try {
      const { botId, customerJid, text } = req.body;
      if (!botId || !customerJid || !text) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      if (botId !== process.env.BOT_ID) {
        return res.status(400).json({ error: "Bot ID mismatch for this worker" });
      }
      // Clean JID to remove any device ID prefix (e.g. :1 or :2)
      const cleanJid = cleanInboxTargetJid(customerJid);
      if (!isInboxSendableJid(cleanJid)) {
        return res.status(400).json({ error: "Cannot send: invalid or non-sendable JID" });
      }
      const rawResult = await sendTextViaActiveProvider(cleanJid, text);
      const messageId = String(rawResult?.key?.id || "");
      res.json({ success: true, messageId });
    } catch (e: any) {
      console.error("[Worker] Manual reply failed:", e?.message || e);
      res.status(500).json({ error: e?.message || "Failed to send manual reply via active provider" });
    }
  });

  function unwrapMessageContent(message: any): any {
    let current = message?.originalMessage || message;
    if (current?.message) current = current.message;
    while (
      current?.ephemeralMessage?.message ||
      current?.viewOnceMessage?.message ||
      current?.viewOnceMessageV2?.message ||
      current?.documentWithCaptionMessage?.message
    ) {
      current =
        current.ephemeralMessage?.message ||
        current.viewOnceMessage?.message ||
        current.viewOnceMessageV2?.message ||
        current.documentWithCaptionMessage?.message;
    }
    return current;
  }

  async function downloadMediaMessageBuffer(rawInput: any, sock: any) {
    const mediaFetchAgent = (sock as any)?.fetchAgent;
    const options = mediaFetchAgent ? { options: { dispatcher: mediaFetchAgent } } : undefined;

    const message = unwrapMessageContent(rawInput?.originalMessage?.message || rawInput?.message || rawInput?.originalMessage || rawInput);

    let downloadType: "image" | "video" | "audio" | "document" | "sticker" | null = null;
    let mediaKey: any = null;

    if (message?.imageMessage) {
      downloadType = "image";
      mediaKey = message.imageMessage;
    } else if (message?.videoMessage) {
      downloadType = "video";
      mediaKey = message.videoMessage;
    } else if (message?.audioMessage) {
      downloadType = "audio";
      mediaKey = message.audioMessage;
    } else if (message?.documentMessage) {
      downloadType = "document";
      mediaKey = message.documentMessage;
    } else if (message?.stickerMessage) {
      downloadType = "sticker";
      mediaKey = message.stickerMessage;
    }

    if (!downloadType || !mediaKey) {
      throw new Error("No download-able media found in this message structure");
    }

    const { downloadContentFromMessage } = Baileys;
    const stream = await downloadContentFromMessage(mediaKey, downloadType, options as any);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
      buffer = Buffer.concat([buffer, chunk]);
    }

    let defaultMime = "application/octet-stream";
    if (downloadType === "image") defaultMime = "image/jpeg";
    else if (downloadType === "video") defaultMime = "video/mp4";
    else if (downloadType === "audio") defaultMime = "audio/ogg";
    else if (downloadType === "sticker") defaultMime = "image/webp";

    const mimeType = mediaKey.mimetype || defaultMime;
    const fileName = mediaKey.fileName || mediaKey.filename || `media_${Date.now()}`;

    return {
      buffer,
      mimeType,
      fileName,
      caption: mediaKey.caption || "",
      downloadType
    };
  }

  app.get("/api/inbox/media", async (req, res) => {
    try {
      const botId = req.query.botId as string;
      const customerJid = req.query.customerJid as string;
      const messageId = req.query.messageId as string;

      if (!botId || !customerJid || !messageId) {
        return res.status(400).send("Missing required parameters");
      }
      if (botId !== process.env.BOT_ID) {
        return res.status(400).send("Bot ID mismatch for this worker");
      }

      let msgsArray = localStore[customerJid] || [];
      let msg = msgsArray.find((m) => m.key?.id === messageId);

      if (!msg || !msg.message) {
        // Try searching all chats in the local store by key ID
        for (const [chatId, arr] of Object.entries(localStore)) {
          if (Array.isArray(arr)) {
            const found = arr.find((m) => m.key?.id === messageId);
            if (found && found.message) {
              msg = found;
              break;
            }
          }
        }
      }

      if (!msg || !msg.message) {
        return res.status(404).send("Media is no longer available from WhatsApp. Ask customer to resend it.");
      }

      const mediaResult = await downloadMediaMessageBuffer(msg.message, sock);

      res.setHeader("Content-Type", mediaResult.mimeType || "application/octet-stream");
      const disposition = ["image", "video", "audio"].includes(mediaResult.downloadType) ? "inline" : "attachment";
      res.setHeader("Content-Disposition", `${disposition}; filename="${encodeURIComponent(mediaResult.fileName)}"`);
      res.send(mediaResult.buffer);
    } catch (e: any) {
      console.error("[Worker] Media download failed:", e?.message || e);
      res.status(500).send("Media is no longer available from WhatsApp. Ask customer to resend it.");
    }
  });

  app.get("/api/content-library/media", async (req, res) => {
    try {
      const botId = req.query.botId as string;
      const groupJid = req.query.groupJid as string;
      const messageId = req.query.messageId as string;

      if (!botId || !messageId) {
        return res.status(400).send("Missing required parameters");
      }
      if (botId !== process.env.BOT_ID) {
        return res.status(400).send("Bot ID mismatch for this worker");
      }

      let msg: any = null;

      // 1. Search cachedMediaTemplates
      const foundTemplate = cachedMediaTemplates.find((t: any) =>
        t?.id === messageId ||
        t?.messageId === messageId ||
        t?.originalMessage?.key?.id === messageId ||
        t?.originalMessage?.id === messageId ||
        t?.key?.id === messageId
      );
      if (foundTemplate) {
        msg = foundTemplate.originalMessage || foundTemplate;
      }

      // 2. Search localStore[groupJid] if groupJid provided
      if (!msg && groupJid && Array.isArray(localStore[groupJid])) {
        msg = localStore[groupJid].find((m: any) =>
          m?.key?.id === messageId ||
          m?.id === messageId ||
          m?.originalMessage?.key?.id === messageId ||
          m?.originalMessage?.id === messageId
        );
      }

      // 3. Search mediaGroupJid
      if (!msg && mediaGroupJid && Array.isArray(localStore[mediaGroupJid])) {
        msg = localStore[mediaGroupJid].find((m: any) =>
          m?.key?.id === messageId ||
          m?.id === messageId ||
          m?.originalMessage?.key?.id === messageId ||
          m?.originalMessage?.id === messageId
        );
      }

      // 4. Search all chats in localStore
      if (!msg) {
        for (const [chatId, arr] of Object.entries(localStore)) {
          if (Array.isArray(arr)) {
            const found = arr.find((m: any) =>
              m?.key?.id === messageId ||
              m?.id === messageId ||
              m?.originalMessage?.key?.id === messageId ||
              m?.originalMessage?.id === messageId
            );
            if (found) {
              msg = found;
              break;
            }
          }
        }
      }

      // 5. Search welcome and sequence templates
      if (!msg) {
        const foundWelcome = cachedWelcomeTemplates.find((m: any) =>
          m?.key?.id === messageId ||
          m?.id === messageId ||
          m?.originalMessage?.key?.id === messageId
        );
        if (foundWelcome) {
          msg = foundWelcome.originalMessage || foundWelcome;
        }
      }
      if (!msg) {
        for (const seq of Object.values(cachedKeywordSequences)) {
          const templates = (seq as any)?.templates || [];
          const foundSeq = templates.find((m: any) =>
            m?.key?.id === messageId ||
            m?.id === messageId ||
            m?.originalMessage?.key?.id === messageId
          );
          if (foundSeq) {
            msg = foundSeq.originalMessage || foundSeq;
            break;
          }
        }
      }

      if (!msg) {
        return res.status(404).send("The original WhatsApp media could no longer be downloaded.");
      }

      const mediaResult = await downloadMediaMessageBuffer(msg, sock);

      const mimeType = mediaResult.mimeType || "application/octet-stream";
      const isInline = ["image", "video", "audio", "sticker"].includes(mediaResult.downloadType) || mimeType === "application/pdf";
      const disposition = isInline ? "inline" : "attachment";

      res.setHeader("Content-Type", mimeType);
      res.setHeader("Content-Disposition", `${disposition}; filename="${encodeURIComponent(mediaResult.fileName)}"`);
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Cache-Control", "private, max-age=86400");

      const range = req.headers.range;
      const total = mediaResult.buffer.length;
      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : total - 1;
        const chunk = mediaResult.buffer.subarray(start, end + 1);
        res.writeHead(206, {
          "Content-Range": `bytes ${start}-${end}/${total}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunk.length,
          "Content-Type": mimeType,
          "Content-Disposition": `${disposition}; filename="${encodeURIComponent(mediaResult.fileName)}"`,
        });
        return res.end(chunk);
      }

      res.setHeader("Content-Length", String(total));
      res.send(mediaResult.buffer);
    } catch (e: any) {
      console.error("[Worker] Content library media download failed:", e?.message || e);
      res.status(500).send("The original WhatsApp media could no longer be downloaded.");
    }
  });

  app.post("/api/inbox/manual-attachment", express.json({ limit: "20mb" }), async (req, res) => {
    try {
      const { botId, customerJid, fileBase64, fileName, mimeType, caption } = req.body;
      if (!botId || !customerJid || !fileBase64 || !mimeType) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      if (botId !== process.env.BOT_ID) {
        return res.status(400).json({ error: "Bot ID mismatch for this worker" });
      }
      // Clean JID to remove any device ID prefix (e.g. :1 or :2)
      const cleanJid = cleanInboxTargetJid(customerJid);
      if (!isInboxSendableJid(cleanJid)) {
        return res.status(400).json({ error: "Cannot send: invalid or non-sendable JID" });
      }

      if (!sock) {
        return res.status(503).json({ error: "WhatsApp socket is not connected yet" });
      }

      const buffer = Buffer.from(fileBase64, "base64");
      const mediaType = mimeType.startsWith("image/")
        ? "image"
        : mimeType.startsWith("video/")
          ? "video"
          : mimeType.startsWith("audio/")
            ? "audio"
            : "document";
      const sender = createWhatsAppOutboundSender({
        providerType: "whatsapp_web",
        baileysSendMessage: (targetJid, payload) => sock.sendMessage(targetJid, payload),
      });
      const sent = await sender.sendMedia({
        jid: cleanJid,
        buffer,
        mimetype: mimeType,
        type: mediaType,
        caption,
        fileName: fileName || "file",
      });
      if (!sent.success) {
        return res.status(502).json({ error: sent.errorMessage || "Failed to send attachment via active provider" });
      }
      const messageId = String(sent.providerMessageId || (sent.rawProviderResponse as any)?.key?.id || "");
      if (!messageId) {
        return res.status(502).json({ error: "WhatsApp send returned no message id" });
      }
      res.json({ success: true, messageId });
    } catch (e: any) {
      console.error("[Worker] Manual attachment failed:", e?.message || e);
      res.status(500).json({ error: e?.message || "Failed to send manual attachment via active provider" });
    }
  });

  app.post("/api/shutdown", async (req, res) => {
    console.log("[Worker] Shutdown requested. Terminating process cleanly to prevent zombies.");
    await releaseUnconnectedProxyLease({
      userId: process.env.USER_ID,
      botId: process.env.BOT_ID,
      connectionStatus,
      reason: "worker shutdown before WhatsApp connected",
    }).catch(() => {});
    res.json({ status: "shutting_down" });
    setTimeout(() => {
        try { if (sock) { sock.end(undefined); sock.ws.close(); } } catch(e) {}
        process.exit(0);
    }, 500);
  });

  const PORT = parseInt(process.env.PORT || "3000", 10);
  const server = http.createServer(app);
  console.log("[Server] HTTP server created.");

  const io = new Server(server, {
    cors: corsOptions as any,
    allowRequest: (req, callback) => {
      const origin = String(req.headers.origin || "");
      const remoteAddress = String(req.socket.remoteAddress || "");
      if (isLoopbackAddress(remoteAddress) || isTrustedAppOrigin(origin)) {
        return callback(null, true);
      }
      console.warn(`[Security] blocked_origin ${JSON.stringify({
        origin: normalizeOriginValue(origin) || origin,
        remoteAddress,
        path: req.url || "",
      })}`);
      return callback("Origin not allowed", false);
    },
    transports: ["websocket", "polling"],
    pingInterval: 10000,
    pingTimeout: 5000,
  });
  console.log("[Server] Socket.io initialized.");

  const recentLogs: any[] = [];
  const recentMessages: any[] = [];
  setLiveConsoleEventBroadcaster((event) => {
    io.emit("live-audit-event", event);
  });
  const originalEmit = io.emit.bind(io);
  // @ts-ignore
  io.emit = (event: string, data: any, ...args: any[]) => {
    if (event === "system-log") {
      recentLogs.push(data);
      if (recentLogs.length > 100) recentLogs.shift();
    } else if (event === "whatsapp-message") {
      recentMessages.push(data);
      if (recentMessages.length > 50) recentMessages.shift();
    }
    return originalEmit(event, data, ...args);
  };


  // Store setup
  console.log("[Server] Initializing Baileys store...");
  const store = (Baileys as any).makeInMemoryStore
    ? (Baileys as any).makeInMemoryStore({ logger })
    : null;
  const STORE_FILE = path.join(__dirname, `baileys_store_${process.env.BOT_ID}.json`);

  if (store) {
    try {
      if (fs.existsSync(STORE_FILE)) {
        console.log("[Server] Reading store from file...");
        store.readFromFile(STORE_FILE);
      }
    } catch (e) {
      console.error("[Server] Error reading store:", e);
    }

    setInterval(() => {
      try {
        store.writeToFile(STORE_FILE);
      } catch (e) {}
    }, 10_000);
  }

  // --- Auth Endpoints ---
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { email, password, name } = req.body;
      const userId = Math.random().toString(36).substring(2, 15);
      await dbService.createUser({ id: userId, email, name, password_hash: password });
      res.json({ success: true, user: { id: userId, email, name } });
    } catch (e: any) {
       res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      const user = await dbService.getUser(email.toLowerCase()) as any;
      if (user && user.password_hash === password) {
        res.json({ success: true, user: { id: user.$id, email: user.email, name: user.name } });
      } else {
        res.status(401).json({ error: "Invalid email or password" });
      }
    } catch(e: any) {
       res.status(500).json({ error: e.message });
    }
  });
  // ----------------------

  // WhatsApp Logic
  let sock: any = null;
  const getActualInstanceMeta = () => {
    const actualBotId = process.env.BOT_ID || "";
    const actualBotJid = sock?.user?.id ? `${String(sock.user.id).split(":")[0]}@s.whatsapp.net` : "";
    return { actualBotId, actualBotJid };
  };
  const sendTextViaActiveProvider = async (jid: string, text: string, options?: any) => {
    if (cloudApiTrackedSender) {
      const payload: any = options?.template ? { template: options.template } : { text };
      const rawRes = await cloudApiTrackedSender.sendMessage(jid, payload);
      return rawRes;
    }
    if (!sock) throw new Error("Socket/Connection is not ready.");
    const sender = createWhatsAppOutboundSender({
      providerType: "whatsapp_web",
      baileysSendMessage: (targetJid, payload) => sock.sendMessage(targetJid, payload),
    });
    const result = await sender.sendText(jid, text, options);
    if (!result.success) {
      throw new Error(result.errorMessage || "Failed to send outbound message via active provider.");
    }
    return result.rawProviderResponse;
  };
  const sendUniversalTextViaActiveProvider = async (
    jid: string,
    text: string,
    options?: { trackId?: boolean }
  ): Promise<{ messageId: string; remoteJid: string; timestamp: number }> => {
    const rawResult = await sendTextViaActiveProvider(jid, text);
    const messageId = String(rawResult?.key?.id || "");

    if (messageId && options?.trackId !== false) {
      botSentMessageIds.add(messageId);
    }

    return {
      messageId,
      remoteJid: jid,
      timestamp: Date.now(),
    };
  };
  const simulateTyping = async (jid: string, config?: any) => {
    if (!sock) return;
    if (config && config.human_delay_enabled === 0) return;
    try {
      await sock.sendPresenceUpdate("composing", jid);
      const delay = Math.floor(Math.random() * (4500 - 1500 + 1) + 1500); 
      await new Promise(r => setTimeout(r, delay));
      await sock.sendPresenceUpdate("paused", jid);
    } catch (e) {}
  };

  const applyHumanDelay = async (jid: string, textOrBufferLength: number, isVoice: boolean, config: any) => {
    if (!sock) return;
    // human_delay_enabled defaults to 1 if not strictly false/0. Only skip if exactly 0.
    if (config && config.human_delay_enabled === 0) return;
    
    try {
      if (isVoice) {
         await sock.sendPresenceUpdate("recording", jid);
         // Voice: assuming 12 bytes/chars per sec for TTS output size estimate, but wait, if it's audio buffer size, it's huge. 
         // For text-based estimation, we should pass original text length instead of buffer size!
         // We will pass text.length to this function, or buffer length? 
         // Let's pass text length for voice too. Delay: 2x voice duration. 
         // Voice duration: ~150 WPM = 2.5 words/sec = 12.5 chars/sec. Delay = (chars / 12.5) * 2 = chars / 6.25 seconds.
         const delayMs = Math.max((textOrBufferLength / 6.25) * 1000, 2000); 
         // Add random jitter 1-3 seconds
         const jitter = Math.floor(Math.random() * 2000) + 1000;
         await new Promise(r => setTimeout(r, delayMs + jitter));
      } else {
         await sock.sendPresenceUpdate("composing", jid);
         // Text typing: ~40 WPM = ~3.3 chars/sec. Delay = chars / 3.3 seconds.
         const delayMs = Math.max((textOrBufferLength / 3.3) * 1000, 1500);
         // Cap max delay to 15 seconds to not stall forever
         const finalDelay = Math.min(delayMs, 15000);
         const jitter = Math.floor(Math.random() * 1500) + 500;
         await new Promise(r => setTimeout(r, finalDelay + jitter));
      }
      await sock.sendPresenceUpdate("paused", jid);
    } catch (e) {}
  };
  let qrCodeData: string | null = null;
  let connectionStatus = "disconnected";
  let connectionRetryCount = 0;
  let connectionRetryState: any = null;
  let dashboardClientCount = 0;
  let unconnectedProxyReleaseTimer: NodeJS.Timeout | null = null;
  let welcomeGroupJid: string | null = null;
  let mediaGroupJid: string | null = null;
  const teaserSentTo = new Set<string>();
  // currentlyReplying is now defined at top-level
  let isSyncingTemplates = false;
  let cachedWelcomeTemplates: any[] = [];
  let cachedMediaTemplates: any[] = [];
  let cachedKeywordSequences: Record<string, { jid: string, templates: any[], config: any }> = {};
  let loadTemplatesTimeout: any = null;
  let autoSyncIntervalId: NodeJS.Timeout | null = null;
  
  let matchedGroupNames: string[] = [];

  function clearUnconnectedProxyReleaseTimer() {
    if (unconnectedProxyReleaseTimer) {
      clearTimeout(unconnectedProxyReleaseTimer);
      unconnectedProxyReleaseTimer = null;
    }
  }

  function emitConnectionRetry(reason: any, nextRetryMs: number) {
    connectionRetryCount += 1;
    connectionStatus = "retrying";
    qrCodeData = null;
    connectionRetryState = buildWhatsAppConnectionRetryState({
      retryCount: connectionRetryCount,
      reason,
      nextRetryMs,
    });
    io.emit("whatsapp-status", connectionStatus);
    io.emit("whatsapp-retry-status", connectionRetryState);
    io.emit("system-log", {
      type: "warning",
      msg: `WhatsApp connection retry ${connectionRetryState.retryCount}: ${connectionRetryState.reason || "temporary connection issue"}.`,
    });
  }

  function resetConnectionRetryState() {
    connectionRetryCount = 0;
    connectionRetryState = null;
    io.emit("whatsapp-retry-status", { retryCount: 0, reason: "", status: connectionStatus });
  }

  function scheduleUnconnectedProxyRelease(reason: string) {
    clearUnconnectedProxyReleaseTimer();
    if (connectionStatus === "connected") return;
    unconnectedProxyReleaseTimer = setTimeout(async () => {
      if (dashboardClientCount > 0 || connectionStatus === "connected") return;
      await releaseUnconnectedProxyLease({
        userId: process.env.USER_ID,
        botId: process.env.BOT_ID,
        connectionStatus,
        reason,
      }).catch(() => {});
      try { if (sock) { sock.end(undefined); sock.ws.close(); } } catch(e) {}
      process.exit(0);
    }, 120000);
  }
  
  const getEnrichedConfig = () => {
    const config = { ...botConfig };
    if (config.groups) {
        config.groups = config.groups.map((g: any) => {
            let count = 0;
            if (g.purpose === 'welcome') count = cachedWelcomeTemplates.length;
            else if (g.purpose === 'media') count = cachedMediaTemplates.length;
            else {
                const seq = Object.values(cachedKeywordSequences).find(s => s.config?.name === g.name || s.jid === g.name);
                if (seq) count = seq.templates?.length || 0;
            }
            return { ...g, templateCount: count };
        });
    }
    return config;
  };

  const getTemplateGroupEntries = () => {
    return (botConfig?.groups || [])
      .filter((g: any) => g && g.enabled !== false && g.jid && ["welcome", "media", "sequence"].includes(g.purpose));
  };

  const isTemplateGroupJid = (jid: string) => {
    return getTemplateGroupEntries().some((g: any) => g.jid === jid) ||
      jid === welcomeGroupJid ||
      jid === mediaGroupJid ||
      Object.values(cachedKeywordSequences).some((s: any) => s.jid === jid);
  };

  const getTemplateGroupPurpose = (jid: string) => {
    const configured = getTemplateGroupEntries().find((g: any) => g.jid === jid);
    if (configured?.purpose) return configured.purpose;
    if (jid === mediaGroupJid) return "media";
    if (jid === welcomeGroupJid) return "welcome";
    if (Object.values(cachedKeywordSequences).some((s: any) => s.jid === jid)) return "sequence";
    return "";
  };

  const hasTemplatePayload = (msg: any, purpose = "") => {
    const rawMsg = msg?.originalMessage?.message || msg?.message || msg?.originalMessage || msg;
    const content = unwrapMessageContent(rawMsg);
    if (!content || content.protocolMessage) return false;
    const hasMedia = !!(
      content.imageMessage ||
      content.videoMessage ||
      content.documentMessage ||
      content.audioMessage ||
      content.stickerMessage
    );
    if (purpose === "media") return hasMedia;
    return !!(
      content.conversation ||
      content.extendedTextMessage ||
      content.imageMessage ||
      content.videoMessage ||
      content.documentMessage ||
      content.audioMessage ||
      content.stickerMessage
    );
  };

  const getTemplateCaption = (msg: any, fallback = "Media File") => {
    const rawMsg = msg?.originalMessage?.message || msg?.message || msg?.originalMessage || msg;
    const content = unwrapMessageContent(rawMsg);
    return (
      content?.imageMessage?.caption ||
      content?.videoMessage?.caption ||
      content?.documentMessage?.caption ||
      content?.documentMessage?.fileName ||
      content?.audioMessage?.fileName ||
      content?.extendedTextMessage?.text ||
      content?.conversation ||
      (typeof msg?.caption === "string" && msg.caption.trim() ? msg.caption.trim() : "") ||
      fallback
    );
  };

  const normalizeLookup = (value: string) => {
    return (value || "")
      .toLowerCase()
      .replace(/[_-]+/g, " ")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  };

  const mergeMessageArrays = (existing: any[] = [], incoming: any[] = [], resetThreshold = 0) => {
    const merged: any[] = [];
    const seen = new Set<string>();
    for (const item of [...existing, ...incoming]) {
      if (!item?.message) continue;
      const ts = getMessageTimestampMs(item);
      if (resetThreshold > 0 && ts <= resetThreshold) continue;
      const id = item?.key?.id || `${item?.key?.remoteJid || ""}:${item?.messageTimestamp || ""}:${merged.length}`;
      if (seen.has(id)) continue;
      seen.add(id);
      merged.push(item);
    }
    return merged;
  };

  const extractTemplateStore = (includeEmptyGroups = false) => {
    const store: Record<string, any[]> = {};
    for (const entry of getTemplateGroupEntries()) {
      const jid = entry.jid;
      const messages = Array.isArray(localStore[jid]) ? localStore[jid] : [];
      const validMessages = messages.filter((m: any) => hasTemplatePayload(m, entry.purpose));
      if (validMessages.length > 0 || includeEmptyGroups) {
        store[jid] = validMessages;
      }
    }
    // Also include any active configured group jids from localStore if they have valid templates
    for (const [key, val] of Object.entries(localStore)) {
      if (key.endsWith("@g.us") && Array.isArray(val) && val.length > 0 && !store[key]) {
        const purpose = getTemplateGroupPurpose(key) || (key === mediaGroupJid ? "media" : key === welcomeGroupJid ? "welcome" : "sequence");
        const valid = val.filter((m: any) => hasTemplatePayload(m, purpose));
        if (valid.length > 0) {
          store[key] = valid;
        }
      }
    }
    return store;
  };

  const getConnectedBotJid = () => {
    const id = sock?.user?.id;
    return id ? id.split(":")[0] + "@s.whatsapp.net" : "";
  };

  const getConfiguredTemplateGroupJids = () => {
    const jids = new Set<string>();
    if (mediaGroupJid) jids.add(mediaGroupJid);
    if (welcomeGroupJid) jids.add(welcomeGroupJid);
    for (const s of Object.values(cachedKeywordSequences)) {
      if (s?.jid) jids.add(s.jid);
    }
    for (const g of (botConfig?.groups || [])) {
      if (g?.jid && (!g.purpose || ["welcome", "media", "sequence"].includes(g.purpose))) {
        jids.add(g.jid);
      }
    }
    return jids;
  };

  const getTemplateStoreIds = async () => {
    const botId = process.env.BOT_ID || "";
    const userId = process.env.USER_ID || process.env.ACCOUNT_ID || (botConfig as any)?.user_id || (botConfig as any)?.accountId || "";
    const explicitIds = [
      botId,
      getConnectedBotJid()
    ].filter(Boolean);
    try {
      const candidates = await dbService.getTemplateStoreCandidates(userId, botId);
      return Array.from(new Set([...explicitIds, ...candidates]));
    } catch {
      return Array.from(new Set(explicitIds));
    }
  };

  const hydrateTemplateStoreFromDatabase = async (ids?: string[]) => {
    // Defense in depth: compute verified candidate store IDs for current USER_ID and current BOT_ID
    const allowedCandidates = new Set(await getTemplateStoreIds());

    // If caller provided custom ids, only allow those that are in allowedCandidates!
    const storeIds = ids
      ? ids.filter((id) => allowedCandidates.has(id))
      : Array.from(allowedCandidates);

    let restored = 0;
    let sources = 0;
    let groupResetMap: Record<string, number> = { ...(botConfig?.groupResetAt || {}) };
    const configuredJids = getConfiguredTemplateGroupJids();

    for (const storeId of storeIds) {
      const remoteTemplates = await dbService.loadTemplateStore(storeId);
      if (!remoteTemplates) continue;
      try {
        const parsed = JSON.parse(remoteTemplates, Baileys.BufferJSON.reviver);
        sources++;

        const { filteredStore, updatedGroupResetMap } = filterHydrationStoresAndGroups({
          incomingStore: parsed,
          configuredGroupJids: configuredJids,
          existingGroupResetMap: groupResetMap,
        });

        groupResetMap = updatedGroupResetMap;

        for (const [k, incoming] of Object.entries(filteredStore)) {
          const resetThreshold = groupResetMap[k] || 0;
          localStore[k] = mergeMessageArrays(localStore[k], incoming, resetThreshold);
          restored += incoming.length;
        }
      } catch (err) {
        console.error(`[Templates] Error parsing template store for ${storeId}:`, err);
      }
    }
    if (Object.keys(groupResetMap).length > 0) {
      botConfig.groupResetAt = groupResetMap;
    }
    return { restored, sources };
  };

  const executeGroupReset = async (groupJid: string, source: "whatsapp" | "dashboard" | "api" = "api") => {
    if (!groupJid) throw new Error("Missing groupJid for reset");

    // 1. Clear local store for THAT ONE group only
    localStore[groupJid] = [];

    // 2. Clear in-memory cached templates
    if (groupJid === welcomeGroupJid) {
      cachedWelcomeTemplates = [];
    }
    if (groupJid === mediaGroupJid) {
      cachedMediaTemplates = [];
    }
    for (const [seqName, seqData] of Object.entries(cachedKeywordSequences)) {
      if (seqData.jid === groupJid) {
        seqData.templates = [];
      }
    }

    // 3. Durable tombstone (groupResetAt[groupJid] = timestamp)
    const resetAt = Date.now();
    botConfig.groupResetAt = recordGroupResetTimestamp(botConfig.groupResetAt, groupJid, resetAt);

    if (CONFIG_FILE) {
      try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(botConfig));
      } catch {}
    }
    const botId = process.env.BOT_ID;
    if (botId) {
      dbService.saveBotConfig(botId, botConfig).catch(() => {});
    }

    // 4. Durably persist to disk and cloud immediately
    saveLocalStore({ allowEmptyTemplateWrite: true, immediate: true });

    // 5. System log and console audit
    io.emit("system-log", { type: "info", msg: `🗑️ Group templates reset for ${groupJid} (${source}). Library started fresh.` });
    emitLiveConsoleEvent({
      type: "config_reloaded",
      level: "warn",
      scope: "bot",
      accountId: process.env.USER_ID,
      botId: process.env.BOT_ID,
      title: "Group Templates Reset",
      message: `Templates reset for group ${groupJid} via ${source}.`,
      metadata: { groupJid, resetAt, source }
    });

    return { success: true, groupJid, count: 0, resetAt };
  };

  // Pending queue for messages that need templates not yet loaded
  let pendingResponses: { jid: string, sequenceName: string, type: 'welcome' | 'sequence' | 'shortcut' | 'media', mediaTitle?: string, timestamp: number }[] = [];
  const pendingAiReplyRetries = new Map<string, PendingAiReplyRetry>();
  const ELIGIBILITY_BLOCKED_AI_RETRY_STATUSES = new Set([
    "blocked_insufficient_balance",
    "blocked_subscription_expired",
    "blocked_quota_exceeded",
    "blocked_account_suspended",
  ]);
  const pendingAiReplyDrainTimers = new Map<string, NodeJS.Timeout>();
  const aiReplyBillingAlertCooldowns = new Map<string, number>();
  let aiReplyRetryQueueLoaded = false;
  const rejectedCallIds = new Set<string>();
  const AI_BUSY_REPLY_DRAIN_DELAY_MS = 1000;
  const AI_REPLY_BILLING_ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000;
  const STALE_NORMAL_TEXT_BATCH_MARGIN_MS = 1000;

  function buildMessageBatchId(jid: string) {
    return `batch_${jid.split("@")[0]}_${Date.now()}`;
  }

  function getActiveMessageBatch(jid: string) {
    return messageBuffers.get(normalizeWhatsAppJid(jid));
  }

  function isBatchProcessingStatus(status: string) {
    return status === "processing_media" || status === "generating_reply" || status === "sending";
  }

  async function getCustomerBatchState(jid: string, botId?: string) {
    const normalizedJid = normalizeWhatsAppJid(jid);
    const cacheKey = `${botId || getAiReplyRetryBotKey()}::${normalizedJid}`;
    const cached = customerMessageBatchStateCache.get(cacheKey);
    if (cached) return cached;
    const loaded: CustomerMessageBatchState = await loadCustomerMessageBatchState(botId || getAiReplyRetryBotKey(), normalizedJid).catch(() => ({
      lastHandledMessageCursor: "",
      lastHandledMessageTimestamp: 0,
      handledMessageIds: [],
      baselineAppliedAt: 0,
      baselineReplyCursor: "",
      recentTerminalBatches: [],
      activeBatch: null,
      updatedAt: 0,
    }));
    customerMessageBatchStateCache.set(cacheKey, loaded);
    return loaded;
  }

  async function persistCustomerBatchState(jid: string, botId: string, nextState: CustomerMessageBatchState) {
    const normalizedJid = normalizeWhatsAppJid(jid);
    const saved = await saveCustomerMessageBatchState(botId || getAiReplyRetryBotKey(), normalizedJid, nextState).catch(() => nextState);
    customerMessageBatchStateCache.set(`${botId || getAiReplyRetryBotKey()}::${normalizedJid}`, saved);
    return saved;
  }

  async function syncActiveBatchState(jid: string) {
    const batch = getActiveMessageBatch(jid);
    if (!batch) return;
    const state = await getCustomerBatchState(jid, batch.botId);
    await persistCustomerBatchState(jid, batch.botId, withActiveBatchState(state, {
      batchId: batch.batchId,
      status: batch.status,
      messageIds: batch.messageIds,
      latestGenerationMessageId: batch.latestGenerationMessageId,
      updatedAt: Date.now(),
      transport: batch.transport,
    }));
  }

  async function clearActiveBatchState(jid: string, botId: string) {
    const state = await getCustomerBatchState(jid, botId);
    await persistCustomerBatchState(jid, botId, withActiveBatchState(state, null));
  }

  function findLatestSuccessfulBotReplyCursorFromHistory(historyArray: any[] = [], deliveredAtMs = 0) {
    const sorted = [...historyArray].sort((a, b) => getMessageTimestampSeconds(a) - getMessageTimestampSeconds(b));
    for (let index = sorted.length - 1; index >= 0; index -= 1) {
      const message = sorted[index];
      if (message?.key?.fromMe !== true) continue;
      const readable = getReadableMessageContent(message?.message);
      const text = String(readable.text || "").trim().toLowerCase();
      if (!readable.hasMeaningfulContent) continue;
      if (text === "," || text === "ai") continue;
      const timestampMs = getMessageTimestampSeconds(message) * 1000;
      if (deliveredAtMs > 0 && timestampMs > deliveredAtMs) continue;
      return {
        cursor: buildBatchMessageCursor(message),
        timestampSeconds: getMessageTimestampSeconds(message),
      };
    }
    return { cursor: "", timestampSeconds: 0 };
  }

  async function ensureCustomerBatchBaseline(input: {
    botId: string;
    jid: string;
    historyArray: any[];
    profile?: any;
  }) {
    const normalizedJid = normalizeWhatsAppJid(input.jid);
    const state = await getCustomerBatchState(normalizedJid, input.botId);
    if (state.baselineAppliedAt > 0 || state.lastHandledMessageCursor || state.handledMessageIds.length > 0) {
      return state;
    }
    io.emit("system-log", { type: "info", msg: `message_batch_baseline_lazy_started customer=${normalizedJid.split("@")[0]}` });
    const profile = input.profile || await dbService.getCustomerProfile(input.botId, normalizedJid).catch(() => null) || {};
    const deliveryEvidence = getCustomerFacingAiDeliveryEvidence(profile || {});
    const receipt = deliveryEvidence.receiptId ? readOutboundReceipt(deliveryEvidence.receiptId) : null;
    const deliveredAtMs = receipt?.sendStatus === "sent"
      ? Number(receipt?.sentTimestamp || receipt?.updatedAt || deliveryEvidence.deliveredAtMs || 0)
      : deliveryEvidence.deliveredAtMs;
    const replyEvidence = findLatestSuccessfulBotReplyCursorFromHistory(input.historyArray, deliveredAtMs);
    if (!replyEvidence.cursor) {
      const saved = await persistCustomerBatchState(normalizedJid, input.botId, {
        ...state,
        baselineAppliedAt: Date.now(),
        baselineReplyCursor: "",
      });
      io.emit("system-log", { type: "info", msg: "message_batch_baseline_lazy_skipped reason=no_successful_bot_reply" });
      return saved;
    }
    const sorted = [...(input.historyArray || [])].sort((a, b) => getMessageTimestampSeconds(a) - getMessageTimestampSeconds(b));
    const markedMessages = sorted.filter((message: any) => {
      const check = isRealInboundCustomerMessage(message);
      if (!check.ok) return false;
      return buildBatchMessageCursor(message) <= replyEvidence.cursor;
    });
    const latestPending = sorted
      .filter((message: any) => isRealInboundCustomerMessage(message).ok)
      .filter((message: any) => buildBatchMessageCursor(message) > replyEvidence.cursor)
      .at(-1);
    if (latestPending?.key?.id) {
      io.emit("system-log", { type: "info", msg: `baseline_excluded_unhandled_latest_message messageId=${String(latestPending.key.id).slice(0, 24)}` });
    }
    const nextState = await persistCustomerBatchState(normalizedJid, input.botId, withBaselineHandledMessages(state, {
      replyCursor: replyEvidence.cursor,
      replyTimestamp: replyEvidence.timestampSeconds,
      handledMessageIds: markedMessages.map((message: any) => String(message?.key?.id || "")).filter(Boolean),
      markedMessages,
    }));
    io.emit("system-log", {
      type: "info",
      msg: `message_batch_baseline_lazy_applied markedHandled=${markedMessages.length}`
    });
    return nextState;
  }

  function clearMessageBatchTimer(jid: string) {
    const batch = getActiveMessageBatch(jid);
    if (batch?.timer) {
      clearTimeout(batch.timer);
      batch.timer = null;
    }
  }

  async function recoverStaleActiveBatchIfNeeded(jid: string, action: "reset_created_at" | "process_now") {
    const normalizedJid = normalizeWhatsAppJid(jid);
    const batch = getActiveMessageBatch(normalizedJid);
    if (!batch) return null;
    const isActivelyReplying = currentlyReplying.has(normalizedJid) || activeAIControllers.has(normalizedJid);
    if (isActivelyReplying) {
      return null;
    }
    if (isBatchProcessingStatus(batch.status)) {
      batch.status = "pending_debounce";
      batch.pendingWhileProcessing = false;
    }
    const delayProfile = getMessageBatchDelayProfile({ kinds: batch.messageKinds });
    if (!delayProfile.fastPath) return null;
    const ageMs = Math.max(0, Date.now() - batch.createdAt);
    const staleThresholdMs = delayProfile.maxWaitMs + STALE_NORMAL_TEXT_BATCH_MARGIN_MS;
    if (ageMs <= staleThresholdMs && action !== "process_now") return null;
    batch.createdAt = Date.now();
    batch.lastUpdatedAt = batch.createdAt;
    batch.extendedOnce = false;
    batch.status = "pending_debounce";
    await syncActiveBatchState(normalizedJid).catch(() => {});
    io.emit("system-log", {
      type: "info",
      msg: `stale_active_batch_recovered ageMs=${ageMs} action=${action} batchId=${batch.batchId}`
    });
    return batch;
  }

  function markMessageBatchSuperseded(jid: string, newMessageId: string) {
    const batch = getActiveMessageBatch(jid);
    if (!batch || !batch.latestGenerationMessageId) return;
    batch.pendingWhileProcessing = true;
    batch.status = "superseded_by_new_message";
    syncActiveBatchState(jid).catch(() => {});
    io.emit("system-log", { type: "info", msg: `batch_generation_superseded batchId=${batch.batchId} reason=new_real_message_arrived` });
    io.emit("system-log", {
      type: "info",
      msg: `newer_message_skip_replaced_with_batch_merge oldMessageId=${batch.latestGenerationMessageId.slice(0, 24)} newMessageId=${String(newMessageId || "").slice(0, 24)}`
    });
  }

  async function processBufferedMessageBatch(jid: string, source = "message_batch") {
    const normalizedJid = normalizeWhatsAppJid(jid);
    const batch = getActiveMessageBatch(normalizedJid);
    if (!batch || !sock || connectionStatus !== "connected" || !resolveBotAiChatReplyMode(botConfig).allowInboundAiReply) return false;
    const isActivelyReplying = currentlyReplying.has(normalizedJid) || activeAIControllers.has(normalizedJid);
    if (isActivelyReplying) {
      batch.pendingWhileProcessing = true;
      io.emit("system-log", { type: "info", msg: `active_batch_lock_skipped reason=already_processing batchId=${batch.batchId}` });
      return false;
    }
    if (isBatchProcessingStatus(batch.status)) {
      io.emit("system-log", {
        type: "warning",
        msg: `orphaned_batch_status_recovered batchId=${batch.batchId} oldStatus=${batch.status} action=reset_to_pending`
      });
      batch.status = "pending_debounce";
      batch.pendingWhileProcessing = false;
      await syncActiveBatchState(normalizedJid).catch(() => {});
    }

    clearMessageBatchTimer(normalizedJid);
    const historyArray = localStore[normalizedJid] || [];
    await ensureCustomerBatchBaseline({
      botId: batch.botId,
      jid: normalizedJid,
      historyArray,
    });
    const batchState = await getCustomerBatchState(normalizedJid, batch.botId);
    if (isTerminalBatchRecorded(batchState, batch.batchId)) {
      io.emit("system-log", { type: "info", msg: `batch_retry_skipped reason=batch_terminal batchId=${batch.batchId}` });
      await clearActiveBatchState(normalizedJid, batch.botId);
      messageBuffers.delete(normalizedJid);
      return false;
    }
    const selection = {
      allowedMessageIds: isSafeModeEnabled() ? batch.messageIds : undefined,
      handledMessageIds: batchState.handledMessageIds,
      lastHandledMessageCursor: batchState.lastHandledMessageCursor,
      lastHandledMessageTimestamp: batchState.lastHandledMessageTimestamp,
      maxMessages: MESSAGE_BATCH_MAX_PENDING_MESSAGES,
      maxMediaMessages: MESSAGE_BATCH_MAX_PENDING_MEDIA_MESSAGES,
      maxAudioMessages: MESSAGE_BATCH_MAX_PENDING_AUDIO_MESSAGES,
    };
    if (isSafeModeEnabled() && batch.messageIds.length > 0) {
      io.emit("system-log", {
        type: "info",
        msg: `live_batch_restricted_to_active_message_ids count=${batch.messageIds.length}`
      });
    }
    const pendingBatch = collectPendingInboundMessageBatch(historyArray, selection);
    if (isSafeModeEnabled() && pendingBatch.skippedNotAllowed.length > 0) {
      io.emit("system-log", {
        type: "info",
        msg: `live_batch_old_history_excluded_by_active_ids ignored=${pendingBatch.skippedNotAllowed.length}`
      });
    }
    io.emit("system-log", {
      type: "info",
      msg: `message_batch_scope cursor=${pendingBatch.highWaterCursor || batchState.lastHandledMessageTimestamp || 0} selectedMessages=${pendingBatch.messages.length} ignoredHandled=${pendingBatch.skippedHandled.length} ignoredOld=${pendingBatch.skippedOld.length}`
    });
    if (pendingBatch.oldHistoryContextCount > 0) {
      io.emit("system-log", { type: "info", msg: `old_history_context_only count=${pendingBatch.oldHistoryContextCount}` });
    }
    if (!isSafeModeEnabled()) {
      for (const skipped of pendingBatch.skippedHandled) {
        io.emit("system-log", { type: "info", msg: `handled_message_skipped messageId=${skipped.messageId.slice(0, 24)} reason=already_handled` });
        if (skipped.kind === "image") {
          io.emit("system-log", { type: "info", msg: `old_image_excluded_from_pending_batch reason=already_handled messageId=${skipped.messageId.slice(0, 24)}` });
        }
      }
    }
    if (pendingBatch.capSummary.overflowCount > 0) {
      io.emit("system-log", {
        type: "warning",
        msg: `batch_scope_overflow selected=${pendingBatch.messages.length + pendingBatch.overflow.length} cap=${MESSAGE_BATCH_MAX_PENDING_MESSAGES} action=newest_unhandled_only`
      });
    }
    if (pendingBatch.overflow.some((entry) => entry.reason === "batch_media_cap" || entry.reason === "batch_audio_cap")) {
      io.emit("system-log", {
        type: "warning",
        msg: `batch_media_cap_applied mediaSelected=${pendingBatch.capSummary.mediaSelected} mediaCap=${MESSAGE_BATCH_MAX_PENDING_MEDIA_MESSAGES}`
      });
    }
    if (pendingBatch.messages.length === 0) {
      if (isSafeModeEnabled() && batch.messageIds.length > 0) {
        io.emit("system-log", { type: "warning", msg: `live_batch_restricted_selection_empty batchId=${batch.batchId}` });
      }
      batch.status = "cancelled";
      await clearActiveBatchState(normalizedJid, batch.botId);
      messageBuffers.delete(normalizedJid);
      return false;
    }
    const latestPendingMessage = pendingBatch.messages.at(-1);
    if (!canProcessInboundAiMessage(botConfig, getMessageTimestampSeconds(latestPendingMessage) * 1000)) {
      const ignoredState = withHandledBatchMessages(batchState, {
        batchId: batch.batchId,
        terminalStatus: "cancelled",
        messages: pendingBatch.messages,
      });
      await persistCustomerBatchState(normalizedJid, batch.botId, ignoredState);
      await clearActiveBatchState(normalizedJid, batch.botId);
      messageBuffers.delete(normalizedJid);
      console.log(`ai_chat_reply_skipped reason=disabled messageType=${classifyInboundMessageKind(latestPendingMessage)} sequenceMatched=false shortcutMatched=false`);
      return false;
    }
    const eligibility = await getAiReplyAccountEligibility(batch.botId);
    if (!eligibility.eligible) {
      const blockedState = withHandledBatchMessages(batchState, {
        batchId: batch.batchId,
        terminalStatus: "cancelled",
        messages: pendingBatch.messages,
      });
      await persistCustomerBatchState(normalizedJid, batch.botId, blockedState);
      await clearActiveBatchState(normalizedJid, batch.botId);
      messageBuffers.delete(normalizedJid);
      await blockAiReplyByBillingState({
        eligibility,
        jid: normalizedJid,
        source: `message batch (${source})`,
      });
      return false;
    }
    const summary = summarizePendingBatch(pendingBatch.messages);
    const selectedDelayProfile = getMessageBatchDelayProfile({ messages: pendingBatch.messages });
    const batchWaitMs = Math.max(0, Date.now() - batch.createdAt);
    batch.messageIds = pendingBatch.messages.map((message: any) => String(message?.key?.id || "")).filter(Boolean);
    batch.messageKinds = pendingBatch.messages.map((message: any) => classifyInboundMessageKind(message));
    batch.latestGenerationMessageId = String(pendingBatch.messages.at(-1)?.key?.id || "");
    batch.pendingWhileProcessing = false;
    batch.status = "generating_reply";
    await syncActiveBatchState(normalizedJid);
    currentlyReplying.add(normalizedJid);
    const trace = createReplyPipelineTrace({
      botId: batch.botId,
      customerJid: normalizedJid,
      messageId: batch.latestGenerationMessageId,
      source,
      io,
    });
    trace.recordStage("ACCEPTED_FOR_PROCESSING", { batchId: batch.batchId, messageCount: summary.messageCount });
    try {
      io.emit("system-log", { type: "info", msg: `active_batch_lock_acquired batchId=${batch.batchId} traceId=${trace.traceId}` });
      io.emit("system-log", {
        type: "info",
        msg: `message_batch_processing batchId=${batch.batchId} messageCount=${summary.messageCount} mediaCount=${summary.mediaCount} audioCount=${summary.audioCount}`
      });
      await ensureAiReplyRetryQueueLoaded();
      const pendingJob = queueAiReplyRetry(pendingAiReplyRetries, {
        botId: batch.botId,
        jid: normalizedJid,
        messageId: batch.latestGenerationMessageId,
        source,
        lastCustomerMessageAt: getMessageTimestampSeconds(pendingBatch.messages.at(-1)) * 1000,
      });
      await persistAiReplyRetryQueue();
      trace.recordStage("AI_REQUEST_STARTED", { jobRetries: pendingJob.attempts || 0 });
      const handled = await aiHandler.processMissedMessageSafe(
        batch.transport === "cloud" ? cloudApiTrackedSender : createTrackedWhatsAppSocket(sock, botSentMessageIds),
        normalizedJid,
        historyArray,
        { ...botConfig, cachedMediaTemplates, mediaGroupJid, welcomeGroupJid },
        cachedKeywordSequences,
        cachedWelcomeTemplates,
        io,
        {
          batchSelection: selection,
          batchId: batch.batchId,
          timing: {
            batchWaitMs,
            batchMode: selectedDelayProfile.mode,
            normalTextBatchFastPath: selectedDelayProfile.fastPath,
          },
        }
      );
      if (handled) {
        trace.recordStage("AI_RESPONSE_RECEIVED");
        trace.recordStage("RESPONSE_VALIDATED");
        trace.recordStage("WHATSAPP_SEND_SUCCEEDED");
        trace.recordTerminal("SENT", "Reply successfully sent");
        markAiReplyRetryDelivered(pendingAiReplyRetries, pendingJob.id);
        await persistAiReplyRetryQueue();
        if (Boolean((botConfig as any)?.auto_followup_enabled)) {
          try {
            const lastUserMsg = historyArray.filter((h: any) => h.role === "user").slice(-1)[0];
            const lastBotMsg = historyArray.filter((h: any) => h.role === "model" || h.role === "assistant").slice(-1)[0];
            scheduleNextAutoFollowup({
              botId: batch.botId,
              customerJid: normalizedJid,
              canonicalCustomerId: pendingJob.canonicalCustomerId || normalizedJid,
              conversationId: normalizedJid,
              lastCustomerMessageText: lastUserMsg?.text || "",
              lastCustomerMessageAt: Date.now(),
              lastBotReplyText: lastBotMsg?.text || "",
              lastBotReplyAt: Date.now(),
              currentObjective: "continue_unresolved_inquiry",
            });
          } catch (afErr) {
            console.error("[AutoFollowup] Failed to schedule followup after bot reply", afErr);
          }
        }
        const handledState = withHandledBatchMessages(await getCustomerBatchState(normalizedJid, batch.botId), {
          batchId: batch.batchId,
          terminalStatus: "sent",
          messages: pendingBatch.messages,
        });
        await persistCustomerBatchState(normalizedJid, batch.botId, handledState);
        io.emit("system-log", { type: "success", msg: `message_batch_reply_sent batchId=${batch.batchId} handledMessages=${summary.messageCount}` });
        for (const message of pendingBatch.messages) {
          const messageId = String(message?.key?.id || "").slice(0, 24);
          if (messageId) {
            io.emit("system-log", { type: "success", msg: `message_marked_handled messageId=${messageId} batchId=${batch.batchId}` });
          }
        }
        io.emit("system-log", { type: "success", msg: `message_batch_terminal batchId=${batch.batchId} status=sent` });
        messageBuffers.delete(normalizedJid);
      } else if (batch.pendingWhileProcessing) {
        trace.recordTerminal("SUPERSEDED", "Batch superseded by newer message while processing");
        batch.status = "pending_debounce";
        await syncActiveBatchState(normalizedJid);
        scheduleMessageBatchProcessing(normalizedJid, "superseded_batch_regen", 250);
      } else {
        trace.recordTerminal("AI_FAILED", "Handler returned not handled");
        batch.status = "failed_retryable";
        await syncActiveBatchState(normalizedJid);
      }
      return handled;
    } catch (batchErr: any) {
      const errMsg = String(batchErr?.message || batchErr || "batch_error");
      console.error(`[Batch] Error processing batch ${batch.batchId} for ${normalizedJid}:`, errMsg);
      trace.recordFailure(trace.snapshot().currentStage || "AI_REQUEST_STARTED", batchErr);
      trace.recordTerminal("AI_FAILED", errMsg);
      io.emit("system-log", {
        type: "error",
        msg: `message_batch_error batchId=${batch.batchId} err=${errMsg.slice(0, 100)}`
      });
      if (batch.pendingWhileProcessing) {
        batch.status = "pending_debounce";
        await syncActiveBatchState(normalizedJid).catch(() => {});
        scheduleMessageBatchProcessing(normalizedJid, "superseded_batch_regen", 250);
      } else {
        batch.status = "failed_retryable";
        await syncActiveBatchState(normalizedJid).catch(() => {});
      }
      return false;
    } finally {
      currentlyReplying.delete(normalizedJid);
      if (batch && isBatchProcessingStatus(batch.status)) {
        batch.status = "failed_retryable";
        await syncActiveBatchState(normalizedJid).catch(() => {});
      }
      trace.recordStage("CONVERSATION_STATE_RELEASED");
    }
  }

  function scheduleMessageBatchProcessing(jid: string, source = "message_batch", delayMs?: number) {
    const normalizedJid = normalizeWhatsAppJid(jid);
    const batch = getActiveMessageBatch(normalizedJid);
    if (!batch) return;
    clearMessageBatchTimer(normalizedJid);
    batch.status = "pending_debounce";
    syncActiveBatchState(normalizedJid).catch(() => {});
    const nowMs = Date.now();
    const delayProfile = getMessageBatchDelayProfile({ kinds: batch.messageKinds });
    const ageMs = Math.max(0, nowMs - batch.createdAt);
    if (delayProfile.fastPath && ageMs > (delayProfile.maxWaitMs + STALE_NORMAL_TEXT_BATCH_MARGIN_MS)) {
      batch.createdAt = nowMs;
      batch.lastUpdatedAt = nowMs;
      batch.extendedOnce = false;
      io.emit("system-log", {
        type: "info",
        msg: `stale_active_batch_recovered ageMs=${ageMs} action=${delayMs != null ? "process_now" : "reset_created_at"} batchId=${batch.batchId}`
      });
      syncActiveBatchState(normalizedJid).catch(() => {});
      if (delayMs == null) {
        delayMs = 250;
      }
    }
    if (delayMs == null) {
      io.emit("system-log", {
        type: "info",
        msg: `reply_timing_batch_selected mode=${delayProfile.mode} initialMs=${delayProfile.initialDebounceMs} maxMs=${delayProfile.maxWaitMs}`,
      });
    }
    const targetAt = delayMs != null
      ? nowMs + Math.max(100, delayMs)
      : (batch.extendedOnce
        ? Math.min(batch.createdAt + delayProfile.maxWaitMs, batch.createdAt + delayProfile.initialDebounceMs + delayProfile.extensionMs)
        : nowMs + delayProfile.initialDebounceMs);
    batch.timer = setTimeout(async () => {
      clearMessageBatchTimer(normalizedJid);
      await processBufferedMessageBatch(normalizedJid, source).catch((error: any) => {
        console.error(`[Batch] Failed processing batch for ${normalizedJid}:`, error?.message || error);
      });
      const refreshed = getActiveMessageBatch(normalizedJid);
      if (refreshed?.pendingWhileProcessing && !currentlyReplying.has(normalizedJid)) {
        refreshed.pendingWhileProcessing = false;
        refreshed.status = "pending_debounce";
        syncActiveBatchState(normalizedJid).catch(() => {});
        scheduleMessageBatchProcessing(normalizedJid, "batched_regeneration", 250);
      }
    }, Math.max(100, targetAt - nowMs));
  }

  async function queueActiveMessageBatch(input: {
    botId: string;
    jid: string;
    message: any;
    source: string;
    transport: "socket" | "cloud";
  }) {
    const normalizedJid = normalizeWhatsAppJid(input.jid);
    const messageId = String(input.message?.key?.id || "");
    const messageKind = classifyInboundMessageKind(input.message);
    const existing = getActiveMessageBatch(normalizedJid);
    const nowMs = Date.now();
    if (!existing) {
      const batch = {
        batchId: buildMessageBatchId(normalizedJid),
        botId: input.botId,
        jid: normalizedJid,
        transport: input.transport,
        messageIds: messageId ? [messageId] : [],
        messageKinds: messageId ? [messageKind] : [],
        createdAt: nowMs,
        lastUpdatedAt: nowMs,
        extendedOnce: false,
        pendingWhileProcessing: false,
        latestGenerationMessageId: messageId,
        status: "pending_debounce" as BatchLifecycleStatus,
        timer: null,
      };
      messageBuffers.set(normalizedJid, batch);
      io.emit("system-log", { type: "info", msg: `message_batch_created customer=${normalizedJid.split("@")[0]} batchId=${batch.batchId}` });
      await syncActiveBatchState(normalizedJid);
      scheduleMessageBatchProcessing(normalizedJid, input.source);
      return batch;
    }
    if (messageId && !existing.messageIds.includes(messageId)) {
      existing.transport = input.transport;
      existing.messageIds.push(messageId);
      existing.messageKinds.push(messageKind);
      existing.lastUpdatedAt = nowMs;
      existing.status = currentlyReplying.has(normalizedJid) ? "superseded_by_new_message" : "pending_debounce";
      io.emit("system-log", {
        type: "info",
        msg: `message_batch_coalesced customer=${normalizedJid.split("@")[0]} batchId=${existing.batchId} addedMessageId=${messageId.slice(0, 24)} messageCount=${existing.messageIds.length}`
      });
      await syncActiveBatchState(normalizedJid);
      if (currentlyReplying.has(normalizedJid)) {
        markMessageBatchSuperseded(normalizedJid, messageId);
      } else {
        if (!existing.extendedOnce) existing.extendedOnce = true;
        scheduleMessageBatchProcessing(normalizedJid, input.source);
      }
    }
    return existing;
  }

  function hasActiveBatchForCustomer(jid: string) {
    return Boolean(getActiveMessageBatch(jid));
  }

  function maskRetryJid(jid: any) {
    const [local, domain] = String(jid || "").split("@");
    if (!local) return "";
    const maskedLocal = local.length <= 6 ? `${local.slice(0, 2)}***` : `${local.slice(0, 3)}...${local.slice(-2)}`;
    return domain ? `${maskedLocal}@${domain}` : maskedLocal;
  }

  function getAiReplyRetryBotKey() {
    return process.env.BOT_ID || process.env.USER_ID || "unknown-bot";
  }

  async function getAiReplyAccountEligibility(botId?: string) {
    const result = await canAccountUseBotForAiReply({
      accountId: process.env.USER_ID,
      botId: botId || process.env.BOT_ID || "",
    });
    if (result.eligible) {
      clearBillingAdminAlertState(botId || process.env.BOT_ID || "").catch(() => {});
    }
    return result;
  }

  function shouldEmitAiReplyBillingAlert(eligibility: AccountAiReplyEligibility, nowMs = Date.now()) {
    const key = `${eligibility.accountId || process.env.USER_ID || "unknown"}:${eligibility.botId || process.env.BOT_ID || "unknown"}:${eligibility.reason}`;
    return shouldSendAiReplyBlockedAlert({
      cache: aiReplyBillingAlertCooldowns,
      key,
      nowMs,
      cooldownMs: AI_REPLY_BILLING_ALERT_COOLDOWN_MS,
    });
  }

  async function dispatchBillingBlockedAdminAlert(input: {
    eligibility: AccountAiReplyEligibility;
    source: string;
  }) {
    if (isPersonalInstance(botConfig)) return;
    const accountId = input.eligibility.accountId || process.env.USER_ID || "";
    const botId = input.eligibility.botId || process.env.BOT_ID || "";
    if (!accountId || !botId) return;

    await processBillingBlockedAdminAlert({
      accountId,
      botId,
      reason: input.eligibility.reason,
      botConfig,
      sendText: async (adminJid: string, text: string) => {
        return sendUniversalTextViaActiveProvider(adminJid, text, { trackId: true });
      },
    }).catch((err) => {
      console.error("[BillingAdminAlert] Unexpected error processing admin alert:", err?.message || err);
    });
  }

  async function blockAiReplyByBillingState(input: {
    eligibility: AccountAiReplyEligibility;
    jid?: string;
    source: string;
    retryId?: string;
  }) {
    const reason = input.eligibility.reason || "subscription_inactive";
    if (input.retryId) {
      markAiReplyRetryBillingBlocked(pendingAiReplyRetries, input.retryId, reason);
      await persistAiReplyRetryQueue();
    }
    const alertMessage = buildAiReplyBlockedAlertMessage(reason);
    const maskedJid = maskRetryJid(input.jid);
    if (shouldEmitAiReplyBillingAlert(input.eligibility)) {
      io.emit("system-log", {
        type: "warning",
        msg: `ai_reply_blocked_billing_state reason=${reason}${maskedJid ? ` customer=${maskedJid}` : ""}. ${alertMessage}`,
      });
      emitLiveConsoleEvent({
        type: reason.includes("wallet") ? "insufficient_wallet" : reason.includes("trial") || reason.includes("reply_limit") ? "trial_expired_block" : "subscription_expired_block",
        level: "warn",
        scope: "bot",
        accountId: input.eligibility.accountId || process.env.USER_ID,
        botId: input.eligibility.botId || process.env.BOT_ID,
        customerJid: input.jid,
        title: "AI replies paused",
        message: alertMessage,
        reason,
        metadata: {
          source: input.source,
          walletBalance: input.eligibility.walletBalance,
          minimumRequiredUsd: input.eligibility.minimumRequiredUsd,
        },
      });
    } else {
      console.warn(`[AI-Retry] ai_reply_blocked_billing_state reason=${reason} source=${input.source} customer=${maskedJid || "n/a"}`);
    }

    // Dispatch system operational WhatsApp alert to configured admin
    dispatchBillingBlockedAdminAlert({
      eligibility: input.eligibility,
      source: input.source,
    }).catch((err) => {
      console.error("[BillingAdminAlert] Unexpected error dispatching alert:", err?.message || err);
    });
  }

  async function ensureAiReplyRetryQueueLoaded() {
    if (aiReplyRetryQueueLoaded) return;
    const loaded = await loadAiReplyRetryQueue(getAiReplyRetryBotKey()).catch(() => new Map<string, PendingAiReplyRetry>());
    pendingAiReplyRetries.clear();
    for (const [key, value] of loaded.entries()) {
      pendingAiReplyRetries.set(key, value);
    }
    aiReplyRetryQueueLoaded = true;
  }

  async function persistAiReplyRetryQueue() {
    pruneAiReplyRetryQueue(pendingAiReplyRetries);
    await saveAiReplyRetryQueue(getAiReplyRetryBotKey(), pendingAiReplyRetries).catch((e: any) => {
      console.error("[AI-Retry] Failed persisting retry queue:", e?.message || e);
    });
  }

  function schedulePendingAiReplyDrain(jid: string, reason = "busy_cleared", delayMs = AI_BUSY_REPLY_DRAIN_DELAY_MS) {
    const normalizedJid = String(jid || "").trim();
    if (!normalizedJid) return;
    const existing = pendingAiReplyDrainTimers.get(normalizedJid);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(async () => {
      pendingAiReplyDrainTimers.delete(normalizedJid);
      if (currentlyReplying.has(normalizedJid) || activeAIControllers.has(normalizedJid)) {
        schedulePendingAiReplyDrain(normalizedJid, "still_busy", AI_BUSY_REPLY_DRAIN_DELAY_MS);
        return;
      }
      if (hasActiveBatchForCustomer(normalizedJid)) {
        await recoverStaleActiveBatchIfNeeded(normalizedJid, "process_now");
        await processBufferedMessageBatch(normalizedJid, reason).catch((e: any) => {
          console.error(`[Batch] Pending drain batch failed for ${normalizedJid}:`, e?.message || e);
        });
        return;
      }
      await processPendingAiReplyRetries({ onlyJid: normalizedJid }).catch((e: any) => {
        console.error(`[AI-Retry] Pending drain failed for ${normalizedJid} after ${reason}:`, e?.message || e);
      });
    }, Math.max(250, delayMs));
    pendingAiReplyDrainTimers.set(normalizedJid, timer);
  }

  async function queueBusyPendingAiReply(input: {
    botId: string;
    jid: string;
    messageId: string;
    source: string;
    lastCustomerMessageAt?: number;
  }) {
    const eligibility = await getAiReplyAccountEligibility(input.botId);
    if (!eligibility.eligible) {
      await blockAiReplyByBillingState({ eligibility, jid: input.jid, source: input.source });
      return null;
    }
    await ensureAiReplyRetryQueueLoaded();
    const job = queueAiReplyRetry(pendingAiReplyRetries, {
      botId: input.botId,
      jid: input.jid,
      messageId: input.messageId,
      source: input.source,
      error: "bot_busy",
      lastCustomerMessageAt: input.lastCustomerMessageAt,
    });
    job.nextAttemptAt = Date.now() + AI_BUSY_REPLY_DRAIN_DELAY_MS;
    pendingAiReplyRetries.set(job.id, job);
    await persistAiReplyRetryQueue();
    schedulePendingAiReplyDrain(input.jid, input.source, AI_BUSY_REPLY_DRAIN_DELAY_MS);
    return job;
  }

  const PENDING_SEQUENCE_RETRY_INTERVAL_MS = 15 * 1000;

    // Fast retry runner for pending template/media sequence messages
  setInterval(async () => {
      if (pendingResponses.length === 0 || !sock || connectionStatus !== "connected") return;
      
      const newPending: typeof pendingResponses = [];
      
      for (const item of pendingResponses) {
        let success = false;
        let sentSequenceData: any = null;
        let deliveredPendingSequence = false;
        try {
          if (item.type === 'welcome') {
            const myJid = getMyJid(sock);
            const dataOwnerKey = await resolveAccountDataOwnerKey(process.env.USER_ID, myJid);
            const welcomeConfig = (botConfig?.groups || []).find((g: any) => g?.purpose === 'welcome');
            const welcomeJid = (welcomeConfig as any)?.groupJid || (welcomeConfig as any)?.jid;
            if (!welcomeConfig || !welcomeJid || !String(welcomeJid).trim()) {
              await dbService.recordWelcomeSequenceStatus(dataOwnerKey, item.jid, {
                status: "skipped",
                reason: !welcomeConfig ? "no_welcome_config" : "not_configured",
                source: "pending_welcome_retry",
              }).catch(() => {});
              io.emit("system-log", { type: "warning", msg: `Pending welcome dropped for ${item.jid}: welcome_not_configured` });
              success = true;
            } else if ((welcomeConfig as any).enabled === false) {
              await dbService.recordWelcomeSequenceStatus(dataOwnerKey, item.jid, {
                status: "skipped",
                reason: "disabled",
                source: "pending_welcome_retry",
              }).catch(() => {});
              io.emit("system-log", { type: "warning", msg: `Pending welcome dropped for ${item.jid}: welcome_disabled` });
              success = true;
            } else if (cachedWelcomeTemplates.length > 0) {
              const runtimeWelcome = resolveRuntimeWelcomePayload(botConfig, cachedWelcomeTemplates);
              const welcomeResult = await deliverWelcomeSequence({
                sock: createTrackedWhatsAppSocket(sock, botSentMessageIds),
                customerJid: item.jid,
                templates: runtimeWelcome?.templates || cachedWelcomeTemplates,
                config: runtimeWelcome?.config || (botConfig?.groups || []).find((g: any) => g?.purpose === "welcome"),
                groupResetAt: runtimeWelcome?.groupResetAt,
                generationId: runtimeWelcome?.generationId,
                source: "pending_welcome_retry",
                forwardTemplate,
                io,
                userId: process.env.USER_ID,
                botId: dataOwnerKey,
                dataOwnerKey,
              });
              if (welcomeResult.success && welcomeResult.completed) {
                deliveredPendingSequence = true;
                success = true;
              } else if (welcomeResult.alreadySent) {
                success = true;
              } else if (welcomeResult.reason === "wallet_balance_too_low") {
                io.emit("system-log", { type: "warning", msg: `Pending welcome blocked for ${item.jid}: wallet balance is too low for paid automation sends.` });
                continue;
              } else if (welcomeResult.reason === "partial_sent") {
                io.emit("system-log", { type: "warning", msg: `Pending welcome still incomplete for ${item.jid}: not all templates sent` });
              }
            } else {
              await dbService.recordWelcomeSequenceStatus(dataOwnerKey, item.jid, {
                status: "pending",
                reason: "templates_not_loaded",
                source: "pending_welcome_retry",
              }).catch(() => {});
            }
          } else if (item.type === 'sequence' || item.type === 'shortcut') {
            const foundSeq = cachedKeywordSequences[item.sequenceName];
            const groupConfig = foundSeq?.config || (botConfig?.groups || []).find((g: any) => g?.name === item.sequenceName);
            if (groupConfig?.enabled === false) {
              io.emit("system-log", { type: "warning", msg: `Pending sequence '${item.sequenceName}' dropped for ${item.jid}: sequence_disabled` });
              success = true;
              continue;
            }
            if (foundSeq && foundSeq.templates && foundSeq.templates.length > 0) {
              const myJid = getMyJid(sock);
              const dataOwnerKey = await resolveAccountDataOwnerKey(process.env.USER_ID, myJid);
              const runtimePayload = resolveRuntimeSequencePayloadGroup(botConfig, foundSeq, foundSeq.templates);
              const sequenceResult = await deliverSequenceGroup({
                sock: createTrackedWhatsAppSocket(sock, botSentMessageIds),
                customerJid: item.jid,
                sequence: runtimePayload?.sequence || foundSeq,
                fallbackKey: item.sequenceName,
                templates: runtimePayload?.templates || foundSeq.templates,
                groupResetAt: runtimePayload?.groupResetAt,
                generationId: runtimePayload?.generationId,
                source: "pending_retry",
                forwardTemplate,
                io,
                userId: process.env.USER_ID,
                botId: dataOwnerKey,
                dataOwnerKey,
              });
              if (sequenceResult.success && sequenceResult.completed) {
                deliveredPendingSequence = true;
                sentSequenceData = foundSeq;
                success = true;
              } else if (sequenceResult.alreadySent) {
                success = true;
              } else if (sequenceResult.reason === "wallet_balance_too_low") {
                io.emit("system-log", { type: "warning", msg: `Pending sequence '${item.sequenceName}' blocked for ${item.jid}: wallet balance is too low for paid automation sends.` });
                success = true;
                continue;
              } else if (sequenceResult.reason === "partial_sent") {
                io.emit("system-log", { type: "warning", msg: `Pending sequence '${item.sequenceName}' still incomplete for ${item.jid}: not all templates sent` });
              }
            }
          } else if (item.type === 'media' && item.mediaTitle) {
            const mediaItem = cachedMediaTemplates.find(m =>
              (m.id && m.id.toLowerCase() === item.mediaTitle!.toLowerCase()) ||
              (m.name && m.name.toLowerCase() === item.mediaTitle!.toLowerCase()) ||
              (m.caption && m.caption.toLowerCase().includes(item.mediaTitle!.toLowerCase()))
            );
            if (mediaItem) {
              const result = await forwardTemplate(item.jid, mediaItem.originalMessage, true, {
                billingAction: "media_group_file_send",
                billingEventId: `media:${item.jid}:${item.mediaTitle}:${item.timestamp}`,
                mediaTitle: item.mediaTitle,
                source: "pending_media_group_send",
              });
              success = isSequenceItemDelivered(result);
            }
          }
        } catch (e) {
          console.error(`[Retry] Failed to send pending ${item.type}:`, e);
        }

        if (!success) {
          // Keep in queue if not older than 30 minutes
          if (Date.now() - item.timestamp < 30 * 60 * 1000) {
            newPending.push(item);
          }
        } else {
          try {
            const myJid = getMyJid(sock);
            const dataOwnerKey = await resolveAccountDataOwnerKey(process.env.USER_ID, myJid);
            if (item.type === 'welcome' && deliveredPendingSequence) {
              await dbService.markWelcomeSequence(dataOwnerKey, item.jid, { source: "pending_welcome_retry" });
            } else if ((item.type === 'sequence' || item.type === 'shortcut') && sentSequenceData && deliveredPendingSequence) {
              await dbService.markSequence(dataOwnerKey, item.jid, getSequenceFlag(item.sequenceName, sentSequenceData));
            }
          } catch (e) {
            console.error(`[Retry] Failed to mark pending ${item.type} as sent:`, e);
          }
          io.emit("system-log", { type: "info", msg: `✅ Successfully sent pending ${item.type} to ${item.jid}` });
        }
      }
      pendingResponses = newPending;
    }, PENDING_SEQUENCE_RETRY_INTERVAL_MS);

  let missedWelcomeCheckRunning = false;
  const MISSED_WELCOME_REPAIR_WINDOW_SECONDS = 30 * 60;
  async function checkMissedWelcomeSequences() {
      if (missedWelcomeCheckRunning || !sock || connectionStatus !== "connected" || cachedWelcomeTemplates.length === 0) return;
      missedWelcomeCheckRunning = true;
      let sentCount = 0;
      let skippedCount = 0;
      try {
          const userId = process.env.USER_ID;
          if (!userId) return;
          const myJid = getMyJid(sock);
          const dataOwnerKey = await resolveAccountDataOwnerKey(userId, myJid);
          const customers = await dbService.listCustomers(userId);

          for (const customer of customers) {
              const customerJid = resolveCustomerChatJid(customer);
              if (!customerJid || !isCustomerChatJid(customerJid)) {
                  skippedCount++;
                  continue;
              }
              if (currentlyReplying.has(customerJid)) {
                  skippedCount++;
                  continue;
              }
              const profile = customer.profile || {};
              const blockReason = getSequenceStatusBlockReason(profile);
              if (blockReason) {
                  await dbService.recordWelcomeSequenceStatus(dataOwnerKey, customerJid, {
                      status: "skipped",
                      reason: blockReason,
                      source: "welcome_recovery",
                  }).catch(() => {});
                  skippedCount++;
                  if (process.env.DEBUG_WELCOME_REPAIR === "1") {
                    console.debug(`[WelcomeRepair] skipped ${customerJid.split("@")[0]} because ${blockReason}.`);
                  }
                  continue;
              }
              const alreadySent = await dbService.checkWelcomeSequence(dataOwnerKey, customerJid).catch(() => false);
              if (alreadySent) {
                  await dbService.recordWelcomeSequenceStatus(dataOwnerKey, customerJid, {
                      status: "skipped",
                      reason: "already_sent",
                      source: "welcome_recovery",
                  }).catch(() => {});
                  skippedCount++;
                  continue;
              }
              const lastIncomingAt = Number(customer.last_message_at || profile.lastMessageAt || 0) || 0;
              const customerCreatedAt = customer.$createdAt ? Math.floor(new Date(customer.$createdAt).getTime() / 1000) : 0;
              const newestKnownAt = Math.max(lastIncomingAt, customerCreatedAt);
              const isRecentFirstContact = newestKnownAt > 0 && (Math.floor(Date.now() / 1000) - newestKnownAt) <= MISSED_WELCOME_REPAIR_WINDOW_SECONDS;
              const alreadyHasBotReply = Boolean(profile.lastBotReply || profile.lastBotMessageAt);
              const hasIncoming = Boolean(profile.lastMessage || lastIncomingAt);
              if (!hasIncoming || !isRecentFirstContact || alreadyHasBotReply) {
                  await dbService.recordWelcomeSequenceStatus(dataOwnerKey, customerJid, {
                      status: "skipped",
                      reason: "chat_has_history",
                      source: "welcome_recovery",
                  }).catch(() => {});
                  skippedCount++;
                  continue;
              }

              const recentDbHistory = await dbService.getChatHistory(dataOwnerKey, customerJid, 5).catch(() => []);
              currentlyReplying.add(customerJid);
              try {
                const welcomeResult = await deliverWelcomeSequence({
                  sock: createTrackedWhatsAppSocket(sock, botSentMessageIds),
                  customerJid,
                  templates: cachedWelcomeTemplates,
                  config: (botConfig?.groups || []).find((g: any) => g?.purpose === "welcome"),
                  source: "welcome_recovery",
                  forwardTemplate,
                  io,
                  userId,
                  botId: dataOwnerKey,
                  dataOwnerKey,
                  historyArray: [
                    ...buildSyntheticHistoryFromDb(recentDbHistory, customerJid),
                    ...(localStore[customerJid] || []),
                  ],
                });
                if (welcomeResult.success && welcomeResult.completed) {
                  sentCount++;
                  io.emit("system-log", { type: "success", msg: `Welcome repair sent ${welcomeResult.deliveredCount} template(s) to ${customerJid.split("@")[0]}.` });
                } else {
                  skippedCount++;
                }
              } finally {
                currentlyReplying.delete(customerJid);
                schedulePendingAiReplyDrain(customerJid, "welcome_recovery_finished");
              }
          }
          if (sentCount || skippedCount) {
              console.log(`[WelcomeRepair] checked=${sentCount + skippedCount}, sent=${sentCount}, skipped=${skippedCount}`);
          }
      } catch (e: any) {
          console.error("[WelcomeRepair] Check failed:", e?.message || e);
      } finally {
          missedWelcomeCheckRunning = false;
      }
  }

  setInterval(checkMissedWelcomeSequences, 5 * 60 * 1000);



  function setupAutoSync() {
      if (autoSyncIntervalId) {
          clearInterval(autoSyncIntervalId);
          autoSyncIntervalId = null;
      }
      if (!botConfig.autoReloadEnabled) return;
      const minutes = Math.max(1, botConfig.autoReloadMinutes || 5);
      
      autoSyncIntervalId = setInterval(async () => {
         if (!sock || connectionStatus !== "connected") return;
         console.log(`[Auto-Sync] Triggering ${minutes}-minute reload...`);
         await syncTemplateGroup();
         
         const botIdEnv = process.env.BOT_ID;
         if (botIdEnv) {
             try {
                 const restore = await hydrateTemplateStoreFromDatabase();
                 if (restore.restored > 0) {
                     saveLocalStore();
                 }
             } catch(e) {
                 console.error("[Auto-Sync] DB Template pull error:", e);
             }
         }
         
         await loadTemplates();
         
         let breakdown = [];
         if (cachedWelcomeTemplates.length > 0) breakdown.push(`Welcome: ${cachedWelcomeTemplates.length}`);
         if (cachedMediaTemplates.length > 0) breakdown.push(`Media: ${cachedMediaTemplates.length}`);
         for (const [seqName, seqData] of Object.entries(cachedKeywordSequences)) {
             if (seqData.templates?.length) breakdown.push(`${seqName}: ${seqData.templates.length}`);
         }
         io.emit("system-log", { type: "info", msg: `🔄 Auto-Reload: Templates synced. ${breakdown.length > 0 ? '(' + breakdown.join(', ') + ')' : ''}` });
      }, minutes * 60000);
  }

  // 15-minute Wait & Check logic for pending customer info
  async function checkPendingCustomerNudges() {
    if (!sock || connectionStatus !== "connected") return;
    
    try {
        const userId = process.env.USER_ID;
        if (!userId) return;
        
        const myJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";
        const dataOwnerKey = await resolveAccountDataOwnerKey(userId, myJid);
        const customers = await dbService.listCustomers(userId);
        
        for (const customer of customers) {
            const profile = customer.profile;
            // Only follow up if they were in the middle of something (New order / In progress)
            // and they haven't replied in at least 2 hours
            const lastMsgAt = customer.last_message_at ? (typeof customer.last_message_at === 'number' ? customer.last_message_at : Number(customer.last_message_at) || 0) : 0;
            const nowTime = Math.floor(Date.now() / 1000);
            
            if (profile && (profile.orderStatus === "New order" || profile.orderStatus === "In progress")) {
                const hoursSinceLastMsg = (nowTime - lastMsgAt) / 3600;
                
                if (hoursSinceLastMsg >= 2 && hoursSinceLastMsg < 48) {
                    // Check if we already nudged them recently
                    if (profile.lastNudgeAt && (nowTime - profile.lastNudgeAt) < 20 * 3600) continue;

                    const customerJid = resolveCustomerChatJid(customer);
                    if (!customerJid) {
                      io.emit("system-log", { type: "warning", msg: `Wait & Check skipped ${profile.name || customer.customer_id}: WhatsApp target JID is not safely known.` });
                      continue;
                    }
                    if (currentlyReplying.has(customerJid)) continue;

                    io.emit("system-log", { type: "ai", msg: `Wait & Check: Nudging ${profile.name || customer.customer_id} for pending info...` });
                    const waitCheckIdempotencyKey = `wait-check-nudge:${customerJid}:${nowTime}`;
                    const waitCheckBilling = await previewBillableOutboundText(userId, "ai_smart_followup");
                    if (!waitCheckBilling.allowed) {
                        console.info(`[WaitCheck] generation_skipped reason=${waitCheckBilling.reason || "billing_not_allowed"} customer=${customerJid}`);
                        continue;
                    }
                    
                    const chatHistory = await dbService.getChatHistory(dataOwnerKey, customerJid, 10);
                    const historyText = chatHistory.map(m => `${m.role === 'user' ? 'Customer' : 'Bot'}: ${m.text}`).join("\n");

                    const provider = await createGeminiClient({
                        userId,
                        accountId: userId,
                        dataOwnerKey,
                        botId: process.env.BOT_ID || dataOwnerKey,
                        purpose: "wait_check_nudge",
                        billingContext: {
                            customerJid,
                            eventId: waitCheckIdempotencyKey,
                        },
                    });

                    const nudgeSystemInstruction = composeImplicitCacheInstruction(`
You are a BlackArrow WhatsApp sales assistant writing gentle wait-and-check nudges.
Be polite, concise, and non-pushy.
Output one clean WhatsApp message only. Do not use placeholders.
${CONCISE_WHATSAPP_REPLY_RULES}
Business instructions:
${botConfig?.prompt || "Be helpful, concise, and sales/support focused."}
`.trim());
                    const nudgePrompt = `This customer was in the middle of an order/inquiry but stopped replying.
Send a very gentle check-in to see if they need help or want to proceed.

Customer Profile: ${compactAiText(JSON.stringify(profile), 900)}
History:
${compactAiText(historyText, 1800)}

Write a short, friendly nudge message. Output ONLY the message.`;

                    const modelRoute = await resolveAiModelForPurpose("followup");
                    console.info(`[GeminiModelRouting] model_route=${modelRoute.route} purpose=wait_check_nudge model=${modelRoute.model}`);
                    const aiRes = await generateWithClientGeminiCacheAware({
                        provider,
                        model: modelRoute.model || BACKGROUND_AI_MODEL,
                        fallbackModel: CUSTOMER_AI_MODEL,
                        modelRoute: modelRoute.route,
                        purpose: "wait_check_nudge",
                        purposeGroup: "wait_check_nudge",
                        stableContextParts: [nudgeSystemInstruction],
                        dynamicContextParts: [nudgePrompt],
                        maxOutputTokens: 180,
                        request: (request) => aiHandler.generateContentWithRetry(provider.ai, request),
                    });
                    logGeminiCacheTelemetry(aiRes, io, "wait-check-nudge");
                    
                    let nudgeText = "";
                    try {
                        nudgeText = assertCompleteCustomerFacingText(typeof aiRes.text === 'function' ? aiRes.text() : aiRes.text, "incomplete_output");
                    } catch (error: any) {
                        console.warn(`[WaitCheck] incomplete_output blocked for ${customerJid}: ${error?.reason || error?.message || error}`);
                        continue;
                    }
                    const latestNudgeProfile = await dbService.getCustomerProfile(dataOwnerKey, customerJid).catch(() => null);
                    const staleNudge = checkFollowupStaleByLastMessage({
                        latestLastMessageAt: latestNudgeProfile?.lastMessageAt || latestNudgeProfile?.last_message_at,
                        triggerLastMessageAt: lastMsgAt,
                    });
                    if (staleNudge.stale) {
                        console.log(`[WaitCheck] Skipping ${customerJid}: ${staleNudge.reason}`);
                        continue;
                    }
                    if (nudgeText) {
                        const sendResult = await sendUniversalOutboundText({
                            userId,
                            botId: process.env.BOT_ID || dataOwnerKey,
                            customerJid,
                            messageText: nudgeText,
                            idempotencyKey: waitCheckIdempotencyKey,
                            billingAction: "ai_smart_followup_text",
                            contextType: "wait_check_nudge",
                            contextId: String(nowTime),
                            campaignType: "ai_smart_followup",
                            sendText: (jid, text) => sendUniversalTextViaActiveProvider(jid, text),
                            saveMessage: async (jid, text, messageId) => {
                                await dbService.saveMessage(dataOwnerKey, jid, "model", text, messageId, undefined, getActualInstanceMeta());
                            },
                        });
                        if (sendResult.status !== "sent" && sendResult.status !== "duplicate") {
                            continue;
                        }
                        await dbService.updateCustomerProfile(dataOwnerKey, customerJid, { lastNudgeAt: nowTime });
                    }
                }
            }
        }
    } catch (e) {
        console.error("Wait & Check error:", e);
    }
  }

  setInterval(checkPendingCustomerNudges, 900000);

  let stockReminderCheckRunning = false;
  const checkAndNotifyStockReminders = async () => {
    if (!sock || connectionStatus !== "connected") return;
    if (stockReminderCheckRunning) return;
    stockReminderCheckRunning = true;
    
    try {
        const userId = process.env.USER_ID;
        if (!userId) return;
        
        const myJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";
        const dataOwnerKey = await resolveAccountDataOwnerKey(userId, myJid);
        const products = await dbService.listProducts(userId);
        const pendingRequests = await dbService.getPendingStockRequests();

        for (const request of pendingRequests as any[]) {
            if (request.bot_id !== dataOwnerKey && request.bot_id !== myJid) continue;

            const stockTarget = resolveBackInStockTarget(products, request.product_id, request.product_name);
            if (stockTarget?.available) {
                const customerJid = normalizeWhatsAppJid(request.customer_jid || request.jid || request.customer_id);
                if (!customerJid) {
                    io.emit("system-log", { type: "warning", msg: `[Stock] Skipping ${request.customer_id}: WhatsApp target JID is not safely known.` });
                    continue;
                }
                const msg = buildBackInStockUpdateMessage(stockTarget.productName);
                const currentBotId = process.env.BOT_ID || "";
                const userBots = await dbService.getBotsByUser(userId).catch(() => []) as any[];
                const resolvedSender = resolveCampaignSendingInstance({
                    defaultBotId: request.defaultBotId || currentBotId,
                    sendFromMode: request.sendFromMode,
                    customer: { profile: {} },
                    bots: userBots,
                    isBotConnected: (bot) => String(bot?.$id || bot?.id || "") === currentBotId,
                });
                if (resolvedSender.botId && resolvedSender.botId !== currentBotId) continue;
                
                io.emit("system-log", { type: "info", msg: `🔔 [Instant] Notifying ${customerJid} that ${stockTarget.productName} is back in stock!` });
                const sendResult = await sendUniversalOutboundText({
                    userId,
                    botId: currentBotId || dataOwnerKey,
                    customerJid,
                    messageText: msg,
                    idempotencyKey: `stock-update:${customerJid}:${request.$id || request.id || stockTarget.productName}`,
                    billingAction: "customer_update_stock_text",
                    contextType: "customer_update_stock",
                    contextId: String(request.$id || request.id || ""),
                    campaignType: "customer_update",
                    sendText: (jid, text) => sendUniversalTextViaActiveProvider(jid, text),
                    saveMessage: async (jid, text, messageId) => {
                        await dbService.saveMessage(dataOwnerKey, jid, "model", text, messageId, undefined, getActualInstanceMeta());
                    },
                });
                if (sendResult.status !== "sent" && sendResult.status !== "duplicate") {
                    await dbService.updateCustomerProfile(dataOwnerKey, customerJid, {
                        lastCustomerUpdateStatus: "skipped",
                        lastCustomerUpdateReason: sendResult.reason || sendResult.status || "send_failed",
                        lastCustomerUpdateAt: Math.floor(Date.now() / 1000),
                    }).catch(() => {});
                    continue;
                }
                await dbService.markStockRequestNotified(request.$id);
                await dbService.updateCustomerProfile(dataOwnerKey, customerJid, {
                    lastCustomerUpdateStatus: "sent",
                    lastCustomerUpdateReason: "",
                    lastCustomerUpdateAt: Math.floor(Date.now() / 1000),
                    lastCustomerUpdateMessageId: sendResult.messageId || "",
                    lastCustomerUpdateActualBotId: currentBotId,
                    lastCustomerUpdateActualBotJid: myJid,
                    lastCustomerUpdateFallbackReason: resolvedSender.fallbackReason,
                }).catch(() => {});
            }
        }
    } catch (e) {
        console.error("Stock Check error:", e);
    } finally {
        stockReminderCheckRunning = false;
    }
  };

  // Keep back-in-stock alerts responsive even if a product update trigger was missed.
  setInterval(checkAndNotifyStockReminders, 60000);

  const checkPlannedCustomerUpdates = async () => {
    if (!sock || connectionStatus !== "connected") return;
    try {
        const userId = process.env.USER_ID;
        if (!userId) return;
        const myJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";
        const dataOwnerKey = await resolveAccountDataOwnerKey(userId, myJid);
        const dueUpdates = await dbService.getDuePlannedCustomerUpdates(dataOwnerKey, Math.floor(Date.now() / 1000), 5);

        for (const update of dueUpdates as any[]) {
            const customerJid = normalizeWhatsAppJid(update.customerJid);
            if (!customerJid || currentlyReplying.has(customerJid)) continue;
            let msg = String(update.message || "").trim();
            if (!msg) continue;
            try {
                msg = assertCompleteCustomerFacingText(msg, "incomplete_output");
            } catch (error: any) {
                console.warn(`[Planned] incomplete_output blocked for ${customerJid}: ${error?.reason || error?.message || error}`);
                continue;
            }
            const stillPending = await dbService.isPlannedCustomerUpdatePending(dataOwnerKey, customerJid, update.id).catch(() => false);
            if (!stillPending) continue;
            const plannedTriggerLastMessageAt = update.triggerLastMessageAt || update.customerLastMessageAt || update.lastMessageAt || update.last_message_at || 0;
            const latestPlannedProfile = await dbService.getCustomerProfile(dataOwnerKey, customerJid).catch(() => null);
            const stalePlannedUpdate = checkFollowupStaleByLastMessage({
                latestLastMessageAt: latestPlannedProfile?.lastMessageAt || latestPlannedProfile?.last_message_at,
                triggerLastMessageAt: plannedTriggerLastMessageAt,
            });
            if (stalePlannedUpdate.stale) {
                console.log(`[Planned] Skipping ${customerJid}: ${stalePlannedUpdate.reason}`);
                continue;
            }
            const userBots = await dbService.getBotsByUser(userId).catch(() => []) as any[];
            const currentBotId = process.env.BOT_ID || "";
            const resolvedSender = resolveCampaignSendingInstance({
                defaultBotId: update.defaultBotId || currentBotId,
                sendFromMode: update.sendFromMode,
                customer: update.customer || { profile: update.profile },
                bots: userBots,
                isBotConnected: (bot) => String(bot?.$id || bot?.id || "") === currentBotId,
            });
            if (resolvedSender.botId && resolvedSender.botId !== currentBotId) continue;

            io.emit("system-log", { type: "info", msg: `[Planned] Sending scheduled customer update to ${customerJid.split("@")[0]}.` });
            const sendResult = await sendUniversalOutboundText({
                userId,
                botId: currentBotId || dataOwnerKey,
                customerJid,
                messageText: msg,
                idempotencyKey: `customer-update:${customerJid}:${update.id}`,
                billingAction: "customer_update_scheduled_text",
                contextType: "customer_update_scheduled",
                contextId: String(update.id || ""),
                campaignType: "customer_update",
                sendText: (jid, text) => sendUniversalTextViaActiveProvider(jid, text),
                saveMessage: async (jid, text, messageId) => {
                    await dbService.saveMessage(dataOwnerKey, jid, "model", text, messageId, undefined, getActualInstanceMeta());
                },
            });
            if (sendResult.status !== "sent" && sendResult.status !== "duplicate") {
                await dbService.updateCustomerProfile(dataOwnerKey, customerJid, {
                    lastCustomerUpdateStatus: "skipped",
                    lastCustomerUpdateReason: sendResult.reason || sendResult.status || "send_failed",
                    lastCustomerUpdateAt: Math.floor(Date.now() / 1000),
                }).catch(() => {});
                continue;
            }
            await dbService.markPlannedCustomerUpdateSent(dataOwnerKey, customerJid, update.id, sendResult.messageId || "", {
                actualBotId: currentBotId,
                actualBotJid: myJid,
                fallbackReason: resolvedSender.fallbackReason,
            });
            await dbService.updateCustomerProfile(dataOwnerKey, customerJid, {
                lastCustomerUpdateStatus: "sent",
                lastCustomerUpdateReason: "",
                lastCustomerUpdateAt: Math.floor(Date.now() / 1000),
                lastCustomerUpdateMessageId: sendResult.messageId || "",
                lastCustomerUpdateActualBotId: currentBotId,
                lastCustomerUpdateActualBotJid: myJid,
                lastCustomerUpdateFallbackReason: resolvedSender.fallbackReason,
            }).catch(() => {});
            await new Promise(r => setTimeout(r, 3000));
        }
    } catch (e: any) {
        console.error("[PlannedUpdates] Check error:", e?.message || e);
    }
  };

  setInterval(checkPlannedCustomerUpdates, 60000);

  let customerUpdateListJobsRunning = false;
  const processCustomerUpdateListJobs = async () => {
    if (customerUpdateListJobsRunning || !sock || connectionStatus !== "connected") return;
    customerUpdateListJobsRunning = true;
    try {
      const userId = process.env.USER_ID || "";
      const currentBotId = process.env.BOT_ID || "";
      if (!userId || !currentBotId) return;
      const jobs = await claimDueRecipientJobs(userId, currentBotId, 3);
      if (jobs.length === 0) return;
      const myJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";
      const dataOwnerKey = await resolveAccountDataOwnerKey(userId, myJid);
      for (const job of jobs) {
        const customerJid = normalizeWhatsAppJid(job.jid || job.phoneRaw || job.normalizedPhone);
        if (!customerJid) {
          await markRecipientJobResult(userId, job.id, { status: "skipped", error: "invalid_recipient" });
          continue;
        }
        const text = String(job.messageText || "").trim();
        if (!text) {
          await markRecipientJobResult(userId, job.id, { status: "skipped", error: "empty_message" });
          continue;
        }
        try {
          const sendResult = await sendUniversalOutboundText({
            userId,
            botId: currentBotId,
            customerJid,
            messageText: text,
            idempotencyKey: String(job.idempotencyKey || `cu-list:${job.runId}:${customerJid}`),
            billingAction: "customer_update_scheduled_text",
            contextType: "customer_update_list",
            contextId: String(job.runId || job.id),
            campaignType: "customer_update_list",
            sendText: (jid, text) => sendUniversalTextViaActiveProvider(jid, text),
            saveMessage: async (jid, messageText, messageId) => {
              await dbService.saveMessage(dataOwnerKey, jid, "model", messageText, messageId, undefined, getActualInstanceMeta());
            },
          });
          if (sendResult.status === "sent" || sendResult.status === "duplicate") {
            await markRecipientJobResult(userId, job.id, {
              status: "sent",
              messageId: sendResult.messageId || "",
              receiptId: sendResult.receiptId || "",
            });
          } else {
            await markRecipientJobResult(userId, job.id, {
              status: sendResult.status === "skipped" ? "skipped" : "failed",
              receiptId: sendResult.receiptId || "",
              error: sendResult.reason || sendResult.status || "send_failed",
            });
          }
        } catch (error: any) {
          await markRecipientJobResult(userId, job.id, { status: "failed", error: error?.message || "send_failed" });
        }
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    } catch (error: any) {
      console.error("[CustomerUpdateListJobs] Processor error:", error?.message || error);
    } finally {
      customerUpdateListJobsRunning = false;
    }
  };

  setInterval(processCustomerUpdateListJobs, 30000);

  let templateSyncTimeout: any = null;
  // Safe Missed Messages Recovery (database-backed)
  async function loadRecoveryHistory(dataOwnerKey: string, myJid: string, sender: string) {
      const localHistory = Array.isArray(localStore[sender]) ? localStore[sender] : [];
      const ownerHistory = await dbService.getChatHistory(dataOwnerKey, sender, 30);
      const legacyHistory = dataOwnerKey !== myJid ? await dbService.getChatHistory(myJid, sender, 30) : [];
      const dbHistory = buildSyntheticHistoryFromDb([...legacyHistory, ...ownerHistory].slice(-30), sender);
      const recoveryHistory = mergeRecoveryHistories(localHistory, dbHistory);
      const profile = await dbService.getCustomerProfile(dataOwnerKey, sender).catch(() => null);
      await ensureCustomerBatchBaseline({
          botId: dataOwnerKey,
          jid: sender,
          historyArray: recoveryHistory,
          profile,
      });
      const batchState = await getCustomerBatchState(sender, dataOwnerKey);
      const latestIncoming = findLatestIncomingMessage(recoveryHistory, {
          handledMessageIds: batchState.handledMessageIds,
          lastHandledMessageCursor: batchState.lastHandledMessageCursor,
          lastHandledMessageTimestamp: batchState.lastHandledMessageTimestamp,
      });

      if (recoveryHistory.length > localHistory.length) {
          localStore[sender] = recoveryHistory;
          saveLocalStore();
      }

      return { recoveryHistory, latestIncoming };
  }

  async function queueTransientAiReplyRetry(input: {
      botId: string;
      dataOwnerKey: string;
      sender: string;
      messageId: string;
      source: string;
      error: any;
      latestIncoming?: any;
      recoveryHistory?: any[];
  }) {
      if (!isTransientAiProviderError(input.error) && !isAiReplyRetryableError(input.error)) return null;
      if (!String(input.messageId || "").trim()) return null;
      const retryMetadata = getAiReplyRetryMetadata(input.error);
      const generatedReplyText = String(retryMetadata.generatedReplyText || "").trim();
      const eligibility = await getAiReplyAccountEligibility(input.botId);
      if (!eligibility.eligible) {
          await ensureAiReplyRetryQueueLoaded();
          const existing = queueAiReplyRetry(pendingAiReplyRetries, {
              botId: input.botId,
              jid: input.sender,
              messageId: input.messageId,
              source: input.source,
              error: input.error,
              lastCustomerMessageAt: input.latestIncoming ? getMessageTimestampSeconds(input.latestIncoming) * 1000 : undefined,
              generatedReplyText,
          });
          await blockAiReplyByBillingState({ eligibility, jid: input.sender, source: input.source, retryId: existing.id });
          return existing;
      }

      await ensureAiReplyRetryQueueLoaded();
      const job = queueAiReplyRetry(pendingAiReplyRetries, {
          botId: input.botId,
          jid: input.sender,
          messageId: input.messageId,
          source: input.source,
          error: input.error,
          lastCustomerMessageAt: input.latestIncoming ? getMessageTimestampSeconds(input.latestIncoming) * 1000 : undefined,
          generatedReplyText,
      });
      if (generatedReplyText) {
          markAiReplyGeneratedPendingSend(pendingAiReplyRetries, job.id, generatedReplyText);
      }
      const minutes = getAiReplyRetryDelayMinutes(job.attempts);
      await persistAiReplyRetryQueue();
      io.emit("system-log", {
          type: "warning",
          msg: `pending_ai_reply_retry_scheduled: ${input.sender.split("@")[0]} in ${minutes} minute(s).`
      });
      console.warn(`[AI-Retry] Queued ${input.sender} from ${input.source}. Next attempt in ${minutes} minute(s): ${input.error?.message || input.error}`);

      if (!job.adminAlertedAt && Number(job.attempts || 0) >= AI_REPLY_RETRY_ADMIN_ALERT_ATTEMPTS && shouldAdminHandleDifficultCustomer(botConfig)) {
          const batchState = await getCustomerBatchState(input.sender, input.dataOwnerKey);
          const latestIncoming = input.latestIncoming || findLatestIncomingMessage(input.recoveryHistory || [], {
              handledMessageIds: batchState.handledMessageIds,
              lastHandledMessageCursor: batchState.lastHandledMessageCursor,
              lastHandledMessageTimestamp: batchState.lastHandledMessageTimestamp,
          });
          const readable = getReadableMessageContent(latestIncoming?.message);
          const latestUserText = readable.text || (readable.hasAudio ? "Voice Message" : (readable.hasMedia ? "Media" : ""));
          const result = await notifyAdminForEscalation({
              sock,
              userConfig: botConfig,
              dataOwnerKey: input.dataOwnerKey,
              sender: input.sender,
              latestUserText,
              replyText: `AI reply retry pending: ${getAiReplyRetryReason(input.error)}`,
              historyArray: input.recoveryHistory || [],
              io,
          }).catch(() => ({ sent: false }));
          if (result?.sent) {
              markAiReplyRetryAdminAlerted(pendingAiReplyRetries, job.id);
              await persistAiReplyRetryQueue();
          }
      }

      return job;
  }

  async function applyReplyControlCommand(input: {
      dataOwnerKey: string;
      primaryJid: string;
      altJid?: string;
      profile?: any;
      command: { action: string };
      source: string;
  }) {
      try {
          const nowSeconds = Math.floor(Date.now() / 1000);
          const existingSummary = String(input.profile?.chatSummary || "").trim();
          const stopLine = input.command.action === "resume"
              ? ""
              : `${describeCustomerReplyControl(input.command)} Source: ${input.source}.`;
          const extraPatch = input.command.action === "resume"
              ? buildCustomerAiResumePatch()
              : {
                  aiPaused: true,
                  ai_paused: true,
                  aiPausedAt: nowSeconds,
                  aiPauseReason: stopLine || "Customer auto-reply stopped",
                  chatSummary: [existingSummary, stopLine].filter(Boolean).join("\n").slice(-3000),
                };
          const targets = await applyCustomerReplyControlToLinkedProfiles({
              dataOwnerKey: input.dataOwnerKey,
              primaryJid: input.primaryJid,
              altJid: input.altJid,
              profile: input.profile || {},
              command: input.command,
              extraPatch,
              botConfig,
              botId: process.env.BOT_ID,
              onBotConfigUpdated: (updatedMuted) => {
                  botConfig.muted_numbers = updatedMuted;
                  try {
                      if (CONFIG_FILE && fs.existsSync(CONFIG_FILE)) {
                          fs.writeFileSync(CONFIG_FILE, JSON.stringify(botConfig));
                      }
                  } catch (e: any) {
                      console.error("[BotWorker] Failed saving config file on reply control:", e?.message || e);
                  }
                  const botId = process.env.BOT_ID;
                  if (botId) {
                      dbService.saveBotConfig(botId, botConfig).catch(() => {});
                  }
              }
          });

          // Ensure in-memory and local config are also synchronously updated
          if ((input.command.action === "resume" || input.command.action === "pause_temp") && Array.isArray(botConfig.muted_numbers)) {
              botConfig.muted_numbers = removeMutedNumbers(botConfig.muted_numbers, [
                  ...targets,
                  input.primaryJid,
                  input.altJid,
                  input.profile?.phoneJid,
                  input.profile?.phoneNumber,
                  input.profile?.whatsapp_number,
                  input.profile?.lidJid,
              ]);
              try {
                  if (CONFIG_FILE && fs.existsSync(CONFIG_FILE)) {
                      fs.writeFileSync(CONFIG_FILE, JSON.stringify(botConfig));
                  }
              } catch {}
              const botId = process.env.BOT_ID;
              if (botId) {
                  dbService.saveBotConfig(botId, botConfig).catch(() => {});
              }
          }

          await ensureAiReplyRetryQueueLoaded();
          for (const target of targets) {
              if (input.command.action === "resume") {
                  const resumed = resumePausedAiReplyRetriesForCustomer(pendingAiReplyRetries, {
                      botId: input.dataOwnerKey,
                      jid: target,
                  });
                  if (resumed.length > 0) {
                      io.emit("system-log", { type: "info", msg: `retry resumed for ${target.split("@")[0]} after ${input.source}.` });
                  }
              } else {
                  for (const job of pendingAiReplyRetries.values()) {
                      if (job.botId === input.dataOwnerKey && job.jid === target && ["pending_ai_generation", "retrying_ai_generation", "ai_generated_pending_send", "retrying_whatsapp_send"].includes(job.status)) {
                          markAiReplyRetryPaused(pendingAiReplyRetries, job.id, describeCustomerReplyControl(input.command));
                      }
                  }
                  io.emit("system-log", { type: "info", msg: `retry paused for ${target.split("@")[0]} after ${input.source}.` });
              }
          }
          await persistAiReplyRetryQueue();

          const message = describeCustomerReplyControl(input.command);
          const effectiveState = input.command.action === "resume" ? "active" : input.command.action === "pause_permanent" ? "paused_permanent" : "paused_temp";
          if (input.command.action === "resume") {
              io.emit("system-log", {
                  type: "info",
                  msg: `Owner shortcut .1 applied. Effective reply state: active. (${targets.map((jid) => jid.split("@")[0]).join(", ") || input.primaryJid.split("@")[0]})`,
              });
          } else {
              io.emit("system-log", {
                  type: "info",
                  msg: `${message} (${targets.map((jid) => jid.split("@")[0]).join(", ") || input.primaryJid.split("@")[0]})`,
              });
              if (input.command.action === "pause_permanent") {
                  io.emit("system-log", { type: "warning", msg: `customer auto-reply was stopped by .00 for ${input.primaryJid.split("@")[0]}.` });
              }
          }
          return { targets, message, effectiveState, success: true };
      } catch (err: any) {
          io.emit("system-log", {
              type: "error",
              msg: `Failed applying reply control command: ${err?.message || err}`,
          });
          return { targets: [], message: "Failed applying reply control command", effectiveState: "error", success: false };
      }
  }

  async function runRecoveredAiReply(sender: string, historyArray: any[], source: string, retryContext?: { dataOwnerKey?: string; messageId?: string; latestIncoming?: any }) {
      if (hasActiveBatchForCustomer(sender)) {
          io.emit("system-log", { type: "info", msg: `reply_recovery_skipped reason=active_batch_exists customer=${sender.split("@")[0]}` });
          const activeBatch = getActiveMessageBatch(sender);
          if (activeBatch) {
              io.emit("system-log", { type: "info", msg: `batch_recovery_skipped reason=batch_processing batchId=${activeBatch.batchId}` });
          }
          if (retryContext?.messageId) {
              io.emit("system-log", { type: "info", msg: `retry_job_attached_to_active_batch messageId=${String(retryContext.messageId).slice(0, 24)}` });
          }
          await recoverStaleActiveBatchIfNeeded(sender, "process_now");
          scheduleMessageBatchProcessing(sender, "recovery_attached_to_batch", 250);
          return false;
      }
      if (currentlyReplying.has(sender) || activeAIControllers.has(sender)) {
          io.emit("system-log", { type: "info", msg: `reply_recovery_skipped reason=active_live_reply_exists customer=${sender.split("@")[0]}` });
          return false;
      }
      const eligibility = await getAiReplyAccountEligibility(retryContext?.dataOwnerKey || process.env.BOT_ID || "");
      if (!eligibility.eligible) {
          await blockAiReplyByBillingState({ eligibility, jid: sender, source });
          return false;
      }
      const batchState = await getCustomerBatchState(sender, retryContext?.dataOwnerKey || process.env.BOT_ID || "");
    const pendingBatch = collectPendingInboundMessageBatch(historyArray, {
          handledMessageIds: batchState.handledMessageIds,
          lastHandledMessageCursor: batchState.lastHandledMessageCursor,
          lastHandledMessageTimestamp: batchState.lastHandledMessageTimestamp,
      });
    const latestBatchMessage = pendingBatch.messages.at(-1);
    if (!latestBatchMessage) return false;
    if (!canProcessInboundAiMessage(botConfig, getMessageTimestampSeconds(latestBatchMessage) * 1000)) return false;
      try {
          io.emit("system-log", { type: "info", msg: `Checking missed reply for ${sender.split("@")[0]} from ${source}.` });
          await queueActiveMessageBatch({
              botId: retryContext?.dataOwnerKey || process.env.BOT_ID || "",
              jid: sender,
              message: latestBatchMessage,
              source,
              transport: source.includes("cloud") ? "cloud" : "socket",
          });
          return await processBufferedMessageBatch(sender, source);
      } catch (e: any) {
          if ((isTransientAiProviderError(e) || isAiReplyRetryableError(e)) && retryContext?.dataOwnerKey && retryContext?.messageId) {
              await queueTransientAiReplyRetry({
                  botId: retryContext.dataOwnerKey,
                  dataOwnerKey: retryContext.dataOwnerKey,
                  sender,
                  messageId: retryContext.messageId,
                  source,
                  error: e,
                  latestIncoming: retryContext.latestIncoming,
                  recoveryHistory: historyArray,
              });
              return false;
          }
          console.error(`[AI-Retry] Recovered AI reply failed for ${sender}:`, e?.message || e);
          io.emit("system-log", { type: "error", msg: `Recovered AI reply failed for ${sender.split("@")[0]}: ${e?.message || "unknown error"}` });
          return false;
      }
  }

  async function processPendingAiReplyRetries(options: { onlyJid?: string } = {}) {
      await ensureAiReplyRetryQueueLoaded();
      if (pendingAiReplyRetries.size === 0 || !sock || connectionStatus !== "connected" || !resolveBotAiChatReplyMode(botConfig).allowAiReplyRetry) return;
      const normalizedOnlyJid = String(options.onlyJid || "").trim();
      const accountEligibility = await getAiReplyAccountEligibility(process.env.BOT_ID || "");
      if (accountEligibility.eligible) {
          let resumedBlocked = false;
          for (const job of pendingAiReplyRetries.values()) {
              if (ELIGIBILITY_BLOCKED_AI_RETRY_STATUSES.has(job.status) && (!normalizedOnlyJid || job.jid === normalizedOnlyJid)) {
                  resumeBlockedAiReplyRetry(pendingAiReplyRetries, job.id);
                  resumedBlocked = true;
              }
          }
          if (resumedBlocked) {
              await persistAiReplyRetryQueue();
          }
      }
      const workerId = String(process.env.WORKER_ID || process.pid || "worker");
      const dueJobs = dueAiReplyRetries(pendingAiReplyRetries, Date.now(), workerId)
          .filter((job) => !normalizedOnlyJid || job.jid === normalizedOnlyJid);
      if (dueJobs.length === 0) return;

      const myJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";
      const dataOwnerKey = await resolveAccountDataOwnerKey(process.env.USER_ID, myJid);
      for (const job of dueJobs) {
          const claimed = claimAiReplyRetryForWorker(pendingAiReplyRetries, job.id, workerId);
          if (!claimed) continue;
          if (hasActiveBatchForCustomer(job.jid)) {
              releaseAiReplyRetryWorkerClaim(pendingAiReplyRetries, job.id, workerId);
              io.emit("system-log", { type: "info", msg: `reply_recovery_skipped reason=active_batch_exists customer=${job.jid.split("@")[0]}` });
              const activeBatch = getActiveMessageBatch(job.jid);
              if (activeBatch) {
                  io.emit("system-log", { type: "info", msg: `batch_recovery_skipped reason=batch_processing batchId=${activeBatch.batchId}` });
              }
              io.emit("system-log", { type: "info", msg: `retry_job_attached_to_active_batch messageId=${String(job.messageId || "").slice(0, 24)}` });
              await recoverStaleActiveBatchIfNeeded(job.jid, "process_now");
              scheduleMessageBatchProcessing(job.jid, "retry_attached_to_batch", 250);
              continue;
          }
          if (currentlyReplying.has(job.jid) || activeAIControllers.has(job.jid)) {
              releaseAiReplyRetryWorkerClaim(pendingAiReplyRetries, job.id, workerId);
              io.emit("system-log", { type: "info", msg: `reply_recovery_skipped reason=active_live_reply_exists customer=${job.jid.split("@")[0]}` });
              schedulePendingAiReplyDrain(job.jid, "retry_job_still_busy", AI_BUSY_REPLY_DRAIN_DELAY_MS);
              continue;
          }
          try {
              const stopRetry = shouldStopAiReplyRetry(job);
              if (stopRetry.stop) {
                  markAiReplyRetryFailed(pendingAiReplyRetries, job.id, stopRetry.reason);
                  await persistAiReplyRetryQueue();
                  io.emit("system-log", { type: "warning", msg: `pending_ai_reply_retry_stopped: ${maskRetryJid(job.jid)} reason=${stopRetry.reason}.` });
                  continue;
              }
              const eligibility = await getAiReplyAccountEligibility(dataOwnerKey);
              if (!eligibility.eligible) {
                  await blockAiReplyByBillingState({ eligibility, jid: job.jid, source: "AI retry queue", retryId: job.id });
                  continue;
              }
              const profile = await dbService.getCustomerProfile(dataOwnerKey, job.jid).catch(() => null);
              const stopState = getCustomerAutoReplyStopState(profile || {});
              if (stopState.isStopped) {
                  markAiReplyRetryPaused(pendingAiReplyRetries, job.id, stopState.message);
                  await persistAiReplyRetryQueue();
                  io.emit("system-log", { type: "info", msg: `pending_ai_reply_paused_or_blocked: ${job.jid.split("@")[0]} ${stopState.message}` });
                  continue;
              }
              const { recoveryHistory, latestIncoming } = await loadRecoveryHistory(dataOwnerKey, myJid, job.jid);
              if (!latestIncoming) {
                  pendingAiReplyRetries.delete(job.id);
                  await persistAiReplyRetryQueue();
                  io.emit("system-log", { type: "info", msg: `retry cleared for ${job.jid.split("@")[0]} because no customer message was found.` });
                  continue;
              }
              const incomingAt = getMessageTimestampSeconds(latestIncoming);
              const incomingAtMs = incomingAt * 1000;
              if (String(latestIncoming?.key?.id || "") !== job.messageId) {
                  io.emit("system-log", { type: "info", msg: `pending_reply_cancelled reason=newer_customer_message customer=${job.jid.split("@")[0]}` });
                  io.emit("system-log", { type: "info", msg: `reply_retry_skipped reason=stale_message customer=${job.jid.split("@")[0]}` });
                  supersedeAiReplyRetriesForCustomer(pendingAiReplyRetries, {
                      botId: job.botId,
                      jid: job.jid,
                      latestMessageId: String(latestIncoming?.key?.id || ""),
                  }, incomingAtMs);
                  await persistAiReplyRetryQueue();
                  io.emit("system-log", { type: "info", msg: `newer_customer_message_merged_retry: ${job.jid.split("@")[0]} latestCustomerAt=${incomingAt}.` });
                  await queueActiveMessageBatch({
                      botId: job.botId,
                      jid: job.jid,
                      message: latestIncoming,
                      source: "retry_newer_message_merge",
                      transport: "socket",
                  });
                  scheduleMessageBatchProcessing(job.jid, "retry_newer_message_merge", 250);
                  continue;
              }
              const latestPendingCustomerAtMs = Math.max(incomingAtMs, Number(job.lastCustomerMessageAt || 0));
              const lastBotAtMs = getProfileLastBotSeconds(profile) * 1000;
              if (isDeliveredAfterLatestPendingCustomerMessage({
                  lastDeliveredBotAtMs: lastBotAtMs,
                  latestIncomingAtMs: incomingAtMs,
                  jobLastCustomerMessageAtMs: job.lastCustomerMessageAt,
              })) {
                  markAiReplyRetryDelivered(pendingAiReplyRetries, job.id);
                  await persistAiReplyRetryQueue();
                  io.emit("system-log", { type: "info", msg: `reply_retry_skipped reason=message_already_handled_by_batch customer=${job.jid.split("@")[0]}` });
                  io.emit("system-log", { type: "info", msg: `reply_retry_skipped reason=message_already_delivered customer=${job.jid.split("@")[0]}` });
                  io.emit("system-log", { type: "success", msg: `retry cleared for ${job.jid.split("@")[0]} because a reply is already delivered after latest pending message. latestCustomerAt=${Math.floor(latestPendingCustomerAtMs / 1000)} lastBotAt=${Math.floor(lastBotAtMs / 1000)}.` });
                  continue;
              }
              if (lastBotAtMs > 0 && latestPendingCustomerAtMs > 0 && lastBotAtMs <= latestPendingCustomerAtMs) {
                  io.emit("system-log", { type: "warning", msg: `pending_retry_not_cleared_due_to_unanswered_latest: ${job.jid.split("@")[0]} latestCustomerAt=${Math.floor(latestPendingCustomerAtMs / 1000)} lastBotAt=${Math.floor(lastBotAtMs / 1000)}.` });
              }

              const attempt = markAiReplyRetryAttempt(pendingAiReplyRetries, job.id);
              await persistAiReplyRetryQueue();
              io.emit("system-log", { type: "info", msg: `pending_ai_reply_retry_scheduled: ${job.jid.split("@")[0]} attempt ${attempt?.attempts || job.attempts + 1}.` });
              const handled = String(job.generatedReplyText || "").trim()
                  ? await aiHandler.sendStoredAiTextReply({
                      sock: createTrackedWhatsAppSocket(sock, botSentMessageIds),
                      sender: job.jid,
                      text: String(job.generatedReplyText || ""),
                      userConfig: { ...botConfig, cachedMediaTemplates, mediaGroupJid, welcomeGroupJid },
                      userId: process.env.USER_ID,
                      dataOwnerKey,
                      actualBotId: getActualInstanceMeta().actualBotId,
                      actualBotJid: getActualInstanceMeta().actualBotJid,
                      eventId: String(latestIncoming?.key?.id || job.messageId),
                      contextType: "ai_text_reply",
                  }).then(() => true)
                  : await runRecoveredAiReply(job.jid, recoveryHistory, `AI retry queue after ${job.source}`, {
                      dataOwnerKey,
                      messageId: String(latestIncoming?.key?.id || job.messageId),
                      latestIncoming,
                  });
              if (handled) {
                  markAiReplyRetryDelivered(pendingAiReplyRetries, job.id);
                  await persistAiReplyRetryQueue();
                  io.emit("system-log", { type: "success", msg: `pending_ai_reply_sent: ${job.jid.split("@")[0]}.` });
              } else {
                  const postAttemptEligibility = await getAiReplyAccountEligibility(dataOwnerKey);
                  if (!postAttemptEligibility.eligible) {
                      await blockAiReplyByBillingState({ eligibility: postAttemptEligibility, jid: job.jid, source: "AI retry queue reply_not_delivered", retryId: job.id });
                      continue;
                  }
                  queueAiReplyRetry(pendingAiReplyRetries, {
                      botId: job.botId,
                      jid: job.jid,
                      messageId: String(latestIncoming?.key?.id || job.messageId),
                      source: "AI retry queue",
                      error: "reply_not_delivered",
                      lastCustomerMessageAt: latestPendingCustomerAtMs,
                  });
                  await persistAiReplyRetryQueue();
                  io.emit("system-log", { type: "warning", msg: `pending_ai_reply_retry_scheduled: ${job.jid.split("@")[0]} reply_not_delivered.` });
              }
          } catch (e: any) {
              if (isTransientAiProviderError(e) || isAiReplyRetryableError(e)) {
                  markAiReplyRetryWaitingProvider(pendingAiReplyRetries, job.id, e);
                  await persistAiReplyRetryQueue();
                  await queueTransientAiReplyRetry({
                      botId: dataOwnerKey,
                      dataOwnerKey,
                      sender: job.jid,
                      messageId: job.messageId,
                      source: "AI retry queue",
                      error: e,
                  });
                  continue;
              }
              console.error(`[AI-Retry] Retry loop failed for ${job.jid}:`, e?.message || e);
              io.emit("system-log", { type: "error", msg: `pending_ai_reply_send_failed: ${job.jid.split("@")[0]} ${e?.message || "unknown error"}` });
          } finally {
              releaseAiReplyRetryWorkerClaim(pendingAiReplyRetries, job.id, workerId);
          }
      }
  }

  setInterval(processPendingAiReplyRetries, AI_REPLY_RETRY_INTERVAL_MS);

  let autoFollowupsRunning = false;
  async function runDueAutoFollowups() {
    if (autoFollowupsRunning || !sock || connectionStatus !== "connected") return;
    if (!Boolean((botConfig as any)?.auto_followup_enabled)) return;
    autoFollowupsRunning = true;
    try {
      const userId = process.env.USER_ID;
      const botId = process.env.BOT_ID;
      if (!userId || !botId) return;
      const myJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";
      const dataOwnerKey = await resolveAccountDataOwnerKey(userId, myJid);
      const workerId = String(process.env.WORKER_ID || process.pid || "worker");

      await processDueAutoFollowups({
        botId,
        workerId,
        botConfig,
        checkBillingEligibility: async () => {
          const elig = await getAiReplyAccountEligibility(botId);
          return { eligible: elig.eligible, reason: elig.reason };
        },
        getChatHistory: async (customerJid) => {
          return dbService.getChatHistory(dataOwnerKey, customerJid, 10);
        },
        getCustomerProfile: async (customerJid) => {
          return dbService.getCustomerProfile(dataOwnerKey, customerJid);
        },
        isCustomerAiPaused: (_customerJid, profile) => {
          return isCustomerAiPaused(profile) || currentlyReplying.has(_customerJid);
        },
        sendFollowupText: async (customerJid, messageText, options?: { customerTurnId?: string; extraAiCallsCount?: number }) => {
          const idempotencyKey = `auto-followup:${customerJid}:${Date.now()}`;
          const sendResult = await sendUniversalOutboundText({
            userId,
            botId,
            customerJid,
            messageText,
            idempotencyKey,
            customerTurnId: options?.customerTurnId,
            billingAction: "customer_ai_text_reply",
            extraAiCallsCount: options?.extraAiCallsCount || 0,
            contextType: "auto_followup_reply",
            campaignType: "auto_followup",
            sendText: (jid, text) => sendUniversalTextViaActiveProvider(jid, text),
            saveMessage: async (jid, text, messageId) => {
              await dbService.saveMessage(dataOwnerKey, jid, "model", text, messageId, undefined, getActualInstanceMeta());
            },
          });
          return {
            success: sendResult.status === "sent" || sendResult.status === "duplicate",
            messageId: sendResult.messageId,
            error: sendResult.reason || sendResult.status,
          };
        },
      });
    } catch (err: any) {
      console.error("[AutoFollowup] runDueAutoFollowups error:", err?.message || err);
    } finally {
      autoFollowupsRunning = false;
    }
  }

  setInterval(runDueAutoFollowups, 60000);

  function buildManualCommandMessage(jid: string, text: string) {
      return {
          key: { fromMe: true, remoteJid: jid, id: `manual-command-${Date.now()}` },
          message: { conversation: text },
          messageTimestamp: Math.floor(Date.now() / 1000)
      };
  }

  async function forceMissedReplyFromShortcut(jid: string, commandMessage: any, shortcutText?: string) {
      const text = shortcutText ?? getReadableMessageContent(commandMessage?.message).text;
      if (!isMissedReplyForceShortcutText(text)) return false;
      if (!sock || connectionStatus !== "connected") return true;

      const myJid = getMyJid(sock);
      const dataOwnerKey = await resolveAccountDataOwnerKey(process.env.USER_ID, myJid);
      const { recoveryHistory } = await loadRecoveryHistory(dataOwnerKey, myJid, jid);
      const recovery = buildForcedMissedReplyHistory(recoveryHistory, commandMessage, jid);

      if (recovery.cleanHistory.length !== recoveryHistory.length) {
          localStore[jid] = recovery.cleanHistory.slice(-100);
          saveLocalStore();
      }

      if (!recovery.targetIncoming) {
          io.emit("system-log", { type: "warning", msg: `Comma shortcut received for ${jid.split("@")[0]}, but no customer message was available to recover.` });
          return true;
      }

      io.emit("system-log", {
          type: "info",
          msg: `Comma force reply queued for ${maskRetryJid(jid)} (${describeForcedMissedReplyTarget(recovery.usedQuotedMessage)}).`
      });

      const handled = await runRecoveredAiReply(jid, recovery.replyHistory, "manual comma shortcut", {
          dataOwnerKey,
          messageId: String(recovery.targetIncoming?.key?.id || ""),
          latestIncoming: recovery.targetIncoming,
      });
      if (!handled) {
          await queueTransientAiReplyRetry({
              botId: dataOwnerKey,
              dataOwnerKey,
              sender: jid,
              messageId: String(recovery.targetIncoming?.key?.id || ""),
              source: "manual comma shortcut",
              error: createAiReplyRetryableError("Force reply still pending delivery.", FORCE_REPLY_PENDING_DELIVERY_REASON),
              latestIncoming: recovery.targetIncoming,
              recoveryHistory: recovery.replyHistory,
          });
          io.emit("system-log", { type: "warning", msg: `Force reply still pending, will retry for ${maskRetryJid(jid)}.` });
      }
      return true;
  }

  async function checkMissedMessagesFromDatabase(maxRecoveries = MISSED_MESSAGE_SWEEP_BATCH_SIZE) {
      if (!sock || connectionStatus !== "connected" || !resolveBotAiChatReplyMode(botConfig).allowInboundAiReply) return 0;
      try {
          const myJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";
          const dataOwnerKey = await resolveAccountDataOwnerKey(process.env.USER_ID, myJid);
          const nowSeconds = Math.floor(Date.now() / 1000);
          const cutoffSeconds = nowSeconds - MISSED_MESSAGE_GRACE_SECONDS;
          
          const missedCustomers = await dbService.getMissedMessageCustomers(dataOwnerKey, cutoffSeconds, MISSED_MESSAGE_LOOKBACK_SECONDS);
          let recoveredCount = 0;
          for (const customer of missedCustomers) {
              if (recoveredCount >= maxRecoveries) break;
              const sender = normalizeCustomerJid(customer);
              if (!sender || sender.endsWith("@g.us")) continue;
                if (hasActiveBatchForCustomer(sender)) {
                  io.emit("system-log", { type: "info", msg: `reply_recovery_skipped reason=active_batch_exists customer=${sender.split("@")[0]}` });
                  const activeBatch = getActiveMessageBatch(sender);
                  if (activeBatch) {
                    io.emit("system-log", { type: "info", msg: `batch_recovery_skipped reason=batch_processing batchId=${activeBatch.batchId}` });
                  }
                  continue;
                }
              
              if (currentlyReplying.has(sender) || activeAIControllers.has(sender)) continue;
              
              const { recoveryHistory, latestIncoming } = await loadRecoveryHistory(dataOwnerKey, myJid, sender);
              if (!latestIncoming) continue;
              const incomingAt = getMessageTimestampSeconds(latestIncoming);
              const ageSeconds = nowSeconds - incomingAt;
              if (ageSeconds < MISSED_MESSAGE_GRACE_SECONDS || ageSeconds > MISSED_MESSAGE_LOOKBACK_SECONDS) continue;
              const profile = await dbService.getCustomerProfile(dataOwnerKey, sender);
              const stopState = getCustomerAutoReplyStopState(profile || {});
              if (stopState.isStopped) {
                  io.emit("system-log", { type: "info", msg: `Missed reply check skipped because customer auto-reply is paused/stopped. (${stopState.message})` });
                  continue;
              }
              if (getProfileLastBotSeconds(profile) >= incomingAt) continue;
              const historyArray = recoveryHistory;
              const handled = await runRecoveredAiReply(sender, historyArray, "database recovery", {
                  dataOwnerKey,
                  messageId: String(latestIncoming?.key?.id || ""),
                  latestIncoming,
              });
              if (handled) recoveredCount++;
          }
          return recoveredCount;
      } catch (e) {
          console.error("[MissedMsg Check] Error:", e);
          return 0;
      }
  }

  function saveLocalStore(options: { allowEmptyTemplateWrite?: boolean; immediate?: boolean } = {}) {
    try {
      const storeToSave: Record<string, any> = {};

      for (const [key, val] of Object.entries(localStore)) {
          const isTemplate = isTemplateGroupJid(key);
          if (!key.endsWith('@g.us') || isTemplate || (Array.isArray(val) && val.length > 0)) {
              storeToSave[key] = val;
          }
      }
      fs.writeFileSync(LOCAL_STORE_FILE, JSON.stringify(storeToSave, Baileys.BufferJSON.replacer));
      
      const performCloudSync = () => {
        const botEnvId = process.env.BOT_ID || "";
        if (!botEnvId) return Promise.resolve();

        const templateStore = extractTemplateStore(!!options.allowEmptyTemplateWrite);
        const totalTemplatesFound = Object.values(templateStore).reduce((sum, val) => sum + (Array.isArray(val) ? val.length : 0), 0);
        
        if (totalTemplatesFound > 0 || options.allowEmptyTemplateWrite) {
            const groupResetMap = botConfig?.groupResetAt || {};
            const payloadWithMeta = serializeTemplateStoreWithMeta(templateStore, groupResetMap);
            const serializedStore = JSON.stringify(payloadWithMeta, Baileys.BufferJSON.replacer);
            const targets = Array.from(new Set([botEnvId, getConnectedBotJid()].filter(Boolean)));
            const botOwnerId = process.env.USER_ID || process.env.ACCOUNT_ID || (botConfig as any)?.user_id || (botConfig as any)?.accountId || "";
            return Promise.all(targets.map((target) => dbService.saveTemplateStore(target, serializedStore, botOwnerId))).then(() => {
                io.emit("system-log", { type: "info", msg: `Template store backed up to database (${totalTemplatesFound} messages).` });
            }).catch((err: any) => {
                console.error("Template Sync Error:", err);
                io.emit("system-log", { type: "error", msg: "Failed saving templates to cloud."});
            });
        }
        return Promise.resolve();
      };

      if (options.immediate) {
        if (templateSyncTimeout) {
          clearTimeout(templateSyncTimeout);
          templateSyncTimeout = null;
        }
        return performCloudSync();
      }

      if (templateSyncTimeout) {
        clearTimeout(templateSyncTimeout);
      }
      templateSyncTimeout = setTimeout(() => {
        performCloudSync();
      }, 5000);
    } catch (e) {
      console.error("Error saving local store:", e);
    }
  }

  io.on("connection", (socket) => {
    dashboardClientCount += 1;
    clearUnconnectedProxyReleaseTimer();
    socket.emit("config", getEnrichedConfig());
    socket.emit("whatsapp-status", connectionStatus);
    if (connectionRetryState) socket.emit("whatsapp-retry-status", connectionRetryState);
    socket.emit("sync-status", { isSyncing: isSyncingTemplates });
    if (qrCodeData) socket.emit("whatsapp-qr", qrCodeData);

    recentLogs.forEach((log) => socket.emit("system-log", log));
    recentMessages.forEach((msg) => socket.emit("whatsapp-message", msg));
    listLiveConsoleEvents({
      botId: process.env.BOT_ID || "",
      accountId: process.env.USER_ID || "",
      includeGlobal: false,
    }).forEach((event) => socket.emit("live-audit-event", event));

    // Immediate log to break the silence in the dashboard
    socket.emit("system-log", { type: "info", msg: "📡 Dashboard Linked to Engine." });
    if (connectionStatus === "connected") {
        socket.emit("system-log", { type: "wa", msg: "✅ Engine is currently active and linked to WhatsApp." });
    }

    socket.on("send-message", async ({ to, text }) => {
      if (!sock || connectionStatus !== "connected") return;
      try {
        const manualSendLimit = checkManualSendRateLimit();
        if (manualSendLimit.limited) {
          console.warn(`[Security] rate_limit_hit ${JSON.stringify({
            limiter: "worker-manual-send",
            source: "socket",
            botId: process.env.BOT_ID || "",
            userId: process.env.USER_ID || "",
          })}`);
          io.emit("system-log", { type: "warning", msg: "Manual send temporarily rate-limited. Please wait before sending more messages." });
          return;
        }
        const finalText = text.trim();
        const targetJid = normalizeWhatsAppJid(to);
        if (!targetJid) {
          io.emit("system-log", { type: "error", msg: `Cannot send message. Unsafe WhatsApp target: ${to}` });
          return;
        }
        const access = await assertCustomerFacingSendAllowed({
          userId: process.env.USER_ID,
          context: "manual_socket_send",
          customerJid: targetJid,
          io,
          logger: console,
        });
        if (!access.allowed) return;
        const forceTriggered = await forceMissedReplyFromShortcut(
          targetJid,
          buildManualCommandMessage(targetJid, finalText),
          finalText
        );
        if (forceTriggered) return;

        const shortcutMatched = await processShortcut(
          createTrackedWhatsAppSocket(sock, botSentMessageIds),
          targetJid,
          targetJid,
          { key: { fromMe: true }, message: { conversation: finalText } },
          finalText,
          cachedKeywordSequences,
          simulateTyping,
          forwardTemplate,
          pendingResponses,
          currentlyReplying,
          io,
          { templates: cachedWelcomeTemplates, config: (botConfig?.groups || []).find((g: any) => g?.purpose === 'welcome') }
        );
        if (shortcutMatched) return;

        const msg = await sendTextViaActiveProvider(targetJid, finalText).then(res => { if(res?.key?.id) botSentMessageIds.add(res.key.id); return res; });
        learnFromManualOutboundMessage({
          sock,
          botConfig,
          io,
          jid: targetJid,
          text: finalText,
          kind: "text",
          messageId: msg?.key?.id,
          userId: process.env.USER_ID,
          botId: process.env.BOT_ID,
        }).catch((e) => console.error("[ManualLearning] Socket send-message failed:", e));

        // Removed mark unread after manual reply

      } catch (e) {}
    });

    socket.on("disconnect", () => {
      dashboardClientCount = Math.max(0, dashboardClientCount - 1);
      if (dashboardClientCount === 0 && connectionStatus !== "connected") {
        scheduleUnconnectedProxyRelease("dashboard left before QR scan");
      }
    });
  });

  async function checkUnrepliedMessages() {
    if (!sock || connectionStatus !== "connected" || !resolveBotAiChatReplyMode(botConfig).allowInboundAiReply) return;
    
    io.emit("system-log", { type: "info", msg: "🔍 Running background check for unreplied messages..." });
    let triggeredCount = 0;
    const now = Date.now();
    const myJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";
    const dataOwnerKey = await resolveAccountDataOwnerKey(process.env.USER_ID, myJid);

    for (const jid of Object.keys(localStore)) {
        if (triggeredCount >= MISSED_MESSAGE_SWEEP_BATCH_SIZE) break;
        if (!isCustomerChatJid(jid)) continue;
        if (hasActiveBatchForCustomer(jid)) {
            io.emit("system-log", { type: "info", msg: `reply_recovery_skipped reason=active_batch_exists customer=${jid.split("@")[0]}` });
            const activeBatch = getActiveMessageBatch(jid);
            if (activeBatch) {
              io.emit("system-log", { type: "info", msg: `batch_recovery_skipped reason=batch_processing batchId=${activeBatch.batchId}` });
            }
            continue;
        }
        if (currentlyReplying.has(jid) || activeAIControllers.has(jid)) {
            io.emit("system-log", { type: "info", msg: `reply_recovery_skipped reason=active_live_reply_exists customer=${jid.split("@")[0]}` });
            continue;
        }
        
        const historyArray = localStore[jid];
        if (!historyArray || historyArray.length === 0) continue;

        const profile = await dbService.getCustomerProfile(dataOwnerKey, jid);
        await ensureCustomerBatchBaseline({
            botId: dataOwnerKey,
            jid,
            historyArray,
            profile,
        });
        const batchState = await getCustomerBatchState(jid, dataOwnerKey);
        const candidate = getLatestCustomerRecoveryCandidate({
            historyArray,
            profile,
            nowSeconds: Math.floor(now / 1000),
            graceSeconds: MISSED_MESSAGE_GRACE_SECONDS,
            lookbackSeconds: MISSED_MESSAGE_LOOKBACK_SECONDS,
            selection: {
                handledMessageIds: batchState.handledMessageIds,
                lastHandledMessageCursor: batchState.lastHandledMessageCursor,
                lastHandledMessageTimestamp: batchState.lastHandledMessageTimestamp,
            },
        });
        if (!candidate.shouldRecover) continue;

        console.log(`[Background] Recovering missed message for ${jid}`);
        const handled = await runRecoveredAiReply(jid, historyArray, "local store recovery", {
            dataOwnerKey,
            messageId: String(findLatestIncomingMessage(historyArray, {
                handledMessageIds: batchState.handledMessageIds,
                lastHandledMessageCursor: batchState.lastHandledMessageCursor,
                lastHandledMessageTimestamp: batchState.lastHandledMessageTimestamp,
            })?.key?.id || ""),
            latestIncoming: findLatestIncomingMessage(historyArray, {
                handledMessageIds: batchState.handledMessageIds,
                lastHandledMessageCursor: batchState.lastHandledMessageCursor,
                lastHandledMessageTimestamp: batchState.lastHandledMessageTimestamp,
            }),
        });
        if (handled) triggeredCount++;

        // Pace requests to avoid quota limits during backlog recovery.
        await new Promise(r => setTimeout(r, MISSED_MESSAGE_SWEEP_PAUSE_MS));
    }
    const remainingBatchSlots = Math.max(0, MISSED_MESSAGE_SWEEP_BATCH_SIZE - triggeredCount);
    const databaseRecoveredCount = remainingBatchSlots > 0
        ? await checkMissedMessagesFromDatabase(remainingBatchSlots)
        : 0;
    const totalRecovered = triggeredCount + databaseRecoveredCount;
    io.emit("system-log", {
        type: totalRecovered > 0 ? "success" : "info",
        msg: `Background unreplied check complete. Local replies: ${triggeredCount}, database replies: ${databaseRecoveredCount}.`
    });
  }

  if (!isSafeModeDisableStartupUnrepliedSweepEnabled()) {
    setInterval(checkUnrepliedMessages, MISSED_MESSAGE_CHECK_INTERVAL_MS);
  }

  const initWhatsApp = async () => {
    // ------------------------------------------------------------------
    // Provider Check: WhatsApp Cloud API
    // ------------------------------------------------------------------
    if (providerRuntimeState.providerType === "whatsapp_cloud_api") {
      const isReady = isCloudTextProcessingGateOpen();
      const botEnvId = process.env.BOT_ID || "";
      const cloudPhoneId = providerRuntimeState.phoneNumberId || botEnvId;

      if (isReady) {
        if (cloudApiRuntimeProvider && typeof (cloudApiRuntimeProvider as any).start === "function") {
          await (cloudApiRuntimeProvider as any).start().catch(() => {});
        }
        connectionStatus = "connected";
        qrCodeData = null;
        io.emit("whatsapp-status", connectionStatus);
        io.emit("system-log", {
          type: "wa",
          msg: `✅ Cloud API runtime active for ${cloudPhoneId}; awaiting/accepting authenticated webhook traffic.`,
        });
        if (botEnvId) {
          await hydrateBotConfigFromDatabase();
          const restore = await hydrateTemplateStoreFromDatabase([botEnvId]);
          if (restore.restored > 0) {
            console.log(`[Templates] Restored ${restore.restored} templates from database.`);
          }
          await loadTemplates();
          io.emit("config", getEnrichedConfig());
        }
      } else {
        if (cloudApiRuntimeProvider && typeof (cloudApiRuntimeProvider as any).stop === "function") {
          await (cloudApiRuntimeProvider as any).stop().catch(() => {});
        }
        connectionStatus = "disabled";
        qrCodeData = null;
        io.emit("whatsapp-status", connectionStatus);
        io.emit("system-log", {
          type: "info",
          msg: `Cloud API instance disabled (${providerRuntimeState.readinessReason || "not ready"}). Webhook processing gated.`,
        });
      }
      return;
    }

    // ------------------------------------------------------------------
    // Provider: WhatsApp Web (Baileys)
    // ------------------------------------------------------------------
    let selectedProxyUrl = "";
    try {
        io.emit("system-log", { type: "info", msg: "Connecting to WhatsApp through proxy..." });
        const { createWhatsAppConnection } = await import("./src/services/whatsapp-connection.ts");
        const userId = process.env.USER_ID || "";
        const proxySelection = await resolveWhatsAppProxyUrl(userId);
        if (!proxySelection?.proxyUrl) {
            throw new Error("No active proxy available. WhatsApp connection blocked to protect VPS IP.");
        }
        selectedProxyUrl = proxySelection.proxyUrl;
        connectionStatus = "proxy-connecting";
        io.emit("whatsapp-status", connectionStatus);
        io.emit("system-log", { type: "wa", msg: `Securing WhatsApp tunnel via ${proxySelection.source} proxy ${proxySelection.maskedProxyUrl}` });
        
        sock = await createWhatsAppConnection(
            process.env.BOT_ID || "default",
            selectedProxyUrl,
            msgRetryCounterCache,
            async (qr) => {
                try {
                    const dataUrl = await QRCode.toDataURL(qr);
                    connectionStatus = "qr-ready";
                    qrCodeData = dataUrl;
                    resetConnectionRetryState();
                    io.emit("whatsapp-status", connectionStatus);
                    io.emit("whatsapp-qr", dataUrl);
                } catch(e) {}
            },
            () => {
                connectionStatus = "connecting";
                io.emit("whatsapp-status", connectionStatus);
                io.emit("system-log", { type: "wa", msg: "Connecting..." });
            },
            async (_sock) => {
                sock = _sock;
                qrCodeData = null;
                const myJid = _sock.user.id.split(":")[0] + "@s.whatsapp.net";
                const botEnvId = process.env.BOT_ID || "";
                const userId = process.env.USER_ID || "";
                const lockResult = await verifyWhatsAppNumberLock({ jid: myJid, userId, botId: botEnvId });
                if (!lockResult.allowed) {
                    const lockMessage = lockResult.message || `${myJid.split("@")[0]} is already locked to another account.`;
                    connectionStatus = "error";
                    qrCodeData = null;
                    io.emit("whatsapp-status", connectionStatus);
                    io.emit("whatsapp-lock-error", { message: lockMessage, jid: myJid });
                    io.emit("system-log", { type: "error", msg: lockMessage });
                    try { await _sock.logout(); } catch(e) {}
                    try {
                        fs.rmSync(path.join(__dirname, `auth_info_baileys_${botEnvId}`), { recursive: true, force: true });
                    } catch(e) {}
                    return;
                }

                connectionStatus = "connected";
                resetConnectionRetryState();
                clearUnconnectedProxyReleaseTimer();
                if (selectedProxyUrl) {
                    await dbService.updateSystemProxyStatusByUrl(selectedProxyUrl, null, null).catch(() => {});
                }
                if (botEnvId) {
                    await dbService.saveBotInfo(myJid, botEnvId).catch(() => {});
                    syncInstanceNumberToMainBlacklist({ instanceJid: myJid, sourceBotId: botEnvId })
                        .then((result) => {
                            if (result.updated) io.emit("system-log", { type: "info", msg: `Main account bot blacklist synced with connected instance ${result.number}.` });
                        })
                        .catch(() => {});
                    await hydrateBotConfigFromDatabase();
                    const restore = await hydrateTemplateStoreFromDatabase([myJid, botEnvId]);
                    if (restore.restored > 0) {
                        saveLocalStore();
                    }
                    await syncTemplateGroup();
                    await loadTemplates();
                    io.emit("config", getEnrichedConfig());
                    setupAutoSync();
                }
                
                io.emit("whatsapp-status", connectionStatus);
                io.emit("system-log", { type: "wa", msg: `✅ Engine active as ${myJid}. linked to WhatsApp.` });
                
                setTimeout(() => {
                    if (isSafeModeDisableStartupUnrepliedSweepEnabled() || isSafeModeDisableStartupBaselineScanEnabled()) {
                        io.emit("system-log", { type: "info", msg: "startup_unreplied_sweep_skipped_safe_mode=true" });
                    } else {
                        checkUnrepliedMessages();
                    }
                    checkAndNotifyStockReminders();
                    checkPlannedCustomerUpdates();
                    startAdminReminderScheduler({
                        intervalMs: 15000,
                        getSockFn: () => sock,
                    });
                }, MISSED_MESSAGE_STARTUP_DELAY_MS);

                // History Sync Listener
                sock.ev.on("messaging-history.set", async (u: any) => {
                    const { messages, contacts } = u;
                    if (contacts && Array.isArray(contacts)) {
                       const updates = contacts.flatMap((contact: any) => buildContactIdentityUpdates(contact));
                       await persistContactIdentityUpdates(updates);
                    }
                    if (messages && Array.isArray(messages)) {
                       for (const m of messages) {
                          const jid = m.key.remoteJid;
                          if (!jid) continue;
                          if (isStatusBroadcastJid(jid)) continue;
                          if (!jid.endsWith("@g.us") && isIgnorableWhatsappMessage(m)) continue;
                          if (!localStore[jid]) localStore[jid] = [];
                          const exists = localStore[jid].some((existing: any) => existing.key?.id === m.key?.id);
                          if (!exists) localStore[jid].push(m);
                       }
                       saveLocalStore();
                       await loadTemplates();
                    }
                });

                sock.ev.on("lid-mapping.update", async (mapping: any) => {
                    if (mapping?.lid && mapping?.pn) {
                        const myJid = getMyJid(sock);
                        const dataOwnerKey = await resolveAccountDataOwnerKey(process.env.USER_ID, myJid);
                        recordLidPnMapping({
                            dataOwnerKey,
                            lid: mapping.lid,
                            pn: mapping.pn,
                            source: "lid_mapping_update",
                        });
                    }
                    const update = buildLidMappingIdentityUpdate(mapping);
                    if (update) {
                        await persistContactIdentityUpdates([update]);
                    }
                });

                sock.ev.on("call", async (calls: any[]) => {
                    if (!shouldRejectIncomingCall(botConfig) || !Array.isArray(calls)) return;

                    for (const call of calls) {
                        if (!isIncomingCallOffer(call)) continue;
                        const callerJid = getCallChatJid(call);
                        const rejectFrom = getCallRejectFromJid(call);
                        if (!callerJid || !rejectFrom || rejectedCallIds.has(call.id)) continue;

                        rejectedCallIds.add(call.id);
                        setTimeout(() => rejectedCallIds.delete(call.id), 10 * 60 * 1000);

                        try {
                            await sock.rejectCall(call.id, rejectFrom);
                            const rejectText = buildCallRejectionMessage(botConfig);
                            const access = await assertCustomerFacingSendAllowed({
                                userId: process.env.USER_ID,
                                context: "call_rejection_redirect",
                                customerJid: callerJid,
                                io,
                                logger: console,
                            });
                            if (!access.allowed) continue;
                            const sent = await sock.sendMessage(callerJid, { text: rejectText });
                            if (sent?.key?.id) botSentMessageIds.add(sent.key.id);

                            const dataOwnerKey = await resolveAccountDataOwnerKey(process.env.USER_ID, sock.user.id.split(":")[0] + "@s.whatsapp.net");
                            await dbService.saveMessage(dataOwnerKey, callerJid, "model", rejectText, sent?.key?.id, undefined, getActualInstanceMeta());
                            io.emit("whatsapp-message", {
                                from: callerJid,
                                text: rejectText,
                                isFromMe: true,
                                timestamp: Date.now()
                            });
                            io.emit("system-log", { type: "info", msg: `Rejected incoming ${call.isVideo ? "video" : "voice"} call from ${callerJid.split("@")[0]} and sent chat redirect.` });
                        } catch (e: any) {
                            console.error("[CallMode] Failed rejecting incoming call:", e?.message || e);
                            io.emit("system-log", { type: "error", msg: `Call rejection failed: ${e?.message || "unknown error"}` });
                        }
                    }
                });

                sock.ev.on("messages.upsert", async (u: any) => {
                    if (!isIncomingNotification(u)) return;
                    for (const msg of u.messages) {
                        const jid = msg.key.remoteJid;
                        if (!jid) continue;
                        if (isStatusBroadcastJid(jid)) continue;

                        const myJid = getMyJid(sock);
                        const dataOwnerKey = await resolveAccountDataOwnerKey(process.env.USER_ID, myJid);

                        // Cross-identity same-message deduplication (PN vs LID duplicate delivery)
                        if (msg.key?.id && !msg.key.fromMe) {
                            const currentBotId = process.env.BOT_ID || dataOwnerKey;
                            const dedup = claimCrossIdentityMessage({
                                accountId: dataOwnerKey,
                                botId: currentBotId,
                                direction: "inbound",
                                messageId: String(msg.key.id),
                                timestamp: Number(msg.messageTimestamp || 0) * 1000 || Date.now(),
                            });
                            if (dedup.isDuplicate) {
                                console.log(`[CrossIdentityDedup] Dropping duplicate inbound event ${msg.key.id} across transport identities`);
                                continue;
                            }
                        }

                        const canonicalIdentity = await resolveCanonicalContactIdentity({
                            remoteJid: msg.key.remoteJid,
                            remoteJidAlt: msg.key.remoteJidAlt,
                            participant: msg.key.participant,
                            participantAlt: msg.key.participantAlt,
                            senderPn: msg.key.senderPn,
                            participantPn: msg.key.participantPn,
                            addressingMode: (msg as any).addressingMode,
                            signalRepository: sock?.signalRepository,
                            sock,
                            dataOwnerKey,
                        });

                        const altJid = canonicalIdentity.phoneJid || normalizeWhatsAppJid(msg.key.remoteJidAlt);
                        if (canonicalIdentity.lidJid && canonicalIdentity.phoneJid) {
                            recordLidPnMapping({
                                dataOwnerKey,
                                lid: canonicalIdentity.lidJid,
                                pn: canonicalIdentity.phoneJid,
                                source: canonicalIdentity.resolutionSource,
                            });
                            recordVerifiedCustomerAlias({
                                accountId: dataOwnerKey,
                                alias: canonicalIdentity.lidJid,
                                type: "lid",
                                phone: canonicalIdentity.phoneJid.split("@")[0],
                                source: canonicalIdentity.resolutionSource || "inbound_whatsapp",
                            });
                            recordVerifiedCustomerAlias({
                                accountId: dataOwnerKey,
                                alias: canonicalIdentity.phoneJid,
                                type: "pn_jid",
                                phone: canonicalIdentity.phoneJid.split("@")[0],
                                source: canonicalIdentity.resolutionSource || "inbound_whatsapp",
                            });
                        }

                        const identityUpdate = jid.endsWith("@lid") && altJid.endsWith("@s.whatsapp.net")
                            ? buildLidMappingIdentityUpdate({ lid: jid, pn: altJid })
                            : (jid.endsWith("@s.whatsapp.net") && altJid.endsWith("@lid")
                                ? buildLidMappingIdentityUpdate({ lid: altJid, pn: jid })
                                : null);
                        if (identityUpdate) persistContactIdentityUpdates([identityUpdate]).catch(() => {});

                        // Intercept Owner Shortcuts (.0, .00, .1) immediately for outgoing/fromMe private chat messages!
                        if (msg.key.fromMe && !jid.endsWith("@g.us")) {
                            const rawContent = getReadableMessageContent(msg.message);
                            const controlCommand = parseCustomerReplyControlCommand(rawContent.text);
                            if (controlCommand) {
                                const primaryTarget = canonicalIdentity.canonicalJid || jid;
                                const profile = await dbService.getCustomerProfile(dataOwnerKey, primaryTarget).catch(() => null)
                                    || (canonicalIdentity.lidJid ? await dbService.getCustomerProfile(dataOwnerKey, canonicalIdentity.lidJid).catch(() => null) : null);

                                const controlResult = await applyReplyControlCommand({
                                    dataOwnerKey,
                                    primaryJid: primaryTarget,
                                    altJid: canonicalIdentity.lidJid || altJid,
                                    profile: profile || {},
                                    command: controlCommand,
                                    source: "direct chat shortcode",
                                });

                                const shortcutText = rawContent.text.trim();
                                const targetDisplayName = buildCustomerDisplayName({
                                    jid: primaryTarget,
                                    profile: profile || {},
                                    fallback: canonicalIdentity.displayJid,
                                });

                                await dbService.saveMessage(dataOwnerKey, jid, "model", shortcutText, msg.key.id, undefined, getActualInstanceMeta()).catch(() => {});
                                io.emit("whatsapp-message", {
                                    from: jid,
                                    text: shortcutText,
                                    isFromMe: true,
                                    timestamp: Date.now(),
                                });
                                if (controlResult?.success !== false) {
                                    const effectiveDesc = controlCommand.action === "resume" ? "Effective reply state: active." : describeCustomerReplyControl(controlCommand);
                                    io.emit("system-log", {
                                        type: "info",
                                        msg: `Owner shortcut ${shortcutText} applied for ${targetDisplayName}. ${effectiveDesc}`,
                                    });
                                }
                                continue;
                            }
                        }

                        if (msg.message && isCustomerChatJid(jid)) {
                            const ledgerChanged = appendMessageToConversationLedger(localStore, jid, msg, {
                                limit: CUSTOMER_CONVERSATION_LEDGER_LIMIT
                            });
                            if (ledgerChanged) saveLocalStore();
                        }

                        if (!msg.key.fromMe && isCustomerChatJid(jid)) {
                            const currentBotId = process.env.BOT_ID || dataOwnerKey;
                            cancelAutoFollowupOnCustomerReply(currentBotId, jid, msg.key?.id);
                            supersedeAiReplyRetriesForCustomer(pendingAiReplyRetries, {
                                botId: currentBotId,
                                jid,
                                latestMessageId: String(msg.key?.id || ""),
                            });
                            const earlyReadableContent = getReadableMessageContent(msg.message);
                            const existingProfileRaw = await dbService.getCustomerProfile(dataOwnerKey, jid);
                            const existingProfile = (await hydrateSharedPhoneForCustomer({
                                dataOwnerKey,
                                jid,
                                profile: existingProfileRaw || {},
                                linkedJids: [altJid],
                            }).catch(() => ({ profile: existingProfileRaw || {} }))).profile;
                            const senderDisplayName = buildCustomerDisplayName({ jid, profile: existingProfile, pushName: msg.pushName });
                            const requestedAt = Number(existingProfile?.phoneNumberRequestedAt || 0);
                            const wasRequested = requestedAt > 0 && Math.floor(Date.now() / 1000) - requestedAt <= PHONE_NUMBER_SHARE_WINDOW_SECONDS;
                            const sharedPhone = extractSharedPhoneNumber(msg) || (wasRequested ? extractPhoneNumberFromText(earlyReadableContent.text) : "");
                            if (sharedPhone) {
                                if (isNativePhoneNumberShareMessage(msg) || wasRequested) {
                                    await saveSharedPhoneNumberConsent({
                                        io,
                                        jid,
                                        dataOwnerKey,
                                        phone: sharedPhone,
                                        messageId: msg.key.id,
                                        senderName: senderDisplayName
                                    });
                                    io.emit("whatsapp-message", {
                                        from: jid,
                                        senderName: senderDisplayName,
                                        text: "[Shared WhatsApp number]",
                                        isFromMe: false,
                                        timestamp: Date.now()
                                    });
                                    continue;
                                }
                            }
                        }

                        // 0. Exact Control Command Detection (Reset) strictly BEFORE template indexing
                        if (jid.endsWith("@g.us")) {
                            const rawControlText = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";
                            if (isExactResetCommand(rawControlText)) {
                                if (isTemplateGroupJid(jid)) {
                                    const senderJid = msg.key?.participant || msg.key?.remoteJid || "";
                                    const isAuth = isAuthorizedResetSender({
                                        fromMe: Boolean(msg.key?.fromMe),
                                        senderJid,
                                        adminNumber: (botConfig as any)?.admin_number || (botConfig as any)?.adminNumber,
                                        adminVerifiedPhone: (botConfig as any)?.admin_verified_phone,
                                    });
                                    if (isAuth) {
                                        console.log(`[Reset] Authorized WhatsApp reset received in ${jid} from ${senderJid}`);
                                        await executeGroupReset(jid, "whatsapp");
                                        try {
                                            if (sock && msg.key?.id) {
                                                await sock.sendMessage(jid, { react: { text: "🔄", key: msg.key } });
                                            }
                                        } catch (reactErr) {
                                            console.warn("[Reset] Failed sending reaction acknowledgment:", reactErr);
                                        }
                                    } else {
                                        console.log(`[Reset] Unauthorized reset command ignored in ${jid} from ${senderJid}`);
                                    }
                                }
                                // Control command must never be indexed as template or sequence text
                                continue;
                            }
                        }

                        // 1. Template Indexing Logic (for group messages)
                        if (jid.endsWith("@g.us")) {
                            const isTemplate = isTemplateGroupJid(jid);
                            if (isTemplate) {
                                // Follow Developer Guide: Intercept if isSyncingTemplates is active or if it's an auto-sync group
                                const matchedConfig: any = botConfig?.groups?.find((g: any) => g.jid === jid);
                                const isEnabled = matchedConfig ? matchedConfig.enabled !== false : true;
                                const isAutoSync = matchedConfig?.autoSync !== false;
                                const purpose = getTemplateGroupPurpose(jid);
                                if (!isEnabled || (!isSyncingTemplates && !isAutoSync) || !hasTemplatePayload(msg, purpose)) {
                                    // Skip indexing but don't exit entirely
                                } else {
                                if (!localStore[jid]) localStore[jid] = [];
                                const exists = localStore[jid].some((existing: any) => existing.key?.id === msg.key?.id);
                                if (!exists) {
                                    localStore[jid].push(msg);
                                    saveLocalStore();
                                    await loadTemplates();
                                    io.emit("system-log", { type: "info", msg: `✨ New template matched and indexed from group.` });
                                }
                                }
                            }

                            // Keep history bounded for groups (for RAM)
                            if (!localStore[jid]) localStore[jid] = [];
                            const groupLimit = isTemplate ? TEMPLATE_CONVERSATION_LEDGER_LIMIT : GROUP_CONVERSATION_LEDGER_LIMIT;
                            if (localStore[jid].length > groupLimit) {
                                localStore[jid] = localStore[jid].slice(-groupLimit);
                            }
                        }

                        // 2. Core Message Handling Logic
                        if (!msg.message) continue;

                        const rawText = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";

                        // Check for AI Group Workspace binding before template / unmanaged group check
                        if (jid.endsWith("@g.us")) {
                            const wsOwnerId = process.env.USER_ID || process.env.ACCOUNT_ID || (botConfig as any)?.user_id || (botConfig as any)?.accountId || "";
                            const activeWsBinding = await findActiveBindingForGroup(wsOwnerId, jid);
                            if (activeWsBinding) {
                                const senderJid = msg.key?.participant || msg.key?.remoteJid || "";
                                const senderPhone = senderJid.split("@")[0].replace(/\D/g, "");
                                const adminPhone = String((botConfig as any)?.admin_number || (botConfig as any)?.adminNumber || "").replace(/\D/g, "");
                                const isOwnerMsg = Boolean(adminPhone && senderPhone && (senderPhone === adminPhone || senderPhone.endsWith(adminPhone) || adminPhone.endsWith(senderPhone)));
                                console.log(`[Workspace] Ingesting message ${msg.key?.id} for group ${jid} (Workspace: ${activeWsBinding.workspaceId}, fromMe: ${msg.key?.fromMe}, isOwner: ${isOwnerMsg})`);
                                await ingestGroupMessage({
                                    accountId: activeWsBinding.accountId || wsOwnerId,
                                    instanceId: process.env.BOT_ID || "",
                                    groupJid: jid,
                                    whatsappMessageId: msg.key?.id || `wamid_${Date.now()}`,
                                    senderJid,
                                    senderDisplayName: (msg as any).pushName || "",
                                    timestamp: Number(msg.messageTimestamp) * 1000 || Date.now(),
                                    messageType: "text",
                                    textContent: rawText || "",
                                    quotedMessageId: msg.message?.extendedTextMessage?.contextInfo?.stanzaId,
                                    isFromMe: Boolean(msg.key?.fromMe),
                                    isOwner: isOwnerMsg,
                                    mentionedJids: msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [],
                                    transportSendFn: async (toJid: string, text: string) => {
                                        if (sock && connectionStatus === "connected") {
                                            await sock.sendMessage(toJid, { text });
                                        }
                                    },
                                }).catch((e) => console.error("[Workspace Ingest] failed:", e?.message || e));
                                continue;
                            }
                        }

                        const isTemplateChat = isTemplateGroupJid(jid);
                        if (jid.endsWith("@g.us") && (isTemplateChat || !isEnabledFlag(botConfig.reply_in_groups))) {
                            continue;
                        }

                        // Populate localStore for all chats (except if already pushed and bounded as template above)
                        const isTemplateOuter = isTemplateGroupJid(jid);
                        const chatLimit = isTemplateOuter
                            ? TEMPLATE_CONVERSATION_LEDGER_LIMIT
                            : (jid.endsWith("@g.us") ? GROUP_CONVERSATION_LEDGER_LIMIT : CUSTOMER_CONVERSATION_LEDGER_LIMIT);
                        const ledgerChanged = appendMessageToConversationLedger(localStore, jid, msg, { limit: chatLimit });
                        if (ledgerChanged) saveLocalStore();

                        const readableContent = getReadableMessageContent(msg.message);
                        const content = readableContent.content;
                        let textContent = readableContent.text;
                        const hasAudio = readableContent.hasAudio;
                        const hasSticker = readableContent.hasSticker;
                        const hasMedia = readableContent.hasMedia;

                        if (isIgnorableWhatsappMessage(msg)) {
                            localStore[jid] = (localStore[jid] || []).filter((m: any) => m.key?.id !== msg.key?.id);
                            saveLocalStore();
                            continue;
                        }

                        const adminGuidance = buildAdminGuidanceAction({
                            fromJid: altJid || jid,
                            message: msg.message,
                            text: textContent,
                            userConfig: botConfig,
                        });
                        if ((adminGuidance as any).isAdminGuidance) {
                            const targetJid = (adminGuidance as any).targetJid;
                            if (!targetJid) {
                                io.emit("system-log", { type: "warning", msg: "Admin replied to an alert, but the customer chat could not be resolved. Future alerts include the raw chat ID for recovery." });
                                continue;
                            }
                            const dataOwnerKey = await resolveAccountDataOwnerKey(process.env.USER_ID, sock.user.id.split(":")[0] + "@s.whatsapp.net");
                            const targetProfile = await dbService.getCustomerProfile(dataOwnerKey, targetJid).catch(() => ({}));
                            const targetName = buildCustomerDisplayName({ jid: targetJid, profile: targetProfile });
                            const directReply = String((adminGuidance as any).directReply || "").trim();
                            const controlCommand = parseCustomerReplyControlCommand(String((adminGuidance as any).instruction || directReply || "").trim());
                            if (controlCommand) {
                                await applyReplyControlCommand({
                                    dataOwnerKey,
                                    primaryJid: targetJid,
                                    profile: targetProfile || {},
                                    command: controlCommand,
                                    source: "admin alert shortcode",
                                });
                                continue;
                            }

                            if (directReply) {
                                const access = await assertCustomerFacingSendAllowed({
                                    userId: process.env.USER_ID,
                                    context: "admin_guidance_direct_reply",
                                    customerJid: targetJid,
                                    io,
                                    logger: console,
                                });
                                if (!access.allowed) {
                                    continue;
                                }
                                const sent = await sock.sendMessage(targetJid, { text: directReply });
                                if (sent?.key?.id) botSentMessageIds.add(sent.key.id);
                                await dbService.saveMessage(dataOwnerKey, targetJid, "model", directReply, sent?.key?.id, undefined, getActualInstanceMeta());
                                await dbService.updateCustomerProfile(dataOwnerKey, targetJid, {
                                    ...buildCustomerAiResumePatch(),
                                    ...buildCustomerReplyControlPatch({ action: "resume" }),
                                }).catch(() => {});
                                io.emit("whatsapp-message", {
                                    from: targetJid,
                                    senderName: targetName,
                                    text: directReply,
                                    isFromMe: true,
                                    timestamp: Date.now()
                                });
                                io.emit("system-log", { type: "info", msg: `Admin guidance sent a direct reply to ${targetName}.` });
                            } else {
                                const instruction = String((adminGuidance as any).instruction || "").trim();
                                const existingInstructions = String(targetProfile?.customerInstructions || "").trim();
                                const nextInstructions = [
                                    existingInstructions,
                                    `Admin guidance (${new Date().toISOString()}): ${instruction}`
                                ].filter(Boolean).join("\n").slice(-3000);
                                await dbService.updateCustomerProfile(dataOwnerKey, targetJid, {
                                    customerInstructions: nextInstructions,
                                    ...buildCustomerAiResumePatch(),
                                    ...buildCustomerReplyControlPatch({ action: "resume" }),
                                });
                                io.emit("system-log", { type: "info", msg: `Admin guidance saved for ${targetName}. AI will use it in the next reply.` });
                            }
                            continue;
                        }

                        let userExtraConfig: any = null;
                        let accountUserConfig: any = null;
                        try {
                            if (process.env.USER_ID) {
                                [userExtraConfig, accountUserConfig] = await Promise.all([
                                    dbService.getUserExtraConfig(process.env.USER_ID).catch(() => null),
                                    dbService.loadUserConfig(process.env.USER_ID).catch(() => null),
                                ]);
                            }
                        } catch {}
                        const authoritativeAccountConfig = { ...(accountUserConfig || {}), ...(userExtraConfig || {}) };

                        const trimmedText = (textContent || "").trim();
                        if (!isPersonalInstance(botConfig)) {
                            const isPairingCmd = /^(?:PAIR|VERIFY|\/PAIR|\/VERIFY)\s+([0-9A-Za-z-]+)$/i.test(trimmedText) || (/^\d{6}$/.test(trimmedText) && !msg.key.fromMe);

                            if (isPairingCmd && !msg.key.fromMe) {
                                const submittedCode = trimmedText.replace(/^(?:PAIR|VERIFY|\/PAIR|\/VERIFY)\s*/i, "").trim();
                                const pairingOutcome = await verifyAdminPairingChallenge(
                                    process.env.USER_ID || "",
                                    altJid || jid,
                                    submittedCode,
                                    botConfig
                                );
                                if (pairingOutcome.success) {
                                    console.log(`[BotWorker] Admin WhatsApp pairing succeeded for ${jid}.`);
                                    await sock.sendMessage(jid, {
                                        text: "✅ *Business Assistant Paired Successfully!*\n\nYour WhatsApp number is now verified as the authorized Administrator for this business. You can now send commands, request sales reports, manage reminders, and trigger instance tools."
                                    });
                                } else if (pairingOutcome.reason === "invalid_code") {
                                    await sock.sendMessage(jid, {
                                        text: `❌ *Pairing Verification Failed*\n\nInvalid pairing code (${pairingOutcome.attemptsRemaining ?? 0} attempts remaining). Please check the code on your BlackArrow dashboard.`
                                    });
                                } else if (pairingOutcome.reason === "phone_mismatch") {
                                    await sock.sendMessage(jid, {
                                        text: `❌ *Pairing Verification Failed*\n\nThis WhatsApp number is not recognized as the designated Admin phone. Please ensure you are sending the code from the number configured in your dashboard.`
                                    });
                                } else if (pairingOutcome.reason === "challenge_expired") {
                                    await sock.sendMessage(jid, {
                                        text: `❌ *Pairing Code Expired*\n\nThe pairing code has expired. Please generate a new code from the Business Assistant dashboard.`
                                    });
                                } else {
                                    await sock.sendMessage(jid, {
                                        text: `❌ *Pairing Failed*\n\n${pairingOutcome.message || "No active pairing challenge found. Please generate a code on your BlackArrow dashboard."}`
                                    });
                                }
                                continue;
                            }

                            const adminIdentityResult = resolveAdminIdentityContext({
                                fromJid: altJid || jid,
                                altJid: altJid && altJid !== jid ? altJid : undefined,
                                botConfig,
                                userConfig: authoritativeAccountConfig || botConfig,
                                accountId: process.env.USER_ID,
                                botId: process.env.BOT_ID,
                            });

                            if (adminIdentityResult.isAuthorizedAdmin && adminIdentityResult.context && !msg.key.fromMe) {
                                void scheduleOrExecuteReadReceipt({
                                    instanceId: process.env.BOT_ID || "default",
                                    chatJid: jid,
                                    messageKey: msg.key,
                                    config: botConfig,
                                    accountConfig: authoritativeAccountConfig,
                                    readExecutor: async (keys) => {
                                        try { await sock.readMessages(keys); } catch(e) {}
                                    },
                                });
                                console.log(`[BotWorker] Authorized Admin Business Assistant message received from ${jid}.`);
                                let adminInputText = textContent;
                                if (!adminInputText && hasAudio) {
                                    const audioMsg = (msg.message as any)?.audioMessage || (content as any)?.audioMessage;
                                    adminInputText = audioMsg?.transcript || audioMsg?.text || audioMsg?.caption || "overview";
                                }
                                await handleAdminBusinessAssistantMessage({
                                    sock,
                                    context: adminIdentityResult.context,
                                    rawMessage: msg,
                                    text: adminInputText || "",
                                    botSentMessageIds,
                                    io,
                                    emitLiveConsoleEvent,
                                });
                                continue;
                            }
                        }

                        if (msg.key.fromMe) {
                            const manualInsight = getManualMessageInsight(msg);
                            const controlCommand = parseCustomerReplyControlCommand(manualInsight.text);
                            if (controlCommand && !jid.endsWith("@g.us")) {
                                const myJid = getMyJid(sock);
                                const dataOwnerKey = await resolveAccountDataOwnerKey(process.env.USER_ID, myJid);
                                const profile = await dbService.getCustomerProfile(dataOwnerKey, jid).catch(() => null);
                                await applyReplyControlCommand({
                                    dataOwnerKey,
                                    primaryJid: jid,
                                    altJid,
                                    profile: profile || {},
                                    command: controlCommand,
                                    source: "direct chat shortcode",
                                });
                                continue;
                            }
                            const programmaticOutbound = isProgrammaticOutboundMessage(msg, botSentMessageIds) || currentlyReplying.has(jid);
                            if (!programmaticOutbound && !jid.endsWith("@g.us") && manualInsight.hasMeaningfulContent) {
                                const myJid = getMyJid(sock);
                                const dataOwnerKey = await resolveAccountDataOwnerKey(process.env.USER_ID, myJid);
                                const existingProf = await dbService.getCustomerProfile(dataOwnerKey, jid).catch(() => null);
                                const stopState = getCustomerAutoReplyStopState(existingProf || {});
                                if (!stopState.isStopped || (stopState.kind !== "admin_pause_temp" && stopState.kind !== "admin_pause_permanent")) {
                                    await dbService.updateCustomerProfile(dataOwnerKey, jid, buildCustomerAiResumePatch()).catch(() => {});
                                }

                                const forceTriggered = await forceMissedReplyFromShortcut(jid, msg, manualInsight.text);
                                if (forceTriggered) {
                                    console.log(`[Bot] Manual comma recovery shortcut triggered for ${jid}.`);
                                    continue;
                                }

                                const shortcutMatched = await processShortcut(
                                    createTrackedWhatsAppSocket(sock, botSentMessageIds),
                                    jid,
                                    msg.pushName || jid,
                                    msg,
                                    manualInsight.text,
                                    cachedKeywordSequences,
                                    simulateTyping,
                                    forwardTemplate,
                                    pendingResponses,
                                    currentlyReplying,
                                    io,
                                    { templates: cachedWelcomeTemplates, config: (botConfig?.groups || []).find((g: any) => g?.purpose === 'welcome') }
                                );
                                if (shortcutMatched) {
                                    console.log(`[Bot] Manual shortcut triggered for ${jid}: ${manualInsight.text}`);
                                    continue;
                                }
                                const learningText = manualInsight.kind === "text"
                                    ? manualInsight.text
                                    : await describeManualMediaMessage(msg, manualInsight.text, (sock as any).fetchAgent, {
                                        userId: process.env.USER_ID,
                                        accountId: process.env.USER_ID,
                                        dataOwnerKey: myJid,
                                        botId: process.env.BOT_ID || myJid,
                                        purpose: `manual_${manualInsight.kind}_context`,
                                        billingContext: {
                                            customerJid: jid,
                                            eventId: String(msg.key.id || Date.now()),
                                        },
                                    });
                                learnFromManualOutboundMessage({
                                    sock,
                                    botConfig,
                                    io,
                                    jid,
                                    text: learningText,
                                    kind: manualInsight.kind,
                                    senderName: msg.pushName || jid,
                                    messageId: msg.key.id,
                                    userId: process.env.USER_ID,
                                    botId: process.env.BOT_ID,
                                }).catch((e) => console.error("[ManualLearning] WhatsApp manual message failed:", e));
                            }
                            console.log(`[Bot] Ignoring message from myself: ${msg.key.id}`);
                            continue;
                        }
                        
                        // Mark as read (or schedule delayed read receipt)
                        if (!msg.key.fromMe) {
                            void scheduleOrExecuteReadReceipt({
                                instanceId: process.env.BOT_ID || "default",
                                chatJid: jid,
                                messageKey: msg.key,
                                config: botConfig,
                                accountConfig: authoritativeAccountConfig,
                                readExecutor: async (keys) => {
                                    try {
                                        await sock.readMessages(keys);
                                    } catch(e) {}
                                },
                            });
                        }

                        const visibleSenderName = buildCustomerDisplayName({ jid, pushName: msg.pushName });
                        console.log(`[Bot] Message received from ${visibleSenderName}. Text: "${textContent.substring(0, 30)}", Audio: ${hasAudio}, Media: ${hasMedia}`);
                        emitLiveConsoleEvent({
                            type: "inbound_message_received",
                            level: "info",
                            scope: "bot",
                            accountId: process.env.USER_ID,
                            botId: process.env.BOT_ID,
                            customerJid: jid,
                            title: "Inbound message received",
                            message: hasAudio ? "Customer sent a voice message." : hasMedia ? "Customer sent media." : "Customer sent a text message.",
                            metadata: { hasAudio, hasMedia, messageId: msg.key?.id || "" },
                        });
                        
                        io.emit("system-log", {
                            type: "info",
                            msg: `📩 Message from ${visibleSenderName}: ${textContent || (hasAudio ? "Voice Message" : (hasMedia ? "Media" : "Empty Message"))}`,
                            details: { sender: jid, hasAudio, hasMedia }
                        });

                        if (hasSticker && !textContent) {
                            textContent = "Customer sent a sticker reaction.";
                        }
                        if (hasAudio) {
                            const audioMessage: any = (msg.message as any)?.audioMessage || {};
                            textContent = buildVoiceNoteHistoryText({
                                transcript: audioMessage.transcript,
                                text: audioMessage.text,
                                caption: audioMessage.caption,
                            });
                        }
                        
                        if (textContent || hasAudio || hasMedia) {
                            const dataOwnerKey = await resolveAccountDataOwnerKey(process.env.USER_ID, sock.user.id.split(":")[0] + "@s.whatsapp.net");
                            await ensureAiReplyRetryQueueLoaded();
                            const superseded = supersedeAiReplyRetriesForCustomer(pendingAiReplyRetries, {
                                botId: dataOwnerKey,
                                jid,
                                latestMessageId: String(msg.key?.id || ""),
                            }, getMessageTimestampSeconds(msg) * 1000);
                            if (superseded.length > 0) {
                                await persistAiReplyRetryQueue();
                                io.emit("system-log", { type: "info", msg: `pending_ai_reply_merged_new_message: ${jid.split("@")[0]} latestCustomerAt=${getMessageTimestampSeconds(msg)}.` });
                            }
                            const existingCustomerProfileRaw = await dbService.getCustomerProfile(dataOwnerKey, jid) || {};

                            const profilePatch: any = {};
                            if (msg.pushName) {
                              profilePatch.pushName = msg.pushName;
                              profilePatch.whatsappProfile = {
                                displayName: msg.pushName,
                                pushName: msg.pushName,
                                notifyName: msg.pushName,
                                source: "whatsapp_inbound_pushname",
                                syncedAt: Date.now()
                              };
                            }
                            if (jid.endsWith("@s.whatsapp.net")) {
                              profilePatch.phoneJid = jid;
                              profilePatch.phone = jid.split("@")[0];
                              profilePatch.whatsapp_number = jid.split("@")[0];
                            }
                            if (altJid && altJid.endsWith("@s.whatsapp.net")) {
                              profilePatch.phoneJid = altJid;
                              profilePatch.phone = altJid.split("@")[0];
                              profilePatch.whatsapp_number = altJid.split("@")[0];
                            }
                            if (altJid && jid.endsWith("@lid")) {
                              profilePatch.lidJid = jid;
                            }

                            if (Object.keys(profilePatch).length > 0) {
                              await dbService.updateCustomerProfile(dataOwnerKey, jid, profilePatch).catch(() => {});
                              Object.assign(existingCustomerProfileRaw, profilePatch);
                            }

                            const existingCustomerProfile = (await hydrateSharedPhoneForCustomer({
                                dataOwnerKey,
                                jid,
                                profile: existingCustomerProfileRaw || {},
                                linkedJids: [altJid],
                            }).catch(() => ({ profile: existingCustomerProfileRaw || {} }))).profile;
                            const customerDisplayName = buildCustomerDisplayName({ jid, profile: existingCustomerProfile, pushName: msg.pushName });
                            const savedIncomingText = textContent || (hasAudio ? "Voice note received, transcript unavailable" : (hasSticker ? "Customer sent a sticker reaction." : "Media"));
                            await dbService.saveMessage(dataOwnerKey, jid, "user", savedIncomingText, msg.key.id, customerDisplayName, getActualInstanceMeta()).catch(() => {});
                            let effectiveCustomerProfile = { ...(existingCustomerProfile || {}) };
                            emitLiveConsoleEvent({
                                type: "message_saved",
                                level: "success",
                                scope: "bot",
                                accountId: process.env.USER_ID,
                                botId: dataOwnerKey,
                                customerJid: jid,
                                title: "Message saved",
                                message: "Inbound customer message saved to chat history.",
                                metadata: { messageId: msg.key?.id || "" },
                            });
                            if (isPersonalInstance(botConfig)) {
                                let resolvedPersonalContact: any = null;
                                let isNewContact = false;
                                if (process.env.USER_ID) {
                                    const ingestRes = await ingestPersonalContactInboundMessage(process.env.USER_ID, botConfig, {
                                        remoteJid: jid,
                                        pushName: msg.pushName,
                                        text: savedIncomingText,
                                        timestamp: typeof msg.messageTimestamp === "number" ? msg.messageTimestamp : undefined,
                                        remoteJidAlt: (msg.key as any)?.remoteJidAlt || (msg as any)?.remoteJidAlt,
                                        participant: (msg.key as any)?.participant,
                                        participantAlt: (msg.key as any)?.participantAlt || (msg as any)?.participantAlt,
                                        senderPn: (msg.key as any)?.senderPn || (msg as any)?.senderPn,
                                        participantPn: (msg.key as any)?.participantPn || (msg as any)?.participantPn,
                                    }).catch((err) => {
                                        console.warn("[PersonalContact] Inbound ingestion failed:", err?.message || err);
                                        return null;
                                    });
                                    resolvedPersonalContact = ingestRes?.contact || null;
                                    isNewContact = Boolean(ingestRes?.isNew);
                                }
                                io.emit("whatsapp-message", {
                                    from: jid,
                                    senderName: resolvedPersonalContact?.displayName || customerDisplayName,
                                    text: textContent || (hasAudio ? "🎤 Voice Message" : "📦 Media"),
                                    isFromMe: Boolean(msg.key?.fromMe),
                                    timestamp: Date.now()
                                });

                                if (process.env.USER_ID) {
                                    const missionRoute = await routePersonalInboundMessage({
                                        tenantId: process.env.USER_ID,
                                        personalInstanceId: (botConfig as any)?.$id || (botConfig as any)?.bot_id || dataOwnerKey,
                                        remoteJid: jid,
                                        messageId: msg.key?.id || `pmsg_${Date.now()}`,
                                        textContent: savedIncomingText,
                                        contact: resolvedPersonalContact,
                                        sock,
                                    }).catch((err) => {
                                        console.error("[PersonalOutboundRouting] Baileys error:", err?.message || err);
                                        return { handled: false };
                                    });

                                    if (!missionRoute.handled) {
                                        await handleIncomingPersonalAssistantMessage({
                                            tenantId: process.env.USER_ID,
                                            botConfig,
                                            remoteJid: jid,
                                            messageId: msg.key?.id || `pmsg_${Date.now()}`,
                                            textContent: savedIncomingText,
                                            isFromMe: Boolean(msg.key?.fromMe),
                                            pushName: msg.pushName,
                                            hasAudio,
                                            hasImage: Boolean((msg.message as any)?.imageMessage),
                                            hasMedia: Boolean(hasMedia),
                                            contact: resolvedPersonalContact,
                                            isNewContact,
                                            sock,
                                            botSentMessageIds,
                                            io,
                                            emitLiveConsoleEvent,
                                        }).catch((err) => {
                                            console.error("[PersonalAssistant] Message handling error:", err?.message || err);
                                        });
                                    }
                                }
                                continue;
                            }
                            const aiChatReplyMode = resolveBotAiChatReplyMode(botConfig);
                            if (!aiChatReplyMode.enabled) {
                                io.emit("whatsapp-message", {
                                    from: jid,
                                    senderName: customerDisplayName,
                                    text: textContent || (hasAudio ? "Voice Message" : "Media"),
                                    isFromMe: false,
                                    timestamp: Date.now(),
                                });
                                let welcomeMatched = false;
                                let shortcutMatched = false;
                                const runtimeWelcome = resolveRuntimeWelcomePayload(botConfig, cachedWelcomeTemplates);
                                if (!getSequenceStatusBlockReason(effectiveCustomerProfile)) {
                                    welcomeMatched = await processAutomaticWelcomeSequence(
                                        createTrackedWhatsAppSocket(sock, botSentMessageIds),
                                        jid,
                                        customerDisplayName,
                                        msg,
                                        runtimeWelcome || undefined,
                                        localStore[jid] || [],
                                        simulateTyping,
                                        forwardTemplate,
                                        pendingResponses,
                                        currentlyReplying,
                                        io,
                                    );
                                    if (!welcomeMatched) {
                                        shortcutMatched = await processShortcut(
                                            createTrackedWhatsAppSocket(sock, botSentMessageIds),
                                            jid,
                                            customerDisplayName,
                                            msg,
                                            textContent,
                                            cachedKeywordSequences,
                                            simulateTyping,
                                            forwardTemplate,
                                            pendingResponses,
                                            currentlyReplying,
                                            io,
                                            runtimeWelcome || undefined,
                                        );
                                    }
                                }
                                const messageType = hasAudio ? "audio" : (msg.message as any)?.imageMessage ? "image" : (msg.message as any)?.videoMessage ? "video" : (msg.message as any)?.documentMessage ? "document" : "text";
                                console.log(`ai_chat_reply_skipped reason=disabled messageType=${messageType} sequenceMatched=${welcomeMatched} shortcutMatched=${shortcutMatched}`);
                                continue;
                            }
                            const plannedUpdate = parsePlannedCustomerUpdate(savedIncomingText, Math.floor(Date.now() / 1000));
                            if (plannedUpdate) {
                                await dbService.saveCustomerPlannedUpdate(dataOwnerKey, jid, plannedUpdate).catch((e: any) => {
                                    console.error("[PlannedUpdates] Failed saving customer update:", e?.message || e);
                                });
                                io.emit("system-log", { type: "info", msg: `Planned customer follow-up saved for ${customerDisplayName}.` });
                            }
                            if (process.env.USER_ID && savedIncomingText) {
                                const products = await dbService.listProducts(process.env.USER_ID).catch(() => []);
                                await maybeSaveBackInStockReminder({
                                    products,
                                    latestText: savedIncomingText,
                                    history: localStore[jid] || [],
                                    dataOwnerKey,
                                    customerJid: jid,
                                    io,
                                }).catch((e: any) => {
                                    console.error("[Stock] Failed saving stock reminder from message:", e?.message || e);
                                });
                            }
                            const stopState = getCustomerAutoReplyStopState(
                                existingCustomerProfile || {},
                                Math.floor(Date.now() / 1000),
                                {
                                    jid,
                                    altJid: altJid || existingCustomerProfile?.phoneJid || existingCustomerProfile?.phoneNumber || existingCustomerProfile?.whatsapp_number,
                                    mutedNumbers: botConfig.muted_numbers || [],
                                }
                            );
                            if (stopState.isStopped) {
                                io.emit("whatsapp-message", {
                                    from: jid,
                                    senderName: customerDisplayName,
                                    text: textContent || (hasAudio ? "🎤 Voice Message" : "📦 Media"),
                                    isFromMe: false,
                                    timestamp: Date.now()
                                });
                                io.emit("system-log", { type: "info", msg: `Auto-reply skipped for ${customerDisplayName}: ${stopState.message || "auto-reply is stopped"}.` });
                                emitLiveConsoleEvent({
                                    type: "ai_skipped",
                                    level: "warn",
                                    scope: "bot",
                                    accountId: process.env.USER_ID,
                                    botId: dataOwnerKey,
                                    customerJid: jid,
                                    title: "AI skipped",
                                    message: "Auto-reply skipped for customer.",
                                    reason: (stopState as any).reason || (stopState.kind === "admin_pause_temp" ? "customer_paused_temp" : stopState.kind === "admin_pause_permanent" ? "customer_paused_permanent" : (stopState.message || "customer_paused")),
                                });
                                continue;
                            }
                            if (isCustomerAiPaused(existingCustomerProfile || {})) {
                                io.emit("whatsapp-message", {
                                    from: jid,
                                    senderName: customerDisplayName,
                                    text: textContent || (hasAudio ? "🎤 Voice Message" : "📦 Media"),
                                    isFromMe: false,
                                    timestamp: Date.now()
                                });
                                io.emit("system-log", { type: "info", msg: `Skipped reply because manual review is required for ${customerDisplayName}.` });
                                emitLiveConsoleEvent({
                                    type: "ai_skipped",
                                    level: "warn",
                                    scope: "bot",
                                    accountId: process.env.USER_ID,
                                    botId: dataOwnerKey,
                                    customerJid: jid,
                                    title: "AI skipped",
                                    message: "Manual review is required before replying.",
                                    reason: "manual_review_required",
                                });
                                continue;
                            }
                            const accountConfigForIrrelevant = process.env.USER_ID ? await dbService.loadUserConfig(process.env.USER_ID).catch(() => null) : null;
                            const irrelevantHandled = await handleIrrelevantCustomer({
                                sock: createTrackedWhatsAppSocket(sock, botSentMessageIds),
                                userConfig: { ...(accountConfigForIrrelevant || {}), ...(botConfig || {}) },
                                userId: process.env.USER_ID,
                                dataOwnerKey,
                                sender: jid,
                                latestText: savedIncomingText || textContent,
                                profile: effectiveCustomerProfile || {},
                                language: String(accountConfigForIrrelevant?.preferredLanguage || botConfig?.preferredLanguage || "").toLowerCase().includes("english") ? "english" : "roman_urdu",
                                io,
                            });
                            if (irrelevantHandled) {
                                io.emit("system-log", { type: "warning", msg: `Skipped reply for ${customerDisplayName} because manual review is required.` });
                                emitLiveConsoleEvent({
                                    type: "ai_reply_skipped",
                                    level: "warn",
                                    scope: "bot",
                                    accountId: process.env.USER_ID,
                                    botId: dataOwnerKey,
                                    customerJid: jid,
                                    title: "AI reply skipped",
                                    message: "Customer was routed to manual review.",
                                    reason: "manual_review_required",
                                });
                                continue;
                            }
                            const recentDbHistory = await dbService.getChatHistory(dataOwnerKey, jid, 5).catch(() => []);
                            const recentLocalHistory = (localStore[jid] || []).slice(-5).map((localMsg: any) => {
                                const readable = getReadableMessageContent(localMsg.message);
                                return {
                                    messageId: localMsg.key?.id,
                                    role: localMsg.key?.fromMe ? "model" : "user",
                                    text: readable.text || (readable.hasAudio ? "Voice Message" : (readable.hasMedia ? "Media" : "")),
                                    timestamp: getMessageTimestampSeconds(localMsg)
                                };
                            });
                            const phoneRequestDecision = getPhoneNumberRequestDecision({
                                jid,
                                profile: existingCustomerProfile || {},
                                text: savedIncomingText,
                                recentHistory: [...recentDbHistory, ...recentLocalHistory]
                            });
                            if (phoneRequestDecision.shouldRequest) {
                                await sendPhoneNumberRequestIfNeeded({
                                    sock,
                                    io,
                                    botSentMessageIds,
                                    userId: process.env.USER_ID,
                                    jid,
                                dataOwnerKey,
                                profile: effectiveCustomerProfile || {}
                                }).catch((e: any) => {
                                    console.error("[PhoneNumberRecovery] Request failed:", e?.message || e);
                                });
                            }
                            
                            io.emit("whatsapp-message", { 
                                from: jid, 
                                senderName: customerDisplayName,
                                text: textContent || (hasAudio ? "🎤 Voice Message" : "📦 Media"), 
                                isFromMe: false, 
                                timestamp: Date.now() 
                            });

                            // Sequence Status Guard: block new sequence sends without blocking normal AI support.
                            const customerProfile = effectiveCustomerProfile || await dbService.getCustomerProfile(dataOwnerKey, jid);
                            const courierApi = normalizeCourierApi(customerProfile?.courierCompany);
                            if (
                                courierApi === "dhl" &&
                                customerProfile?.trackingId &&
                                looksLikeTrackingQuestion(savedIncomingText || textContent)
                            ) {
                                try {
                                    const dhlConfig = buildDhlTrackingConfig(accountConfigForIrrelevant || {});
                                    const dhlTracking = await shippingService.trackDhlShipment(String(customerProfile.trackingId), dhlConfig);
                                    dhlTracking.customerPhone = customerProfile?.customerPhone || customerProfile?.phone || "";
                                    dhlTracking.customerName = customerProfile?.customerName || customerProfile?.name || "";
                                    await persistTrackingState(process.env.USER_ID || "", dataOwnerKey, String(customerProfile.trackingId), "dhl", dhlTracking, jid, false);
                                } catch (trackingError: any) {
                                    io.emit("system-log", { type: "warning", msg: `[DHL] Tracking refresh skipped for ${customerDisplayName}: ${trackingError?.userMessage || trackingError?.message || "unknown error"}` });
                                }
                            }
                            const sequenceBlockReason = getSequenceStatusBlockReason(customerProfile);
                            if (sequenceBlockReason) {
                                io.emit("system-log", { type: "info", msg: `Sequence Guard: new sequences skipped for ${customerDisplayName} because ${sequenceBlockReason}. Continuing normal AI reply.` });
                                if (hasAudio) {
                                    io.emit("system-log", { type: "info", msg: `sequence_trigger_skipped_reason: ${jid.split("@")[0]} ${sequenceBlockReason}.` });
                                }
                            }

                            if (!sequenceBlockReason) {
                            io.emit("system-log", { type: "info", msg: "🔍 Checking triggers (Shortcuts & Keywords)..." });
                            
                            const runtimeWelcome = resolveRuntimeWelcomePayload(botConfig, cachedWelcomeTemplates);
                            const welcomeAutoMatched = await processAutomaticWelcomeSequence(
                                createTrackedWhatsAppSocket(sock, botSentMessageIds),
                                jid,
                                customerDisplayName,
                                msg,
                                runtimeWelcome || undefined,
                                mergeRecoveryHistories(localStore[jid] || [], buildSyntheticHistoryFromDb(recentDbHistory, jid)),
                                simulateTyping,
                                forwardTemplate,
                                pendingResponses,
                                currentlyReplying,
                                io,
                                schedulePendingAiReplyDrain
                            );
                            if (welcomeAutoMatched) {
                                await queueBusyPendingAiReply({
                                    botId: dataOwnerKey,
                                    jid,
                                    messageId: String(msg.key?.id || ""),
                                    source: "sequence_delivery_overlap",
                                    lastCustomerMessageAt: getMessageTimestampSeconds(msg) * 1000,
                                });
                                io.emit("system-log", { type: "info", msg: `pending_ai_reply_created: ${jid.split("@")[0]} during welcome sequence.` });
                                console.log(`[Bot] Auto welcome sequence sent for ${jid}. Skipping AI.`);
                                continue;
                            }

                            // 3-Tier Trigger Pipeline Logic
                            const shortcutMatched = await processShortcut(
                                createTrackedWhatsAppSocket(sock, botSentMessageIds),
                                jid,
                                customerDisplayName,
                                msg,
                                textContent,
                                cachedKeywordSequences,
                                simulateTyping,
                                forwardTemplate,
                                pendingResponses,
                                currentlyReplying,
                                io,
                                runtimeWelcome || undefined,
                                schedulePendingAiReplyDrain
                            );
                            
                            if (shortcutMatched) {
                                await queueBusyPendingAiReply({
                                    botId: dataOwnerKey,
                                    jid,
                                    messageId: String(msg.key?.id || ""),
                                    source: hasAudio ? "voice_sequence_trigger_overlap" : "sequence_delivery_overlap",
                                    lastCustomerMessageAt: getMessageTimestampSeconds(msg) * 1000,
                                });
                                if (hasAudio) {
                                    io.emit("system-log", { type: "info", msg: `voice_sequence_trigger_matched: ${jid.split("@")[0]}.` });
                                }
                                io.emit("system-log", { type: "info", msg: `pending_ai_reply_created: ${jid.split("@")[0]} during sequence delivery.` });
                                console.log(`[Bot] Trigger matched for ${jid}. Skipping AI.`);
                                continue;
                            }
                            if (hasAudio) {
                                io.emit("system-log", { type: "info", msg: `voice_sequence_trigger_not_matched: ${jid.split("@")[0]}.` });
                            }
                            }
                            
                            console.log(`[Bot] AI Trigger check: enabled=${aiChatReplyMode.enabled}, currentlyReplying=${currentlyReplying.has(jid)}`);

                            if (aiChatReplyMode.allowInboundAiReply && !currentlyReplying.has(jid)) {
                                const activeCustomerRecord = await dbService.findLatestCustomerRecord(dataOwnerKey, jid, effectiveCustomerProfile).catch(() => null);
                                const routerDecision = decideTrivialAiRoute({
                                    text: savedIncomingText || textContent,
                                    hasAudio,
                                    hasImage: Boolean((msg.message as any)?.imageMessage),
                                    hasMedia,
                                    activeRecord: activeCustomerRecord?.order_data || null,
                                    configuredFields: Array.isArray(botConfig?.customFields) ? botConfig.customFields : [],
                                    autoReply: aiChatReplyMode.allowInboundAiReply,
                                });
                                const classifier = classifyCustomerText(savedIncomingText || textContent);
                                io.emit("system-log", {
                                    type: "info",
                                    msg: `router_decision action=${routerDecision.action} router_reason=${routerDecision.reason} ai_skipped_${routerDecision.action === "use_ai" ? "false" : "true"}`,
                                });

                                if (routerDecision.action === "skip_ai_no_reply") {
                                    emitLiveConsoleEvent({
                                        type: "ai_skipped",
                                        level: "info",
                                        scope: "bot",
                                        accountId: process.env.USER_ID,
                                        botId: dataOwnerKey,
                                        customerJid: jid,
                                        title: "AI skipped",
                                        message: "Router skipped AI for a high-confidence low-value message.",
                                        reason: routerDecision.reason,
                                    });
                                    continue;
                                }

                                const directText = routerDecision.action === "reply_text" ? routerDecision.text : "";
                                if (directText) {
                                    const access = await assertCustomerFacingSendAllowed({
                                        userId: process.env.USER_ID,
                                        context: "router_direct_reply",
                                        customerJid: jid,
                                        io,
                                        logger: console,
                                    });
                                    if (access.allowed) {
                                        const sent = await sendUniversalOutboundText({
                                            userId: process.env.USER_ID,
                                            botId: dataOwnerKey,
                                            customerJid: jid,
                                            messageText: directText,
                                            idempotencyKey: `router:${msg.key?.id || Date.now()}`,
                                            contextType: "router_direct_reply",
                                            campaignType: "router",
                                            sendText: (targetJid, text) => sendUniversalTextViaActiveProvider(targetJid, text, { trackId: false }),
                                            saveMessage: async (targetJid, text, messageId) => {
                                                await dbService.saveMessage(dataOwnerKey, targetJid, "model", text, messageId, undefined, getActualInstanceMeta());
                                            },
                                        });
                                        if (sent.status === "sent" || sent.status === "duplicate") {
                                            io.emit("system-log", { type: "success", msg: `router_direct_reply_sent: ${jid.split("@")[0]} reason=${routerDecision.reason}` });
                                            continue;
                                        }
                                    }
                                    io.emit("system-log", { type: "warning", msg: `fallback_to_ai_reason=router_direct_reply_failed reason=${access.reason || "send_failed"}` });
                                }

                                if (classifier.asksPrice && process.env.USER_ID) {
                                    const products = await dbService.listProducts(process.env.USER_ID).catch(() => []);
                                    if (classifier.asksPrice) {
                                        const productReply = buildProductFirstReply({ text: savedIncomingText || textContent, products, maxProducts: 5 });
                                        if (productReply.matched) {
                                            const access = await assertCustomerFacingSendAllowed({
                                                userId: process.env.USER_ID,
                                                context: "router_product_reply",
                                                customerJid: jid,
                                                io,
                                                logger: console,
                                            });
                                            if (access.allowed) {
                                                const sent = await sendUniversalOutboundText({
                                                    userId: process.env.USER_ID,
                                                    botId: dataOwnerKey,
                                                    customerJid: jid,
                                                    messageText: productReply.text,
                                                    idempotencyKey: `router-product:${msg.key?.id || Date.now()}`,
                                                    contextType: "router_product_reply",
                                                    campaignType: "router",
                                                    sendText: (targetJid, text) => sendUniversalTextViaActiveProvider(targetJid, text, { trackId: false }),
                                                    saveMessage: async (targetJid, text, messageId) => {
                                                        await dbService.saveMessage(dataOwnerKey, targetJid, "model", text, messageId, undefined, getActualInstanceMeta());
                                                    },
                                                });
                                                if (sent.status === "sent" || sent.status === "duplicate") {
                                                    io.emit("system-log", { type: "success", msg: `router_product_first_sent: ${jid.split("@")[0]} router_reason=strong_product_match ai_skipped_true` });
                                                    continue;
                                                }
                                            }
                                            io.emit("system-log", { type: "warning", msg: `fallback_to_ai_reason=product_first_send_failed reason=${access.reason || "send_failed"}` });
                                        } else {
                                            io.emit("system-log", { type: "info", msg: `fallback_to_ai_reason=${productReply.reason}` });
                                        }
                                    }
                                }

                                const aiEligibility = await getAiReplyAccountEligibility(dataOwnerKey);
                                if (!aiEligibility.eligible) {
                                    await blockAiReplyByBillingState({
                                        eligibility: aiEligibility,
                                        jid,
                                        source: "live incoming message",
                                    });
                                    continue;
                                }
                                const realInboundCheck = isRealInboundCustomerMessage(msg);
                                if (!realInboundCheck.ok) {
                                    io.emit("system-log", { type: "info", msg: `internal_placeholder_ignored_as_customer_message reason=${realInboundCheck.reason}` });
                                    io.emit("system-log", { type: "info", msg: `fake_newer_customer_message_rejected reason=${realInboundCheck.reason}` });
                                    continue;
                                }
                                io.emit("system-log", { type: "info", msg: `real_inbound_customer_message_accepted messageId=${String(msg.key?.id || "").slice(0, 24)} type=${realInboundCheck.kind}` });

                                queueAiReplyRetry(pendingAiReplyRetries, {
                                    botId: dataOwnerKey,
                                    jid,
                                    messageId: String(msg.key?.id || ""),
                                    source: "live incoming message",
                                    lastCustomerMessageAt: getMessageTimestampSeconds(msg) * 1000,
                                });
                                await persistAiReplyRetryQueue();
                                await queueActiveMessageBatch({
                                    botId: dataOwnerKey,
                                    jid,
                                    message: msg,
                                    source: "live incoming message",
                                    transport: "socket",
                                });
                                io.emit("system-log", { type: "info", msg: `pending_ai_reply_created: ${jid.split("@")[0]}.` });
                            } else {
                                 console.log(`[Bot] AI skipped. (enabled=${aiChatReplyMode.enabled}, inProgress=${currentlyReplying.has(jid)})`);
                                 if (aiChatReplyMode.allowInboundAiReply && currentlyReplying.has(jid)) {
                                    await queueActiveMessageBatch({
                                        botId: dataOwnerKey,
                                        jid,
                                        message: msg,
                                        source: "busy_live_incoming_overlap",
                                        transport: "socket",
                                    });
                                    io.emit("system-log", { type: "info", msg: `pending_ai_reply_created: ${jid.split("@")[0]} while bot was busy.` });
                                 }
                            }
                        }
                    }
                });

                io.emit("system-log", { type: "wa", msg: "Syncing templates..." });
                await syncTemplateGroup();
                await loadTemplates();
                setupAutoSync();
            },
            async (lastDisconnect) => {
                cancelPendingReadsForInstance(process.env.BOT_ID || "default");
                const shouldReconnect = ((lastDisconnect?.error as any)?.output?.statusCode !== (Baileys as any).DisconnectReason.loggedOut);
                if (selectedProxyUrl && shouldReconnect) {
                    const proxyError = sanitizeProxyErrorMessage((lastDisconnect?.error as any)?.message || "WhatsApp connection closed before stable session");
                    if (shouldTreatAsGenericProxyFailure(proxyError)) {
                        dbService.markProxyErrorByUrl(selectedProxyUrl, proxyError).catch(() => {});
                    }
                }
                if (shouldReconnect) {
                    emitConnectionRetry((lastDisconnect?.error as any)?.message || "WhatsApp connection closed before stable session", 5000);
                    setTimeout(initWhatsApp, 5000);
                } else {
                    connectionStatus = "disconnected";
                    io.emit("whatsapp-status", connectionStatus);
                }
            }
        );
    } catch(err: any) {
        const retryDelayMs = selectedProxyUrl ? 15000 : 60000;
        if (selectedProxyUrl) {
            const proxyError = sanitizeProxyErrorMessage(err?.message || "Proxy connection failed");
            if (shouldTreatAsGenericProxyFailure(proxyError)) {
                await dbService.markProxyErrorByUrl(selectedProxyUrl, proxyError).catch(() => {});
            }
        }
        console.error("[WA] Init failed:", err);
        emitConnectionRetry(err?.message || "WhatsApp connection setup issue", retryDelayMs);
        setTimeout(initWhatsApp, retryDelayMs);
    }
  };

  async function forwardTemplate(jid: string, template: any, isMedia: boolean = false, options: any = {}) {
      if (!sock) return { status: "failed", reason: "socket_not_ready" };
      try {
          const billingAction = options?.billingAction || (isMedia ? "media_group_file_send" : "sequence_template_send");
          const userId = String(process.env.USER_ID || "");
          const botId = String(process.env.BOT_ID || "");
          const fwContent = Baileys.generateForwardMessageContent(template, false);
          if (!fwContent || Object.keys(fwContent).length === 0) {
            return { status: "invalid_media", reason: "empty_forward_content" };
          }
          for (const key of Object.keys(fwContent)) {
            const section = fwContent[key as keyof typeof fwContent] as any;
            if (section?.contextInfo) {
              section.contextInfo.isForwarded = false;
              delete section.contextInfo.forwardingScore;
              delete section.contextInfo.quotedMessage;
            }
            if (typeof section?.caption !== "undefined") {
              section.caption = "";
            }
          }
          const myJid = getMyJid(sock);
          const dataOwnerKey = await resolveAccountDataOwnerKey(process.env.USER_ID, myJid);
          const result = normalizeSequenceItemResult(await sendUniversalAutomationRelay({
            userId,
            botId,
            customerJid: jid,
            billingAction,
            idempotencyKey: String(options?.billingEventId || buildAutomationBillingEventId([jid, buildAutomationTemplateKey(template), options?.sequenceKey, options?.mediaTitle, options?.source])),
            messageType: isMedia ? "media_group" : "sequence_template",
            contextType: isMedia ? "media_group" : "sequence_template",
            contextId: String(options?.billingEventId || ""),
            campaignType: isMedia ? "media_send" : "sequence",
            sequenceKey: options?.sequenceKey,
            mediaTitle: options?.mediaTitle,
            source: options?.source || (isMedia ? "media_group" : "sequence"),
            template,
            buildMessageId: () => Baileys.generateMessageID(),
            relay: async (messageId) => {
              botSentMessageIds.add(messageId);
              await sock.relayMessage(jid, fwContent, { messageId });
            },
            saveMessage: async (messageId) => {
              await dbService.saveMessage(dataOwnerKey, jid, "model", describeTemplateForHistory(template), messageId, undefined, getActualInstanceMeta());
            }
          }));
          if (!isSequenceItemDelivered(result)) {
            console.warn(`[Sequence] Relay did not send ${jid}: ${result.status}${result.reason ? ` (${result.reason})` : ""}`);
          }
          
          await waitRandomSequenceDelay();
          return result;
      } catch(e) {
          console.error("forwardTemplate err:", e);
          return { status: "failed", reason: e instanceof Error ? e.message : String(e) };
      }
  }

  async function syncTemplateGroup() {
      // First, preemptively load from botConfig just in case WhatsApp hasn't synced groups yet
      welcomeGroupJid = null;
      mediaGroupJid = null;
      cachedKeywordSequences = {};
      
      let configJidsUpdated = false;
      if (botConfig?.groups) {
          for (const g of botConfig.groups) {
              if ((g as any).enabled === false) continue;
              if (!g.jid && typeof g.name === "string" && g.name.includes("@g.us")) {
                  g.jid = g.name;
                  configJidsUpdated = true;
              }
              if (!g.jid) continue;
              if (g.purpose === 'welcome') {
                  welcomeGroupJid = g.jid;
              } else if (g.purpose === 'media') {
                  mediaGroupJid = g.jid;
              } else if (g.purpose === 'sequence') {
                  if (!cachedKeywordSequences[g.name]) cachedKeywordSequences[g.name] = { jid: g.jid, templates: [], config: g };
              }
          }
      }

      if (!mediaGroupJid || !welcomeGroupJid) {
          const userId = process.env.USER_ID;
          if (userId) {
              try {
                  const userConfig = await dbService.loadUserConfig(userId);
                  if (Array.isArray(userConfig?.groups)) {
                      for (const ug of userConfig.groups) {
                          if (!ug?.jid || (ug as any).enabled === false) continue;
                          if (ug.purpose === 'media' && !mediaGroupJid) {
                              mediaGroupJid = ug.jid;
                              if (!botConfig.groups) botConfig.groups = [];
                              if (!botConfig.groups.some((g: any) => g.jid === ug.jid)) {
                                  botConfig.groups.push(ug);
                                  configJidsUpdated = true;
                              }
                          } else if (ug.purpose === 'welcome' && !welcomeGroupJid) {
                              welcomeGroupJid = ug.jid;
                              if (!botConfig.groups) botConfig.groups = [];
                              if (!botConfig.groups.some((g: any) => g.jid === ug.jid)) {
                                  botConfig.groups.push(ug);
                                  configJidsUpdated = true;
                              }
                          } else if (ug.purpose === 'sequence') {
                              if (!cachedKeywordSequences[ug.name]) {
                                  cachedKeywordSequences[ug.name] = { jid: ug.jid, templates: [], config: ug };
                                  if (!botConfig.groups) botConfig.groups = [];
                                  if (!botConfig.groups.some((g: any) => g.jid === ug.jid)) {
                                      botConfig.groups.push(ug);
                                      configJidsUpdated = true;
                                  }
                              }
                          }
                      }
                  }
              } catch {}
          }
      }

      if (configJidsUpdated) {
          fs.writeFileSync(CONFIG_FILE, JSON.stringify(botConfig));
          const botId = process.env.BOT_ID;
          if (botId) dbService.saveBotConfig(botId, botConfig).catch(() => {});
      }

      if (!sock) return;
      try {
          const groups = await sock.groupFetchAllParticipating();
          for (const gid in groups) {
             const subject = groups[gid].subject;
             
             // First check for JID match, if not found then check exact name
             let matchedConfigs = botConfig?.groups?.filter((g: any) => (g.jid === gid || g.name === gid) && g.enabled !== false);
             if (!matchedConfigs || matchedConfigs.length === 0) {
                 matchedConfigs = botConfig?.groups?.filter((g: any) => g.name === subject && g.enabled !== false);
             }
             
             if (matchedConfigs && matchedConfigs.length > 0) {
               let configDidUpdate = false;
               for (const matchedConfig of matchedConfigs) {
                 if ((matchedConfig as any).enabled === false) continue;
                 if (!matchedConfig.jid) {
                     matchedConfig.jid = gid; // Persist resolved JID to prevent losing groups across reboots
                     configDidUpdate = true;
                 }
                 if (matchedConfig.purpose === 'welcome') {
                   welcomeGroupJid = gid;
                   io.emit("system-log", { type: "info", msg: `Welcome Group Synced: "${subject}"` });
                 } else if (matchedConfig.purpose === 'media') {
                   mediaGroupJid = gid;
                   io.emit("system-log", { type: "info", msg: `Media Group Synced: "${subject}"` });
                 } else if (matchedConfig.purpose === 'sequence') {
                   if (!cachedKeywordSequences[matchedConfig.name]) cachedKeywordSequences[matchedConfig.name] = { jid: gid, templates: [], config: matchedConfig };
                   cachedKeywordSequences[matchedConfig.name].jid = gid;
                   cachedKeywordSequences[matchedConfig.name].config = matchedConfig;
                   io.emit("system-log", { type: "info", msg: `Keyword Sequence Group Synced: "${subject}"` });
                 }
               }
               if (configDidUpdate) {
                   fs.writeFileSync(CONFIG_FILE, JSON.stringify(botConfig));
                   const botJid = process.env.BOT_ID;
                   if (botJid) {
                       dbService.saveBotConfig(botJid, botConfig).catch(() => {});
                   }
                   saveLocalStore();
               }
             }
          }
      } catch(e) {
          console.error("Failed to fetch groups, but config fallback might have worked:", e);
      }
  }

  async function loadTemplates() {
      cachedWelcomeTemplates = [];
      cachedMediaTemplates = [];
      for (const seqName of Object.keys(cachedKeywordSequences)) {
          if (cachedKeywordSequences[seqName]) cachedKeywordSequences[seqName].templates = [];
      }

      if (welcomeGroupJid) {
         const messages = localStore[welcomeGroupJid];
         if (!messages || messages.length === 0) {
           io.emit("system-log", {
             type: "error",
             msg: "No messages found in store for New Customer group.",
           });
         } else {
           const validMessages = messages.filter((m: any) => hasTemplatePayload(m, "welcome"));
           cachedWelcomeTemplates = validMessages;
           console.log(`[Templates] Welcome Group has ${cachedWelcomeTemplates.length} templates.`);
           io.emit("system-log", {
             type: "info",
             msg: `✅ Loaded ${cachedWelcomeTemplates.length} welcome templates from group.`,
           });
         }
       }

       for (const [seqName, seqData] of Object.entries(cachedKeywordSequences)) {
         if (seqData.jid) {
           const messages = localStore[seqData.jid];
           if (!messages || messages.length === 0) {
              io.emit("system-log", { type: "error", msg: `No messages found in store for "${seqName}" sequence group.` });
           } else {
             const validMessages = messages.filter((m: any) => hasTemplatePayload(m, "sequence"));
             cachedKeywordSequences[seqName].templates = validMessages;
             console.log(`[Templates] Sequence Group "${seqName}" has ${validMessages.length} templates.`);
             io.emit("system-log", {
               type: "info",
               msg: `✅ Loaded ${validMessages.length} templates for "${seqName}" sequence group.`,
             });
           }
         }
       }
       
       if (mediaGroupJid) {
           const messages = localStore[mediaGroupJid];
           if (!messages || messages.length === 0) {
               io.emit("system-log", { type: "error", msg: `No messages found in store for Media group.` });
           } else {
               const validMessages = messages.filter((m: any) => hasTemplatePayload(m, "media"));
               cachedMediaTemplates = validMessages.map((m: any, index: number) => {
                   const caption = getTemplateCaption(m, `media_${index + 1}`);
                   const stableId = m?.key?.id || m?.originalMessage?.key?.id || m?.id || `media_${index + 1}`;
                   const rawMsg = m?.originalMessage?.message || m?.message || m?.originalMessage || m;
                   const content = unwrapMessageContent(rawMsg);
                   let type = "image";
                   if (content?.videoMessage) type = "video";
                   else if (content?.documentMessage) type = "document";
                   else if (content?.audioMessage) type = "audio";
                   else if (content?.stickerMessage) type = "sticker";
                   else if (content?.imageMessage) type = "image";

                   const fileName = content?.documentMessage?.fileName || content?.audioMessage?.fileName || undefined;
                   const groupConfig = (botConfig?.groups || []).find((g: any) => g?.jid === mediaGroupJid || g?.purpose === "media");
                   const groupInstructions = groupConfig?.instructions || "";
                   const shortName = deriveMediaShortTitle({
                       type,
                       caption,
                       fileName,
                       explicitTitle: m?.name && m.name !== caption ? m.name : (m?.shortName || m?.title),
                       index,
                   });

                   return {
                       id: stableId,
                       name: shortName,
                       shortName,
                       fileName,
                       groupInstructions,
                       type,
                       caption,
                       aliases: [`media_${index + 1}`, `media ${index + 1}`, `${index + 1}`, stableId, shortName],
                       searchText: normalizeLookup(`${caption} ${stableId} ${shortName} ${fileName || ""} media_${index + 1} media ${index + 1}`),
                       originalMessage: m
                   };
               });
               console.log(`[Templates] Media Group has ${cachedMediaTemplates.length} templates.`);
               io.emit("system-log", { type: "info", msg: `✅ Loaded ${cachedMediaTemplates.length} media files from "Media" group.`});
           }
       }
  }

  // Ensure DB templates are merged at startup
  const botIdEnv = process.env.BOT_ID;
  if (botIdEnv) {
    setTimeout(async () => {
       try {
               // Sync JIDs from config strictly BEFORE saving local store
               await syncTemplateGroup();

               const restore = await hydrateTemplateStoreFromDatabase();
               if (restore.sources > 0) {
                   console.log(`[Server] Overlaid remote templates from DB into localStore from ${restore.sources} source(s).`);
                   saveLocalStore();
                   
                   // Rebuild cached templates after the overlay is applied
                   await loadTemplates();
                   
                   let breakdown = [];
                   if (cachedWelcomeTemplates.length > 0) breakdown.push(`Welcome: ${cachedWelcomeTemplates.length}`);
                   if (cachedMediaTemplates.length > 0) breakdown.push(`Media: ${cachedMediaTemplates.length}`);
                   
                   for (const [seqName, seqData] of Object.entries(cachedKeywordSequences)) {
                       if (seqData.templates?.length) breakdown.push(`${seqName}: ${seqData.templates.length}`);
                   }
                   io.emit("system-log", { type: "info", msg: `🔄 Startup DB sync complete. ${breakdown.length > 0 ? '(' + breakdown.join(', ') + ')' : ''}` });
               }
           } catch (e) {
               console.error("[Server] Failed compiling templates from DB:", e);
           }
        }, 3000); // Wait 3s to let WhatsApp init fetch groups if possible
  }

  const rawWorkerHost = String(process.env.WORKER_HOST || "").trim();
  const isProd = process.env.NODE_ENV === "production";
  const WORKER_HOST = (isProd && rawWorkerHost && rawWorkerHost !== "127.0.0.1" && rawWorkerHost !== "localhost")
    ? "127.0.0.1"
    : (rawWorkerHost || "127.0.0.1");
  console.log(`[Server] Attempting to listen on ${WORKER_HOST}:${PORT}...`);
  server.listen(PORT, WORKER_HOST, () => {
    console.log(`WhatsApp AI Engine running on port ${PORT}`);
    if (process.env.BOT_ID && PORT) {
      registerWorkerPort(process.env.BOT_ID, PORT);
    }
    process.on("exit", () => {
      if (process.env.BOT_ID) {
        unregisterWorkerPort(process.env.BOT_ID);
      }
    });
    initWhatsApp().catch((err: any) => {
      console.error("[WA] Init failed:", err);
      io.emit("system-log", {
        type: "error",
        msg: `WA Init failed: ${err.message}`,
      });
    });
  });
}

startServer().catch((err: any) => {
  console.error("Fatal server error:", err);
});
