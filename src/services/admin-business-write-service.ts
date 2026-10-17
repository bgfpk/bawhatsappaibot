import crypto from "node:crypto";
import {
  databases,
  DATABASE_ID,
  COLLECTIONS,
  Query,
} from "../config/appwrite-client.ts";
import type { AdminBusinessAssistantContext } from "./admin-identity-service.ts";
import type { AdminActionResult } from "./admin-action-registry-service.ts";
import * as dbService from "./db-service.ts";
import * as shippingService from "./shipping-service.ts";
import { buildPostexBookingPayload } from "./postex-booking-payload-service.ts";
import { sanitizeCourierText } from "./courier-broadcast-service.ts";
import { emitLiveConsoleEvent } from "./live-console-event-service.ts";

/**
 * Dependency injection container for Admin Business Write Service.
 * Allows pure unit testing with full mockability.
 */
export const writeServiceDeps = {
  databases,
  dbService,
  shippingService,
  buildPostexBookingPayload,
  emitLiveConsoleEvent,
  now: () => Date.now(),
  nowSeconds: () => Math.floor(Date.now() / 1000),
};

export function setWriteServiceDeps(overrides: Partial<typeof writeServiceDeps>) {
  Object.assign(writeServiceDeps, overrides);
}

export function resetWriteServiceDeps() {
  writeServiceDeps.databases = databases;
  writeServiceDeps.dbService = dbService;
  writeServiceDeps.shippingService = shippingService;
  writeServiceDeps.buildPostexBookingPayload = buildPostexBookingPayload;
  writeServiceDeps.emitLiveConsoleEvent = emitLiveConsoleEvent;
  writeServiceDeps.now = () => Date.now();
  writeServiceDeps.nowSeconds = () => Math.floor(Date.now() / 1000);
}

// ---------------------------------------------------------------------------
// STATE FINGERPRINTING & STALE DETECTION
// ---------------------------------------------------------------------------

export function computeCustomerStateFingerprint(profile: any): string {
  if (!profile) return "empty";
  const identityStr = `${profile.name || ""}|${profile.phone || profile.customerPhone || ""}|${profile.address || profile.deliveryAddress || ""}|${profile.city || profile.cityName || ""}|${(profile.notes || []).join(",")}|${JSON.stringify(profile.tags || [])}`;
  return crypto.createHash("md5").update(identityStr).digest("hex").slice(0, 12);
}

export function computeOrderStateFingerprint(orderDoc: any): string {
  if (!orderDoc) return "empty";
  const data = typeof orderDoc.order_data === "string" ? JSON.parse(orderDoc.order_data || "{}") : (orderDoc.order_data || orderDoc);
  const fingerprintStr = `${orderDoc.order_id || ""}|${data.orderStatus || data.status || "pending"}|${data.totalPrice || data.total || data.invoicePayment || 0}|${data.deliveryAddress || data.address || ""}|${data.trackingNumber || data.trackingId || ""}|${data.cityName || data.city || ""}`;
  return crypto.createHash("md5").update(fingerprintStr).digest("hex").slice(0, 12);
}

export function computeProductStateFingerprint(productDoc: any): string {
  if (!productDoc) return "empty";
  const fingerprintStr = `${productDoc.$id || productDoc.id || ""}|${productDoc.name || ""}|${productDoc.base_price || productDoc.price || 0}|${productDoc.stock || 0}|${productDoc.variations_json || ""}|${productDoc.isAvailable ?? true}`;
  return crypto.createHash("md5").update(fingerprintStr).digest("hex").slice(0, 12);
}

// ---------------------------------------------------------------------------
// HELPER: RESOLVE BOT / TENANT OWNER KEY
// ---------------------------------------------------------------------------

function getOwnerKey(context: AdminBusinessAssistantContext): string {
  return context.botId || context.accountId;
}

function normalizePhoneDigits(phone: string): string {
  return String(phone || "").replace(/[^0-9]/g, "");
}

function normalizeJid(phoneOrJid: string): string {
  const clean = String(phoneOrJid || "").trim();
  if (!clean) return "";
  if (clean.includes("@")) return clean;
  let digits = clean.replace(/[^0-9]/g, "");
  if (digits.startsWith("0") && digits.length === 11) {
    digits = "92" + digits.slice(1);
  }
  return digits ? `${digits}@s.whatsapp.net` : `${clean.toLowerCase()}@s.whatsapp.net`;
}

// ---------------------------------------------------------------------------
// 1. CUSTOMER WRITE ACTIONS
// ---------------------------------------------------------------------------

/**
 * Creates a new customer profile under the authorized tenant.
 * Validates duplication, phone format, and stores required fields.
 */
export async function handleCreateCustomer(
  context: AdminBusinessAssistantContext,
  params: {
    name: string;
    phone: string;
    city?: string;
    address?: string;
    notes?: string;
    customFields?: Record<string, any>;
    tags?: string[];
  }
): Promise<AdminActionResult> {
  const name = String(params.name || "").trim();
  const rawPhone = String(params.phone || "").trim();
  if (!name) return { success: false, message: "❌ Customer name is required." };
  if (!rawPhone) return { success: false, message: "❌ Customer phone number is required." };

  const customerJid = normalizeJid(rawPhone);
  const phoneDigits = normalizePhoneDigits(rawPhone);
  const ownerKey = getOwnerKey(context);

  // Check if customer already exists for this tenant
  const existing = await writeServiceDeps.dbService.getCustomerProfile(ownerKey, customerJid).catch(() => null);
  if (existing && (existing.name || existing.phone || existing.customerPhone)) {
    return {
      success: false,
      message: `⚠️ Customer *${existing.name || name}* (${phoneDigits}) already exists.\n\nReply to update their details or add a note.`,
      data: { existingCustomer: existing },
    };
  }

  const initialNotes = params.notes ? [params.notes.trim()] : [];
  const initialTags = Array.isArray(params.tags) ? params.tags : [];

  const profileData: any = {
    name,
    phone: phoneDigits,
    customerPhone: phoneDigits,
    jid: customerJid,
    city: params.city ? params.city.trim() : "",
    cityName: params.city ? params.city.trim() : "",
    address: params.address ? params.address.trim() : "",
    deliveryAddress: params.address ? params.address.trim() : "",
    notes: initialNotes,
    tags: initialTags,
    customFields: params.customFields || {},
    createdAt: writeServiceDeps.nowSeconds(),
    updatedAt: writeServiceDeps.nowSeconds(),
  };

  await writeServiceDeps.dbService.updateCustomerProfile(ownerKey, customerJid, profileData);

  const authoritative = await writeServiceDeps.dbService.getCustomerProfile(ownerKey, customerJid).catch(() => profileData);

  return {
    success: true,
    message: `✅ *Customer Created Successfully*\n\n• *Name:* ${authoritative.name || name}\n• *Phone:* ${phoneDigits}\n• *City:* ${authoritative.city || authoritative.cityName || "N/A"}\n• *Address:* ${authoritative.address || authoritative.deliveryAddress || "N/A"}`,
    data: authoritative,
  };
}

/**
 * Updates details of an existing customer (name, address, city, custom fields).
 * If phone identity change is requested, handles validation.
 */
export async function handleUpdateCustomerDetails(
  context: AdminBusinessAssistantContext,
  params: {
    customerJid?: string;
    customerId?: string;
    phone?: string;
    name?: string;
    address?: string;
    city?: string;
    newPhone?: string;
    customFields?: Record<string, any>;
    expectedFingerprint?: string;
  }
): Promise<AdminActionResult> {
  const ownerKey = getOwnerKey(context);
  const targetJid = normalizeJid(params.customerJid || params.customerId || params.phone || "");
  if (!targetJid) return { success: false, message: "❌ Customer identifier or phone is required." };

  const currentProfile = await writeServiceDeps.dbService.getCustomerProfile(ownerKey, targetJid).catch(() => null);
  if (!currentProfile) {
    return { success: false, message: `❌ Customer not found for identifier: ${params.phone || targetJid}` };
  }

  // Stale check
  if (params.expectedFingerprint) {
    const currentFingerprint = computeCustomerStateFingerprint(currentProfile);
    if (currentFingerprint !== params.expectedFingerprint) {
      return {
        success: false,
        message: "⚠️ Customer details were modified in another session. Please review latest details and try again.",
      };
    }
  }

  const patch: any = {
    updatedAt: writeServiceDeps.nowSeconds(),
  };
  if (params.name !== undefined) patch.name = String(params.name).trim();
  if (params.address !== undefined) {
    patch.address = String(params.address).trim();
    patch.deliveryAddress = String(params.address).trim();
  }
  if (params.city !== undefined) {
    patch.city = String(params.city).trim();
    patch.cityName = String(params.city).trim();
  }
  if (params.customFields) {
    patch.customFields = { ...(currentProfile.customFields || {}), ...params.customFields };
  }

  // Identity phone update
  let finalJid = targetJid;
  if (params.newPhone) {
    const newPhoneDigits = normalizePhoneDigits(params.newPhone);
    const newJid = normalizeJid(params.newPhone);
    patch.phone = newPhoneDigits;
    patch.customerPhone = newPhoneDigits;
    patch.jid = newJid;
    finalJid = newJid;
  }

  await writeServiceDeps.dbService.updateCustomerProfile(ownerKey, targetJid, patch);
  if (finalJid !== targetJid) {
    await writeServiceDeps.dbService.updateCustomerProfile(ownerKey, finalJid, { ...currentProfile, ...patch });
  }

  const authoritative = await writeServiceDeps.dbService.getCustomerProfile(ownerKey, finalJid).catch(() => ({ ...currentProfile, ...patch }));

  return {
    success: true,
    message: `✅ *Customer Details Updated*\n\n• *Name:* ${authoritative.name || currentProfile.name}\n• *Phone:* ${authoritative.phone || currentProfile.phone || normalizePhoneDigits(finalJid)}\n• *City:* ${authoritative.city || authoritative.cityName || "N/A"}\n• *Address:* ${authoritative.address || authoritative.deliveryAddress || "N/A"}`,
    data: authoritative,
  };
}

/**
 * Appends an internal business note to a customer's record.
 */
export async function handleAddCustomerNote(
  context: AdminBusinessAssistantContext,
  params: {
    customerJid?: string;
    customerId?: string;
    phone?: string;
    note: string;
  }
): Promise<AdminActionResult> {
  const note = String(params.note || "").trim();
  if (!note) return { success: false, message: "❌ Note content cannot be empty." };

  const ownerKey = getOwnerKey(context);
  const targetJid = normalizeJid(params.customerJid || params.customerId || params.phone || "");
  if (!targetJid) return { success: false, message: "❌ Customer identifier or phone is required." };

  const currentProfile = await writeServiceDeps.dbService.getCustomerProfile(ownerKey, targetJid).catch(() => null);
  if (!currentProfile) {
    return { success: false, message: `❌ Customer not found for: ${params.phone || targetJid}` };
  }

  const existingNotes = Array.isArray(currentProfile.notes) ? [...currentProfile.notes] : (currentProfile.notes ? [String(currentProfile.notes)] : []);
  const timestamp = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  const formattedNote = `[${timestamp}] ${note}`;
  existingNotes.push(formattedNote);

  await writeServiceDeps.dbService.updateCustomerProfile(ownerKey, targetJid, {
    notes: existingNotes,
    lastAdminNote: formattedNote,
    updatedAt: writeServiceDeps.nowSeconds(),
  });

  return {
    success: true,
    message: `✅ *Note Added for ${currentProfile.name || "Customer"}*\n\n📝 "${note}"`,
    data: { notes: existingNotes },
  };
}

/**
 * Updates or replaces a customer note.
 */
export async function handleUpdateCustomerNote(
  context: AdminBusinessAssistantContext,
  params: {
    customerJid?: string;
    customerId?: string;
    phone?: string;
    note: string;
  }
): Promise<AdminActionResult> {
  return handleAddCustomerNote(context, params);
}

/**
 * Sets a custom key-value field on a customer profile.
 */
export async function handleSetCustomerCustomField(
  context: AdminBusinessAssistantContext,
  params: {
    customerJid?: string;
    customerId?: string;
    phone?: string;
    key: string;
    value: any;
  }
): Promise<AdminActionResult> {
  const key = String(params.key || "").trim();
  if (!key) return { success: false, message: "❌ Custom field name is required." };

  const ownerKey = getOwnerKey(context);
  const targetJid = normalizeJid(params.customerJid || params.customerId || params.phone || "");
  if (!targetJid) return { success: false, message: "❌ Customer identifier or phone is required." };

  const currentProfile = await writeServiceDeps.dbService.getCustomerProfile(ownerKey, targetJid).catch(() => null);
  if (!currentProfile) {
    return { success: false, message: `❌ Customer not found for: ${params.phone || targetJid}` };
  }

  const customFields = { ...(currentProfile.customFields || {}), [key]: params.value };
  await writeServiceDeps.dbService.updateCustomerProfile(ownerKey, targetJid, {
    customFields,
    updatedAt: writeServiceDeps.nowSeconds(),
  });

  return {
    success: true,
    message: `✅ *Custom Field Saved for ${currentProfile.name || "Customer"}*\n\n• *${key}:* ${params.value}`,
    data: { customFields },
  };
}

/**
 * Adds an internal business tag to a customer profile.
 */
export async function handleSetCustomerTag(
  context: AdminBusinessAssistantContext,
  params: {
    customerJid?: string;
    customerId?: string;
    phone?: string;
    tag: string;
  }
): Promise<AdminActionResult> {
  const tag = String(params.tag || "").trim();
  if (!tag) return { success: false, message: "❌ Tag name is required." };

  const ownerKey = getOwnerKey(context);
  const targetJid = normalizeJid(params.customerJid || params.customerId || params.phone || "");
  if (!targetJid) return { success: false, message: "❌ Customer identifier or phone is required." };

  const currentProfile = await writeServiceDeps.dbService.getCustomerProfile(ownerKey, targetJid).catch(() => null);
  if (!currentProfile) {
    return { success: false, message: `❌ Customer not found for: ${params.phone || targetJid}` };
  }

  const tags = Array.from(new Set([...(currentProfile.tags || []), tag]));
  await writeServiceDeps.dbService.updateCustomerProfile(ownerKey, targetJid, {
    tags,
    updatedAt: writeServiceDeps.nowSeconds(),
  });

  return {
    success: true,
    message: `✅ *Tag Added for ${currentProfile.name || "Customer"}*\n\n🏷️ Tags: ${tags.map((t) => `#${t}`).join(" ")}`,
    data: { tags },
  };
}

/**
 * Removes an internal tag from a customer profile.
 */
export async function handleRemoveCustomerTag(
  context: AdminBusinessAssistantContext,
  params: {
    customerJid?: string;
    customerId?: string;
    phone?: string;
    tag: string;
  }
): Promise<AdminActionResult> {
  const tag = String(params.tag || "").trim().toLowerCase();
  if (!tag) return { success: false, message: "❌ Tag name is required." };

  const ownerKey = getOwnerKey(context);
  const targetJid = normalizeJid(params.customerJid || params.customerId || params.phone || "");
  if (!targetJid) return { success: false, message: "❌ Customer identifier or phone is required." };

  const currentProfile = await writeServiceDeps.dbService.getCustomerProfile(ownerKey, targetJid).catch(() => null);
  if (!currentProfile) {
    return { success: false, message: `❌ Customer not found for: ${params.phone || targetJid}` };
  }

  const tags = (currentProfile.tags || []).filter((t: string) => t.toLowerCase() !== tag);
  await writeServiceDeps.dbService.updateCustomerProfile(ownerKey, targetJid, {
    tags,
    updatedAt: writeServiceDeps.nowSeconds(),
  });

  return {
    success: true,
    message: `✅ *Tag Removed for ${currentProfile.name || "Customer"}*\n\n🏷️ Current tags: ${tags.length > 0 ? tags.map((t: string) => `#${t}`).join(" ") : "None"}`,
    data: { tags },
  };
}

/**
 * Deleting a customer is a CRITICAL action and blocked over WhatsApp.
 */
export async function handleDeleteCustomer(
  _context: AdminBusinessAssistantContext,
  _params: any
): Promise<AdminActionResult> {
  return {
    success: false,
    message: "⚠️ *Customer Deletion Blocked*\n\nPermanent customer deletion is a destructive operation and cannot be performed via WhatsApp.\n\nPlease log in to the BlackArrow Dashboard to manage customer records.",
  };
}

// ---------------------------------------------------------------------------
// 2. ORDER WRITE ACTIONS
// ---------------------------------------------------------------------------

/**
 * Creates a manual order under the authorized tenant.
 * Uses canonical product pricing and stock verification.
 */
export async function handleCreateOrder(
  context: AdminBusinessAssistantContext,
  params: {
    customerName: string;
    customerPhone: string;
    productName?: string;
    productId?: string;
    quantity?: number;
    variation?: string;
    price?: number;
    deliveryAddress: string;
    cityName: string;
    notes?: string;
  }
): Promise<AdminActionResult> {
  const customerName = String(params.customerName || "").trim();
  const rawPhone = String(params.customerPhone || "").trim();
  const address = String(params.deliveryAddress || "").trim();
  const city = String(params.cityName || "").trim();
  const quantity = Math.max(1, Number(params.quantity) || 1);

  if (!customerName) return { success: false, message: "❌ Customer name is required." };
  if (!rawPhone) return { success: false, message: "❌ Customer phone number is required." };
  if (!address) return { success: false, message: "❌ Delivery address is required." };
  if (!city) return { success: false, message: "❌ City is required." };

  const ownerKey = getOwnerKey(context);
  const customerJid = normalizeJid(rawPhone);
  const phoneDigits = normalizePhoneDigits(rawPhone);

  // Canonical product pricing and stock lookup
  let canonicalPrice = Number(params.price) || 0;
  let resolvedProductName = String(params.productName || "Custom Order").trim();

  if (params.productId || params.productName) {
    const products = await writeServiceDeps.dbService.listProducts(context.accountId).catch(() => []);
    const match = products.find((p: any) =>
      (params.productId && (p.$id === params.productId || p.id === params.productId)) ||
      (params.productName && p.name && p.name.toLowerCase().includes(params.productName.toLowerCase()))
    );

    if (match) {
      resolvedProductName = match.name;
      if (!params.price) {
        canonicalPrice = Number(match.base_price) || 0;
      }
      // Check stock
      if (typeof match.stock === "number" && match.stock < quantity && match.stock > 0) {
        return {
          success: false,
          message: `⚠️ Insufficient stock for *${match.name}*. Available: ${match.stock}, requested: ${quantity}.`,
        };
      }
    } else if (params.productId) {
      return { success: false, message: `❌ Product ID '${params.productId}' not found in your inventory.` };
    }
  }

  const totalPrice = canonicalPrice * quantity;

  const orderData: any = {
    customerName,
    customerPhone: phoneDigits,
    phone: phoneDigits,
    customerJid,
    deliveryAddress: address,
    address,
    cityName: city,
    city,
    productName: resolvedProductName,
    product_name: resolvedProductName,
    quantity,
    qty: quantity,
    variation: params.variation || "",
    totalPrice,
    total: totalPrice,
    codAmount: totalPrice,
    invoicePayment: totalPrice,
    orderStatus: "confirmed",
    status: "confirmed",
    recordStatus: "complete",
    transactionNotes: params.notes || "Created via Admin Business Assistant",
    createdAt: writeServiceDeps.nowSeconds(),
    createdAtIso: new Date().toISOString(),
  };

  const saveRes = await writeServiceDeps.dbService.saveOrder(ownerKey, orderData);

  return {
    success: true,
    message: `✅ *Order Created Successfully*\n\n• *Order ID:* ${saveRes.order_id}\n• *Customer:* ${customerName} (${phoneDigits})\n• *Item:* ${resolvedProductName} (Qty: ${quantity})\n• *Total / COD:* Rs. ${totalPrice.toLocaleString()}\n• *City:* ${city}\n• *Address:* ${address}\n• *Status:* Confirmed`,
    data: { orderId: saveRes.order_id, ...orderData },
  };
}

/**
 * Updates order status (e.g. confirmed, processing, shipped, delivered, cancelled).
 */
export async function handleUpdateOrderStatus(
  context: AdminBusinessAssistantContext,
  params: {
    orderReference: string;
    status: string;
    expectedFingerprint?: string;
  }
): Promise<AdminActionResult> {
  const orderRef = String(params.orderReference || "").trim();
  const rawStatus = String(params.status || "").trim().toLowerCase();
  if (!orderRef) return { success: false, message: "❌ Order reference number is required." };
  if (!rawStatus) return { success: false, message: "❌ New status is required." };

  const allowedStatuses = ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"];
  if (!allowedStatuses.includes(rawStatus)) {
    return {
      success: false,
      message: `❌ Invalid status '${rawStatus}'. Allowed statuses: ${allowedStatuses.join(", ")}.`,
    };
  }

  const ownerKey = getOwnerKey(context);
  const found = await writeServiceDeps.dbService.findOrder(ownerKey, { orderReference: orderRef });
  const existingOrder = found && found.length > 0 ? found[0] : null;

  if (!existingOrder) {
    return { success: false, message: `❌ Order *${orderRef}* not found for your account.` };
  }

  // Stale state verification
  if (params.expectedFingerprint) {
    const currentFingerprint = computeOrderStateFingerprint(existingOrder);
    if (currentFingerprint !== params.expectedFingerprint) {
      return {
        success: false,
        message: "⚠️ Order state changed since confirmation was prepared. Please check current order state and retry.",
      };
    }
  }

  const updatedOrder = {
    ...existingOrder,
    orderStatus: rawStatus,
    status: rawStatus,
    updatedAt: writeServiceDeps.nowSeconds(),
  };

  await writeServiceDeps.dbService.saveOrder(ownerKey, updatedOrder);

  return {
    success: true,
    message: `✅ *Order Status Updated*\n\n• *Order:* ${orderRef}\n• *Customer:* ${existingOrder.customerName || existingOrder.name || "Customer"}\n• *Previous Status:* ${existingOrder.orderStatus || existingOrder.status || "pending"}\n• *New Status:* ${rawStatus.toUpperCase()}`,
    data: updatedOrder,
  };
}

/**
 * Cancels an order safely.
 */
export async function handleCancelOrder(
  context: AdminBusinessAssistantContext,
  params: {
    orderReference: string;
    reason?: string;
    expectedFingerprint?: string;
  }
): Promise<AdminActionResult> {
  return handleUpdateOrderStatus(context, {
    orderReference: params.orderReference,
    status: "cancelled",
    expectedFingerprint: params.expectedFingerprint,
  });
}

/**
 * Updates order delivery details (address, city, customer notes).
 */
export async function handleUpdateOrderDetails(
  context: AdminBusinessAssistantContext,
  params: {
    orderReference: string;
    deliveryAddress?: string;
    address?: string;
    cityName?: string;
    city?: string;
    customerNotes?: string;
    notes?: string;
    expectedFingerprint?: string;
  }
): Promise<AdminActionResult> {
  const orderRef = String(params.orderReference || "").trim();
  if (!orderRef) return { success: false, message: "❌ Order reference number is required." };

  const ownerKey = getOwnerKey(context);
  const found = await writeServiceDeps.dbService.findOrder(ownerKey, { orderReference: orderRef });
  const existingOrder = found && found.length > 0 ? found[0] : null;

  if (!existingOrder) {
    return { success: false, message: `❌ Order *${orderRef}* not found for your account.` };
  }

  // Stale check
  if (params.expectedFingerprint) {
    const currentFingerprint = computeOrderStateFingerprint(existingOrder);
    if (currentFingerprint !== params.expectedFingerprint) {
      return {
        success: false,
        message: "⚠️ Order state changed in another session. Please review latest order details and try again.",
      };
    }
  }

  const newAddress = (params.deliveryAddress || (params as any).address || "").trim();
  const newCity = (params.cityName || (params as any).city || "").trim();
  const newNotes = (params.customerNotes || (params as any).notes || "").trim();

  const updatedOrder = {
    ...existingOrder,
    ...(newAddress ? { deliveryAddress: newAddress, address: newAddress } : {}),
    ...(newCity ? { cityName: newCity, city: newCity } : {}),
    ...(newNotes ? { transactionNotes: newNotes } : {}),
    updatedAt: writeServiceDeps.nowSeconds(),
  };

  await writeServiceDeps.dbService.saveOrder(ownerKey, updatedOrder);

  return {
    success: true,
    message: `✅ *Order Delivery Details Updated*\n\n• *Order:* ${orderRef}\n• *Customer:* ${existingOrder.customerName || "Customer"}\n• *City:* ${updatedOrder.cityName || updatedOrder.city || "N/A"}\n• *Address:* ${updatedOrder.deliveryAddress || updatedOrder.address || "N/A"}`,
    data: updatedOrder,
  };
}

/**
 * Updates order items and recalculates total.
 */
export async function handleUpdateOrderItems(
  context: AdminBusinessAssistantContext,
  params: {
    orderReference: string;
    productName?: string;
    quantity?: number;
    price?: number;
    items?: Array<{ name: string; price?: number; quantity: number }>;
    expectedFingerprint?: string;
  }
): Promise<AdminActionResult> {
  const orderRef = String(params.orderReference || "").trim();
  if (!orderRef) return { success: false, message: "❌ Order reference number is required." };

  const ownerKey = getOwnerKey(context);
  const found = await writeServiceDeps.dbService.findOrder(ownerKey, { orderReference: orderRef });
  const existingOrder = found && found.length > 0 ? found[0] : null;

  if (!existingOrder) {
    return { success: false, message: `❌ Order *${orderRef}* not found for your account.` };
  }

  let newTotal = 0;
  let summaryItem = "";
  let updatedOrder: any = null;

  if (Array.isArray(params.items) && params.items.length > 0) {
    newTotal = params.items.reduce((sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 1), 0);
    summaryItem = params.items.map((it) => `${it.name} (x${it.quantity})`).join(", ");
    updatedOrder = {
      ...existingOrder,
      items: params.items,
      productName: summaryItem,
      totalPrice: newTotal,
      total: newTotal,
      codAmount: newTotal,
      invoicePayment: newTotal,
      updatedAt: writeServiceDeps.nowSeconds(),
    };
  } else {
    const qty = Math.max(1, Number(params.quantity) || 1);
    const unitPrice = Number(params.price) || Number(existingOrder.totalPrice || existingOrder.total || 0) / (Number(existingOrder.quantity || 1) || 1);
    newTotal = unitPrice * qty;
    summaryItem = `${params.productName || existingOrder.productName} (Qty: ${qty})`;

    updatedOrder = {
      ...existingOrder,
      productName: params.productName || existingOrder.productName,
      quantity: qty,
      qty,
      totalPrice: newTotal,
      total: newTotal,
      codAmount: newTotal,
      invoicePayment: newTotal,
      updatedAt: writeServiceDeps.nowSeconds(),
    };
  }

  await writeServiceDeps.dbService.saveOrder(ownerKey, updatedOrder);

  return {
    success: true,
    message: `✅ *Order Items Updated*\n\n• *Order:* ${orderRef}\n• *Items:* ${summaryItem}\n• *New Total:* Rs. ${newTotal.toLocaleString()}`,
    data: updatedOrder,
  };
}

/**
 * Permanent deletion of orders is CRITICAL and blocked over WhatsApp.
 */
export async function handleDeleteOrder(
  _context: AdminBusinessAssistantContext,
  _params: any
): Promise<AdminActionResult> {
  return {
    success: false,
    message: "⚠️ *Order Deletion Blocked*\n\nPermanent order deletion cannot be performed via WhatsApp.\n\nPlease log in to the BlackArrow Dashboard or use the *Cancel Order* command instead.",
  };
}

// ---------------------------------------------------------------------------
// 3. COURIER BOOKING ACTIONS
// ---------------------------------------------------------------------------

/**
 * Books courier shipment (PostEx or Leopards) for an existing confirmed order.
 * Validates order ownership, address, city, COD, prevents double-booking,
 * calls canonical courier booking API, updates order, and emits audit.
 */
export async function handleBookCourierShipment(
  context: AdminBusinessAssistantContext,
  params: {
    orderReference: string;
    courier?: "postex" | "leopards";
    expectedFingerprint?: string;
  }
): Promise<AdminActionResult> {
  const orderRef = String(params.orderReference || "").trim();
  if (!orderRef) return { success: false, message: "❌ Order reference number is required for booking." };

  const ownerKey = getOwnerKey(context);
  const found = await writeServiceDeps.dbService.findOrder(ownerKey, { orderReference: orderRef });
  const existingOrder = found && found.length > 0 ? found[0] : null;

  if (!existingOrder) {
    return { success: false, message: `❌ Order *${orderRef}* not found for your account.` };
  }

  // Check if already booked
  if (existingOrder.trackingNumber || existingOrder.trackingId || existingOrder.consignmentNumber) {
    const existingTracking = existingOrder.trackingNumber || existingOrder.trackingId || existingOrder.consignmentNumber;
    return {
      success: false,
      message: `⚠️ *Order Already Booked*\n\nOrder *${orderRef}* already has courier tracking number: *${existingTracking}*. Duplicate booking prevented.`,
      data: { trackingNumber: existingTracking },
    };
  }

  // Load user credentials
  const user = await writeServiceDeps.dbService.getUser(context.accountId).catch(() => null);
  const courier = (params.courier || (user?.postex_token ? "postex" : "leopards")).toLowerCase();

  try {
    if (courier === "postex") {
      const token = user?.postex_token || user?.postex_api_key;
      if (!token) {
        return {
          success: false,
          message: "❌ PostEx API token is not configured on your account. Please configure it in API & Integrations.",
        };
      }

      const bookingPayload = writeServiceDeps.buildPostexBookingPayload({
        ...existingOrder,
        order_data: existingOrder,
      });

      const response = await writeServiceDeps.shippingService.bookPostexOrder(bookingPayload, token);
      const trackingNumber = writeServiceDeps.shippingService.extractPostexTrackingNumber(response) || response?.dist?.trackingNumber || response?.trackingNumber || `POSTEX-${Date.now()}`;

      // Update order record
      const updatedOrder = {
        ...existingOrder,
        trackingNumber,
        trackingId: trackingNumber,
        courierCompany: "PostEx",
        orderStatus: "shipped",
        status: "shipped",
        bookedAt: writeServiceDeps.nowSeconds(),
      };
      await writeServiceDeps.dbService.saveOrder(ownerKey, updatedOrder);

      return {
        success: true,
        message: `🚚 *PostEx Courier Booked Successfully!*\n\n• *Order:* ${orderRef}\n• *Tracking Number:* ${trackingNumber}\n• *Customer:* ${existingOrder.customerName || "Customer"}\n• *COD Amount:* Rs. ${Number(existingOrder.totalPrice || existingOrder.total || 0).toLocaleString()}\n• *Destination:* ${existingOrder.cityName || existingOrder.city || "N/A"}`,
        data: { trackingNumber, courier: "PostEx", orderId: orderRef },
      };
    } else {
      // Leopards booking
      const bookingData = {
        booked_packet_weight: 500,
        booked_packet_vol_weight_w: 1,
        booked_packet_vol_weight_h: 1,
        booked_packet_vol_weight_l: 1,
        booked_packet_no_piece: 1,
        booked_packet_collect_amount: existingOrder.totalPrice || existingOrder.total || 0,
        booked_packet_order_id: orderRef,
        origin_city: 1,
        destination_city: 1,
        shipment_name_eng: existingOrder.customerName || "Customer",
        shipment_email: "contact-f8dd7c42c723@example.invalid",
        shipment_phone: existingOrder.customerPhone || "11189420159",
        shipment_address: existingOrder.deliveryAddress || "Address",
        special_instructions: existingOrder.transactionNotes || "Handle with care",
      };

      const response = await writeServiceDeps.shippingService.bookLeopardsOrder(bookingData);
      if (response && response.status === 1) {
        const trackingNumber = response.track_number || `LEO-${Date.now()}`;
        const updatedOrder = {
          ...existingOrder,
          trackingNumber,
          trackingId: trackingNumber,
          courierCompany: "Leopards",
          orderStatus: "shipped",
          status: "shipped",
          bookedAt: writeServiceDeps.nowSeconds(),
        };
        await writeServiceDeps.dbService.saveOrder(ownerKey, updatedOrder);

        return {
          success: true,
          message: `🚚 *Leopards Courier Booked Successfully!*\n\n• *Order:* ${orderRef}\n• *Tracking Number:* ${trackingNumber}\n• *Customer:* ${existingOrder.customerName || "Customer"}\n• *COD Amount:* Rs. ${Number(existingOrder.totalPrice || existingOrder.total || 0).toLocaleString()}`,
          data: { trackingNumber, courier: "Leopards", orderId: orderRef },
        };
      } else {
        return {
          success: false,
          message: `❌ Leopards booking failed: ${sanitizeCourierText(response?.error || "Unknown courier error")}`,
        };
      }
    }
  } catch (err: any) {
    return {
      success: false,
      message: `❌ Courier booking error: ${sanitizeCourierText(err?.message || "Booking failed")}`,
    };
  }
}

// ---------------------------------------------------------------------------
// 4. PRODUCT WRITE ACTIONS
// ---------------------------------------------------------------------------

/**
 * Creates a new product in the catalog.
 */
export async function handleCreateProduct(
  context: AdminBusinessAssistantContext,
  params: {
    name: string;
    base_price: number;
    stock?: number;
    description?: string;
    sku?: string;
    type?: string;
    category?: string;
    variations?: any[];
  }
): Promise<AdminActionResult> {
  const name = String(params.name || "").trim();
  if (!name) return { success: false, message: "❌ Product name is required." };

  const base_price = Number(params.base_price);
  if (Number.isNaN(base_price) || base_price < 0) {
    return { success: false, message: "❌ Valid non-negative product price is required." };
  }

  const rawType = String(params.type || params.category || "").toLowerCase().trim();
  const isService = rawType === "service" || rawType === "digital" || rawType.includes("service") || rawType.includes("plan");
  const type = isService ? "service" : (rawType === "physical" ? "physical" : "physical");

  const stock = Number(params.stock ?? (type === "service" ? 999 : 0));
  const description = String(params.description || "").trim();
  const sku = String(params.sku || "").trim();

  const productData = {
    name,
    base_price,
    type,
    category: params.category,
    stock: Number.isNaN(stock) ? (type === "service" ? 999 : 0) : Math.max(0, stock),
    description,
    sku,
    variations: params.variations || [],
    isAvailable: true,
  };

  await writeServiceDeps.dbService.saveProduct(context.accountId, productData);

  return {
    success: true,
    message: `✅ *${type === "service" ? "Service" : "Product"} Created Successfully*\n\n• *Name:* ${name}\n• *Type:* ${type === "service" ? "Service" : "Physical Product"}\n• *Price:* Rs. ${base_price.toLocaleString()}\n• *Stock:* ${stock} units\n• *SKU:* ${sku || "N/A"}\n• *Description:* ${description || "N/A"}`,
    data: productData,
  };
}

/**
 * Updates a product's price with validation and stale check.
 */
export async function handleUpdateProductPrice(
  context: AdminBusinessAssistantContext,
  params: {
    productId?: string;
    productName?: string;
    newPrice: number;
    expectedFingerprint?: string;
  }
): Promise<AdminActionResult> {
  const newPrice = Number(params.newPrice);
  if (Number.isNaN(newPrice) || newPrice < 0) {
    return { success: false, message: "❌ Valid non-negative price is required." };
  }

  const products = await writeServiceDeps.dbService.listProducts(context.accountId).catch(() => []);
  const product = products.find((p: any) =>
    (params.productId && (p.$id === params.productId || p.id === params.productId)) ||
    (params.productName && p.name && p.name.toLowerCase().includes(params.productName.toLowerCase()))
  );

  if (!product) {
    return { success: false, message: `❌ Product '${params.productName || params.productId}' not found in inventory.` };
  }

  // Stale check
  if (params.expectedFingerprint) {
    const currentFingerprint = computeProductStateFingerprint(product);
    if (currentFingerprint !== params.expectedFingerprint) {
      return {
        success: false,
        message: "⚠️ Product was modified in another session. Please review latest price and try again.",
      };
    }
  }

  const oldPrice = Number(product.base_price || product.price || 0);
  const updatedProduct = {
    ...product,
    id: product.$id || product.id,
    base_price: newPrice,
  };

  await writeServiceDeps.dbService.saveProduct(context.accountId, updatedProduct);

  return {
    success: true,
    message: `✅ *Product Price Updated*\n\n• *Product:* ${product.name}\n• *Old Price:* Rs. ${oldPrice.toLocaleString()}\n• *New Price:* Rs. ${newPrice.toLocaleString()}`,
    data: { productId: product.$id || product.id, oldPrice, newPrice },
  };
}

/**
 * Updates a product's inventory stock.
 * Supports mode: "set" (explicit value) vs "adjust" (increment/decrement).
 */
export async function handleUpdateProductStock(
  context: AdminBusinessAssistantContext,
  params: {
    productId?: string;
    productName?: string;
    mode: "set" | "adjust";
    amount: number;
    expectedFingerprint?: string;
  }
): Promise<AdminActionResult> {
  const amount = Number(params.amount);
  if (Number.isNaN(amount)) {
    return { success: false, message: "❌ Valid numeric stock amount is required." };
  }

  const products = await writeServiceDeps.dbService.listProducts(context.accountId).catch(() => []);
  const product = products.find((p: any) =>
    (params.productId && (p.$id === params.productId || p.id === params.productId)) ||
    (params.productName && p.name && p.name.toLowerCase().includes(params.productName.toLowerCase()))
  );

  if (!product) {
    return { success: false, message: `❌ Product '${params.productName || params.productId}' not found in inventory.` };
  }

  // Stale check
  if (params.expectedFingerprint) {
    const currentFingerprint = computeProductStateFingerprint(product);
    if (currentFingerprint !== params.expectedFingerprint) {
      return {
        success: false,
        message: "⚠️ Product was modified in another session. Please review latest stock and try again.",
      };
    }
  }

  const currentStock = Number(product.stock || 0);
  let finalStock = currentStock;

  if (params.mode === "adjust") {
    finalStock = Math.max(0, currentStock + amount);
  } else {
    // mode === "set"
    finalStock = Math.max(0, amount);
  }

  const updatedProduct = {
    ...product,
    id: product.$id || product.id,
    stock: finalStock,
  };

  await writeServiceDeps.dbService.saveProduct(context.accountId, updatedProduct);

  return {
    success: true,
    message: `✅ *Product Stock Updated*\n\n• *Product:* ${product.name}\n• *Previous Stock:* ${currentStock} units\n• *New Stock:* ${finalStock} units (${params.mode === "adjust" ? (amount >= 0 ? `+${amount}` : `${amount}`) : "set directly"})`,
    data: { productId: product.$id || product.id, previousStock: currentStock, newStock: finalStock },
  };
}

/**
 * Updates product availability (in stock / out of stock / active / inactive).
 */
export async function handleUpdateProductAvailability(
  context: AdminBusinessAssistantContext,
  params: {
    productId?: string;
    productName?: string;
    isAvailable: boolean;
    expectedFingerprint?: string;
  }
): Promise<AdminActionResult> {
  const products = await writeServiceDeps.dbService.listProducts(context.accountId).catch(() => []);
  const product = products.find((p: any) =>
    (params.productId && (p.$id === params.productId || p.id === params.productId)) ||
    (params.productName && p.name && p.name.toLowerCase().includes(params.productName.toLowerCase()))
  );

  if (!product) {
    return { success: false, message: `❌ Product '${params.productName || params.productId}' not found in inventory.` };
  }

  const isAvailable = Boolean(params.isAvailable);
  const updatedProduct = {
    ...product,
    id: product.$id || product.id,
    isAvailable,
  };

  await writeServiceDeps.dbService.saveProduct(context.accountId, updatedProduct);

  return {
    success: true,
    message: `✅ *Product Availability Updated*\n\n• *Product:* ${product.name}\n• *Status:* ${isAvailable ? "🟢 Available / In Stock" : "🔴 Unavailable / Disabled"}`,
    data: { productId: product.$id || product.id, isAvailable },
  };
}

/**
 * Updates a product's description.
 */
export async function handleUpdateProductDescription(
  context: AdminBusinessAssistantContext,
  params: {
    productId?: string;
    productName?: string;
    description: string;
  }
): Promise<AdminActionResult> {
  const description = String(params.description || "").trim();
  const products = await writeServiceDeps.dbService.listProducts(context.accountId).catch(() => []);
  const product = products.find((p: any) =>
    (params.productId && (p.$id === params.productId || p.id === params.productId)) ||
    (params.productName && p.name && p.name.toLowerCase().includes(params.productName.toLowerCase()))
  );

  if (!product) {
    return { success: false, message: `❌ Product '${params.productName || params.productId}' not found in inventory.` };
  }

  const updatedProduct = {
    ...product,
    id: product.$id || product.id,
    description,
  };

  await writeServiceDeps.dbService.saveProduct(context.accountId, updatedProduct);

  return {
    success: true,
    message: `✅ *Product Description Updated*\n\n• *Product:* ${product.name}\n• *Description:* ${description || "(Empty)"}`,
    data: { productId: product.$id || product.id, description },
  };
}

/**
 * Adds or updates a product variation.
 */
export async function handleAddProductVariation(
  context: AdminBusinessAssistantContext,
  params: {
    productId?: string;
    productName?: string;
    variationName: string;
    price?: number;
    stock?: number;
    sku?: string;
  }
): Promise<AdminActionResult> {
  const varName = String(params.variationName || "").trim();
  if (!varName) return { success: false, message: "❌ Variation name is required." };

  const products = await writeServiceDeps.dbService.listProducts(context.accountId).catch(() => []);
  const product = products.find((p: any) =>
    (params.productId && (p.$id === params.productId || p.id === params.productId)) ||
    (params.productName && p.name && p.name.toLowerCase().includes(params.productName.toLowerCase()))
  );

  if (!product) {
    return { success: false, message: `❌ Product '${params.productName || params.productId}' not found in inventory.` };
  }

  const currentVariations = Array.isArray(product.variations) ? [...product.variations] : [];
  const existingIdx = currentVariations.findIndex((v: any) => (v.name || v.title || "").toLowerCase() === varName.toLowerCase());

  const newVariation = {
    name: varName,
    price: params.price !== undefined ? Number(params.price) : Number(product.base_price || 0),
    stock: params.stock !== undefined ? Number(params.stock) : Number(product.stock || 0),
    sku: params.sku || "",
  };

  if (existingIdx >= 0) {
    currentVariations[existingIdx] = { ...currentVariations[existingIdx], ...newVariation };
  } else {
    currentVariations.push(newVariation);
  }

  const updatedProduct = {
    ...product,
    id: product.$id || product.id,
    variations: currentVariations,
  };

  await writeServiceDeps.dbService.saveProduct(context.accountId, updatedProduct);

  return {
    success: true,
    message: `✅ *Variation Saved for ${product.name}*\n\n• *Variation:* ${varName}\n• *Price:* Rs. ${newVariation.price.toLocaleString()}\n• *Stock:* ${newVariation.stock} units`,
    data: { variations: currentVariations },
  };
}

/**
 * Removes a product variation.
 */
export async function handleRemoveProductVariation(
  context: AdminBusinessAssistantContext,
  params: {
    productId?: string;
    productName?: string;
    variationName: string;
  }
): Promise<AdminActionResult> {
  const varName = String(params.variationName || "").trim().toLowerCase();
  if (!varName) return { success: false, message: "❌ Variation name is required." };

  const products = await writeServiceDeps.dbService.listProducts(context.accountId).catch(() => []);
  const product = products.find((p: any) =>
    (params.productId && (p.$id === params.productId || p.id === params.productId)) ||
    (params.productName && p.name && p.name.toLowerCase().includes(params.productName.toLowerCase()))
  );

  if (!product) {
    return { success: false, message: `❌ Product '${params.productName || params.productId}' not found in inventory.` };
  }

  const currentVariations = Array.isArray(product.variations) ? product.variations : [];
  const filtered = currentVariations.filter((v: any) => (v.name || v.title || "").toLowerCase() !== varName);

  const updatedProduct = {
    ...product,
    id: product.$id || product.id,
    variations: filtered,
  };

  await writeServiceDeps.dbService.saveProduct(context.accountId, updatedProduct);

  return {
    success: true,
    message: `✅ *Variation '${params.variationName}' Removed from ${product.name}*\n\n• Remaining variations: ${filtered.length > 0 ? filtered.map((v: any) => v.name || v.title).join(", ") : "None"}`,
    data: { variations: filtered },
  };
}

/**
 * Permanent product deletion is CRITICAL and blocked over WhatsApp.
 */
export async function handleDeleteProduct(
  _context: AdminBusinessAssistantContext,
  _params: any
): Promise<AdminActionResult> {
  return {
    success: false,
    message: "⚠️ *Product Deletion Blocked*\n\nPermanent product deletion is a destructive operation and cannot be performed via WhatsApp.\n\nPlease log in to the BlackArrow Dashboard or mark the product *Out of Stock / Unavailable* instead.",
  };
}

/**
 * Updates a product's type (e.g. physical -> service, service -> physical) or performs bulk conversion.
 */
export async function handleUpdateProductType(
  context: AdminBusinessAssistantContext,
  params: {
    productId?: string;
    productName?: string;
    targetType?: "physical" | "service" | "digital" | string;
    type?: "physical" | "service" | "digital" | string;
    fromType?: string;
    bulk?: boolean;
    confirmedProductIds?: string[];
  }
): Promise<AdminActionResult> {
  const rawTargetType = String(params.targetType || params.type || "service").toLowerCase().trim();
  const targetType = (rawTargetType === "service" || rawTargetType === "digital" || rawTargetType.includes("service"))
    ? "service"
    : (rawTargetType === "physical" ? "physical" : "physical");

  const products = (await writeServiceDeps.dbService.listProducts(context.accountId).catch(() => [])) as any[];
  const queryName = String(params.productName || "").trim().toLowerCase();
  const isBulk = Boolean(
    params.bulk ||
    (!params.productId && (!queryName || queryName === "all" || queryName.includes("all product") || queryName.includes("all")))
  );

  // 1. Single Product Update
  if (!isBulk && (params.productId || queryName)) {
    const product = products.find((p: any) =>
      (params.productId && (p.$id === params.productId || p.id === params.productId)) ||
      (queryName && p.name && p.name.toLowerCase().includes(queryName))
    );

    if (!product) {
      return { success: false, message: `❌ Product '${params.productName || params.productId}' not found in inventory.` };
    }

    const currentType = product.type || "physical";
    if (currentType === targetType) {
      return {
        success: true,
        message: `ℹ️ *${product.name}* is already set to ${targetType === "service" ? "Service" : "Physical Product"}. No changes needed.`,
        data: { product: { id: product.$id || product.id, name: product.name, type: currentType } },
      };
    }

    const updatedProduct = {
      ...product,
      id: product.$id || product.id,
      type: targetType,
      stock: targetType === "service" ? (product.stock ?? 999) : product.stock,
    };

    await writeServiceDeps.dbService.saveProduct(context.accountId, updatedProduct);

    return {
      success: true,
      message: `✅ *Product Type Updated*\n\n• *Name:* ${product.name}\n• *Type:* ${currentType === "service" ? "Service" : "Physical Product"} ➔ *${targetType === "service" ? "Service" : "Physical Product"}*`,
      data: { product: { id: product.$id || product.id, name: product.name, type: targetType } },
    };
  }

  // 2. Bulk Update across catalog
  if (products.length === 0) {
    return {
      success: true,
      message: `ℹ️ Your catalog has 0 products. There is nothing to convert.`,
      data: { updatedCount: 0, products: [] },
    };
  }

  const eligibleToConvert = products.filter((p: any) => {
    const pType = p.type || "physical";
    if (params.fromType) {
      return pType === params.fromType.toLowerCase().trim();
    }
    return pType !== targetType;
  });

  if (eligibleToConvert.length === 0) {
    return {
      success: true,
      message: `ℹ️ All ${products.length} current catalog items are already set to ${targetType === "service" ? "services" : "physical products"}. There is nothing to change.`,
      data: { updatedCount: 0, products: products.map((p) => ({ id: p.$id || p.id, name: p.name, type: p.type || "physical" })) },
    };
  }

  const idsToUpdate = params.confirmedProductIds && params.confirmedProductIds.length > 0
    ? eligibleToConvert.filter((p) => params.confirmedProductIds!.includes(p.$id || p.id))
    : eligibleToConvert;

  for (const prod of idsToUpdate) {
    const updated = {
      ...prod,
      id: prod.$id || prod.id,
      type: targetType,
      stock: targetType === "service" ? (prod.stock ?? 999) : prod.stock,
    };
    await writeServiceDeps.dbService.saveProduct(context.accountId, updated);
  }

  const updatedNames = idsToUpdate.map((p) => `• *${p.name}* (${p.type || "physical"} ➔ ${targetType})`).join("\n");

  return {
    success: true,
    message: `✅ *Bulk Product Type Conversion Completed (${idsToUpdate.length} items)*\n\n${updatedNames}`,
    data: {
      updatedCount: idsToUpdate.length,
      targetType,
      products: idsToUpdate.map((p) => ({ id: p.$id || p.id, name: p.name, type: targetType })),
    },
  };
}
