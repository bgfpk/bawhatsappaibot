import React from "react";
import { Globe, ShoppingBag, Key, Webhook, Truck, Activity, CheckCircle2, AlertTriangle, HelpCircle } from "lucide-react";
import type { WooCommerceConfig, CourierConfig, IntegrationEventLogItem, ApiKeyRecord, WebhookRecord } from "./integration-model";

interface Props {
  wooConfig?: WooCommerceConfig;
  courierConfigs?: CourierConfig[];
  apiKeys?: ApiKeyRecord[];
  webhooks?: WebhookRecord[];
  recentLogs?: IntegrationEventLogItem[];
  onSelectTab: (tab: any) => void;
  formatDate?: (ts: any) => string;
}

export const IntegrationOverview: React.FC<Props> = ({
  wooConfig,
  courierConfigs = [],
  apiKeys = [],
  webhooks = [],
  recentLogs = [],
  onSelectTab,
  formatDate = (ts) => (ts ? String(ts) : ""),
}) => {
  const activeKeysCount = apiKeys.filter((k) => k.status === "active").length;
  const activeWebhooksCount = webhooks.filter((w) => w.isEnabled).length;
  const configuredCouriersCount = courierConfigs.filter((c) => c.isConfigured).length;

  return (
    <div className="space-y-6">
      {/* Integration Status Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Website Lead API */}
        <div
          onClick={() => onSelectTab("website_api")}
          className="cursor-pointer rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-surface)] p-5 shadow-sm hover:border-[var(--ca-brand)] transition-all flex flex-col justify-between"
        >
          <div className="flex items-start justify-between">
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-500">
              <Globe className="w-5 h-5" />
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-500 bg-emerald-500/10 px-2.5 py-1 rounded-full">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Active
            </span>
          </div>
          <div className="mt-4">
            <h3 className="font-bold text-[var(--ca-text-primary)]">Website Lead API</h3>
            <p className="text-xs text-[var(--ca-text-secondary)] mt-1">
              Capture inbound leads via REST endpoint.
            </p>
          </div>
        </div>

        {/* WooCommerce */}
        <div
          onClick={() => onSelectTab("woocommerce")}
          className="cursor-pointer rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-surface)] p-5 shadow-sm hover:border-[var(--ca-brand)] transition-all flex flex-col justify-between"
        >
          <div className="flex items-start justify-between">
            <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-500">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full ${
              wooConfig?.status === "connected"
                ? "text-emerald-500 bg-emerald-500/10"
                : wooConfig?.status === "error"
                ? "text-rose-500 bg-rose-500/10"
                : "text-[var(--ca-text-muted)] bg-neutral-500/10"
            }`}>
              {wooConfig?.status === "connected" ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Connected
                </>
              ) : wooConfig?.status === "error" ? (
                <>
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Needs Attention
                </>
              ) : (
                <>
                  <HelpCircle className="w-3.5 h-3.5" />
                  Not Connected
                </>
              )}
            </span>
          </div>
          <div className="mt-4">
            <h3 className="font-bold text-[var(--ca-text-primary)]">WooCommerce</h3>
            <p className="text-xs text-[var(--ca-text-secondary)] mt-1">
              {wooConfig?.storeUrl || "Sync products and handle webhook orders."}
            </p>
          </div>
        </div>

        {/* API Keys */}
        <div
          onClick={() => onSelectTab("api_keys")}
          className="cursor-pointer rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-surface)] p-5 shadow-sm hover:border-[var(--ca-brand)] transition-all flex flex-col justify-between"
        >
          <div className="flex items-start justify-between">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500">
              <Key className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-[var(--ca-text-secondary)] bg-[var(--ca-bg-hover)] px-2.5 py-1 rounded-full">
              {activeKeysCount} Active Keys
            </span>
          </div>
          <div className="mt-4">
            <h3 className="font-bold text-[var(--ca-text-primary)]">Public API Keys</h3>
            <p className="text-xs text-[var(--ca-text-secondary)] mt-1">
              Scoped API credentials for custom integrations.
            </p>
          </div>
        </div>

        {/* Webhooks */}
        <div
          onClick={() => onSelectTab("webhooks")}
          className="cursor-pointer rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-surface)] p-5 shadow-sm hover:border-[var(--ca-brand)] transition-all flex flex-col justify-between"
        >
          <div className="flex items-start justify-between">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500">
              <Webhook className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-[var(--ca-text-secondary)] bg-[var(--ca-bg-hover)] px-2.5 py-1 rounded-full">
              {activeWebhooksCount} Subscribed
            </span>
          </div>
          <div className="mt-4">
            <h3 className="font-bold text-[var(--ca-text-primary)]">Webhooks</h3>
            <p className="text-xs text-[var(--ca-text-secondary)] mt-1">
              Receive automated event notifications in real time.
            </p>
          </div>
        </div>

        {/* Courier / Shipping */}
        <div
          onClick={() => onSelectTab("courier")}
          className="cursor-pointer rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-surface)] p-5 shadow-sm hover:border-[var(--ca-brand)] transition-all flex flex-col justify-between"
        >
          <div className="flex items-start justify-between">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-500">
              <Truck className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-[var(--ca-text-secondary)] bg-[var(--ca-bg-hover)] px-2.5 py-1 rounded-full">
              {configuredCouriersCount} Configured
            </span>
          </div>
          <div className="mt-4">
            <h3 className="font-bold text-[var(--ca-text-primary)]">Courier & Shipping</h3>
            <p className="text-xs text-[var(--ca-text-secondary)] mt-1">
              PostEx & Leopards tracking & booking credentials.
            </p>
          </div>
        </div>
      </div>

      {/* Recent Integration Activity */}
      <div className="rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-surface)] p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-[var(--ca-brand)]" />
            <h3 className="font-bold text-[var(--ca-text-primary)]">Recent Integration Activity</h3>
          </div>
          <button
            onClick={() => onSelectTab("logs")}
            className="text-xs font-bold text-[var(--ca-brand)] hover:underline"
          >
            View All Logs →
          </button>
        </div>

        {recentLogs.length === 0 ? (
          <div className="py-8 text-center text-xs text-[var(--ca-text-muted)]">
            No recent integration events recorded.
          </div>
        ) : (
          <div className="divide-y divide-[var(--ca-border-subtle)]">
            {recentLogs.slice(0, 5).map((log) => (
              <div key={log.id} className="py-3 flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-[var(--ca-text-primary)]">{log.integration}</span>
                  <span className="mx-1.5 text-[var(--ca-text-muted)]">•</span>
                  <span className="text-[var(--ca-text-secondary)]">{log.eventType}</span>
                  {log.details && (
                    <p className="text-[11px] text-[var(--ca-text-muted)] mt-0.5">{log.details}</p>
                  )}
                </div>
                <div className="text-right">
                  <span className={`inline-block px-2 py-0.5 rounded font-bold uppercase text-[10px] ${
                    log.status === "success" ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
                  }`}>
                    {log.status}
                  </span>
                  <p className="text-[10px] text-[var(--ca-text-muted)] mt-0.5">{formatDate(log.timestamp)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
