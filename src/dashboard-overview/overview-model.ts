import type { ClientOnboardingChecklist } from "../services/client-onboarding-checklist-service";
import type { DashboardTone } from "../components/dashboard/dashboard-tone";
import { INBOX_UI_ENABLED } from "../config/product-flags";

export interface OverviewMetric {
  id: string;
  label: string;
  value: string | number;
  helper?: string;
  iconName: string;
  tone: DashboardTone;
  available: boolean;
}

export interface OverviewAttentionItem {
  id: string;
  title: string;
  description: string;
  severity: "critical" | "warning" | "info";
  actionLabel: string;
  actionTarget: string; // view or tab identifier
  aiTab?: string;
  billingTab?: string;
}

export interface OverviewQuickAction {
  id: string;
  label: string;
  description: string;
  iconName: string;
  targetView: string;
  aiTab?: string;
  billingTab?: string;
  botTab?: string;
  adminOnly?: boolean;
}

export interface OverviewActivityItem {
  id: string;
  title: string;
  description: string;
  timestamp?: string | number;
  tone?: DashboardTone;
  category?: string;
}

export interface OverviewStateModel {
  workspaceName: string;
  connectionStatus: string;
  connectionTone: DashboardTone;
  selectedBotLabel: string;
  selectedBotJid?: string;
  isAiRepliesEnabled: boolean | null;
  walletBalance: number;
  userPlanName: string;
  onboarding: ClientOnboardingChecklist;
  metrics: OverviewMetric[];
  attentionItems: OverviewAttentionItem[];
  quickActions: OverviewQuickAction[];
  recentActivities: OverviewActivityItem[];
  isLoading: boolean;
  loadError?: string;
}

export interface UserAccountInput {
  accountName?: string;
  name?: string;
  businessName?: string;
  workspaceName?: string;
  email?: string;
}

export interface UserBillingInput {
  plan?: {
    name?: string;
  };
}

export interface BotInstanceInput {
  id?: string;
  name?: string;
  display_name?: string;
  jid?: string;
  status?: string;
  is_active?: number;
}

export interface DashboardNotificationItemInput {
  id?: string;
  title?: string;
  message?: string;
  description?: string;
  detail?: string;
  createdAt?: number;
  timestamp?: number;
  tone?: string;
  category?: string;
}

export type BuildOverviewInput = {
  currentUser?: UserAccountInput;
  userBilling?: UserBillingInput;
  selectedBot?: BotInstanceInput | null;
  connectionStatus?: string;
  isAutoReplyEnabled?: boolean;
  walletBalance?: number;
  customers?: unknown[];
  orders?: unknown[];
  followups?: unknown[];
  products?: unknown[];
  customFields?: unknown[];
  dashboardNotifications?: DashboardNotificationItemInput[];
  onboardingChecklist: ClientOnboardingChecklist;
  isAdmin?: boolean;
  isLoading?: boolean;
  loadError?: string;
};

export function buildOverviewModel(input: BuildOverviewInput): OverviewStateModel {
  const workspaceName =
    input.currentUser?.accountName ||
    input.currentUser?.name ||
    input.currentUser?.businessName ||
    input.currentUser?.workspaceName ||
    "Workspace";

  const rawStatus = (input.connectionStatus || input.selectedBot?.status || "Disconnected").trim();
  const isConnected = /\b(?:connected|linked)\b/i.test(rawStatus);
  const isConnecting = /\b(?:connecting|preparing)\b/i.test(rawStatus);
  const isQrRequired = /\b(?:qr|scan)\b/i.test(rawStatus);

  const connectionTone: DashboardTone = isConnected
    ? "teal"
    : isConnecting || isQrRequired
      ? "amber"
      : "neutral";

  const selectedBotLabel =
    input.selectedBot?.name ||
    input.selectedBot?.display_name ||
    input.selectedBot?.jid ||
    "No instance selected";

  const isAiRepliesKnown = typeof input.isAutoReplyEnabled === "boolean";
  const isAiRepliesEnabled = isAiRepliesKnown ? Boolean(input.isAutoReplyEnabled) : null;
  const walletBalance = Number(input.walletBalance || 0);

  const userPlanName = input.userBilling?.plan?.name || "Plan unavailable";

  // Build Metrics with truth verification
  const customersValue = Array.isArray(input.customers)
    ? input.customers.length.toLocaleString()
    : "Loading...";

  const ordersValue = Array.isArray(input.orders)
    ? input.orders.length.toLocaleString()
    : "Loading...";

  const metrics: OverviewMetric[] = [
    {
      id: "whatsapp_status",
      label: "WhatsApp Assistant",
      value: isConnected ? "Connected" : isQrRequired ? "QR Required" : isConnecting ? "Connecting" : "Disconnected",
      helper: selectedBotLabel,
      iconName: "Smartphone",
      tone: connectionTone,
      available: true,
    },
    {
      id: "ai_replies",
      label: "AI Replies",
      value: isAiRepliesEnabled === true ? "Active" : isAiRepliesEnabled === false ? "Disabled" : "Loading...",
      helper: isAiRepliesEnabled === true
        ? "Bot handles customer conversations"
        : isAiRepliesEnabled === false
          ? "Replies paused; manual takeover active"
          : "Checking reply configuration",
      iconName: "Bot",
      tone: isAiRepliesEnabled === true ? "violet" : "neutral",
      available: true,
    },
    {
      id: "total_customers",
      label: "Total Customers",
      value: customersValue,
      helper: Array.isArray(input.customers)
        ? input.customers.length > 0 ? "Saved WhatsApp contacts" : "No saved customer contacts yet"
        : "Fetching saved contacts",
      iconName: "Users",
      tone: "blue",
      available: true,
    },
    {
      id: "total_orders",
      label: "Leads & Orders",
      value: ordersValue,
      helper: Array.isArray(input.orders)
        ? input.orders.length > 0 ? "Captured via conversation" : "No leads or orders captured yet"
        : "Fetching lead records",
      iconName: "ShoppingCart",
      tone: "amber",
      available: true,
    },
    {
      id: "wallet_balance",
      label: "Wallet Balance",
      value: `$${Math.max(0, walletBalance).toFixed(2)}`,
      helper: "Available credit balance for AI messages",
      iconName: "Wallet",
      tone: "teal",
      available: true,
    },
  ];

  // Build Attention Items
  const attentionItems: OverviewAttentionItem[] = [];

  if (!input.selectedBot) {
    attentionItems.push({
      id: "no_instance",
      title: "No WhatsApp Instance Selected",
      description: "Connect or select a WhatsApp number to enable automated messages and customer support.",
      severity: "critical",
      actionLabel: "Connect WhatsApp",
      actionTarget: "selector",
    });
  } else if (isQrRequired) {
    attentionItems.push({
      id: "qr_required",
      title: "WhatsApp QR Pairing Required",
      description: "Scan the QR code in WhatsApp Linked Devices to re-authenticate your assistant.",
      severity: "warning",
      actionLabel: "Scan QR Code",
      actionTarget: "selector",
    });
  } else if (!isConnected) {
    attentionItems.push({
      id: "instance_disconnected",
      title: "WhatsApp Assistant Disconnected",
      description: "Your assistant is currently offline. Reconnect to resume receiving customer messages.",
      severity: "warning",
      actionLabel: "Check Connection",
      actionTarget: "selector",
    });
  }

  if (isAiRepliesEnabled === false) {
    attentionItems.push({
      id: "ai_disabled",
      title: "AI Replies Are Disabled",
      description: "Incoming messages remain visible, but AI automated replies are currently paused.",
      severity: "info",
      actionLabel: "Configure AI",
      actionTarget: "ai",
      aiTab: "instructions",
    });
  }

  if (Array.isArray(input.products) && input.products.length === 0) {
    attentionItems.push({
      id: "no_products",
      title: "No Products or Services Added",
      description: "Add your catalog items so the assistant can answer pricing and product inquiries.",
      severity: "info",
      actionLabel: "Add Products",
      actionTarget: "products",
    });
  }

  // Build Quick Actions (clean operational descriptions)
  const quickActions: OverviewQuickAction[] = [
    ...(INBOX_UI_ENABLED
      ? [
          {
            id: "action_inbox",
            label: "Open Customer Inbox",
            description: "Manage active WhatsApp customer conversations",
            iconName: "MessageSquare",
            targetView: "dashboard",
          },
        ]
      : []),
    {
      id: "action_connect_wa",
      label: "Connect WhatsApp",
      description: "Manage instance pairing and status",
      iconName: "Smartphone",
      targetView: "selector",
    },
    {
      id: "action_configure_ai",
      label: "Configure AI Studio",
      description: "Update prompt directives, bio & reply style",
      iconName: "Bot",
      targetView: "ai",
      aiTab: "instructions",
    },
    {
      id: "action_products",
      label: "Products & Services",
      description: "Manage catalog items and product details",
      iconName: "Package",
      targetView: "products",
    },
    {
      id: "action_customers",
      label: "View Customers",
      description: "Search contact directory and history",
      iconName: "Users",
      targetView: "customers",
    },
    {
      id: "action_followups",
      label: "Automated Follow-ups",
      description: "Set up reminder schedules and sequences",
      iconName: "CalendarClock",
      targetView: "marketing",
    },
    {
      id: "action_integrations",
      label: "Integrations & Webhooks",
      description: "Configure third-party connectors",
      iconName: "Puzzle",
      targetView: "ai",
      aiTab: "integrations",
    },
    {
      id: "action_billing",
      label: "Wallet & Billing",
      description: "Add balance and review usage reports",
      iconName: "Wallet",
      targetView: "billing",
      billingTab: "overview",
    },
  ];

  // Build Recent Activity Feed with strict timestamp verification
  const recentActivities: OverviewActivityItem[] = (input.dashboardNotifications || [])
    .slice(0, 5)
    .map((notif, index) => {
      const realTimestamp = notif.createdAt || notif.timestamp;
      return {
        id: notif.id || `activity-${index}`,
        title: notif.title || notif.message || "System event",
        description: notif.description || notif.detail || "",
        ...(realTimestamp ? { timestamp: realTimestamp } : {}),
        tone: (notif.tone as DashboardTone) || "neutral",
        category: notif.category || "Notification",
      };
    });

  return {
    workspaceName,
    connectionStatus: rawStatus,
    connectionTone,
    selectedBotLabel,
    selectedBotJid: input.selectedBot?.jid,
    isAiRepliesEnabled,
    walletBalance,
    userPlanName,
    onboarding: input.onboardingChecklist,
    metrics,
    attentionItems,
    quickActions: input.isAdmin
      ? quickActions
      : quickActions.filter((action) => !action.adminOnly),
    recentActivities,
    isLoading: Boolean(input.isLoading),
    loadError: input.loadError,
  };
}
