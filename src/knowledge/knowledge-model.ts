export interface KnowledgeSourceItem {
  id?: string;
  url: string;
  title: string;
  status: "ready" | "processing" | "error" | "needs_refresh" | "unknown";
  lastCrawledAt?: number | string;
  pageCount?: number;
}

export function normalizeKnowledgeSource(raw: any): KnowledgeSourceItem {
  const id = raw?.$id || raw?.id || raw?.sourceId || undefined;
  const url = String(raw?.url || raw?.website_url || "").trim();

  let derivedTitle = raw?.title || raw?.name;
  if (!derivedTitle) {
    if (url && /^https?:\/\//i.test(url)) {
      try {
        derivedTitle = new URL(url).hostname;
      } catch {
        derivedTitle = "Untitled source";
      }
    } else {
      derivedTitle = "Untitled source";
    }
  }

  const rawStatus = raw?.status ? String(raw.status).toLowerCase() : undefined;
  let status: KnowledgeSourceItem["status"] = "unknown";
  if (rawStatus === "ready" || rawStatus === "active" || rawStatus === "synced" || raw?.crawled === true) {
    status = "ready";
  } else if (rawStatus === "processing" || rawStatus === "crawling" || rawStatus === "syncing") {
    status = "processing";
  } else if (rawStatus === "error" || rawStatus === "failed") {
    status = "error";
  } else if (rawStatus === "needs_refresh") {
    status = "needs_refresh";
  }

  return {
    id,
    url: url || "URL unavailable",
    title: derivedTitle,
    status,
    lastCrawledAt: raw?.updated_at || raw?.$updatedAt || raw?.syncedAt || undefined,
    pageCount: typeof raw?.pages === "number" ? raw.pages : undefined,
  };
}
