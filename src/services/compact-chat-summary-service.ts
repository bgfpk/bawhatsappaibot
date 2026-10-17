import { compactAiText } from "./ai-cost-control-service.ts";
import { buildWelcomeSequenceTimelineLine } from "./welcome-sequence-status-service.ts";

function clean(value: any) {
  return String(value || "").trim();
}

function normalize(value: any) {
  return clean(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function short(value: any, limit = 110) {
  return compactAiText(value, limit);
}

function asSentence(value: any, limit = 120) {
  const text = short(value, limit).replace(/[.!?؟۔]*$/, "").trim();
  return text ? `${text}.` : "";
}

function summarizeActualMessage(role: string, text: string) {
  const cleaned = short(text.replace(/\s+/g, " "), 120);
  if (!cleaned) return "";
  if (role === "user") {
    if (cleaned.length < 8 && /^(ok|okay|yes|no|ji|jee|haan|han|hmm)$/i.test(cleaned)) return "";
    if (/\berror\b|\bissue\b|\bproblem\b|\bnot working\b|\bshowing\b|\bbrowser\b|\bcookies?\b/i.test(cleaned)) {
      return "Customer reported a setup/browser error.";
    }
    if (/\bcleared?\s+cookies?\b|\bcookies?\s+clear/i.test(cleaned)) return "Customer confirmed cookies were cleared.";
    if (/\?/.test(cleaned)) return `Customer asked: ${asSentence(cleaned)}`;
    return /[\p{L}\p{N}]{12,}/u.test(cleaned) ? `Customer shared: ${asSentence(cleaned)}` : "";
  }
  if (/^(ok|okay|yes|no|ji|jee|haan|han|hmm)[.!]?$/i.test(cleaned)) return "";
  if (/\b(clear|clearing)\s+cookies?\b|\bcache\b|\bbrowser\b|\binternet\b|\brefresh\b/i.test(cleaned)) {
    return "AI guided customer through checking internet and clearing cookies.";
  }
  if (/\btrial\b|\bsign\s*up\b|\bsignup\b/i.test(cleaned)) return "AI shared trial/signup guidance.";
  if (/\bsetup\b|\bqr\b|\btutorial\b/i.test(cleaned)) return "AI provided setup guidance.";
  return "";
}

function inferCustomerNeed(text: string) {
  if (/\berror\b|\bissue\b|\bproblem\b|\bnot working\b|\bshowing\b|\bbrowser\b|\bcookies?\b/i.test(text)) return "Customer reported a setup/browser error.";
  if (/video|pic|photo|image|tasveer|dekh|check|details?/i.test(text)) return "Customer asked for product or service details.";
  if (/price|rate|cost|kitna|qeemat|rs\.?|pkr/i.test(text)) return "Customer asked about pricing.";
  if (/available|stock|mil/i.test(text)) return "Customer asked about availability.";
  if (/address|location|deliver|shipping|city|plot|street|road|karachi|lahore|islamabad|faisalabad|rawalpindi/i.test(text)) {
    return /\?|\b(can|could|when|timing|time|change|update)\b/i.test(text)
      ? `Customer asked: ${short(text, 120)}`
      : "Customer shared or asked about delivery details.";
  }
  if (/confirm|order|book|done|final|kar dein|laga do/i.test(text)) return "Customer moved toward order confirmation.";
  return "";
}

function buildSpecificConversationTimelineLine(entry: any, previousEntry: any) {
  const role = normalize(entry?.role);
  const text = clean(entry?.text);
  const previousText = clean(previousEntry?.text);
  if (!text) return "";

  if (role === "user" && /\border limit\b/i.test(text)) {
    return /starter/i.test(text) ? "Customer asked about the Starter plan order limit." : "Customer asked about the order limit.";
  }
  if (role === "model" && /\b300\b/i.test(text) && /\border/i.test(text) && /\$?\s*9\s*\/\s*month|\$?\s*9\s*month/i.test(text) && /\$?\s*65\s*\/\s*year|\$?\s*65\s*year/i.test(text)) {
    return "AI explained Starter includes 300 orders/month and costs $9/month or $65/year.";
  }
  if (role === "user" && /^(yes|yes it works|the limit works|that works|works for me|ok yes|okay yes)$/i.test(text) && /\blimit works\b|\bdoes (that|this) limit work\b|\bwill this limit work\b/i.test(previousText)) {
    return "Customer said the order limit works.";
  }
  if (role === "model" && /\btrial\b/i.test(text) && /\b7[- ]?day\b/i.test(text)) {
    return "AI guided customer to start the 7-day free trial.";
  }
  if (role === "user" && /\bhow to setup\b|\bhow do i setup\b|\bsetup\b/i.test(text)) {
    return "Customer asked how to set up BlackArrow.";
  }
  if (role === "model" && /\bsetup\b|\baccount creation\b|\bqr\b|\btutorial\b/i.test(text)) {
    return "AI explained account creation, WhatsApp QR connection, business details, and shared the tutorial video.";
  }
  return "";
}

function buildOrderTimelineLine(latestOrder: any, state: any) {
  const product = clean(latestOrder?.productName || state?.product);
  if (!product) return "";
  const option = clean(latestOrder?.variation || state?.variant);
  const quantity = clean(latestOrder?.quantity);
  const total = clean(latestOrder?.priceText || state?.priceText || latestOrder?.totalPrice);
  return [
    "Order confirmed",
    product ? `for ${product}` : "",
    option ? `(${option})` : "",
    quantity ? `qty ${quantity}` : "",
    total ? `total ${total}` : "",
  ].filter(Boolean).join(" ").replace(/\s+\(/, " (") + ".";
}

function capTimeline(lines: string[], limit = 8) {
  if (lines.length <= limit) return lines;
  const headCount = Math.min(3, limit);
  const tailCount = limit - headCount;
  const selected = [...lines.slice(0, headCount), ...lines.slice(-tailCount)];
  const seen = new Set<string>();
  return selected.filter((line) => {
    const key = normalize(line);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);
}

export function summarizeTimelineEvent(entry: any) {
  const role = normalize(entry?.role);
  const text = clean(entry?.text);
  if (!text) return "";

  if (/^\[manual media caption\]\s*:/i.test(text)) return "Owner manually sent media context.";
  if (/^\[manual voice note sent\]$/i.test(text)) return "Owner manually sent a voice note.";
  if (/^voice note received,\s*transcript unavailable\.?$/i.test(text)) return "";
  if (/^voice note:\s*/i.test(text) && role === "user") {
    const meaning = short(text.replace(/^voice note:\s*/i, ""), 180);
    return meaning ? `Customer voice note: ${asSentence(meaning, 180)}` : "";
  }
  if (/customer sent a sticker reaction/i.test(text) || /^\[sticker/i.test(text)) return "Customer sent a sticker reaction.";
  if (/possible card\/image details|extracted card\/image details/i.test(text)) return "Customer sent a card/image; possible business or address details were extracted.";
  if (/^order confirmed\./i.test(text)) return "AI confirmed the order and shared the final summary.";
  if (/please share your .* to complete the order/i.test(text)) return "AI asked for the remaining order details.";
  if (/my name is|^name\s*:|^phone\s*:|address\s*:/i.test(text) && role === "user") return "Customer shared identity or delivery details.";
  if (role === "user") return inferCustomerNeed(text) || summarizeActualMessage(role, text);
  return summarizeActualMessage(role, text);
}

export function buildCompactTimeline(input: { history?: any[]; profile?: any; latestOrder?: any; state?: any }) {
  const lines: string[] = [];
  const seen = new Set<string>();

  const history = input.history || [];
  for (const [index, entry] of history.entries()) {
    const nextText = clean(history[index + 1]?.text);
    let summary = buildSpecificConversationTimelineLine(entry, history[index - 1]) || summarizeTimelineEvent(entry);
    if (summary === "Customer asked about the order limit." && /\bstarter\b|\b300\b/i.test(nextText)) {
      summary = "Customer asked about the Starter plan order limit.";
    }
    const key = normalize(summary);
    if (!summary || seen.has(key)) continue;
    seen.add(key);
    lines.push(summary);
  }

  const profileImageNote = clean(input.profile?.lastImageContextNote);
  if (profileImageNote) {
    const line = "Customer sent a card/image; possible business or address details were extracted.";
    const key = normalize(line);
    if (!seen.has(key)) {
      seen.add(key);
      lines.push(line);
    }
  }

  const profileStickerNote = clean(input.profile?.lastStickerSummary);
  if (profileStickerNote) {
    const key = normalize(profileStickerNote);
    if (!seen.has(key)) {
      seen.add(key);
      lines.push(profileStickerNote);
    }
  }

  const customerUpdateStatus = clean(input.profile?.lastCustomerUpdateStatus);
  if (customerUpdateStatus) {
    const customerUpdateReason = clean(input.profile?.lastCustomerUpdateReason);
    const line = customerUpdateStatus === "sent"
      ? "Customer update sent."
      : `Customer update skipped${customerUpdateReason ? `: ${short(customerUpdateReason, 80)}` : "."}`;
    const key = normalize(line);
    if (!seen.has(key)) {
      seen.add(key);
      lines.push(line);
    }
  }

  if (String(input.state?.orderStatus || "") === "confirmed" || input.latestOrder?.orderReferenceNumber) {
    const line = buildOrderTimelineLine(input.latestOrder, input.state);
    const key = normalize(line);
    if (line && !seen.has(key)) lines.push(line);
  }

  const welcomeLine = buildWelcomeSequenceTimelineLine(input.profile);
  const welcomeKey = normalize(welcomeLine);
  if (welcomeLine && !seen.has(welcomeKey) && !/skipped|pending|failed/i.test(welcomeLine)) seen.add(welcomeKey);

  return capTimeline(lines, 5);
}
