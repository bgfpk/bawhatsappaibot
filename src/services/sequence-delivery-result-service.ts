export type SequenceItemStatus =
  | "sent"
  | "skipped"
  | "duplicate"
  | "failed"
  | "blocked"
  | "insufficient_wallet"
  | "expired_subscription"
  | "invalid_media";

export type SequenceItemResult = {
  status: SequenceItemStatus | string;
  messageId?: string;
  reason?: string;
  receiptId?: string;
  charged?: boolean;
  duplicateCharge?: boolean;
};

export function normalizeSequenceItemResult(result: any): SequenceItemResult {
  if (!result || typeof result !== "object") {
    return { status: "failed", reason: "missing_relay_result" };
  }
  const status = String(result.status || (result.messageId ? "sent" : "failed") || "failed").trim().toLowerCase();
  return {
    ...result,
    status,
    messageId: String(result.messageId || ""),
    reason: String(result.reason || result.error || "").trim(),
  };
}

export function isSequenceItemDelivered(result: any) {
  const normalized = normalizeSequenceItemResult(result);
  const hasEvidence = Boolean(normalized.messageId || normalized.receiptId);
  return hasEvidence && (normalized.status === "sent" || normalized.status === "duplicate");
}

export function summarizeSequenceItemResults(results: any[]) {
  const normalized = (Array.isArray(results) ? results : []).map(normalizeSequenceItemResult);
  const total = normalized.length;
  const sent = normalized.filter(isSequenceItemDelivered).length;
  const failed = normalized.filter((item) => item.status === "failed").length;
  const skipped = normalized.filter((item) => item.status === "skipped" || item.status === "duplicate").length;
  const complete = total > 0 && sent === total;
  const reason = complete
    ? ""
    : normalized
        .map((item, index) => `${index + 1}:${item.status}${item.reason ? `:${item.reason}` : ""}`)
        .join(", ");
  return { total, sent, failed, skipped, complete, reason, results: normalized };
}
