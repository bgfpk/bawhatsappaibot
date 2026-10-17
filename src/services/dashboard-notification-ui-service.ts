export type DashboardToastTone = "success" | "error" | "info";
export type DashboardNotificationSource = "crm" | "system" | "billing" | "integrations";
export type DashboardNotificationFilter = "all" | DashboardNotificationSource;

export type DashboardNotificationItem = {
  id: string;
  source: DashboardNotificationSource;
  sourceLabel: string;
  title: string;
  description: string;
  severity?: "info" | "warn" | "danger" | "success";
  type?: string;
  createdAt?: number;
  read?: boolean;
  completed?: boolean;
  leadId?: string;
  actionId?: string;
  actionLabel?: string;
  safe?: boolean;
  page?: string;
  category?: string;
};

export const DASHBOARD_NOTIFICATION_FILTERS: Array<{ id: DashboardNotificationFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "crm", label: "CRM" },
  { id: "system", label: "System" },
  { id: "billing", label: "Billing" },
  { id: "integrations", label: "Integrations" },
];

export const DASHBOARD_NOTIFICATION_TRIGGER_PLACEMENT = "sidebar-footer";

export function getDashboardNotificationTriggerClassName() {
  return "relative inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100 text-gray-600 transition-colors hover:bg-gray-200 dark:bg-white/[0.055] dark:text-neutral-300 dark:hover:bg-white/10";
}

export function buildDashboardToast(input: { id?: string; tone?: DashboardToastTone; message?: string }) {
  const message = String(input.message || "").trim().slice(0, 180);
  return {
    id: input.id || `toast_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    tone: input.tone === "error" ? "error" : input.tone === "info" ? "info" : "success",
    message: message || "Action completed.",
  };
}

export function countActiveDashboardNotifications(rows: any[] = []) {
  return rows.filter((item) => item && item.completed !== true && item.read !== true).length;
}

export function topDashboardNotifications(rows: any[] = [], limit = 12) {
  return rows
    .filter((item) => item && item.completed !== true)
    .slice()
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
    .slice(0, Math.max(1, limit));
}

export function crmDashboardNotifications(rows: any[] = []): DashboardNotificationItem[] {
  return rows.filter(Boolean).map((item) => ({
    id: `crm:${item.id}`,
    source: "crm",
    sourceLabel: "CRM",
    title: String(item.title || "CRM alert"),
    description: String(item.message || item.description || "Review this CRM alert."),
    severity: item.severity || "info",
    type: item.type,
    createdAt: Number(item.createdAt || 0),
    read: item.read === true,
    completed: item.completed === true,
    leadId: item.leadId,
    actionId: item.actionId,
    actionLabel: item.actionLabel,
    safe: item.safe === true,
  }));
}

export function systemDashboardNotifications(input: {
  selectedBot?: any;
  status?: string;
  qrCode?: string | null;
  walletBalance?: number;
  billing?: any;
} = {}): DashboardNotificationItem[] {
  const rows: DashboardNotificationItem[] = [];
  const botName = input.selectedBot?.name || input.selectedBot?.jid || "selected instance";
  const now = Math.floor(Date.now() / 1000);

  if (input.selectedBot?.is_active === 0) {
    rows.push({
      id: "system:bot-paused",
      source: "system",
      sourceLabel: "System",
      title: "Instance paused",
      description: `${botName} is paused and will not reply until it is re-enabled.`,
      severity: "warn",
      type: "instance",
      createdAt: now,
      page: "selector",
    });
  }

  if (input.status === "qr-ready" || input.qrCode) {
    rows.push({
      id: "system:qr-needed",
      source: "system",
      sourceLabel: "System",
      title: "QR scan needed",
      description: "WhatsApp is waiting for a QR scan before the instance can connect.",
      severity: "warn",
      type: "whatsapp",
      createdAt: now,
      page: "dashboard",
    });
  } else if (["disconnected", "retrying", "error", "proxy-connecting"].includes(String(input.status || ""))) {
    rows.push({
      id: `system:whatsapp-${input.status}`,
      source: "system",
      sourceLabel: "System",
      title: input.status === "error" ? "Connection issue" : "WhatsApp not connected",
      description: input.status === "retrying" ? "The engine is retrying the WhatsApp connection." : "Review the selected instance connection status.",
      severity: input.status === "error" ? "danger" : "warn",
      type: "whatsapp",
      createdAt: now,
      page: "dashboard",
    });
  }

  const wallet = Number(input.walletBalance || 0);
  if (wallet <= 0) {
    rows.push({
      id: "billing:wallet-empty",
      source: "billing",
      sourceLabel: "Billing",
      title: "Wallet empty",
      description: "Wallet balance is empty. Billing-gated automation may pause when limits apply.",
      severity: "danger",
      type: "wallet",
      createdAt: now,
      page: "billing",
    });
  } else if (wallet < 2) {
    rows.push({
      id: "billing:wallet-low",
      source: "billing",
      sourceLabel: "Billing",
      title: "Wallet low",
      description: `Wallet balance is $${wallet.toFixed(2)}.`,
      severity: "warn",
      type: "wallet",
      createdAt: now,
      page: "billing",
    });
  }

  const usage = Number(input.billing?.usage || 0);
  const limit = Number(input.billing?.limit || 0);
  if (limit > 0 && usage >= limit) {
    rows.push({
      id: "billing:limit-exhausted",
      source: "billing",
      sourceLabel: "Billing",
      title: "Reply limit exhausted",
      description: "Usage has reached the current billing limit.",
      severity: "danger",
      type: "limit",
      createdAt: now,
      page: "billing",
    });
  }

  return rows;
}

export function mergeDashboardNotifications(...groups: DashboardNotificationItem[][]) {
  const seen = new Set<string>();
  const merged: DashboardNotificationItem[] = [];
  groups.flat().forEach((item) => {
    if (!item?.id || seen.has(item.id)) return;
    seen.add(item.id);
    merged.push(item);
  });
  return merged;
}

export function filterDashboardNotifications(rows: DashboardNotificationItem[] = [], filter: DashboardNotificationFilter = "all") {
  return filter === "all" ? rows : rows.filter((item) => item.source === filter);
}
