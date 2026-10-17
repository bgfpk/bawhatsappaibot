import React from "react";
import { AlertTriangle, RotateCcw, X } from "lucide-react";

export interface ResetLoginDialogProps {
  isOpen: boolean;
  instanceName?: string;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  isLoading?: boolean;
}

export const ResetLoginDialog: React.FC<ResetLoginDialogProps> = ({
  isOpen,
  instanceName = "WhatsApp Instance",
  onClose,
  onConfirm,
  isLoading = false,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reset-login-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-amber-200 bg-[var(--ca-surface-1)] p-6 shadow-2xl dark:border-amber-900/60">
        <div className="flex items-start justify-between border-b border-[var(--ca-border-subtle)] pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <RotateCcw className="h-6 w-6" />
            </div>
            <div>
              <h3 id="reset-login-title" className="text-base font-black tracking-tight text-[var(--ca-text-primary)]">
                Reset WhatsApp Login?
              </h3>
              <p className="text-xs text-[var(--ca-text-secondary)] font-medium">
                {instanceName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="rounded-lg p-1 text-[var(--ca-text-muted)] hover:bg-[var(--ca-surface-2)] hover:text-[var(--ca-text-primary)]"
            aria-label="Close reset login dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="my-5 rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-xs font-medium text-amber-900 leading-relaxed dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200 space-y-2">
          <div className="flex items-center gap-2 font-bold text-amber-950 dark:text-amber-100">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>Destructive Auth Action Summary</span>
          </div>
          <ul className="list-disc pl-5 space-y-1">
            <li>Current linked WhatsApp session for this instance will be disconnected.</li>
            <li>Saved WhatsApp authentication keys will be cleared for this number.</li>
            <li>A fresh QR code will be generated for phone pairing.</li>
            <li>Saved replies, products, custom fields, and conversation logs remain intact.</li>
          </ul>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="rounded-xl px-4 py-2 text-xs font-bold text-[var(--ca-text-secondary)] hover:bg-[var(--ca-surface-2)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-5 py-2 text-xs font-black text-white transition-all hover:bg-amber-700 active:scale-95 disabled:opacity-50"
          >
            {isLoading ? (
              <span>Resetting Auth...</span>
            ) : (
              <>
                <RotateCcw className="h-4 w-4" />
                <span>Yes, Reset Login & Re-pair</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
