import * as dbService from './db-service.ts';
import { resolveAccountDataOwnerKey } from './account-data-owner.ts';
import { Server } from "socket.io";
import { findMatchingSequence, getSequenceDisplayName, getSequenceFlag, getSequenceShortcut, normalizeSequenceText } from './sequence-trigger-service.ts';
import { shouldSendWelcomeSequenceNow } from './welcome-sequence-guard.ts';
import { getSequenceStatusBlockReason } from './sequence-delivery-guard-service.ts';
import { canSendBillableAutomation } from './automation-send-billing-service.ts';
import { isSequenceItemDelivered, summarizeSequenceItemResults } from './sequence-delivery-result-service.ts';
import { buildSequenceProgressClearPatch, buildSequenceProgressPatch, getPendingSequenceItemIndexes, getSequenceProgressKey } from './sequence-progress-service.ts';
import { deliverWelcomeSequence, queuePendingResponseOnce } from './welcome-sequence-delivery-service.ts';
import { deliverSequenceGroup } from './sequence-delivery-service.ts';

export { queuePendingResponseOnce };

export function cancelPendingWelcomeJobs(pendingResponses: any[]): number {
    if (!Array.isArray(pendingResponses)) return 0;
    const initialLen = pendingResponses.length;
    let i = pendingResponses.length;
    while (i--) {
        const item = pendingResponses[i];
        if (item && item.type === "welcome") {
            pendingResponses.splice(i, 1);
        }
    }
    return initialLen - pendingResponses.length;
}

function logSequence(io: Server, msg: string, type: "info" | "warning" | "success" | "error" = "info") {
    io.emit("system-log", { type, msg });
}

export async function processShortcut(sock: any, sender: string, senderName: string, msg: any, text: string, cachedKeywordSequences: Record<string, any>, simulateTyping: (jid: string, config?: any) => Promise<void>, forwardTemplate: (jid: string, template: any, isMedia?: boolean, options?: any) => Promise<any>, pendingResponses: any[], currentlyReplying: Set<string>, io: Server, cachedWelcomeSequence?: { templates: any[]; config?: any; groupResetAt?: number; generationId?: string }, onSequenceFinished?: (jid: string, reason: string) => void) {
    logSequence(io, `sequence_check_started type=shortcut customer=${sender.split("@")[0]}`);
    const extractText = (m: any) => {
        if (!m) return "";
        const base = m.ephemeralMessage?.message || m.viewOnceMessage?.message || m.viewOnceMessageV2?.message || m.documentWithCaptionMessage?.message || m;
        return base.conversation || base.extendedTextMessage?.text || base.buttonsResponseMessage?.selectedButtonId || base.imageMessage?.caption || base.videoMessage?.caption || base.documentMessage?.caption || "";
    };
    const cleanedText = String(text || "").trim().toLowerCase();
    const originalText = extractText(msg.message);
    const originalCleaned = originalText.trim().toLowerCase();
    const isAdmin = msg.key.fromMe;
    const welcomeEnabled = cachedWelcomeSequence?.config?.enabled !== false;
    const welcomeShortcut = welcomeEnabled ? getSequenceShortcut(cachedWelcomeSequence?.config) : "";
    const normText = normalizeSequenceText(text);
    const normOriginal = normalizeSequenceText(originalText);
    const normWelcome = normalizeSequenceText(welcomeShortcut);
    const matchedWelcome = welcomeShortcut && (
        cleanedText === welcomeShortcut.toLowerCase() ||
        originalCleaned === welcomeShortcut.toLowerCase() ||
        (normWelcome && (normText === normWelcome || normOriginal === normWelcome))
    ) ? cachedWelcomeSequence : null;

    if (matchedWelcome) {
        if (matchedWelcome?.config?.enabled === false) {
            logSequence(io, `welcome_sequence_skipped_reason source=shortcut reason=disabled customer=${sender.split("@")[0]}`, "warning");
            return false;
        }
        if (!matchedWelcome.templates || matchedWelcome.templates.length === 0) {
            logSequence(io, `welcome_sequence_skipped_reason source=shortcut reason=templates_not_loaded customer=${sender.split("@")[0]}`, "warning");
            return false;
        }
        const welcomeName = matchedWelcome.config?.name || "Welcome";
        logSequence(io, `${isAdmin ? "Admin Trigger" : "Keyword Match"}: "${cleanedText}". Triggering ${welcomeName} for ${senderName}...`);
        await deliverWelcomeSequence({
            sock,
            customerJid: sender,
            customerDisplayName: senderName,
            templates: matchedWelcome.templates,
            config: matchedWelcome.config ? {
                jid: (matchedWelcome as any).jid,
                groupJid: (matchedWelcome as any).jid,
                name: (matchedWelcome as any).name,
                ...matchedWelcome.config,
            } : matchedWelcome.config,
            groupResetAt: matchedWelcome.groupResetAt ?? matchedWelcome.config?.groupResetAt,
            generationId: matchedWelcome.generationId ?? matchedWelcome.config?.generationId,
            historyArray: [msg],
            source: "welcome_shortcut",
            forwardTemplate,
            simulateTyping,
            pendingResponses,
            currentlyReplying,
            io,
            onSequenceFinished,
            isAdmin,
        }).catch((err) => {
            console.error(`[Sequence] Welcome shortcut delivery error for ${sender}:`, err);
        });
        return true;
    }

    const sequenceMatch = findMatchingSequence(cachedKeywordSequences, [text, originalText], isAdmin);
    const matchedSequence = sequenceMatch?.sequence;
    if (!matchedSequence) return false;
    const seqOriginalName = sequenceMatch?.key || "sequence";
    const seqDisplayName = getSequenceDisplayName(seqOriginalName, matchedSequence);

    logSequence(io, `keyword_sequence_matched customer=${sender.split("@")[0]} name=${seqDisplayName} matchedBy=${sequenceMatch.matchedBy}`);

    if (matchedSequence.templates && matchedSequence.templates.length > 0) {
        const result = await deliverSequenceGroup({
            sock,
            customerJid: sender,
            customerDisplayName: senderName,
            sequence: matchedSequence,
            fallbackKey: seqOriginalName,
            source: sequenceMatch.matchedBy,
            forwardTemplate,
            simulateTyping,
            pendingResponses,
            currentlyReplying,
            io,
            onSequenceFinished,
            isAdmin,
        }).catch((err) => {
            console.error(`[Sequence] Delivery error for ${sender}:`, err);
            return { success: false, reason: "delivery_error", deliveredCount: 0, totalCount: 0, completed: false, alreadySent: false };
        });

        if (result && result.alreadySent) {
            logSequence(io, `sequence_skipped_reason source=${sequenceMatch.matchedBy} reason=already_sent customer=${sender.split("@")[0]}`, "warning");
            return true;
        }

        if (result && result.success && !result.alreadySent) {
            logSequence(io, `welcome_sequence_sent source=keyword customer=${sender.split("@")[0]} items=${result.deliveredCount}/${result.totalCount}`, "success");
        }

        return true;
    } else {
        logSequence(io, `sequence_skipped_reason source=${sequenceMatch.matchedBy} reason=templates_not_loaded customer=${sender.split("@")[0]}`, "warning");
        return false;
    }
}

export async function processAutomaticWelcomeSequence(sock: any, sender: string, senderName: string, msg: any, cachedWelcomeSequence: { templates: any[]; config?: any; groupResetAt?: number; generationId?: string } | undefined, historyArray: any[], simulateTyping: (jid: string, config?: any) => Promise<void>, forwardTemplate: (jid: string, template: any, isMedia?: boolean, options?: any) => Promise<any>, pendingResponses: any[], currentlyReplying: Set<string>, io: Server, onSequenceFinished?: (jid: string, reason: string) => void) {
    if (msg?.key?.fromMe) return false;
    logSequence(io, `sequence_check_started type=welcome customer=${sender.split("@")[0]}`);
    if (!cachedWelcomeSequence?.templates?.length) {
        logSequence(io, `welcome_sequence_skipped_reason source=automatic reason=templates_not_loaded customer=${sender.split("@")[0]}`, "warning");
        // status: "skipped", reason: "templates_not_loaded"
    }
    const result = await deliverWelcomeSequence({
        sock,
        customerJid: sender,
        customerDisplayName: senderName,
        templates: cachedWelcomeSequence?.templates,
        config: cachedWelcomeSequence?.config,
        groupResetAt: cachedWelcomeSequence?.groupResetAt ?? cachedWelcomeSequence?.config?.groupResetAt,
        generationId: cachedWelcomeSequence?.generationId ?? cachedWelcomeSequence?.config?.generationId,
        historyArray,
        source: "automatic_welcome",
        forwardTemplate,
        simulateTyping,
        pendingResponses,
        currentlyReplying,
        io,
        onSequenceFinished,
        isAdmin: false,
    });
    if (result.success) {
        logSequence(io, `welcome_sequence_matched source=automatic customer=${sender.split("@")[0]}`);
        logSequence(io, `welcome_sequence_sent source=automatic customer=${sender.split("@")[0]} items=${result.deliveredCount}/${result.totalCount}`, "success");
        return true;
    }
    if (result.skippedDueToClaim || result.pending) {
        return true;
    }
    logSequence(io, `welcome_sequence_skipped_reason source=automatic reason=${result.reason || "skipped"} customer=${sender.split("@")[0]}`, "warning");
    return false;
}
