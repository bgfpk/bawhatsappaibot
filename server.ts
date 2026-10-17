import { isPublicConversion, publicOrigin } from './src/staging/origin';
import { isStaging } from "./src/staging/runtime";
import { installStageBoundary } from "./src/staging/http-boundary";
import express from "express";
import http from "http";
import path from "path";
import crypto from "crypto";
import net from "net";
import cors from "cors";
import cookieParser from "cookie-parser";
import { fileURLToPath } from "url";
import * as dbService from './src/services/db-service.ts';
import { buildMediaContextHistoryText, getSavedMediaContextByMessage } from './src/services/message-media-context-service.ts';
import * as shippingService from './src/services/shipping-service.ts';
import * as inventoryService from './src/services/inventory-service.ts';
import { importCustomerContactsForUser } from './src/services/customer-contact-import-service.ts';
import { applyCustomerReplyControlToLinkedProfiles } from './src/services/customer-reply-control-apply-service.ts';
import { exportSharedPhoneDirectoryCsv, importSharedPhoneDirectoryRows, listSharedPhoneDirectory } from './src/services/shared-phone-directory-service.ts';
import { initSocketServer } from './src/realtime/socket-server.ts';
import { MAIN_REALTIME_SOCKET_PATH } from './src/realtime/constants.ts';
import { productHasAnyStock } from './src/services/stock-reminder-target-service.ts';
import { updateStockRequestForUser } from './src/services/stock-reminder-admin-service.ts';
import { format } from "date-fns";
import childProcess from "child_process";
import fs from "fs";
import httpProxy from "http-proxy";
import dotenv from "dotenv";
dotenv.config();
import { buildWorkerInternalHeaders, getOrCreateServerInternalSecret, WORKER_AUTH_CONSTANTS } from './src/services/worker-internal-auth-service.ts';
import { registerWorkerPort, unregisterWorkerPort } from './src/services/worker-port-registry-service.ts';
import { generateOAuthState, registerOAuthState, validateAndConsumeOAuthState, signOAuthState, generateCryptoAuthId } from './src/services/oauth-state-security-service.ts';
import { storeSecureOtp, verifySecureOtp, deleteStoredOtp } from './src/services/otp-security-service.ts';
import { encryptServerSecret, decryptServerSecret } from './src/services/secret-crypto-service.ts';
import axios from "axios";
import { GoogleGenAI } from "@google/genai";
import { generateSecret, generateURI, verifySync } from "otplib";
import { getAppStatus, setAppStatus } from './src/utils/app-status-util.ts';
import { FOLLOWUP_SCAN_INTERVAL_MS, isFollowupActive, isFollowupSchedulerEnabled, parseFollowupList } from './src/services/followup-campaign-service.ts';
import { refreshDatabaseId as refreshDbServiceId } from './src/services/db-service.ts';
import { refreshDatabaseId as refreshClientDbId, Query as AppwriteQuery, databases, COLLECTIONS, DATABASE_ID } from './src/config/appwrite-client.ts';
import { collectAccountDataOwnerCandidates, buildAccountDataOwnerKey } from './src/utils/account-data-owner.ts';
import { getProfilePhone, parseCustomerProfile, resolveCustomerChatJid } from './src/utils/whatsapp-jid.ts';
import { getCustomerContactIdentity } from './src/utils/contact-identity.ts';
import { resolveCustomerIdentity } from './src/services/customer-identity-resolver-service.ts';
import { exec } from 'child_process';
import { promisify } from 'util';
import QRCode from 'qrcode';
import { releaseWhatsAppNumberLock } from './src/services/whatsapp-number-lock.ts';
import { compactAiText } from './src/services/ai-cost-control-service.ts';
import { appendMarketingReport, readMarketingReport } from './src/services/marketing-report-service.ts';
import { deliverMarketingFollowup } from './src/services/marketing-followup-delivery-service.ts';
import { collectSuccessfulFollowupStats } from './src/services/marketing-followup-stats-service.ts';
import { sendFollowupThroughWorker } from './src/services/followup-worker-delivery-service.ts';
import { checkSystemProxyList, PROXY_HEALTH_INITIAL_DELAY_MS, PROXY_HEALTH_INTERVAL_MS, sanitizeProxyErrorMessage, testProxyUrl } from './src/services/proxy-health-service.ts';
import { buildPostexBookingPayload as buildPostexBookingPayloadFromOrder } from './src/services/postex-booking-payload-service.ts';
import { getMarketingAudienceLabel, hasCustomerOrder, normalizeMarketingAudience } from './src/services/marketing-audience-service.ts';
import { syncAllInstanceNumbersToMainBlacklist } from './src/services/main-account-blacklist-service.ts';
import { createCreemCheckout, createCreemCustomerPortal, processCreemWebhook } from './src/services/creem-billing-service.ts';
import {
  getWalletBillingPurchasesEnabled,
  normalizeWalletPurchaseIdempotencyKey,
  purchaseAddonWithWallet,
  purchasePlanWithWallet,
  purchaseSetupWithWallet,
  setWalletBillingPurchasesEnabled,
} from './src/services/wallet-billing-purchase-service.ts';
import { AI_USAGE_RATES, getUsageBillingDefinition, MINIMUM_BILLABLE_USAGE_COST_USD } from './src/config/pricing.ts';
import { APP_TRIAL_FREE_AI_REPLIES, buildAccessBlockedMessage, getBaseLimitsForUser, getBillingAccess, normalizeEpochSeconds, TRIAL_LIMITS } from './src/config/billing-access.ts';
import { addActiveAddonQuantities, buildAccountLimits } from './src/services/account-limit-service.ts';
import { markBillingNotificationStateResolved, sendBillingNotification } from './src/services/billing-notification-service.ts';
import { getSavedBillingCapacityUsageForUser } from './src/services/billing-capacity-service.ts';
import { hashPassword, isOAuthPasswordValue, isStoredPasswordHash, shouldMigratePlaintextPassword, verifyPasswordAgainstHash } from './src/services/password-security.ts';
import { maskProxyUrl, normalizeProxyUrl } from './src/services/proxy-agent-service.ts';
import { buildAdminMagicLoginLink } from './src/services/admin-magic-link-url.ts';
import {
  getProactiveAlertPreferences,
  saveProactiveAlertPreferences,
  startProactiveBusinessScheduler,
} from './src/services/admin-proactive-service.ts';
import {
  getProactiveLeadSettings,
  saveProactiveLeadSettings,
} from './src/services/proactive-lead-intelligence-service.ts';
import {
  startAdminReminderScheduler,
  listRemindersForAccount,
  createReminderForAccount,
  rescheduleReminderForAccount,
  cancelReminderForAccount,
} from './src/services/admin-reminder-service.ts';
import {
  resolveBusinessTimezone,
  isValidBusinessTimezone,
  getExplicitAccountTimezone,
  hasConfiguredTimezone,
} from './src/services/business-timezone-service.ts';
import {
  createAdminPairingChallenge,
  verifyAdminPairingChallenge,
  revokeAdminPairing,
  getAdminPairingStatus,
} from './src/services/admin-pairing-service.ts';
import { canManageAdminPairing, getCanonicalAdminPhone, normalizeAdminWhatsAppIdentity, extractBotPhoneNumber, isCanonicalBusinessAssistantEnabled } from './src/services/admin-identity-service.ts';
import { listAdminActions } from './src/services/admin-action-registry-service.ts';
import { getAdminAuditEvents, maskAdminIdentity } from './src/services/admin-audit-service.ts';
import { buildRobotsTxt, buildSitemapXml, injectPublicSeoIntoHtml, isPublicAuthLocation } from './src/config/public-seo.ts';
import { buildUserConfigWritePayload } from './src/services/user-config-save-payload-service.ts';
import { getFollowupCampaignCost, normalizeFollowupCampaignType } from './src/services/followup-campaign-type-service.ts';
import { normalizeCampaignSendFromMode, resolveCampaignSendingInstance } from './src/services/campaign-sending-instance-service.ts';
import { validateFollowupCampaignStillSendable } from './src/services/followup-campaign-revalidation-service.ts';
import { sanitizeCourierText } from './src/services/courier-broadcast-service.ts';
import { isOrderEditable, normalizeRecordType } from './src/services/record-flow-service.ts';
import { buildTransparencyCsv, buildTransparencyRows, buildTransparencyText, normalizeBillingTimestamp } from './src/services/billing-report-service.ts';
import { listOutboundReceipts } from './src/services/outbound-send-receipt-service.ts';
import { queueCustomerChatSummaryRefresh } from './src/services/customer-summary-service.ts';
import {
  getClientGeminiStatus,
  getClientGeminiApiKeyForServer,
  isGoogleAiStudioGeminiApiKey,
  removeClientGeminiSetting,
  saveClientGeminiSetting,
} from './src/services/gemini-provider-service.ts';
import { chargeClientGeminiApiRequest } from './src/services/client-gemini-billing-service.ts';
import { buildClientGeminiUsageSummary } from './src/services/client-gemini-usage-stats-service.ts';
import { listClientGeminiCacheTelemetry } from './src/services/client-gemini-cache-telemetry-service.ts';
import { buildAdminAccountingReport } from './src/services/admin-accounting-service.ts';
import {
  buildDuplicatePhoneSignupMessage,
  findExistingAccountByPhone,
  normalizeAccountPhone,
} from './src/services/account-phone-ownership-service.ts';
import { checkCheapGeminiModelAvailability, getCheapGeminiModelAvailabilityStatus } from './src/services/gemini-model-availability-service.ts';
import { emitLiveConsoleEvent, listLiveConsoleEvents } from './src/services/live-console-event-service.ts';
import {
  DEFAULT_SMART_SALES_PROMPT,
  getSmartSalesPromptConfig,
  saveSmartSalesPromptConfig,
  SMART_SALES_PROMPT_VERSION,
} from './src/services/smart-sales-engine-service.ts';
import {
  calculateThirtyDayTrialExtension,
  extendTrialForUser,
  hasUsedTrialExtension,
  resolveLegacyTrialExtension,
  evaluateTrialExtensionStatus,
} from './src/services/admin-trial-extension-service.ts';
import { createBotWorkerLifecycleManager } from './src/services/bot-worker-lifecycle-service.ts';
import { compactSavedAiTrainingConfig } from './src/services/instruction-compaction-service.ts';
import { resolveBotAiChatReplyMode } from './src/services/bot-ai-chat-reply-mode-service.ts';
import {
  getWooCommerceStatus,
  previewWooCommerceProducts,
  removeWooCommerceConnection,
  saveWooCommerceConnection,
  syncWooCommerceProducts,
  testWooCommerceConnection,
} from './src/services/woocommerce-integration-service.ts';
import {
  authenticatePublicApiKey,
  checkPublicApiRateLimit,
  createApiKey,
  getPublicAccountStatus,
  listApiKeys,
  listApiRequestLogs,
  PUBLIC_API_RATE_LIMITS,
  revokeApiKey,
} from './src/services/public-api-key-service.ts';
import { registerIntegrationLeadCaptureRoutes } from './src/routes/integration-lead-capture-routes.ts';
import {
  startBillingReconciliationScheduler,
  stopBillingReconciliationScheduler,
  isBillingReconciliationSchedulerRunning,
} from './src/services/billing-reconciliation-service.ts';
import { getLeadCaptureAuthStatus } from './src/services/integration-auth-service.ts';
import { getIntegrationEventSummary, listIntegrationEvents } from './src/services/integration-event-log-service.ts';
import {
  createWebhookEndpoint,
  deleteWebhookEndpoint,
  listWebhookDeliveries,
  listWebhookEndpoints,
  regenerateWebhookSecret,
  sendWebhookTestEvent,
  updateWebhookEndpoint,
  WEBHOOK_EVENT_TYPES,
} from './src/services/webhook-foundation-service.ts';
import { getMetaOnboardingPublicConfig } from './src/services/whatsapp-meta-onboarding-config.ts';
import { createOnboardingAttempt } from './src/services/whatsapp-meta-onboarding-session.ts';
import {
  completeMetaOnboarding,
  disconnectMetaCloudInstance,
} from './src/services/whatsapp-meta-onboarding-service.ts';
import { evaluateCloudProviderHealth } from './src/services/whatsapp-cloud-api-health-service.ts';
import { checkCloudPlatformPreflight } from './src/services/whatsapp-cloud-api-platform-preflight.ts';
import { syncWabaTemplatesForBot } from './src/services/whatsapp-cloud-api-template-service.ts';
import { INTEGRATION_FOUNDATION_COLLECTIONS } from './src/services/integration-foundation-store.ts';
import {
  createApiMessageRequest,
  createListCampaign,
  createSavedRecipientList,
  getCustomerUpdateListFoundation,
  getMessageJobStatus,
  getRunStatus,
  removeSavedListMember,
  updateCampaignStatus,
} from './src/services/customer-update-list-campaign-service.ts';
import { registerCampaignContactRoutes } from './src/routes/campaign-contact-routes.ts';
import { handleSendingInstanceDeleted, processDueCampaignRecipients } from './src/services/campaign-service.ts';
import { registerWorkspaceRoutes } from './src/routes/workspace-routes.ts';
import { handleInstanceDeleted as handleWorkspaceInstanceDeleted, sweepDueReminders } from './src/services/workspace-service.ts';
import { ensureCampaignAndContactsSchema } from './src/services/campaign-contact-schema-provisioning.ts';
import { ensureWorkspaceSchema } from './src/services/workspace-schema-provisioning.ts';
import {
  applyCrmSmartAction,
  createCrmCallLog,
  createCrmFollowUp,
  getCrmNotifications,
  getCrmLeadListResult,
  getCrmLeadDetail,
  getCrmOverview,
  getCrmReports,
  listCrmStaff,
  listCrmLeads,
  patchCrmLead,
  patchCrmStaff,
  recordPublicLead,
  updateCrmAgentModeSettings,
  updateCrmNotificationState,
  updateCrmNotificationStatesBulk,
  updateCrmDealStage,
  updateCrmFollowUp,
  upsertCrmStaff,
  upsertCrmLead,
} from './src/services/crm-foundation-service.ts';
import { runCrmAgentMode } from './src/services/crm-agent-mode-service.ts';
import {
  recordWebsiteKnowledgeSyncFailure,
  getWebsiteKnowledgeOverview,
} from './src/services/website-knowledge-service.ts';
import {
  recordWebsiteKnowledgeSyncFailures,
  syncWebsiteKnowledgeBatch,
} from './src/services/website-knowledge-batch-service.ts';
import { normalizeWebsiteKnowledgeSyncInputs } from './src/services/website-knowledge-sync-utils.ts';
import {
  DASHBOARD_ALERT_PREFERENCES_STORE_KEY,
  normalizeDashboardAlertPreferences,
} from './src/services/dashboard-alert-preferences-service.ts';
import {
  DASHBOARD_NOTIFICATION_STATE_STORE_KEY,
  normalizeDashboardNotificationState,
  updateDashboardNotificationState,
} from './src/services/dashboard-notification-state-service.ts';
import {
  DASHBOARD_WHATSAPP_ALERT_DELIVERY_STORE_KEY,
  deliverDashboardWhatsAppAlerts,
} from './src/services/dashboard-whatsapp-alert-delivery-service.ts';
import {
  verifyCloudApiWebhookChallenge,
  verifyMetaWebhookSignature,
  extractCloudApiWebhookEvents,
  summarizeCloudApiWebhookEvent
} from "./src/services/whatsapp-cloud-api-webhook.ts";
import {
  normalizeInstancePurpose,
  validateControlBusinessLink,
  isPersonalInstance,
  resolveCanonicalInstanceStatus,
} from "./src/services/instance-purpose-service.ts";
import {
  isPersonalAssistantFeatureEnabled,
  injectPersonalAssistantRuntimeConfig,
} from "./src/services/personal-assistant-config-service.ts";
import {
  getOwnerProfile,
  updateOwnerProfile,
  clearOwnerProfile,
} from "./src/services/owner360-service.ts";
import {
  Owner360Error,
} from "./src/services/owner360-types.ts";
import * as personalContactService from "./src/services/personal-contact-service.ts";
import {
  getIncomingPersonalAssistantSettings,
  saveIncomingPersonalAssistantSettings,
} from "./src/services/personal-incoming-settings-service.ts";
import { listPendingPersonalEscalations } from "./src/services/personal-owner-escalation-service.ts";
import {
  getPersonalOutboundMission,
  listPersonalOutboundMissions,
  updateMissionStatus,
  savePersonalOutboundMission,
} from "./src/services/personal-outbound-storage-service.ts";
import {
  resolvePersonalInstanceForMission,
  resolveTargetForMission,
} from "./src/services/personal-outbound-target-service.ts";
import {
  generateFirstOutboundMissionMessage,
} from "./src/services/personal-outbound-planner-service.ts";
import {
  sendPersonalOutboundMissionMessage,
} from "./src/services/personal-outbound-send-service.ts";
import type { PersonalOutboundMission } from "./src/services/personal-outbound-types.ts";
import {
  getPersonalTask,
  listPersonalTasks,
  savePersonalTask,
} from "./src/services/personal-task-storage-service.ts";
import { transitionPersonalTask } from "./src/services/personal-task-state-machine.ts";
import { correlateOwnerAnswer } from "./src/services/personal-task-owner-question-service.ts";
import { resolvePersonalTaskApproval } from "./src/services/personal-task-approval-service.ts";
import { cancelTaskFollowUp } from "./src/services/personal-task-scheduler-service.ts";
import {
  getPersonalDelegationPolicy,
  savePersonalDelegationPolicy,
} from "./src/services/personal-delegation-policy-service.ts";
import {
  getGooglePersonalConnection,
  disconnectGooglePersonalConnection,
  setInternalGoogleCapabilityEnabled,
} from "./src/services/google-personal-connection-service.ts";
import {
  initiateGoogleOAuthFlow,
  handleGoogleOAuthCallback,
} from "./src/services/google-personal-oauth-service.ts";
import {
  listSelectedDriveFiles,
  validateDriveFileAccess,
  removeSelectedDriveFile,
} from "./src/services/google-drive-file-service.ts";
import {
  getControlBusinessInstanceId,
} from "./src/services/instance-purpose-service.ts";
import {
  recordManualTakeover,
  clearManualTakeover,
  isManualTakeoverActive,
} from "./src/services/personal-incoming-eligibility-service.ts";
import { getDailyCommitmentRecord } from "./src/services/personal-commitment-limit-service.ts";
import { getActiveTaskForContact } from "./src/services/personal-task-storage-service.ts";

const execAsync = promisify(exec);
const runSchemaSync = () => execAsync(`"${process.execPath}" --import tsx verify-live-db.ts`, {
  cwd: process.cwd(),
  env: { ...process.env }
});

const now = () => Math.floor(Date.now() / 1000);
function parseDateOnlyUtcStart(value: any) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return Math.floor(new Date(text).getTime() / 1000);
  return Math.floor(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0) / 1000);
}

function parseDateOnlyUtcExclusiveEnd(value: any) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    const d = new Date(text);
    d.setUTCDate(d.getUTCDate() + 1);
    return Math.floor(d.getTime() / 1000);
  }
  return Math.floor(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + 1, 0, 0, 0) / 1000);
}
const FOLLOWUP_MAX_SENDS_PER_SCAN = Math.max(1, Number(process.env.FOLLOWUP_MAX_SENDS_PER_SCAN || 50));
const followupSchedulerState = {
  started: false,
  running: false,
  lastScanAt: 0,
  nextScanAt: 0,
  lastReason: "",
};
const PROXY_QUOTA_CLEANUP_INTERVAL_MS = 30 * 60 * 1000;
const billingAlertDateKey = (currentTime: number) => new Date(currentTime * 1000).toISOString().slice(0, 10);
const normalizeTime = (t: any) => {
    const num = Number(t);
    if (!num) return 0;
    return num > 100000000000 ? Math.floor(num / 1000) : num;
};

function isAdminAccount(user: any) {
  const role = String(user?.role || "").toLowerCase();
  return role === "admin" || role === "super_admin" || role === "superadmin";
}

function isSuperAdminAccount(user: any) {
  const role = String(user?.role || "").toLowerCase();
  return role === "super_admin" || role === "superadmin";
}

const AUTH_COOKIE_NAME = isStaging ? "blackarrow_conversion_auth" : "blackarrow_auth";
const REGULAR_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const TEMPORARY_SESSION_TTL_SECONDS = 10 * 60;

function resolveSessionSecret(): string {
  if (process.env.NODE_ENV === "production") {
    const prodSecret = String(process.env.AUTH_SESSION_SECRET || "").trim();
    if (!prodSecret) {
      throw new Error("[Security Configuration Error] Missing AUTH_SESSION_SECRET in production environment. Refusing to boot with insecure derived session key.");
    }
    return prodSecret;
  }
  const explicit = String(process.env.AUTH_SESSION_SECRET || process.env.SESSION_SECRET || "").trim();
  if (explicit) return explicit;
  console.warn("[Security Warning] Using non-production fallback session secret. Ensure AUTH_SESSION_SECRET is configured before deploying.");
  return `${process.env.APPWRITE_API_KEY_DEV || ""}:${process.env.APPWRITE_API_KEY_LIVE || ""}:blackarrow-local-session`;
}
const SESSION_SECRET = resolveSessionSecret();

function getStableUserId(user: any) {
  return String(user?.$id || user?.id || "");
}

function toBase64Url(input: string | Buffer) {
  return Buffer.from(input).toString("base64url");
}

function fromBase64Url(input: string) {
  return Buffer.from(input, "base64url").toString("utf8");
}

function signSessionPayload(encodedPayload: string) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(encodedPayload).digest("base64url");
}

function serializeSessionToken(payload: Record<string, any>) {
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = signSessionPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function parseSessionToken(token: string | undefined) {
  if (!token || !token.includes(".")) return null;
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;

  const expectedSignature = signSessionPayload(encodedPayload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(fromBase64Url(encodedPayload));
    if (!payload?.userId || normalizeTime(payload?.exp) <= now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function setAuthSession(res: any, user: any, options: { temporary?: boolean } = {}) {
  const temporary = options.temporary === true;
  const ttlSeconds = temporary ? TEMPORARY_SESSION_TTL_SECONDS : REGULAR_SESSION_TTL_SECONDS;
  const payload = {
    userId: getStableUserId(user),
    temporary,
    exp: now() + ttlSeconds,
  };

  res.cookie(AUTH_COOKIE_NAME, serializeSessionToken(payload), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && (!isStaging || isPublicConversion),
    path: "/",
    maxAge: ttlSeconds * 1000,
  });
}

function clearAuthSession(res: any) {
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && (!isStaging || isPublicConversion),
    path: "/",
  });
}

function readCookieValueFromHeader(headerValue: string | undefined, cookieName: string) {
  if (!headerValue) return "";
  const parts = String(headerValue).split(";").map((part) => part.trim());
  for (const part of parts) {
    if (!part.startsWith(`${cookieName}=`)) continue;
    return decodeURIComponent(part.slice(cookieName.length + 1));
  }
  return "";
}

const GOOGLE_OAUTH_CALLBACK_PATH = "/api/auth/google/callback";
const GOOGLE_OAUTH_LEGACY_CALLBACK_PATHS = ["/auth/callback", "/auth/callback/", "/api/auth/callback", "/api/auth/callback/"];
const TRUSTED_APP_ORIGINS = new Set([
  ...(isStaging ? (isPublicConversion ? [publicOrigin] : ["http://localhost:3412", "http://127.0.0.1:3412"]) : []),
  ...(!isPublicConversion ? ["https://blackarrow-source.offline.invalid", "http://localhost:3000", "http://127.0.0.1:3000"] : []),
]);
const rateLimitStore = new Map<string, { count: number, resetAt: number }>();

function normalizeConfiguredUrl(rawValue: string | undefined) {
  const value = String(rawValue || "").trim();
  if (!value) return "";
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withScheme);
    return url.origin.replace(/\/$/, "");
  } catch {
    return "";
  }
}

function isLocalHostname(hostname: string) {
  const normalized = String(hostname || "").trim().toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "[::1]";
}

const ignoredPublicOriginWarnings = new Set<string>();

function getOriginHostname(origin: string) {
  try {
    return new URL(origin).hostname;
  } catch {
    return "";
  }
}

function isHttpsPublicOrigin(origin: string) {
  try {
    const url = new URL(origin);
    return url.protocol === "https:" && !isLocalHostname(url.hostname);
  } catch {
    return false;
  }
}

function getRequestOrigin(req: any) {
  const forwardedProto = String(req.get?.("x-forwarded-proto") || "").split(",")[0].trim();
  const forwardedHost = String(req.get?.("x-forwarded-host") || "").split(",")[0].trim();
  const hostHeader = forwardedHost || String(req.get?.("host") || "").trim();
  const hostname = hostHeader.split(":")[0];
  const normalizedHost = hostname.toLowerCase();
  const protocol = normalizedHost === "blackarrow-source.offline.invalid" || normalizedHost === "blackarrow-source.offline.invalid"
    ? "https"
    : forwardedProto || (isLocalHostname(hostname) ? "http" : "https");
  return normalizeConfiguredUrl(`${protocol}://${hostHeader}`);
}

function getPublicAppOrigin(req: any) {
  const configuredCandidates = [
    ["APP_URL", process.env.APP_URL],
    ["BASE_URL", process.env.BASE_URL],
    ["PUBLIC_URL", process.env.PUBLIC_URL],
    ["DOMAIN", process.env.DOMAIN],
  ] as const;

  for (const [name, rawValue] of configuredCandidates) {
    const origin = normalizeConfiguredUrl(rawValue);
    if (!origin) continue;
    if (process.env.NODE_ENV !== "production" || isHttpsPublicOrigin(origin)) return origin;

    const warningKey = `${name}:${origin}`;
    if (!ignoredPublicOriginWarnings.has(warningKey)) {
      ignoredPublicOriginWarnings.add(warningKey);
      const reason = isLocalHostname(getOriginHostname(origin)) ? "localhost/private development origin" : "non-HTTPS public origin";
      console.warn(`[MagicLink] Ignoring ${name}=${origin} for production magic-link origin because it is a ${reason}. Falling back to request host.`);
    }
  }

  return getRequestOrigin(req) || normalizeConfiguredUrl(`${req.protocol}://${req.get("host")}`);
}

function redactAuthTokensFromUrl(rawUrl: string | undefined) {
  if (!rawUrl) return "";
  try {
    const parsed = new URL(rawUrl, "http://blackarrow.local");
    if (parsed.searchParams.has("login_token")) parsed.searchParams.set("login_token", "[redacted]");
    if (parsed.pathname === "/api/auth/token-login" && parsed.searchParams.has("token")) {
      parsed.searchParams.set("token", "[redacted]");
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return String(rawUrl).replace(/([?&](?:login_token|token)=)[^&\s]+/gi, "$1[redacted]");
  }
}

function resolveGoogleOAuthRedirectUri(req: any) {
  const explicitRedirectUri = normalizeConfiguredUrl(process.env.GOOGLE_OAUTH_REDIRECT_URI || process.env.GOOGLE_REDIRECT_URI);
  if (explicitRedirectUri) {
    return `${explicitRedirectUri}${GOOGLE_OAUTH_CALLBACK_PATH}`;
  }

  const requestOrigin = getRequestOrigin(req);
  const requestHostname = (() => {
    try {
      return new URL(requestOrigin).hostname;
    } catch {
      return "";
    }
  })();
  const requestIsLocal = isLocalHostname(requestHostname);

  const configuredOrigin = [
    process.env.APP_URL,
    process.env.BASE_URL,
    process.env.PUBLIC_URL,
    process.env.DOMAIN,
    process.env.FRONTEND_URL,
  ].map(normalizeConfiguredUrl).find(Boolean) || "";

  const configuredHostname = (() => {
    try {
      return new URL(configuredOrigin).hostname;
    } catch {
      return "";
    }
  })();

  const canUseConfiguredOrigin =
    !!configuredOrigin &&
    (requestIsLocal ? isLocalHostname(configuredHostname) : !isLocalHostname(configuredHostname));

  const origin = canUseConfiguredOrigin ? configuredOrigin : requestOrigin;
  return `${origin}${GOOGLE_OAUTH_CALLBACK_PATH}`;
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

function getRequestIp(req: any) {
  const rawIp = String(
    req.ip ||
    req.headers?.["x-forwarded-for"] ||
    req.socket?.remoteAddress ||
    req.connection?.remoteAddress ||
    ""
  ).split(",")[0].trim();
  return rawIp.replace(/^::ffff:/, "") || "unknown";
}

function peekAuthenticatedUserIdFromRequest(req: any) {
  if (req.authUser) return getStableUserId(req.authUser);
  const cookieToken = req.cookies?.[AUTH_COOKIE_NAME] || readCookieValueFromHeader(req.headers?.cookie, AUTH_COOKIE_NAME);
  const session = parseSessionToken(cookieToken);
  return session?.userId ? String(session.userId) : "";
}

function logSecurityEvent(event: string, details: Record<string, any> = {}) {
  const safeDetails = Object.fromEntries(Object.entries(details).filter(([, value]) => value !== undefined));
  console.warn(`[Security] ${event} ${JSON.stringify(safeDetails)}`);
}

function sanitizePlainTextInput(value: unknown, maxLength: number) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function sanitizeMultilineInput(value: unknown, maxLength: number) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxLength);
}

async function resolveContactLeadRecipient() {
  const users = await dbService.listUsers();
  const targetUser = users.find((user: any) => String(user?.email || "").toLowerCase() === "contact-5bff87735818@example.invalid");
  if (!targetUser) {
    logSecurityEvent("contact_admin_missing", { email: "contact-5bff87735818@example.invalid" });
    return null;
  }

  const whatsappNumber = sanitizePlainTextInput(targetUser.whatsapp_number, 30).replace(/[^0-9]/g, "");
  if (!whatsappNumber) {
    logSecurityEvent("contact_admin_whatsapp_missing", {
      email: "contact-5bff87735818@example.invalid",
      userId: getStableUserId(targetUser) || undefined,
    });
    return null;
  }

  return {
    userId: getStableUserId(targetUser),
    email: "contact-5bff87735818@example.invalid",
    whatsappNumber,
  };
}

function applyRateLimitBucket(bucketKey: string, max: number, windowMs: number) {
  const currentTime = Date.now();
  const existing = rateLimitStore.get(bucketKey);
  if (!existing || existing.resetAt <= currentTime) {
    rateLimitStore.set(bucketKey, { count: 1, resetAt: currentTime + windowMs });
    return { limited: false, remaining: Math.max(0, max - 1), retryAfterSeconds: Math.ceil(windowMs / 1000) };
  }
  existing.count += 1;
  rateLimitStore.set(bucketKey, existing);
  return {
    limited: existing.count > max,
    remaining: Math.max(0, max - existing.count),
    retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - currentTime) / 1000)),
  };
}

function createRateLimitMiddleware(config: {
  name: string,
  max: number,
  windowMs: number,
  message: string,
  includeUser?: boolean,
  skip?: (req: any) => boolean,
}) {
  return (req: any, res: any, next: any) => {
    if (config.skip?.(req)) return next();

    const ip = getRequestIp(req);
    const userId = config.includeUser ? peekAuthenticatedUserIdFromRequest(req) : "";
    const keys = [`${config.name}:ip:${ip}`];
    if (config.includeUser && userId) keys.push(`${config.name}:user:${userId}`);

    let limitedScope = "";
    let retryAfterSeconds = 1;
    for (const bucketKey of keys) {
      const result = applyRateLimitBucket(bucketKey, config.max, config.windowMs);
      retryAfterSeconds = Math.max(retryAfterSeconds, result.retryAfterSeconds);
      if (result.limited) {
        limitedScope = bucketKey.includes(":user:") ? "user" : "ip";
        break;
      }
    }

    if (!limitedScope) return next();

    logSecurityEvent("rate_limit_hit", {
      limiter: config.name,
      scope: limitedScope,
      ip,
      userId: userId || undefined,
      method: req.method,
      path: req.originalUrl,
    });
    res.setHeader("Retry-After", String(retryAfterSeconds));
    res.status(429).json({
      error: config.message,
      code: "RATE_LIMITED",
      retryAfterSeconds,
    });
  };
}

function isPrivateIpv4Address(hostname: string) {
  const parts = hostname.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    parts[0] === 0 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
  );
}

function isPrivateIpv6Address(hostname: string) {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "::1" ||
    normalized === "[::1]" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:")
  );
}

function isBlockedProxyHostname(hostname: string) {
  const normalized = String(hostname || "").trim().toLowerCase();
  if (!normalized) return true;
  if (isLocalHostname(normalized) || normalized.endsWith(".local")) return true;
  const ipVersion = net.isIP(normalized.replace(/^\[(.*)\]$/, "$1"));
  if (ipVersion === 4) return isPrivateIpv4Address(normalized);
  if (ipVersion === 6) return isPrivateIpv6Address(normalized.replace(/^\[(.*)\]$/, "$1"));
  return false;
}

function validateOutboundProxyUrl(value: any, options: { allowEmpty?: boolean } = {}) {
  const rawValue = String(value || "").trim();
  if (!rawValue) {
    if (options.allowEmpty) return { ok: true as const, normalized: "" };
    return { ok: false as const, message: "Proxy URL is required." };
  }
  if (rawValue.length > 500) {
    return { ok: false as const, message: "Proxy URL is too long." };
  }

  const normalized = normalizeProxyUrl(rawValue);
  try {
    const parsed = new URL(normalized);
    if (!["http:", "https:", "socks:", "socks5:", "socks5h:"].includes(parsed.protocol)) {
      return { ok: false as const, message: "Unsupported proxy protocol. Use HTTP, HTTPS, or SOCKS5." };
    }
    if (!parsed.hostname) {
      return { ok: false as const, message: "Proxy URL must include a hostname." };
    }
    if (isBlockedProxyHostname(parsed.hostname)) {
      return { ok: false as const, message: "Local or private proxy hosts are not allowed." };
    }
    return { ok: true as const, normalized };
  } catch {
    return { ok: false as const, message: "Invalid proxy URL." };
  }
}

const authRouteLimiter = createRateLimitMiddleware({
  name: "auth-sensitive",
  max: 8,
  windowMs: 10 * 60 * 1000,
  message: "Too many authentication attempts. Please wait a few minutes and try again.",
});
const googleOAuthStartLimiter = createRateLimitMiddleware({
  name: "google-auth-start",
  max: 20,
  windowMs: 10 * 60 * 1000,
  message: "Too many Google sign-in attempts. Please try again shortly.",
});
const googleOAuthCallbackLimiter = createRateLimitMiddleware({
  name: "google-auth-callback",
  max: 20,
  windowMs: 10 * 60 * 1000,
  message: "Too many Google callback attempts. Please retry shortly.",
});
const testProxyLimiter = createRateLimitMiddleware({
  name: "test-proxy",
  max: 6,
  windowMs: 10 * 60 * 1000,
  message: "Too many proxy test attempts. Please wait before testing again.",
  includeUser: true,
});
const billingRouteLimiter = createRateLimitMiddleware({
  name: "billing-routes",
  max: 30,
  windowMs: 10 * 60 * 1000,
  message: "Too many billing requests. Please wait a moment and retry.",
  includeUser: true,
  skip: (req) => req.path === "/creem/webhook",
});
const adminRouteLimiter = createRateLimitMiddleware({
  name: "admin-routes",
  max: 60,
  windowMs: 10 * 60 * 1000,
  message: "Too many admin requests. Please slow down and try again shortly.",
  includeUser: true,
});
const manualSendLimiter = createRateLimitMiddleware({
  name: "manual-send",
  max: 30,
  windowMs: 60 * 1000,
  message: "Too many manual send requests. Please wait a moment before sending more messages.",
  includeUser: true,
});

async function enforcePublicApiRateLimit(req: any, res: any, authResult: any, kind: "read" | "send" | "invalid") {
  const result = await checkPublicApiRateLimit({
    accountId: authResult?.userId,
    keyId: authResult?.key?.id,
    ip: getRequestIp(req),
    path: req.path,
    method: req.method,
    kind,
  });
  if (!result.limited) return false;
  res.setHeader("Retry-After", String(result.retryAfterSeconds));
  res.status(429).json({
    error: kind === "send" ? "Too many public API send requests. Please slow down and retry shortly." : "Too many public API requests. Please retry shortly.",
    code: "PUBLIC_API_RATE_LIMITED",
    retryAfterSeconds: result.retryAfterSeconds,
  });
  return true;
}

function getRequesterIdFromRequest(req: any) {
  return req.body?.requesterId || req.query?.requesterId || req.get?.("x-requester-id");
}

function logBlockedAccess(req: any, reason: string, details: Record<string, any> = {}) {
  const authUser = req.authUser;
  const safeDetails = Object.fromEntries(Object.entries(details).filter(([, value]) => value !== undefined));
  console.warn(`[Auth] Blocked ${req.method} ${req.originalUrl} reason=${reason} auth=${getStableUserId(authUser) || "anonymous"} role=${String(authUser?.role || "none")} details=${JSON.stringify(safeDetails)}`);
}

async function getAuthenticatedUserFromRequest(req: any) {
  if (req.authUser) return req.authUser;
  const session = parseSessionToken(req.cookies?.[AUTH_COOKIE_NAME]);
  if (!session?.userId) return null;
  const user = await dbService.getUser(String(session.userId)).catch(() => null) as any;
  if (!user) return null;
  req.authSession = session;
  req.authUser = user;
  return user;
}

async function requireAuthenticatedUser(req: any, res: any) {
  const user = await getAuthenticatedUserFromRequest(req);
  if (!user) {
    logBlockedAccess(req, "unauthenticated");
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  return user;
}

async function validateRequestedIdentityHints(req: any, user: any, fields: string[] = ["userId", "requesterId", "email"]) {
  for (const field of fields) {
    const rawValue = firstPresent(req.body?.[field], req.query?.[field], field === "requesterId" ? req.get?.("x-requester-id") : undefined);
    if (!rawValue) continue;
    const resolved = await dbService.getUser(String(rawValue)).catch(() => null) as any;
    if (!resolved) {
      return { ok: false, status: 404 as const, field };
    }
    if (getStableUserId(resolved) !== getStableUserId(user)) {
      return { ok: false, status: 403 as const, field, resolvedUserId: getStableUserId(resolved) };
    }
  }
  return { ok: true as const };
}

async function requireSessionAccount(req: any, res: any) {
  const user = await requireAuthenticatedUser(req, res);
  if (!user) return null;
  const hintCheck = await validateRequestedIdentityHints(req, user, ["userId", "email"]);
  if (!hintCheck.ok) {
    logBlockedAccess(req, "account_scope_mismatch", { field: hintCheck.field, targetUserId: (hintCheck as any).resolvedUserId });
    res.status(hintCheck.status).json({ error: hintCheck.status === 404 ? "User not found" : "Unauthorized account access" });
    return null;
  }
  return user;
}

async function requireAdminUser(req: any, res: any, options: { superAdminOnly?: boolean } = {}) {
  const user = await requireAuthenticatedUser(req, res);
  if (!user) return null;
  const hintCheck = await validateRequestedIdentityHints(req, user, ["requesterId"]);
  if (!hintCheck.ok) {
    logBlockedAccess(req, "admin_requester_mismatch", { field: hintCheck.field, targetUserId: (hintCheck as any).resolvedUserId });
    res.status(hintCheck.status).json({ error: hintCheck.status === 404 ? "User not found" : "Unauthorized" });
    return null;
  }
  if (!isAdminAccount(user)) {
    logBlockedAccess(req, "admin_required");
    res.status(403).json({ error: "Admin access required" });
    return null;
  }
  if (options.superAdminOnly && !isSuperAdminAccount(user)) {
    logBlockedAccess(req, "super_admin_required");
    res.status(403).json({ error: "Super admin access required" });
    return null;
  }
  return user;
}

async function requireTargetUserForAdmin(req: any, res: any, options: { superAdminOnly?: boolean, field?: string } = {}) {
  const requester = await requireAdminUser(req, res, { superAdminOnly: options.superAdminOnly });
  if (!requester) return null;
  const field = options.field || "userId";
  const rawTarget = firstPresent(
    req.body?.[field],
    req.query?.[field],
    req.params?.[field],
    req.body?.targetUserId,
    req.query?.targetUserId,
    req.body?.userId,
    req.query?.userId
  );
  if (!rawTarget) {
    res.status(400).json({ error: `Missing ${field}` });
    return null;
  }
  const targetUser = await dbService.getUser(String(rawTarget)).catch(() => null) as any;
  if (!targetUser) {
    res.status(404).json({ error: "User not found" });
    return null;
  }
  return { requester, targetUser, targetUserId: getStableUserId(targetUser) };
}

async function requireOwnedBot(req: any, res: any, ownerUserId: string, botId: string) {
  const bot = await dbService.getBotById(botId).catch(() => null) as any;
  if (!bot || String(bot.user_id || "") !== String(ownerUserId)) {
    logBlockedAccess(req, "bot_not_owned", { botId, ownerUserId });
    res.status(404).json({ error: "Bot not found" });
    return null;
  }
  return bot;
}

function sanitizeAdminUserConfig(config: any = {}) {
  return {
    usage_cost: Number(config?.usage_cost || 0),
    billing_limit: Number(config?.billing_limit || 0),
    proxy_url: config?.proxy_url || "",
    use_dedicated_proxy: config?.use_dedicated_proxy === 1 ? 1 : 0,
  };
}

function buildSafeAdminUser(user: any, extra: Record<string, any> = {}) {
  return {
    ...buildSafeAuthUser(user),
    trial_expires_at: user?.trial_expires_at || null,
    plan_id: user?.plan_id || "starter_plan",
    plan_expiry: user?.plan_expiry || null,
    billing_limit: user?.billing_limit,
    usage_cost: user?.usage_cost,
    is_temporary_session: undefined,
    ...extra,
  };
}

function sanitizeClientConfig(config: any = {}) {
  return {
    user_id: config?.user_id,
    ai_prompt: config?.ai_prompt ?? null,
    delayed_read_receipts_enabled: config?.delayed_read_receipts_enabled ?? config?.delayedReadReceiptsEnabled ?? 0,
    delayedReadReceiptsEnabled: config?.delayedReadReceiptsEnabled ?? config?.delayed_read_receipts_enabled ?? 0,
    read_receipt_delay_seconds: config?.read_receipt_delay_seconds ?? config?.readReceiptDelaySeconds ?? 10,
    readReceiptDelaySeconds: config?.readReceiptDelaySeconds ?? config?.read_receipt_delay_seconds ?? 10,
    postex_api_key: config?.postex_api_key ?? null,
    leopards_api_key: config?.leopards_api_key ?? null,
    leopards_api_password: config?.leopards_api_password ?? null,
    dhl_api_key: config?.dhl_api_key ? "__masked_secret__" : null,
    dhl_service: config?.dhl_service ?? "express",
    dhl_requester_country_code: config?.dhl_requester_country_code ?? null,
    dhl_origin_country_code: config?.dhl_origin_country_code ?? null,
    dhl_language: config?.dhl_language ?? null,
    dhl_enabled: config?.dhl_enabled ?? 0,
    leopards_test_mode: config?.leopards_test_mode ?? 0,
    is_auto_reply: config?.is_auto_reply ?? true,
    google_sheet_url: config?.google_sheet_url ?? null,
    admin_number: config?.admin_number ?? null,
    proxy_url: config?.proxy_url ?? null,
    use_dedicated_proxy: config?.use_dedicated_proxy ?? 0,
    bot_voice: config?.bot_voice ?? "Aoede",
    bot_gender: config?.bot_gender ?? "female",
    bot_name: config?.bot_name ?? null,
    reject_calls: config?.reject_calls ?? 0,
    reply_behavior: config?.reply_behavior ?? "text_preferred",
    reply_in_groups: config?.reply_in_groups ?? 0,
    human_delay_enabled: config?.human_delay_enabled ?? 1,
    voice_simulation_enabled: config?.voice_simulation_enabled ?? 1,
    followup_enabled: config?.followup_enabled ?? 0,
    auto_followup_enabled: config?.auto_followup_enabled ?? config?.autoFollowupEnabled ?? 0,
    autoFollowupEnabled: config?.auto_followup_enabled ?? config?.autoFollowupEnabled ?? 0,
    followup_hours: config?.followup_hours ?? 12,
    followup_offer_context: config?.followup_offer_context ?? null,
    business_type: config?.business_type ?? "product",
    business_timezone: config?.business_timezone ?? config?.businessTimezone ?? null,
    booking_link: config?.booking_link ?? null,
    webhook_url: config?.webhook_url ?? null,
    usage_cost: config?.usage_cost ?? 0,
    billing_limit: config?.billing_limit ?? 10,
    updated_at: config?.updated_at ?? 0,
    last_expiry_alert_sent: config?.last_expiry_alert_sent ?? 0,
    groups: Array.isArray(config?.groups) ? config.groups : [],
    groups_json: config?.groups_json ?? null,
    custom_fields: Array.isArray(config?.custom_fields) ? config.custom_fields : [],
    custom_fields_json: config?.custom_fields_json ?? null,
    followups: Array.isArray(config?.followups) ? config.followups : [],
    followups_json: config?.followups_json ?? null,
    learned_instructions: config?.learned_instructions ?? null,
    random_reply_delay_enabled: config?.random_reply_delay_enabled ?? null,
    random_reply_delay_max: config?.random_reply_delay_max ?? null,
    system_alerts_enabled: config?.system_alerts_enabled === false ? false : true,
    billing_alerts_enabled: config?.billing_alerts_enabled === false ? false : true,
    proxy_alerts_enabled: config?.proxy_alerts_enabled === false ? false : true,
    order_alerts_enabled: config?.order_alerts_enabled === false ? false : true,
    business_assistant_enabled: Boolean(config?.business_assistant_enabled ?? config?.businessAssistantEnabled ?? false),
    muted_numbers_json: config?.muted_numbers_json ?? null,
    auto_reload_enabled: config?.auto_reload_enabled ?? false,
    auto_reload_minutes: config?.auto_reload_minutes ?? 5,
    client_gemini: config?.clientGemini
      ? {
          enabled: Boolean(config.clientGemini.enabled && config.clientGemini.encryptedApiKey),
          hasKey: Boolean(config.clientGemini.encryptedApiKey),
          maskedKey: config.clientGemini.encryptedApiKey ? "****" : "",
          cacheBoostEnabled: Boolean(config.clientGemini.explicitCacheBoostEnabled && config.clientGemini.enabled && config.clientGemini.encryptedApiKey),
          updatedAt: Number(config.clientGemini.updatedAt || 0) || 0,
        }
      : { enabled: false, hasKey: false, maskedKey: "", cacheBoostEnabled: false, updatedAt: 0 },
  };
}

async function verifyStoredPasswordWithMigration(user: any, rawPassword: string, field: "password_hash" | "temp_password" = "password_hash") {
  const storedValue = String(user?.[field] || "");
  if (!storedValue || isOAuthPasswordValue(storedValue)) return false;
  if (isStoredPasswordHash(storedValue)) {
    return verifyPasswordAgainstHash(rawPassword, storedValue);
  }
  if (!shouldMigratePlaintextPassword(storedValue) || storedValue !== String(rawPassword || "")) {
    return false;
  }

  const migratedHash = hashPassword(rawPassword);
  await dbService.updateUser(user.$id || user.id, { [field]: migratedHash });
  user[field] = migratedHash;
  return true;
}

function buildSafeAuthUser(user: any, extra: Record<string, any> = {}) {
  return {
    id: user?.$id || user?.id,
    email: user?.email || "",
    name: user?.name || "",
    role: user?.role || "user",
    created_at: user?.created_at || 0,
    whatsapp_number: user?.whatsapp_number || "",
    base_currency: user?.base_currency || "USD",
    wallet_balance: user?.wallet_balance || 0,
    extra_product_bundles: user?.extra_product_bundles || 0,
    assigned_proxy_url: user?.assigned_proxy_url,
    proxy_subscription_expiry: user?.proxy_subscription_expiry,
    has_2fa_enabled: user?.has_2fa_enabled || 0,
    ...extra,
  };
}

const firstPresent = (...values: any[]) => values.find(value => value !== undefined && value !== null && value !== "");
const money = (value: any) => shippingService.toNumber(value);
const MASKED_SECRET_VALUE = "__masked_secret__";
const DHL_DELIVERED_SYNC_COOLDOWN_SECONDS = 24 * 60 * 60;
const DHL_ACTIVE_SYNC_COOLDOWN_SECONDS = 2 * 60;
const DHL_DELIVERED_SKIP_AFTER_DAYS = 30;

const SUBSCRIPTION_LABELS: Record<string, string> = {
  instance: "Extra WhatsApp Instance",
  extra_instance: "Extra WhatsApp Instance",
  product_bundle: "Extra 30 Products/Services",
  extra_30_products: "Extra 30 Products/Services",
  extra_500_media: "Extra 500 Media Templates",
  extra_5_sequence_groups: "Extra 5 Sequence Groups",
  extra_10000_customers: "Extra 10,000 Customer Records",
  extra_2000_orders: "Extra 2,000 Orders Per Month",
  setup_service: "Full Account Setup"
};

function getSubscriptionLabel(type: string) {
  return SUBSCRIPTION_LABELS[type] || type;
}

function summarizeSubscriptionCapacity(type: string, quantity: number) {
  const qty = Math.max(0, Number(quantity || 0));
  return {
    instances: type === "instance" || type === "extra_instance" ? qty : 0,
    products: type === "product_bundle" || type === "extra_30_products" ? qty * 30 : 0,
    mediaTemplates: type === "extra_500_media" ? qty * 500 : 0,
    sequenceGroups: type === "extra_5_sequence_groups" ? qty * 5 : 0,
    customers: type === "extra_10000_customers" ? qty * 10000 : 0,
    ordersPerMonth: type === "extra_2000_orders" ? qty * 2000 : 0,
  };
}

function isOrderDeletedForLimit(order: any) {
  const data = order?.order_data || order?.orderData || order || {};
  const status = String(data.orderStatus || data.transactionStatus || data.latestTrackingStatus || data.status || "").trim().toLowerCase();
  return Boolean(data.deletedAt) || status.includes("deleted");
}

function getMonthStartEpoch(currentTime = now()) {
  const date = new Date(currentTime * 1000);
  date.setHours(0, 0, 0, 0);
  date.setDate(1);
  return Math.floor(date.getTime() / 1000);
}

function buildQuotaBreakdown(input: {
  label: string;
  used: number;
  included: number;
  addon: number;
  total: number;
}) {
  const used = Math.max(0, Number(input.used || 0));
  const included = Math.max(0, Number(input.included || 0));
  const addon = Math.max(0, Number(input.addon || 0));
  const total = Math.max(0, Number(input.total || 0));
  return {
    label: input.label,
    used,
    included,
    addon,
    total,
    remaining: Math.max(0, total - used),
  };
}

function buildBillingFeatures(planId: string, access: any, config: any, user: any) {
  const paidNonStarter = access?.paidActive && planId !== "starter_plan";
  const alertDestination = String(config?.admin_number || user?.whatsapp_number || "").trim();
  return {
    courier_integration: {
      label: "Courier Integration",
      available: Boolean(paidNonStarter),
    },
    ai_self_learned_knowledge: {
      label: "AI Self-Learned Knowledge",
      available: Boolean(paidNonStarter),
    },
    admin_whatsapp_alerts: {
      label: "Admin WhatsApp Alerts",
      available: Boolean(paidNonStarter),
      enabled: Boolean(paidNonStarter && config?.billing_alerts_enabled !== false),
      destination: alertDestination,
    }
  };
}

function summarizeActiveSubscriptions(subscriptions: any[], currentTime = now()) {
  const active = (subscriptions || []).filter((sub) => normalizeEpochSeconds(sub?.expires_at) > currentTime);
  return active
    .map((sub) => {
      const type = String(sub.type || "");
      const quantity = Math.max(1, Number(sub.quantity || 1));
      return {
        id: sub.$id || sub.id || `${type}_${sub.expires_at}`,
        type,
        label: getSubscriptionLabel(type),
        quantity,
        status: "active",
        auto_renew: Boolean(Number(sub.auto_renew || 0)),
        started_at: normalizeEpochSeconds(sub.created_at),
        expires_at: normalizeEpochSeconds(sub.expires_at),
        added_capacity: summarizeSubscriptionCapacity(type, quantity),
      };
    })
    .sort((a, b) => a.expires_at - b.expires_at);
}

function buildSetupStatus(subscriptions: any[], currentTime = now()) {
  const activeSetup = (subscriptions || [])
    .filter((sub) => String(sub.type || "") === "setup_service")
    .sort((a, b) => normalizeEpochSeconds(b.created_at) - normalizeEpochSeconds(a.created_at))[0] as any;
  const startedAt = normalizeEpochSeconds(activeSetup?.created_at);
  const expiresAt = normalizeEpochSeconds(activeSetup?.expires_at);
  return {
    active: Boolean(activeSetup && expiresAt > currentTime),
    purchased_at: startedAt || 0,
    expires_at: expiresAt || 0,
    repurchasable_now: !activeSetup || expiresAt <= currentTime,
  };
}

async function sendTrialStartedNotification(userId: string) {
  await sendBillingNotification({
    userId,
    title: "Trial started",
    status: "7-day free trial active",
    amount: "$1 AI test credit",
    action: "Choose a paid plan in Billing before the trial ends to keep service active.",
    dedupeKey: `trial_started_${userId}`,
    sendWhatsApp: sendWhatsAppFromSystem
  }).catch(() => {});
}

async function requireAccountFeatureAccess(userId: string, res: any) {
  const user = await dbService.getUser(userId) as any;
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return null;
  }
  const access = getBillingAccess(user);
  if (!access.canUsePaidFeatures) {
    res.status(402).json({ error: buildAccessBlockedMessage(access) });
    return null;
  }
  return { user, access };
}

async function validateInstanceConfigLimits(userId: string, botId: string, config: any, res: any) {
  const user = await dbService.getUser(userId) as any;
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return null;
  }
  const subscriptions = await dbService.getSubscriptions(userId).catch(() => []);
  const limits = buildAccountLimits(user, subscriptions);
  const usage = await getSavedBillingCapacityUsageForUser(userId, { [botId]: config });
  const mediaGroups = usage.mediaGroups;
  const sequenceGroups = usage.sequenceGroups;
  const templateCount = usage.mediaTemplates;

  if (mediaGroups > limits.mediaGroupLimit) {
    res.status(402).json({ error: `Your current billing access allows ${limits.mediaGroupLimit} media group${limits.mediaGroupLimit === 1 ? "" : "s"}. Upgrade or remove extra media groups to save.` });
    return null;
  }
  if (sequenceGroups > limits.sequenceGroupLimit) {
    res.status(402).json({ error: `Your current billing access allows ${limits.sequenceGroupLimit} sequence group${limits.sequenceGroupLimit === 1 ? "" : "s"}. Upgrade or remove extra sequence groups to save.` });
    return null;
  }
  if (templateCount > limits.mediaTemplateLimit) {
    res.status(402).json({ error: `Your current billing access allows ${limits.mediaTemplateLimit} synced media/template messages. Upgrade or remove extra templates to save.` });
    return null;
  }
  return { user, limits };
}

function buildPostexBookingPayload(order: any) {
    return buildPostexBookingPayloadFromOrder(order);
}

function normalizeCourierCompany(value: any) {
    const courier = String(value || "").trim().toLowerCase();
    if (courier === "dhl express") return "dhl";
    if (courier === "leopards" || courier === "leopard") return "leopard";
    return courier;
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

function applyPostexTrackingToOrder(orderData: any, trackingInfo: any, bookingResponse?: any) {
    const shippingCharge = trackingInfo.shippingCharge || money(orderData.shippingCharge);
    return {
        ...orderData,
        courierCompany: "postex",
        trackingNumber: trackingInfo.trackingNumber || orderData.trackingNumber,
        orderRefNumber: trackingInfo.orderRefNumber || orderData.orderRefNumber || orderData.orderReferenceNumber,
        cityName: trackingInfo.cityName || orderData.cityName,
        shippingCharge,
        shipping_charge: shippingCharge,
        postexTransactionFee: trackingInfo.transactionFee,
        postexTransactionTax: trackingInfo.transactionTax,
        postexReversalFee: trackingInfo.reversalFee,
        postexReversalTax: trackingInfo.reversalTax,
        transactionStatus: trackingInfo.status || orderData.transactionStatus,
        latestTrackingStatus: trackingInfo.status || orderData.latestTrackingStatus,
        latestTrackingStatusCode: trackingInfo.statusCode || orderData.latestTrackingStatusCode,
        latestTrackingSignature: trackingInfo.statusSignature || orderData.latestTrackingSignature,
        trackingUpdatedAt: now(),
        ...(bookingResponse ? { postexBookingResponse: bookingResponse } : {}),
    };
}

function applyDhlTrackingToOrder(orderData: any, trackingInfo: any) {
    const eventHistory = Array.isArray(trackingInfo.events) ? trackingInfo.events : [];
    return {
        ...orderData,
        courierCompany: "dhl",
        trackingNumber: trackingInfo.tracking_id || orderData.trackingNumber || orderData.tracking_id || orderData.awb,
        tracking_id: trackingInfo.tracking_id || orderData.tracking_id || orderData.trackingNumber || orderData.awb,
        latestTrackingStatus: trackingInfo.current_status || orderData.latestTrackingStatus,
        latestTrackingStatusCode: trackingInfo.status_code || orderData.latestTrackingStatusCode,
        latestTrackingSignature: `dhl:${trackingInfo.status_code || "unknown"}:${trackingInfo.latest_event_time || trackingInfo.current_status || "unknown"}`,
        latestTrackingCategory: trackingInfo.status_category || orderData.latestTrackingCategory,
        latestTrackingEvent: trackingInfo.latest_event_description || orderData.latestTrackingEvent,
        latestTrackingEventTime: trackingInfo.latest_event_time || orderData.latestTrackingEventTime,
        latestTrackingLocation: trackingInfo.latest_location || orderData.latestTrackingLocation,
        estimatedDelivery: trackingInfo.estimated_delivery || orderData.estimatedDelivery,
        deliveredAt: trackingInfo.delivered_at || orderData.deliveredAt,
        isDelivered: trackingInfo.is_delivered ? 1 : 0,
        isTrackingException: trackingInfo.is_exception ? 1 : 0,
        trackingEvents: eventHistory,
        trackingProviderName: trackingInfo.provider_name || "DHL Express",
        trackingService: trackingInfo.service || "express",
        trackingProviderAttribution: "Delivered by Deutsche Post DHL Group",
        trackingLastSyncedAt: now(),
        trackingSyncError: "",
        trackingUpdatedAt: now(),
        transactionStatus: trackingInfo.current_status || orderData.transactionStatus,
    };
}

function shouldSkipDhlTrackingSync(orderData: any) {
    const lastSyncedAt = Number(orderData?.trackingLastSyncedAt || orderData?.trackingUpdatedAt || 0);
    const deliveredAtText = String(orderData?.deliveredAt || "").trim();
    const isDelivered = Number(orderData?.isDelivered || 0) === 1 || String(orderData?.latestTrackingCategory || "").trim().toLowerCase() === "delivered" || /delivered/i.test(String(orderData?.latestTrackingStatus || ""));
    const currentTime = now();
    if (lastSyncedAt > 0) {
        const cooldown = isDelivered ? DHL_DELIVERED_SYNC_COOLDOWN_SECONDS : DHL_ACTIVE_SYNC_COOLDOWN_SECONDS;
        if (currentTime - lastSyncedAt < cooldown) {
            return {
                skip: true,
                message: isDelivered
                    ? "This DHL shipment was synced recently and is already delivered. Please try again later."
                    : "This DHL shipment was synced very recently. Please wait a moment before trying again.",
            };
        }
    }
    if (isDelivered && deliveredAtText) {
        const deliveredAt = new Date(deliveredAtText);
        if (!Number.isNaN(deliveredAt.getTime())) {
            const ageDays = (Date.now() - deliveredAt.getTime()) / (24 * 60 * 60 * 1000);
            if (ageDays >= DHL_DELIVERED_SKIP_AFTER_DAYS) {
                return {
                    skip: true,
                    message: `This DHL shipment was delivered more than ${DHL_DELIVERED_SKIP_AFTER_DAYS} days ago, so repeated syncs are skipped.`,
                };
            }
        }
    }
    return { skip: false, message: "" };
}

async function releaseStockIfTerminal(userId: string, orderData: any) {
    const status = firstPresent(orderData?.transactionStatus, orderData?.latestTrackingStatus, orderData?.orderStatus);
    if (inventoryService.isReturnOrCancelStatus(status) && !orderData?.stockReleasedAt) {
        const released = await inventoryService.releaseOrderStock(userId, orderData).catch((e: any) => {
            console.error("[Inventory] Stock release failed:", e?.message || e);
            return false;
        });
        if (released) {
            orderData.stockReleasedAt = new Date().toISOString();
            orderData.stockReleaseReason = String(status || "returned/cancelled");
        }
    }
    return orderData;
}

interface WorkerState {
  process: childProcess.ChildProcess;
  port: number;
}

const activeWorkers = new Map<string, WorkerState>();
const spawningWorkers = new Map<string, Promise<WorkerState>>();
let nextPort = 12000;
let activeLinkedWorkerWatchdogStarted = false;

const botWorkerLifecycle = createBotWorkerLifecycleManager({
  listBots: () => dbService.listBots(1000) as any,
  getBotById: (botId) => dbService.getBotById(botId) as any,
  spawnWorker: (botId, userId, reason) => spawnWorker(botId, userId, reason),
  isWorkerActive: (botId) => activeWorkers.has(botId),
  isWorkerSpawning: (botId) => spawningWorkers.has(botId),
  logger: console,
});

async function getUserIdByBot(botId: string): Promise<string | null> {
  const row = await dbService.getBotById(botId) as any;
  if (row && row.is_active === 0) {
    return null; // Don't spawn if disabled
  }
  return row ? row.user_id : null;
}

function spawnWorker(botId: string, userId: string, reason = "dashboard_wake"): Promise<WorkerState> {
  if (isStaging) return Promise.reject(new Error("Messaging workers disabled in Conversion 02"));
  if (activeWorkers.has(botId)) {
    return Promise.resolve(activeWorkers.get(botId)!);
  }
  if (spawningWorkers.has(botId)) {
    return spawningWorkers.get(botId)!;
  }

  const promise = new Promise<WorkerState>((resolve, reject) => {
    const port = nextPort++;
    
    // Spawn tsx bot-worker.ts directly without npx to prevent zombie processes
    let settled = false;
    console.log(`[Manager] Spawning bot worker for bot ${botId} (User: ${userId}) on port ${port}. reason=${reason}`);
    emitLiveConsoleEvent({
      type: reason === "watchdog_restore" ? "worker_watchdog_restore" : reason === "startup_restore" ? "worker_startup_restore" : "worker_reconnect",
      level: "info",
      scope: "bot",
      accountId: userId,
      botId,
      title: "Worker starting",
      message: `Starting instance worker. reason=${reason}`,
      reason,
      metadata: { port },
    });
    const worker = childProcess.spawn(process.execPath, ["--import", "tsx", "bot-worker.ts"], {
      env: {
        ...process.env,
        PORT: port.toString(),
        BOT_ID: botId,
        USER_ID: userId,
        INTERNAL_WORKER_SECRET: getOrCreateServerInternalSecret(),
      },
      stdio: "pipe",
    });

    const state = { process: worker, port };
    
    worker.on("exit", (code, signal) => {
       console.log(`[Manager] Worker ${botId} exited with code ${code}${signal ? ` signal ${signal}` : ""}`);
       emitLiveConsoleEvent({
         type: "worker_disconnected",
         level: "warn",
         scope: "bot",
         accountId: userId,
         botId,
         title: "Worker disconnected",
         message: `Instance worker exited with code ${code ?? "unknown"}.`,
         status: signal || String(code ?? "unknown"),
       });
       activeWorkers.delete(botId);
       spawningWorkers.delete(botId);
       unregisterWorkerPort(botId);
       if (!settled) {
         settled = true;
         reject(new Error(`Worker ${botId} exited before readiness signal.`));
       }
       botWorkerLifecycle.handleWorkerExit(botId).catch((error) => {
         console.error(`[Manager] worker_exit_restart check failed for ${botId}:`, error?.message || error);
       });
    });

    worker.on("error", (error) => {
      emitLiveConsoleEvent({
        type: "worker_disconnected",
        level: "error",
        scope: "bot",
        accountId: userId,
        botId,
        title: "Worker error",
        message: error?.message || "Instance worker failed.",
      });
      activeWorkers.delete(botId);
      spawningWorkers.delete(botId);
      unregisterWorkerPort(botId);
      if (!settled) {
        settled = true;
        reject(error);
      }
    });

    // Detect when worker is actually ready
    worker.stdout?.on("data", (data) => {
       const str = data.toString();
       console.log(`[Worker ${botId}] ${str.trim()}`);
       if (str.includes("running on port") || str.includes("Engine running on port")) {
           console.log(`[Manager] Worker ${botId} signal received. Marking as ready.`);
           activeWorkers.set(botId, state);
           spawningWorkers.delete(botId);
           registerWorkerPort(botId, state.port);
           botWorkerLifecycle.noteWorkerSpawned(botId);
           settled = true;
           resolve(state);
       }
    });

    worker.stderr?.on("data", (data) => {
       console.error(`[Worker ${botId}] ERR: ${data.toString().trim()}`);
    });

    // Fallback timeout in case signal never comes
    setTimeout(() => {
      if (spawningWorkers.has(botId)) {
        console.warn(`[Manager] Worker ${botId} did not signal readiness within 60s. Proceeding anyway...`);
        activeWorkers.set(botId, state);
        spawningWorkers.delete(botId);
        registerWorkerPort(botId, state.port);
        botWorkerLifecycle.noteWorkerSpawned(botId);
        settled = true;
        resolve(state);
      }
    }, 60000); 
  });

  spawningWorkers.set(botId, promise);
  return promise;
}

export async function sendWhatsAppFromSystem(phone: string, text: string) {
    try {
        const sysBotId = await dbService.getGlobalSetting("system_bot_id");
        if (!sysBotId) throw new Error("System bot not configured. Please contact admin.");

        let worker = activeWorkers.get(sysBotId);
        if (!worker) {
            console.log("[Manager] System bot is offline, spawning it now...");
            const botData = await dbService.getBotById(sysBotId);
            if (!botData) throw new Error("System bot not found in DB.");
            worker = await spawnWorker(sysBotId, botData.user_id, "system_bot");
        }
        if (!worker) throw new Error("System bot is currently offline. Please try again later.");
        
        let cleanPhone = phone.replace(/[^0-9]/g, "");
        if (cleanPhone.startsWith("0")) cleanPhone = "92" + cleanPhone.substring(1);
        if (!cleanPhone) throw new Error("Invalid phone number");
        
        console.log(`[sendWhatsAppFromSystem] Target: ${cleanPhone}@s.whatsapp.net, Worker Port: ${worker.port}`);
        
        let res;
        let resText = "";
        let retries = 0;
        const maxRetries = 3;
        while (retries < maxRetries) {
            try {
                res = await fetch(`http://127.0.0.1:${worker.port}/api/bot/send-message`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...buildWorkerInternalHeaders() },
                    body: JSON.stringify({
                        to: `${cleanPhone}@s.whatsapp.net`,
                        text
                    })
                });
                resText = await res.text();
                
                if (res.ok) {
                    console.log(`[sendWhatsAppFromSystem] Worker response: ${res.status} ${resText}`);
                    return true;
                }
                
                if (resText.includes("WhatsApp not connected") || res.status === 502) {
                    console.log(`[sendWhatsAppFromSystem] Not connected yet, retrying... (${retries+1}/${maxRetries})`);
                } else {
                    break;
                }
            } catch (err: any) {
                console.log(`[sendWhatsAppFromSystem] Fetch error, retrying... (${retries+1}/${maxRetries}): ${err.message}`);
            }
            retries++;
            await new Promise(r => setTimeout(r, 4000));
        }

        console.log(`[sendWhatsAppFromSystem] Final Worker response: ${res?.status} ${resText}`);
        fs.appendFileSync('otp-error.log', new Date().toISOString() + ': Final Worker response: ' + (res?.status || 'Error') + ' ' + resText + '\n');
        throw new Error(`Worker returned ${res?.status || 500}: ${resText || "Connection failed"}`);
    } catch(e: any) {
        console.error(`[sendWhatsAppFromSystem] Error: ${e.message}`);
        throw new Error("Failed to send message from system bot");
    }
}

export async function sendSystemAlert(message: string) {
    try {
        const sysBotId = await dbService.getGlobalSetting("system_bot_id");
        if (!sysBotId) return;

        let worker = activeWorkers.get(sysBotId);
        if (!worker) {
            // spawn just in case
            const botData = await dbService.getBotById(sysBotId).catch(() => null);
            if (botData) {
                worker = await spawnWorker(sysBotId, botData.user_id, "system_bot");
            }
        }
        if (!worker) return;
        
        let alertNumber = await dbService.getGlobalSetting("system_alert_number");
        if (!alertNumber) {
            const users = await dbService.listUsers();
            const superAdmin = users.find((u: any) => u.role === 'super_admin' && u.whatsapp_number);
            if (superAdmin) {
                alertNumber = superAdmin.whatsapp_number;
            } else {
                alertNumber = '153238380473';
            }
        }
        
        await fetch(`http://127.0.0.1:${worker.port}/api/bot/send-message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...buildWorkerInternalHeaders() },
            body: JSON.stringify({
                to: `${alertNumber}@s.whatsapp.net`,
                text: '[SYSTEM ALERT] ' + message
            })
        }).catch(() => {});
    } catch(e) {
        console.error("Failed to send system alert:", e);
    }
}

async function deliverAccountDashboardWhatsAppAlerts(input: {
  accountId: string;
  user?: any;
  notifications: any[];
}) {
  const accountId = getStableUserId(input.user || { $id: input.accountId, id: input.accountId });
  const [config, preferences] = await Promise.all([
    dbService.loadUserConfig(accountId).catch(() => null),
    dbService.getUserExtraConfigValue(accountId, DASHBOARD_ALERT_PREFERENCES_STORE_KEY).catch(() => null),
  ]);
  const recipient = String(config?.admin_number || input.user?.whatsapp_number || "").trim();
  return deliverDashboardWhatsAppAlerts({
    accountId,
    notifications: input.notifications,
    preferences: normalizeDashboardAlertPreferences(preferences),
    recipient,
    deps: {
      getState: (userId) => dbService.getUserExtraConfigValue(userId, DASHBOARD_WHATSAPP_ALERT_DELIVERY_STORE_KEY).catch(() => null),
      saveState: (userId, state) => dbService.saveUserExtraConfigPatch(userId, {
        [DASHBOARD_WHATSAPP_ALERT_DELIVERY_STORE_KEY]: state,
      }),
      sendWhatsApp: sendWhatsAppFromSystem,
    },
  });
}

// Proxies
const proxy = httpProxy.createProxyServer({ ws: true });
proxy.on("error", (err, req, res) => {
  console.error("[Manager] Proxy error:", err.message);
  // @ts-ignore
  if (res && res.writeHead) {
    // @ts-ignore
    const isApiRequest = String(req?.url || "").startsWith("/api/");
    // @ts-ignore
    res.writeHead(502, { "Content-Type": isApiRequest ? "application/json" : "text/plain" });
    // @ts-ignore
    res.end(isApiRequest ? JSON.stringify({ error: "Bad gateway", details: "Worker might be down" }) : "Bad Gateway - Worker might be down");
  }
});

async function autoSpawnSystemBot() {
  try {
    const sysBotId = await dbService.getGlobalSetting("system_bot_id");
    if (sysBotId) {
      const botData = await dbService.getBotById(sysBotId);
      if (botData) {
        console.log(`[Manager] Auto-spawning System Alert Bot: ${sysBotId}`);
        await spawnWorker(sysBotId, botData.user_id, "system_bot");
      }
    }
  } catch (e) {
    console.error("[Manager] Failed to auto-spawn system bot:", e);
  }
}

async function restoreActiveLinkedWorkers(reason: "startup_restore" | "watchdog_restore") {
  try {
    await botWorkerLifecycle.restoreActiveLinkedWorkers(reason);
  } catch (error: any) {
    console.error(`[Manager] ${reason} failed:`, error?.message || error);
  }
}

function startActiveLinkedWorkerWatchdog() {
  if (activeLinkedWorkerWatchdogStarted) return;
  activeLinkedWorkerWatchdogStarted = true;
  const intervalMs = Math.max(60_000, Number(process.env.BOT_WORKER_WATCHDOG_INTERVAL_MS || 2 * 60_000));
  setTimeout(() => restoreActiveLinkedWorkers("startup_restore"), 2_000);
  setInterval(() => restoreActiveLinkedWorkers("watchdog_restore"), intervalMs);
}

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
  console.log("[Manager] Starting Cluster Manager function...");
  const app = express();
  app.set('trust proxy', 1);
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    if (process.env.NODE_ENV === "production" && (!isStaging || isPublicConversion)) {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    next();
  });
  const PORT = 3000;
  const corsOptions = {
    origin: (origin: string | undefined, callback: any) => {
      if (!origin) return callback(null, false);
      if (isTrustedAppOrigin(origin)) return callback(null, true);
      return callback(new Error("Origin not allowed"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "x-requester-id", "creem-signature"],
    optionsSuccessStatus: 204,
  };
  console.log("[Manager] Express app created.");

  try {
    const migrationResult = await dbService.migrateLegacyStoredPasswords();
    console.log(`[Security] Legacy password migration scanned ${migrationResult.scannedUsers} users, migrated ${migrationResult.migratedPasswords} main passwords and ${migrationResult.migratedTempPasswords} temporary passwords.`);
  } catch (error) {
    console.error("[Security] Legacy password migration failed:", error);
  }

  app.use((req, res, next) => {
    const origin = req.get("origin");
    if (!origin || isTrustedAppOrigin(origin)) return next();
    logSecurityEvent("blocked_origin", {
      origin: normalizeOriginValue(origin) || origin,
      ip: getRequestIp(req),
      method: req.method,
      path: req.originalUrl,
    });
    return res.status(403).json({ error: "Origin not allowed" });
  });
  app.use(cors(corsOptions as any));
  app.use(cookieParser());
  installStageBoundary(app, requireSessionAccount, buildSafeAuthUser);
  
  // Log ALL incoming requests
  app.use((req, res, next) => {
     console.log(`[HTTP] ${req.method} ${redactAuthTokensFromUrl(req.url)} (Original: ${redactAuthTokensFromUrl(req.originalUrl)})`);
     next();
  });

  registerIntegrationLeadCaptureRoutes(app, {
    requireSessionAccount,
    getStableUserId,
  });

  registerCampaignContactRoutes(app, {
    requireSessionAccount,
    requireOwnedBot,
    getStableUserId,
    spawnWorker,
    activeWorkers,
  });

  registerWorkspaceRoutes(app, {
    requireSessionAccount,
    requireOwnedBot,
    getStableUserId,
    spawnWorker,
    activeWorkers,
  });

  app.get("/api/live-events", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      const accountId = getStableUserId(user);
      const isAdmin = isAdminAccount(user);
      const events = listLiveConsoleEvents({
        since: Number(req.query.since || 0),
        botId: String(req.query.botId || ""),
        accountId: isAdmin ? String(req.query.accountId || "") : accountId,
        includeGlobal: isAdmin,
      }).filter((event) => isAdmin || event.accountId === accountId);
      res.json({ events });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to load live events" });
    }
  });

  app.post("/api/bot/:botId/broadcast-by-ids", express.json(), async (req, res) => {
    const botId = req.params.botId;
    try {
      const authUser = await requireAuthenticatedUser(req, res);
      if (!authUser) return;
      const bot = await requireOwnedBot(req, res, getStableUserId(authUser), botId);
      if (!bot) return;

      const worker = await spawnWorker(botId, String(bot.user_id), "dashboard_wake");
      const workerResponse = await fetch(`http://127.0.0.1:${worker.port}/api/broadcast-by-ids`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...buildWorkerInternalHeaders() },
        body: JSON.stringify(req.body || {}),
      });
      const contentType = workerResponse.headers.get("content-type") || "";
      if (!contentType.toLowerCase().includes("application/json")) {
        const preview = sanitizeCourierText(await workerResponse.text().catch(() => ""), 140);
        return res.status(502).json({
          error: "Courier broadcast API did not return JSON. Please refresh/deploy backend or check worker route.",
          status: workerResponse.status,
          preview,
        });
      }
      const payload = await workerResponse.json().catch(() => null);
      if (!payload || typeof payload !== "object") {
        return res.status(502).json({ error: "Courier broadcast API returned invalid JSON.", status: workerResponse.status });
      }
      return res.status(workerResponse.status).json(payload);
    } catch (e: any) {
      console.error("[Courier Broadcast] Manager route failed:", sanitizeCourierText(e?.message || e));
      return res.status(502).json({ error: "Courier broadcast worker is unavailable.", details: sanitizeCourierText(e?.message || e) });
    }
  });

  // Proxy worker API calls
  app.use("/api/bot/:botId", async (req, res, next) => {
    const botId = req.params.botId;
    if (req.method === "POST" && req.originalUrl.split("?")[0] === `/api/bot/${botId}/update-config`) {
      return res.status(403).json({ error: "Use the authorized account settings endpoint to update instance configuration." });
    }
    if (req.method === "POST" && req.path === "/send-message") {
      let completed = false;
      manualSendLimiter(req, res, () => {
        completed = true;
      });
      if (!completed) return;
    }
    
    try {
      const authUser = await requireAuthenticatedUser(req, res);
      if (!authUser) return;
      const bot = await requireOwnedBot(req, res, getStableUserId(authUser), botId);
      if (!bot) return;

      const worker = await spawnWorker(botId, String(bot.user_id), "dashboard_wake");
      req.url = req.originalUrl.replace(`/api/bot/${botId}`, '/api');
      req.headers[WORKER_AUTH_CONSTANTS.INTERNAL_HEADER_NAME] = getOrCreateServerInternalSecret();
      proxy.web(req, res, { target: `http://127.0.0.1:${worker.port}` }, (err) => {
             if (err && !res.headersSent) {
                 res.status(502).json({ error: "Bad gateway", details: err.message });
             }
         });
    } catch(e) {
      res.status(500).json({ error: "Worker failed to start" });
    }
  });

  app.use("/socket.io", async (req, res, next) => {
    const botId = req.query.botId as string;
    if (!botId) return next();
    try {
      const authUser = await requireAuthenticatedUser(req, res);
      if (!authUser) return;
      const bot = await requireOwnedBot(req, res, getStableUserId(authUser), botId);
      if (!bot) return;

      const worker = await spawnWorker(botId, String(bot.user_id), "dashboard_wake");
      req.url = req.originalUrl; // Keep /socket.io intact
      proxy.web(req, res, { target: `http://127.0.0.1:${worker.port}` }, (err) => {
          if (err && !res.headersSent) {
              res.status(502).json({ error: "Bad gateway", details: err.message });
          }
      });
    } catch(e) {
      res.status(500).json({ error: "Worker failed to start" });
    }
  });

  app.get("/api/webhooks/whatsapp-cloud", async (req, res) => {
    try {
      const mode = req.query["hub.mode"] as string;
      const verifyToken = req.query["hub.verify_token"] as string;
      const challenge = req.query["hub.challenge"] as string;

      const expectedVerifyToken =
        process.env.WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN ||
        process.env.WHATSAPP_VERIFY_TOKEN ||
        process.env.META_WEBHOOK_VERIFY_TOKEN;

      const result = verifyCloudApiWebhookChallenge({
        mode,
        verifyToken,
        challenge,
        expectedVerifyToken,
      });

      if (result.success && result.challenge) {
        res.status(200).send(result.challenge);
      } else {
        res.status(403).send("Forbidden");
      }
    } catch (e: any) {
      res.status(403).send("Forbidden");
    }
  });

  app.post("/api/webhooks/whatsapp-cloud", express.raw({ type: "application/json", limit: "2mb" }), async (req, res) => {
    try {
      const appSecret =
        process.env.WHATSAPP_CLOUD_META_APP_SECRET ||
        process.env.WHATSAPP_CLOUD_APP_SECRET ||
        process.env.META_APP_SECRET ||
        process.env.WHATSAPP_APP_SECRET;

      if (!appSecret) {
        return res.status(503).json({ error: "App secret not configured" });
      }

      const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || "");
      const signature = req.get("x-hub-signature-256");

      const isSignatureValid = verifyMetaWebhookSignature({
        body: rawBody,
        signature,
        appSecret,
      });

      if (!isSignatureValid) {
        return res.status(401).send("Unauthorized");
      }

      let payloadObj: any = {};
      try {
        payloadObj = JSON.parse(rawBody.toString("utf-8"));
      } catch (parseErr) {
        return res.status(400).json({ error: "Invalid JSON body" });
      }

      const events = extractCloudApiWebhookEvents(payloadObj);
      for (const event of events) {
        const safeSummary = summarizeCloudApiWebhookEvent(event);
        if (event.templateStatus) {
          const wabaId = event.templateStatus.wabaId;
          const matchedBot = await dbService.findBotByCloudApiWabaId(wabaId);
          if (matchedBot && matchedBot.botId && matchedBot.userId) {
            const { updateCachedTemplateStatusInStorage } = await import("./src/services/whatsapp-cloud-api-template-service.ts");
            await updateCachedTemplateStatusInStorage({
              accountId: matchedBot.userId,
              botId: matchedBot.botId,
              templateName: event.templateStatus.templateName,
              language: event.templateStatus.language,
              status: event.templateStatus.event,
            });
            console.log(`[WhatsApp Cloud Webhook] Updated cached template ${event.templateStatus.templateName} status -> ${event.templateStatus.event} for bot ${matchedBot.botId}`);
          } else {
            console.log(`[WhatsApp Cloud Webhook] Template status event ignored: unknown WABA ${wabaId}`);
          }
          emitLiveConsoleEvent({
            type: "whatsapp_cloud_webhook_received",
            level: "info",
            scope: "admin",
            title: "WhatsApp Cloud Template Status",
            message: `Template '${event.templateStatus.templateName}' status: ${event.templateStatus.event}. Mapped bot: ${matchedBot?.botId || "none"}.`,
            metadata: {
              ...safeSummary,
              mappedBotId: matchedBot?.botId,
            },
          });
          continue;
        }

        let botId: string | null = null;
        if (event.phoneNumberId) {
          const matchedBot = await dbService.findBotByCloudApiPhoneNumberId(event.phoneNumberId);
          botId = matchedBot ? matchedBot.botId : null;
        }

        emitLiveConsoleEvent({
          type: "whatsapp_cloud_webhook_received",
          level: "info",
          scope: "admin",
          title: "WhatsApp Cloud Webhook",
          message: `Received webhook event: ${event.message ? "message" : "status"}. Mapped bot ID: ${botId || "none"}.`,
          metadata: {
            ...safeSummary,
            mappedBotId: botId || undefined,
          },
        });

        const worker = botId ? activeWorkers.get(botId) : null;
        if (worker) {
          const eventType = event.message ? "message" : (event.status ? "status" : "other");
          const forwardPayload = {
            botId,
            phoneNumberId: event.phoneNumberId,
            eventType,
            event: {
              type: eventType,
              phoneNumberId: event.phoneNumberId,
              displayPhoneNumber: event.displayPhoneNumber,
              contact: event.contactName ? { name: event.contactName, waId: event.contactWaId } : undefined,
              message: event.message,
              status: event.status,
              timestamp: event.message?.timestamp ?? event.status?.timestamp ?? Math.floor(Date.now() / 1000),
            },
          };

          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);

            const response = await fetch(`http://127.0.0.1:${worker.port}/api/cloud-webhook-event`, {
              method: "POST",
              headers: { "Content-Type": "application/json", ...buildWorkerInternalHeaders() },
              body: JSON.stringify(forwardPayload),
              signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
              console.warn(`[WhatsApp Cloud Webhook] Worker responded with status ${response.status} for bot ${botId}`);
            }
          } catch (forwardErr: any) {
            console.error(`[WhatsApp Cloud Webhook] Forwarding to worker ${botId} failed:`, forwardErr?.message || forwardErr);
            emitLiveConsoleEvent({
              type: "whatsapp_cloud_webhook_failed",
              level: "error",
              scope: "admin",
              title: "Webhook Forwarding Failed",
              message: `Failed forwarding event to worker: ${forwardErr?.message || "timeout/connection error"}.`,
              metadata: {
                botId,
                phoneNumberId: event.phoneNumberId,
                eventType,
              },
            });
          }
        } else {
          console.log(`[WhatsApp Cloud Webhook] Worker not running for bot ${botId || "none"}`);
          const eventType = event.message ? "message" : (event.status ? "status" : "other");
          emitLiveConsoleEvent({
            type: "whatsapp_cloud_webhook_failed",
            level: "warn",
            scope: "admin",
            title: "Webhook Worker Not Running",
            message: `Worker not active for bot ID ${botId || "none"}. Webhook event discarded.`,
            metadata: {
              botId: botId || undefined,
              phoneNumberId: event.phoneNumberId,
              eventType,
            },
          });
        }
      }

      res.status(200).json({ success: true, received: true });
    } catch (e: any) {
      console.error("[WhatsApp Cloud Webhook] POST failed:", e?.message || e);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  app.post("/api/billing/creem/webhook", express.raw({ type: "application/json", limit: "1mb" }), async (req, res) => {
    try {
      const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || "");
      emitLiveConsoleEvent({
        type: "creem_webhook_received",
        level: "info",
        scope: "admin",
        title: "Creem webhook received",
        message: "Payment webhook reached the backend.",
      });
      const result = await processCreemWebhook(rawBody, req.get("creem-signature"));
      if (result?.applied === "payment_status") {
        emitLiveConsoleEvent({
          type: "creem_payment_failed",
          level: "warn",
          scope: "admin",
          accountId: result.userId,
          title: "Creem payment status",
          message: "Creem reported a failed/refund/dispute payment status.",
          status: result.eventType,
          metadata: { purchaseType: result.purchaseType },
        });
      } else if (result?.applied && !result?.duplicate && !result?.ignored) {
        emitLiveConsoleEvent({
          type: "creem_payment_succeeded",
          level: "success",
          scope: "admin",
          accountId: result.userId,
          title: "Creem payment confirmed",
          message: `Applied ${result.applied}.`,
          status: result.applied,
          metadata: { purchaseType: result.purchaseType, amount: result.amount || 0 },
        });
      }
      if (result?.userId && !result?.duplicate && result?.notification) {
        const dedupeKey = crypto.createHash("sha256").update(rawBody).digest("hex").slice(0, 24);
        await sendBillingNotification({
          userId: result.userId,
          title: result.notification.title,
          status: result.notification.status,
          amount: result.notification.amount || (result.amount ? `$${result.amount}` : ""),
          action: result.notification.action || "",
          dedupeKey,
          sendWhatsApp: sendWhatsAppFromSystem
        }).catch((noticeError) => console.warn("[Billing Notice] Failed:", noticeError?.message || noticeError));
      }
      res.json({ received: true, ...result });
    } catch (e: any) {
      console.error("[Creem Webhook] Failed:", e?.message || e);
      emitLiveConsoleEvent({
        type: "creem_webhook_failed",
        level: "error",
        scope: "admin",
        title: "Creem webhook failed",
        message: e?.message || "Webhook processing failed",
        reason: e?.statusCode ? String(e.statusCode) : "processing_error",
      });
      res.status(e?.statusCode || 500).json({ error: e?.message || "Webhook processing failed" });
    }
  });

  app.use(express.json({ limit: "3mb" }));

  if (!isStaging) {
  autoSpawnSystemBot();
  syncAllInstanceNumbersToMainBlacklist()
    .then((result) => console.log(`[MainBlacklist] Checked ${result.synced} connected instance number(s).`))
    .catch((error) => console.error("[MainBlacklist] Sync failed:", error?.message || error));

  }
  // Admin Logging Utility
  const logAdminAction = (action: string, details: any, requesterId: string) => {
    try {
      const logDir = path.join(process.cwd(), 'backups', 'admin_logs');
      if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
      
      const date = format(new Date(), 'yyyy-MM-dd');
      const filePath = path.join(logDir, `${date}.log`);
      const timestamp = new Date().toISOString();
      const entry = `[${timestamp}] AUTH:${requesterId} | ACTION:${action} | DATA:${JSON.stringify(details)}\n`;
      
      fs.appendFileSync(filePath, entry);
    } catch (e) {
      console.error("[Admin Log] Error writing log:", e);
    }
  };

  app.use("/api/admin", async (req, res, next) => {
    let completed = false;
    adminRouteLimiter(req, res, () => {
      completed = true;
    });
    if (!completed) return;
    if (req.method === "GET" && req.path === "/app-status") return next();
    const requester = await requireAdminUser(req, res);
    if (!requester) return;
    (req as any).authUser = requester;
    next();
  });

  app.use("/api/bots", async (req, res, next) => {
    const user = await requireSessionAccount(req, res);
    if (!user) return;
    (req as any).authUser = user;
    next();
  });

  app.use("/api/user", async (req, res, next) => {
    const user = await requireSessionAccount(req, res);
    if (!user) return;
    (req as any).authUser = user;
    next();
  });

  app.use("/api/billing", async (req, res, next) => {
    let completed = false;
    billingRouteLimiter(req, res, () => {
      completed = true;
    });
    if (!completed) return;
    if (req.path === "/creem/webhook") return next();
    const user = await requireSessionAccount(req, res);
    if (!user) return;
    (req as any).authUser = user;
    next();
  });

  const LEGAL_DOCUMENT_VERSION = '2026-05-16';
  const oauthStateStore = new Map<string, { mode: 'login' | 'signup', legalAcceptance?: any, createdAt: number }>();

  const normalizeLegalAcceptance = (legalAcceptance: any = {}) => {
    const acceptedAt = legalAcceptance.acceptedAt || new Date().toISOString();
    const rawMarketingConsent = legalAcceptance.marketingConsent || {};
    const promotionalMessages = rawMarketingConsent.promotionalMessages === true;
    return {
      terms: legalAcceptance.terms === true,
      privacy: legalAcceptance.privacy === true,
      disclaimer: legalAcceptance.disclaimer === true,
      marketingConsent: {
        promotionalMessages,
        channels: Array.isArray(rawMarketingConsent.channels)
          ? rawMarketingConsent.channels.filter((channel: any) => ['whatsapp', 'email'].includes(channel))
          : (promotionalMessages ? ['whatsapp', 'email'] : []),
        acceptedAt: promotionalMessages ? (rawMarketingConsent.acceptedAt || acceptedAt) : null,
        source: rawMarketingConsent.source || legalAcceptance.source || 'unknown'
      },
      acceptedAt,
      version: legalAcceptance.version || LEGAL_DOCUMENT_VERSION,
      source: legalAcceptance.source || 'unknown',
      acceptedDocuments: [
        legalAcceptance.terms === true ? 'terms_of_service' : null,
        legalAcceptance.privacy === true ? 'privacy_policy' : null,
        legalAcceptance.disclaimer === true ? 'disclaimer' : null
      ].filter(Boolean)
    };
  };

  const hasRequiredLegalAcceptance = (legalAcceptance: any) => {
    const normalized = normalizeLegalAcceptance(legalAcceptance);
    return normalized.terms && normalized.privacy && normalized.disclaimer;
  };

  const sendOAuthPopupResult = (res: express.Response, type: string, payload: any = null, message = "") => {
    const typeJson = JSON.stringify(type);
    const payloadJson = JSON.stringify(payload);
    const messageJson = JSON.stringify(message);
    const htmlEntities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    };
    const safeMessage = String(message || "").replace(/[&<>"']/g, (char) => htmlEntities[char] || char);
    const isError = type === 'OAUTH_AUTH_ERROR';
    res.send(`
      <html>
        <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f9fafb;">
          <div style="text-align: center; padding: 20px; background: white; border-radius: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); max-width: 420px;">
            <h2 style="color: ${isError ? '#e11d48' : '#10b981'};">${isError ? 'Authentication Failed' : 'Authentication Successful!'}</h2>
            <p style="color: #4b5563;">${isError ? safeMessage : 'Closing this window and returning to the app...'}</p>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: ${typeJson}, payload: ${payloadJson}, message: ${messageJson} }, '*');
                setTimeout(() => window.close(), ${isError ? 2500 : 1000});
              } else {
                window.location.href = '/';
              }
            </script>
            ${isError ? '<button onclick="window.close()" style="margin-top: 12px;">Close Window</button>' : ''}
          </div>
        </body>
      </html>
    `);
  };

  const getRequestAuditInfo = (req: any) => ({
    ip: String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || req.socket?.remoteAddress || '',
    userAgent: req.get('user-agent') || '',
    host: req.get('host') || '',
    origin: req.get('origin') || '',
    referer: req.get('referer') || ''
  });

  const logLegalAcceptance = (event: string, details: any, req: any) => {
    try {
      const logDir = path.join(process.cwd(), 'backups', 'legal_acceptance');
      if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

      const filePath = path.join(logDir, `${format(new Date(), 'yyyy-MM-dd')}.jsonl`);
      const record = {
        timestamp: new Date().toISOString(),
        event,
        legalVersion: LEGAL_DOCUMENT_VERSION,
        ...getRequestAuditInfo(req),
        ...details
      };

      fs.appendFileSync(filePath, JSON.stringify(record) + '\n');
    } catch (e) {
      console.error("[Legal Log] Error writing legal acceptance log:", e);
    }
  };

  // --- App Status / Maintenance Routes ---
  app.get("/api/admin/app-status", async (req, res) => {
    try {
      const isProd = process.env.NODE_ENV === 'production';
      const currentStatus = getAppStatus();
      console.log(`[API] Fetching app status: ${currentStatus} (Env: ${isProd ? 'PROD' : 'DEV'}, DB: ${dbService.DATABASE_ID})`);
      res.json({ 
        status: currentStatus, 
        environment: isProd ? 'PRODUCTION' : 'DEVELOPMENT',
        databaseId: dbService.DATABASE_ID
      });
    } catch(e: any) { 
      console.error("[API] Error in /api/admin/app-status:", e.message);
      res.status(500).json({ error: e.message }); 
    }
  });

  app.post("/api/admin/app-status", async (req, res) => {
    const { status } = req.body;
    try {
      const requester = await requireAdminUser(req, res, { superAdminOnly: true });
      if (!requester) return;
      console.log(`[API] Change app status requested: ${status} by ${getStableUserId(requester)}`);
      
      if (status === 'LIVE') {
        console.log(`[Status] Verifying schema before flipping to LIVE...`);
        try {
          await runSchemaSync();
        } catch (err: any) {
          console.error(`[Status] Schema verification failed:`, err.message);
          return res.status(500).json({ error: "Schema verification failed. Live database might be missing collections or attributes." });
        }
      }

      setAppStatus(status);
      refreshDbServiceId();
      refreshClientDbId();
      logAdminAction("CHANGE_APP_STATUS", { newStatus: status }, getStableUserId(requester));

      // Kill all workers cleanly
      for (const [botId, worker] of activeWorkers.entries()) {
         botWorkerLifecycle.markIntentionalStop(botId, "app status change");
         try { await fetch(`http://127.0.0.1:${worker.port}/api/shutdown`, { method: "POST", headers: buildWorkerInternalHeaders() }).catch(()=>{}) } catch(e){}
         try { worker.process.kill('SIGKILL'); } catch(e) {}
      }
      activeWorkers.clear();

      res.json({ 
        success: true, 
        status, 
        databaseId: dbService.DATABASE_ID,
        environment: process.env.NODE_ENV === 'production' ? 'PRODUCTION' : 'DEVELOPMENT'
      });
    } catch(e: any) { 
      console.error("[API] Error in POST /api/admin/app-status:", e.message);
      res.status(500).json({ error: e.message }); 
    }
  });

  app.get("/api/admin/sysbot-logs", async (req, res) => {
    try {
      const requester = await requireAdminUser(req, res);
      if (!requester) return;
      const sysBotId = await dbService.getGlobalSetting("system_bot_id");
      if (!sysBotId) return res.status(400).json({ error: "System bot not configured" });

      let worker = activeWorkers.get(sysBotId);
      if (!worker) return res.status(400).json({ error: "Worker not running" });
      
      const logRes = await fetch(`http://127.0.0.1:${worker.port}/api/server-logs`, { headers: buildWorkerInternalHeaders() });
      const logs = await logRes.json();
      res.json(logs);
    } catch(e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/admin/sync-schema", async (req, res) => {
    try {
      const requester = await requireAdminUser(req, res, { superAdminOnly: true });
      if (!requester) return;
      console.log(`[API] Manual sync requested by ${getStableUserId(requester)}`);
      const { stdout, stderr } = await runSchemaSync();
      if (stderr) console.error("[Status] Sync STDERR:", stderr);
      
      logAdminAction("SYNC_SCHEMA", {}, getStableUserId(requester));
      res.json({ success: true });
    } catch(e: any) { 
      console.error(`[Status] Manual sync failed:`, e.message);
      res.status(500).json({ error: e.message }); 
    }
  });

  // --- OAuth Endpoints ---
  app.get("/api/auth/url", googleOAuthStartLimiter, (req, res) => {
    const redirectUri = resolveGoogleOAuthRedirectUri(req);
    console.log(`[OAuth] START: redirect_uri=${redirectUri}`);

    const legalRaw = typeof req.query.legalAcceptance === 'string' ? req.query.legalAcceptance : '';
    const mode: 'login' | 'signup' = req.query.mode === 'signup' || legalRaw ? 'signup' : 'login';
    const state = generateOAuthState();
    let legalAcceptance: any | undefined;
    if (mode === 'signup') {
      if (!legalRaw) {
        return res.status(400).json({ error: "Please accept the Terms of Service, Privacy Policy, and Disclaimer before creating an account." });
      }
      try {
        const parsedLegal = JSON.parse(legalRaw);
        if (!hasRequiredLegalAcceptance(parsedLegal)) {
          return res.status(400).json({ error: "Please accept the Terms of Service, Privacy Policy, and Disclaimer before creating an account." });
        }
        legalAcceptance = normalizeLegalAcceptance(parsedLegal);
      } catch {
        return res.status(400).json({ error: "Invalid legal acceptance payload." });
      }
    }
    registerOAuthState(state, { mode, legalAcceptance });
    const stateCookie = signOAuthState(state, SESSION_SECRET);
    res.cookie("bai_oauth_state", stateCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production" && (!isStaging || isPublicConversion),
      sameSite: "lax",
      maxAge: 15 * 60 * 1000,
      path: "/",
    });

    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || '', 
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'consent'
    });
    params.set('state', state);

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
    res.json({ url: authUrl });
  });

  app.get([GOOGLE_OAUTH_CALLBACK_PATH, `${GOOGLE_OAUTH_CALLBACK_PATH}/`, ...GOOGLE_OAUTH_LEGACY_CALLBACK_PATHS], googleOAuthCallbackLimiter, async (req, res) => {
    const { code, state } = req.query;
    const redirectUri = resolveGoogleOAuthRedirectUri(req);
    console.log(`[OAuth] CALLBACK: redirect_uri=${redirectUri}`);

    try {
      if (!code) throw new Error("No code provided");

      const cookieState = req.cookies?.bai_oauth_state;
      const stateValidation = validateAndConsumeOAuthState({
        queryState: state,
        cookieState,
        secret: SESSION_SECRET,
      });
      res.clearCookie("bai_oauth_state", { path: "/" });

      if (!stateValidation.valid) {
        console.warn(`[OAuth Security] Blocked Google OAuth callback reason=${stateValidation.error}`);
        return sendOAuthPopupResult(res, 'OAUTH_AUTH_ERROR', null, "Authentication session expired or invalid. Please try signing in again.");
      }
      const oauthState = stateValidation.metadata;
      
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: code as string,
          client_id: process.env.GOOGLE_CLIENT_ID || '',
          client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
          redirect_uri: redirectUri,
          grant_type: 'authorization_code'
        })
      });

      const tokenData: any = await tokenResponse.json();
      if (tokenData.error) throw new Error(tokenData.error_description || tokenData.error);

      // Fetch user profile
      const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
      });
      const userData = await userResponse.json();

      if (!userData || !userData.email) throw new Error("Failed to fetch user profile");
      console.log(`[OAuth] User logged in: ${userData.email}`);

      // Register or find user in DB
      let user = await dbService.getUser(userData.email.toLowerCase()) as any;
      const isNewOAuthUser = !user;
      if (!user) {
        if (oauthState?.mode !== 'signup' || !oauthState?.legalAcceptance) {
          const message = "Please sign up first and accept Terms, Privacy Policy, and Disclaimer before logging in.";
          console.warn(`[OAuth] Blocked Google login for missing account: ${userData.email}`);
          return sendOAuthPopupResult(res, 'OAUTH_AUTH_ERROR', null, message);
        }
        let role = 'user';
        if (userData.email.toLowerCase() === 'contact-b20fab63366b@example.invalid') role = 'super_admin';
        const userId = generateCryptoAuthId("usr");
        user = await dbService.createUser({ 
            id: userId, 
            email: userData.email.toLowerCase(), 
            name: userData.name, 
            password_hash: 'oauth', 
            role, 
            created_at: now(), 
            wallet_balance: 1.0
        });
        await sendTrialStartedNotification(user.$id || userId);
      } else {
        if ((user.email === 'contact-b20fab63366b@example.invalid' || user.email === 'contact-f702aab6c91b@example.invalid') && user.role !== 'super_admin') {
           await dbService.updateUser(user.$id, { role: 'super_admin' });
           user.role = 'super_admin';
        }
      }

      if (oauthState?.legalAcceptance) {
        logLegalAcceptance(isNewOAuthUser ? "signup_register" : "legal_acceptance", {
          userId: user.$id || user.id,
          email: user.email || userData.email.toLowerCase(),
          name: user.name || userData.name,
          context: "google_oauth_signup",
          legalAcceptance: oauthState.legalAcceptance
        }, req);
      }

      let msgType = 'OAUTH_AUTH_SUCCESS';
      let payload = JSON.stringify({
        ...buildSafeAuthUser(user),
        signupCreated: isNewOAuthUser,
      });
      if (user.has_2fa_enabled === 1) {
         msgType = 'OAUTH_REQUIRES_2FA';
         payload = JSON.stringify({ userId: user.$id });
      } else {
         setAuthSession(res, user);
      }

      // Send success message to parent window and close popup
      sendOAuthPopupResult(res, msgType, JSON.parse(payload));
    } catch (err: any) {
       console.error(`[OAuth] Error: ${err.message}`);
       sendOAuthPopupResult(res, 'OAUTH_AUTH_ERROR', null, err.message || "Google authentication failed.");
    }
  });

  // --- Legacy Direct Auth Endpoints (for dev/fallback) ---
  app.get("/api/users/count", async (req, res) => {
    try {
       const count = await dbService.getUserCount();
       res.json({ count });
    } catch(e: any) {
       res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/auth/verify-google-2fa", authRouteLimiter, express.json(), async (req, res) => {
    try {
      const { userId: rawUserId, totpOtp } = req.body;
      const userId = await resolveUser(rawUserId);
      if (!userId) return res.status(404).json({ error: "User not found" });

      const user = await dbService.getUser(userId) as any;
      if (!user) return res.status(404).json({ error: "User not found" });

      if (user.has_2fa_enabled === 1) {
          if (!totpOtp) return res.status(400).json({ error: "2FA code required" });
          const isValidOtp = verifySync({ token: totpOtp, secret: user.totp_secret }).valid;
          if (!isValidOtp) return res.status(400).json({ error: "Invalid 2FA code" });
      }
      setAuthSession(res, user);
      
      res.json({ success: true, user: buildSafeAuthUser(user) });
    } catch(e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/admin/users", async (req, res) => {
    try {
      const requester = await requireAdminUser(req, res);
      if (!requester) return;
      const users = await dbService.listUsers();
      
      const usersWithStats = await Promise.all(users.map(async (user: any) => {
        const bots = await dbService.getBotsByUser(user.$id);
        const configs = await dbService.loadUserConfig(user.$id);
        const trialExtensionUsed = await hasUsedTrialExtension(user.$id, user, configs);
        
        return {
          ...buildSafeAdminUser(user),
          id: user.$id || user.id,
          wallet_billing_purchases_enabled: Boolean(configs?.wallet_billing_purchases_enabled),
          trial_extension_used: trialExtensionUsed,
          botCount: bots.length || 0,
          bots: (bots || []).map((bot: any) => ({
            id: bot.$id || bot.id,
            name: bot.name || "",
            jid: bot.jid || "",
            is_active: bot.is_active,
            updated_at: bot.updated_at || bot.$updatedAt || 0,
          })),
          config: sanitizeAdminUserConfig(configs || null)
        };
      }));

      res.json(usersWithStats);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/admin/users/extend-trial", express.json(), async (req, res) => {
    try {
      const target = await requireTargetUserForAdmin(req, res);
      if (!target) return;
      const { requester, targetUserId } = target;
      const result = await extendTrialForUser(targetUserId, getStableUserId(requester));
      logAdminAction("EXTEND_TRIAL_30_DAYS", { targetUserId, trialExpiresAt: result.trial_expires_at }, getStableUserId(requester));
      res.json(result);
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Failed to extend trial" });
    }
  });

  app.post("/api/admin/users/resolve-trial-extension", express.json(), async (req, res) => {
    try {
      const target = await requireTargetUserForAdmin(req, res, { superAdminOnly: true });
      if (!target) return;
      const { requester, targetUserId } = target;
      const { resolution } = req.body || {};
      if (resolution !== "eligible" && resolution !== "used") {
        return res.status(400).json({ error: "Invalid resolution. Must be 'eligible' or 'used'." });
      }
      const result = await resolveLegacyTrialExtension(targetUserId, resolution, getStableUserId(requester));
      logAdminAction("RESOLVE_LEGACY_TRIAL_EXTENSION", { targetUserId, resolution }, getStableUserId(requester));
      res.json(result);
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Failed to resolve legacy trial extension" });
    }
  });

  app.get("/api/admin/smart-sales-prompt", async (req, res) => {
    try {
      const requester = await requireAdminUser(req, res);
      if (!requester) return;
      const config = await getSmartSalesPromptConfig();
      res.json(config);
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to load Smart Sales Engine settings" });
    }
  });

  app.post("/api/admin/smart-sales-prompt", express.json({ limit: "256kb" }), async (req, res) => {
    try {
      const requester = await requireAdminUser(req, res);
      if (!requester) return;
      const promptText = String(req.body?.smartSalesPromptText || "").trim() || DEFAULT_SMART_SALES_PROMPT;
      const promptVersion = String(req.body?.smartSalesPromptVersion || "").trim() || SMART_SALES_PROMPT_VERSION;
      const saved = await saveSmartSalesPromptConfig({
        smartSalesPromptText: promptText,
        smartSalesPromptVersion: promptVersion,
        updatedBy: getStableUserId(requester),
      });
      logAdminAction("UPDATE_SMART_SALES_PROMPT", {
        promptVersion: saved.smartSalesPromptVersion,
        promptLength: saved.smartSalesPromptText.length,
      }, getStableUserId(requester));
      res.json({ success: true, ...saved });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to save Smart Sales Engine settings" });
    }
  });

  app.get("/api/admin/shared-phone-directory", async (req, res) => {
    try {
      const requester = await requireAdminUser(req, res);
      if (!requester) return res.status(403).json({ error: "Unauthorized" });
      const directory = await listSharedPhoneDirectory({
        query: String(req.query.q || ""),
        limit: Number(req.query.limit || 1000),
      });
      res.json(directory);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/admin/shared-phone-directory.csv", async (req, res) => {
    try {
      const requester = await requireAdminUser(req, res);
      if (!requester) return res.status(403).json({ error: "Unauthorized" });
      const csv = await exportSharedPhoneDirectoryCsv();
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename=shared-phone-directory-${format(new Date(), "yyyy-MM-dd")}.csv`);
      res.send(csv);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/admin/shared-phone-directory/import", express.json({ limit: "3mb" }), async (req, res) => {
    try {
      const requester = await requireAdminUser(req, res);
      if (!requester) return res.status(403).json({ error: "Unauthorized" });
      const result = await importSharedPhoneDirectoryRows(req.body?.rows);
      logAdminAction("IMPORT_SHARED_PHONE_DIRECTORY", { imported: result.imported, skipped: result.skipped }, getStableUserId(requester));
      res.json({ success: true, ...result });
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Shared directory import failed" });
    }
  });

  app.post("/api/admin/delink-bot", express.json(), async (req, res) => {
    const botId = String(req.body?.botId || "");
    try {
      const requester = await requireAdminUser(req, res);
      if (!requester) return;
      if (!botId) return res.status(400).json({ error: "Missing botId" });
      const target = await requireTargetUserForAdmin(req, res);
      if (!target) return;
      const { targetUserId } = target;
      const bot = await requireOwnedBot(req, res, targetUserId, botId);
      if (!bot) return;

      const oldJid = bot?.jid || "";
      const clearResult = await dbService.clearBotJid(botId, targetUserId);
      if (clearResult.success) {
        if (oldJid) {
          await releaseWhatsAppNumberLock(oldJid, botId).catch(() => {});
        }
        if (activeWorkers.has(botId)) {
          const worker = activeWorkers.get(botId)!;
          botWorkerLifecycle.markIntentionalStop(botId, "admin delink");
          try { await fetch(`http://127.0.0.1:${worker.port}/api/shutdown`, { method: "POST", headers: buildWorkerInternalHeaders() }).catch(()=>{}) } catch(e){}
          worker.process.kill('SIGKILL');
          activeWorkers.delete(botId);
        }
        try {
          const AUTH_FOLDER = path.join(process.cwd(), `auth_info_baileys_${botId}`);
          const ALT_AUTH_FOLDER = path.join(process.cwd(), `auth_info_baileys_bot_${botId}`);
          await fs.promises.rm(AUTH_FOLDER, { recursive: true, force: true }).catch(() => {});
          await fs.promises.rm(ALT_AUTH_FOLDER, { recursive: true, force: true }).catch(() => {});
        } catch(e) {}
        console.log(`[Admin Delink] Released permanent ownership for ${oldJid || "empty WhatsApp number"} from bot ${botId} for user ${targetUserId}. Historical data was preserved.`);
        logAdminAction("DELINK_BOT_NUMBER", { botId, userId: targetUserId, jid: oldJid, preservedData: true }, getStableUserId(requester));
        res.json({ success: true, jid: oldJid, message: "WhatsApp number delinked. Historical data was preserved." });
      } else {
        console.warn(`[Admin Delink] Failed for bot ${botId}: ${clearResult.reason}`);
        res.status(400).json({ error: clearResult.reason || "Could not delink WhatsApp number" });
      }
    } catch (e: any) {
      console.error(`[Admin Delink] Failed for bot ${botId}:`, e?.message || e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/admin/update-wallet", express.json(), async (req, res) => {
    try {
      const target = await requireTargetUserForAdmin(req, res);
      if (!target) return;
      const { requester, targetUser, targetUserId } = target;
      const { amount } = req.body;
      const oldUser = targetUser;

      const oldBalance = oldUser.wallet_balance || 0;
      const diff = amount - oldBalance;
      
      await dbService.updateUser(oldUser.$id, { wallet_balance: amount });
      
      if (diff !== 0) {
        await dbService.addWalletTransaction(oldUser.$id, diff, diff > 0 ? "topup" : "deduction", "Admin Manual Wallet Update");
        if (diff > 0) {
          await dbService.markPaidAccessConfirmed(oldUser.$id, "admin_wallet_topup").catch(() => {});
        }
      }
      
      logAdminAction("UPDATE_WALLET", { targetUserId, newBalance: amount }, getStableUserId(requester));
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/admin/update-limits", express.json(), async (req, res) => {
    try {
      const target = await requireTargetUserForAdmin(req, res);
      if (!target) return;
      const { requester, targetUser: user, targetUserId } = target;
      const { extraBundles, billingLimit, usageCost } = req.body;

      if (extraBundles !== undefined) {
        await dbService.updateUser(user.$id, { extra_product_bundles: extraBundles });
      }
      if (billingLimit !== undefined || usageCost !== undefined) {
         const updateData: any = {};
         if (billingLimit !== undefined) updateData.billing_limit = billingLimit;
         if (usageCost !== undefined) updateData.usage_cost = usageCost;
         await dbService.saveUserConfig(user.$id, updateData);
      }
      logAdminAction("UPDATE_LIMITS", { targetUserId, extraBundles, billingLimit, usageCost }, getStableUserId(requester));
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/admin/update-subscription", express.json(), async (req, res) => {
    try {
      const target = await requireTargetUserForAdmin(req, res);
      if (!target) return;
      const { requester, targetUser: user, targetUserId } = target;
      const { trialExpiresAt, proxySubscriptionExpiry, assignedProxyUrl } = req.body;

      const updateData: any = {};
      if (trialExpiresAt !== undefined) updateData.trial_expires_at = trialExpiresAt;
      if (proxySubscriptionExpiry !== undefined) updateData.proxy_subscription_expiry = proxySubscriptionExpiry;
      if (assignedProxyUrl !== undefined) {
        const proxyValidation = validateOutboundProxyUrl(assignedProxyUrl, { allowEmpty: true });
        if (!proxyValidation.ok) {
          logSecurityEvent("blocked_proxy_assignment", {
            requesterId: getStableUserId(requester),
            targetUserId,
            proxy: assignedProxyUrl ? maskProxyUrl(assignedProxyUrl) : "",
            reason: proxyValidation.message,
          });
          return res.status(400).json({ error: proxyValidation.message });
        }
        updateData.assigned_proxy_url = proxyValidation.normalized || "";
      }
      
      await dbService.updateUser(user.$id, updateData);
      
      logAdminAction("UPDATE_SUBSCRIPTION", {
        targetUserId,
        trialExpiresAt,
        proxySubscriptionExpiry,
        assignedProxyUrl: assignedProxyUrl ? maskProxyUrl(assignedProxyUrl) : assignedProxyUrl,
      }, getStableUserId(requester));
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/admin/roles/update", express.json(), async (req, res) => {
    try {
       const target = await requireTargetUserForAdmin(req, res, { superAdminOnly: true, field: "targetUserId" });
       if (!target) return;
       const { requester, targetUserId } = target;
       const { newRole } = req.body;
       await dbService.updateUser(targetUserId, { role: newRole });
       logAdminAction("CHANGE_ROLE", { targetUserId, newRole }, getStableUserId(requester));
       res.json({ success: true });
    } catch(e: any) {
       res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/admin/temp-password", express.json(), async (req, res) => {
    try {
      const target = await requireTargetUserForAdmin(req, res, { superAdminOnly: true });
      if (!target) return;
      const { requester, targetUserId } = target;
      const { tempPass, expiresHours } = req.body;
      const result = await dbService.setTempPassword(targetUserId, tempPass, expiresHours || 24);
      logAdminAction(tempPass ? "GENERATE_TEMP_PASS" : "REMOVE_TEMP_PASS", { targetUserId }, getStableUserId(requester));
      res.json({ success: true, ...result });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/admin/generate-login-link", express.json(), async (req, res) => {
    try {
      const target = await requireTargetUserForAdmin(req, res);
      if (!target) return;
      const { requester, targetUserId } = target;
      const token = await dbService.createLoginToken(targetUserId);
      const link = buildAdminMagicLoginLink(getPublicAppOrigin(req), token);
      
      logAdminAction("GENERATE_MAGIC_LINK", { targetUserId }, getStableUserId(requester));
      
      res.json({ success: true, link, token });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/auth/token-login", authRouteLimiter, async (req, res) => {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: "Missing token" });
    try {
      const userId = await dbService.useLoginToken(token as string);
      if (!userId) return res.status(401).json({ error: "Invalid or expired token" });
      
      const user = await dbService.getUser(userId);
      if (!user) return res.status(404).json({ error: "User not found" });
      setAuthSession(res, user, { temporary: true });
      res.json({ success: true, user: buildSafeAuthUser(user, { is_temporary_session: true }) });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/auth/logout", express.json(), async (_req, res) => {
    clearAuthSession(res);
    res.json({ success: true });
  });

  app.post("/api/auth/send-otp", authRouteLimiter, express.json(), async (req, res) => {
      try {
          const { phone, isLogin, isReset } = req.body;
          if (!phone) return res.status(400).json({ error: "Phone number required" });
          
          const cleanPhone = normalizeAccountPhone(phone);
          if (!cleanPhone || cleanPhone.length < 10) return res.status(400).json({ error: "Invalid phone number" });

          if (isLogin || isReset) {
              const users = await dbService.listUsers();
              const user = users.find((u: any) => u.whatsapp_number === cleanPhone);
              if (!user) return res.status(404).json({ error: "No account found with this WhatsApp number" });
          } else {
              const users = await dbService.listUsers();
              const existingAccount = findExistingAccountByPhone(users, cleanPhone);
              if (existingAccount) {
                  return res.status(409).json({ error: buildDuplicatePhoneSignupMessage(existingAccount) });
              }
          }
          
          const purpose = isReset ? "password_reset" : (isLogin ? "login" : "signup");
          const { otp } = storeSecureOtp(cleanPhone, { purpose, isLogin, isReset });
          
          const actionText = isReset ? "password reset" : (isLogin ? "login" : "signup");
          await sendWhatsAppFromSystem(cleanPhone, `Your OTP for Black Arrow ${actionText} is: ${otp}\n\nThis code will expire in 10 minutes.`);
          
          res.json({ success: true, message: "OTP sent successfully" });
      } catch(e: any) {
          console.error("OTP send error", e);
          fs.appendFileSync('otp-error.log', new Date().toISOString() + ': ' + e.message + '\n' + (e.stack || '') + '\n');
          res.status(500).json({ error: e.message || "Failed to send OTP" });
      }
  });

  const contactRouteLimiter = createRateLimitMiddleware({
    name: "contact_form",
    max: 5,
    windowMs: 15 * 60 * 1000,
    message: "Too many contact attempts. Please wait a few minutes and try again.",
  });

  app.post("/api/contact", contactRouteLimiter, express.json(), async (req, res) => {
    try {
      const name = sanitizePlainTextInput(req.body?.name, 80);
      const email = sanitizePlainTextInput(req.body?.email, 120).toLowerCase();
      const phone = sanitizePlainTextInput(req.body?.phone, 40);
      const company = sanitizePlainTextInput(req.body?.company, 120);
      const message = sanitizeMultilineInput(req.body?.message, 1200);
      const pageUrl = sanitizePlainTextInput(req.body?.pageUrl || req.get("referer") || "/contact", 220);
      const website = sanitizePlainTextInput(req.body?.website, 160);
      const requestIp = getRequestIp(req);

      if (website) {
        logSecurityEvent("contact_honeypot_triggered", { ip: requestIp, path: req.originalUrl });
        return res.json({ success: true });
      }

      if (!name || !email || !phone || !message) {
        return res.status(400).json({ error: "Please complete the required contact fields." });
      }

      if (name.length < 2 || name.length > 80) {
        return res.status(400).json({ error: "Please enter a valid name." });
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: "Please enter a valid email address." });
      }

      const normalizedPhone = phone.replace(/[^0-9]/g, "");
      if (normalizedPhone.length < 7 || normalizedPhone.length > 18) {
        return res.status(400).json({ error: "Please enter a valid WhatsApp or phone number." });
      }

      if (company.length > 120) {
        return res.status(400).json({ error: "Company name is too long." });
      }

      if (message.length < 10 || message.length > 1200) {
        return res.status(400).json({ error: "Please keep your message between 10 and 1200 characters." });
      }

      const recipient = await resolveContactLeadRecipient();
      if (!recipient) {
        console.warn("[Contact] Admin WhatsApp recipient is not configured for contact-5bff87735818@example.invalid");
        return res.status(503).json({ error: "Contact notifications are temporarily unavailable. Please try again shortly." });
      }

      const submittedAt = new Date().toISOString();
      const outboundMessage = [
        "New BlackArrow contact form lead",
        "",
        `Name: ${name}`,
        `Email: ${email}`,
        `WhatsApp: ${phone}`,
        `Business: ${company || "-"}`,
        `Page: ${pageUrl}`,
        "Message:",
        message,
        `Time: ${submittedAt}`,
      ].join("\n");

      await sendWhatsAppFromSystem(recipient.whatsappNumber, outboundMessage);

      console.log(`[Contact] Lead notification sent via system bot to admin ${recipient.email}`);
      res.json({ success: true });
    } catch (error: any) {
      console.error("[Contact] Failed to send contact lead notification", {
        message: error?.message || "unknown_error",
        path: req.originalUrl,
        ip: getRequestIp(req),
      });
      res.status(500).json({
        error: "We could not send your message right now. Please try again shortly or email contact-086473cbd844@example.invalid.",
      });
    }
  });

  app.post("/api/auth/verify-otp-generic", authRouteLimiter, express.json(), async (req, res) => {
      try {
          const { phone, otp } = req.body;
          let cleanPhone = phone ? String(phone).replace(/[^0-9]/g, "") : "";
          if (cleanPhone.startsWith("0")) cleanPhone = "92" + cleanPhone.substring(1);
          
          const otpCheck = verifySecureOtp({ phone: cleanPhone, otp, expectedPurpose: "generic", consumeOnSuccess: true });
          if (!otpCheck.valid) {
              return res.status(400).json({ error: "Invalid or expired OTP" });
          }
          res.json({ success: true });
      } catch(e: any) {
          res.status(500).json({ error: e.message });
      }
  });

  app.post("/api/auth/verify-otp-reset", authRouteLimiter, express.json(), async (req, res) => {
      try {
          const { phone, otp, newPassword } = req.body;
          let cleanPhone = phone ? String(phone).replace(/[^0-9]/g, "") : "";
          if (cleanPhone.startsWith("0")) cleanPhone = "92" + cleanPhone.substring(1);
          
          const otpCheck = verifySecureOtp({ phone: cleanPhone, otp, expectedPurpose: "password_reset", consumeOnSuccess: true });
          if (!otpCheck.valid) {
              return res.status(400).json({ error: "Invalid or expired OTP" });
          }
          
          const users = await dbService.listUsers();
          const user = users.find((u: any) => u.whatsapp_number === cleanPhone);
          if (!user) return res.status(404).json({ error: "User not found" });
          
          await dbService.updateUser(user.$id, { password_hash: hashPassword(newPassword) });
          
          res.json({ success: true, message: "Password reset successful. You can now login." });
      } catch(e: any) {
          res.status(500).json({ error: e.message });
      }
  });

  app.post("/api/legal/acceptance", express.json(), async (req, res) => {
      try {
          const { userId, email, name, context, legalAcceptance } = req.body || {};
          const normalized = normalizeLegalAcceptance(legalAcceptance);
          if (normalized.acceptedDocuments.length === 0) {
              return res.status(400).json({ error: "No legal document acceptance was provided." });
          }

          logLegalAcceptance("legal_acceptance", {
              userId: userId || null,
              email: email ? String(email).toLowerCase() : null,
              name: name || null,
              context: context || normalized.source,
              legalAcceptance: normalized
          }, req);

          res.json({ success: true });
      } catch(e: any) {
          res.status(500).json({ error: e.message });
      }
  });

  app.post("/api/auth/verify-otp-register", authRouteLimiter, express.json(), async (req, res) => {
      try {
          const { email, password, name, phone, otp, legalAcceptance } = req.body;
          if (!hasRequiredLegalAcceptance(legalAcceptance)) {
              return res.status(400).json({ error: "Please accept the Terms of Service, Privacy Policy, and Disclaimer before creating an account." });
          }
          const cleanPhone = normalizeAccountPhone(phone);
          if (!cleanPhone || cleanPhone.length < 10) return res.status(400).json({ error: "Invalid phone number" });
          
          const otpCheck = verifySecureOtp({ phone: cleanPhone, otp, expectedPurpose: "signup", consumeOnSuccess: true });
          if (!otpCheck.valid) {
              return res.status(400).json({ error: "Invalid or expired OTP" });
          }
          
          const users = await dbService.listUsers();
          const existingAccount = findExistingAccountByPhone(users, cleanPhone);
          if (existingAccount) {
              return res.status(409).json({ error: buildDuplicatePhoneSignupMessage(existingAccount) });
          }
          
          let role = 'user';
          if (email.toLowerCase() === 'contact-b20fab63366b@example.invalid') role = 'super_admin';
          const userId = generateCryptoAuthId("usr");
          await dbService.createUser({ 
              id: userId, 
              email: email.toLowerCase(), 
              name, 
              password_hash: password,
              whatsapp_number: cleanPhone,
              role, 
              created_at: now() 
          });
          await sendTrialStartedNotification(userId);
          logLegalAcceptance("signup_register", {
              userId,
              email: email.toLowerCase(),
              name,
              phone: cleanPhone,
              context: "phone_otp_signup",
              legalAcceptance: normalizeLegalAcceptance(legalAcceptance)
          }, req);
          setAuthSession(res, { id: userId });
          res.json({ success: true, user: { id: userId, email: email.toLowerCase(), name, role, whatsapp_number: cleanPhone, created_at: now() } });
      } catch(e: any) {
          res.status(500).json({ error: e.message });
      }
  });

  app.post("/api/auth/verify-otp-login", authRouteLimiter, express.json(), async (req, res) => {
      try {
          const { phone, otp, totpOtp } = req.body;
          let cleanPhone = phone ? String(phone).replace(/[^0-9]/g, "") : "";
          if (cleanPhone.startsWith("0")) cleanPhone = "92" + cleanPhone.substring(1);
          
          const users = await dbService.listUsers();
          const user = users.find((u: any) => u.whatsapp_number === cleanPhone);
          if (!user) return res.status(404).json({ error: "No account found with this WhatsApp number" });

          const otpCheck = verifySecureOtp({
            phone: cleanPhone,
            otp,
            expectedPurpose: "login",
            consumeOnSuccess: user.has_2fa_enabled !== 1,
          });
          if (!otpCheck.valid) {
              return res.status(400).json({ error: "Invalid or expired WhatsApp OTP" });
          }

          if (user.has_2fa_enabled === 1) {
              if (!totpOtp) {
                 return res.status(200).json({ requires2FA: true, userId: user.$id });
              }
              const decryptedSecret = decryptServerSecret(user.totp_secret);
              const isValidOtp = verifySync({ token: totpOtp, secret: decryptedSecret }).valid;
              if (!isValidOtp) return res.status(400).json({ error: "Invalid 2FA code" });
              deleteStoredOtp(cleanPhone);
          }

          setAuthSession(res, user);
          res.json({ success: true, user: buildSafeAuthUser(user) });
      } catch(e: any) {
          res.status(500).json({ error: e.message });
      }
  });

  app.post("/api/auth/register", authRouteLimiter, express.json(), async (req, res) => {
    try {
      // Public production signup must use phone OTP to prevent repeated trial/free-credit abuse.
      if (process.env.NODE_ENV === "production") {
        return res.status(403).json({ error: "Phone verification is required to create a BlackArrow account. Please use WhatsApp OTP signup." });
      }
      const { email, password, name, legalAcceptance } = req.body;
      if (!hasRequiredLegalAcceptance(legalAcceptance)) {
        return res.status(400).json({ error: "Please accept the Terms of Service, Privacy Policy, and Disclaimer before creating an account." });
      }
      let role = 'user';
      if (email.toLowerCase() === 'contact-b20fab63366b@example.invalid') role = 'super_admin';
      const userId = generateCryptoAuthId("usr");
      await dbService.createUser({ 
          id: userId, 
          email: email.toLowerCase(), 
          name, 
          password_hash: password, 
          role, 
          created_at: now() 
      });
      await sendTrialStartedNotification(userId);
      logLegalAcceptance("signup_register", {
          userId,
          email: email.toLowerCase(),
          name,
          context: "email_signup",
          legalAcceptance: normalizeLegalAcceptance(legalAcceptance)
      }, req);
      setAuthSession(res, { id: userId });
      res.json({ success: true, user: { id: userId, email: email.toLowerCase(), name, role, created_at: now(), whatsapp_number: '', base_currency: 'USD' } });
    } catch (e: any) {
       res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/auth/login", authRouteLimiter, express.json(), async (req, res) => {
    const { email, password, otp } = req.body;
    const user = await dbService.getUser(email.toLowerCase()) as any;
    
    let isValid = false;
    let usedTemporaryPassword = false;
    if (user) {
       // Check main password
       if (await verifyStoredPasswordWithMigration(user, password, "password_hash")) {
         isValid = true;
       }
       // Check temp password if not yet valid
       if (!isValid && user.temp_password && await verifyStoredPasswordWithMigration(user, password, "temp_password")) {
         if (normalizeTime(user.temp_password_expires) > now()) {
           isValid = true;
           usedTemporaryPassword = true;
           console.log(`[Login] User ${email} logged in using temporary password.`);
         } else {
           console.log(`[Login] User ${email} tried to login with EXPIRED temporary password.`);
         }
       }
    }

    if (isValid) {
      if (user.has_2fa_enabled === 1) {
        if (!otp) {
          return res.status(200).json({ requires2FA: true, userId: user.$id });
        }
        
        const decryptedSecret = decryptServerSecret(user.totp_secret);
        const isValidOtp = verifySync({ token: otp, secret: decryptedSecret }).valid;
        if (!isValidOtp) {
          return res.status(401).json({ error: "Invalid 2FA code" });
        }
      }

      if ((user.email === 'contact-b20fab63366b@example.invalid' || user.email === 'contact-f702aab6c91b@example.invalid' || user.email === 'contact-5bff87735818@example.invalid') && user.role !== 'super_admin') {
         await dbService.updateUser(user.$id, { role: 'super_admin' });
         user.role = 'super_admin';
      }
      setAuthSession(res, user, { temporary: usedTemporaryPassword });
      res.json({
        success: true,
        user: buildSafeAuthUser(user)
      });
    } else {
      res.status(401).json({ error: "Invalid email or password" });
    }
  });

  app.post("/api/auth/change-password", express.json(), async (req, res) => {
    try {
      const { newPassword } = req.body;
      if (!newPassword) return res.status(400).json({ error: "Missing fields" });
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);
      await dbService.updateUser(userId, { password_hash: hashPassword(newPassword) });
      res.json({ success: true, message: "Password updated successfully" });

    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/auth/update-profile", express.json(), async (req, res) => {
    try {
      const { name, whatsapp_number, base_currency } = req.body;
      const sessionUser = await requireSessionAccount(req, res);
      if (!sessionUser) return;
      const userId = getStableUserId(sessionUser);

      const updateData: any = {};
      if (name) updateData.name = name;
      if (base_currency) updateData.base_currency = base_currency;
      if (whatsapp_number) {
          let cleanPhone = whatsapp_number.replace(/[^0-9]/g, "");
          if (cleanPhone.startsWith("0")) cleanPhone = "92" + cleanPhone.substring(1);
          if (cleanPhone.length < 10) return res.status(400).json({ error: "Invalid WhatsApp number" });
          updateData.whatsapp_number = cleanPhone;
      }

      await dbService.updateUser(userId, updateData);
      
      const user = await dbService.getUser(userId) as any;
      res.json({ 
          success: true, 
          message: "Profile updated successfully",
          user: {
              id: user.$id,
              email: user.email,
              name: user.name,
              role: user.role,
              whatsapp_number: user.whatsapp_number,
              base_currency: user.base_currency || 'USD',
              created_at: user.created_at,
              two_factor_enabled: user.has_2fa_enabled === 1
          }
      });

    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/auth/setup-2fa", express.json(), async (req, res) => {
    try {
      const sessionUser = await requireSessionAccount(req, res);
      if (!sessionUser) return;
      const userId = getStableUserId(sessionUser);
      
      const secret = generateSecret();
      const user = await dbService.getUser(userId) as any;
      const otpauth = generateURI({ issuer: 'Black Arrow', label: user.email, secret });
      const encryptedSecret = encryptServerSecret(secret);
      
      await dbService.updateUser(userId, { totp_secret: encryptedSecret });
      
      const qrCodeUrl = await QRCode.toDataURL(otpauth);
      
      res.json({ success: true, secret, qrCodeUrl });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/auth/verify-2fa", express.json(), async (req, res) => {
    try {
      const { otp, enable } = req.body;
      const sessionUser = await requireSessionAccount(req, res);
      if (!sessionUser) return;
      const userId = getStableUserId(sessionUser);
      
      const user = await dbService.getUser(userId) as any;
      if (!user || !user.totp_secret) return res.status(400).json({ error: "2FA not set up" });
      
      const decryptedSecret = decryptServerSecret(user.totp_secret);
      const isValid = verifySync({ token: otp, secret: decryptedSecret }).valid;
      
      if (isValid) {
        await dbService.updateUser(userId, { has_2fa_enabled: enable ? 1 : 0 });
        res.json({ success: true });
      } else {
        res.status(400).json({ error: "Invalid OTP code" });
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
  
  app.get("/api/auth/2fa-status", async (req, res) => {
    try {
      const sessionUser = await requireSessionAccount(req, res);
      if (!sessionUser) return;
      const userId = getStableUserId(sessionUser);
      const user = await dbService.getUser(userId) as any;
      res.json({ enabled: user?.has_2fa_enabled === 1 });
    } catch(e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- Admin WhatsApp Alerts ---
  app.get("/api/admin-alerts/settings", async (req, res) => {
    try {
      const sessionUser = await requireSessionAccount(req, res);
      if (!sessionUser) return;
      const userId = getStableUserId(sessionUser);
      const user = await dbService.getUser(userId) as any;
      const extraConfig = await dbService.getUserExtraConfig(userId).catch(() => ({})) || {};
      const extraAlerts = extraConfig?.admin_alerts_config || null;
      const proactiveAlerts = await getProactiveAlertPreferences(userId).catch(() => null);
      const proactiveLeadAlerts = getProactiveLeadSettings(userId);

      const canonicalAdminPhone = getCanonicalAdminPhone(user, extraConfig);
      const pairing = getAdminPairingStatus(user, extraConfig);
      const isAlertsEnabled = typeof extraAlerts?.isAlertsEnabled === "boolean" ? extraAlerts.isAlertsEnabled : true;
      const isBusinessAssistantEnabled = isCanonicalBusinessAssistantEnabled(user, extraConfig);
      const alertTypes = extraAlerts?.alertTypes || {
        lowBalance: true,
        instanceDisconnected: true,
        humanEscalation: true,
        failedOrders: false,
      };

      res.json({
        success: true,
        config: {
          adminPhone: canonicalAdminPhone,
          isAlertsEnabled,
          isBusinessAssistantEnabled,
          isVerified: pairing.isVerified,
          alertTypes,
          proactiveAlerts,
          proactiveLeadAlerts,
        }
      });
    } catch(e: any) {
      res.status(500).json({ error: e.message || "Failed to load admin alert settings" });
    }
  });

  app.post("/api/admin-alerts/settings", express.json(), async (req, res) => {
    try {
      const sessionUser = await requireSessionAccount(req, res);
      if (!sessionUser) return;
      const userId = getStableUserId(sessionUser);
      const user = await dbService.getUser(userId) as any;
      const { adminPhone, isAlertsEnabled, isBusinessAssistantEnabled, alertTypes, proactiveAlerts, proactiveLeadAlerts } = req.body || {};

      const extraConfig = await dbService.getUserExtraConfig(userId).catch(() => ({})) || {};
      const currentCanonical = getCanonicalAdminPhone(user, extraConfig);

      let targetAdminPhone = currentCanonical;
      let isPhoneChanging = false;

      if (typeof adminPhone === "string" && adminPhone.trim()) {
        let cleanPhone = adminPhone.replace(/[^0-9+]/g, "").trim();
        if (cleanPhone.startsWith("0")) cleanPhone = "92" + cleanPhone.substring(1);
        const normalized = normalizeAdminWhatsAppIdentity(cleanPhone).phone;
        if (normalized) {
          targetAdminPhone = normalized;
          if (targetAdminPhone !== currentCanonical) {
            isPhoneChanging = true;
          }
        }
      }

      const currentAssistantEnabled = isCanonicalBusinessAssistantEnabled(user, extraConfig);
      const assistantEnabled = typeof isBusinessAssistantEnabled === "boolean"
        ? isBusinessAssistantEnabled
        : currentAssistantEnabled;

      const alertConfig = {
        adminPhone: targetAdminPhone,
        isAlertsEnabled: typeof isAlertsEnabled === "boolean" ? isAlertsEnabled : true,
        isBusinessAssistantEnabled: assistantEnabled,
        alertTypes: alertTypes || {
          lowBalance: true,
          instanceDisconnected: true,
          humanEscalation: true,
          failedOrders: false,
        },
        proactiveAlerts,
      };

      const extraPatch: Record<string, any> = {
        admin_alerts_config: alertConfig,
        admin_number: targetAdminPhone,
        adminPhone: targetAdminPhone,
        business_assistant_enabled: assistantEnabled,
        businessAssistantEnabled: assistantEnabled,
        isBusinessAssistantEnabled: assistantEnabled,
        system_alerts_enabled: assistantEnabled,
      };

      if (isPhoneChanging) {
        extraPatch.admin_number_verified = false;
        extraPatch.admin_verified_phone = "";
        extraPatch.admin_verified_at = null;
        extraPatch.admin_pairing_challenge = null;
        await revokeAdminPairing(userId);
      }

      // 1. Persist extra config (DO NOT touch user.whatsapp_number)
      await dbService.saveUserExtraConfigPatch(userId, extraPatch).catch(() => {});

      // 2. Update user document
      await dbService.updateUser(userId, {
        admin_number: targetAdminPhone,
        business_assistant_enabled: assistantEnabled,
        ...(isPhoneChanging ? { admin_number_verified: false, admin_verified_phone: "" } : {}),
      }).catch(() => {});

      // 3. Persist proactive preferences if provided
      if (proactiveAlerts) {
        await saveProactiveAlertPreferences(userId, {
          ...proactiveAlerts,
          isProactiveAlertsEnabled: assistantEnabled ? (proactiveAlerts.isProactiveAlertsEnabled ?? false) : false,
        }).catch(() => {});
      } else if (!assistantEnabled) {
        await saveProactiveAlertPreferences(userId, { isProactiveAlertsEnabled: false }).catch(() => {});
      }

      if (proactiveLeadAlerts) {
        saveProactiveLeadSettings(userId, proactiveLeadAlerts);
      }

      // 4. Propagate adminNumber and isBusinessAssistantEnabled to user's bots
      const userBots = await dbService.getBotsByUser(userId).catch(() => []);
      for (const b of userBots) {
        const botId = b.$id || b.id;
        try {
          const currentConfig = await dbService.loadBotConfig(botId).catch(() => null) || {};
          await dbService.saveBotConfig(botId, {
            ...currentConfig,
            adminNumber: targetAdminPhone,
            admin_number: targetAdminPhone,
            isBusinessAssistantEnabled: assistantEnabled,
            business_assistant_enabled: assistantEnabled,
            ...(isPhoneChanging ? { admin_number_verified: false, admin_verified_phone: "" } : {}),
          }).catch(() => {});
        } catch {}
      }

      res.json({
        success: true,
        config: {
          ...alertConfig,
          isVerified: isPhoneChanging ? false : getAdminPairingStatus(user, { ...extraConfig, ...extraPatch }).isVerified,
        }
      });
    } catch(e: any) {
      res.status(500).json({ error: e.message || "Failed to save admin alert settings" });
    }
  });

  app.post("/api/admin-alerts/test", express.json(), async (req, res) => {
    try {
      const sessionUser = await requireSessionAccount(req, res);
      if (!sessionUser) return;
      const userId = getStableUserId(sessionUser);
      const { phone } = req.body || {};

      let cleanPhone = String(phone || "").replace(/[^0-9+]/g, "").trim();
      if (cleanPhone.startsWith("0")) cleanPhone = "92" + cleanPhone.substring(1);
      if (cleanPhone.length < 9) {
        return res.status(400).json({ error: "Please provide a valid WhatsApp phone number with country code." });
      }

      // Check if user has an active worker
      const userBots = await dbService.getBotsByUser(userId).catch(() => []);
      let activeWorker = null;
      let activeBotId = null;
      for (const b of userBots) {
        const bId = b.$id || b.id;
        if (activeWorkers.has(bId)) {
          activeWorker = activeWorkers.get(bId)!;
          activeBotId = bId;
          break;
        }
      }

      if (activeWorker && activeBotId) {
        try {
          const testMsg = `ðŸ”” *BlackArrow Admin Alert Test*\n\nThis is a test notification confirming that your admin WhatsApp number is properly configured and reachable.\n\nTime: ${new Date().toUTCString()}\nAccount: ${sessionUser.email || userId}`;
          const workerRes = await fetch(`http://127.0.0.1:${activeWorker.port}/api/send-message`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...buildWorkerInternalHeaders() },
            body: JSON.stringify({
              to: cleanPhone.includes("@") ? cleanPhone : `${cleanPhone.replace("+", "")}@s.whatsapp.net`,
              text: testMsg,
            }),
            signal: AbortSignal.timeout(6000),
          }).catch(() => null);

          if (workerRes && workerRes.ok) {
            return res.json({ success: true, message: `Test alert sent successfully to ${cleanPhone} via active WhatsApp engine.` });
          }
        } catch {}
      }

      res.json({
        success: true,
        message: `Admin WhatsApp phone number (${cleanPhone}) is validated. Live alerts will be sent here when events occur.`,
      });
    } catch(e: any) {
      res.status(500).json({ error: e.message || "Failed to dispatch test alert" });
    }
  });

  app.get("/api/admin/accounting", async (req, res) => {
    try {
      const requester = await requireAdminUser(req, res);
      if (!requester) return;
      const { from, to } = req.query;
      let fromTime = 0;
      let toTime = now();
      if (from) fromTime = parseDateOnlyUtcStart(from);
      if (to) toTime = parseDateOnlyUtcExclusiveEnd(to);
      
      const report = await buildAdminAccountingReport(fromTime, toTime);

      res.json({
        ...report,
        currency: "USD",
        excludesAdminAccounts: true,
        excludesSignupCredit: true,
        topups: report.summary.walletTopupRevenue,
        subscriptions: report.summary.subscriptionRevenue,
        usage: report.usageByCategory.map((item: any) => ({
          type: item.category,
          amount: item.amount,
          cost: item.cost,
        }))
      });
    } catch(e: any) { res.status(500).json({error: e.message}); }
  });

  app.get("/api/admin/system-proxies", async (req, res) => {
    try {
      const requester = await requireAdminUser(req, res);
      if (!requester) return;
      const proxies = await dbService.getSystemProxies();
      res.json({ proxies });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/admin/system-proxies/check-all", async (req, res) => {
    try {
      const requester = await requireAdminUser(req, res);
      if (!requester) return;
      const proxies = await dbService.getSystemProxies();
      res.json({ success: true, message: "Checking started in background. Please refresh periodically." });
      checkSystemProxyList(dbService, proxies)
        .then((result) => console.log(`[Manager] Manual proxy check complete. total=${result.total}, ok=${result.ok}, failed=${result.failed}`))
        .catch((error) => console.error("[Manager] Manual proxy check failed:", error));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/admin/sync-webshare", express.json(), async (req, res) => {
    try {
      const requester = await requireAdminUser(req, res);
      if (!requester) return;
      const { token } = req.body;
      if (!token) return res.status(400).json({ error: "Missing token" });
      
      const response = await fetch("https://proxy.webshare.io/api/v2/proxy/list/?mode=direct&page=1&page_size=250", {
        headers: { "Authorization": `Token ${token}` }
      });
      
      if (!response.ok) {
        throw new Error(`Webshare API error: ${response.statusText}`);
      }
      
      const data: any = await response.json();
      let added = 0;
      let removed = 0;
      
      if (data && data.results && data.results.length > 0) {
        const existingProxies = await dbService.getSystemProxies() as any[];
        const existingUrls = new Set(existingProxies.map(p => p.url));
        const newUrls = new Set(data.results.map((p: any) => `http://${p.username}:${p.password}@${p.proxy_address}:${p.port}`));
        
        const webshareUsernameBase = data.results[0].username.split('-')[0];
        for (const proxy of existingProxies) {
            if (proxy.url.includes(webshareUsernameBase) && !newUrls.has(proxy.url)) {
                await dbService.deleteSystemProxy(proxy.$id || proxy.id);
                removed++;
            }
        }
        
        for (const p of data.results) {
          const url = `http://${p.username}:${p.password}@${p.proxy_address}:${p.port}`;
          if (!existingUrls.has(url)) {
            await dbService.addSystemProxy(url);
            added++;
          }
        }
        
        try {
           await dbService.setGlobalSetting("webshare_api_token", token);
        } catch(e) {}
      }
      
      res.json({ success: true, added, removed });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/admin/webshare-token", async (req, res) => {
    try {
        const requester = await requireAdminUser(req, res);
        if (!requester) return;
        const token = await dbService.getGlobalSetting("webshare_api_token");
        res.json({ token: token || "" });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/admin/system-proxies", express.json(), async (req, res) => {
    try {
      const requester = await requireAdminUser(req, res);
      if (!requester) return;
      const { url } = req.body;
      if (!url) return res.status(400).json({ error: "Missing URL" });
      const proxyValidation = validateOutboundProxyUrl(url);
      if (!proxyValidation.ok) {
        logSecurityEvent("blocked_proxy_test_request", {
          route: "/api/admin/system-proxies",
          requesterId: getStableUserId(requester),
          proxy: maskProxyUrl(url),
          reason: proxyValidation.message,
        });
        return res.status(400).json({ error: proxyValidation.message });
      }
      await dbService.addSystemProxy(proxyValidation.normalized);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/admin/system-proxies/:id/toggle", async (req, res) => {
    try {
      const requester = await requireAdminUser(req, res);
      if (!requester) return;
      const proxyId = req.params.id;
      const proxies = await dbService.getSystemProxies();
      const proxy = proxies.find((p: any) => p.$id === proxyId || p.id === proxyId);
      if (proxy) {
        await dbService.toggleSystemProxy(proxyId, !proxy.is_active);
      }
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/admin/system-proxies/:id", async (req, res) => {
    try {
      const requester = await requireAdminUser(req, res);
      if (!requester) return;
      await dbService.deleteSystemProxy(req.params.id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/admin/logs/list", async (req, res) => {
    try {
      const requester = await requireAdminUser(req, res);
      if (!requester) return;
      const logDir = path.join(process.cwd(), 'backups', 'admin_logs');
      if (!fs.existsSync(logDir)) return res.json({ files: [] });
      
      const files = fs.readdirSync(logDir)
        .filter(f => f.endsWith('.log'))
        .map(f => ({
          name: f,
          date: f.replace('.log', ''),
          size: fs.statSync(path.join(logDir, f)).size
        }))
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 10);
        
      res.json({ files });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/admin/logs/download/:date", async (req, res) => {
    try {
      const requester = await requireAdminUser(req, res);
      if (!requester) return;
      const { date } = req.params;
      const filePath = path.join(process.cwd(), 'backups', 'admin_logs', `${date}.log`);
      if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Log not found" });
      
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename=admin-action-log-${date}.txt`);
      res.sendFile(filePath);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
  app.post("/api/admin/chatbot-prompt", express.json(), async (req, res) => {
    const requester = await requireAdminUser(req, res);
    if (!requester) return;
    res.status(410).json({ error: "Helper chat prompt configuration has been removed." });
  });

  app.get("/api/admin/chatbot-prompt", async (req, res) => {
      const requester = await requireAdminUser(req, res);
      if (!requester) return;
      res.status(410).json({ error: "Helper chat prompt configuration has been removed." });
  });

  app.post("/api/admin/set-system-bot", express.json(), async (req, res) => {
    try {
        const requester = await requireAdminUser(req, res, { superAdminOnly: true });
        if (!requester) return;
        const { botId } = req.body;
        await dbService.setGlobalSetting("system_bot_id", botId || "");
        res.json({ success: true });
    } catch(e: any) { res.status(500).json({ error: e.message }); }
  });
  
  app.post("/api/admin/system-alert", express.json(), async (req, res) => {
     try {
         const requester = await requireAdminUser(req, res);
         if (!requester) return;
         const { message } = req.body;
         if (message) {
             const users = await dbService.listUsers();
             const admin = users.find((u: any) => u.role === 'super_admin' || u.email === 'contact-b20fab63366b@example.invalid');
             if (admin) {
                const config = await dbService.loadUserConfig(admin.$id);
                const isProxyAlert = message.includes("Proxy") || message.includes("proxy") || message.includes("proxies");
                const isBillingAlert = message.includes("Billing") || message.includes("billing") || message.includes("Credit");
                if (config.system_alerts_enabled === false) return res.json({ success: true, filtered: true });
                if (isProxyAlert && config.proxy_alerts_enabled === false) return res.json({ success: true, filtered: true });
                if (isBillingAlert && config.billing_alerts_enabled === false) return res.json({ success: true, filtered: true });
             }
             sendSystemAlert(message);
         }
         res.json({ success: true });
     } catch(e) { res.status(500).json({ error: e?.message }); }
  });

  app.get("/api/bots/marketing-stats", async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);

      const bots = await dbService.getBotsByUser(userId);
      let activeCampaigns = 0;
      const campaignMap = new Map<string, any>();
      const nowMs = Date.now();

      for (const bot of bots) {
        if (!bot.jid) continue;
        let ownerCandidates = [bot.jid];
        try {
          const config = bot.config_settings ? JSON.parse(bot.config_settings) : {};
          const configuredCampaigns = parseFollowupList(config.followups_json).map((f: any, index: number) => {
            const campaignType = normalizeFollowupCampaignType(f?.campaign_type);
            return {
              id: String(f.id || `campaign_${index + 1}`),
              name: String(f.name || f.label || (campaignType === "ai_smart_followup" ? "AI Smart Follow-up" : `Follow-up ${index + 1}`)).trim(),
              audience: normalizeMarketingAudience(f.audience),
              isActive: isFollowupActive(f?.is_active),
              campaignType,
              costPerMessage: getFollowupCampaignCost(campaignType),
              defaultBotId: String(f.defaultBotId || f.default_bot_id || bot.$id || bot.id || "").trim(),
              sendFromMode: normalizeCampaignSendFromMode(f.sendFromMode || f.send_from_mode),
            };
          });

          activeCampaigns += configuredCampaigns.filter((campaign: any) => campaign.isActive).length;

          for (const campaign of configuredCampaigns) {
            const key = `${bot.$id || bot.id}:${campaign.id}`;
            if (campaignMap.has(key)) continue;
            campaignMap.set(key, {
              key,
              botId: bot.$id || bot.id,
              botName: bot.name || bot.$id,
              followupId: campaign.id,
              name: campaign.name,
              audience: campaign.audience,
              audienceLabel: getMarketingAudienceLabel(campaign.audience),
              campaignType: campaign.campaignType,
              costPerMessage: campaign.costPerMessage,
              defaultBotId: campaign.defaultBotId || (bot.$id || bot.id),
              sendFromMode: campaign.sendFromMode || "default_only",
              isActive: campaign.isActive,
              sent: 0,
              failed: 0,
              skipped: 0,
              orders: 0,
              totalCost: 0,
              lastSentAt: 0,
              sentKeys: new Set<string>(),
              orderKeys: new Set<string>(),
              reportKeys: new Set<string>(),
              logs: [],
            });
          }

          const owner = await dbService.getUser(bot.user_id);
          ownerCandidates = collectAccountDataOwnerCandidates(owner || bot.user_id, [bot]);
        } catch {}

        for (const ownerKey of ownerCandidates) {
          const customers = await databases.listDocuments(DATABASE_ID, COLLECTIONS.CUSTOMERS, [
            AppwriteQuery.equal('bot_id', ownerKey),
            AppwriteQuery.limit(5000)
          ]).catch(() => ({ documents: [] } as any));

          for (const customer of customers.documents as any[]) {
            collectSuccessfulFollowupStats({
              customer,
              botId: bot.$id || bot.id,
              getCampaign: (campaignKey) => campaignMap.get(campaignKey),
              hasCustomerOrder,
              countSent: false,
            });
          }
        }
      }
      
      const reportLogs = readMarketingReport()
        .filter((log: any) => !log.userId || log.userId === userId)
        .sort((a: any, b: any) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
      for (const log of reportLogs) {
        const campaignKey = `${log.botId || ""}:${log.followupId || ""}`;
        const campaign = campaignMap.get(campaignKey);
        if (campaign && log.status !== "scan" && log.status !== "sending") {
          const reportKey = `${log.status}:${log.followupId || ""}:${log.customerJid || log.sourceCustomerId || log.phone || ""}:${log.attemptKey || log.billingDedupeKey || log.sentMessageId || log.timestamp || ""}`;
          if (campaign.reportKeys.has(reportKey)) continue;
          campaign.reportKeys.add(reportKey);
          campaign.sent += log.status === "sent" ? 1 : 0;
          campaign.failed += log.status === "failed" ? 1 : 0;
          campaign.skipped += log.status === "skipped" ? 1 : 0;
          if (log.status === "sent") {
            campaign.totalCost += Number(log.costCharged || 0);
            campaign.lastSentAt = Math.max(Number(campaign.lastSentAt || 0), Number(log.timestamp || 0));
          }
          campaign.logs.push(log);
        }
      }
      const latestScan = reportLogs.find((log: any) => log.status === "scan");
      const deliveryLogs = reportLogs
        .filter((log: any) => log.status !== "scan" && log.status !== "sending")
        .map((log: any) => ({
          customer: log.phone || log.contact || log.customerJid || log.sourceCustomerId,
          phone: log.phone || "",
          jid: log.customerJid || log.sourceCustomerId || "",
          bot: log.botName || log.botId || "",
          campaignName: log.campaignName || "",
          followupId: log.followupId || "",
          campaignType: normalizeFollowupCampaignType(log.campaignType),
          count: log.status === "sent" ? 1 : 0,
          status: log.status,
          costCharged: Number(log.costCharged || 0),
          reason: log.reason || "",
          sentMessageId: log.sentMessageId || "",
          actualBotId: log.actualBotId || log.botId || "",
          actualBotJid: log.actualBotJid || "",
          defaultBotId: log.defaultBotId || "",
          sendFromMode: log.sendFromMode || "default_only",
          fallbackReason: log.fallbackReason || "",
          timestamp: log.timestamp || Date.now()
        }));
      const totalSent = deliveryLogs.filter((log: any) => log.status === "sent").length;
      const totalFailed = deliveryLogs.filter((log: any) => log.status === "failed").length;
      const totalSkipped = deliveryLogs.filter((log: any) => log.status === "skipped").length;
      const walletSpent = deliveryLogs.reduce((sum: number, log: any) => sum + Number(log.costCharged || 0), 0);
      const isBotActive = bots.some((bot: any) => isFollowupActive(bot.is_active));
      const schedulerEnabled = isFollowupSchedulerEnabled();
      const schedulerStatus = !schedulerEnabled
        ? "Disabled: FOLLOWUP_SCHEDULER_ENABLED=false"
        : !isBotActive
        ? "Inactive: all bots are paused"
        : activeCampaigns === 0
          ? "Inactive: no active campaigns selected"
          : followupSchedulerState.started
            ? "Active: scanning selected campaigns every 15 minutes"
            : "Inactive: follow-up scheduler has not started";
      
      res.json({ 
          stats: { 
              total_sent: totalSent, 
              failed: totalFailed,
              skipped: totalSkipped,
              wallet_spent: walletSpent,
              active_campaigns: activeCampaigns,
              status: schedulerStatus,
               scheduler_enabled: schedulerEnabled,
               next_scan: schedulerEnabled ? (followupSchedulerState.nextScanAt ? new Date(followupSchedulerState.nextScanAt).toLocaleTimeString() : new Date(nowMs + FOLLOWUP_SCAN_INTERVAL_MS).toLocaleTimeString()) : "Disabled",
              last_scan_found: Number(latestScan?.foundCount || 0),
              last_scan_sent: Number(latestScan?.sentCount || 0),
              last_scan_failed: Number(latestScan?.failedCount || 0),
              last_scan_skipped: Number(latestScan?.skippedCount || 0),
              last_scan_reason: String(latestScan?.reason || followupSchedulerState.lastReason || "").trim(),
              report_download_url: `/api/bots/marketing-report/download?userId=${encodeURIComponent(userId)}`
          },
          logs: deliveryLogs.sort((a,b) => b.timestamp - a.timestamp).slice(0, 100),
          campaigns: Array.from(campaignMap.values()).map((campaign: any) => {
            const { sentKeys, orderKeys, reportKeys, ...publicCampaign } = campaign;
            return {
              ...publicCampaign,
              orderRatio: campaign.sent > 0 ? Math.round((campaign.orders / campaign.sent) * 1000) / 10 : 0,
              logs: campaign.logs.sort((a: any, b: any) => Number(b.timestamp || 0) - Number(a.timestamp || 0)).slice(0, 20),
            };
          })
      });
    } catch(e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/bots/marketing-report/download", async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);
      const { date } = req.query;
      const dateKey = String(date || new Date().toISOString().slice(0, 10)).replace(/[^0-9-]/g, "").slice(0, 10);
      const rows = readMarketingReport(dateKey).filter((log: any) => !log.userId || log.userId === userId);
      const csv = [
        "timestamp,status,bot,phone,customer_jid,source_customer,followup_id,campaign_name,campaign_type,audience,sent_message_id,cost_charged,reason,found,sent,failed,skipped,window",
        ...rows.map((log: any) => [
          new Date(log.timestamp || Date.now()).toISOString(),
          log.status || "",
          log.botName || log.botId || "",
          log.phone || log.contact || "",
          log.customerJid || "",
          log.sourceCustomerId || "",
          log.followupId || "",
          log.campaignName || "",
          log.campaignType || "",
          log.audience || "",
          log.sentMessageId || "",
          log.costCharged ?? "",
          String(log.reason || "").replace(/"/g, "'"),
          log.foundCount ?? "",
          log.sentCount ?? "",
          log.failedCount ?? "",
          log.skippedCount ?? "",
          log.windowFromHours ? `${log.windowFromHours}-${log.windowToHours}` : ""
        ].map(value => `"${String(value).replace(/"/g, '""')}"`).join(","))
      ].join("\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="marketing-report-${dateKey}.csv"`);
      res.send(csv);
    } catch(e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/admin/system-bot", async (req, res) => {
      try {
          const requester = await requireAdminUser(req, res);
          if (!requester) return;
          const sysId = await dbService.getGlobalSetting("system_bot_id");
          res.json({ botId: sysId });
      } catch(e: any) { res.status(500).json({ error: e.message }); }
  });

  async function resolveUser(userIdOrEmail: string) {
    if (!userIdOrEmail) return null;
    const user = await dbService.getUser(userIdOrEmail);
    return user ? (user.id || user.$id) : null;
  }

  // --- Bot Management ---
  app.get("/api/bots/list", async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);
      const bots = await dbService.getBotsByUser(userId);
      const mappedBots = await Promise.all(bots.map(async (b: any) => {
        const botId = b.$id || b.id;
        try {
          const fullConfig = await dbService.loadBotConfig(botId);
          const instancePurpose = fullConfig?.instancePurpose || "business";
          const controlBusinessInstanceId = fullConfig?.controlBusinessInstanceId || undefined;
          return {
            ...b,
            id: botId,
            instancePurpose,
            controlBusinessInstanceId,
            config_settings: fullConfig ? JSON.stringify(fullConfig) : b.config_settings,
          };
        } catch {
          return { ...b, id: botId, instancePurpose: "business" };
        }
      }));
      res.json(mappedBots);
    } catch(e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/bots/reset-login", express.json(), async (req, res) => {
    try {
      const { botId } = req.body;
      if (!botId) return res.status(400).json({ error: "Missing fields" });
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);
      const isOwner = await requireOwnedBot(req, res, userId, botId);
      if (!isOwner) return;
      const oldJid = isOwner?.jid || "";

      console.log(`[Manager] Resetting login for bot ${botId}${oldJid ? ` (${oldJid})` : ""}...`);

      if (activeWorkers.has(botId)) {
          const worker = activeWorkers.get(botId)!;
          botWorkerLifecycle.markIntentionalStop(botId, "reset login");
          // Notify worker to cleanup peacefully to prevent zombies
          try { await fetch(`http://127.0.0.1:${worker.port}/api/shutdown`, { method: "POST", headers: buildWorkerInternalHeaders() }).catch(()=>{}) } catch(e){}
          // Hard kill backup
          worker.process.kill('SIGKILL');
          activeWorkers.delete(botId);
          // Wait a bit for OS to clean up
          await new Promise(r => setTimeout(r, 800));
      }
      
      try {
          const fsPromises = fs.promises;
          const AUTH_FOLDER = path.join(process.cwd(), `auth_info_baileys_${botId}`);
          console.log(`[Manager] Deleting auth folder: ${AUTH_FOLDER}`);
          await fsPromises.rm(AUTH_FOLDER, { recursive: true, force: true }).catch((err: any) => console.error("Error deleting auth folder:", err.message));
          
          // Also try deleting variants
          const ALT_AUTH_FOLDER = path.join(process.cwd(), `auth_info_baileys_bot_${botId}`);
          await fsPromises.rm(ALT_AUTH_FOLDER, { recursive: true, force: true }).catch(()=>{});
      } catch(e: any){
          console.error("[Manager] Cleanup error:", e.message);
      }

      if (oldJid) {
        const clearResult = await dbService.clearBotJid(botId, userId);
        if (!clearResult.success) {
          console.warn(`[Manager] Reset login could not clear bot ${botId} JID ${oldJid}: ${clearResult.reason}`);
        } else {
          console.log(`[Manager] Reset login cleared active session for ${oldJid} from bot ${botId}; permanent number ownership was preserved.`);
        }
      }
      
      const userIdForBoot = await getUserIdByBot(botId);
      if (userIdForBoot) {
        console.log(`[Manager] Respawning bot ${botId} after reset.`);
        botWorkerLifecycle.clearIntentionalStop(botId);
        await spawnWorker(botId, userIdForBoot, "manual_activate");
      }
      res.json({ success: true });
    } catch(e: any) {
      console.error("[Manager] Reset Login Error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/bots/delete", express.json(), async (req, res) => {
    try {
      const { botId } = req.body;
      if (!botId) return res.status(400).json({ error: "Missing fields" });
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);
      const bot = await requireOwnedBot(req, res, userId, botId);
      if (!bot) return;
      if (bot?.jid) {
        const reason = "This instance still has an active WhatsApp number. Reset login/remove the current number first, or ask a super admin to delink it from Admin Panel.";
        console.warn(`[Bot Delete] Blocked delete for bot ${botId}, user ${userId}: active jid ${bot.jid}.`);
        return res.status(403).json({ error: reason });
      }

      const success = await dbService.deleteBot(botId, userId);
      if (success) {
         handleSendingInstanceDeleted(botId).catch((err) => {
           console.error(`[Campaign] Failed to handle bot deletion for ${botId}:`, err?.message || err);
         });
         handleWorkspaceInstanceDeleted(botId).catch((err) => {
           console.error(`[Workspace] Failed to handle bot deletion for ${botId}:`, err?.message || err);
         });
         if (activeWorkers.has(botId)) {
            const worker = activeWorkers.get(botId)!;
            botWorkerLifecycle.markIntentionalStop(botId, "bot delete");
            try { await fetch(`http://127.0.0.1:${worker.port}/api/shutdown`, { method: "POST", headers: buildWorkerInternalHeaders() }).catch(()=>{}) } catch(e){}
            worker.process.kill('SIGKILL');
            activeWorkers.delete(botId);
            await new Promise(r => setTimeout(r, 500));
         }
         try {
            const fsPromises = fs.promises;
            const AUTH_FOLDER = path.join(process.cwd(), `auth_info_baileys_${botId}`);
            const ALT_AUTH_FOLDER = path.join(process.cwd(), `auth_info_baileys_bot_${botId}`);
            await fsPromises.rm(AUTH_FOLDER, { recursive: true, force: true }).catch(() => {});
            await fsPromises.rm(ALT_AUTH_FOLDER, { recursive: true, force: true }).catch(() => {});
         } catch (err) {}
      } else {
        console.warn(`[Bot Delete] Delete failed for bot ${botId}, user ${userId}: bot not found, user mismatch, or database delete rejected.`);
      }
      res.json({ success });
    } catch (e: any) {
      console.error("[Bot Delete] Delete failed:", e?.message || e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/bots/rename", express.json(), async (req, res) => {
    try {
      const { botId, name } = req.body;
      if (!botId || !name) return res.status(400).json({ error: "Missing fields" });
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);
      const bot = await requireOwnedBot(req, res, userId, botId);
      if (!bot) return;
      await dbService.updateBotName(botId, name);
      res.json({ success: true });
    } catch(e: any) {
      console.error("Rename bot error:", e);
      res.status(500).json({ error: e.message || "Internal Server Error" });
    }
  });

  app.post("/api/bots/update-config", async (req, res) => {
    try {
      // Explicit 2MB payload contract enforcement
      const rawPayload = JSON.stringify(req.body || {});
      const payloadBytes = Buffer.byteLength(rawPayload, "utf8");
      if (payloadBytes > 2 * 1024 * 1024) {
        return res.status(413).json({
          success: false,
          persisted: false,
          error: "Payload Too Large: Configuration and training payload exceeds the 2MB limit.",
        });
      }

      const { botId, config } = req.body;
      if (!botId || !config) return res.status(400).json({ error: "Missing fields" });
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);
      const bot = await requireOwnedBot(req, res, userId, botId);
      if (!bot) return;

      // First load existing config
      const existingConfig = await dbService.loadBotConfig(botId);
      const previousMode = resolveBotAiChatReplyMode(existingConfig || {});
      const normalizedConfig = { ...config };
      if (typeof normalizedConfig.ai_chat_replies_enabled === "boolean") {
        normalizedConfig.autoReply = normalizedConfig.ai_chat_replies_enabled;
      } else if (typeof normalizedConfig.autoReply === "boolean") {
        normalizedConfig.ai_chat_replies_enabled = normalizedConfig.autoReply;
      }
      const nextMode = resolveBotAiChatReplyMode({ ...(existingConfig || {}), ...normalizedConfig });
      if (previousMode.enabled !== nextMode.enabled) {
        if (nextMode.enabled) normalizedConfig.ai_chat_replies_enabled_at = Date.now();
        else normalizedConfig.ai_chat_replies_disabled_at = Date.now();
      }
      const mergedRaw = { ...(existingConfig || {}), ...normalizedConfig };
      if (Object.prototype.hasOwnProperty.call(config, "prompt")) mergedRaw.prompt_raw = config.prompt;
      if (Object.prototype.hasOwnProperty.call(config, "learned_instructions")) mergedRaw.learned_instructions_raw = config.learned_instructions;
      const compaction = compactSavedAiTrainingConfig(mergedRaw);
      const merged = compaction.config;
      const allowed = await validateInstanceConfigLimits(userId, botId, merged, res);
      if (!allowed) return;
      
      try {
        await dbService.saveBotConfig(botId, merged);
      } catch (dbError: any) {
        console.error(`[Bot Config Persistence Error] Failed saving bot ${botId}:`, dbError?.message || dbError);
        return res.status(500).json({
          success: false,
          persisted: false,
          error: "Failed to persist configuration to database. Please check your connection and try again.",
        });
      }
      
      let appliedToWorker = true;
      let workerWarning: string | undefined = undefined;

      // Also update running worker if exists
      if (activeWorkers.has(botId)) {
          const worker = activeWorkers.get(botId)!;
          try {
             const workerRes = await fetch(`http://127.0.0.1:${worker.port}/api/update-config`, {
                 method: 'POST',
                 headers: { 'Content-Type': 'application/json', ...buildWorkerInternalHeaders() },
                 body: JSON.stringify(merged),
                 signal: AbortSignal.timeout(5000),
             });
             if (!workerRes.ok) {
               appliedToWorker = false;
               workerWarning = "Configuration saved to database, but the active instance could not reload it immediately. Settings will take effect on next restart.";
             }
          } catch(e) {
             appliedToWorker = false;
             workerWarning = "Configuration saved to database, but the active instance could not reload it immediately. Settings will take effect on next restart.";
          }
      }

      const authoritativeConfig = await dbService.loadBotConfig(botId).catch(() => merged);
      res.json({
        success: true,
        persisted: true,
        appliedToWorker,
        config: authoritativeConfig || merged,
        instructionOptimized: compaction.compacted,
        warning: compaction.warning || workerWarning,
      });
    } catch(e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  const handleContentLibraryGroupReset = async (req: express.Request, res: express.Response) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);
      const { botId, groupJid: rawGroupJid, purpose: rawPurpose } = req.body || {};
      const groupId = req.params?.groupId || req.body?.groupId;

      if (!botId) {
        return res.status(400).json({ error: "Missing botId" });
      }

      const bot = await requireOwnedBot(req, res, userId, botId);
      if (!bot) return;

      const botConfig = (await dbService.loadBotConfig(botId).catch(() => ({}))) || {};
      const userConfig = (await dbService.loadUserConfig(userId).catch(() => ({}))) || {};

      const candidateGroups = [
        ...(Array.isArray(botConfig.groups) ? botConfig.groups : []),
        ...(Array.isArray(userConfig.groups) ? userConfig.groups : []),
      ];

      const matchedGroup = candidateGroups.find((g: any) =>
        (groupId && (g.id === groupId || g.jid === groupId)) ||
        (rawGroupJid && g.jid === rawGroupJid) ||
        (rawPurpose === "welcome" && g.purpose === "welcome")
      );

      const targetJid = matchedGroup?.jid || rawGroupJid;
      if (!targetJid || !targetJid.endsWith("@g.us")) {
        return res.status(400).json({ error: "Unable to resolve a valid WhatsApp group JID for reset." });
      }

      const purpose = matchedGroup?.purpose || rawPurpose || "media";
      if (!["media", "sequence", "welcome"].includes(purpose)) {
        return res.status(400).json({ error: "Invalid group purpose for template reset." });
      }

      const resetAt = Date.now();
      let workerApplied = false;

      if (activeWorkers.has(botId)) {
        const worker = activeWorkers.get(botId)!;
        try {
          const workerRes = await fetch(`http://127.0.0.1:${worker.port}/api/templates/group-reset`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...buildWorkerInternalHeaders(),
            },
            body: JSON.stringify({
              groupJid: targetJid,
              purpose,
              source: "dashboard",
            }),
          });
          if (workerRes.ok) {
            workerApplied = true;
          }
        } catch (workerErr) {
          console.warn(`[Reset] Worker call failed for bot ${botId}:`, workerErr);
        }
      }

      // If worker didn't apply or wasn't running, persist directly to DB
      if (!workerApplied) {
        const { recordGroupResetTimestamp, applyGroupResetToStore, serializeTemplateStoreWithMeta } = await import("./src/content-library/content-library-reset-service.ts");
        const existingResetMap = botConfig.groupResetAt || {};
        botConfig.groupResetAt = recordGroupResetTimestamp(existingResetMap, targetJid, resetAt);
        await dbService.saveBotConfig(botId, botConfig).catch(() => {});

        // Load DB template store, clear target group, and re-save
        const rawStore = await dbService.loadTemplateStore(botId).catch(() => null);
        let storeObj: Record<string, any> = {};
        if (rawStore) {
          try {
            storeObj = JSON.parse(rawStore);
          } catch {}
        }
        applyGroupResetToStore(storeObj, targetJid);
        const payload = serializeTemplateStoreWithMeta(storeObj, botConfig.groupResetAt);
        await dbService.saveTemplateStore(botId, JSON.stringify(payload)).catch(() => {});
      }

      res.json({
        success: true,
        groupJid: targetJid,
        purpose,
        count: 0,
        resetAt,
        workerApplied,
      });
    } catch (e: any) {
      console.error("[Reset] Error resetting content library group:", e);
      res.status(500).json({ error: e?.message || "Failed to reset group templates." });
    }
  };

  app.post("/api/user/content-library/groups/reset", express.json(), handleContentLibraryGroupReset);
  app.post("/api/user/content-library/groups/:groupId/reset", express.json(), handleContentLibraryGroupReset);

  app.post("/api/bots/update-provider-config", express.json(), async (req, res) => {
    try {
      const { botId } = req.body;
      if (!botId) return res.status(400).json({ error: "Missing fields" });
      
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);
      const bot = await requireOwnedBot(req, res, userId, botId);
      if (!bot) return;

      const providerInput = req.body.config || req.body;

      const success = await dbService.saveBotProviderConfig(botId, providerInput, {
        encryptSecret: encryptServerSecret
      });

      if (!success) {
        return res.status(500).json({ error: "Failed to save provider config" });
      }

      const config = await dbService.getBotProviderConfig(botId);
      res.json({
        success: true,
        providerType: config.providerType,
        providerStatus: config.providerStatus,
        phoneNumberId: config.phoneNumberId,
        businessAccountId: config.businessAccountId,
        templateSyncStatus: config.templateSyncStatus,
        officialApiCapabilities: config.officialApiCapabilities
      });
    } catch (e: any) {
      console.error("[Server] update-provider-config error:", e?.message || e);
      res.status(500).json({ error: "Failed to save provider config due to internal error" });
    }
  });

  app.get("/api/bots/:botId/auto-followup-schedules", async (req, res) => {
    try {
      const { botId } = req.params;
      if (!botId) return res.status(400).json({ error: "Missing botId" });
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);
      const bot = await requireOwnedBot(req, res, userId, botId);
      if (!bot) return;

      const { listActiveAutoFollowupSchedulesAsync } = await import("./src/services/intelligent-auto-followup-service.ts");
      const schedules = await listActiveAutoFollowupSchedulesAsync(botId);
      res.json({
        success: true,
        schedules: schedules.map(s => ({
          id: s.id,
          customerJid: s.customerJid,
          customerPhone: s.customerJid ? s.customerJid.split("@")[0] : "",
          currentObjective: s.currentObjective,
          followupState: s.followupState,
          attemptIndex: s.attemptIndex,
          scheduledAt: s.createdAt,
          nextFollowupAt: s.nextFollowupAt,
          lastFollowupAt: s.lastFollowupAt,
        })),
        total: schedules.length,
        activeCount: schedules.filter(s => s.followupState === "SCHEDULED").length,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to fetch auto followup schedules" });
    }
  });

  app.get("/api/bots/:botId/auto-followup-logs", async (req, res) => {
    try {
      const { botId } = req.params;
      if (!botId) return res.status(400).json({ error: "Missing botId" });
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);
      const bot = await requireOwnedBot(req, res, userId, botId);
      if (!bot) return;

      const { listAutoFollowupLogs } = await import("./src/services/intelligent-auto-followup-service.ts");
      const logs = await listAutoFollowupLogs(botId);
      res.json({
        success: true,
        logs: logs.map(l => ({
          id: l.id,
          customerPhone: l.customerJid ? l.customerJid.split("@")[0] : "",
          timestamp: l.timestamp,
          status: l.state === "SENT" ? "sent" : l.state === "FAILED" ? "failed" : l.state === "COMPLETED" || l.state === "STOPPED" ? "skipped" : "pending",
          reason: l.reason,
          campaignName: "Intelligent Auto Follow-up",
          campaignType: "ai_smart_followup",
        })),
        total: logs.length,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to fetch auto followup logs" });
    }
  });

  app.post("/api/bots/toggle", express.json(), async (req, res) => {
    try {
      const { botId, isActive } = req.body;
      if (!botId) return res.status(400).json({ error: "Missing fields" });
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);
      const bot = await requireOwnedBot(req, res, userId, botId);
      if (!bot) return;
      const success = await dbService.toggleBot(botId, userId, isActive ? 1 : 0);
      if (success) {
         if (!isActive && activeWorkers.has(botId)) {
            const worker = activeWorkers.get(botId)!;
            botWorkerLifecycle.markIntentionalStop(botId, "manual toggle off");
            try { await fetch(`http://127.0.0.1:${worker.port}/api/shutdown`, { method: "POST", headers: buildWorkerInternalHeaders() }).catch(()=>{}) } catch(e){}
            worker.process.kill('SIGKILL');
            activeWorkers.delete(botId);
         } else if (isActive) {
            botWorkerLifecycle.clearIntentionalStop(botId);
            const userIdForBoot = await getUserIdByBot(botId);
            if (userIdForBoot && !activeWorkers.has(botId)) {
              await spawnWorker(botId, userIdForBoot, "manual_activate");
            }
         }
      }
      res.json({ success });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/helper-chat", express.json(), async (req, res) => {
    const user = await requireAuthenticatedUser(req, res);
    if (!user) return;
    res.status(410).json({ error: "Helper Chat has been removed from BlackArrow." });
  });

  app.post("/api/bots/create", express.json(), async (req, res) => {
    try {
      const { name, providerType, instancePurpose, controlBusinessInstanceId } = req.body;
      const sessionUser = await requireSessionAccount(req, res);
      if (!sessionUser) return;
      const sessionUserId = getStableUserId(sessionUser);
      console.log(`[Bot API] Create request for user: ${sessionUserId}, name: ${name}, providerType: ${providerType || "whatsapp_web"}, purpose: ${instancePurpose || "business"}`);
      const accessState = await requireAccountFeatureAccess(sessionUserId, res);
      if (!accessState) return;
      const user = accessState.user;
      const userId = user.$id;

      const subscriptions = await dbService.getSubscriptions(userId);
      const limits = buildAccountLimits(user, subscriptions);
      const plan = limits.plan;
      const planId = limits.planId;
      const instanceLimit = limits.instanceLimit;
      const existingBots = await dbService.getBotsByUser(userId);

      console.log(`[Bot API] User ${userId} has ${existingBots.length} bots. Limit: ${instanceLimit} (Plan: ${planId})`);

      if (existingBots.length >= instanceLimit) {
        if (existingBots.length >= instanceLimit || existingBots.length >= plan.max_instances) {
            return res.status(400).json({ error: `Instance limit reached (${instanceLimit}). Choose a paid plan or matching Creem add-on to continue.` });
        }
      }

      const normalizedPurpose = normalizeInstancePurpose(instancePurpose);
      if (normalizedPurpose === "personal") {
        if (!isPersonalAssistantFeatureEnabled()) {
          return res.status(403).json({ error: "Personal Assistant feature is currently disabled.", code: "feature_not_enabled" });
        }
        if (!controlBusinessInstanceId || typeof controlBusinessInstanceId !== "string" || !controlBusinessInstanceId.trim()) {
          return res.status(400).json({ error: "A controlling Business WhatsApp instance is required when creating a Personal Assistant instance." });
        }
        const linkValidation = await validateControlBusinessLink({
          personalUserId: userId,
          controlBotId: controlBusinessInstanceId.trim(),
          getBotById: (id) => dbService.getBotById(id),
        });
        if (!linkValidation.valid) {
          return res.status(400).json({ error: linkValidation.reason || "Invalid controlling business instance" });
        }
      }

      const botId = await dbService.createBot(
        userId,
        name,
        {
          providerType: providerType === "whatsapp_cloud_api" ? "whatsapp_cloud_api" : "whatsapp_web",
          instancePurpose: normalizedPurpose,
          controlBusinessInstanceId: normalizedPurpose === "personal" ? controlBusinessInstanceId.trim() : undefined,
        }
      );
      console.log(`[Bot API] Created bot ${botId} for user ${userId} (provider: ${providerType || "whatsapp_web"}, purpose: ${normalizedPurpose})`);
      res.json({ botId, instancePurpose: normalizedPurpose, controlBusinessInstanceId: normalizedPurpose === "personal" ? controlBusinessInstanceId.trim() : undefined });
    } catch(e: any) {
      console.error("Create bot error:", e);
      res.status(500).json({ error: e.message || "Internal Server Error" });
    }
  });

  app.post("/api/bots/update-control-link", express.json(), async (req, res) => {
    try {
      if (!isPersonalAssistantFeatureEnabled()) {
        return res.status(403).json({ error: "Personal Assistant feature is currently disabled.", code: "feature_not_enabled" });
      }
      const { botId, controlBusinessInstanceId } = req.body;
      if (!botId || !controlBusinessInstanceId) {
        return res.status(400).json({ error: "Missing botId or controlBusinessInstanceId" });
      }
      const sessionUser = await requireSessionAccount(req, res);
      if (!sessionUser) return;
      const sessionUserId = getStableUserId(sessionUser);
      const bot = await requireOwnedBot(req, res, sessionUserId, botId);
      if (!bot) return;

      const linkValidation = await validateControlBusinessLink({
        personalBotId: botId,
        personalUserId: sessionUserId,
        controlBotId: controlBusinessInstanceId.trim(),
        getBotById: (id) => dbService.getBotById(id),
      });
      if (!linkValidation.valid) {
        return res.status(400).json({ error: linkValidation.reason || "Invalid controlling business instance" });
      }

      const currentConfig = await dbService.loadBotConfig(botId).catch(() => ({})) || {};
      const updatedConfig = {
        ...currentConfig,
        instancePurpose: "personal",
        controlBusinessInstanceId: controlBusinessInstanceId.trim(),
      };
      await dbService.saveBotConfig(botId, updatedConfig);
      res.json({ success: true, botId, controlBusinessInstanceId: controlBusinessInstanceId.trim() });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to update control link" });
    }
  });

  // ------------------------------------------------------------------
  // Owner360 / Personal Profile Endpoints (Prompt 2)
  // ------------------------------------------------------------------
  app.get("/api/owner-profile", async (req, res) => {
    try {
      if (!isPersonalAssistantFeatureEnabled()) {
        return res.status(403).json({ error: "Personal Assistant feature is currently disabled.", code: "PERSONAL_ASSISTANT_DISABLED" });
      }
      const sessionUser = await requireSessionAccount(req, res);
      if (!sessionUser) return;
      const accountId = getStableUserId(sessionUser);

      const profile = await getOwnerProfile(accountId);

      // Suggestions from existing authenticated identity without silently mutating or broadening privacy
      const suggestions: { preferredName?: string; email?: string } = {};
      if (!profile.identity?.preferredName && sessionUser.name) {
        suggestions.preferredName = sessionUser.name;
      }
      if (profile.contactMethods.length === 0 && sessionUser.email) {
        suggestions.email = sessionUser.email;
      }

      res.json({ success: true, profile, suggestions });
    } catch (e: any) {
      if (e instanceof Owner360Error) {
        return res.status(e.status).json({ error: e.message, code: e.code, details: e.details });
      }
      res.status(500).json({ error: e?.message || "Failed to retrieve owner profile" });
    }
  });

  app.put("/api/owner-profile", express.json(), async (req, res) => {
    try {
      if (!isPersonalAssistantFeatureEnabled()) {
        return res.status(403).json({ error: "Personal Assistant feature is currently disabled.", code: "PERSONAL_ASSISTANT_DISABLED" });
      }
      const sessionUser = await requireSessionAccount(req, res);
      if (!sessionUser) return;
      const accountId = getStableUserId(sessionUser);

      const { profile, expectedRevision } = req.body || {};
      if (!profile || typeof profile !== "object") {
        return res.status(400).json({ error: "Profile payload is required", code: "INVALID_OWNER_PROFILE" });
      }

      const updated = await updateOwnerProfile(accountId, profile, expectedRevision);
      res.json({ success: true, profile: updated });
    } catch (e: any) {
      if (e instanceof Owner360Error) {
        return res.status(e.status).json({ error: e.message, code: e.code, details: e.details });
      }
      res.status(500).json({ error: e?.message || "Failed to update owner profile" });
    }
  });

  app.post("/api/owner-profile/clear", express.json(), async (req, res) => {
    try {
      if (!isPersonalAssistantFeatureEnabled()) {
        return res.status(403).json({ error: "Personal Assistant feature is currently disabled.", code: "PERSONAL_ASSISTANT_DISABLED" });
      }
      const sessionUser = await requireSessionAccount(req, res);
      if (!sessionUser) return;
      const accountId = getStableUserId(sessionUser);

      const { confirmClear, expectedRevision } = req.body || {};
      if (!confirmClear) {
        return res.status(400).json({ error: "Explicit confirmation is required to clear Owner Profile", code: "CONFIRMATION_REQUIRED" });
      }

      const cleared = await clearOwnerProfile(accountId, expectedRevision);
      res.json({ success: true, profile: cleared });
    } catch (e: any) {
      if (e instanceof Owner360Error) {
        return res.status(e.status).json({ error: e.message, code: e.code, details: e.details });
      }
      res.status(500).json({ error: e?.message || "Failed to clear owner profile" });
    }
  });

  // ------------------------------------------------------------------
  // Personal Assistant: Personal Contacts & Memory Endpoints (Prompt 3)
  // ------------------------------------------------------------------
  app.get("/api/personal-assistant/contacts", async (req, res) => {
    try {
      if (!isPersonalAssistantFeatureEnabled()) {
        return res.status(403).json({ error: "Personal Assistant feature is currently disabled.", code: "PERSONAL_ASSISTANT_DISABLED" });
      }
      const sessionUser = await requireSessionAccount(req, res);
      if (!sessionUser) return;
      const accountId = getStableUserId(sessionUser);

      const status = req.query.status as "active" | "archived" | undefined;
      const search = req.query.search as string | undefined;

      const contacts = await personalContactService.listPersonalContacts(accountId, { status, search });
      res.json({ success: true, contacts });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to list personal contacts" });
    }
  });

  app.get("/api/personal-assistant/contacts/:contactId", async (req, res) => {
    try {
      if (!isPersonalAssistantFeatureEnabled()) {
        return res.status(403).json({ error: "Personal Assistant feature is currently disabled.", code: "PERSONAL_ASSISTANT_DISABLED" });
      }
      const sessionUser = await requireSessionAccount(req, res);
      if (!sessionUser) return;
      const accountId = getStableUserId(sessionUser);

      const contact = await personalContactService.getPersonalContact(accountId, req.params.contactId);
      if (!contact) {
        return res.status(404).json({ error: "Contact not found", code: "NOT_FOUND" });
      }
      const context = await personalContactService.getPersonalContactContext(accountId, req.params.contactId);
      res.json({ success: true, contact, context });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to get personal contact" });
    }
  });

  app.post("/api/personal-assistant/contacts/:contactId/relationship", express.json(), async (req, res) => {
    try {
      if (!isPersonalAssistantFeatureEnabled()) {
        return res.status(403).json({ error: "Personal Assistant feature is currently disabled.", code: "PERSONAL_ASSISTANT_DISABLED" });
      }
      const sessionUser = await requireSessionAccount(req, res);
      if (!sessionUser) return;
      const accountId = getStableUserId(sessionUser);

      const { relationship, customLabel } = req.body || {};
      if (!relationship) {
        return res.status(400).json({ error: "Relationship is required", code: "INVALID_INPUT" });
      }
      const updated = await personalContactService.setContactRelationship(
        accountId,
        req.params.contactId,
        relationship,
        customLabel,
        "owner_provided"
      );
      res.json({ success: true, contact: updated });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to update relationship" });
    }
  });

  app.post("/api/personal-assistant/contacts/:contactId/facts", express.json(), async (req, res) => {
    try {
      if (!isPersonalAssistantFeatureEnabled()) {
        return res.status(403).json({ error: "Personal Assistant feature is currently disabled.", code: "PERSONAL_ASSISTANT_DISABLED" });
      }
      const sessionUser = await requireSessionAccount(req, res);
      if (!sessionUser) return;
      const accountId = getStableUserId(sessionUser);

      const { label, value, category, validUntil } = req.body || {};
      if (!label || !value) {
        return res.status(400).json({ error: "Label and value are required", code: "INVALID_INPUT" });
      }
      const updated = await personalContactService.addPersonalContactFact(accountId, req.params.contactId, {
        label,
        value,
        category: category || "custom",
        source: "owner_dashboard",
        validUntil,
      });
      res.json({ success: true, contact: updated });
    } catch (e: any) {
      res.status(400).json({ error: e?.message || "Failed to add fact" });
    }
  });

  app.delete("/api/personal-assistant/contacts/:contactId/facts/:factId", async (req, res) => {
    try {
      if (!isPersonalAssistantFeatureEnabled()) {
        return res.status(403).json({ error: "Personal Assistant feature is currently disabled.", code: "PERSONAL_ASSISTANT_DISABLED" });
      }
      const sessionUser = await requireSessionAccount(req, res);
      if (!sessionUser) return;
      const accountId = getStableUserId(sessionUser);

      const updated = await personalContactService.removePersonalContactFact(
        accountId,
        req.params.contactId,
        req.params.factId
      );
      res.json({ success: true, contact: updated });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to remove fact" });
    }
  });

  app.post("/api/personal-assistant/contacts/:contactId/notes", express.json(), async (req, res) => {
    try {
      if (!isPersonalAssistantFeatureEnabled()) {
        return res.status(403).json({ error: "Personal Assistant feature is currently disabled.", code: "PERSONAL_ASSISTANT_DISABLED" });
      }
      const sessionUser = await requireSessionAccount(req, res);
      if (!sessionUser) return;
      const accountId = getStableUserId(sessionUser);

      const { text } = req.body || {};
      if (!text || !String(text).trim()) {
        return res.status(400).json({ error: "Note text is required", code: "INVALID_INPUT" });
      }
      const updated = await personalContactService.addPersonalContactNote(
        accountId,
        req.params.contactId,
        text,
        "owner_dashboard"
      );
      res.json({ success: true, contact: updated });
    } catch (e: any) {
      res.status(400).json({ error: e?.message || "Failed to add note" });
    }
  });

  app.delete("/api/personal-assistant/contacts/:contactId/notes/:noteId", async (req, res) => {
    try {
      if (!isPersonalAssistantFeatureEnabled()) {
        return res.status(403).json({ error: "Personal Assistant feature is currently disabled.", code: "PERSONAL_ASSISTANT_DISABLED" });
      }
      const sessionUser = await requireSessionAccount(req, res);
      if (!sessionUser) return;
      const accountId = getStableUserId(sessionUser);

      const updated = await personalContactService.removePersonalContactNote(
        accountId,
        req.params.contactId,
        req.params.noteId
      );
      res.json({ success: true, contact: updated });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to remove note" });
    }
  });

  app.post("/api/personal-assistant/contacts/:contactId/communication-status", express.json(), async (req, res) => {
    try {
      if (!isPersonalAssistantFeatureEnabled()) {
        return res.status(403).json({ error: "Personal Assistant feature is currently disabled.", code: "PERSONAL_ASSISTANT_DISABLED" });
      }
      const sessionUser = await requireSessionAccount(req, res);
      if (!sessionUser) return;
      const accountId = getStableUserId(sessionUser);

      const { status } = req.body || {};
      if (!status) {
        return res.status(400).json({ error: "Status is required", code: "INVALID_INPUT" });
      }
      const updated = await personalContactService.setContactCommunicationStatus(
        accountId,
        req.params.contactId,
        status
      );
      res.json({ success: true, contact: updated });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to update communication status" });
    }
  });

  app.post("/api/personal-assistant/contacts/:contactId/archive", async (req, res) => {
    try {
      if (!isPersonalAssistantFeatureEnabled()) {
        return res.status(403).json({ error: "Personal Assistant feature is currently disabled.", code: "PERSONAL_ASSISTANT_DISABLED" });
      }
      const sessionUser = await requireSessionAccount(req, res);
      if (!sessionUser) return;
      const accountId = getStableUserId(sessionUser);

      const updated = await personalContactService.archivePersonalContact(accountId, req.params.contactId);
      res.json({ success: true, contact: updated });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to archive contact" });
    }
  });

  app.post("/api/personal-assistant/contacts/:contactId/clear-memory", express.json(), async (req, res) => {
    try {
      if (!isPersonalAssistantFeatureEnabled()) {
        return res.status(403).json({ error: "Personal Assistant feature is currently disabled.", code: "PERSONAL_ASSISTANT_DISABLED" });
      }
      const sessionUser = await requireSessionAccount(req, res);
      if (!sessionUser) return;
      const accountId = getStableUserId(sessionUser);

      const { confirmClear } = req.body || {};
      if (!confirmClear) {
        return res.status(400).json({ error: "Explicit confirmation is required to clear contact memory", code: "CONFIRMATION_REQUIRED" });
      }

      const updated = await personalContactService.clearPersonalContactMemory(accountId, req.params.contactId);
      res.json({ success: true, contact: updated });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to clear contact memory" });
    }
  });

  // ------------------------------------------------------------------
  // Incoming Personal Assistant Settings & Controls (Prompt 4)
  // ------------------------------------------------------------------
  app.get("/api/personal-assistant/instances/:instanceId/incoming-settings", async (req, res) => {
    try {
      if (!isPersonalAssistantFeatureEnabled()) {
        return res.status(403).json({ error: "Personal Assistant feature is currently disabled.", code: "PERSONAL_ASSISTANT_DISABLED" });
      }
      const sessionUser = await requireSessionAccount(req, res);
      if (!sessionUser) return;
      const accountId = getStableUserId(sessionUser);

      const settings = await getIncomingPersonalAssistantSettings(accountId, req.params.instanceId);
      res.json({ success: true, settings });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to get incoming assistant settings" });
    }
  });

  app.post("/api/personal-assistant/instances/:instanceId/incoming-settings", express.json(), async (req, res) => {
    try {
      if (!isPersonalAssistantFeatureEnabled()) {
        return res.status(403).json({ error: "Personal Assistant feature is currently disabled.", code: "PERSONAL_ASSISTANT_DISABLED" });
      }
      const sessionUser = await requireSessionAccount(req, res);
      if (!sessionUser) return;
      const accountId = getStableUserId(sessionUser);

      const updated = await saveIncomingPersonalAssistantSettings(accountId, req.params.instanceId, req.body || {});
      res.json({ success: true, settings: updated });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to update incoming assistant settings" });
    }
  });

  app.post("/api/personal-assistant/contacts/:contactId/pause", async (req, res) => {
    try {
      if (!isPersonalAssistantFeatureEnabled()) {
        return res.status(403).json({ error: "Personal Assistant feature is currently disabled.", code: "PERSONAL_ASSISTANT_DISABLED" });
      }
      const sessionUser = await requireSessionAccount(req, res);
      if (!sessionUser) return;
      const accountId = getStableUserId(sessionUser);

      const updated = await personalContactService.setContactCommunicationStatus(accountId, req.params.contactId, "paused_by_owner");
      res.json({ success: true, contact: updated });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to pause assistant for contact" });
    }
  });

  app.post("/api/personal-assistant/contacts/:contactId/resume", async (req, res) => {
    try {
      if (!isPersonalAssistantFeatureEnabled()) {
        return res.status(403).json({ error: "Personal Assistant feature is currently disabled.", code: "PERSONAL_ASSISTANT_DISABLED" });
      }
      const sessionUser = await requireSessionAccount(req, res);
      if (!sessionUser) return;
      const accountId = getStableUserId(sessionUser);

      clearManualTakeover(accountId, "default_personal", req.params.contactId);
      const updated = await personalContactService.setContactCommunicationStatus(accountId, req.params.contactId, "active");
      res.json({ success: true, contact: updated });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to resume assistant for contact" });
    }
  });

  app.get("/api/personal-assistant/instances/:instanceId/escalations", async (req, res) => {
    try {
      if (!isPersonalAssistantFeatureEnabled()) {
        return res.status(403).json({ error: "Personal Assistant feature is currently disabled.", code: "PERSONAL_ASSISTANT_DISABLED" });
      }
      const sessionUser = await requireSessionAccount(req, res);
      if (!sessionUser) return;
      const accountId = getStableUserId(sessionUser);

      const escalations = listPendingPersonalEscalations(accountId);
      res.json({ success: true, escalations });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to list escalations" });
    }
  });

  // ------------------------------------------------------------------
  // Outbound Personal Agent Missions (Prompt 5)
  // ------------------------------------------------------------------
  app.get("/api/personal-assistant/missions", async (req, res) => {
    try {
      if (!isPersonalAssistantFeatureEnabled()) {
        return res.status(403).json({ error: "Personal Assistant feature is currently disabled.", code: "PERSONAL_ASSISTANT_DISABLED" });
      }
      const sessionUser = await requireSessionAccount(req, res);
      if (!sessionUser) return;
      const accountId = getStableUserId(sessionUser);

      const status = req.query.status as any;
      const personalInstanceId = req.query.personalInstanceId as string | undefined;
      const missions = await listPersonalOutboundMissions(accountId, { status, personalInstanceId });
      res.json({ success: true, missions });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to list outbound missions" });
    }
  });

  app.get("/api/personal-assistant/missions/:missionId", async (req, res) => {
    try {
      if (!isPersonalAssistantFeatureEnabled()) {
        return res.status(403).json({ error: "Personal Assistant feature is currently disabled.", code: "PERSONAL_ASSISTANT_DISABLED" });
      }
      const sessionUser = await requireSessionAccount(req, res);
      if (!sessionUser) return;
      const accountId = getStableUserId(sessionUser);

      const mission = await getPersonalOutboundMission(accountId, req.params.missionId);
      if (!mission) {
        return res.status(404).json({ error: "Mission not found", code: "MISSION_NOT_FOUND" });
      }
      res.json({ success: true, mission });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to get outbound mission" });
    }
  });

  app.post("/api/personal-assistant/missions", express.json(), async (req, res) => {
    try {
      if (!isPersonalAssistantFeatureEnabled()) {
        return res.status(403).json({ error: "Personal Assistant feature is currently disabled.", code: "PERSONAL_ASSISTANT_DISABLED" });
      }
      const sessionUser = await requireSessionAccount(req, res);
      if (!sessionUser) return;
      const accountId = getStableUserId(sessionUser);

      const { target, goal, instructions, constraints, personalInstanceId, isSendOnly } = req.body || {};
      if (!target || !goal) {
        return res.status(400).json({ error: "target and goal are required parameters." });
      }

      // 1. Resolve Personal Instance
      const instanceRes = await resolvePersonalInstanceForMission(accountId, personalInstanceId);
      if (instanceRes.error === "multiple_personal_instances") {
        return res.status(400).json({ error: "Multiple personal instances exist. Please specify personalInstanceId.", ambiguousInstances: instanceRes.ambiguousInstances });
      }
      if (instanceRes.error || !instanceRes.personalInstanceId) {
        return res.status(400).json({ error: instanceRes.error || "No eligible personal instance found." });
      }

      const pId = instanceRes.personalInstanceId;

      // 2. Resolve Target
      const targetRes = await resolveTargetForMission(accountId, pId, target);
      if (targetRes.ambiguousChoices && targetRes.ambiguousChoices.length > 0) {
        return res.status(400).json({ error: "Target is ambiguous", ambiguousChoices: targetRes.ambiguousChoices });
      }
      if (targetRes.error || !targetRes.targetIdentity) {
        return res.status(400).json({ error: targetRes.error || "Target could not be resolved." });
      }

      const targetContactId = targetRes.contact?.contactId || `pc_new_${Date.now()}`;
      const missionId = `pom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const now = Date.now();

      const newMission: PersonalOutboundMission = {
        missionId,
        accountId,
        personalInstanceId: pId,
        controlBusinessInstanceId: "dashboard_direct",
        targetContactId,
        targetIdentity: targetRes.targetIdentity,
        goal,
        ownerInstructions: instructions || goal,
        constraints: Array.isArray(constraints) ? constraints : [],
        createdByOwner: true,
        createdAt: now,
        updatedAt: now,
        lastActivityAt: now,
        stepCount: 0,
        status: "ACTIVE",
        isSendOnly: Boolean(isSendOnly),
      };

      // 3. Generate initial message
      const firstMsg = await generateFirstOutboundMissionMessage({
        mission: newMission,
        contact: targetRes.contact,
        ownerName: sessionUser.name || "Owner",
      });

      newMission.isSendOnly = firstMsg.isSendOnly;

      // 4. Send initial message
      const sendResult = await sendPersonalOutboundMissionMessage({
        mission: newMission,
        messageText: firstMsg.messageText,
        stepIndex: 0,
        now,
      });

      if (!sendResult.success) {
        return res.status(500).json({ error: `Failed to send initial message: ${sendResult.reason}`, code: "INITIAL_SEND_FAILED" });
      }

      res.status(201).json({ success: true, mission: sendResult.mission, initialMessage: firstMsg.messageText });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to start outbound mission" });
    }
  });

  app.post("/api/personal-assistant/missions/:missionId/cancel", async (req, res) => {
    try {
      if (!isPersonalAssistantFeatureEnabled()) {
        return res.status(403).json({ error: "Personal Assistant feature is currently disabled.", code: "PERSONAL_ASSISTANT_DISABLED" });
      }
      const sessionUser = await requireSessionAccount(req, res);
      if (!sessionUser) return;
      const accountId = getStableUserId(sessionUser);

      const mission = await getPersonalOutboundMission(accountId, req.params.missionId);
      if (!mission) {
        return res.status(404).json({ error: "Mission not found", code: "MISSION_NOT_FOUND" });
      }

      const updated = await updateMissionStatus(accountId, mission.missionId, "CANCELLED", {
        statusReason: "cancelled_via_api",
      });

      res.json({ success: true, mission: updated });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to cancel outbound mission" });
    }
  });

  // ------------------------------------------------------------------
  // Personal Tasks / Action Engine Endpoints (Prompt 6)
  // ------------------------------------------------------------------
  app.get("/api/personal-assistant/tasks", async (req, res) => {
    try {
      if (!isPersonalAssistantFeatureEnabled()) {
        return res.status(403).json({ error: "Personal Assistant feature is currently disabled.", code: "PERSONAL_ASSISTANT_DISABLED" });
      }
      const sessionUser = await requireSessionAccount(req, res);
      if (!sessionUser) return;
      const accountId = getStableUserId(sessionUser);

      const state = req.query.state as any;
      const category = (req.query.category as string || "").toLowerCase().trim();
      const personalInstanceId = (req.query.personalInstanceId || req.query.instanceId) as string | undefined;
      const search = (req.query.search as string || "").toLowerCase().trim();
      const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));

      let allTasks = await listPersonalTasks(accountId, { state, personalInstanceId });

      if (category && category !== "all") {
        allTasks = allTasks.filter((t) => {
          const st = ((t as any).currentState || (t as any).status || "").toUpperCase();
          if (category === "active") {
            return ["READY", "ACTIVE", "WAITING_FOR_CONTACT", "WAITING_UNTIL", "IN_PROGRESS", "WAITING_FOR_REPLY", "SCHEDULED"].includes(st);
          }
          if (category === "waiting") {
            return ["WAITING_FOR_OWNER", "WAITING_FOR_REPLY", "WAITING_FOR_CONTACT", "WAITING_UNTIL"].includes(st);
          }
          if (category === "needs_approval") {
            return ["WAITING_FOR_APPROVAL", "NEEDS_APPROVAL"].includes(st);
          }
          if (category === "paused") {
            return ["PAUSED", "PAUSED_MANUAL_TAKEOVER", "PAUSED_OWNER"].includes(st);
          }
          if (category === "completed") {
            return st === "COMPLETED";
          }
          if (category === "failed") {
            return ["FAILED", "FAILED_FINAL", "FAILED_RETRYABLE"].includes(st);
          }
          if (category === "cancelled") {
            return st === "CANCELLED";
          }
          return true;
        });
      }

      if (search) {
        allTasks = allTasks.filter((t) => {
          const goalMatch = String((t as any).goal || "").toLowerCase().includes(search);
          const contactMatch = String((t as any).target?.displayName || (t as any).targetIdentity?.canonicalName || "").toLowerCase().includes(search);
          const taskIdMatch = String(t.taskId || "").toLowerCase().includes(search);
          return goalMatch || contactMatch || taskIdMatch;
        });
      }

      const total = allTasks.length;
      const paginated = allTasks.slice((page - 1) * limit, page * limit);

      res.json({ success: true, tasks: paginated, total, page, limit });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to list personal tasks" });
    }
  });

  app.get("/api/personal-assistant/tasks/:taskId", async (req, res) => {
    try {
      if (!isPersonalAssistantFeatureEnabled()) {
        return res.status(403).json({ error: "Personal Assistant feature is currently disabled.", code: "PERSONAL_ASSISTANT_DISABLED" });
      }
      const sessionUser = await requireSessionAccount(req, res);
      if (!sessionUser) return;
      const accountId = getStableUserId(sessionUser);

      const task = await getPersonalTask(accountId, req.params.taskId);
      if (!task) {
        return res.status(404).json({ error: "Task not found", code: "TASK_NOT_FOUND" });
      }
      res.json({ success: true, task });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to get personal task" });
    }
  });

  app.post("/api/personal-assistant/tasks/:taskId/pause", async (req, res) => {
    try {
      if (!isPersonalAssistantFeatureEnabled()) {
        return res.status(403).json({ error: "Personal Assistant feature is currently disabled.", code: "PERSONAL_ASSISTANT_DISABLED" });
      }
      const sessionUser = await requireSessionAccount(req, res);
      if (!sessionUser) return;
      const accountId = getStableUserId(sessionUser);

      const task = await getPersonalTask(accountId, req.params.taskId);
      if (!task) return res.status(404).json({ error: "Task not found" });

      cancelTaskFollowUp(task);
      const transitionRes = await transitionPersonalTask(task, {
        targetState: "PAUSED_OWNER",
        actor: "owner",
        reason: "Paused via API",
      });

      res.json({ success: transitionRes.success, task: transitionRes.task, error: transitionRes.error });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to pause task" });
    }
  });

  app.post("/api/personal-assistant/tasks/:taskId/resume", async (req, res) => {
    try {
      if (!isPersonalAssistantFeatureEnabled()) {
        return res.status(403).json({ error: "Personal Assistant feature is currently disabled.", code: "PERSONAL_ASSISTANT_DISABLED" });
      }
      const sessionUser = await requireSessionAccount(req, res);
      if (!sessionUser) return;
      const accountId = getStableUserId(sessionUser);

      const task = await getPersonalTask(accountId, req.params.taskId);
      if (!task) return res.status(404).json({ error: "Task not found" });

      const transitionRes = await transitionPersonalTask(task, {
        targetState: "ACTIVE",
        actor: "owner",
        reason: "Resumed via API",
      });

      res.json({ success: transitionRes.success, task: transitionRes.task, error: transitionRes.error });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to resume task" });
    }
  });

  app.post("/api/personal-assistant/tasks/:taskId/cancel", async (req, res) => {
    try {
      if (!isPersonalAssistantFeatureEnabled()) {
        return res.status(403).json({ error: "Personal Assistant feature is currently disabled.", code: "PERSONAL_ASSISTANT_DISABLED" });
      }
      const sessionUser = await requireSessionAccount(req, res);
      if (!sessionUser) return;
      const accountId = getStableUserId(sessionUser);

      const task = await getPersonalTask(accountId, req.params.taskId);
      if (!task) return res.status(404).json({ error: "Task not found" });

      cancelTaskFollowUp(task);
      const transitionRes = await transitionPersonalTask(task, {
        targetState: "CANCELLED",
        actor: "owner",
        reason: "Cancelled via API",
      });

      res.json({ success: transitionRes.success, task: transitionRes.task, error: transitionRes.error });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to cancel task" });
    }
  });

  app.post("/api/personal-assistant/tasks/:taskId/answer", express.json(), async (req, res) => {
    try {
      if (!isPersonalAssistantFeatureEnabled()) {
        return res.status(403).json({ error: "Personal Assistant feature is currently disabled.", code: "PERSONAL_ASSISTANT_DISABLED" });
      }
      const sessionUser = await requireSessionAccount(req, res);
      if (!sessionUser) return;
      const accountId = getStableUserId(sessionUser);

      const answer = req.body?.answer || req.body?.text;
      if (!answer) return res.status(400).json({ error: "answer is required" });

      const corRes = await correlateOwnerAnswer({
        accountId,
        answerText: answer,
        explicitTaskId: req.params.taskId,
      });

      if (!corRes.correlated || !corRes.task) {
        return res.status(400).json({ error: corRes.error || "Could not correlate answer" });
      }

      res.json({ success: true, task: corRes.task });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to answer task question" });
    }
  });

  app.post("/api/personal-assistant/tasks/:taskId/approve", express.json(), async (req, res) => {
    try {
      if (!isPersonalAssistantFeatureEnabled()) {
        return res.status(403).json({ error: "Personal Assistant feature is currently disabled.", code: "PERSONAL_ASSISTANT_DISABLED" });
      }
      const sessionUser = await requireSessionAccount(req, res);
      if (!sessionUser) return;
      const accountId = getStableUserId(sessionUser);

      const approvalRes = await resolvePersonalTaskApproval({
        accountId,
        taskId: req.params.taskId,
        approvalId: req.body?.approvalId,
        decision: "APPROVED",
        actorRole: "owner",
      });

      res.json(approvalRes);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to approve task action" });
    }
  });

  app.post("/api/personal-assistant/tasks/:taskId/reject", express.json(), async (req, res) => {
    try {
      if (!isPersonalAssistantFeatureEnabled()) {
        return res.status(403).json({ error: "Personal Assistant feature is currently disabled.", code: "PERSONAL_ASSISTANT_DISABLED" });
      }
      const sessionUser = await requireSessionAccount(req, res);
      if (!sessionUser) return;
      const accountId = getStableUserId(sessionUser);

      const rejectRes = await resolvePersonalTaskApproval({
        accountId,
        taskId: req.params.taskId,
        approvalId: req.body?.approvalId,
        decision: "REJECTED",
        actorRole: "owner",
      });

      res.json(rejectRes);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to reject task action" });
    }
  });

  // ------------------------------------------------------------------
  // Personal Assistant Delegation & Safety Policy Endpoints (Prompt 7)
  // ------------------------------------------------------------------
  app.get("/api/personal-assistant/delegation-policy", async (req, res) => {
    try {
      if (!isPersonalAssistantFeatureEnabled()) {
        return res.status(403).json({ error: "Personal Assistant feature is currently disabled.", code: "PERSONAL_ASSISTANT_DISABLED" });
      }
      const sessionUser = await requireSessionAccount(req, res);
      if (!sessionUser) return;
      const accountId = getStableUserId(sessionUser);

      const personalInstanceId = req.query.personalInstanceId as string | undefined;
      const policy = await getPersonalDelegationPolicy(accountId, personalInstanceId);
      res.json({ success: true, policy });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to get delegation policy" });
    }
  });

  app.post("/api/personal-assistant/delegation-policy", express.json(), async (req, res) => {
    try {
      if (!isPersonalAssistantFeatureEnabled()) {
        return res.status(403).json({ error: "Personal Assistant feature is currently disabled.", code: "PERSONAL_ASSISTANT_DISABLED" });
      }
      const sessionUser = await requireSessionAccount(req, res);
      if (!sessionUser) return;
      const accountId = getStableUserId(sessionUser);

      const current = await getPersonalDelegationPolicy(accountId, req.body?.personalInstanceId);
      const updatedPolicy = {
        ...current,
        ...req.body,
        accountId,
        updatedBy: req.body?.updatedBy || "dashboard_owner",
      };

      const saved = await savePersonalDelegationPolicy(updatedPolicy, req.body?.expectedRevision);
      res.json({ success: true, policy: saved });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to update delegation policy" });
    }
  });

  // ------------------------------------------------------------------
  // Google Personal Assistant Integration Endpoints (Prompt 8)
  // ------------------------------------------------------------------
  app.get("/api/personal-assistant/google/status", async (req, res) => {
    try {
      if (!isPersonalAssistantFeatureEnabled()) {
        return res.status(403).json({ error: "Personal Assistant feature is currently disabled.", code: "PERSONAL_ASSISTANT_DISABLED" });
      }
      const sessionUser = await requireSessionAccount(req, res);
      if (!sessionUser) return;
      const accountId = getStableUserId(sessionUser);

      const conn = await getGooglePersonalConnection(accountId);
      res.json({ success: true, connection: conn });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to get Google personal status" });
    }
  });

  app.post("/api/personal-assistant/google/oauth/initiate", express.json(), async (req, res) => {
    try {
      if (!isPersonalAssistantFeatureEnabled()) {
        return res.status(403).json({ error: "Personal Assistant feature is currently disabled.", code: "PERSONAL_ASSISTANT_DISABLED" });
      }
      const sessionUser = await requireSessionAccount(req, res);
      if (!sessionUser) return;
      const accountId = getStableUserId(sessionUser);

      const capabilities = Array.isArray(req.body?.capabilities) ? req.body.capabilities : ["calendarAvailability", "calendarEvents"];
      const { authUrl, state, signedCookie } = await initiateGoogleOAuthFlow({
        accountId,
        requestedCapabilities: capabilities,
      });

      res.cookie("blackarrow_oauth_state", signedCookie, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production" && (!isStaging || isPublicConversion),
        sameSite: "lax",
        maxAge: 10 * 60 * 1000,
      });

      res.json({ success: true, authUrl, state });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to initiate Google OAuth" });
    }
  });

  app.get("/api/personal-assistant/google/oauth/callback", async (req, res) => {
    try {
      const code = String(req.query.code || "");
      const state = String(req.query.state || "");
      const cookieState = req.cookies?.blackarrow_oauth_state;

      const callbackResult = await handleGoogleOAuthCallback({
        queryCode: code,
        queryState: state,
        cookieState,
      });

      res.clearCookie("blackarrow_oauth_state");

      if (req.headers.accept?.includes("application/json")) {
        return res.json({ success: true, ...callbackResult });
      }
      res.redirect("/dashboard/personal-assistant?google=connected");
    } catch (e: any) {
      if (req.headers.accept?.includes("application/json")) {
        return res.status(400).json({ error: e?.message || "Google OAuth callback failed" });
      }
      res.redirect(`/dashboard/personal-assistant?google_error=${encodeURIComponent(e?.message || "auth_failed")}`);
    }
  });

  app.post("/api/personal-assistant/google/disconnect", async (req, res) => {
    try {
      if (!isPersonalAssistantFeatureEnabled()) {
        return res.status(403).json({ error: "Personal Assistant feature is currently disabled.", code: "PERSONAL_ASSISTANT_DISABLED" });
      }
      const sessionUser = await requireSessionAccount(req, res);
      if (!sessionUser) return;
      const accountId = getStableUserId(sessionUser);

      const conn = await disconnectGooglePersonalConnection(accountId);
      res.json({ success: true, connection: conn });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to disconnect Google" });
    }
  });

  app.post("/api/personal-assistant/google/capabilities/toggle", express.json(), async (req, res) => {
    try {
      if (!isPersonalAssistantFeatureEnabled()) {
        return res.status(403).json({ error: "Personal Assistant feature is currently disabled.", code: "PERSONAL_ASSISTANT_DISABLED" });
      }
      const sessionUser = await requireSessionAccount(req, res);
      if (!sessionUser) return;
      const accountId = getStableUserId(sessionUser);

      const { capability, enabled } = req.body;
      if (!capability) return res.status(400).json({ error: "capability is required" });

      const conn = await setInternalGoogleCapabilityEnabled(accountId, capability, Boolean(enabled));
      res.json({ success: true, connection: conn });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to toggle Google capability" });
    }
  });

  app.get("/api/personal-assistant/google/drive/files", async (req, res) => {
    try {
      if (!isPersonalAssistantFeatureEnabled()) {
        return res.status(403).json({ error: "Personal Assistant feature is currently disabled.", code: "PERSONAL_ASSISTANT_DISABLED" });
      }
      const sessionUser = await requireSessionAccount(req, res);
      if (!sessionUser) return;
      const accountId = getStableUserId(sessionUser);

      const files = listSelectedDriveFiles(accountId);
      res.json({ success: true, files });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to list Drive files" });
    }
  });

  app.post("/api/personal-assistant/google/drive/validate-file", express.json(), async (req, res) => {
    try {
      if (!isPersonalAssistantFeatureEnabled()) {
        return res.status(403).json({ error: "Personal Assistant feature is currently disabled.", code: "PERSONAL_ASSISTANT_DISABLED" });
      }
      const sessionUser = await requireSessionAccount(req, res);
      if (!sessionUser) return;
      const accountId = getStableUserId(sessionUser);

      const { fileId } = req.body;
      if (!fileId) return res.status(400).json({ error: "fileId is required" });

      const file = await validateDriveFileAccess(accountId, fileId);
      res.json({ success: true, file });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to validate Drive file" });
    }
  });

  app.post("/api/personal-assistant/google/drive/unlink", express.json(), async (req, res) => {
    try {
      if (!isPersonalAssistantFeatureEnabled()) {
        return res.status(403).json({ error: "Personal Assistant feature is currently disabled.", code: "PERSONAL_ASSISTANT_DISABLED" });
      }
      const sessionUser = await requireSessionAccount(req, res);
      if (!sessionUser) return;
      const accountId = getStableUserId(sessionUser);

      const { fileId } = req.body;
      if (!fileId) return res.status(400).json({ error: "fileId is required" });

      const removed = removeSelectedDriveFile(accountId, fileId);
      res.json({ success: true, removed });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to unlink Drive file" });
    }
  });

  app.get("/api/personal-assistant/google/picker-config", async (req, res) => {
    try {
      if (!isPersonalAssistantFeatureEnabled()) {
        return res.status(403).json({ error: "Personal Assistant feature is currently disabled.", code: "PERSONAL_ASSISTANT_DISABLED" });
      }
      const sessionUser = await requireSessionAccount(req, res);
      if (!sessionUser) return;
      const accountId = getStableUserId(sessionUser);

      const hasApiKey = Boolean(process.env.GOOGLE_PICKER_API_KEY);
      const appId = process.env.GOOGLE_PICKER_APP_ID || "";
      const apiKeyMasked = hasApiKey ? `${process.env.GOOGLE_PICKER_API_KEY!.slice(0, 6)}...` : "";

      const conn = await getGooglePersonalConnection(accountId);
      const driveFileGranted = Boolean((conn as any)?.capabilitiesEnabled?.driveFiles);

      res.json({
        configured: hasApiKey,
        appId,
        apiKeyMasked,
        driveFileGranted,
      });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to get Picker config" });
    }
  });

  // ------------------------------------------------------------------
  // Personal Assistant Hub Endpoints (Prompt 9)
  // ------------------------------------------------------------------
  app.get("/api/personal-assistant/hub/overview", async (req, res) => {
    try {
      if (!isPersonalAssistantFeatureEnabled()) {
        return res.status(403).json({ error: "Personal Assistant feature is currently disabled.", code: "PERSONAL_ASSISTANT_DISABLED" });
      }
      const sessionUser = await requireSessionAccount(req, res);
      if (!sessionUser) return;
      const accountId = getStableUserId(sessionUser);

      const targetInstanceId = req.query.instanceId ? String(req.query.instanceId).trim() : undefined;

      const allTasks = await listPersonalTasks(accountId, targetInstanceId ? { personalInstanceId: targetInstanceId } : undefined);
      const contacts = await personalContactService.listPersonalContacts(accountId);
      const userBots = await dbService.getBotsByUser(accountId).catch(() => []) as any[];
      const personalBots = userBots.filter((b) => isPersonalInstance(b));
      const googleConn = await getGooglePersonalConnection(accountId);
      const policy = await getPersonalDelegationPolicy(accountId, targetInstanceId);
      const spendingRecord = await getDailyCommitmentRecord(accountId, "PKR");

      let activeTasksCount = 0;
      let waitingOwnerCount = 0;
      let pendingApprovalsCount = 0;

      for (const t of allTasks) {
        const state = (t as any).currentState || (t as any).status;
        if (state === "WAITING_FOR_APPROVAL") {
          pendingApprovalsCount++;
        } else if (state === "WAITING_FOR_OWNER") {
          waitingOwnerCount++;
        } else if (["READY", "ACTIVE", "WAITING_FOR_CONTACT", "WAITING_UNTIL", "IN_PROGRESS", "WAITING_FOR_REPLY", "SCHEDULED"].includes(state)) {
          activeTasksCount++;
        }
      }

      const canonicalPersonalStatuses = personalBots.map((b) =>
        resolveCanonicalInstanceStatus(b, userBots, activeWorkers)
      );

      const connectedNumbersCount = canonicalPersonalStatuses.filter((s) => s.isConnected).length;
      const hasGoogleIssues = Boolean(
        googleConn.status === "REAUTH_REQUIRED" ||
        (googleConn.status === "CONNECTED" && (googleConn.refreshStatus === "invalid_grant" || googleConn.refreshStatus === "refresh_failed"))
      );
      const googleIssuesCount = hasGoogleIssues ? 1 : 0;

      const attentionQueue: any[] = [];

      // Priority 1: Approvals Required
      for (const t of allTasks) {
        const state = (t as any).currentState || (t as any).status;
        if (state === "WAITING_FOR_APPROVAL") {
          attentionQueue.push({
            id: `attn_appr_${t.taskId}`,
            priority: 1,
            type: "approval_required",
            title: `Action Approval Required`,
            description: (t as any).actionPlan?.proposedAction?.description || (t as any).goal || "External action requires explicit approval.",
            timestamp: (t as any).updatedAt || (t as any).createdAt,
            taskId: t.taskId,
            contactName: (t as any).target?.displayName || (t as any).targetIdentity?.canonicalName,
            instanceId: t.personalInstanceId,
            approvalFingerprint: (t as any).approvalFingerprint || (t as any).actionPlan?.approvalFingerprint,
          });
        }
      }

      // Priority 2: Owner Questions Required
      for (const t of allTasks) {
        const state = (t as any).currentState || (t as any).status;
        if (state === "WAITING_FOR_OWNER") {
          attentionQueue.push({
            id: `attn_ques_${t.taskId}`,
            priority: 2,
            type: "owner_question_required",
            title: `Question for Owner`,
            description: (t as any).pendingQuestion || (t as any).ownerQuestion?.prompt || "Personal Assistant needs your response to continue.",
            timestamp: (t as any).updatedAt || (t as any).createdAt,
            taskId: t.taskId,
            contactName: (t as any).target?.displayName || (t as any).targetIdentity?.canonicalName,
            instanceId: t.personalInstanceId,
            pendingQuestion: (t as any).pendingQuestion || (t as any).ownerQuestion?.prompt,
          });
        }
      }

      // Priority 3: Failed tasks needing action
      for (const t of allTasks) {
        const state = (t as any).currentState || (t as any).status;
        if (state === "FAILED" || state === "FAILED_RETRYABLE" || state === "FAILED_FINAL") {
          attentionQueue.push({
            id: `attn_fail_${t.taskId}`,
            priority: 3,
            type: "failed_task",
            title: `Task Execution Failed`,
            description: (t as any).failureReason || (t as any).goal || "Task stopped due to an execution error.",
            timestamp: (t as any).updatedAt || (t as any).createdAt,
            taskId: t.taskId,
            contactName: (t as any).target?.displayName || (t as any).targetIdentity?.canonicalName,
            instanceId: t.personalInstanceId,
          });
        }
      }

      // Priority 4: Google Issues / Reauth
      if (hasGoogleIssues) {
        attentionQueue.push({
          id: `attn_google_${accountId}`,
          priority: 4,
          type: "google_issue",
          title: `Google Tools Reauthorization Required`,
          description: `Google connection token for ${googleConn.googleEmail || "account"} has expired or been revoked. Reconnect to resume calendar/drive tools.`,
          timestamp: googleConn.updatedAt || Date.now(),
        });
      }

      // Priority 5: Active Manual Takeovers
      for (const c of contacts) {
        const primaryIdent = c.whatsappIdentities?.[0];
        const instanceId = primaryIdent?.personalInstanceId || (personalBots[0]?.id || "default");
        const takeover = isManualTakeoverActive(accountId, instanceId, c.contactId);
        if (takeover.active) {
          attentionQueue.push({
            id: `attn_takeover_${c.contactId}`,
            priority: 5,
            type: "manual_takeover",
            title: `Manual Takeover Engaged`,
            description: `Auto-replies paused for ${c.displayName || primaryIdent?.canonicalPhone || "contact"}.`,
            timestamp: takeover.until ? takeover.until - 3600000 : Date.now(),
            contactId: c.contactId,
            contactJid: primaryIdent?.jid,
            contactName: c.displayName,
          });
        }
      }

      attentionQueue.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return (a.timestamp || 0) - (b.timestamp || 0);
      });

      const recentActivity: any[] = [];
      for (const t of allTasks.slice(0, 10)) {
        if (Array.isArray((t as any).events)) {
          for (const evt of (t as any).events.slice(-3)) {
            recentActivity.push({
              id: evt.eventId || `${t.taskId}_${evt.timestamp}`,
              type: evt.type || "task_event",
              title: (t as any).goal || `Task ${t.taskId}`,
              summary: evt.summary || `Task event: ${evt.type}`,
              timestamp: evt.timestamp,
              taskId: t.taskId,
            });
          }
        }
      }
      recentActivity.sort((a, b) => b.timestamp - a.timestamp);

      const personalNumbers = canonicalPersonalStatuses.map((s) => {
        const instTasks = allTasks.filter((t) => t.personalInstanceId === s.botId);
        return {
          instanceId: s.botId,
          name: s.name,
          phone: s.phone ? (s.phone.startsWith("+") ? s.phone : `+${s.phone}`) : "",
          status: s.connectionState,
          controllingBusinessInstanceId: s.controllingBusinessInstanceId || "Not set",
          controllingBusinessInstanceName: s.controllingBusinessInstanceName || (s.controllingBusinessInstanceId ? `Business (${s.controllingBusinessInstanceId.slice(0, 8)}...)` : undefined),
          controllingBusinessPhone: s.controllingBusinessPhone,
          incomingAssistantEnabled: s.incomingAssistantEnabled,
          incomingAssistantRuntimeStatus: s.incomingAssistantRuntimeStatus,
          activeTasksCount: instTasks.filter((t) => ["READY", "ACTIVE", "WAITING_FOR_CONTACT", "WAITING_FOR_OWNER", "WAITING_FOR_APPROVAL", "IN_PROGRESS"].includes((t as any).currentState || (t as any).status)).length,
          manualTakeoverCount: 0,
        };
      });

      res.json({
        success: true,
        metrics: {
          activeTasksCount,
          waitingOwnerCount,
          pendingApprovalsCount,
          personalContactsCount: contacts.length,
          connectedNumbersCount,
          googleIssuesCount,
          delegatedCommitmentTodayPkr: spendingRecord?.totalCommitted || 0,
          delegatedCommitmentLimitPkr: policy?.orders?.maxOrderValuePerDay ?? 5000,
        },
        attentionQueue,
        recentActivity: recentActivity.slice(0, 10),
        personalNumbers,
        googleStatus: {
          status: googleConn.status,
          email: googleConn.googleEmail,
          capabilities: (googleConn as any).capabilitiesEnabled || {},
          hasIssues: hasGoogleIssues,
          reauthRequired: googleConn.status === "REAUTH_REQUIRED" || googleConn.refreshStatus === "invalid_grant" || googleConn.refreshStatus === "refresh_failed",
        },
      });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to get Hub overview" });
    }
  });

  app.get("/api/personal-assistant/hub/conversations", async (req, res) => {
    try {
      if (!isPersonalAssistantFeatureEnabled()) {
        return res.status(403).json({ error: "Personal Assistant feature is currently disabled.", code: "PERSONAL_ASSISTANT_DISABLED" });
      }
      const sessionUser = await requireSessionAccount(req, res);
      if (!sessionUser) return;
      const accountId = getStableUserId(sessionUser);

      const targetInstanceId = req.query.instanceId ? String(req.query.instanceId).trim() : undefined;
      const statusFilter = req.query.status as string | undefined;
      const search = req.query.search ? String(req.query.search).toLowerCase().trim() : undefined;

      const contacts = await personalContactService.listPersonalContacts(accountId);
      const conversations: any[] = [];

      for (const c of contacts) {
        const primaryIdent = c.whatsappIdentities?.[0];
        const instId = primaryIdent?.personalInstanceId || "default";
        if (targetInstanceId && instId !== targetInstanceId) continue;

        const takeover = isManualTakeoverActive(accountId, instId, c.contactId);
        const commStatus = c.communicationPreferences?.contactCommunicationStatus;
        let aiStatus: "active" | "paused" | "manual_takeover" | "do_not_contact" = "active";
        if (commStatus === "do_not_contact" || c.communicationPreferences?.doNotContact) {
          aiStatus = "do_not_contact";
        } else if (takeover.active) {
          aiStatus = "manual_takeover";
        } else if (commStatus === "paused_by_owner") {
          aiStatus = "paused";
        }

        if (statusFilter && statusFilter !== "all" && aiStatus !== statusFilter) {
          continue;
        }

        const name = c.displayName || "Personal Contact";
        const rawJid = primaryIdent?.jid || primaryIdent?.canonicalPhone || c.contactId;

        let safePhone = "Unknown Contact";
        if (rawJid.endsWith("@lid")) {
          safePhone = primaryIdent?.canonicalPhone ? `+${primaryIdent.canonicalPhone.replace(/\D/g, "")}` : "WhatsApp Identity (LID)";
        } else if (rawJid.endsWith("@s.whatsapp.net")) {
          safePhone = `+${rawJid.split("@")[0].replace(/\D/g, "")}`;
        } else if (primaryIdent?.canonicalPhone) {
          safePhone = `+${primaryIdent.canonicalPhone.replace(/\D/g, "")}`;
        }

        if (search) {
          const matchName = name.toLowerCase().includes(search);
          const matchPhone = safePhone.toLowerCase().includes(search);
          if (!matchName && !matchPhone) continue;
        }

        const activeTask = await getActiveTaskForContact(accountId, instId, c.contactId, rawJid);

        conversations.push({
          jid: rawJid,
          contactId: c.contactId,
          contactName: name,
          safePhone,
          personalInstanceId: instId,
          lastMessage: (c as any).lastInboundMessage?.text || "No recent messages",
          lastMessageTimestamp: (c as any).lastInboundMessage?.timestamp || c.updatedAt || c.createdAt,
          aiStatus,
          activeTaskId: activeTask?.taskId,
          activeTaskGoal: (activeTask as any)?.goal,
          unread: false,
        });
      }

      conversations.sort((a, b) => b.lastMessageTimestamp - a.lastMessageTimestamp);
      res.json({ success: true, conversations });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to list personal conversations" });
    }
  });

  app.get("/api/personal-assistant/hub/conversations/:jid/messages", async (req, res) => {
    try {
      if (!isPersonalAssistantFeatureEnabled()) {
        return res.status(403).json({ error: "Personal Assistant feature is currently disabled.", code: "PERSONAL_ASSISTANT_DISABLED" });
      }
      const sessionUser = await requireSessionAccount(req, res);
      if (!sessionUser) return;
      const accountId = getStableUserId(sessionUser);

      const jid = req.params.jid;
      const contact = await personalContactService.findPersonalContactByWhatsAppIdentity(accountId, { remoteJid: jid });

      const messages: any[] = [];
      if (contact && (contact as any).lastInboundMessage) {
        messages.push({
          id: `msg_in_${contact.contactId}`,
          sender: "contact",
          text: (contact as any).lastInboundMessage.text || "",
          timestamp: (contact as any).lastInboundMessage.timestamp || Date.now(),
          status: "read",
        });
      }

      res.json({ success: true, messages });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to get conversation messages" });
    }
  });

  app.post("/api/personal-assistant/hub/conversations/:jid/takeover", async (req, res) => {
    try {
      if (!isPersonalAssistantFeatureEnabled()) {
        return res.status(403).json({ error: "Personal Assistant feature is currently disabled.", code: "PERSONAL_ASSISTANT_DISABLED" });
      }
      const sessionUser = await requireSessionAccount(req, res);
      if (!sessionUser) return;
      const accountId = getStableUserId(sessionUser);

      const jid = req.params.jid;
      const contact = await personalContactService.findPersonalContactByWhatsAppIdentity(accountId, { remoteJid: jid });
      if (!contact) return res.status(404).json({ error: "Contact not found" });

      const primaryIdent = contact.whatsappIdentities?.[0];
      const instId = primaryIdent?.personalInstanceId || "default";
      recordManualTakeover(accountId, instId, contact.contactId, 60);

      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to engage takeover" });
    }
  });

  app.post("/api/personal-assistant/hub/conversations/:jid/resume", async (req, res) => {
    try {
      if (!isPersonalAssistantFeatureEnabled()) {
        return res.status(403).json({ error: "Personal Assistant feature is currently disabled.", code: "PERSONAL_ASSISTANT_DISABLED" });
      }
      const sessionUser = await requireSessionAccount(req, res);
      if (!sessionUser) return;
      const accountId = getStableUserId(sessionUser);

      const jid = req.params.jid;
      const contact = await personalContactService.findPersonalContactByWhatsAppIdentity(accountId, { remoteJid: jid });
      if (!contact) return res.status(404).json({ error: "Contact not found" });

      const primaryIdent = contact.whatsappIdentities?.[0];
      const instId = primaryIdent?.personalInstanceId || "default";
      clearManualTakeover(accountId, instId, contact.contactId);

      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to clear takeover" });
    }
  });

  app.post("/api/personal-assistant/hub/conversations/:jid/dnc", express.json(), async (req, res) => {
    try {
      if (!isPersonalAssistantFeatureEnabled()) {
        return res.status(403).json({ error: "Personal Assistant feature is currently disabled.", code: "PERSONAL_ASSISTANT_DISABLED" });
      }
      const sessionUser = await requireSessionAccount(req, res);
      if (!sessionUser) return;
      const accountId = getStableUserId(sessionUser);

      const jid = req.params.jid;
      const doNotContact = Boolean(req.body?.doNotContact);
      const contact = await personalContactService.findPersonalContactByWhatsAppIdentity(accountId, { remoteJid: jid });
      if (!contact) return res.status(404).json({ error: "Contact not found" });

      await personalContactService.setContactCommunicationStatus(
        accountId,
        contact.contactId,
        doNotContact ? "do_not_contact" : "active"
      );

      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to update DNC" });
    }
  });

  // ------------------------------------------------------------------
  // Meta Embedded Signup & Official Cloud API Onboarding Endpoints
  // ------------------------------------------------------------------
  app.get("/api/meta-onboarding/config", async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const publicConfig = getMetaOnboardingPublicConfig();
      res.json(publicConfig);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to load Meta onboarding config" });
    }
  });

  app.post("/api/meta-onboarding/start", express.json(), async (req, res) => {
    try {
      const { botId, purpose } = req.body;
      if (!botId) return res.status(400).json({ error: "Missing botId" });

      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);
      const bot = await requireOwnedBot(req, res, userId, botId);
      if (!bot) return;

      const attempt = createOnboardingAttempt({
        userId,
        botId,
        purpose: purpose === "reconnect" ? "reconnect" : "onboard",
      });

      res.json({
        success: true,
        attemptId: attempt.attemptId,
        state: attempt.state,
        expiresAt: attempt.expiresAt,
      });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to start onboarding session" });
    }
  });

  app.post("/api/meta-onboarding/complete", express.json(), async (req, res) => {
    try {
      const { botId, attemptId, state, code, wabaId, phoneNumberId, businessId, pin } = req.body;
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);
      const bot = await requireOwnedBot(req, res, userId, botId);
      if (!bot) return;

      const result = await completeMetaOnboarding(
        {
          userId,
          botId,
          attemptId,
          state,
          code,
          wabaId,
          phoneNumberId,
          businessId,
          pin,
        },
        {
          getBotById: (id) => dbService.getBotById(id),
          saveBotProviderConfig: (id, cfg, opts) => dbService.saveBotProviderConfig(id, cfg, opts),
          listAllBots: () => dbService.getAllBots().catch(() => []),
          encryptSecret: encryptServerSecret,
          onWorkerReload: async (targetBotId) => {
            const worker = activeWorkers.get(targetBotId);
            if (worker) {
              await fetch(`http://127.0.0.1:${worker.port}/api/config/reload`, {
                method: "POST",
                headers: buildWorkerInternalHeaders(),
              }).catch(() => {});
            } else {
              const ownerId = await getUserIdByBot(targetBotId);
              if (ownerId) {
                await spawnWorker(targetBotId, ownerId, "cloud_onboarding_activated");
              }
            }
          },
        }
      );

      res.json(result);
    } catch (e: any) {
      console.warn("[MetaOnboarding] Complete error:", e?.message || e);
      res.status(400).json({ error: e?.message || "Onboarding completion failed" });
    }
  });

  app.post("/api/meta-onboarding/disconnect", express.json(), async (req, res) => {
    try {
      const { botId } = req.body;
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);
      const bot = await requireOwnedBot(req, res, userId, botId);
      if (!bot) return;

      const result = await disconnectMetaCloudInstance(
        { userId, botId },
        {
          getBotById: (id) => dbService.getBotById(id),
          saveBotProviderConfig: (id, cfg, opts) => dbService.saveBotProviderConfig(id, cfg, opts),
          onWorkerReload: async (targetBotId) => {
            if (activeWorkers.has(targetBotId)) {
              const worker = activeWorkers.get(targetBotId)!;
              botWorkerLifecycle.markIntentionalStop(targetBotId, "cloud_disconnect");
              try {
                await fetch(`http://127.0.0.1:${worker.port}/api/shutdown`, {
                  method: "POST",
                  headers: buildWorkerInternalHeaders(),
                }).catch(() => {});
              } catch (e) {}
              worker.process.kill("SIGKILL");
              activeWorkers.delete(targetBotId);
            }
          },
        }
      );

      res.json(result);
    } catch (e: any) {
      res.status(400).json({ error: e?.message || "Disconnect failed" });
    }
  });

  app.get("/api/whatsapp-templates", async (req, res) => {
    try {
      const botId = String(req.query?.botId || "");
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);
      if (!botId) return res.status(400).json({ error: "Missing botId" });

      const bot = await requireOwnedBot(req, res, userId, botId);
      if (!bot) return;

      const { getCachedTemplatesForBot } = await import("./src/services/whatsapp-cloud-api-template-service.ts");
      const templates = await getCachedTemplatesForBot(botId, userId, {
        status: req.query.status ? String(req.query.status) : undefined,
        category: req.query.category ? String(req.query.category) : undefined,
        language: req.query.language ? String(req.query.language) : undefined,
      });

      res.json({ success: true, templates });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to get templates" });
    }
  });

  app.post("/api/whatsapp-templates/sync", express.json(), async (req, res) => {
    try {
      const { botId } = req.body || {};
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);
      if (!botId) return res.status(400).json({ error: "Missing botId" });

      const bot = await requireOwnedBot(req, res, userId, botId);
      if (!bot) return;

      const { syncWabaTemplatesForBot } = await import("./src/services/whatsapp-cloud-api-template-service.ts");
      const syncResult = await syncWabaTemplatesForBot({ botId, accountId: userId });
      if (!syncResult.success) {
        return res.status(400).json({ error: syncResult.error || "Sync failed", success: false });
      }

      res.json(syncResult);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Template sync failed" });
    }
  });

  app.get("/api/whatsapp-automation-mappings", async (req, res) => {
    try {
      const botId = String(req.query?.botId || "");
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);
      if (!botId) return res.status(400).json({ error: "Missing botId" });

      const bot = await requireOwnedBot(req, res, userId, botId);
      if (!bot) return;

      const { getBotAutomationTemplateMappings } = await import("./src/services/cloud-template-mapping-service.ts");
      const mappings = await getBotAutomationTemplateMappings(botId, userId);

      res.json({ success: true, mappings });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to get automation mappings" });
    }
  });

  app.post("/api/whatsapp-automation-mappings", express.json(), async (req, res) => {
    try {
      const { botId, mapping } = req.body || {};
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);
      if (!botId || !mapping) return res.status(400).json({ error: "Missing botId or mapping" });

      const bot = await requireOwnedBot(req, res, userId, botId);
      if (!bot) return;

      const { saveBotAutomationTemplateMapping } = await import("./src/services/cloud-template-mapping-service.ts");
      const success = await saveBotAutomationTemplateMapping(botId, userId, mapping);

      if (!success) {
        return res.status(400).json({ error: "Invalid mapping payload", success: false });
      }

      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to save automation mapping" });
    }
  });

  app.post("/api/whatsapp-service-window/check", express.json(), async (req, res) => {
    try {
      const { botId, customerJid } = req.body || {};
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);
      if (!botId || !customerJid) return res.status(400).json({ error: "Missing botId or customerJid" });

      const bot = await requireOwnedBot(req, res, userId, botId);
      if (!bot) return;

      const { resolveCustomerServiceWindow } = await import("./src/services/whatsapp-cloud-api-service-window.ts");
      const customerProfile = await dbService.getCustomerProfile(userId, customerJid).catch(() => null);
      const windowEval = await resolveCustomerServiceWindow({ customerProfile });

      res.json({ success: true, ...windowEval });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to check service window" });
    }
  });

  app.get("/api/user/analytics", async (req, res) => {
    const { from, to, limit } = req.query;
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);

      const parsedLimit = limit !== undefined ? Math.max(1, Math.min(5000, Number(limit) || 100)) : undefined;
      const fromTime = from ? normalizeTime(from) : undefined;
      const toTime = to ? normalizeTime(to) : undefined;
      
      const rows = await dbService.getUserAnalytics(userId, fromTime, toTime, parsedLimit);
      res.json(rows);
    } catch(e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/user/billing-logs", async (req, res) => {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: "Missing date" });
    try {
       const user = await requireSessionAccount(req, res);
       if (!user) return;
       const userId = getStableUserId(user);
       const logs = await dbService.getBillingLogs(userId, date as string);
       res.json(logs);
    } catch(e: any) {
       res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/user/billing-logs/download", async (req, res) => {
    const { date, format: outputFormat } = req.query;
    if (!date) return res.status(400).json({ error: "Missing date" });
    try {
       const user = await requireSessionAccount(req, res);
       if (!user) return;
       const userId = getStableUserId(user);
       const startSeconds = Math.floor(new Date(String(date)).getTime() / 1000);
       if (!Number.isFinite(startSeconds)) return res.status(400).json({ error: "Invalid date" });
       const endSeconds = startSeconds + (24 * 60 * 60);
       const [usageRows, walletRows] = await Promise.all([
         dbService.getUserAnalytics(userId, startSeconds, endSeconds),
         dbService.listWalletTransactions(userId, startSeconds, endSeconds),
       ]);
       const receipts = listOutboundReceipts().filter((receipt: any) => {
         if (receipt.userId && receipt.userId !== userId) return false;
         const ts = normalizeBillingTimestamp(receipt.sentTimestamp || receipt.updatedAt || receipt.createdAt);
         return ts >= startSeconds && ts < endSeconds;
       });
       const rows = buildTransparencyRows({ usageRows, walletTransactions: walletRows, receipts });
       const isCsv = String(outputFormat || "").toLowerCase() === "csv";
       const content = isCsv ? buildTransparencyCsv({ rows }) : buildTransparencyText({
         date: String(date),
         userLabel: "current account",
         rows,
         receiptsAvailable: receipts.length > 0 || (Date.now() - startSeconds * 1000) <= 46 * 24 * 60 * 60 * 1000,
       });

       // Create local backup file for transparency/persistence
       try {
         const logDir = path.join(process.cwd(), 'backups', 'billing_logs', userId);
         if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
         const filePath = path.join(logDir, `${date}.${isCsv ? "csv" : "log"}`);
         fs.writeFileSync(filePath, content);
       } catch (fsErr) {
         console.error("[Billing Logs] Failed to write backup file:", fsErr);
       }
       
       res.setHeader('Content-Type', isCsv ? 'text/csv' : 'text/plain');
       res.setHeader('Content-Disposition', `attachment; filename=billing-logs-${date}.${isCsv ? "csv" : "txt"}`);
       res.send(content);
    } catch(e: any) {
       res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/admin/ai/model-availability", async (req, res) => {
    try {
      const requester = await requireAdminUser(req, res);
      if (!requester) return;
      const shouldCheck = String(req.query.check || "").toLowerCase() === "1" || String(req.query.check || "").toLowerCase() === "true";
      const status = shouldCheck
        ? await checkCheapGeminiModelAvailability()
        : await getCheapGeminiModelAvailabilityStatus();
      res.json(status);
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to load model availability" });
    }
  });

  app.post("/api/user/client-gemini", express.json(), async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);
      const apiKey = String(req.body?.apiKey || "").trim();
      const enabled = req.body?.enabled === true || req.body?.enabled === 1;
      const cacheBoostEnabled = req.body?.cacheBoostEnabled === true || req.body?.cacheBoostEnabled === 1;
      if (enabled && !apiKey && !(await getClientGeminiStatus(userId)).hasKey) {
        return res.status(400).json({ error: "Google AI Studio Gemini API key is required before enabling custom Gemini." });
      }
      if (apiKey && !isGoogleAiStudioGeminiApiKey(apiKey)) {
        return res.status(400).json({ error: "Invalid Google AI Studio Gemini API key." });
      }
      const status = await saveClientGeminiSetting(userId, { enabled, apiKey, cacheBoostEnabled });
      res.json({ success: true, status });
    } catch (e: any) {
      const message = String(e?.message || "Failed to save Google AI Studio Gemini API key").replace(/AIza[0-9A-Za-z_-]+/g, "****");
      res.status(400).json({ error: message === "missing_secret_encryption_key" ? "Server encryption secret is required before saving client Gemini keys." : message });
    }
  });

  app.delete("/api/user/client-gemini", express.json(), async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);
      const status = await removeClientGeminiSetting(userId);
      res.json({ success: true, status });
    } catch (e: any) {
      res.status(400).json({ error: "Failed to remove Gemini API key" });
    }
  });

  app.post("/api/user/client-gemini/test", express.json(), async (req, res) => {
    const user = await requireSessionAccount(req, res);
    if (!user) return;
    const userId = getStableUserId(user);
    const requestKey = String(req.body?.apiKey || "").trim();
    if (requestKey && !isGoogleAiStudioGeminiApiKey(requestKey)) {
      return res.status(400).json({ success: false, error: "Invalid Google AI Studio Gemini API key." });
    }
    let apiKey = requestKey;
    if (!apiKey) {
      try {
        apiKey = await getClientGeminiApiKeyForServer(userId);
      } catch {
        return res.status(400).json({ success: false, error: "Invalid Google AI Studio Gemini API key." });
      }
    }
    if (!apiKey) return res.status(400).json({ error: "Google AI Studio Gemini API key is required for the test." });
    const access = await dbService.canSendCustomerFacingMessage(userId);
    if (!access.allowed) return res.status(402).json({ error: access.reason || "account_access_expired" });
    const cost = getUsageBillingDefinition("client_gemini_message_cycle").priceUsd;
    const latestUser = await dbService.getUser(userId).catch(() => null) as any;
    if (Math.max(0, Number(latestUser?.wallet_balance || 0)) < cost) {
      return res.status(402).json({ error: "insufficient_wallet" });
    }
    try {
      const ai = new GoogleGenAI({ apiKey } as any);
      await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: "Reply with OK." }] }],
        config: { maxOutputTokens: 8 },
      });
      await chargeClientGeminiApiRequest({
        provider: "client_custom_gemini",
        userId,
        accountId: userId,
        purpose: "client_gemini_key_test",
        billingContext: { eventId: String(req.body?.requestId || Date.now()) },
      }).catch(() => {});
      res.json({ success: true, message: "Gemini API key test succeeded." });
    } catch {
      res.status(400).json({ success: false, error: "Invalid Google AI Studio Gemini API key." });
    }
  });

  app.get("/api/public/v1/account/status", async (req, res) => {
    try {
      const auth = req.headers.authorization || req.headers["x-api-key"];
      const result = await authenticatePublicApiKey(auth, "read:account", req.path, req.method);
      if (await enforcePublicApiRateLimit(req, res, result, result ? "read" : "invalid")) return;
      if (!result) return res.status(401).json({ error: "Invalid or unauthorized API key" });
      const status = await getPublicAccountStatus(result.userId);
      res.json({ success: true, account: status });
    } catch (e: any) {
      res.status(500).json({ error: "Public API request failed" });
    }
  });

  app.post("/api/public/v1/messages/send", express.json({ limit: "64kb" }), async (req, res) => {
    try {
      const auth = req.headers.authorization || req.headers["x-api-key"];
      const result = await authenticatePublicApiKey(auth, "write:messages", req.path, req.method);
      if (await enforcePublicApiRateLimit(req, res, result, result ? "send" : "invalid")) return;
      if (!result) return res.status(401).json({ error: "Invalid API key or missing write:messages scope" });
      const created = await createApiMessageRequest(result.userId, result.key.id, req.body || {}, false);
      res.status(created.duplicate ? 200 : 202).json({
        success: true,
        duplicate: created.duplicate,
        request: created.request,
        run: created.run,
        jobs: created.jobs.map((job: any) => ({ id: job.id, status: job.status, recipient: job.normalizedPhone || job.jid, error: job.lastError || "" })),
      });
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Failed to queue message" });
    }
  });

  app.post("/api/public/v1/messages/bulk", express.json({ limit: "128kb" }), async (req, res) => {
    try {
      const auth = req.headers.authorization || req.headers["x-api-key"];
      const result = await authenticatePublicApiKey(auth, "write:messages", req.path, req.method);
      if (await enforcePublicApiRateLimit(req, res, result, result ? "send" : "invalid")) return;
      if (!result) return res.status(401).json({ error: "Invalid API key or missing write:messages scope" });
      const created = await createApiMessageRequest(result.userId, result.key.id, req.body || {}, true);
      res.status(created.duplicate ? 200 : 202).json({
        success: true,
        duplicate: created.duplicate,
        request: created.request,
        run: created.run,
        jobs: created.jobs.map((job: any) => ({ id: job.id, status: job.status, recipient: job.normalizedPhone || job.jid, error: job.lastError || "" })),
      });
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Failed to queue bulk messages" });
    }
  });

  app.get("/api/public/v1/messages/:id", async (req, res) => {
    try {
      const auth = req.headers.authorization || req.headers["x-api-key"];
      const result = await authenticatePublicApiKey(auth, ["read:messages", "write:messages"], req.path, req.method);
      if (await enforcePublicApiRateLimit(req, res, result, result ? "read" : "invalid")) return;
      if (!result) return res.status(401).json({ error: "Invalid API key or missing message scope" });
      const job = await getMessageJobStatus(result.userId, req.params.id);
      if (!job) return res.status(404).json({ error: "Message job not found" });
      res.json({ success: true, job });
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Failed to load message status" });
    }
  });

  app.get("/api/public/v1/message-runs/:runId", async (req, res) => {
    try {
      const auth = req.headers.authorization || req.headers["x-api-key"];
      const result = await authenticatePublicApiKey(auth, ["read:messages", "write:messages"], req.path, req.method);
      if (await enforcePublicApiRateLimit(req, res, result, result ? "read" : "invalid")) return;
      if (!result) return res.status(401).json({ error: "Invalid API key or missing message scope" });
      const run = await getRunStatus(result.userId, req.params.runId);
      if (!run) return res.status(404).json({ error: "Message run not found" });
      res.json({ success: true, ...run });
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Failed to load message run" });
    }
  });

  app.get("/api/public/v1/connection/test", async (req, res) => {
    try {
      const auth = req.headers.authorization || req.headers["x-api-key"];
      const result = await authenticatePublicApiKey(auth, "write:knowledge", req.path, req.method);
      if (await enforcePublicApiRateLimit(req, res, result, result ? "read" : "invalid")) return;
      if (!result) return res.status(401).json({ ok: false, error: "Invalid API key or missing write:knowledge scope" });
      res.json({
        ok: true,
        message: "Connection test passed.",
        account: {
          id: result.userId,
          name: result.user?.name || "",
        },
        key: {
          id: result.key?.id || "",
          scopes: (result.key?.scopes || []).filter((scope: string) => scope === "write:knowledge" || scope === "read:account"),
        },
      });
    } catch {
      res.status(500).json({ ok: false, error: "Connection test failed" });
    }
  });

  app.post("/api/public/v1/leads", express.json({ limit: "48kb" }), async (req, res) => {
    try {
      const auth = req.headers.authorization || req.headers["x-api-key"];
      const result = await authenticatePublicApiKey(auth, "write:leads", req.path, req.method);
      if (await enforcePublicApiRateLimit(req, res, result, result ? "send" : "invalid")) return;
      if (!result) return res.status(401).json({ error: "Invalid API key or missing write:leads scope" });
      const lead = await recordPublicLead(result.userId, req.body || {});
      res.status(202).json({ success: true, lead: { id: lead.id, status: lead.status, source: lead.source } });
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Failed to save lead" });
    }
  });

  app.post("/api/public/v1/knowledge/sync", express.json({ limit: "512kb" }), async (req, res) => {
    let result: any = null;
    try {
      const auth = req.headers.authorization || req.headers["x-api-key"];
      result = await authenticatePublicApiKey(auth, "write:knowledge", req.path, req.method);
      const rateLimit = await checkPublicApiRateLimit({
        accountId: result?.userId,
        keyId: result?.key?.id,
        ip: getRequestIp(req),
        path: req.path,
        method: req.method,
        kind: result ? "send" : "invalid",
      });
      if (rateLimit.limited) {
        let failedItems: any[] = [];
        if (result?.userId) {
          let inputs: any[] = [];
          try {
            inputs = normalizeWebsiteKnowledgeSyncInputs(req.body || {});
          } catch {
            inputs = [];
          }
          failedItems = await recordWebsiteKnowledgeSyncFailures(
            result.userId,
            inputs,
            "Too many public API send requests. Please slow down and retry shortly.",
          ).catch(() => []);
        }
        res.setHeader("Retry-After", String(rateLimit.retryAfterSeconds));
        return res.status(429).json({
          success: false,
          error: "Too many public API send requests. Please slow down and retry shortly.",
          code: "PUBLIC_API_RATE_LIMITED",
          retryAfterSeconds: rateLimit.retryAfterSeconds,
          acceptedItems: [],
          failedItems,
        });
      }
      if (!result) return res.status(401).json({ error: "Invalid API key or missing write:knowledge scope" });
      const inputs = normalizeWebsiteKnowledgeSyncInputs(req.body || {});
      const syncResult = await syncWebsiteKnowledgeBatch(result.userId, inputs);
      const statusCode = syncResult.failedItems.length && !syncResult.acceptedItems.length ? 400 : 202;
      res.status(statusCode).json({
        success: syncResult.failedItems.length === 0,
        item: syncResult.acceptedItems[0] || null,
        acceptedItems: syncResult.acceptedItems,
        failedItems: syncResult.failedItems,
      });
    } catch (e: any) {
      const reason = e.message || "Failed to sync website knowledge";
      let failedItem: any = null;
      if (result?.userId) {
        failedItem = await recordWebsiteKnowledgeSyncFailure(result.userId, req.body || {}, reason).catch(() => null);
      }
      res.status(400).json({
        success: false,
        error: reason,
        acceptedItems: [],
        failedItems: failedItem ? [{
          sourceItemId: failedItem.sourceItemId,
          title: failedItem.title,
          type: failedItem.type,
          url: failedItem.url,
          errorReason: failedItem.errorReason,
          failedAt: failedItem.failedAt,
        }] : [],
      });
    }
  });

  app.get("/api/user/integrations/foundation", async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);
      const [wooCommerce, apiKeys, apiRequestLogs, webhookEndpoints, webhookDeliveries, leadCaptureAuth, integrationEvents, leadCaptureSummary] = await Promise.all([
        getWooCommerceStatus(userId),
        listApiKeys(userId),
        listApiRequestLogs(userId),
        listWebhookEndpoints(userId),
        listWebhookDeliveries(userId),
        getLeadCaptureAuthStatus(userId),
        listIntegrationEvents(userId),
        getIntegrationEventSummary(userId),
      ]);
      res.json({
        success: true,
        collections: INTEGRATION_FOUNDATION_COLLECTIONS,
        publicApiRateLimits: PUBLIC_API_RATE_LIMITS,
        webhookEvents: WEBHOOK_EVENT_TYPES,
        wooCommerce,
        leadCapture: {
          auth: leadCaptureAuth,
          events: integrationEvents.slice(0, 20),
          summary: leadCaptureSummary,
        },
        apiKeys,
        apiRequestLogs,
        webhookEndpoints,
        webhookDeliveries,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to load integration foundation" });
    }
  });

  app.post("/api/user/integrations/woocommerce/save", express.json({ limit: "64kb" }), async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const connection = await saveWooCommerceConnection(getStableUserId(user), req.body || {});
      res.json({ success: true, connection });
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Failed to save WooCommerce connection" });
    }
  });

  app.post("/api/user/integrations/woocommerce/test", express.json({ limit: "16kb" }), async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const connection = await testWooCommerceConnection(getStableUserId(user));
      res.json({ success: true, connection });
    } catch (e: any) {
      res.status(400).json({ success: false, error: e.message || "WooCommerce test failed" });
    }
  });

  app.delete("/api/user/integrations/woocommerce", express.json({ limit: "16kb" }), async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const connection = await removeWooCommerceConnection(getStableUserId(user));
      res.json({ success: true, connection });
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Failed to remove WooCommerce connection" });
    }
  });

  app.post("/api/user/integrations/woocommerce/products/preview", express.json({ limit: "32kb" }), async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const preview = await previewWooCommerceProducts(getStableUserId(user), req.body || {});
      res.json({ success: true, ...preview });
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Failed to preview WooCommerce products" });
    }
  });

  app.post("/api/user/integrations/woocommerce/products/sync", express.json({ limit: "512kb" }), async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const job = await syncWooCommerceProducts(getStableUserId(user), req.body || {});
      res.json({ success: true, job });
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Failed to sync WooCommerce products" });
    }
  });

  app.post("/api/user/integrations/api-keys", express.json({ limit: "32kb" }), async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const result = await createApiKey(getStableUserId(user), req.body || {});
      res.json({ success: true, ...result });
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Failed to create API key" });
    }
  });

  app.delete("/api/user/integrations/api-keys/:keyId", express.json({ limit: "16kb" }), async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const record = await revokeApiKey(getStableUserId(user), req.params.keyId);
      res.json({ success: true, record });
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Failed to revoke API key" });
    }
  });

  app.post("/api/user/integrations/webhooks", express.json({ limit: "64kb" }), async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const result = await createWebhookEndpoint(getStableUserId(user), req.body || {});
      res.json({ success: true, ...result });
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Failed to create webhook endpoint" });
    }
  });

  app.patch("/api/user/integrations/webhooks/:endpointId", express.json({ limit: "64kb" }), async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const endpoint = await updateWebhookEndpoint(getStableUserId(user), req.params.endpointId, req.body || {});
      res.json({ success: true, endpoint });
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Failed to update webhook endpoint" });
    }
  });

  app.post("/api/user/integrations/webhooks/:endpointId/regenerate-secret", express.json({ limit: "16kb" }), async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const result = await regenerateWebhookSecret(getStableUserId(user), req.params.endpointId);
      res.json({ success: true, ...result });
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Failed to regenerate webhook secret" });
    }
  });

  app.post("/api/user/integrations/webhooks/:endpointId/test", express.json({ limit: "16kb" }), async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const delivery = await sendWebhookTestEvent(getStableUserId(user), req.params.endpointId);
      res.json({ success: true, delivery });
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Failed to send test webhook" });
    }
  });

  app.delete("/api/user/integrations/webhooks/:endpointId", express.json({ limit: "16kb" }), async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      await deleteWebhookEndpoint(getStableUserId(user), req.params.endpointId);
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Failed to delete webhook endpoint" });
    }
  });

  app.get("/api/user/alert-preferences", async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);
      const preferences = normalizeDashboardAlertPreferences(
        await dbService.getUserExtraConfigValue(userId, DASHBOARD_ALERT_PREFERENCES_STORE_KEY).catch(() => null),
      );
      res.json({ preferences });
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Failed to load alert preferences" });
    }
  });

  app.patch("/api/user/alert-preferences", express.json({ limit: "64kb" }), async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);
      const preferences = normalizeDashboardAlertPreferences(req.body?.preferences || req.body);
      await dbService.saveUserExtraConfigPatch(userId, {
        [DASHBOARD_ALERT_PREFERENCES_STORE_KEY]: preferences,
      });
      res.json({ success: true, preferences });
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Failed to save alert preferences" });
    }
  });

  app.get("/api/user/dashboard-notifications/state", async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);
      const state = normalizeDashboardNotificationState(
        await dbService.getUserExtraConfigValue(userId, DASHBOARD_NOTIFICATION_STATE_STORE_KEY).catch(() => null),
      );
      res.json({ success: true, state });
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Failed to load dashboard notification state" });
    }
  });

  app.patch("/api/user/dashboard-notifications/state", express.json({ limit: "24kb" }), async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);
      const current = normalizeDashboardNotificationState(
        await dbService.getUserExtraConfigValue(userId, DASHBOARD_NOTIFICATION_STATE_STORE_KEY).catch(() => null),
      );
      const state = updateDashboardNotificationState(current, {
        ids: Array.isArray(req.body?.ids) ? req.body.ids : [],
        read: typeof req.body?.read === "boolean" ? req.body.read : undefined,
        completed: typeof req.body?.completed === "boolean" ? req.body.completed : undefined,
      });
      await dbService.saveUserExtraConfigPatch(userId, {
        [DASHBOARD_NOTIFICATION_STATE_STORE_KEY]: state,
      });
      res.json({ success: true, state });
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Failed to save dashboard notification state" });
    }
  });

  app.get("/api/user/preferences", async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);
      const showGetStarted = await dbService.getUserExtraConfigValue(userId, "show_get_started").catch(() => null);
      res.json({ success: true, showGetStarted });
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Failed to load preferences" });
    }
  });

  app.patch("/api/user/preferences", express.json({ limit: "32kb" }), async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);
      const { showGetStarted } = req.body || {};
      await dbService.saveUserExtraConfigPatch(userId, {
        show_get_started: typeof showGetStarted === "boolean" ? showGetStarted : null,
      });
      res.json({ success: true, showGetStarted });
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Failed to save preferences" });
    }
  });

  app.get("/api/user/config", async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const activeUserId = getStableUserId(user);
      console.log(`[Config API] Fetching for user ID: ${activeUserId}`);
      const config = await dbService.loadUserConfig(activeUserId);
      console.log(`[Config API] Found user: ${user.email} (ID: ${activeUserId}) | Wallet: ${user.wallet_balance}`);

      const existingBots = await dbService.getBotsByUser(activeUserId);
      const activeBots = existingBots.filter((b: any) => b.is_active !== 0).length;

      const subscriptions = await dbService.getSubscriptions(activeUserId);
      const limits = buildAccountLimits(user, subscriptions);
      const plan = limits.plan;
      const addons = limits.addons || addActiveAddonQuantities(subscriptions);
      const savedCapacityUsage = await getSavedBillingCapacityUsageForUser(activeUserId);
      const products = await dbService.listProducts(activeUserId).catch(() => []);
      const customers = await dbService.listCustomers(activeUserId).catch(() => []);
      const orders = await dbService.listOrders(activeUserId).catch(() => []);
      const monthStart = getMonthStartEpoch();
      const ordersThisMonth = orders.filter((order: any) => {
        const createdAt = normalizeTime(order.created_at || order.$createdAt || order.order_data?.createdAt || order.order_data?.created_at);
        return createdAt >= monthStart && !isOrderDeletedForLimit(order);
      }).length;
      const quotaBreakdowns = {
        whatsapp_instances: buildQuotaBreakdown({
          label: "WhatsApp Instances Capacity",
          used: activeBots,
          included: limits.access?.trialActive ? TRIAL_LIMITS.included_instances : Number(plan.included_instances || 0),
          addon: addons.instances,
          total: limits.instanceLimit
        }),
        products_services: buildQuotaBreakdown({
          label: "Products/Services Capacity",
          used: products.length,
          included: limits.access?.trialActive ? TRIAL_LIMITS.included_products : Number(plan.included_products || 0),
          addon: addons.productBundles * 30,
          total: limits.productLimit
        }),
        customers: buildQuotaBreakdown({
          label: "Customers Capacity",
          used: customers.length,
          included: limits.access?.trialActive ? Number(TRIAL_LIMITS.customers || 100) : Number(plan.customers || 0),
          addon: addons.customerBundles * 10000,
          total: limits.customerLimit
        }),
        orders_per_month: buildQuotaBreakdown({
          label: "Orders Per Month Capacity",
          used: ordersThisMonth,
          included: limits.access?.trialActive ? Number(TRIAL_LIMITS.orders_per_month || 50) : Number(plan.orders_per_month || 0),
          addon: addons.orderBundles * 2000,
          total: limits.orderLimit
        }),
        media_templates: buildQuotaBreakdown({
          label: "Media Templates Capacity",
          used: savedCapacityUsage.mediaTemplates,
          included: limits.access?.trialActive ? Number(TRIAL_LIMITS.media_templates || 25) : Number(plan.media_templates || 0),
          addon: addons.mediaTemplateBundles * 500,
          total: limits.mediaTemplateLimit
        }),
        media_groups: buildQuotaBreakdown({
          label: "Media Groups Capacity",
          used: savedCapacityUsage.mediaGroups,
          included: limits.access?.trialActive ? Number(TRIAL_LIMITS.media_groups || 0) : Number((plan as any).media_groups || 0),
          addon: 0,
          total: limits.mediaGroupLimit
        }),
        sequence_groups: buildQuotaBreakdown({
          label: "Sequence Groups Capacity",
          used: savedCapacityUsage.sequenceGroups,
          included: limits.access?.trialActive ? Number(TRIAL_LIMITS.sequence_groups || 0) : Number(plan.sequence_groups || 0),
          addon: addons.sequenceGroupBundles * 5,
          total: limits.sequenceGroupLimit
        }),
      };
      
      const publicConfig = sanitizeClientConfig(config || {});
      const clientGeminiStatus = await getClientGeminiStatus(activeUserId).catch(() => publicConfig.client_gemini);
      const trialAiRepliesUsed = await dbService.getTrialAiReplyUsage(activeUserId).catch(() => 0);
      const paidAccessConfirmed = await dbService.hasPaidAccessEvidence(activeUserId, user).catch(() => false);
      const billingAccessWithTrialReplies = getBillingAccess({ ...user, paid_access_confirmed: paidAccessConfirmed, trial_ai_replies_used: trialAiRepliesUsed }, now());
      const dashboardAlertPreferences = normalizeDashboardAlertPreferences(
        await dbService.getUserExtraConfigValue(activeUserId, DASHBOARD_ALERT_PREFERENCES_STORE_KEY).catch(() => null),
      );
      const nowSeconds = now();
      const todayStartSeconds = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
      const sevenDayStartSeconds = nowSeconds - (7 * 24 * 60 * 60);
      const [
        clientGeminiUsageTodayRows,
        clientGeminiUsageSevenDayRows,
        clientGeminiUsageTotalRows,
        clientGeminiTelemetryTodayRows,
        clientGeminiTelemetrySevenDayRows,
        clientGeminiTelemetryTotalRows,
      ] = await Promise.all([
        dbService.getUserAnalytics(activeUserId, todayStartSeconds, nowSeconds).catch(() => []),
        dbService.getUserAnalytics(activeUserId, sevenDayStartSeconds, nowSeconds).catch(() => []),
        dbService.getUserAnalytics(activeUserId, 0, nowSeconds).catch(() => []),
        listClientGeminiCacheTelemetry(activeUserId, todayStartSeconds, nowSeconds).catch(() => []),
        listClientGeminiCacheTelemetry(activeUserId, sevenDayStartSeconds, nowSeconds).catch(() => []),
        listClientGeminiCacheTelemetry(activeUserId, 0, nowSeconds).catch(() => []),
      ]);
      const clientGeminiUsage = buildClientGeminiUsageSummary({
        todayRows: clientGeminiUsageTodayRows as any,
        sevenDayRows: clientGeminiUsageSevenDayRows as any,
        totalRows: clientGeminiUsageTotalRows as any,
        todayTelemetryRows: clientGeminiTelemetryTodayRows as any,
        sevenDayTelemetryRows: clientGeminiTelemetrySevenDayRows as any,
        totalTelemetryRows: clientGeminiTelemetryTotalRows as any,
        cacheBoostEnabled: Boolean((clientGeminiStatus as any)?.cacheBoostEnabled),
      });
      const extraConfig = await dbService.getUserExtraConfig(activeUserId).catch(() => ({})) || {};
      const canonicalAdminPhone = getCanonicalAdminPhone(user, extraConfig, config);
      const isBusinessAssistantEnabled = isCanonicalBusinessAssistantEnabled(user, extraConfig, config);
      const pairing = getAdminPairingStatus(user, extraConfig);
      const walletBillingPurchasesEnabled = await getWalletBillingPurchasesEnabled(activeUserId).catch(() => false);
      res.json({
          ...publicConfig,
          proactive_lead_alerts: getProactiveLeadSettings(activeUserId),
          admin_number: canonicalAdminPhone,
          business_assistant_enabled: isBusinessAssistantEnabled,
          businessAssistantEnabled: isBusinessAssistantEnabled,
          is_business_assistant_enabled: isBusinessAssistantEnabled,
          admin_number_verified: pairing.isVerified,
          admin_verified_phone: extraConfig?.admin_verified_phone || "",
          client_gemini: clientGeminiStatus,
          client_gemini_usage: clientGeminiUsage,
          dashboard_alert_preferences: dashboardAlertPreferences,
          wallet_balance: user.wallet_balance ?? 0, 
          user_created_at: user.created_at || 0,
          subscriptions,
          product_limit: limits.productLimit,
          instance_limit: limits.instanceLimit,
          customer_limit: limits.customerLimit,
          order_limit: limits.orderLimit,
          media_template_limit: limits.mediaTemplateLimit,
          media_group_limit: limits.mediaGroupLimit,
          sequence_group_limit: limits.sequenceGroupLimit,
          billing_access: {
            ...billingAccessWithTrialReplies,
            trialAiRepliesUsed,
            trialAiRepliesLimit: APP_TRIAL_FREE_AI_REPLIES,
            trialAiRepliesRemaining: Math.max(0, APP_TRIAL_FREE_AI_REPLIES - trialAiRepliesUsed),
          },
          quota_breakdowns: quotaBreakdowns,
          billing_features: buildBillingFeatures(limits.planId, limits.access, config, user),
          wallet_billing_purchases_enabled: walletBillingPurchasesEnabled,
          trial_extension_used: await hasUsedTrialExtension(activeUserId, user, extraConfig).catch(() => false),
          active_addons: summarizeActiveSubscriptions(subscriptions),
          setup_status: buildSetupStatus(subscriptions),
          ai_usage_rates: AI_USAGE_RATES,
          plan: {
             id: limits.planId,
             ...plan,
             trial_expires_at: user.trial_expires_at || null,
             plan_expiry: user.plan_expiry || null
          },
          role: user.role || 'user',
          id: user.$id
      });
    } catch(e: any) { 
        console.error(`[Config] Error for user ${req.query.userId}:`, e);
        res.status(500).json({ error: e.message }); 
    }
  });

  app.get("/api/user/customers", async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);
      const customers = await dbService.listCustomers(userId);
      res.json(customers);
    } catch(e: any) { res.status(500).json({ error: e.message }); }
  });

  function resolveRealBotIdFromCustomer(customer: any, userBots: any[]): string {
    const profile = customer?.profile || {};
    const candidates = [
      profile.originBotId,
      profile.lastInboundBotId,
      profile.lastOutboundBotId,
      profile.actualBotId,
      profile.botInstanceId,
      profile.botId,
    ];
    for (const c of candidates) {
      if (c && typeof c === "string") {
        const trimmed = c.trim();
        if (trimmed && userBots.some((b) => b.$id === trimmed || b.id === trimmed)) {
          return trimmed;
        }
      }
    }
    const botJids = userBots.map((b) => String(b.phone_jid || b.jid || "").split("@")[0]).filter(Boolean);
    const profileBotJids = [
      profile.botJid,
      profile.whatsapp_number,
      profile.phoneJid,
    ].map((j) => String(j || "").split("@")[0]).filter(Boolean);

    for (const pj of profileBotJids) {
      const idx = botJids.indexOf(pj);
      if (idx !== -1) {
        return userBots[idx].$id || userBots[idx].id;
      }
    }
    if (userBots.length === 1) {
      return userBots[0].$id || userBots[0].id;
    }
    return "";
  }

  function normalizeTimestampToMs(value: any): number {
    if (!value) return 0;
    if (typeof value === "number") {
      if (value < 10000000000) {
        return value * 1000;
      }
      return value;
    }
    if (typeof value === "string") {
      const parsed = Date.parse(value);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
      const num = Number(value);
      if (!Number.isNaN(num) && num > 0) {
        if (num < 10000000000) {
          return num * 1000;
        }
        return num;
      }
    }
    return 0;
  }
  function resolveInboxContactIdentity(params: {
    customer: any;
    customerJid: string;
    profile: any;
    recentMessages: any[];
  }): {
    displayName: string;
    whatsappName: string;
    phone: string;
    contactLabel: string;
    sendTargetJid: string;
    /** @deprecated use sendTargetJid */ sendableJid: string;
    rawCustomerJid: string;
    isLidOnly: boolean;
    hasRealPhone: boolean;
  } {
    const customer = params.customer || {};
    const customerJid = params.customerJid || "";
    const profile = params.profile || {};
    const recentMessages = params.recentMessages || [];

    // Helper: is this a valid @s.whatsapp.net JID?
    const isPhoneJid = (v: any) => /^\d+@s\.whatsapp\.net$/.test(String(v || ""));
    // Helper: is this a valid @lid JID (Baileys active chat)?
    const isLidJid  = (v: any) => /^[^@\s]+@(lid|hosted\.lid)$/.test(String(v || ""));
    // Helper: is this a sendable JID for Baileys (phone OR lid, not group/broadcast)?
    const isSendable = (v: any) => {
      const s = String(v || "");
      if (!s || !s.includes("@")) return false;
      if (s.endsWith("@g.us") || s === "status@broadcast") return false;
      return isPhoneJid(s) || isLidJid(s);
    };

    const isLidOnly = isLidJid(customerJid) && !isPhoneJid(customerJid);

    // --- Phone resolution ---
    let phone = "";
    let hasRealPhone = false;

    if (isPhoneJid(customerJid)) {
      phone = "+" + customerJid.split("@")[0];
      hasRealPhone = true;
    } else {
      // Check profile fields in priority order
      const phoneJidCandidates = [
        profile.phoneJid,
        profile.jid,
        profile.remoteJidAlt,
        profile.remote_jid_alt,
        customer.remoteJidAlt,
        customer.remote_jid_alt,
        profile.whatsapp_number && String(profile.whatsapp_number).includes("@") ? profile.whatsapp_number : null,
      ].filter(Boolean);
      for (const pj of phoneJidCandidates) {
        if (isPhoneJid(pj)) {
          phone = "+" + String(pj).split("@")[0];
          hasRealPhone = true;
          break;
        }
      }

      if (!hasRealPhone) {
        // Extract digits from plain phone fields
        const rawCandidates = [
          profile.phone,
          profile.whatsapp_number,
          profile.phoneNumber,
          profile.customerPhone,
          profile.sharedPhone,
          profile.sharedPhoneNumber,
          profile.whatsappProfile?.phone,
          customer.phone,
          customer.whatsapp_number,
        ];
        for (const cand of rawCandidates) {
          if (!cand || typeof cand !== "string") continue;
          // Skip account:email type strings
          if (cand.includes("@") || cand.startsWith("account:")) continue;
          const digits = cand.replace(/[^0-9]/g, "");
          if (digits.length >= 8 && digits.length <= 15) {
            phone = "+" + digits;
            hasRealPhone = true;
            break;
          }
        }
      }
    }

    if (!phone || phone === "Phone not available") {
      phone = "Phone not available Â· WhatsApp ID";
      hasRealPhone = false;
    }

    // --- Name resolution ---
    let displayName = "";

    // 1. WhatsApp push name from recent inbound messages
    const latestInbound = recentMessages.find((m) => m.role === "user");
    if (latestInbound?.senderName && typeof latestInbound.senderName === "string") {
      const candidate = latestInbound.senderName.trim();
      if (candidate && !candidate.includes("@") && !/^\+?[0-9\s\-()]{7,20}$/.test(candidate)) {
        displayName = candidate;
      }
    }

    // 2. WhatsApp profile names (pushName / notifyName)
    const whatsappProfile = (() => {
      const raw = profile.whatsappProfile;
      if (!raw) return {};
      if (typeof raw === "string") { try { return JSON.parse(raw); } catch { return {}; } }
      return raw || {};
    })();

    if (!displayName) {
      const candidates = [
        whatsappProfile.displayName,
        whatsappProfile.pushName,
        whatsappProfile.notifyName,
        whatsappProfile.verifiedName,
        whatsappProfile.businessName,
        profile.pushName,
        profile.notifyName,
        profile.notify,
        profile.whatsappName,
        profile.whatsapp_name,
        customer.whatsappName,
        customer.whatsapp_name,
        profile.displayName,
        profile.display_name,
        customer.displayName,
        customer.display_name,
      ];
      for (const c of candidates) {
        if (c && typeof c === "string" && c.trim() && !c.includes("@") && !/^\+?[0-9\s\-()]{7,20}$/.test(c.trim())) {
          displayName = c.trim();
          break;
        }
      }
    }

    // 3. Saved customer name / profile name
    if (!displayName) {
      const savedCandidates = [
        profile.name,
        profile.savedName,
        profile.customerName,
        profile.customer_name,
        customer.name,
        customer.displayName,
        customer.display_name,
      ];
      for (const c of savedCandidates) {
        if (c && typeof c === "string" && c.trim() && !c.includes("@") && !/^\+?[0-9\s\-()]{7,20}$/.test(c.trim())) {
          displayName = c.trim();
          break;
        }
      }
    }

    // 4. Contact identity from the broader identity utility
    if (!displayName) {
      const identity = getCustomerContactIdentity(customer);
      if (identity.hasRealName && identity.displayName && identity.displayName !== "WhatsApp contact") {
        displayName = identity.displayName;
      }
    }

    // 5. Fall back to phone number as display name
    if (!displayName && hasRealPhone) {
      displayName = phone;
    }

    // 6. Final fallback
    if (!displayName) {
      displayName = "WhatsApp contact";
    }

    const whatsappName =
      whatsappProfile.displayName ||
      whatsappProfile.pushName ||
      whatsappProfile.notifyName ||
      profile.pushName ||
      profile.notify ||
      "";

    // --- sendTargetJid resolution ---
    // Priority: real phone JID > mapped phone from profile > LID JID (Baileys active) > derived from phone digits
    let sendTargetJid = "";
    if (isPhoneJid(customerJid)) {
      sendTargetJid = customerJid;
    } else if (isPhoneJid(profile.phoneJid)) {
      sendTargetJid = profile.phoneJid;
    } else if (isPhoneJid(profile.jid)) {
      sendTargetJid = profile.jid;
    } else if (isLidJid(customerJid)) {
      // @lid is the active Baileys chat JID â€” use it directly
      sendTargetJid = customerJid;
    } else if (hasRealPhone) {
      // Reconstruct JID from digits
      const digits = phone.replace(/\D/g, "");
      if (digits.length >= 8) sendTargetJid = `${digits}@s.whatsapp.net`;
    }

    // Validate the resolved target (must be sendable, not a group)
    if (!isSendable(sendTargetJid)) {
      sendTargetJid = "";
    }

    let contactLabel = "";
    if (isLidOnly && !hasRealPhone) {
      contactLabel = "WhatsApp ID";
    }

    const usableResolvedName = (value: any) => {
      const text = String(value || "").trim();
      if (!text) return "";
      if (text.includes("@")) return "";
      if (/^\+?[0-9\s\-()]{7,20}$/.test(text)) return "";
      if (!/[\p{L}]/u.test(text)) return "";
      return text;
    };
    const latestInboundName = typeof latestInbound?.senderName === "string" ? latestInbound.senderName.trim() : "";
    const enrichedProfile = {
      ...profile,
      ...(latestInboundName && !profile.pushName ? { pushName: latestInboundName } : {}),
      ...(latestInboundName && !profile.notify ? { notify: latestInboundName } : {}),
      whatsappProfile,
    };
    const canonicalIdentity = resolveCustomerIdentity({
      jid: customerJid,
      lid: enrichedProfile.lidJid || enrichedProfile.lid || enrichedProfile.hostedLid || enrichedProfile.whatsappLid,
      phone: customer.phone || customer.whatsapp_number,
      importedPhone: enrichedProfile.importedPhone || customer.importedPhone,
      crmLeadPhone: enrichedProfile.crmLeadPhone || customer.customerPhone || customer.customer_phone,
      whatsappProfilePhone: enrichedProfile.whatsapp_number || enrichedProfile.whatsappNumber || whatsappProfile.phone,
      profile: enrichedProfile,
      record: { ...customer, profile: enrichedProfile },
      aliases: [
        customerJid,
        enrichedProfile.phoneJid,
        enrichedProfile.jid,
        enrichedProfile.remoteJidAlt,
        enrichedProfile.remote_jid_alt,
        customer.remoteJidAlt,
        customer.remote_jid_alt,
      ].filter(Boolean),
    });
    const contactIdentity = getCustomerContactIdentity(
      { ...customer, profile: enrichedProfile },
      latestInboundName ? { profile: { pushName: latestInboundName, notify: latestInboundName }, pushName: latestInboundName } : null,
    );
    const resolvedHasRealPhone = Boolean(contactIdentity.hasRealPhone || canonicalIdentity.displayIdentity.phoneIsTrusted || hasRealPhone);
    const resolvedPhone = resolvedHasRealPhone
      ? (contactIdentity.displayPhone || canonicalIdentity.displayIdentity.displayPhone || phone || `+${canonicalIdentity.canonicalPhone}`)
      : "Phone not available Â· WhatsApp ID";
    const resolvedDisplayName = [
      contactIdentity.hasRealName ? contactIdentity.displayName : "",
      latestInboundName,
      canonicalIdentity.displayIdentity.displayName,
      customer.name,
      customer.displayName,
      customer.display_name,
      displayName,
    ].map(usableResolvedName).find(Boolean) || (resolvedHasRealPhone ? resolvedPhone : "WhatsApp contact");
    const resolvedWhatsAppName = [
      whatsappProfile.displayName,
      whatsappProfile.pushName,
      whatsappProfile.notifyName,
      enrichedProfile.pushName,
      enrichedProfile.notifyName,
      enrichedProfile.notify,
      latestInboundName,
      whatsappName,
    ].map(usableResolvedName).find(Boolean) || "";
    let resolvedSendTargetJid = cleanInboxTargetJid(
      canonicalIdentity.activeSendJid ||
      profile.phoneJid ||
      profile.jid ||
      sendTargetJid ||
      customerJid,
    );
    if (!isSendable(resolvedSendTargetJid) && canonicalIdentity.canonicalPhone) {
      resolvedSendTargetJid = `${canonicalIdentity.canonicalPhone}@s.whatsapp.net`;
    }
    if (!isSendable(resolvedSendTargetJid)) {
      resolvedSendTargetJid = "";
    }
    const resolvedIsLidOnly = Boolean((canonicalIdentity.displayIdentity.isLidOnly || isLidOnly) && !resolvedHasRealPhone);
    const resolvedContactLabel = resolvedHasRealPhone ? "" : (resolvedIsLidOnly ? "WhatsApp ID" : (contactIdentity.contactLabel || contactLabel || "WhatsApp ID"));

    return {
      displayName: resolvedDisplayName,
      whatsappName: resolvedWhatsAppName,
      phone: resolvedPhone,
      contactLabel: resolvedContactLabel,
      sendTargetJid: resolvedSendTargetJid,
      sendableJid: resolvedSendTargetJid,  // backward compat
      rawCustomerJid: customerJid,
      isLidOnly: resolvedIsLidOnly,
      hasRealPhone: resolvedHasRealPhone
    };
  }

  app.get("/api/inbox/conversations", async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);

      const requestedBotId = req.query.botId as string;
      const q = String(req.query.q || "").trim().toLowerCase();
      const limit = Math.min(Number(req.query.limit || 30), 100);
      const cursor = req.query.cursor as string; // format: "lastMessageAt_customerJid"
      const labelFilter = req.query.label as string;
      const unreadFilter = req.query.unread as string;

      const bots = await dbService.getBotsByUser(userId);
      const botIds = bots.map((b: any) => b.$id);

      if (requestedBotId && !botIds.includes(requestedBotId)) {
        return res.status(403).json({ error: "Unauthorized bot access" });
      }

      const ownerKeys = Array.from(new Set([
        buildAccountDataOwnerKey(user),
        ...collectAccountDataOwnerCandidates(user, bots)
      ].filter(Boolean)));

      let allCustomers: any[] = [];
      let allRecentMessages: any[] = [];

      // Only query messages for the requested bot if specified, or all owned bots
      const targetOwnerKeys = requestedBotId ? [requestedBotId] : ownerKeys;

      if (q || labelFilter) {
        // Search queries or label filtering: search matching conversations server-side
        await Promise.all(targetOwnerKeys.map(async (key) => {
          let docs: any[] = [];

          // 1. Search JIDs
          try {
            const resJid = await databases.listDocuments(DATABASE_ID, COLLECTIONS.CUSTOMERS, [
              AppwriteQuery.equal('bot_id', key),
              AppwriteQuery.limit(200)
            ]);
            docs = docs.concat(resJid.documents);
          } catch {}

          // 2. Try Appwrite search query on profile for search terms (q and/or labelFilter)
          const terms = [q, labelFilter].filter(Boolean);
          for (const term of terms) {
            try {
              const resProfile = await databases.listDocuments(DATABASE_ID, COLLECTIONS.CUSTOMERS, [
                AppwriteQuery.equal('bot_id', key),
                AppwriteQuery.search('profile', term),
                AppwriteQuery.limit(100)
              ]);
              docs = docs.concat(resProfile.documents);
            } catch {}
          }

          // 3. Fetch more customer profiles to guarantee search/filter coverage
          try {
            const resRecent = await databases.listDocuments(DATABASE_ID, COLLECTIONS.CUSTOMERS, [
              AppwriteQuery.equal('bot_id', key),
              AppwriteQuery.limit(300)
            ]);
            docs = docs.concat(resRecent.documents);
          } catch {}

          // De-duplicate customer docs
          const uniqueDocsMap = new Map();
          for (const d of docs) {
            uniqueDocsMap.set(d.$id, d);
          }
          allCustomers = allCustomers.concat(Array.from(uniqueDocsMap.values()));

          // 4. Try searching messages text if q is active
          if (q) {
            try {
              const resMsgs = await databases.listDocuments(DATABASE_ID, COLLECTIONS.MESSAGES, [
                AppwriteQuery.equal('bot_id', key),
                AppwriteQuery.search('text', q),
                AppwriteQuery.limit(200)
              ]);
              allRecentMessages = allRecentMessages.concat(resMsgs.documents);
            } catch {
              const resMsgs = await dbService.listRecentInboxMessagesForOwner(key, 500).catch(() => []);
              allRecentMessages = allRecentMessages.concat(resMsgs);
            }
          } else {
            const resMsgs = await dbService.listRecentInboxMessagesForOwner(key, 500).catch(() => []);
            allRecentMessages = allRecentMessages.concat(resMsgs);
          }
        }));
      } else {
        // No search query and no label filter: fetch recent messages and only a limited number of customers to avoid loading everything
        await Promise.all(targetOwnerKeys.map(async (key) => {
          const [msgs, custs] = await Promise.all([
            dbService.listRecentInboxMessagesForOwner(key, 1000).catch(() => []),
            databases.listDocuments(DATABASE_ID, COLLECTIONS.CUSTOMERS, [
              AppwriteQuery.equal('bot_id', key),
              AppwriteQuery.limit(200)
            ]).then(res => res.documents).catch(() => [])
          ]);
          allRecentMessages = allRecentMessages.concat(msgs);
          allCustomers = allCustomers.concat(custs);
        }));
      }

      // Add baseline customers
      const baselineCustomers = await dbService.listCustomers(userId).catch(() => []);
      allCustomers = allCustomers.concat(baselineCustomers);

      const uniqueCustomersMap = new Map<string, any>();
      for (const c of allCustomers) {
        if (!c) continue;
        const key = `${c.bot_id}:${c.customer_id || c.id || c.$id}`;
        if (!uniqueCustomersMap.has(key)) {
          uniqueCustomersMap.set(key, c);
        }
      }
      const uniqueCustomers = Array.from(uniqueCustomersMap.values());

      const messagesByCustomer = new Map<string, any[]>();
      for (const m of allRecentMessages) {
        if (!m || !m.customer_id) continue;
        const canonicalKey = String(m.customer_id).split("@")[0].toLowerCase();
        if (!messagesByCustomer.has(canonicalKey)) {
          messagesByCustomer.set(canonicalKey, []);
        }
        messagesByCustomer.get(canonicalKey)!.push(m);
      }

      for (const msgs of messagesByCustomer.values()) {
        msgs.sort((a, b) => normalizeTimestampToMs(b.timestamp) - normalizeTimestampToMs(a.timestamp));
      }

      const canonicalKeys = new Set<string>();
      for (const key of messagesByCustomer.keys()) {
        canonicalKeys.add(key);
      }
      for (const c of uniqueCustomers) {
        const jid = resolveCustomerChatJid(c) || c.customer_id || "";
        const key = jid.split("@")[0].toLowerCase();
        if (key) canonicalKeys.add(key);
      }

      const mappedRows: any[] = [];
      for (const key of Array.from(canonicalKeys)) {
        const matchingCustomers = uniqueCustomers.filter((c) => {
          const jid = resolveCustomerChatJid(c) || c.customer_id || "";
          return jid.split("@")[0].toLowerCase() === key;
        });

        const matchingMsgs = messagesByCustomer.get(key) || [];
        const latestMsg = matchingMsgs[0];

        matchingCustomers.sort((a, b) => {
          const aLen = Object.keys(a.profile || {}).length;
          const bLen = Object.keys(b.profile || {}).length;
          return bLen - aLen;
        });
        const customer = matchingCustomers[0];
        const profile = customer?.profile ? (typeof customer.profile === 'string' ? JSON.parse(customer.profile) : customer.profile) : {};

        const customerJid = customer ? (resolveCustomerChatJid(customer) || customer.customer_id) : `${key}@s.whatsapp.net`;
        const identity = resolveInboxContactIdentity({ customer, customerJid, profile, recentMessages: matchingMsgs });

        let lastMessageAt = 0;
        let lastMessagePreview = "";
        let lastDirection = "user";

        if (latestMsg) {
          lastMessageAt = normalizeTimestampToMs(latestMsg.timestamp);
          lastMessagePreview = latestMsg.text || "";
          lastDirection = latestMsg.role === "user" ? "user" : "model";
        } else {
          lastMessageAt = normalizeTimestampToMs(profile.lastMessageAt || customer?.last_message_at || customer?.$updatedAt || customer?.updated_at);
          lastMessagePreview = profile.lastMessage || profile.lastBotReply || "";
          lastDirection = profile.lastDirection || (profile.lastBotReply ? "model" : "user");
        }

        const aiPaused = !!(profile.manualReviewRequired || profile.botReplyPausedPermanent || profile.aiPaused === true || profile.ai_paused === true || profile.botReplyControl === "paused_permanent");
        const replyControlStatus = profile.botReplyControl || "";
        const source = profile.sourceDetail || "";

        const resolvedBotId = resolveRealBotIdFromCustomer(customer || { profile }, bots);
        const targetBot = bots.find((b: any) => b.$id === resolvedBotId);

        const labels = Array.from(new Set([
          ...(Array.isArray(profile.labels) ? profile.labels : []),
          ...(Array.isArray(profile.crmLabels) ? profile.crmLabels : []),
          ...(profile.label ? [profile.label] : []),
          ...(profile.crmLabel ? [profile.crmLabel] : [])
        ]));
        const leadStatus = profile.leadStatus || customer?.leadStatus || "";
        const lifecycleStage = profile.lifecycleStage || customer?.lifecycleStage || "";

        mappedRows.push({
          dataOwnerKey: customer?.bot_id || ownerKeys[0],
          botId: resolvedBotId,
          botName: targetBot?.name || "WhatsApp Instance",
          botJid: targetBot?.phone_jid || targetBot?.jid || "",
          instanceNumber: (() => { const rawJid = String(targetBot?.phone_jid || targetBot?.jid || ""); const part = rawJid.split("@")[0]; return /^[0-9]+$/.test(part) ? part : ""; })(),
          customerJid: identity.rawCustomerJid,
          canonicalCustomerKey: key,
          displayName: identity.displayName,
          whatsappName: identity.whatsappName,
          phone: identity.phone,
          contactLabel: identity.contactLabel,
          sendTargetJid: identity.sendTargetJid,
          sendableJid: identity.sendTargetJid,   // backward compat for frontend
          rawCustomerJid: identity.rawCustomerJid,
          isLidOnly: identity.isLidOnly,
          hasRealPhone: identity.hasRealPhone,
          lastMessagePreview,
          lastMessageAt,
          lastDirection,
          unreadCount: profile.inboxUnread ? 1 : 0,
          unread: !!profile.inboxUnread,
          aiPaused,
          replyControlStatus,
          source,
          labels,
          leadStatus,
          lifecycleStage,
        });
      }

      let resultRows = mappedRows;

      if (requestedBotId) {
        resultRows = resultRows.filter((r) => r.botId === requestedBotId);
      }

      // Filter by label
      if (labelFilter && labelFilter !== "All Labels") {
        resultRows = resultRows.filter((r) => Array.isArray(r.labels) && r.labels.includes(labelFilter));
      }

      // Filter by unread
      if (unreadFilter === "1" || unreadFilter === "true") {
        resultRows = resultRows.filter((r) => r.unread);
      }

      if (q) {
        resultRows = resultRows.filter((r) => {
          const displayName = String(r.displayName || "").toLowerCase();
          const phone = String(r.phone || "").toLowerCase();
          const preview = String(r.lastMessagePreview || "").toLowerCase();
          const wName = String(r.whatsappName || "").toLowerCase();
          const jid = String(r.customerJid || "").toLowerCase();
          const labels = Array.isArray(r.labels) ? r.labels.map(l => String(l).toLowerCase()) : [];
          const status = String(r.leadStatus || "").toLowerCase();
          const stage = String(r.lifecycleStage || "").toLowerCase();

          return displayName.includes(q) ||
                 phone.includes(q) ||
                 preview.includes(q) ||
                 wName.includes(q) ||
                 jid.includes(q) ||
                 labels.some(l => l.includes(q)) ||
                 status.includes(q) ||
                 stage.includes(q);
        });
      }

      await Promise.all(resultRows.map(async (r: any) => {
        if (!r.botId) {
          r.canReply = false;
          r.replyDisabledReason = bots.length > 1
            ? "Select a WhatsApp instance to reply"
            : "No active WhatsApp instance available";
        } else {
          const providerConfig = await dbService.getBotProviderConfig(r.botId).catch(() => null);
          if (providerConfig && providerConfig.providerType === "whatsapp_cloud_api") {
            r.canReply = false;
            r.replyDisabledReason = "Cloud API sending is not active yet";
          } else {
            // Allow sending if sendTargetJid is set â€” includes @lid active chats
            const possibleJid = cleanInboxTargetJid(r.sendTargetJid || r.customerJid);
            if (!isInboxSendableJid(possibleJid)) {
              r.canReply = false;
              r.replyDisabledReason = "Cannot send: no sendable WhatsApp JID available for this contact";
            } else {
              r.canReply = true;
              r.replyDisabledReason = "";
            }
          }
        }
      }));

      // Sort by latest message timestamp descending with tie breakers
      resultRows.sort((a, b) => {
        if (b.lastMessageAt !== a.lastMessageAt) {
          return b.lastMessageAt - a.lastMessageAt;
        }
        return String(a.customerJid).localeCompare(String(b.customerJid));
      });

      // Apply cursor pagination
      let paginatedRows = resultRows;
      if (cursor) {
        const parts = cursor.split("_");
        const cursorTime = Number(parts[0]) || 0;
        const cursorJid = parts.slice(1).join("_");

        paginatedRows = resultRows.filter((r) => {
          if (r.lastMessageAt < cursorTime) return true;
          if (r.lastMessageAt === cursorTime && String(r.customerJid).localeCompare(cursorJid) > 0) return true;
          return false;
        });
      }

      const hasMore = paginatedRows.length > limit;
      const slicedRows = paginatedRows.slice(0, limit);
      let nextCursor: string | null = null;
      if (hasMore && slicedRows.length > 0) {
        const lastRow = slicedRows[slicedRows.length - 1];
        nextCursor = `${lastRow.lastMessageAt}_${lastRow.customerJid}`;
      }

      res.json({
        rows: slicedRows,
        nextCursor,
        hasMore
      });
    } catch (e: any) {
      console.error("[Inbox API] GET conversations failed:", e);
      res.status(500).json({ error: e.message || "Failed to list conversations" });
    }
  });

  app.post("/api/inbox/conversations/:customerJid/read", express.json(), async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);

      const { customerJid } = req.params;
      const { botId } = req.body;

      if (!botId) {
        return res.status(400).json({ error: "Missing botId" });
      }

      const bots = await dbService.getBotsByUser(userId);
      const botIds = bots.map((b: any) => b.$id);
      if (!botIds.includes(botId)) {
        return res.status(403).json({ error: "Unauthorized bot access" });
      }

      const profile = await dbService.getCustomerProfile(botId, customerJid) || {};
      profile.inboxUnread = false;
      profile.inboxLastReadAt = Date.now();

      await dbService.updateCustomerProfile(botId, customerJid, profile);

      res.json({ success: true });
    } catch (e: any) {
      console.error("[Inbox API] POST read failed:", e);
      res.status(500).json({ error: e.message || "Failed to mark as read" });
    }
  });

  app.post("/api/inbox/conversations/:customerJid/unread", express.json(), async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);

      const { customerJid } = req.params;
      const { botId } = req.body;

      if (!botId) {
        return res.status(400).json({ error: "Missing botId" });
      }

      const bots = await dbService.getBotsByUser(userId);
      const botIds = bots.map((b: any) => b.$id);
      if (!botIds.includes(botId)) {
        return res.status(403).json({ error: "Unauthorized bot access" });
      }

      const profile = await dbService.getCustomerProfile(botId, customerJid) || {};
      profile.inboxUnread = true;

      await dbService.updateCustomerProfile(botId, customerJid, profile);

      res.json({ success: true });
    } catch (e: any) {
      console.error("[Inbox API] POST unread failed:", e);
      res.status(500).json({ error: e.message || "Failed to mark as unread" });
    }
  });

  app.post("/api/inbox/conversations/:customerJid/labels", express.json(), async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);

      const { customerJid } = req.params;
      const { botId, labels } = req.body;

      if (!botId) {
        return res.status(400).json({ error: "Missing botId" });
      }

      const bots = await dbService.getBotsByUser(userId);
      const botIds = bots.map((b: any) => b.$id);
      if (!botIds.includes(botId)) {
        return res.status(403).json({ error: "Unauthorized bot access" });
      }

      const profile = await dbService.getCustomerProfile(botId, customerJid) || {};
      profile.labels = Array.isArray(labels) ? labels.map(String) : [];
      profile.crmLabels = profile.labels;

      await dbService.updateCustomerProfile(botId, customerJid, profile);

      res.json({ success: true, labels: profile.labels });
    } catch (e: any) {
      console.error("[Inbox API] POST labels failed:", e);
      res.status(500).json({ error: e.message || "Failed to update labels" });
    }
  });

  app.get("/api/inbox/conversations/:customerJid/messages", async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);

      const { customerJid } = req.params;
      const botId = (req.query.botId || req.body.botId) as string;
      const dataOwnerKeyInput = (req.query.dataOwnerKey || req.body.dataOwnerKey) as string;

      const bots = await dbService.getBotsByUser(userId);
      const botIds = bots.map((b: any) => b.$id);
      const userOwnerKey = buildAccountDataOwnerKey(user);

      let hasAccess = false;
      if (botId && botIds.includes(botId)) {
        hasAccess = true;
      }
      if (dataOwnerKeyInput && dataOwnerKeyInput === userOwnerKey) {
        hasAccess = true;
      }
      if (botIds.length > 0 && !botId && !dataOwnerKeyInput) {
        hasAccess = true;
      }

      if (!hasAccess) {
        return res.status(403).json({ error: "Unauthorized access to conversation" });
      }

      const dataOwnerKey = dataOwnerKeyInput || userOwnerKey;
      const limit = Math.min(Number(req.query.limit || 50), 100);

      const customerIds = new Set<string>();
      customerIds.add(customerJid.split("@")[0]);

      const customerProfile = await dbService.getCustomerProfile(dataOwnerKey, customerJid).catch(() => null);
      if (customerProfile) {
        if (customerProfile.jid) customerIds.add(customerProfile.jid.split("@")[0]);
        if (customerProfile.phoneJid) customerIds.add(customerProfile.phoneJid.split("@")[0]);
        if (customerProfile.lidJid) customerIds.add(customerProfile.lidJid.split("@")[0]);
        if (customerProfile.customer_id) customerIds.add(customerProfile.customer_id.split("@")[0]);
      }

      const candidates = collectAccountDataOwnerCandidates(user, bots);
      const candidateKeys = Array.from(new Set([dataOwnerKey, ...candidates].filter(Boolean)));

      let allMessages: any[] = [];
      await Promise.all(candidateKeys.map(async (key) => {
        await Promise.all(Array.from(customerIds).map(async (cid) => {
          const targetJid = cid.includes("@") ? cid : `${cid}@s.whatsapp.net`;
          const msgs = await dbService.getChatHistory(key, targetJid, limit).catch(() => []);
          allMessages = allMessages.concat(msgs.map((msg: any) => ({ ...msg, ownerKey: key, sourceCustomerJid: targetJid })));
        }));
      }));

      const uniqueMsgsMap = new Map<string, any>();
      for (const m of allMessages) {
        if (!m) continue;
        const msgId = m.messageId || m.id;
        if (msgId) {
          if (!uniqueMsgsMap.has(msgId) || normalizeTimestampToMs(m.timestamp) > normalizeTimestampToMs(uniqueMsgsMap.get(msgId).timestamp)) {
            uniqueMsgsMap.set(msgId, m);
          }
        }
      }

      const uniqueMessages = Array.from(uniqueMsgsMap.values());
      uniqueMessages.sort((a, b) => normalizeTimestampToMs(a.timestamp) - normalizeTimestampToMs(b.timestamp));

      const sliced = uniqueMessages.slice(-limit);

      const result = await Promise.all(sliced.map(async (m: any) => {
        let text = m.text || "";
        const ownerKey = String(m.ownerKey || dataOwnerKey || "");
        const sourceCustomerJid = String(m.sourceCustomerJid || customerJid || "");
        const isAudioPlaceholder = m.role === "user" && (
          text.startsWith("Voice note received")
          || text.startsWith("Voice note:")
          || text.startsWith("[Voice note received")
          || text.startsWith("[Audio]")
        );
        const isImagePlaceholder = m.role === "user" && (
          text === "Media"
          || text === "[Image Message]"
          || text.startsWith("[Image]")
        );
        if (ownerKey && m.messageId && (isAudioPlaceholder || isImagePlaceholder)) {
          const durableRecord = await getSavedMediaContextByMessage({
            botId: ownerKey,
            customerJid: sourceCustomerJid,
            messageId: String(m.messageId),
            type: isAudioPlaceholder ? "audio" : "image",
            purpose: isAudioPlaceholder ? "customer_ai_audio_understanding" : "customer_ai_image_understanding",
          }).catch(() => null);
          if (durableRecord?.useful) {
            text = buildMediaContextHistoryText(durableRecord, text) || text;
          }
        }
        let messageType = "text";
        let hasMedia = false;
        let caption = "";
        let fileName = "";
        let mimeType = "";
        let mediaUrl = "";

        const isImage = text.startsWith("[Image]") || text === "Media" && m.role === "user";
        const isVideo = text.startsWith("[Video]");
        const isAudio = text.startsWith("[Audio]") || text.startsWith("Voice note");
        const isDoc = text.startsWith("[Document");
        const isSticker = text.includes("sticker");

        if (isImage || isVideo || isAudio || isDoc || isSticker) {
          hasMedia = true;
          if (isImage) {
            messageType = "image";
            caption = text.replace(/^\[Image\]\s*/, "");
            mimeType = "image/jpeg";
          } else if (isVideo) {
            messageType = "video";
            caption = text.replace(/^\[Video\]\s*/, "");
            mimeType = "video/mp4";
          } else if (isAudio) {
            messageType = "audio";
            mimeType = "audio/ogg";
          } else if (isDoc) {
            messageType = "document";
            const match = text.match(/^\[Document:\s*([^\]]+)\]\s*(.*)/);
            fileName = match ? match[1] : "file";
            caption = match ? match[2] : "";
            mimeType = "application/pdf";
          } else {
            messageType = "sticker";
            mimeType = "image/webp";
          }

          mediaUrl = `/api/inbox/conversations/${encodeURIComponent(customerJid)}/media/${encodeURIComponent(m.messageId || m.id)}?botId=${encodeURIComponent(botId || "")}&dataOwnerKey=${encodeURIComponent(dataOwnerKey)}`;
        }

        return {
          id: m.id || m.messageId || `${Date.now()}:${Math.random()}`,
          messageId: m.messageId || m.id,
          role: m.role,
          text,
          timestamp: normalizeTimestampToMs(m.timestamp),
          direction: m.role === "user" ? "inbound" : "outbound",
          messageType,
          hasMedia,
          caption,
          fileName,
          mimeType,
          mediaUrl
        };
      }));

      res.json(result);
    } catch (e: any) {
      console.error("[Inbox API] GET messages failed:", e);
      res.status(500).json({ error: e.message || "Failed to load chat history" });
    }
  });

  app.post("/api/inbox/conversations/:customerJid/reply", express.json(), async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);

      const { customerJid } = req.params;
      let { botId, text, dataOwnerKey, sendTargetJid } = req.body;

      if (!text || typeof text !== "string" || !text.trim()) {
        return res.status(400).json({ error: "Non-empty text is required" });
      }

      if (text.length > 2000) {
        return res.status(400).json({ error: "Message text is too long (maximum 2000 characters)" });
      }

      const bots = await dbService.getBotsByUser(userId);
      const activeBots = bots.filter((b: any) => b.is_active !== 0);

      if (!botId || botId.startsWith("account:")) {
        if (activeBots.length === 1) {
          botId = activeBots[0].$id || activeBots[0].id;
        } else if (activeBots.length > 1) {
          return res.status(400).json({ error: "Select a WhatsApp instance before sending reply" });
        } else {
          return res.status(400).json({ error: "No active WhatsApp instance available" });
        }
      }

      const bot = bots.find((b: any) => b.$id === botId || b.id === botId);
      if (!bot) {
        return res.status(403).json({ error: "Unauthorized bot access" });
      }

      const worker = activeWorkers.get(botId);
      if (!worker) {
        return res.status(503).json({ error: "This WhatsApp instance is not running. Open Instance Hub and connect it first." });
      }

      const resolvedDataOwnerKey = dataOwnerKey || buildAccountDataOwnerKey(user);
      const customerProfile = await dbService.getCustomerProfile(resolvedDataOwnerKey, customerJid).catch(() => null);

      const identity = resolveInboxContactIdentity({ customer: { profile: customerProfile }, customerJid, profile: customerProfile, recentMessages: [] });

      const targetJid = cleanInboxTargetJid(sendTargetJid || identity.sendTargetJid || customerJid);
      if (!isInboxSendableJid(targetJid)) {
        return res.status(400).json({ error: "Cannot send: invalid or non-sendable WhatsApp JID" });
      }

      const response = await fetch(`http://127.0.0.1:${worker.port}/api/inbox/manual-reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...buildWorkerInternalHeaders() },
        body: JSON.stringify({ botId, customerJid: targetJid, text }),
      });

      if (!response.ok) {
        const errJson = await response.clone().json().catch(() => null);
        const errText = await response.text().catch(() => "");
        return res.status(response.status).json({ error: errJson?.error || errText || "Failed to send manual reply via worker" });
      }

      const replyResult = await response.json();
      const messageId = replyResult.messageId || `manual:${Date.now()}`;

      await dbService.saveMessage(resolvedDataOwnerKey, customerJid, "model", text, messageId);

      res.json({
        success: true,
        message: {
          id: messageId,
          messageId,
          role: "model",
          text,
          timestamp: Date.now(),
          direction: "outbound",
          messageType: "text",
          hasMedia: false
        }
      });
    } catch (e: any) {
      console.error("[Inbox API] POST reply failed:", e);
      res.status(500).json({ error: e.message || "Failed to send manual reply" });
    }
  });

  app.post("/api/inbox/conversations/:customerJid/reply-control", express.json(), async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);

      const { customerJid } = req.params;
      const { botId, action, dataOwnerKey } = req.body;

      if (!action || (action !== "pause" && action !== "resume")) {
        return res.status(400).json({ error: "action ('pause' or 'resume') are required" });
      }

      const bots = await dbService.getBotsByUser(userId);
      const botIds = bots.map((b: any) => b.$id);
      const userOwnerKey = buildAccountDataOwnerKey(user);

      let hasAccess = false;
      if (botId && botIds.includes(botId)) {
        hasAccess = true;
      }
      if (dataOwnerKey && dataOwnerKey === userOwnerKey) {
        hasAccess = true;
      }
      if (botIds.length > 0 && !botId && !dataOwnerKey) {
        hasAccess = true;
      }

      if (!hasAccess) {
        return res.status(403).json({ error: "Unauthorized access" });
      }

      const resolvedDataOwnerKey = dataOwnerKey || userOwnerKey;

      const patch = action === "pause"
        ? {
            botReplyControl: "paused_permanent",
            botReplyPausedUntil: 0,
            botReplyPausedPermanent: true,
            botReplyControlUpdatedAt: Math.floor(Date.now() / 1000),
            botReplyStopReason: "Manually paused from Inbox",
            botReplyStopSource: "inbox",
            manualReviewRequired: true,
            aiPaused: true,
            ai_paused: true
          }
        : {
            botReplyControl: "active",
            botReplyPausedUntil: 0,
            botReplyPausedPermanent: false,
            botReplyControlUpdatedAt: Math.floor(Date.now() / 1000),
            botReplyStopReason: "",
            botReplyStopSource: "",
            manualReviewRequired: false,
            aiPaused: false,
            ai_paused: false,
            aiPauseCategory: "",
            aiPauseReason: "",
            irrelevantCustomerDetectedAt: 0,
            difficultCustomerModeReason: "",
            lastAiRetryBlockedReason: "",
            manualReviewReason: ""
          };

      await dbService.updateCustomerProfile(resolvedDataOwnerKey, customerJid, patch);
      const updatedProfile = await dbService.getCustomerProfile(resolvedDataOwnerKey, customerJid);

      res.json({
        success: true,
        profile: updatedProfile
      });
    } catch (e: any) {
      console.error("[Inbox API] POST reply-control failed:", e);
      res.status(500).json({ error: e.message || "Failed to update reply control status" });
    }
  });

  app.get("/api/inbox/conversations/:customerJid/media/:messageId", async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);

      const { customerJid, messageId } = req.params;
      const botId = req.query.botId as string;

      if (!botId) {
        return res.status(400).json({ error: "botId is required" });
      }

      const bots = await dbService.getBotsByUser(userId);
      const bot = bots.find((b: any) => b.$id === botId || b.id === botId);
      if (!bot) {
        return res.status(403).json({ error: "Unauthorized bot access" });
      }

      const worker = activeWorkers.get(botId);
      if (!worker) {
        return res.status(503).json({ error: "WhatsApp instance worker is not running" });
      }

      const targetUrl = `http://127.0.0.1:${worker.port}/api/inbox/media?botId=${encodeURIComponent(botId)}&customerJid=${encodeURIComponent(customerJid)}&messageId=${encodeURIComponent(messageId)}`;
      const response = await fetch(targetUrl, { headers: buildWorkerInternalHeaders() });

      if (!response.ok) {
        return res.status(response.status).send(await response.text());
      }

      const contentType = response.headers.get("Content-Type") || "application/octet-stream";
      const disposition = response.headers.get("Content-Disposition") || "";

      res.setHeader("Content-Type", contentType);
      if (disposition) {
        res.setHeader("Content-Disposition", disposition);
      }

      const arrayBuffer = await response.arrayBuffer();
      res.send(Buffer.from(arrayBuffer));
    } catch (e: any) {
      console.error("[Inbox API] GET media failed:", e);
      res.status(500).json({ error: e.message || "Failed to proxy media request" });
    }
  });

  app.get("/api/user/content-library/media/:messageId", async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);

      const { messageId } = req.params;
      const botId = req.query.botId as string;
      const groupJid = req.query.groupJid as string;

      if (!botId || !messageId) {
        return res.status(400).json({ error: "botId and messageId are required" });
      }

      // Verify account owns bot
      const bots = await dbService.getBotsByUser(userId);
      const bot = bots.find((b: any) => b.$id === botId || b.id === botId);
      if (!bot) {
        return res.status(403).json({ error: "Unauthorized bot access" });
      }

      const worker = activeWorkers.get(botId);
      if (!worker) {
        return res.status(503).json({ error: "WhatsApp instance worker is not running" });
      }

      const targetUrl = `http://127.0.0.1:${worker.port}/api/content-library/media?botId=${encodeURIComponent(botId)}&messageId=${encodeURIComponent(messageId)}${groupJid ? `&groupJid=${encodeURIComponent(groupJid)}` : ""}`;

      const fetchHeaders: Record<string, string> = {
        ...buildWorkerInternalHeaders(),
      };
      if (req.headers.range) {
        fetchHeaders.range = String(req.headers.range);
      }

      const response = await fetch(targetUrl, { headers: fetchHeaders });

      if (!response.ok) {
        return res.status(response.status).send(await response.text());
      }

      const contentType = response.headers.get("Content-Type") || "application/octet-stream";
      const disposition = response.headers.get("Content-Disposition") || "";
      const contentLength = response.headers.get("Content-Length");
      const contentRange = response.headers.get("Content-Range");
      const acceptRanges = response.headers.get("Accept-Ranges");

      res.status(response.status);
      res.setHeader("Content-Type", contentType);
      if (disposition) res.setHeader("Content-Disposition", disposition);
      if (contentLength) res.setHeader("Content-Length", contentLength);
      if (contentRange) res.setHeader("Content-Range", contentRange);
      if (acceptRanges) res.setHeader("Accept-Ranges", acceptRanges);
      res.setHeader("Cache-Control", "private, max-age=86400");

      const arrayBuffer = await response.arrayBuffer();
      res.send(Buffer.from(arrayBuffer));
    } catch (e: any) {
      console.error("[Content Library API] GET media failed:", e);
      res.status(500).json({ error: e.message || "Failed to proxy content library media request" });
    }
  });

  app.post("/api/inbox/conversations/:customerJid/attachment", express.raw({ type: "application/octet-stream", limit: "20mb" }), async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);

      const { customerJid } = req.params;
      const botId = req.query.botId as string;
      const dataOwnerKey = req.query.dataOwnerKey as string;
      const sendableJid = req.query.sendableJid as string;

      const fileName = decodeURIComponent(req.headers["x-file-name"] as string || "file");
      const mimeType = req.headers["x-mime-type"] as string || "";
      const caption = decodeURIComponent(req.headers["x-caption"] as string || "");

      const buffer = req.body;
      if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
        return res.status(400).json({ error: "Empty or invalid file payload" });
      }

      if (buffer.length > 16 * 1024 * 1024) {
        return res.status(400).json({ error: "File is too large. Maximum size is 16MB." });
      }

      const bots = await dbService.getBotsByUser(userId);
      const activeBots = bots.filter((b: any) => b.is_active !== 0);

      let targetBotId = botId;
      if (!targetBotId || targetBotId.startsWith("account:")) {
        if (activeBots.length === 1) {
          targetBotId = activeBots[0].$id || activeBots[0].id;
        } else {
          return res.status(400).json({ error: "No active WhatsApp instance available" });
        }
      }

      const bot = bots.find((b: any) => b.$id === targetBotId || b.id === targetBotId);
      if (!bot) {
        return res.status(403).json({ error: "Unauthorized bot access" });
      }

      const worker = activeWorkers.get(targetBotId);
      if (!worker) {
        return res.status(503).json({ error: "WhatsApp instance worker is not running" });
      }

      const targetJidRaw = sendableJid || customerJid;
      const targetJid = cleanInboxTargetJid(targetJidRaw);
      if (!isInboxSendableJid(targetJid)) {
        return res.status(400).json({ error: "Cannot send: invalid or non-sendable WhatsApp JID" });
      }

      const fileBase64 = buffer.toString("base64");

      const response = await fetch(`http://127.0.0.1:${worker.port}/api/inbox/manual-attachment`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...buildWorkerInternalHeaders() },
        body: JSON.stringify({
          botId: targetBotId,
          customerJid: targetJid,
          fileBase64,
          fileName,
          mimeType,
          caption
        })
      });

      if (!response.ok) {
        const errJson = await response.clone().json().catch(() => null);
        const errText = await response.text().catch(() => "");
        return res.status(response.status).json({ error: errJson?.error || errText || "Failed to send manual attachment via worker" });
      }

      const replyResult = await response.json();
      const messageId = replyResult.messageId || `manual:${Date.now()}`;

      let placeholderText = "Media";
      if (mimeType.startsWith("image/")) {
        placeholderText = caption ? `[Image] ${caption}` : "[Image]";
      } else if (mimeType.startsWith("video/")) {
        placeholderText = caption ? `[Video] ${caption}` : "[Video]";
      } else if (mimeType.startsWith("audio/")) {
        placeholderText = "[Audio]";
      } else {
        placeholderText = caption ? `[Document: ${fileName || "file"}] ${caption}` : `[Document: ${fileName || "file"}]`;
      }

      const resolvedDataOwnerKey = dataOwnerKey || buildAccountDataOwnerKey(user);
      await dbService.saveMessage(resolvedDataOwnerKey, customerJid, "model", placeholderText, messageId);

      res.json({
        success: true,
        message: {
          id: messageId,
          messageId,
          role: "model",
          text: placeholderText,
          timestamp: Date.now(),
          direction: "outbound",
          messageType: mimeType.split("/")[0],
          hasMedia: true,
          caption,
          fileName,
          mimeType,
          mediaUrl: `/api/inbox/conversations/${encodeURIComponent(customerJid)}/media/${messageId}?botId=${encodeURIComponent(targetBotId)}&dataOwnerKey=${encodeURIComponent(resolvedDataOwnerKey)}`
        }
      });
    } catch (e: any) {
      console.error("[Inbox API] POST attachment failed:", e);
      res.status(500).json({ error: e.message || "Failed to send manual attachment" });
    }
  });

  app.post("/api/user/customers/import", express.json({ limit: "2mb" }), async (req, res) => {
    try {
      const { rows } = req.body;
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);
      const result = await importCustomerContactsForUser(userId, rows);
      res.json({ success: true, ...result });
    } catch(e: any) {
      res.status(400).json({ error: e.message || "Customer import failed" });
    }
  });

  app.get("/api/user/customer-updates", async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);
      const updates = await dbService.listCustomerUpdatesForUser(userId);
      res.json(updates);
    } catch(e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/user/customer-updates", express.json(), async (req, res) => {
    try {
      const { customerId, customerJid, message, scheduledAt, repeat, defaultBotId, sendFromMode } = req.body;
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);
      const update = await dbService.createPlannedCustomerUpdateForUser(userId, { customerId, customerJid, message, scheduledAt, repeat, defaultBotId, sendFromMode });
      res.json({ success: true, item: update });
    } catch(e: any) {
      const status = /not found/i.test(e?.message || "") ? 404 : 400;
      res.status(status).json({ error: e.message });
    }
  });

  app.patch("/api/user/customer-updates/:type/:id", express.json(), async (req, res) => {
    try {
      const { customerId, customerJid, message, scheduledAt, repeat, summary, productName, productId, defaultBotId, sendFromMode } = req.body;
      const { type, id } = req.params;
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);
      const update = type === "planned"
        ? await dbService.updatePlannedCustomerUpdateForUser(userId, id, { customerId, customerJid, message, scheduledAt, repeat, summary, defaultBotId, sendFromMode })
        : type === "stock"
          ? await updateStockRequestForUser(userId, id, { customerId, customerJid, productName, productId, message })
          : null;
      if (!update) return res.status(400).json({ error: "Unknown update type" });
      res.json({ success: true, item: update });
    } catch(e: any) {
      const status = /not found/i.test(e?.message || "") ? 404 : 400;
      res.status(status).json({ error: e.message });
    }
  });

  app.post("/api/user/customer-updates/:type/:id/cancel", express.json(), async (req, res) => {
    try {
      const { type, id } = req.params;
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);
      if (type === "planned") await dbService.cancelPlannedCustomerUpdateForUser(userId, id);
      else if (type === "stock") await dbService.cancelStockRequestForUser(userId, id);
      else return res.status(400).json({ error: "Unknown update type" });
      res.json({ success: true });
    } catch(e: any) {
      const status = /not found/i.test(e?.message || "") ? 404 : 400;
      res.status(status).json({ error: e.message });
    }
  });

  app.delete("/api/user/customer-updates/:type/:id", express.json(), async (req, res) => {
    try {
      const { type, id } = req.params;
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);
      if (type === "planned") await dbService.deletePlannedCustomerUpdateForUser(userId, id);
      else if (type === "stock") await dbService.deleteStockRequestForUser(userId, id);
      else return res.status(400).json({ error: "Unknown update type" });
      res.json({ success: true });
    } catch(e: any) {
      const status = /not found/i.test(e?.message || "") ? 404 : 400;
      res.status(status).json({ error: e.message });
    }
  });

  app.get("/api/user/customer-update-list-foundation", async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const data = await getCustomerUpdateListFoundation(getStableUserId(user));
      res.json({ success: true, ...data });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to load saved lists" });
    }
  });

  app.post("/api/user/customer-update-lists", express.json({ limit: "128kb" }), async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const created = await createSavedRecipientList(getStableUserId(user), { ...(req.body || {}), createdBy: "dashboard" });
      res.json({ success: true, ...created });
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Failed to save recipient list" });
    }
  });

  app.delete("/api/user/customer-update-lists/:listId/members/:memberId", express.json({ limit: "16kb" }), async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      await removeSavedListMember(getStableUserId(user), req.params.listId, req.params.memberId);
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Failed to remove list member" });
    }
  });

  app.post("/api/user/customer-update-list-campaigns/send-now", express.json({ limit: "64kb" }), async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const created = await createListCampaign(getStableUserId(user), { ...(req.body || {}), runAt: now(), createdBy: "dashboard" });
      res.json({ success: true, ...created });
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Failed to queue list send" });
    }
  });

  app.post("/api/user/customer-update-list-campaigns/schedule", express.json({ limit: "64kb" }), async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const created = await createListCampaign(getStableUserId(user), { ...(req.body || {}), createdBy: "dashboard" });
      res.json({ success: true, ...created });
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Failed to schedule list send" });
    }
  });

  app.post("/api/user/customer-update-list-campaigns/:campaignId/:action", express.json({ limit: "16kb" }), async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const action = req.params.action === "cancel" ? "cancelled" : req.params.action === "pause" ? "paused" : "";
      if (!action) return res.status(400).json({ error: "Unknown campaign action" });
      await updateCampaignStatus(getStableUserId(user), req.params.campaignId, action as any);
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Failed to update campaign" });
    }
  });

  app.get("/api/user/customer-update-runs/:runId", async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const run = await getRunStatus(getStableUserId(user), req.params.runId);
      if (!run) return res.status(404).json({ error: "Run not found" });
      res.json({ success: true, ...run });
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Failed to load run" });
    }
  });

  app.get("/api/user/crm/overview", async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const accountId = getStableUserId(user);
      const overview = await getCrmOverview(accountId);
      deliverAccountDashboardWhatsAppAlerts({
        accountId,
        user,
        notifications: overview.notifications || [],
      }).catch((error) => {
        console.warn("[DashboardWhatsAppAlerts] CRM delivery failed:", error?.message || error);
      });
      res.json({ success: true, ...overview });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to load CRM overview" });
    }
  });

  app.get("/api/user/crm/leads", async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const result = await getCrmLeadListResult(getStableUserId(user), req.query || {});
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to load CRM leads" });
    }
  });

  app.get("/api/user/crm/staff", async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const staff = await listCrmStaff(getStableUserId(user));
      res.json({ success: true, staff });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to load CRM staff" });
    }
  });

  app.post("/api/user/crm/staff", express.json({ limit: "24kb" }), async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const staff = await upsertCrmStaff(getStableUserId(user), req.body || {});
      res.json({ success: true, staff });
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Failed to save CRM staff" });
    }
  });

  app.patch("/api/user/crm/staff/:staffId", express.json({ limit: "24kb" }), async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const staff = await patchCrmStaff(getStableUserId(user), req.params.staffId, req.body || {});
      res.json({ success: true, staff });
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Failed to update CRM staff" });
    }
  });

  app.get("/api/user/crm/notifications", async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const accountId = getStableUserId(user);
      const notifications = await getCrmNotifications(accountId);
      deliverAccountDashboardWhatsAppAlerts({ accountId, user, notifications }).catch((error) => {
        console.warn("[DashboardWhatsAppAlerts] CRM notification delivery failed:", error?.message || error);
      });
      res.json({ success: true, notifications });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to load CRM notifications" });
    }
  });

  app.post("/api/user/crm/notifications/bulk", express.json({ limit: "12kb" }), async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const result = await updateCrmNotificationStatesBulk(getStableUserId(user), req.body || {});
      res.json(result);
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Failed to update CRM notifications" });
    }
  });

  app.patch("/api/user/crm/notifications/:notificationId", express.json({ limit: "12kb" }), async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const notification = await updateCrmNotificationState(getStableUserId(user), req.params.notificationId, req.body || {});
      res.json({ success: true, notification });
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Failed to update CRM notification" });
    }
  });

  app.patch("/api/user/crm/agent-mode", express.json({ limit: "12kb" }), async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const settings = await updateCrmAgentModeSettings(getStableUserId(user), req.body || {});
      res.json({ success: true, settings });
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Failed to update CRM Agent Mode" });
    }
  });

  app.post("/api/user/crm/agent-mode/run", express.json({ limit: "12kb" }), async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const result = await runCrmAgentMode(getStableUserId(user), { maxActions: req.body?.maxActions });
      res.json(result);
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Failed to run CRM Agent Mode" });
    }
  });

  app.get("/api/user/crm/reports", async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const reports = await getCrmReports(getStableUserId(user));
      res.json({ success: true, reports });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to load CRM reports" });
    }
  });

  app.post("/api/user/crm/leads", express.json({ limit: "32kb" }), async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const lead = await upsertCrmLead(getStableUserId(user), { ...(req.body || {}), source: req.body?.source || "Manual" });
      res.json({ success: true, lead });
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Failed to save CRM lead" });
    }
  });

  app.get("/api/user/crm/leads/:leadId", async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const detail = await getCrmLeadDetail(getStableUserId(user), req.params.leadId);
      if (!detail) return res.status(404).json({ error: "CRM lead not found" });
      res.json({ success: true, ...detail });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to load CRM lead" });
    }
  });

  app.patch("/api/user/crm/leads/:leadId", express.json({ limit: "32kb" }), async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const lead = await patchCrmLead(getStableUserId(user), req.params.leadId, req.body || {});
      res.json({ success: true, lead });
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Failed to update CRM lead" });
    }
  });

  app.post("/api/user/crm/leads/:leadId/smart-actions/:actionId", express.json({ limit: "12kb" }), async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const result = await applyCrmSmartAction(getStableUserId(user), req.params.leadId, req.params.actionId, req.body || {});
      res.json({ success: true, ...result });
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Failed to apply smart action" });
    }
  });

  app.post("/api/user/crm/follow-ups", express.json({ limit: "24kb" }), async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const followUp = await createCrmFollowUp(getStableUserId(user), req.body || {});
      res.json({ success: true, followUp });
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Failed to save follow-up" });
    }
  });

  app.patch("/api/user/crm/follow-ups/:followUpId", express.json({ limit: "24kb" }), async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const followUp = await updateCrmFollowUp(getStableUserId(user), req.params.followUpId, req.body || {});
      res.json({ success: true, followUp });
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Failed to update follow-up" });
    }
  });

  app.post("/api/user/crm/call-logs", express.json({ limit: "24kb" }), async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const callLog = await createCrmCallLog(getStableUserId(user), req.body || {});
      res.json({ success: true, callLog });
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Failed to save call log" });
    }
  });

  app.post("/api/user/crm/deals/:leadId/stage", express.json({ limit: "24kb" }), async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const deal = await updateCrmDealStage(getStableUserId(user), req.params.leadId, req.body || {});
      res.json({ success: true, deal });
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Failed to update deal stage" });
    }
  });

  app.get("/api/user/website-knowledge", async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      res.json({ success: true, ...(await getWebsiteKnowledgeOverview(getStableUserId(user))) });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to load website knowledge" });
    }
  });

  app.post("/api/user/customers/update-profile", express.json(), async (req, res) => {
    try {
      const { customerId, profile } = req.body;
      if (!customerId) return res.status(400).json({ error: "Missing customerId" });
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);

      const customers = await dbService.listCustomers(userId);
      const customer = customers.find((c: any) => c.$id === customerId || c.id === customerId || c.customer_id === customerId);
      if (!customer) return res.status(404).json({ error: "Customer not found" });

      const nextProfile = {
        customerInstructions: String(profile?.customerInstructions || "").slice(0, 5000),
      };
      const customerJid = resolveCustomerChatJid(customer);
      if (!customerJid) return res.status(400).json({ error: "Customer WhatsApp JID is not safely known yet" });
      await dbService.updateCustomerProfile(customer.bot_id, customerJid, nextProfile);
      res.json({ success: true, profile: { ...(customer.profile || {}), ...nextProfile } });
    } catch(e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/user/customers/reply-control", express.json({ limit: "12kb" }), async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);
      const { customerId, action } = req.body || {};
      if (!customerId) return res.status(400).json({ error: "Missing customerId" });
      if (action !== "resume") return res.status(400).json({ error: "Unsupported reply-control action" });
      const customers = await dbService.listCustomers(userId);
      const customer = customers.find((c: any) => c.$id === customerId || c.id === customerId || c.customer_id === customerId);
      if (!customer) return res.status(404).json({ error: "Customer not found" });
      const customerJid = resolveCustomerChatJid(customer);
      if (!customerJid) return res.status(400).json({ error: "Customer WhatsApp JID is not safely known yet" });
      const profile = parseCustomerProfile(customer.profile);
      const patch = {
        aiPaused: false,
        ai_paused: false,
        manualReviewRequired: false,
        manualReviewReason: "",
        difficultCustomerModeReason: "",
        lastAiRetryBlockedReason: "",
      };
      const updatedJids = await applyCustomerReplyControlToLinkedProfiles({
        dataOwnerKey: customer.bot_id || userId,
        primaryJid: customerJid,
        profile,
        command: { action: "resume" },
        extraPatch: patch,
      });
      res.json({ success: true, profile: { ...profile, botReplyControl: "active", botReplyPausedUntil: 0, botReplyPausedPermanent: false, ...patch }, updatedJids });
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Failed to update customer reply control" });
    }
  });

  app.post("/api/user/customers/refresh-summary", express.json(), async (req, res) => {
    try {
      const { customerId } = req.body;
      if (!customerId) return res.status(400).json({ error: "Missing customerId" });
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);

      const customers = await dbService.listCustomers(userId);
      const customer = customers.find((c: any) => c.$id === customerId || c.id === customerId || c.customer_id === customerId);
      if (!customer) return res.status(404).json({ error: "Customer not found" });

      const customerJid = resolveCustomerChatJid(customer);
      if (!customerJid) return res.status(400).json({ error: "Customer WhatsApp JID is not safely known yet" });

      queueCustomerChatSummaryRefresh({ dataOwnerKey: customer.bot_id, customerJid, userId })
        .catch((e: any) => console.error("[CustomerSummary] Refresh route queue failed:", e?.message || e));
      res.json({ success: true, queued: true });
    } catch(e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/user/transactions", async (req, res) => {
    try {
      const { fromTime, toTime } = req.query;
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);
      const transactions = await dbService.listWalletTransactions(
          userId, 
          fromTime ? Number(fromTime) : undefined,
          toTime ? Number(toTime) : undefined
      );
      res.json(transactions);
    } catch(e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/user/orders", async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);
      const orders = await dbService.listOrders(userId);
      res.json(orders);
    } catch(e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/user/orders/update", express.json(), async (req, res) => {
    try {
      const { orderId, orderData } = req.body;
      if (!orderId) return res.status(400).json({ error: "Missing orderId" });
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);
      const orders = await dbService.listOrders(userId);
      const existingOrder = orders.find((o: any) => o.$id === orderId || o.id === orderId);
      if (!existingOrder) return res.status(404).json({ error: "Order not found" });
      const existingData = existingOrder.order_data || {};
      if (normalizeRecordType(existingData.recordType, existingData.businessFlow) === "order" && !isOrderEditable(existingData)) {
        return res.status(409).json({ error: "This order can no longer be edited because it is older than 1 day, dispatched/sent, or already has a tracking ID." });
      }
      
      const preparedOrderData = await releaseStockIfTerminal(userId, { ...(orderData || {}) });
      const success = await dbService.updateOrder(orderId, preparedOrderData);
      if (success) {
        const customerJid = String(preparedOrderData?.customerJid || existingData?.customerJid || "").trim();
        if (customerJid) {
          queueCustomerChatSummaryRefresh({ dataOwnerKey: existingOrder.bot_id, customerJid, userId })
            .catch((e: any) => console.error("[CustomerSummary] Queue failed after manual order update:", e?.message || e));
        }
        res.json({ success: true, orderData: preparedOrderData });
      } else {
        res.status(500).json({ error: "Failed to update order" });
      }
    } catch(e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/user/orders/book-postex", express.json(), async (req, res) => {
    try {
      const { orderId } = req.body;
      if (!orderId) return res.status(400).json({ error: "Missing orderId" });

      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);
      const accessState = await requireAccountFeatureAccess(userId, res);
      if (!accessState) return;
      if (accessState.access.trialActive) {
        return res.status(402).json({ error: "Courier booking is available after choosing a paid plan." });
      }

      const config = await dbService.loadUserConfig(userId);
      const postexToken = config?.postex_api_key;
      if (!postexToken) return res.status(400).json({ error: "PostEx API token is missing. Add it in API & Integrations first." });

      const orders = await dbService.listOrders(userId);
      const order = orders.find((o: any) => o.$id === orderId || o.id === orderId);
      if (!order) return res.status(404).json({ error: "Order not found" });
      if (normalizeRecordType(order.order_data?.recordType, order.order_data?.businessFlow) === "lead") {
        return res.status(400).json({ error: "Courier booking is only available for orders, not leads." });
      }

      const orderData = order.order_data || {};
      if (orderData.trackingNumber) {
        return res.json({ success: true, message: `Order already has PostEx tracking ID: ${orderData.trackingNumber}`, order });
      }
      let profilePhone = "";
      if (!firstPresent(orderData.customerPhone, orderData.phone) && order.bot_id && orderData.customerJid) {
        const profile = await dbService.getCustomerProfile(order.bot_id, orderData.customerJid).catch(() => null);
        profilePhone = getProfilePhone(profile || {});
      }
      const bookingOrder = profilePhone
        ? { ...order, order_data: { ...orderData, customerPhone: profilePhone, phone: profilePhone } }
        : order;
      const bookingPayload = buildPostexBookingPayload(bookingOrder);
      const bookingResponse = await shippingService.bookPostexOrder(bookingPayload, postexToken);
      const trackingNumber = shippingService.extractPostexTrackingNumber(bookingResponse);
      if (!trackingNumber) {
        console.error("[PostEx] Missing tracking number in booking response:", JSON.stringify(bookingResponse).slice(0, 1000));
        throw new Error(bookingResponse?.statusMessage || bookingResponse?.message || "PostEx accepted the request but did not return a tracking number");
      }

      let trackingInfo = shippingService.getPostexTrackingData({
        dist: {
          trackingNumber,
          orderRefNumber: bookingPayload.orderRefNumber,
          transactionStatus: bookingResponse?.dist?.orderStatus || "UnBooked",
          customerName: bookingPayload.customerName,
          customerPhone: bookingPayload.customerPhone,
          deliveryAddress: bookingPayload.deliveryAddress,
          cityName: bookingPayload.cityName,
          invoicePayment: bookingPayload.invoicePayment,
          transactionFee: 0,
          transactionTax: 0,
        }
      });

      try {
        const trackingResponse = await shippingService.trackPostexOrder(trackingNumber, postexToken);
        trackingInfo = shippingService.getPostexTrackingData(trackingResponse);
      } catch (trackingErr) {
        console.warn("[PostEx] Order booked, but immediate tracking refresh failed:", trackingErr);
      }

      const updatedOrderData = applyPostexTrackingToOrder(bookingOrder.order_data || {}, trackingInfo, bookingResponse);
      updatedOrderData.postexBookingPayload = bookingPayload;
      updatedOrderData.postexOrderDate = bookingResponse?.dist?.orderDate || new Date().toISOString();
      updatedOrderData.shippingChargePending = !trackingInfo.shippingCharge;
      await releaseStockIfTerminal(userId, updatedOrderData);

      await dbService.updateOrder(order.$id || order.id, updatedOrderData);

      const cleanWhatsAppPhone = shippingService.normalizeWhatsAppPhone(firstPresent(updatedOrderData.customerPhone, bookingPayload.customerPhone));
      if (cleanWhatsAppPhone && order.bot_id) {
        await dbService.updateCustomerProfile(order.bot_id, `${cleanWhatsAppPhone}@s.whatsapp.net`, {
          hasPlacedOrder: true,
          trackingId: trackingNumber,
          courierCompany: "postex",
          latestTrackingStatus: updatedOrderData.latestTrackingStatus,
          orderStatus: updatedOrderData.transactionStatus,
        }).catch(() => {});
      }

      res.json({ success: true, message: `PostEx order booked. Tracking ID: ${trackingNumber}`, order: { ...order, order_data: updatedOrderData } });
    } catch(e: any) {
      res.status(500).json({ error: e.message || "Failed to book PostEx order" });
    }
  });

  app.post("/api/user/orders/sync-postex-tracking", express.json(), async (req, res) => {
    try {
      const { orderId } = req.body;
      if (!orderId) return res.status(400).json({ error: "Missing orderId" });

      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);
      const accessState = await requireAccountFeatureAccess(userId, res);
      if (!accessState) return;
      if (accessState.access.trialActive) {
        return res.status(402).json({ error: "Courier tracking sync is available after choosing a paid plan." });
      }

      const config = await dbService.loadUserConfig(userId);
      const postexToken = config?.postex_api_key;
      if (!postexToken) return res.status(400).json({ error: "PostEx API token is missing." });

      const orders = await dbService.listOrders(userId);
      const order = orders.find((o: any) => o.$id === orderId || o.id === orderId);
      if (!order) return res.status(404).json({ error: "Order not found" });
      if (normalizeRecordType(order.order_data?.recordType, order.order_data?.businessFlow) === "lead") {
        return res.status(400).json({ error: "Courier tracking sync is only available for orders, not leads." });
      }
      const trackingNumber = firstPresent(order.order_data?.trackingNumber, order.order_data?.tracking_id, order.order_data?.awb);
      if (!trackingNumber) return res.status(400).json({ error: "This order does not have a PostEx tracking number yet." });

      const trackingResponse = await shippingService.trackPostexOrder(String(trackingNumber), postexToken);
      const trackingInfo = shippingService.getPostexTrackingData(trackingResponse);
      const updatedOrderData = applyPostexTrackingToOrder(order.order_data || {}, trackingInfo);
      updatedOrderData.shippingChargePending = !trackingInfo.shippingCharge;
      await releaseStockIfTerminal(userId, updatedOrderData);

      await dbService.updateOrder(order.$id || order.id, updatedOrderData);
      res.json({ success: true, message: `Tracking synced: ${updatedOrderData.latestTrackingStatus || "Updated"}`, order: { ...order, order_data: updatedOrderData } });
    } catch(e: any) {
      res.status(500).json({ error: e.message || "Failed to sync tracking" });
    }
  });

  app.post("/api/user/orders/sync-dhl-tracking", express.json(), async (req, res) => {
    let orderForError: any = null;
    try {
      const { orderId } = req.body;
      if (!orderId) return res.status(400).json({ error: "Missing orderId" });

      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);
      const accessState = await requireAccountFeatureAccess(userId, res);
      if (!accessState) return;
      if (accessState.access.trialActive) {
        return res.status(402).json({ error: "Courier tracking sync is available after choosing a paid plan." });
      }

      const config = await dbService.loadUserConfig(userId);
      const dhlConfig = buildDhlTrackingConfig(config);
      if (!String(dhlConfig.dhl_api_key || "").trim()) {
        return res.status(400).json({ error: "DHL API key is missing. Add it in API & Integrations first." });
      }

      const orders = await dbService.listOrders(userId);
      const order = orders.find((o: any) => o.$id === orderId || o.id === orderId);
      if (!order) return res.status(404).json({ error: "Order not found" });
      if (normalizeRecordType(order.order_data?.recordType, order.order_data?.businessFlow) === "lead") {
        return res.status(400).json({ error: "Courier tracking sync is only available for orders, not leads." });
      }
      orderForError = order;
      const orderData = order.order_data || {};
      const courier = normalizeCourierCompany(orderData?.courierCompany || orderData?.courier_company || orderData?.courier);
      if (courier && courier !== "dhl") {
        return res.status(400).json({ error: "This order is not marked as a DHL shipment." });
      }
      const trackingNumber = firstPresent(orderData?.trackingNumber, orderData?.tracking_id, orderData?.awb);
      if (!trackingNumber) return res.status(400).json({ error: "This order does not have a DHL tracking number yet." });

      const skipDecision = shouldSkipDhlTrackingSync(orderData);
      if (skipDecision.skip) {
        return res.json({ success: true, skipped: true, message: skipDecision.message, order });
      }

      const trackingInfo = await shippingService.trackDhlShipment(String(trackingNumber), dhlConfig);
      const updatedOrderData = await releaseStockIfTerminal(userId, applyDhlTrackingToOrder(orderData, trackingInfo));

      await dbService.updateOrder(order.$id || order.id, updatedOrderData);

      const cleanWhatsAppPhone = shippingService.normalizeWhatsAppPhone(firstPresent(updatedOrderData.customerPhone, updatedOrderData.phone));
      if (cleanWhatsAppPhone && order.bot_id) {
        await dbService.updateCustomerProfile(order.bot_id, `${cleanWhatsAppPhone}@s.whatsapp.net`, {
          hasPlacedOrder: true,
          trackingId: trackingInfo.tracking_id,
          courierCompany: "dhl",
          latestTrackingStatus: trackingInfo.current_status,
          latestTrackingStatusCode: trackingInfo.status_code,
          latestTrackingEvent: trackingInfo.latest_event_description,
          latestTrackingEventTime: trackingInfo.latest_event_time,
          trackingProviderAttribution: "Delivered by Deutsche Post DHL Group",
          orderStatus: trackingInfo.current_status,
        }).catch(() => {});
      }

      res.json({
        success: true,
        message: `DHL tracking synced: ${updatedOrderData.latestTrackingStatus || "Updated"}`,
        order: { ...order, order_data: updatedOrderData }
      });
    } catch(e: any) {
      if (orderForError?.$id || orderForError?.id) {
        const errorOrderData = {
          ...(orderForError.order_data || {}),
          trackingSyncError: e?.userMessage || e?.message || "Failed to sync DHL tracking",
          trackingLastSyncedAt: now(),
        };
        await dbService.updateOrder(orderForError.$id || orderForError.id, errorOrderData).catch(() => {});
      }
      const status = Number(e?.status || 500);
      res.status(status).json({ error: e?.userMessage || e?.message || "Failed to sync DHL tracking" });
    }
  });

  app.post("/api/user/test-dhl-connection", express.json(), async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);
      const access = getBillingAccess(user);
      if (access.trialActive) {
        return res.status(402).json({ error: "Courier integration is available on paid plans. You can continue using the trial and upgrade from Billing when ready." });
      }

      const config = await dbService.loadUserConfig(userId);
      const requestedApiKey = String(req.body?.dhlApiKey || "").trim();
      const mergedConfig = {
        ...buildDhlTrackingConfig(config),
        dhl_api_key: requestedApiKey && requestedApiKey !== MASKED_SECRET_VALUE ? requestedApiKey : config?.dhl_api_key,
        dhl_service: req.body?.dhlService ?? config?.dhl_service ?? "express",
        dhl_requester_country_code: req.body?.dhlRequesterCountryCode ?? config?.dhl_requester_country_code,
        dhl_origin_country_code: req.body?.dhlOriginCountryCode ?? config?.dhl_origin_country_code,
        dhl_language: req.body?.dhlLanguage ?? config?.dhl_language,
      };
      const trackingId = String(req.body?.trackingId || "").trim();
      if (!trackingId) {
        return res.status(400).json({ error: "Enter a DHL tracking ID to test the connection." });
      }

      const result = await shippingService.trackDhlShipment(trackingId, mergedConfig);
      res.json({
        success: true,
        message: `DHL connection works. Latest status: ${result.current_status || "Updated"}`,
        status: result.current_status,
      });
    } catch (e: any) {
      const status = Number(e?.status || 500);
      res.status(status).json({ error: e?.userMessage || e?.message || "DHL connection test failed" });
    }
  });

  app.post("/api/user/update-config", express.json(), async (req, res) => {
    try {
      const { userId: _ignoredUserId, section: _ignoredSection, ...config } = req.body;
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);
      const safeConfig = buildUserConfigWritePayload(config);
      const courierRequested = Boolean(
        String(safeConfig.postex_api_key || "").trim() ||
        String(safeConfig.leopards_api_key || "").trim() ||
        String(safeConfig.leopards_api_password || "").trim() ||
        String(safeConfig.dhl_api_key || "").trim()
      );
      const access = getBillingAccess(user);
      if (access.trialActive && courierRequested) {
        return res.status(402).json({ error: "Courier integration is available on paid plans. You can continue using the trial and upgrade from Billing when ready." });
      }
      if (safeConfig.proxy_url !== undefined) {
        const proxyValidation = validateOutboundProxyUrl(safeConfig.proxy_url, { allowEmpty: true });
        if (!proxyValidation.ok) {
          logSecurityEvent("blocked_proxy_test_request", {
            route: "/api/user/update-config",
            userId,
            proxy: safeConfig.proxy_url ? maskProxyUrl(safeConfig.proxy_url) : "",
            reason: proxyValidation.message,
          });
          return res.status(400).json({ error: proxyValidation.message });
        }
        safeConfig.proxy_url = proxyValidation.normalized || "";
      }

      const saveResult = await dbService.saveUserConfig(userId, safeConfig);
      
      // Tell all active workers for this user to reload config and templates
      for (const [botId, workerInfo] of activeWorkers.entries()) {
          const botData = await dbService.getBotById(botId);
          if (botData && botData.user_id === userId) {
              fetch(`http://127.0.0.1:${workerInfo.port}/api/sync-templates`, { method: "POST" })
                  .catch(e => console.error(`Failed to auto-sync templates for bot ${botId}:`, e));
          }
      }

      res.json({ success: true, warning: saveResult?.warning || "" });
    } catch (e: any) {
      console.error("[update-config] Error:", e);
      res.status(500).json({ error: e.message || "Internal server error" });
    }
  });

  app.post("/api/user/test-proxy", testProxyLimiter, express.json(), async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) {
        logSecurityEvent("blocked_proxy_test_request", {
          route: "/api/user/test-proxy",
          ip: getRequestIp(req),
          reason: "unauthenticated",
        });
        return;
      }
      const { proxyUrl } = req.body;
      if (!proxyUrl) return res.status(400).json({ error: "Proxy URL is required" });
      const proxyValidation = validateOutboundProxyUrl(proxyUrl);
      if (!proxyValidation.ok) {
        logSecurityEvent("blocked_proxy_test_request", {
          route: "/api/user/test-proxy",
          userId: getStableUserId(user),
          proxy: maskProxyUrl(proxyUrl),
          reason: proxyValidation.message,
        });
        return res.status(400).json({ error: proxyValidation.message });
      }
      try {
        const result = await testProxyUrl(proxyValidation.normalized);
        const warning = result.whatsappReachable ? "" : " WhatsApp suitability warning: generic proxy connectivity works, but WhatsApp-specific reachability did not pass.";
        res.json({ ok: true, message: `Proxy reachable (Latency: ${result.latency}ms, Last Checked: ${new Date().toLocaleTimeString()}).${warning}` });
      } catch (err: any) {
        res.status(400).json({ ok: false, message: `Connection failed: ${sanitizeProxyErrorMessage(err)}` });
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  async function createCreemCheckoutFromRequest(req: any, res: any, overrides: any = {}) {
    try {
      const body = { ...(req.body || {}), ...overrides };
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);

      const origin = getRequestOrigin(req);
      const checkout = await createCreemCheckout({
        userId,
        type: body.type,
        planId: body.planId,
        billingCycle: body.billingCycle,
        addonType: body.addonType,
        quantity: body.quantity,
        amount: body.amount
      }, origin);

      res.json({ success: true, ...checkout });
    } catch (e: any) {
      console.error("[Creem Checkout] Failed:", e?.message || e);
      emitLiveConsoleEvent({
        type: "payment_error",
        level: "error",
        scope: "account",
        accountId: getStableUserId(req.authUser) || String(req.body?.userId || ""),
        title: "Creem checkout failed",
        message: e?.message || "Checkout creation failed.",
        reason: String(overrides?.type || req.body?.type || "checkout"),
      });
      res.status(400).json({ error: e?.message || "Failed to create checkout" });
    }
  }

  app.post("/api/billing/creem/create-checkout", express.json(), (req, res) => createCreemCheckoutFromRequest(req, res));
  app.post("/api/billing/creem/customer-portal", express.json(), async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);
      const portal = await createCreemCustomerPortal(userId);
      res.json({ success: true, ...portal });
    } catch (e: any) {
      emitLiveConsoleEvent({
        type: "payment_error",
        level: "error",
        scope: "account",
        accountId: getStableUserId((req as any).authUser) || "",
        title: "Creem customer portal failed",
        message: e?.message || "Unable to create Creem customer portal link",
      });
      res.status(400).json({ error: e?.message || "Unable to create Creem customer portal link" });
    }
  });
  app.post("/api/billing/upgrade-plan", express.json(), (req, res) => createCreemCheckoutFromRequest(req, res, { type: "plan", billingCycle: req.body?.billingCycle || "monthly" }));
  app.post("/api/billing/change-plan", express.json(), (req, res) => createCreemCheckoutFromRequest(req, res, { type: "plan" }));
  app.post("/api/billing/wallet-purchase-toggle", express.json(), async (req, res) => {
    try {
      const target = await requireTargetUserForAdmin(req, res, { superAdminOnly: true, field: "targetUserId" });
      if (!target) return;
      const { requester, targetUserId } = target;
      const enabled = req.body?.enabled === true || req.body?.enabled === 1 || String(req.body?.enabled || "").toLowerCase() === "true";
      const saved = await setWalletBillingPurchasesEnabled(targetUserId, enabled);
      logAdminAction("SET_WALLET_BILLING_PURCHASES", {
        targetUserId,
        enabled: saved.enabled,
      }, getStableUserId(requester));
      res.json({ success: true, enabled: saved.enabled });
    } catch (e: any) {
      console.error("[Wallet Billing Toggle] Failed:", e?.message || e);
      emitLiveConsoleEvent({
        type: "subscription_error",
        level: "error",
        scope: "account",
        accountId: getStableUserId((req as any).authUser) || "",
        title: "Wallet billing toggle failed",
        message: e?.message || "Unable to update wallet billing toggle",
      });
      res.status(400).json({ error: e?.message || "Unable to update wallet billing toggle" });
    }
  });
  app.post("/api/billing/purchase-with-wallet", express.json(), async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const purchaseType = String(req.body?.type || "").trim().toLowerCase();
      const idempotencyKey = normalizeWalletPurchaseIdempotencyKey(req.body?.idempotencyKey || req.body?.clientPurchaseKey);
      if (!idempotencyKey) {
        return res.status(400).json({ error: "Wallet purchase idempotency key is required." });
      }
      if (purchaseType === "wallet_topup") {
        return res.status(400).json({ error: "Wallet top-up remains available through Creem checkout only." });
      }
      if (typeof req.body?.amount !== "undefined") {
        return res.status(400).json({ error: "Wallet purchase amount is calculated securely on the server." });
      }
      let result: any;
      if (purchaseType === "plan") {
        const planId = String(req.body?.planId || "").trim();
        const billingCycle = String(req.body?.billingCycle || "").trim().toLowerCase();
        if (!planId) return res.status(400).json({ error: "planId is required for wallet plan purchase." });
        if (billingCycle !== "monthly" && billingCycle !== "annual") {
          return res.status(400).json({ error: "billingCycle must be monthly or annual for wallet plan purchase." });
        }
        result = await purchasePlanWithWallet(user, {
          planId: planId as any,
          billingCycle: billingCycle as "monthly" | "annual",
          idempotencyKey,
        });
      } else if (purchaseType === "addon") {
        const addonType = String(req.body?.addonType || req.body?.addonKey || "").trim();
        const rawQuantity = req.body?.quantity;
        const quantity = typeof rawQuantity === "undefined" ? 1 : Number(rawQuantity);
        if (!addonType) return res.status(400).json({ error: "addonType is required for wallet add-on purchase." });
        if (!Number.isFinite(quantity) || quantity <= 0) {
          return res.status(400).json({ error: "quantity must be a positive number for wallet add-on purchase." });
        }
        result = await purchaseAddonWithWallet(user, {
          addonType,
          quantity,
          idempotencyKey,
        });
      } else if (purchaseType === "setup") {
        result = await purchaseSetupWithWallet(user, { idempotencyKey });
      } else {
        return res.status(400).json({ error: "Invalid wallet purchase type." });
      }
      logAdminAction("ACCOUNT_WALLET_BILLING_PURCHASE", {
        targetUserId: getStableUserId(user),
        purchaseType,
        duplicate: Boolean(result?.duplicate),
        transactionRef: result?.transactionRef || "",
        charged: Number(result?.charged || 0),
        planId: result?.planId || "",
        billingCycle: result?.billingCycle || "",
        addonType: result?.addonType || "",
        quantity: Number(result?.quantity || 0),
      }, getStableUserId(user));
      res.json({ success: true, ...result });
    } catch (e: any) {
      console.error("[Wallet Purchase] Failed:", e?.message || e);
      emitLiveConsoleEvent({
        type: "subscription_error",
        level: "error",
        scope: "account",
        accountId: getStableUserId((req as any).authUser) || "",
        title: "Wallet purchase failed",
        message: e?.message || "Unable to complete wallet purchase",
      });
      res.status(400).json({ error: e?.message || "Unable to complete wallet purchase" });
    }
  });
  app.post("/api/billing/change-plan-wallet", express.json(), async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const idempotencyKey = normalizeWalletPurchaseIdempotencyKey(req.body?.idempotencyKey || req.body?.clientPurchaseKey);
      if (!idempotencyKey) {
        return res.status(400).json({ error: "Wallet purchase idempotency key is required." });
      }
      if (typeof req.body?.amount !== "undefined") {
        return res.status(400).json({ error: "Wallet purchase amount is calculated securely on the server." });
      }
      const planId = String(req.body?.planId || "").trim();
      const billingCycle = String(req.body?.billingCycle || "").trim().toLowerCase();
      if (!planId) return res.status(400).json({ error: "planId is required for wallet plan purchase." });
      if (billingCycle !== "monthly" && billingCycle !== "annual") {
        return res.status(400).json({ error: "billingCycle must be monthly or annual for wallet plan purchase." });
      }
      const result: any = await purchasePlanWithWallet(user, {
        planId: planId as any,
        billingCycle: billingCycle as "monthly" | "annual",
        idempotencyKey,
      });
      res.json({
        success: true,
        planId: result.planId,
        billingCycle: result.billingCycle,
        charged: result.charged,
        wallet_balance: result.walletBalanceAfter,
        plan_expiry: result.planExpiry,
      });
    } catch (e: any) {
      res.status(400).json({ error: e?.message || "Unable to change plan with wallet balance" });
    }
  });
  app.post("/api/billing/buy-addon", express.json(), (req, res) => createCreemCheckoutFromRequest(req, res, { type: "addon" }));
  app.post("/api/billing/top-up-wallet", express.json(), (req, res) => createCreemCheckoutFromRequest(req, res, { type: "wallet_topup" }));
  app.post("/api/billing/subscribe-products", express.json(), (req, res) => createCreemCheckoutFromRequest(req, res, { type: "addon", addonType: "extra_30_products" }));
  app.post("/api/billing/subscribe-instance", express.json(), (req, res) => createCreemCheckoutFromRequest(req, res, { type: "addon", addonType: "extra_instance" }));

  app.post("/api/billing/toggle-auto-renew", express.json(), async (req, res) => {
    return res.status(410).json({ error: "Add-on renewal is managed by Creem. Use Manage payment methods/subscriptions in Billing." });
  });

  app.get("/api/user/products", async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const products = await dbService.listProducts(getStableUserId(user));
      res.json(products);
    } catch(e: any) { res.status(500).json({ error: e.message, fallback: [] }); }
  });

  app.post("/api/user/add-payment", express.json(), async (req, res) => {
    return res.status(410).json({ error: "Manual payment top-up has been removed. Use Creem checkout." });
  });

  // ==========================================
  // BUSINESS ASSISTANT HUB API ENDPOINTS
  // ==========================================

  app.get("/api/business-assistant/overview", async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);

      const bots = await dbService.getBotsByUser(userId).catch(() => []);
      const connectedBot = bots.find((b: any) => b.status === "connected") || bots[0] || null;

      const allReminders = listRemindersForAccount(userId);
      const pendingReminders = allReminders.filter((r) => r.status === "pending");

      const auditEvents = getAdminAuditEvents(userId, 500);
      const startOfDayMs = new Date().setHours(0, 0, 0, 0);
      const todayAudit = auditEvents.filter((e) => e.timestamp >= startOfDayMs);
      const repliesToday = todayAudit.filter((e) => e.actionId === "admin_business_assistant_reply" || e.executionResult === "success").length;
      const costToday = Number((repliesToday * 0.003).toFixed(4));

      const customers = await dbService.listCustomers(userId).catch(() => []);
      const active7dCutoff = Math.floor(Date.now() / 1000) - 7 * 86400;
      const active7dCount = customers.filter((c: any) => {
        const lastMsg = Number(c.last_message_at || parseCustomerProfile(c.profile).lastMessageAt || 0);
        return lastMsg >= active7dCutoff;
      }).length;

      const orders = await dbService.listOrders(userId).catch(() => []);
      const validOrders = orders.filter((o: any) => !isOrderDeletedForLimit(o));

      const products = await dbService.listProducts(userId).catch(() => []);
      const physicalProducts = products.filter((p: any) => p.type !== "service");
      const services = products.filter((p: any) => p.type === "service");

      const extraConfig = await dbService.getUserExtraConfig(userId).catch(() => ({})) || {};
      const canonicalAdminPhone = getCanonicalAdminPhone(user, extraConfig);
      const maskedAdminPhone = maskAdminIdentity(canonicalAdminPhone);
      const pairing = getAdminPairingStatus(user, extraConfig);

      const instancePhone = extractBotPhoneNumber(connectedBot);
      const instancePhoneMasked = maskAdminIdentity(instancePhone);

      const isBusinessAssistantEnabled = isCanonicalBusinessAssistantEnabled(user, extraConfig);

      res.json({
        success: true,
        enabled: isBusinessAssistantEnabled,
        businessAssistantEnabled: isBusinessAssistantEnabled,
        adminPhone: canonicalAdminPhone,
        adminPhoneMasked: maskedAdminPhone,
        authorizedAdminPhone: maskedAdminPhone,
        rawAdminPhone: canonicalAdminPhone,
        isVerified: pairing.isVerified,
        pairing,
        accountTimezone: getExplicitAccountTimezone(user) || getExplicitAccountTimezone(extraConfig) || "",
        effectiveTimezone: resolveBusinessTimezone(user),
        hasConfiguredTimezone: hasConfiguredTimezone(user) || hasConfiguredTimezone(extraConfig),
        instanceName: connectedBot?.name || "New Instance 1",
        instancePhone,
        instancePhoneMasked,
        role: user.role || "admin",
        instanceConnected: Boolean(connectedBot && (connectedBot.status === "connected" || connectedBot.jid)),
        botId: connectedBot?.id || "",
        walletBalance: Number(user.wallet_balance || 0),
        repliesToday,
        costToday,
        pendingRemindersCount: pendingReminders.length,
        stats: {
          customersCount: customers.length,
          active7dCount,
          ordersCount: validOrders.length,
          productsCount: physicalProducts.length,
          servicesCount: services.length,
        },
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/business-assistant/settings", async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);
      const bots = await dbService.getBotsByUser(userId).catch(() => []);
      const connectedBot = bots.find((b: any) => b.status === "connected") || bots[0] || null;

      const extraConfig = await dbService.getUserExtraConfig(userId).catch(() => ({})) || {};
      const canonicalAdminPhone = getCanonicalAdminPhone(user, extraConfig);
      const maskedAdminPhone = maskAdminIdentity(canonicalAdminPhone);
      const pairing = getAdminPairingStatus(user, extraConfig);

      const instancePhone = extractBotPhoneNumber(connectedBot);
      const instancePhoneMasked = maskAdminIdentity(instancePhone);

      const isBusinessAssistantEnabled = isCanonicalBusinessAssistantEnabled(user, extraConfig);

      res.json({
        success: true,
        enabled: isBusinessAssistantEnabled,
        businessAssistantEnabled: isBusinessAssistantEnabled,
        adminPhone: canonicalAdminPhone,
        adminPhoneMasked: maskedAdminPhone,
        authorizedAdminPhone: maskedAdminPhone,
        rawAdminPhone: canonicalAdminPhone,
        isVerified: pairing.isVerified,
        pairing,
        accountTimezone: getExplicitAccountTimezone(user) || getExplicitAccountTimezone(extraConfig) || "",
        effectiveTimezone: resolveBusinessTimezone(user),
        hasConfiguredTimezone: hasConfiguredTimezone(user) || hasConfiguredTimezone(extraConfig),
        canManagePairing: canManageAdminPairing({ user }),
        instanceName: connectedBot?.name || "New Instance 1",
        instancePhone,
        instancePhoneMasked,
        instanceConnected: Boolean(connectedBot && (connectedBot.status === "connected" || connectedBot.jid)),
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch("/api/business-assistant/settings", express.json(), async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);
      const { enabled, adminPhone, accountTimezone } = req.body || {};

      if ((adminPhone !== undefined || enabled !== undefined) && !canManageAdminPairing({ user })) {
        return res.status(403).json({
          success: false,
          error: "Only account owners and super administrators can configure Business Assistant settings or change the Admin WhatsApp number.",
        });
      }

      const extraConfig = await dbService.getUserExtraConfig(userId).catch(() => ({})) || {};
      const currentCanonical = getCanonicalAdminPhone(user, extraConfig);

      const patch: Record<string, any> = {};
      if (typeof enabled === "boolean") {
        patch.system_alerts_enabled = enabled;
        patch.business_assistant_enabled = enabled;
        patch.businessAssistantEnabled = enabled;
        patch.isBusinessAssistantEnabled = enabled;
      }
      if (typeof adminPhone === "string") {
        const cleaned = adminPhone.replace(/[^\d+]/g, "").trim();
        const normalizedNew = normalizeAdminWhatsAppIdentity(cleaned).phone;
        patch.admin_number = normalizedNew;
        patch.adminPhone = normalizedNew;
        if (normalizedNew !== currentCanonical) {
          patch.admin_number_verified = false;
          patch.admin_verified_phone = "";
          patch.admin_verified_at = null;
          patch.admin_pairing_challenge = null;
          await revokeAdminPairing(userId);
        }
      }
      if (typeof accountTimezone === "string" && isValidBusinessTimezone(accountTimezone)) {
        patch.business_timezone = accountTimezone;
        patch.timezone = accountTimezone;
      }
      await dbService.saveUserExtraConfigPatch(userId, patch).catch(() => {});
      if (patch.admin_number !== undefined || patch.business_assistant_enabled !== undefined) {
        await dbService.updateUser(userId, {
          admin_number: patch.admin_number !== undefined ? patch.admin_number : (user as any).admin_number,
          business_assistant_enabled: patch.business_assistant_enabled !== undefined ? patch.business_assistant_enabled : (user as any).business_assistant_enabled,
        }).catch(() => {});

        const userBots = await dbService.getBotsByUser(userId).catch(() => []);
        for (const b of userBots) {
          const botId = b.$id || b.id;
          try {
            const currConfig = await dbService.loadBotConfig(botId).catch(() => null) || {};
            await dbService.saveBotConfig(botId, {
              ...currConfig,
              ...(patch.business_assistant_enabled !== undefined ? {
                isBusinessAssistantEnabled: patch.business_assistant_enabled,
                business_assistant_enabled: patch.business_assistant_enabled,
              } : {}),
              ...(patch.admin_number !== undefined ? {
                adminNumber: patch.admin_number,
                admin_number: patch.admin_number,
              } : {}),
            }).catch(() => {});
          } catch {}
        }
      }
      res.json({ success: true, message: "Settings updated successfully", settings: patch });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/business-assistant/pairing/request", express.json(), async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      if (!canManageAdminPairing({ user })) {
        return res.status(403).json({
          success: false,
          error: "Only account owners and super administrators can generate a WhatsApp pairing challenge.",
        });
      }
      const userId = getStableUserId(user);
      const extraConfig = await dbService.getUserExtraConfig(userId).catch(() => ({})) || {};
      const requestedPhone = req.body?.phone;
      const phoneToPair = (typeof requestedPhone === "string" && requestedPhone.trim())
        ? requestedPhone.trim()
        : getCanonicalAdminPhone(user, extraConfig);

      if (!phoneToPair) {
        return res.status(400).json({
          success: false,
          message: "No Admin WhatsApp number configured. Please enter your Admin WhatsApp number in settings.",
        });
      }
      const result = await createAdminPairingChallenge(userId, phoneToPair);
      if (!result.success) {
        return res.status(400).json(result);
      }
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/business-assistant/pairing/verify", express.json(), async (_req, res) => {
    return res.status(400).json({
      success: false,
      reason: "whatsapp_possession_required",
      error: "Possession cannot be verified through dashboard alone. Please send 'PAIR <code>' directly from your configured WhatsApp number.",
    });
  });

  app.post("/api/business-assistant/pairing/revoke", async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      if (!canManageAdminPairing({ user })) {
        return res.status(403).json({
          success: false,
          error: "Only account owners and super administrators can revoke WhatsApp pairing.",
        });
      }
      const userId = getStableUserId(user);
      const result = await revokeAdminPairing(userId);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/business-assistant/reminders", async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const filter = String(req.query?.status || "all") as any;
      const reminders = listRemindersForAccount(getStableUserId(user), filter);
      res.json({ success: true, reminders });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/business-assistant/reminders", express.json(), async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const { text, scheduledAt, timezone } = req.body || {};
      const adminPhone = String((user as any).admin_number || user.whatsapp_number || "");
      const bots = await dbService.getBotsByUser(getStableUserId(user)).catch(() => []);

      const result = createReminderForAccount({
        accountId: getStableUserId(user),
        adminPhone,
        text,
        scheduledAt,
        timezone,
        botId: bots[0]?.id,
      });
      if (!result.success) {
        return res.status(400).json(result);
      }
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch("/api/business-assistant/reminders/:id", express.json(), async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const { scheduledAt, timezone, message } = req.body || {};
      const result = rescheduleReminderForAccount({
        accountId: getStableUserId(user),
        reminderId: req.params.id,
        scheduledAt,
        timezone,
        message,
      });
      if (!result.success) {
        return res.status(400).json(result);
      }
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/business-assistant/reminders/:id/cancel", express.json(), async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const result = cancelReminderForAccount(getStableUserId(user), req.params.id);
      if (!result.success) {
        return res.status(400).json(result);
      }
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/business-assistant/usage", async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);

      const transactions = await dbService.listWalletTransactions(userId).catch(() => []);
      const auditEvents = getAdminAuditEvents(userId, 500);

      const nowMs = Date.now();
      const startOfDayMs = new Date().setHours(0, 0, 0, 0);
      const sevenDaysAgoMs = nowMs - 7 * 86400 * 1000;

      const todayEvents = auditEvents.filter((e) => e.timestamp >= startOfDayMs);
      const sevenDayEvents = auditEvents.filter((e) => e.timestamp >= sevenDaysAgoMs);

      const messagesToday = todayEvents.length;
      const spendToday = Number((messagesToday * 0.003).toFixed(4));
      const spend7d = Number((sevenDayEvents.length * 0.003).toFixed(4));

      res.json({
        success: true,
        messagesToday,
        spendToday,
        spend7d,
        walletBalance: Number(user.wallet_balance || 0),
        transactions: transactions.slice(0, 20),
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/business-assistant/activity", async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const limit = Math.min(100, Math.max(1, Number(req.query?.limit || 50)));
      const events = getAdminAuditEvents(getStableUserId(user), limit);
      res.json({ success: true, events });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/business-assistant/capabilities", async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const allActions = listAdminActions();
      const role = String(user.role || (user.is_owner ? "owner" : "admin")).toLowerCase().trim();

      const roleHierarchy: Record<string, number> = {
        super_admin: 100,
        owner: 100,
        admin: 80,
        manager: 60,
        member: 20,
        agent: 20,
        viewer: 10,
      };
      const userLevel = roleHierarchy[role] || (user.is_owner ? 100 : 80);

      const filtered = allActions.filter((a) => {
        // Exclude internal test category actions
        if (a.category === "test") return false;
        // Exclude dormant / internal-only feature categories
        if (a.category === "meta_cloud" || a.category === "inbox_v2") return false;
        // Role check
        const reqLevel = roleHierarchy[a.requiredRole] || 80;
        return userLevel >= reqLevel;
      });

      const safeActions = filtered.map((a) => ({
        actionId: a.actionId,
        category: a.category,
        label: a.label,
        description: a.description,
        riskLevel: a.riskLevel,
        requiredRole: a.requiredRole,
        requiresConfirmation: a.requiresConfirmation,
        isDashboardOnly: Boolean(a.isDashboardOnly),
      }));

      res.json({
        success: true,
        capabilities: safeActions,
        userRole: role,
        totalRegistered: allActions.length,
        displayedCount: safeActions.length,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/user/products/save", express.json(), async (req, res) => {
    try {
      const { product } = req.body;
      if (!product) return res.status(400).json({ error: "Missing data" });
      const sessionUser = await requireSessionAccount(req, res);
      if (!sessionUser) return;
      const accessState = await requireAccountFeatureAccess(getStableUserId(sessionUser), res);
      if (!accessState) return;
      const user = accessState.user;

      if (!product.id) {
          const subscriptions = await dbService.getSubscriptions(user.$id);
          const limits = buildAccountLimits(user, subscriptions);
          const total_product_limit = limits.productLimit;
          
          const existingProducts = await dbService.listProducts(user.$id);
          if (existingProducts.length >= total_product_limit) {
              return res.status(400).json({ error: `Product limit reached (${total_product_limit}). Choose a paid plan or matching Creem add-on to continue.` });
          }
      }

      await dbService.saveProduct(user.$id, product);
      
      // Tell workers to check for back-in-stock reminders if stock is now > 0
      if (productHasAnyStock(product)) {
        for (const [botId, workerInfo] of activeWorkers.entries()) {
            const botData = await dbService.getBotById(botId);
            if (botData && botData.user_id === user.$id) {
                fetch(`http://127.0.0.1:${workerInfo.port}/api/check-stock-reminders`, {
                  method: "POST",
                  headers: buildWorkerInternalHeaders(),
                }).catch(e => console.error(`Failed to trigger stock check for bot ${botId}:`, e));
            }
        }
      }

      res.json({ success: true });
    } catch(e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/user/products/delete", express.json(), async (req, res) => {
    try {
      const { productId } = req.body;
      if (!productId) return res.status(400).json({ error: "Missing data" });
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);
      await dbService.deleteProduct(userId, productId);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Meta Official API Provider Health Check (Authenticated)
  app.post("/api/bots/meta-health-check", express.json({ limit: "16kb" }), async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);
      const botId = String(req.body?.botId || req.query?.botId || "").trim();

      if (!botId) {
        return res.status(400).json({ error: "botId is required" });
      }

      const bot = await dbService.getBotById(botId).catch(() => null) as any;
      if (!bot || String(bot.user_id || "") !== userId) {
        return res.status(403).json({ error: "Unauthorized bot access" });
      }

      const providerConfig = await dbService.getBotProviderConfig(botId);
      if (!providerConfig || providerConfig.providerType !== "whatsapp_cloud_api") {
        return res.status(400).json({ error: "This instance is not configured for WhatsApp Cloud API" });
      }

      let decryptedToken: string | undefined;
      if (providerConfig.encryptedAccessTokenRef) {
        try {
          decryptedToken = decryptServerSecret(providerConfig.encryptedAccessTokenRef);
        } catch {}
      }

      const health = await evaluateCloudProviderHealth({
        botId,
        accountId: userId,
        phoneNumberId: providerConfig.phoneNumberId,
        wabaId: providerConfig.businessAccountId || (providerConfig as any).wabaId,
        runtimeEnabled: process.env.WHATSAPP_CLOUD_API_RUNTIME_ENABLED === "true",
        accessToken: decryptedToken,
        performGraphCheck: true,
      });

      res.json({ success: true, health });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Health check failed" });
    }
  });

  // Meta Official API Platform Preflight (Authenticated)
  app.get("/api/meta-platform/preflight", async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const preflight = checkCloudPlatformPreflight();
      res.json({ success: true, preflight });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Preflight check failed" });
    }
  });

  // Meta Official API Onboarding - Public Config for Embedded Signup
  app.get("/api/meta-onboarding/config", (_req, res) => {
    try {
      const config = getMetaOnboardingPublicConfig();
      res.json(config);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to load onboarding config" });
    }
  });

  // Meta Official API Onboarding - Start Attempt (Authenticated)
  app.post("/api/meta-onboarding/start", async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);
      const { botId, purpose } = req.body || {};
      if (!botId) {
        return res.status(400).json({ error: "botId is required" });
      }
      const bot = await dbService.getBotById(botId).catch(() => null) as any;
      if (!bot || String(bot.user_id || "") !== userId) {
        return res.status(403).json({ error: "Unauthorized bot access" });
      }
      const attempt = createOnboardingAttempt({ userId, botId, purpose });
      res.json({ success: true, attemptId: attempt.attemptId, state: attempt.state });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to start onboarding attempt" });
    }
  });

  // Meta Official API Onboarding - Complete Attempt (Authenticated)
  app.post("/api/meta-onboarding/complete", async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);
      const { botId, attemptId, state, code, sessionInfo, registrationPin } = req.body || {};
      if (!botId || !attemptId || !state || !code || !sessionInfo || !registrationPin) {
        return res.status(400).json({ error: "Missing required onboarding parameters" });
      }

      const result = await completeMetaOnboarding(
        {
          userId,
          botId,
          attemptId,
          state,
          code,
          wabaId: sessionInfo.wabaId,
          phoneNumberId: sessionInfo.phoneNumberId,
          businessId: sessionInfo.businessId,
          pin: registrationPin,
        },
        {
          getBotById: (bId: string) => dbService.getBotById(bId),
          saveBotProviderConfig: (bId: string, cfg: any) => dbService.saveBotProviderConfig(bId, cfg),
          listAllBots: () => dbService.getBotsByUser ? dbService.getBotsByUser(userId) : Promise.resolve([]),
          encryptSecret: (raw: string) => encryptServerSecret(raw),
        }
      );

      res.json({ success: true, ...result });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to complete onboarding" });
    }
  });

  // Meta Official API Onboarding - Disconnect Instance (Authenticated)
  app.post("/api/meta-onboarding/disconnect", async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);
      const { botId } = req.body || {};
      if (!botId) {
        return res.status(400).json({ error: "botId is required" });
      }

      const result = await disconnectMetaCloudInstance(
        { userId, botId },
        {
          getBotById: (bId: string) => dbService.getBotById(bId),
          saveBotProviderConfig: (bId: string, cfg: any) => dbService.saveBotProviderConfig(bId, cfg),
        }
      );

      res.json({ success: true, ...result });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to disconnect instance" });
    }
  });

  // WhatsApp Cloud API - Sync WABA Templates (Authenticated)
  app.post("/api/whatsapp-templates/sync", async (req, res) => {
    try {
      const user = await requireSessionAccount(req, res);
      if (!user) return;
      const userId = getStableUserId(user);
      const { botId } = req.body || {};
      if (!botId) {
        return res.status(400).json({ error: "botId is required" });
      }

      const bot = await dbService.getBotById(botId).catch(() => null) as any;
      if (!bot || String(bot.user_id || "") !== userId) {
        return res.status(403).json({ error: "Unauthorized bot access" });
      }

      const result = await syncWabaTemplatesForBot({
        botId,
        accountId: userId,
      });

      if (!result.success) {
        return res.status(400).json({ error: result.error || "Template sync failed" });
      }

      res.json({ success: true, count: result.syncedCount, templates: result.templates });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Template sync failed" });
    }
  });



  // Vite + Frontend serving
  app.get("/sitemap.xml", (_req, res) => {
    res.type("application/xml").send(buildSitemapXml());
  });

  app.get("/robots.txt", (_req, res) => {
    res.type("text/plain").send(buildRobotsTxt());
  });

  app.use((err, req, res, next) => {
    console.error("[Manager] Unhandled API Error:", typeof err === "object" ? err.stack : err);
    res.status(500).json({ error: "Internal API Error" });
  });

  app.use("/api", (req, res) => {
    res.status(404).json({ error: "API route not found", path: req.originalUrl || req.url });
  });

  if (process.env.NODE_ENV !== "production") {
    console.log("[Manager] Initializing Vite middleware...");
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    console.log("[Manager] Vite middleware created.");
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath, { index: false }));
    app.get("*", (req, res) => {
      const indexPath = path.join(distPath, "index.html");
      let html = fs.readFileSync(indexPath, "utf8");
      html = injectPersonalAssistantRuntimeConfig(html, isPersonalAssistantFeatureEnabled());
      if (!isStaging && isPublicAuthLocation(req.path)) {
        html = injectPublicSeoIntoHtml(html, req.path);
      }
      res.type("html").send(html);
    });
  }

  const server = http.createServer(app);
  console.log("[Manager] HTTP server created. Registering upgrade handler...");

  if (!isStaging) initSocketServer(server, {
    parseSessionToken,
    readCookieValueFromHeader,
    authCookieName: AUTH_COOKIE_NAME,
    getUser: dbService.getUser,
    getStableUserId,
    isAdminAccount,
    listUserBots: (userId: string) => dbService.getBotsByUser(userId),
  });

  // Proxy WebSockets for bot workers
  server.on("upgrade", (req, socket, head) => {
    try {
      if (!req.url) return socket.destroy();
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const botId = url.searchParams.get("botId");
      if (req.url.startsWith(`${MAIN_REALTIME_SOCKET_PATH}/`) || req.url === MAIN_REALTIME_SOCKET_PATH) {
        return;
      }
      if (req.url.startsWith('/socket.io/')) {
        if (!botId) {
          return socket.destroy();
        }
      }
      const origin = normalizeOriginValue(req.headers.origin as string | undefined);
      if (origin && !isTrustedAppOrigin(origin)) {
        logSecurityEvent("blocked_origin", {
          origin,
          ip: String(req.socket.remoteAddress || "").replace(/^::ffff:/, "") || "unknown",
          method: "UPGRADE",
          path: req.url,
        });
        return socket.destroy();
      }
      
      if (!botId) {
         return socket.destroy();
      }
      const session = parseSessionToken(readCookieValueFromHeader(req.headers.cookie, AUTH_COOKIE_NAME));
      if (!session?.userId) return socket.destroy();

      Promise.all([
        dbService.getUser(String(session.userId)).catch(() => null),
        dbService.getBotById(botId).catch(() => null),
      ]).then(([user, bot]) => {
        if (!user || !bot || String(bot.user_id || "") !== getStableUserId(user)) {
          return socket.destroy();
        }
        spawnWorker(botId, String(bot.user_id), "dashboard_wake").then(worker => {
          proxy.ws(req, socket, head, { target: `http://127.0.0.1:${worker.port}` });
        }).catch(() => socket.destroy());
      }).catch(() => socket.destroy());
    } catch(e) {
      socket.destroy();
    }
  });


  if (isStaging) {
    if (fs.existsSync('/state/http.sock')) {
      if (!fs.lstatSync('/state/http.sock').isSocket()) throw new Error('Invalid staging socket path');
      fs.unlinkSync('/state/http.sock');
    }
    server.listen('/state/http.sock', () => {
      fs.chmodSync('/state/http.sock', 0o600);
      console.log('[Black Arrow] Isolated staging ready; jobs, messaging, AI and realtime disabled.');
    });
    return;
  }
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[Manager] Cluster Router running on http://localhost:${PORT}`);
    console.log(`[Manager] Ready. Open http://localhost:${PORT}/ only after this line appears in the terminal.`);
    startFollowupWorker();
    startProxyHealthCheck();
    startWebshareSync();
    startSubscriptionAlertWorker();
    startActiveLinkedWorkerWatchdog();
    startProactiveBusinessScheduler();
    startAdminReminderScheduler();
    ensureCampaignAndContactsSchema().catch(() => {});
    ensureWorkspaceSchema().catch(() => {});
  });
}

async function startSubscriptionAlertWorker() {
  console.log("[Manager] Creem billing status worker started. Wallet-backed plan/add-on renewals are disabled.");
  setInterval(async () => {
    try {
      const currentTime = now();
      const users = await dbService.listUsers();
      for (const user of users as any[]) {
        const paidAccessConfirmed = await dbService.hasPaidAccessEvidence(user.$id || user.id, user).catch(() => false);
        const access = getBillingAccess({ ...user, paid_access_confirmed: paidAccessConfirmed }, currentTime);
        const alertDate = billingAlertDateKey(currentTime);
        if (access.trialActive) {
          await markBillingNotificationStateResolved({
            userId: user.$id,
            alertType: "trial_expired",
            currentStatus: access.status,
            billingStatus: access.status,
            stateVersion: access.trialExpiry || "trial_active",
            stateChangedAt: access.trialExpiry || 0,
          }).catch(() => {});
          const daysLeft = Math.ceil((access.trialExpiry - currentTime) / 86400);
          if (daysLeft >= 1 && daysLeft <= 3) {
            await sendBillingNotification({
              userId: user.$id,
              title: "Trial expiring soon",
              status: `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`,
              action: "Choose a paid plan in Billing to continue after trial.",
              messageMode: "reminder",
              alertType: `trial_expiring_${daysLeft}_day${daysLeft === 1 ? "" : "s"}`,
              billingStatus: "trial_expiring",
              stateVersion: alertDate,
              stateChangedAt: access.trialExpiry || 0,
              dailyDedupeDate: alertDate,
              sendWhatsApp: sendWhatsAppFromSystem
            }).catch(() => {});
          }
        } else if (access.trialExpired) {
          await sendBillingNotification({
            userId: user.$id,
            title: "Trial expired",
            status: "Upgrade required",
            action: "Choose Starter, Growth, or Pro from Billing to continue using plan features.",
            messageMode: "reminder",
            alertType: "trial_expired",
            billingStatus: "expired",
            stateVersion: alertDate,
            stateChangedAt: access.trialExpiry || 0,
            dailyDedupeDate: alertDate,
            hardSafetyCooldownSeconds: 7 * 24 * 60 * 60,
            whatsAppMessage: "BlackArrow billing reminder\nYour trial has ended. Please choose Starter, Growth, or Pro from Billing to continue using plan features.",
            sendWhatsApp: sendWhatsAppFromSystem
          }).catch(() => {});
        } else {
          await markBillingNotificationStateResolved({
            userId: user.$id,
            alertType: "trial_expired",
            currentStatus: access.status,
            billingStatus: access.status,
            stateVersion: access.trialExpiry || access.planExpiry || "inactive",
            stateChangedAt: access.planExpiry || access.trialExpiry || 0,
          }).catch(() => {});
        }
        if (access.paidActive) {
          await markBillingNotificationStateResolved({
            userId: user.$id,
            alertType: "subscription_expired",
            currentStatus: access.status,
            billingStatus: access.status,
            stateVersion: access.planExpiry || "paid_active",
            stateChangedAt: access.planExpiry || 0,
          }).catch(() => {});
          const daysLeft = Math.ceil((access.planExpiry - currentTime) / 86400);
          if (daysLeft >= 1 && daysLeft <= 3) {
            await sendBillingNotification({
              userId: user.$id,
              title: "Subscription expiring soon",
              status: `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`,
              action: "Renew or choose a plan in Billing to keep service active.",
              messageMode: "reminder",
              alertType: `subscription_expiring_${daysLeft}_day${daysLeft === 1 ? "" : "s"}`,
              billingStatus: "subscription_expiring",
              stateVersion: alertDate,
              stateChangedAt: access.planExpiry || 0,
              dailyDedupeDate: alertDate,
              sendWhatsApp: sendWhatsAppFromSystem
            }).catch(() => {});
          }
        } else if (!access.trialActive && !access.trialExpired && access.planExpiry > 0 && access.planExpiry <= currentTime) {
          await sendBillingNotification({
            userId: user.$id,
            title: "Subscription expired",
            status: "Renewal required",
            action: "Renew or choose a plan in Billing to continue using plan features.",
            messageMode: "reminder",
            alertType: "subscription_expired",
            billingStatus: "expired",
            stateVersion: alertDate,
            stateChangedAt: access.planExpiry || 0,
            dailyDedupeDate: alertDate,
            sendWhatsApp: sendWhatsAppFromSystem
          }).catch(() => {});
        }
        if ((access.paidActive || access.trialActive) && MINIMUM_BILLABLE_USAGE_COST_USD > 0) {
          const walletBalance = Math.max(0, Number(user.wallet_balance || 0));
          if (walletBalance < MINIMUM_BILLABLE_USAGE_COST_USD) {
            await sendBillingNotification({
              userId: user.$id,
              title: "Wallet low balance",
              status: `Balance $${walletBalance.toFixed(3)}`,
              amount: `Minimum $${MINIMUM_BILLABLE_USAGE_COST_USD.toFixed(3)}`,
              action: "Top up your wallet in Billing to keep AI and automation sends available.",
              messageMode: "reminder",
              alertType: "wallet_low_balance",
              billingStatus: "wallet_low",
              stateVersion: alertDate,
              stateChangedAt: currentTime,
              dailyDedupeDate: alertDate,
              sendWhatsApp: sendWhatsAppFromSystem
            }).catch(() => {});
          }
        }
      }
    } catch (e) {
      console.error("[Manager] Creem billing status worker error:", e);
    }
  }, 60 * 60 * 1000);
}

async function startWebshareSync() {
  console.log("[Manager] Webshare Auto-Sync started.");
  let isRunning = false;
  const runWebshareSync = async () => {
    if (isRunning) return;
    isRunning = true;
    try {
      const token = await dbService.getGlobalSetting("webshare_api_token");
      if (!token) return;
      console.log("[Manager] Running Webshare Auto-Sync...");
      const response = await fetch("https://proxy.webshare.io/api/v2/proxy/list/?mode=direct&page=1&page_size=250", {
        headers: { "Authorization": `Token ${token}` }
      });
      if (response.ok) {
        const data: any = await response.json();
        if (data && data.results && data.results.length > 0) {
           const existingProxies = await dbService.getSystemProxies() as any[];
           const existingUrls = new Set<string>(existingProxies.map(p => p.url));
           const newUrls = new Set<string>(data.results.map((p: any) => `http://${p.username}:${p.password}@${p.proxy_address}:${p.port}`));
           
           let added = 0;
           let removed = 0;
           
           // Remove existing proxies that belong to this webshare account but are no longer in the list
           // We identify them by checking if the URL contains the base username
           const webshareUsernameBase = data.results[0].username.split('-')[0];
           for (const proxy of existingProxies) {
               if (proxy.url.includes(webshareUsernameBase) && !newUrls.has(proxy.url)) {
                   await dbService.deleteSystemProxy(proxy.$id || proxy.id);
                   removed++;
               }
           }
           
           for (const url of newUrls) {
             if (!existingUrls.has(url)) {
               await dbService.addSystemProxy(url);
               added++;
             }
           }
           if (added > 0 || removed > 0) {
              console.log(`[Manager] Webshare Auto-Sync completed. Added: ${added}, Removed: ${removed}`);
           }
        }
      }
    } catch(e) {
      console.error("[Manager] Webshare Auto-Sync error:", e);
    } finally {
      isRunning = false;
    }
  };

  setTimeout(runWebshareSync, 10 * 1000);
  setInterval(runWebshareSync, 30 * 60 * 1000);
}

async function startProxyHealthCheck() {
  console.log("[Manager] Proxy health checker started.");
  let isRunning = false;
  const runProxyHealthCheck = async () => {
    if (isRunning) return;
    isRunning = true;
    try {
      const result = await checkSystemProxyList(dbService);
      console.log(`[Manager] Proxy health check complete. total=${result.total}, ok=${result.ok}, failed=${result.failed}`);
    } catch(e) {
      console.error("[Manager] Proxy checker error:", e);
    } finally {
      isRunning = false;
    }
  };

  setTimeout(runProxyHealthCheck, PROXY_HEALTH_INITIAL_DELAY_MS);
  setInterval(runProxyHealthCheck, PROXY_HEALTH_INTERVAL_MS);
}

async function startFollowupWorker() {
  console.log("[Follow-up Bot] Worker started. Checking selected campaigns every 15 minutes...");
  let isRunning = false;
  followupSchedulerState.started = true;
  followupSchedulerState.nextScanAt = Date.now() + 30 * 1000;

  const runFollowupScan = async () => {
    if (isRunning) return;
    isRunning = true;
    followupSchedulerState.running = true;
    followupSchedulerState.lastScanAt = Date.now();
    followupSchedulerState.nextScanAt = Date.now() + FOLLOWUP_SCAN_INTERVAL_MS;
    let due: any[] = [];
    let sentCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    let scanReason = "";
    try {
      if (!isFollowupSchedulerEnabled()) {
        scanReason = "FOLLOWUP_SCHEDULER_ENABLED=false";
        console.warn("[Follow-up Bot] Scheduler disabled by FOLLOWUP_SCHEDULER_ENABLED=false. No follow-ups sent.");
        return;
      }
      due = await dbService.getFollowupDueCustomers();
      console.log(`[Follow-up Bot] Scan found ${due.length} due customer(s) at or past their configured follow-up time.`);
      if (!due.length) {
        scanReason = "No eligible contacts matched the active follow-up campaign windows.";
      }
      const dueToSend = due.slice(0, FOLLOWUP_MAX_SENDS_PER_SCAN);
      if (due.length > dueToSend.length) {
        scanReason = `Scan capped at ${FOLLOWUP_MAX_SENDS_PER_SCAN} sends; remaining due contacts will be retried on the next scan.`;
        console.warn(`[Follow-up Bot] Scan capped at ${FOLLOWUP_MAX_SENDS_PER_SCAN} sends. ${due.length - dueToSend.length} due customer(s) deferred.`);
      }
      if (dueToSend.length > 0) {
        for (const item of dueToSend) {
          const configuredDefaultBotId = item.defaultBotId || item.botId;
          const ownerUserId = await getUserIdByBot(configuredDefaultBotId) || await getUserIdByBot(item.botId);
          const campaignBot = await dbService.getBotById(item.botId).catch(() => null) as any;
          const campaignValidation = validateFollowupCampaignStillSendable({
            bot: campaignBot,
            followupId: item.followupId,
            campaignType: item.campaignType,
          });
          if (!campaignValidation.ok) {
            skippedCount++;
            scanReason = campaignValidation.reason || scanReason;
            await dbService.recordFollowupDelivery(item.ownerKey || item.botJid || item.botId, item.customerId, {
              followupId: item.followupId,
              status: "skipped",
              reason: campaignValidation.reason,
              attemptKey: item.attemptKey,
              customerLastMessageAt: item.lastMessageAt,
              billingDedupeKey: item.billingDedupeKey || item.attemptKey,
            }).catch((e: any) => console.error("[Follow-up Bot] Failed recording deleted campaign skip:", e?.message || e));
            appendMarketingReport({
              userId: ownerUserId || "",
              botId: item.botId,
              botName: item.botName,
              actualBotId: "",
              actualBotJid: "",
              defaultBotId: configuredDefaultBotId,
              sendFromMode: item.sendFromMode || "default_only",
              fallbackReason: "",
              followupId: item.followupId,
              campaignName: item.campaignName,
              campaignType: item.campaignType,
              audience: item.audience,
              status: "skipped",
              contact: item.contact,
              phone: item.phone,
              customerJid: item.customerId,
              sourceCustomerId: item.sourceCustomerId,
              reason: campaignValidation.reason,
              attemptKey: item.attemptKey,
              billingDedupeKey: item.billingDedupeKey || item.attemptKey,
              costCharged: 0,
              windowFromHours: item.windowFromHours,
              windowToHours: item.windowToHours
            });
            continue;
          }
          const accountBots = ownerUserId ? await dbService.getBotsByUser(ownerUserId).catch(() => []) as any[] : [];
          const resolvedSender = resolveCampaignSendingInstance({
            defaultBotId: configuredDefaultBotId,
            sendFromMode: item.sendFromMode,
            customer: item.customer || item.profile || {},
            bots: accountBots,
            isBotConnected: (bot) => activeWorkers.has(String(bot?.$id || bot?.id || "")),
          });
          const actualBotId = resolvedSender.botId || configuredDefaultBotId;
          const actualBotJid = resolvedSender.botJid || "";
          let worker = activeWorkers.get(actualBotId);
          if (!worker) {
            if (ownerUserId) {
              worker = await spawnWorker(actualBotId, ownerUserId, "watchdog_restore");
            }
          }

          if (worker) {
            console.log(`[Follow-up Bot] Sending follow-up to ${item.customerId} via bot ${actualBotId}`);
            const result = await deliverMarketingFollowup({
              item: {
                ...item,
                actualBotId,
                actualBotJid,
                defaultBotId: configuredDefaultBotId,
                sendFromMode: resolvedSender.sendFromMode,
                fallbackReason: resolvedSender.fallbackReason,
                billingDedupeKey: item.billingDedupeKey || item.attemptKey,
              },
              ownerUserId: ownerUserId || "",
              sendThroughWorker: () => sendFollowupThroughWorker({
                port: worker.port,
                customerId: item.customerId,
                sourceCustomerId: item.sourceCustomerId,
                offerContext: item.offerContext,
                campaignName: item.campaignName,
                campaignType: item.campaignType,
                followupId: item.followupId,
                attemptKey: item.attemptKey,
                billingDedupeKey: item.billingDedupeKey || item.attemptKey,
                triggerLastMessageAt: item.lastMessageAt,
              }),
              recordDelivery: dbService.recordFollowupDelivery,
              appendReport: appendMarketingReport,
            });
            if (result.status === "sent") {
              sentCount++;
            } else if (result.status === "skipped") {
              skippedCount++;
              scanReason = result.reason || scanReason;
            } else if (result.status === "failed") {
              failedCount++;
              scanReason = result.reason || scanReason;
              console.error(`[Follow-up Bot] Failed to send message to worker: ${result.reason || "unknown error"}`);
            }
          } else {
            failedCount++;
            scanReason = "Bot worker is not running and could not be started.";
            await dbService.recordFollowupDelivery(item.ownerKey || item.botJid || item.botId, item.customerId, {
              followupId: item.followupId,
              status: "failed",
              reason: "Bot worker is not running and could not be started.",
              attemptKey: item.attemptKey,
              customerLastMessageAt: item.lastMessageAt,
              billingDedupeKey: item.billingDedupeKey || item.attemptKey,
            });
            appendMarketingReport({
              userId: ownerUserId || "",
              botId: actualBotId,
              botName: item.botName,
              actualBotId,
              actualBotJid,
              defaultBotId: configuredDefaultBotId,
              sendFromMode: item.sendFromMode || "default_only",
              fallbackReason: "origin_disconnected",
              followupId: item.followupId,
              campaignName: item.campaignName,
              campaignType: item.campaignType,
              audience: item.audience,
              status: "failed",
              contact: item.contact,
              phone: item.phone,
              customerJid: item.customerId,
              sourceCustomerId: item.sourceCustomerId,
              reason: "Bot worker is not running and could not be started.",
              attemptKey: item.attemptKey,
              billingDedupeKey: item.billingDedupeKey || item.attemptKey,
              costCharged: 0,
              windowFromHours: item.windowFromHours,
              windowToHours: item.windowToHours
            });
          }
        }
      }
    } catch (e) {
      console.error("[Follow-up Bot] Error in check loop:", e);
      scanReason = e instanceof Error ? e.message : String(e);
    } finally {
      followupSchedulerState.lastReason = scanReason;
      appendMarketingReport({
        status: "scan",
        foundCount: due.length,
        sentCount,
        failedCount,
        skippedCount,
        reason: scanReason
      });
      console.log(`[Follow-up Bot] Scan report: found=${due.length}, sent=${sentCount}, failed=${failedCount}, skipped=${skippedCount}.`);
      isRunning = false;
      followupSchedulerState.running = false;
    }
  };

  setTimeout(runFollowupScan, 30 * 1000);
  setInterval(runFollowupScan, FOLLOWUP_SCAN_INTERVAL_MS);
}

function startProxyQuotaCleanupScheduler() {
  let running = false;
  const runCleanup = async () => {
    if (running) return;
    running = true;
    try {
      const bots = await dbService.listBots(1000).catch(() => []) as any[];
      let needsWorkerRestore = false;
      for (const bot of bots) {
        const botId = String(bot?.$id || bot?.id || "");
        if (!botId) continue;
        if (activeWorkers.has(botId)) {
          await dbService.updateBotRuntimeActivity(botId, {
            direction: "status",
            connectionStatus: "worker_running",
          }).catch(() => {});
          continue;
        }
        if (!botWorkerLifecycle.shouldReleaseProxyForMissingWorker(bot)) {
          console.log(`[Manager] watchdog_restore: active linked bot ${botId} has no worker during proxy cleanup; preserving proxy lease.`);
          needsWorkerRestore = true;
          continue;
        }
        await dbService.releaseProxyQuotaForInactiveBot(botId, "scheduled proxy quota cleanup").catch(() => {});
      }
      if (needsWorkerRestore) {
        restoreActiveLinkedWorkers("watchdog_restore").catch(() => {});
      }
    } catch (e: any) {
      console.warn("[ProxyLease] scheduled cleanup failed:", e?.message || e);
    } finally {
      running = false;
    }
  };
  setTimeout(runCleanup, 2 * 60 * 1000);
  setInterval(runCleanup, PROXY_QUOTA_CLEANUP_INTERVAL_MS);
}

function startCampaignScheduler() {
  let isRunning = false;
  const runSweep = async () => {
    if (isRunning) return;
    isRunning = true;
    try {
      await processDueCampaignRecipients({
        workerId: "server_scheduler",
        sendTextMessageFn: async (jid, text, options) => {
          const botId = options?.sendingInstanceId || "";
          let port: number | undefined;
          if (activeWorkers.has(botId)) {
            port = activeWorkers.get(botId)!.port;
          }
          if (!port) {
            return { success: false, error: "Sending instance worker is not running" };
          }
          const resp = await fetch(`http://127.0.0.1:${port}/api/send-message`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...buildWorkerInternalHeaders() },
            body: JSON.stringify({
              to: jid,
              text,
              contextType: "campaign",
              idempotencyKey: `camp_send_${options?.recipientId || Date.now()}`,
            }),
          });
          const body: any = await resp.json().catch(() => ({}));
          if (resp.ok && (body.success || body.messageId)) {
            return {
              success: true,
              messageId: body.messageId || `msg_camp_${Date.now()}`,
              rawReceipt: body,
            };
          }
          return { success: false, error: body.error || `Worker send failed (${resp.status})` };
        },
        isInstanceConnectedFn: (botId: string) => activeWorkers.has(botId),
      });
    } catch (e: any) {
      console.warn("[CampaignScheduler] Sweep error:", e?.message || e);
    } finally {
      isRunning = false;
    }
  };

  setTimeout(runSweep, 15 * 1000);
  setInterval(runSweep, 30 * 1000);
}

function startWorkspaceReminderScheduler() {
  let isRunning = false;
  const runSweep = async () => {
    if (isRunning) return;
    isRunning = true;
    try {
      await sweepDueReminders(async (groupJid, text) => {
        console.log(`[WorkspaceReminderScheduler] Reminder triggered for group ${groupJid}: ${text}`);
      });
    } catch (e: any) {
      console.warn("[WorkspaceReminderScheduler] Sweep error:", e?.message || e);
    } finally {
      isRunning = false;
    }
  };

  setTimeout(runSweep, 20 * 1000);
  setInterval(runSweep, 60 * 1000);
}

startServer().catch(err => {
  console.error("[Manager] FATAL STARTUP ERROR:", err);
  process.exit(1);
});

function startBillingReconciliationProcessor() {
  const started = startBillingReconciliationScheduler({
    initialDelayMs: 15 * 1000,
    intervalMs: 60 * 1000,
    batchSize: 50,
  });
  if (started) {
    console.log("[Manager] Durable Billing Reconciliation Scheduler initialized (interval: 60s, delay: 15s).");
  }
}

if (!isStaging) {
startProxyQuotaCleanupScheduler();
startCampaignScheduler();
startWorkspaceReminderScheduler();
startBillingReconciliationProcessor();
}
