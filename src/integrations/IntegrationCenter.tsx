import React, { useState } from "react";
import { Puzzle, Globe, ShoppingBag, Key, Webhook, Truck, Activity, Layers } from "lucide-react";
import { DashboardPageHeader } from "../components/dashboard/DashboardPrimitives";
import { IntegrationOverview } from "./IntegrationOverview";
import { WebsiteApiPanel } from "./WebsiteApiPanel";
import { WooCommercePanel } from "./WooCommercePanel";
import { PublicApiKeysPanel } from "./PublicApiKeysPanel";
import { WebhooksPanel } from "./WebhooksPanel";
import { CourierPanel } from "./CourierPanel";
import { IntegrationEventLogsPanel } from "./IntegrationEventLogsPanel";
import type {
  IntegrationTabId,
  WooCommerceConfig,
  CourierConfig,
  ApiKeyRecord,
  WebhookRecord,
  IntegrationEventLogItem,
  PublicApiScope,
} from "./integration-model";

interface Props {
  initialTab?: IntegrationTabId;
  wooConfig?: WooCommerceConfig;
  courierConfigs?: CourierConfig[];
  apiKeys?: ApiKeyRecord[];
  webhooks?: WebhookRecord[];
  eventLogs?: IntegrationEventLogItem[];
  websiteSecretMasked?: string;
  onRegenerateWebsiteSecret?: () => Promise<{ rawSecret: string }>;
  onSaveWooConfig?: (storeUrl: string, key: string, secret: string) => Promise<void>;
  onTestWooConnection?: () => Promise<{ success: boolean; message?: string }>;
  onFetchWooProductPreview?: () => Promise<any[]>;
  onSyncWooProducts?: () => Promise<void>;
  onRemoveWooConnection?: () => Promise<void>;
  onCreateApiKey?: (name: string, scopes: PublicApiScope[]) => Promise<{ rawKey: string; record: ApiKeyRecord }>;
  onRevokeApiKey?: (keyId: string) => Promise<void>;
  onCreateWebhook?: (name: string, targetUrl: string, events: string[]) => Promise<{ rawSecret: string; record: WebhookRecord }>;
  onDeleteWebhook?: (id: string) => Promise<void>;
  onTestWebhookPing?: (id: string) => Promise<{ success: boolean; message?: string }>;
  onSaveCourier?: (provider: "postex" | "leopard", apiKey: string, merchantId: string) => Promise<void>;
  onTestCourierConnection?: (provider: "postex" | "leopard") => Promise<{ success: boolean; message?: string }>;
  onCopyText?: (text: string) => void;
  formatDate?: (ts: any) => string;
}

export const IntegrationCenter: React.FC<Props> = ({
  initialTab = "overview",
  wooConfig = { storeUrl: "", consumerKey: "", consumerSecretMasked: "", status: "untested" },
  courierConfigs = [
    { provider: "postex", name: "PostEx Courier", isConfigured: false, status: "unconfigured" },
    { provider: "leopard", name: "Leopards Courier", isConfigured: false, status: "unconfigured" },
  ],
  apiKeys = [],
  webhooks = [],
  eventLogs = [],
  websiteSecretMasked = "",
  onRegenerateWebsiteSecret,
  onSaveWooConfig,
  onTestWooConnection,
  onFetchWooProductPreview,
  onSyncWooProducts,
  onRemoveWooConnection,
  onCreateApiKey,
  onRevokeApiKey,
  onCreateWebhook,
  onDeleteWebhook,
  onTestWebhookPing,
  onSaveCourier,
  onTestCourierConnection,
  onCopyText = (text) => {
    if (navigator?.clipboard) navigator.clipboard.writeText(text);
  },
  formatDate = (ts) => (ts ? String(ts) : ""),
}) => {
  const [activeTab, setActiveTab] = useState<IntegrationTabId>(initialTab);

  const tabs = [
    { id: "overview" as const, label: "Overview", icon: Layers },
    { id: "website_api" as const, label: "Website Lead API", icon: Globe },
    { id: "woocommerce" as const, label: "WooCommerce", icon: ShoppingBag },
    { id: "api_keys" as const, label: "Public API Keys", icon: Key },
    { id: "webhooks" as const, label: "Webhooks", icon: Webhook },
    { id: "courier" as const, label: "Courier & Shipping", icon: Truck },
    { id: "logs" as const, label: "Event Logs", icon: Activity },
  ];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      {/* Header */}
      <DashboardPageHeader
        eyebrow="Integrations & API"
        title="Integration Center"
        description="Manage Website Lead capture APIs, WooCommerce store connection, Public API keys, Webhooks, and Courier credentials."
        icon={Puzzle}
      />

      {/* Sub-Navigation Tabs */}
      <div className="flex border-b border-[var(--ca-border-subtle)] overflow-x-auto gap-2">
        {tabs.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 transition-all ${
                isActive
                  ? "border-[var(--ca-brand)] text-[var(--ca-brand)]"
                  : "border-transparent text-[var(--ca-text-secondary)] hover:text-[var(--ca-text-primary)]"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}
      {activeTab === "overview" && (
        <IntegrationOverview
          wooConfig={wooConfig}
          courierConfigs={courierConfigs}
          apiKeys={apiKeys}
          webhooks={webhooks}
          recentLogs={eventLogs}
          onSelectTab={setActiveTab}
          formatDate={formatDate}
        />
      )}

      {activeTab === "website_api" && (
        <WebsiteApiPanel
          secretMasked={websiteSecretMasked}
          onRegenerateSecret={onRegenerateWebsiteSecret}
          onCopy={onCopyText}
        />
      )}

      {activeTab === "woocommerce" && (
        <WooCommercePanel
          config={wooConfig}
          onSaveConfig={onSaveWooConfig}
          onTestConnection={onTestWooConnection}
          onFetchProductPreview={onFetchWooProductPreview}
          onSyncProducts={onSyncWooProducts}
          onRemoveConnection={onRemoveWooConnection}
        />
      )}

      {activeTab === "api_keys" && (
        <PublicApiKeysPanel
          apiKeys={apiKeys}
          onCreateKey={onCreateApiKey}
          onRevokeKey={onRevokeApiKey}
          onCopy={onCopyText}
          formatDate={formatDate}
        />
      )}

      {activeTab === "webhooks" && (
        <WebhooksPanel
          webhooks={webhooks}
          onCreateWebhook={onCreateWebhook}
          onDeleteWebhook={onDeleteWebhook}
          onTestPing={onTestWebhookPing}
          onCopy={onCopyText}
          formatDate={formatDate}
        />
      )}

      {activeTab === "courier" && (
        <CourierPanel
          couriers={courierConfigs}
          onSaveCourier={onSaveCourier}
          onTestConnection={onTestCourierConnection}
        />
      )}

      {activeTab === "logs" && (
        <IntegrationEventLogsPanel
          logs={eventLogs}
          formatDate={formatDate}
        />
      )}
    </div>
  );
};
