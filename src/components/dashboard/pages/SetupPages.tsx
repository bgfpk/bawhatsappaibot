import React from "react";
import {
  CheckCircle2,
  Database,
  MessageSquare,
  Puzzle,
  Sparkles,
} from "lucide-react";
import { SectionHeader, SettingsCard } from "../DashboardPrimitives";
import { AiStudioV2Page } from "./AiStudioV2Page";
import { KnowledgeCenterV2Page } from "./KnowledgeCenterV2Page";
import type { KnowledgeCenterInput } from "../../../services/knowledge-center-service";

type FocusedSetupPageProps = {
  children: React.ReactNode;
};

type LearnedKnowledgePageProps = FocusedSetupPageProps & {
  statusInput?: KnowledgeCenterInput;
  onOpenAiStudio?: () => void;
};

function FocusedSetupPage({
  title,
  description,
  icon,
  children,
}: FocusedSetupPageProps & {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <SettingsCard>
      <SectionHeader title={title} description={description} icon={icon} />
      <div className="space-y-5">{children}</div>
    </SettingsCard>
  );
}

export function AIInstructionsPage({ children }: FocusedSetupPageProps) {
  return <AiStudioV2Page>{children}</AiStudioV2Page>;
}

export function LearnedKnowledgePage({ children, statusInput, onOpenAiStudio }: LearnedKnowledgePageProps) {
  return <KnowledgeCenterV2Page statusInput={statusInput} onOpenAiStudio={onOpenAiStudio}>{children}</KnowledgeCenterV2Page>;
}

export function ConfirmationFieldsPage({ children }: FocusedSetupPageProps) {
  return (
    <FocusedSetupPage
      title="Order Confirmation Fields"
      description="Choose the extra details AI must confirm before completing leads or orders."
      icon={Database}
    >
      {children}
    </FocusedSetupPage>
  );
}

export function ReplyCallRulesPage({ children }: FocusedSetupPageProps) {
  return (
    <FocusedSetupPage
      title="Reply & Call Rules"
      description="Control call handling, muted contacts, group replies, difficult customer behavior, and voice/text preferences."
      icon={MessageSquare}
    >
      {children}
    </FocusedSetupPage>
  );
}

export function IntegrationsPage({ children }: FocusedSetupPageProps) {
  return (
    <FocusedSetupPage
      title="AI Providers & Connected Services"
      description="Manage courier credentials, custom Gemini key, Cache Boost, website knowledge, DHL tracking, and operational alert routing."
      icon={Puzzle}
    >
      <div className="grid grid-cols-1 gap-5">{children}</div>
    </FocusedSetupPage>
  );
}

export function SmartSalesSettingsPage({ children }: FocusedSetupPageProps) {
  return (
    <FocusedSetupPage
      title="Actions & Smart Sales Controls"
      description="Enable or tune account-level Smart Sales behavior. This does not expand Agent Mode or add automatic actions."
      icon={Sparkles}
    >
      {children}
    </FocusedSetupPage>
  );
}

export function IntegrationSectionCard({
  title,
  description,
  status,
  children,
}: FocusedSetupPageProps & {
  title: string;
  description: string;
  status?: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
            <h4 className="text-sm font-black text-gray-950 dark:text-neutral-50">{title}</h4>
          </div>
          <p className="mt-1 text-xs font-medium leading-relaxed text-gray-500 dark:text-neutral-400">{description}</p>
        </div>
        {status ? <div className="shrink-0">{status}</div> : null}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
