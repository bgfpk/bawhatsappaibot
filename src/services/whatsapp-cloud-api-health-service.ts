// src/services/whatsapp-cloud-api-health-service.ts
//
// Provider health monitoring, webhook health tracking, Graph API reachability,
// and quality rating diagnostics for Meta WhatsApp Cloud API instances.
//
// Guarantees:
// - Separate health dimensions (Setup, Runtime, API Access, Webhook, Phone Quality, Templates)
// - Never collapses distinct states into a single misleading green badge
// - Safe sanitized metadata (display phone, verified name, quality rating)
// - Never logs or exposes raw access tokens, authorization headers, or secrets

import { buildCloudApiGraphUrl } from "./whatsapp-cloud-api-version.ts";
import { isPhoneInCooldown } from "./whatsapp-cloud-api-rate-controller.ts";
import { getCachedTemplatesForBot } from "./whatsapp-cloud-api-template-service.ts";

export type CloudOverallHealthStatus =
  | "setup_required"
  | "configured"
  | "runtime_disabled"
  | "active"
  | "degraded"
  | "reauth_required"
  | "rate_limited"
  | "webhook_inactive"
  | "template_attention"
  | "error";

export interface CloudProviderHealthSummary {
  overallStatus: CloudOverallHealthStatus;
  setup: "configured" | "setup_required";
  runtime: "enabled" | "disabled";
  apiAccess: "reachable" | "unreachable" | "reauth_required" | "rate_limited" | "not_checked";
  webhook: "active" | "awaiting_activity" | "inactive";
  phoneNumberId?: string;
  wabaId?: string;
  displayPhoneNumber?: string;
  verifiedName?: string;
  qualityRating?: "GREEN" | "YELLOW" | "RED" | "UNKNOWN";
  codeVerificationStatus?: string;
  templates: {
    totalCount: number;
    approvedCount: number;
    lastSyncedAt: number | null;
  };
  webhooks: {
    lastValidSignedWebhookAt: number | null;
    lastInboundMessageWebhookAt: number | null;
    lastStatusWebhookAt: number | null;
  };
  lastCheckedAt: number;
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  needsAttentionReason?: string;
}

export interface WebhookActivityRecord {
  lastValidSignedWebhookAt: number | null;
  lastInboundMessageWebhookAt: number | null;
  lastStatusWebhookAt: number | null;
}

const webhookActivityStore = new Map<string, WebhookActivityRecord>();
const healthSummariesStore = new Map<string, CloudProviderHealthSummary>();

function clean(value: any): string {
  return String(value ?? "").trim();
}

/**
 * Gets or initializes webhook activity record for a phone number or bot ID.
 */
export function getWebhookActivity(key: string): WebhookActivityRecord {
  const cleanKey = clean(key);
  let record = webhookActivityStore.get(cleanKey);
  if (!record) {
    record = {
      lastValidSignedWebhookAt: null,
      lastInboundMessageWebhookAt: null,
      lastStatusWebhookAt: null,
    };
    webhookActivityStore.set(cleanKey, record);
  }
  return record;
}

/**
 * Records webhook activity for health tracking.
 */
export function recordCloudWebhookActivity(
  key: string,
  eventType: "signed_webhook" | "inbound_message" | "status" | "template_status"
): void {
  const record = getWebhookActivity(key);
  const now = Date.now();
  record.lastValidSignedWebhookAt = now;

  if (eventType === "inbound_message") {
    record.lastInboundMessageWebhookAt = now;
  } else if (eventType === "status") {
    record.lastStatusWebhookAt = now;
  }
}

/**
 * Fetches phone number metadata from Meta Graph API using decrypted access token.
 * Sanitizes output and catches errors safely without leaking tokens.
 */
export async function fetchMetaPhoneNumberMetadata(params: {
  phoneNumberId: string;
  accessToken: string;
  fetchImpl?: typeof fetch;
  versionOverride?: string;
}): Promise<{
  success: boolean;
  httpStatus?: number;
  displayPhoneNumber?: string;
  verifiedName?: string;
  qualityRating?: "GREEN" | "YELLOW" | "RED" | "UNKNOWN";
  codeVerificationStatus?: string;
  errorCode?: string;
  errorReason?: string;
}> {
  const phoneNumberId = clean(params.phoneNumberId);
  const accessToken = clean(params.accessToken);
  const fetchFn = params.fetchImpl || fetch;

  if (!phoneNumberId || !accessToken) {
    return { success: false, errorReason: "missing_credentials" };
  }

  try {
    const url = buildCloudApiGraphUrl(
      `${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating,code_verification_status`,
      params.versionOverride
    );

    const res = await fetchFn(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });

    if (res.status === 401 || res.status === 403) {
      return {
        success: false,
        httpStatus: res.status,
        errorCode: "reauth_required",
        errorReason: "Meta access token is invalid or expired",
      };
    }

    if (res.status === 429) {
      return {
        success: false,
        httpStatus: 429,
        errorCode: "rate_limited",
        errorReason: "Meta API rate limit exceeded",
      };
    }

    if (!res.ok) {
      return {
        success: false,
        httpStatus: res.status,
        errorCode: `meta_api_error_${res.status}`,
        errorReason: `Meta API returned HTTP ${res.status}`,
      };
    }

    const data: any = await res.json();
    let qualityRating: "GREEN" | "YELLOW" | "RED" | "UNKNOWN" = "UNKNOWN";
    const rawQuality = String(data?.quality_rating || "").toUpperCase();
    if (rawQuality === "GREEN" || rawQuality === "YELLOW" || rawQuality === "RED") {
      qualityRating = rawQuality;
    }

    return {
      success: true,
      httpStatus: 200,
      displayPhoneNumber: data?.display_phone_number || undefined,
      verifiedName: data?.verified_name || undefined,
      qualityRating,
      codeVerificationStatus: data?.code_verification_status || undefined,
    };
  } catch (err: any) {
    return {
      success: false,
      errorCode: "network_error",
      errorReason: err?.message || "Failed to reach Meta Graph API",
    };
  }
}

/**
 * Evaluates comprehensive health summary for a bot configured with WhatsApp Cloud API.
 */
export async function evaluateCloudProviderHealth(params: {
  botId: string;
  accountId?: string;
  phoneNumberId?: string;
  wabaId?: string;
  runtimeEnabled: boolean;
  accessToken?: string;
  performGraphCheck?: boolean;
  fetchImpl?: typeof fetch;
  versionOverride?: string;
}): Promise<CloudProviderHealthSummary> {
  const { botId, accountId, phoneNumberId, wabaId, runtimeEnabled, accessToken, performGraphCheck } = params;
  const now = Date.now();

  const isConfigured = Boolean(phoneNumberId && wabaId);
  const setup: "configured" | "setup_required" = isConfigured ? "configured" : "setup_required";
  const runtime: "enabled" | "disabled" = runtimeEnabled ? "enabled" : "disabled";

  // Template statistics
  let cachedTemplates: any[] = [];
  try {
    const res = await getCachedTemplatesForBot(botId, accountId || "");
    if (Array.isArray(res)) cachedTemplates = res;
  } catch {}

  const totalCount = cachedTemplates.length;
  const approvedCount = cachedTemplates.filter((t) => t.status === "APPROVED").length;
  const lastSyncedAt = cachedTemplates.length > 0
    ? Math.max(...cachedTemplates.map((t) => t.lastSyncedAt || 0))
    : null;

  // Webhook activity
  const webhookRecord = getWebhookActivity(phoneNumberId || botId);
  let webhookStatus: "active" | "awaiting_activity" | "inactive" = "awaiting_activity";
  if (webhookRecord.lastValidSignedWebhookAt) {
    const timeSinceLastWebhook = now - webhookRecord.lastValidSignedWebhookAt;
    webhookStatus = timeSinceLastWebhook < 7 * 24 * 60 * 60 * 1000 ? "active" : "inactive";
  }

  // Rate cooldown check
  let apiAccess: "reachable" | "unreachable" | "reauth_required" | "rate_limited" | "not_checked" = "not_checked";
  let displayPhoneNumber: string | undefined;
  let verifiedName: string | undefined;
  let qualityRating: "GREEN" | "YELLOW" | "RED" | "UNKNOWN" = "UNKNOWN";
  let codeVerificationStatus: string | undefined;
  let needsAttentionReason: string | undefined;
  let lastSuccessAt: number | null = null;
  let lastFailureAt: number | null = null;

  if (phoneNumberId) {
    const cooldown = isPhoneInCooldown(phoneNumberId);
    if (cooldown.inCooldown) {
      apiAccess = "rate_limited";
      needsAttentionReason = `Rate limited (cooldown remaining: ${Math.round(cooldown.remainingMs / 1000)}s)`;
    }
  }

  // Optional live Graph API health check
  if (performGraphCheck && phoneNumberId && accessToken && apiAccess !== "rate_limited") {
    const metaRes = await fetchMetaPhoneNumberMetadata({
      phoneNumberId,
      accessToken,
      fetchImpl: params.fetchImpl,
      versionOverride: params.versionOverride,
    });

    if (metaRes.success) {
      apiAccess = "reachable";
      displayPhoneNumber = metaRes.displayPhoneNumber;
      verifiedName = metaRes.verifiedName;
      qualityRating = metaRes.qualityRating || "UNKNOWN";
      codeVerificationStatus = metaRes.codeVerificationStatus;
      lastSuccessAt = now;
    } else {
      lastFailureAt = now;
      if (metaRes.errorCode === "reauth_required") {
        apiAccess = "reauth_required";
        needsAttentionReason = "Meta credentials expired or unauthorized. Please reconnect.";
      } else if (metaRes.errorCode === "rate_limited") {
        apiAccess = "rate_limited";
        needsAttentionReason = "Meta API rate limit exceeded.";
      } else {
        apiAccess = "unreachable";
        needsAttentionReason = metaRes.errorReason || "Failed to reach Meta Graph API";
      }
    }
  }

  // Determine overall status
  let overallStatus: CloudOverallHealthStatus = "active";

  if (!isConfigured) {
    overallStatus = "setup_required";
  } else if (!runtimeEnabled) {
    overallStatus = "runtime_disabled";
  } else if (apiAccess === "reauth_required") {
    overallStatus = "reauth_required";
  } else if (apiAccess === "rate_limited") {
    overallStatus = "rate_limited";
  } else if (apiAccess === "unreachable") {
    overallStatus = "error";
  } else if (qualityRating === "RED") {
    overallStatus = "degraded";
    needsAttentionReason = "WhatsApp quality rating is low (RED). Review messaging guidelines.";
  } else if (totalCount > 0 && approvedCount === 0) {
    overallStatus = "template_attention";
    needsAttentionReason = "Templates are synced but 0 are approved for proactive messaging.";
  }

  const summary: CloudProviderHealthSummary = {
    overallStatus,
    setup,
    runtime,
    apiAccess,
    webhook: webhookStatus,
    phoneNumberId: phoneNumberId ? clean(phoneNumberId) : undefined,
    wabaId: wabaId ? clean(wabaId) : undefined,
    displayPhoneNumber,
    verifiedName,
    qualityRating,
    codeVerificationStatus,
    templates: {
      totalCount,
      approvedCount,
      lastSyncedAt,
    },
    webhooks: {
      lastValidSignedWebhookAt: webhookRecord.lastValidSignedWebhookAt,
      lastInboundMessageWebhookAt: webhookRecord.lastInboundMessageWebhookAt,
      lastStatusWebhookAt: webhookRecord.lastStatusWebhookAt,
    },
    lastCheckedAt: now,
    lastSuccessAt,
    lastFailureAt,
    needsAttentionReason,
  };

  healthSummariesStore.set(botId, summary);
  return summary;
}

/**
 * Clears health and webhook activity stores for testing.
 */
export function clearCloudHealthStore(): void {
  webhookActivityStore.clear();
  healthSummariesStore.clear();
}
