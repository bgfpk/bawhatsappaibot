import type { DashboardNotificationItem } from "./dashboard-notification-ui-service";

export type DashboardAlertChannel = "dashboard" | "whatsapp";

export type DashboardAlertCategory =
  | "crm_leads"
  | "assigned_leads"
  | "due_followups"
  | "overdue_followups"
  | "hot_leads"
  | "needs_human_reply"
  | "lifecycle_suggestions"
  | "smart_crm_actions"
  | "agent_mode_actions"
  | "agent_mode_failures"
  | "billing_wallet"
  | "whatsapp_instance"
  | "integration_sync";

export type DashboardAlertChannelPreferences = Record<DashboardAlertChannel, boolean>;

export type DashboardAlertPreferences = {
  categories: Partial<Record<DashboardAlertCategory | string, DashboardAlertChannelPreferences>>;
};

export const DASHBOARD_ALERT_PREFERENCES_STORE_KEY = "dashboardAlertPreferences";

export const DEFAULT_DASHBOARD_ALERT_CHANNELS: DashboardAlertChannelPreferences = {
  dashboard: true,
  whatsapp: false,
};

export const DASHBOARD_ALERT_CATEGORIES: Array<{
  id: DashboardAlertCategory;
  label: string;
  description: string;
  whatsappSupported: boolean;
}> = [
  { id: "crm_leads", label: "CRM leads", description: "New leads and lead intake updates.", whatsappSupported: false },
  { id: "assigned_leads", label: "Assigned leads", description: "Leads assigned to you or your team.", whatsappSupported: false },
  { id: "due_followups", label: "Due follow-ups", description: "Follow-ups that are ready soon.", whatsappSupported: false },
  { id: "overdue_followups", label: "Overdue follow-ups", description: "Follow-ups that need attention now.", whatsappSupported: true },
  { id: "hot_leads", label: "Hot leads", description: "High-intent or urgent lead signals.", whatsappSupported: true },
  { id: "needs_human_reply", label: "Needs human reply", description: "Conversations where staff should step in.", whatsappSupported: true },
  { id: "lifecycle_suggestions", label: "Lifecycle suggestions", description: "Lifecycle and next-best-action prompts.", whatsappSupported: false },
  { id: "smart_crm_actions", label: "Smart CRM Actions", description: "Suggested CRM actions ready to review.", whatsappSupported: false },
  { id: "agent_mode_actions", label: "Agent Mode actions", description: "Completed safe Agent Mode actions.", whatsappSupported: true },
  { id: "agent_mode_failures", label: "Agent Mode skips/failures", description: "Skipped, blocked, or failed Agent Mode actions.", whatsappSupported: true },
  { id: "billing_wallet", label: "Wallet and billing", description: "Wallet balance and usage-limit alerts.", whatsappSupported: true },
  { id: "whatsapp_instance", label: "WhatsApp instance", description: "QR, connection, and instance health alerts.", whatsappSupported: true },
  { id: "integration_sync", label: "Integration sync", description: "Connector and sync status alerts.", whatsappSupported: true },
];

const KNOWN_CATEGORY_IDS = new Set(DASHBOARD_ALERT_CATEGORIES.map((item) => item.id));

function normalizeChannelPreferences(input: any): DashboardAlertChannelPreferences {
  return {
    dashboard: typeof input?.dashboard === "boolean" ? input.dashboard : DEFAULT_DASHBOARD_ALERT_CHANNELS.dashboard,
    whatsapp: typeof input?.whatsapp === "boolean" ? input.whatsapp : DEFAULT_DASHBOARD_ALERT_CHANNELS.whatsapp,
  };
}

export function normalizeDashboardAlertPreferences(input?: any): DashboardAlertPreferences {
  const categories: DashboardAlertPreferences["categories"] = {};
  const rawCategories = input?.categories && typeof input.categories === "object" ? input.categories : input;

  DASHBOARD_ALERT_CATEGORIES.forEach((item) => {
    categories[item.id] = normalizeChannelPreferences(rawCategories?.[item.id]);
  });

  if (rawCategories && typeof rawCategories === "object") {
    Object.keys(rawCategories).forEach((key) => {
      if (!KNOWN_CATEGORY_IDS.has(key as DashboardAlertCategory)) {
        categories[key] = normalizeChannelPreferences(rawCategories[key]);
      }
    });
  }

  return { categories };
}

export function getDashboardNotificationCategory(item: Pick<DashboardNotificationItem, "category" | "source" | "type" | "title" | "description" | "actionId">): DashboardAlertCategory | string {
  if (item.category) return item.category;
  const type = String(item.type || "").toLowerCase();
  const text = `${item.title || ""} ${item.description || ""} ${item.actionId || ""}`.toLowerCase();

  if (item.source === "billing" || ["wallet", "limit", "billing"].includes(type)) return "billing_wallet";
  if (item.source === "integrations") return "integration_sync";
  if (item.source === "system" || ["whatsapp", "instance"].includes(type)) return "whatsapp_instance";
  if (type.includes("assigned")) return "assigned_leads";
  if (type.includes("overdue")) return "overdue_followups";
  if (type.includes("follow_up")) return "due_followups";
  if (type.includes("agent") && (type.includes("skip") || type.includes("fail") || text.includes("skipped") || text.includes("blocked"))) return "agent_mode_failures";
  if (type.includes("agent")) return "agent_mode_actions";
  if (text.includes("human reply") || text.includes("needs human")) return "needs_human_reply";
  if (text.includes("lifecycle")) return "lifecycle_suggestions";
  if (text.includes("hot lead") || text.includes("high intent")) return "hot_leads";
  if (type.includes("smart") || text.includes("smart crm")) return "smart_crm_actions";
  return "crm_leads";
}

export function getAlertChannelEnabled(
  preferences: DashboardAlertPreferences | undefined,
  category: DashboardAlertCategory | string,
  channel: DashboardAlertChannel,
) {
  const normalized = normalizeDashboardAlertPreferences(preferences);
  const channels = normalized.categories[category] || DEFAULT_DASHBOARD_ALERT_CHANNELS;
  return typeof channels[channel] === "boolean" ? channels[channel] : DEFAULT_DASHBOARD_ALERT_CHANNELS[channel];
}

export function filterDashboardNotificationsByPreferences(
  rows: DashboardNotificationItem[] = [],
  preferences?: DashboardAlertPreferences,
) {
  const normalized = normalizeDashboardAlertPreferences(preferences);
  return rows.filter((item) => getAlertChannelEnabled(normalized, getDashboardNotificationCategory(item), "dashboard"));
}

export function setAlertChannelPreference(
  preferences: DashboardAlertPreferences | undefined,
  category: DashboardAlertCategory | string,
  channel: DashboardAlertChannel,
  enabled: boolean,
) {
  const normalized = normalizeDashboardAlertPreferences(preferences);
  const current = normalized.categories[category] || DEFAULT_DASHBOARD_ALERT_CHANNELS;
  return {
    categories: {
      ...normalized.categories,
      [category]: {
        ...current,
        [channel]: enabled,
      },
    },
  };
}

export function getWhatsAppAlertDeliveryPlan(
  item: DashboardNotificationItem,
  preferences?: DashboardAlertPreferences,
) {
  const category = getDashboardNotificationCategory(item);
  const requested = getAlertChannelEnabled(preferences, category, "whatsapp");
  const categoryConfig = DASHBOARD_ALERT_CATEGORIES.find((entry) => entry.id === category);
  const supported = Boolean(categoryConfig?.whatsappSupported);
  return {
    category,
    requested,
    supported,
    reason: requested && supported ? "whatsapp_alert_delivery_available_for_major_alerts" : requested ? "whatsapp_alert_delivery_not_wired" : "whatsapp_alert_disabled",
  };
}
