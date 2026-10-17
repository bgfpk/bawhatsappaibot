export type MediaType = "text" | "image" | "video" | "document" | "sticker" | "audio";

export interface MediaLibraryItem {
  id: string;
  name: string;
  caption?: string;
  shortName?: string;
  type: MediaType;
  previewUrl?: string;
  sourceGroupName?: string;
  sourceGroupJid?: string;
  capturedAt?: number | string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  messageId?: string;
  status: "ready" | "processing" | "error" | "unknown";
  raw?: any;
}

export function deriveMediaShortTitle(options: {
  type?: string;
  caption?: string;
  fileName?: string;
  explicitTitle?: string;
  index?: number;
}): string {
  const { type = "image", caption, fileName, explicitTitle, index } = options;

  // 1. Explicit saved short/title metadata if present and concise
  if (explicitTitle && typeof explicitTitle === "string") {
    const trimmedExplicit = explicitTitle.trim();
    if (trimmedExplicit.length > 0 && trimmedExplicit.length <= 60 && !trimmedExplicit.includes("\n")) {
      return trimmedExplicit;
    }
  }

  // 2. Original filename for documents and audio
  if ((type === "document" || type === "audio") && fileName && typeof fileName === "string") {
    const cleanFileName = fileName.trim();
    if (cleanFileName.length > 0) {
      return cleanFileName;
    }
  }

  // 3. First short caption line/phrase when already concise
  if (caption && typeof caption === "string") {
    const cleanCaption = caption.trim();
    if (cleanCaption.length > 0) {
      const firstLine = cleanCaption.split(/[\r\n]+/)[0]?.trim() || "";
      const firstSentence = firstLine.split(/(?<=[.!?])\s+/)[0]?.trim() || "";
      const candidatePhrase =
        firstSentence.length >= 3 && firstSentence.length <= 50
          ? firstSentence
          : firstLine.length >= 3 && firstLine.length <= 50
          ? firstLine
          : "";

      if (candidatePhrase) {
        return candidatePhrase.replace(/[:.!?]+$/, "").trim();
      }

      // 4. Otherwise derive a short deterministic display title from the beginning of the caption
      const words = cleanCaption.replace(/\s+/g, " ").split(" ");
      let shortSnippet = "";
      for (const word of words) {
        if ((shortSnippet + " " + word).trim().length > 40) break;
        shortSnippet = (shortSnippet + " " + word).trim();
      }
      if (shortSnippet.length >= 3) {
        return shortSnippet + (cleanCaption.length > shortSnippet.length ? "..." : "");
      }
    }
  }

  // Fallbacks by type
  const itemNum = typeof index === "number" ? ` #${index + 1}` : "";
  switch (type) {
    case "image":
      return `Image${itemNum || " Template"}`;
    case "video":
      return `Video${itemNum || " Walkthrough"}`;
    case "document":
      return fileName ? fileName.trim() : `Document${itemNum || " File"}`;
    case "audio":
      return fileName ? fileName.trim() : `Audio${itemNum || " Note"}`;
    case "sticker":
      return `Sticker${itemNum || " Asset"}`;
    default:
      return `Media${itemNum || " Template"}`;
  }
}

export interface MediaGroupItem {
  id: string;
  name: string;
  jid: string;
  instructions?: string;
  autoSync?: boolean;
  enabled?: boolean;
  status: "connected" | "paused" | "error" | "needs_group";
  templateCount: number;
  lastCapturedAt?: number | string;
}

export interface SavedReplyItem {
  id: string;
  shortcut?: string;
  title: string;
  type: MediaType;
  content: string;
  flowInstructions?: string;
  mediaUrl?: string;
  status: "ready" | "error";
  syncGroupId?: string;
  sourcePurpose?: string;
  sourceGroupJid?: string;
  sourceGroupName?: string;
}

export interface SequenceItemDetail {
  index: number;
  type: MediaType;
  content: string;
  mediaUrl?: string;
  fileName?: string;
  delaySeconds?: number;
}

export interface SequenceGroupItem {
  id: string;
  name: string;
  groupJid?: string;
  instructions?: string;
  itemCount: number;
  items: SequenceItemDetail[];
  shortcutCode?: string;
  keywordTrigger?: string;
  isEnabled: boolean;
  lastUpdated?: number | string;
}

export interface WelcomeSequenceConfig {
  id?: string;
  groupJid?: string;
  instructions?: string;
  autoSync?: boolean;
  isConfigured: boolean;
  isEnabled: boolean;
  name: string;
  itemCount: number;
  items: SequenceItemDetail[];
  shortcutCode?: string;
  readinessStatus: "ready" | "templates_unavailable" | "disabled" | "wallet_blocked" | "not_configured" | "ambiguity_error";
  guardReason?: string;
  lastUpdated?: number | string;
}

export function normalizeMediaItem(raw: any): MediaLibraryItem {
  const safeRaw = raw || {};
  const fallbackId = `med_${safeRaw.timestamp || "ts"}_${safeRaw.type || "item"}_${(safeRaw.caption || safeRaw.fileName || "media").slice(0, 12).replace(/\s+/g, "_")}`;
  const id = String(
    safeRaw.id ||
      safeRaw.$id ||
      safeRaw.key?.id ||
      safeRaw.mediaId ||
      fallbackId
  );
  let type: MediaType = "text";
  const rawType = String(safeRaw.type || safeRaw.mediaType || "").toLowerCase();
  if (rawType.includes("image")) type = "image";
  else if (rawType.includes("video")) type = "video";
  else if (rawType.includes("doc")) type = "document";
  else if (rawType.includes("sticker")) type = "sticker";
  else if (rawType.includes("audio")) type = "audio";

  const rawCaption = typeof safeRaw.caption === "string" ? safeRaw.caption.trim() : undefined;
  const fileName = safeRaw.fileName || safeRaw.filename || undefined;
  const explicitTitle = safeRaw.shortName || safeRaw.title || (safeRaw.name && safeRaw.name !== rawCaption ? safeRaw.name : undefined);
  const name = deriveMediaShortTitle({
    type,
    caption: rawCaption,
    fileName,
    explicitTitle,
  });

  const rawStatus = safeRaw.status ? String(safeRaw.status).toLowerCase() : undefined;
  let status: MediaLibraryItem["status"] = "unknown";
  if (rawStatus === "ready" || rawStatus === "active" || rawStatus === "synced" || safeRaw.crawled === true) {
    status = "ready";
  } else if (rawStatus === "processing" || rawStatus === "crawling") {
    status = "processing";
  } else if (rawStatus === "error" || rawStatus === "failed") {
    status = "error";
  }

  return {
    id,
    name,
    caption: rawCaption,
    shortName: name,
    type,
    previewUrl: safeRaw.url || safeRaw.mediaUrl || safeRaw.previewUrl || undefined,
    sourceGroupName: safeRaw.sourceGroupName || safeRaw.groupName || undefined,
    sourceGroupJid: safeRaw.sourceGroupJid || safeRaw.groupJid || undefined,
    capturedAt: safeRaw.timestamp || safeRaw.createdAt || safeRaw.updatedAt || undefined,
    fileName,
    fileSize: typeof safeRaw.fileSize === "number" ? safeRaw.fileSize : undefined,
    mimeType: safeRaw.mimeType || safeRaw.mimetype || undefined,
    messageId: safeRaw.messageId || id,
    status,
    raw: safeRaw,
  };
}

export function filterMediaItems(items: MediaLibraryItem[], query: string, typeFilter: string): MediaLibraryItem[] {
  const q = query.trim().toLowerCase();

  return items.filter((item) => {
    if (q) {
      const matchName = item.name.toLowerCase().includes(q);
      const matchCaption = (item.caption || "").toLowerCase().includes(q);
      const matchFile = (item.fileName || "").toLowerCase().includes(q);
      const matchGroup = (item.sourceGroupName || "").toLowerCase().includes(q);
      if (!matchName && !matchCaption && !matchFile && !matchGroup) return false;
    }

    if (typeFilter !== "all" && item.type !== typeFilter) {
      return false;
    }

    return true;
  });
}

export function filterSequences(sequences: SequenceGroupItem[], query: string): SequenceGroupItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return sequences;

  return sequences.filter((seq) => {
    const matchName = seq.name.toLowerCase().includes(q);
    const matchShortcut = (seq.shortcutCode || "").toLowerCase().includes(q);
    const matchKeyword = (seq.keywordTrigger || "").toLowerCase().includes(q);
    return matchName || matchShortcut || matchKeyword;
  });
}
