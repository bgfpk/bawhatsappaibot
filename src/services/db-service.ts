import { isStaging, stageDocuments, unavailableStageService } from '../staging/registry';
import { Client, Databases, ID, Query, Users, Storage } from 'node-appwrite';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { getAppStatus } from '../utils/app-status-util.ts';
import { buildAccountDataOwnerKey, collectAccountDataOwnerCandidates } from '../utils/account-data-owner.ts';
import { buildCustomerActivityUpdate, getCustomerLastBotMessageTime } from './customer-activity.ts';
import { sortCustomersByLastInteraction } from './customer-display-state-service.ts';
import { buildConfirmedOrderReference } from './order-alert-service.ts';
import { isFollowupActive, isWithinFollowupWindow, normalizeFollowupHours, normalizeFollowupWindowHours, parseFollowupList, parseSentFollowupIds } from './followup-campaign-service.ts';
import { buildStaticFollowupMessage, hasStaticFollowupMessage } from './followup-message-service.ts';
import { normalizeFollowupCampaignType } from './followup-campaign-type-service.ts';
import { normalizeOrderCreatedAt, toOrderCreatedAtIso } from './order-persistence-service.ts';
import { buildPhoneProfilePatch, getCanonicalCustomerKey, getCustomerDisplayContact, getCustomerDisplayName, getProfilePhone, normalizePhoneDigits, normalizeWhatsAppJid, parseCustomerProfile, resolveCustomerChatJid } from '../utils/whatsapp-jid.ts';
import { deduplicateCustomerList, resolveCustomerIdentity, resolveCanonicalCustomerIdForAlias, loadPersistedCustomerAliasesAsync } from './customer-identity-resolver-service.ts';
import { canUpdateExistingOrder, explicitOrderReference, mergeOrderUpdate } from './order-upsert-service.ts';
import { getMissingLeadFields, normalizeBusinessFlow, normalizeRecordType, withRecordMetadata } from './record-flow-service.ts';
import { resolveMarketingChatJid } from './phone-number-consent-service.ts';
import { toVisibleChatHistoryMessage } from './chat-history-sanitizer.ts';
import { buildFollowupAttemptKey, buildFollowupDeliveryPatch, getFollowupDelivery, hasMatchingOutboundText, hasRecentIncompleteAiFollowupSkip, hasSuccessfulFollowupAttempt } from './followup-delivery-evidence.ts';
import { isCustomerInMarketingAudience, mergeMarketingOrderEvidence, normalizeMarketingAudience } from './marketing-audience-service.ts';
import { isMutedCustomer } from './muted-number-service.ts';
import { getCustomerReplyPauseReason } from './customer-reply-control-service.ts';
import {
  buildUserConfigWritePayload,
  isUnsupportedDhlUserConfigError,
  stripDhlFieldsFromUserConfigPayload,
  isUnsupportedDelayedReadConfigError,
  stripDelayedReadFieldsFromUserConfigPayload,
} from './user-config-save-payload-service.ts';
import { sanitizeProductForAiCost } from './instruction-compaction-service.ts';
import { getNextRepeatScheduledAt, normalizeCustomerUpdateRepeat, normalizePlannedUpdates } from './customer-update-schedule-service.ts';
import type { PlannedCustomerUpdate } from './customer-update-schedule-service.ts';
import { resolveCustomerUpdateTarget } from './customer-update-target-service.ts';
import { buildBackInStockSummary, buildBackInStockUpdateMessage } from './customer-update-message-service.ts';
import { buildWelcomeSequenceProfilePatch } from './welcome-sequence-status-service.ts';
import { resolveTenantTemplateStoreCandidates } from '../content-library/content-library-reset-service.ts';
import { APP_TRIAL_AI_CREDIT_USD, APP_TRIAL_FREE_AI_REPLIES, APP_TRIAL_SECONDS, getBillingAccess, hasPaidAccess, isAccountAiReplyAllowed, normalizeEpochSeconds, TRIAL_LIMITS } from '../config/billing-access.ts';
import { buildAccountLimits } from './account-limit-service.ts';
import { OAUTH_PASSWORD_SENTINEL, hashPassword, isOAuthPasswordValue, isStoredPasswordHash } from './password-security.ts';
import { canAssignSystemProxy, canKeepAssignedSystemProxy } from './system-proxy-state-service.ts';
import { buildCustomerOriginPatch, buildInstanceActivityPatch, decideProxyReleaseForUser } from './instance-activity-service.ts';
import { normalizeCampaignSendFromMode } from './campaign-sending-instance-service.ts';
import {
    ACCOUNT_USAGE_GUARDRAILS,
    describeUsageAnalyticsType,
    getUsageBillingDefinition,
    type BillableUsageAction,
} from '../config/pricing.ts';
import { buildUsageChargeDescription } from '../config/pricing-display.ts';
import { getRequiredAiReplyCostForPurpose } from '../config/ai-reply-required-cost.ts';
import { emitLiveConsoleEvent } from './live-console-event-service.ts';
import { readProviderConfigFromBotDocument, mergeProviderConfigIntoBotDocument } from './whatsapp-provider-bot-config-adapter.ts';
import { WhatsAppProviderConfig } from './whatsapp-provider-config.ts';
import { normalizeInstancePurpose } from './instance-purpose-service.ts';
import { prepareCloudApiProviderConfigInput } from './whatsapp-provider-credential-storage.ts';
import { publishEvent } from '../realtime/publish.ts';
import { EVENT_TYPES } from '../realtime/events.ts';
import { ROOMS } from '../realtime/rooms.ts';
import {
    extractBotTraining,
    mergeTrainingIntoConfig,
    saveBotTrainingPayload,
    loadBotTrainingPayload,
    cleanupOldGenerationChunks,
    saveJidTrainingPayload,
    loadJidTrainingPayload,
    cleanupOldJidGenerationChunks,
    getJidHash,
    type BotTrainingRef
} from './bot-training-storage-service.ts';

dotenv.config();

function getConfig() {
  if (isStaging) return { projectId: 'blackarrow_stage', apiKey: '', databaseId: 'blackarrow_stage', mode: 'ISOLATED_STAGING' };
    const isProd = process.env.NODE_ENV === 'production';
    return {
        projectId: isProd ? (process.env.APPWRITE_PROJECT_ID_LIVE || '') : (process.env.APPWRITE_PROJECT_ID_DEV || ''),
        apiKey: isProd ? (process.env.APPWRITE_API_KEY_LIVE || '') : (process.env.APPWRITE_API_KEY_DEV || ''),
        databaseId: isProd ? (process.env.APPWRITE_DATABASE_ID_LIVE || 'main_db') : (process.env.APPWRITE_DATABASE_ID_DEV || 'main_db'),
        mode: isProd ? 'PRODUCTION' : 'DEVELOPMENT'
    };
}

let config = getConfig();
console.log(`[Database] Initializing in ${config.mode} mode. DB: ${config.databaseId}`);

// Appwrite Client Setup
export let client = new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT || 'https://blackarrow-source.offline.invalid/v1')
    .setProject(config.projectId)
    .setKey(config.apiKey);

export let databases: any = isStaging ? stageDocuments() : new Databases(client);
export let usersClient: any = isStaging ? unavailableStageService : new Users(client);
export let storage: any = isStaging ? unavailableStageService : new Storage(client);

export let DATABASE_ID = config.databaseId;

export function refreshDatabaseId() {
    if (isStaging) { DATABASE_ID = 'blackarrow_stage'; return; }
    const status = getAppStatus();
    const isProd = process.env.NODE_ENV === 'production';
    if (isProd) {
        client.setProject(process.env.APPWRITE_PROJECT_ID_LIVE || '');
        client.setKey(process.env.APPWRITE_API_KEY_LIVE || '');
        DATABASE_ID = process.env.APPWRITE_DATABASE_ID_LIVE || 'main_db';
    } else {
        client.setProject(process.env.APPWRITE_PROJECT_ID_DEV || '');
        client.setKey(process.env.APPWRITE_API_KEY_DEV || '');
        DATABASE_ID = process.env.APPWRITE_DATABASE_ID_DEV || 'main_db';
    }
    console.log(`[Database] ID refreshed to: ${DATABASE_ID} (Mode: ${isProd ? 'PROD' : 'DEV'}, Status: ${status})`);
}

// Initial refresh
refreshDatabaseId();

export const COLLECTIONS = {
    USERS: process.env.APPWRITE_USERS_COLLECTION || 'users',
    USER_CONFIGS: process.env.APPWRITE_USER_CONFIGS_COLLECTION || 'user_configs',
    BOTS: process.env.APPWRITE_BOTS_COLLECTION || 'bots',
    PRODUCTS: process.env.APPWRITE_PRODUCTS_COLLECTION || 'products',
    CUSTOMERS: process.env.APPWRITE_CUSTOMERS_COLLECTION || 'customers',
    MESSAGES: process.env.APPWRITE_MESSAGES_COLLECTION || 'messages',
    ORDERS: process.env.APPWRITE_ORDERS_COLLECTION || 'orders',
    WALLET_TRANSACTIONS: process.env.APPWRITE_WALLET_TRANSACTIONS_COLLECTION || 'wallet_transactions',
    LOGIN_TOKENS: process.env.APPWRITE_LOGIN_TOKENS_COLLECTION || 'login_tokens',
    USER_SUBSCRIPTIONS: process.env.APPWRITE_USER_SUBSCRIPTIONS_COLLECTION || 'user_subscriptions',
    GLOBAL_SETTINGS: process.env.APPWRITE_GLOBAL_SETTINGS_COLLECTION || 'global_settings',
    SYSTEM_CONFIGS: process.env.APPWRITE_SYSTEM_CONFIGS_COLLECTION || 'system_configs',
    SYSTEM_PROXIES: process.env.APPWRITE_SYSTEM_PROXIES_COLLECTION || 'system_proxies',
    USAGE_ANALYTICS: process.env.APPWRITE_USAGE_ANALYTICS_COLLECTION || 'usage_analytics',
    BACK_IN_STOCK: process.env.APPWRITE_BACK_IN_STOCK_COLLECTION || 'back_in_stock_requests',
};

// Helper for Appwrite Query conversions
function mapToAppwrite(data: any) {
    const { ...rest } = data;
    // Appwrite doesn't like nulls if attribute is required, but we'll deal with it
    return rest;
}

// Interfaces
export interface User {
    id: string;
    email: string;
    name: string;
    password_hash: string;
    created_at: number;
}

export interface ChatMessage {
    role: 'user' | 'model' | 'system';
    text: string;
    timestamp: any;
    messageId?: string;
}

// Database Service Functions (Refactored for Appwrite)

export async function getSystemConfig(key: string): Promise<string | null> {
    try {
        const response = await databases.getDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, key);
        return (response as any).value || null;
    } catch (e) {
        return null;
    }
}

export async function setSystemConfig(key: string, value: string) {
    try {
        await databases.updateDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, key, { value, updated_at: now() });
    } catch (e: any) {
        if (e.code === 404) {
            await databases.createDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, key, { value, updated_at: now() });
        }
    }
}

export async function getBotsByUser(userId: string) {
    try {
        const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.BOTS, [
            Query.equal('user_id', userId)
        ]);
        return response.documents;
    } catch (e) {
        console.error("[Appwrite] getBotsByUser error:", e);
        return [];
    }
}

export async function listBots(limit = 1000) {
    try {
        const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.BOTS, [
            Query.limit(limit)
        ]);
        return response.documents;
    } catch (e) {
        return [];
    }
}

function parseConfigSettings(raw: any): any | null {
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function hasMeaningfulInstanceConfig(config: any): boolean {
    if (!config || typeof config !== 'object') return false;
    if (Array.isArray(config.groups) && config.groups.length > 0) return true;
    if (Array.isArray(config.customFields) && config.customFields.length > 0) return true;
    if (Array.isArray(config.muted_numbers) && config.muted_numbers.length > 0) return true;
    return Boolean(
        config.prompt ||
        config.botName ||
        config.learned_instructions ||
        config.followups_json ||
        config.preferredLanguage
    );
}

async function archiveBotBeforeDelete(bot: any, botId: string, userId: string) {
    const archiveKey = `deleted_bot_${crypto.createHash('sha1').update(botId).digest('hex').slice(0, 20)}`;
    const config = parseConfigSettings(bot?.config_settings);
    let templateStoreCopied = false;

    if (bot?.jid) {
        if (config) {
            await savePermanentJidConfig(bot.jid, config).catch((e: any) => {
                console.error("[Appwrite] Failed archiving JID config before bot delete:", e?.message || e);
            });
        }

        try {
            const templateStore = await loadTemplateStore(botId);
            if (templateStore) {
                await saveTemplateStore(bot.jid, templateStore);
                templateStoreCopied = true;
            }
        } catch (e: any) {
            console.error("[Appwrite] Failed archiving template store before bot delete:", e?.message || e);
        }
    }

    await upsertSystemConfig(archiveKey, JSON.stringify({
        botId,
        userId,
        jid: bot?.jid || null,
        name: bot?.name || null,
        config,
        templateStoreCopied,
        deleted_at: now()
    }));
}

export async function deleteBot(botId: string, userId: string) {
    try {
        const bot = await databases.getDocument(DATABASE_ID, COLLECTIONS.BOTS, botId) as any;
        if (!bot || bot.user_id !== userId) return false;
        await archiveBotBeforeDelete(bot, botId, userId);
        await databases.deleteDocument(DATABASE_ID, COLLECTIONS.BOTS, botId);
        return true;
    } catch (e: any) {
        console.error("[Appwrite] deleteBot error:", e?.message || e);
        return false;
    }
}

export async function getGlobalSetting(key: string) {
    try {
        const response = await databases.getDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, key);
        return (response as any).value || null;
    } catch (e) {
        return null;
    }
}

export async function setGlobalSetting(key: string, value: string) {
    try {
        // First try to update
        try {
            await databases.updateDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, key, { value, updated_at: now() });
        } catch (updateError: any) {
            // Only try to create if document not found or error
            await databases.createDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, key, { value, updated_at: now() });
        }
    } catch (e: any) {
        console.error("Error setting global config:", key, e);
        throw e;
    }
}

export function buildBillingAlertRecordId(scope: string, key: string) {
    const digest = crypto.createHash("sha1").update(`${scope}:${key}`).digest("hex").slice(0, 24);
    return `balt_${digest}`;
}

async function getSystemConfigRecord(documentId: string) {
    try {
        return await databases.getDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, documentId);
    } catch (e) {
        return null;
    }
}

function parseBillingAlertRecordValue(raw: any) {
    if (!raw) return null;
    if (typeof raw === "object") return raw;
    try {
        return JSON.parse(String(raw || "{}"));
    } catch {
        return null;
    }
}

export async function getBillingAlertRecord(scope: string, key: string) {
    const documentId = buildBillingAlertRecordId(scope, key);
    const record = await getSystemConfigRecord(documentId);
    const parsed = parseBillingAlertRecordValue((record as any)?.value);
    return parsed ? { ...parsed, documentId } : null;
}

export async function tryCreateBillingAlertRecord(scope: string, key: string, value: any) {
    const documentId = buildBillingAlertRecordId(scope, key);
    try {
        await databases.createDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, documentId, {
            value: JSON.stringify(value),
            updated_at: now()
        });
        return { created: true, documentId, record: value };
    } catch (e: any) {
        if (Number(e?.code || 0) === 409) {
            const existing = await getBillingAlertRecord(scope, key);
            return { created: false, documentId, record: existing };
        }
        throw e;
    }
}

export async function setBillingAlertRecord(scope: string, key: string, value: any) {
    const documentId = buildBillingAlertRecordId(scope, key);
    const payload = { value: JSON.stringify(value), updated_at: now() };
    try {
        await databases.updateDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, documentId, payload);
    } catch (e: any) {
        if (Number(e?.code || 0) === 404) {
            await databases.createDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, documentId, payload);
        } else {
            throw e;
        }
    }
    return { documentId, record: value };
}

export async function deleteBillingAlertRecord(scope: string, key: string) {
    const documentId = buildBillingAlertRecordId(scope, key);
    try {
        await databases.deleteDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, documentId);
        return true;
    } catch (e: any) {
        if (Number(e?.code || 0) === 404) return false;
        throw e;
    }
}

async function upsertSystemConfig(key: string, value: string) {
    try {
        await databases.updateDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, key, { value, updated_at: now() });
    } catch (e: any) {
        if (e.code === 404) {
            await databases.createDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, key, { value, updated_at: now() });
        } else {
            throw e;
        }
    }
}

function getTemplateStorePrefix(botId: string) {
    const hash = crypto.createHash('sha1').update(botId).digest('hex').slice(0, 20);
    return `tpl_${hash}`;
}

async function saveChunkedTemplateStore(botId: string, storeData: string, userId?: string) {
    const prefix = getTemplateStorePrefix(botId);
    const manifestKey = `${prefix}_manifest`;
    const chunkSize = 45000;
    const chunks = storeData.match(new RegExp(`[\\s\\S]{1,${chunkSize}}`, 'g')) || [""];

    let previousChunkCount = 0;
    try {
        const previousManifest = await getSystemConfig(manifestKey);
        if (previousManifest) {
            previousChunkCount = JSON.parse(previousManifest).chunkCount || 0;
        }
    } catch {}

    for (let i = 0; i < chunks.length; i++) {
        await upsertSystemConfig(`${prefix}_${i}`, chunks[i]);
    }

    for (let i = chunks.length; i < previousChunkCount; i++) {
        try {
            await databases.deleteDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, `${prefix}_${i}`);
        } catch {}
    }

    let ownerId = userId?.trim();
    if (!ownerId && botId) {
        try {
            const b = await databases.getDocument(DATABASE_ID, COLLECTIONS.BOTS, botId) as any;
            if (b?.user_id) ownerId = b.user_id;
        } catch {}
    }

    await upsertSystemConfig(manifestKey, JSON.stringify({
        version: 2,
        accountId: ownerId || null,
        userId: ownerId || null,
        botId,
        chunkCount: chunks.length,
        size: storeData.length,
        updated_at: now()
    }));
}

async function loadChunkedTemplateStore(botId: string): Promise<string | null> {
    const prefix = getTemplateStorePrefix(botId);
    const manifestRaw = await getSystemConfig(`${prefix}_manifest`);
    if (!manifestRaw) return null;

    const manifest = JSON.parse(manifestRaw);
    const chunkCount = Number(manifest.chunkCount || 0);
    if (!chunkCount) return null;

    const chunks: string[] = [];
    for (let i = 0; i < chunkCount; i++) {
        const chunk = await getSystemConfig(`${prefix}_${i}`);
        if (chunk === null) {
            throw new Error(`Template store chunk ${i + 1}/${chunkCount} is missing`);
        }
        chunks.push(chunk);
    }
    return chunks.join("");
}

export async function setTempPassword(userId: string, tempPass: string | null, expiresHours: number = 24) {
    const expiresAt = tempPass ? now() + (expiresHours * 60 * 60) : null;
    const tempPasswordToStore = tempPass ? hashPassword(tempPass) : null;
    try {
        await databases.updateDocument(DATABASE_ID, COLLECTIONS.USERS, userId, { temp_password: tempPasswordToStore, temp_password_expires: expiresAt });
    } catch (e) {}
    return { tempPass, expiresAt };
}

export async function toggleBot(botId: string, userId: string, isActive: number) {
    try {
        await databases.updateDocument(DATABASE_ID, COLLECTIONS.BOTS, botId, { is_active: isActive, updated_at: now() });
        return true;
    } catch (e) {
        return false;
    }
}

export interface CreateBotOptions {
    providerType?: string;
    instancePurpose?: string;
    controlBusinessInstanceId?: string;
}

export async function createBot(
    userId: string,
    name?: string,
    providerTypeOrOptions?: string | CreateBotOptions,
    legacyPurpose?: string,
    legacyControlId?: string
) {
    const botId = 'bot_' + Math.random().toString(36).substring(2, 11);
    const data: any = { user_id: userId, updated_at: now(), is_active: 1 };
    if (name) data.name = name;

    let providerType: string | undefined;
    let instancePurpose: string | undefined;
    let controlBusinessInstanceId: string | undefined;

    if (providerTypeOrOptions && typeof providerTypeOrOptions === "object") {
        providerType = providerTypeOrOptions.providerType;
        instancePurpose = providerTypeOrOptions.instancePurpose;
        controlBusinessInstanceId = providerTypeOrOptions.controlBusinessInstanceId;
    } else {
        providerType = typeof providerTypeOrOptions === "string" ? providerTypeOrOptions : undefined;
        instancePurpose = legacyPurpose;
        controlBusinessInstanceId = legacyControlId;
    }

    const initialConfig: any = {};
    if (providerType === "whatsapp_cloud_api") {
        initialConfig.providerType = "whatsapp_cloud_api";
        initialConfig.providerStatus = "setup_required";
    }
    if (instancePurpose) {
        initialConfig.instancePurpose = normalizeInstancePurpose(instancePurpose);
    }
    if (controlBusinessInstanceId && typeof controlBusinessInstanceId === "string" && controlBusinessInstanceId.trim()) {
        initialConfig.controlBusinessInstanceId = controlBusinessInstanceId.trim();
    }

    if (Object.keys(initialConfig).length > 0) {
        data.config_settings = JSON.stringify(initialConfig);
    }
    await databases.createDocument(DATABASE_ID, COLLECTIONS.BOTS, botId, data);
    return botId;
}

export async function getAllBots(limit = 100): Promise<any[]> {
    try {
        const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.BOTS, [Query.limit(limit)]);
        return response.documents || [];
    } catch {
        return [];
    }
}

export async function checkJidAllowed(botJid: string, currentUserId: string): Promise<boolean> {
    try {
        const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.BOTS, [
            Query.equal('jid', botJid),
            Query.notEqual('user_id', currentUserId)
        ]);
        return response.total === 0;
    } catch (e) {
        return true;
    }
}

export async function getUser(userId: string) {
    if (!userId) return null;
    const rawId = String(userId).trim();
    if (!rawId) return null;

    // Strip optional "account:" prefix (e.g. from buildAccountDataOwnerKey)
    const cleanId = rawId.replace(/^account:/i, '').trim();
    if (!cleanId) return null;

    try {
        // 1. Try direct getDocument by cleaned ID
        try {
            const user = await databases.getDocument(DATABASE_ID, COLLECTIONS.USERS, cleanId);
            if (user) return user;
        } catch (e) {}

        // 2. Try by email if it looks like an email and not a WhatsApp JID
        if (cleanId.includes('@') && !cleanId.endsWith('@s.whatsapp.net')) {
            const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.USERS, [
                Query.equal('email', cleanId.toLowerCase()),
                Query.limit(1)
            ]);
            if (response.total > 0) {
                return response.documents[0];
            }
        }

        // 3. If passed a bot ID, resolve the owner user
        if (cleanId.startsWith('bot_')) {
            try {
                const botDoc = await databases.getDocument(DATABASE_ID, COLLECTIONS.BOTS, cleanId) as any;
                if (botDoc?.user_id) {
                    return await getUser(botDoc.user_id);
                }
            } catch (e) {}
        }

        // 4. If passed a WhatsApp JID, resolve the bot and then owner user
        if (cleanId.includes('@s.whatsapp.net')) {
            try {
                const botDocs = await databases.listDocuments(DATABASE_ID, COLLECTIONS.BOTS, [
                    Query.equal('jid', cleanId),
                    Query.limit(1)
                ]);
                if (botDocs.total > 0 && (botDocs.documents[0] as any)?.user_id) {
                    return await getUser((botDocs.documents[0] as any).user_id);
                }
            } catch (e) {}
        }
    } catch (e) {
        console.error("[Appwrite] getUser error:", e);
    }
    return null;
}

export async function isTrialOrPaid(userId: string): Promise<boolean> {
    const user = await getUser(userId) as any;
    if (!user) {
        console.warn(`[TrialCheck] User ${userId} not found.`);
        return false;
    }
    if (isAccountSuspended(user)) {
        console.warn(`[TrialCheck] User ${userId} is suspended.`);
        return false;
    }
    const trialAiRepliesUsed = await getTrialAiReplyUsage(user.$id || userId).catch(() => 0);
    const requiredAiTextReplyCost = getRequiredAiReplyCostForPurpose({ purpose: "customer_ai_reply" });
    const decision = isAccountAiReplyAllowed({ ...user, trial_ai_replies_used: trialAiRepliesUsed }, { minimumWalletBalanceUsd: requiredAiTextReplyCost });
    if (decision.allowed) return true;
    console.warn(`[TrialCheck] User ${userId} reason=${decision.reason} status=${decision.access.status}. Rejecting AI processing.`);
    const description = decision.reason === "insufficient_wallet_balance"
        ? `AI usage blocked because wallet balance is below the minimum billable amount of $${requiredAiTextReplyCost.toFixed(3)}.`
        : `AI usage blocked because billing status is ${decision.access.status} (${decision.reason}).`;
    await addWalletTransaction(user.$id, 0, "ai_usage_blocked", description);
    return false;
}

function isAccountSuspended(user: any) {
    const status = String(user?.account_status || user?.status || user?.billing_status || "").toLowerCase();
    return user?.is_suspended === true ||
        user?.suspended === true ||
        status === "suspended" ||
        status === "blocked" ||
        status === "disabled";
}

function normalizeAccountAccessBlockedReason(user: any, decision: ReturnType<typeof isAccountAiReplyAllowed>) {
    if (isAccountSuspended(user)) return "account_suspended";
    if (decision.reason === "account_trial_expired") return "trial_expired";
    if (decision.reason === "trial_free_reply_limit_reached" || decision.reason === "trial_free_ai_replies_used") return "trial_free_reply_limit_reached";
    if (decision.reason === "subscription_required" || decision.reason === "subscription_expired") return "subscription_expired";
    if (decision.reason === "unknown_plan") return "unknown_plan";
    if (decision.reason === "insufficient_wallet_balance") return "insufficient_wallet";
    if (decision.reason === "account_trial_expiry_missing") return "account_access_expired";
    return decision.reason || "account_access_expired";
}

export function trialAiReplyUsageKey(userId: string) {
    const hash = crypto.createHash("sha1").update(String(userId || "")).digest("hex").slice(0, 24);
    return `tau_${hash}`;
}

export async function getTrialAiReplyUsage(userId: string) {
    let raw = await getGlobalSetting(trialAiReplyUsageKey(userId)).catch(() => "");
    if (!raw && userId) {
        const legacyKey = `trial_ai_replies_used_${normalizeUsageChargePart(userId)}`;
        if (legacyKey.length <= 36) {
            raw = await getGlobalSetting(legacyKey).catch(() => "");
        }
    }
    const parsed = Number(raw || 0);
    return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

export async function incrementTrialAiReplyUsage(userId: string, amount = 1) {
    const current = await getTrialAiReplyUsage(userId);
    const next = Math.max(0, current + Math.max(1, Math.floor(Number(amount || 1))));
    await setGlobalSetting(trialAiReplyUsageKey(userId), String(next));
    return next;
}

export function paidAccessEvidenceKey(userId: string) {
    const hash = crypto.createHash("sha1").update(String(userId || "")).digest("hex").slice(0, 24);
    return `pae_${hash}`;
}

function isPaidAccessCredit(type: any, description: any, amount: any) {
    if (Number(amount || 0) <= 0) return false;
    const normalizedType = String(type || "").toLowerCase();
    const normalizedDescription = String(description || "").toLowerCase();
    if (normalizedType.includes("refund") || normalizedDescription.includes("refund")) return false;
    if (normalizedType.includes("signup_credit") || normalizedType.includes("free_credit") || normalizedType.includes("welcome_credit")) return false;
    if (/\b(free|signup|welcome|trial)\b/.test(normalizedDescription) && normalizedDescription.includes("credit")) return false;
    return normalizedType === "topup" ||
        normalizedType.includes("payment") ||
        normalizedType.includes("subscription") ||
        normalizedDescription.includes("top-up") ||
        normalizedDescription.includes("top up") ||
        normalizedDescription.includes("payment added") ||
        normalizedDescription.includes("plan confirmed");
}

export async function markPaidAccessConfirmed(userId: string, reason = "paid_access_confirmed") {
    if (!userId) return false;
    await setGlobalSetting(paidAccessEvidenceKey(userId), JSON.stringify({ reason, confirmedAt: now() }));
    return true;
}

export async function hasPaidAccessEvidence(userId: string, user?: any) {
    if (!userId) return false;
    if (user && hasPaidAccess(user)) return true;
    const resolvedUser = user || await getUser(userId).catch(() => null);
    if (!resolvedUser) return false;
    return hasPaidAccess(resolvedUser);
}

export async function canSendCustomerFacingMessage(userId: string | undefined) {
    if (!userId) return { allowed: false, reason: "missing_user" };
    const user = await getUser(userId).catch(() => null) as any;
    if (!user) return { allowed: false, reason: "user_not_found" };
    if (isAccountSuspended(user)) return { allowed: false, reason: "account_suspended" };
    const trialAiRepliesUsed = await getTrialAiReplyUsage(user.$id || userId).catch(() => 0);
    const decision = isAccountAiReplyAllowed({ ...user, trial_ai_replies_used: trialAiRepliesUsed }, { minimumWalletBalanceUsd: 0 });
    if (!decision.allowed) {
        return {
            allowed: false,
            reason: normalizeAccountAccessBlockedReason(user, decision),
            access: decision.access,
        };
    }
    return { allowed: true, reason: "", access: decision.access };
}

export async function updateBotName(botId: string, name: string) {
    try {
        await databases.updateDocument(DATABASE_ID, COLLECTIONS.BOTS, botId, { name, updated_at: now() });
    } catch (e) {
       console.error("updateBotName db error", e);
    }
}

export async function saveBotInfo(botJid: string, botId: string) {
    try {
        const existing = await databases.getDocument(DATABASE_ID, COLLECTIONS.BOTS, botId).catch(() => null) as any;
        const currentConfig = parseConfigSettings(existing?.config_settings);
        const previousJid = existing?.jid || "";
        await databases.updateDocument(DATABASE_ID, COLLECTIONS.BOTS, botId, { jid: botJid, updated_at: now() });
        await updateBotRuntimeActivity(botId, { direction: "connected", connectionStatus: "connected" }).catch(() => {});
        if (botJid && existing?.user_id) {
            const duplicates = await databases.listDocuments(DATABASE_ID, COLLECTIONS.BOTS, [
                Query.equal("jid", botJid),
                Query.equal("user_id", existing.user_id),
                Query.limit(20),
            ]).catch(() => ({ documents: [] } as any));
            for (const duplicate of (duplicates.documents || []) as any[]) {
                const duplicateId = duplicate.$id || duplicate.id;
                if (!duplicateId || duplicateId === botId) continue;
                await databases.updateDocument(DATABASE_ID, COLLECTIONS.BOTS, duplicateId, {
                    jid: "",
                    updated_at: now(),
                }).catch(() => {});
                await updateBotRuntimeActivity(duplicateId, { direction: "disconnected", connectionStatus: "disconnected" }).catch(() => {});
                console.log(`[Appwrite] Cleared duplicate WhatsApp number ${botJid} from bot ${duplicateId} after relink to ${botId}.`);
            }
        }
        if (previousJid && previousJid !== botJid) {
            console.log(`[Appwrite] Relinked bot ${botId} from ${previousJid} to ${botJid}. Historical data was preserved.`);
        } else if (!previousJid && botJid) {
            console.log(`[Appwrite] Linked bot ${botId} to WhatsApp number ${botJid}.`);
        }
        if (botJid) {
            const permanentConfig = await loadPermanentJidConfig(botJid);
            if (!hasMeaningfulInstanceConfig(currentConfig) && permanentConfig) {
                // Restore permanentConfig via saveBotConfig so botId gets its own isolated training namespace & valid trainingRef
                await saveBotConfig(botId, permanentConfig).catch((err) => {
                    console.warn(`[Appwrite] Non-fatal saveBotConfig restore error for bot ${botId}:`, err?.message || err);
                });
            } else if (hasMeaningfulInstanceConfig(currentConfig)) {
                const fullCurrent = await loadBotConfig(botId).catch(() => currentConfig);
                await savePermanentJidConfig(botJid, fullCurrent || currentConfig);
            }
        }
    } catch (e: any) {
        console.error("[Appwrite] saveBotInfo error:", e?.message || e);
    }
}

export async function clearBotJid(botId: string, userId: string) {
    try {
        const existing = await databases.getDocument(DATABASE_ID, COLLECTIONS.BOTS, botId).catch(() => null) as any;
        if (!existing || existing.user_id !== userId) return { success: false, oldJid: "", reason: "Bot not found for this account" };
        const oldJid = existing.jid || "";
        await databases.updateDocument(DATABASE_ID, COLLECTIONS.BOTS, botId, { jid: "", updated_at: now() });
        await updateBotRuntimeActivity(botId, { direction: "disconnected", connectionStatus: "disconnected" }).catch(() => {});
        return { success: true, oldJid, reason: "" };
    } catch (e: any) {
        const reason = e?.message || "Failed to clear WhatsApp number from instance";
        console.error("[Appwrite] clearBotJid error:", reason);
        return { success: false, oldJid: "", reason };
    }
}

export function getPermanentJidDocId(jid: string): string {
    const jidHash = getJidHash(jid);
    return `jid_cfg_${jidHash}`;
}

export async function saveBotConfig(botId: string, config: any) {
    // 1. Fetch current BOTS doc to read authoritative server-side trainingRef and existing config
    let existingBotDoc: any = null;
    let existingOperationalConfig: any = null;
    let currentServerTrainingRef: BotTrainingRef | null = null;

    try {
        existingBotDoc = await databases.getDocument(DATABASE_ID, COLLECTIONS.BOTS, botId);
        if (existingBotDoc && existingBotDoc.config_settings) {
            existingOperationalConfig = typeof existingBotDoc.config_settings === 'string'
                ? JSON.parse(existingBotDoc.config_settings)
                : existingBotDoc.config_settings;
            currentServerTrainingRef = existingOperationalConfig?.trainingRef || null;
        }
    } catch (e: any) {
        if (e.code === 404 || String(e?.message || "").toLowerCase().includes("not found")) {
            throw new Error(`[dbService] Bot document ${botId} not found in database.`);
        }
        // Non-404 error (network timeout, 500): FAIL CLOSED!
        throw new Error(`[dbService] Failed to read existing bot document ${botId}: ${e?.message || e}`);
    }

    const { trainingPayload, operationalConfig, trainingInputProvided, hasTrainingContent, checksum } = extractBotTraining(config);

    let newTrainingRef: BotTrainingRef | null = null;
    let writtenNewGeneration = false;
    let shouldCleanupOldGen = false;
    const oldGeneration = currentServerTrainingRef?.generation;
    const oldChunkCount = currentServerTrainingRef?.chunkCount;

    if (trainingInputProvided) {
        if (hasTrainingContent) {
            // Training input provided with content
            if (currentServerTrainingRef && currentServerTrainingRef.checksum === checksum) {
                // Reuse existing active generation
                operationalConfig.trainingRef = currentServerTrainingRef;
            } else {
                // Write new immutable generation N+1 chunks + manifest
                newTrainingRef = await saveBotTrainingPayload(
                    DATABASE_ID,
                    botId,
                    trainingPayload,
                    databases,
                    currentServerTrainingRef?.generation,
                    COLLECTIONS.SYSTEM_CONFIGS
                );
                operationalConfig.trainingRef = newTrainingRef;
                writtenNewGeneration = true;
                shouldCleanupOldGen = true;
            }
        } else {
            // Training input provided and intentionally empty -> clear trainingRef!
            delete operationalConfig.trainingRef;
            shouldCleanupOldGen = Boolean(oldGeneration);
        }
    } else if (currentServerTrainingRef) {
        // Operational-only save -> preserve active server trainingRef
        operationalConfig.trainingRef = currentServerTrainingRef;
    }

    // 2. Persist compact operational config to BOTS.config_settings
    // Note: If this fails, Appwrite throws here. New generation remains orphan, old generation remains active in BOTS.
    const serialized = JSON.stringify(operationalConfig);
    await databases.updateDocument(DATABASE_ID, COLLECTIONS.BOTS, botId, { config_settings: serialized, updated_at: now() });

    // 3. ONLY AFTER BOTS save succeeds: clean up old obsolete generation chunks asynchronously
    if (shouldCleanupOldGen && oldGeneration && oldGeneration !== newTrainingRef?.generation) {
        cleanupOldGenerationChunks(
            databases,
            DATABASE_ID,
            botId,
            oldGeneration,
            oldChunkCount || 10,
            COLLECTIONS.SYSTEM_CONFIGS
        ).catch((err) => {
            console.warn(`[dbService] Non-fatal cleanup warning for bot ${botId} old generation g${oldGeneration}:`, (err as any)?.message || err);
        });
    }

    // 4. Save permanent JID backup using the authoritative saved config
    try {
        const botJid = existingBotDoc?.jid;
        if (botJid) {
            const authoritativeConfig = await loadBotConfig(botId);
            if (authoritativeConfig) {
                await savePermanentJidConfig(botJid, authoritativeConfig);
            }
        }
    } catch (e: any) {
        console.warn(`[dbService] Non-fatal permanent JID backup error for bot ${botId}:`, e?.message || e);
    }
}

export async function savePermanentJidConfig(jid: string, fullConfig: any) {
    if (!jid) return;
    const docId = getPermanentJidDocId(jid);
    const { trainingPayload, operationalConfig, hasTrainingContent, checksum } = extractBotTraining(fullConfig);

    // 1. Fetch current permanent JID doc to read previous trainingRef
    let currentJidTrainingRef: BotTrainingRef | null = null;
    try {
        const existingDoc = await databases.getDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, docId) as any;
        if (existingDoc && existingDoc.value) {
            const parsed = JSON.parse(existingDoc.value);
            currentJidTrainingRef = parsed?.trainingRef || null;
        }
    } catch (e: any) {
        if (e.code !== 404 && !String(e?.message || "").toLowerCase().includes("not found")) {
            throw new Error(`[dbService] Failed to read existing permanent JID backup ${docId}: ${e?.message || e}`);
        }
        currentJidTrainingRef = null;
    }

    let newTrainingRef: BotTrainingRef | null = null;
    let writtenNewGeneration = false;
    let shouldCleanupOldGen = false;
    const oldGeneration = currentJidTrainingRef?.generation;
    const oldChunkCount = currentJidTrainingRef?.chunkCount;

    if (hasTrainingContent) {
        if (currentJidTrainingRef && currentJidTrainingRef.checksum === checksum) {
            operationalConfig.trainingRef = currentJidTrainingRef;
        } else {
            newTrainingRef = await saveJidTrainingPayload(
                DATABASE_ID,
                jid,
                trainingPayload,
                databases,
                currentJidTrainingRef?.generation,
                COLLECTIONS.SYSTEM_CONFIGS
            );
            operationalConfig.trainingRef = newTrainingRef;
            writtenNewGeneration = true;
            shouldCleanupOldGen = true;
        }
    } else {
        delete operationalConfig.trainingRef;
        shouldCleanupOldGen = Boolean(oldGeneration);
    }

    const data = {
        value: JSON.stringify(operationalConfig),
        updated_at: now()
    };

    try {
        await databases.updateDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, docId, data);
    } catch (e: any) {
        if (e.code === 404 || String(e?.message || "").toLowerCase().includes("not found")) {
            await databases.createDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, docId, data);
        } else {
            throw new Error(`[dbService] Failed to write permanent JID config ${docId}: ${e?.message || e}`);
        }
    }

    // ONLY after successful save -> cleanup old generation chunks
    if (shouldCleanupOldGen && oldGeneration && oldGeneration !== newTrainingRef?.generation) {
        cleanupOldJidGenerationChunks(
            databases,
            DATABASE_ID,
            jid,
            oldGeneration,
            oldChunkCount || 10,
            COLLECTIONS.SYSTEM_CONFIGS
        ).catch((err) => {
            console.warn(`[dbService] Non-fatal cleanup warning for JID ${jid} old generation g${oldGeneration}:`, (err as any)?.message || err);
        });
    }
}

export async function loadPermanentJidConfig(jid: string): Promise<any | null> {
    if (!jid) return null;
    const docId = getPermanentJidDocId(jid);
    const legacyDocId = `jid_cfg_${jid.replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 36)}`;

    let rawValue: string | null = null;
    try {
        const response = await databases.getDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, docId) as any;
        if (response && response.value) {
            rawValue = response.value;
        }
    } catch (e: any) {
        // Fallback for legacy monolithic document docId
        try {
            const legacyResponse = await databases.getDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, legacyDocId) as any;
            if (legacyResponse && legacyResponse.value) {
                rawValue = legacyResponse.value;
            }
        } catch {}
    }

    if (!rawValue) return null;

    try {
        const parsed = JSON.parse(rawValue);
        if (parsed?.trainingRef) {
            const training = await loadJidTrainingPayload(
                DATABASE_ID,
                jid,
                databases,
                parsed.trainingRef,
                COLLECTIONS.SYSTEM_CONFIGS
            );
            if (training) {
                return mergeTrainingIntoConfig(parsed, training);
            }
        }
        return parsed;
    } catch (e: any) {
        console.warn(`[dbService] Failed to parse permanent JID config for ${jid}:`, e?.message || e);
        return null;
    }
}

function userExtraConfigDocId(userId: string) {
    return `user_extra_${String(userId || "").replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 24)}`;
}

async function loadUserExtraConfig(userId: string): Promise<any> {
    if (!userId) return {};
    try {
        const response = await databases.getDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, userExtraConfigDocId(userId));
        const data = response as any;
        return data?.value ? JSON.parse(data.value) : {};
    } catch {
        return {};
    }
}

async function saveUserExtraConfig(userId: string, patch: any) {
    if (!userId || !patch || Object.keys(patch).length === 0) return;
    const existing = await loadUserExtraConfig(userId);
    const data = {
        value: JSON.stringify({ ...existing, ...patch }),
        updated_at: now()
    };
    try {
        await databases.updateDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, userExtraConfigDocId(userId), data);
    } catch (e: any) {
        if (e.code === 404) {
            await databases.createDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, userExtraConfigDocId(userId), data);
        } else {
            throw e;
        }
    }
}

export async function getUserExtraConfig(userId: string): Promise<any> {
    return loadUserExtraConfig(userId);
}

export async function getUserExtraConfigValue(userId: string, key: string) {
    const extraConfig = await loadUserExtraConfig(userId);
    return extraConfig?.[key];
}

export async function saveUserExtraConfigPatch(userId: string, patch: any) {
    return saveUserExtraConfig(userId, patch);
}

function isUnsupportedBusinessTimezoneConfigError(error: any) {
    const message = String(error?.message || "");
    return error?.code === 400 && /unknown attribute:\s*"business_timezone"/i.test(message);
}

async function saveBusinessTimezoneFallback(userId: string, data: Record<string, any>) {
    if (!("business_timezone" in (data || {}))) return data;
    await saveUserExtraConfig(userId, { business_timezone: data.business_timezone });
    const safeData = { ...(data || {}) };
    delete safeData.business_timezone;
    return safeData;
}

async function saveDelayedReadFallback(userId: string, data: Record<string, any>) {
    const patch: Record<string, any> = {};
    if ("delayed_read_receipts_enabled" in (data || {})) patch.delayed_read_receipts_enabled = data.delayed_read_receipts_enabled;
    if ("read_receipt_delay_seconds" in (data || {})) patch.read_receipt_delay_seconds = data.read_receipt_delay_seconds;
    if (Object.keys(patch).length > 0) {
        await saveUserExtraConfig(userId, patch);
    }
    const safeData = { ...(data || {}) };
    delete safeData.delayed_read_receipts_enabled;
    delete safeData.read_receipt_delay_seconds;
    return safeData;
}

export async function saveProduct(userId: string, product: any) {
    const safeProduct = sanitizeProductForAiCost(product);
    const id = product.id || product.$id || `${now()}-${Math.random().toString(36).substr(2, 9)}`;
    const safeType = String(safeProduct.type || product.type || (safeProduct.category === 'service' ? 'service' : '') || '').toLowerCase().trim();
    const resolvedType = safeType === 'service' || safeType === 'digital' ? 'service' : (safeType === 'physical' ? 'physical' : (product.type || 'physical'));
    const data: any = {
        user_id: userId,
        name: safeProduct.name,
        description: safeProduct.description,
        base_price: Number(safeProduct.base_price) || 0,
        stock: Number(safeProduct.stock) || 0,
        variations_json: JSON.stringify({
           sku: safeProduct.sku || '',
           type: resolvedType,
           cost_price: Number(safeProduct.cost_price) || 0,
           variations: safeProduct.variations || [],
           metadata: safeProduct.metadata || safeProduct.integration_metadata || {}
        }),
        updated_at: now()
    };
    if (safeProduct.sku && typeof safeProduct.sku === 'string') {
        data.sku = safeProduct.sku; // Save to actual attribute if it exists in schema
    }
    try {
        await databases.updateDocument(DATABASE_ID, COLLECTIONS.PRODUCTS, id, data);
    } catch (e: any) {
        if (e.code === 404) {
            try {
                await databases.createDocument(DATABASE_ID, COLLECTIONS.PRODUCTS, id, data);
            } catch (createErr: any) {
                if (createErr.code === 400 && createErr.message.includes('sku')) {
                    delete data.sku;
                    await databases.createDocument(DATABASE_ID, COLLECTIONS.PRODUCTS, id, data);
                } else {
                    throw createErr;
                }
            }
        } else if (e.code === 400 && e.message.includes('sku')) {
            // If sku attribute does not exist in schema, fallback to not saving the top-level attribute
            delete data.sku;
            try {
                await databases.updateDocument(DATABASE_ID, COLLECTIONS.PRODUCTS, id, data);
            } catch(nestedErr: any) {
               if (nestedErr.code === 404) await databases.createDocument(DATABASE_ID, COLLECTIONS.PRODUCTS, id, data);
               else throw nestedErr;
            }
        } else {
            throw e;
        }
    }
}

export async function deleteProduct(userId: string, productId: string) {
    try {
        await databases.deleteDocument(DATABASE_ID, COLLECTIONS.PRODUCTS, productId);
    } catch (e) {}
}

export async function listProducts(userId: string): Promise<any[]> {
    try {
        const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.PRODUCTS, [
            Query.equal('user_id', userId)
        ]);
        return response.documents.map((p: any) => {
            let parsed = [];
            let _sku = p.sku || "";
            let _cost = 0;
            let _metadata = {};
            let _type = p.type || "physical";
            try {
                const parsedJson = JSON.parse(p.variations_json || '[]');
                if (!Array.isArray(parsedJson) && parsedJson.variations) {
                    parsed = parsedJson.variations;
                    _sku = parsedJson.sku || p.sku || "";
                    _cost = parsedJson.cost_price || 0;
                    _metadata = parsedJson.metadata || {};
                    if (parsedJson.type) _type = parsedJson.type;
                } else if (!Array.isArray(parsedJson) && parsedJson.type) {
                    _type = parsedJson.type;
                } else {
                    parsed = parsedJson;
                }
            } catch(e) {}
            return {
                ...p,
                id: p.$id,
                type: _type,
                sku: _sku,
                cost_price: _cost,
                metadata: _metadata,
                variations: parsed
            };
        });
    } catch (e: any) {
        console.error("[Follow-up Bot] Due customer scan failed:", e?.message || e);
        return [];
    }
}

export async function saveUserConfig(userId: string, config: any) {
    const existing = await loadUserConfig(userId) || {};
    const data = buildUserConfigWritePayload(config, existing);
    if (Object.keys(data).length === 0) return { success: true, skipped: true };

    try {
        await databases.updateDocument(DATABASE_ID, COLLECTIONS.USER_CONFIGS, userId, data);
        console.log(`[saveUserConfig] Saved configs for user: ${userId}`);
        return { success: true };
    } catch (e: any) {
        if (isUnsupportedBusinessTimezoneConfigError(e)) {
            const safeData = await saveBusinessTimezoneFallback(userId, data);
            if (Object.keys(safeData).length === 1 && safeData.updated_at) {
                return { success: true, warning: "Business timezone saved in compatibility storage." };
            }
            await databases.updateDocument(DATABASE_ID, COLLECTIONS.USER_CONFIGS, userId, safeData);
            return { success: true, warning: "Business timezone saved in compatibility storage." };
        }
        if (isUnsupportedDhlUserConfigError(e)) {
            const safeData = stripDhlFieldsFromUserConfigPayload(data);
            if (Object.keys(safeData).length === 1 && safeData.updated_at) {
                return { success: true, warning: "DHL settings are not available in this environment yet and were not saved." };
            }
            await databases.updateDocument(DATABASE_ID, COLLECTIONS.USER_CONFIGS, userId, safeData);
            return { success: true, warning: "DHL settings are not available in this environment yet and were not saved." };
        }
        if (isUnsupportedDelayedReadConfigError(e)) {
            const safeData = await saveDelayedReadFallback(userId, data);
            if (Object.keys(safeData).length === 1 && safeData.updated_at) {
                return { success: true };
            }
            await databases.updateDocument(DATABASE_ID, COLLECTIONS.USER_CONFIGS, userId, safeData);
            return { success: true };
        }
        if (e.code === 404) {
            try {
                await databases.createDocument(DATABASE_ID, COLLECTIONS.USER_CONFIGS, userId, { ...data, user_id: userId });
                console.log(`[saveUserConfig] Created configs for user: ${userId}`);
                return { success: true };
            } catch (err) {
                if (isUnsupportedBusinessTimezoneConfigError(err)) {
                    const safeData = await saveBusinessTimezoneFallback(userId, data);
                    await databases.createDocument(DATABASE_ID, COLLECTIONS.USER_CONFIGS, userId, { ...safeData, user_id: userId });
                    return { success: true, warning: "Business timezone saved in compatibility storage." };
                }
                if (isUnsupportedDhlUserConfigError(err)) {
                    const safeData = stripDhlFieldsFromUserConfigPayload(data);
                    await databases.createDocument(DATABASE_ID, COLLECTIONS.USER_CONFIGS, userId, { ...safeData, user_id: userId });
                    return { success: true, warning: "DHL settings are not available in this environment yet and were not saved." };
                }
                if (isUnsupportedDelayedReadConfigError(err)) {
                    const safeData = await saveDelayedReadFallback(userId, data);
                    await databases.createDocument(DATABASE_ID, COLLECTIONS.USER_CONFIGS, userId, { ...safeData, user_id: userId });
                    return { success: true };
                }
                console.error(`[saveUserConfig] Error creating config for user: ${userId}`, err);
                throw err;
            }
        } else {
            console.error(`[saveUserConfig] Error updating config for user: ${userId}`, e);
            throw e;
        }
    }
}

export async function loadUserConfig(userId: string): Promise<any> {
    try {
        const user = await getUser(userId) as any;
        if (!user) return { usage_cost: 0, billing_limit: 10 };

        const actualUserId = user.$id;
        let configRow: any = null;
        try {
            configRow = await databases.getDocument(DATABASE_ID, COLLECTIONS.USER_CONFIGS, actualUserId);
        } catch (e: any) {
            if (e.code === 404) {
                configRow = await databases.createDocument(DATABASE_ID, COLLECTIONS.USER_CONFIGS, actualUserId, {
                    user_id: actualUserId,
                    usage_cost: 0,
                    billing_limit: 10,
                    updated_at: now()
                });
            }
        }

        if (configRow) {
            let groups = [];
            try { groups = configRow.groups_json ? JSON.parse(configRow.groups_json) : []; } catch(e) {}
            let custom_fields = [];
            try { custom_fields = configRow.custom_fields_json ? JSON.parse(configRow.custom_fields_json) : []; } catch(e) {}
            let followups = [];
            try { followups = configRow.followups_json ? JSON.parse(configRow.followups_json) : []; } catch(e) {}
            const extraConfig = await loadUserExtraConfig(actualUserId);

            return {
                ...configRow,
                ...user,
                ...extraConfig,
                user_id: actualUserId,
                groups,
                custom_fields,
                followups,
                is_auto_reply: configRow.is_auto_reply === 1,
                auto_reload_enabled: configRow.auto_reload_enabled === 1,
                auto_reload_minutes: configRow.auto_reload_minutes ?? 5,
                usage_cost: configRow.usage_cost || 0,
                billing_limit: configRow.billing_limit || 10,
                system_alerts_enabled: configRow.system_alerts_enabled === 0 ? false : true,
                billing_alerts_enabled: configRow.billing_alerts_enabled === 0 ? false : true,
                proxy_alerts_enabled: configRow.proxy_alerts_enabled === 0 ? false : true,
                order_alerts_enabled: configRow.order_alerts_enabled === 0 ? false : true,
                last_expiry_alert_sent: configRow.last_expiry_alert_sent || 0,
                wallet_balance: user.wallet_balance || 0,
                extra_product_bundles: user.extra_product_bundles || 0,
                role: user.role || 'user'
            };
        }
    } catch (e) {
        console.error("[Appwrite] loadUserConfig error:", e);
    }
    return { usage_cost: 0, billing_limit: 10 };
}

type UsageGuardrailState = {
    totalCost: number;
    counts: Record<string, number>;
    updatedAt: number;
};

type ChargeUsageOptions = {
    amount?: number;
    dedupeKey?: string;
    description?: string;
};

type ChargeUsageItem = {
    action: BillableUsageAction;
    amount?: number;
    dedupeKey?: string;
    description?: string;
};

type UsageChargeLogContext = {
    action: BillableUsageAction;
    userId?: string;
    botId?: string;
    customerJid?: string;
    eventId?: string;
    messageId?: string;
    requestId?: string;
    reason?: string;
};

function normalizeUsageChargePart(value: any) {
    return String(value || "")
        .trim()
        .replace(/[^a-zA-Z0-9@._:-]+/g, "_")
        .slice(0, 120);
}

function maskUsageChargeJid(value: string) {
    const normalized = normalizeUsageChargePart(value);
    if (!normalized) return "";
    const [local, domain] = normalized.split("@");
    if (!domain) {
        return local.length <= 6 ? local : `${local.slice(0, 3)}...${local.slice(-2)}`;
    }
    const maskedLocal = local.length <= 6 ? local : `${local.slice(0, 3)}...${local.slice(-2)}`;
    return `${maskedLocal}@${domain}`;
}

export function buildUsageChargeDedupeKey(action: BillableUsageAction, parts: Array<string | number | null | undefined>) {
    const normalizedParts = parts
        .map((part) => normalizeUsageChargePart(part))
        .filter(Boolean);
    const payload = `${action}|${normalizedParts.join("|")}`;
    const hash = crypto.createHash("sha1").update(payload).digest("hex").slice(0, 24);
    return `usage_${hash}`;
}

export function logUsageChargeFailure(context: UsageChargeLogContext) {
    const tags = [
        `action=${normalizeUsageChargePart(context.action)}`,
        `user=${normalizeUsageChargePart(context.userId) || "unknown"}`,
        `bot=${normalizeUsageChargePart(context.botId) || "unknown"}`,
        `customer=${maskUsageChargeJid(String(context.customerJid || "")) || "n/a"}`,
        `event=${normalizeUsageChargePart(context.eventId) || "n/a"}`,
        `message=${normalizeUsageChargePart(context.messageId) || "n/a"}`,
        `request=${normalizeUsageChargePart(context.requestId) || "n/a"}`,
        `reason=${normalizeUsageChargePart(context.reason) || "unknown"}`
    ];
    console.warn(`[Billing] charge_not_recorded ${tags.join(" ")}`);
}

export function billingLockKey(userId: string) {
    const hash = crypto.createHash("sha1").update(String(userId || "")).digest("hex").slice(0, 24);
    return `block_${hash}`;
}

export function billingChargeMarkerKey(userId: string, dedupeKey: string) {
    const hash = crypto.createHash("sha1").update(`${userId}:${dedupeKey}`).digest("hex").slice(0, 24);
    return `bchg_${hash}`;
}

export function billingGuardrailKey(scope: "daily" | "monthly", userId: string, stamp: string) {
    const compactUserHash = crypto.createHash("sha1").update(String(userId || "")).digest("hex").slice(0, 10);
    const scopeKey = scope === "daily" ? "d" : "m";
    return `bgd_${scopeKey}_${compactUserHash}_${stamp}`;
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function acquireBillingLock(userId: string, timeoutMs = 6000) {
    const key = billingLockKey(userId);
    const token = crypto.randomBytes(8).toString("hex");
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
        try {
            await databases.createDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, key, {
                value: JSON.stringify({ token, acquiredAt: Date.now() }),
                updated_at: now()
            });
            return async () => {
                try {
                    const existing = await databases.getDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, key);
                    const raw = JSON.parse(String((existing as any)?.value || "{}"));
                    if (raw?.token === token) {
                        await databases.deleteDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, key).catch(() => {});
                    }
                } catch {}
            };
        } catch {
            try {
                const existing = await databases.getDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, key);
                const raw = JSON.parse(String((existing as any)?.value || "{}"));
                const acquiredAt = Number(raw?.acquiredAt || 0);
                if (acquiredAt && Date.now() - acquiredAt > 15000) {
                    await databases.deleteDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, key).catch(() => {});
                    continue;
                }
            } catch {}
            await sleep(150);
        }
    }

    throw new Error(`Timed out waiting for billing lock for ${userId}`);
}

function parseGuardrailState(raw: any): UsageGuardrailState {
    if (!raw) {
        return { totalCost: 0, counts: {}, updatedAt: now() };
    }
    try {
        const parsed = JSON.parse(String(raw));
        return {
            totalCost: Math.max(0, Number(parsed?.totalCost || 0)),
            counts: typeof parsed?.counts === "object" && parsed?.counts ? parsed.counts : {},
            updatedAt: Number(parsed?.updatedAt || now())
        };
    } catch {
        return { totalCost: 0, counts: {}, updatedAt: now() };
    }
}

function getGuardrailStamps(currentTime = new Date()) {
    const year = currentTime.getUTCFullYear();
    const month = String(currentTime.getUTCMonth() + 1).padStart(2, "0");
    const day = String(currentTime.getUTCDate()).padStart(2, "0");
    return {
        daily: `${year}${month}${day}`,
        monthly: `${year}${month}`
    };
}

function resolveLegacyUsageAction(type: string): BillableUsageAction {
    const value = String(type || "").toLowerCase();
    if (value.includes("helper")) return "helper_chat_reply";
    if (value.includes("audio")) return "customer_ai_audio_understanding";
    if (value.includes("image") || value.includes("vision")) return "customer_ai_image_understanding";
    if (value.includes("voice")) return "customer_ai_voice_reply";
    if (value.includes("marketing_auto_bot")) return "marketing_auto_bot_text";
    if (value.includes("customer_update_stock")) return "customer_update_stock_text";
    if (value.includes("customer_update_scheduled")) return "customer_update_scheduled_text";
    if (value.includes("broadcast")) return "broadcast_tracking_text";
    return "customer_ai_text_reply";
}

function buildGuardrailDecision(input: {
    action: BillableUsageAction;
    amount: number;
    cost: number;
    daily: UsageGuardrailState;
    monthly: UsageGuardrailState;
}) {
    const analyticsType = getUsageBillingDefinition(input.action).analyticsType;
    const nextDailyCost = input.daily.totalCost + input.cost;
    const nextMonthlyCost = input.monthly.totalCost + input.cost;
    if (nextDailyCost > ACCOUNT_USAGE_GUARDRAILS.dailySpendUsd) {
        return `Daily AI usage cap reached ($${ACCOUNT_USAGE_GUARDRAILS.dailySpendUsd.toFixed(2)}).`;
    }
    if (nextMonthlyCost > ACCOUNT_USAGE_GUARDRAILS.monthlySpendUsd) {
        return `Monthly AI usage cap reached ($${ACCOUNT_USAGE_GUARDRAILS.monthlySpendUsd.toFixed(2)}).`;
    }
    return "";
}

async function readGuardrailState(scope: "daily" | "monthly", userId: string, stamp: string) {
    return parseGuardrailState(await getGlobalSetting(billingGuardrailKey(scope, userId, stamp)));
}

async function writeGuardrailState(scope: "daily" | "monthly", userId: string, stamp: string, state: UsageGuardrailState) {
    await setGlobalSetting(billingGuardrailKey(scope, userId, stamp), JSON.stringify(state));
}

export async function chargeUsageAction(userId: string, action: BillableUsageAction, options: ChargeUsageOptions = {}) {
    return chargeUsageActions(userId, [{
        action,
        amount: options.amount,
        dedupeKey: options.dedupeKey,
        description: options.description,
    }]);
}

export async function chargeUsageActions(userId: string, items: ChargeUsageItem[]) {
    if (!userId) return { charged: false, reason: "user_not_found", cost: 0 };
    const initialUser = await getUser(userId) as any;
    if (!initialUser || !initialUser.$id) return { charged: false, reason: "user_not_found", cost: 0 };

    const canonicalUserId = initialUser.$id;
    const releaseLock = await acquireBillingLock(canonicalUserId);
    try {
        const normalizedItems = (Array.isArray(items) ? items : [])
            .map((item) => ({
                action: item.action,
                amount: Math.max(1, Number(item.amount || 1)),
                definition: getUsageBillingDefinition(item.action),
                dedupeKey: item.dedupeKey || "",
                description: item.description || "",
            }))
            .filter((item) => item.definition);

        if (normalizedItems.length === 0) {
            return { charged: false, reason: "no_items", cost: 0, breakdown: [] };
        }

        const itemMarkers = await Promise.all(normalizedItems.map(async (item) => {
            const markerKey = item.dedupeKey ? billingChargeMarkerKey(canonicalUserId, item.dedupeKey) : "";
            const isDuplicate = markerKey ? Boolean(await getGlobalSetting(markerKey)) : false;
            return { ...item, markerKey, isDuplicate };
        }));
        const chargeableItems = itemMarkers.filter((item) => !item.isDuplicate);
        if (chargeableItems.length === 0) {
            return { charged: false, duplicate: true, cost: 0, breakdown: [] };
        }

        const freshUser = await databases.getDocument(DATABASE_ID, COLLECTIONS.USERS, canonicalUserId).catch(() => null) as any;
        const user = freshUser || initialUser;
        const totalCost = Number(chargeableItems.reduce((sum, item) => (
            sum + Number((item.definition.priceUsd * item.amount).toFixed(6))
        ), 0).toFixed(6));
        if (totalCost <= 0) {
            return { charged: false, reason: "zero_cost", cost: 0, breakdown: [] };
        }
        const balance = Math.max(0, Number(user.wallet_balance || 0));
        if (balance < totalCost) {
            const labels = chargeableItems.map((item) => item.definition.label).join(", ");
            await addWalletTransaction(user.$id, 0, "ai_usage_blocked", `${labels} blocked because wallet balance was insufficient for $${totalCost.toFixed(3)}.`);
            emitLiveConsoleEvent({
                type: "insufficient_wallet",
                level: "warn",
                scope: "account",
                accountId: user.$id,
                title: "Wallet charge blocked",
                message: `${labels} blocked because wallet balance was insufficient.`,
                reason: "insufficient_wallet",
                metadata: { cost: totalCost, balance },
            });
            return { charged: false, reason: "insufficient_funds", cost: totalCost, balance };
        }

        const stamps = getGuardrailStamps();
        const [dailyState, monthlyState] = await Promise.all([
            readGuardrailState("daily", user.$id, stamps.daily),
            readGuardrailState("monthly", user.$id, stamps.monthly),
        ]);
        const nextDaily: UsageGuardrailState = {
            totalCost: Number(dailyState.totalCost || 0),
            counts: { ...(dailyState.counts || {}) },
            updatedAt: dailyState.updatedAt || now(),
        };
        const nextMonthly: UsageGuardrailState = {
            totalCost: Number(monthlyState.totalCost || 0),
            counts: { ...(monthlyState.counts || {}) },
            updatedAt: monthlyState.updatedAt || now(),
        };

        for (const item of chargeableItems) {
            const itemCost = Number((item.definition.priceUsd * item.amount).toFixed(6));
            const guardrailReason = buildGuardrailDecision({
                action: item.action,
                amount: item.amount,
                cost: itemCost,
                daily: nextDaily,
                monthly: nextMonthly,
            });
            if (guardrailReason) {
                console.warn(`[Billing] guardrail_blocked user=${user.$id} action=${item.action} reason=${guardrailReason}`);
                await addWalletTransaction(user.$id, 0, "billing_guardrail_blocked", `${item.definition.label} blocked. ${guardrailReason}`);
                emitLiveConsoleEvent({
                    type: "wallet_not_charged",
                    level: "warn",
                    scope: "account",
                    accountId: user.$id,
                    title: "Wallet charge blocked",
                    message: `${item.definition.label} blocked by billing guardrail.`,
                    reason: "guardrail_blocked",
                    metadata: { action: item.action, cost: itemCost },
                });
                return { charged: false, reason: "guardrail_blocked", message: guardrailReason, cost: totalCost };
            }
            nextDaily.totalCost = Number((nextDaily.totalCost + itemCost).toFixed(6));
            nextDaily.counts[item.definition.analyticsType] = Number(nextDaily.counts[item.definition.analyticsType] || 0) + item.amount;
            nextMonthly.totalCost = Number((nextMonthly.totalCost + itemCost).toFixed(6));
            nextMonthly.counts[item.definition.analyticsType] = Number(nextMonthly.counts[item.definition.analyticsType] || 0) + item.amount;
        }

        const config = await loadUserConfig(user.$id);
        const nextBalance = Number((balance - totalCost).toFixed(6));
        const nextUsageCost = Number((Number(config?.usage_cost || 0) + totalCost).toFixed(6));
        await databases.updateDocument(DATABASE_ID, COLLECTIONS.USERS, user.$id, {
            wallet_balance: nextBalance
        });
        await databases.updateDocument(DATABASE_ID, COLLECTIONS.USER_CONFIGS, user.$id, {
            usage_cost: nextUsageCost
        });
        const chargedAt = now();
        console.log(`[UsageBilling] usage_charge_recorded userId=${user.$id} totalCost=${totalCost} itemsCount=${chargeableItems.length}`);
        await Promise.all(chargeableItems.map(async (item) => {
            const itemCost = Number((item.definition.priceUsd * item.amount).toFixed(6));
            try {
                await databases.createDocument(DATABASE_ID, COLLECTIONS.USAGE_ANALYTICS, ID.unique(), {
                    user_id: user.$id,
                    timestamp: chargedAt,
                    type: item.definition.analyticsType,
                    cost: itemCost,
                    amount: item.amount
                });
                console.log(`[UsageBilling] usage_analytics_persisted userId=${user.$id} type=${item.definition.analyticsType} cost=${itemCost}`);
            } catch (analyticErr: any) {
                console.error(`[UsageBilling] usage_analytics_failed userId=${user.$id} type=${item.definition.analyticsType} error=${analyticErr?.message || analyticErr}`);
            }
            await addWalletTransaction(
                user.$id,
                -Math.abs(itemCost),
                `ai_${item.definition.analyticsType}_debit`,
                item.description || buildUsageChargeDescription({ action: item.action, amount: item.amount })
            );
            console.log(`[UsageBilling] usage_wallet_debit_succeeded userId=${user.$id} type=ai_${item.definition.analyticsType}_debit cost=${itemCost}`);
        }));

        nextDaily.updatedAt = chargedAt;
        nextMonthly.updatedAt = chargedAt;
        await Promise.all([
            writeGuardrailState("daily", user.$id, stamps.daily, nextDaily),
            writeGuardrailState("monthly", user.$id, stamps.monthly, nextMonthly),
        ]);
        await Promise.all(chargeableItems.map(async (item) => {
            if (!item.markerKey) return;
            await setGlobalSetting(item.markerKey, JSON.stringify({
                userId: user.$id,
                action: item.action,
                totalCost: Number((item.definition.priceUsd * item.amount).toFixed(6)),
                amount: item.amount,
                chargedAt: Date.now()
            }));
        }));
        const hostedAiReplies = chargeableItems
            .filter((item) => item.action === "customer_ai_text_reply")
            .reduce((sum, item) => sum + Number(item.amount || 1), 0);
        const paidAccessConfirmed = hostedAiReplies > 0
            ? await hasPaidAccessEvidence(user.$id, user).catch(() => false)
            : false;
        if (hostedAiReplies > 0 && getBillingAccess({ ...user, paid_access_confirmed: paidAccessConfirmed }).trialActive) {
            const nextTrialRepliesUsed = await incrementTrialAiReplyUsage(user.$id, hostedAiReplies).catch(() => 0);
            if (nextTrialRepliesUsed >= APP_TRIAL_FREE_AI_REPLIES) {
                await addWalletTransaction(
                    user.$id,
                    0,
                    "trial_free_reply_limit_reached",
                    `Trial hosted AI free reply limit reached (${APP_TRIAL_FREE_AI_REPLIES}/${APP_TRIAL_FREE_AI_REPLIES}).`
                ).catch(() => {});
            }
        }
        emitLiveConsoleEvent({
            type: "wallet_charged",
            level: "success",
            scope: "account",
            accountId: user.$id,
            title: "Wallet charged",
            message: `Charged $${totalCost.toFixed(3)} for ${chargeableItems.length} usage action(s).`,
            status: "charged",
            metadata: {
                cost: totalCost,
                actions: chargeableItems.map((item) => item.action).join(","),
            },
        });
        return {
            charged: true,
            cost: totalCost,
            walletBalance: nextBalance,
            breakdown: chargeableItems.map((item) => ({
                action: item.action,
                analyticsType: item.definition.analyticsType,
                amount: item.amount,
                cost: Number((item.definition.priceUsd * item.amount).toFixed(6)),
            })),
        };
    } catch (e: any) {
        console.error(`[Appwrite] chargeUsageAction error user=${normalizeUsageChargePart(userId) || "unknown"} code=${normalizeUsageChargePart(e?.code || e?.type || "exception")}`);
        emitLiveConsoleEvent({
            type: "wallet_not_charged",
            level: "error",
            scope: "account",
            accountId: userId,
            title: "Wallet charge failed",
            message: "Usage charge could not be recorded.",
            reason: "charge_exception",
        });
        return { charged: false, reason: "error", cost: 0 };
    } finally {
        await releaseLock().catch(() => {});
    }
}

export async function incrementUsageCost(userId: string, cost: number, type: string = "text", amount: number = 1) {
    const action = resolveLegacyUsageAction(type);
    return chargeUsageAction(userId, action, {
        amount,
        description: buildUsageChargeDescription({ action, amount })
    });
}

export async function loadBotConfig(botId: string): Promise<any> {
    try {
        const response = await databases.getDocument(DATABASE_ID, COLLECTIONS.BOTS, botId);
        const data = response as any;
        if (data && data.config_settings) {
            const operational = typeof data.config_settings === 'string'
                ? JSON.parse(data.config_settings)
                : data.config_settings;

            if (operational?.trainingRef) {
                const training = await loadBotTrainingPayload(
                    DATABASE_ID,
                    botId,
                    databases,
                    operational.trainingRef,
                    COLLECTIONS.SYSTEM_CONFIGS
                );
                if (!training) {
                    throw new Error(`[TrainingStorage] Critical: Unable to reconstruct authoritative bot training for bot ${botId} (generation g${operational.trainingRef.generation}).`);
                }
                return mergeTrainingIntoConfig(operational, training);
            }
            // Fallback for legacy configs that had training embedded directly in config_settings
            return operational;
        }
    } catch (e: any) {
        if (e?.message && e.message.includes("[TrainingStorage] Critical:")) {
            throw e;
        }
        console.warn(`[dbService] loadBotConfig error for bot ${botId}:`, e?.message || e);
    }
    return null;
}

export async function getBotProviderConfig(botId: string): Promise<WhatsAppProviderConfig> {
    try {
        const response = await databases.getDocument(DATABASE_ID, COLLECTIONS.BOTS, botId);
        if (response) {
            return readProviderConfigFromBotDocument(response);
        }
    } catch (e) {}
    return { providerType: "whatsapp_web" };
}

export async function findBotByCloudApiPhoneNumberId(phoneNumberId: string): Promise<{
    botId: string;
    userId: string;
    name: string;
    providerType: string;
    phoneNumberId: string;
} | null> {
    const cleanPhoneId = (phoneNumberId || "").trim();
    if (!cleanPhoneId) return null;

    let offset = 0;
    const pageSize = 100;
    try {
        while (true) {
            const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.BOTS, [
                Query.limit(pageSize),
                Query.offset(offset)
            ]);
            if (!response || !response.documents || response.documents.length === 0) {
                break;
            }

            for (const doc of response.documents) {
                try {
                    const config = readProviderConfigFromBotDocument(doc);
                    if (config.providerType === "whatsapp_cloud_api" && config.phoneNumberId === cleanPhoneId) {
                        return {
                            botId: doc.$id,
                            userId: doc.user_id || "",
                            name: doc.name || "",
                            providerType: "whatsapp_cloud_api",
                            phoneNumberId: config.phoneNumberId,
                        };
                    }
                } catch (e) {
                    // Safe parsing error ignore
                }
            }

            if (response.documents.length < pageSize) {
                break;
            }

            const total = typeof response.total === "number" ? response.total : undefined;
            if (total !== undefined && offset + pageSize >= total) {
                break;
            }

            offset += pageSize;
        }
    } catch (e) {
        // Appwrite list failure handling
    }
    return null;
}

export async function findBotByCloudApiWabaId(wabaId: string): Promise<{
    botId: string;
    userId: string;
    name: string;
    providerType: string;
    businessAccountId: string;
} | null> {
    const cleanWabaId = (wabaId || "").trim();
    if (!cleanWabaId) return null;

    let offset = 0;
    const pageSize = 100;
    try {
        while (true) {
            const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.BOTS, [
                Query.limit(pageSize),
                Query.offset(offset)
            ]);
            if (!response || !response.documents || response.documents.length === 0) {
                break;
            }

            for (const doc of response.documents) {
                try {
                    const config = readProviderConfigFromBotDocument(doc);
                    if (config.providerType === "whatsapp_cloud_api" && config.businessAccountId === cleanWabaId) {
                        return {
                            botId: doc.$id,
                            userId: doc.user_id || "",
                            name: doc.name || "",
                            providerType: "whatsapp_cloud_api",
                            businessAccountId: config.businessAccountId,
                        };
                    }
                } catch (e) {
                    // Safe parsing error ignore
                }
            }

            if (response.documents.length < pageSize) {
                break;
            }

            const total = typeof response.total === "number" ? response.total : undefined;
            if (total !== undefined && offset + pageSize >= total) {
                break;
            }

            offset += pageSize;
        }
    } catch (e) {
        // Appwrite list failure handling
    }
    return null;
}

export async function saveBotProviderConfig(
    botId: string,
    providerInput: unknown,
    options?: { encryptSecret?: (raw: string) => string | Promise<string> }
): Promise<boolean> {
    try {
        const response = await databases.getDocument(DATABASE_ID, COLLECTIONS.BOTS, botId);
        if (!response) return false;

        const preparedConfig = await prepareCloudApiProviderConfigInput(providerInput, options);
        const updatedDoc = mergeProviderConfigIntoBotDocument(response, preparedConfig);

        await databases.updateDocument(
            DATABASE_ID,
            COLLECTIONS.BOTS,
            botId,
            {
                config_settings: typeof updatedDoc.config_settings === "string" 
                    ? updatedDoc.config_settings 
                    : JSON.stringify(updatedDoc.config_settings),
                updated_at: now()
            }
        );
        return true;
    } catch (e) {
        return false;
    }
}

export async function saveTemplateStore(botId: string, storeData: string, userId?: string) {
    await saveChunkedTemplateStore(botId, storeData, userId);

    // Keep the legacy bot field best-effort only. Some Appwrite schemas do not
    // have config_templates or cannot hold large serialized media payloads.
    try {
        await databases.updateDocument(DATABASE_ID, COLLECTIONS.BOTS, botId, { config_templates: storeData, updated_at: now() });
    } catch (e: any) {
        console.warn("[Appwrite] Legacy config_templates save skipped:", e?.message || e);
    }
}

export async function loadTemplateStore(botId: string): Promise<string | null> {
    try {
        const chunked = await loadChunkedTemplateStore(botId);
        if (chunked) return chunked;
    } catch (e: any) {
        console.error("[Appwrite] load chunked template store error:", e?.message || e);
    }

    try {
        const response = await databases.getDocument(DATABASE_ID, COLLECTIONS.BOTS, botId);
        const data = response as any;
        return data.config_templates || null;
    } catch (e) {
        return null;
    }
}

export async function getTemplateStoreCandidates(userId?: string, botId?: string): Promise<string[]> {
    const targetUserId = userId?.trim();
    if (!targetUserId && !botId) return [];

    let resolvedUserId = targetUserId;
    const allBotsLookup: Array<{ id: string; userId: string }> = [];

    // If userId was not passed, resolve from BOTS using botId
    if (!resolvedUserId && botId) {
        try {
            const botDoc = await databases.getDocument(DATABASE_ID, COLLECTIONS.BOTS, botId) as any;
            if (botDoc?.user_id) {
                resolvedUserId = botDoc.user_id;
            }
        } catch {}
    }

    if (!resolvedUserId) {
        return [];
    }

    const activeBots: Array<{ id: string; userId: string; phoneNumber?: string }> = [];
    const userConfigs: Array<{ userId: string; adminNumber?: string }> = [];
    const deletedBotArchives: Array<{ userId: string; botId: string; phoneNumber?: string }> = [];
    const manifests: Array<{ key?: string; botId?: string; accountId?: string; userId?: string; version?: number }> = [];

    // 1. Fetch active bots strictly for resolvedUserId
    try {
        const bots = await databases.listDocuments(DATABASE_ID, COLLECTIONS.BOTS, [
            Query.equal("user_id", resolvedUserId),
            Query.limit(100)
        ]);
        for (const b of bots.documents) {
            if (b.user_id === resolvedUserId) {
                activeBots.push({
                    id: b.$id,
                    userId: b.user_id,
                    phoneNumber: b.phone_number,
                });
            }
        }
    } catch {}

    // 2. Fetch user config for admin number
    try {
        const userCfg = await databases.getDocument(DATABASE_ID, COLLECTIONS.USER_CONFIGS, resolvedUserId) as any;
        if (userCfg?.admin_number) {
            userConfigs.push({
                userId: resolvedUserId,
                adminNumber: userCfg.admin_number,
            });
        }
    } catch {}

    // 3. Fetch SYSTEM_CONFIGS to discover deleted bot archives and manifests
    try {
        const configs = await databases.listDocuments(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, [
            Query.limit(100)
        ]);
        for (const doc of configs.documents) {
            if (doc.$id.startsWith("deleted_bot_")) {
                try {
                    const parsed = JSON.parse(doc.value);
                    if (parsed.userId && parsed.botId) {
                        deletedBotArchives.push({
                            userId: parsed.userId,
                            botId: parsed.botId,
                            phoneNumber: parsed.phoneNumber,
                        });
                    }
                } catch {}
            }
            if (doc.$id.startsWith("tpl_") && doc.$id.endsWith("_manifest")) {
                try {
                    const parsed = JSON.parse(doc.value);
                    if (parsed.botId) {
                        manifests.push({
                            key: doc.$id,
                            botId: parsed.botId,
                            accountId: parsed.accountId || parsed.userId,
                            userId: parsed.userId || parsed.accountId,
                            version: parsed.version,
                        });
                    }
                } catch {}
            }
        }
    } catch {}

    // 4. Cross-tenant conflict guard: check foreign ownership for candidate bot IDs in manifests
    const candidateBotIdsFromManifests = manifests
        .map(m => m.botId)
        .filter((bId): bId is string => Boolean(bId && !activeBots.some(ab => ab.id === bId)));

    if (candidateBotIdsFromManifests.length > 0) {
        for (const candId of candidateBotIdsFromManifests) {
            try {
                const bDoc = await databases.getDocument(DATABASE_ID, COLLECTIONS.BOTS, candId) as any;
                if (bDoc && bDoc.user_id) {
                    allBotsLookup.push({ id: bDoc.$id, userId: bDoc.user_id });
                }
            } catch {}
        }
    }

    return resolveTenantTemplateStoreCandidates({
        userId: resolvedUserId,
        botId,
        activeBots,
        userConfigs,
        deletedBotArchives,
        manifests,
        allBotsLookup,
    });
}

export async function getSystemProxies() {
    try {
        const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.SYSTEM_PROXIES, [
            Query.limit(100)
        ]);
        // Load count simulation
        const bots = await databases.listDocuments(DATABASE_ID, COLLECTIONS.BOTS, [Query.limit(100)]);
        const usersList = await databases.listDocuments(DATABASE_ID, COLLECTIONS.USERS, [Query.limit(100)]);
        
        return response.documents.map((p: any) => {
            const loadCount = usersList.documents.filter((u: any) => u.assigned_proxy_url === p.url).length;
            return { ...p, load_count: loadCount };
        });
    } catch (e) {
        return [];
    }
}

export async function getOrAssignAutoProxy(userId: string): Promise<string | null> {
    const user = await getUser(userId) as any;
    if (!user) {
        console.error(`[Proxy] User ${userId} not found for proxy assignment.`);
        return null;
    }

    console.log(`[Proxy] Checking proxies for ${user.email} in ${config.mode} mode...`);
    const proxies = await getSystemProxies();
    console.log(`[Proxy] Found ${proxies.length} total proxies in system.`);

    if (user.assigned_proxy_url) {
        const assignedProxy = proxies.find((p: any) => p.url === user.assigned_proxy_url);
        // Keep a generically healthy assigned proxy sticky.
        if (assignedProxy && canKeepAssignedSystemProxy(assignedProxy)) {
            console.log(`[Proxy] Using already assigned proxy: ${user.assigned_proxy_url.split('@').pop()}`);
            return user.assigned_proxy_url;
        }
        if (assignedProxy?.error_msg) {
            console.log(`[Proxy] Assigned proxy has an error (${assignedProxy.error_msg}). Reassigning before WhatsApp connect...`);
        }
        console.log(`[Proxy] Assigned proxy ${user.assigned_proxy_url} is inactive or missing. Reassigning...`);
    }

    let availableProxy = proxies
        .filter((p: any) => canAssignSystemProxy(p))
        .sort((a: any, b: any) => a.load_count - b.load_count)[0] as any;

    if (availableProxy) {
        console.log(`[Proxy] Assigning new proxy: ${availableProxy.url.split('@').pop()}`);
        await databases.updateDocument(DATABASE_ID, COLLECTIONS.USERS, user.$id, { assigned_proxy_url: availableProxy.url });
        return availableProxy.url;
    }
    
    console.error(`[Proxy] FATAL: No active proxies available in ${config.mode} database (${DATABASE_ID}).`);
    return null;
}

async function listFollowupScanBots() {
    const allBots: any[] = [];
    const pageSize = 100;
    for (let offset = 0; offset < 5000; offset += pageSize) {
        const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.BOTS, [
            Query.limit(pageSize),
            Query.offset(offset)
        ]);
        allBots.push(...(response.documents as any[]));
        if (response.documents.length < pageSize) break;
    }
    return allBots;
}

async function hasFollowupDeliveryEvidence(ownerKeys: string[], customerJids: string[], followupId: string, lastMessageAt: number, expectedText = "") {
    const owners = Array.from(new Set(ownerKeys.filter(Boolean)));
    const jids = Array.from(new Set(customerJids.filter(Boolean)));

    for (const ownerKey of owners) {
        for (const jid of jids) {
            try {
                const profile = await getCustomerProfile(ownerKey, jid);
                if (getFollowupDelivery(profile, followupId)?.sentAt) return true;

                const history = await getChatHistory(ownerKey, jid, 30);
                if (expectedText && hasMatchingOutboundText(history, expectedText, now() - (14 * 24 * 60 * 60))) return true;
            } catch {}
        }
    }

    return false;
}

export async function getFollowupDueCustomers() {
    try {
        const bots = await listFollowupScanBots();
        
        const due: any[] = [];
        const nowTime = now();

        for (const bot of bots as any[]) {
            if (!bot.jid || bot.is_active === 0) continue;
            const user = await getUser(bot.user_id) as any;
            const accountOwnerKey = buildAccountDataOwnerKey(user || bot.user_id, bot.jid);
            const ownerCandidates = collectAccountDataOwnerCandidates(user || bot.user_id, [bot]);
            const config = parseConfigSettings(bot.config_settings) || {};
            let followups: any[] = parseFollowupList(config.followups_json);

            followups = followups
                .map((followup: any, index: number) => {
                    const campaignType = normalizeFollowupCampaignType(followup?.campaign_type);
                    return {
                        ...followup,
                        id: String(followup?.id || `followup_${index + 1}`),
                        name: String(followup?.name || followup?.label || (campaignType === "ai_smart_followup" ? "AI Smart Follow-up" : `Follow-up ${index + 1}`)).trim(),
                        campaign_type: campaignType,
                        defaultBotId: String(followup?.defaultBotId || followup?.default_bot_id || bot.$id || bot.id || "").trim(),
                        sendFromMode: normalizeCampaignSendFromMode(followup?.sendFromMode || followup?.send_from_mode),
                    };
                })
                .filter((followup: any) => {
                    if (!isFollowupActive(followup?.is_active)) return false;
                    if (followup.campaign_type === "ai_smart_followup") return true;
                    return hasStaticFollowupMessage(followup.offer_context);
                });
            if (followups.length === 0) continue;

            const customerMap = new Map<string, any>();
            for (const ownerKey of ownerCandidates) {
                const customers = await databases.listDocuments(DATABASE_ID, COLLECTIONS.CUSTOMERS, [
                    Query.equal('bot_id', ownerKey),
                    Query.greaterThan('last_message_at', 0),
                    Query.limit(500)
                ]).catch(() => ({ documents: [] } as any));
                for (const doc of customers.documents as any[]) {
                    const docProfile = parseCustomerProfile(doc.profile);
                    const docKey = getCanonicalCustomerKey(resolveCustomerChatJid(doc) || doc.customer_id || doc.$id || doc.id, docProfile);
                    const existing = customerMap.get(docKey);
                    const mergedSentIds = new Set([
                        ...parseSentFollowupIds(existing?.sent_followups_json),
                        ...parseSentFollowupIds(doc.sent_followups_json)
                    ]);
                    const marketingOrderEvidence = mergeMarketingOrderEvidence(existing, doc);
                    if (!existing || normalizeTime(doc.last_message_at || doc.$updatedAt) >= normalizeTime(existing.last_message_at || existing.$updatedAt)) {
                        const existingProfile = parseCustomerProfile(existing?.profile);
                        customerMap.set(docKey, {
                            ...doc,
                            profile: JSON.stringify({ ...existingProfile, ...docProfile }),
                            sentFollowupIds: Array.from(mergedSentIds),
                            marketingOrderEvidence,
                            sourceBotId: doc.bot_id,
                        });
                    } else {
                        existing.sentFollowupIds = Array.from(mergedSentIds);
                        existing.marketingOrderEvidence = marketingOrderEvidence;
                        existing.profile = JSON.stringify({ ...docProfile, ...parseCustomerProfile(existing.profile) });
                    }
                }
            }

            const customerDocs = Array.from(customerMap.values());
            for (const customer of customerDocs) {
                const sourceCustomerJid = resolveCustomerChatJid(customer);
                const customerJid = resolveMarketingChatJid(customer);
                if (!customerJid || !sourceCustomerJid) continue;
                const customerProfile = parseCustomerProfile(customer.profile);
                if (isMutedCustomer(customerJid, customerProfile.phoneJid || customerProfile.phoneNumber || customerProfile.whatsapp_number || sourceCustomerJid, config.muted_numbers || [], customerProfile)) continue;
                if (getCustomerReplyPauseReason(customerProfile)) continue;
                const phone = getProfilePhone(customerProfile);
                const lastMessageAt = normalizeTime(customer.last_message_at);
                const evidenceOwnerKeys = Array.from(new Set([
                    ...ownerCandidates,
                    accountOwnerKey,
                    customer.sourceBotId,
                    customer.bot_id,
                    bot.jid
                ].filter(Boolean)));
                const evidenceCustomerJids = Array.from(new Set([
                    customerJid,
                    sourceCustomerJid,
                    customer.customer_id
                ].filter(Boolean)));

                for (const followup of followups) {
                    const campaignType = normalizeFollowupCampaignType(followup.campaign_type);
                    const audience = normalizeMarketingAudience(followup.audience);
                    if (!isCustomerInMarketingAudience(customer, customerProfile, audience)) continue;
                    const hours = normalizeFollowupHours(followup.hours, 24);
                    const windowHours = normalizeFollowupWindowHours(followup.window_hours ?? followup.past_window_hours, 1);
                    if (isWithinFollowupWindow(lastMessageAt, nowTime, hours, windowHours)) {
                        const followupId = String(followup.id);
                        if (campaignType === "ai_smart_followup" && hasRecentIncompleteAiFollowupSkip(customerProfile, followupId, nowTime)) continue;
                        const attemptKey = buildFollowupAttemptKey({
                            followupId,
                            customerJid,
                            customerLastMessageAt: lastMessageAt,
                        });
                        if (hasSuccessfulFollowupAttempt(customerProfile, followupId, attemptKey)) continue;
                        const followupMessage = campaignType === "fixed_message"
                            ? buildStaticFollowupMessage({ offerContext: followup.offer_context })
                            : "";
                        const hasEvidence = await hasFollowupDeliveryEvidence(
                            evidenceOwnerKeys,
                            evidenceCustomerJids,
                            followupId,
                            lastMessageAt,
                            followupMessage
                        );
                        if (hasEvidence) continue;
                        due.push({
                            botId: bot.$id,
                            botName: bot.name || bot.$id,
                            botJid: bot.jid,
                            ownerKey: accountOwnerKey,
                            customerBotId: customer.sourceBotId || customer.bot_id,
                            customerId: customerJid,
                            sourceCustomerId: sourceCustomerJid,
                            storedCustomerId: customer.customer_id,
                            phone,
                            contact: phone || customer.customer_id || sourceCustomerJid,
                            lastMessageAt,
                            windowFromHours: hours,
                            windowToHours: hours + windowHours,
                            windowHours,
                            profile: customerProfile,
                            campaignName: followup.name,
                            campaignType,
                            offerContext: followup.offer_context,
                            followupId,
                            audience,
                            attemptKey,
                            billingDedupeKey: attemptKey,
                            defaultBotId: followup.defaultBotId || bot.$id,
                            sendFromMode: followup.sendFromMode,
                            customer,
                        });
                        break;
                    }
                }
            }
        }
        return due;
    } catch (e) {
        return [];
    }
}

export async function getCustomerProfile(botJid: string, customerJid: string) {
    const customerId = customerJid.split('@')[0];
    const bp = botJid.split('@')[0]; const docId = `${bp}_${customerId}`.replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 36);
    try {
        const response = await databases.getDocument(DATABASE_ID, COLLECTIONS.CUSTOMERS, docId);
        const data = response as any;
        return data.profile ? JSON.parse(data.profile) : null;
    } catch (e) {
        try {
            const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.CUSTOMERS, [
                Query.equal('bot_id', botJid),
                Query.equal('customer_id', customerId),
                Query.limit(1)
            ]);
            const data = response.documents[0] as any;
            return data?.profile ? JSON.parse(data.profile) : null;
        } catch {}
        return null;
    }
}

export async function updateCustomerProfile(botJid: string, customerJid: string, profileData: any) {
    const customerId = customerJid.split('@')[0];
    const bp = botJid.split('@')[0]; const docId = `${bp}_${customerId}`.replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 36);
    
    const existing = await getCustomerProfile(botJid, customerJid) || {};
    const activity = buildCustomerActivityUpdate(profileData, now());
    const updated = { ...existing, ...activity.profilePatch };
    
    const data: any = {
        bot_id: botJid,
        customer_id: customerId,
        profile: JSON.stringify(updated),
        ...activity.documentPatch
    };

    try {
        await databases.updateDocument(DATABASE_ID, COLLECTIONS.CUSTOMERS, docId, data);
    } catch (e: any) {
        if (e.code === 404) {
            const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.CUSTOMERS, [
                Query.equal('bot_id', botJid),
                Query.equal('customer_id', customerId),
                Query.limit(1)
            ]).catch(() => ({ documents: [] } as any));
            const existingDoc = response.documents[0] as any;
            if (existingDoc?.$id) {
                await databases.updateDocument(DATABASE_ID, COLLECTIONS.CUSTOMERS, existingDoc.$id, data);
            } else {
                const owner = await getUser(botJid).catch(() => null) as any;
                if (owner) {
                    const subscriptions = await getSubscriptions(owner.$id).catch(() => []);
                    const limits = buildAccountLimits(owner, subscriptions);
                    const existingCustomers = await listCustomers(owner.$id).catch(() => []);
                    if (existingCustomers.length >= Number(limits.customerLimit || 0)) {
                        const message = limits.access?.trialActive
                            ? `Trial customer limit reached (${limits.customerLimit}). Choose a paid plan to save more customers.`
                            : `Customer limit reached (${limits.customerLimit}). Choose a higher plan or add-on to save more customers.`;
                        throw new Error(message);
                    }
                }
                await databases.createDocument(DATABASE_ID, COLLECTIONS.CUSTOMERS, docId, data);
            }
        }
    }

    publishEvent(ROOMS.conversation(botJid, customerJid), {
        eventId: `${docId}_update_${Date.now()}`,
        eventType: EVENT_TYPES.CONVERSATION_UPDATED,
        dataOwnerKey: botJid,
        customerJid: customerJid,
        timestamp: now(),
        payload: { updatedKeys: Object.keys(updated) }
    });
}

export async function saveMessage(botJid: string, customerJid: string, role: 'user' | 'model', text: string, messageId?: string, senderName?: string, meta?: {
    actualBotId?: string;
    actualBotJid?: string;
}) {
    const customerId = customerJid.split('@')[0];
    const existingProfile = await getCustomerProfile(botJid, customerJid) || {};
    const originPatch = buildCustomerOriginPatch({
        botId: meta?.actualBotId,
        botJid: meta?.actualBotJid || botJid,
        direction: role === 'user' ? "inbound" : "outbound",
        existingProfile,
    });
    await updateCustomerProfile(botJid, customerJid, {
        jid: customerJid,
        ...(senderName ? { name: senderName } : {}),
        ...(role === 'user' ? { lastMessage: text.slice(0, 500), inboxUnread: true } : { lastBotReply: text.slice(0, 500) }),
        ...originPatch
    });

    if (meta?.actualBotId) {
        await updateBotRuntimeActivity(meta.actualBotId, {
            direction: role === 'user' ? "inbound" : "outbound",
            timestamp: now(),
            connectionStatus: "connected",
        }).catch(() => {});
    }

    const msgId = (messageId || ID.unique()).replace(/[^a-zA-Z0-9_]/g, '_');
    const bp = botJid.split('@')[0]; const docId = `${bp}_${msgId}`.replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 36);

    const data = {
        bot_id: botJid,
        customer_id: customerId,
        message_id: messageId || msgId,
        role,
        text,
        timestamp: now()
    };

    try {
        await databases.updateDocument(DATABASE_ID, COLLECTIONS.MESSAGES, docId, data);
    } catch (e: any) {
        if (e.code === 404) {
            await databases.createDocument(DATABASE_ID, COLLECTIONS.MESSAGES, docId, data);
        }
    }

    publishEvent(ROOMS.conversation(botJid, customerJid), {
        eventId: docId,
        eventType: EVENT_TYPES.MESSAGE_CREATED,
        dataOwnerKey: botJid,
        customerJid: customerJid,
        timestamp: now(),
        payload: data
    });

    import('./customer-summary-service.ts')
        .then(({ queueCustomerChatSummaryRefresh }) => queueCustomerChatSummaryRefresh({ dataOwnerKey: botJid, customerJid, billingGroupKey: messageId || msgId }))
        .catch((e) => console.error("[CustomerSummary] Queue failed:", e?.message || e));

    if (role === 'user' && senderName) {
        import('./customer-360-extraction-service.ts')
            .then(({ extractAndMergeCustomer360 }) => {
                const extraction = extractAndMergeCustomer360({
                    botJid,
                    customerJid,
                    messageText: text,
                    role,
                    messageId: messageId || msgId,
                    senderName,
                    existingProfile,
                });
                if (extraction.hasChanges) {
                    updateCustomerProfile(botJid, customerJid, {
                        customer360: extraction.customer360,
                        ...extraction.topLevelPatches,
                    }).catch(() => {});
                }
            })
            .catch(() => {});
    }
}

export async function getChatHistory(botJid: string, customerJid: string, limitCount = 20) {
    const customerId = customerJid.split('@')[0];
    try {
        const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.MESSAGES, [
            Query.equal('bot_id', botJid),
            Query.equal('customer_id', customerId),
            Query.orderDesc('timestamp'),
            Query.limit(limitCount)
        ]);
        return response.documents
            .map((r: any) => toVisibleChatHistoryMessage(r))
            .filter(Boolean)
            .reverse();
    } catch (e) {
        return [];
    }
}

export async function listRecentInboxMessagesForOwner(dataOwnerKey: string, limitCount = 300) {
    try {
        const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.MESSAGES, [
            Query.equal('bot_id', dataOwnerKey),
            Query.orderDesc('timestamp'),
            Query.limit(limitCount)
        ]);
        return response.documents;
    } catch (e: any) {
        console.error("[listRecentInboxMessagesForOwner] Error:", e?.message || e);
        return [];
    }
}

export async function listInboxCustomersForOwner(dataOwnerKey: string) {
    try {
        return await listCollectionByBot(COLLECTIONS.CUSTOMERS, dataOwnerKey);
    } catch (e: any) {
        console.error("[listInboxCustomersForOwner] Error:", e?.message || e);
        return [];
    }
}

function parseOrderDocumentData(orderDoc: any) {
    if (!orderDoc?.order_data) return {};
    if (typeof orderDoc.order_data === "object") return orderDoc.order_data;
    try {
        return JSON.parse(orderDoc.order_data);
    } catch {
        return {};
    }
}

async function findEditableOrderDocument(botJid: string, orderData: any, profile: any = {}) {
    const bp = botJid.split('@')[0];
    const nowSeconds = now();
    const ref = explicitOrderReference(orderData, profile);
    if (ref) {
        const orderDocId = crypto.createHash('md5').update(`${bp}_${ref}`).digest('hex');
        const doc = await databases.getDocument(DATABASE_ID, COLLECTIONS.ORDERS, orderDocId).catch(() => null) as any;
        const existingData = parseOrderDocumentData(doc);
        if (doc && canUpdateExistingOrder(existingData, orderData, nowSeconds)) {
            return { doc, data: existingData, ref: doc.order_id || ref };
        }
    }

    const recentOrders = await databases.listDocuments(DATABASE_ID, COLLECTIONS.ORDERS, [
        Query.equal('bot_id', botJid),
        Query.greaterThan('created_at', nowSeconds - 24 * 60 * 60),
        Query.orderDesc('created_at'),
        Query.limit(50)
    ]).catch(() => ({ documents: [] } as any));

    for (const doc of recentOrders.documents as any[]) {
        const existingData = parseOrderDocumentData(doc);
        if (canUpdateExistingOrder(existingData, orderData, nowSeconds)) {
            return { doc, data: existingData, ref: doc.order_id || existingData.orderReferenceNumber };
        }
    }
    return null;
}

export async function saveOrder(botJid: string, orderData: any) {
    const incomingFlow = normalizeBusinessFlow(orderData?.businessFlow || orderData?.business_type || orderData?.recordType);
    const incomingRecordType = normalizeRecordType(orderData?.recordType, incomingFlow);
    const incomingMissingFields = Array.isArray(orderData?.missingFields)
        ? orderData.missingFields
        : (Array.isArray(orderData?.missingCustomFields) ? orderData.missingCustomFields : []);
    orderData = withRecordMetadata({
        recordData: orderData,
        businessFlow: incomingFlow,
        recordType: incomingRecordType,
        missingFields: incomingMissingFields,
        recordStatus: orderData?.recordStatus,
    });
    const customerId = orderData.customerJid?.split('@')[0] || orderData.customerPhone || orderData.phone;
    const bp = botJid.split('@')[0]; const docId = `${bp}_${customerId}`.replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 36);
    const profile = orderData.customerJid ? await getCustomerProfile(botJid, orderData.customerJid).catch(() => null) : null;
    const editableOrder = await findEditableOrderDocument(botJid, orderData, profile || {});

    if (customerId) {
        try {
            await databases.updateDocument(DATABASE_ID, COLLECTIONS.CUSTOMERS, docId, { last_order_at: now() });
        } catch (e) {}
    }

    const orderRefId = editableOrder?.ref || buildConfirmedOrderReference(orderData);
    const owner = await getUser(botJid).catch(() => null) as any;
    if (!editableOrder && owner) {
        const subscriptions = await getSubscriptions(owner.$id).catch(() => []);
        const limits = buildAccountLimits(owner, subscriptions);
        const monthStart = getMonthStartEpoch();
        const existingOrders = await listOrders(owner.$id).catch(() => []);
        const monthlyOrders = existingOrders.filter((order: any) => {
            const createdAt = normalizeTime(order.created_at || order.$createdAt || order.order_data?.createdAt || order.order_data?.created_at);
            return createdAt >= monthStart && !isDeletedOrderForLimit(order);
        }).length;
        if (monthlyOrders >= Number(limits.orderLimit || 0)) {
            const message = limits.access?.trialActive
                ? `Trial order limit reached (${limits.orderLimit}). Choose a paid plan to save more orders.`
                : `Order limit reached for this month (${limits.orderLimit}). Choose a higher plan or add-on to save more orders.`;
            throw new Error(message);
        }
    }
    const orderDocId = editableOrder?.doc?.$id || crypto.createHash('md5').update(`${bp}_${orderRefId}`).digest('hex');
    const createdAt = editableOrder
        ? normalizeOrderCreatedAt(editableOrder.doc?.created_at || editableOrder.data?.createdAt || editableOrder.data?.created_at)
        : normalizeOrderCreatedAt(orderData.createdAt || orderData.created_at);
    const orderDataToSave = editableOrder
        ? mergeOrderUpdate(editableOrder.data, orderData, orderRefId, createdAt)
        : {
            ...orderData,
            orderReferenceNumber: orderRefId,
            orderRefNumber: orderData.orderRefNumber || orderRefId,
            createdAt,
            createdAtIso: orderData.createdAtIso || toOrderCreatedAtIso(createdAt)
        };
    const normalizedOrderDataToSave = withRecordMetadata({
        recordData: orderDataToSave,
        businessFlow: orderDataToSave.businessFlow,
        recordType: orderDataToSave.recordType,
        missingFields: orderDataToSave.missingFields || orderDataToSave.missingCustomFields || [],
        recordStatus: orderDataToSave.recordStatus,
    });

    let sr_no = Number(editableOrder?.doc?.sr_no || 0);

    if (!sr_no) {
        try {
            const lastOrders = await databases.listDocuments(DATABASE_ID, COLLECTIONS.ORDERS, [
                Query.equal('bot_id', botJid),
                Query.orderDesc('sr_no'),
                Query.limit(1)
            ]);
            if (lastOrders.documents.length > 0) {
                sr_no = ((lastOrders.documents[0] as any).sr_no || 0) + 1;
            } else {
                sr_no = 1;
            }
        } catch (e) {
            sr_no = 1;
        }
    }

    const data = {
        bot_id: botJid,
        order_id: orderRefId,
        order_data: JSON.stringify(normalizedOrderDataToSave),
        created_at: createdAt,
        sr_no
    };

    try {
        await databases.updateDocument(DATABASE_ID, COLLECTIONS.ORDERS, orderDocId, data);
        if (orderData?.customerJid) {
            import('./customer-summary-service.ts')
                .then(({ queueCustomerChatSummaryRefresh }) => queueCustomerChatSummaryRefresh({ dataOwnerKey: botJid, customerJid: orderData.customerJid, billingGroupKey: orderRefId }))
                .catch((e) => console.error("[CustomerSummary] Queue failed after order update:", e?.message || e));
        }
        emitLiveConsoleEvent({
            type: editableOrder ? "order_updated" : "order_saved",
            level: "success",
            scope: "bot",
            botId: botJid,
            customerJid: orderData?.customerJid,
            title: editableOrder ? "Order updated" : "Order saved",
            message: `Order record ${orderRefId} saved.`,
            metadata: { orderRefId, recordType: normalizedOrderDataToSave.recordType || "order" },
        });
        return { isNew: false, sr_no, order_id: orderRefId, created_at: createdAt, updatedExisting: Boolean(editableOrder) };
    } catch (e: any) {
        if (e.code === 404) {
            await databases.createDocument(DATABASE_ID, COLLECTIONS.ORDERS, orderDocId, data);
            if (orderData?.customerJid) {
                import('./customer-summary-service.ts')
                    .then(({ queueCustomerChatSummaryRefresh }) => queueCustomerChatSummaryRefresh({ dataOwnerKey: botJid, customerJid: orderData.customerJid, billingGroupKey: orderRefId }))
                    .catch((e) => console.error("[CustomerSummary] Queue failed after order create:", e?.message || e));
            }
            emitLiveConsoleEvent({
                type: "order_saved",
                level: "success",
                scope: "bot",
                botId: botJid,
                customerJid: orderData?.customerJid,
                title: "Order saved",
                message: `Order record ${orderRefId} created.`,
                metadata: { orderRefId, recordType: normalizedOrderDataToSave.recordType || "order" },
            });
            return { isNew: true, sr_no, order_id: orderRefId, created_at: createdAt }; // Is a new order
        }
        throw e;
    }
}

export async function findOrder(botJid: string, queryParam: { phoneNumber?: string, orderReference?: string }) {
    try {
        if (queryParam.orderReference) {
            const bp = botJid.split('@')[0];
            const orderRefId = queryParam.orderReference.replace(/[^a-zA-Z0-9_]/g, '_');
            const orderDocId = crypto.createHash('md5').update(`${bp}_${orderRefId}`).digest('hex');
            const row = await databases.getDocument(DATABASE_ID, COLLECTIONS.ORDERS, orderDocId);
            return [JSON.parse((row as any).order_data)];
        }

        if (queryParam.phoneNumber) {
            const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.ORDERS, [
                Query.equal('bot_id', botJid)
            ]);
            return response.documents
                .map((r: any) => JSON.parse(r.order_data))
                .filter((o: any) => o.customerPhone === queryParam.phoneNumber || (o.customerPhone && String(o.customerPhone).endsWith(queryParam.phoneNumber.slice(-7))));
        }
    } catch (e) {}
    return [];
}

export async function findLatestCustomerRecord(botJid: string, customerJid: string, profile: any = {}) {
    try {
        const phone = normalizePhoneDigits(profile?.customerPhone || profile?.phone || profile?.phoneNumber || customerJid?.split("@")?.[0] || "");
        const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.ORDERS, [
            Query.equal('bot_id', botJid),
            Query.orderDesc('created_at'),
            Query.limit(100)
        ]);
        const matches = response.documents
            .map((row: any) => {
                const parsed = parseOrderDocumentData(row);
                return { row, parsed };
            })
            .filter(({ parsed }: any) => {
                if (customerJid && parsed?.customerJid === customerJid) return true;
                const candidatePhone = normalizePhoneDigits(parsed?.customerPhone || parsed?.phone || "");
                return phone && candidatePhone && (candidatePhone === phone || candidatePhone.endsWith(phone.slice(-7)));
            })
            .map(({ row, parsed }: any) => ({
                ...row,
                order_data: withRecordMetadata({
                    recordData: parsed,
                    businessFlow: parsed.businessFlow,
                    recordType: normalizeRecordType(parsed.recordType, parsed.businessFlow),
                    missingFields: parsed.missingFields || parsed.missingCustomFields || [],
                    recordStatus: parsed.recordStatus,
                })
            }));
        return matches.find((record: any) => record.order_data?.recordStatus === "incomplete") || matches[0] || null;
    } catch {
        return null;
    }
}

async function listCollectionByBot(collectionId: string, botId: string, options: { orderDesc?: string; pageLimit?: number; maxRows?: number } = {}) {
    const pageLimit = Math.max(1, Math.min(500, Number(options.pageLimit || 500)));
    const maxRows = Math.max(pageLimit, Number(options.maxRows || 10000));
    const rows: any[] = [];
    for (let offset = 0; offset < maxRows; offset += pageLimit) {
        const queries: any[] = [
            Query.equal('bot_id', botId),
            Query.limit(pageLimit),
            Query.offset(offset),
        ];
        if (options.orderDesc) queries.push(Query.orderDesc(options.orderDesc));
        const response = await databases.listDocuments(DATABASE_ID, collectionId, queries);
        rows.push(...response.documents);
        if (response.documents.length < pageLimit) break;
    }
    return rows;
}

function customerFromMessageRow(accountOwnerKey: string, message: any) {
    const customerId = String(message?.customer_id || "").trim();
    if (!customerId) return null;
    const isLid = customerId.endsWith("@lid") || (!customerId.includes("@") && customerId.length >= 13 && /^\d+$/.test(customerId));
    const jid = customerId.includes("@") ? customerId : (isLid ? `${customerId}@lid` : `${customerId}@s.whatsapp.net`);
    const timestamp = normalizeTime(message?.timestamp || message?.created_at || message?.$createdAt);
    const profile: any = {
        jid,
        source: "WhatsApp",
        leadSource: "WhatsApp",
        lastMessage: message?.role === "user" ? String(message?.text || "").slice(0, 500) : "",
        lastBotReply: message?.role === "model" ? String(message?.text || "").slice(0, 500) : "",
        lastMessageAt: timestamp,
    };
    if (isLid) {
        profile.lidJid = jid;
    }
    return {
        $id: `${String(accountOwnerKey || message?.bot_id || "bot").split("@")[0]}_${customerId}`.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 36),
        bot_id: accountOwnerKey || message?.bot_id,
        customer_id: customerId,
        jid,
        profile: JSON.stringify(profile),
        last_message: profile.lastMessage || profile.lastBotReply,
        last_message_at: message?.role === "user" ? timestamp : 0,
        last_bot_message_at: message?.role === "model" ? timestamp : 0,
        $createdAt: message?.$createdAt,
        $updatedAt: message?.$updatedAt,
        source: "WhatsApp",
        sourceDetail: "message_history",
    };
}

export async function listCustomers(userId: string): Promise<any[]> {
    const user = await getUser(userId) as any;
    const bots = await getBotsByUser(userId);
    const accountOwnerKey = buildAccountDataOwnerKey(user || userId);
    const botIdentifiers = new Set<string>(collectAccountDataOwnerCandidates(user || userId, bots));

    if (botIdentifiers.size === 0) return [];

    let allCustomers: any[] = [];
    for (const id of Array.from(botIdentifiers)) {
        try {
            const customers = await listCollectionByBot(COLLECTIONS.CUSTOMERS, id);
            allCustomers = allCustomers.concat(customers);
        } catch (e: any) {
             console.error(`[listCustomers] error for id ${id}:`, e.message);
        }
    }

    // Load persisted canonical aliases for this account
    try {
        await loadPersistedCustomerAliasesAsync(accountOwnerKey);
    } catch {}

    // Build lookup of existing canonical customers by their aliases/identifiers
    const customerByAlias = new Map<string, any>();
    for (const c of allCustomers) {
        const prof = parseCustomerProfile(c.profile);
        const resolved = resolveCustomerIdentity({
            jid: c.jid || c.customer_id || prof.customerJid || prof.jid,
            phone: c.phone || prof.phone,
            profile: prof,
            record: c,
        });
        const aliases = [
            c.$id,
            c.id,
            c.customer_id,
            c.jid,
            c.phone,
            prof.phone,
            prof.jid,
            prof.customerJid,
            prof.lidJid,
            prof.lid,
            resolved.canonicalCustomerId,
            resolved.canonicalCustomerKey,
            ...resolved.aliases,
        ].map((v) => String(v || "").trim().toLowerCase()).filter(Boolean);

        for (const alias of aliases) {
            customerByAlias.set(alias, c);
        }
    }

    const messageCustomers = new Map<string, any>();
    for (const id of Array.from(botIdentifiers)) {
        try {
            const messages = await listCollectionByBot(COLLECTIONS.MESSAGES, id, { orderDesc: "timestamp" });
            for (const message of messages) {
                const customerId = String(message?.customer_id || "").trim();
                if (!customerId) continue;

                // Requirement #19: resolve all verified aliases and lookup canonical customer before synthesizing
                const canonicalId = resolveCanonicalCustomerIdForAlias({ accountId: accountOwnerKey, alias: customerId });
                const existing = customerByAlias.get(customerId.toLowerCase()) || (canonicalId ? customerByAlias.get(canonicalId.toLowerCase()) : null);
                const timestamp = normalizeTime(message?.timestamp || message?.created_at || message?.$createdAt);

                if (existing) {
                    // Enrich existing canonical customer with latest message info
                    const currentMsgTime = normalizeTime(existing.last_message_at || existing.last_bot_message_at || existing.updated_at || existing.$updatedAt);
                    if (timestamp >= currentMsgTime) {
                        if (message?.role === "user") {
                            existing.last_message = String(message?.text || "").slice(0, 500);
                            existing.last_message_at = timestamp;
                        } else if (message?.role === "model") {
                            existing.last_bot_message_at = timestamp;
                        }
                    }
                    continue;
                }

                // Check already synthesized message customers
                const synthKey = canonicalId ? canonicalId.toLowerCase() : customerId.toLowerCase();
                const existingSynth = messageCustomers.get(synthKey) || messageCustomers.get(customerId.toLowerCase());
                if (existingSynth) {
                    const currentSynthTime = normalizeTime(existingSynth.last_message_at || existingSynth.last_bot_message_at || existingSynth.$updatedAt);
                    if (timestamp >= currentSynthTime) {
                        if (message?.role === "user") {
                            existingSynth.last_message = String(message?.text || "").slice(0, 500);
                            existingSynth.last_message_at = timestamp;
                        } else if (message?.role === "model") {
                            existingSynth.last_bot_message_at = timestamp;
                        }
                    }
                    continue;
                }

                // Only synthesize when NO canonical identity match exists
                const synthetic = customerFromMessageRow(accountOwnerKey, message);
                if (!synthetic) continue;
                messageCustomers.set(synthKey, synthetic);
                customerByAlias.set(customerId.toLowerCase(), synthetic);
                if (canonicalId) customerByAlias.set(canonicalId.toLowerCase(), synthetic);
            }
        } catch (e: any) {
            console.error(`[listCustomers] message history error for id ${id}:`, e.message);
        }
    }
    allCustomers = allCustomers.concat(Array.from(messageCustomers.values()));

    for (const c of allCustomers) {
        if (accountOwnerKey && c.bot_id !== accountOwnerKey) {
            c.bot_id = accountOwnerKey;
            databases.updateDocument(DATABASE_ID, COLLECTIONS.CUSTOMERS, c.$id || c.id, { bot_id: accountOwnerKey }).catch(() => {});
        }
    }

    const deduplicated = deduplicateCustomerList(allCustomers);
    return sortCustomersByLastInteraction(deduplicated);
}

export async function importCustomersForUser(userId: string, rows: any[]) {
    const user = await getUser(userId) as any;
    const ownerKey = buildAccountDataOwnerKey(user || userId) || (await getOwnerKeysForUser(userId))[0];
    if (!ownerKey) throw new Error("Account owner could not be resolved");
    if (!Array.isArray(rows)) throw new Error("Rows must be an array");

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];
    for (const [index, row] of rows.entries()) {
        const phone = normalizePhoneDigits(row?.phone || row?.number || row?.whatsapp || row?.whatsapp_number);
        if (phone.length < 8 || phone.length > 15 || phone.startsWith("0")) {
            skipped++;
            errors.push(`Row ${index + 1}: invalid phone`);
            continue;
        }

        const jid = `${phone}@s.whatsapp.net`;
        const fullName = String(row?.fullName || row?.full_name || row?.name || "").trim();
        const profilePatch = {
            jid,
            ...buildPhoneProfilePatch(jid),
            ...(fullName ? { name: fullName, customerName: fullName } : {}),
            ...(row?.city ? { city: String(row.city).trim() } : {}),
            ...(row?.country ? { country: String(row.country).trim() } : {}),
            ...(row?.address ? { address: String(row.address).trim() } : {}),
            ...(row?.extra && typeof row.extra === "object" ? row.extra : {}),
            importedAt: now(),
            importSource: "csv",
        };

        await updateCustomerProfile(ownerKey, jid, profilePatch);
        imported++;
    }

    return { imported, skipped, errors: errors.slice(0, 25) };
}

export async function getMissedMessageCustomers(botJid: string, cutoffTimestamp: number, lookbackSeconds = 12 * 60 * 60) {
    try {
        // Find recent customers whose last inbound message is newer than the saved bot reply timestamp.
        const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.CUSTOMERS, [
            Query.equal('bot_id', botJid),
            Query.greaterThan('last_message_at', cutoffTimestamp - lookbackSeconds),
            Query.lessThan('last_message_at', cutoffTimestamp),
            Query.limit(100)
        ]);
        
        return response.documents.filter((c: any) => {
            const lastMsg = normalizeTime(c.last_message_at);
            const lastBot = getCustomerLastBotMessageTime(c);
            return lastMsg > lastBot;
        });
    } catch (e) {
        return [];
    }
}
export async function updateOrder(orderId: string, orderData: any): Promise<boolean> {
    try {
        const normalizedOrderData = withRecordMetadata({
            recordData: orderData || {},
            businessFlow: orderData?.businessFlow,
            recordType: normalizeRecordType(orderData?.recordType, orderData?.businessFlow),
            missingFields: orderData?.missingFields || orderData?.missingCustomFields || [],
            recordStatus: orderData?.recordStatus,
        });
        await databases.updateDocument(DATABASE_ID, COLLECTIONS.ORDERS, orderId, {
            order_data: JSON.stringify(normalizedOrderData)
        });
        return true;
    } catch (e: any) {
        console.error(`[updateOrder] error for ${orderId}:`, e.message);
        return false;
    }
}

export async function listOrders(userId: string): Promise<any[]> {
    const user = await getUser(userId) as any;
    const bots = await getBotsByUser(userId);
    const accountOwnerKey = buildAccountDataOwnerKey(user || userId);
    const botIdentifiers = new Set<string>(collectAccountDataOwnerCandidates(user || userId, bots));

    if (botIdentifiers.size === 0) return [];

    let allOrders: any[] = [];
    for (const id of Array.from(botIdentifiers)) {
        try {
            const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.ORDERS, [
                Query.equal('bot_id', id),
                Query.limit(5000),
                Query.orderDesc('created_at')
            ]);
            allOrders = allOrders.concat(response.documents);
        } catch (e: any) {
            console.error(`[listOrders] error for id ${id}:`, e.message);
        }
    }

    const uniqueMap = new Map();
    for (const o of allOrders) {
        if (accountOwnerKey && o.bot_id !== accountOwnerKey) {
            o.bot_id = accountOwnerKey;
            databases.updateDocument(DATABASE_ID, COLLECTIONS.ORDERS, o.$id || o.id, { bot_id: accountOwnerKey }).catch(() => {});
        }
        const orderKey = o.order_id || o.$id || o.id;
        const existing = uniqueMap.get(orderKey);
        if (!existing || normalizeTime(o.created_at || o.$createdAt) >= normalizeTime(existing.created_at || existing.$createdAt)) {
            uniqueMap.set(orderKey, o);
        }
    }
    const deduplicated = Array.from(uniqueMap.values());

    return deduplicated.map((o: any) => {
        const parsed = o.order_data ? JSON.parse(o.order_data) : {};
        const recordType = normalizeRecordType(parsed.recordType, parsed.businessFlow);
        return {
            ...o,
            order_data: withRecordMetadata({
                recordData: parsed,
                businessFlow: parsed.businessFlow,
                recordType,
                missingFields: parsed.missingFields || parsed.missingCustomFields || [],
                recordStatus: parsed.recordStatus || (recordType === "order" ? "complete" : ""),
            })
        };
    });
}

export async function createLoginToken(userId: string, expiresMinutes: number = 30) {
    const token = ID.unique();
    const expiresAt = now() + (expiresMinutes * 60);
    await databases.createDocument(DATABASE_ID, COLLECTIONS.LOGIN_TOKENS, token, {
        token,
        user_id: userId,
        created_at: now(),
        expires_at: expiresAt
    });
    return token;
}

export async function useLoginToken(token: string) {
    try {
        const record = await databases.getDocument(DATABASE_ID, COLLECTIONS.LOGIN_TOKENS, token) as any;
        if (record && !record.used_at && normalizeTime(record.expires_at) > now()) {
            await databases.updateDocument(DATABASE_ID, COLLECTIONS.LOGIN_TOKENS, token, { used_at: now() });
            return record.user_id;
        }
    } catch (e) {}
    return null;
}

export async function listUsers() {
    try {
        const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.USERS, [
            Query.orderDesc('created_at'),
            Query.limit(1000)
        ]);
        return response.documents;
    } catch (e) {
        return [];
    }
}

export async function migrateLegacyStoredPasswords() {
    const users = await listUsers();
    let migratedPasswords = 0;
    let migratedTempPasswords = 0;

    for (const user of users as any[]) {
        const updates: Record<string, any> = {};
        const storedPassword = String(user?.password_hash || "");
        const storedTempPassword = String(user?.temp_password || "");

        if (storedPassword && !isOAuthPasswordValue(storedPassword) && !isStoredPasswordHash(storedPassword)) {
            updates.password_hash = hashPassword(storedPassword);
            migratedPasswords += 1;
        }

        if (storedTempPassword && !isOAuthPasswordValue(storedTempPassword) && !isStoredPasswordHash(storedTempPassword)) {
            updates.temp_password = hashPassword(storedTempPassword);
            migratedTempPasswords += 1;
        }

        if (Object.keys(updates).length > 0) {
            await updateUser(user.$id || user.id, updates);
        }
    }

    return {
        scannedUsers: users.length,
        migratedPasswords,
        migratedTempPasswords,
    };
}

export async function createUser(userData: any) {
    const id = userData.id || ID.unique();
    const startingWalletBalance = Math.max(APP_TRIAL_AI_CREDIT_USD, Number(userData.wallet_balance ?? APP_TRIAL_AI_CREDIT_USD) || 0);
    const incomingPassword = String(userData.password_hash || "");
    const passwordHash = isOAuthPasswordValue(incomingPassword)
        ? OAUTH_PASSWORD_SENTINEL
        : (isStoredPasswordHash(incomingPassword) ? incomingPassword : hashPassword(incomingPassword));
    const data = {
        email: userData.email.toLowerCase(),
        name: userData.name,
        password_hash: passwordHash,
        whatsapp_number: userData.whatsapp_number || '',
        role: userData.role || 'user',
        created_at: now(),
        wallet_balance: startingWalletBalance,
        extra_product_bundles: userData.extra_product_bundles || 0,
        extra_instances: userData.extra_instances || 0,
        plan_id: userData.plan_id || 'starter_plan',
        trial_expires_at: now() + APP_TRIAL_SECONDS,
    };
    const created = await databases.createDocument(DATABASE_ID, COLLECTIONS.USERS, id, data);
    await addWalletTransaction(id, APP_TRIAL_AI_CREDIT_USD, 'signup_credit', `7-day trial AI test credit: $${APP_TRIAL_AI_CREDIT_USD}`).catch(() => {});
    return created;
}

export async function updateUser(userId: string, data: any) {
    try {
        return await databases.updateDocument(DATABASE_ID, COLLECTIONS.USERS, userId, data);
    } catch (e) {
        console.error("[Appwrite] updateUser error:", e);
    }
}

export async function addWalletTransaction(userId: string, amount: number, type: string, description: string) {
    try {
        await databases.createDocument(DATABASE_ID, COLLECTIONS.WALLET_TRANSACTIONS, ID.unique(), {
            user_id: userId,
            amount,
            type,
            description,
            created_at: now()
        });
    } catch (e) {}
}

export async function listWalletTransactions(userId: string, fromTime?: number, toTime?: number) {
    try {
        const queries = [
            Query.equal('user_id', userId),
            Query.limit(5000),
            Query.orderDesc('created_at')
        ];
        if (fromTime) queries.push(Query.greaterThanEqual('created_at', fromTime));
        if (toTime) queries.push(Query.lessThanEqual('created_at', toTime));
        
        const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.WALLET_TRANSACTIONS, queries);
        return response.documents;
    } catch (e) {
        return [];
    }
}

export async function getSubscriptions(userId: string) {
    try {
        const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.USER_SUBSCRIPTIONS, [
            Query.equal('user_id', userId)
        ]);
        return response.documents;
    } catch (e) {
        return [];
    }
}

export async function getSubscription(subId: string, userId: string) {
    try {
        const sub = await databases.getDocument(DATABASE_ID, COLLECTIONS.USER_SUBSCRIPTIONS, subId);
        if ((sub as any).user_id === userId) return sub;
    } catch (e) {}
    return null;
}

export async function createSubscription(data: any) {
    return await databases.createDocument(DATABASE_ID, COLLECTIONS.USER_SUBSCRIPTIONS, ID.unique(), {
        ...data,
        created_at: now()
    });
}

export async function updateSubscription(subId: string, data: any) {
    return await databases.updateDocument(DATABASE_ID, COLLECTIONS.USER_SUBSCRIPTIONS, subId, data);
}

export async function getUsageStats(fromTime: number, toTime: number) {
    try {
        const regularUserIds = await getRegularUserIdSet();

        const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.USAGE_ANALYTICS, [
            Query.lessThan('timestamp', toTime),
            Query.orderAsc('timestamp'),
            Query.limit(5000)
        ]);
        const freeCreditRemaining: Record<string, number> = {};
        const groups: Record<string, { amount: number, cost: number }> = {};
        for (const doc of response.documents as any[]) {
            if (!regularUserIds.has(doc.user_id)) continue;
            const userId = String(doc.user_id || "");
            if (!userId) continue;
            if (freeCreditRemaining[userId] === undefined) freeCreditRemaining[userId] = SIGNUP_FREE_CREDIT_USD;

            const rawCost = Math.max(0, Number(doc.cost || 0));
            let billableCost = rawCost;
            if (freeCreditRemaining[userId] > 0) {
                const freeApplied = Math.min(freeCreditRemaining[userId], rawCost);
                freeCreditRemaining[userId] -= freeApplied;
                billableCost -= freeApplied;
            }

            if (Number(doc.timestamp || 0) < fromTime || billableCost <= 0) continue;
            if (!groups[doc.type]) groups[doc.type] = { amount: 0, cost: 0 };
            groups[doc.type].amount += doc.amount || 1;
            groups[doc.type].cost += billableCost;
        }
        return Object.entries(groups).map(([type, stats]) => ({ type, ...stats }));
    } catch (e) {
        return [];
    }
}

export async function getTransactionStats(fromTime: number, toTime: number) {
    try {
        const regularUserIds = await getRegularUserIdSet();

        const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.WALLET_TRANSACTIONS, [
            Query.greaterThanEqual('created_at', fromTime),
            Query.lessThan('created_at', toTime),
            Query.limit(5000)
        ]);
        const result = { topup: 0, subscription: 0 };
        for (const doc of response.documents as any[]) {
            if (!regularUserIds.has(doc.user_id) || isFreeCreditWalletTransaction(doc)) continue;
            if (doc.type === 'topup') result.topup += doc.amount;
            if (String(doc.type || '').includes('subscription')) result.subscription += doc.amount;
        }
        return result;
    } catch (e) {
        return { topup: 0, subscription: 0 };
    }
}

export async function getBotById(botId: string) {
    try {
        const response = await databases.getDocument(DATABASE_ID, COLLECTIONS.BOTS, botId);
        return response;
    } catch (e) {
        return null;
    }
}

export async function saveLead(botJid: string, leadData: any, configuredFields: any[] = []) {
    const missingFields = getMissingLeadFields(leadData, configuredFields);
    const recordData = withRecordMetadata({
        recordData: {
            ...leadData,
            productName: leadData?.serviceName || leadData?.productName || leadData?.service || "Service request",
            quantity: Number(leadData?.quantity) > 0 ? Number(leadData.quantity) : 1,
            totalPrice: Number(leadData?.totalPrice || leadData?.codAmount) || 0,
            transactionStatus: missingFields.length > 0 ? "Lead incomplete" : "Lead complete",
        },
        businessFlow: "service",
        recordType: "lead",
        missingFields,
        recordStatus: missingFields.length > 0 ? "incomplete" : "complete",
    });
    const result = await saveOrder(botJid, recordData);
    emitLiveConsoleEvent({
        type: "lead_saved",
        level: "success",
        scope: "bot",
        botId: botJid,
        customerJid: recordData?.customerJid,
        title: "Lead saved",
        message: `Lead record ${result?.order_id || "saved"}.`,
        metadata: { status: recordData?.recordStatus || "", missingFields: missingFields.length },
    });
    return result;
}

export async function updateBotRuntimeActivity(botId: string, input: {
    direction: "inbound" | "outbound" | "connected" | "disconnected" | "status";
    timestamp?: number;
    connectionStatus?: string;
    releaseReason?: string;
}) {
    if (!botId) return false;
    const patch = buildInstanceActivityPatch(input);
    if (Object.keys(patch).length === 0) return false;
    try {
        await databases.updateDocument(DATABASE_ID, COLLECTIONS.BOTS, botId, {
            ...patch,
            updated_at: now()
        });
        return true;
    } catch (e: any) {
        try {
            const bot = await getBotById(botId) as any;
            const currentConfig = parseConfigSettings(bot?.config_settings);
            await databases.updateDocument(DATABASE_ID, COLLECTIONS.BOTS, botId, {
                config_settings: JSON.stringify({
                    ...currentConfig,
                    __instanceActivity: {
                        ...(currentConfig.__instanceActivity || {}),
                        ...patch,
                    },
                }),
                updated_at: now()
            });
            return true;
        } catch (fallbackError: any) {
            console.warn("[InstanceActivity] Bot activity update skipped:", fallbackError?.message || fallbackError || e?.message || e);
            return false;
        }
    }
}

export async function releaseProxyQuotaForInactiveBot(botId: string, reasonHint = "") {
    const bot = await getBotById(botId) as any;
    if (!bot?.user_id) return { released: false, reason: "origin_missing" };
    const userBots = await getBotsByUser(bot.user_id);
    const decision = decideProxyReleaseForUser({ targetBot: bot, userBots });
    if (!decision.release) {
        console.log(`[ProxyLease] ${decision.reason} for bot ${botId}${reasonHint ? ` (${reasonHint})` : ""}.`);
        return { released: false, reason: decision.reason };
    }
    await removeAssignedProxy(bot.user_id);
    await updateBotRuntimeActivity(botId, {
        direction: "status",
        connectionStatus: String(bot.connection_status || ""),
        releaseReason: decision.reason,
    }).catch(() => {});
    console.log(`[ProxyLease] ${decision.reason} for bot ${botId}${reasonHint ? ` (${reasonHint})` : ""}.`);
    return { released: true, reason: decision.reason };
}

export async function getUserConfigs() {
    try {
        const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.USER_CONFIGS);
        return response.documents;
    } catch (e) {
        return [];
    }
}

export async function getUserCount() {
    try {
        const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.USERS, [Query.limit(1)]);
        return response.total;
    } catch (e) {
        return 0;
    }
}

const now = () => Math.floor(Date.now() / 1000);
const normalizeTime = (t: any) => {
    const num = Number(t);
    if (!num) return 0;
    // If it's > 10^11, it's likely milliseconds. Current epoch seconds is ~1.7 * 10^9.
    return num > 100000000000 ? Math.floor(num / 1000) : num;
};
const SIGNUP_FREE_CREDIT_USD = 1;

function isAdminAccountRole(role: any) {
    const normalized = String(role || "user").toLowerCase();
    return normalized === "admin" || normalized === "super_admin" || normalized === "superadmin";
}

async function getRegularUserIdSet() {
    const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.USERS, [
        Query.limit(5000)
    ]);
    return new Set(
        (response.documents as any[])
            .filter((user) => !isAdminAccountRole(user.role))
            .map((user) => user.$id)
    );
}

function isFreeCreditWalletTransaction(doc: any) {
    const type = String(doc?.type || "").toLowerCase();
    const description = String(doc?.description || "").toLowerCase();
    const amount = Math.abs(Number(doc?.amount || 0));
    if (type.includes("free_credit") || type.includes("signup_credit") || type.includes("welcome_credit")) return true;
    const creditLike = description.includes("credit") || description.includes("wallet");
    const setupLike = description.includes("free") || description.includes("signup") || description.includes("setup") || description.includes("welcome") || description.includes("starter") || description.includes("trial");
    return amount <= SIGNUP_FREE_CREDIT_USD + 0.0001 && creditLike && setupLike;
}

function getMonthStartEpoch(currentTime = now()) {
    const date = new Date(currentTime * 1000);
    date.setHours(0, 0, 0, 0);
    date.setDate(1);
    return Math.floor(date.getTime() / 1000);
}

function isDeletedOrderForLimit(order: any) {
    const data = order?.order_data || order?.orderData || order || {};
    const status = String(data.orderStatus || data.transactionStatus || data.latestTrackingStatus || data.status || "").trim().toLowerCase();
    return Boolean(data.deletedAt) || status.includes("deleted");
}

function describeUsageTypeForBilling(type: any) {
    return describeUsageAnalyticsType(type);
}

// Removed duplicate getSubscription implementation

export async function toggleSubscriptionAutoRenew(subId: string, autoRenew: boolean) {
    try {
        await databases.updateDocument(DATABASE_ID, COLLECTIONS.USER_SUBSCRIPTIONS, subId, {
            auto_renew: autoRenew ? 1 : 0
        });
        return true;
    } catch (e) {
        return false;
    }
}

export async function updateUserPlan(userId: string, planId: string, planExpiry: number) {
    try {
        await databases.updateDocument(DATABASE_ID, COLLECTIONS.USERS, userId, {
            plan_id: planId,
            plan_expiry: planExpiry
        });
        if (normalizeEpochSeconds(planExpiry) > now()) {
            await markPaidAccessConfirmed(userId, "paid_plan").catch(() => {});
        }
        return true;
    } catch (e) {
        return false;
    }
}

export async function addSubscription(userId: string, type: string, quantity: number, expiresAt: number, autoRenew: boolean = true) {
    try {
        const id = Math.random().toString(36).substring(2, 15);
        await databases.createDocument(DATABASE_ID, COLLECTIONS.USER_SUBSCRIPTIONS, id, {
            user_id: userId,
            type,
            quantity,
            expires_at: expiresAt,
            created_at: now(),
            auto_renew: autoRenew ? 1 : 0
        });
        return id;
    } catch (e) {
        throw e;
    }
}

export async function processPayment(userId: string, amount: number) {
    try {
        return await creditWalletBalance(userId, amount, 'topup', `Payment Added: $${amount}`);
    } catch (e: any) {
        throw new Error("Failed to process payment: " + e.message);
    }
}

export async function getUserAnalytics(userId: string, fromTime?: number, toTime?: number, limit?: number) {
    try {
        const effectiveLimit = Math.max(1, Math.min(5000, Number(limit) || 5000));
        const queries: any[] = [
            Query.equal('user_id', userId),
            Query.orderDesc('timestamp'),
            Query.limit(effectiveLimit)
        ];
        if (typeof fromTime === 'number' && !Number.isNaN(fromTime) && fromTime > 0) {
            queries.push(Query.greaterThanEqual('timestamp', fromTime));
        }
        if (typeof toTime === 'number' && !Number.isNaN(toTime) && toTime > 0) {
            queries.push(Query.lessThanEqual('timestamp', toTime));
        }

        const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.USAGE_ANALYTICS, queries);
        const usageDocs = response.documents || [];

        // If usageDocs is empty or to reconcile historical AI debits:
        let combined = [...usageDocs];
        try {
            const txQueries: any[] = [
                Query.equal('user_id', userId),
                Query.orderDesc('created_at'),
                Query.limit(effectiveLimit)
            ];
            if (typeof fromTime === 'number' && !Number.isNaN(fromTime) && fromTime > 0) {
                txQueries.push(Query.greaterThanEqual('created_at', fromTime));
            }
            if (typeof toTime === 'number' && !Number.isNaN(toTime) && toTime > 0) {
                txQueries.push(Query.lessThanEqual('created_at', toTime));
            }

            const txResponse = await databases.listDocuments(DATABASE_ID, COLLECTIONS.WALLET_TRANSACTIONS, txQueries);
            const aiTxDocs = (txResponse.documents || []).filter((tx: any) => {
                const type = String(tx.type || "").toLowerCase();
                const desc = String(tx.description || "").toLowerCase();
                return Number(tx.amount || 0) < 0 && (type.startsWith("ai_") || type.includes("usage") || desc.includes("ai ") || desc.includes("reply"));
            });

            // Check if any AI transactions are missing from usageDocs
            const existingTimestamps = new Set(usageDocs.map((doc: any) => Math.floor(Number(doc.timestamp || 0))));
            for (const tx of aiTxDocs) {
                const txTime = Math.floor(Number(tx.created_at || tx.timestamp || 0));
                if (!existingTimestamps.has(txTime)) {
                    const rawType = String(tx.type || "").replace(/^ai_/, "").replace(/_debit$/, "");
                    combined.push({
                        $id: `usage_tx_${tx.$id || tx.id}`,
                        user_id: userId,
                        timestamp: txTime,
                        type: rawType || "customer_ai_text_reply",
                        cost: Math.abs(Number(tx.amount || 0)),
                        amount: 1,
                        description: tx.description,
                    } as any);
                }
            }
        } catch {}

        const finalDocs = combined
            .sort((a: any, b: any) => Number(b.timestamp || 0) - Number(a.timestamp || 0))
            .slice(0, effectiveLimit);
        console.log(`[UsageBilling] usage_query_completed userId=${userId} count=${finalDocs.length} limit=${effectiveLimit}`);
        return finalDocs;
    } catch (e: any) {
        console.error(`[UsageBilling] usage_query_failed userId=${userId} error=${e?.message || e}`);
        return [];
    }
}

export async function getBillingLogs(userId: string, date: string) {
    const startOfDay = Math.floor(new Date(date).getTime() / 1000);
    const endOfDay = startOfDay + (24 * 60 * 60);
    try {
        const usageResponse = await databases.listDocuments(DATABASE_ID, COLLECTIONS.USAGE_ANALYTICS, [
            Query.equal('user_id', userId),
            Query.greaterThanEqual('timestamp', startOfDay),
            Query.lessThan('timestamp', endOfDay),
            Query.orderAsc('timestamp'),
            Query.limit(5000)
        ]);

        const transactionResponse = await databases.listDocuments(DATABASE_ID, COLLECTIONS.WALLET_TRANSACTIONS, [
            Query.equal('user_id', userId),
            Query.greaterThanEqual('created_at', startOfDay),
            Query.lessThan('created_at', endOfDay),
            Query.orderAsc('created_at'),
            Query.limit(5000)
        ]);

        const usageRows = usageResponse.documents.map((doc: any) => ({
            ...doc,
            category: 'usage',
            timestamp: doc.timestamp,
            walletAmount: -Math.abs(doc.cost || 0),
            description: `${describeUsageTypeForBilling(doc.type)} (${doc.amount || 1} unit${(doc.amount || 1) === 1 ? '' : 's'})`
        }));

        const transactionRows = transactionResponse.documents.map((doc: any) => ({
            ...doc,
            category: 'wallet_transaction',
            timestamp: doc.created_at,
            cost: Math.abs(doc.amount || 0),
            walletAmount: doc.amount || 0,
            amount: 1,
            description: doc.description || doc.type || 'Wallet transaction'
        }));

        return [...usageRows, ...transactionRows].sort((a: any, b: any) => (a.timestamp || 0) - (b.timestamp || 0));
    } catch (e) {
        return [];
    }
}

export async function updateSystemProxyStatus(proxyId: string, latency: number | null, errorMsg: string | null) {
    try {
        await databases.updateDocument(DATABASE_ID, COLLECTIONS.SYSTEM_PROXIES, proxyId, {
            latency: latency || 0,
            error_msg: errorMsg || "",
            last_checked: now()
        });
    } catch (e) {}
}

export async function updateSystemProxyStatusByUrl(url: string, latency: number | null, errorMsg: string | null) {
     try {
        const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.SYSTEM_PROXIES, [
            Query.equal('url', url)
        ]);
        if (response.total > 0) {
            await updateSystemProxyStatus(response.documents[0].$id, latency, errorMsg);
        }
     } catch(e){}
}

export async function markProxyErrorByUrl(url: string, error: string) {
    try {
        const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.SYSTEM_PROXIES, [
            Query.equal('url', url)
        ]);
        if (response.total > 0) {
            await databases.updateDocument(DATABASE_ID, COLLECTIONS.SYSTEM_PROXIES, response.documents[0].$id, {
                error_msg: error,
                last_checked: now()
            });
        }
    } catch (e) {}
}

export async function removeAssignedProxy(userId: string) {
    try {
        const user = await getUser(userId) as any;
        if (user) {
            await databases.updateDocument(DATABASE_ID, COLLECTIONS.USERS, user.$id, { assigned_proxy_url: "" });
        }
    } catch (e) {}
}

export async function checkWelcomeSequence(botJid: string, customerJid: string): Promise<boolean> {
    const customerId = customerJid.split('@')[0];
    const bp = botJid.split('@')[0]; const docId = `w_${bp}_${customerId}`.replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 36);
    const profile = await getCustomerProfile(botJid, customerJid).catch(() => null);
    if (profile?.welcomeSequenceSent || profile?.welcomeSequenceSentAt) return true;
    try {
        await databases.getDocument(DATABASE_ID, COLLECTIONS.MESSAGES, docId);
        return true;
    } catch (e) {
        return false;
    }
}

export async function recordWelcomeSequenceStatus(botJid: string, customerJid: string, input: {
    status: "sent" | "skipped" | "failed" | "pending";
    reason?: string;
    source?: string;
    timestamp?: number;
}) {
    await updateCustomerProfile(botJid, customerJid, buildWelcomeSequenceProfilePatch(input)).catch(() => {});
}

export interface MarkWelcomeSequenceResult {
    success: boolean;
    profilePersisted: boolean;
    markerPersisted: boolean;
    error?: string;
}

export async function markWelcomeSequence(botJid: string, customerJid: string, input?: {
    source?: string;
    reason?: string;
    timestamp?: number;
}): Promise<MarkWelcomeSequenceResult> {
    const customerId = customerJid.split('@')[0];
    const bp = botJid.split('@')[0]; const docId = `w_${bp}_${customerId}`.replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 36);
    const timestamp = Number(input?.timestamp) || now();
    let profilePersisted = false;
    let markerPersisted = false;
    let profileError: any = null;
    let markerError: any = null;

    try {
        await updateCustomerProfile(botJid, customerJid, {
            welcomeSequenceSent: true,
            welcomeSequenceSentAt: timestamp,
            ...buildWelcomeSequenceProfilePatch({
                status: "sent",
                reason: input?.reason,
                source: input?.source || "automatic_welcome",
                timestamp,
            }),
        });
        profilePersisted = true;
    } catch (e: any) {
        profileError = e;
    }

    try {
        const data = {
            bot_id: botJid,
            customer_id: customerId,
            role: 'system',
            text: 'welcome_sent',
            timestamp
        };
        await databases.updateDocument(DATABASE_ID, COLLECTIONS.MESSAGES, docId, data)
            .catch(async (e: any) => {
                if (e?.code === 404) {
                    await databases.createDocument(DATABASE_ID, COLLECTIONS.MESSAGES, docId, data);
                } else {
                    throw e;
                }
            });
        markerPersisted = true;
    } catch (e: any) {
        markerError = e;
    }

    if (!profilePersisted && !markerPersisted) {
        console.error(`[WelcomePersistence] Failed to persist both customer profile and system marker for ${customerJid}: profileError=${profileError?.message || profileError}, markerError=${markerError?.message || markerError}`);
        return {
            success: false,
            profilePersisted: false,
            markerPersisted: false,
            error: "persistence_failed",
        };
    }

    if (!profilePersisted || !markerPersisted) {
        console.warn(`[WelcomePersistence] Partial persistence for ${customerJid}: profile=${profilePersisted}, marker=${markerPersisted}`);
    }

    return {
        success: true,
        profilePersisted,
        markerPersisted,
    };
}

export async function creditWalletBalance(userId: string, amount: number, type: string, description: string) {
    const user = await getUser(userId) as any;
    if (!user || !user.$id) throw new Error("User not found");
    const canonicalUserId = user.$id;
    const releaseLock = await acquireBillingLock(canonicalUserId);
    try {
        const safeAmount = Math.max(0, Number(amount || 0));
        const freshUser = await databases.getDocument(DATABASE_ID, COLLECTIONS.USERS, canonicalUserId).catch(() => null) as any;
        const targetUser = freshUser || user;
        const nextBalance = Number((Number(targetUser.wallet_balance || 0) + safeAmount).toFixed(6));
        await updateUser(canonicalUserId, { wallet_balance: nextBalance });
        await addWalletTransaction(canonicalUserId, safeAmount, type, description);
        if (isPaidAccessCredit(type, description, safeAmount)) {
            await markPaidAccessConfirmed(canonicalUserId, "paid_wallet_credit").catch(() => {});
        }
        return { success: true, newBalance: nextBalance };
    } finally {
        await releaseLock().catch(() => {});
    }
}

export async function debitWalletBalance(userId: string, amount: number, type: string, description: string) {
    const user = await getUser(userId) as any;
    if (!user || !user.$id) throw new Error("User not found");
    const canonicalUserId = user.$id;
    const releaseLock = await acquireBillingLock(canonicalUserId);
    try {
        const safeAmount = Math.max(0, Number(amount || 0));
        const freshUser = await databases.getDocument(DATABASE_ID, COLLECTIONS.USERS, canonicalUserId).catch(() => null) as any;
        const targetUser = freshUser || user;
        const balance = Math.max(0, Number(targetUser.wallet_balance || 0));
        if (balance < safeAmount) {
            return { success: false, reason: "insufficient_funds", balance };
        }
        const nextBalance = Number((balance - safeAmount).toFixed(6));
        await updateUser(canonicalUserId, { wallet_balance: nextBalance });
        await addWalletTransaction(canonicalUserId, -Math.abs(safeAmount), type, description);
        return { success: true, newBalance: nextBalance };
    } finally {
        await releaseLock().catch(() => {});
    }
}

export async function addSystemProxy(url: string) {
    try {
        await databases.createDocument(DATABASE_ID, COLLECTIONS.SYSTEM_PROXIES, ID.unique(), {
            url,
            is_active: 1,
            last_checked: now()
        });
    } catch (e) {}
}

export async function toggleSystemProxy(proxyId: string, isActive: boolean) {
    try {
        await databases.updateDocument(DATABASE_ID, COLLECTIONS.SYSTEM_PROXIES, proxyId, {
            is_active: isActive ? 1 : 0
        });
    } catch (e) {}
}

export async function deleteSystemProxy(proxyId: string) {
    try {
        await databases.deleteDocument(DATABASE_ID, COLLECTIONS.SYSTEM_PROXIES, proxyId);
    } catch (e) {}
}

export async function recordFollowupDelivery(botJid: string, customerJid: string, input: {
    followupId: string;
    status: "queued" | "sending" | "sent" | "failed" | "skipped";
    sentMessageId?: string;
    reason?: string;
    attemptKey?: string;
    customerLastMessageAt?: number;
    billingDedupeKey?: string;
}) {
    const customerId = customerJid.split('@')[0];
    const bp = botJid.split('@')[0]; const docId = `${bp}_${customerId}`.replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 36);
    try {
        let customer = null as any;
        try {
            customer = await databases.getDocument(DATABASE_ID, COLLECTIONS.CUSTOMERS, docId) as any;
        } catch {
            const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.CUSTOMERS, [
                Query.equal('bot_id', botJid),
                Query.equal('customer_id', customerId),
                Query.limit(1)
            ]).catch(() => ({ documents: [] } as any));
            customer = response.documents[0] as any;
        }
        if (!customer?.$id) return;
        const sentIds = parseSentFollowupIds(customer.sent_followups_json);
        const profile = customer.profile ? parseCustomerProfile(customer.profile) : {};
        const profilePatch = buildFollowupDeliveryPatch(profile, {
            followupId: input.followupId,
            status: input.status,
            sentMessageId: input.sentMessageId,
            reason: input.reason,
            attemptKey: input.attemptKey,
            customerLastMessageAt: input.customerLastMessageAt,
            billingDedupeKey: input.billingDedupeKey,
        });
        if (input.status === "sent" && !sentIds.includes(input.followupId)) {
            sentIds.push(input.followupId);
        }
        await databases.updateDocument(DATABASE_ID, COLLECTIONS.CUSTOMERS, customer.$id, {
            sent_followups_json: JSON.stringify(sentIds),
            profile: JSON.stringify({ ...profile, ...profilePatch })
        });
    } catch (e: any) {
        console.error("[Follow-up Delivery] recordFollowupDelivery failed:", e?.message || e);
    }
}

export async function markFollowupSent(botJid: string, customerJid: string, followupId: string, sentMessageId = "") {
    return recordFollowupDelivery(botJid, customerJid, {
        followupId,
        status: "sent",
        sentMessageId,
    });
}

// Final exports
export const db = {
    // legacy support if needed, but we should refactor callsites
    prepare: (sql: string) => ({ get: () => null, all: () => [], run: () => ({ changes: 0 }) }),
    exec: (sql: string) => {},
    transaction: (fn: any) => fn(),
} as any;

// Sequence helpers
export async function checkSequence(botJid: string, customerJid: string, seqFlagOrData: any, fallbackKey?: string): Promise<boolean> {
    const profile = await getCustomerProfile(botJid, customerJid);
    const { getSequenceSentFlagKeys } = await import("./sequence-trigger-service.ts");
    const candidateKeys = typeof seqFlagOrData === "string"
        ? [seqFlagOrData, ...getSequenceSentFlagKeys(undefined, seqFlagOrData)]
        : getSequenceSentFlagKeys(seqFlagOrData, fallbackKey);

    if (profile) {
        for (const key of candidateKeys) {
            const val = profile[key];
            if (typeof val === 'number' && val > 0) return true;
            if (val === true) return true;
        }
    }

    try {
        const customerId = customerJid.split('@')[0];
        const bp = botJid.split('@')[0];
        for (const key of candidateKeys) {
            const docId = `seq_${bp}_${customerId}_${key.replace(/^seq_sent_/, "")}`.substring(0, 36);
            const doc = await databases.getDocument(DATABASE_ID, COLLECTIONS.MESSAGES, docId).catch(() => null);
            if (doc) return true;
        }
    } catch {}

    return false;
}

export async function getSequenceLastSent(botJid: string, customerJid: string, seqFlag: string): Promise<number | null> {
    const profile = await getCustomerProfile(botJid, customerJid);
    const val = profile?.[seqFlag];
    return typeof val === 'number' ? val : (val === true ? 1 : null); 
}

export interface MarkSequenceResult {
    success: boolean;
    profilePersisted: boolean;
    markerPersisted?: boolean;
    error?: string;
}

export async function markSequence(
    botJid: string,
    customerJid: string,
    seqFlagOrData: any,
    optionsOrFallback?: { timestamp?: number; fallbackKey?: string } | string,
    explicitFallback?: string
): Promise<MarkSequenceResult> {
    const fallbackKey = explicitFallback || (typeof optionsOrFallback === "string" ? optionsOrFallback : optionsOrFallback?.fallbackKey);
    const timestamp = typeof optionsOrFallback === "object" && typeof optionsOrFallback?.timestamp === "number" ? optionsOrFallback.timestamp : now();
    const { getSequenceSentFlagKeys } = await import("./sequence-trigger-service.ts");
    const candidateKeys = typeof seqFlagOrData === "string"
        ? [seqFlagOrData, ...getSequenceSentFlagKeys(undefined, seqFlagOrData)]
        : getSequenceSentFlagKeys(seqFlagOrData, fallbackKey);

    const patch: Record<string, any> = {};
    for (const k of candidateKeys) {
        patch[k] = timestamp;
    }

    let profilePersisted = false;
    let profileError: any = null;
    try {
        await updateCustomerProfile(botJid, customerJid, patch);
        profilePersisted = true;
    } catch (e: any) {
        profileError = e;
        console.error(`[SequencePersistence] Failed to persist profile sequence flags for ${customerJid}:`, e);
    }

    let markerPersisted = false;
    try {
        const customerId = customerJid.split('@')[0];
        const bp = botJid.split('@')[0];
        const primaryKey = candidateKeys[0] || "sequence";
        const docId = `seq_${bp}_${customerId}_${primaryKey.replace(/^seq_sent_/, "")}`.substring(0, 36);
        const data = {
            bot_id: botJid,
            customer_id: customerId,
            role: 'system',
            text: `sequence_sent:${primaryKey}`,
            timestamp,
        };
        await databases.updateDocument(DATABASE_ID, COLLECTIONS.MESSAGES, docId, data)
            .catch(async (e: any) => {
                if (e?.code === 404) {
                    await databases.createDocument(DATABASE_ID, COLLECTIONS.MESSAGES, docId, data);
                } else {
                    throw e;
                }
            });
        markerPersisted = true;
    } catch (e) {}

    if (!profilePersisted && !markerPersisted) {
        return {
            success: false,
            profilePersisted: false,
            markerPersisted: false,
            error: profileError?.message || "persistence_failed",
        };
    }

    return {
        success: true,
        profilePersisted,
        markerPersisted,
    };
}


// Back-in-Stock Notifications
export async function saveBackInStockRequest(botJid: string, customerJid: string, productId: string, productName: string) {
    const customerId = customerJid.split('@')[0];
    try {
        const existing = await databases.listDocuments(DATABASE_ID, COLLECTIONS.BACK_IN_STOCK, [
            Query.equal('bot_id', botJid),
            Query.equal('customer_id', customerId),
            Query.equal('product_id', productId),
            Query.equal('status', 'pending'),
            Query.limit(1)
        ]);
        if (existing.documents.length > 0) return true;
    } catch {}

    const id = ID.unique();
    const data = {
        bot_id: botJid,
        customer_id: customerId,
        product_id: productId,
        product_name: productName,
        status: 'pending',
        created_at: now()
    };
    try {
        await databases.createDocument(DATABASE_ID, COLLECTIONS.BACK_IN_STOCK, id, data);
        return true;
    } catch (e) {
        console.error("[Appwrite] saveBackInStockRequest error:", e);
        return false;
    }
}

export async function getPendingStockRequests() {
    try {
        const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.BACK_IN_STOCK, [
            Query.equal('status', 'pending')
        ]);
        return response.documents;
    } catch (e) {
        return [];
    }
}

export async function markStockRequestNotified(requestId: string) {
    try {
        await databases.updateDocument(DATABASE_ID, COLLECTIONS.BACK_IN_STOCK, requestId, {
            status: 'sent',
            notified_at: now()
        });
    } catch (e) {}
}

async function getOwnerKeysForUser(userId: string) {
    const user = await getUser(userId) as any;
    if (!user) return [];
    const bots = await getBotsByUser(user.$id);
    return Array.from(new Set(collectAccountDataOwnerCandidates(user, bots).filter(Boolean)));
}

async function getStockRequestForUser(userId: string, requestId: string) {
    const ownerKeys = await getOwnerKeysForUser(userId);
    if (ownerKeys.length === 0) return null;
    const request = await databases.getDocument(DATABASE_ID, COLLECTIONS.BACK_IN_STOCK, requestId).catch(() => null) as any;
    if (!request || !ownerKeys.includes(request.bot_id)) return null;
    return request;
}

export async function cancelStockRequestForUser(userId: string, requestId: string) {
    const request = await getStockRequestForUser(userId, requestId);
    if (!request) throw new Error("Stock update not found");
    if (request.status === "sent" || request.status === "notified") throw new Error("Sent updates cannot be cancelled");
    await databases.updateDocument(DATABASE_ID, COLLECTIONS.BACK_IN_STOCK, requestId, { status: "cancelled" });
}

export async function deleteStockRequestForUser(userId: string, requestId: string) {
    const request = await getStockRequestForUser(userId, requestId);
    if (!request) throw new Error("Stock update not found");
    if (request.status === "sent" || request.status === "notified") throw new Error("Sent updates cannot be deleted");
    await databases.deleteDocument(DATABASE_ID, COLLECTIONS.BACK_IN_STOCK, requestId);
}

function normalizeScheduledAt(value: any) {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return 0;
    return num > 100000000000 ? Math.floor(num / 1000) : Math.floor(num);
}

function findCustomerByUpdateTarget(customers: any[], target: any) {
    return resolveCustomerUpdateTarget(customers, target)?.customer || null;
}

async function findPlannedCustomerUpdateForUser(userId: string, updateId: string) {
    const customers = await listCustomers(userId);
    for (const customer of customers as any[]) {
        const profile = parseCustomerProfile(customer.profile);
        const updates = normalizePlannedUpdates(profile.plannedCustomerUpdates);
        const update = updates.find((item) => item.id === updateId);
        if (!update) continue;
        const customerJid = resolveCustomerChatJid(customer);
        if (!customerJid) continue;
        return { customer, customerJid, profile, updates, update };
    }
    return null;
}

async function updateCustomerProfileOnExistingDocument(customer: any, customerJid: string, profileData: any) {
    const docId = customer?.$id || customer?.id;
    if (!docId) {
        await updateCustomerProfile(customer.bot_id, customerJid, profileData);
        return;
    }

    const existing = parseCustomerProfile(customer.profile);
    const activity = buildCustomerActivityUpdate(profileData, now());
    const updated = { ...existing, ...activity.profilePatch };
    await databases.updateDocument(DATABASE_ID, COLLECTIONS.CUSTOMERS, docId, {
        profile: JSON.stringify(updated),
        ...activity.documentPatch
    });
}

export async function createPlannedCustomerUpdateForUser(userId: string, input: any) {
    const customers = await listCustomers(userId);
    const target = String(input?.customerId || input?.customerJid || "").trim();
    const resolvedTarget = resolveCustomerUpdateTarget(customers, target);
    const user = await getUser(userId).catch(() => null) as any;
    const ownerKey = buildAccountDataOwnerKey(user || userId) || (await getOwnerKeysForUser(userId))[0];
    if (!ownerKey) throw new Error("Account owner could not be resolved");

    const customer = resolvedTarget?.customer || null;
    const customerJid = resolvedTarget?.customerJid || normalizeWhatsAppJid(target);
    if (!customerJid) throw new Error("Enter a valid customer, phone number, JID, or LID");

    const message = String(input?.message || "").trim().slice(0, 800);
    if (!message) throw new Error("Message is required");

    const scheduledAt = normalizeScheduledAt(input?.scheduledAt);
    if (!scheduledAt || scheduledAt <= now() - 60) throw new Error("Schedule time must be in the future");

    const repeat = normalizeCustomerUpdateRepeat(input?.repeat);
    const createdAt = now();
    const bots = await getBotsByUser(userId).catch(() => []) as any[];
    const defaultUpdateBotId = String(input?.defaultBotId || bots[0]?.$id || bots[0]?.id || ownerKey || "").trim();
    const update: PlannedCustomerUpdate = {
        id: `planned_${createdAt}_${Math.random().toString(36).slice(2, 8)}`,
        status: "pending",
        requestedText: String(input?.requestedText || message).trim().slice(0, 500),
        summary: String(input?.summary || "Manual customer update scheduled.").trim().slice(0, 300),
        message,
        scheduledAt,
        createdAt,
        repeat,
        defaultBotId: defaultUpdateBotId,
        sendFromMode: normalizeCampaignSendFromMode(input?.sendFromMode),
    };

    const botId = ownerKey;
    if (customer && customer.bot_id !== botId) {
        await updateCustomerProfileOnExistingDocument(customer, customerJid, {
            jid: customerJid,
            ...(customerJid.endsWith("@s.whatsapp.net") ? buildPhoneProfilePatch(customerJid) : {})
        });
    } else if (!customer) {
        await updateCustomerProfile(botId, customerJid, {
            jid: customerJid,
            ...(customerJid.endsWith("@s.whatsapp.net") ? buildPhoneProfilePatch(customerJid) : {})
        });
    }
    await saveCustomerPlannedUpdate(botId, customerJid, update);
    const displayCustomer = customer || { customer_id: customerJid, profile: { jid: customerJid, ...(customerJid.endsWith("@s.whatsapp.net") ? buildPhoneProfilePatch(customerJid) : {}) } };
    return { ...update, type: "planned", botId, customerId: customer?.customer_id || customerJid, customerJid, customerName: getCustomerDisplayName(displayCustomer) };
}

export async function updatePlannedCustomerUpdateForUser(userId: string, updateId: string, patch: any) {
    const found = await findPlannedCustomerUpdateForUser(userId, updateId);
    if (!found) throw new Error("Planned update not found");
    if (found.update.status === "sent") throw new Error("Sent updates cannot be edited");

    const nextUpdate: PlannedCustomerUpdate = { ...found.update };
    if (patch?.message !== undefined) {
        const message = String(patch.message || "").trim().slice(0, 800);
        if (!message) throw new Error("Message is required");
        nextUpdate.message = message;
        nextUpdate.requestedText = String(patch.requestedText || message).trim().slice(0, 500);
    }
    if (patch?.summary !== undefined) {
        nextUpdate.summary = String(patch.summary || "Manual customer update scheduled.").trim().slice(0, 300);
    }
    if (patch?.scheduledAt !== undefined) {
        const scheduledAt = normalizeScheduledAt(patch.scheduledAt);
        if (!scheduledAt || scheduledAt <= now() - 60) throw new Error("Schedule time must be in the future");
        nextUpdate.scheduledAt = scheduledAt;
    }
    if (patch?.repeat !== undefined) {
        nextUpdate.repeat = normalizeCustomerUpdateRepeat(patch.repeat);
    }
    if (patch?.defaultBotId !== undefined) {
        nextUpdate.defaultBotId = String(patch.defaultBotId || "").trim();
    }
    if (patch?.sendFromMode !== undefined) {
        nextUpdate.sendFromMode = normalizeCampaignSendFromMode(patch.sendFromMode);
    }
    if (patch?.message !== undefined || patch?.summary !== undefined || patch?.scheduledAt !== undefined || patch?.repeat !== undefined) {
        nextUpdate.status = "pending";
    }

    const nextTarget = String(patch?.customerId || patch?.customerJid || "").trim();
    if (nextTarget) {
        const customers = await listCustomers(userId);
        const resolvedTarget = resolveCustomerUpdateTarget(customers, nextTarget);
        const targetJid = resolvedTarget?.customerJid || normalizeWhatsAppJid(nextTarget);
        if (!targetJid) throw new Error("Enter a valid customer, phone number, JID, or LID");
        if (targetJid !== found.customerJid) {
            const user = await getUser(userId).catch(() => null) as any;
            const ownerKey = buildAccountDataOwnerKey(user || userId) || (await getOwnerKeysForUser(userId))[0];
            if (!ownerKey) throw new Error("Account owner could not be resolved");
            const oldUpdates = found.updates.filter((item) => item.id !== updateId);
            await updateCustomerProfileOnExistingDocument(found.customer, found.customerJid, { plannedCustomerUpdates: oldUpdates });
            if (!resolvedTarget?.customer) {
                await updateCustomerProfile(ownerKey, targetJid, {
                    jid: targetJid,
                    ...(targetJid.endsWith("@s.whatsapp.net") ? buildPhoneProfilePatch(targetJid) : {})
                });
            }
            await saveCustomerPlannedUpdate(ownerKey, targetJid, nextUpdate);
            const displayCustomer = resolvedTarget?.customer || { customer_id: targetJid, profile: { jid: targetJid, ...(targetJid.endsWith("@s.whatsapp.net") ? buildPhoneProfilePatch(targetJid) : {}) } };
            return { ...nextUpdate, type: "planned", botId: ownerKey, customerId: resolvedTarget?.customer?.customer_id || targetJid, customerJid: targetJid, customerName: getCustomerDisplayName(displayCustomer) };
        }
    }

    const nextUpdates = found.updates.map((item) => item.id === updateId ? nextUpdate : item);
    await updateCustomerProfileOnExistingDocument(found.customer, found.customerJid, { plannedCustomerUpdates: nextUpdates });
    return { ...nextUpdate, type: "planned", botId: found.customer.bot_id, customerId: found.customer.customer_id, customerJid: found.customerJid, customerName: getCustomerDisplayName(found.customer) };
}

export async function cancelPlannedCustomerUpdateForUser(userId: string, updateId: string) {
    const found = await findPlannedCustomerUpdateForUser(userId, updateId);
    if (!found) throw new Error("Planned update not found");
    if (found.update.status === "sent") throw new Error("Sent updates cannot be cancelled");
    const nextUpdates = found.updates.map((item) => item.id === updateId ? { ...item, status: "cancelled" as const } : item);
    await updateCustomerProfileOnExistingDocument(found.customer, found.customerJid, { plannedCustomerUpdates: nextUpdates });
}

export async function deletePlannedCustomerUpdateForUser(userId: string, updateId: string) {
    const found = await findPlannedCustomerUpdateForUser(userId, updateId);
    if (!found) throw new Error("Planned update not found");
    if (found.update.status === "sent") throw new Error("Sent updates cannot be deleted");
    const nextUpdates = found.updates.filter((item) => item.id !== updateId);
    await updateCustomerProfileOnExistingDocument(found.customer, found.customerJid, { plannedCustomerUpdates: nextUpdates });
}

export async function saveCustomerPlannedUpdate(botJid: string, customerJid: string, update: PlannedCustomerUpdate) {
    const profile = await getCustomerProfile(botJid, customerJid).catch(() => null) || {};
    const updates = normalizePlannedUpdates(profile.plannedCustomerUpdates);
    const duplicate = updates.find((item) =>
        item.status === 'pending' &&
        item.requestedText === update.requestedText &&
        Math.abs(item.scheduledAt - update.scheduledAt) < 10 * 60
    );
    const nextUpdates = duplicate
        ? updates.map((item) => item.id === duplicate.id ? { ...item, ...update, id: item.id } : item)
        : [...updates, update];
    await updateCustomerProfile(botJid, customerJid, {
        plannedCustomerUpdates: nextUpdates.slice(-30)
    });
    return duplicate?.id || update.id;
}

export async function getDuePlannedCustomerUpdates(botJid: string, dueAt: number, limitCount = 10) {
    try {
        const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.CUSTOMERS, [
            Query.equal('bot_id', botJid),
            Query.limit(5000)
        ]);
        const due: any[] = [];
        for (const customer of response.documents as any[]) {
            const profile = parseCustomerProfile(customer.profile);
            const customerJid = resolveCustomerChatJid(customer);
            if (!customerJid) continue;
            const updates = normalizePlannedUpdates(profile.plannedCustomerUpdates);
            for (const update of updates) {
                if (update.status === 'pending' && update.scheduledAt <= dueAt) {
                    due.push({ ...update, bot_id: botJid, customer, customerJid, profile });
                    if (due.length >= limitCount) return due.sort((a, b) => a.scheduledAt - b.scheduledAt);
                }
            }
        }
        return due.sort((a, b) => a.scheduledAt - b.scheduledAt);
    } catch (e) {
        return [];
    }
}

export async function markPlannedCustomerUpdateSent(botJid: string, customerJid: string, updateId: string, sentMessageId = "", meta: {
    actualBotId?: string;
    actualBotJid?: string;
    fallbackReason?: string;
} = {}) {
    const profile = await getCustomerProfile(botJid, customerJid).catch(() => null) || {};
    const updates = normalizePlannedUpdates(profile.plannedCustomerUpdates);
    const sentAt = now();
    const nextUpdates = updates.map((item) => {
        if (item.id !== updateId) return item;
        const repeat = normalizeCustomerUpdateRepeat(item.repeat);
        const sentCount = Number(item.sentCount || 0) + 1;
        if (repeat !== "none") {
            return {
                ...item,
                status: "pending" as const,
                repeat,
                scheduledAt: getNextRepeatScheduledAt(item.scheduledAt, repeat, sentAt),
                sentAt,
                lastSentAt: sentAt,
                sentCount,
                sentMessageId,
                actualBotId: meta.actualBotId || item.actualBotId,
                actualBotJid: meta.actualBotJid || item.actualBotJid,
                fallbackReason: meta.fallbackReason || item.fallbackReason
            };
        }
        return {
            ...item,
            status: 'sent' as const,
            sentAt,
            lastSentAt: sentAt,
            sentCount,
            sentMessageId,
            actualBotId: meta.actualBotId || item.actualBotId,
            actualBotJid: meta.actualBotJid || item.actualBotJid,
            fallbackReason: meta.fallbackReason || item.fallbackReason
        };
    });
    await updateCustomerProfile(botJid, customerJid, { plannedCustomerUpdates: nextUpdates });
}

export async function isPlannedCustomerUpdatePending(botJid: string, customerJid: string, updateId: string) {
    const profile = await getCustomerProfile(botJid, customerJid).catch(() => null) || {};
    const updates = normalizePlannedUpdates(profile.plannedCustomerUpdates);
    return updates.some((item) => item.id === updateId && item.status === "pending");
}

export async function listCustomerUpdatesForUser(userId: string) {
    const user = await getUser(userId) as any;
    if (!user) return { stock: [], planned: [], items: [] };
    const bots = await getBotsByUser(user.$id);
    const ownerKeys = Array.from(new Set(collectAccountDataOwnerCandidates(user, bots).filter(Boolean)));
    const customers = await listCustomers(user.$id);
    const stock: any[] = [];

    for (const ownerKey of ownerKeys) {
        const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.BACK_IN_STOCK, [
            Query.equal('bot_id', ownerKey),
            Query.orderDesc('created_at'),
            Query.limit(500)
        ]).catch(() => ({ documents: [] } as any));
        for (const request of response.documents as any[]) {
            const productName = request.product_name || request.product_id || "requested product";
            const customerJid = resolveCustomerChatJid({ customer_id: request.customer_id });
            const linkedCustomer = findCustomerByUpdateTarget(customers, customerJid || request.customer_id);
            const displayCustomer = linkedCustomer || { customer_id: request.customer_id, profile: { jid: customerJid } };
            stock.push({
                id: request.$id,
                type: "stock",
                status: request.status === "notified" ? "sent" : (request.status || "pending"),
                botId: request.bot_id,
                customerId: request.customer_id,
                customerJid: linkedCustomer ? resolveCustomerChatJid(linkedCustomer) : customerJid,
                customerName: getCustomerDisplayName(displayCustomer),
                summary: buildBackInStockSummary(productName),
                message: buildBackInStockUpdateMessage(productName),
                scheduledAt: request.created_at || 0,
                createdAt: request.created_at || 0,
                sentAt: request.notified_at || null,
                repeat: "none",
                productId: request.product_id,
                productName,
            });
        }
    }

    const planned: any[] = [];
    for (const customer of customers as any[]) {
        const profile = parseCustomerProfile(customer.profile);
        const customerJid = resolveCustomerChatJid(customer);
        const customerName = getCustomerDisplayName(customer);
        for (const update of normalizePlannedUpdates(profile.plannedCustomerUpdates)) {
            planned.push({
                ...update,
                type: "planned",
                botId: customer.bot_id,
                customerId: customer.customer_id,
                customerJid,
                customerName,
                sentAt: update.sentAt || null,
            });
        }
    }

    const items = [...stock, ...planned].sort((a, b) => {
        const aTime = a.status === "sent" ? (a.sentAt || a.scheduledAt || a.createdAt || 0) : (a.scheduledAt || a.createdAt || 0);
        const bTime = b.status === "sent" ? (b.sentAt || b.scheduledAt || b.createdAt || 0) : (b.scheduledAt || b.createdAt || 0);
        return bTime - aTime;
    });

    return { stock, planned, items };
}

// Dummy for Baileys auth state if needed
export const useFirestoreAuthState = async (botJid: string | null) => { return null; }
export const clearAppStateSyncKeys = async (botJid: string | null) => {}
export const wipeFirestoreAuthState = async (botJid: string | null) => {}
