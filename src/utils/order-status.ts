const INACTIVE_STATUSES = [
  "cancelled",
  "canceled",
  "cancel",
  "deleted",
  "void",
  "refunded",
  "returned",
  "expired",
  "un-assigned by me",
];

function clean(value: any) {
  return String(value || "").trim().toLowerCase();
}

export function getOrderData(order: any) {
  return order?.order_data || order?.orderData || order || {};
}

export function getOrderStatus(order: any) {
  const data = getOrderData(order);
  return clean(
    data.orderStatus ||
    data.transactionStatus ||
    data.latestTrackingStatus ||
    data.status
  );
}

export function isInactiveOrder(order: any) {
  const data = getOrderData(order);
  if (data.deletedAt || data.cancelledAt || data.canceledAt) return true;
  const status = getOrderStatus(order);
  return INACTIVE_STATUSES.some((item) => status.includes(item));
}

export function isDeletedOrder(order: any) {
  const data = getOrderData(order);
  return !!data.deletedAt || getOrderStatus(order).includes("deleted");
}

export function markOrderCancelled(orderData: any) {
  return {
    ...(orderData || {}),
    orderStatus: "Cancelled",
    transactionStatus: "Cancelled",
    cancelledAt: new Date().toISOString(),
  };
}

export function markOrderDeleted(orderData: any) {
  return {
    ...(orderData || {}),
    orderStatus: "Deleted",
    transactionStatus: "Deleted",
    deletedAt: new Date().toISOString(),
  };
}
