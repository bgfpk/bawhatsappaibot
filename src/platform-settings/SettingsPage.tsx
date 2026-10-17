import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Settings, Users, Bell, Shield, Laptop, Server, Building, Route } from "lucide-react";
import { DashboardPageHeader } from "../components/dashboard/DashboardPrimitives";
import { resolvePathByViewAndTab } from "../app/dashboard-route-registry";
import { TeamAccessPage } from "./TeamAccessPage";
import { AdminAlertsSettings } from "./AdminAlertsSettings";
import { SecuritySettings } from "./SecuritySettings";
import { SessionPanel } from "./SessionPanel";
import { ProxySettings } from "./ProxySettings";
import { AccountBillingSettings } from "../billing/AccountBillingSettings";
import { LeadRoutingSettingsSection } from "../components/dashboard/settings/LeadRoutingSettingsSection";
import type { AccountSettingsData } from "../billing/billing-model";
import type {
  SettingsTabId,
  TeamMemberRecord,
  AdminAlertConfig,
  SecurityConfig,
  SessionRecord,
  ProxyConfig,
} from "./platform-model";

interface Props {
  initialTab?: SettingsTabId;
  activeTab?: SettingsTabId;
  onTabChange?: (tab: SettingsTabId) => void;
  members?: TeamMemberRecord[];
  showGetStarted?: boolean;
  onToggleShowGetStarted?: (val: boolean) => void;
  alertConfig?: AdminAlertConfig;
  securityConfig?: SecurityConfig;
  sessions?: SessionRecord[];
  proxyConfig?: ProxyConfig;
  accountSettings?: AccountSettingsData;
  onInviteMember?: (name: string, email: string, role: string) => Promise<void>;
  onChangeRole?: (memberId: string, newRole: string) => Promise<void>;
  onRemoveMember?: (memberId: string) => Promise<void>;
  onSaveAlertConfig?: (config: AdminAlertConfig) => Promise<void>;
  onTestAlert?: (phone: string) => Promise<{ success: boolean; message?: string }>;
  onToggle2FA?: (enable: boolean) => Promise<{ success: boolean; secret?: string; qrCodeUrl?: string }>;
  onVerify2FA?: (otp: string, enable: boolean) => Promise<{ success: boolean; message?: string }>;
  onChangePassword?: (oldPass: string, newPass: string) => Promise<{ success: boolean; message?: string }>;
  onRevokeSession?: (sessionId: string) => Promise<void>;
  onSaveProxy?: (host: string, port: number, user: string, pass: string) => Promise<void>;
  onTestProxy?: () => Promise<{ success: boolean; message?: string }>;
  onSaveAccountSettings?: (settings: AccountSettingsData) => Promise<void>;
  formatDate?: (ts: any) => string;
}

export const SettingsPage: React.FC<Props> = ({
  initialTab = "team",
  activeTab: controlledActiveTab,
  onTabChange,
  members = [],
  showGetStarted = true,
  onToggleShowGetStarted,
  alertConfig,
  securityConfig,
  sessions = [],
  proxyConfig,
  accountSettings,
  onInviteMember,
  onChangeRole,
  onRemoveMember,
  onSaveAlertConfig,
  onTestAlert,
  onToggle2FA,
  onVerify2FA,
  onChangePassword,
  onRevokeSession,
  onSaveProxy,
  onTestProxy,
  onSaveAccountSettings,
  formatDate = (ts) => (ts ? String(ts) : ""),
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTabId>(controlledActiveTab || initialTab);

  React.useEffect(() => {
    if (controlledActiveTab) {
      setActiveTab(controlledActiveTab);
    }
  }, [controlledActiveTab]);

  const handleSelectTab = (tab: SettingsTabId) => {
    setActiveTab(tab);
    if (onTabChange) onTabChange(tab);
  };

  const tabs = [
    { id: "team" as const, label: "Account Access", icon: Users },
    { id: "billing" as const, label: "Billing Preferences", icon: Building },
    { id: "alerts" as const, label: "Admin Alerts", icon: Bell },
    { id: "security" as const, label: "Security & 2FA", icon: Shield },
    { id: "sessions" as const, label: "Active Sessions", icon: Laptop },
    { id: "proxy" as const, label: "WhatsApp Proxy", icon: Server },
  ];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      {/* Page Header */}
      <DashboardPageHeader
        eyebrow="Platform Settings"
        title="Settings & Workspace Control"
        description="Manage account access, billing preferences, WhatsApp admin alert notifications, 2FA security preferences, and session controls."
        icon={Settings}
      />

      {/* Sub-Navigation Tabs */}
      <div className="flex border-b border-[var(--ca-border-subtle)] overflow-x-auto gap-2">
        {tabs.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id;
          const targetPath = resolvePathByViewAndTab(id === "team" ? "team" : id === "security" ? "security" : "settings", id);
          return (
            <Link
              key={id}
              to={targetPath}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 transition-all ${
                isActive
                  ? "border-[var(--ca-brand)] text-[var(--ca-brand)]"
                  : "border-transparent text-[var(--ca-text-secondary)] hover:text-[var(--ca-text-primary)]"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === "team" && (
        <TeamAccessPage
          members={members}
          showGetStarted={showGetStarted}
          onToggleShowGetStarted={onToggleShowGetStarted}
          onInviteMember={onInviteMember}
          onChangeRole={onChangeRole}
          onRemoveMember={onRemoveMember}
          formatDate={formatDate}
        />
      )}

      {activeTab === "billing" && (
        <AccountBillingSettings
          settings={accountSettings}
          onSaveSettings={onSaveAccountSettings}
        />
      )}

      {activeTab === "alerts" && (
        <AdminAlertsSettings
          config={alertConfig}
          onSaveConfig={onSaveAlertConfig}
          onTestAlert={onTestAlert}
        />
      )}

      {activeTab === "security" && (
        <SecuritySettings
          security={securityConfig}
          onToggle2FA={onToggle2FA}
          onVerify2FA={onVerify2FA}
          onChangePassword={onChangePassword}
          formatDate={formatDate}
        />
      )}

      {activeTab === "sessions" && (
        <SessionPanel
          sessions={sessions}
          onRevokeSession={onRevokeSession}
          formatDate={formatDate}
        />
      )}

      {activeTab === "proxy" && (
        <ProxySettings
          proxy={proxyConfig}
          onSaveProxy={onSaveProxy}
          onTestProxy={onTestProxy}
        />
      )}

      {activeTab === "lead_routing" && (
        <LeadRoutingSettingsSection />
      )}
    </div>
  );
};
