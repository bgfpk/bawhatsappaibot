import React, { useState } from "react";
import { Activity, Search, Filter } from "lucide-react";
import { filterUsageRecords, formatAccountCurrency, type UsageRecordItem } from "./billing-model";

interface Props {
  usageRecords?: UsageRecordItem[];
  currency?: string;
  formatDate?: (ts: any) => string;
  limit?: number;
  onLimitChange?: (limit: number) => void;
}

export const UsageDashboard: React.FC<Props> = ({
  usageRecords = [],
  currency = "USD",
  formatDate = (ts) => (ts ? String(ts) : ""),
  limit = 100,
  onLimitChange,
}) => {
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const filtered = filterUsageRecords(usageRecords, query, categoryFilter);

  const totalCharges = filtered.reduce((acc, r) => acc + (r.totalUsd || 0), 0);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-surface)] p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-blue-500/10 text-blue-500">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[var(--ca-text-primary)]">Usage Breakdown</h2>
              <p className="text-xs text-[var(--ca-text-secondary)] mt-0.5">
                Live itemized AI replies, extra calls, voice generation, image analysis, and broadcast usage (newest first).
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-[var(--ca-bg-hover)] border border-[var(--ca-border-subtle)] rounded-xl px-2.5 py-1.5 text-xs">
              <span className="text-[var(--ca-text-muted)] font-medium">Show:</span>
              <select
                id="usage-record-limit-selector"
                value={limit}
                onChange={(e) => onLimitChange?.(Number(e.target.value))}
                className="bg-transparent text-[var(--ca-text-primary)] outline-none font-bold cursor-pointer"
              >
                <option value={10}>Last 10</option>
                <option value={100}>Last 100</option>
                <option value={1000}>Last 1000</option>
              </select>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ca-text-muted)]" />
              <input
                type="text"
                placeholder="Search usage..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="bg-[var(--ca-bg-hover)] border border-[var(--ca-border-subtle)] rounded-xl pl-8 pr-3 py-1.5 text-xs text-[var(--ca-text-primary)] outline-none focus:border-[var(--ca-brand)]"
              />
            </div>

            <div className="flex items-center gap-1 bg-[var(--ca-bg-hover)] border border-[var(--ca-border-subtle)] rounded-xl px-2.5 py-1.5 text-xs">
              <Filter className="w-3.5 h-3.5 text-[var(--ca-text-muted)]" />
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="bg-transparent text-[var(--ca-text-primary)] outline-none font-bold cursor-pointer"
              >
                <option value="all">All Categories</option>
                <option value="customer_ai">Customer AI Reply</option>
                <option value="owner_assistant">Owner Assistant AI</option>
                <option value="personal_assistant">Personal Assistant AI</option>
                <option value="voice">Voice Understanding & Generation</option>
                <option value="image">Image Analysis</option>
                <option value="broadcast">Broadcast Send</option>
                <option value="followup">Smart Follow-up</option>
                <option value="other">Other Usage</option>
              </select>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-xs text-[var(--ca-text-muted)]">
              No usage records found for the selected filter.
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[var(--ca-border-subtle)] text-[var(--ca-text-muted)] uppercase tracking-wider font-bold">
                  <th className="py-3 px-3">Date & Time</th>
                  <th className="py-3 px-3">Category</th>
                  <th className="py-3 px-3">Unit Price</th>
                  <th className="py-3 px-3">Count</th>
                  <th className="py-3 px-3">Total Charged</th>
                  <th className="py-3 px-3">Instance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ca-border-subtle)]">
                {filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-[var(--ca-bg-hover)]">
                    <td className="py-3 px-3 text-[var(--ca-text-secondary)] whitespace-nowrap">
                      {formatDate(item.timestamp)}
                    </td>
                    <td className="py-3 px-3 font-bold text-[var(--ca-text-primary)]">
                      {item.categoryLabel}
                    </td>
                    <td className="py-3 px-3 font-mono text-[var(--ca-text-secondary)]">
                      {formatAccountCurrency(item.unitPriceUsd, currency)}
                    </td>
                    <td className="py-3 px-3 font-bold text-[var(--ca-text-primary)] font-mono">
                      {item.count}
                    </td>
                    <td className="py-3 px-3 font-bold font-mono text-emerald-500">
                      {formatAccountCurrency(item.totalUsd, currency)}
                    </td>
                    <td className="py-3 px-3 text-[var(--ca-text-muted)]">
                      {item.instanceName || "Default Instance"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--ca-border-subtle)] font-bold text-xs">
                  <td colSpan={4} className="py-3 px-3 text-[var(--ca-text-primary)] text-right">
                    Total Filtered Charges:
                  </td>
                  <td className="py-3 px-3 font-mono text-emerald-500 text-sm">
                    {formatAccountCurrency(totalCharges, currency)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
