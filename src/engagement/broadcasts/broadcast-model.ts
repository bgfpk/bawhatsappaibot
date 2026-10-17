import { USAGE_BILLING } from "../../config/pricing";

export interface BroadcastRecipient {
  id: string;
  name?: string;
  phone: string;
  jid?: string;
  isValid: boolean;
  isDuplicate?: boolean;
}

export interface BroadcastCampaignItem {
  id: string;
  title: string;
  audienceCount: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  status: "completed" | "in_progress" | "failed" | "cancelled" | "pending";
  createdAt: number | string;
  instanceName?: string;
  chargedAmount?: number;
}

export function deduplicateRecipients(recipients: BroadcastRecipient[]): BroadcastRecipient[] {
  const seenPhones = new Set<string>();
  const clean: BroadcastRecipient[] = [];

  for (const r of recipients) {
    const sanitizedPhone = r.phone.replace(/[^0-9]/g, "");
    if (!sanitizedPhone) continue;

    if (seenPhones.has(sanitizedPhone)) {
      clean.push({ ...r, isDuplicate: true });
    } else {
      seenPhones.add(sanitizedPhone);
      clean.push({ ...r, isDuplicate: false });
    }
  }

  return clean;
}

export function calculateEstimatedCost(recipientCount: number): number {
  const perMessageRate = USAGE_BILLING.broadcast_tracking_text.priceUsd;
  return Number((recipientCount * perMessageRate).toFixed(3));
}
