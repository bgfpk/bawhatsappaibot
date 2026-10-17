import { parseCustomerProfile } from "../utils/whatsapp-jid.ts";

type CampaignStatRow = {
  sent: number;
  orders: number;
  sentKeys: Set<string>;
  orderKeys: Set<string>;
};

function normalizeTime(value: any) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return numeric > 100000000000 ? Math.floor(numeric / 1000) : Math.floor(numeric);
}

export function collectSuccessfulFollowupStats(input: {
  customer: any;
  botId: string;
  getCampaign: (campaignKey: string) => CampaignStatRow | undefined;
  hasCustomerOrder: (customer: any, profile: any) => boolean;
  countSent?: boolean;
}) {
  const profile = parseCustomerProfile(input.customer?.profile);
  const deliveries = profile?.followupDeliveries && typeof profile.followupDeliveries === "object"
    ? profile.followupDeliveries
    : {};
  const customerKey = String(input.customer?.customer_id || input.customer?.$id || input.customer?.id || "");

  let totalSent = 0;
  for (const [followupId, delivery] of Object.entries(deliveries)) {
    if (!delivery || typeof delivery !== "object") continue;
    if (String((delivery as any).status || "") !== "sent") continue;

    totalSent += 1;
    const attemptKey = String((delivery as any).attemptKey || "");
    const statKey = `${customerKey}:${followupId}:${attemptKey || "sent"}`;
    const campaign = input.getCampaign(`${input.botId}:${followupId}`);
    if (!campaign || campaign.sentKeys.has(statKey)) continue;

    campaign.sentKeys.add(statKey);
    if (input.countSent !== false) {
      campaign.sent += 1;
    }

    const sentAt = normalizeTime((delivery as any).sentAt || (delivery as any).timestamp || 0);
    const orderAt = normalizeTime(input.customer?.last_order_at || profile?.lastOrderAt || profile?.last_order_at || 0);
    if (input.hasCustomerOrder(input.customer, profile) && (!sentAt || !orderAt || orderAt >= sentAt) && !campaign.orderKeys.has(statKey)) {
      campaign.orderKeys.add(statKey);
      campaign.orders += 1;
    }
  }

  return {
    totalSent,
    timestamp: normalizeTime(input.customer?.last_message_at || input.customer?.$updatedAt || input.customer?.updated_at),
  };
}
