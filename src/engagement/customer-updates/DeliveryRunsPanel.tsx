import React, { useState, useMemo } from "react";
import { Search, BellRing, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { DashboardEmptyState, ToneBadge } from "../../components/dashboard/DashboardPrimitives";
import { filterCustomerUpdates, type CustomerUpdateItem } from "./customer-update-model";

export interface DeliveryRunsPanelProps {
  updates: CustomerUpdateItem[];
  formatDate?: (ts?: number | string) => string;
}

export const DeliveryRunsPanel: React.FC<DeliveryRunsPanelProps> = ({
  updates = [],
  formatDate = (ts) => (ts ? String(ts) : ""),
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const filtered = useMemo(() => {
    return filterCustomerUpdates(updates, searchQuery, typeFilter);
  }, [updates, searchQuery, typeFilter]);

  if (filtered.length === 0) {
    return (
      <DashboardEmptyState
        icon={BellRing}
        title="No Delivery Runs Found"
        body="No customer update execution runs match your filter."
        tone="neutral"
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-bold text-[var(--ca-text-primary)]">
          Customer Update History ({filtered.length})
        </h3>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px]">
            <Search className="absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ca-text-muted)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search updates..."
              className="w-full rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] pl-9 pr-3 py-1.5 text-xs text-[var(--ca-text-primary)] outline-none focus:border-emerald-500"
            />
          </div>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] px-3 py-1.5 text-xs font-bold text-[var(--ca-text-primary)] outline-none focus:border-emerald-500"
          >
            <option value="all">All Update Types</option>
            <option value="planned">Planned Updates</option>
            <option value="stock">Stock Alerts</option>
          </select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-1)]">
        <table className="w-full text-left text-xs font-medium">
          <thead>
            <tr className="border-b border-[var(--ca-border-subtle)] bg-[var(--ca-surface-2)] text-[10px] uppercase font-bold text-[var(--ca-text-muted)]">
              <th className="p-3">Customer / Target</th>
              <th className="p-3">Category</th>
              <th className="p-3">Scheduled Time</th>
              <th className="p-3">Message Summary</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Sends</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--ca-border-subtle)]">
            {filtered.map((item) => (
              <tr key={item.id} className="hover:bg-[var(--ca-surface-2)] transition-colors">
                <td className="p-3 font-bold text-[var(--ca-text-primary)]">
                  {item.customerName || "Customer Contact"}
                </td>
                <td className="p-3">
                  <ToneBadge tone={item.type === "stock" ? "blue" : "teal"}>
                    {item.type === "stock" ? "Stock Alert" : "Planned Update"}
                  </ToneBadge>
                </td>
                <td className="p-3 font-mono text-[11px] text-[var(--ca-text-muted)]">
                  {item.scheduledAt ? formatDate(item.scheduledAt) : "Immediate"}
                </td>
                <td className="p-3">
                  <p className="text-xs text-[var(--ca-text-secondary)] line-clamp-1 max-w-xs">
                    {item.message}
                  </p>
                </td>
                <td className="p-3">
                  <ToneBadge tone={item.status === "sent" ? "teal" : item.status === "cancelled" ? "rose" : "amber"}>
                    {item.status}
                  </ToneBadge>
                </td>
                <td className="p-3 text-right font-mono font-bold text-[var(--ca-text-primary)]">
                  {item.sentCount || 0}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
