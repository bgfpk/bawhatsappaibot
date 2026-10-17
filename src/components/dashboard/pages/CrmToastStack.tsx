import React from "react";
import { CheckCircle2, XCircle } from "lucide-react";

export function CrmToastStack({
  toasts,
  onDismiss,
}: {
  toasts: Array<{ id: string; tone: "success" | "error" | "info"; message: string }>;
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed right-4 top-[max(1rem,env(safe-area-inset-top))] z-[140] flex w-[min(92vw,22rem)] flex-col gap-2 max-sm:left-4 max-sm:right-4 max-sm:w-auto">
      {toasts.map((toast) => {
        const isError = toast.tone === "error";
        const Icon = isError ? XCircle : CheckCircle2;
        return (
          <button
            key={toast.id}
            type="button"
            onClick={() => onDismiss(toast.id)}
            className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 text-left text-sm font-bold shadow-lg ${
              isError
                ? "border-red-200 bg-red-50/95 text-red-800 dark:border-red-900 dark:bg-red-950/90 dark:text-red-200"
                : "border-emerald-200 bg-emerald-50/95 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/90 dark:text-emerald-200"
            }`}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1">{toast.message}</span>
          </button>
        );
      })}
    </div>
  );
}
