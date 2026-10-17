import React from "react";
import { Drawer } from "../../design-system/primitives/Overlays";
import { Layers, Clock, FileText, Tag, CheckCircle2 } from "lucide-react";
import { ToneBadge } from "../../components/dashboard/DashboardPrimitives";
import type { SequenceGroupItem } from "../content-library-model";

export interface SequenceDetailDrawerProps {
  sequence: SequenceGroupItem | null;
  isOpen: boolean;
  onClose: () => void;
  formatDate?: (ts?: number | string) => string;
}

export const SequenceDetailDrawer: React.FC<SequenceDetailDrawerProps> = ({
  sequence,
  isOpen,
  onClose,
  formatDate = (ts) => (ts ? String(ts) : ""),
}) => {
  if (!sequence) return null;

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={sequence.name}
      subtitle={`Sequence Flow (${sequence.itemCount} items)`}
    >
      <div className="space-y-4 text-xs font-medium text-[var(--ca-text-primary)]">
        {/* Sequence Metadata Header */}
        <div className="rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-2)] p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-[var(--ca-text-muted)]">Status:</span>
            <ToneBadge tone={sequence.isEnabled ? "teal" : "neutral"}>
              {sequence.isEnabled ? "Active Sequence" : "Disabled"}
            </ToneBadge>
          </div>
          {sequence.shortcutCode && (
            <div className="flex justify-between items-center">
              <span className="text-[var(--ca-text-muted)] font-bold">Shortcut Trigger:</span>
              <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-[var(--ca-surface-1)] px-2 py-0.5 rounded border border-[var(--ca-border-subtle)]">
                !{sequence.shortcutCode}
              </span>
            </div>
          )}
          {sequence.keywordTrigger && (
            <div className="flex justify-between items-center">
              <span className="text-[var(--ca-text-muted)] font-bold">Keyword Trigger:</span>
              <span className="font-mono font-bold text-blue-600 dark:text-blue-400 bg-[var(--ca-surface-1)] px-2 py-0.5 rounded border border-[var(--ca-border-subtle)]">
                {sequence.keywordTrigger}
              </span>
            </div>
          )}
        </div>

        {/* Order Guidance note */}
        <div className="rounded-xl border border-amber-200/60 bg-amber-50/50 dark:bg-amber-950/30 p-3 text-[11px] text-amber-800 dark:text-amber-200">
          <strong>Captured Sequence Order:</strong> Item order is derived directly from the source WhatsApp group sequence message flow.
        </div>

        {/* Sequence Steps */}
        <div className="space-y-3">
          <h4 className="font-bold text-xs text-[var(--ca-text-primary)] uppercase tracking-wider">
            Sequence Flow Items
          </h4>

          {sequence.items.length === 0 ? (
            <p className="text-[11px] text-[var(--ca-text-muted)] italic">No sequence items captured in this group.</p>
          ) : (
            sequence.items.map((item, idx) => (
              <div
                key={idx}
                className="relative flex gap-3 rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-1)] p-3 shadow-sm"
              >
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold text-xs">
                  {idx + 1}
                </div>

                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold uppercase tracking-wider text-[10px] text-emerald-600 dark:text-emerald-400">
                      {item.type}
                    </span>
                    {item.delaySeconds ? (
                      <span className="inline-flex items-center gap-1 font-mono text-[10px] text-[var(--ca-text-muted)]">
                        <Clock className="h-3 w-3" /> Delay: {item.delaySeconds}s
                      </span>
                    ) : null}
                  </div>

                  <p className="text-xs text-[var(--ca-text-secondary)] whitespace-pre-wrap leading-relaxed">
                    {item.content}
                  </p>

                  {item.fileName && (
                    <p className="font-mono text-[10px] text-[var(--ca-text-muted)] pt-1">
                      File: {item.fileName}
                    </p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </Drawer>
  );
};
