import React, { useState } from "react";
import { Activity, Search, Filter } from "lucide-react";
import { filterIntegrationEventLogs, type IntegrationEventLogItem } from "./integration-model";

interface Props {
  logs?: IntegrationEventLogItem[];
  formatDate?: (ts: any) => string;
}

export const IntegrationEventLogsPanel: React.FC<Props> = ({
  logs = [],
  formatDate = (ts) => (ts ? String(ts) : ""),
}) => {
  const [query, setQuery] = useState("");
  const [integrationFilter, setIntegrationFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = filterIntegrationEventLogs(logs, query, integrationFilter, statusFilter);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-surface)] p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-blue-500/10 text-blue-500">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[var(--ca-text-primary)]">Integration Event Logs</h2>
              <p className="text-xs text-[var(--ca-text-secondary)] mt-0.5">
                Audit event payloads, webhooks, and API activity logs.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ca-text-muted)]" />
              <input
                type="text"
                placeholder="Search event logs..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="bg-[var(--ca-bg-hover)] border border-[var(--ca-border-subtle)] rounded-xl pl-8 pr-3 py-1.5 text-xs text-[var(--ca-text-primary)] outline-none focus:border-[var(--ca-brand)]"
              />
            </div>

            {/* Integration Filter */}
            <div className="flex items-center gap-1 bg-[var(--ca-bg-hover)] border border-[var(--ca-border-subtle)] rounded-xl px-2.5 py-1.5 text-xs">
              <Filter className="w-3.5 h-3.5 text-[var(--ca-text-muted)]" />
              <select
                value={integrationFilter}
                onChange={(e) => setIntegrationFilter(e.target.value)}
                className="bg-transparent text-[var(--ca-text-primary)] outline-none font-bold cursor-pointer"
              >
                <option value="all">All Integrations</option>
                <option value="Website Lead API">Website Lead API</option>
                <option value="WooCommerce">WooCommerce</option>
                <option value="Public API">Public API</option>
                <option value="Webhook">Webhook</option>
                <option value="Courier">Courier</option>
              </select>
            </div>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-[var(--ca-bg-hover)] border border-[var(--ca-border-subtle)] rounded-xl px-3 py-1.5 text-xs font-bold text-[var(--ca-text-primary)] outline-none cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
              <option value="duplicate">Duplicate</option>
            </select>
          </div>
        </div>

        {/* Logs Table */}
        <div className="overflow-x-auto">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-xs text-[var(--ca-text-muted)]">
              No matching integration event logs found.
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[var(--ca-border-subtle)] text-[var(--ca-text-muted)] uppercase tracking-wider font-bold">
                  <th className="py-3 px-3">Timestamp</th>
                  <th className="py-3 px-3">Integration</th>
                  <th className="py-3 px-3">Event Type</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Source Ref</th>
                  <th className="py-3 px-3">Sanitized Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ca-border-subtle)]">
                {filtered.map((log) => (
                  <tr key={log.id} className="hover:bg-[var(--ca-bg-hover)]">
                    <td className="py-3 px-3 text-[var(--ca-text-secondary)] whitespace-nowrap">
                      {formatDate(log.timestamp)}
                    </td>
                    <td className="py-3 px-3 font-bold text-[var(--ca-text-primary)]">
                      {log.integration}
                    </td>
                    <td className="py-3 px-3 font-mono text-[var(--ca-text-secondary)]">
                      {log.eventType}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded font-bold uppercase text-[10px] ${
                          log.status === "success"
                            ? "bg-emerald-500/10 text-emerald-500"
                            : log.status === "failed"
                            ? "bg-rose-500/10 text-rose-500"
                            : "bg-amber-500/10 text-amber-500"
                        }`}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono text-[var(--ca-text-muted)]">
                      {log.sourceRef || "-"}
                    </td>
                    <td className="py-3 px-3 text-[var(--ca-text-secondary)] truncate max-w-[250px]">
                      {log.details || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
