import React, { useState, useMemo } from "react";
import { Search, ShoppingCart, Eye, Download } from "lucide-react";
import { DashboardPageHeader, DashboardToolbar, DashboardEmptyState, ToneBadge } from "../components/dashboard/DashboardPrimitives";
import { filterOrders, normalizeOrderRecord, type OrderItem } from "./order-model";
import { OrderDetailDrawer } from "./OrderDetailDrawer";

export interface OrdersPageProps {
  orders: any[];
  onSelectOrder?: (order: OrderItem) => void;
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

export const OrdersPage: React.FC<OrdersPageProps> = ({
  orders = [],
  onSelectOrder,
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
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedOrder, setSelectedOrder] = useState<OrderItem | null>(null);

  const normalizedOrders = useMemo(() => {
    return (orders || []).map(normalizeOrderRecord);
  }, [orders]);

  const filtered = useMemo(() => {
    return filterOrders(normalizedOrders, searchQuery, statusFilter);
  }, [normalizedOrders, searchQuery, statusFilter]);

  const handleOpenDetail = (item: OrderItem) => {
    setSelectedOrder(item);
    if (onSelectOrder) onSelectOrder(item);
  };

  const handleExportCSV = () => {
    if (filtered.length === 0) return;
    let csv = "Order ID,Customer Name,Customer Phone,Total Amount,Status,Courier,Tracking ID,Created At\n";
    filtered.forEach((o) => {
      const name = `"${(o.customerName || "").replace(/"/g, '""')}"`;
      const dateStr = formatDate(o.createdAt);
      csv += `${o.orderId},${name},${o.customerPhone || ""},${o.totalAmount},${o.status || ""},${o.courierName || ""},${o.trackingId || ""},${dateStr}\n`;
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Orders_Export_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col gap-5">
      <DashboardPageHeader
        eyebrow="Operations"
        title="Leads & Orders"
        description="View and process customer orders, delivery details, and courier dispatches."
        icon={ShoppingCart}
      />

      <DashboardToolbar>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ca-text-muted)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search order ID, customer, or phone..."
            className="w-full rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] pl-10 pr-4 py-2 text-xs font-medium text-[var(--ca-text-primary)] outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] px-3 py-2 text-xs font-bold text-[var(--ca-text-primary)] outline-none focus:border-emerald-500"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="dispatched">Dispatched</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
          </select>

          <button
            type="button"
            onClick={handleExportCSV}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] px-3 py-2 text-xs font-bold text-[var(--ca-text-primary)] hover:border-emerald-500 disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5 text-emerald-600" />
            <span>Export Orders CSV</span>
          </button>
        </div>
      </DashboardToolbar>

      {filtered.length === 0 ? (
        <DashboardEmptyState
          icon={ShoppingCart}
          title="No Orders Found"
          body="No lead or order records match your search criteria."
          tone="neutral"
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-1)] shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--ca-border-subtle)] bg-[var(--ca-surface-2)] text-[var(--ca-text-muted)] font-bold">
                  <th className="p-4">Order ID</th>
                  <th className="p-4">Customer</th>
                  <th className="p-4">Total</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Courier</th>
                  <th className="p-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ca-border-subtle)] font-medium">
                {filtered.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => handleOpenDetail(item)}
                    className="cursor-pointer hover:bg-[var(--ca-surface-2)] transition-colors"
                  >
                    <td className="p-4 font-mono font-bold text-[var(--ca-text-primary)]">
                      {item.orderId}
                    </td>
                    <td className="p-4">
                      <div className="font-bold text-[var(--ca-text-primary)]">
                        {item.customerName || "Customer unavailable"}
                      </div>
                      <div className="font-mono text-[10px] text-[var(--ca-text-secondary)]">
                        {item.customerPhone || "No phone"}
                      </div>
                    </td>
                    <td className="p-4 font-mono font-bold text-[var(--ca-text-primary)]">
                      {formatCurrency(item.totalAmount)}
                    </td>
                    <td className="p-4">
                      <ToneBadge tone="teal">{item.status || "Status unavailable"}</ToneBadge>
                    </td>
                    <td className="p-4 text-[var(--ca-text-muted)]">
                      {item.courierName ? `${item.courierName} ${item.trackingId ? `(${item.trackingId})` : ""}` : "Not dispatched"}
                    </td>
                    <td className="p-4 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenDetail(item);
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] px-2.5 py-1 text-[11px] font-bold text-[var(--ca-text-primary)] hover:border-emerald-500"
                      >
                        <Eye className="h-3 w-3" />
                        <span>View</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedOrder && (
        <OrderDetailDrawer
          order={selectedOrder}
          isOpen={Boolean(selectedOrder)}
          onClose={() => setSelectedOrder(null)}
          onUpdateOrder={onUpdateOrder}
          onUpdateOrderStatus={onUpdateOrderStatus}
          onSyncTracking={onSyncTracking}
          onCancelOrder={onCancelOrder}
          onDeleteOrder={onDeleteOrder}
          onBookPostexOrder={onBookPostexOrder}
          dynamicColumns={dynamicColumns}
          formatDate={formatDate}
          formatCurrency={formatCurrency}
        />
      )}
    </div>
  );
};
