import React from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import type { ClientOnboardingChecklistItem } from "../../services/client-onboarding-checklist-service";

export interface OnboardingNextActionProps {
  recommendedItem: ClientOnboardingChecklistItem | null;
  onOpenItem: (item: ClientOnboardingChecklistItem) => void;
}

export const OnboardingNextAction: React.FC<OnboardingNextActionProps> = ({
  recommendedItem,
  onOpenItem,
}) => {
  if (!recommendedItem) return null;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[var(--ca-brand)] bg-[var(--ca-surface-2)] p-4 sm:flex-row sm:items-center sm:justify-between shadow-sm">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-lg bg-[var(--ca-brand-soft)] p-2 text-[var(--ca-brand)]">
          <Sparkles className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <span className="text-[11px] font-black uppercase tracking-wider text-[var(--ca-brand)]">
            Recommended Action
          </span>
          <h4 className="text-sm font-bold text-[var(--ca-text-primary)]">{recommendedItem.title}</h4>
          <p className="text-xs text-[var(--ca-text-secondary)]">{recommendedItem.description}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => onOpenItem(recommendedItem)}
        className="shrink-0 inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--ca-brand)] px-4 py-2 text-xs font-bold text-[var(--ca-brand-fg)] shadow-sm hover:opacity-90 transition-opacity"
      >
        <span>{recommendedItem.ctaLabel}</span>
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
};
