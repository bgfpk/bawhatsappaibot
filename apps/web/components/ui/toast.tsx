import * as React from "react";
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ToastProps {
  id?: string;
  title?: string;
  description?: string;
  variant?: "default" | "success" | "warning" | "error";
  onClose?: () => void;
}

export function Toast({
  title,
  description,
  variant = "default",
  onClose,
}: ToastProps) {
  const icons = {
    default: <Info className="h-5 w-5 text-[var(--ca-cyan)]" />,
    success: <CheckCircle2 className="h-5 w-5 text-[var(--ca-teal)]" />,
    warning: <AlertTriangle className="h-5 w-5 text-[var(--ca-amber)]" />,
    error: <AlertCircle className="h-5 w-5 text-[var(--ca-rose)]" />,
  };

  const borders = {
    default: "border-[var(--ca-border-strong)]",
    success: "border-[var(--ca-teal)]/40",
    warning: "border-[var(--ca-amber)]/40",
    error: "border-[var(--ca-rose)]/40",
  };

  return (
    <div
      className={cn(
        "pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-lg border bg-[var(--ca-surface-1)] p-4 shadow-lg transition-all text-[var(--ca-text-primary)]",
        borders[variant]
      )}
    >
      <div className="shrink-0 mt-0.5">{icons[variant]}</div>
      <div className="flex-1 space-y-1">
        {title && <p className="text-sm font-semibold">{title}</p>}
        {description && (
          <p className="text-xs text-[var(--ca-text-muted)]">{description}</p>
        )}
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="shrink-0 rounded-md p-1 opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-[var(--ca-focus-ring)]"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
