import { hasDeliveredFollowupResponse } from "./followup-campaign-service.ts";

type SendFollowupInput = {
  port: number;
  customerId: string;
  sourceCustomerId?: string;
  offerContext?: string;
  campaignName?: string;
  campaignType?: string;
  followupId?: string;
  attemptKey?: string;
  billingDedupeKey?: string;
  triggerLastMessageAt?: number;
  attempts?: number;
  delayMs?: number;
};

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryFollowupSend(error: Error, attempt: number, attempts: number) {
  if (attempt >= attempts) return false;
  const message = error.message.toLowerCase();
  return message.includes("whatsapp not connected") ||
    message.includes("fetch failed") ||
    message.includes("econnrefused") ||
    message.includes("socket hang up") ||
    message.includes("worker returned 502");
}

function shouldTryAlternateTarget(error: Error) {
  const message = error.message.toLowerCase();
  return message.includes("jid") ||
    message.includes("recipient") ||
    message.includes("not on whatsapp") ||
    message.includes("bad request") ||
    message.includes("cannot resolve");
}

export async function sendFollowupThroughWorker(input: SendFollowupInput) {
  const attempts = Math.max(1, input.attempts || 4);
  const delayMs = Math.max(1000, input.delayMs || 5000);
  let lastError: Error | null = null;
  const targets = Array.from(new Set([input.customerId, input.sourceCustomerId].filter(Boolean)));

  for (const target of targets) {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const sendResponse = await fetch(`http://127.0.0.1:${input.port}/api/bot/send-message`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: target,
            sourceCustomerId: input.sourceCustomerId || target,
            followup: {
              enabled: true,
              campaignName: input.campaignName || "",
              campaignType: input.campaignType || "",
              followupId: input.followupId || "",
              attemptKey: input.attemptKey || "",
              billingDedupeKey: input.billingDedupeKey || "",
              triggerLastMessageAt: input.triggerLastMessageAt || 0,
            },
            offerContext: input.offerContext,
          }),
        });

        if (!sendResponse.ok) {
          const errorText = await sendResponse.text().catch(() => "");
          throw new Error(errorText || `Worker returned ${sendResponse.status}`);
        }

        const result = await sendResponse.json().catch(() => null);
        if (result?.skipped) {
          return { ...result, target, skipped: true, status: result?.status || "skipped" };
        }
        if (!hasDeliveredFollowupResponse(result)) {
          throw new Error(result?.error || "Worker did not confirm a WhatsApp message id.");
        }

        return { ...result, target, status: result?.status || "sent" };
      } catch (error: any) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (!shouldRetryFollowupSend(lastError, attempt, attempts)) break;
        await delay(delayMs);
      }
    }
    if (lastError && !shouldTryAlternateTarget(lastError)) break;
  }

  throw lastError || new Error("Follow-up send failed.");
}
