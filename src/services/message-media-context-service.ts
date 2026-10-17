import { createHash } from "node:crypto";
import { buildVoiceNoteHistoryText } from "./voice-note-history-service.ts";

type MediaContextStoreDeps = {
  getSystemConfig: (key: string) => Promise<string | null>;
  setSystemConfig: (key: string, value: string) => Promise<void>;
};

export type DurableMediaContextType = "image" | "audio";

export type DurableMediaContextRecord = {
  type: DurableMediaContextType;
  provider: string;
  model: string;
  botId: string;
  customerJid: string;
  messageId: string;
  mediaHash: string;
  purpose: string;
  useful: boolean;
  summary: string;
  visibleText: string;
  transcript: string;
  language: string;
  confidence: number;
  failureReason: string;
  sourceMime: string;
  normalizedMime: string;
  createdAt: number;
  updatedAt: number;
  version: number;
  payloadFingerprint: string;
  configFingerprint: string;
};

type DurableMediaContextRef = {
  recordKey: string;
  type: DurableMediaContextType;
  botId: string;
  customerJid: string;
  messageId: string;
  purpose: string;
  updatedAt: number;
};

const MAX_RECENT_MEDIA_CONTEXT_REFS = 8;

let testDeps: Partial<MediaContextStoreDeps> | null = null;

function clean(value: any, max = 4000) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function nowMs() {
  return Date.now();
}

function clampConfidence(value: any) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}

function safeHash(value: any, length = 24) {
  return createHash("sha1").update(String(value || "")).digest("hex").slice(0, length);
}

function normalizeType(value: any): DurableMediaContextType {
  return clean(value, 20).toLowerCase() === "audio" ? "audio" : "image";
}

function normalizeRecord(value: any): DurableMediaContextRecord {
  const createdAt = Math.max(0, Number(value?.createdAt || 0)) || nowMs();
  const updatedAt = Math.max(0, Number(value?.updatedAt || 0)) || createdAt;
  return {
    type: normalizeType(value?.type),
    provider: clean(value?.provider, 120),
    model: clean(value?.model, 120),
    botId: clean(value?.botId, 120),
    customerJid: clean(value?.customerJid, 180),
    messageId: clean(value?.messageId, 160),
    mediaHash: clean(value?.mediaHash, 80),
    purpose: clean(value?.purpose, 120),
    useful: value?.useful === true,
    summary: clean(value?.summary, 4000),
    visibleText: clean(value?.visibleText, 2000),
    transcript: clean(value?.transcript, 5000),
    language: clean(value?.language, 40),
    confidence: clampConfidence(value?.confidence),
    failureReason: clean(value?.failureReason, 240),
    sourceMime: clean(value?.sourceMime, 120),
    normalizedMime: clean(value?.normalizedMime, 120),
    createdAt,
    updatedAt,
    version: Math.max(1, Number(value?.version || 1)),
    payloadFingerprint: clean(value?.payloadFingerprint, 80),
    configFingerprint: clean(value?.configFingerprint, 80),
  };
}

async function resolveDeps(): Promise<MediaContextStoreDeps> {
  if (testDeps?.getSystemConfig && testDeps?.setSystemConfig) {
    return testDeps as MediaContextStoreDeps;
  }
  const dbService = await import("./db-service.ts");
  return {
    getSystemConfig: dbService.getSystemConfig,
    setSystemConfig: dbService.setSystemConfig,
  };
}

function parseRecord(raw: string | null) {
  if (!raw) return null;
  try {
    return normalizeRecord(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function buildMediaHash(buffer: Buffer) {
  return createHash("sha1").update(buffer).digest("hex").slice(0, 24);
}

export function buildMediaPayloadFingerprint(input: {
  mediaHash: string;
  sourceMime?: any;
  normalizedMime?: any;
}) {
  return safeHash(JSON.stringify({
    mediaHash: clean(input.mediaHash, 80),
    sourceMime: clean(input.sourceMime, 120),
    normalizedMime: clean(input.normalizedMime, 120),
  }), 24);
}

export function buildMediaConfigFingerprint(input: {
  purpose?: any;
  latestCustomerText?: any;
  caption?: any;
  transcript?: any;
}) {
  return safeHash(JSON.stringify({
    purpose: clean(input.purpose, 120),
    latestCustomerText: clean(input.latestCustomerText, 600),
    caption: clean(input.caption, 400),
    transcript: clean(input.transcript, 1000),
  }), 24);
}

export function buildMediaContextKey(input: {
  botId: string;
  customerJid: string;
  messageId: string;
  mediaHash: string;
  type: DurableMediaContextType;
  purpose?: string;
}) {
  return [
    "customer_media_understanding",
    clean(input.botId, 120) || "unknown",
    clean(input.customerJid, 180) || "unknown",
    clean(input.messageId, 160) || "unknown",
    normalizeType(input.type),
    clean(input.purpose, 120) || "customer_media_understanding",
    clean(input.mediaHash, 80) || "unknown",
  ].join(":");
}

export function buildMediaContextRefKey(input: {
  botId: string;
  customerJid: string;
  messageId: string;
  type: DurableMediaContextType;
  purpose?: string;
}) {
  return [
    "customer_media_understanding_ref",
    clean(input.botId, 120) || "unknown",
    clean(input.customerJid, 180) || "unknown",
    clean(input.messageId, 160) || "unknown",
    normalizeType(input.type),
    clean(input.purpose, 120) || "customer_media_understanding",
  ].join(":");
}

export function buildRecentMediaContextIndexKey(input: {
  botId: string;
  customerJid: string;
}) {
  return [
    "customer_media_understanding_recent",
    clean(input.botId, 120) || "unknown",
    clean(input.customerJid, 180) || "unknown",
  ].join(":");
}

function parseRecentRefs(raw: string | null) {
  if (!raw) return [] as DurableMediaContextRef[];
  try {
    const items = JSON.parse(raw);
    if (!Array.isArray(items)) return [] as DurableMediaContextRef[];
    return items
      .map((item) => ({
        recordKey: clean(item?.recordKey, 320),
        type: normalizeType(item?.type),
        botId: clean(item?.botId, 120),
        customerJid: clean(item?.customerJid, 180),
        messageId: clean(item?.messageId, 160),
        purpose: clean(item?.purpose, 120),
        updatedAt: Math.max(0, Number(item?.updatedAt || 0)),
      }))
      .filter((item) => item.recordKey && item.botId && item.customerJid);
  } catch {
    return [] as DurableMediaContextRef[];
  }
}

function normalizeReferenceSearchText(value: any) {
  return clean(value, 1200)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractReferenceTerms(value: any) {
  return normalizeReferenceSearchText(value)
    .split(" ")
    .filter((token) => token.length >= 4)
    .filter((token) => ![
      "about",
      "audio",
      "bhejo",
      "image",
      "media",
      "message",
      "please",
      "product",
      "reply",
      "remember",
      "showed",
      "shown",
      "tell",
      "that",
      "this",
      "voice",
    ].includes(token));
}

export function messageReferencesRememberedMedia(value: any) {
  const text = normalizeReferenceSearchText(value);
  if (!text) return false;
  return /\b(slimsip|that product|this product|the product|product i sent|product i showed|image i sent|image i shared|photo i sent|photo i shared|remember the product|remember it|did you forget about it|did you forget|that image|this image|that item|this item)\b/.test(text);
}

function scoreReferenceMatch(input: {
  latestUserText?: any;
  record: DurableMediaContextRecord;
}) {
  const latest = normalizeReferenceSearchText(input.latestUserText);
  if (!latest || !hasUsefulSavedMediaContext(input.record)) return 0;
  const referenceTerms = extractReferenceTerms(latest);
  const searchable = normalizeReferenceSearchText([
    input.record.summary,
    input.record.visibleText,
    input.record.transcript,
  ].filter(Boolean).join(" "));
  let score = 0;
  if (messageReferencesRememberedMedia(latest)) score += 3;
  for (const term of referenceTerms) {
    if (searchable.includes(term)) score += 4;
  }
  if (/\b(product|image|photo|label|package|packaging|brand|item)\b/.test(latest) && input.record.type === "image") score += 2;
  if (/\b(voice|audio|note|transcript)\b/.test(latest) && input.record.type === "audio") score += 2;
  score += Math.min(2, Math.floor(Math.max(0, Number(input.record.confidence || 0)) * 2));
  return score;
}

export async function getSavedMediaContext(input: {
  botId: string;
  customerJid: string;
  messageId: string;
  mediaHash: string;
  type: DurableMediaContextType;
  purpose?: string;
}) {
  const deps = await resolveDeps();
  const key = buildMediaContextKey(input);
  return parseRecord(await deps.getSystemConfig(key));
}

export async function saveMediaContext(input: DurableMediaContextRecord) {
  const deps = await resolveDeps();
  const existing = await getSavedMediaContext(input);
  const record = normalizeRecord({
    ...existing,
    ...input,
    createdAt: existing?.createdAt || input.createdAt || nowMs(),
    updatedAt: nowMs(),
  });
  const key = buildMediaContextKey(record);
  await deps.setSystemConfig(key, JSON.stringify(record));
  const refKey = buildMediaContextRefKey(record);
  const refValue: DurableMediaContextRef = {
    recordKey: key,
    type: record.type,
    botId: record.botId,
    customerJid: record.customerJid,
    messageId: record.messageId,
    purpose: record.purpose,
    updatedAt: record.updatedAt,
  };
  await deps.setSystemConfig(refKey, JSON.stringify(refValue));
  const recentIndexKey = buildRecentMediaContextIndexKey(record);
  const recentRefs = parseRecentRefs(await deps.getSystemConfig(recentIndexKey));
  const nextRecentRefs = [
    refValue,
    ...recentRefs.filter((item) => item.recordKey !== refValue.recordKey),
  ]
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
    .slice(0, MAX_RECENT_MEDIA_CONTEXT_REFS);
  await deps.setSystemConfig(recentIndexKey, JSON.stringify(nextRecentRefs));
  return record;
}

export async function getSavedMediaContextByMessage(input: {
  botId: string;
  customerJid: string;
  messageId: string;
  type: DurableMediaContextType;
  purpose?: string;
}) {
  const deps = await resolveDeps();
  const refKey = buildMediaContextRefKey(input);
  const rawRef = await deps.getSystemConfig(refKey);
  if (!rawRef) return null;
  try {
    const ref = JSON.parse(rawRef) as DurableMediaContextRef;
    if (!ref?.recordKey) return null;
    return parseRecord(await deps.getSystemConfig(ref.recordKey));
  } catch {
    return null;
  }
}

export async function listRecentSavedMediaContexts(input: {
  botId: string;
  customerJid: string;
  limit?: number;
  type?: DurableMediaContextType;
}) {
  const deps = await resolveDeps();
  const indexKey = buildRecentMediaContextIndexKey(input);
  const refs = parseRecentRefs(await deps.getSystemConfig(indexKey));
  const filteredRefs = refs.filter((ref) => !input.type || ref.type === normalizeType(input.type));
  const limitedRefs = filteredRefs.slice(0, Math.max(1, Math.min(20, Number(input.limit || MAX_RECENT_MEDIA_CONTEXT_REFS))));
  const records = await Promise.all(limitedRefs.map(async (ref) => {
    const record = parseRecord(await deps.getSystemConfig(ref.recordKey));
    return record && hasUsefulSavedMediaContext(record) ? record : null;
  }));
  return records.filter(Boolean) as DurableMediaContextRecord[];
}

export async function findBestSavedMediaContextForReference(input: {
  botId: string;
  customerJid: string;
  latestUserText?: any;
  type?: DurableMediaContextType;
}) {
  const records = await listRecentSavedMediaContexts({
    botId: input.botId,
    customerJid: input.customerJid,
    limit: MAX_RECENT_MEDIA_CONTEXT_REFS,
    type: input.type,
  });
  if (!records.length || !messageReferencesRememberedMedia(input.latestUserText)) return null;
  const ranked = records
    .map((record) => ({
      record,
      score: scoreReferenceMatch({
        latestUserText: input.latestUserText,
        record,
      }),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || Number(b.record.updatedAt || 0) - Number(a.record.updatedAt || 0));
  return ranked[0]?.record || null;
}

export function hasUsefulSavedMediaContext(record: DurableMediaContextRecord | null | undefined) {
  return Boolean(record?.useful && (record.summary || record.transcript || record.visibleText));
}

export function hasSameFailedMediaContext(
  record: DurableMediaContextRecord | null | undefined,
  input: { payloadFingerprint?: any; configFingerprint?: any } = {},
) {
  if (!record || record.useful) return false;
  const payloadFingerprint = clean(input.payloadFingerprint, 80);
  const configFingerprint = clean(input.configFingerprint, 80);
  if (payloadFingerprint && record.payloadFingerprint && record.payloadFingerprint !== payloadFingerprint) return false;
  if (configFingerprint && record.configFingerprint && record.configFingerprint !== configFingerprint) return false;
  return Boolean(record.failureReason || record.updatedAt);
}

export function buildMediaContextHistoryText(record: DurableMediaContextRecord | null | undefined, fallbackText = "") {
  if (!record?.useful) return clean(fallbackText, 2000);
  if (record.type === "audio") {
    return buildVoiceNoteHistoryText({
      transcript: clean(record.transcript || record.summary || record.visibleText, 5000),
      fallbackUnavailableText: clean(fallbackText, 400),
    });
  }
  const imageText = clean(record.summary || record.visibleText, 1200);
  if (!imageText) return clean(fallbackText, 2000);
  return `[Image] ${imageText}`.trim();
}

export function __setMessageMediaContextTestDeps(overrides: Partial<MediaContextStoreDeps>) {
  testDeps = { ...(testDeps || {}), ...(overrides || {}) };
}

export function __resetMessageMediaContextTestDeps() {
  testDeps = null;
}
