import { createHash } from "crypto";

type ExplicitCacheEntry = {
  cachedContentName: string;
  cacheKey: string;
  model: string;
  stableHash: string;
  expiresAt: number;
  tokenEstimate: number;
};

type ExplicitCacheTelemetry = {
  explicitCacheEnabled: boolean;
  explicitCacheEligible: boolean;
  explicitCacheUsed: boolean;
  explicitCacheCreated: boolean;
  explicitCacheRequestAttempted: boolean;
  explicitCacheRequestSucceeded: boolean;
  explicitCacheNameShort: string;
  fallbackReason: string;
};

type ExplicitCacheInput = {
  aiClient: any;
  model: string;
  botId: string;
  stablePrefix: string;
  stablePrefixHash: string;
  stablePrefixTokenEstimate: number;
  systemInstruction?: string;
  tools?: any;
  toolConfig?: any;
  cacheBoostEnabled?: boolean;
};

const explicitCacheRefs = new Map<string, ExplicitCacheEntry>();
const CACHE_KEY_VERSION = "v1";

const explicitCacheDeps = {
  now: () => Date.now(),
  isEnabled: () => {
    const raw = String(process.env.GEMINI_EXPLICIT_CACHE_ENABLED || "").trim().toLowerCase();
    return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
  },
  getTtlSeconds: () => Math.max(300, Number(process.env.GEMINI_EXPLICIT_CACHE_TTL_SECONDS || 3600)),
  getMinTokens: () => Math.max(256, Number(process.env.GEMINI_EXPLICIT_CACHE_MIN_TOKENS || 2048)),
  getRefreshSeconds: () => Math.max(60, Number(process.env.GEMINI_EXPLICIT_CACHE_REFRESH_SECONDS || 300)),
};

export function __setGeminiExplicitCacheTestDeps(overrides: Partial<typeof explicitCacheDeps>) {
  Object.assign(explicitCacheDeps, overrides || {});
}

export function __resetGeminiExplicitCacheTestDeps() {
  Object.assign(explicitCacheDeps, {
    now: () => Date.now(),
    isEnabled: () => {
      const raw = String(process.env.GEMINI_EXPLICIT_CACHE_ENABLED || "").trim().toLowerCase();
      return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
    },
    getTtlSeconds: () => Math.max(300, Number(process.env.GEMINI_EXPLICIT_CACHE_TTL_SECONDS || 3600)),
    getMinTokens: () => Math.max(256, Number(process.env.GEMINI_EXPLICIT_CACHE_MIN_TOKENS || 2048)),
    getRefreshSeconds: () => Math.max(60, Number(process.env.GEMINI_EXPLICIT_CACHE_REFRESH_SECONDS || 300)),
  });
  explicitCacheRefs.clear();
}

function shortCacheName(name: string) {
  const clean = String(name || "").trim();
  if (!clean) return "";
  return clean.split("/").slice(-1)[0].slice(-12);
}

export function buildGeminiExplicitCacheKey(input: { botId: string; model: string; stablePrefixHash: string; version?: string }) {
  const base = [input.botId, input.model, input.stablePrefixHash, input.version || CACHE_KEY_VERSION].join("|");
  const digest = createHash("sha1").update(base).digest("hex").slice(0, 16);
  return `customer-bot:${input.botId}:${input.model}:${input.stablePrefixHash}:${digest}`;
}

function buildDisplayName(cacheKey: string) {
  return cacheKey.slice(0, 100);
}

function parseExpiryMs(value: any, fallbackTtlSeconds: number) {
  if (value) {
    const dateMs = new Date(String(value)).getTime();
    if (Number.isFinite(dateMs) && dateMs > 0) return dateMs;
  }
  return explicitCacheDeps.now() + fallbackTtlSeconds * 1000;
}

function buildCacheCreateConfig(input: ExplicitCacheInput) {
  const config: any = {
    contents: [{ role: "user", parts: [{ text: input.stablePrefix }] }],
    ttl: `${explicitCacheDeps.getTtlSeconds()}s`,
    displayName: buildDisplayName(buildGeminiExplicitCacheKey(input)),
  };
  if (input.systemInstruction) config.systemInstruction = input.systemInstruction;
  if (typeof input.tools !== "undefined") config.tools = input.tools;
  if (typeof input.toolConfig !== "undefined") config.toolConfig = input.toolConfig;
  return config;
}

export function buildExplicitCacheRequestConfig(input: {
  systemInstruction?: string;
  tools?: any;
  toolConfig?: any;
  cachedContentName?: string;
  baseConfig?: any;
}) {
  const config = { ...(input.baseConfig || {}) };
  if (input.cachedContentName) {
    config.cachedContent = input.cachedContentName;
    delete config.systemInstruction;
    delete config.tools;
    delete config.toolConfig;
    return config;
  }
  if (input.tools && typeof config.tools === "undefined") config.tools = input.tools;
  if (input.toolConfig && typeof config.toolConfig === "undefined") config.toolConfig = input.toolConfig;
  if (input.systemInstruction) config.systemInstruction = input.systemInstruction;
  return config;
}

async function createRemoteCache(input: ExplicitCacheInput) {
  return input.aiClient.caches.create({
    model: input.model,
    config: buildCacheCreateConfig(input),
  });
}

async function refreshRemoteCache(aiClient: any, name: string) {
  return aiClient.caches.update({
    name,
    config: { ttl: `${explicitCacheDeps.getTtlSeconds()}s` },
  });
}

function canUseExplicitCache(input: ExplicitCacheInput) {
  if (!explicitCacheDeps.isEnabled() || input.cacheBoostEnabled === false) return { ok: false, reason: "disabled" };
  if (!input.aiClient?.caches?.create || !input.aiClient?.caches?.get) return { ok: false, reason: "sdk_cache_api_unavailable" };
  if (Number(input.stablePrefixTokenEstimate || 0) < explicitCacheDeps.getMinTokens()) return { ok: false, reason: "stable_prefix_below_min_tokens" };
  if (!String(input.stablePrefix || "").trim()) return { ok: false, reason: "missing_stable_prefix" };
  if (!String(input.stablePrefixHash || "").trim()) return { ok: false, reason: "missing_stable_hash" };
  return { ok: true, reason: "" };
}

export async function getOrCreateGeminiExplicitCache(input: ExplicitCacheInput) {
  const eligibility = canUseExplicitCache(input);
  const telemetry: ExplicitCacheTelemetry = {
    explicitCacheEnabled: Boolean(explicitCacheDeps.isEnabled() && input.cacheBoostEnabled !== false),
    explicitCacheEligible: eligibility.ok,
    explicitCacheUsed: false,
    explicitCacheCreated: false,
    explicitCacheRequestAttempted: false,
    explicitCacheRequestSucceeded: false,
    explicitCacheNameShort: "",
    fallbackReason: eligibility.reason,
  };
  if (!eligibility.ok) {
    return { cachedContentName: "", cacheKey: "", telemetry };
  }

  const cacheKey = buildGeminiExplicitCacheKey(input);
  const existing = explicitCacheRefs.get(cacheKey);
  const nowMs = explicitCacheDeps.now();
  const refreshAtMs = nowMs + explicitCacheDeps.getRefreshSeconds() * 1000;

  if (existing && existing.model === input.model && existing.stableHash === input.stablePrefixHash) {
    if (existing.expiresAt > refreshAtMs) {
      telemetry.explicitCacheUsed = true;
      telemetry.explicitCacheNameShort = shortCacheName(existing.cachedContentName);
      telemetry.fallbackReason = "";
      return { cachedContentName: existing.cachedContentName, cacheKey, telemetry };
    }
    try {
      telemetry.explicitCacheRequestAttempted = true;
      const updated = await refreshRemoteCache(input.aiClient, existing.cachedContentName);
      telemetry.explicitCacheRequestSucceeded = true;
      const nextEntry: ExplicitCacheEntry = {
        ...existing,
        expiresAt: parseExpiryMs(updated?.expireTime || updated?.expirationTime, explicitCacheDeps.getTtlSeconds()),
      };
      explicitCacheRefs.set(cacheKey, nextEntry);
      telemetry.explicitCacheUsed = true;
      telemetry.explicitCacheNameShort = shortCacheName(nextEntry.cachedContentName);
      telemetry.fallbackReason = "";
      return { cachedContentName: nextEntry.cachedContentName, cacheKey, telemetry };
    } catch (error: any) {
      explicitCacheRefs.delete(cacheKey);
      telemetry.fallbackReason = "cache_refresh_failed";
    }
  }

  try {
    telemetry.explicitCacheRequestAttempted = true;
    const created = await createRemoteCache(input);
    telemetry.explicitCacheRequestSucceeded = true;
    const cachedContentName = String(created?.name || "");
    const nextEntry: ExplicitCacheEntry = {
      cachedContentName,
      cacheKey,
      model: input.model,
      stableHash: input.stablePrefixHash,
      expiresAt: parseExpiryMs(created?.expireTime || created?.expirationTime, explicitCacheDeps.getTtlSeconds()),
      tokenEstimate: input.stablePrefixTokenEstimate,
    };
    explicitCacheRefs.set(cacheKey, nextEntry);
    telemetry.explicitCacheUsed = true;
    telemetry.explicitCacheCreated = true;
    telemetry.explicitCacheNameShort = shortCacheName(cachedContentName);
    telemetry.fallbackReason = "";
    return { cachedContentName, cacheKey, telemetry };
  } catch (error: any) {
    telemetry.fallbackReason = "cache_create_failed";
    return { cachedContentName: "", cacheKey, telemetry };
  }
}
