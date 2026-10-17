export type SequenceGroupPurpose = "sequence" | "welcome" | "media" | "other";

export interface SequenceGroupMutationInput {
  name: string;
  groupJid?: string;
  instructions?: string;
  shortcutCode?: string;
  keywordTrigger?: string;
  isEnabled?: boolean;
}

export function normalizeSequenceGroupPurpose(group: any): SequenceGroupPurpose {
  const value = String(group?.purpose || group?.type || "").trim().toLowerCase();
  if (value === "sequence") return "sequence";
  if (value === "welcome") return "welcome";
  if (value === "media") return "media";
  return "other";
}

export function isSequenceSyncGroup(group: any): boolean {
  return normalizeSequenceGroupPurpose(group) === "sequence";
}

export function getSequenceGroupStableId(group: any): string {
  if (!group) return "";
  return String(group.id || group.jid || group.name || "").trim();
}

export function findSequenceGroupIndex(groups: any[] = [], id: string): number {
  const targetId = String(id || "").trim();
  if (!targetId) {
    throw new Error("Sequence group ID is required.");
  }

  const matchingIndexes: number[] = [];
  groups.forEach((g, idx) => {
    if (!isSequenceSyncGroup(g)) return;
    const stableId = getSequenceGroupStableId(g);
    if (stableId === targetId || String(g.id || "").trim() === targetId || String(g.jid || "").trim() === targetId || String(g.name || "").trim() === targetId) {
      matchingIndexes.push(idx);
    }
  });

  if (matchingIndexes.length === 0) {
    throw new Error(`Sequence group not found for ID: ${id}`);
  }

  if (matchingIndexes.length > 1) {
    throw new Error(`Ambiguous sequence group match for ID: ${id}`);
  }

  return matchingIndexes[0];
}

export function assertUniqueSequenceGroupName(groups: any[] = [], name: string, excludeId?: string): void {
  const targetName = String(name || "").trim().toLowerCase();
  if (!targetName) return;

  const excludeTargetId = String(excludeId || "").trim();

  const duplicate = groups.find((g) => {
    if (!isSequenceSyncGroup(g)) return false;
    const stableId = getSequenceGroupStableId(g);
    if (excludeTargetId && (stableId === excludeTargetId || String(g.id || "").trim() === excludeTargetId || String(g.jid || "").trim() === excludeTargetId || String(g.name || "").trim() === excludeTargetId)) {
      return false;
    }
    const groupName = String(g.name || "").trim().toLowerCase();
    return groupName === targetName;
  });

  if (duplicate) {
    throw new Error(`A sequence group named "${name.trim()}" already exists.`);
  }
}

export function normalizeShortcutCode(value: any): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function assertUniqueSequenceShortcut(groups: any[] = [], shortcutCode?: string, excludeId?: string): void {
  const targetNormalized = normalizeShortcutCode(shortcutCode);
  if (!targetNormalized) return;

  const excludeTargetId = String(excludeId || "").trim();

  const duplicate = groups.find((g) => {
    if (!isSequenceSyncGroup(g)) return false;
    const stableId = getSequenceGroupStableId(g);
    if (excludeTargetId && (stableId === excludeTargetId || String(g.id || "").trim() === excludeTargetId || String(g.jid || "").trim() === excludeTargetId || String(g.name || "").trim() === excludeTargetId)) {
      return false;
    }
    const groupShortcut = normalizeShortcutCode(g.shortcut_code || g.shortcutCode);
    return groupShortcut === targetNormalized;
  });

  if (duplicate) {
    throw new Error(`A sequence group with shortcut code "${shortcutCode?.trim()}" already exists.`);
  }
}

export function assertSequenceCapacity(groups: any[] = [], sequenceGroupLimit?: number): void {
  if (typeof sequenceGroupLimit !== "number" || sequenceGroupLimit <= 0) return;
  const currentCount = groups.filter(isSequenceSyncGroup).length;
  if (currentCount >= sequenceGroupLimit) {
    throw new Error(`Sequence group capacity limit reached (${currentCount}/${sequenceGroupLimit}). Upgrade plan or buy add-ons to configure more.`);
  }
}

export function buildAddedSequenceGroups(
  groups: any[] = [],
  input: SequenceGroupMutationInput,
  sequenceGroupLimit?: number
): any[] {
  assertSequenceCapacity(groups, sequenceGroupLimit);
  assertUniqueSequenceGroupName(groups, input.name);
  assertUniqueSequenceShortcut(groups, input.shortcutCode);

  const newGroup = {
    name: input.name.trim(),
    jid: input.groupJid?.trim() || "",
    purpose: "sequence",
    instructions: input.instructions ? input.instructions.trim() : undefined,
    shortcut_code: input.shortcutCode ? input.shortcutCode.trim() : undefined,
    trigger_keywords: input.keywordTrigger ? input.keywordTrigger.trim() : undefined,
    enabled: input.isEnabled !== false,
  };

  return [...groups, newGroup];
}

export function buildEditedSequenceGroups(
  groups: any[] = [],
  id: string,
  input: SequenceGroupMutationInput
): any[] {
  const targetIdx = findSequenceGroupIndex(groups, id);
  assertUniqueSequenceGroupName(groups, input.name, id);
  assertUniqueSequenceShortcut(groups, input.shortcutCode, id);

  return groups.map((g, idx) => {
    if (idx === targetIdx) {
      return {
        ...g,
        name: input.name.trim(),
        jid: input.groupJid ? input.groupJid.trim() : g.jid,
        purpose: "sequence",
        instructions: input.instructions !== undefined ? (input.instructions ? input.instructions.trim() : undefined) : g.instructions,
        shortcut_code: input.shortcutCode ? input.shortcutCode.trim() : undefined,
        trigger_keywords: input.keywordTrigger ? input.keywordTrigger.trim() : undefined,
        enabled: input.isEnabled !== false,
      };
    }
    return g;
  });
}

export function buildToggledSequenceGroups(
  groups: any[] = [],
  id: string,
  enabled: boolean
): any[] {
  const targetIdx = findSequenceGroupIndex(groups, id);

  return groups.map((g, idx) => {
    if (idx === targetIdx) {
      return {
        ...g,
        enabled: Boolean(enabled),
      };
    }
    return g;
  });
}

export function buildUnlinkedSequenceGroups(
  groups: any[] = [],
  id: string
): any[] {
  const targetIdx = findSequenceGroupIndex(groups, id);
  return groups.filter((_, idx) => idx !== targetIdx);
}
