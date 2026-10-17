import { getSequenceIntentKeywords } from "./sequence-intent-keyword-service.ts";

export function normalizeSequenceText(value: any) {
    return String(value || "")
        .toLowerCase()
        .replace(/[\u200B-\u200D\uFEFF]/g, " ")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
}

export function getSequenceTriggers(config: any) {
    return getSequenceIntentKeywords(config);
}

export function getSequenceShortcut(config: any) {
    return String(config?.shortcut_code || config?.shortcut || config?.shortcode || "").trim();
}

export function messageMatchesTrigger(text: any, trigger: any) {
    const normalizedText = normalizeSequenceText(text);
    const normalizedTrigger = normalizeSequenceText(trigger);
    if (!normalizedText || !normalizedTrigger) return false;
    if (normalizedText === normalizedTrigger) return true;
    return ` ${normalizedText} `.includes(` ${normalizedTrigger} `);
}

export function getSequenceStableId(seqData?: any, fallbackName?: any): string {
    const config = seqData?.config || seqData;
    const explicitId = String(config?.id || seqData?.id || "").trim();
    if (explicitId) return explicitId;
    const jid = String(config?.jid || config?.groupJid || seqData?.jid || "").trim();
    if (jid) return jid;
    const resolvedFallback = typeof fallbackName === "string" ? fallbackName : "";
    const name = String(config?.name || seqData?.name || resolvedFallback || "").trim();
    return name || "sequence";
}

export function getSequenceDisplayName(fallbackName?: any, seqData?: any) {
    const resolvedFallback = typeof fallbackName === "string" ? fallbackName : "sequence";
    return String(seqData?.config?.name || seqData?.name || resolvedFallback || "sequence");
}

export function getSequenceFlag(fallbackName?: any, seqData?: any) {
    const resolvedFallback = typeof fallbackName === "string" ? fallbackName : undefined;
    const stableId = getSequenceStableId(seqData, resolvedFallback);
    const snake = stableId.replace(/[^a-zA-Z0-9]+/g, "_").toLowerCase().replace(/^_+|_+$/g, "");
    return `seq_sent_${snake || "sequence"}`;
}

export function getSequenceSentFlagKeys(seqData?: any, fallbackName?: any): string[] {
    const keys = new Set<string>();
    const resolvedFallback = typeof fallbackName === "string" ? fallbackName : "";
    const stableId = getSequenceStableId(seqData, resolvedFallback);
    const stableSnake = stableId.replace(/[^a-zA-Z0-9]+/g, "_").toLowerCase().replace(/^_+|_+$/g, "");
    if (stableSnake) {
        keys.add(`seq_sent_${stableSnake}`);
        keys.add(`seq_sent_id_${stableSnake}`);
    }

    const config = seqData?.config || seqData;
    const explicitId = String(config?.id || seqData?.id || "").trim();
    if (explicitId) {
        const idSnake = explicitId.replace(/[^a-zA-Z0-9]+/g, "_").toLowerCase().replace(/^_+|_+$/g, "");
        keys.add(`seq_sent_${idSnake}`);
        keys.add(`seq_sent_id_${idSnake}`);
    }

    const jid = String(config?.jid || config?.groupJid || seqData?.jid || "").trim();
    if (jid) {
        const jidSnake = jid.replace(/[^a-zA-Z0-9]+/g, "_").toLowerCase().replace(/^_+|_+$/g, "");
        keys.add(`seq_sent_${jidSnake}`);
        keys.add(`seq_sent_jid_${jidSnake}`);
    }

    if (resolvedFallback) {
        const fallbackSnake = resolvedFallback.replace(/[^a-zA-Z0-9]+/g, "_").toLowerCase().replace(/^_+|_+$/g, "");
        if (fallbackSnake) {
            keys.add(`seq_sent_${fallbackSnake}`);
        }
    }

    const name = getSequenceDisplayName(resolvedFallback, seqData);
    if (name) {
        const nameSnake = name.replace(/[^a-zA-Z0-9]+/g, "_").toLowerCase().replace(/^_+|_+$/g, "");
        if (nameSnake) {
            keys.add(`seq_sent_${nameSnake}`);
        }
    }

    return Array.from(keys).filter(Boolean);
}

export interface SequenceMatchCandidate {
    key: string;
    sequence: any;
    matchedBy: "shortcut" | "keyword";
}

export function findAllMatchingSequences(
    cachedKeywordSequences: Record<string, any> = {},
    textCandidates: any = [],
    isAdmin = false
): {
    matches: SequenceMatchCandidate[];
    conflict?: boolean;
    duplicateShortcodeConflict?: boolean;
    conflictReason?: string;
    ambiguous?: boolean;
    ambiguousKeywordMatch?: boolean;
} {
    const list = Array.isArray(textCandidates)
        ? textCandidates
        : (textCandidates != null ? [textCandidates] : []);
    const candidates = list.map(normalizeSequenceText).filter(Boolean);
    if (candidates.length === 0) {
        return { matches: [] };
    }

    // 1. Exact shortcode matching
    const shortcutMatches: SequenceMatchCandidate[] = [];
    for (const [key, sequence] of Object.entries(cachedKeywordSequences || {})) {
        if (sequence?.config?.enabled === false) continue;
        const shortcut = normalizeSequenceText(getSequenceShortcut(sequence?.config));
        if (shortcut && candidates.some(c => c === shortcut)) {
            shortcutMatches.push({ key, sequence, matchedBy: "shortcut" });
        }
    }

    if (shortcutMatches.length > 1) {
        console.warn(`[SequenceTrigger] Configuration conflict: multiple enabled sequences share shortcut code. Neither will be auto-triggered.`);
        return {
            matches: [],
            conflict: true,
            duplicateShortcodeConflict: true,
            conflictReason: "duplicate_shortcut_conflict",
        };
    }

    if (shortcutMatches.length === 1) {
        return { matches: shortcutMatches };
    }

    // 2. Configured keywords matching
    const keywordMatches: SequenceMatchCandidate[] = [];
    for (const [key, sequence] of Object.entries(cachedKeywordSequences || {})) {
        if (sequence?.config?.enabled === false) continue;
        const triggers = getSequenceTriggers(sequence?.config);
        const hasMatch = triggers.some(trigger =>
            list.some((text: any) => messageMatchesTrigger(text, trigger))
        );
        if (hasMatch) {
            keywordMatches.push({ key, sequence, matchedBy: "keyword" });
        }
    }

    if (keywordMatches.length > 1) {
        console.log(`[SequenceTrigger] Ambiguous keyword match: ${keywordMatches.length} sequences matched. Delegating to AI semantic reasoning.`);
        return {
            matches: keywordMatches,
            ambiguous: true,
            ambiguousKeywordMatch: true,
        };
    }

    return { matches: keywordMatches };
}

export function findMatchingSequence(
    cachedKeywordSequences: Record<string, any> = {},
    textCandidates: string | string[] | any = [],
    isAdmin = false
): SequenceMatchCandidate | null {
    const result = findAllMatchingSequences(cachedKeywordSequences, textCandidates, isAdmin);
    if (result.conflict || result.ambiguous) {
        return null;
    }
    return result.matches[0] || null;
}

export function resolveSequenceForAiChoice(
    cachedKeywordSequences: Record<string, any> = {},
    rawChoice: string
): { key: string; sequence: any } | null {
    const query = String(rawChoice || "").trim();
    if (!query) return null;
    const normalizedQuery = normalizeSequenceText(query);
    if (!normalizedQuery) return null;

    // 1. Resolve exact ID first (config.id, sequence.id, jid, or stableId)
    for (const [key, sequence] of Object.entries(cachedKeywordSequences)) {
        if (sequence?.config?.enabled === false) continue;
        const stableId = getSequenceStableId(sequence, key);
        const explicitId = String(sequence?.id || sequence?.config?.id || "").trim();
        const jid = String(sequence?.jid || sequence?.config?.jid || "").trim();
        if (
            (stableId && stableId.toLowerCase() === query.toLowerCase()) ||
            (explicitId && explicitId.toLowerCase() === query.toLowerCase()) ||
            (jid && jid.toLowerCase() === query.toLowerCase()) ||
            key.toLowerCase() === query.toLowerCase()
        ) {
            return { key, sequence };
        }
    }

    // 2. Exact shortcut fallback
    for (const [key, sequence] of Object.entries(cachedKeywordSequences)) {
        if (sequence?.config?.enabled === false) continue;
        const shortcut = getSequenceShortcut(sequence?.config);
        if (shortcut && normalizeSequenceText(shortcut) === normalizedQuery) {
            return { key, sequence };
        }
    }

    // 3. Exact display name fallback
    for (const [key, sequence] of Object.entries(cachedKeywordSequences)) {
        if (sequence?.config?.enabled === false) continue;
        const displayName = getSequenceDisplayName(key, sequence);
        if (displayName && normalizeSequenceText(displayName) === normalizedQuery) {
            return { key, sequence };
        }
    }

    return null;
}
