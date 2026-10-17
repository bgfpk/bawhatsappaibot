import crypto from "crypto";
import fs from "fs";
import path from "path";

export type OutboundSendStatus = "queued" | "sending" | "sent" | "failed" | "skipped" | "duplicate";

export type OutboundSendReceipt = {
  receiptId: string;
  createdAt: number;
  updatedAt: number;
  userId: string;
  botId: string;
  customerJid: string;
  remoteJid: string;
  fromMe: boolean;
  sentTimestamp: number;
  messageType: string;
  contextType: string;
  contextId: string;
  campaignType: string;
  billingAction: string;
  walletChargeAmount: number;
  idempotencyKey: string;
  sendStatus: OutboundSendStatus;
  messageId: string;
  errorReason: string;
  chargeDedupeKey: string;
  charged: boolean;
  duplicateCharge: boolean;
  messageFingerprint: string;
  provider?: string;
  templateName?: string;
  templateLanguage?: string;
  providerStatus?: "sent" | "delivered" | "read" | "failed" | "deleted" | string;
  providerStatusUpdatedAt?: number;
  providerErrorCode?: string;
};

const RECEIPT_DIR = path.join(process.cwd(), "data", "outbound-send-receipts");
const ALERT_LOG = path.join(RECEIPT_DIR, "_alerts.log");
const RECEIPT_RETENTION_MS = 45 * 24 * 60 * 60 * 1000;
const MAX_RECEIPT_FILES = 50000;
let lastPruneAt = 0;

function clean(value: any) {
  return String(value || "").trim();
}

function nowMs() {
  return Date.now();
}

function ensureDir() {
  fs.mkdirSync(RECEIPT_DIR, { recursive: true });
}

function receiptPath(receiptId: string) {
  return path.join(RECEIPT_DIR, `${receiptId}.json`);
}

export function buildOutboundReceiptId(idempotencyKey: string) {
  return crypto.createHash("sha1").update(clean(idempotencyKey)).digest("hex").slice(0, 24);
}

export function buildOutboundMessageFingerprint(value: string) {
  return crypto.createHash("sha1").update(clean(value)).digest("hex").slice(0, 16);
}

export function appendOutboundReceiptAlert(kind: string, details: Record<string, any>) {
  try {
    ensureDir();
    const safe = {
      at: nowMs(),
      kind: clean(kind),
      alertType: clean(kind),
      receiptId: clean(details.receiptId),
      idempotencyKey: clean(details.idempotencyKey),
      messageId: clean(details.messageId),
      botId: clean(details.botId),
      customerJid: clean(details.customerJid),
      reason: clean(details.reason),
      billingAction: clean(details.billingAction),
      chargeAmount: details.chargeAmount,
      details: { ...details },
    };
    fs.appendFileSync(ALERT_LOG, `${JSON.stringify(safe)}\n`, "utf8");
  } catch {}
}

export function listOutboundReceiptAlerts(receiptId?: string): any[] {
  try {
    if (!fs.existsSync(ALERT_LOG)) return [];
    const raw = fs.readFileSync(ALERT_LOG, "utf8");
    const items = raw.split("\n").filter(Boolean).map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
    if (!receiptId) return items;
    return items.filter((item: any) => item.receiptId === receiptId);
  } catch {
    return [];
  }
}

export function clearOutboundReceiptAlertsForTest() {
  try {
    if (fs.existsSync(ALERT_LOG)) {
      fs.unlinkSync(ALERT_LOG);
    }
  } catch {}
}

function pruneOutboundReceiptsIfNeeded() {
  const now = nowMs();
  if (now - lastPruneAt < 60 * 60 * 1000) return;
  lastPruneAt = now;
  try {
    ensureDir();
    const entries = fs.readdirSync(RECEIPT_DIR)
      .filter((file) => file.endsWith(".json"))
      .map((file) => {
        const fullPath = path.join(RECEIPT_DIR, file);
        try {
          const parsed = JSON.parse(fs.readFileSync(fullPath, "utf8"));
          return {
            fullPath,
            updatedAt: Number(parsed?.updatedAt || parsed?.createdAt || 0),
          };
        } catch {
          return { fullPath, updatedAt: 0 };
        }
      })
      .sort((a, b) => a.updatedAt - b.updatedAt);

    const staleCutoff = now - RECEIPT_RETENTION_MS;
    for (const entry of entries) {
      if (entry.updatedAt > staleCutoff) break;
      fs.rmSync(entry.fullPath, { force: true });
    }

    const remaining = fs.readdirSync(RECEIPT_DIR).filter((file) => file.endsWith(".json"));
    if (remaining.length > MAX_RECEIPT_FILES) {
      const overflow = remaining.length - MAX_RECEIPT_FILES;
      const oldest = entries.slice(0, overflow);
      for (const entry of oldest) {
        fs.rmSync(entry.fullPath, { force: true });
      }
    }
  } catch {}
}

export function readOutboundReceipt(receiptId: string): OutboundSendReceipt | null {
  try {
    const file = receiptPath(receiptId);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

export function findOutboundReceiptByIdempotencyKey(idempotencyKey: string) {
  return readOutboundReceipt(buildOutboundReceiptId(idempotencyKey));
}

export function findOutboundReceiptByMessageId(
  messageId: string,
  scope?: { botId?: string; userId?: string }
): OutboundSendReceipt | null {
  const cleanId = clean(messageId);
  if (!cleanId) return null;
  const receipts = listOutboundReceipts();
  return (
    receipts.find((r) => {
      if (r.messageId !== cleanId) return false;
      if (scope?.botId && r.botId !== clean(scope.botId)) return false;
      if (scope?.userId && r.userId !== clean(scope.userId)) return false;
      return true;
    }) || null
  );
}

export function updateOutboundReceiptProviderStatus(
  messageId: string,
  providerStatus: string,
  details: {
    botId?: string;
    userId?: string;
    errorCode?: string;
    timestamp?: number;
  } = {}
): OutboundSendReceipt | null {
  const receipt = findOutboundReceiptByMessageId(messageId, {
    botId: details.botId,
    userId: details.userId,
  });
  if (!receipt) return null;

  const nextStatus = clean(providerStatus).toLowerCase();
  const patch: Partial<OutboundSendReceipt> = {
    providerStatus: nextStatus,
    providerStatusUpdatedAt: details.timestamp || nowMs(),
  };
  if (details.errorCode) {
    patch.providerErrorCode = clean(details.errorCode);
  }

  return updateOutboundReceipt(receipt.receiptId, patch);
}

export function saveOutboundReceipt(receipt: OutboundSendReceipt) {
  ensureDir();
  pruneOutboundReceiptsIfNeeded();
  ensureDir();
  fs.writeFileSync(receiptPath(receipt.receiptId), JSON.stringify(receipt, null, 2), "utf8");
  return receipt;
}

export function createOutboundReceiptAttempt(input: {
  userId?: string;
  botId?: string;
  customerJid: string;
  remoteJid?: string;
  messageType: string;
  contextType?: string;
  contextId?: string;
  campaignType?: string;
  billingAction?: string;
  walletChargeAmount?: number;
  idempotencyKey: string;
  chargeDedupeKey?: string;
  messageFingerprint?: string;
  provider?: string;
  templateName?: string;
  templateLanguage?: string;
}) {
  const receiptId = buildOutboundReceiptId(input.idempotencyKey);
  const existing = readOutboundReceipt(receiptId);
  if (existing) return existing;
  const timestamp = nowMs();
  return saveOutboundReceipt({
    receiptId,
    createdAt: timestamp,
    updatedAt: timestamp,
    userId: clean(input.userId),
    botId: clean(input.botId),
    customerJid: clean(input.customerJid),
    remoteJid: clean(input.remoteJid || input.customerJid),
    fromMe: true,
    sentTimestamp: 0,
    messageType: clean(input.messageType || "text"),
    contextType: clean(input.contextType || "generic"),
    contextId: clean(input.contextId),
    campaignType: clean(input.campaignType),
    billingAction: clean(input.billingAction),
    walletChargeAmount: Math.max(0, Number(input.walletChargeAmount || 0)),
    idempotencyKey: clean(input.idempotencyKey),
    sendStatus: "queued",
    messageId: "",
    errorReason: "",
    chargeDedupeKey: clean(input.chargeDedupeKey),
    charged: false,
    duplicateCharge: false,
    messageFingerprint: clean(input.messageFingerprint),
    provider: clean(input.provider) || undefined,
    templateName: clean(input.templateName) || undefined,
    templateLanguage: clean(input.templateLanguage) || undefined,
  });
}

export function updateOutboundReceipt(receiptId: string, patch: Partial<OutboundSendReceipt>) {
  const current = readOutboundReceipt(receiptId);
  if (!current) return null;
  const next = {
    ...current,
    ...patch,
    updatedAt: nowMs(),
  };
  return saveOutboundReceipt(next);
}

export function listOutboundReceipts() {
  try {
    ensureDir();
    return fs.readdirSync(RECEIPT_DIR)
      .filter((file) => file.endsWith(".json"))
      .map((file) => {
        try {
          return JSON.parse(fs.readFileSync(path.join(RECEIPT_DIR, file), "utf8"));
        } catch {
          return null;
        }
      })
      .filter(Boolean) as OutboundSendReceipt[];
  } catch {
    return [];
  }
}

export function countSuccessfulOutboundReceipts(filter: Partial<Pick<OutboundSendReceipt, "userId" | "botId" | "billingAction">> = {}) {
  return listOutboundReceipts().filter((receipt) => {
    if (receipt.sendStatus !== "sent") return false;
    if (filter.userId && receipt.userId !== filter.userId) return false;
    if (filter.botId && receipt.botId !== filter.botId) return false;
    if (filter.billingAction && receipt.billingAction !== filter.billingAction) return false;
    return true;
  }).length;
}

export function clearOutboundReceipts() {
  try {
    ensureDir();
    const files = fs.readdirSync(RECEIPT_DIR);
    for (const file of files) {
      try {
        fs.unlinkSync(path.join(RECEIPT_DIR, file));
      } catch {}
    }
  } catch {}
}
