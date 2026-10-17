import React from "react";
import { Send, Clock, CheckCircle2, AlertTriangle } from "lucide-react";
import { DashboardEmptyState, ToneBadge } from "../../components/dashboard/DashboardPrimitives";
import type { BroadcastCampaignItem } from "./broadcast-model";

export interface BroadcastHistoryPanelProps {
  history: BroadcastCampaignItem[];
  formatDate?: (ts?: number | string) => string;
  formatCurrency?: (val?: number) => string;
}

export const BroadcastHistoryPanel: React.FC<BroadcastHistoryPanelProps> = ({
  history = [],
  formatDate = (ts) => (ts ? String(ts) : ""),
  formatCurrency = (val) => (val !== undefined ? `$${val.toFixed(3)}` : "$0.00"),
}) => {
  if (history.length === 0) {
    return (
      <DashboardEmptyState
        icon={Send}
        title="No Broadcast History"
        body="No bulk broadcast campaigns have been sent yet."
        tone="neutral"
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-1)]">
      <table className="w-full text-left text-xs font-medium">
        <thead>
          <tr className="border-b border-[var(--ca-border-subtle)] bg-[var(--ca-surface-2)] text-[10px] uppercase font-bold text-[var(--ca-text-muted)]">
            <th className="p-3">Broadcast Name</th>
            <th className="p-3">Date</th>
            <th className="p-3">Recipients</th>
            <th className="p-3">Delivered</th>
            <th className="p-3">Status</th>
            <th className="p-3 text-right">Charged</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--ca-border-subtle)]">
          {history.map((item) => (
            <tr key={item.id} className="hover:bg-[var(--ca-surface-2)] transition-colors">
              <td className="p-3 font-bold text-[var(--ca-text-primary)]">
                {item.title}
                {item.instanceName && (
                  <p className="font-mono text-[10px] text-[var(--ca-text-muted)] font-normal">
                    Via: {item.instanceName}
                  </p>
                )}
              </td>
              <td className="p-3 font-mono text-[11px] text-[var(--ca-text-muted)]">
                {formatDate(item.createdAt)}
              </td>
              <td className="p-3 font-mono text-[var(--ca-text-secondary)]">
                {item.audienceCount} contacts
              </td>
              <td className="p-3 font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                {item.sentCount} / {item.audienceCount}
              </td>
              <td className="p-3">
                <ToneBadge tone={item.status === "completed" ? "teal" : item.status === "in_progress" ? "amber" : "rose"}>
                  {item.status}
                </ToneBadge>
              </td>
              <td className="p-3 text-right font-mono font-bold text-[var(--ca-text-primary)]">
                {formatCurrency(item.chargedAmount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
