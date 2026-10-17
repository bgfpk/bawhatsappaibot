export const CUSTOMER_CONVERSATION_LEDGER_LIMIT = 100;
export const GROUP_CONVERSATION_LEDGER_LIMIT = 50;
export const TEMPLATE_CONVERSATION_LEDGER_LIMIT = 1000;

function getLedgerMessageId(message: any) {
  return String(message?.key?.id || "");
}

export function appendMessageToConversationLedger(
  ledger: Record<string, any[]>,
  jid: string,
  message: any,
  options: { limit?: number } = {},
) {
  if (!jid || !message?.message) return false;

  const limit = options.limit || CUSTOMER_CONVERSATION_LEDGER_LIMIT;
  const existing = Array.isArray(ledger[jid]) ? ledger[jid] : [];
  const messageId = getLedgerMessageId(message);
  const alreadyRecorded = messageId
    ? existing.some((entry) => getLedgerMessageId(entry) === messageId)
    : existing.includes(message);

  if (!alreadyRecorded) {
    existing.push(message);
  }

  const trimmed = limit > 0 && existing.length > limit;
  ledger[jid] = trimmed ? existing.slice(-limit) : existing;

  return !alreadyRecorded || trimmed;
}
