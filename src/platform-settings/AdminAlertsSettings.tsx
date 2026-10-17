import React, { useState, useEffect } from "react";
import {
  Bell,
  Smartphone,
  Send,
  Save,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Bot,
  Sparkles,
  Clock,
  DollarSign,
  Flame,
} from "lucide-react";
import type { AdminAlertConfig } from "./platform-model";
import { getAdminAuthorizationStatusBadge } from "../services/admin-identity-service";

interface Props {
  config?: AdminAlertConfig;
  onSaveConfig?: (nextConfig: AdminAlertConfig) => Promise<void>;
  onTestAlert?: (phone: string) => Promise<{ success: boolean; message?: string }>;
}

export const AdminAlertsSettings: React.FC<Props> = ({
  config = {
    adminPhone: "",
    isAlertsEnabled: true,
    isBusinessAssistantEnabled: false,
    isVerified: false,
    alertTypes: {
      lowBalance: true,
      instanceDisconnected: true,
      humanEscalation: true,
      failedOrders: false,
    },
    proactiveAlerts: {
      isProactiveAlertsEnabled: false,
      categories: {
        operations: true,
        customers: true,
        orders: true,
        stock: true,
        campaigns: true,
        integrations: true,
        billing: true,
        security: true,
        dailyDigest: false,
        weeklyDigest: false,
      },
      schedules: {
        dailyDigestTime: "09:00",
        weeklyDigestDay: 1,
        timezone: "Asia/Karachi",
      },
      thresholds: {
        highValueOrderUsd: 100,
        lowWalletAlertFloorUsd: 0.50,
        lowStockThreshold: 5,
      },
      quietHours: {
        enabled: false,
        start: "23:00",
        end: "08:00",
        urgentBypass: true,
      },
    },
    proactiveLeadAlerts: {
      enabled: true,
      notifyQualifiedLeads: true,
      notifyContactCaptured: true,
      notifyLeadRouted: true,
      notifyRoutingFailed: true,
      notifyHumanRequested: true,
      notifyHighIntentLeads: true,
    },
  },
  onSaveConfig,
  onTestAlert,
}) => {
  const [adminPhone, setAdminPhone] = useState(config.adminPhone || "");
  const [isAlertsEnabled, setIsAlertsEnabled] = useState(config.isAlertsEnabled ?? true);
  const [isBusinessAssistantEnabled, setIsBusinessAssistantEnabled] = useState(
    config.isBusinessAssistantEnabled ?? false
  );
  const [alertTypes, setAlertTypes] = useState(
    config.alertTypes || {
      lowBalance: true,
      instanceDisconnected: true,
      humanEscalation: true,
      failedOrders: false,
    }
  );

  // Proactive Alerts & Digests
  const [isProactiveAlertsEnabled, setIsProactiveAlertsEnabled] = useState(
    config.proactiveAlerts?.isProactiveAlertsEnabled ?? false
  );
  const [proactiveCategories, setProactiveCategories] = useState(
    config.proactiveAlerts?.categories || {
      operations: true,
      customers: true,
      orders: true,
      stock: true,
      campaigns: true,
      integrations: true,
      billing: true,
      security: true,
      dailyDigest: false,
      weeklyDigest: false,
    }
  );
  const [dailyDigestTime, setDailyDigestTime] = useState(
    config.proactiveAlerts?.schedules?.dailyDigestTime || "09:00"
  );
  const [highValueOrderUsd, setHighValueOrderUsd] = useState(
    config.proactiveAlerts?.thresholds?.highValueOrderUsd ?? 100
  );
  const [lowWalletAlertFloorUsd, setLowWalletAlertFloorUsd] = useState(
    config.proactiveAlerts?.thresholds?.lowWalletAlertFloorUsd ?? 0.50
  );

  // Proactive Lead Intelligence Alerts
  const [isLeadAlertsEnabled, setIsLeadAlertsEnabled] = useState(
    config.proactiveLeadAlerts?.enabled ?? true
  );
  const [leadAlertCategories, setLeadAlertCategories] = useState(
    config.proactiveLeadAlerts || {
      enabled: true,
      notifyQualifiedLeads: true,
      notifyContactCaptured: true,
      notifyLeadRouted: true,
      notifyRoutingFailed: true,
      notifyHumanRequested: true,
      notifyHighIntentLeads: true,
    }
  );

  const handleToggleLeadAlertCategory = (key: keyof typeof leadAlertCategories) => {
    setLeadAlertCategories((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  useEffect(() => {
    if (config.adminPhone !== undefined) setAdminPhone(config.adminPhone || "");
    if (config.isAlertsEnabled !== undefined) setIsAlertsEnabled(config.isAlertsEnabled ?? true);
    if (config.isBusinessAssistantEnabled !== undefined) {
      setIsBusinessAssistantEnabled(config.isBusinessAssistantEnabled);
    }
    if (config.alertTypes) setAlertTypes(config.alertTypes);
    if (config.proactiveAlerts?.isProactiveAlertsEnabled !== undefined) {
      setIsProactiveAlertsEnabled(config.proactiveAlerts.isProactiveAlertsEnabled);
    }
    if (config.proactiveAlerts?.categories) {
      setProactiveCategories(config.proactiveAlerts.categories);
    }
    if (config.proactiveAlerts?.schedules?.dailyDigestTime) {
      setDailyDigestTime(config.proactiveAlerts.schedules.dailyDigestTime);
    }
    if (config.proactiveAlerts?.thresholds?.highValueOrderUsd !== undefined) {
      setHighValueOrderUsd(config.proactiveAlerts.thresholds.highValueOrderUsd);
    }
    if (config.proactiveAlerts?.thresholds?.lowWalletAlertFloorUsd !== undefined) {
      setLowWalletAlertFloorUsd(config.proactiveAlerts.thresholds.lowWalletAlertFloorUsd);
    }
    if (config.proactiveLeadAlerts) {
      setIsLeadAlertsEnabled(config.proactiveLeadAlerts.enabled ?? true);
      setLeadAlertCategories(config.proactiveLeadAlerts);
    }
  }, [config]);

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message?: string } | null>(null);

  const handleToggleType = (key: keyof typeof alertTypes) => {
    setAlertTypes((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleToggleProactiveCategory = (key: keyof typeof proactiveCategories) => {
    setProactiveCategories((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSaveConfig) return;
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      await onSaveConfig({
        adminPhone: adminPhone.trim(),
        isAlertsEnabled,
        isBusinessAssistantEnabled,
        alertTypes,
        proactiveAlerts: {
          isProactiveAlertsEnabled,
          categories: proactiveCategories,
          schedules: {
            dailyDigestTime,
            weeklyDigestDay: config.proactiveAlerts?.schedules?.weeklyDigestDay ?? 1,
            timezone: config.proactiveAlerts?.schedules?.timezone || "Asia/Karachi",
          },
          thresholds: {
            highValueOrderUsd: Number(highValueOrderUsd) || 100,
            lowWalletAlertFloorUsd: Number(lowWalletAlertFloorUsd) || 0.50,
            lowStockThreshold: config.proactiveAlerts?.thresholds?.lowStockThreshold ?? 5,
          },
          quietHours: config.proactiveAlerts?.quietHours || {
            enabled: false,
            start: "23:00",
            end: "08:00",
            urgentBypass: true,
          },
        },
        proactiveLeadAlerts: {
          ...leadAlertCategories,
          enabled: isLeadAlertsEnabled,
        },
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestPing = async () => {
    if (!adminPhone.trim() || !onTestAlert) return;
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await onTestAlert(adminPhone.trim());
      setTestResult(res);
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || "Test alert failed." });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-surface)] p-6 shadow-sm max-w-3xl">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-amber-500/10 text-amber-500">
              <Bell className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[var(--ca-text-primary)]">Admin WhatsApp Alerts</h2>
              <p className="text-xs text-[var(--ca-text-secondary)] mt-0.5">
                Receive instant notifications on your WhatsApp phone when urgent business events occur.
              </p>
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
            <input
              type="checkbox"
              checked={isAlertsEnabled}
              onChange={(e) => setIsAlertsEnabled(e.target.checked)}
              className="accent-[var(--ca-brand)] rounded"
            />
            <span className="text-[var(--ca-text-primary)]">Alerts Enabled</span>
          </label>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {!onSaveConfig && (
            <div className="p-3 rounded-xl bg-neutral-500/10 text-[var(--ca-text-secondary)] text-xs font-medium border border-[var(--ca-border-subtle)]">
              Admin alert configuration is read-only in this view.
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-[var(--ca-text-primary)] block mb-1">
              Admin WhatsApp Phone Number
            </label>
            <div className="relative">
              <Smartphone className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ca-text-muted)]" />
              <input
                type="text"
                required
                disabled={!onSaveConfig}
                placeholder="e.g. +923001234567"
                value={adminPhone}
                onChange={(e) => setAdminPhone(e.target.value)}
                className="w-full bg-[var(--ca-bg-hover)] border border-[var(--ca-border-subtle)] rounded-xl pl-9 pr-3 py-2 text-xs font-mono text-[var(--ca-text-primary)] outline-none focus:border-[var(--ca-brand)] disabled:opacity-75 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          {/* Existing Admin Alerts Categories */}
          <div>
            <label className="text-xs font-bold text-[var(--ca-text-primary)] block mb-2">
              Notification Event Categories
            </label>
            <div className="grid grid-cols-2 gap-2 p-3 rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-hover)]">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!onSaveConfig}
                  checked={alertTypes.lowBalance}
                  onChange={() => handleToggleType("lowBalance")}
                  className="accent-[var(--ca-brand)] rounded disabled:cursor-not-allowed"
                />
                <span className="text-[var(--ca-text-secondary)]">Low Wallet Balance</span>
              </label>

              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!onSaveConfig}
                  checked={alertTypes.instanceDisconnected}
                  onChange={() => handleToggleType("instanceDisconnected")}
                  className="accent-[var(--ca-brand)] rounded disabled:cursor-not-allowed"
                />
                <span className="text-[var(--ca-text-secondary)]">WhatsApp Number Disconnected</span>
              </label>

              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!onSaveConfig}
                  checked={alertTypes.humanEscalation}
                  onChange={() => handleToggleType("humanEscalation")}
                  className="accent-[var(--ca-brand)] rounded disabled:cursor-not-allowed"
                />
                <span className="text-[var(--ca-text-secondary)]">Human Agent Takeover Requested</span>
              </label>

              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!onSaveConfig}
                  checked={alertTypes.failedOrders}
                  onChange={() => handleToggleType("failedOrders")}
                  className="accent-[var(--ca-brand)] rounded disabled:cursor-not-allowed"
                />
                <span className="text-[var(--ca-text-secondary)]">Failed Order / Delivery Notification</span>
              </label>
            </div>
          </div>

          {/* Admin Business Assistant Access Section */}
          <div className="pt-4 border-t border-[var(--ca-border-subtle)] space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-[var(--ca-brand)]" />
                <div>
                  <h3 className="text-xs font-bold text-[var(--ca-text-primary)]">Admin Business Assistant Access</h3>
                  <p className="text-[11px] text-[var(--ca-text-secondary)]">
                    Allows authorized owners/admins messaging the bot from this phone to access private management mode instead of customer workflows.
                  </p>
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs font-bold cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  disabled={!onSaveConfig}
                  checked={isBusinessAssistantEnabled}
                  onChange={(e) => setIsBusinessAssistantEnabled(e.target.checked)}
                  className="accent-[var(--ca-brand)] rounded disabled:cursor-not-allowed"
                />
                <span className="text-[var(--ca-text-primary)]">Access Enabled</span>
              </label>
            </div>

            <div className="p-3 rounded-xl bg-[var(--ca-bg-hover)] border border-[var(--ca-border-subtle)] space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--ca-text-secondary)]">Authorized Identity Status:</span>
                {(() => {
                  const badge = getAdminAuthorizationStatusBadge({
                    adminPhone,
                    isBusinessAssistantEnabled,
                    isVerified: config.isVerified,
                  });
                  return (
                    <span className={`font-semibold inline-flex items-center gap-1 ${badge.badgeClass}`}>
                      <ShieldCheck className="w-3.5 h-3.5" />
                      {badge.label}
                    </span>
                  );
                })()}
              </div>
              <p className="text-[10px] text-[var(--ca-text-muted)] leading-normal">
                Security note: Privileged actions are restricted to authenticated tenant owners and admins. Sensitive mutations require explicit one-time confirmation. Critical secrets are never transmitted.
              </p>
            </div>
          </div>

          {/* Business Assistant Proactive Alerts & Digests Section */}
          <div className="pt-4 border-t border-[var(--ca-border-subtle)] space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <div>
                  <h3 className="text-xs font-bold text-[var(--ca-text-primary)]">
                    Business Assistant Proactive Alerts & Digests
                  </h3>
                  <p className="text-[11px] text-[var(--ca-text-secondary)]">
                    Intelligent business situation monitoring and daily/weekly executive performance digests sent directly to your Admin WhatsApp.
                  </p>
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs font-bold cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  disabled={!onSaveConfig || !isBusinessAssistantEnabled}
                  checked={isProactiveAlertsEnabled && isBusinessAssistantEnabled}
                  onChange={(e) => setIsProactiveAlertsEnabled(e.target.checked)}
                  className="accent-[var(--ca-brand)] rounded disabled:cursor-not-allowed"
                />
                <span className="text-[var(--ca-text-primary)]">Proactive Alerts</span>
              </label>
            </div>

            {/* Price Transparency Disclosure */}
            <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-amber-600 dark:text-amber-400">
                <DollarSign className="w-3.5 h-3.5" />
                <span>Message Pricing Disclosure</span>
              </div>
              <p className="text-[11px] text-[var(--ca-text-secondary)] leading-relaxed">
                Admin Business Assistant messages are billed at <strong>$0.003 per AI call / message</strong> (including proactive alerts and digests). Inbound admin messages and failed sends are always free.
              </p>
            </div>

            {/* Proactive Categories */}
            {isBusinessAssistantEnabled && (
              <div className="space-y-3">
                <label className="text-xs font-bold text-[var(--ca-text-primary)] block">
                  Active Situation Channels
                </label>
                <div className="grid grid-cols-2 gap-2 p-3 rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-hover)]">
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={!onSaveConfig || !isProactiveAlertsEnabled}
                      checked={proactiveCategories.operations}
                      onChange={() => handleToggleProactiveCategory("operations")}
                      className="accent-[var(--ca-brand)] rounded disabled:cursor-not-allowed"
                    />
                    <span className="text-[var(--ca-text-secondary)]">Bot & WhatsApp Health</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={!onSaveConfig || !isProactiveAlertsEnabled}
                      checked={proactiveCategories.customers}
                      onChange={() => handleToggleProactiveCategory("customers")}
                      className="accent-[var(--ca-brand)] rounded disabled:cursor-not-allowed"
                    />
                    <span className="text-[var(--ca-text-secondary)]">Customers & Leads (SLA)</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={!onSaveConfig || !isProactiveAlertsEnabled}
                      checked={proactiveCategories.orders}
                      onChange={() => handleToggleProactiveCategory("orders")}
                      className="accent-[var(--ca-brand)] rounded disabled:cursor-not-allowed"
                    />
                    <span className="text-[var(--ca-text-secondary)]">Orders & Courier</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={!onSaveConfig || !isProactiveAlertsEnabled}
                      checked={proactiveCategories.stock}
                      onChange={() => handleToggleProactiveCategory("stock")}
                      className="accent-[var(--ca-brand)] rounded disabled:cursor-not-allowed"
                    />
                    <span className="text-[var(--ca-text-secondary)]">Products & Low Stock</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={!onSaveConfig || !isProactiveAlertsEnabled}
                      checked={proactiveCategories.campaigns}
                      onChange={() => handleToggleProactiveCategory("campaigns")}
                      className="accent-[var(--ca-brand)] rounded disabled:cursor-not-allowed"
                    />
                    <span className="text-[var(--ca-text-secondary)]">Campaigns & Broadcasts</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={!onSaveConfig || !isProactiveAlertsEnabled}
                      checked={proactiveCategories.integrations}
                      onChange={() => handleToggleProactiveCategory("integrations")}
                      className="accent-[var(--ca-brand)] rounded disabled:cursor-not-allowed"
                    />
                    <span className="text-[var(--ca-text-secondary)]">Integrations & Sync</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={!onSaveConfig || !isProactiveAlertsEnabled}
                      checked={proactiveCategories.billing}
                      onChange={() => handleToggleProactiveCategory("billing")}
                      className="accent-[var(--ca-brand)] rounded disabled:cursor-not-allowed"
                    />
                    <span className="text-[var(--ca-text-secondary)]">Billing & Wallet Floor</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={!onSaveConfig || !isProactiveAlertsEnabled}
                      checked={proactiveCategories.security}
                      onChange={() => handleToggleProactiveCategory("security")}
                      className="accent-[var(--ca-brand)] rounded disabled:cursor-not-allowed"
                    />
                    <span className="text-[var(--ca-text-secondary)]">Security & Access Events</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={!onSaveConfig || !isProactiveAlertsEnabled}
                      checked={proactiveCategories.dailyDigest}
                      onChange={() => handleToggleProactiveCategory("dailyDigest")}
                      className="accent-[var(--ca-brand)] rounded disabled:cursor-not-allowed"
                    />
                    <span className="text-[var(--ca-text-secondary)]">Daily Business Digest</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={!onSaveConfig || !isProactiveAlertsEnabled}
                      checked={proactiveCategories.weeklyDigest}
                      onChange={() => handleToggleProactiveCategory("weeklyDigest")}
                      className="accent-[var(--ca-brand)] rounded disabled:cursor-not-allowed"
                    />
                    <span className="text-[var(--ca-text-secondary)]">Weekly Growth Digest</span>
                  </label>
                </div>

                {/* Schedules & Thresholds */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="text-[11px] font-bold text-[var(--ca-text-secondary)] block mb-1">
                      Daily Digest Time (24h)
                    </label>
                    <div className="relative">
                      <Clock className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ca-text-muted)]" />
                      <input
                        type="text"
                        disabled={!onSaveConfig || !isProactiveAlertsEnabled || !proactiveCategories.dailyDigest}
                        placeholder="09:00"
                        value={dailyDigestTime}
                        onChange={(e) => setDailyDigestTime(e.target.value)}
                        className="w-full bg-[var(--ca-bg-hover)] border border-[var(--ca-border-subtle)] rounded-xl pl-9 pr-3 py-1.5 text-xs font-mono text-[var(--ca-text-primary)] outline-none focus:border-[var(--ca-brand)] disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-[var(--ca-text-secondary)] block mb-1">
                      High-Value Order Alert ($)
                    </label>
                    <div className="relative">
                      <DollarSign className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ca-text-muted)]" />
                      <input
                        type="number"
                        min="1"
                        disabled={!onSaveConfig || !isProactiveAlertsEnabled || !proactiveCategories.orders}
                        placeholder="100"
                        value={highValueOrderUsd}
                        onChange={(e) => setHighValueOrderUsd(Number(e.target.value))}
                        className="w-full bg-[var(--ca-bg-hover)] border border-[var(--ca-border-subtle)] rounded-xl pl-9 pr-3 py-1.5 text-xs font-mono text-[var(--ca-text-primary)] outline-none focus:border-[var(--ca-brand)] disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Proactive Lead Intelligence Alerts Section */}
          <div className="pt-4 border-t border-[var(--ca-border-subtle)] space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-emerald-500" />
                <div>
                  <h3 className="text-xs font-bold text-[var(--ca-text-primary)]">
                    Proactive Lead Intelligence Alerts
                  </h3>
                  <p className="text-[11px] text-[var(--ca-text-secondary)]">
                    Receive real-time WhatsApp and Dashboard alerts when leads qualify, share contact numbers, get routed, or request human help.
                  </p>
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs font-bold cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  disabled={!onSaveConfig}
                  checked={isLeadAlertsEnabled}
                  onChange={(e) => setIsLeadAlertsEnabled(e.target.checked)}
                  className="accent-[var(--ca-brand)] rounded disabled:cursor-not-allowed"
                />
                <span className="text-[var(--ca-text-primary)]">Lead Alerts</span>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2 p-3 rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-hover)]">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!onSaveConfig || !isLeadAlertsEnabled}
                  checked={leadAlertCategories.notifyQualifiedLeads}
                  onChange={() => handleToggleLeadAlertCategory("notifyQualifiedLeads")}
                  className="accent-[var(--ca-brand)] rounded disabled:cursor-not-allowed"
                />
                <span className="text-[var(--ca-text-secondary)]">Qualified Lead</span>
              </label>

              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!onSaveConfig || !isLeadAlertsEnabled}
                  checked={leadAlertCategories.notifyContactCaptured}
                  onChange={() => handleToggleLeadAlertCategory("notifyContactCaptured")}
                  className="accent-[var(--ca-brand)] rounded disabled:cursor-not-allowed"
                />
                <span className="text-[var(--ca-text-secondary)]">Contact Number Captured</span>
              </label>

              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!onSaveConfig || !isLeadAlertsEnabled}
                  checked={leadAlertCategories.notifyLeadRouted}
                  onChange={() => handleToggleLeadAlertCategory("notifyLeadRouted")}
                  className="accent-[var(--ca-brand)] rounded disabled:cursor-not-allowed"
                />
                <span className="text-[var(--ca-text-secondary)]">Lead Routed</span>
              </label>

              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!onSaveConfig || !isLeadAlertsEnabled}
                  checked={leadAlertCategories.notifyRoutingFailed}
                  onChange={() => handleToggleLeadAlertCategory("notifyRoutingFailed")}
                  className="accent-[var(--ca-brand)] rounded disabled:cursor-not-allowed"
                />
                <span className="text-[var(--ca-text-secondary)]">Routing Failed / Unassigned</span>
              </label>

              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!onSaveConfig || !isLeadAlertsEnabled}
                  checked={leadAlertCategories.notifyHumanRequested}
                  onChange={() => handleToggleLeadAlertCategory("notifyHumanRequested")}
                  className="accent-[var(--ca-brand)] rounded disabled:cursor-not-allowed"
                />
                <span className="text-[var(--ca-text-secondary)]">Human Assistance Required</span>
              </label>

              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!onSaveConfig || !isLeadAlertsEnabled}
                  checked={leadAlertCategories.notifyHighIntentLeads}
                  onChange={() => handleToggleLeadAlertCategory("notifyHighIntentLeads")}
                  className="accent-[var(--ca-brand)] rounded disabled:cursor-not-allowed"
                />
                <span className="text-[var(--ca-text-secondary)]">High Intent / Urgent</span>
              </label>
            </div>
          </div>

          {testResult && (
            <div
              className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
                testResult.success ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
              }`}
            >
              {testResult.success ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
              {testResult.message}
            </div>
          )}

          {saveSuccess && (
            <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-500 text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>Admin alerts and proactive settings saved successfully!</span>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={handleTestPing}
              disabled={isTesting || !adminPhone.trim() || !onTestAlert}
              className="ca-button-secondary text-xs disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-3.5 h-3.5 mr-1" />
              {isTesting ? "Sending Test..." : "Send Test Alert"}
            </button>

            <button
              type="submit"
              disabled={isSaving || !adminPhone.trim() || !onSaveConfig}
              className="ca-button-primary text-xs disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-3.5 h-3.5 mr-1" />
              {isSaving ? "Saving..." : "Save Alert Settings"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
