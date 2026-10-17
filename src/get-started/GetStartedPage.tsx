import React from "react";
import {
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  EyeOff,
  LayoutDashboard,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import type {
  ClientOnboardingChecklist,
  ClientOnboardingChecklistItem,
} from "../services/client-onboarding-checklist-service";
import {
  DashboardPageHeader,
  ProgressTrack,
  ToneBadge,
  DashboardSurface,
} from "../components/dashboard/DashboardPrimitives";

export interface GetStartedPageProps {
  checklist: ClientOnboardingChecklist;
  onOpenStep: (step: ClientOnboardingChecklistItem) => void;
  onHideGetStarted?: () => void;
  onGoToDashboard: () => void;
}

export const GetStartedPage: React.FC<GetStartedPageProps> = ({
  checklist,
  onOpenStep,
  onHideGetStarted,
  onGoToDashboard,
}) => {
  const isComplete = checklist.launchReady;
  const recommended = checklist.recommendedCoreItem;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      {/* Header */}
      <DashboardPageHeader
        eyebrow="Onboarding"
        title="Get Started"
        description="Complete these core setup steps to launch your WhatsApp automated assistant."
        icon={Sparkles}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {onHideGetStarted && (
              <button
                type="button"
                onClick={onHideGetStarted}
                className="ca-button-secondary text-xs"
                title="Hide Get Started from navigation"
              >
                <EyeOff className="w-3.5 h-3.5 mr-1.5" />
                Hide Get Started
              </button>
            )}
            <button
              type="button"
              onClick={onGoToDashboard}
              className="ca-button-primary text-xs"
            >
              <LayoutDashboard className="w-3.5 h-3.5 mr-1.5" />
              Go to Dashboard
            </button>
          </div>
        }
      />

      {/* Launch Ready Banner if completed */}
      {isComplete ? (
        <DashboardSurface className="p-6 border-l-4 border-l-[var(--ca-brand)] shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500 shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <ToneBadge tone="brand" className="mb-1 text-[10px] font-black uppercase">
                  Launch Ready
                </ToneBadge>
                <h3 className="text-base font-bold text-[var(--ca-text-primary)]">
                  You're ready to use BlackArrow.
                </h3>
                <p className="mt-1 text-xs text-[var(--ca-text-secondary)] leading-relaxed">
                  All core launch milestones are complete. You can manage live operations from the Dashboard or adjust your setup anytime.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onGoToDashboard}
              className="ca-button-primary text-xs shrink-0 self-start sm:self-auto"
            >
              Go to Dashboard
              <ArrowRight className="w-4 h-4 ml-1.5" />
            </button>
          </div>
        </DashboardSurface>
      ) : (
        /* Progress Overview */
        <DashboardSurface className="p-5 space-y-3">
          <div className="flex items-center justify-between text-xs font-bold">
            <span className="text-[var(--ca-text-primary)]">
              {checklist.completedCoreCount} of {checklist.totalCoreCount} milestones completed
            </span>
            <span className="text-[var(--ca-brand)]">{checklist.progressPercent}%</span>
          </div>
          <ProgressTrack
            value={checklist.progressPercent}
            label="Onboarding setup progress"
          />
        </DashboardSurface>
      )}

      {/* Core Milestones Checklist */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ca-text-muted)] px-1">
          Required Setup Steps
        </h3>

        <div className="space-y-2.5">
          {checklist.coreItems.map((step, index) => {
            const isCurrent = step.id === recommended?.id;
            return (
              <div
                key={step.id}
                className={`rounded-2xl border p-4 sm:p-5 transition-all flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 ${
                  step.completed
                    ? "bg-[var(--ca-surface-1)] border-[var(--ca-border-subtle)]"
                    : isCurrent
                    ? "bg-[var(--ca-surface-1)] border-[var(--ca-brand)] shadow-sm"
                    : "bg-[var(--ca-surface-1)] border-[var(--ca-border-subtle)] opacity-85"
                }`}
              >
                <div className="flex items-start gap-3.5 min-w-0">
                  <div
                    className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 text-xs font-black transition-colors ${
                      step.completed
                        ? "bg-emerald-500 text-white"
                        : isCurrent
                        ? "bg-[var(--ca-brand)] text-white"
                        : "bg-[var(--ca-surface-2)] text-[var(--ca-text-muted)] border border-[var(--ca-border-subtle)]"
                    }`}
                  >
                    {step.completed ? <Check className="w-3.5 h-3.5" /> : index + 1}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-bold text-[var(--ca-text-primary)]">
                        {step.title}
                      </h4>
                      {step.completed && (
                        <ToneBadge tone="brand" className="text-[10px] py-0.5 px-2 font-bold">
                          Completed
                        </ToneBadge>
                      )}
                      {isCurrent && !step.completed && (
                        <ToneBadge tone="amber" className="text-[10px] py-0.5 px-2 font-bold">
                          Next Step
                        </ToneBadge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-[var(--ca-text-secondary)] leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                </div>

                <div className="shrink-0 self-start sm:self-auto pl-10 sm:pl-0">
                  <button
                    type="button"
                    onClick={() => onOpenStep(step)}
                    className={
                      isCurrent && !step.completed
                        ? "ca-button-primary text-xs"
                        : step.completed
                        ? "ca-button-secondary text-xs"
                        : "ca-button-secondary text-xs"
                    }
                  >
                    <span>{step.ctaLabel}</span>
                    <ChevronRight className="w-3.5 h-3.5 ml-1" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Optional Enhancements */}
      {checklist.optionalItems.length > 0 && (
        <div className="space-y-3 pt-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ca-text-muted)] px-1">
            Optional Enhancements
          </h3>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {checklist.optionalItems.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-1)] p-4 flex flex-col justify-between gap-3"
              >
                <div className="flex items-start gap-2.5">
                  {item.completed ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                  ) : (
                    <Circle className="w-4 h-4 text-[var(--ca-text-muted)] mt-0.5 shrink-0" />
                  )}
                  <div>
                    <h5 className="text-xs font-bold text-[var(--ca-text-primary)]">
                      {item.title}
                    </h5>
                    <p className="mt-0.5 text-[11px] text-[var(--ca-text-secondary)] leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => onOpenStep(item)}
                    className="ca-button-quiet text-xs text-[var(--ca-brand)]"
                  >
                    <span>{item.ctaLabel}</span>
                    <ChevronRight className="w-3 h-3 ml-0.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
