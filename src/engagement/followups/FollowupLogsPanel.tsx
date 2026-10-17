import React, { useState, useMemo } from "react";
import { Search, Clock, ShieldCheck, AlertTriangle, SkipForward } from "lucide-react";
import { DashboardEmptyState, ToneBadge } from "../../components/dashboard/DashboardPrimitives";
import { filterFollowupLogs, type FollowupActivityLog } from "./followup-model";

export interface FollowupLogsPanelProps {
  logs: FollowupActivityLog[];
  formatDate?: (ts?: number | string) => string;
  formatCurrency?: (val?: number) => string;
}

export const FollowupLogsPanel: React.FC<FollowupLogsPanelProps> = ({
  logs = [],
  formatDate = (ts) => (ts ? String(ts) : ""),
  formatCurrency = (val) => (val !== undefined ? `$${val.toFixed(3)}` : "$0.00"),
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = useMemo(() => {
    return filterFollowupLogs(logs, searchQuery, statusFilter);
  }, [logs, searchQuery, statusFilter]);

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case "sent":
        return <ToneBadge tone="teal">Sent</ToneBadge>;
      case "failed":
        return <ToneBadge tone="rose">Failed</ToneBadge>;
      case "skipped":
        return <ToneBadge tone="amber">Skipped</ToneBadge>;
      default:
        return <ToneBadge tone="neutral">Pending</ToneBadge>;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-bold text-[var(--ca-text-primary)]">
            Follow-up Execution Logs ({filtered.length})
          </h3>
          <p className="text-xs text-[var(--ca-text-muted)]">
            Audit history of automated follow-up delivery attempts, status, and receipt evidence.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ca-text-muted)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search contact, phone, campaign..."
              className="w-full rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] pl-9 pr-3 py-1.5 text-xs text-[var(--ca-text-primary)] outline-none focus:border-emerald-500"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] px-3 py-1.5 text-xs font-bold text-[var(--ca-text-primary)] outline-none focus:border-emerald-500"
          >
            <option value="all">All Execution Statuses</option>
            <option value="sent">Sent & Delivered</option>
            <option value="failed">Failed Delivery</option>
            <option value="skipped">Skipped Rules</option>
            <option value="pending">Pending Queue</option>
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <DashboardEmptyState
          icon={Clock}
          title="No Follow-up Logs Found"
          body="No execution logs match your search filter."
          tone="neutral"
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-1)]">
          <table className="w-full text-left text-xs font-medium">
            <thead>
              <tr className="border-b border-[var(--ca-border-subtle)] bg-[var(--ca-surface-2)] text-[10px] uppercase font-bold text-[var(--ca-text-muted)]">
                <th className="p-3">Customer / Phone</th>
                <th className="p-3">Campaign</th>
                <th className="p-3">Attempt Time</th>
                <th className="p-3">Status</th>
                <th className="p-3">Instance</th>
                <th className="p-3 text-right">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--ca-border-subtle)]">
              {filtered.map((log) => (
                <tr key={log.id} className="hover:bg-[var(--ca-surface-2)] transition-colors">
                  <td className="p-3">
                    <p className="font-bold text-[var(--ca-text-primary)]">
                      {log.customerName || "Customer Contact"}
                    </p>
                    {log.customerPhone && (
                      <p className="font-mono text-[10px] text-[var(--ca-text-muted)]">
                        {log.customerPhone}
                      </p>
                    )}
                  </td>
                  <td className="p-3">
                    <p className="font-bold text-[var(--ca-text-secondary)]">
                      {log.campaignName || "Default Campaign"}
                    </p>
                  </td>
                  <td className="p-3 font-mono text-[11px] text-[var(--ca-text-muted)]">
                    {formatDate(log.timestamp)}
                  </td>
                  <td className="p-3">
                    {renderStatusBadge(log.status)}
                    {log.reason && (
                      <p className="text-[10px] text-[var(--ca-text-muted)] truncate max-w-xs pt-0.5">
                        {log.reason}
                      </p>
                    )}
                  </td>
                  <td className="p-3 font-mono text-[11px] text-[var(--ca-text-secondary)]">
                    {log.instanceName || "Default Instance"}
                  </td>
                  <td className="p-3 text-right font-mono font-bold text-[var(--ca-text-primary)]">
                    {log.status === "sent" && log.cost ? formatCurrency(log.cost) : "$0.000"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
