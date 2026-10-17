import React, { useState } from "react";
import { ArrowRight, Check, CheckCircle2, ChevronDown, ChevronUp, Circle, ClipboardCheck, MessageSquare } from "lucide-react";
import type { ClientOnboardingChecklist as ChecklistModel, ClientOnboardingChecklistItem } from "../../services/client-onboarding-checklist-service";
import { ActionPanel, IconWell, ProgressTrack, ToneBadge } from "./DashboardPrimitives";

type Props = {
  checklist: ChecklistModel;
  onOpenItem: (item: ClientOnboardingChecklistItem) => void;
  title?: string;
  subtitle?: string;
};

const STORAGE_KEY = "blackarrow_setup_checklist_collapsed";

function getInitialCollapsed(launchReady: boolean) {
  if (typeof window === "undefined") return launchReady;
  const saved = window.localStorage.getItem(STORAGE_KEY);
  return saved === null ? launchReady : saved === "1";
}

export function ClientOnboardingChecklist({
  checklist,
  onOpenItem,
  title = "Launch your WhatsApp assistant",
  subtitle = "Complete these six steps to start handling real customer conversations.",
}: Props) {
  const [collapsed, setCollapsed] = useState(() => getInitialCollapsed(checklist.launchReady));
  const recommended = checklist.recommendedCoreItem;

  const setStoredCollapsed = (value: boolean) => {
    setCollapsed(value);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  };

  if (checklist.launchReady && collapsed) {
    const chatsItem: ClientOnboardingChecklistItem = {
      ...checklist.coreItems[5],
      cta: "open_dashboard",
      ctaLabel: "Open customer chats",
    };
    return (
      <section className="ca-onboarding border-l-[3px] border-l-[var(--ca-brand)] p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <IconWell icon={CheckCircle2} tone="brand" className="mt-0.5" />
            <div>
              <h2 className="text-lg font-bold">Your WhatsApp assistant is set up</h2>
              <p className="mt-1 text-sm leading-relaxed text-[var(--ca-text-secondary)]">Review your setup anytime or continue managing customer conversations.</p>
              <p className="mt-2 text-sm font-semibold text-[var(--ca-brand)]">Setting up: {checklist.selectedInstanceLabel}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {!checklist.aiRepliesEnabled ? (
              <button type="button" onClick={() => onOpenItem(checklist.coreItems[5])} className="ca-button-primary px-4">Turn on AI replies</button>
            ) : null}
            <button type="button" onClick={() => onOpenItem(chatsItem)} className={`${checklist.aiRepliesEnabled ? "ca-button-primary" : "ca-button-secondary"} px-4`}>Open customer chats</button>
            <button type="button" onClick={() => setStoredCollapsed(false)} className="ca-button-secondary px-4">Review setup</button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="ca-onboarding p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <IconWell icon={ClipboardCheck} tone="brand" />
          <div>
            <h2 className="text-xl font-bold">{title}</h2>
            <p className="mt-1 text-sm leading-relaxed text-[var(--ca-text-secondary)]">{subtitle}</p>
            <div className="mt-3"><ToneBadge tone="blue">Setting up: {checklist.selectedInstanceLabel}</ToneBadge></div>
          </div>
        </div>
        {checklist.launchReady ? (
          <button type="button" onClick={() => setStoredCollapsed(true)} className="ca-button-quiet gap-2 self-start px-3">Collapse <ChevronUp className="h-4 w-4" /></button>
        ) : null}
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 text-sm font-semibold text-[var(--ca-text-secondary)]">
        <span>{checklist.completedCoreCount} of {checklist.totalCoreCount} complete</span>
        <span>{checklist.progressPercent}%</span>
      </div>
      <div className="mt-2"><ProgressTrack value={checklist.progressPercent} label="WhatsApp assistant launch progress" /></div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <ol className="space-y-1">
          {checklist.coreItems.map((item, index) => {
            const current = recommended?.id === item.id;
            return (
              <li key={item.id} className="ca-onboarding-step flex gap-3 rounded-xl p-3" data-state={item.completed ? "complete" : current ? "current" : "upcoming"}>
                <span className="ca-onboarding-marker flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold">
                  {item.completed ? <Check className="h-4 w-4" /> : index + 1}
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold">{item.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--ca-text-secondary)]">{item.description}</p>
                </div>
              </li>
            );
          })}
        </ol>

        <ActionPanel tone={recommended ? "amber" : "brand"} className="h-fit p-4 sm:p-5">
          {recommended ? (
            <>
              <ToneBadge tone="amber">Recommended next step</ToneBadge>
              <h3 className="mt-3 text-lg font-bold">{recommended.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--ca-text-secondary)]">{recommended.description}</p>
              {recommended.id === "test-bot" ? <p className="mt-2 text-sm leading-relaxed text-[var(--ca-text-secondary)]">Message the connected business number from another WhatsApp account, then open Customer Chats to check the reply.</p> : null}
              <button type="button" onClick={() => onOpenItem(recommended)} className="ca-button-primary mt-4 w-full gap-2 px-4">
                {recommended.ctaLabel}<ArrowRight className="h-4 w-4" />
              </button>
            </>
          ) : (
            <div className="text-center">
              <MessageSquare className="mx-auto h-7 w-7 text-[var(--ca-brand)]" />
              <p className="mt-2 font-bold">Core launch setup is complete</p>
            </div>
          )}
          <div className="mt-4 border-t border-[var(--ca-border-subtle)] pt-4 text-sm">
            <p className="font-semibold">AI Chat Replies: <span className={checklist.aiRepliesEnabled ? "text-[var(--ca-brand)]" : "text-[var(--ca-text-muted)]"}>{checklist.aiRepliesEnabled ? "On" : "Off"}</span></p>
            {!checklist.aiRepliesEnabled ? <p className="mt-1 leading-relaxed text-[var(--ca-text-secondary)]">Normal incoming messages remain visible. Saved flows, shortcuts and scheduled follow-ups can continue.</p> : null}
          </div>
        </ActionPanel>
      </div>

      {checklist.optionalItems.length ? (
        <details className="mt-5 border-t border-[var(--ca-border-subtle)] pt-4">
          <summary className="ca-focusable flex min-h-11 cursor-pointer list-none items-center justify-between rounded-lg text-sm font-bold text-[var(--ca-text-secondary)]">Improve your setup later <ChevronDown className="h-4 w-4" /></summary>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {checklist.optionalItems.slice(0, 4).map((item) => (
              <div key={item.id} className="flex items-start gap-2 rounded-xl bg-[var(--ca-surface-2)] p-3">
                {item.completed ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ca-brand)]" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ca-text-muted)]" />}
                <div><p className="text-sm font-semibold">{item.title}</p><p className="mt-1 text-sm leading-relaxed text-[var(--ca-text-secondary)]">{item.description}</p></div>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}
