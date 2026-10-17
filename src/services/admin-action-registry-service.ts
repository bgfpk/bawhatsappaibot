import type { AdminBusinessAssistantContext } from "./admin-identity-service.ts";

export type AdminActionRiskLevel = "READ" | "SAFE_WRITE" | "SENSITIVE_WRITE" | "CRITICAL";

export interface AdminActionDefinition {
  actionId: string;
  category: string;
  label: string;
  description: string;
  riskLevel: AdminActionRiskLevel;
  requiredRole: "owner" | "admin" | "manager";
  requiresConfirmation: boolean;
  requiresStepUp?: boolean;
  isDashboardOnly?: boolean;
  idempotent: boolean;
  auditEventType: string;
  handler?: (context: AdminBusinessAssistantContext, params: any) => Promise<AdminActionResult>;
}

export interface AdminActionResult {
  success: boolean;
  message: string;
  data?: any;
  error?: string;
  requiresConfirmation?: boolean;
}

function getActionRegistryMap(): Map<string, AdminActionDefinition> {
  return ((globalThis as any).__blackarrowAdminActionRegistry ??= new Map<string, AdminActionDefinition>());
}

/**
 * Registers an admin action definition in the centralized registry.
 */
export function registerAdminAction(action: AdminActionDefinition): void {
  getActionRegistryMap().set(action.actionId.toLowerCase().trim(), action);
}

/**
 * Retrieves an action definition from the registry.
 */
export function getAdminAction(actionId: string): AdminActionDefinition | undefined {
  if (!actionId) return undefined;
  const normalized = actionId.toLowerCase().trim();
  const direct = getActionRegistryMap().get(normalized);
  if (direct) return direct;
  if (normalized === "add_faq_knowledge" || normalized === "add_faq") {
    return getActionRegistryMap().get("add_knowledge");
  }
  if (normalized === "set_ai_reply_enabled") {
    return getActionRegistryMap().get("enable_ai_chat_replies");
  }
  return undefined;
}

/**
 * Lists all registered admin actions.
 */
export function listAdminActions(): AdminActionDefinition[] {
  return Array.from(getActionRegistryMap().values());
}

/**
 * Checks if a role is authorized to execute a specific action.
 * Evaluates role hierarchy, action risk level, and channel constraints.
 */
export function canExecuteAdminBusinessAction(input: {
  role: string;
  action: AdminActionDefinition | string;
  channel?: "whatsapp" | "dashboard";
}): { allowed: boolean; reason?: string; action?: AdminActionDefinition } {
  const actionDef = typeof input.action === "string" ? getAdminAction(input.action) : input.action;

  if (!actionDef) {
    return {
      allowed: false,
      reason: "unregistered_action_denied",
    };
  }

  const role = String(input.role || "member").toLowerCase().trim();
  const channel = input.channel || "whatsapp";

  // 1. Channel constraint: CRITICAL actions or dashboard-only actions are blocked on WhatsApp
  if (channel === "whatsapp") {
    if (actionDef.riskLevel === "CRITICAL" || actionDef.isDashboardOnly) {
      return {
        allowed: false,
        reason: "critical_action_dashboard_only",
        action: actionDef,
      };
    }
  }

  // 2. Role hierarchy validation
  // owner > admin > manager > member
  const roleHierarchy: Record<string, number> = {
    super_admin: 100,
    owner: 100,
    admin: 80,
    manager: 60,
    member: 20,
    agent: 20,
    viewer: 10,
  };

  const userLevel = roleHierarchy[role] || 0;
  const requiredLevel = roleHierarchy[actionDef.requiredRole] || 80;

  if (userLevel < requiredLevel) {
    return {
      allowed: false,
      reason: "insufficient_role_permission",
      action: actionDef,
    };
  }

  return {
    allowed: true,
    action: actionDef,
  };
}

import * as readHandlers from "./admin-business-read-service.ts";
import * as writeHandlers from "./admin-business-write-service.ts";
import * as aiContentHandlers from "./admin-ai-content-write-service.ts";
import * as campaignHandlers from "./admin-campaign-write-service.ts";
import * as opsHandlers from "./admin-operations-service.ts";
import * as proactiveHandlers from "./admin-proactive-service.ts";
import * as reminderHandlers from "./admin-reminder-service.ts";
import * as owner360Service from "./owner360-service.ts";

// ---------------------------------------------------------------------------
// Register Foundational Actions (Prompt 1 baseline)
// ---------------------------------------------------------------------------

registerAdminAction({
  actionId: "get_admin_status",
  category: "system",
  label: "Get Admin Status",
  description: "Returns the current admin business assistant status and instance configuration.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_status_viewed",
  handler: async (context) => {
    return {
      success: true,
      message: `Admin Assistant active for account ${context.accountId.slice(0, 8)}... (Role: ${context.adminRole})`,
      data: {
        accountId: context.accountId,
        role: context.adminRole,
        mode: context.mode,
      },
    };
  },
});

registerAdminAction({
  actionId: "get_assistant_capabilities",
  category: "account",
  label: "Get Assistant Capabilities",
  description: "Dynamically returns active system capabilities and connection status for business automation and personal assistant. Use when user asks what the assistant can do.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "assistant_capabilities_viewed",
  handler: async (context) => {
    return {
      success: true,
      message:
        `🤖 *Business Assistant*\n\n` +
        `I can help manage and check your BlackArrow business directly from WhatsApp.\n\n` +
        `📊 *Business & Reports*\n` +
        `• Sales, revenue and performance\n` +
        `• Orders and business summaries\n\n` +
        `👥 *Customers*\n` +
        `• Search customers\n` +
        `• Check recent activity\n` +
        `• View customer information\n\n` +
        `📦 *Products & Services*\n` +
        `• View catalog\n` +
        `• Create/update supported items\n\n` +
        `💳 *Billing*\n` +
        `• Wallet balance\n` +
        `• Usage and spending\n\n` +
        `⏰ *Reminders & Operations*\n` +
        `• Create/manage reminders\n` +
        `• Check bot and business status\n` +
        `• Personal WhatsApp messaging to contacts and direct numbers\n\n` +
        `Ask me anything naturally, e.g. *"What is my wallet balance?"* or *"How many orders today?"*.`,
      data: { capabilitiesChecked: true },
    };
  },
});

registerAdminAction({
  actionId: "test_safe_action",
  category: "test",
  label: "Test Safe Action",
  description: "Test safe write action with no financial or destructive implications.",
  riskLevel: "SAFE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_test_safe_action_executed",
  handler: async (_context, params) => {
    return {
      success: true,
      message: `Safe action executed successfully with input: ${JSON.stringify(params || {})}`,
      data: params,
    };
  },
});

registerAdminAction({
  actionId: "test_sensitive_action",
  category: "test",
  label: "Test Sensitive Action",
  description: "Test sensitive action requiring explicit admin confirmation before execution.",
  riskLevel: "SENSITIVE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: true,
  idempotent: true,
  auditEventType: "admin_test_sensitive_action_executed",
  handler: async (_context, params) => {
    return {
      success: true,
      message: `Sensitive action executed successfully after confirmation with params: ${JSON.stringify(params || {})}`,
      data: params,
    };
  },
});

registerAdminAction({
  actionId: "delete_instance",
  category: "destructive",
  label: "Delete WhatsApp Instance",
  description: "Destructive action: Deletes a connected WhatsApp instance.",
  riskLevel: "CRITICAL",
  requiredRole: "owner",
  requiresConfirmation: true,
  isDashboardOnly: true,
  idempotent: true,
  auditEventType: "admin_instance_deleted",
});

// ---------------------------------------------------------------------------
// Prompt 2: Business & Performance Read Actions
// ---------------------------------------------------------------------------

registerAdminAction({
  actionId: "get_business_overview",
  category: "business",
  label: "Get Business Overview",
  description: "Returns summary of today's business performance, orders, revenue, and attention items.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_business_overview_viewed",
  handler: readHandlers.handleGetBusinessOverview,
});

registerAdminAction({
  actionId: "get_today_business_summary",
  category: "business",
  label: "Get Today Business Summary",
  description: "Returns today's orders, revenue, customer leads, and active bots.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_today_summary_viewed",
  handler: readHandlers.handleGetTodayBusinessSummary,
});

registerAdminAction({
  actionId: "get_business_metrics",
  category: "business",
  label: "Get Business Metrics",
  description: "Returns business performance metrics for a specified time range.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_business_metrics_viewed",
  handler: readHandlers.handleGetBusinessMetrics,
});

registerAdminAction({
  actionId: "get_attention_items",
  category: "business",
  label: "Get Attention Items",
  description: "Lists urgent items requiring admin attention (disconnected bots, low stock, pending orders).",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_attention_items_viewed",
  handler: readHandlers.handleGetAttentionItems,
});

registerAdminAction({
  actionId: "get_business_profile_summary",
  category: "business",
  label: "Get Business Profile Summary",
  description: "Returns high-level business profile, plan, wallet, bot, product count, and integration configuration facts.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_business_profile_viewed",
  handler: readHandlers.handleGetBusinessProfileSummary,
});

// ---------------------------------------------------------------------------
// Account & Billing Read Actions
// ---------------------------------------------------------------------------

registerAdminAction({
  actionId: "get_account_status",
  category: "account",
  label: "Get Account Status",
  description: "Returns BlackArrow account plan, status, wallet balance, and bot counts.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_account_status_viewed",
  handler: readHandlers.handleGetAccountStatus,
});

registerAdminAction({
  actionId: "get_plan_status",
  category: "account",
  label: "Get Plan Status",
  description: "Returns subscription plan details, renewal date, and entitlement limits.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_plan_status_viewed",
  handler: readHandlers.handleGetPlanStatus,
});

registerAdminAction({
  actionId: "get_wallet_balance",
  category: "account",
  label: "Get Wallet Balance",
  description: "Returns current wallet credit balance and recent transactions.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_wallet_balance_viewed",
  handler: readHandlers.handleGetWalletBalance,
});

registerAdminAction({
  actionId: "get_usage_summary",
  category: "account",
  label: "Get Usage Summary",
  description: "Returns summary of billable usage across AI replies, voice, and assistant messages.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_usage_summary_viewed",
  handler: readHandlers.handleGetUsageSummary,
});

// ---------------------------------------------------------------------------
// WhatsApp & Instance Read Actions
// ---------------------------------------------------------------------------

registerAdminAction({
  actionId: "list_instances",
  category: "whatsapp",
  label: "List WhatsApp Instances",
  description: "Lists all connected and configured WhatsApp bot instances.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_instances_listed",
  handler: readHandlers.handleListInstances,
});

registerAdminAction({
  actionId: "get_instance_status",
  category: "whatsapp",
  label: "Get Instance Status",
  description: "Returns connection status and configuration for a WhatsApp bot instance.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_instance_status_viewed",
  handler: readHandlers.handleGetInstanceStatus,
});

registerAdminAction({
  actionId: "get_selected_instance_status",
  category: "whatsapp",
  label: "Get Selected Instance Status",
  description: "Returns status of the active instance.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_selected_instance_status_viewed",
  handler: readHandlers.handleGetInstanceStatus,
});

registerAdminAction({
  actionId: "get_ai_reply_status",
  category: "whatsapp",
  label: "Get AI Reply Status",
  description: "Returns whether AI chat replies are active and model configuration.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_ai_reply_status_viewed",
  handler: readHandlers.handleGetAiReplyStatus,
});

registerAdminAction({
  actionId: "get_connection_health",
  category: "whatsapp",
  label: "Get Connection Health",
  description: "Returns socket connection and proxy health information.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_connection_health_viewed",
  handler: readHandlers.handleGetConnectionHealth,
});

// ---------------------------------------------------------------------------
// Customer Read Actions
// ---------------------------------------------------------------------------

registerAdminAction({
  actionId: "search_customers",
  category: "customers",
  label: "Search Customers",
  description: "Searches customer profiles by name, phone, or tags.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_customers_searched",
  handler: readHandlers.handleSearchCustomers,
});

registerAdminAction({
  actionId: "get_customer",
  category: "customers",
  label: "Get Customer Details",
  description: "Returns detailed customer profile and contact notes.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_customer_viewed",
  handler: readHandlers.handleGetCustomer,
});

registerAdminAction({
  actionId: "get_customer_summary",
  category: "customers",
  label: "Get Customer Summary",
  description: "Returns concise summary of customer history and preferences.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_customer_summary_viewed",
  handler: readHandlers.handleGetCustomerSummary,
});

registerAdminAction({
  actionId: "get_customer_orders",
  category: "customers",
  label: "Get Customer Orders",
  description: "Returns order history for a specific customer.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_customer_orders_viewed",
  handler: readHandlers.handleSearchOrders,
});

registerAdminAction({
  actionId: "get_recent_customers",
  category: "customers",
  label: "Get Recent Customers",
  description: "Lists recently active customer conversations.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_recent_customers_viewed",
  handler: readHandlers.handleGetRecentCustomers,
});

registerAdminAction({
  actionId: "get_customer_activity_summary",
  category: "customers",
  label: "Get Customer Activity Summary",
  description: "Returns count of unique active customers and inbound messages in a given time period.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_customer_activity_viewed",
  handler: readHandlers.handleGetCustomerActivitySummary,
});

registerAdminAction({
  actionId: "get_business_counts_summary",
  category: "analytics",
  label: "Get Business Counts Summary",
  description: "Returns aggregate authoritative totals for customers, catalog items, orders, and order status counts.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_business_counts_viewed",
  handler: readHandlers.handleGetBusinessCountsSummary,
});

// ---------------------------------------------------------------------------
// Order Read Actions
// ---------------------------------------------------------------------------

registerAdminAction({
  actionId: "search_orders",
  category: "orders",
  label: "Search Orders",
  description: "Searches orders by order ID, customer name, or item.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_orders_searched",
  handler: readHandlers.handleSearchOrders,
});

registerAdminAction({
  actionId: "get_order",
  category: "orders",
  label: "Get Order Details",
  description: "Returns complete details for a specific order.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_order_viewed",
  handler: readHandlers.handleGetOrder,
});

registerAdminAction({
  actionId: "list_recent_orders",
  category: "orders",
  label: "List Recent Orders",
  description: "Lists most recent customer orders.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_recent_orders_listed",
  handler: readHandlers.handleListRecentOrders,
});

registerAdminAction({
  actionId: "list_pending_orders",
  category: "orders",
  label: "List Pending Orders",
  description: "Lists orders awaiting confirmation or fulfillment.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_pending_orders_listed",
  handler: readHandlers.handleListPendingOrders,
});

registerAdminAction({
  actionId: "get_order_counts",
  category: "orders",
  label: "Get Order Counts",
  description: "Returns breakdown of orders by status.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_order_counts_viewed",
  handler: readHandlers.handleGetOrderCounts,
});

registerAdminAction({
  actionId: "get_order_summary",
  category: "orders",
  label: "Get Order Summary",
  description: "Returns aggregated revenue and order metrics.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_order_summary_viewed",
  handler: readHandlers.handleGetBusinessMetrics,
});

registerAdminAction({
  actionId: "get_courier_tracking_status",
  category: "orders",
  label: "Get Courier Tracking Status",
  description: "Checks delivery status for courier shipments.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_courier_tracking_viewed",
  handler: readHandlers.handleGetCourierTrackingStatus,
});

// ---------------------------------------------------------------------------
// Products & Stock Read Actions
// ---------------------------------------------------------------------------

registerAdminAction({
  actionId: "search_products",
  category: "products",
  label: "Search Products",
  description: "Searches product catalog by name, SKU, or description.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_products_searched",
  handler: readHandlers.handleSearchProducts,
});

registerAdminAction({
  actionId: "get_product",
  category: "products",
  label: "Get Product Details",
  description: "Returns detailed product information, price, and stock.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_product_viewed",
  handler: readHandlers.handleGetProduct,
});

registerAdminAction({
  actionId: "list_products",
  category: "products",
  label: "List Products",
  description: "Lists active catalog products.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_products_listed",
  handler: readHandlers.handleListProducts,
});

registerAdminAction({
  actionId: "get_product_stock",
  category: "products",
  label: "Get Product Stock",
  description: "Returns stock levels for products or variations.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_product_stock_viewed",
  handler: readHandlers.handleGetProductStock,
});

registerAdminAction({
  actionId: "list_low_stock_products",
  category: "products",
  label: "List Low Stock Products",
  description: "Lists products that are running low on inventory.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_low_stock_listed",
  handler: readHandlers.handleListLowStockProducts,
});

registerAdminAction({
  actionId: "list_unavailable_products",
  category: "products",
  label: "List Out of Stock Products",
  description: "Lists products that are out of stock.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_unavailable_products_listed",
  handler: readHandlers.handleListUnavailableProducts,
});

// ---------------------------------------------------------------------------
// Follow-ups, Broadcasts, Customer Updates Read Actions
// ---------------------------------------------------------------------------

registerAdminAction({
  actionId: "list_followups",
  category: "followups",
  label: "List Follow-ups",
  description: "Lists configured follow-up sequences and campaigns.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_followups_listed",
  handler: readHandlers.handleListFollowups,
});

registerAdminAction({
  actionId: "get_followup",
  category: "followups",
  label: "Get Follow-up Details",
  description: "Returns detail of a follow-up campaign.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_followup_viewed",
  handler: readHandlers.handleListFollowups,
});

registerAdminAction({
  actionId: "get_followup_status_summary",
  category: "followups",
  label: "Get Follow-up Status Summary",
  description: "Returns statistics on follow-up automation delivery.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_followup_summary_viewed",
  handler: readHandlers.handleGetFollowupStatusSummary,
});

registerAdminAction({
  actionId: "list_broadcasts",
  category: "broadcasts",
  label: "List Broadcasts",
  description: "Lists broadcast campaigns and recent sends.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_broadcasts_listed",
  handler: readHandlers.handleListBroadcasts,
});

registerAdminAction({
  actionId: "get_broadcast",
  category: "broadcasts",
  label: "Get Broadcast Details",
  description: "Returns detail of a broadcast campaign.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_broadcast_viewed",
  handler: readHandlers.handleListBroadcasts,
});

registerAdminAction({
  actionId: "get_broadcast_status_summary",
  category: "broadcasts",
  label: "Get Broadcast Status Summary",
  description: "Returns statistics on broadcast campaign delivery.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_broadcast_summary_viewed",
  handler: readHandlers.handleGetBroadcastStatusSummary,
});

registerAdminAction({
  actionId: "list_customer_updates",
  category: "customer_updates",
  label: "List Customer Updates",
  description: "Lists planned scheduled customer notification updates.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_customer_updates_listed",
  handler: readHandlers.handleListCustomerUpdates,
});

registerAdminAction({
  actionId: "get_customer_update",
  category: "customer_updates",
  label: "Get Customer Update",
  description: "Returns detail of a scheduled customer update.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_customer_update_viewed",
  handler: readHandlers.handleListCustomerUpdates,
});

registerAdminAction({
  actionId: "get_customer_update_status_summary",
  category: "customer_updates",
  label: "Get Customer Update Status Summary",
  description: "Returns summary of customer update notifications.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_customer_update_summary_viewed",
  handler: readHandlers.handleGetCustomerUpdateStatusSummary,
});

// ---------------------------------------------------------------------------
// Integrations Read Actions
// ---------------------------------------------------------------------------

registerAdminAction({
  actionId: "get_integrations_status",
  category: "integrations",
  label: "Get Integrations Status",
  description: "Returns status overview of active integrations (WooCommerce, PostEx, Leopards, Webhooks).",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_integrations_viewed",
  handler: readHandlers.handleGetIntegrationsStatus,
});

registerAdminAction({
  actionId: "get_woocommerce_status",
  category: "integrations",
  label: "Get WooCommerce Status",
  description: "Returns WooCommerce store connection and sync status.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_woocommerce_status_viewed",
  handler: readHandlers.handleGetWooCommerceStatus,
});

registerAdminAction({
  actionId: "get_postex_status",
  category: "integrations",
  label: "Get PostEx Status",
  description: "Returns PostEx courier connection status.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_postex_status_viewed",
  handler: readHandlers.handleGetPostExStatus,
});

registerAdminAction({
  actionId: "get_leopards_status",
  category: "integrations",
  label: "Get Leopards Status",
  description: "Returns Leopards courier connection status.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_leopards_status_viewed",
  handler: readHandlers.handleGetLeopardsStatus,
});

registerAdminAction({
  actionId: "get_website_lead_integration_status",
  category: "integrations",
  label: "Get Website Lead Integration Status",
  description: "Returns Website Lead capture API status.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_website_lead_status_viewed",
  handler: readHandlers.handleGetWebsiteLeadIntegrationStatus,
});

registerAdminAction({
  actionId: "get_public_api_status",
  category: "integrations",
  label: "Get Public API Status",
  description: "Returns Public REST API integration status.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_public_api_status_viewed",
  handler: readHandlers.handleGetPublicApiStatus,
});

registerAdminAction({
  actionId: "get_webhook_status",
  category: "integrations",
  label: "Get Webhook Status",
  description: "Returns Webhook delivery and subscription status.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_webhook_status_viewed",
  handler: readHandlers.handleGetWebhookStatus,
});

registerAdminAction({
  actionId: "get_recent_integration_errors",
  category: "integrations",
  label: "Get Recent Integration Errors",
  description: "Returns recent integration error events if any.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_integration_errors_viewed",
  handler: readHandlers.handleGetRecentIntegrationErrors,
});

// ---------------------------------------------------------------------------
// Live Monitor & Diagnostics Read Actions
// ---------------------------------------------------------------------------

registerAdminAction({
  actionId: "get_recent_safe_events",
  category: "live_monitor",
  label: "Get Recent Safe Events",
  description: "Returns sanitized live monitor telemetry events.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_live_events_viewed",
  handler: readHandlers.handleGetRecentSafeEvents,
});

registerAdminAction({
  actionId: "get_recent_ai_decisions",
  category: "live_monitor",
  label: "Get Recent AI Decisions",
  description: "Returns recent AI routing decisions and tool choices.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_ai_decisions_viewed",
  handler: readHandlers.handleGetRecentAiDecisions,
});

registerAdminAction({
  actionId: "get_recent_blocked_reasons",
  category: "live_monitor",
  label: "Get Recent Blocked Reasons",
  description: "Returns summary of blocked messages (safety, wallet limits).",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_blocked_reasons_viewed",
  handler: readHandlers.handleGetRecentBlockedReasons,
});

registerAdminAction({
  actionId: "get_recent_operational_errors",
  category: "live_monitor",
  label: "Get Recent Operational Errors",
  description: "Returns recent operational and system health errors.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_operational_errors_viewed",
  handler: readHandlers.handleGetRecentOperationalErrors,
});

// ---------------------------------------------------------------------------
// Reports Read Actions
// ---------------------------------------------------------------------------

registerAdminAction({
  actionId: "get_performance_summary",
  category: "reports",
  label: "Get Performance Summary",
  description: "Returns performance overview for specified date range.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_performance_report_viewed",
  handler: readHandlers.handleGetPerformanceSummary,
});

registerAdminAction({
  actionId: "get_usage_report",
  category: "reports",
  label: "Get Usage Report",
  description: "Returns detailed usage analytics report.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_usage_report_viewed",
  handler: readHandlers.handleGetUsageReport,
});

registerAdminAction({
  actionId: "get_order_performance",
  category: "reports",
  label: "Get Order Performance",
  description: "Returns order and sales velocity metrics.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_order_performance_viewed",
  handler: readHandlers.handleGetOrderPerformance,
});

registerAdminAction({
  actionId: "get_customer_activity_report",
  category: "reports",
  label: "Get Customer Activity Report",
  description: "Returns customer lead activity report.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_customer_report_viewed",
  handler: readHandlers.handleGetCustomerActivityReport,
});

// ---------------------------------------------------------------------------
// Team & Security Read Actions
// ---------------------------------------------------------------------------

registerAdminAction({
  actionId: "get_team_summary",
  category: "team",
  label: "Get Team Summary",
  description: "Returns team member counts and roles.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_team_summary_viewed",
  handler: readHandlers.handleGetTeamSummary,
});

registerAdminAction({
  actionId: "get_active_session_summary",
  category: "security",
  label: "Get Active Session Summary",
  description: "Returns active login sessions count.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_sessions_viewed",
  handler: readHandlers.handleGetActiveSessionSummary,
});

registerAdminAction({
  actionId: "get_2fa_status",
  category: "security",
  label: "Get 2FA Status",
  description: "Returns Two-Factor Authentication security status.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_2fa_status_viewed",
  handler: readHandlers.handleGet2faStatus,
});

// ---------------------------------------------------------------------------
// PROMPT 3: CUSTOMER WRITE ACTIONS
// ---------------------------------------------------------------------------

registerAdminAction({
  actionId: "create_customer",
  category: "customers",
  label: "Create Customer",
  description: "Creates a new customer profile with name, phone, address, and notes.",
  riskLevel: "SAFE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: false,
  auditEventType: "admin_customer_created",
  handler: writeHandlers.handleCreateCustomer,
});

registerAdminAction({
  actionId: "update_customer_details",
  category: "customers",
  label: "Update Customer Details",
  description: "Updates customer name, delivery address, city, or phone identity.",
  riskLevel: "SENSITIVE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: true,
  idempotent: true,
  auditEventType: "admin_customer_details_updated",
  handler: writeHandlers.handleUpdateCustomerDetails,
});

registerAdminAction({
  actionId: "add_customer_note",
  category: "customers",
  label: "Add Customer Note",
  description: "Appends an internal business note to a customer profile.",
  riskLevel: "SAFE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: false,
  auditEventType: "admin_customer_note_added",
  handler: writeHandlers.handleAddCustomerNote,
});

registerAdminAction({
  actionId: "update_customer_note",
  category: "customers",
  label: "Update Customer Note",
  description: "Updates or adds a customer note.",
  riskLevel: "SAFE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: false,
  auditEventType: "admin_customer_note_updated",
  handler: writeHandlers.handleUpdateCustomerNote,
});

registerAdminAction({
  actionId: "set_customer_custom_field",
  category: "customers",
  label: "Set Customer Custom Field",
  description: "Sets a custom key-value field on a customer profile.",
  riskLevel: "SAFE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_customer_custom_field_set",
  handler: writeHandlers.handleSetCustomerCustomField,
});

registerAdminAction({
  actionId: "set_customer_tag",
  category: "customers",
  label: "Set Customer Tag",
  description: "Adds an internal business tag to a customer profile.",
  riskLevel: "SAFE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_customer_tag_set",
  handler: writeHandlers.handleSetCustomerTag,
});

registerAdminAction({
  actionId: "remove_customer_tag",
  category: "customers",
  label: "Remove Customer Tag",
  description: "Removes an internal business tag from a customer profile.",
  riskLevel: "SAFE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_customer_tag_removed",
  handler: writeHandlers.handleRemoveCustomerTag,
});

registerAdminAction({
  actionId: "delete_customer",
  category: "customers",
  label: "Delete Customer",
  description: "Permanent customer deletion (Dashboard only).",
  riskLevel: "CRITICAL",
  requiredRole: "owner",
  requiresConfirmation: true,
  isDashboardOnly: true,
  idempotent: true,
  auditEventType: "admin_customer_deleted",
  handler: writeHandlers.handleDeleteCustomer,
});

// ---------------------------------------------------------------------------
// PROMPT 3: ORDER WRITE ACTIONS
// ---------------------------------------------------------------------------

registerAdminAction({
  actionId: "create_order",
  category: "orders",
  label: "Create Order",
  description: "Creates a manual order with customer details, products, canonical pricing, and address.",
  riskLevel: "SENSITIVE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: true,
  idempotent: false,
  auditEventType: "admin_order_created",
  handler: writeHandlers.handleCreateOrder,
});

registerAdminAction({
  actionId: "update_order_details",
  category: "orders",
  label: "Update Order Details",
  description: "Updates delivery address, city, or transaction notes on an order.",
  riskLevel: "SENSITIVE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: true,
  idempotent: true,
  auditEventType: "admin_order_details_updated",
  handler: writeHandlers.handleUpdateOrderDetails,
});

registerAdminAction({
  actionId: "update_order_status",
  category: "orders",
  label: "Update Order Status",
  description: "Updates order status (e.g. confirmed, processing, shipped, delivered, cancelled).",
  riskLevel: "SENSITIVE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: true,
  idempotent: true,
  auditEventType: "admin_order_status_updated",
  handler: writeHandlers.handleUpdateOrderStatus,
});

registerAdminAction({
  actionId: "cancel_order",
  category: "orders",
  label: "Cancel Order",
  description: "Cancels an active order with confirmation.",
  riskLevel: "SENSITIVE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: true,
  idempotent: true,
  auditEventType: "admin_order_cancelled",
  handler: writeHandlers.handleCancelOrder,
});

registerAdminAction({
  actionId: "update_order_items",
  category: "orders",
  label: "Update Order Items",
  description: "Updates items, quantity, or price of an existing order.",
  riskLevel: "SENSITIVE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: true,
  idempotent: true,
  auditEventType: "admin_order_items_updated",
  handler: writeHandlers.handleUpdateOrderItems,
});

registerAdminAction({
  actionId: "delete_order",
  category: "orders",
  label: "Delete Order",
  description: "Permanent order deletion (Dashboard only).",
  riskLevel: "CRITICAL",
  requiredRole: "owner",
  requiresConfirmation: true,
  isDashboardOnly: true,
  idempotent: true,
  auditEventType: "admin_order_deleted",
  handler: writeHandlers.handleDeleteOrder,
});

// ---------------------------------------------------------------------------
// PROMPT 3: COURIER BOOKING ACTIONS
// ---------------------------------------------------------------------------

registerAdminAction({
  actionId: "book_courier_shipment",
  category: "courier",
  label: "Book Courier Shipment",
  description: "Books courier booking (PostEx / Leopards) for an existing order with idempotency.",
  riskLevel: "SENSITIVE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: true,
  idempotent: true,
  auditEventType: "admin_courier_booked",
  handler: writeHandlers.handleBookCourierShipment,
});

registerAdminAction({
  actionId: "book_postex_order",
  category: "courier",
  label: "Book PostEx Order",
  description: "Books PostEx shipment for an existing order with idempotency.",
  riskLevel: "SENSITIVE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: true,
  idempotent: true,
  auditEventType: "admin_postex_booked",
  handler: writeHandlers.handleBookCourierShipment,
});

registerAdminAction({
  actionId: "book_leopards_order",
  category: "courier",
  label: "Book Leopards Order",
  description: "Books Leopards shipment for an existing order with idempotency.",
  riskLevel: "SENSITIVE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: true,
  idempotent: true,
  auditEventType: "admin_leopards_booked",
  handler: writeHandlers.handleBookCourierShipment,
});

// ---------------------------------------------------------------------------
// PROMPT 3: PRODUCT WRITE ACTIONS
// ---------------------------------------------------------------------------

registerAdminAction({
  actionId: "create_product",
  category: "products",
  label: "Create Product",
  description: "Creates a new product with price, stock, description, and SKU.",
  riskLevel: "SAFE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: false,
  auditEventType: "admin_product_created",
  handler: writeHandlers.handleCreateProduct,
});

registerAdminAction({
  actionId: "update_product",
  category: "products",
  label: "Update Product",
  description: "Updates product details, description, or configuration.",
  riskLevel: "SAFE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_product_updated",
  handler: writeHandlers.handleUpdateProductDescription,
});

registerAdminAction({
  actionId: "update_product_description",
  category: "products",
  label: "Update Product Description",
  description: "Updates a product's description text.",
  riskLevel: "SAFE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_product_description_updated",
  handler: writeHandlers.handleUpdateProductDescription,
});

registerAdminAction({
  actionId: "update_product_price",
  category: "products",
  label: "Update Product Price",
  description: "Updates product base price with confirmation and preview.",
  riskLevel: "SENSITIVE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: true,
  idempotent: true,
  auditEventType: "admin_product_price_updated",
  handler: writeHandlers.handleUpdateProductPrice,
});

registerAdminAction({
  actionId: "update_product_stock",
  category: "products",
  label: "Update Product Stock",
  description: "Sets or adjusts product inventory stock with confirmation.",
  riskLevel: "SENSITIVE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: true,
  idempotent: true,
  auditEventType: "admin_product_stock_updated",
  handler: writeHandlers.handleUpdateProductStock,
});

registerAdminAction({
  actionId: "update_product_availability",
  category: "products",
  label: "Update Product Availability",
  description: "Enables or disables product availability / in-stock status.",
  riskLevel: "SENSITIVE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: true,
  idempotent: true,
  auditEventType: "admin_product_availability_updated",
  handler: writeHandlers.handleUpdateProductAvailability,
});

registerAdminAction({
  actionId: "update_product_type",
  category: "products",
  label: "Update Product Type",
  description: "Updates catalog item type between physical, service, and digital (supports single product or bulk conversion with preview).",
  riskLevel: "SENSITIVE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: true,
  idempotent: true,
  auditEventType: "admin_product_type_updated",
  handler: writeHandlers.handleUpdateProductType,
});

registerAdminAction({
  actionId: "add_product_variation",
  category: "products",
  label: "Add Product Variation",
  description: "Adds or updates a product variation (e.g. Size, Color).",
  riskLevel: "SENSITIVE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: true,
  idempotent: true,
  auditEventType: "admin_product_variation_added",
  handler: writeHandlers.handleAddProductVariation,
});

registerAdminAction({
  actionId: "update_product_variation",
  category: "products",
  label: "Update Product Variation",
  description: "Updates an existing product variation.",
  riskLevel: "SENSITIVE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: true,
  idempotent: true,
  auditEventType: "admin_product_variation_updated",
  handler: writeHandlers.handleAddProductVariation,
});

registerAdminAction({
  actionId: "remove_product_variation",
  category: "products",
  label: "Remove Product Variation",
  description: "Removes a product variation with confirmation.",
  riskLevel: "SENSITIVE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: true,
  idempotent: true,
  auditEventType: "admin_product_variation_removed",
  handler: writeHandlers.handleRemoveProductVariation,
});

registerAdminAction({
  actionId: "delete_product",
  category: "products",
  label: "Delete Product",
  description: "Permanent product deletion (Dashboard only).",
  riskLevel: "CRITICAL",
  requiredRole: "owner",
  requiresConfirmation: true,
  isDashboardOnly: true,
  idempotent: true,
  auditEventType: "admin_product_deleted",
  handler: writeHandlers.handleDeleteProduct,
});

// ---------------------------------------------------------------------------
// Register AI Studio, Knowledge, Media, Saved Replies, Sequences & Welcome (Prompt 4)
// ---------------------------------------------------------------------------

// 1. AI Chat Replies Control
registerAdminAction({
  actionId: "get_ai_chat_reply_status",
  category: "ai_studio",
  label: "Get AI Chat Reply Status",
  description: "Queries current status of automated AI WhatsApp replies.",
  riskLevel: "READ",
  requiredRole: "manager",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_ai_status_viewed",
  handler: aiContentHandlers.handleGetAiChatReplyStatus,
});

registerAdminAction({
  actionId: "enable_ai_chat_replies",
  category: "ai_studio",
  label: "Enable AI Chat Replies",
  description: "Turns ON automatic AI responses for incoming customer messages.",
  riskLevel: "SENSITIVE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: true,
  idempotent: true,
  auditEventType: "admin_ai_chat_replies_enabled",
  handler: aiContentHandlers.handleEnableAiChatReplies,
});

registerAdminAction({
  actionId: "disable_ai_chat_replies",
  category: "ai_studio",
  label: "Disable AI Chat Replies",
  description: "Pauses automatic AI responses for incoming customer messages.",
  riskLevel: "SENSITIVE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: true,
  idempotent: true,
  auditEventType: "admin_ai_chat_replies_disabled",
  handler: aiContentHandlers.handleDisableAiChatReplies,
});

// 2. Bot Identity & Settings
registerAdminAction({
  actionId: "get_ai_settings",
  category: "ai_studio",
  label: "Get AI Settings",
  description: "Gets bot name, language, business type, and basic settings.",
  riskLevel: "READ",
  requiredRole: "manager",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_ai_settings_viewed",
  handler: aiContentHandlers.handleGetAiSettings,
});

registerAdminAction({
  actionId: "update_bot_name",
  category: "ai_studio",
  label: "Update Bot Name",
  description: "Updates the display name of the AI bot.",
  riskLevel: "SAFE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_bot_name_updated",
  handler: aiContentHandlers.handleUpdateBotName,
});

registerAdminAction({
  actionId: "update_ai_language",
  category: "ai_studio",
  label: "Update AI Language",
  description: "Updates the preferred conversational language of the bot.",
  riskLevel: "SAFE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_ai_language_updated",
  handler: aiContentHandlers.handleUpdateAiLanguage,
});

registerAdminAction({
  actionId: "update_business_type",
  category: "ai_studio",
  label: "Update Business Type",
  description: "Updates the business category/niche.",
  riskLevel: "SAFE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_business_type_updated",
  handler: aiContentHandlers.handleUpdateBusinessType,
});

registerAdminAction({
  actionId: "update_ai_basic_settings",
  category: "ai_studio",
  label: "Update AI Basic Settings",
  description: "Updates multiple basic AI settings simultaneously.",
  riskLevel: "SAFE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_ai_basic_settings_updated",
  handler: aiContentHandlers.handleUpdateAiBasicSettings,
});

// 3. Shared AI Instructions
registerAdminAction({
  actionId: "get_shared_ai_instructions",
  category: "ai_studio",
  label: "Get Shared AI Instructions",
  description: "Retrieves authored system prompt / shared AI instructions.",
  riskLevel: "READ",
  requiredRole: "manager",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_ai_instructions_viewed",
  handler: aiContentHandlers.handleGetSharedAiInstructions,
});

registerAdminAction({
  actionId: "append_ai_instruction",
  category: "ai_studio",
  label: "Append AI Instruction",
  description: "Appends a new instruction/guideline to bot training.",
  riskLevel: "SAFE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: false,
  auditEventType: "admin_ai_instruction_appended",
  handler: aiContentHandlers.handleAppendAiInstruction,
});

registerAdminAction({
  actionId: "update_ai_instruction",
  category: "ai_studio",
  label: "Update AI Instruction",
  description: "Updates a specific rule in shared AI instructions.",
  riskLevel: "SAFE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_ai_instruction_updated",
  handler: aiContentHandlers.handleUpdateAiInstruction,
});

registerAdminAction({
  actionId: "remove_ai_instruction",
  category: "ai_studio",
  label: "Remove AI Instruction",
  description: "Removes a specific rule from shared AI instructions.",
  riskLevel: "SENSITIVE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: true,
  idempotent: true,
  auditEventType: "admin_ai_instruction_removed",
  handler: aiContentHandlers.handleRemoveAiInstruction,
});

registerAdminAction({
  actionId: "replace_shared_ai_instructions",
  category: "ai_studio",
  label: "Replace Shared AI Instructions",
  description: "Replaces full authored AI instructions with confirmation.",
  riskLevel: "SENSITIVE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: true,
  idempotent: true,
  auditEventType: "admin_ai_instructions_replaced",
  handler: aiContentHandlers.handleReplaceSharedAiInstructions,
});

// 4. Learned Knowledge
registerAdminAction({
  actionId: "search_knowledge",
  category: "knowledge",
  label: "Search Learned Knowledge",
  description: "Searches learned knowledge facts stored by the bot.",
  riskLevel: "READ",
  requiredRole: "manager",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_knowledge_searched",
  handler: aiContentHandlers.handleSearchKnowledge,
});

registerAdminAction({
  actionId: "get_knowledge",
  category: "knowledge",
  label: "Get Knowledge",
  description: "Gets learned knowledge facts.",
  riskLevel: "READ",
  requiredRole: "manager",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_knowledge_viewed",
  handler: aiContentHandlers.handleSearchKnowledge,
});

registerAdminAction({
  actionId: "add_knowledge",
  category: "knowledge",
  label: "Add Learned Knowledge",
  description: "Adds a new learned knowledge fact to the bot.",
  riskLevel: "SAFE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: false,
  auditEventType: "admin_knowledge_added",
  handler: aiContentHandlers.handleAddKnowledge,
});

registerAdminAction({
  actionId: "update_knowledge",
  category: "knowledge",
  label: "Update Learned Knowledge",
  description: "Updates a learned knowledge fact.",
  riskLevel: "SAFE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_knowledge_updated",
  handler: aiContentHandlers.handleUpdateKnowledge,
});

registerAdminAction({
  actionId: "remove_knowledge",
  category: "knowledge",
  label: "Remove Learned Knowledge",
  description: "Removes a learned knowledge fact with confirmation.",
  riskLevel: "SENSITIVE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: true,
  idempotent: true,
  auditEventType: "admin_knowledge_removed",
  handler: aiContentHandlers.handleRemoveKnowledge,
});

// 5. Confirmation Fields
registerAdminAction({
  actionId: "list_confirmation_fields",
  category: "confirmation_fields",
  label: "List Confirmation Fields",
  description: "Lists configured order confirmation / customer details fields.",
  riskLevel: "READ",
  requiredRole: "manager",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_confirmation_fields_viewed",
  handler: aiContentHandlers.handleListConfirmationFields,
});

registerAdminAction({
  actionId: "add_confirmation_field",
  category: "confirmation_fields",
  label: "Add Confirmation Field",
  description: "Adds a new customer details / confirmation field.",
  riskLevel: "SAFE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_confirmation_field_added",
  handler: aiContentHandlers.handleAddConfirmationField,
});

registerAdminAction({
  actionId: "set_confirmation_field_required",
  category: "confirmation_fields",
  label: "Set Confirmation Field Required",
  description: "Toggles whether a confirmation field is mandatory for orders.",
  riskLevel: "SENSITIVE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: true,
  idempotent: true,
  auditEventType: "admin_confirmation_field_requirement_updated",
  handler: aiContentHandlers.handleSetConfirmationFieldRequired,
});

registerAdminAction({
  actionId: "disable_confirmation_field",
  category: "confirmation_fields",
  label: "Disable Confirmation Field",
  description: "Removes/disables a custom confirmation field.",
  riskLevel: "SENSITIVE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: true,
  idempotent: true,
  auditEventType: "admin_confirmation_field_disabled",
  handler: aiContentHandlers.handleDisableConfirmationField,
});

// 6. Reply & Multimodal Settings
registerAdminAction({
  actionId: "get_reply_settings",
  category: "reply_settings",
  label: "Get Reply Settings",
  description: "Gets reply mode, voice, image, and call settings.",
  riskLevel: "READ",
  requiredRole: "manager",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_reply_settings_viewed",
  handler: aiContentHandlers.handleGetReplySettings,
});

registerAdminAction({
  actionId: "update_reply_mode",
  category: "reply_settings",
  label: "Update Reply Mode",
  description: "Updates reply mode (always_text, always_voice, customer_preference).",
  riskLevel: "SAFE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_reply_mode_updated",
  handler: aiContentHandlers.handleUpdateReplyMode,
});

registerAdminAction({
  actionId: "enable_voice_understanding",
  category: "reply_settings",
  label: "Enable Voice Understanding",
  description: "Enables automatic transcription & understanding of voice notes.",
  riskLevel: "SAFE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_voice_understanding_enabled",
  handler: (ctx) => aiContentHandlers.handleUpdateVoiceUnderstanding(ctx, { enabled: true }),
});

registerAdminAction({
  actionId: "disable_voice_understanding",
  category: "reply_settings",
  label: "Disable Voice Understanding",
  description: "Disables voice note understanding.",
  riskLevel: "SAFE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_voice_understanding_disabled",
  handler: (ctx) => aiContentHandlers.handleUpdateVoiceUnderstanding(ctx, { enabled: false }),
});

registerAdminAction({
  actionId: "enable_image_understanding",
  category: "reply_settings",
  label: "Enable Image Understanding",
  description: "Enables AI understanding of customer product images and receipts.",
  riskLevel: "SAFE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_image_understanding_enabled",
  handler: (ctx) => aiContentHandlers.handleUpdateImageUnderstanding(ctx, { enabled: true }),
});

registerAdminAction({
  actionId: "disable_image_understanding",
  category: "reply_settings",
  label: "Disable Image Understanding",
  description: "Disables image photo understanding.",
  riskLevel: "SAFE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_image_understanding_disabled",
  handler: (ctx) => aiContentHandlers.handleUpdateImageUnderstanding(ctx, { enabled: false }),
});

registerAdminAction({
  actionId: "update_call_settings",
  category: "reply_settings",
  label: "Update Call Settings",
  description: "Updates incoming WhatsApp call rejection behavior.",
  riskLevel: "SENSITIVE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: true,
  idempotent: true,
  auditEventType: "admin_call_settings_updated",
  handler: aiContentHandlers.handleUpdateCallSettings,
});

registerAdminAction({
  actionId: "update_reply_timing_settings",
  category: "reply_settings",
  label: "Update Reply Timing Settings",
  description: "Updates response delay and typing indicator durations.",
  riskLevel: "SAFE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_reply_timing_updated",
  handler: aiContentHandlers.handleUpdateReplyTimingSettings,
});

// 7. Smart Sales Settings
registerAdminAction({
  actionId: "get_smart_sales_settings",
  category: "smart_sales",
  label: "Get Smart Sales Settings",
  description: "Gets Smart Sales engine activation status and training guidelines.",
  riskLevel: "READ",
  requiredRole: "manager",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_smart_sales_viewed",
  handler: aiContentHandlers.handleGetSmartSalesSettings,
});

registerAdminAction({
  actionId: "enable_smart_sales",
  category: "smart_sales",
  label: "Enable Smart Sales",
  description: "Activates AI Smart Sales objection handling and upselling.",
  riskLevel: "SENSITIVE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: true,
  idempotent: true,
  auditEventType: "admin_smart_sales_enabled",
  handler: aiContentHandlers.handleEnableSmartSales,
});

registerAdminAction({
  actionId: "disable_smart_sales",
  category: "smart_sales",
  label: "Disable Smart Sales",
  description: "Deactivates Smart Sales engine.",
  riskLevel: "SENSITIVE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: true,
  idempotent: true,
  auditEventType: "admin_smart_sales_disabled",
  handler: aiContentHandlers.handleDisableSmartSales,
});

registerAdminAction({
  actionId: "update_smart_sales_training",
  category: "smart_sales",
  label: "Update Smart Sales Training",
  description: "Updates sales objection handling guidelines.",
  riskLevel: "SAFE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_smart_sales_training_updated",
  handler: aiContentHandlers.handleUpdateSmartSalesTraining,
});

// 8. Media & Content Library
registerAdminAction({
  actionId: "list_media",
  category: "media",
  label: "List Media Library",
  description: "Lists stored media files, images, catalogs, and documents.",
  riskLevel: "READ",
  requiredRole: "manager",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_media_viewed",
  handler: aiContentHandlers.handleListMedia,
});

registerAdminAction({
  actionId: "search_media",
  category: "media",
  label: "Search Media Library",
  description: "Searches media assets by keyword or type.",
  riskLevel: "READ",
  requiredRole: "manager",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_media_searched",
  handler: aiContentHandlers.handleListMedia,
});

registerAdminAction({
  actionId: "save_admin_media",
  category: "media",
  label: "Save Admin Media",
  description: "Saves a media asset to the content library.",
  riskLevel: "SAFE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: false,
  auditEventType: "admin_media_saved",
  handler: aiContentHandlers.handleSaveAdminMedia,
});

// 9. Saved Replies
registerAdminAction({
  actionId: "list_saved_replies",
  category: "saved_replies",
  label: "List Saved Replies",
  description: "Lists quick canned replies and shortcuts.",
  riskLevel: "READ",
  requiredRole: "manager",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_saved_replies_viewed",
  handler: aiContentHandlers.handleListSavedReplies,
});

registerAdminAction({
  actionId: "get_saved_reply",
  category: "saved_replies",
  label: "Get Saved Reply",
  description: "Gets detail of a specific saved reply.",
  riskLevel: "READ",
  requiredRole: "manager",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_saved_reply_viewed",
  handler: aiContentHandlers.handleListSavedReplies,
});

registerAdminAction({
  actionId: "create_saved_reply",
  category: "saved_replies",
  label: "Create Saved Reply",
  description: "Creates a quick reply with a shortcut code (e.g. !bank).",
  riskLevel: "SAFE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: false,
  auditEventType: "admin_saved_reply_created",
  handler: aiContentHandlers.handleCreateSavedReply,
});

registerAdminAction({
  actionId: "delete_saved_reply",
  category: "saved_replies",
  label: "Delete Saved Reply",
  description: "Deletes a saved quick reply with confirmation.",
  riskLevel: "SENSITIVE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: true,
  idempotent: true,
  auditEventType: "admin_saved_reply_deleted",
  handler: aiContentHandlers.handleDeleteSavedReply,
});

// 10. Sequences
registerAdminAction({
  actionId: "list_sequences",
  category: "sequences",
  label: "List Sequences",
  description: "Lists multi-step automated sequences.",
  riskLevel: "READ",
  requiredRole: "manager",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_sequences_viewed",
  handler: aiContentHandlers.handleListSequences,
});

registerAdminAction({
  actionId: "get_sequence",
  category: "sequences",
  label: "Get Sequence Details",
  description: "Gets detailed step-by-step messages for a sequence.",
  riskLevel: "READ",
  requiredRole: "manager",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_sequence_viewed",
  handler: aiContentHandlers.handleGetSequence,
});

registerAdminAction({
  actionId: "create_sequence",
  category: "sequences",
  label: "Create Sequence",
  description: "Creates a new multi-step message sequence.",
  riskLevel: "SAFE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: false,
  auditEventType: "admin_sequence_created",
  handler: aiContentHandlers.handleCreateSequence,
});

registerAdminAction({
  actionId: "add_sequence_step",
  category: "sequences",
  label: "Add Sequence Step",
  description: "Adds a step to an existing sequence.",
  riskLevel: "SAFE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: false,
  auditEventType: "admin_sequence_step_added",
  handler: aiContentHandlers.handleAddSequenceStep,
});

registerAdminAction({
  actionId: "remove_sequence_step",
  category: "sequences",
  label: "Remove Sequence Step",
  description: "Removes a step from a sequence.",
  riskLevel: "SAFE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_sequence_step_removed",
  handler: aiContentHandlers.handleRemoveSequenceStep,
});

registerAdminAction({
  actionId: "enable_sequence",
  category: "sequences",
  label: "Enable Sequence",
  description: "Enables a message sequence.",
  riskLevel: "SENSITIVE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: true,
  idempotent: true,
  auditEventType: "admin_sequence_enabled",
  handler: aiContentHandlers.handleEnableSequence,
});

registerAdminAction({
  actionId: "disable_sequence",
  category: "sequences",
  label: "Disable Sequence",
  description: "Pauses/disables a message sequence.",
  riskLevel: "SENSITIVE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: true,
  idempotent: true,
  auditEventType: "admin_sequence_disabled",
  handler: aiContentHandlers.handleDisableSequence,
});

registerAdminAction({
  actionId: "delete_sequence",
  category: "sequences",
  label: "Delete Sequence",
  description: "Deletes a message sequence with confirmation.",
  riskLevel: "SENSITIVE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: true,
  idempotent: true,
  auditEventType: "admin_sequence_deleted",
  handler: aiContentHandlers.handleDeleteSequence,
});

// 11. Welcome Automation
registerAdminAction({
  actionId: "get_welcome_automation",
  category: "welcome",
  label: "Get Welcome Automation",
  description: "Queries status of welcome greeting flow for new contacts.",
  riskLevel: "READ",
  requiredRole: "manager",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_welcome_viewed",
  handler: aiContentHandlers.handleGetWelcomeAutomation,
});

registerAdminAction({
  actionId: "enable_welcome_automation",
  category: "welcome",
  label: "Enable Welcome Automation",
  description: "Enables automatic welcome sequence for new incoming contacts.",
  riskLevel: "SENSITIVE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: true,
  idempotent: true,
  auditEventType: "admin_welcome_enabled",
  handler: aiContentHandlers.handleEnableWelcomeAutomation,
});

registerAdminAction({
  actionId: "disable_welcome_automation",
  category: "welcome",
  label: "Disable Welcome Automation",
  description: "Disables automatic welcome greeting.",
  riskLevel: "SENSITIVE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: true,
  idempotent: true,
  auditEventType: "admin_welcome_disabled",
  handler: aiContentHandlers.handleDisableWelcomeAutomation,
});

registerAdminAction({
  actionId: "set_welcome_sequence",
  category: "welcome",
  label: "Set Welcome Sequence",
  description: "Assigns which sequence flow acts as the Welcome greeting.",
  riskLevel: "SENSITIVE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: true,
  idempotent: true,
  auditEventType: "admin_welcome_sequence_set",
  handler: aiContentHandlers.handleSetWelcomeSequence,
});

// ---------------------------------------------------------------------------
// PROMPT 5: FOLLOW-UPS, CUSTOMER UPDATES & BROADCAST OPERATIONS
// ---------------------------------------------------------------------------

// 1. Follow-ups
registerAdminAction({
  actionId: "get_followups_due",
  category: "followups",
  label: "Get Follow-ups Due",
  description: "Lists active follow-up automations and scheduled scan intervals.",
  riskLevel: "READ",
  requiredRole: "manager",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_followups_due_viewed",
  handler: campaignHandlers.handleGetFollowupsDue,
});

registerAdminAction({
  actionId: "get_failed_followups",
  category: "followups",
  label: "Get Failed Follow-ups",
  description: "Returns statistics and reasons for failed follow-up deliveries.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_failed_followups_viewed",
  handler: campaignHandlers.handleGetFailedFollowups,
});

registerAdminAction({
  actionId: "create_fixed_followup",
  category: "followups",
  label: "Create Fixed Follow-up",
  description: "Creates an automated fixed message follow-up trigger.",
  riskLevel: "SENSITIVE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: true,
  idempotent: false,
  auditEventType: "admin_fixed_followup_created",
  handler: campaignHandlers.handleCreateFixedFollowup,
});

registerAdminAction({
  actionId: "create_smart_followup",
  category: "followups",
  label: "Create AI Smart Follow-up",
  description: "Creates an AI-driven smart follow-up with custom business guidance.",
  riskLevel: "SENSITIVE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: true,
  idempotent: false,
  auditEventType: "admin_smart_followup_created",
  handler: campaignHandlers.handleCreateSmartFollowup,
});

registerAdminAction({
  actionId: "pause_followup",
  category: "followups",
  label: "Pause Follow-up",
  description: "Pauses an active follow-up automation campaign.",
  riskLevel: "SENSITIVE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: true,
  idempotent: true,
  auditEventType: "admin_followup_paused",
  handler: campaignHandlers.handlePauseFollowup,
});

registerAdminAction({
  actionId: "resume_followup",
  category: "followups",
  label: "Resume Follow-up",
  description: "Resumes a paused follow-up automation campaign.",
  riskLevel: "SENSITIVE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: true,
  idempotent: true,
  auditEventType: "admin_followup_resumed",
  handler: campaignHandlers.handleResumeFollowup,
});

registerAdminAction({
  actionId: "cancel_followup",
  category: "followups",
  label: "Cancel Follow-up",
  description: "Cancels and removes a follow-up automation campaign.",
  riskLevel: "SENSITIVE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: true,
  idempotent: true,
  auditEventType: "admin_followup_cancelled",
  handler: campaignHandlers.handleCancelFollowup,
});

// 2. Customer Updates (Stock & Scheduled Updates)
registerAdminAction({
  actionId: "get_scheduled_updates",
  category: "customer_updates",
  label: "Get Scheduled Updates",
  description: "Lists upcoming scheduled customer notification updates.",
  riskLevel: "READ",
  requiredRole: "manager",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_scheduled_updates_viewed",
  handler: campaignHandlers.handleGetScheduledUpdates,
});

registerAdminAction({
  actionId: "get_failed_customer_updates",
  category: "customer_updates",
  label: "Get Failed Customer Updates",
  description: "Lists failed customer update deliveries and error reasons.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_failed_customer_updates_viewed",
  handler: campaignHandlers.handleGetFailedCustomerUpdates,
});

registerAdminAction({
  actionId: "create_stock_update",
  category: "customer_updates",
  label: "Create Stock Update",
  description: "Schedules back-in-stock notification messages for customers.",
  riskLevel: "SENSITIVE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: true,
  idempotent: false,
  auditEventType: "admin_stock_update_created",
  handler: campaignHandlers.handleCreateStockUpdate,
});

registerAdminAction({
  actionId: "create_scheduled_update",
  category: "customer_updates",
  label: "Create Scheduled Customer Update",
  description: "Schedules timed customer notification messages with optional recurrence.",
  riskLevel: "SENSITIVE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: true,
  idempotent: false,
  auditEventType: "admin_scheduled_update_created",
  handler: campaignHandlers.handleCreateScheduledUpdate,
});

registerAdminAction({
  actionId: "cancel_customer_update",
  category: "customer_updates",
  label: "Cancel Customer Update",
  description: "Cancels pending scheduled customer notification messages.",
  riskLevel: "SENSITIVE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: true,
  idempotent: true,
  auditEventType: "admin_customer_update_cancelled",
  handler: campaignHandlers.handleCancelCustomerUpdate,
});

// 3. Broadcasts
registerAdminAction({
  actionId: "get_recent_broadcasts",
  category: "broadcasts",
  label: "Get Recent Broadcasts",
  description: "Lists recent broadcast campaigns and delivery outcomes.",
  riskLevel: "READ",
  requiredRole: "manager",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_recent_broadcasts_viewed",
  handler: campaignHandlers.handleGetRecentBroadcasts,
});

registerAdminAction({
  actionId: "get_failed_broadcasts",
  category: "broadcasts",
  label: "Get Failed Broadcasts",
  description: "Returns details of failed broadcast messages and reasons.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_failed_broadcasts_viewed",
  handler: campaignHandlers.handleGetFailedBroadcasts,
});

registerAdminAction({
  actionId: "create_broadcast",
  category: "broadcasts",
  label: "Create Broadcast Campaign",
  description: "Prepares and dispatches a broadcast campaign to eligible audience.",
  riskLevel: "SENSITIVE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: true,
  idempotent: false,
  auditEventType: "admin_broadcast_created",
  handler: campaignHandlers.handleCreateBroadcast,
});

registerAdminAction({
  actionId: "pause_broadcast",
  category: "broadcasts",
  label: "Pause Broadcast",
  description: "Pauses a scheduled broadcast campaign.",
  riskLevel: "SENSITIVE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: true,
  idempotent: true,
  auditEventType: "admin_broadcast_paused",
  handler: campaignHandlers.handlePauseBroadcast,
});

registerAdminAction({
  actionId: "resume_broadcast",
  category: "broadcasts",
  label: "Resume Broadcast",
  description: "Resumes a paused broadcast campaign.",
  riskLevel: "SENSITIVE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: true,
  idempotent: true,
  auditEventType: "admin_broadcast_resumed",
  handler: campaignHandlers.handleResumeBroadcast,
});

registerAdminAction({
  actionId: "cancel_broadcast",
  category: "broadcasts",
  label: "Cancel Broadcast",
  description: "Cancels a scheduled broadcast campaign.",
  riskLevel: "SENSITIVE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: true,
  idempotent: true,
  auditEventType: "admin_broadcast_cancelled",
  handler: campaignHandlers.handleCancelBroadcast,
});

// 4. Critical Blocked Operations
registerAdminAction({
  actionId: "bypass_opt_outs",
  category: "broadcasts",
  label: "Bypass Customer Opt-outs",
  description: "Consent policy violation - strictly prohibited.",
  riskLevel: "CRITICAL",
  requiredRole: "owner",
  requiresConfirmation: true,
  isDashboardOnly: true,
  idempotent: true,
  auditEventType: "admin_opt_out_bypass_rejected",
});

registerAdminAction({
  actionId: "unlimited_mass_send",
  category: "broadcasts",
  label: "Unlimited Mass Send",
  description: "Uncapped mass send - prohibited on WhatsApp.",
  riskLevel: "CRITICAL",
  requiredRole: "owner",
  requiresConfirmation: true,
  isDashboardOnly: true,
  idempotent: true,
  auditEventType: "admin_mass_send_rejected",
});

// ---------------------------------------------------------------------------
// PROMPT 6: OPERATIONS, INTEGRATIONS, BILLING, TEAM & SECURITY CONTROL
// ---------------------------------------------------------------------------

// 1. WhatsApp Instance Operations
registerAdminAction({
  actionId: "get_detailed_instance_status",
  category: "instance",
  label: "Get Detailed Instance Status",
  description: "Returns detailed instance health, automation pause state, proxy status, and engine diagnostics.",
  riskLevel: "READ",
  requiredRole: "manager",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_instance_detailed_status_viewed",
  handler: opsHandlers.handleGetDetailedInstanceStatus,
});

registerAdminAction({
  actionId: "pause_bot",
  category: "instance",
  label: "Pause WhatsApp Bot Automation",
  description: "Pauses customer automation (temporary or permanent pause).",
  riskLevel: "SENSITIVE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: true,
  idempotent: true,
  auditEventType: "admin_bot_paused",
  handler: opsHandlers.handlePauseBot,
});

registerAdminAction({
  actionId: "resume_bot",
  category: "instance",
  label: "Resume WhatsApp Bot Automation",
  description: "Resumes active customer messaging automation after entitlement check.",
  riskLevel: "SENSITIVE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: true,
  idempotent: true,
  auditEventType: "admin_bot_resumed",
  handler: opsHandlers.handleResumeBot,
});

registerAdminAction({
  actionId: "reload_bot_config",
  category: "instance",
  label: "Reload Bot Configuration",
  description: "Reloads runtime templates, sequences, welcome flow, and knowledge caches safely.",
  riskLevel: "SAFE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_bot_config_reloaded",
  handler: opsHandlers.handleReloadBotConfig,
});

registerAdminAction({
  actionId: "reset_whatsapp_login",
  category: "instance",
  label: "Reset WhatsApp Login",
  description: "Disconnects current session and requires new QR scan (Dashboard only).",
  riskLevel: "CRITICAL",
  requiredRole: "owner",
  requiresConfirmation: true,
  isDashboardOnly: true,
  idempotent: true,
  auditEventType: "admin_reset_login_rejected",
});

registerAdminAction({
  actionId: "delete_instance",
  category: "instance",
  label: "Delete WhatsApp Instance",
  description: "Destructive instance removal (Dashboard only).",
  riskLevel: "CRITICAL",
  requiredRole: "owner",
  requiresConfirmation: true,
  isDashboardOnly: true,
  idempotent: true,
  auditEventType: "admin_delete_instance_rejected",
});

registerAdminAction({
  actionId: "wipe_bot_data",
  category: "instance",
  label: "Wipe Bot Data",
  description: "Destructive data wipe (Dashboard only).",
  riskLevel: "CRITICAL",
  requiredRole: "owner",
  requiresConfirmation: true,
  isDashboardOnly: true,
  idempotent: true,
  auditEventType: "admin_wipe_bot_data_rejected",
});

// 2. Integrations Operations (WooCommerce, Leads, Public API, Webhooks, Couriers)
registerAdminAction({
  actionId: "sync_woocommerce",
  category: "integrations",
  label: "Sync WooCommerce Catalog",
  description: "Triggers catalog product synchronization from linked WooCommerce store.",
  riskLevel: "SENSITIVE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: true,
  idempotent: true,
  auditEventType: "admin_woocommerce_synced",
  handler: opsHandlers.handleSyncWooCommerce,
});

registerAdminAction({
  actionId: "retry_woocommerce_sync",
  category: "integrations",
  label: "Retry WooCommerce Sync",
  description: "Retries catalog synchronization safely.",
  riskLevel: "SAFE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_woocommerce_sync_retried",
  handler: opsHandlers.handleRetryWooCommerceSync,
});

registerAdminAction({
  actionId: "get_website_lead_api_status",
  category: "integrations",
  label: "Get Website Lead API Status",
  description: "Queries status and rate limit of website lead capture API.",
  riskLevel: "READ",
  requiredRole: "manager",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_website_lead_status_viewed",
  handler: opsHandlers.handleGetWebsiteLeadApiStatus,
});

registerAdminAction({
  actionId: "retry_website_lead_ingestion",
  category: "integrations",
  label: "Retry Website Lead Ingestion",
  description: "Retries a specific failed lead ingestion.",
  riskLevel: "SAFE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_website_lead_retried",
  handler: opsHandlers.handleRetryWebsiteLeadIngestion,
});

registerAdminAction({
  actionId: "get_public_api_metadata",
  category: "integrations",
  label: "Get Public API Metadata",
  description: "Lists active API keys and rate limits without revealing secrets.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_public_api_metadata_viewed",
  handler: opsHandlers.handleGetPublicApiMetadata,
});

registerAdminAction({
  actionId: "create_api_key",
  category: "integrations",
  label: "Create Public API Key",
  description: "API Key issuance (Dashboard only for security).",
  riskLevel: "CRITICAL",
  requiredRole: "owner",
  requiresConfirmation: true,
  isDashboardOnly: true,
  idempotent: true,
  auditEventType: "admin_create_api_key_rejected",
});

registerAdminAction({
  actionId: "rotate_api_key",
  category: "integrations",
  label: "Rotate Public API Key",
  description: "API Key rotation (Dashboard only for security).",
  riskLevel: "CRITICAL",
  requiredRole: "owner",
  requiresConfirmation: true,
  isDashboardOnly: true,
  idempotent: true,
  auditEventType: "admin_rotate_api_key_rejected",
});

registerAdminAction({
  actionId: "get_webhooks_status",
  category: "integrations",
  label: "Get Webhooks Status",
  description: "Lists configured webhook endpoints and recent delivery outcomes.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_webhooks_status_viewed",
  handler: opsHandlers.handleGetWebhooksStatus,
});

registerAdminAction({
  actionId: "retry_failed_webhook_delivery",
  category: "integrations",
  label: "Retry Webhook Delivery",
  description: "Retries a specific failed webhook delivery by ID.",
  riskLevel: "SAFE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_webhook_delivery_retried",
  handler: opsHandlers.handleRetryWebhookDelivery,
});

registerAdminAction({
  actionId: "change_webhook_url",
  category: "integrations",
  label: "Change Webhook URL",
  description: "Webhook URL configuration (Dashboard only).",
  riskLevel: "CRITICAL",
  requiredRole: "owner",
  requiresConfirmation: true,
  isDashboardOnly: true,
  idempotent: true,
  auditEventType: "admin_webhook_url_change_rejected",
});

registerAdminAction({
  actionId: "get_courier_operations_status",
  category: "integrations",
  label: "Get Courier Operations Status",
  description: "Returns PostEx and Leopards connection and tracking health.",
  riskLevel: "READ",
  requiredRole: "manager",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_courier_operations_viewed",
  handler: opsHandlers.handleGetCourierOperationsStatus,
});

registerAdminAction({
  actionId: "test_courier_connection",
  category: "integrations",
  label: "Test Courier Connection",
  description: "Performs safe API ping test to courier gateway.",
  riskLevel: "SAFE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_courier_connection_tested",
  handler: opsHandlers.handleTestCourierConnection,
});

// 3. Billing & Preferences
registerAdminAction({
  actionId: "get_billing_overview",
  category: "billing",
  label: "Get Billing Overview",
  description: "Returns subscription plan, account status, and wallet balance.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_billing_overview_viewed",
  handler: opsHandlers.handleGetBillingOverview,
});

registerAdminAction({
  actionId: "get_billing_history",
  category: "billing",
  label: "Get Billing History",
  description: "Returns recent usage charges and transaction history.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_billing_history_viewed",
  handler: opsHandlers.handleGetBillingHistory,
});

registerAdminAction({
  actionId: "get_business_assistant_usage",
  category: "billing",
  label: "Get Business Assistant Usage",
  description: "Returns Admin Business Assistant message count and spend based on canonical ledger ($0.003/AI call).",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_business_assistant_usage_viewed",
  handler: opsHandlers.handleGetBusinessAssistantUsage,
});

registerAdminAction({
  actionId: "update_billing_preferences",
  category: "billing",
  label: "Update Billing Preferences",
  description: "Updates company name, invoice address, tax / NTN registration info.",
  riskLevel: "SENSITIVE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: true,
  idempotent: true,
  auditEventType: "admin_billing_preferences_updated",
  handler: opsHandlers.handleUpdateBillingPreferences,
});

registerAdminAction({
  actionId: "wallet_topup",
  category: "billing",
  label: "Wallet Top-up",
  description: "Payment transaction (Dashboard Wallet & Billing only).",
  riskLevel: "CRITICAL",
  requiredRole: "owner",
  requiresConfirmation: true,
  isDashboardOnly: true,
  idempotent: true,
  auditEventType: "admin_wallet_topup_rejected",
});

registerAdminAction({
  actionId: "plan_purchase",
  category: "billing",
  label: "Plan Purchase / Upgrade",
  description: "Subscription transaction (Dashboard only).",
  riskLevel: "CRITICAL",
  requiredRole: "owner",
  requiresConfirmation: true,
  isDashboardOnly: true,
  idempotent: true,
  auditEventType: "admin_plan_purchase_rejected",
});

registerAdminAction({
  actionId: "process_refund",
  category: "billing",
  label: "Process Refund",
  description: "Payment refund (Dashboard only).",
  riskLevel: "CRITICAL",
  requiredRole: "owner",
  requiresConfirmation: true,
  isDashboardOnly: true,
  idempotent: true,
  auditEventType: "admin_refund_rejected",
});

// 4. Admin Alerts
registerAdminAction({
  actionId: "get_admin_alerts_config",
  category: "alerts",
  label: "Get Admin Alerts Config",
  description: "Returns configured WhatsApp and Dashboard alert categories.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_alerts_config_viewed",
  handler: opsHandlers.handleGetAdminAlertsConfig,
});

registerAdminAction({
  actionId: "update_admin_alert_category",
  category: "alerts",
  label: "Update Admin Alert Category",
  description: "Enables or disables notification for a specific alert category.",
  riskLevel: "SENSITIVE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: true,
  idempotent: true,
  auditEventType: "admin_alerts_category_updated",
  handler: opsHandlers.handleUpdateAdminAlertCategory,
});

registerAdminAction({
  actionId: "change_admin_number",
  category: "alerts",
  label: "Change Admin WhatsApp Number",
  description: "Privileged identity mutation (Dashboard only).",
  riskLevel: "CRITICAL",
  requiredRole: "owner",
  requiresConfirmation: true,
  isDashboardOnly: true,
  idempotent: true,
  auditEventType: "admin_number_change_rejected",
});

registerAdminAction({
  actionId: "toggle_assistant_access",
  category: "alerts",
  label: "Toggle Business Assistant Access",
  description: "Channel access mutation (Dashboard only).",
  riskLevel: "CRITICAL",
  requiredRole: "owner",
  requiresConfirmation: true,
  isDashboardOnly: true,
  idempotent: true,
  auditEventType: "admin_assistant_toggle_rejected",
});

// 5. Team & Access
registerAdminAction({
  actionId: "list_team_members",
  category: "team",
  label: "List Team Members",
  description: "Lists all team members, assigned roles, and invitation status.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_team_members_viewed",
  handler: opsHandlers.handleListTeamMembers,
});

registerAdminAction({
  actionId: "invite_team_member",
  category: "team",
  label: "Invite Team Member",
  description: "Sends an invitation email to a new team member with specified role.",
  riskLevel: "SENSITIVE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: true,
  idempotent: false,
  auditEventType: "admin_team_member_invited",
  handler: opsHandlers.handleInviteTeamMember,
});

registerAdminAction({
  actionId: "update_team_member_role",
  category: "team",
  label: "Update Team Member Role",
  description: "Modifies role for a non-owner team member.",
  riskLevel: "SENSITIVE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: true,
  idempotent: true,
  auditEventType: "admin_team_role_updated",
  handler: opsHandlers.handleUpdateTeamMemberRole,
});

registerAdminAction({
  actionId: "remove_team_member",
  category: "team",
  label: "Remove Team Member",
  description: "Revokes access for a non-owner team member.",
  riskLevel: "SENSITIVE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: true,
  idempotent: true,
  auditEventType: "admin_team_member_removed",
  handler: opsHandlers.handleRemoveTeamMember,
});

registerAdminAction({
  actionId: "transfer_ownership",
  category: "team",
  label: "Transfer Account Ownership",
  description: "Account ownership transfer (Dashboard only).",
  riskLevel: "CRITICAL",
  requiredRole: "owner",
  requiresConfirmation: true,
  isDashboardOnly: true,
  idempotent: true,
  auditEventType: "admin_ownership_transfer_rejected",
});

registerAdminAction({
  actionId: "demote_owner",
  category: "team",
  label: "Demote Account Owner",
  description: "Prohibited action.",
  riskLevel: "CRITICAL",
  requiredRole: "owner",
  requiresConfirmation: true,
  isDashboardOnly: true,
  idempotent: true,
  auditEventType: "admin_owner_demote_rejected",
});

// 6. Security & Sessions
registerAdminAction({
  actionId: "get_security_overview",
  category: "security",
  label: "Get Security Overview",
  description: "Returns 2FA status, active sessions, and security health.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_security_overview_viewed",
  handler: opsHandlers.handleGetSecurityOverview,
});

registerAdminAction({
  actionId: "get_active_sessions",
  category: "security",
  label: "Get Active Sessions",
  description: "Lists active dashboard and WhatsApp login sessions.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_active_sessions_viewed",
  handler: opsHandlers.handleGetActiveSessions,
});

registerAdminAction({
  actionId: "disable_2fa",
  category: "security",
  label: "Disable Two-Factor Authentication",
  description: "Security modification (Dashboard only).",
  riskLevel: "CRITICAL",
  requiredRole: "owner",
  requiresConfirmation: true,
  isDashboardOnly: true,
  idempotent: true,
  auditEventType: "admin_disable_2fa_rejected",
});

registerAdminAction({
  actionId: "revoke_all_sessions",
  category: "security",
  label: "Revoke All Sessions",
  description: "Session revocation (Dashboard only).",
  riskLevel: "CRITICAL",
  requiredRole: "owner",
  requiresConfirmation: true,
  isDashboardOnly: true,
  idempotent: true,
  auditEventType: "admin_revoke_all_sessions_rejected",
});

registerAdminAction({
  actionId: "change_password",
  category: "security",
  label: "Change Password",
  description: "Password modification (Dashboard only).",
  riskLevel: "CRITICAL",
  requiredRole: "owner",
  requiresConfirmation: true,
  isDashboardOnly: true,
  idempotent: true,
  auditEventType: "admin_password_change_rejected",
});

// ---------------------------------------------------------------------------
// 7. PROMPT 7: PROACTIVE BUSINESS MANAGER & ACTIONABLE INTELLIGENCE
// ---------------------------------------------------------------------------

registerAdminAction({
  actionId: "get_proactive_alert_settings",
  category: "proactive",
  label: "Get Proactive Alert Settings",
  description: "Returns master proactive toggle, category states, schedules, and thresholds.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_proactive_settings_viewed",
  handler: proactiveHandlers.handleGetProactiveAlertSettings,
});

registerAdminAction({
  actionId: "update_proactive_alert_category",
  category: "proactive",
  label: "Update Proactive Alert Category",
  description: "Enables or disables notifications for a specific proactive business category.",
  riskLevel: "SAFE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_proactive_category_updated",
  handler: proactiveHandlers.handleUpdateProactiveAlertCategory,
});

registerAdminAction({
  actionId: "set_daily_digest_time",
  category: "proactive",
  label: "Set Daily Digest Time",
  description: "Configures schedule time for daily business digest in account timezone.",
  riskLevel: "SAFE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_daily_digest_scheduled",
  handler: proactiveHandlers.handleSetDailyDigestTime,
});

registerAdminAction({
  actionId: "set_high_value_order_threshold",
  category: "proactive",
  label: "Set High-Value Order Threshold",
  description: "Sets the minimum order amount that triggers an instant high-value alert.",
  riskLevel: "SAFE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_order_threshold_set",
  handler: proactiveHandlers.handleSetHighValueOrderThreshold,
});

registerAdminAction({
  actionId: "set_low_wallet_alert_threshold",
  category: "proactive",
  label: "Set Low Wallet Alert Threshold",
  description: "Sets the wallet balance floor that triggers an alert (must be > $0.003).",
  riskLevel: "SAFE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_wallet_threshold_set",
  handler: proactiveHandlers.handleSetLowWalletAlertThreshold,
});

registerAdminAction({
  actionId: "dismiss_proactive_alert",
  category: "proactive",
  label: "Dismiss Proactive Alert",
  description: "Dismisses an active incident to suppress repeat alerts.",
  riskLevel: "SAFE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_proactive_alert_dismissed",
});

registerAdminAction({
  actionId: "snooze_proactive_alert",
  category: "proactive",
  label: "Snooze Proactive Alert",
  description: "Snoozes repeat alerts for an incident for a bounded number of hours.",
  riskLevel: "SAFE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_proactive_alert_snoozed",
});

// ---------------------------------------------------------------------------
// Admin Private Reminders Actions
// ---------------------------------------------------------------------------

registerAdminAction({
  actionId: "create_admin_reminder",
  category: "operations",
  label: "Create Admin Reminder",
  description: "Schedules a private durable reminder sent exclusively to the authorized WhatsApp Admin identity.",
  riskLevel: "SAFE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: false,
  auditEventType: "admin_reminder_created",
  handler: reminderHandlers.handleCreateAdminReminder,
});

registerAdminAction({
  actionId: "list_admin_reminders",
  category: "operations",
  label: "List Admin Reminders",
  description: "Lists upcoming or past private reminders for the authorized Admin.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_reminders_listed",
  handler: reminderHandlers.handleListAdminReminders,
});

registerAdminAction({
  actionId: "cancel_admin_reminder",
  category: "operations",
  label: "Cancel Admin Reminder",
  description: "Cancels a scheduled pending private reminder.",
  riskLevel: "SAFE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "admin_reminder_cancelled",
  handler: reminderHandlers.handleCancelAdminReminder,
});

// ---------------------------------------------------------------------------
// Owner360 / Personal Profile Actions (Prompt 2)
// ---------------------------------------------------------------------------

registerAdminAction({
  actionId: "get_owner_profile",
  category: "owner_profile",
  label: "Get Owner Profile",
  description: "Returns the stored Owner360 personal profile (preferred name, timezone, languages, default address, contact methods, and privacy levels). Use when owner asks 'What information do you have saved about me?' or 'What do you know about me?'.",
  riskLevel: "READ",
  requiredRole: "owner",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "owner_profile_viewed",
  handler: async (context) => {
    const profile = await owner360Service.getOwnerProfile(context.accountId);
    let text = `👤 *Your Owner360 Profile*\n\n`;
    text += `• *Preferred Name:* ${profile.identity.preferredName || "Not set"}\n`;
    if (profile.identity.title) text += `• *Title:* ${profile.identity.title}\n`;
    if (profile.identity.preferredReference) text += `• *Assistant Reference:* ${profile.identity.preferredReference}\n`;
    text += `• *Timezone:* ${profile.locale.timezone}\n`;
    text += `• *Languages:* ${profile.locale.preferredLanguages.join(", ")}\n`;
    text += `• *Currency:* ${profile.locale.defaultCurrency}\n`;

    const defaultAddr = profile.addresses.find((a) => a.isDefault) || profile.addresses[0];
    if (defaultAddr) {
      text += `• *Default Address:* ${defaultAddr.label} (${defaultAddr.city}, ${defaultAddr.country}) [${defaultAddr.privacyPolicy}]\n`;
    } else {
      text += `• *Address:* None saved\n`;
    }

    if (profile.contactMethods.length > 0) {
      text += `• *Contact Methods:* ${profile.contactMethods.length} saved\n`;
    }
    if (profile.customFacts.length > 0) {
      text += `• *Personal Facts (${profile.customFacts.length}):*\n`;
      profile.customFacts.forEach((f) => {
        text += `   - ${f.label}: ${f.value}\n`;
      });
    } else {
      text += `• *Personal Facts:* None saved yet\n`;
    }
    text += `\n_Privacy default: PRIVATE. Only authorized tasks may use data marked ALLOW._`;

    return {
      success: true,
      message: text.trim(),
      data: { profile },
    };
  },
});

registerAdminAction({
  actionId: "update_owner_preference",
  category: "owner_profile",
  label: "Update Owner Preference",
  description: "Updates low-risk personal preferences such as timezone (valid IANA name), preferred languages, or communication tone/formality. Use for 'Save my preferred timezone as Asia/Karachi' or 'Change my preferred language to Urdu'.",
  riskLevel: "SAFE_WRITE",
  requiredRole: "owner",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "owner_preference_updated",
  handler: async (context, params) => {
    const { timezone, language, languages, formality, tone } = params || {};
    const current = await owner360Service.getOwnerProfile(context.accountId);
    const patch: any = {};

    if (timezone) {
      if (!owner360Service.validateTimezone(timezone)) {
        return {
          success: false,
          message: `❌ Invalid IANA timezone "${timezone}". Please provide a valid timezone name like *Asia/Karachi*, *America/New_York*, or *UTC*.`,
          error: "INVALID_TIMEZONE",
        };
      }
      patch.locale = { ...current.locale, timezone };
    }

    if (language || languages) {
      const langList = Array.isArray(languages) ? languages : [language];
      patch.locale = { ...current.locale, ...(patch.locale || {}), preferredLanguages: langList };
    }

    if (formality || tone) {
      patch.communicationPreferences = {
        ...current.communicationPreferences,
        ...(formality ? { formality } : {}),
        ...(tone ? { tone } : {}),
      };
    }

    if (Object.keys(patch).length === 0) {
      return {
        success: false,
        message: `ℹ️ No preference updates detected. You can change timezone, preferred languages, or communication tone.`,
      };
    }

    const updated = await owner360Service.updateOwnerProfile(context.accountId, patch);
    let summary = `✅ *Personal Preferences Updated*\n\n`;
    if (patch.locale?.timezone) summary += `• *Timezone:* ${patch.locale.timezone}\n`;
    if (patch.locale?.preferredLanguages) summary += `• *Languages:* ${patch.locale.preferredLanguages.join(", ")}\n`;
    if (patch.communicationPreferences?.formality) summary += `• *Formality:* ${patch.communicationPreferences.formality}\n`;
    if (patch.communicationPreferences?.tone) summary += `• *Tone:* ${patch.communicationPreferences.tone}\n`;

    return {
      success: true,
      message: summary.trim(),
      data: { profile: updated },
    };
  },
});

registerAdminAction({
  actionId: "add_owner_address",
  category: "owner_profile",
  label: "Add Owner Address",
  description: "Saves a new physical or delivery address to the owner's personal profile. Requires preview and explicit confirmation before persisting.",
  riskLevel: "SENSITIVE_WRITE",
  requiredRole: "owner",
  requiresConfirmation: true,
  idempotent: false,
  auditEventType: "owner_address_added",
  handler: async (context, params) => {
    const { label, addressLine1, city, country, region, postalCode, isDefault, privacyPolicy } = params || {};
    const cleanAddr = {
      label: String(label || "Home").trim(),
      addressLine1: String(addressLine1 || "").trim(),
      city: String(city || "").trim(),
      country: String(country || "Pakistan").trim(),
      region: region ? String(region).trim() : undefined,
      postalCode: postalCode ? String(postalCode).trim() : undefined,
      isDefault: isDefault !== undefined ? Boolean(isDefault) : true,
      privacyPolicy: owner360Service.normalizePrivacyPolicy(privacyPolicy),
      source: "owner_business_whatsapp" as const,
    };

    try {
      owner360Service.validateAddress(cleanAddr);
    } catch (e: any) {
      return {
        success: false,
        message: `❌ ${e.message}`,
        error: "INVALID_ADDRESS",
      };
    }

    const updated = await owner360Service.addOwnerAddress(context.accountId, cleanAddr);
    return {
      success: true,
      message: `✅ *Address Saved*\n\nSaved *${cleanAddr.label}* address (${cleanAddr.addressLine1}, ${cleanAddr.city}) to your Owner360 profile.`,
      data: { profile: updated },
    };
  },
});

registerAdminAction({
  actionId: "update_owner_privacy",
  category: "owner_profile",
  label: "Update Owner Privacy",
  description: "Updates privacy policy on an owner profile item. Broadening from PRIVATE to ALLOW_FOR_AUTHORIZED_TASK requires explicit confirmation.",
  riskLevel: "SENSITIVE_WRITE",
  requiredRole: "owner",
  requiresConfirmation: true,
  idempotent: true,
  auditEventType: "owner_privacy_updated",
  handler: async (context, params) => {
    const { target, privacyPolicy, label } = params || {};
    const policy = owner360Service.normalizePrivacyPolicy(privacyPolicy);
    const current = await owner360Service.getOwnerProfile(context.accountId);

    let updated = current;
    if (target === "identity" || target === "preferredName") {
      updated = await owner360Service.setOwnerIdentity(context.accountId, { privacyPolicy: policy });
    } else if (target === "address") {
      const match = current.addresses.find((a) => (label && a.label.toLowerCase() === label.toLowerCase()) || a.isDefault) || current.addresses[0];
      if (match) {
        updated = await owner360Service.updateOwnerAddress(context.accountId, match.id, { privacyPolicy: policy });
      }
    } else if (target === "contact") {
      const match = current.contactMethods.find((c) => (label && c.label.toLowerCase() === label.toLowerCase()) || c.isDefault) || current.contactMethods[0];
      if (match) {
        updated = await owner360Service.updateOwnerContactMethod(context.accountId, match.id, { privacyPolicy: policy });
      }
    }

    return {
      success: true,
      message: `🔒 *Privacy Updated*\n\nPrivacy policy set to *${policy}*.`,
      data: { profile: updated },
    };
  },
});

// Import Personal Contact Tools (Prompt 3)
import "./personal-contact-admin-ba-tools.ts";

// Import Incoming Personal Assistant Tools (Prompt 4)
import "./personal-incoming-admin-tools.ts";

// Import Outbound Personal Mission Tools (Prompt 5)
import "./personal-outbound-admin-tools.ts";

// Import Personal Task Engine Tools (Prompt 6)
import "./personal-task-admin-tools.ts";

// Import Personal Delegation & Safety Tools (Prompt 7)
import "./personal-delegation-admin-tools.ts";

// Import Google Personal Tools (Prompt 8)
import "./google-personal-admin-tools.ts";

// Import Department Lead Routing Tools
import "./department-lead-routing-admin-tools.ts";





