import { compactAiText } from "./ai-cost-control-service.ts";
import { getMissingOrderFields } from "./order-required-fields-service.ts";
import { cleanOrderFieldValue, sanitizeOrderCustomFields } from "./order-field-value-service.ts";
import type { GeminiProviderContext } from "./gemini-provider-service.ts";
import { generateBackendText } from "./ai-text-provider-service.ts";

type AiOrderSummaryInput = {
  orderData: any;
  savedRef?: any;
  language?: string;
  configuredFields?: any[];
  chatContext?: string;
  providerContext?: GeminiProviderContext;
};

type AiOrderSummaryDeps = {
  generateText?: (prompt: string, systemInstruction: string, providerContext?: GeminiProviderContext) => Promise<string>;
};

function clean(value: any, fallback = "") {
  return cleanOrderFieldValue(value) || fallback;
}

function amount(value: any) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? String(numeric) : "";
}

function totalText(orderData: any) {
  const explicit = clean(orderData?.priceText || orderData?.price_text);
  if (explicit) return explicit;
  const numeric = amount(orderData?.totalPrice || orderData?.codAmount || orderData?.total_price);
  const currency = clean(orderData?.currency);
  return numeric && currency ? `${currency} ${numeric}` : numeric;
}

function row(label: string, value: any) {
  const text = clean(value);
  return text ? `${label}: ${text}` : "";
}

function customRows(orderData: any, configuredFields: any[] = []) {
  const hidden = new Set([
    "name",
    "customer name",
    "phone",
    "address",
    "delivery address",
    "city",
    "product",
    "quantity",
    "total",
    "price",
    "payment",
    "payment method",
    "status",
    "tracking id",
    "courier status",
  ]);
  return Object.entries(sanitizeOrderCustomFields(orderData?.customFields, configuredFields))
    .filter(([key, value]) => clean(key) && clean(value) && !hidden.has(clean(key).toLowerCase()))
    .map(([key, value]) => row(clean(key), value))
    .filter(Boolean);
}

const POST_CONFIRMATION_FULFILLMENT_FIELDS = new Set([
  "tracking id",
  "tracking number",
  "tracking",
  "status",
  "order status",
  "courier status",
  "shipping charge",
  "delivery charge",
]);

function hasConfirmedRecord(orderData: any, missingFields: string[]) {
  const status = clean(orderData?.recordStatus || orderData?.transactionStatus || orderData?.orderStatus).toLowerCase();
  if (missingFields.length > 0) return false;
  if (/\b(incomplete|pending|awaiting|draft|new)\b/.test(status)) return false;
  return (
    /\b(confirm|confirmed|complete|completed)\b/.test(status) ||
    Boolean(orderData?.orderReferenceNumber || orderData?.orderRefNumber)
  );
}

function filterCustomerMissingFields(orderData: any, missingFields: string[]) {
  const confirmed = hasConfirmedRecord(orderData, []);
  if (!confirmed) return missingFields;
  return missingFields.filter((field) => !POST_CONFIRMATION_FULFILLMENT_FIELDS.has(clean(field).toLowerCase()));
}

export function buildStructuredOrderLeadSummary(input: AiOrderSummaryInput) {
  const orderData = input.orderData || {};
  const configuredFields = input.configuredFields || [];
  const rawMissingFields = Array.isArray(orderData?.missingFields) && orderData.missingFields.length
    ? orderData.missingFields.map(clean).filter(Boolean)
    : getMissingOrderFields(orderData, configuredFields);
  const missingFields = filterCustomerMissingFields(orderData, rawMissingFields);
  const confirmed = hasConfirmedRecord(orderData, missingFields);
  const recordType = clean(orderData?.recordType || orderData?.businessFlow).toLowerCase().includes("lead") ? "Lead" : "Order";
  const status = confirmed ? "Confirmed" : missingFields.length > 0 ? "Awaiting details" : "Complete";
  const intro = recordType === "Lead"
    ? (confirmed ? "Lead confirmed." : "Lead draft updated.")
    : (confirmed ? "Order confirmed." : "Order draft updated.");
  const knownRows = [
    row("Order ID", input.savedRef?.order_id || orderData?.orderReferenceNumber || orderData?.orderRefNumber),
    row("Customer", orderData?.customerName || orderData?.customer_name),
    row("Phone", orderData?.customerPhone || orderData?.phone),
    row(recordType === "Lead" ? "Service" : "Product", orderData?.serviceName || orderData?.productName || orderData?.product_name),
    row("Option", orderData?.variation || orderData?.variant),
    row("Quantity", orderData?.quantity),
    row("Total", totalText(orderData)),
    row("City", orderData?.cityName || orderData?.city || orderData?.location),
    row("Address", orderData?.deliveryAddress || orderData?.orderAddress || orderData?.address),
    row("Payment", orderData?.paymentMethod || orderData?.customFields?.["Payment Method"]),
    row("Source", orderData?.source || "WhatsApp chat"),
    row("Notes", orderData?.transactionNotes || orderData?.notes),
    ...customRows(orderData, configuredFields),
  ].filter(Boolean);

  const sections = [
    intro,
    `Status: ${status}`,
    knownRows.length ? `Known:\n${knownRows.map((item) => `- ${item}`).join("\n")}` : "",
    missingFields.length ? `Missing:\n${missingFields.map((item) => `- ${item}`).join("\n")}` : "",
    missingFields.length ? `Next step:\n- Ask customer only for missing details.` : (confirmed ? "Next step:\n- Share the saved summary with admin." : ""),
  ].filter(Boolean);

  return sections.join("\n\n");
}

function sanitizeAiSummary(text: any) {
  const cleaned = String(text || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^(customer|user|bot|ai|assistant)\s*:/i.test(line))
    .join("\n")
    .trim();
  if (!cleaned || /\b(unknown city|customer provided address|undefined|null)\b/i.test(cleaned)) return "";
  return cleaned.slice(0, 1800);
}

function aiSummaryKeepsStructuredFacts(aiText: string, orderData: any) {
  const lower = aiText.toLowerCase();
  const required = [
    orderData?.customerName || orderData?.customer_name,
    orderData?.customerPhone || orderData?.phone,
    orderData?.productName || orderData?.serviceName || orderData?.product_name,
  ].map((item) => clean(item).toLowerCase()).filter(Boolean);
  return required.every((item) => lower.includes(item));
}

async function defaultGenerateText(prompt: string, systemInstruction: string, providerContext?: GeminiProviderContext) {
  const response = await generateBackendText({
    purpose: providerContext?.purpose || "ai_order_lead_summary",
    accountId: providerContext?.accountId || providerContext?.userId,
    botId: providerContext?.botId || providerContext?.dataOwnerKey,
    customerJid: providerContext?.billingContext?.customerJid,
    stablePrompt: systemInstruction,
    latestCustomerMessage: prompt,
    maxTokens: 600,
  });
  if (response.requestStatus !== "success" || !response.text) {
    const error: any = new Error(response.fallbackReason || response.requestStatus || "deepinfra_unavailable_text_generation_blocked");
    error.code = response.fallbackReason || response.requestStatus || "deepinfra_unavailable_text_generation_blocked";
    throw error;
  }
  return response.text;
}

export async function buildAiGeneratedOrderLeadSummary(input: AiOrderSummaryInput, deps: AiOrderSummaryDeps = {}) {
  const structured = buildStructuredOrderLeadSummary(input);
  const generateText = deps.generateText || defaultGenerateText;
  const systemInstruction = `
Write a clean WhatsApp order/lead summary using only the provided structured fields.
Do not add fields that are not present. Do not guess from transcript.
If status is Awaiting details, keep it pending and ask only for missing details.
Output concise plain text.
`.trim();
  const prompt = `
Structured summary:
${structured}

Recent chat context, for tone only:
${compactAiText(input.chatContext || "", 900)}

Customer language: ${input.language || "english"}
Rewrite the structured summary cleanly. Keep all important structured fields.
`.trim();

  try {
    const aiText = sanitizeAiSummary(await generateText(prompt, systemInstruction, input.providerContext));
    return aiText && aiSummaryKeepsStructuredFacts(aiText, input.orderData || {}) ? aiText : structured;
  } catch {
    return structured;
  }
}
