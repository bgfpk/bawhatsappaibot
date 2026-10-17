import React from "react";
import { CheckCircle2, ChevronRight, Circle } from "lucide-react";
import type { ClientOnboardingChecklistItem } from "../../services/client-onboarding-checklist-service";
import { cn } from "../../design-system/utils";

export interface OnboardingStepProps {
  step: ClientOnboardingChecklistItem;
  isCurrent?: boolean;
  isOptional?: boolean;
  onOpenStep: (step: ClientOnboardingChecklistItem) => void;
}

export const OnboardingStep: React.FC<OnboardingStepProps> = ({
  step,
  isCurrent = false,
  isOptional = false,
  onOpenStep,
}) => {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 rounded-xl border p-3.5 transition-colors",
        step.completed
          ? "border-[var(--ca-border-subtle)] bg-[var(--ca-surface-1)] opacity-80"
          : isCurrent
            ? "border-[var(--ca-brand)] bg-[var(--ca-surface-2)] shadow-sm"
            : "border-[var(--ca-border-subtle)] bg-[var(--ca-surface-1)] hover:bg-[var(--ca-surface-2)]"
      )}
    >
      <div className="flex items-start gap-3 min-w-0">
        <div className="mt-0.5 shrink-0">
          {step.completed ? (
            <CheckCircle2 className="h-5 w-5 text-[var(--ca-success)]" aria-hidden="true" />
          ) : (
            <Circle
              className={cn("h-5 w-5", isCurrent ? "text-[var(--ca-brand)]" : "text-[var(--ca-text-muted)]")}
              aria-hidden="true"
            />
          )}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h4
              className={cn(
                "text-sm font-bold truncate",
                step.completed ? "line-through text-[var(--ca-text-muted)]" : "text-[var(--ca-text-primary)]"
              )}
            >
              {step.title}
            </h4>
            {isOptional && (
              <span className="rounded-full bg-[var(--ca-surface-3)] px-2 py-0.5 text-[10px] font-semibold text-[var(--ca-text-muted)]">
                Optional
              </span>
            )}
            {isCurrent && !step.completed && (
              <span className="rounded-full bg-[var(--ca-brand-soft)] px-2 py-0.5 text-[10px] font-bold text-[var(--ca-brand)]">
                Next Step
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-[var(--ca-text-secondary)] line-clamp-2">{step.description}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => onOpenStep(step)}
        className={cn(
          "shrink-0 inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors",
          step.completed
            ? "border-[var(--ca-border-subtle)] bg-[var(--ca-surface-2)] text-[var(--ca-text-secondary)] hover:bg-[var(--ca-surface-3)]"
            : "border-[var(--ca-brand)] bg-[var(--ca-brand)] text-[var(--ca-brand-fg)] hover:opacity-90"
        )}
      >
        <span>{step.completed ? "Review" : step.ctaLabel}</span>
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
};
