import * as dbService from "./db-service.ts";
import { collectAccountDataOwnerCandidates } from "../utils/account-data-owner.ts";
import {
  getCustomerDisplayName,
  jidToCustomerId,
  normalizeWhatsAppJid,
  resolveCustomerChatJid,
} from "../utils/whatsapp-jid.ts";
import { resolveCustomerUpdateTarget } from "./customer-update-target-service.ts";
import {
  buildBackInStockSummary,
  buildBackInStockUpdateMessage,
  cleanBackInStockProductName,
} from "./customer-update-message-service.ts";

async function getOwnerKeysForUser(userId: string) {
  const user = await dbService.getUser(userId) as any;
  if (!user) return [];
  const bots = await dbService.getBotsByUser(user.$id);
  return Array.from(new Set(collectAccountDataOwnerCandidates(user, bots).filter(Boolean)));
}

async function getStockRequestForUser(userId: string, requestId: string) {
  const ownerKeys = await getOwnerKeysForUser(userId);
  if (ownerKeys.length === 0) return null;
  const request = await dbService.databases
    .getDocument(dbService.DATABASE_ID, dbService.COLLECTIONS.BACK_IN_STOCK, requestId)
    .catch(() => null) as any;
  if (!request || !ownerKeys.includes(request.bot_id)) return null;
  return request;
}

function getEditableCustomerId(customerJid: string) {
  return jidToCustomerId(customerJid || "");
}

function serializeStockUpdateItem(request: any, customers: any[]) {
  const productName = cleanBackInStockProductName(request.product_name || request.product_id);
  const customerJid = normalizeWhatsAppJid(request.customer_jid || request.jid || request.customer_id);
  const linkedCustomer = resolveCustomerUpdateTarget(customers, customerJid || request.customer_id)?.customer || null;
  const displayCustomer = linkedCustomer || { customer_id: request.customer_id, profile: { jid: customerJid } };

  return {
    id: request.$id,
    type: "stock",
    status: request.status === "notified" ? "sent" : (request.status || "pending"),
    botId: request.bot_id,
    customerId: request.customer_id,
    customerJid: linkedCustomer ? resolveCustomerChatJid(linkedCustomer) : customerJid,
    customerName: getCustomerDisplayName(displayCustomer),
    summary: buildBackInStockSummary(productName),
    message: buildBackInStockUpdateMessage(productName),
    scheduledAt: request.created_at || 0,
    createdAt: request.created_at || 0,
    sentAt: request.notified_at || null,
    repeat: "none",
    productId: request.product_id,
    productName,
  };
}

export async function updateStockRequestForUser(userId: string, requestId: string, patch: any) {
  const request = await getStockRequestForUser(userId, requestId);
  if (!request) throw new Error("Stock update not found");
  if (request.status === "sent" || request.status === "notified") throw new Error("Sent updates cannot be edited");

  const updateData: Record<string, any> = { status: "pending" };
  const customers = await dbService.listCustomers(userId);
  const nextTarget = String(patch?.customerId || patch?.customerJid || "").trim();
  if (nextTarget) {
    const resolvedTarget = resolveCustomerUpdateTarget(customers, nextTarget);
    const customerJid = resolvedTarget?.customerJid || normalizeWhatsAppJid(nextTarget);
    if (!customerJid) throw new Error("Enter a valid customer, phone number, JID, or LID");
    updateData.customer_id = getEditableCustomerId(customerJid);
  }

  if (patch?.productName !== undefined || patch?.message !== undefined) {
    updateData.product_name = cleanBackInStockProductName(patch.productName ?? patch.message);
  }
  if (patch?.productId !== undefined) {
    const productId = String(patch.productId || "").trim();
    if (productId) updateData.product_id = productId;
  }

  const updated = await dbService.databases.updateDocument(
    dbService.DATABASE_ID,
    dbService.COLLECTIONS.BACK_IN_STOCK,
    requestId,
    updateData
  ) as any;

  return serializeStockUpdateItem({ ...request, ...updated, ...updateData }, customers);
}
