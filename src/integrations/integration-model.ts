export const PUBLIC_API_SCOPES = [
  "read:account",
  "read:customers",
  "write:customers",
  "read:orders",
  "write:orders",
  "read:products",
  "write:products",
  "read:messages",
  "write:messages",
  "write:leads",
  "write:knowledge",
] as const;

export type IntegrationTabId =
  | "overview"
  | "website_api"
  | "woocommerce"
  | "api_keys"
  | "webhooks"
  | "courier"
  | "logs";

export type PublicApiScope = (typeof PUBLIC_API_SCOPES)[number];

export interface ApiKeyRecord {
  id: string;
  name: string;
  keyMasked: string;
  rawKeyOnce?: string;
  scopes: PublicApiScope[];
  createdAt: number | string;
  lastUsedAt?: number | string;
  status: "active" | "revoked";
}

export interface WebhookRecord {
  id: string;
  name: string;
  targetUrl: string;
  events: string[];
  isEnabled: boolean;
  secretMasked: string;
  rawSecretOnce?: string;
  createdAt: number | string;
  lastDeliveryStatus?: "success" | "failed" | "none";
}

export interface WooCommerceConfig {
  storeUrl: string;
  consumerKey: string;
  consumerSecretMasked: string;
  status: "connected" | "disconnected" | "error" | "untested";
  lastSyncedAt?: number | string;
  syncedProductCount?: number;
  webhookStatus?: "active" | "inactive";
}

export interface CourierConfig {
  provider: "postex" | "leopard";
  name: string;
  isConfigured: boolean;
  apiKeyMasked?: string;
  merchantIdMasked?: string;
  status: "active" | "unconfigured" | "error";
}

export interface IntegrationEventLogItem {
  id: string;
  timestamp: number | string;
  integration: string;
  eventType: string;
  status: "success" | "failed" | "duplicate" | "warning";
  sourceRef?: string;
  details?: string;
}

export function maskSecret(secret?: string): string {
  if (!secret) return "";
  const s = String(secret).trim();
  if (s.length <= 8) return "••••••••";
  return `${s.slice(0, 4)}••••••••${s.slice(-4)}`;
}

export function filterIntegrationEventLogs(
  logs: IntegrationEventLogItem[],
  query: string,
  integrationFilter: string,
  statusFilter: string
): IntegrationEventLogItem[] {
  const q = query.trim().toLowerCase();

  return logs.filter((item) => {
    if (integrationFilter !== "all" && item.integration !== integrationFilter) {
      return false;
    }
    if (statusFilter !== "all" && item.status !== statusFilter) {
      return false;
    }
    if (q) {
      const matchType = (item.eventType || "").toLowerCase().includes(q);
      const matchRef = (item.sourceRef || "").toLowerCase().includes(q);
      const matchDetails = (item.details || "").toLowerCase().includes(q);
      if (!matchType && !matchRef && !matchDetails) return false;
    }
    return true;
  });
}
