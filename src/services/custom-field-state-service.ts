import { cleanOrderFieldValue, sanitizeOrderCustomFields } from "./order-field-value-service.ts";
import { isInternalHistoryText } from "./chat-history-sanitizer.ts";
import { sanitizeConfiguredCustomerFields } from "./customer-field-guard-service.ts";

type ExtractCustomFieldStateInput = {
  configuredFields?: any[];
  profile?: any;
  latestOrder?: any;
  history?: any[];
};

function clean(value: any) {
  return String(value || "").trim();
}

function normalize(value: any) {
  return clean(value).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function caseInsensitiveRead(record: any, fieldName: string) {
  if (!record || typeof record !== "object") return "";
  const exact = cleanOrderFieldValue(record[fieldName]);
  if (exact) return exact;
  const wanted = normalize(fieldName);
  const key = Object.keys(record).find((item) => normalize(item) === wanted);
  return key ? cleanOrderFieldValue(record[key]) : "";
}

function visibleTexts(history: any[] = []) {
  return history
    .map((entry) => clean(entry?.text))
    .filter((text) => text && !isInternalHistoryText(text));
}

function readLabeledValue(text: string, fieldName: string) {
  const escaped = fieldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`(?:^|\\n)\\s*${escaped}\\s*[:\\-]\\s*([^\\n]+)`, "i"),
    new RegExp(`\\b${escaped}\\b\\s*(?:is|=)\\s*([^\\n,;|]+)`, "i"),
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = cleanOrderFieldValue(match?.[1] || "");
    if (value) return value;
  }
  return "";
}

function readByMeaning(field: any, texts: string[]) {
  const label = normalize(field?.name);
  if (!label) return "";
  const joined = texts.join("\n");

  if (label.includes("email")) {
    return clean(joined.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "");
  }
  if (label.includes("phone") || label.includes("contact") || label.includes("whatsapp") || label === "number") {
    return clean(joined.match(/(?:\+|00)?\d[\d\s().-]{8,18}\d/)?.[0] || "");
  }
  if (label.includes("full name") || label === "name" || label.includes("customer name")) {
    for (const text of texts.slice().reverse()) {
      const match = text.match(/\b(?:my name is|i am|this is|name\s*[:\-])\s*([^.!\n,;]{2,80})/i);
      const value = cleanOrderFieldValue((match?.[1] || "").replace(/\b(?:i run|we run|email|phone|budget)\b.*$/i, "").trim());
      if (value) return value;
    }
  }
  if (label.includes("business")) {
    for (const text of texts.slice().reverse()) {
      const direct = readLabeledValue(text, field?.name || "");
      if (direct) return direct;
      const match = text.match(/\b(?:i run|we run|my business is|business is|company is)\s+([^.\n]{3,120})/i);
      const value = cleanOrderFieldValue(match?.[1] || "");
      if (value) return value;
    }
  }
  if (label.includes("budget")) {
    for (const text of texts.slice().reverse()) {
      const direct = readLabeledValue(text, field?.name || "");
      if (direct) return cleanOrderFieldValue(direct.replace(/^around\s+/i, "").replace(/^about\s+/i, "").replace(/[.]+$/g, "").trim());
      const match = text.match(/\b(?:budget(?: is)?|around|about)\s+([^\n.,;]{1,40})/i);
      const value = cleanOrderFieldValue((match?.[1] || "").replace(/^around\s+/i, "").replace(/^about\s+/i, "").trim());
      if (value) return value;
    }
  }
  if (label.includes("date") || label.includes("day")) {
    for (const text of texts.slice().reverse()) {
      const direct = readLabeledValue(text, field?.name || "");
      if (direct) return direct;
      const match = text.match(/\b(?:preferred date|date|appointment date)\s*[:\-]?\s*([^\n.,;]{2,60})/i);
      const value = cleanOrderFieldValue(match?.[1] || text.match(/\b(?:\d{1,2}\s*(?:jan|feb|mar|apr|may|jun|june|jul|aug|sep|oct|nov|dec)[a-z]*|tomorrow|today|kal|parson)\b/i)?.[0] || "");
      if (value) return value;
    }
  }
  if (label.includes("time") || label.includes("slot") || label.includes("timing")) {
    for (const text of texts.slice().reverse()) {
      const direct = readLabeledValue(text, field?.name || "");
      if (direct) return direct;
      const match = text.match(/\b(?:preferred time|appointment time|time|slot|timing)\s*[:\-]?\s*([^\n.,;]{2,60})/i) ||
        text.match(/\b(\d{1,2}(?::\d{2})?\s*(?:am|pm|baj[ey]|baje)?\s*(?:se|sy|to|-)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm|baj[ey]|baje)?)\b/i) ||
        text.match(/\b(\d{1,2}(?::\d{2})?\s*(?:am|pm|baj[ey]|baje))\b/i);
      const value = cleanOrderFieldValue(match?.[1] || "");
      if (value) return value;
    }
  }
  if (label.includes("doctor") || label.includes("staff") || label.includes("provider") || label.includes("consultant")) {
    for (const text of texts.slice().reverse()) {
      const direct = readLabeledValue(text, field?.name || "");
      if (direct) return direct;
      const match = text.match(/\b(?:dr\.?|doctor)\s+([A-Z][\p{L}'.-]*(?:\s+[A-Z][\p{L}'.-]*){0,5})/iu);
      const value = cleanOrderFieldValue(match ? `Dr ${match[1].replace(/\s+(?:ke|k|kay)\s+(?:sath|saath|liye).*$/i, "").trim()}` : "");
      if (value) return value;
    }
  }
  if (label.includes("location") || label.includes("city") || label.includes("area") || label.includes("address")) {
    for (const text of texts.slice().reverse()) {
      const direct = readLabeledValue(text, field?.name || "");
      if (direct) return direct;
      const match = text.match(/\b(?:city|location|area|address|near)\s*[:\-]?\s*([^\n.;]{2,100})/i);
      const value = cleanOrderFieldValue(match?.[1] || "");
      if (value) return value;
    }
  }
  if (label.includes("quantity") || label.includes("qty") || label.includes("pieces") || label.includes("students") || label.includes("parents")) {
    for (const text of texts.slice().reverse()) {
      const direct = readLabeledValue(text, field?.name || "");
      if (direct) return direct;
      const match = text.match(/\b(?:quantity|qty|pieces|students|parents|users|leads)\s*[:\-]?\s*([0-9][0-9,\s]*)/i) ||
        text.match(/\b([0-9][0-9,\s]*)\s*(?:pcs|pieces|students|parents|users|leads)\b/i);
      const value = cleanOrderFieldValue(match?.[1] || "");
      if (value) return value;
    }
  }
  if (label.includes("service")) {
    for (const text of texts.slice().reverse()) {
      const direct = readLabeledValue(text, field?.name || "");
      if (direct) return direct;
      const match = text.match(/\b(?:need|looking for|want)\s+([^.\n]{3,120})/i);
      const value = cleanOrderFieldValue(match?.[1] || "");
      if (value) return value;
    }
  }
  if (label.includes("size")) {
    for (const text of texts.slice().reverse()) {
      const direct = readLabeledValue(text, field?.name || "");
      if (direct) return direct;
      const match = text.match(/\bsize\s*[:\-]?\s*([^\n,.;]{1,40})/i);
      const value = cleanOrderFieldValue(match?.[1] || "");
      if (value) return value;
    }
  }
  return "";
}

function normalizeResolvedValue(field: any, value: string) {
  const label = normalize(field?.name);
  if (!value) return "";
  if (label.includes("budget")) {
    return cleanOrderFieldValue(value.replace(/^around\s+/i, "").replace(/^about\s+/i, "").replace(/[.]+$/g, "").trim(), field);
  }
  return cleanOrderFieldValue(value, field);
}

function readStructuredValue(field: any, profile: any, latestOrder: any) {
  const name = clean(field?.name);
  const label = normalize(name);
  const orderFields = sanitizeOrderCustomFields(latestOrder?.customFields || {}, [field]);
  const profileFields = sanitizeOrderCustomFields(profile?.customFields || {}, [field]);
  const direct = caseInsensitiveRead(orderFields, name) ||
    caseInsensitiveRead(profileFields, name) ||
    caseInsensitiveRead(latestOrder, name) ||
    caseInsensitiveRead(profile, name);
  if (direct) return direct;

  if (label.includes("email")) return clean(profile?.email || latestOrder?.email || "");
  if (label.includes("phone") || label.includes("contact") || label.includes("whatsapp")) {
    return clean(profile?.customerPhone || profile?.phone || profile?.phoneNumber || profile?.whatsapp_number || latestOrder?.customerPhone || latestOrder?.phone || "");
  }
  if (label.includes("name")) return clean(profile?.customerName || profile?.name || latestOrder?.customerName || latestOrder?.customer_name || "");
  if (label.includes("address")) return clean(profile?.deliveryAddress || profile?.address || latestOrder?.deliveryAddress || latestOrder?.orderAddress || "");
  if (label.includes("city")) return clean(profile?.city || profile?.cityName || latestOrder?.cityName || "");
  return "";
}

export function normalizeCustomFieldName(fieldName: string) {
  return normalize(fieldName);
}

export function extractConfiguredCustomFieldState(input: ExtractCustomFieldStateInput) {
  const configuredFields = sanitizeConfiguredCustomerFields(Array.isArray(input.configuredFields) ? input.configuredFields.filter((field) => clean(field?.name)) : []);
  const texts = visibleTexts(input.history || []);
  if (configuredFields.length === 0) {
    const savedValues = mergeCustomFieldRecords(
      input.profile?.customFields || {},
      input.latestOrder?.customFields || {},
    );
    const savedMissing = Array.isArray(input.profile?.missingCustomFields)
      ? input.profile.missingCustomFields.map((item: any) => clean(item)).filter(Boolean)
      : [];
    return { values: savedValues, missing: savedMissing };
  }
  const values: Record<string, string> = {};
  const missing: string[] = [];

  for (const field of configuredFields) {
    const name = clean(field.name);
    const structured = readStructuredValue(field, input.profile || {}, input.latestOrder || {});
    const labeled = structured || texts.slice().reverse().map((text) => readLabeledValue(text, name)).find(Boolean) || "";
    const semantic = labeled || readByMeaning(field, texts) || "";
    const value = normalizeResolvedValue(field, semantic);
    if (value) {
      values[name] = value;
    } else {
      missing.push(name);
    }
  }

  return { values, missing };
}

export function mergeCustomFieldRecords(base: any, extra: any, configuredFields: any[] = []) {
  return sanitizeOrderCustomFields({ ...(base || {}), ...(extra || {}) }, configuredFields);
}
