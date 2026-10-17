import { isSequenceItemDelivered } from "./sequence-delivery-result-service.ts";

function clean(value: any) {
  return String(value || "").trim();
}

function safeKey(value: any) {
  return clean(value).replace(/[^\p{L}\p{N}_:-]+/gu, "_").slice(0, 120) || "sequence";
}

function uniqueNumbers(values: any[] = []) {
  return Array.from(new Set(values.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value >= 0))).sort((a, b) => a - b);
}

export function getSequenceProgressKey(type: "welcome" | "sequence" | string, nameOrFlag = "") {
  return type === "welcome" ? "welcome" : safeKey(nameOrFlag || "sequence");
}

export function getTemplateStableId(template: any, fallbackIndex?: number): string {
  if (!template) return fallbackIndex !== undefined ? `item_${fallbackIndex}` : "";
  const directId = template.key?.id || template.id || template.messageId;
  if (directId) return String(directId).trim();
  const text = template.message?.conversation ||
               template.message?.extendedTextMessage?.text ||
               template.text || "";
  if (text) {
    return `txt_${String(text).slice(0, 32)}`;
  }
  return fallbackIndex !== undefined ? `idx_${fallbackIndex}` : "";
}

export function isSequenceGenerationMismatch(profile: any, progressKey: string, generationId?: string): boolean {
  const progress = profile?.sequenceDeliveryProgress?.[progressKey];
  if (!progress || !progress.generationId || !generationId) return false;
  return progress.generationId !== generationId;
}

export function getPendingSequenceItemIndexes(
  profile: any = {},
  progressKey: string,
  total: number,
  templates?: any[],
  generationId?: string
) {
  const totalCount = Math.max(0, Number(total || 0));
  const allIndexes = Array.from({ length: totalCount }, (_, index) => index);
  const progress = profile?.sequenceDeliveryProgress?.[progressKey];
  if (!progress) return allIndexes;

  // Generation check: if progress was recorded for a different generation,
  // return empty pending indexes (caller handles generation reset)
  if (progress.generationId && generationId && progress.generationId !== generationId) {
    return [];
  }

  // If templates and deliveredItemIds are available, use stable item IDs as authoritative
  if (Array.isArray(templates) && Array.isArray(progress.deliveredItemIds) && progress.deliveredItemIds.length > 0) {
    const deliveredSet = new Set(progress.deliveredItemIds.map(String));
    const pending: number[] = [];
    for (let i = 0; i < templates.length; i++) {
      const stableId = getTemplateStableId(templates[i], i);
      if (!deliveredSet.has(stableId)) {
        pending.push(i);
      }
    }
    return pending;
  }

  // Fallback to legacy index-based pendingIndexes
  if (Array.isArray(progress.pendingIndexes)) {
    const pending = uniqueNumbers(progress.pendingIndexes).filter((index) => index < totalCount);
    return pending.length ? pending : allIndexes;
  }

  return allIndexes;
}

export function buildSequenceProgressPatch(input: {
  profile?: any;
  progressKey: string;
  results?: any[];
  total: number;
  templates?: any[];
  generationId?: string;
  groupIdentity?: string;
  source?: string;
  reason?: string;
}) {
  const total = Math.max(0, Number(input.total || 0));
  const previous = input.profile?.sequenceDeliveryProgress?.[input.progressKey] || {};
  const previousDelivered = uniqueNumbers(previous.deliveredIndexes).filter((index) => index < total);
  const delivered = new Set(previousDelivered);
  const attempted = new Set<number>();

  const previousDeliveredItemIds = Array.isArray(previous.deliveredItemIds)
    ? previous.deliveredItemIds.map(String)
    : [];
  const deliveredItemIdsSet = new Set<string>(previousDeliveredItemIds);

  for (const [fallbackIndex, result] of (input.results || []).entries()) {
    const index = Number.isInteger(Number(result?.sequenceIndex)) ? Number(result.sequenceIndex) : fallbackIndex;
    if (index >= 0 && index < total) attempted.add(index);
    const template = input.templates?.[index];
    const itemId = String(result?.itemId || getTemplateStableId(template, index));

    if (isSequenceItemDelivered(result)) {
      if (index >= 0 && index < total) delivered.add(index);
      if (itemId) deliveredItemIdsSet.add(itemId);
    }
  }

  const deliveredIndexes = uniqueNumbers(Array.from(delivered));
  const pendingIndexes = Array.from({ length: total }, (_, index) => index).filter((index) => !delivered.has(index));
  const deliveredItemIds = Array.from(deliveredItemIdsSet);
  const pendingItemIds: string[] = [];

  if (Array.isArray(input.templates)) {
    for (let i = 0; i < input.templates.length; i++) {
      const stableId = getTemplateStableId(input.templates[i], i);
      if (!deliveredItemIdsSet.has(stableId)) {
        pendingItemIds.push(stableId);
      }
    }
  }

  const progress = {
    total,
    deliveredIndexes,
    pendingIndexes,
    deliveredItemIds,
    pendingItemIds,
    attemptedIndexes: uniqueNumbers(Array.from(attempted)),
    generationId: clean(input.generationId || previous.generationId),
    groupIdentity: clean(input.groupIdentity || previous.groupIdentity),
    sent: deliveredItemIds.length || deliveredIndexes.length,
    reason: clean(input.reason),
    source: clean(input.source),
    updatedAt: Math.floor(Date.now() / 1000),
  };

  return {
    sequenceDeliveryProgress: {
      ...(input.profile?.sequenceDeliveryProgress || {}),
      [input.progressKey]: progress,
    },
    lastSequenceProgressKey: input.progressKey,
    lastSequenceProgressReason: progress.reason,
  };
}

export function buildSequenceProgressClearPatch(profile: any = {}, progressKey: string) {
  const next = { ...(profile?.sequenceDeliveryProgress || {}) };
  delete next[progressKey];
  return {
    sequenceDeliveryProgress: next,
    lastSequenceProgressKey: "",
    lastSequenceProgressReason: "",
  };
}
