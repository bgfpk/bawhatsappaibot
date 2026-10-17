import React from "react";
import { AlertCircle, AlertTriangle, ArrowRight, Info } from "lucide-react";
import type { OverviewAttentionItem } from "./overview-model";

export interface OverviewAttentionPanelProps {
  items: OverviewAttentionItem[];
  onNavigate: (targetView: string, aiTab?: string, billingTab?: string) => void;
}

export const OverviewAttentionPanel: React.FC<OverviewAttentionPanelProps> = ({
  items,
  onNavigate,
}) => {
  if (!items || items.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-[var(--ca-amber)]" aria-hidden="true" />
        <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ca-text-muted)]">
          Attention Required ({items.length})
        </h3>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {items.map((item) => {
          const isCritical = item.severity === "critical";
          const isWarning = item.severity === "warning";

          return (
            <div
              key={item.id}
              className={`flex flex-col justify-between gap-3 rounded-2xl border p-4 shadow-sm transition-colors ${
                isCritical
                  ? "border-[var(--ca-danger-soft)] bg-[var(--ca-danger-soft)]/20"
                  : isWarning
                    ? "border-[var(--ca-warning-soft)] bg-[var(--ca-warning-soft)]/20"
                    : "border-[var(--ca-border-default)] bg-[var(--ca-surface-1)]"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 shrink-0">
                  {isCritical ? (
                    <AlertCircle className="h-5 w-5 text-[var(--ca-danger-text)]" aria-hidden="true" />
                  ) : isWarning ? (
                    <AlertTriangle className="h-5 w-5 text-[var(--ca-warning)]" aria-hidden="true" />
                  ) : (
                    <Info className="h-5 w-5 text-[var(--ca-info-text)]" aria-hidden="true" />
                  )}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-[var(--ca-text-primary)]">{item.title}</h4>
                  <p className="mt-0.5 text-xs text-[var(--ca-text-secondary)]">{item.description}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onNavigate(item.actionTarget, item.aiTab, item.billingTab)}
                className={`self-end inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                  isCritical
                    ? "bg-[var(--ca-danger-text)] text-white hover:opacity-90"
                    : "bg-[var(--ca-surface-3)] text-[var(--ca-text-primary)] hover:bg-[var(--ca-border-default)]"
                }`}
              >
                <span>{item.actionLabel}</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
