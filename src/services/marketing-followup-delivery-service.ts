import type { MarketingReportEntry } from "./marketing-report-service.ts";

type FollowupDeliveryItem = {
  botId: string;
  botName?: string;
  followupId: string;
  campaignName?: string;
  campaignType?: string;
  audience?: string;
  contact?: string;
  phone?: string;
  customerId: string;
  sourceCustomerId?: string;
  ownerKey?: string;
  customerBotId?: string;
  botJid?: string;
  attemptKey?: string;
  billingDedupeKey?: string;
  lastMessageAt?: number;
  windowFromHours?: number;
  windowToHours?: number;
  offerContext?: string;
  actualBotId?: string;
  actualBotJid?: string;
  defaultBotId?: string;
  sendFromMode?: string;
  fallbackReason?: string;
};

type WorkerSendResult = {
  skipped?: boolean;
  target?: string;
  status?: string;
  reason?: string;
  sentMessageId?: string;
  chargeAmount?: number;
};

type DeliverMarketingFollowupInput = {
  item: FollowupDeliveryItem;
  ownerUserId?: string;
  sendThroughWorker: () => Promise<WorkerSendResult>;
  recordDelivery: (botJid: string, customerJid: string, input: {
    followupId: string;
    status: "queued" | "sending" | "sent" | "failed" | "skipped";
    sentMessageId?: string;
    reason?: string;
    attemptKey?: string;
    customerLastMessageAt?: number;
    billingDedupeKey?: string;
  }) => Promise<void>;
  appendReport: (entry: MarketingReportEntry) => any;
};

export type DeliverMarketingFollowupResult = {
  status: "sent" | "failed" | "skipped";
  sentMessageId?: string;
  reason?: string;
};

function unique(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter(Boolean) as string[]));
}

function buildReportBase(input: DeliverMarketingFollowupInput) {
  const { item, ownerUserId } = input;
  return {
    userId: ownerUserId || "",
    botId: item.botId,
    botName: item.botName,
    followupId: item.followupId,
    campaignName: item.campaignName,
    campaignType: item.campaignType,
    audience: item.audience,
    contact: item.contact,
    phone: item.phone,
    sourceCustomerId: item.sourceCustomerId,
    attemptKey: item.attemptKey,
    billingDedupeKey: item.billingDedupeKey,
    windowFromHours: item.windowFromHours,
    windowToHours: item.windowToHours,
    actualBotId: item.actualBotId,
    actualBotJid: item.actualBotJid,
    defaultBotId: item.defaultBotId,
    sendFromMode: item.sendFromMode,
    fallbackReason: item.fallbackReason,
  };
}

async function recordForTargets(
  input: DeliverMarketingFollowupInput,
  status: "sending" | "sent" | "failed" | "skipped",
  targetJid: string,
  reason = "",
  sentMessageId = ""
) {
  const { item } = input;
  const markTargets = unique([item.ownerKey, item.customerBotId, item.botJid]);
  const customerTargets = unique([item.customerId, targetJid, item.sourceCustomerId]);
  for (const markTarget of markTargets) {
    for (const customerJid of customerTargets) {
      try {
        await input.recordDelivery(markTarget, customerJid, {
          followupId: item.followupId,
          status,
          sentMessageId,
          reason,
          attemptKey: item.attemptKey,
          customerLastMessageAt: item.lastMessageAt,
          billingDedupeKey: item.billingDedupeKey,
        });
      } catch (error: any) {
        console.error("[Follow-up Delivery] profile delivery record failed:", error?.message || error);
      }
    }
  }
}

export async function deliverMarketingFollowup(input: DeliverMarketingFollowupInput): Promise<DeliverMarketingFollowupResult> {
  const reportBase = buildReportBase(input);
  await recordForTargets(input, "sending", input.item.customerId);
  input.appendReport({
    ...reportBase,
    status: "sending",
    customerJid: input.item.customerId,
  });

  try {
    const result = await input.sendThroughWorker();
    const customerJid = result.target || input.item.customerId;

    if (result.skipped || result.status === "skipped") {
      const reason = result.reason || "worker skipped follow-up";
      await recordForTargets(input, "skipped", customerJid, reason);
      input.appendReport({
        ...reportBase,
        status: "skipped",
        customerJid,
        reason,
        costCharged: 0,
      });
      return { status: "skipped", reason };
    }

    if (!result.sentMessageId) {
      const reason = result.reason || "Worker did not return a message id.";
      await recordForTargets(input, "failed", customerJid, reason);
      input.appendReport({
        ...reportBase,
        status: "failed",
        customerJid,
        reason,
        costCharged: 0,
      });
      return { status: "failed", reason };
    }

    await recordForTargets(input, "sent", customerJid, "", result.sentMessageId);
    input.appendReport({
      ...reportBase,
      status: "sent",
      customerJid,
      sentMessageId: result.sentMessageId,
      costCharged: Number(result.chargeAmount || 0),
    });
    return { status: "sent", sentMessageId: result.sentMessageId };
  } catch (error: any) {
    const reason = error instanceof Error ? error.message : String(error);
    await recordForTargets(input, "failed", input.item.customerId, reason);
    input.appendReport({
      ...reportBase,
      status: "failed",
      customerJid: input.item.customerId,
      reason,
      costCharged: 0,
    });
    return { status: "failed", reason };
  }
}
