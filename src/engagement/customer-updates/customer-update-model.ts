export type CustomerUpdateType = "stock" | "planned";
export type CustomerUpdateStatus = "pending" | "sent" | "cancelled" | string;
export type CustomerUpdateRepeat = "none" | "daily" | "weekly" | "monthly" | "yearly";

export interface CustomerUpdateItem {
  id: string;
  type: CustomerUpdateType;
  status: CustomerUpdateStatus;
  customerName?: string;
  customerId?: string;
  customerJid?: string;
  productName?: string;
  summary?: string;
  message?: string;
  scheduledAt?: number;
  createdAt?: number;
  sentAt?: number | null;
  lastSentAt?: number | null;
  sentCount?: number;
  repeat?: CustomerUpdateRepeat;
  productId?: string;
  defaultBotId?: string;
  sendFromMode?: "default_only" | "customer_origin_then_default" | string;
  raw?: any;
}

export function normalizeCustomerUpdate(raw: any): CustomerUpdateItem {
  const safe = raw || {};
  return {
    id: String(safe.id || safe._id || safe.$id || `upd_${Math.random()}`),
    type: safe.type === "stock" ? "stock" : "planned",
    status: safe.status || "pending",
    customerName: safe.customerName || safe.name,
    customerId: safe.customerId,
    customerJid: safe.customerJid || safe.jid,
    productName: safe.productName,
    summary: safe.summary,
    message: safe.message || safe.summary || "",
    scheduledAt: typeof safe.scheduledAt === "number" ? safe.scheduledAt : undefined,
    createdAt: typeof safe.createdAt === "number" ? safe.createdAt : Date.now(),
    sentAt: safe.sentAt || null,
    lastSentAt: safe.lastSentAt || null,
    sentCount: typeof safe.sentCount === "number" ? safe.sentCount : 0,
    repeat: safe.repeat || "none",
    productId: safe.productId,
    defaultBotId: safe.defaultBotId,
    sendFromMode: safe.sendFromMode || "customer_origin_then_default",
    raw: safe,
  };
}

export function filterCustomerUpdates(
  updates: CustomerUpdateItem[],
  query: string,
  typeFilter: string
): CustomerUpdateItem[] {
  const q = query.trim().toLowerCase();

  return updates.filter((item) => {
    if (typeFilter !== "all" && item.type !== typeFilter) {
      return false;
    }

    if (q) {
      const matchName = (item.customerName || "").toLowerCase().includes(q);
      const matchMsg = (item.message || "").toLowerCase().includes(q);
      const matchProd = (item.productName || "").toLowerCase().includes(q);
      if (!matchName && !matchMsg && !matchProd) return false;
    }

    return true;
  });
}
