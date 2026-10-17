import * as dbService from "./db-service.ts";
import { shouldSendWelcomeSequenceNow } from "./welcome-sequence-guard.ts";
import { getSequenceStatusBlockReason } from "./sequence-delivery-guard-service.ts";
import { canSendBillableAutomation } from "./automation-send-billing-service.ts";
import { isSequenceItemDelivered, normalizeSequenceItemResult, summarizeSequenceItemResults } from "./sequence-delivery-result-service.ts";
import {
  buildSequenceProgressClearPatch,
  buildSequenceProgressPatch,
  getPendingSequenceItemIndexes,
  getSequenceProgressKey,
  getTemplateStableId,
  isSequenceGenerationMismatch,
} from "./sequence-progress-service.ts";
import { acquireAtomicClaim, finalizeAtomicClaim, releaseAtomicClaim, renewAtomicClaim } from "./canonical-claim-service.ts";
import { findOutboundReceiptByIdempotencyKey } from "./outbound-send-receipt-service.ts";
import { describeTemplateForHistory } from "./sequence-delivery-log-service.ts";
import { waitRandomSequenceDelay } from "./sequence-delay-service.ts";
import { resolveAccountDataOwnerKey } from "./account-data-owner.ts";
import { sendUniversalAutomationRelay } from "./universal-automation-relay-service.ts";

export interface CanonicalRuntimeWelcomePayload {
  config: any;
  templates: any[];
  groupJid: string;
  groupResetAt: number;
  generationId: string;
}

export function resolveRuntimeWelcomePayload(
  botConfig: any,
  cachedWelcomeTemplates: any[] = []
): CanonicalRuntimeWelcomePayload | null {
  const welcomeGroup = (botConfig?.groups || []).find((g: any) => g?.purpose === "welcome");
  if (!welcomeGroup) return null;
  const groupJid = String(welcomeGroup.groupJid || welcomeGroup.jid || "").trim();
  const groupResetAt = Number(
    botConfig?.groupResetAt?.[groupJid] ??
    welcomeGroup.groupResetAt ??
    welcomeGroup.resetAt ??
    0
  );
  const generationId = `${groupJid || "welcome"}:gen_${groupResetAt}`;
  return {
    config: {
      ...welcomeGroup,
      groupResetAt,
      generationId,
    },
    templates: Array.isArray(cachedWelcomeTemplates) ? cachedWelcomeTemplates : [],
    groupJid,
    groupResetAt,
    generationId,
  };
}

export interface DeliverWelcomeSequenceInput {
  sock?: any;
  customerJid: string;
  customerDisplayName?: string;
  templates?: any[];
  config?: any;
  groupResetAt?: number;
  generationId?: string;
  historyArray?: any[];
  source: "automatic_welcome" | "welcome_recovery" | "welcome_shortcut" | "pending_welcome_retry" | string;
  forwardTemplate?: (jid: string, template: any, isMedia?: boolean, options?: any) => Promise<any>;
  simulateTyping?: (jid: string, config?: any) => Promise<void>;
  pendingResponses?: any[];
  currentlyReplying?: Set<string>;
  io?: any;
  onSequenceFinished?: (jid: string, reason: string) => void;
  userId?: string;
  botId?: string;
  dataOwnerKey?: string;
  isAdmin?: boolean;
  isForceSend?: boolean;
}

export interface DeliverWelcomeSequenceResult {
  success: boolean;
  reason?: string;
  deliveredCount: number;
  totalCount: number;
  completed: boolean;
  skippedDueToClaim?: boolean;
  alreadySent?: boolean;
  pending?: boolean;
}

export function queuePendingResponseOnce(pendingResponses: any[], item: any): boolean {
  if (!Array.isArray(pendingResponses)) return false;
  const exists = pendingResponses.some(
    (pending) =>
      pending &&
      pending.jid === item.jid &&
      pending.type === item.type &&
      (item.type !== "welcome" || pending.type === "welcome") &&
      (!item.sequenceName || pending.sequenceName === item.sequenceName)
  );
  if (!exists) pendingResponses.push(item);
  return !exists;
}

const welcomeDeliveryDeps = {
  checkWelcomeSequence: dbService.checkWelcomeSequence,
  markWelcomeSequence: dbService.markWelcomeSequence,
  recordWelcomeSequenceStatus: dbService.recordWelcomeSequenceStatus,
  getCustomerProfile: dbService.getCustomerProfile,
  updateCustomerProfile: dbService.updateCustomerProfile,
  saveMessage: dbService.saveMessage,
  shouldSendWelcomeSequenceNow,
  getSequenceStatusBlockReason,
  canSendBillableAutomation,
  acquireAtomicClaim,
  finalizeAtomicClaim,
  releaseAtomicClaim,
  renewAtomicClaim,
  getSequenceProgressKey,
  getPendingSequenceItemIndexes,
  getTemplateStableId,
  isSequenceGenerationMismatch,
  buildSequenceProgressPatch,
  buildSequenceProgressClearPatch,
  isSequenceItemDelivered,
  normalizeSequenceItemResult,
  summarizeSequenceItemResults,
  resolveAccountDataOwnerKey,
  sendUniversalAutomationRelay,
  findOutboundReceiptByIdempotencyKey,
  waitRandomSequenceDelay,
};

export function __setWelcomeDeliveryTestDeps(overrides: Partial<typeof welcomeDeliveryDeps>) {
  Object.assign(welcomeDeliveryDeps, overrides || {});
}

export function __resetWelcomeDeliveryTestDeps() {
  Object.assign(welcomeDeliveryDeps, {
    checkWelcomeSequence: dbService.checkWelcomeSequence,
    markWelcomeSequence: dbService.markWelcomeSequence,
    recordWelcomeSequenceStatus: dbService.recordWelcomeSequenceStatus,
    getCustomerProfile: dbService.getCustomerProfile,
    updateCustomerProfile: dbService.updateCustomerProfile,
    saveMessage: dbService.saveMessage,
    shouldSendWelcomeSequenceNow,
    getSequenceStatusBlockReason,
    canSendBillableAutomation,
    acquireAtomicClaim,
    finalizeAtomicClaim,
    releaseAtomicClaim,
    renewAtomicClaim,
    getSequenceProgressKey,
    getPendingSequenceItemIndexes,
    getTemplateStableId,
    isSequenceGenerationMismatch,
    buildSequenceProgressPatch,
    buildSequenceProgressClearPatch,
    isSequenceItemDelivered,
    normalizeSequenceItemResult,
    summarizeSequenceItemResults,
    resolveAccountDataOwnerKey,
    sendUniversalAutomationRelay,
    findOutboundReceiptByIdempotencyKey,
    waitRandomSequenceDelay,
  });
}

async function defaultNativeForward(
  sock: any,
  customerJid: string,
  template: any,
  options: {
    userId?: string;
    dataOwnerKey: string;
    billingEventId: string;
    welcomeName: string;
    source: string;
  }
) {
  if (!sock) return { status: "failed", reason: "socket_not_ready" };
  const Baileys = await import("@whiskeysockets/baileys");
  const fwContent = Baileys.generateForwardMessageContent(template, false);
  if (!fwContent || Object.keys(fwContent).length === 0) {
    return { status: "invalid_media", reason: "empty_forward_content" };
  }
  for (const key of Object.keys(fwContent)) {
    const section = (fwContent as any)[key];
    if (section?.contextInfo) {
      section.contextInfo.isForwarded = false;
      delete section.contextInfo.forwardingScore;
      delete section.contextInfo.quotedMessage;
    }
  }
  const relayResult = await welcomeDeliveryDeps.sendUniversalAutomationRelay({
    userId: options.userId,
    botId: options.dataOwnerKey,
    customerJid,
    billingAction: "sequence_template_send",
    idempotencyKey: options.billingEventId,
    messageType: "sequence_template",
    contextType: "welcome_sequence",
    contextId: options.billingEventId,
    campaignType: "sequence",
    sequenceKey: `welcome:${options.welcomeName}`,
    source: options.source,
    template,
    buildMessageId: () => Baileys.generateMessageID(),
    relay: async (messageId) => {
      await sock.relayMessage(customerJid, fwContent, { messageId });
    },
    saveMessage: async (messageId) => {
      await welcomeDeliveryDeps.saveMessage(
        options.dataOwnerKey,
        customerJid,
        "model",
        describeTemplateForHistory(template, "Welcome sequence template sent"),
        messageId
      );
    },
  });
  await welcomeDeliveryDeps.waitRandomSequenceDelay();
  return welcomeDeliveryDeps.normalizeSequenceItemResult(relayResult);
}

export async function deliverWelcomeSequence(input: DeliverWelcomeSequenceInput): Promise<DeliverWelcomeSequenceResult> {
  const customerJid = String(input.customerJid || "").trim();
  if (!customerJid) {
    return { success: false, reason: "invalid_customer_jid", deliveredCount: 0, totalCount: 0, completed: false };
  }

  const userId = String(input.userId || process.env.USER_ID || "").trim();
  let dataOwnerKey = String(input.dataOwnerKey || input.botId || "").trim();
  if (!dataOwnerKey && input.sock?.user?.id) {
    const myJid = input.sock.user.id.split(":")[0] + "@s.whatsapp.net";
    dataOwnerKey = await welcomeDeliveryDeps.resolveAccountDataOwnerKey(userId, myJid);
  }
  if (!dataOwnerKey) {
    dataOwnerKey = userId || "bot_default";
  }

  const config = input.config || (input.isForceSend ? { jid: "welcome_forced", enabled: true } : undefined);
  const isConfigured = Boolean(config && (config.groupJid || config.jid || config.id || (input.isForceSend && input.templates && input.templates.length > 0)));
  if (!config || !isConfigured) {
    await welcomeDeliveryDeps.recordWelcomeSequenceStatus(dataOwnerKey, customerJid, {
      status: "skipped",
      reason: "not_configured",
      source: input.source,
    }).catch(() => {});
    input.io?.emit("system-log", {
      type: "warning",
      msg: `welcome_sequence_skipped_reason source=${input.source} reason=not_configured customer=${customerJid.split("@")[0]}`,
    });
    return { success: false, reason: "not_configured", deliveredCount: 0, totalCount: 0, completed: false };
  }

  if (config.enabled === false) {
    await welcomeDeliveryDeps.recordWelcomeSequenceStatus(dataOwnerKey, customerJid, {
      status: "skipped",
      reason: "disabled",
      source: input.source,
    }).catch(() => {});
    input.io?.emit("system-log", {
      type: "warning",
      msg: `welcome_sequence_skipped_reason source=${input.source} reason=disabled customer=${customerJid.split("@")[0]}`,
    });
    return { success: false, reason: "disabled", deliveredCount: 0, totalCount: 0, completed: false };
  }

  const templates = Array.isArray(input.templates) ? input.templates : [];
  if (templates.length === 0) {
    await welcomeDeliveryDeps.recordWelcomeSequenceStatus(dataOwnerKey, customerJid, {
      status: "skipped",
      reason: "templates_not_loaded",
      source: input.source,
    }).catch(() => {});
    input.io?.emit("system-log", {
      type: "warning",
      msg: `welcome_sequence_skipped_reason source=${input.source} reason=templates_not_loaded customer=${customerJid.split("@")[0]}`,
    });
    return { success: false, reason: "templates_not_loaded", deliveredCount: 0, totalCount: 0, completed: false };
  }

  const profile = await welcomeDeliveryDeps.getCustomerProfile(dataOwnerKey, customerJid).catch(() => null);
  if (!input.isForceSend) {
    const blockReason = welcomeDeliveryDeps.getSequenceStatusBlockReason(profile);
    if (blockReason) {
      await welcomeDeliveryDeps.recordWelcomeSequenceStatus(dataOwnerKey, customerJid, {
        status: "skipped",
        reason: blockReason,
        source: input.source,
      }).catch(() => {});
      input.io?.emit("system-log", {
        type: "warning",
        msg: `welcome_sequence_skipped_reason source=${input.source} reason=${blockReason} customer=${customerJid.split("@")[0]}`,
      });
      return { success: false, reason: blockReason, deliveredCount: 0, totalCount: templates.length, completed: false };
    }

    const alreadySent = await welcomeDeliveryDeps.checkWelcomeSequence(dataOwnerKey, customerJid);
    if (alreadySent) {
      await welcomeDeliveryDeps.recordWelcomeSequenceStatus(dataOwnerKey, customerJid, {
        status: "skipped",
        reason: "already_marked_sent",
        source: input.source,
      }).catch(() => {});
      input.io?.emit("system-log", {
        type: "warning",
        msg: `welcome_sequence_skipped_reason source=${input.source} reason=already_marked_sent customer=${customerJid.split("@")[0]}`,
      });
      return { success: false, reason: "already_marked_sent", deliveredCount: 0, totalCount: templates.length, completed: false, alreadySent: true };
    }
  }

  if (!input.isAdmin) {
    const welcomeDecision = await welcomeDeliveryDeps.shouldSendWelcomeSequenceNow({
      dataOwnerKey,
      customerJid,
      historyArray: input.historyArray,
      isAdmin: false,
    });
    if (!welcomeDecision.shouldSend) {
      await welcomeDeliveryDeps.recordWelcomeSequenceStatus(dataOwnerKey, customerJid, {
        status: "skipped",
        reason: welcomeDecision.reason,
        source: input.source,
      }).catch(() => {});
      input.io?.emit("system-log", {
        type: "warning",
        msg: `welcome_sequence_skipped_reason source=${input.source} reason=${welcomeDecision.reason} customer=${customerJid.split("@")[0]}`,
      });
      return { success: false, reason: welcomeDecision.reason, deliveredCount: 0, totalCount: templates.length, completed: false, alreadySent: welcomeDecision.reason === "already_marked_sent" };
    }
  }

  // Cross-process atomic claim
  const claimKey = `welcome_claim:${dataOwnerKey}:${customerJid}`;
  const workerId = `${process.env.BOT_ID || process.env.pm_id || "worker"}_${process.pid}_${Math.random().toString(36).slice(2, 8)}`;
  const claimResult = await welcomeDeliveryDeps.acquireAtomicClaim(claimKey, workerId, 60000);
  if (!claimResult.acquired) {
    input.io?.emit("system-log", {
      type: "warning",
      msg: `welcome_sequence_skipped_reason source=${input.source} reason=claim_in_progress customer=${customerJid.split("@")[0]}`,
    });
    return { success: false, reason: "claim_in_progress", deliveredCount: 0, totalCount: templates.length, completed: false, skippedDueToClaim: true };
  }

  // Periodic heartbeat renewal while delivery is actively executing
  let heartbeatTimer: any = null;
  const startHeartbeat = () => {
    if (heartbeatTimer) return;
    heartbeatTimer = setInterval(async () => {
      try {
        await welcomeDeliveryDeps.renewAtomicClaim(claimKey, workerId, 60000);
      } catch {}
    }, 15000);
    if (heartbeatTimer?.unref) heartbeatTimer.unref();
  };
  const stopHeartbeat = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };
  startHeartbeat();

  input.currentlyReplying?.add(customerJid);
  const welcomeName = config.name || "Welcome";
  const groupIdentity = config.groupJid || config.jid || "welcome";
  const groupResetAt = Number(
    input.groupResetAt !== undefined
      ? input.groupResetAt
      : config?.groupResetAt?.[groupIdentity] !== undefined
        ? config.groupResetAt[groupIdentity]
        : config?.groupResetAt !== undefined && typeof config?.groupResetAt === "number"
          ? config.groupResetAt
          : config?.welcome?.resetAt || config?.resetAt || 0
  );
  const generationId = input.generationId || `${groupIdentity}:gen_${groupResetAt}`;

  input.io?.emit("system-log", {
    type: "info",
    msg: `welcome_sequence_matched source=${input.source} customer=${customerJid.split("@")[0]} name=${welcomeName}`,
  });

  try {
    const progressKey = welcomeDeliveryDeps.getSequenceProgressKey("welcome");

    // Requirement 7: Check if customer had already begun an older Welcome generation that was reset/removed
    if (welcomeDeliveryDeps.isSequenceGenerationMismatch(profile, progressKey, generationId)) {
      stopHeartbeat();
      const markResult = await welcomeDeliveryDeps.markWelcomeSequence(dataOwnerKey, customerJid, {
        source: input.source,
        reason: "generation_reset",
      }).catch((e: any) => ({ success: false, error: e?.message || String(e) }));

      if (!markResult || !markResult.success) {
        await welcomeDeliveryDeps.recordWelcomeSequenceStatus(dataOwnerKey, customerJid, {
          status: "failed",
          reason: "generation_reset_sent_marker_persistence_failed",
          source: input.source,
        }).catch(() => {});
        await welcomeDeliveryDeps.releaseAtomicClaim(claimKey, workerId).catch(() => {});
        return {
          success: false,
          reason: "generation_reset_sent_marker_persistence_failed",
          deliveredCount: 0,
          totalCount: templates.length,
          completed: false,
          pending: true,
          alreadySent: false,
        };
      }

      await welcomeDeliveryDeps.updateCustomerProfile(
        dataOwnerKey,
        customerJid,
        welcomeDeliveryDeps.buildSequenceProgressClearPatch(profile, progressKey)
      ).catch(() => {});

      await welcomeDeliveryDeps.releaseAtomicClaim(claimKey, workerId).catch(() => {});
      return {
        success: false,
        reason: "generation_reset",
        deliveredCount: 0,
        totalCount: templates.length,
        completed: false,
        alreadySent: true,
      };
    }

    // Determine pending items using authoritative stable item IDs (Requirement 5 & 6)
    const candidateIndexes = welcomeDeliveryDeps.getPendingSequenceItemIndexes(
      profile,
      progressKey,
      templates.length,
      templates,
      generationId
    );

    // Cross-verify against durable outbound send receipts (Requirement 4 & 15)
    const receiptDeliveredItemResults: any[] = [];
    const pendingIndexes: number[] = [];
    for (const index of candidateIndexes) {
      const template = templates[index];
      const itemStableId = welcomeDeliveryDeps.getTemplateStableId(template, index);
      const billingEventId = `welcome:${dataOwnerKey}:${customerJid}:${groupIdentity}:${itemStableId}`;
      const receipt = welcomeDeliveryDeps.findOutboundReceiptByIdempotencyKey(billingEventId);
      if (receipt?.sendStatus === "sent" && receipt.messageId) {
        // Receipt confirms already sent, skip to prevent duplicate WhatsApp send or double billing
        receiptDeliveredItemResults.push({
          status: "sent",
          sequenceIndex: index,
          itemId: itemStableId,
          messageId: receipt.messageId,
        });
        continue;
      }
      pendingIndexes.push(index);
    }

    if (pendingIndexes.length === 0) {
      stopHeartbeat();
      // Requirement 1 & 2: Durable completion marking must succeed before reporting completed=true
      const markResult = await welcomeDeliveryDeps.markWelcomeSequence(dataOwnerKey, customerJid, { source: input.source });
      if (!markResult || !markResult.success) {
        await welcomeDeliveryDeps.recordWelcomeSequenceStatus(dataOwnerKey, customerJid, {
          status: "failed",
          reason: "durable_sent_marker_persistence_failed",
          source: input.source,
        }).catch(() => {});
        await welcomeDeliveryDeps.releaseAtomicClaim(claimKey, workerId);
        return {
          success: false,
          reason: "durable_sent_marker_persistence_failed",
          deliveredCount: templates.length,
          totalCount: templates.length,
          completed: false,
          pending: true,
        };
      }

      await welcomeDeliveryDeps.updateCustomerProfile(dataOwnerKey, customerJid, welcomeDeliveryDeps.buildSequenceProgressClearPatch(profile, progressKey)).catch(() => {});

      // Requirement 14: Check finalization result explicitly
      const finalized = await welcomeDeliveryDeps.finalizeAtomicClaim(claimKey, workerId);
      if (!finalized) {
        console.warn(`[WelcomeDelivery] Atomic claim finalization failed for ${customerJid}, but durable sent state is confirmed.`);
        return {
          success: true,
          reason: "claim_finalization_unconfirmed",
          deliveredCount: templates.length,
          totalCount: templates.length,
          completed: false,
        };
      }

      input.io?.emit("system-log", {
        type: "success",
        msg: `welcome_sequence_sent source=${input.source} customer=${customerJid.split("@")[0]} items=${templates.length}/${templates.length}`,
      });
      return { success: true, deliveredCount: templates.length, totalCount: templates.length, completed: true };
    }

    const walletGate = await welcomeDeliveryDeps.canSendBillableAutomation(userId, "sequence_template_send", pendingIndexes.length);
    if (!walletGate.allowed) {
      stopHeartbeat();
      await welcomeDeliveryDeps.recordWelcomeSequenceStatus(dataOwnerKey, customerJid, {
        status: "pending",
        reason: "wallet balance too low",
        source: input.source,
      }).catch(() => {});
      if (input.pendingResponses) {
        queuePendingResponseOnce(input.pendingResponses, { jid: customerJid, sequenceName: welcomeName, type: "welcome", timestamp: Date.now() });
      }
      input.io?.emit("system-log", {
        type: "warning",
        msg: `welcome_sequence_skipped_reason source=${input.source} reason=wallet_balance_too_low customer=${customerJid.split("@")[0]}`,
      });
      await welcomeDeliveryDeps.releaseAtomicClaim(claimKey, workerId);
      return { success: false, reason: "wallet_balance_too_low", deliveredCount: templates.length - pendingIndexes.length, totalCount: templates.length, completed: false, pending: true };
    }

    const itemResults: any[] = [];
    for (const index of pendingIndexes) {
      const template = templates[index];
      const itemStableId = welcomeDeliveryDeps.getTemplateStableId(template, index);
      const billingEventId = `welcome:${dataOwnerKey}:${customerJid}:${groupIdentity}:${itemStableId}`;

      try {
        let result: any;
        if (input.forwardTemplate) {
          result = await input.forwardTemplate(customerJid, template, false, {
            billingAction: "sequence_template_send",
            billingEventId,
            sequenceKey: `welcome:${welcomeName}`,
            billingLabel: welcomeName,
            source: input.source,
          });
        } else {
          result = await defaultNativeForward(input.sock, customerJid, template, {
            userId,
            dataOwnerKey,
            billingEventId,
            welcomeName,
            source: input.source,
          });
        }
        const normalized = welcomeDeliveryDeps.normalizeSequenceItemResult(result);
        itemResults.push({ ...normalized, sequenceIndex: index, itemId: itemStableId });
        const isDelivered = welcomeDeliveryDeps.isSequenceItemDelivered(normalized);
        input.io?.emit("system-log", {
          type: isDelivered ? "success" : "warning",
          msg: `${welcomeName} item ${index + 1}/${templates.length}: ${normalized?.status || "failed"}${normalized?.reason ? ` (${normalized.reason})` : ""}`,
        });
        if (!isDelivered) {
          break;
        }
      } catch (sendErr: any) {
        console.error(`[WelcomeDelivery] Item ${index} forward failed for ${customerJid}:`, sendErr);
        itemResults.push({ status: "failed", reason: sendErr?.message || String(sendErr), sequenceIndex: index, itemId: itemStableId });
        break;
      }
    }

    stopHeartbeat();
    const combinedResults = [...receiptDeliveredItemResults, ...itemResults];
    const summary = welcomeDeliveryDeps.summarizeSequenceItemResults(combinedResults);
    const patch = welcomeDeliveryDeps.buildSequenceProgressPatch({
      profile,
      progressKey,
      results: combinedResults,
      total: templates.length,
      templates,
      groupIdentity,
      generationId,
      source: input.source,
      reason: summary.reason,
    });
    const progress = patch.sequenceDeliveryProgress[progressKey];
    const deliveredCount = progress.deliveredItemIds?.length || progress.deliveredIndexes?.length || 0;
    const isComplete = deliveredCount === templates.length && templates.length > 0;

    if (isComplete) {
      // Requirement 1, 2 & 3: Authoritative durable confirmation before reporting completed=true
      const markResult = await welcomeDeliveryDeps.markWelcomeSequence(dataOwnerKey, customerJid, { source: input.source });
      if (!markResult || !markResult.success) {
        // Persistence failed! Save progress patch so sent items are not lost, but do NOT finalize claim
        await welcomeDeliveryDeps.updateCustomerProfile(dataOwnerKey, customerJid, patch).catch(() => {});
        await welcomeDeliveryDeps.recordWelcomeSequenceStatus(dataOwnerKey, customerJid, {
          status: "failed",
          reason: "durable_sent_marker_persistence_failed",
          source: input.source,
        }).catch(() => {});
        await welcomeDeliveryDeps.releaseAtomicClaim(claimKey, workerId);
        return {
          success: false,
          reason: "durable_sent_marker_persistence_failed",
          deliveredCount: templates.length,
          totalCount: templates.length,
          completed: false,
          pending: true,
        };
      }

      await welcomeDeliveryDeps.updateCustomerProfile(dataOwnerKey, customerJid, welcomeDeliveryDeps.buildSequenceProgressClearPatch(profile, progressKey)).catch(() => {});

      // Requirement 14: Check finalization result explicitly
      const finalized = await welcomeDeliveryDeps.finalizeAtomicClaim(claimKey, workerId);
      if (!finalized) {
        console.warn(`[WelcomeDelivery] Atomic claim finalization failed for ${customerJid}, but durable sent state is confirmed.`);
        return {
          success: true,
          reason: "claim_finalization_unconfirmed",
          deliveredCount: templates.length,
          totalCount: templates.length,
          completed: false,
        };
      }

      input.io?.emit("system-log", {
        type: "success",
        msg: `welcome_sequence_sent source=${input.source} customer=${customerJid.split("@")[0]} items=${templates.length}/${templates.length}`,
      });
      return { success: true, deliveredCount: templates.length, totalCount: templates.length, completed: true };
    } else {
      // Requirement 4: Durable progress persistence check
      let progressPersisted = true;
      try {
        await welcomeDeliveryDeps.updateCustomerProfile(dataOwnerKey, customerJid, patch);
        progressPersisted = true;
      } catch {
        progressPersisted = false;
      }

      const summaryReason = `partial_sent ${deliveredCount}/${templates.length}${summary.reason ? ` ${summary.reason}` : ""}${!progressPersisted ? " (progress persistence failed)" : ""}`;
      await welcomeDeliveryDeps.recordWelcomeSequenceStatus(dataOwnerKey, customerJid, {
        status: "pending",
        reason: summaryReason,
        source: input.source,
      }).catch(() => {});
      if (input.pendingResponses) {
        queuePendingResponseOnce(input.pendingResponses, { jid: customerJid, sequenceName: welcomeName, type: "welcome", timestamp: Date.now() });
      }
      input.io?.emit("system-log", {
        type: "error",
        msg: `welcome_sequence_skipped_reason source=${input.source} reason=partial_sent_${deliveredCount}_${templates.length} customer=${customerJid.split("@")[0]}`,
      });
      await welcomeDeliveryDeps.releaseAtomicClaim(claimKey, workerId);
      return {
        success: false,
        reason: progressPersisted ? "partial_sent" : "partial_sent_progress_persistence_failed",
        deliveredCount,
        totalCount: templates.length,
        completed: false,
        pending: true,
      };
    }
  } finally {
    stopHeartbeat();
    input.currentlyReplying?.delete(customerJid);
    input.onSequenceFinished?.(customerJid, "welcome_delivery_finished");
  }
}
