import { renderAiCustomerSummaryJson } from "./customer-summary-renderer.ts";

export const COMBINED_REPLY_MEMORY_FOR_SIMPLE_TEXT =
  String(process.env.COMBINED_REPLY_MEMORY_FOR_SIMPLE_TEXT ?? "true").trim().toLowerCase() !== "false";

function clean(value: any, limit = 1200) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function parseJsonObject(value: any) {
  if (value && typeof value === "object") return value;
  const text = String(value || "")
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("invalid_combined_reply_memory_json");
  return JSON.parse(text.slice(start, end + 1));
}

export function parseCombinedReplyMemoryJson(value: any) {
  const parsed = parseJsonObject(value);
  const reply = clean(parsed?.reply, 2400);
  if (!reply) throw new Error("missing_combined_reply");
  return {
    reply,
    customerMemoryUpdate: parsed?.customerMemoryUpdate || {},
  };
}

export function renderCombinedCustomerMemoryUpdate(value: any) {
  return renderAiCustomerSummaryJson({
    currentFacts: value?.currentFacts || [],
    timeline: value?.timeline || [],
    pendingNextStep: value?.pendingNextStep || [],
    notes: value?.notes || [],
    languagePreference: value?.languagePreference || "",
    doNotAskAgain: value?.doNotAskAgain || [],
  });
}

export function buildCombinedReplyMemoryInstruction() {
  return `
For this safe simple text turn, return strict JSON only:
{
  "reply": "customer-facing WhatsApp reply only",
  "customerMemoryUpdate": {
    "currentFacts": [],
    "timeline": [],
    "pendingNextStep": [],
    "notes": [],
    "languagePreference": "",
    "doNotAskAgain": []
  }
}
Rules:
- The reply must be the only customer-facing message text.
- Never include customerMemoryUpdate, JSON, hidden notes, tools, or summary labels inside reply.
- Memory arrays must contain only specific facts from this turn and saved context.
- Do not paste transcript, use "Customer said:", or write generic BlackArrow marketing copy.
- Max 8 current facts, 5 timeline items, 4 pending items, 4 notes.
`.trim();
}

export function shouldUseCombinedReplyMemoryForSimpleText(input: {
  enabled?: boolean;
  lastUserMsgText?: any;
  lastUserMsgIsVoice?: boolean;
  lastUserMsgHasImage?: boolean;
  lastUserMsgIsSticker?: boolean;
  activeCustomerRecord?: any;
  earlyDraftRecord?: any;
  sequenceBlockReason?: any;
  hasActiveSequences?: boolean;
}) {
  if (!COMBINED_REPLY_MEMORY_FOR_SIMPLE_TEXT || input.enabled === false) return false;
  if (input.hasActiveSequences) return false;
  const text = clean(input.lastUserMsgText, 500);
  if (!text || input.lastUserMsgIsVoice || input.lastUserMsgHasImage || input.lastUserMsgIsSticker) return false;
  if (input.activeCustomerRecord?.order_data || input.earlyDraftRecord) return false;
  if (clean(input.sequenceBlockReason)) return false;
  if (/\b(order|buy|book|confirm|address|delivery|city|phone|number|price|rate|cost|stock|available|image|photo|pic|video|media|catalog|voice|audio|lead|appointment)\b/i.test(text)) return false;
  return true;
}
