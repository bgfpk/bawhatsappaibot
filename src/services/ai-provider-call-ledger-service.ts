import { ID } from "node-appwrite";

import { Query, databases, COLLECTIONS, DATABASE_ID } from "../config/appwrite-client.ts";
import { getRequiredAiReplyCostForPurpose } from "../config/ai-reply-required-cost.ts";
import { getGeminiCacheTelemetry } from "./gemini-cache-service.ts";
import { estimateDeepInfraCost, DEEPINFRA_PRICING_CONFIG } from "../config/deepinfra-pricing.ts";

export type AiProviderCallCategory =
  | "customer_reply"
  | "admin_business_assistant"
  | "personal_assistant"
  | "repair"
  | "retry"
  | "summary"
  | "smart_brain"
  | "image_extraction"
  | "voice"
  | "smart_followup"
  | "wait_check"
  | "manual_learning"
  | "admin_test"
  | "agent_advanced"
  | "unknown";

export type AiProviderCallLedgerRecord = {
  id: string;
  timestamp: number;
  accountId: string;
  userId: string;
  botId: string;
  customerJid?: string;
  customerHash?: string;
  provider: string;
  model: string;
  purpose: string;
  category: AiProviderCallCategory;
  customerVisible: boolean;
  helper: boolean;
  background: boolean;
  retryAttempt: number | null;
  repairAttempt: number | null;
  inputTokens: number | null;
  cachedTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  estimatedProviderCost: number | null;
  providerCostEstimated: boolean;
  walletChargeCategory: string;
  expectedWalletCharge: number | null;
  finalSendOutcome: "sent" | "failed" | "skipped" | "blocked" | "pending" | "no_send";
  chargeOutcome: "charged" | "free_credit" | "no_charge" | "skipped" | "unknown";
  relatedMessageId: string;
  receiptId: string;
  idempotencyKey: string;
  billingGroupKey: string;
  reasonLabels: string[];
  httpStatus?: number | null;
  failureType?: string;
  timedOut?: boolean;
  aborted?: boolean;
  retryable?: boolean;
  latencyMs?: number | null;
  providerRequestId?: string;
  updatedAt: number;
};

const LEDGER_PREFIX = "aipl";
const PAGE_LIMIT = 5000;

const ledgerDeps = {
  createDocument: databases.createDocument.bind(databases) as any,
  updateDocument: databases.updateDocument.bind(databases) as any,
  listDocuments: databases.listDocuments.bind(databases) as any,
  idUnique: ID.unique,
  now: () => Math.floor(Date.now() / 1000),
};

export function __setAiProviderCallLedgerTestDeps(overrides: Partial<typeof ledgerDeps>) {
  Object.assign(ledgerDeps, overrides || {});
}

export function __resetAiProviderCallLedgerTestDeps() {
  Object.assign(ledgerDeps, {
    createDocument: databases.createDocument.bind(databases) as any,
    updateDocument: databases.updateDocument.bind(databases) as any,
    listDocuments: databases.listDocuments.bind(databases) as any,
    idUnique: ID.unique,
    now: () => Math.floor(Date.now() / 1000),
  });
}

function clean(value: any, limit = 160) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, limit);
}

function numOrNull(value: any) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function hashPart(value: any, length = 14) {
  const text = String(value || "");
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0").slice(0, length);
}

function ledgerId(input: any, timestamp: number) {
  return `${LEDGER_PREFIX}_${hashPart([
    input?.provider?.accountId || input?.provider?.userId,
    input?.provider?.botId || input?.provider?.dataOwnerKey,
    input?.provider?.billingContext?.customerJid,
    input?.provider?.purpose,
    input?.provider?.billingContext?.billingGroupKey || input?.provider?.billingContext?.eventId || input?.provider?.billingContext?.messageId || input?.provider?.billingContext?.requestId,
    timestamp,
    ledgerDeps.idUnique(),
  ].join("|"), 30)}`;
}

export function categorizeAiProviderPurpose(purpose: any): AiProviderCallCategory {
  const value = clean(purpose).toLowerCase();
  if (value.includes("admin_assistant") || value.includes("business_assistant") || value.includes("admin_business")) return "admin_business_assistant";
  if (value.includes("personal_assistant") || value.includes("personal_incoming") || value.includes("personal_outbound") || value.startsWith("personal_")) return "personal_assistant";
  if (value.includes("wait_check")) return "wait_check";
  if (value.includes("smart_followup")) return "smart_followup";
  if (value.includes("repair")) return "repair";
  if (value.includes("retry")) return "retry";
  if (value.includes("summary")) return "summary";
  if (value.includes("smart_brain")) return "smart_brain";
  if (value.includes("image") || value.includes("vision") || value.includes("extract")) return "image_extraction";
  if (value.includes("voice") || value.includes("tts") || value.includes("audio")) return "voice";
  if (value.includes("manual_learning") || value.includes("learning")) return "manual_learning";
  if (value.includes("admin") || value.includes("test")) return "admin_test";
  if (value.includes("agent")) return "agent_advanced";
  if (value.includes("reply") || value === "combined_reply_memory") return "customer_reply";
  return "unknown";
}

function isCustomerVisibleCategory(category: AiProviderCallCategory, purpose: any) {
  if (category === "customer_reply" || category === "smart_followup" || category === "wait_check" || category === "voice" || category === "admin_business_assistant" || category === "personal_assistant") return true;
  return clean(purpose).toLowerCase().includes("customer_ai_reply");
}

function walletChargeCategory(provider: any, category: AiProviderCallCategory) {
  if (category === "smart_followup" || category === "wait_check") return "ai_smart_followup_text";
  if (category === "customer_reply") return provider?.provider === "client_custom_gemini" ? "client_gemini_message_cycle" : "customer_ai_text_reply";
  if (category === "admin_business_assistant") return "business_assistant_ai_call";
  if (category === "personal_assistant") return "personal_assistant_ai_call";
  if (provider?.provider === "client_custom_gemini") return "client_gemini_message_cycle";
  return "";
}

export function buildAiProviderCallLedgerRecord(input: {
  provider?: any;
  result?: any;
  finalSendOutcome?: AiProviderCallLedgerRecord["finalSendOutcome"];
  chargeOutcome?: AiProviderCallLedgerRecord["chargeOutcome"];
  reasonLabels?: string[];
}) {
  const provider = input.provider || {};
  const result = input.result || {};
  const telemetry = getGeminiCacheTelemetry(result);
  const timestamp = ledgerDeps.now();
  const purpose = clean(provider.purpose || "gemini_request", 120);
  const category = categorizeAiProviderPurpose(purpose);
  const visible = isCustomerVisibleCategory(category, purpose);
  const chargeCategory = walletChargeCategory(provider, category);
  const expectedWalletCharge = chargeCategory
    ? getRequiredAiReplyCostForPurpose({ billingAction: chargeCategory }).toFixed(6)
    : "";
  const id = ledgerId({ provider }, timestamp);

  const isDeepInfra = clean(provider.provider || "") === "deepinfra";
  const rawJid = clean(provider.billingContext?.customerJid, 140);
  const customerHash = rawJid ? hashPart(rawJid, 32) : undefined;
  const customerJid = isDeepInfra ? undefined : rawJid;

  let estimatedCost: number | null = null;
  let costEstimated = false;
  let inputTokens = telemetry.inputTokens || null;
  let outputTokens = telemetry.outputTokens || null;
  let cachedTokens = null;
  let totalTokens = telemetry.totalTokens || null;

  if (isDeepInfra) {
    inputTokens = numOrNull(result.promptTokens) || null;
    outputTokens = numOrNull(result.completionTokens) || null;
    cachedTokens = numOrNull(result.cachedTokens) || null;
    totalTokens = (inputTokens || 0) + (outputTokens || 0);
    estimatedCost = estimateDeepInfraCost(inputTokens || 0, cachedTokens || 0, outputTokens || 0);
    costEstimated = true;
  }

  return {
    id,
    timestamp,
    accountId: clean(provider.accountId || provider.userId, 100),
    userId: clean(provider.userId || provider.accountId, 100),
    botId: clean(provider.botId || provider.dataOwnerKey, 100),
    customerJid,
    customerHash,
    provider: clean(provider.provider || "platform_gemini", 80),
    model: clean(provider.model || result.model, 100),
    purpose,
    category,
    customerVisible: visible,
    helper: !visible,
    background: !visible,
    retryAttempt: numOrNull(provider.retryAttempt),
    repairAttempt: numOrNull(provider.repairAttempt),
    inputTokens,
    cachedTokens,
    outputTokens,
    totalTokens,
    estimatedProviderCost: estimatedCost,
    providerCostEstimated: costEstimated,
    walletChargeCategory: chargeCategory,
    expectedWalletCharge: expectedWalletCharge ? Number(expectedWalletCharge) : null,
    finalSendOutcome: input.finalSendOutcome || (visible ? "pending" : "no_send"),
    chargeOutcome: input.chargeOutcome || "unknown",
    relatedMessageId: clean(provider.billingContext?.messageId, 160),
    receiptId: "",
    idempotencyKey: clean(provider.billingContext?.requestId, 180),
    billingGroupKey: clean(provider.billingContext?.billingGroupKey || provider.billingContext?.eventId || provider.billingContext?.messageId || provider.billingContext?.requestId, 180),
    reasonLabels: (input.reasonLabels || []).map((item) => clean(item, 80)).filter(Boolean).slice(0, 8),
    httpStatus: isDeepInfra ? numOrNull(result.httpStatus) : null,
    failureType: isDeepInfra ? clean(result.failureType, 80) : undefined,
    timedOut: isDeepInfra ? Boolean(result.timedOut) : undefined,
    aborted: isDeepInfra ? Boolean(result.aborted) : undefined,
    retryable: isDeepInfra ? Boolean(result.retryable) : undefined,
    latencyMs: isDeepInfra ? numOrNull(result.latencyMs) : null,
    providerRequestId: isDeepInfra ? clean(result.providerRequestId, 180) || undefined : undefined,
    updatedAt: timestamp,
  } satisfies AiProviderCallLedgerRecord;
}

export async function recordAiProviderCallLedger(input: Parameters<typeof buildAiProviderCallLedgerRecord>[0]) {
  const record = buildAiProviderCallLedgerRecord(input);
  if (!record.accountId && !record.botId) return { recorded: false, reason: "missing_context", record };
  try {
    await ledgerDeps.createDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, record.id, {
      value: JSON.stringify(record),
      updated_at: record.updatedAt,
    });
    return { recorded: true, id: record.id, record };
  } catch {
    return { recorded: false, reason: "write_failed", record };
  }
}

function parseLedgerDoc(doc: any): AiProviderCallLedgerRecord | null {
  const id = clean(doc?.$id || doc?.id, 40);
  if (!id.startsWith(`${LEDGER_PREFIX}_`)) return null;
  try {
    const parsed = JSON.parse(String(doc?.value || "{}"));
    return { ...parsed, id: clean(parsed?.id || id, 40) };
  } catch {
    return null;
  }
}

function matchesOutcomeTarget(row: AiProviderCallLedgerRecord, input: any) {
  const accountId = clean(input.accountId || input.userId, 100);
  const botId = clean(input.botId, 100);
  const customerJid = clean(input.customerJid, 140);
  const idempotencyKey = clean(input.idempotencyKey || input.eventId, 180);
  if (accountId && row.accountId && row.accountId !== accountId) return false;
  if (customerJid && row.customerJid && row.customerJid !== customerJid) return false;
  if (!idempotencyKey) return false;
  return row.billingGroupKey === idempotencyKey ||
    row.idempotencyKey === idempotencyKey ||
    idempotencyKey.endsWith(`:${row.billingGroupKey}`) ||
    row.billingGroupKey.endsWith(`:${idempotencyKey}`);
}

export async function updateAiProviderCallSendOutcome(input: {
  accountId?: string;
  userId?: string;
  botId?: string;
  customerJid?: string;
  idempotencyKey?: string;
  eventId?: string;
  receiptId?: string;
  messageId?: string;
  finalSendOutcome: AiProviderCallLedgerRecord["finalSendOutcome"];
  chargeOutcome: AiProviderCallLedgerRecord["chargeOutcome"];
  reasonLabel?: string;
}) {
  const now = ledgerDeps.now();
  const from = Math.max(0, now - 7 * 24 * 60 * 60);
  const docs = await ledgerDeps.listDocuments(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, [
    Query.greaterThanEqual("updated_at", from),
    Query.lessThanEqual("updated_at", now + 60),
    Query.orderDesc("updated_at"),
    Query.limit(PAGE_LIMIT),
  ]).catch(() => ({ documents: [] }));
  const match = (docs.documents || [])
    .map(parseLedgerDoc)
    .filter(Boolean)
    .find((row: any) => matchesOutcomeTarget(row, input)) as AiProviderCallLedgerRecord | undefined;
  if (!match) return { updated: false, reason: "ledger_not_found" };
  const reasonLabels = Array.from(new Set([
    ...(match.reasonLabels || []),
    clean(input.reasonLabel, 80),
  ].filter(Boolean))).slice(0, 8);
  const patch = {
    ...match,
    finalSendOutcome: input.finalSendOutcome,
    chargeOutcome: input.chargeOutcome,
    receiptId: clean(input.receiptId || match.receiptId, 80),
    relatedMessageId: clean(input.messageId || match.relatedMessageId, 160),
    idempotencyKey: clean(input.idempotencyKey || match.idempotencyKey, 180),
    reasonLabels,
    updatedAt: now,
  };
  try {
    await ledgerDeps.updateDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, match.id, {
      value: JSON.stringify(patch),
      updated_at: now,
    });
    return { updated: true, id: match.id, record: patch };
  } catch {
    return { updated: false, reason: "update_failed", id: match.id };
  }
}
