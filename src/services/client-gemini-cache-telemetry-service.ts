import { ID } from "node-appwrite";
import { Query, databases, COLLECTIONS, DATABASE_ID } from "../config/appwrite-client.ts";

const TELEMETRY_PREFIX = "cgct";
const PAGE_LIMIT = 5000;

function clean(value: any) {
  return String(value || "").trim();
}

function numberValue(value: any) {
  return Math.max(0, Number(value || 0)) || 0;
}

function boolValue(value: any) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function shortHash(value: any) {
  let hash = 0;
  const text = clean(value);
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36).slice(0, 8) || "anon";
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

export type ClientGeminiCacheTelemetry = {
  userId: string;
  provider?: string;
  model?: string;
  timestamp?: number;
  cachedTokens?: number;
  uncachedInputTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  thoughtTokens?: number;
  totalTokens?: number;
  cacheAttempted?: boolean;
  cacheEligible?: boolean;
  cacheBoostEnabled?: boolean;
  cacheAttached?: boolean;
  cacheHit?: boolean;
  cacheMissReason?: string;
  cacheNameHash?: string;
  cacheBoostCharged?: boolean;
  purpose?: string;
  path?: string;
  botId?: string;
};

const telemetryDeps = {
  createDocument: databases.createDocument.bind(databases) as any,
  listDocuments: databases.listDocuments.bind(databases) as any,
  idUnique: ID.unique,
  now: nowSeconds,
};

export function __setClientGeminiCacheTelemetryTestDeps(overrides: Partial<typeof telemetryDeps>) {
  Object.assign(telemetryDeps, overrides || {});
}

export function __resetClientGeminiCacheTelemetryTestDeps() {
  Object.assign(telemetryDeps, {
    createDocument: databases.createDocument.bind(databases) as any,
    listDocuments: databases.listDocuments.bind(databases) as any,
    idUnique: ID.unique,
    now: nowSeconds,
  });
}

export function normalizeClientGeminiCacheTelemetry(input: ClientGeminiCacheTelemetry) {
  const inputTokens = numberValue(input.inputTokens);
  const cachedTokens = numberValue(input.cachedTokens);
  const uncachedInputTokens = input.uncachedInputTokens === undefined
    ? Math.max(0, inputTokens - cachedTokens)
    : numberValue(input.uncachedInputTokens);
  const cacheHit = input.cacheHit === undefined ? cachedTokens > 0 : boolValue(input.cacheHit);
  return {
    userId: clean(input.userId),
    provider: clean(input.provider).slice(0, 80),
    model: clean(input.model).slice(0, 80),
    timestamp: Math.max(0, Math.floor(Number(input.timestamp || telemetryDeps.now()))),
    cachedTokens,
    uncachedInputTokens,
    inputTokens,
    outputTokens: numberValue(input.outputTokens),
    thoughtTokens: numberValue(input.thoughtTokens),
    totalTokens: numberValue(input.totalTokens),
    cacheAttempted: boolValue(input.cacheAttempted),
    cacheEligible: boolValue(input.cacheEligible),
    cacheBoostEnabled: boolValue(input.cacheBoostEnabled),
    cacheAttached: boolValue(input.cacheAttached),
    cacheHit,
    cacheMissReason: normalizeCacheSkipReason(input.cacheMissReason).slice(0, 80),
    cacheNameHash: clean(input.cacheNameHash).replace(/[^a-zA-Z0-9:_-]+/g, "").slice(0, 120),
    cacheBoostCharged: boolValue(input.cacheBoostCharged),
    purpose: clean(input.purpose).slice(0, 80),
    path: clean(input.path || input.purpose).slice(0, 80),
    botId: clean(input.botId).slice(0, 80),
  };
}

export function normalizeCacheSkipReason(reason: any) {
  const value = clean(reason).toLowerCase();
  if (!value) return "";
  if (value.includes("small_context") || value.includes("stable_prefix_below_min_tokens") || value.includes("missing_stable_prefix")) return "small_context";
  if (value.includes("disabled")) return "disabled";
  if (value.includes("provider_not_client") || value.includes("not_client_provider")) return "provider_not_client_gemini";
  if (value.includes("model_not_supported") || value.includes("unsupported_path") || value.includes("sdk_cache_api_unavailable")) return "model_not_supported";
  if (value.includes("create_failed")) return "cache_create_failed";
  if (value.includes("expired")) return "cache_expired";
  if (value.includes("usage_metadata_missing")) return "usage_metadata_missing";
  if (value.includes("zero_cached") || value.includes("no_cached")) return "no_cached_tokens_reported";
  if (value.includes("unavailable")) return "unavailable";
  if (value.includes("not_attached")) return "unavailable";
  return value.replace(/[^a-z0-9_:-]+/g, "_").slice(0, 80);
}

export async function recordClientGeminiCacheTelemetry(input: ClientGeminiCacheTelemetry) {
  const telemetry = normalizeClientGeminiCacheTelemetry(input);
  if (!telemetry.userId) return { recorded: false, reason: "missing_user" };
  const id = `${TELEMETRY_PREFIX}_${shortHash(telemetry.userId)}_${telemetry.timestamp}_${shortHash(telemetryDeps.idUnique())}`.slice(0, 36);
  try {
    await telemetryDeps.createDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, id, {
      value: JSON.stringify(telemetry),
      updated_at: telemetry.timestamp,
    });
    return { recorded: true, id, telemetry };
  } catch {
    return { recorded: false, reason: "write_failed", telemetry };
  }
}

export async function listClientGeminiCacheTelemetry(userId: string, fromTime = 0, toTime = telemetryDeps.now()) {
  const rows: any[] = [];
  try {
    const response = await telemetryDeps.listDocuments(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, [
      Query.greaterThanEqual("updated_at", Math.max(0, Math.floor(fromTime))),
      Query.lessThanEqual("updated_at", Math.max(0, Math.floor(toTime))),
      Query.orderAsc("updated_at"),
      Query.limit(PAGE_LIMIT),
    ]);
    for (const doc of response.documents || []) {
      if (!String(doc?.$id || doc?.id || "").startsWith(`${TELEMETRY_PREFIX}_`)) continue;
      try {
        const parsed = JSON.parse(String(doc.value || "{}"));
        if (clean(parsed.userId) === clean(userId)) rows.push(parsed);
      } catch {}
    }
  } catch {
    return [];
  }
  return rows;
}

export function summarizeClientGeminiCacheTelemetry(rows: any[] = []) {
  const stats: Record<string, any> = {
    attempts: 0,
    eligible: 0,
    attached: 0,
    hits: 0,
    misses: 0,
    skippedSmallContext: 0,
    skippedUnsupportedPath: 0,
    cachedTokens: 0,
    uncachedTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    thoughtTokens: 0,
    totalTokens: 0,
    cacheBoostCharges: 0,
    skippedReasons: {},
    coverageByPurpose: {},
  };
  for (const row of rows) {
    const purpose = clean(row.path || row.purpose) || "unknown";
    const model = clean(row.model) || "unknown";
    const provider = clean(row.provider) || "unknown";
    const key = `${purpose}|${provider}|${model}`;
    if (!stats.coverageByPurpose[key]) {
      stats.coverageByPurpose[key] = {
        purpose,
        path: purpose,
        model,
        provider,
        botId: clean(row.botId),
        calls: 0,
        eligible: 0,
        attempted: 0,
        attached: 0,
        hits: 0,
        misses: 0,
        cachedTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        lastUsedAt: 0,
        skippedReasons: {},
      };
    }
    const pathStats = stats.coverageByPurpose[key];
    pathStats.calls += 1;
    if (boolValue(row.cacheEligible)) {
      stats.eligible += 1;
      pathStats.eligible += 1;
    }
    if (boolValue(row.cacheAttempted)) stats.attempts += 1;
    if (boolValue(row.cacheAttempted)) pathStats.attempted += 1;
    if (boolValue(row.cacheAttached)) {
      stats.attached += 1;
      pathStats.attached += 1;
    }
    if (boolValue(row.cacheHit)) stats.hits += 1;
    if (boolValue(row.cacheHit)) pathStats.hits += 1;
    if (boolValue(row.cacheAttempted) && !boolValue(row.cacheHit)) {
      stats.misses += 1;
      pathStats.misses += 1;
      const reason = normalizeCacheSkipReason(row.cacheMissReason) || "unknown";
      stats.skippedReasons[reason] = Number(stats.skippedReasons[reason] || 0) + 1;
      pathStats.skippedReasons[reason] = Number(pathStats.skippedReasons[reason] || 0) + 1;
    }
    if (!boolValue(row.cacheHit) && !boolValue(row.cacheAttempted) && row.cacheMissReason) {
      const reason = normalizeCacheSkipReason(row.cacheMissReason) || "unknown";
      stats.skippedReasons[reason] = Number(stats.skippedReasons[reason] || 0) + 1;
      pathStats.skippedReasons[reason] = Number(pathStats.skippedReasons[reason] || 0) + 1;
    }
    if (normalizeCacheSkipReason(row.cacheMissReason) === "small_context") stats.skippedSmallContext += 1;
    if (normalizeCacheSkipReason(row.cacheMissReason) === "model_not_supported") stats.skippedUnsupportedPath += 1;
    stats.cachedTokens += numberValue(row.cachedTokens);
    pathStats.cachedTokens += numberValue(row.cachedTokens);
    pathStats.inputTokens += numberValue(row.inputTokens);
    pathStats.outputTokens += numberValue(row.outputTokens);
    pathStats.lastUsedAt = Math.max(numberValue(pathStats.lastUsedAt), numberValue(row.timestamp));
    stats.uncachedTokens += numberValue(row.uncachedInputTokens);
    stats.inputTokens += numberValue(row.inputTokens);
    stats.outputTokens += numberValue(row.outputTokens);
    stats.thoughtTokens += numberValue(row.thoughtTokens);
    stats.totalTokens += numberValue(row.totalTokens);
    if (boolValue(row.cacheBoostCharged)) stats.cacheBoostCharges += 1;
  }
  stats.coverageByPurpose = Object.values(stats.coverageByPurpose).sort((a: any, b: any) => b.calls - a.calls);
  return stats;
}
