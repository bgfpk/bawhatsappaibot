export interface OrderItem {
  id: string;
  orderId: string;
  customerName?: string;
  customerPhone?: string;
  totalAmount?: number | string;
  status?: string;
  courierName?: string;
  trackingId?: string;
  createdAt?: number | string;
  rawOrder?: any;
}

export function normalizeOrderRecord(order: any): OrderItem {
  const data = typeof order?.order_data === "object" ? order.order_data : {};
  const orderId = order?.order_id || order?.$id || order?.id || "ID unavailable";
  const name = order?.customer_name || data?.customerName || data?.name || undefined;
  const phone = order?.customer_phone || data?.customerPhone || data?.phone || undefined;
  const total = order?.total || data?.totalAmount || data?.total || undefined;
  const status = order?.status || data?.status || undefined;
  const courierName = data?.courierName || data?.courier || order?.courier || undefined;
  const trackingId = data?.trackingId || order?.tracking_id || undefined;
  const createdAt = order?.$createdAt || order?.created_at || undefined;

  return {
    id: orderId,
    orderId,
    customerName: name,
    customerPhone: phone,
    totalAmount: total,
    status,
    courierName,
    trackingId,
    createdAt,
    rawOrder: order,
  };
}

export function filterOrders(orders: OrderItem[], query: string, statusFilter: string): OrderItem[] {
  const q = query.trim().toLowerCase();

  return orders.filter((item) => {
    if (q) {
      const matchId = item.orderId.toLowerCase().includes(q);
      const matchName = (item.customerName || "").toLowerCase().includes(q);
      const matchPhone = (item.customerPhone || "").includes(q);
      if (!matchId && !matchName && !matchPhone) return false;
    }

    if (statusFilter !== "all") {
      if ((item.status || "").toLowerCase() !== statusFilter.toLowerCase()) return false;
    }

    return true;
  });
}
