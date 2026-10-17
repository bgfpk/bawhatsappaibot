import { Query } from "node-appwrite";
import * as dbService from "./db-service.ts";
import { parseBackInStockTargetId } from "./stock-reminder-target-service.ts";

function customerIdFromJid(customerJid: string) {
  return String(customerJid || "").split("@")[0];
}

export async function deletePendingBackInStockRequestsForCustomerProduct(input: {
  botJid: string;
  customerJid: string;
  baseProductId: string;
}) {
  const customerId = customerIdFromJid(input.customerJid);
  const baseProductId = String(input.baseProductId || "").trim();
  if (!input.botJid || !customerId || !baseProductId) return 0;

  const response = await dbService.databases.listDocuments(dbService.DATABASE_ID, dbService.COLLECTIONS.BACK_IN_STOCK, [
    Query.equal("bot_id", input.botJid),
    Query.equal("customer_id", customerId),
    Query.equal("status", "pending"),
    Query.limit(100),
  ]).catch(() => ({ documents: [] } as any));

  let deleted = 0;
  for (const request of response.documents as any[]) {
    const requestBaseId = parseBackInStockTargetId(request.product_id).baseProductId || String(request.product_id || "");
    if (requestBaseId !== baseProductId) continue;
    await dbService.databases.deleteDocument(dbService.DATABASE_ID, dbService.COLLECTIONS.BACK_IN_STOCK, request.$id).catch(() => {});
    deleted++;
  }
  return deleted;
}
