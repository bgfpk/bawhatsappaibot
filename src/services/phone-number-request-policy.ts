import { isLidOnlyCustomer, shouldRequestPhoneNumber } from "./phone-number-consent-service.ts";

const INTEREST_KEYWORDS = [
  "price",
  "rate",
  "cost",
  "how much",
  "buy",
  "order",
  "book",
  "confirm",
  "delivery",
  "shipping",
  "address",
  "location",
  "available",
  "stock",
  "details",
  "interested",
  "service",
  "product",
  "package",
  "plan",
  "demo",
  "setup",
  "bot",
  "automation",
  "website",
  "invoice",
  "kitna",
  "kitne",
  "qeemat",
  "lena",
  "chahiye",
  "chahye",
  "chaiye",
  "mujhe",
  "دستیاب",
  "قیمت",
  "ریٹ",
  "آرڈر",
  "خرید",
  "ڈیلیوری",
  "ایڈریس",
  "چاہیے",
  "چاہئے",
];

function normalizeText(value: any) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function getHistoryKey(message: any, index: number) {
  return message?.messageId || `${message?.role || ""}:${normalizeText(message?.text).slice(0, 80)}:${message?.timestamp || index}`;
}

export function countRecentCustomerMessages(history: any[] = []) {
  const seen = new Set<string>();
  let count = 0;
  history.slice(-10).forEach((message, index) => {
    if (message?.role !== "user") return;
    const text = normalizeText(message?.text);
    if (!text || text === "[shared whatsapp number]") return;
    const key = getHistoryKey(message, index);
    if (seen.has(key)) return;
    seen.add(key);
    count++;
  });
  return count;
}

export function hasInterestSignal(text: any) {
  const normalized = normalizeText(text);
  if (!normalized || normalized === "voice message" || normalized === "media") return false;
  if (normalized.includes("?")) return true;
  return INTEREST_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

export function getPhoneNumberRequestDecision(input: {
  jid: string;
  profile?: any;
  text?: string;
  recentHistory?: any[];
  nowSeconds?: number;
}) {
  const { jid, profile = {}, text = "", recentHistory = [], nowSeconds = Math.floor(Date.now() / 1000) } = input;
  if (!isLidOnlyCustomer(jid, profile)) return { shouldRequest: false, reason: "not_lid_only" };
  if (!shouldRequestPhoneNumber(profile, nowSeconds)) return { shouldRequest: false, reason: "cooldown_or_verified" };
  const customerMessageCount = countRecentCustomerMessages(recentHistory);
  if (customerMessageCount >= 2) {
    return {
      shouldRequest: true,
      reason: hasInterestSignal(text) ? "engaged_customer_message" : "second_customer_message",
    };
  }
  return { shouldRequest: false, reason: "not_enough_engagement" };
}
