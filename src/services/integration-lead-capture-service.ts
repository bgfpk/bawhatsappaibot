import crypto from "crypto";
import { upsertCrmLead } from "./crm-foundation-service.ts";
import { cleanString, nowSeconds } from "./integration-foundation-store.ts";
import {
  findIntegrationEventByIdempotencyKey,
  recordIntegrationEvent,
  type IntegrationEventLogInput,
} from "./integration-event-log-service.ts";

export type IntegrationLeadSource = "website_api" | "woocommerce" | "wordpress";

export type NormalizedIntegrationLead = {
  source: IntegrationLeadSource;
  eventType: string;
  idempotencyKey: string;
  externalId: string;
  name: string;
  phone: string;
  email: string;
  city: string;
  sourceUrl: string;
  sourceCampaign: string;
  productInterest: string;
  budget: string;
  quantity: string;
  notes: string;
  status: string;
  dealStage: string;
  metadata: Record<string, any>;
};

function normalizePhone(value: any) {
  const digits = String(value || "").replace(/[^0-9]/g, "");
  if (!digits) return "";
  if (digits.length === 10 && digits.startsWith("3")) return `92${digits}`;
  if (digits.length === 11 && digits.startsWith("03")) return `92${digits.slice(1)}`;
  return digits.slice(0, 18);
}

function firstPresent(...values: any[]) {
  for (const value of values) {
    const text = cleanString(value, 500);
    if (text) return text;
  }
  return "";
}

function stableHash(...parts: any[]) {
  return crypto.createHash("sha1").update(parts.map((part) => String(part || "")).join("|")).digest("hex").slice(0, 28);
}

export function buildIntegrationLeadId(accountId: string, lead: Pick<NormalizedIntegrationLead, "idempotencyKey" | "externalId" | "phone" | "email" | "source">) {
  return `lead_int_${stableHash(accountId, lead.idempotencyKey || lead.externalId || lead.phone || lead.email, lead.source)}`;
}

export function buildIntegrationIdempotencyKey(input: {
  source?: string;
  eventType?: string;
  idempotencyKey?: any;
  externalId?: any;
  orderId?: any;
  customerId?: any;
  phone?: any;
  email?: any;
}) {
  const explicit = firstPresent(input.idempotencyKey, input.externalId, input.orderId, input.customerId);
  if (explicit) return `${cleanString(input.source || "integration", 40)}:${cleanString(input.eventType || "lead", 80)}:${explicit}`;
  return `${cleanString(input.source || "integration", 40)}:${cleanString(input.eventType || "lead", 80)}:${stableHash(input.phone, input.email)}`;
}

export function normalizeWebsiteLeadPayload(payload: any = {}, options: { source?: IntegrationLeadSource; idempotencyKey?: any } = {}): NormalizedIntegrationLead {
  const source = options.source || (cleanString(payload.source, 80).toLowerCase().includes("wordpress") ? "wordpress" : "website_api");
  const phone = normalizePhone(firstPresent(payload.phone, payload.whatsapp, payload.whatsappNumber, payload.mobile));
  const email = cleanString(firstPresent(payload.email, payload.emailAddress), 160).toLowerCase();
  const externalId = firstPresent(payload.externalId, payload.id, payload.leadId, payload.submissionId);
  const eventType = cleanString(payload.eventType || "lead.created", 100);
  const idempotencyKey = buildIntegrationIdempotencyKey({
    source,
    eventType,
    idempotencyKey: options.idempotencyKey || payload.idempotencyKey,
    externalId,
    phone,
    email,
  });

  return {
    source,
    eventType,
    idempotencyKey,
    externalId,
    name: cleanString(firstPresent(payload.name, payload.fullName, payload.full_name, payload.customerName), 120),
    phone,
    email,
    city: cleanString(firstPresent(payload.city, payload.town), 120),
    sourceUrl: cleanString(firstPresent(payload.pageUrl, payload.sourceUrl, payload.url, payload.referrer), 240),
    sourceCampaign: cleanString(firstPresent(payload.campaign, payload.sourceCampaign, payload.utmCampaign, payload.utm_campaign), 120),
    productInterest: cleanString(firstPresent(payload.productInterest, payload.product, payload.service, payload.interest), 240),
    budget: cleanString(payload.budget, 80),
    quantity: cleanString(payload.quantity, 80),
    notes: cleanString(firstPresent(payload.notes, payload.message, payload.comment, payload.description), 1000),
    status: "New",
    dealStage: "Lead",
    metadata: {
      externalId,
      idempotencyKey,
      source,
      eventType,
      pageUrl: firstPresent(payload.pageUrl, payload.sourceUrl, payload.url),
    },
  };
}

function wooAddressName(address: any = {}) {
  return [address.first_name, address.last_name].map((part) => cleanString(part, 80)).filter(Boolean).join(" ");
}

export function normalizeWooCommerceCustomerPayload(payload: any = {}, options: { idempotencyKey?: any } = {}): NormalizedIntegrationLead {
  const billing = payload.billing || {};
  const shipping = payload.shipping || {};
  const phone = normalizePhone(firstPresent(payload.phone, billing.phone, shipping.phone));
  const email = cleanString(firstPresent(payload.email, billing.email), 160).toLowerCase();
  const externalId = firstPresent(payload.id, payload.customer_id, payload.customerId);
  const eventType = cleanString(payload.eventType || "customer.created", 100);
  const idempotencyKey = buildIntegrationIdempotencyKey({ source: "woocommerce", eventType, idempotencyKey: options.idempotencyKey || payload.idempotencyKey, externalId, phone, email });
  return {
    source: "woocommerce",
    eventType,
    idempotencyKey,
    externalId,
    name: cleanString(firstPresent(payload.name, payload.full_name, wooAddressName(billing), wooAddressName(shipping), payload.username), 120),
    phone,
    email,
    city: cleanString(firstPresent(billing.city, shipping.city), 120),
    sourceUrl: cleanString(firstPresent(payload.permalink, payload.url), 240),
    sourceCampaign: "WooCommerce",
    productInterest: "",
    budget: "",
    quantity: "",
    notes: cleanString(firstPresent(payload.note, payload.description), 1000),
    status: "New",
    dealStage: "Lead",
    metadata: { externalId, idempotencyKey, source: "woocommerce", eventType, customerId: externalId },
  };
}

export function normalizeWooCommerceOrderPayload(payload: any = {}, options: { idempotencyKey?: any } = {}): NormalizedIntegrationLead {
  const billing = payload.billing || {};
  const shipping = payload.shipping || {};
  const lineItems = Array.isArray(payload.line_items) ? payload.line_items : [];
  const productNames = lineItems.map((item: any) => cleanString(item.name, 120)).filter(Boolean).slice(0, 8);
  const orderId = firstPresent(payload.id, payload.number, payload.order_key, payload.orderId);
  const eventType = cleanString(payload.eventType || "order.created", 100);
  const phone = normalizePhone(firstPresent(billing.phone, shipping.phone, payload.phone));
  const email = cleanString(firstPresent(billing.email, payload.email), 160).toLowerCase();
  const idempotencyKey = buildIntegrationIdempotencyKey({ source: "woocommerce", eventType, idempotencyKey: options.idempotencyKey || payload.idempotencyKey, orderId, phone, email });
  const total = firstPresent(payload.total, payload.total_amount, payload.amount);
  return {
    source: "woocommerce",
    eventType,
    idempotencyKey,
    externalId: orderId,
    name: cleanString(firstPresent(wooAddressName(billing), wooAddressName(shipping), payload.customer_name), 120),
    phone,
    email,
    city: cleanString(firstPresent(billing.city, shipping.city), 120),
    sourceUrl: cleanString(firstPresent(payload.order_url, payload.view_order_url, payload.permalink), 240),
    sourceCampaign: "WooCommerce",
    productInterest: productNames.join(", "),
    budget: total ? `$${total}` : "",
    quantity: cleanString(lineItems.reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0) || "", 80),
    notes: cleanString([`WooCommerce order ${orderId}`.trim(), payload.status ? `Status: ${payload.status}` : "", productNames.join(", ")].filter(Boolean).join(" / "), 1000),
    status: "New",
    dealStage: "Lead",
    metadata: { externalId: orderId, orderId, idempotencyKey, source: "woocommerce", eventType, total, status: payload.status },
  };
}

export function validateNormalizedIntegrationLead(lead: NormalizedIntegrationLead) {
  if (!lead.phone && !lead.email && !lead.externalId) {
    throw new Error("Lead payload requires at least phone, email, or externalId.");
  }
  return true;
}

export async function captureIntegrationLead(accountId: string, payload: any = {}, options: {
  source?: IntegrationLeadSource;
  eventType?: string;
  idempotencyKey?: any;
  upsertLead?: typeof upsertCrmLead;
  recordEvent?: typeof recordIntegrationEvent;
  findEventByIdempotencyKey?: typeof findIntegrationEventByIdempotencyKey;
} = {}) {
  const source = options.source || "website_api";
  const normalized = source === "woocommerce"
    ? (String(options.eventType || payload.eventType || "").includes("customer") ? normalizeWooCommerceCustomerPayload(payload, options) : normalizeWooCommerceOrderPayload(payload, options))
    : normalizeWebsiteLeadPayload({ ...payload, eventType: options.eventType || payload.eventType }, { source, idempotencyKey: options.idempotencyKey });
  validateNormalizedIntegrationLead(normalized);

  const findEvent = options.findEventByIdempotencyKey || findIntegrationEventByIdempotencyKey;
  const existingEvent = await findEvent(accountId, normalized.idempotencyKey).catch(() => null);
  if (existingEvent) {
    const duplicate = await (options.recordEvent || recordIntegrationEvent)(accountId, {
      provider: normalized.source,
      source: normalized.source,
      eventType: normalized.eventType,
      status: "duplicate",
      reason: "duplicate_idempotency_key",
      idempotencyKey: normalized.idempotencyKey,
      externalId: normalized.externalId,
      leadId: existingEvent.leadId,
      metadata: normalized.metadata,
    }).catch(() => null);
    return { status: "duplicate", duplicate: true, lead: null, normalized, event: duplicate || existingEvent };
  }

  const leadId = buildIntegrationLeadId(accountId, normalized);
  const upsert = options.upsertLead || upsertCrmLead;
  const lead = await upsert(accountId, {
    id: leadId,
    name: normalized.name,
    phone: normalized.phone,
    email: normalized.email,
    city: normalized.city,
    source: normalized.source,
    firstSource: normalized.source,
    latestSource: normalized.source,
    sourceUrl: normalized.sourceUrl,
    sourceCampaign: normalized.sourceCampaign,
    productInterest: normalized.productInterest,
    budget: normalized.budget,
    quantity: normalized.quantity,
    notes: normalized.notes,
    status: normalized.status,
    dealStage: normalized.dealStage,
    customFields: {
      integration: normalized.metadata,
    },
    updatedAt: nowSeconds(),
  });

  const event = await (options.recordEvent || recordIntegrationEvent)(accountId, {
    provider: normalized.source,
    source: normalized.source,
    eventType: normalized.eventType,
    status: "success",
    reason: "captured",
    idempotencyKey: normalized.idempotencyKey,
    externalId: normalized.externalId,
    leadId: lead?.id || leadId,
    httpStatus: 202,
    metadata: normalized.metadata,
  });

  return { status: "success", duplicate: false, lead, normalized, event };
}

export async function recordIntegrationCaptureFailure(accountId: string, input: IntegrationEventLogInput = {}) {
  return recordIntegrationEvent(accountId, {
    ...input,
    status: "failed",
    reason: input.reason || "capture_failed",
  });
}
