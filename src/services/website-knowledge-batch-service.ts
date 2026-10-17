import {
  acceptedKnowledgeItem,
  failedKnowledgeItem,
  WEBSITE_KNOWLEDGE_MAX_BATCH_ITEMS,
} from "./website-knowledge-sync-utils.ts";
import {
  recordWebsiteKnowledgeSyncFailure,
  syncWebsiteKnowledgeItem,
} from "./website-knowledge-service.ts";

export async function syncWebsiteKnowledgeBatch(accountId: string, inputs: any[] = []) {
  const acceptedItems: any[] = [];
  const failedItems: any[] = [];
  for (const input of inputs) {
    try {
      const item = await syncWebsiteKnowledgeItem(accountId, input || {});
      acceptedItems.push(acceptedKnowledgeItem(item));
    } catch (e: any) {
      const failed = await recordWebsiteKnowledgeSyncFailure(accountId, input || {}, e?.message || "Failed to sync website knowledge");
      failedItems.push(failedKnowledgeItem(failed));
    }
  }
  return {
    success: failedItems.length === 0,
    acceptedItems,
    failedItems,
  };
}

export async function recordWebsiteKnowledgeSyncFailures(accountId: string, inputs: any[] = [], reason: any = "Sync failed") {
  const failedItems: any[] = [];
  for (const input of inputs.slice(0, WEBSITE_KNOWLEDGE_MAX_BATCH_ITEMS)) {
    const failed = await recordWebsiteKnowledgeSyncFailure(accountId, input || {}, reason);
    failedItems.push(failedKnowledgeItem(failed));
  }
  return failedItems;
}
