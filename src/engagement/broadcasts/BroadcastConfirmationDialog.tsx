import React from "react";
import { Dialog } from "../../design-system/primitives/Overlays";
import { AlertTriangle, Send, ShieldAlert, CheckCircle2 } from "lucide-react";

export interface BroadcastConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmSend: () => Promise<void> | void;
  title: string;
  recipientCount: number;
  instanceName: string;
  estimatedCost: number;
  isSending?: boolean;
}

export const BroadcastConfirmationDialog: React.FC<BroadcastConfirmationDialogProps> = ({
  isOpen,
  onClose,
  onConfirmSend,
  title,
  recipientCount,
  instanceName,
  estimatedCost,
  isSending = false,
}) => {
  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Confirm WhatsApp Broadcast Send"
      description="Review campaign delivery details before initiating mass WhatsApp delivery."
    >
      <div className="space-y-4 text-xs font-medium text-[var(--ca-text-primary)]">
        <div className="rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-2)] p-3.5 space-y-2">
          <div className="flex justify-between">
            <span className="text-[var(--ca-text-muted)] font-bold">Campaign Name:</span>
            <span className="font-bold text-[var(--ca-text-primary)]">{title || "Untitled Broadcast"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--ca-text-muted)] font-bold">Target Recipients:</span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400">{recipientCount} contacts</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--ca-text-muted)] font-bold">Sending Instance:</span>
            <span className="font-mono text-[var(--ca-text-secondary)]">{instanceName}</span>
          </div>
          <div className="flex justify-between border-t border-[var(--ca-border-subtle)] pt-2">
            <span className="text-[var(--ca-text-muted)] font-bold">Est. Max Wallet Cost:</span>
            <span className="font-mono font-black text-amber-600 dark:text-amber-400">${estimatedCost.toFixed(3)}</span>
          </div>
        </div>

        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200/60 bg-amber-50/60 dark:bg-amber-950/30 p-3 text-[11px] text-amber-800 dark:text-amber-200">
          <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
          <div>
            <strong>Billing & Safety Policy:</strong> Wallet charges apply strictly upon successful receipt-backed message delivery. Unsent or failed attempts will not be charged.
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-[var(--ca-border-subtle)]">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[var(--ca-border-default)] px-4 py-2 text-xs font-bold text-[var(--ca-text-secondary)] hover:bg-[var(--ca-surface-2)]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isSending}
            onClick={() => onConfirmSend()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" />
            <span>{isSending ? "Initiating Broadcast..." : "Confirm & Send Broadcast"}</span>
          </button>
        </div>
      </div>
    </Dialog>
  );
};
