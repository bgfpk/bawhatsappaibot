import * as React from "react";
import { Loader2, AlertCircle, CheckCircle, FolderOpen } from "lucide-react";
import { Button } from "./button";
import { cn } from "@/lib/utils";

export function EmptyState({
  title = "No data found",
  description = "Get started by adding your first record or connecting WhatsApp.",
  actionLabel,
  onAction,
  className,
}: {
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--ca-border-strong)] bg-[var(--ca-surface-2)]/50 p-8 text-center",
        className
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--ca-surface-3)] text-[var(--ca-text-muted)] mb-4">
        <FolderOpen className="h-6 w-6" />
      </div>
      <h4 className="text-base font-semibold text-[var(--ca-text-primary)] mb-1">
        {title}
      </h4>
      <p className="text-xs text-[var(--ca-text-muted)] max-w-sm mb-4">
        {description}
      </p>
      {actionLabel && onAction && (
        <Button size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

export function LoadingState({
  label = "Loading BlackArrow environment...",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center p-8 text-center space-y-3",
        className
      )}
    >
      <Loader2 className="h-8 w-8 animate-spin text-[var(--ca-brand)]" />
      <p className="text-xs font-medium text-[var(--ca-text-muted)]">{label}</p>
    </div>
  );
}

export function ErrorState({
  title = "Connection Error",
  description = "Unable to fetch operational records. Please retry.",
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-[var(--ca-rose)]/30 bg-[var(--ca-rose)]/10 p-6 text-center",
        className
      )}
    >
      <AlertCircle className="h-8 w-8 text-[var(--ca-rose)] mb-2" />
      <h4 className="text-sm font-semibold text-[var(--ca-text-primary)] mb-1">
        {title}
      </h4>
      <p className="text-xs text-[var(--ca-text-muted)] max-w-xs mb-4">
        {description}
      </p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try Again
        </Button>
      )}
    </div>
  );
}

export function SuccessState({
  title = "Configuration Saved",
  description = "Your BlackArrow instance settings have been synchronized.",
  className,
}: {
  title?: string;
  description?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-[var(--ca-teal)]/30 bg-[var(--ca-teal)]/10 p-6 text-center",
        className
      )}
    >
      <CheckCircle className="h-8 w-8 text-[var(--ca-teal)] mb-2" />
      <h4 className="text-sm font-semibold text-[var(--ca-text-primary)] mb-1">
        {title}
      </h4>
      <p className="text-xs text-[var(--ca-text-muted)] max-w-xs">
        {description}
      </p>
    </div>
  );
}
