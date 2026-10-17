import { detectCustomerActualLanguage } from "./customer-language-preference-service.ts";
import { isInternalHistoryText } from "./chat-history-sanitizer.ts";
import { extractConfiguredCustomFieldState, mergeCustomFieldRecords } from "./custom-field-state-service.ts";
import { isLikelyBusinessName, pickPreferredCustomerName, sanitizeCustomerNameCandidate } from "./customer-identity-service.ts";

export type CustomerOrderState = {
  customerName: string;
  customerPhone: string;
  businessName: string;
  businessContacts: string[];
  cardExtractedPhones: string[];
  cardExtractedAddress: string;
  landmark: string;
  location: string;
  city: string;
  country: string;
  product: string;
  variant: string;
  priceText: string;
  currency: string;
  priceAmount: number;
  address: string;
  paymentMethod: string;
  orderStatus: "inquiry" | "collecting details" | "awaiting confirmation" | "confirmed" | "cancelled" | "human review";
  latestLanguage: string;
  confirmationDetected: boolean;
  priceObjectionDetected: boolean;
  customFields: Record<string, string>;
  missingCustomFields: string[];
};

type ExtractInput = {
  profile?: any;
  history?: any[];
  latestOrder?: any;
  configuredFields?: any[];
};

const CONFIRMATION_PATTERNS = [
  /\b(yes|yeah|yep|ok|okay|confirm|confirmed|done|proceed|go ahead|place order|book it|buy it|take it|works for me|sounds good)\b/i,
  /\b(haan|han|ha|ji|gggg|theek|thik|theek hai|kar dein|kr dein|kar do|kr do|karo|confirm karo|save kar do|book kar do|order laga do|proceed karo)\b/i,
  /\b(نعم|تمام|أكيد|اوكي)\b/u,
];

const CANCEL_PATTERNS = [
  /\b(cancel|cancelled|canceled|leave it|stop order|don't order|do not order)\b/i,
  /\b(cancel kar|rehne dein|mat bhej|order mat)\b/i,
];

const HUMAN_REVIEW_PATTERNS = [
  /\b(human|agent|representative|manager|support person)\b/i,
  /\b(insaan|agent se|representative se)\b/i,
];

const PRICE_OBJECTION_PATTERNS = [
  /\b(expensive|too high|high price|costly|overpriced|price is high|price high|out of budget)\b/i,
  /\b(cheaper|lower price|better price|another seller|other seller|competitor)\b/i,
  /\b(mehnga|mehngi|qeemat zyada|price ziada|dosra seller)\b/i,
];

const NAME_PATTERNS = [
  /\bmy name is\s+([a-z][a-z'.-]*(?:\s+[a-z][a-z'.-]*){0,4})\b/i,
  /\bi am\s+([a-z][a-z'.-]*(?:\s+[a-z][a-z'.-]*){0,4})\b/i,
  /\bthis is\s+([a-z][a-z'.-]*(?:\s+[a-z][a-z'.-]*){0,4})\b/i,
  /(?:^|\n)\s*(?:name|customer name|full name)\s*[:：-]\s*([^\n]{2,80})/i,
];

function looksLikeCompleteFinalSummary(value: any) {
  const text = clean(value).toLowerCase();
  if (!text) return false;
  const summaryLike = /\b(order\s+(summary|details|confirmation)|final\s+summary|confirm(ation)?\s+summary)\b/i.test(text);
  const signals = [
    /\b(name|customer)\b/i.test(text),
    /\b(phone|contact|whatsapp|mobile)\b/i.test(text),
    /\b(address|delivery address|location|city)\b/i.test(text),
    /\b(product|item|service|order)\b/i.test(text),
    /\b(quantity|qty|total|amount|payment|cod|price)\b/i.test(text),
  ].filter(Boolean).length;
  const asksConfirm = /\b(confirm|please confirm|reply yes|ok to confirm|proceed|save)\b/i.test(text);
  return (summaryLike || asksConfirm) && signals >= 4;
}

function asksForOrderConfirmation(value: any) {
  const text = clean(value).toLowerCase();
  if (!text) return false;
  return /\b(order|booking|save|confirm|confirmation|proceed)\b/i.test(text) &&
    /\b(confirm|please confirm|reply yes|ok to confirm|proceed|save|kar doon|kar do|karo|laga doon)\b/i.test(text);
}

function hasFinalSummaryConfirmationContext(history: any[]) {
  const visible = visibleHistory(history);
  const lastUserIndex = (() => {
    for (let index = visible.length - 1; index >= 0; index -= 1) {
      if (visible[index].role === "user") return index;
    }
    return -1;
  })();
  if (lastUserIndex < 0 || !CONFIRMATION_PATTERNS.some((pattern) => pattern.test(visible[lastUserIndex].text))) return false;
  for (let index = lastUserIndex - 1; index >= 0; index -= 1) {
    if (visible[index].role === "model") return looksLikeCompleteFinalSummary(visible[index].text) || asksForOrderConfirmation(visible[index].text);
  }
  return false;
}

function hasExplicitCustomerConfirmation(history: any[]) {
  const latestUser = [...visibleHistory(history)].reverse().find((entry) => entry.role === "user");
  if (!latestUser) return false;
  return /\b(confirm it|confirm this|confirmed|place order|book it|proceed|go ahead)\b/i.test(latestUser.text);
}
const PLAIN_NAME_RE = /^[\p{L}][\p{L}'.-]*(?:\s+[\p{L}][\p{L}'.-]*){1,4}$/u;

const PHONE_PATTERN = /(?:\+?\d[\d\s().-]{6,}\d)/g;

function clean(value: any) {
  return String(value || "").trim();
}

function visibleHistory(history: any[] = []) {
  return history
    .map((entry) => ({
      role: String(entry?.role || "").toLowerCase(),
      text: clean(entry?.text),
      timestamp: Number(entry?.timestamp) || 0,
    }))
    .filter((entry) => entry.text && !isInternalHistoryText(entry.text));
}

function pickFirst(...values: any[]) {
  for (const value of values) {
    const next = clean(value);
    if (next) return next;
  }
  return "";
}

function latestCustomerTexts(history: any[]) {
  return visibleHistory(history)
    .filter((entry) => entry.role === "user")
    .map((entry) => entry.text);
}

function latestLanguage(history: any[], profile: any) {
  const texts = latestCustomerTexts(history);
  for (let index = texts.length - 1; index >= 0; index -= 1) {
    const detected = detectCustomerActualLanguage(texts[index]);
    if (detected) return detected;
  }
  const saved = clean(profile?.customerLanguagePreference || profile?.languagePreference || profile?.effectiveReplyLanguage).toLowerCase();
  return ["english", "roman_urdu", "urdu"].includes(saved) ? saved as CustomerOrderState["latestLanguage"] : "";
}

function findLastMatch(history: any[], patterns: RegExp[]) {
  const entries = visibleHistory(history);
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const text = entries[index].text;
    if (patterns.some((pattern) => pattern.test(text))) return text;
  }
  return "";
}

function findLatestLabelValue(history: any[], labels: string[]) {
  const entries = visibleHistory(history);
  const pattern = new RegExp(`(?:^|\\n)\\s*(?:${labels.join("|")})\\s*[:：-]\\s*(.+)$`, "im");
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const match = entries[index].text.match(pattern);
    if (match?.[1]) return clean(match[1]);
  }
  return "";
}

function cleanDetectedName(value: string) {
  return sanitizeCustomerNameCandidate(value);
}

function findLatestName(history: any[], profile: any) {
  const profileName = pickPreferredCustomerName(profile?.deliveryName, profile?.customerName, profile?.name);
  if (profileName) return profileName;
  const texts = visibleHistory(history);
  for (let index = texts.length - 1; index >= 0; index -= 1) {
    const text = texts[index].text;
    for (const pattern of NAME_PATTERNS) {
      const match = text.match(pattern);
      const detected = cleanDetectedName(match?.[1] || "");
      if (detected) return detected;
    }
    if (
      texts[index].role === "user" &&
      PLAIN_NAME_RE.test(text) &&
      !CONFIRMATION_PATTERNS.some((pattern) => pattern.test(text))
    ) {
      const previousModel = texts.slice(0, index).reverse().find((entry) => entry.role === "model");
      if (previousModel && /\b(name|full name|naam|apna naam|customer name)\b/i.test(previousModel.text)) {
        const detected = cleanDetectedName(text);
        if (detected) return detected;
      }
    }
  }
  return "";
}

function findLatestBusinessName(history: any[], profile: any, latestOrder: any): string {
  const existing = pickFirst(profile?.businessName, latestOrder?.businessName);
  if (existing) return existing;
  const labeled = findLatestLabelValue(history, ["business", "company", "brand", "agency", "store"]);
  if (labeled) return labeled;
  const texts = visibleHistory(history);
  for (let index = texts.length - 1; index >= 0; index -= 1) {
    const text = texts[index].text;
    const match = text.match(/\b(?:our\s+(?:company|brand|agency|business|store)|(?:we\s+are|run|running|from|brand\s+is|business\s+is))\s+([a-z0-9][a-z0-9'.-]*(?:\s+[a-z0-9][a-z0-9'.-]*){0,3})\b/i);
    if (match?.[1] && isLikelyBusinessName(match[1])) {
      return match[1].trim();
    }
  }
  return "";
}

function findLatestVariant(history: any[], profile: any, latestOrder: any) {
  const saved = pickFirst(latestOrder?.variation, profile?.latestVariant, profile?.variation);
  const entries = visibleHistory(history);
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const text = entries[index].text;
    const match = text.match(/\b(?:change|changed|switch|switched|make|kar\s*do|kardo|rang|color|colour)\b[\s\S]{0,40}\b(?:to|into|mein|me)?\s*(black|grey|gray|white|blue|red|green|brown|pink|purple|yellow|orange)\b/i);
    if (entries[index].role === "user" && match?.[1]) return match[1];
  }
  return saved || findLatestLabelValue(history, ["variant", "variation", "option", "color", "colour", "size", "plan", "package"]);
}

function findLatestPhone(history: any[], profile: any) {
  const profilePhone = pickFirst(profile?.customerPhone, profile?.phone, profile?.phoneNumber, profile?.whatsapp_number);
  if (profilePhone) return profilePhone;
  const texts = visibleHistory(history);
  for (let index = texts.length - 1; index >= 0; index -= 1) {
    const match = texts[index].text.match(PHONE_PATTERN);
    if (match?.[0]) return clean(match[0]);
  }
  return "";
}

function findLatestPrice(history: any[], profile: any) {
  const profilePrice = pickFirst(profile?.latestPrice, profile?.totalPrice, profile?.codAmount);
  if (profilePrice) return profilePrice;
  return findLatestLabelValue(history, ["price", "total", "amount"]);
}

function parsePriceAmount(value: string) {
  const numeric = Number(clean(value).replace(/[^0-9.,-]/g, "").replace(/,/g, ""));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function parseCurrency(value: string) {
  const match = clean(value).match(/\b([A-Z]{3}|[$€£¥₨₹]|usd|eur|gbp|aed|sar|inr|pkr)\b/i);
  return match ? match[1].toUpperCase() : "";
}

function resolveOrderStatus(input: {
  profile: any;
  history: any[];
  hasCoreState: boolean;
  confirmationDetected: boolean;
}) {
  if (input.profile?.hasPlacedOrder) return "confirmed";
  const profileStatus = clean(input.profile?.orderStatus || input.profile?.transactionStatus).toLowerCase();
  if (profileStatus.includes("confirm")) return "confirmed";
  if (profileStatus.includes("cancel")) return "cancelled";
  if (profileStatus.includes("human") || profileStatus.includes("review")) return "human review";
  if (findLastMatch(input.history, CANCEL_PATTERNS)) return "cancelled";
  if (findLastMatch(input.history, HUMAN_REVIEW_PATTERNS)) return "human review";
  if (input.confirmationDetected) return input.hasCoreState ? "awaiting confirmation" : "collecting details";
  return input.hasCoreState ? "collecting details" : "inquiry";
}

export function extractCustomerOrderState(input: ExtractInput): CustomerOrderState {
  const profile = input.profile || {};
  const history = input.history || [];
  const latestOrder = input.latestOrder || {};
  const configuredFieldState = extractConfiguredCustomFieldState({
    configuredFields: input.configuredFields || [],
    profile,
    latestOrder,
    history,
  });
  const priceText = findLatestPrice(history, profile);
  const product = pickFirst(
    latestOrder?.productName,
    profile?.latestProductName,
    profile?.productName,
    findLatestLabelValue(history, ["order", "item", "product", "service"]),
  );
  const variant = findLatestVariant(history, profile, latestOrder);
  const address = pickFirst(
    latestOrder?.deliveryAddress,
    latestOrder?.orderAddress,
    profile?.deliveryAddress,
    profile?.orderAddress,
    profile?.address,
    findLatestLabelValue(history, ["address", "delivery address", "shipping address"]),
  );
  const city = pickFirst(latestOrder?.cityName, profile?.cityName, profile?.city, findLatestLabelValue(history, ["city"]));
  const country = pickFirst(latestOrder?.country, profile?.country, findLatestLabelValue(history, ["country"]));
  const landmark = pickFirst(latestOrder?.landmark, profile?.landmark, findLatestLabelValue(history, ["landmark", "area", "near", "nearby"]));
  const location = pickFirst(latestOrder?.location, [country, city, pickFirst(profile?.location, profile?.area)].filter(Boolean).join(", "));
  const hasCoreState = Boolean(product || address || findLatestPhone(history, profile) || latestOrder?.orderReferenceNumber);
  const awaitingFinalConfirmation = clean(profile?.orderStage || profile?.orderStatus).toLowerCase() === "awaiting_final_confirmation";
  const confirmationDetected = awaitingFinalConfirmation || hasFinalSummaryConfirmationContext(history) || (hasCoreState && hasExplicitCustomerConfirmation(history));

  return {
    customerName: pickPreferredCustomerName(
      latestOrder?.customerName,
      latestOrder?.customer_name,
      profile?.deliveryName,
      profile?.customerName,
      findLatestName(history, profile),
    ),
    customerPhone: pickFirst(latestOrder?.customerPhone, latestOrder?.phone, findLatestPhone(history, profile)),
    businessName: pickFirst(profile?.businessName, latestOrder?.businessName, findLatestBusinessName(history, profile, latestOrder)),
    businessContacts: Array.isArray(profile?.businessContacts) ? profile.businessContacts.map(clean).filter(Boolean) : [],
    cardExtractedPhones: Array.isArray(profile?.cardExtractedPhones) ? profile.cardExtractedPhones.map(clean).filter(Boolean) : [],
    cardExtractedAddress: pickFirst(profile?.cardExtractedAddress, latestOrder?.cardExtractedAddress),
    landmark,
    location,
    city,
    country,
    product,
    variant,
    priceText: pickFirst(latestOrder?.priceText, priceText, latestOrder?.currency && latestOrder?.totalPrice ? `${latestOrder.currency} ${latestOrder.totalPrice}` : ""),
    currency: parseCurrency(pickFirst(latestOrder?.priceText, priceText, latestOrder?.currency)),
    priceAmount: parsePriceAmount(pickFirst(latestOrder?.priceText, priceText, latestOrder?.totalPrice, latestOrder?.codAmount)),
    address,
    paymentMethod: pickFirst(latestOrder?.paymentMethod, latestOrder?.customFields?.["Payment Method"], profile?.paymentMethod, profile?.payment_method, findLatestLabelValue(history, ["payment", "payment method", "delivery method"])),
    orderStatus: latestOrder?.orderReferenceNumber || latestOrder?.orderRefNumber
      ? "confirmed"
      : resolveOrderStatus({ profile, history, hasCoreState, confirmationDetected }),
    latestLanguage: latestLanguage(history, profile),
    confirmationDetected,
    priceObjectionDetected: Boolean(findLastMatch(history, PRICE_OBJECTION_PATTERNS)),
    customFields: configuredFieldState.values,
    missingCustomFields: configuredFieldState.missing,
  };
}

export function mergeStructuredOrderState(orderData: any, state: CustomerOrderState) {
  const next = { ...(orderData || {}) };
  const customFields = mergeCustomFieldRecords(next.customFields && typeof next.customFields === "object" ? { ...next.customFields } : {}, state.customFields || {});

  if (!clean(next.customerName) && state.customerName) next.customerName = state.customerName;
  if (!clean(next.customerPhone) && state.customerPhone) next.customerPhone = state.customerPhone;
  if (!clean(next.deliveryAddress) && state.address) next.deliveryAddress = state.address;
  if (!clean(next.orderAddress) && state.address) next.orderAddress = state.address;
  if (!clean(next.productName) && state.product) next.productName = state.product;
  if (!clean(next.variation) && state.variant) next.variation = state.variant;
  if (!clean(next.cityName) && state.city) next.cityName = state.city;
  if (!clean(next.location) && state.location) next.location = state.location;
  if (!clean(next.paymentMethod) && state.paymentMethod) next.paymentMethod = state.paymentMethod;
  if (!clean(customFields["Payment Method"]) && state.paymentMethod) customFields["Payment Method"] = state.paymentMethod;
  if (!clean(next.priceText) && state.priceText) next.priceText = state.priceText;
  if (!clean(next.currency) && state.currency) next.currency = state.currency;
  if ((!Number(next.totalPrice) || Number(next.totalPrice) <= 0) && state.priceAmount > 0) next.totalPrice = state.priceAmount;
  if ((!Number(next.codAmount) || Number(next.codAmount) <= 0) && state.priceAmount > 0) next.codAmount = state.priceAmount;
  next.customFields = customFields;
  next.missingCustomFields = Array.isArray(state.missingCustomFields) ? [...state.missingCustomFields] : [];
  return next;
}

export function buildCustomerStateSummary(state: CustomerOrderState) {
  const safeState = {
    businessContacts: [],
    cardExtractedPhones: [],
    customFields: {},
    missingCustomFields: [],
    ...state,
  } as CustomerOrderState;
  const customFieldLines = Object.entries(safeState.customFields || {})
    .map(([key, value]) => clean(key) && clean(value) ? `Custom field - ${key}: ${value}` : "")
    .filter(Boolean);
  const lines = [
    safeState.customerName ? `Customer name: ${safeState.customerName}` : "",
    safeState.customerPhone ? `Phone number: ${safeState.customerPhone}` : "",
    safeState.businessName ? `Business name: ${safeState.businessName}` : "",
    safeState.businessContacts.length > 0 ? `Business/card contacts: ${safeState.businessContacts.join(", ")}` : "",
    safeState.cardExtractedPhones.length > 0 ? `Card phones: ${safeState.cardExtractedPhones.join(", ")}` : "",
    safeState.location ? `Location: ${safeState.location}` : (safeState.city ? `Location: ${safeState.city}` : ""),
    safeState.product ? `Product or service: ${safeState.product}` : "",
    safeState.variant ? `Selected option: ${safeState.variant}` : "",
    safeState.priceText ? `Price: ${safeState.priceText}` : "",
    safeState.address ? `Address or delivery details: ${safeState.address}` : "",
    safeState.cardExtractedAddress ? `Card/address context: ${safeState.cardExtractedAddress}` : "",
    safeState.landmark ? `Landmark: ${safeState.landmark}` : "",
    safeState.paymentMethod ? `Payment method: ${safeState.paymentMethod}` : "",
    ...customFieldLines,
    safeState.missingCustomFields.length > 0 ? `Missing custom fields: ${safeState.missingCustomFields.join(", ")}` : "",
    `Order status: ${safeState.orderStatus}`,
    safeState.latestLanguage ? `Customer language preference: ${safeState.latestLanguage}` : "",
  ].filter(Boolean);
  return lines.join("\n").slice(0, 2500);
}

export function hasStructuredOrderConfirmationSignal(state: CustomerOrderState) {
  return state.confirmationDetected && Boolean(state.product && state.customerPhone && state.address) && state.missingCustomFields.length === 0;
}
