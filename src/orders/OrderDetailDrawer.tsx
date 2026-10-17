import React, { useState, useEffect } from "react";
import { Drawer } from "../design-system/primitives/Overlays";
import { ShoppingCart, Phone, User, Truck, Edit3, Trash2, XCircle, RefreshCw, Check } from "lucide-react";
import type { OrderItem } from "./order-model";

export interface OrderDetailDrawerProps {
  order?: OrderItem | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateOrder?: (orderId: string, orderData: any) => Promise<boolean> | boolean;
  onUpdateOrderStatus?: (orderId: string, status: string) => Promise<void> | void;
  onSyncTracking?: (order: any) => Promise<void> | void;
  onCancelOrder?: (order: any) => Promise<void> | void;
  onDeleteOrder?: (order: any) => Promise<void> | void;
  onBookPostexOrder?: (order: any) => Promise<void> | void;
  dynamicColumns?: Array<{ key: string; label: string }>;
  formatDate?: (ts?: number | string) => string;
  formatCurrency?: (val?: number | string) => string;
}

export const OrderDetailDrawer: React.FC<OrderDetailDrawerProps> = ({
  order,
  isOpen,
  onClose,
  onUpdateOrder,
  onUpdateOrderStatus,
  onSyncTracking,
  onCancelOrder,
  onDeleteOrder,
  onBookPostexOrder,
  dynamicColumns = [],
  formatDate = (ts) => (ts ? String(ts) : ""),
  formatCurrency = (val) => (val !== undefined ? String(val) : "Amount unavailable"),
}) => {
  if (!order) return null;

  const rawData = order.raw?.order_data || order.raw || {};
  const [currentStatus, setCurrentStatus] = useState(order.status || "pending");
  const [isUpdating, setIsUpdating] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isBooking, setIsBooking] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Edit fields mode
  const [isEditing, setIsEditing] = useState(false);
  const [editFormData, setEditFormData] = useState<Record<string, any>>({});
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (order) {
      setCurrentStatus(order.status || "pending");
      const existingData = order.raw?.order_data || order.raw || {};
      setEditFormData({
        name: order.customerName || existingData.name || "",
        phone: order.customerPhone || existingData.phone || "",
        address: existingData.address || existingData.shipping_address || "",
        totalAmount: order.totalAmount ?? existingData.totalAmount ?? 0,
        ...existingData,
      });
      setIsEditing(false);
      setSaveError(null);
    }
  }, [order]);

  const canUpdate = Boolean(onUpdateOrder || onUpdateOrderStatus);

  const handleStatusChange = async (newStatus: string) => {
    if (!canUpdate) return;
    const previousStatus = currentStatus;
    setCurrentStatus(newStatus);
    setIsUpdating(true);
    setSaveError(null);

    let success = true;
    try {
      if (onUpdateOrder) {
        const orderId = order.id;
        const updatedOrderData = {
          ...rawData,
          status: newStatus,
          orderStatus: newStatus,
        };
        const res = await onUpdateOrder(orderId, updatedOrderData);
        success = res !== false;
      } else if (onUpdateOrderStatus) {
        await onUpdateOrderStatus(order.id, newStatus);
      }
    } catch (err: any) {
      success = false;
      console.error("Failed to update order status:", err);
    }

    if (!success) {
      setCurrentStatus(previousStatus);
      setSaveError("Failed to update order status on server. Rolled back.");
    }
    setIsUpdating(false);
  };

  const handleSaveEditFields = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onUpdateOrder) return;
    setIsUpdating(true);
    setSaveError(null);

    try {
      const orderId = order.id;
      const updatedOrderData = {
        ...rawData,
        ...editFormData,
        name: editFormData.name,
        customerName: editFormData.name,
        phone: editFormData.phone,
        customerPhone: editFormData.phone,
        address: editFormData.address,
        totalAmount: Number(editFormData.totalAmount || 0),
      };
      const res = await onUpdateOrder(orderId, updatedOrderData);
      if (res !== false) {
        setIsEditing(false);
      } else {
        setSaveError("Failed to save order field updates.");
      }
    } catch (err: any) {
      setSaveError(err.message || "Failed to update order fields.");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSyncTrackingClick = async () => {
    if (!onSyncTracking) return;
    setIsSyncing(true);
    try {
      await onSyncTracking(order.raw || order);
    } catch (err: any) {
      console.error("Failed to sync tracking:", err);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleBookPostexClick = async () => {
    if (!onBookPostexOrder) return;
    setIsBooking(true);
    try {
      await onBookPostexOrder(order.raw || order);
    } catch (err: any) {
      console.error("Failed to book PostEx order:", err);
    } finally {
      setIsBooking(false);
    }
  };

  const handleCancelClick = async () => {
    if (!onCancelOrder) return;
    if (!window.confirm(`Are you sure you want to cancel Order ${order.orderId}?`)) return;
    setIsCancelling(true);
    try {
      await onCancelOrder(order.raw || order);
      onClose();
    } catch (err: any) {
      console.error("Failed to cancel order:", err);
    } finally {
      setIsCancelling(false);
    }
  };

  const handleDeleteClick = async () => {
    if (!onDeleteOrder) return;
    if (!window.confirm(`Are you sure you want to DELETE Order ${order.orderId}? This cannot be undone.`)) return;
    setIsDeleting(true);
    try {
      await onDeleteOrder(order.raw || order);
      onClose();
    } catch (err: any) {
      console.error("Failed to delete order:", err);
    } finally {
      setIsDeleting(false);
    }
  };

  const courierCompany = String(order.courierName || rawData.courierCompany || rawData.courier || "").toLowerCase();
  const isPostex = courierCompany.includes("postex");

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={`Order ${order.orderId}`}
      subtitle={`Created: ${formatDate(order.createdAt)}`}
    >
      <div className="space-y-4 text-xs font-medium text-[var(--ca-text-primary)]">
        {saveError && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-700 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-300 font-bold">
            {saveError}
          </div>
        )}

        {/* Customer Details */}
        <div className="rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-2)] p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="flex items-center gap-1.5 font-black text-[var(--ca-text-primary)]">
              <User className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span>Customer Details</span>
            </h4>
            {onUpdateOrder && !isEditing && (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
              >
                <Edit3 className="h-3 w-3" />
                <span>Edit Order</span>
              </button>
            )}
          </div>

          {!isEditing ? (
            <>
              <p className="font-bold text-sm">{order.customerName || "Customer unavailable"}</p>
              <p className="flex items-center gap-1 font-mono text-[var(--ca-text-secondary)]">
                <Phone className="h-3.5 w-3.5" />
                <span>{order.customerPhone || "No phone linked"}</span>
              </p>
              {rawData.address && (
                <p className="text-[var(--ca-text-secondary)]">
                  Address: <span className="font-semibold text-[var(--ca-text-primary)]">{rawData.address}</span>
                </p>
              )}
            </>
          ) : (
            <form onSubmit={handleSaveEditFields} className="space-y-3 pt-2">
              <div>
                <label className="block text-[10px] font-bold text-[var(--ca-text-muted)] uppercase mb-1">
                  Customer Name
                </label>
                <input
                  type="text"
                  value={editFormData.name || ""}
                  onChange={(e) => setEditFormData((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full rounded-lg border border-[var(--ca-border-default)] bg-[var(--ca-surface-1)] px-2.5 py-1.5 text-xs text-[var(--ca-text-primary)] outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[var(--ca-text-muted)] uppercase mb-1">
                  Customer Phone
                </label>
                <input
                  type="text"
                  value={editFormData.phone || ""}
                  onChange={(e) => setEditFormData((prev) => ({ ...prev, phone: e.target.value }))}
                  className="w-full font-mono rounded-lg border border-[var(--ca-border-default)] bg-[var(--ca-surface-1)] px-2.5 py-1.5 text-xs text-[var(--ca-text-primary)] outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[var(--ca-text-muted)] uppercase mb-1">
                  Shipping Address / City
                </label>
                <input
                  type="text"
                  value={editFormData.address || ""}
                  onChange={(e) => setEditFormData((prev) => ({ ...prev, address: e.target.value }))}
                  className="w-full rounded-lg border border-[var(--ca-border-default)] bg-[var(--ca-surface-1)] px-2.5 py-1.5 text-xs text-[var(--ca-text-primary)] outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[var(--ca-text-muted)] uppercase mb-1">
                  Total Amount (USD)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={editFormData.totalAmount ?? 0}
                  onChange={(e) => setEditFormData((prev) => ({ ...prev, totalAmount: e.target.value }))}
                  className="w-full font-mono rounded-lg border border-[var(--ca-border-default)] bg-[var(--ca-surface-1)] px-2.5 py-1.5 text-xs text-[var(--ca-text-primary)] outline-none focus:border-emerald-500"
                />
              </div>

              {/* Dynamic Custom Fields */}
              {dynamicColumns.map((col) => (
                <div key={col.key}>
                  <label className="block text-[10px] font-bold text-[var(--ca-text-muted)] uppercase mb-1">
                    {col.label}
                  </label>
                  <input
                    type="text"
                    value={editFormData[col.key] || ""}
                    onChange={(e) => setEditFormData((prev) => ({ ...prev, [col.key]: e.target.value }))}
                    className="w-full rounded-lg border border-[var(--ca-border-default)] bg-[var(--ca-surface-1)] px-2.5 py-1.5 text-xs text-[var(--ca-text-primary)] outline-none focus:border-emerald-500"
                  />
                </div>
              ))}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="rounded-lg border border-[var(--ca-border-default)] px-3 py-1.5 text-xs font-bold text-[var(--ca-text-secondary)] hover:bg-[var(--ca-surface-1)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-1"
                >
                  <Check className="h-3 w-3" />
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Order Status & Financial Summary */}
        <div className="rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-2)] p-3.5 space-y-3">
          <h4 className="flex items-center gap-1.5 font-black text-[var(--ca-text-primary)]">
            <ShoppingCart className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span>Order Summary</span>
          </h4>

          <div className="flex items-center justify-between gap-2">
            <span className="text-[var(--ca-text-secondary)]">Status:</span>
            <select
              value={currentStatus}
              disabled={!canUpdate || isUpdating}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="rounded-lg border border-[var(--ca-border-default)] bg-[var(--ca-surface-1)] px-2.5 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 outline-none focus:border-emerald-500 disabled:opacity-50"
            >
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
              <option value="dispatched">Dispatched</option>
              <option value="delivered">Delivered</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-[var(--ca-border-subtle)]">
            <span className="text-[var(--ca-text-secondary)]">Total Amount:</span>
            <span className="font-mono text-sm font-black text-[var(--ca-text-primary)]">
              {formatCurrency(order.totalAmount)}
            </span>
          </div>
        </div>

        {/* Courier / Shipping Context */}
        {order.courierName && (
          <div className="rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-2)] p-3.5 space-y-2">
            <h4 className="flex items-center gap-1.5 font-black text-[var(--ca-text-primary)]">
              <Truck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span>Courier Dispatch</span>
            </h4>
            <div className="flex items-center justify-between">
              <span className="text-[var(--ca-text-secondary)]">Courier:</span>
              <span className="font-bold">{order.courierName}</span>
            </div>
            {order.trackingId && (
              <div className="flex items-center justify-between">
                <span className="text-[var(--ca-text-secondary)]">Tracking ID:</span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {order.trackingId}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Operational Actions */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[var(--ca-border-subtle)]">
          {onSyncTracking && (order.trackingId || order.courierName) && (
            <button
              type="button"
              onClick={handleSyncTrackingClick}
              disabled={isSyncing}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] px-3 py-2 text-xs font-bold text-[var(--ca-text-primary)] hover:border-emerald-500 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-emerald-600 ${isSyncing ? "animate-spin" : ""}`} />
              <span>{isSyncing ? "Syncing..." : "Sync Tracking"}</span>
            </button>
          )}

          {onBookPostexOrder && isPostex && !order.trackingId && (
            <button
              type="button"
              onClick={handleBookPostexClick}
              disabled={isBooking}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <Truck className="h-3.5 w-3.5" />
              <span>{isBooking ? "Booking..." : "Book PostEx Courier"}</span>
            </button>
          )}

          {onCancelOrder && currentStatus !== "cancelled" && (
            <button
              type="button"
              onClick={handleCancelClick}
              disabled={isCancelling}
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700 hover:bg-amber-100 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300 disabled:opacity-50"
            >
              <XCircle className="h-3.5 w-3.5" />
              <span>{isCancelling ? "Cancelling..." : "Cancel Order"}</span>
            </button>
          )}

          {onDeleteOrder && (
            <button
              type="button"
              onClick={handleDeleteClick}
              disabled={isDeleting}
              className="inline-flex items-center gap-1.5 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>{isDeleting ? "Deleting..." : "Delete Order"}</span>
            </button>
          )}
        </div>
      </div>
    </Drawer>
  );
};
