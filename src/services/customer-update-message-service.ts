const OLD_AMBIGUOUS_FOLLOWUP_MESSAGE =
  "Assalam-o-Alaikum! Aap ne kaha tha main aapko later message karun. Main follow up kar raha/rahi hoon. Aap bata dein kaise help kar sakta/sakti hoon.";

const DEFAULT_PLANNED_CUSTOMER_UPDATE_MESSAGE =
  "Assalam-o-Alaikum! Aap ne kaha tha baad mein message kar doon. Follow up ke liye message kar diya hai. Aap bata dein aage kaise help chahiye.";

function cleanText(value: any, fallback = "") {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text || fallback;
}

export function buildDefaultPlannedCustomerUpdateMessage() {
  return DEFAULT_PLANNED_CUSTOMER_UPDATE_MESSAGE;
}

export function normalizePlannedCustomerUpdateMessage(value: any) {
  const message = cleanText(value);
  if (!message) return "";
  if (message === OLD_AMBIGUOUS_FOLLOWUP_MESSAGE) return DEFAULT_PLANNED_CUSTOMER_UPDATE_MESSAGE;
  if (/raha\/rahi|sakta\/sakti/i.test(message)) return DEFAULT_PLANNED_CUSTOMER_UPDATE_MESSAGE;
  return message;
}

export function cleanBackInStockProductName(value: any) {
  return cleanText(value, "requested product").slice(0, 240);
}

export function buildBackInStockUpdateMessage(productName: any) {
  const name = cleanBackInStockProductName(productName);
  return `Assalam-o-Alaikum! Khushkhabri! Aapka matlooba product "${name}" ab stock mein wapas aa gaya hai. Aap abhi apna order confirm kar sakte hain.`;
}

export function buildBackInStockSummary(productName: any) {
  return `Notify customer when ${cleanBackInStockProductName(productName)} is back in stock.`;
}
