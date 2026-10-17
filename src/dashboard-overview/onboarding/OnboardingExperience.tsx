import React, { useState } from "react";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import type { ClientOnboardingChecklist, ClientOnboardingChecklistItem } from "../../services/client-onboarding-checklist-service";
import { OnboardingProgress } from "./OnboardingProgress";
import { OnboardingNextAction } from "./OnboardingNextAction";
import { OnboardingStep } from "./OnboardingStep";
import { OnboardingCompletedState } from "./OnboardingCompletedState";

export interface OnboardingExperienceProps {
  checklist: ClientOnboardingChecklist;
  onOpenStep: (step: ClientOnboardingChecklistItem) => void;
  onOpenInbox: () => void;
}

export const OnboardingExperience: React.FC<OnboardingExperienceProps> = ({
  checklist,
  onOpenStep,
  onOpenInbox,
}) => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("blackarrow_onboarding_collapsed") === "true";
    } catch {
      return false;
    }
  });

  const toggleCollapse = () => {
    const next = !isCollapsed;
    setIsCollapsed(next);
    try {
      localStorage.setItem("blackarrow_onboarding_collapsed", String(next));
    } catch {}
  };

  if (checklist.launchReady) {
    if (isCollapsed) {
      return (
        <div className="rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-1)] p-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-[var(--ca-brand)]" aria-hidden="true" />
            <span className="text-sm font-bold text-[var(--ca-text-primary)]">Launch Setup Complete</span>
          </div>
          <button
            type="button"
            onClick={toggleCollapse}
            className="ca-button-quiet gap-1 text-xs px-2.5 py-1"
          >
            <span>Show Details</span>
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      );
    }
    return (
      <OnboardingCompletedState
        onOpenInbox={onOpenInbox}
        onReviewSetup={toggleCollapse}
      />
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-1)] p-5 space-y-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-[var(--ca-text-primary)]">Guided Launch Setup</h3>
          <p className="text-xs text-[var(--ca-text-secondary)]">
            Complete core milestones to launch your WhatsApp automated assistant.
          </p>
        </div>
        <button
          type="button"
          onClick={toggleCollapse}
          className="ca-button-quiet gap-1 text-xs px-2.5 py-1"
          aria-expanded={!isCollapsed}
        >
          <span>{isCollapsed ? "Expand" : "Collapse"}</span>
          {isCollapsed ? (
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronUp className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>

      <OnboardingProgress
        completedCount={checklist.completedCoreCount}
        totalCount={checklist.totalCoreCount}
        progressPercent={checklist.progressPercent}
      />

      {!isCollapsed && (
        <>
          {checklist.recommendedCoreItem && (
            <OnboardingNextAction
              recommendedItem={checklist.recommendedCoreItem}
              onOpenItem={onOpenStep}
            />
          )}

          <div className="space-y-2.5 pt-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--ca-text-muted)]">
              Core Launch Milestones
            </h4>
            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
              {checklist.coreItems.map((step) => (
                <OnboardingStep
                  key={step.id}
                  step={step}
                  isCurrent={step.id === checklist.recommendedCoreItem?.id}
                  onOpenStep={onOpenStep}
                />
              ))}
            </div>
          </div>

          {checklist.optionalItems.length > 0 && (
            <div className="space-y-2.5 pt-2 border-t border-[var(--ca-border-subtle)]">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--ca-text-muted)]">
                Optional Automation Enhancements
              </h4>
              <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                {checklist.optionalItems.map((step) => (
                  <OnboardingStep
                    key={step.id}
                    step={step}
                    isOptional
                    onOpenStep={onOpenStep}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
