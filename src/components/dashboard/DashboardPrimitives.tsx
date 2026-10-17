import React from "react";
import { dashboardToneClass, type DashboardTone } from "./dashboard-tone";

type IconComponent = React.ComponentType<{ className?: string }>;

export function DashboardSurface({ children, className = "", level = 1 }: { children: React.ReactNode; className?: string; level?: 1 | 2 | 3 }) {
  return <div className={`ca-surface ${className}`} data-level={level}>{children}</div>;
}

export function DashboardSection({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`ca-section ${className}`}>{children}</section>;
}

export function IconWell({ icon: Icon, tone = "brand", className = "" }: { icon: IconComponent; tone?: DashboardTone; className?: string }) {
  return <span className={`ca-icon-well ${dashboardToneClass(tone)} h-10 w-10 rounded-xl ${className}`}><Icon className="h-5 w-5" /></span>;
}

export function ToneBadge({ children, tone = "neutral", className = "" }: { children: React.ReactNode; tone?: DashboardTone; className?: string }) {
  return <span className={`ca-tone-badge ${dashboardToneClass(tone)} rounded-full px-2.5 py-1.5 ${className}`}>{children}</span>;
}

export function StatusBadge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: DashboardTone }) {
  return <ToneBadge tone={tone}>{children}</ToneBadge>;
}

export function ProgressTrack({ value, label }: { value: number; label?: string }) {
  const boundedValue = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className="ca-progress-track h-2.5" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={boundedValue}>
      <div className="ca-progress-value" style={{ width: `${boundedValue}%` }} />
    </div>
  );
}

export function ActionPanel({ children, tone = "brand", className = "" }: { children: React.ReactNode; tone?: DashboardTone; className?: string }) {
  return <aside className={`ca-action-panel ${dashboardToneClass(tone)} ${className}`}>{children}</aside>;
}

export function WorkspaceHero({ eyebrow, title, description, icon: Icon, actions, status }: { eyebrow?: string; title: string; description?: string; icon?: IconComponent; actions?: React.ReactNode; status?: React.ReactNode }) {
  return (
    <section className="ca-workspace-hero p-5 sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 max-w-3xl">
          <div className="flex items-start gap-3">
            {Icon ? <IconWell icon={Icon} tone="brand" className="mt-0.5" /> : null}
            <div className="min-w-0">
              {eyebrow ? <p className="ca-eyebrow">{eyebrow}</p> : null}
              <h1 className="ca-page-title mt-1">{title}</h1>
            </div>
          </div>
          {description ? <p className="ca-supporting-text mt-3">{description}</p> : null}
          {status ? <div className="mt-4 flex flex-wrap gap-2">{status}</div> : null}
        </div>
        {actions ? <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">{actions}</div> : null}
      </div>
    </section>
  );
}

export function DashboardPageHeader({ eyebrow, title, description, icon: Icon, actions, guide }: { eyebrow?: string; title: string; description?: string; icon?: IconComponent; actions?: React.ReactNode; guide?: React.ReactNode }) {
  return (
    <DashboardSurface className="p-4 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            {Icon ? <IconWell icon={Icon} tone="brand" /> : null}
            <div className="min-w-0">
              {eyebrow ? <p className="ca-eyebrow">{eyebrow}</p> : null}
              <h2 className="mt-1 text-2xl font-bold tracking-tight">{title}</h2>
            </div>
          </div>
          {description ? <p className="ca-supporting-text mt-3 max-w-3xl">{description}</p> : null}
          {guide ? <div className="mt-4">{guide}</div> : null}
        </div>
        {actions ? <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">{actions}</div> : null}
      </div>
    </DashboardSurface>
  );
}

export function CompactGuide({ icon: Icon, title, children, tone = "brand" }: { icon?: IconComponent; title: string; children: React.ReactNode; tone?: DashboardTone }) {
  return (
    <ActionPanel tone={tone} className="px-3 py-3">
      <div className="flex items-start gap-2.5">
        {Icon ? <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ca-tone)]" /> : null}
        <div className="min-w-0 text-sm leading-relaxed text-[var(--ca-text-secondary)]">
          <strong className="mb-0.5 block text-sm font-bold text-[var(--ca-text-primary)]">{title}</strong>
          {children}
        </div>
      </div>
    </ActionPanel>
  );
}

export function MetricTile({ label, value, icon: Icon, helper, tone = "brand", className = "" }: { label: string; value: React.ReactNode; icon?: IconComponent; helper?: React.ReactNode; tone?: DashboardTone; className?: string }) {
  return (
    <article className={`ca-metric-tile ${dashboardToneClass(tone)} p-4 sm:p-5 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="ca-metric-label">{label}</p>
          <div className="ca-metric-value mt-2 text-2xl font-bold leading-tight">{value}</div>
        </div>
        {Icon ? <IconWell icon={Icon} tone={tone} className="h-10 w-10" /> : null}
      </div>
      {helper ? <div className="mt-3 text-sm leading-relaxed text-[var(--ca-text-secondary)]">{helper}</div> : null}
    </article>
  );
}

export function DashboardToolbar({ children }: { children: React.ReactNode }) {
  return <div className="ca-toolbar flex flex-col gap-3 p-3 sm:p-4 md:flex-row md:items-center md:justify-between">{children}</div>;
}

export function DashboardEmptyState({ icon: Icon, title, body, action, tone = "neutral" }: { icon?: IconComponent; title: string; body: string; action?: React.ReactNode; tone?: DashboardTone }) {
  return (
    <div className="ca-empty-state flex min-h-72 flex-col items-center justify-center rounded-[var(--ca-radius-card)] p-6 text-center sm:p-10">
      {Icon ? <IconWell icon={Icon} tone={tone} className="mb-5 h-14 w-14 rounded-2xl" /> : null}
      <h3 className="text-lg font-bold">{title}</h3>
      <p className="ca-supporting-text mt-2 max-w-md">{body}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function PageShell({ children, maxWidth = "max-w-6xl" }: { children: React.ReactNode; maxWidth?: string }) {
  return <div className={`mx-auto flex w-full ${maxWidth} min-w-0 flex-col gap-5`}>{children}</div>;
}

export function SectionHeader({ title, description, icon: Icon, actions, tone = "brand" }: { title: string; description?: string; icon?: IconComponent; actions?: React.ReactNode; tone?: DashboardTone }) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          {Icon ? <Icon className={`${dashboardToneClass(tone)} h-4 w-4 shrink-0 text-[var(--ca-tone)]`} /> : null}
          <h3 className="text-base font-bold">{title}</h3>
        </div>
        {description ? <p className="mt-1 text-sm leading-relaxed text-[var(--ca-text-secondary)]">{description}</p> : null}
      </div>
      {actions ? <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">{actions}</div> : null}
    </div>
  );
}

export function SettingsCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <DashboardSection className={`p-4 sm:p-5 ${className}`}>{children}</DashboardSection>;
}

export function FormSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return <DashboardSurface level={2} className="p-4"><SectionHeader title={title} description={description} />{children}</DashboardSurface>;
}

export function ToggleRow({ title, description, checked, onClick, disabled = false }: { title: string; description?: string; checked: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <DashboardSurface className="flex items-start justify-between gap-4 p-3">
      <div className="min-w-0"><p className="text-sm font-bold">{title}</p>{description ? <p className="mt-1 text-sm leading-relaxed text-[var(--ca-text-secondary)]">{description}</p> : null}</div>
      <button type="button" onClick={onClick} disabled={disabled} className={`relative h-7 w-12 shrink-0 rounded-full ${checked ? "bg-[var(--ca-brand)]" : "bg-[var(--ca-surface-4)]"}`} aria-pressed={checked}>
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-all ${checked ? "left-6" : "left-1"}`} />
      </button>
    </DashboardSurface>
  );
}

export function IntegrationCard({ title, description, icon: Icon, status, children, actions }: { title: string; description?: string; icon?: IconComponent; status?: React.ReactNode; children: React.ReactNode; actions?: React.ReactNode }) {
  return <SettingsCard><SectionHeader title={title} description={description} icon={Icon} actions={status} tone="blue" /><div className="space-y-4">{children}</div>{actions ? <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--ca-border-subtle)] pt-4">{actions}</div> : null}</SettingsCard>;
}

export function DataTableShell({ children }: { children: React.ReactNode }) {
  return <div className="ca-data-table custom-scrollbar overflow-x-auto">{children}</div>;
}

export function MetricGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{children}</div>;
}
