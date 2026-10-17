import crypto from "crypto";
import * as dbService from "./db-service.ts";
import { cleanString, nowSeconds } from "./integration-foundation-store.ts";
import { assertSafeExternalServiceUrl } from "./outbound-url-safety-service.ts";
import { compactAiText } from "./ai-cost-control-service.ts";
import {
  acceptedKnowledgeItem,
  failedKnowledgeItem,
  normalizeWebsiteKnowledgeSyncInputs,
  sortFailedKnowledgeItemsForOverview,
  sortKnowledgeItemsForOverview,
} from "./website-knowledge-sync-utils.ts";

const STORE_KEY = "websiteKnowledge";
const MAX_ITEMS = 500;
const MAX_CONTENT_CHARS = 12000;
const MAX_FAILED_ITEMS = 120;
export const WEBSITE_KNOWLEDGE_AI_MAX_ITEMS = 4;
export const WEBSITE_KNOWLEDGE_AI_MAX_CHARS = 1800;

type WebsiteKnowledgeStore = {
  items?: any[];
  sources?: any[];
  failedItems?: any[];
};

export function websiteKnowledgeStableId(accountId: string, input: any = {}) {
  const source = [
    accountId,
    input.siteUrl || input.url || "",
    input.sourceItemId || input.postId || input.slug || input.title || "",
    input.type || "page",
  ].join("|");
  const hash = crypto.createHash("sha1").update(source).digest("hex").slice(0, 24);
  return `wk_${hash}`;
}

export function sanitizeWebsiteKnowledgeContent(value: any) {
  return cleanString(value, MAX_CONTENT_CHARS)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/\[[a-zA-Z0-9_-]+[^\]]*\]/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hashKnowledgeContent(value: any) {
  const text = String(value || "");
  return text ? crypto.createHash("sha256").update(text).digest("hex").slice(0, 16) : "";
}

function publicKnowledgeItem(accountId: string, input: any = {}) {
  const content = sanitizeWebsiteKnowledgeContent(input.content || input.text || input.excerpt);
  const sourceType = cleanString(input.sourceType || input.source || "WordPress", 40) || "WordPress";
  const itemType = cleanString(input.type || "page", 40).toLowerCase();
  const lastModifiedAt = Number(input.lastModifiedAt || input.modifiedAt || input.updatedAt || 0);
  return {
    id: cleanString(input.id, 80) || websiteKnowledgeStableId(accountId, input),
    accountId,
    botId: cleanString(input.botId, 80),
    siteUrl: cleanString(input.siteUrl || input.url, 260),
    sourceItemId: cleanString(input.sourceItemId || input.postId || input.slug, 120),
    sourceType,
    type: itemType === "post" ? "post" : "page",
    title: cleanString(input.title, 180),
    url: cleanString(input.url || input.permalink || input.siteUrl, 300),
    status: cleanString(input.status || "active", 40),
    content,
    contentHash: hashKnowledgeContent(content),
    excerpt: sanitizeWebsiteKnowledgeContent(input.excerpt || input.summary || "").slice(0, 500),
    lastModifiedAt,
    lastSyncedAt: Number(input.lastSyncedAt || nowSeconds()),
    updatedAt: Number(input.updatedAt || lastModifiedAt || nowSeconds()),
    createdAt: Number(input.createdAt || nowSeconds()),
  };
}

function publicFailedKnowledgeItem(accountId: string, input: any = {}, error: any = "Sync failed") {
  const reason = cleanString(error?.message || error || "Sync failed", 220);
  return {
    id: `wk_fail_${crypto.createHash("sha1").update([
      accountId,
      input.siteUrl || input.url || "",
      input.sourceItemId || input.postId || input.slug || input.title || "",
      input.type || "page",
      reason,
    ].join("|")).digest("hex").slice(0, 22)}`,
    accountId,
    botId: cleanString(input.botId, 80),
    sourceType: cleanString(input.sourceType || input.source || "WordPress", 40) || "WordPress",
    siteUrl: cleanString(input.siteUrl || input.url, 260),
    sourceItemId: cleanString(input.sourceItemId || input.postId || input.slug, 120),
    type: cleanString(input.type || "page", 40).toLowerCase() === "post" ? "post" : "page",
    title: cleanString(input.title, 180),
    url: cleanString(input.url || input.permalink || input.siteUrl, 300),
    errorReason: reason,
    failedAt: nowSeconds(),
  };
}

async function loadWebsiteKnowledgeStore(accountId: string): Promise<WebsiteKnowledgeStore> {
  const store = await dbService.getUserExtraConfigValue(accountId, STORE_KEY).catch(() => null);
  if (!store || typeof store !== "object") return {};
  return {
    items: Array.isArray(store.items) ? store.items : [],
    sources: Array.isArray(store.sources) ? store.sources : [],
    failedItems: Array.isArray(store.failedItems) ? store.failedItems : [],
  };
}

async function saveWebsiteKnowledgeStore(accountId: string, store: WebsiteKnowledgeStore) {
  await dbService.saveUserExtraConfigPatch(accountId, { [STORE_KEY]: store });
  return store;
}

async function updateWebsiteKnowledgeStore(accountId: string, updater: (store: WebsiteKnowledgeStore) => WebsiteKnowledgeStore | Promise<WebsiteKnowledgeStore>) {
  const current = await loadWebsiteKnowledgeStore(accountId);
  const next = await updater(current);
  return saveWebsiteKnowledgeStore(accountId, next);
}

export async function syncWebsiteKnowledgeItem(accountId: string, input: any = {}) {
  const item = publicKnowledgeItem(accountId, input);
  if (!item.title && !item.content) throw new Error("Knowledge title or content is required.");
  if (item.siteUrl) {
    await assertSafeExternalServiceUrl(item.siteUrl, { label: "Website knowledge source", requireHttps: true, allowLocalDevelopment: true, maxLength: 300 });
  }
  await updateWebsiteKnowledgeStore(accountId, (store) => {
    const items = [...(store.items || [])];
    const existingIndex = items.findIndex((row) => row.id === item.id || (
      row.siteUrl === item.siteUrl &&
      row.sourceItemId === item.sourceItemId &&
      row.type === item.type
    ));
    if (existingIndex >= 0) items[existingIndex] = { ...items[existingIndex], ...item, updatedAt: nowSeconds() };
    else items.unshift(item);

    const sourceId = item.siteUrl || "manual";
    const sources = [...(store.sources || [])];
    const sourceIndex = sources.findIndex((row) => row.id === sourceId);
    const activeItems = items.filter((row) => row.siteUrl === item.siteUrl && row.status !== "failed");
    const failedItems = (store.failedItems || []).filter((row) => !(row.siteUrl === item.siteUrl && row.sourceItemId === item.sourceItemId && row.type === item.type));
    const source = {
      id: sourceId,
      siteUrl: item.siteUrl,
      botId: item.botId,
      sourceType: item.sourceType,
      status: "active",
      itemCount: activeItems.length,
      pagesCount: activeItems.filter((row) => row.type === "page").length,
      postsCount: activeItems.filter((row) => row.type === "post").length,
      failedItemCount: failedItems.filter((row) => row.siteUrl === item.siteUrl).length,
      lastSyncStatus: "success",
      lastSyncAt: item.lastSyncedAt,
      lastError: "",
    };
    if (sourceIndex >= 0) sources[sourceIndex] = { ...sources[sourceIndex], ...source };
    else sources.unshift(source);
    return { ...store, items: items.slice(0, MAX_ITEMS), failedItems: failedItems.slice(0, MAX_FAILED_ITEMS), sources: sources.slice(0, 50) };
  });
  return { ...item, contentLength: item.content.length };
}

export async function recordWebsiteKnowledgeSyncFailure(accountId: string, input: any = {}, error: any = "Sync failed") {
  const failed = publicFailedKnowledgeItem(accountId, input, error);
  await updateWebsiteKnowledgeStore(accountId, (store) => {
    const failedItems = [
      failed,
      ...(store.failedItems || []).filter((row) => row.id !== failed.id),
    ].slice(0, MAX_FAILED_ITEMS);
    const sourceId = failed.siteUrl || "manual";
    const items = store.items || [];
    const activeItems = items.filter((row) => row.siteUrl === failed.siteUrl && row.status !== "failed");
    const sources = [...(store.sources || [])];
    const sourceIndex = sources.findIndex((row) => row.id === sourceId);
    const source = {
      id: sourceId,
      siteUrl: failed.siteUrl,
      botId: failed.botId,
      sourceType: failed.sourceType,
      status: "error",
      itemCount: activeItems.length,
      pagesCount: activeItems.filter((row) => row.type === "page").length,
      postsCount: activeItems.filter((row) => row.type === "post").length,
      failedItemCount: failedItems.filter((row) => row.siteUrl === failed.siteUrl).length,
      lastSyncStatus: "failed",
      lastSyncAt: nowSeconds(),
      lastError: failed.errorReason,
    };
    if (sourceIndex >= 0) sources[sourceIndex] = { ...sources[sourceIndex], ...source };
    else sources.unshift(source);
    return { ...store, failedItems, sources: sources.slice(0, 50) };
  });
  return failed;
}

export async function getWebsiteKnowledgeOverview(accountId: string) {
  const store = await loadWebsiteKnowledgeStore(accountId);
  const items = (store.items || []).map((item) => ({
    ...item,
    content: undefined,
    contentLength: String(item.content || "").length,
    excerpt: item.excerpt || String(item.content || "").slice(0, 260),
  }));
  const sortedItems = sortKnowledgeItemsForOverview(items);
  const failedItems = sortFailedKnowledgeItemsForOverview(store.failedItems || []).slice(0, 100);
  const pagesCount = items.filter((item) => item.type === "page").length;
  const postsCount = items.filter((item) => item.type === "post").length;
  const latestSource = (store.sources || [])[0] || {};
  return {
    totalItems: sortedItems.length,
    pagesCount,
    postsCount,
    failedItemCount: failedItems.length,
    connectedSiteUrl: latestSource.siteUrl || sortedItems[0]?.siteUrl || failedItems[0]?.siteUrl || "",
    botId: latestSource.botId || sortedItems[0]?.botId || failedItems[0]?.botId || "",
    sourceType: latestSource.sourceType || sortedItems[0]?.sourceType || failedItems[0]?.sourceType || "WordPress",
    latestSyncStatus: latestSource.lastSyncStatus || latestSource.status || (failedItems.length ? "failed" : sortedItems.length ? "success" : "none"),
    sources: store.sources || [],
    items: sortedItems.slice(0, 200),
    failedItems,
    lastSyncAt: Math.max(
      0,
      ...sortedItems.map((item) => Number(item.lastSyncedAt || item.updatedAt || item.createdAt || 0)),
      ...failedItems.map((item) => Number(item.failedAt || 0)),
    ),
  };
}

function normalizeSearchText(value: any) {
  return cleanString(value, 2000).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}

function relevanceScore(query: any, item: any) {
  const tokens = normalizeSearchText(query).split(" ").filter((token) => token.length >= 3);
  if (tokens.length === 0) return 0;
  const haystack = normalizeSearchText([item.title, item.excerpt, item.content, item.url].filter(Boolean).join(" "));
  return tokens.reduce((score, token) => score + (haystack.includes(token) ? 2 : 0), 0);
}

export function selectWebsiteKnowledgeSnippets(items: any[] = [], input: { botId?: string; query?: string; maxItems?: number; maxChars?: number } = {}) {
  const maxItems = Math.max(1, Number(input.maxItems || WEBSITE_KNOWLEDGE_AI_MAX_ITEMS));
  const maxChars = Math.max(300, Number(input.maxChars || WEBSITE_KNOWLEDGE_AI_MAX_CHARS));
  let usedChars = 0;
  return (Array.isArray(items) ? items : [])
    .filter((item) => item && item.status !== "failed")
    .filter((item) => !input.botId || !item.botId || item.botId === input.botId)
    .map((item, index) => ({ item, index, score: relevanceScore(input.query || "", item) }))
    .sort((a, b) => b.score - a.score || Number(b.item.lastSyncedAt || b.item.updatedAt || 0) - Number(a.item.lastSyncedAt || a.item.updatedAt || 0) || a.index - b.index)
    .slice(0, maxItems * 2)
    .map(({ item }) => {
      const snippet = compactAiText(item.excerpt || item.content || "", 420);
      return {
        id: item.id,
        title: cleanString(item.title, 120),
        type: item.type === "post" ? "post" : "page",
        url: cleanString(item.url, 220),
        siteUrl: cleanString(item.siteUrl, 220),
        sourceType: cleanString(item.sourceType || "WordPress", 40),
        snippet,
      };
    })
    .filter((item) => item.title || item.snippet)
    .filter((item) => {
      const nextLength = [item.title, item.url, item.snippet].join(" ").length;
      if (usedChars + nextLength > maxChars && usedChars > 0) return false;
      usedChars += nextLength;
      return true;
    })
    .slice(0, maxItems);
}

export function renderWebsiteKnowledgePromptSection(snippets: any[] = []) {
  if (!snippets.length) return "";
  return [
    "Website Knowledge from synced WordPress content. Use only when relevant to the customer's question. Do not invent details beyond these snippets.",
    ...snippets.map((item, index) => [
      `${index + 1}. ${item.title || "Untitled"} (${item.type || "page"})`,
      item.url ? `URL: ${item.url}` : "",
      item.snippet ? `Snippet: ${item.snippet}` : "",
    ].filter(Boolean).join("\n")),
  ].join("\n");
}

export async function buildWebsiteKnowledgeAiContext(accountId: string, input: { botId?: string; query?: string; maxItems?: number; maxChars?: number } = {}) {
  const store = await loadWebsiteKnowledgeStore(accountId);
  const snippets = selectWebsiteKnowledgeSnippets(store.items || [], input);
  return {
    snippets,
    promptText: renderWebsiteKnowledgePromptSection(snippets),
    totalAvailable: (store.items || []).filter((item) => !input.botId || !item.botId || item.botId === input.botId).length,
  };
}

export const __websiteKnowledgeTestUtils = {
  websiteKnowledgeStableId,
  sanitizeWebsiteKnowledgeContent,
  publicKnowledgeItem,
  publicFailedKnowledgeItem,
  normalizeWebsiteKnowledgeSyncInputs,
  acceptedKnowledgeItem,
  failedKnowledgeItem,
  sortKnowledgeItemsForOverview,
  sortFailedKnowledgeItemsForOverview,
  selectWebsiteKnowledgeSnippets,
  renderWebsiteKnowledgePromptSection,
};
