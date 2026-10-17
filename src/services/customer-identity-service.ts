function clean(value: any) {
  return String(value || "").trim();
}

function normalize(value: any) {
  return clean(value)
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, " ")
    .replace(/[^\p{L}\p{N}\s.@/-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const COMMON_TLDS = new Set([
  "com", "net", "org", "co", "io", "ai", "pk", "uk", "us", "ca", "au", "de", "fr", "ae", "sa", "in",
]);

import { isBusinessOrBrandName } from "./whatsapp-sales-momentum-service.ts";

const BUSINESS_HINTS = [
  "company", "co", "store", "shop", "printers", "printing", "agency", "studio", "ltd", "llc", "inc",
  "school", "college", "hospital", "restaurant", "mart", "traders", "solutions", "services",
  "digital", "media", "technologies", "tech", "ventures", "enterprises", "group", "holdings",
  "marketing", "consulting", "software", "labs", "logistics", "brand", "boutique", "fashion",
  "apparel", "wear", "couture", "online", "academy", "firm", "global", "systems", "network",
];

const NON_NAME_HINTS = [
  "address", "phone", "number", "payment", "city", "country", "email", "website", "www", "http", "order",
  "quantity", "price", "total", "variant", "product",
];

export function isLikelyDomainOrHandle(value: any) {
  const text = normalize(value);
  if (!text) return false;
  if (/[/@]/.test(text) || /\bhttps?\b/.test(text) || /\bwww\b/.test(text)) return true;
  if (/\.[a-z]{2,}\b/i.test(clean(value))) return true;
  const parts = text.split(" ").filter(Boolean);
  return parts.length >= 2 && parts.length <= 3 && COMMON_TLDS.has(parts[parts.length - 1]);
}

export function isLikelyBusinessName(value: any) {
  const text = normalize(value);
  if (!text) return false;
  if (isBusinessOrBrandName(text) || isBusinessOrBrandName(clean(value))) return true;
  const words = text.split(" ").filter(Boolean);
  return BUSINESS_HINTS.some((hint) => words.includes(hint));
}

export function sanitizeCustomerNameCandidate(value: any) {
  const text = clean(value)
    .replace(/\b(phone|number|address|city|country|payment)\b.*$/i, "")
    .replace(/[|,;:/-]+$/g, "")
    .trim();
  const normalized = normalize(text);
  if (!normalized) return "";
  if (isLikelyDomainOrHandle(text)) return "";
  if (NON_NAME_HINTS.some((hint) => normalized.includes(hint))) return "";
  if (isLikelyBusinessName(text)) return "";
  if (/\d/.test(text)) return "";
  return text;
}

export function pickPreferredCustomerName(...candidates: any[]) {
  for (const candidate of candidates) {
    const next = sanitizeCustomerNameCandidate(candidate);
    if (next) return next;
  }
  return "";
}
