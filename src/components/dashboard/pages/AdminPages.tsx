import React from "react";
import {
  Banknote,
  Database,
  FileText,
  Shield,
  Sparkles,
  Users,
  Wifi,
} from "lucide-react";
import { SectionHeader, SettingsCard } from "../DashboardPrimitives";

type AdminPageProps = {
  children: React.ReactNode;
};

function AdminFocusedPage({
  title,
  description,
  icon,
  children,
}: AdminPageProps & {
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

export function AdminDashboardPage({ children }: AdminPageProps) {
  return (
    <AdminFocusedPage title="Admin Overview" description="High-level operational status and platform KPIs." icon={Shield}>
      {children}
    </AdminFocusedPage>
  );
}

export function AdminUsersPage({ children }: AdminPageProps) {
  return (
    <AdminFocusedPage title="Accounts & Users" description="Client accounts, roles, plans, wallet status, and instance ownership." icon={Users}>
      {children}
    </AdminFocusedPage>
  );
}

export function PlatformAccountingPage({ children }: AdminPageProps) {
  return (
    <AdminFocusedPage title="Platform Accounting" description="Revenue, cost, usage, provider spend, and reconciliation reporting." icon={Banknote}>
      {children}
    </AdminFocusedPage>
  );
}

export function AdminSmartSalesPage({ children }: AdminPageProps) {
  return (
    <AdminFocusedPage title="Smart Sales Global Control" description="Global Smart Sales prompt and tuning controls for enabled accounts." icon={Sparkles}>
      {children}
    </AdminFocusedPage>
  );
}

export function AdminLogsPage({ children }: AdminPageProps) {
  return (
    <AdminFocusedPage title="Admin Logs" description="Download and inspect administrative action logs." icon={FileText}>
      {children}
    </AdminFocusedPage>
  );
}

export function SystemProxiesPage({ children }: AdminPageProps) {
  return (
    <AdminFocusedPage title="System Proxies" description="Manage the proxy pool used for instance assignment and health checks." icon={Wifi}>
      {children}
    </AdminFocusedPage>
  );
}

export function SharedDirectoryPage({ children }: AdminPageProps) {
  return (
    <AdminFocusedPage title="Shared Directory" description="Phone identity and customer directory data shared across admin tooling." icon={Database}>
      {children}
    </AdminFocusedPage>
  );
}
