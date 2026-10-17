export const WEBSITE_KNOWLEDGE_MAX_BATCH_ITEMS = 20;

export function normalizeWebsiteKnowledgeSyncInputs(payload: any) {
  const items = Array.isArray(payload?.items)
    ? payload.items
    : Array.isArray(payload)
      ? payload
      : [payload || {}];
  if (items.length > WEBSITE_KNOWLEDGE_MAX_BATCH_ITEMS) {
    throw new Error(`Batch sync accepts up to ${WEBSITE_KNOWLEDGE_MAX_BATCH_ITEMS} items per request.`);
  }
  return items;
}

export function acceptedKnowledgeItem(item: any) {
  return {
    id: item.id,
    sourceItemId: item.sourceItemId,
    title: item.title,
    type: item.type,
    url: item.url,
    status: item.status,
    contentLength: item.contentLength,
    contentHash: item.contentHash,
  };
}

export function failedKnowledgeItem(item: any) {
  return {
    sourceItemId: item.sourceItemId,
    title: item.title,
    type: item.type,
    url: item.url,
    errorReason: item.errorReason,
    failedAt: item.failedAt,
  };
}

export function sortKnowledgeItemsForOverview(items: any[] = []) {
  return items.slice().sort((a, b) => Number(b.lastSyncedAt || b.updatedAt || b.createdAt || 0) - Number(a.lastSyncedAt || a.updatedAt || a.createdAt || 0));
}

export function sortFailedKnowledgeItemsForOverview(items: any[] = []) {
  return items.slice().sort((a, b) => Number(b.failedAt || 0) - Number(a.failedAt || 0));
}
