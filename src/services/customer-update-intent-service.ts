import * as dbService from "./db-service.ts";
import { findUnavailableBackInStockTarget } from "./stock-reminder-target-service.ts";

function hasBackInStockReminderIntent(value: string) {
  const text = String(value || "").toLowerCase();
  if (!text.trim()) return false;
  if (/\b(do not|don't|dont)\s+(?:please\s+)?remind\b/.test(text)) return false;

  const wantsReminder = /\b(remind|notify|notification|inform|message|msg|text|update|tell|ping|know)\b/.test(text) ||
    /\b(let me know|bata|btana|batana|yaad|khabar|ittila|itla)\b/.test(text);
  const stockContext = /\b(stock|in stock|back in stock|available|availability|restock|re-stock|wapas|wapis|maujood)\b/.test(text);
  return wantsReminder && stockContext;
}

function hasUnavailableProductRequestContext(value: string) {
  const text = String(value || "").toLowerCase();
  if (!text.trim()) return false;
  return /\b(stock|available|availability|maujood|milega|milay|chahiye|chaheye|want|need|buy|order|color|colour|size|option|variant)\b/.test(text);
}

function getHistoryTextForStockLookup(message: any) {
  if (!message) return "";
  if (typeof message === "string") return message;
  if (typeof message.text === "string") return message.text;
  const body = message.message || {};
  const directText = body.conversation || body.extendedTextMessage?.text || body.imageMessage?.caption || "";
  const quoted = body.extendedTextMessage?.contextInfo?.quotedMessage;
  const quotedText = quoted?.conversation || quoted?.extendedTextMessage?.text || quoted?.imageMessage?.caption || "";
  return [quotedText, directText].filter(Boolean).join(" ");
}

export async function maybeSaveBackInStockReminder(input: {
  products: any[];
  latestText: string;
  history?: any[];
  dataOwnerKey: string;
  customerJid: string;
  io?: any;
}) {
  const explicitReminder = hasBackInStockReminderIntent(input.latestText);
  if (!explicitReminder && !hasUnavailableProductRequestContext(input.latestText)) return false;
  const contextText = [
    ...(input.history || []).slice(-16).map(getHistoryTextForStockLookup),
    input.latestText,
  ].filter(Boolean).join("\n");
  const lookupText = explicitReminder ? contextText : input.latestText;
  const target = findUnavailableBackInStockTarget(input.products, lookupText);
  if (!target?.productId || !target?.productName) {
    if (explicitReminder) {
      input.io?.emit("system-log", { type: "warning", msg: "[Stock] Customer asked for a stock reminder, but no unavailable catalog product matched the recent chat." });
    }
    return false;
  }

  const saved = await dbService.saveBackInStockRequest(input.dataOwnerKey, input.customerJid, target.productId, target.productName);
  if (saved) input.io?.emit("system-log", { type: "info", msg: `[Stock] Back-in-stock reminder saved for ${target.productName}.` });
  return saved;
}
