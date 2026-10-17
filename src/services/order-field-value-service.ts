import { isInstructionLikeFieldName } from "./customer-field-guard-service.ts";

function clean(value: any) {
  return String(value ?? "").trim();
}

function normalize(value: any) {
  return clean(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fieldByName(configuredFields: any[] = [], fieldName: string) {
  const wanted = normalize(fieldName);
  return configuredFields.find((field) => normalize(field?.name) === wanted);
}

const INSTRUCTION_VALUE_PHRASES = [
  "full name of the customer",
  "contact number to contact for delivery",
  "full order details including quantity",
  "products variations ordered",
  "courier company used to send parcel",
  "required by postex",
  "ask the customer",
  "confirm the complete",
  "filled after",
  "filled from",
  "do not ask",
  "fill as",
  "fill only if",
  "otherwise leave blank",
];

const GENERIC_INVALID_VALUES = new Set([
  "",
  "ji",
  "g",
  "gg",
  "ggg",
  "gggg",
  "yes",
  "y",
  "ok",
  "okay",
  "no",
  "nahi",
  "nahin",
  "han",
  "haan",
  "unknown",
  "unknown customer",
  "n/a",
  "na",
  "not found",
  "not_found",
  "missing",
  "not provided",
  "unavailable",
  "name not found",
  "address not found",
  "city not found",
  "blank",
  "placeholder",
  "none",
  "customer",
  "naam nahi mila",
  "address nahi mila",
  "city nahi mila",
  "pata nahi mila",
]);

const FAKE_VALUE_PHRASES = [
  "customer provided address",
  "provided address",
  "address provided",
  "customer ke provided address",
  "customer ke faraham karda address",
  "unknown city",
  "city unknown",
  "shahar namaloom",
  "شہر نامعلوم",
  "گاہک کے فراہم کردہ ایڈریس پر",
  "نامعلوم",
];

export function isInstructionLikeOrderValue(value: any, configuredField?: any) {
  const text = normalize(value);
  if (!text) return false;
  const instruction = normalize(configuredField?.instructions);
  if (instruction && text === instruction) return true;
  return INSTRUCTION_VALUE_PHRASES.some((phrase) => text.includes(phrase));
}

export function isInvalidOrderFieldValue(value: any) {
  const text = normalize(value);
  if (!text) return false;
  if (GENERIC_INVALID_VALUES.has(text)) return true;
  return FAKE_VALUE_PHRASES.some((phrase) => text.includes(normalize(phrase)));
}

export function cleanOrderFieldValue(value: any, configuredField?: any) {
  const text = clean(value);
  return isInstructionLikeOrderValue(text, configuredField) || isInvalidOrderFieldValue(text) ? "" : text;
}

export function sanitizeOrderCustomFields(customFields: any, configuredFields: any[] = []) {
  if (!customFields || typeof customFields !== "object") return {};
  return Object.entries(customFields).reduce((acc: Record<string, string>, [key, value]) => {
    const fieldName = clean(key);
    if (!fieldName || isInstructionLikeFieldName(fieldName)) return acc;
    const configuredField = fieldByName(configuredFields, fieldName);
    const fieldValue = cleanOrderFieldValue(value, configuredField);
    if (fieldName && fieldValue) acc[fieldName] = fieldValue;
    return acc;
  }, {});
}

export function isConfiguredFieldInstructionEcho(text: any, configuredFields: any[] = []) {
  const normalizedText = normalize(text);
  if (!normalizedText || configuredFields.length === 0) return false;
  const matches = configuredFields.filter((field) => {
    const instruction = normalize(field?.instructions);
    return instruction && normalizedText.includes(instruction);
  });
  return matches.length >= 2;
}
