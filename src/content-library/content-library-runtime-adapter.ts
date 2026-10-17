import {
  deriveMediaShortTitle,
  type SequenceGroupItem,
  type WelcomeSequenceConfig,
  type MediaGroupItem,
  type MediaLibraryItem,
  type SequenceItemDetail,
  type MediaType,
  type SavedReplyItem,
} from "./content-library-model";

export interface SyncGroup {
  id?: string;
  name?: string;
  purpose?: string;
  instructions?: string;
  jid?: string;
  shortcut_code?: string;
  shortcut?: string;
  templateCount?: number;
  enabled?: boolean;
  autoSync?: boolean;
  trigger_keywords?: string[] | string;
  [key: string]: any;
}

import { unwrapMessageContent } from "../services/whatsapp-message-content.ts";

export function parseTemplateItem(raw: any, index: number): SequenceItemDetail {
  if (!raw) {
    return {
      index: index + 1,
      type: "text",
      content: "Unsupported message format",
      delaySeconds: 0,
    };
  }

  // Handle wrapped message payloads (e.g. { caption, aliases, originalMessage: { key, message } })
  const underlyingMsg = raw.originalMessage?.message
    ? raw.originalMessage.message
    : (raw.originalMessage || raw.message || raw);
  const msgContent = unwrapMessageContent(underlyingMsg);

  let type: MediaType = "text";
  let content = "";
  let mediaUrl: string | undefined = raw.url || raw.mediaUrl || raw.previewUrl || underlyingMsg?.url || underlyingMsg?.mediaUrl || undefined;
  let fileName: string | undefined = raw.fileName || raw.filename || underlyingMsg?.fileName || underlyingMsg?.filename || undefined;

  if (msgContent?.imageMessage) {
    type = "image";
    content = msgContent.imageMessage.caption || raw.caption || raw.text || "Image";
    mediaUrl = msgContent.imageMessage.url || mediaUrl;
  } else if (msgContent?.videoMessage) {
    type = "video";
    content = msgContent.videoMessage.caption || raw.caption || raw.text || "Video";
    mediaUrl = msgContent.videoMessage.url || mediaUrl;
  } else if (msgContent?.documentMessage) {
    type = "document";
    fileName = msgContent.documentMessage.fileName || fileName;
    content = msgContent.documentMessage.caption || fileName || raw.caption || raw.text || "Document";
    mediaUrl = msgContent.documentMessage.url || mediaUrl;
  } else if (msgContent?.stickerMessage) {
    type = "sticker";
    content = "Sticker";
    mediaUrl = msgContent.stickerMessage.url || mediaUrl;
  } else if (msgContent?.audioMessage) {
    type = "audio";
    fileName = msgContent.audioMessage.fileName || fileName || "audio.ogg";
    content = fileName || "Audio";
    mediaUrl = msgContent.audioMessage.url || mediaUrl;
  } else if (msgContent?.conversation || msgContent?.extendedTextMessage?.text) {
    type = "text";
    content = msgContent.conversation || msgContent.extendedTextMessage.text || "";
  } else {
    // Check shallow/adapter object structure
    const rawType = String(raw.type || raw.mediaType || underlyingMsg?.type || underlyingMsg?.mediaType || "").toLowerCase();
    if (rawType.includes("image")) {
      type = "image";
      content = raw.caption || raw.text || raw.content || "Image";
    } else if (rawType.includes("video")) {
      type = "video";
      content = raw.caption || raw.text || raw.content || "Video";
    } else if (rawType.includes("doc")) {
      type = "document";
      content = raw.caption || raw.fileName || raw.filename || raw.text || raw.content || "Document";
    } else if (rawType.includes("audio")) {
      type = "audio";
      fileName = raw.fileName || raw.filename || "audio.ogg";
      content = fileName || "Audio";
    } else if (rawType.includes("sticker")) {
      type = "sticker";
      content = "Sticker";
    } else if (rawType.includes("text")) {
      type = "text";
      content = raw.text || raw.caption || raw.content || "";
    } else if (raw.text || raw.caption || raw.content) {
      type = "text";
      content = raw.text || raw.caption || raw.content;
    } else {
      type = "text";
      content = "Unsupported message format";
    }
  }

  return {
    index: index + 1,
    type,
    content: content || "Unsupported message format",
    mediaUrl,
    fileName,
    delaySeconds: raw.delaySeconds || 0,
  };
}

export function buildSequenceGroupItems(
  syncGroups: SyncGroup[] = [],
  templateDetails?: any
): SequenceGroupItem[] {
  const sequenceGroups = syncGroups.filter((g) => {
    const purpose = String(g.purpose || g.type || "").toLowerCase();
    return purpose === "sequence";
  });

  return sequenceGroups.map((g, idx) => {
    const jid = g.jid || "";
    const name = g.name || jid.split("@")[0] || `Sequence Group ${idx + 1}`;
    const id = g.id || g.jid || g.name || `seq_grp_${idx}_${name.toLowerCase().replace(/\s+/g, "_")}`;

    const seqTemplateData = templateDetails?.sequences?.[name] || templateDetails?.sequences?.[jid] || templateDetails?.sequences?.[id];
    const rawTemplates = seqTemplateData?.templates || [];
    const parsedItems: SequenceItemDetail[] = rawTemplates.map((t: any, i: number) =>
      parseTemplateItem(t, i)
    );

    const itemCount = parsedItems.length > 0 ? parsedItems.length : Number(g.templateCount || 0);

    const rawKeywords = g.trigger_keywords;
    let keywordTrigger = "";
    if (Array.isArray(rawKeywords)) {
      keywordTrigger = rawKeywords.join(", ");
    } else if (typeof rawKeywords === "string") {
      keywordTrigger = rawKeywords;
    }

    return {
      id,
      name,
      groupJid: jid || undefined,
      instructions: g.instructions || g.instruction || undefined,
      itemCount,
      items: parsedItems,
      shortcutCode: g.shortcut_code || g.shortcut || undefined,
      keywordTrigger: keywordTrigger || undefined,
      isEnabled: g.enabled !== false,
      lastUpdated: g.updatedAt || undefined,
    };
  });
}

export function normalizePurpose(purpose?: string): "media" | "sequence" | "welcome" | "other" {
  const p = String(purpose || "").trim().toLowerCase();
  if (p === "media") return "media";
  if (p.includes("welcome")) return "welcome";
  if (p.includes("sequence")) return "sequence";
  return "other";
}

export function isMatchingGroupIdentity(
  group: SyncGroup,
  targetId: string,
  targetPurpose: "media" | "sequence" | "welcome"
): boolean {
  if (!group || !targetId) return false;
  const groupPurpose = normalizePurpose(group.purpose || group.type);
  if (groupPurpose !== targetPurpose) return false;

  const id = String(group.id || "").trim();
  const jid = String(group.jid || "").trim();
  const name = String(group.name || "").trim();
  const search = String(targetId).trim();

  return id === search || jid === search || name === search;
}

export { normalizeShortcutCode } from "./sequence-group-config-service";

export interface ResolvedWelcomeGroupState {
  status: "unconfigured" | "valid" | "ambiguity_error";
  welcomeGroup?: SyncGroup;
  error?: string;
}

export function resolveWelcomeSequenceGroup(syncGroups: SyncGroup[] = []): ResolvedWelcomeGroupState {
  const welcomeGroups = (syncGroups || []).filter((g) => normalizePurpose(g.purpose || g.type) === "welcome");
  if (welcomeGroups.length === 0) {
    return { status: "unconfigured" };
  }
  if (welcomeGroups.length > 1) {
    return {
      status: "ambiguity_error",
      error: `Configuration ambiguity error: Found ${welcomeGroups.length} Welcome Sequence groups. Exactly one Welcome group is allowed per instance. Please clean up duplicate Welcome groups.`,
    };
  }
  return { status: "valid", welcomeGroup: welcomeGroups[0] };
}

export function buildWelcomeSequenceConfig(
  syncGroups: SyncGroup[] = [],
  templateDetails?: any
): WelcomeSequenceConfig {
  const resolved = resolveWelcomeSequenceGroup(syncGroups);

  if (resolved.status === "ambiguity_error") {
    const firstGroup = (syncGroups || []).find((g) => normalizePurpose(g.purpose || g.type) === "welcome");
    return {
      id: firstGroup?.id || firstGroup?.jid || firstGroup?.name || "welcome_ambiguous",
      groupJid: firstGroup?.jid || undefined,
      instructions: firstGroup?.instructions || undefined,
      autoSync: false,
      isConfigured: true,
      isEnabled: false,
      name: "Welcome Sequence (Ambiguous Config)",
      itemCount: 0,
      items: [],
      readinessStatus: "ambiguity_error",
      guardReason: resolved.error,
    };
  }

  const welcomeGroup = resolved.welcomeGroup;
  const isConfigured = Boolean(welcomeGroup);

  if (!welcomeGroup || !isConfigured) {
    return {
      id: undefined,
      groupJid: undefined,
      instructions: undefined,
      autoSync: true,
      isConfigured: false,
      isEnabled: false,
      name: "Welcome Sequence",
      itemCount: 0,
      items: [],
      readinessStatus: "not_configured",
    };
  }

  const rawTemplates = templateDetails?.welcome?.templates || [];
  const parsedItems: SequenceItemDetail[] = rawTemplates.map((t: any, i: number) =>
    parseTemplateItem(t, i)
  );

  const isEnabled = welcomeGroup.enabled !== false;
  const itemCount = parsedItems.length > 0 ? parsedItems.length : Number(welcomeGroup.templateCount || 0);

  return {
    id: welcomeGroup.id || welcomeGroup.jid || welcomeGroup.name || "welcome",
    groupJid: welcomeGroup.jid || undefined,
    instructions: welcomeGroup.instructions || welcomeGroup.instruction || undefined,
    autoSync: welcomeGroup.autoSync !== false,
    isConfigured: true,
    isEnabled,
    name: welcomeGroup.name || "Welcome Sequence",
    itemCount,
    items: parsedItems,
    shortcutCode: welcomeGroup.shortcut_code || welcomeGroup.shortcut || undefined,
    readinessStatus: !isEnabled ? "disabled" : itemCount > 0 ? "ready" : "templates_unavailable",
    lastUpdated: welcomeGroup.updatedAt || undefined,
  };
}

export function buildMediaGroupItems(
  syncGroups: SyncGroup[] = [],
  templateDetails?: any
): MediaGroupItem[] {
  const mediaGroups = syncGroups.filter((g) => normalizePurpose(g.purpose || g.type) === "media");

  return mediaGroups.map((g, idx) => {
    const jid = g.jid || "";
    const name = g.name || jid.split("@")[0] || `Media Group ${idx + 1}`;
    const id = g.id || g.jid || g.name || `med_display_idx_${idx}`;

    const rawTemplates = templateDetails?.media?.templates || [];
    const templateCount = rawTemplates.length > 0 ? rawTemplates.length : Number(g.templateCount || 0);

    const hasValidJid = Boolean(jid && jid.trim().endsWith("@g.us"));
    let status: "connected" | "paused" | "error" | "needs_group" = "needs_group";
    if (!hasValidJid) {
      status = "needs_group";
    } else if (g.enabled === false) {
      status = "paused";
    } else {
      status = "connected";
    }

    return {
      id,
      name,
      jid,
      instructions: g.instructions || g.instruction || undefined,
      autoSync: g.autoSync !== false,
      enabled: g.enabled !== false,
      status,
      templateCount,
      lastCapturedAt: g.updatedAt || undefined,
    };
  });
}

export function buildMediaLibraryItems(
  templateDetails?: any,
  selectedBotId?: string
): MediaLibraryItem[] {
  const rawTemplates = templateDetails?.media?.templates || [];
  return rawTemplates.map((raw: any, idx: number) => {
    const parsed = parseTemplateItem(raw, idx);
    const underlyingMsg = raw.originalMessage || raw;
    const innerMsg = unwrapMessageContent(underlyingMsg.message || underlyingMsg);
    const capturedAt = raw.capturedAt || raw.messageTimestamp || raw.timestamp || underlyingMsg.messageTimestamp || underlyingMsg.timestamp || undefined;
    const id = String(raw.id || raw.key?.id || underlyingMsg.key?.id || underlyingMsg.id || `media_item_${idx}`);

    // Extract complete, untruncated WhatsApp caption
    const rawCaption =
      innerMsg?.imageMessage?.caption ||
      innerMsg?.videoMessage?.caption ||
      innerMsg?.documentMessage?.caption ||
      innerMsg?.documentWithCaptionMessage?.message?.documentMessage?.caption ||
      underlyingMsg?.caption ||
      raw.caption ||
      (parsed.content && !["Image", "Video", "Document", "Audio", "Sticker", "Unsupported message format"].includes(parsed.content) ? parsed.content : undefined);

    const fullCaption = rawCaption ? String(rawCaption).trim() : undefined;

    const shortName = deriveMediaShortTitle({
      type: parsed.type,
      caption: fullCaption,
      fileName: parsed.fileName,
      explicitTitle: (raw.shortName || raw.title || (raw.name && raw.name !== fullCaption ? raw.name : undefined)),
      index: idx,
    });
    const name = shortName;

    const sourceGroupName = raw.sourceGroupName || underlyingMsg.sourceGroupName || "Media Group";
    const sourceGroupJid = raw.sourceGroupJid || raw.key?.remoteJid || raw.remoteJid || underlyingMsg.key?.remoteJid || underlyingMsg.remoteJid || undefined;

    // Extract file size and mime type if available
    const mediaObj = innerMsg?.imageMessage || innerMsg?.videoMessage || innerMsg?.documentMessage || innerMsg?.audioMessage || innerMsg?.stickerMessage;
    const rawLength = mediaObj?.fileLength || raw.fileSize || raw.fileLength;
    const fileSize = typeof rawLength === "number" ? rawLength : (typeof rawLength?.low === "number" ? rawLength.low : undefined);
    const mimeType = mediaObj?.mimetype || raw.mimeType || raw.mimetype || undefined;

    // Determine previewUrl: if selectedBotId is provided, construct secure authenticated route URL
    let previewUrl: string | undefined = undefined;
    if (selectedBotId && id) {
      const groupParam = sourceGroupJid ? `&groupJid=${encodeURIComponent(sourceGroupJid)}` : "";
      previewUrl = `/api/user/content-library/media/${encodeURIComponent(id)}?botId=${encodeURIComponent(selectedBotId)}${groupParam}`;
    } else {
      previewUrl = parsed.mediaUrl;
    }

    return {
      id,
      name,
      caption: fullCaption,
      shortName,
      type: parsed.type,
      previewUrl,
      sourceGroupName,
      sourceGroupJid,
      capturedAt,
      fileName: parsed.fileName,
      fileSize,
      mimeType,
      messageId: id,
      status: "ready" as const,
      raw,
    };
  });
}

export function buildSavedReplyItems(
  syncGroups: SyncGroup[] = [],
  templateDetails?: any
): SavedReplyItem[] {
  const items: SavedReplyItem[] = [];
  const processedIds = new Set<string>();

  syncGroups.forEach((g, idx) => {
    const shortcut = g.shortcut_code || g.shortcut;
    if (!shortcut) return;
    const purpose = normalizePurpose(g.purpose || g.type);
    if (purpose !== "sequence" && purpose !== "welcome") return;

    const isWelcome = purpose === "welcome";
    const name = g.name || (isWelcome ? "Welcome Sequence" : `Shortcut !${shortcut}`);
    const syncGroupId = g.id || g.jid || g.name || (isWelcome ? "welcome" : `seq_${idx}`);
    const id = `saved_reply_${purpose}_${syncGroupId}_${shortcut}`;

    if (processedIds.has(id)) return;
    processedIds.add(id);

    const seqData = isWelcome
      ? templateDetails?.welcome
      : templateDetails?.sequences?.[g.name || ""] || templateDetails?.sequences?.[g.jid || ""] || templateDetails?.sequences?.[g.id || ""];
    const rawTemplates = seqData?.templates || [];
    const firstParsed = rawTemplates[0] ? parseTemplateItem(rawTemplates[0], 0) : null;

    items.push({
      id,
      shortcut,
      title: name,
      type: firstParsed?.type || "text",
      content: firstParsed?.content || `${isWelcome ? "Welcome flow" : "Sequence"} shortcut !${shortcut} (${rawTemplates.length || g.templateCount || 0} messages in flow)`,
      flowInstructions: g.instructions || g.instruction || undefined,
      mediaUrl: firstParsed?.mediaUrl,
      status: "ready",
      syncGroupId,
      sourcePurpose: purpose,
      sourceGroupJid: g.jid || undefined,
      sourceGroupName: g.name || undefined,
    });
  });

  return items;
}

export function buildAddedSyncGroups(
  syncGroups: SyncGroup[] = [],
  groupData: {
    id?: string;
    name: string;
    groupJid?: string;
    jid?: string;
    instructions?: string;
    shortcutCode?: string;
    shortcut?: string;
    keywordTrigger?: string;
    trigger_keywords?: string[] | string;
    isEnabled?: boolean;
    enabled?: boolean;
    autoSync?: boolean;
    [key: string]: any;
  },
  targetPurpose: "media" | "sequence" | "welcome",
  groupLimit?: number
): SyncGroup[] {
  if (!groupData.name || !groupData.name.trim()) {
    throw new Error(`Group Name is required to add a ${targetPurpose} group.`);
  }

  const existingPurposeGroups = syncGroups.filter(
    (g) => normalizePurpose(g.purpose || g.type) === targetPurpose
  );

  if (targetPurpose === "welcome" && existingPurposeGroups.length >= 1) {
    throw new Error("Only one Welcome Sequence configuration is allowed per instance.");
  }

  if (typeof groupLimit === "number" && groupLimit > 0 && existingPurposeGroups.length >= groupLimit) {
    throw new Error(
      `Group limit reached (${groupLimit}). Upgrade your plan or purchase an add-on to link more ${targetPurpose} groups.`
    );
  }

  const jid = (groupData.groupJid || groupData.jid || "").trim();
  const name = groupData.name.trim();

  if (jid) {
    const duplicateJid = existingPurposeGroups.some(
      (g) => (g.jid || "").trim().toLowerCase() === jid.toLowerCase()
    );
    if (duplicateJid) {
      throw new Error(`A ${targetPurpose} group with JID "${jid}" is already linked.`);
    }
  }

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "grp";
  const prefix = targetPurpose === "media" ? "med" : targetPurpose === "welcome" ? "wel" : "seq";
  const generatedId = groupData.id || `${prefix}_${Date.now()}_${slug}`;

  const newGroup: SyncGroup = {
    id: generatedId,
    name,
    jid,
    purpose: targetPurpose,
    instructions: groupData.instructions !== undefined ? groupData.instructions : "",
    enabled: groupData.isEnabled !== undefined ? groupData.isEnabled : groupData.enabled !== false,
    autoSync: groupData.autoSync !== false,
  };

  if (targetPurpose === "welcome" || targetPurpose === "sequence") {
    const rawShortcut = groupData.shortcutCode !== undefined ? groupData.shortcutCode : groupData.shortcut;
    if (rawShortcut !== undefined && String(rawShortcut).trim()) {
      newGroup.shortcut_code = String(rawShortcut).trim().replace(/^!/, "");
    }
  }

  if (targetPurpose === "sequence") {
    const rawKeywords = groupData.keywordTrigger !== undefined ? groupData.keywordTrigger : groupData.trigger_keywords;
    if (rawKeywords !== undefined) {
      newGroup.trigger_keywords = rawKeywords;
    }
  }

  return [...syncGroups, newGroup];
}

export function buildEditedSyncGroups(
  syncGroups: SyncGroup[] = [],
  groupData: {
    id?: string;
    name?: string;
    groupJid?: string;
    jid?: string;
    instructions?: string;
    shortcutCode?: string;
    shortcut?: string;
    keywordTrigger?: string;
    trigger_keywords?: string[] | string;
    isEnabled?: boolean;
    enabled?: boolean;
    autoSync?: boolean;
    [key: string]: any;
  },
  targetPurpose: "media" | "sequence" | "welcome"
): SyncGroup[] {
  const targetId = String(groupData.id || groupData.groupJid || groupData.jid || "").trim();
  if (!targetId) {
    throw new Error(`Target ID is required for editing a ${targetPurpose} group.`);
  }

  const matchingIndexes: number[] = [];
  syncGroups.forEach((g, idx) => {
    if (isMatchingGroupIdentity(g, targetId, targetPurpose)) {
      matchingIndexes.push(idx);
    }
  });

  if (matchingIndexes.length === 0) {
    throw new Error(`No existing ${targetPurpose} group found matching ID "${targetId}".`);
  }

  if (matchingIndexes.length > 1) {
    throw new Error(`Ambiguous ${targetPurpose} group match for ID: ${targetId}`);
  }

  const targetIdx = matchingIndexes[0];

  return syncGroups.map((g, idx) => {
    if (idx === targetIdx) {
      const updated: SyncGroup = {
        ...g,
        purpose: targetPurpose,
      };

      if (groupData.name !== undefined && groupData.name.trim() !== "") {
        updated.name = groupData.name.trim();
      }
      const rawIncomingJid = groupData.groupJid !== undefined ? groupData.groupJid : groupData.jid !== undefined ? groupData.jid : undefined;
      if (rawIncomingJid !== undefined) {
        const trimmedJid = String(rawIncomingJid).trim();
        if (trimmedJid) {
          updated.jid = trimmedJid;
        } else if (groupData.unlinkGroup === true || groupData.clearJid === true) {
          updated.jid = "";
        } else if (g.jid) {
          // Preserve existing JID so transient discovery failure or blank UI field never accidentally wipes existing binding
          updated.jid = g.jid;
        }
      }
      if (groupData.instructions !== undefined) {
        updated.instructions = groupData.instructions;
      }
      if (groupData.shortcutCode !== undefined || groupData.shortcut !== undefined) {
        updated.shortcut_code = groupData.shortcutCode !== undefined ? groupData.shortcutCode : groupData.shortcut;
      }
      if (groupData.keywordTrigger !== undefined || groupData.trigger_keywords !== undefined) {
        updated.trigger_keywords = groupData.keywordTrigger !== undefined ? groupData.keywordTrigger : groupData.trigger_keywords;
      }
      if (groupData.isEnabled !== undefined || groupData.enabled !== undefined) {
        updated.enabled = groupData.isEnabled !== undefined ? groupData.isEnabled : groupData.enabled;
      }
      if (groupData.autoSync !== undefined) {
        updated.autoSync = groupData.autoSync;
      }

      return updated;
    }
    return g;
  });
}

export function buildToggledSyncGroups(
  syncGroups: SyncGroup[] = [],
  groupId: string,
  enabled: boolean,
  targetPurpose: "media" | "sequence" | "welcome"
): SyncGroup[] {
  const targetId = String(groupId || "").trim();
  if (!targetId) {
    throw new Error(`Group ID is required for toggling a ${targetPurpose} group.`);
  }

  const matchingIndexes: number[] = [];
  syncGroups.forEach((g, idx) => {
    if (isMatchingGroupIdentity(g, targetId, targetPurpose)) {
      matchingIndexes.push(idx);
    }
  });

  if (matchingIndexes.length === 0) {
    throw new Error(`No existing ${targetPurpose} group found matching ID "${targetId}".`);
  }

  if (matchingIndexes.length > 1) {
    throw new Error(`Ambiguous ${targetPurpose} group match for ID: ${targetId}`);
  }

  const targetIdx = matchingIndexes[0];

  return syncGroups.map((g, idx) => {
    if (idx === targetIdx) {
      return { ...g, enabled };
    }
    return g;
  });
}

export function buildUnlinkedSyncGroups(
  syncGroups: SyncGroup[] = [],
  groupId: string,
  targetPurpose: "media" | "sequence" | "welcome"
): SyncGroup[] {
  const targetId = String(groupId || "").trim();
  if (!targetId) {
    throw new Error(`Group ID is required for unlinking a ${targetPurpose} group.`);
  }

  const matchingIndexes: number[] = [];
  syncGroups.forEach((g, idx) => {
    if (isMatchingGroupIdentity(g, targetId, targetPurpose)) {
      matchingIndexes.push(idx);
    }
  });

  if (matchingIndexes.length === 0) {
    throw new Error(`No existing ${targetPurpose} group found matching ID "${targetId}".`);
  }

  if (matchingIndexes.length > 1) {
    throw new Error(`Ambiguous ${targetPurpose} group match for ID: ${targetId}`);
  }

  const targetIdx = matchingIndexes[0];

  return syncGroups.filter((_, idx) => idx !== targetIdx);
}

export function buildSavedReplyEditedSyncGroups(
  syncGroups: SyncGroup[] = [],
  data: {
    syncGroupId?: string;
    id?: string;
    sourcePurpose?: string;
    shortcutCode: string;
    title?: string;
    instructions?: string;
  }
): SyncGroup[] {
  const targetId = String(data.syncGroupId || data.id || "").trim();
  const newShortcut = (data.shortcutCode || "").trim().replace(/^!/, "").toLowerCase();
  if (!newShortcut) {
    throw new Error("Shortcut code is required.");
  }

  const duplicate = syncGroups.find((g) => {
    const p = normalizePurpose(g.purpose || g.type);
    if (p !== "sequence" && p !== "welcome") return false;
    const gId = String(g.id || g.jid || g.name || "").trim();
    if (targetId && gId === targetId) return false;
    const existingCode = String(g.shortcut_code || g.shortcut || "").trim().replace(/^!/, "").toLowerCase();
    return existingCode === newShortcut;
  });

  if (duplicate) {
    throw new Error(`Shortcut code "!${newShortcut}" is already in use by another flow.`);
  }

  if (!targetId) {
    throw new Error("Cannot edit shortcut without an underlying flow.");
  }

  const matchingIndexes: number[] = [];
  syncGroups.forEach((g, idx) => {
    const p = normalizePurpose(g.purpose || g.type);
    if (p !== "sequence" && p !== "welcome") return;
    if (isMatchingGroupIdentity(g, targetId, p)) {
      matchingIndexes.push(idx);
    }
  });

  if (matchingIndexes.length === 0) {
    throw new Error(`Underlying flow not found for ID "${targetId}".`);
  }
  if (matchingIndexes.length > 1) {
    throw new Error(`Ambiguous flow match for ID "${targetId}".`);
  }

  const targetIdx = matchingIndexes[0];

  return syncGroups.map((g, idx) => {
    if (idx === targetIdx) {
      return {
        ...g,
        shortcut_code: newShortcut,
        name: data.title?.trim() || g.name,
        instructions: data.instructions !== undefined ? data.instructions : g.instructions,
      };
    }
    return g;
  });
}

export function buildSavedReplyClearedSyncGroups(
  syncGroups: SyncGroup[] = [],
  target: string | {
    syncGroupId?: string;
    id?: string;
    sourcePurpose?: string;
    shortcutCode?: string;
  }
): SyncGroup[] {
  const targetId = String(typeof target === "string" ? target : target?.syncGroupId || target?.id || "").trim();
  if (!targetId) {
    throw new Error("Cannot clear shortcut without an underlying flow.");
  }

  const matchingIndexes: number[] = [];
  syncGroups.forEach((g, idx) => {
    const p = normalizePurpose(g.purpose || g.type);
    if (p !== "sequence" && p !== "welcome") return;
    if (isMatchingGroupIdentity(g, targetId, p)) {
      matchingIndexes.push(idx);
    }
  });

  if (matchingIndexes.length === 0) {
    throw new Error(`Underlying flow not found for ID "${targetId}".`);
  }
  if (matchingIndexes.length > 1) {
    throw new Error(`Ambiguous flow match for ID "${targetId}".`);
  }

  const targetIdx = matchingIndexes[0];

  return syncGroups.map((g, idx) => {
    if (idx === targetIdx) {
      const copy = { ...g };
      delete copy.shortcut_code;
      delete copy.shortcut;
      return copy;
    }
    return g;
  });
}
