import * as dbService from "./db-service.ts";
import { getSequenceStatusBlockReason } from "./sequence-delivery-guard-service.ts";
import { canSendBillableAutomation } from "./automation-send-billing-service.ts";
import {
  isSequenceItemDelivered,
  normalizeSequenceItemResult,
  summarizeSequenceItemResults,
} from "./sequence-delivery-result-service.ts";
import {
  buildSequenceProgressClearPatch,
  buildSequenceProgressPatch,
  getPendingSequenceItemIndexes,
  getSequenceProgressKey,
  getTemplateStableId,
  isSequenceGenerationMismatch,
} from "./sequence-progress-service.ts";
import {
  getSequenceDisplayName,
  getSequenceFlag,
  getSequenceSentFlagKeys,
  getSequenceStableId,
} from "./sequence-trigger-service.ts";
import {
  acquireAtomicClaim,
  finalizeAtomicClaim,
  releaseAtomicClaim,
  renewAtomicClaim,
} from "./canonical-claim-service.ts";
import { findOutboundReceiptByIdempotencyKey } from "./outbound-send-receipt-service.ts";
import { describeTemplateForHistory } from "./sequence-delivery-log-service.ts";
import { waitRandomSequenceDelay } from "./sequence-delay-service.ts";
import { resolveAccountDataOwnerKey } from "./account-data-owner.ts";
import { sendUniversalAutomationRelay } from "./universal-automation-relay-service.ts";
import { queuePendingResponseOnce } from "./welcome-sequence-delivery-service.ts";

export interface CanonicalRuntimeSequencePayload {
  sequence: any;
  templates: any[];
  groupJid: string;
  groupResetAt: number;
  generationId: string;
  stableSequenceId: string;
}

export function resolveRuntimeSequencePayload(
  botConfig: any,
  sequence: any,
  cachedTemplates: any[] = []
): CanonicalRuntimeSequencePayload | null {
  if (!sequence) return null;
  const config = sequence.config || sequence;
  const stableSequenceId = getSequenceStableId(sequence);
  const groupJid = String(sequence.jid || config.jid || config.groupJid || "").trim();
  const groupResetAt = Number(
    botConfig?.groupResetAt?.[groupJid] ??
    config.groupResetAt ??
    config.resetAt ??
    0
  );
  const generationId = `${groupJid || stableSequenceId}:gen_${groupResetAt}`;
  const templates = Array.isArray(sequence.templates) && sequence.templates.length > 0
    ? sequence.templates
    : (Array.isArray(cachedTemplates) ? cachedTemplates : []);

  return {
    sequence: {
      ...sequence,
      config: {
        ...config,
        groupResetAt,
        generationId,
      },
      templates,
    },
    templates,
    groupJid,
    groupResetAt,
    generationId,
    stableSequenceId,
  };
}

export interface DeliverSequenceGroupInput {
  sock?: any;
  customerJid: string;
  customerDisplayName?: string;
  sequence: any;
  fallbackKey?: string;
  templates?: any[];
  groupResetAt?: number;
  generationId?: string;
  source: "keyword" | "shortcut" | "ai_semantic" | "pending_retry" | "recovery" | string;
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

export interface DeliverSequenceGroupResult {
  success: boolean;
  reason?: string;
  deliveredCount: number;
  totalCount: number;
  completed: boolean;
  skippedDueToClaim?: boolean;
  alreadySent?: boolean;
  pending?: boolean;
}

const sequenceDeliveryDeps = {
  checkSequence: dbService.checkSequence,
  markSequence: dbService.markSequence,
  getCustomerProfile: dbService.getCustomerProfile,
  updateCustomerProfile: dbService.updateCustomerProfile,
  saveMessage: dbService.saveMessage,
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
  getSequenceStableId,
  getSequenceDisplayName,
  getSequenceFlag,
  getSequenceSentFlagKeys,
};

export function __setSequenceDeliveryTestDeps(overrides: Partial<typeof sequenceDeliveryDeps>) {
  Object.assign(sequenceDeliveryDeps, overrides || {});
}

export function __resetSequenceDeliveryTestDeps() {
  Object.assign(sequenceDeliveryDeps, {
    checkSequence: dbService.checkSequence,
    markSequence: dbService.markSequence,
    getCustomerProfile: dbService.getCustomerProfile,
    updateCustomerProfile: dbService.updateCustomerProfile,
    saveMessage: dbService.saveMessage,
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
    getSequenceStableId,
    getSequenceDisplayName,
    getSequenceFlag,
    getSequenceSentFlagKeys,
  });
}

async function defaultNativeSequenceForward(
  sock: any,
  customerJid: string,
  template: any,
  options: {
    userId?: string;
    dataOwnerKey: string;
    billingEventId: string;
    sequenceDisplayName: string;
    canonicalFlag: string;
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

  const relayResult = await sequenceDeliveryDeps.sendUniversalAutomationRelay({
    userId: options.userId,
    botId: options.dataOwnerKey,
    customerJid,
    billingAction: "sequence_template_send",
    idempotencyKey: options.billingEventId,
    messageType: "sequence_template",
    contextType: "sequence_group",
    contextId: options.billingEventId,
    campaignType: "sequence",
    sequenceKey: options.canonicalFlag,
    source: options.source,
    template,
    buildMessageId: () => Baileys.generateMessageID(),
    relay: async (messageId) => {
      await sock.relayMessage(customerJid, fwContent, { messageId });
    },
    saveMessage: async (messageId) => {
      await sequenceDeliveryDeps.saveMessage(
        options.dataOwnerKey,
        customerJid,
        "model",
        describeTemplateForHistory(template, `Sequence '${options.sequenceDisplayName}' template sent`),
        messageId
      );
    },
  });
  await sequenceDeliveryDeps.waitRandomSequenceDelay();
  return sequenceDeliveryDeps.normalizeSequenceItemResult(relayResult);
}

export async function deliverSequenceGroup(input: DeliverSequenceGroupInput): Promise<DeliverSequenceGroupResult> {
  const customerJid = String(input.customerJid || "").trim();
  if (!customerJid) {
    return { success: false, reason: "invalid_customer_jid", deliveredCount: 0, totalCount: 0, completed: false };
  }

  const userId = String(input.userId || process.env.USER_ID || "").trim();
  let dataOwnerKey = String(input.dataOwnerKey || input.botId || "").trim();
  if (!dataOwnerKey && input.sock?.user?.id) {
    const myJid = input.sock.user.id.split(":")[0] + "@s.whatsapp.net";
    dataOwnerKey = await sequenceDeliveryDeps.resolveAccountDataOwnerKey(userId, myJid);
  }
  if (!dataOwnerKey) {
    dataOwnerKey = await sequenceDeliveryDeps.resolveAccountDataOwnerKey(userId, "");
  }
  if (!dataOwnerKey) {
    dataOwnerKey = userId || "bot_default";
  }

  const sequence = input.sequence;
  if (!sequence) {
    return { success: false, reason: "missing_sequence", deliveredCount: 0, totalCount: 0, completed: false };
  }

  const config = sequence.config || sequence;
  const fallbackKey = input.fallbackKey || sequence.name || "sequence";
  const stableSequenceId = sequenceDeliveryDeps.getSequenceStableId(sequence, fallbackKey);
  const sequenceDisplayName = sequenceDeliveryDeps.getSequenceDisplayName(fallbackKey, sequence);
  const canonicalFlag = sequenceDeliveryDeps.getSequenceFlag(fallbackKey, sequence);

  // 1. Check enabled
  if (config.enabled === false) {
    input.io?.emit("system-log", {
      type: "warning",
      msg: `sequence_skipped_reason source=${input.source} reason=disabled sequence=${sequenceDisplayName} customer=${customerJid.split("@")[0]}`,
    });
    return { success: false, reason: "disabled", deliveredCount: 0, totalCount: 0, completed: false };
  }

  // 2. Check templates
  const templates = Array.isArray(input.templates) && input.templates.length > 0
    ? input.templates
    : (Array.isArray(sequence.templates) ? sequence.templates : []);

  if (templates.length === 0) {
    input.io?.emit("system-log", {
      type: "warning",
      msg: `sequence_skipped_reason source=${input.source} reason=templates_not_loaded sequence=${sequenceDisplayName} customer=${customerJid.split("@")[0]}`,
    });
    return { success: false, reason: "templates_not_loaded", deliveredCount: 0, totalCount: 0, completed: false };
  }

  // 3. Check customer profile & status block reason
  const profile = await sequenceDeliveryDeps.getCustomerProfile(dataOwnerKey, customerJid).catch(() => null);
  const blockReason = sequenceDeliveryDeps.getSequenceStatusBlockReason(profile);
  if (blockReason) {
    input.io?.emit("system-log", {
      type: "warning",
      msg: `sequence_skipped_reason source=${input.source} reason=${blockReason} sequence=${sequenceDisplayName} customer=${customerJid.split("@")[0]}`,
    });
    return { success: false, reason: blockReason, deliveredCount: 0, totalCount: templates.length, completed: false };
  }

  // 4. Once sent = Do not send again (Regular shortcodes and admin fromMe MUST respect durable sent state)
  if (!input.isForceSend) {
    const alreadySent = await sequenceDeliveryDeps.checkSequence(dataOwnerKey, customerJid, sequence, fallbackKey);
    if (alreadySent) {
      input.io?.emit("system-log", {
        type: "info",
        msg: `sequence_skipped_reason source=${input.source} reason=already_sent sequence=${sequenceDisplayName} customer=${customerJid.split("@")[0]}`,
      });
      return { success: true, reason: "already_sent", deliveredCount: 0, totalCount: templates.length, completed: true, alreadySent: true };
    }
  }

  // 5. Authoritative Reset Generation ID
  const groupIdentity = String(sequence.jid || config.jid || config.groupJid || stableSequenceId).trim();
  const groupResetAt = Number(
    input.groupResetAt !== undefined
      ? input.groupResetAt
      : config?.groupResetAt?.[groupIdentity] !== undefined
        ? config.groupResetAt[groupIdentity]
        : config?.groupResetAt !== undefined && typeof config?.groupResetAt === "number"
          ? config.groupResetAt
          : config?.resetAt !== undefined
            ? config.resetAt
            : 0
  );
  const generationId = input.generationId || `${groupIdentity}:gen_${groupResetAt}`;

  // 6. Durable Atomic Claim (cross-worker/cross-process lock)
  const claimKey = `sequence_claim:${dataOwnerKey}:${customerJid}:${stableSequenceId}`;
  const ownerToken = `worker_${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const claimResult = await sequenceDeliveryDeps.acquireAtomicClaim(claimKey, ownerToken, 60000);

  if (!claimResult.acquired) {
    input.io?.emit("system-log", {
      type: "info",
      msg: `sequence_skipped_reason source=${input.source} reason=active_claim_held sequence=${sequenceDisplayName} customer=${customerJid.split("@")[0]}`,
    });
    return { success: false, reason: "active_claim_held", deliveredCount: 0, totalCount: templates.length, completed: false, skippedDueToClaim: true };
  }

  let claimFinalized = false;
  input.currentlyReplying?.add(customerJid);

  try {
    // 7. Generation Mismatch & Safe Reset-during-Partial Handling
    const progressKey = sequenceDeliveryDeps.getSequenceProgressKey("sequence", canonicalFlag);
    const isMismatch = sequenceDeliveryDeps.isSequenceGenerationMismatch(profile, progressKey, generationId);

    if (isMismatch) {
      input.io?.emit("system-log", {
        type: "warning",
        msg: `sequence_generation_mismatch sequence=${sequenceDisplayName} generation=${generationId} customer=${customerJid.split("@")[0]} action=close_obsolete_generation`,
      });

      // Clear obsolete partial progress
      await sequenceDeliveryDeps.updateCustomerProfile(
        dataOwnerKey,
        customerJid,
        sequenceDeliveryDeps.buildSequenceProgressClearPatch(profile, progressKey)
      ).catch(() => {});

      // Durably mark sequence sent so customer is not sent the rebuilt generation
      const markResult = await sequenceDeliveryDeps.markSequence(dataOwnerKey, customerJid, sequence, { timestamp: Date.now(), fallbackKey }, fallbackKey);
      if (!markResult.success) {
        input.io?.emit("system-log", {
          type: "error",
          msg: `sequence_generation_reset_persistence_failed sequence=${sequenceDisplayName} customer=${customerJid.split("@")[0]}`,
        });
        await sequenceDeliveryDeps.releaseAtomicClaim(claimKey, ownerToken).catch(() => {});
        claimFinalized = true;
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

      await sequenceDeliveryDeps.finalizeAtomicClaim(claimKey, ownerToken).catch(() => {});
      claimFinalized = true;
      return {
        success: false,
        reason: "generation_mismatch",
        deliveredCount: 0,
        totalCount: templates.length,
        completed: false,
        alreadySent: true,
      };
    }

    // 8. Pending Items Resolution & Wallet Billing Gate
    const pendingIndexes = sequenceDeliveryDeps.getPendingSequenceItemIndexes(profile, progressKey, templates.length);
    if (pendingIndexes.length === 0) {
      const markResult = await sequenceDeliveryDeps.markSequence(dataOwnerKey, customerJid, sequence);
      if (markResult.success) {
        await sequenceDeliveryDeps.updateCustomerProfile(
          dataOwnerKey,
          customerJid,
          sequenceDeliveryDeps.buildSequenceProgressClearPatch(profile, progressKey)
        ).catch(() => {});
        await sequenceDeliveryDeps.finalizeAtomicClaim(claimKey, ownerToken).catch(() => {});
        claimFinalized = true;
        return { success: true, reason: "already_completed", deliveredCount: 0, totalCount: templates.length, completed: true, alreadySent: true };
      }
    }

    const walletCheck = await sequenceDeliveryDeps.canSendBillableAutomation(
      userId,
      "sequence_template_send",
      pendingIndexes.length
    );

    if (!walletCheck.allowed) {
      if (input.pendingResponses) {
        queuePendingResponseOnce(input.pendingResponses, {
          jid: customerJid,
          sequenceName: fallbackKey,
          type: input.source === "shortcut" ? "shortcut" : "sequence",
          timestamp: Date.now(),
        });
      }
      input.io?.emit("system-log", {
        type: "warning",
        msg: `sequence_skipped_reason source=${input.source} reason=wallet_balance_too_low sequence=${sequenceDisplayName} customer=${customerJid.split("@")[0]}`,
      });
      await sequenceDeliveryDeps.releaseAtomicClaim(claimKey, ownerToken).catch(() => {});
      claimFinalized = true;
      return { success: false, reason: "wallet_balance_too_low", deliveredCount: 0, totalCount: templates.length, completed: false, pending: true };
    }

    // 9. Delivery Loop with Stable Item IDs, Outbound Receipts, and Heartbeat Renewal
    const itemResults: any[] = [];
    let currentProfile = profile;

    for (const index of pendingIndexes) {
      await sequenceDeliveryDeps.renewAtomicClaim(claimKey, ownerToken, 60000).catch(() => {});

      if (input.simulateTyping) {
        await input.simulateTyping(customerJid, config).catch(() => {});
      }

      const template = templates[index];
      const stableItemId = sequenceDeliveryDeps.getTemplateStableId(template, index);
      const billingEventId = `sequence:${dataOwnerKey}:${customerJid}:${stableSequenceId}:${generationId}:${stableItemId}`;

      // Outbound receipt recovery: Check if already sent successfully by a previous attempt/network timeout
      const existingReceipt = sequenceDeliveryDeps.findOutboundReceiptByIdempotencyKey(billingEventId);
      if (existingReceipt?.sendStatus === "sent" && existingReceipt.messageId) {
        itemResults.push({
          status: "sent",
          sequenceIndex: index,
          stableItemId,
          recoveredFromReceipt: true,
          messageId: existingReceipt.messageId,
        });
        continue;
      }

      let itemResult: any;
      try {
        if (input.forwardTemplate) {
          itemResult = await input.forwardTemplate(customerJid, template, false, {
            billingAction: "sequence_template_send",
            billingEventId,
            sequenceKey: canonicalFlag,
            billingLabel: sequenceDisplayName,
            source: input.source,
          });
        } else {
          itemResult = await defaultNativeSequenceForward(input.sock, customerJid, template, {
            userId,
            dataOwnerKey,
            billingEventId,
            sequenceDisplayName,
            canonicalFlag,
            source: input.source,
          });
        }
      } catch (err: any) {
        console.error(`[SequenceDelivery] Item error for ${customerJid}:`, err);
        itemResult = { status: "failed", reason: err?.message || String(err) };
      }

      const normalized = sequenceDeliveryDeps.normalizeSequenceItemResult(itemResult);
      itemResults.push({ ...normalized, sequenceIndex: index, stableItemId });

      if (!sequenceDeliveryDeps.isSequenceItemDelivered(normalized)) {
        input.io?.emit("system-log", {
          type: "warning",
          msg: `sequence_item_delivery_failed sequence=${sequenceDisplayName} item=${index + 1}/${templates.length} reason=${normalized.reason || "unknown"} customer=${customerJid.split("@")[0]}`,
        });
        break; // Partial failure: stop immediately, do not proceed to later items
      }
    }

    // 10. Summarize & Durably Persist Progress or Completion
    const summary = sequenceDeliveryDeps.summarizeSequenceItemResults(itemResults);

    if (summary.complete) {
      // Clear progress
      await sequenceDeliveryDeps.updateCustomerProfile(
        dataOwnerKey,
        customerJid,
        sequenceDeliveryDeps.buildSequenceProgressClearPatch(currentProfile, progressKey)
      ).catch(() => {});

      // Confirm durable sent marking
      const markResult = await sequenceDeliveryDeps.markSequence(dataOwnerKey, customerJid, sequence, { timestamp: Date.now(), fallbackKey }, fallbackKey);
      if (!markResult.success) {
        input.io?.emit("system-log", {
          type: "error",
          msg: `sequence_completion_marker_persistence_failed sequence=${sequenceDisplayName} customer=${customerJid.split("@")[0]}`,
        });
        await sequenceDeliveryDeps.releaseAtomicClaim(claimKey, ownerToken).catch(() => {});
        claimFinalized = true;
        return {
          success: false,
          reason: "sent_marker_persistence_failed",
          deliveredCount: summary.sent,
          totalCount: templates.length,
          completed: false,
          pending: true,
          alreadySent: false,
        };
      }

      await sequenceDeliveryDeps.finalizeAtomicClaim(claimKey, ownerToken).catch(() => {});
      claimFinalized = true;
      input.io?.emit("system-log", {
        type: "success",
        msg: `sequence_sent source=${input.source} sequence=${sequenceDisplayName} customer=${customerJid.split("@")[0]} items=${summary.sent}/${summary.total}`,
      });
      return {
        success: true,
        deliveredCount: summary.sent,
        totalCount: templates.length,
        completed: true,
      };
    } else {
      // Partial progress persistence
      await sequenceDeliveryDeps.updateCustomerProfile(
        dataOwnerKey,
        customerJid,
        sequenceDeliveryDeps.buildSequenceProgressPatch({
          profile: currentProfile,
          progressKey,
          results: itemResults,
          total: templates.length,
          source: input.source,
          generationId,
          reason: summary.reason,
        })
      ).catch(() => {});

      if (input.pendingResponses) {
        queuePendingResponseOnce(input.pendingResponses, {
          jid: customerJid,
          sequenceName: fallbackKey,
          type: input.source === "shortcut" ? "shortcut" : "sequence",
          timestamp: Date.now(),
        });
      }

      await sequenceDeliveryDeps.releaseAtomicClaim(claimKey, ownerToken).catch(() => {});
      claimFinalized = true;
      input.io?.emit("system-log", {
        type: "error",
        msg: `sequence_partial_failure source=${input.source} sequence=${sequenceDisplayName} items=${summary.sent}/${summary.total} reason=${summary.reason || "partial_send"} customer=${customerJid.split("@")[0]}`,
      });
      return {
        success: false,
        reason: summary.reason || "partial_send",
        deliveredCount: summary.sent,
        totalCount: templates.length,
        completed: false,
        pending: true,
      };
    }
  } finally {
    if (!claimFinalized) {
      await sequenceDeliveryDeps.releaseAtomicClaim(claimKey, ownerToken).catch(() => {});
    }
    input.currentlyReplying?.delete(customerJid);
    input.onSequenceFinished?.(customerJid, `sequence_finished:${input.source}`);
  }
}
