export type FieldCollectionLockReason = "" | "summary_sent" | "payment_requested" | "confirmed";

function clean(value: any, max = 240) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalize(value: any) {
  return clean(value, 240)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const EXACT_INSTRUCTION_FIELD_NAMES = new Set([
  "final completion rule",
  "completion rule",
  "final rule",
  "rule",
  "important rule",
  "instructions",
  "final instructions",
  "note",
  "notes",
  "guidelines",
  "policy",
  "payment rule",
  "confirmation rule",
  "booking rule",
]);

const INSTRUCTION_FIELD_RE = /\b(rule|instruction|instructions|guideline|guidelines|policy|note|notes)\b/i;
const SECTION_HEADING_RE = /^(final|important|payment|booking|confirmation|completion)\b/i;
const RESTART_COLLECTION_RE = /\b(edit|change|update|correct|fix|reschedule|cancel|new booking|new order|start again|restart|modify)\b/i;
const PAYMENT_REQUESTED_RE = /\b(payment proof|payment screenshot|share screenshot|share payment|send screenshot|send payment|bank transfer|jazzcash|easypaisa|advance payment)\b/i;
const CONFIRMED_RE = /\b(confirm|confirmed|complete|completed|done|placed)\b/i;

function isAllUppercaseHeading(value: string) {
  const letters = value.replace(/[^A-Za-z]/g, "");
  return Boolean(letters) && letters === letters.toUpperCase();
}

function readCaseInsensitive(record: any, fieldName: string) {
  if (!record || typeof record !== "object") return "";
  const exact = clean(record[fieldName], 500);
  if (exact) return exact;
  const wanted = normalize(fieldName);
  const key = Object.keys(record).find((item) => normalize(item) === wanted);
  return key ? clean(record[key], 500) : "";
}

function readCustomFieldValue(fieldName: string, sources: any[]) {
  for (const source of sources) {
    const direct = readCaseInsensitive(source?.customFields || {}, fieldName);
    if (direct) return direct;
  }
  return "";
}

function firstUseful(...values: any[]) {
  return values.map((value) => clean(value, 500)).find(Boolean) || "";
}

export function isInstructionLikeFieldName(value: any) {
  const raw = clean(value, 160);
  const normalized = normalize(raw);
  if (!normalized) return false;
  if (EXACT_INSTRUCTION_FIELD_NAMES.has(normalized)) return true;
  if (isAllUppercaseHeading(raw) && INSTRUCTION_FIELD_RE.test(raw)) return true;
  return INSTRUCTION_FIELD_RE.test(normalized) && SECTION_HEADING_RE.test(normalized);
}

export function sanitizeConfiguredCustomerFields(fields: any[] = []) {
  return (Array.isArray(fields) ? fields : []).filter((field) => {
    const name = clean(field?.name, 160);
    return name && !isInstructionLikeFieldName(name);
  });
}

export function readKnownCustomerFieldValue(fieldName: any, sources: {
  profile?: any;
  latestOrder?: any;
  state?: any;
  record?: any;
} = {}) {
  const name = clean(fieldName, 160);
  const label = normalize(name);
  if (!label) return "";

  const orderedSources = [
    sources.record || {},
    sources.latestOrder || {},
    sources.state || {},
    sources.profile || {},
  ];

  const exactCustom = readCustomFieldValue(name, orderedSources);
  if (exactCustom) return exactCustom;

  if (/\b(full name|customer name|patient name|name)\b/.test(label)) {
    return firstUseful(
      orderedSources[0]?.customerName,
      orderedSources[0]?.customer_name,
      orderedSources[1]?.customerName,
      orderedSources[2]?.customerName,
      orderedSources[3]?.customerName,
      orderedSources[3]?.name,
    );
  }
  if (/\b(phone|mobile|contact|whatsapp|number)\b/.test(label)) {
    return firstUseful(
      orderedSources[0]?.customerPhone,
      orderedSources[0]?.phone,
      orderedSources[1]?.customerPhone,
      orderedSources[1]?.phone,
      orderedSources[2]?.customerPhone,
      orderedSources[3]?.customerPhone,
      orderedSources[3]?.phone,
      orderedSources[3]?.phoneNumber,
      orderedSources[3]?.whatsapp_number,
    );
  }
  if (/\b(city|location|area)\b/.test(label)) {
    return firstUseful(
      orderedSources[0]?.location,
      orderedSources[0]?.cityName,
      orderedSources[0]?.city,
      orderedSources[1]?.location,
      orderedSources[1]?.cityName,
      orderedSources[1]?.city,
      orderedSources[2]?.location,
      orderedSources[2]?.city,
      orderedSources[3]?.location,
      orderedSources[3]?.city,
    );
  }
  if (/\b(address|delivery)\b/.test(label)) {
    return firstUseful(
      orderedSources[0]?.deliveryAddress,
      orderedSources[0]?.orderAddress,
      orderedSources[0]?.address,
      orderedSources[1]?.deliveryAddress,
      orderedSources[1]?.orderAddress,
      orderedSources[2]?.address,
      orderedSources[3]?.deliveryAddress,
      orderedSources[3]?.address,
    );
  }
  if (/\b(gender|sex)\b/.test(label)) return firstUseful(exactCustom, orderedSources[2]?.gender, orderedSources[3]?.gender);
  if (/\b(age)\b/.test(label)) return firstUseful(exactCustom, orderedSources[2]?.age, orderedSources[3]?.age);
  if (/\b(date|day)\b/.test(label)) return firstUseful(exactCustom, orderedSources[0]?.preferredDate, orderedSources[1]?.preferredDate, orderedSources[2]?.preferredDate, orderedSources[3]?.preferredDate);
  if (/\b(time|slot|timing)\b/.test(label)) return firstUseful(exactCustom, orderedSources[0]?.preferredTime, orderedSources[1]?.preferredTime, orderedSources[2]?.preferredTime, orderedSources[3]?.preferredTime);
  if (/\b(method|consultation method|visit type|payment method)\b/.test(label)) {
    return firstUseful(exactCustom, orderedSources[0]?.paymentMethod, orderedSources[1]?.paymentMethod, orderedSources[2]?.paymentMethod, orderedSources[3]?.paymentMethod, orderedSources[3]?.payment_method);
  }
  if (/\b(concern|issue|problem|reason|symptom)\b/.test(label)) {
    return firstUseful(exactCustom, orderedSources[0]?.notes, orderedSources[1]?.notes, orderedSources[2]?.concern, orderedSources[3]?.lastLeadMemoryNote);
  }
  return exactCustom || firstUseful(
    orderedSources[0]?.[name],
    orderedSources[1]?.[name],
    orderedSources[2]?.[name],
    orderedSources[3]?.[name],
  );
}

export function filterMissingFieldsAgainstKnownValues(input: {
  missingFields?: any[];
  profile?: any;
  latestOrder?: any;
  state?: any;
  record?: any;
}) {
  const ignoredInstructionLike: string[] = [];
  const ignoredKnownValue: string[] = [];
  const filtered: string[] = [];
  const seen = new Set<string>();

  for (const item of input.missingFields || []) {
    const field = clean(item, 160);
    const key = normalize(field);
    if (!field || seen.has(key)) continue;
    seen.add(key);
    if (isInstructionLikeFieldName(field)) {
      ignoredInstructionLike.push(field);
      continue;
    }
    if (readKnownCustomerFieldValue(field, input)) {
      ignoredKnownValue.push(field);
      continue;
    }
    filtered.push(field);
  }

  return { filtered, ignoredInstructionLike, ignoredKnownValue };
}

export function getFieldCollectionLockReason(input: {
  profile?: any;
  latestOrder?: any;
  state?: any;
  history?: any[];
}) {
  const profile = input.profile || {};
  const latestOrder = input.latestOrder || {};
  const state = input.state || {};
  const joinedBotHistory = (input.history || [])
    .filter((entry: any) => normalize(entry?.role) !== "user")
    .map((entry: any) => clean(entry?.text, 300))
    .join("\n");
  const statusText = clean([
    profile.leadOrderFlowState,
    profile.orderStatus,
    latestOrder.recordStatus,
    latestOrder.transactionStatus,
    latestOrder.orderStatus,
    state.orderStatus,
  ].filter(Boolean).join(" "), 400).toLowerCase();

  if (
    profile.leadOrderConfirmed === true ||
    profile.hasPlacedOrder === true ||
    Boolean(latestOrder?.orderReferenceNumber || latestOrder?.orderRefNumber) ||
    CONFIRMED_RE.test(statusText)
  ) {
    return "confirmed";
  }

  if (
    (profile.leadOrderSummarySent === true || profile.doNotRestartQuestions === true) &&
    PAYMENT_REQUESTED_RE.test(`${joinedBotHistory}\n${clean(latestOrder?.paymentMethod)}\n${clean(state?.paymentMethod)}`)
  ) {
    return "payment_requested";
  }

  if (
    profile.leadOrderSummarySent === true ||
    profile.doNotRestartQuestions === true ||
    clean(profile.leadOrderFlowState).toLowerCase() === "awaiting_customer_confirmation"
  ) {
    return "summary_sent";
  }

  return "";
}

export function shouldAllowFieldCollectionRestart(latestCustomerText: any) {
  return RESTART_COLLECTION_RE.test(clean(latestCustomerText, 300).toLowerCase());
}
