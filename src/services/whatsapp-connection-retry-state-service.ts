export type WhatsAppConnectionRetryState = {
  status: "retrying";
  retryCount: number;
  message: string;
  detail: string;
  nextRetryMs: number;
  reason: string;
};

function clean(value: any, limit = 240) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

export function buildWhatsAppConnectionRetryState(input: {
  retryCount: number;
  reason?: any;
  nextRetryMs?: number;
}): WhatsAppConnectionRetryState {
  const retryCount = Math.max(1, Number(input.retryCount || 1));
  return {
    status: "retrying",
    retryCount,
    message: "Preparing WhatsApp connection",
    detail: "Waiting for QR code or connected status...",
    nextRetryMs: Math.max(1000, Number(input.nextRetryMs || 15000)),
    reason: clean(input.reason),
  };
}
