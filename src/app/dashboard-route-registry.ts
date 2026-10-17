import { CRM_UI_ENABLED, INBOX_UI_ENABLED, PERSONAL_ASSISTANT_FEATURE_ENABLED, isProductFeatureEnabled } from '../config/product-flags';

export interface DashboardRouteDef {
  id: string;
  path: string;
  view: string;
  tab?: string;
  label: string;
  section?: string;
  adminOnly?: boolean;
  legacyAliases?: string[];
  title: string;
}

export const DASHBOARD_INTEGRATIONS_PATH = "/dashboard/integrations";
export const LIVE_MONITOR_PATH = "/live-monitor";

export const DASHBOARD_ROUTE_REGISTRY: DashboardRouteDef[] = [
  // OVERVIEW / GET STARTED
  { id: "get_started", path: "/get-started", view: "get_started", label: "Get Started", section: "Overview", title: "Get Started | BlackArrow" },
  { id: "dashboard", path: "/dashboard", view: "global_dashboard", label: "Dashboard", section: "Overview", title: "Dashboard | BlackArrow", legacyAliases: ["/global_dashboard"] },
  { id: "business_assistant", path: "/dashboard/business-assistant", view: "business_assistant", label: "Business Assistant", section: "WhatsApp Workspace", title: "Business Assistant | BlackArrow", legacyAliases: ["/business-assistant"] },
  ...(PERSONAL_ASSISTANT_FEATURE_ENABLED ? [
    { id: "personal_assistant", path: "/personal-assistant", view: "personal_assistant", label: "Personal Assistant", section: "WhatsApp Workspace", title: "Personal Assistant | BlackArrow", legacyAliases: ["/dashboard/personal-assistant"] },
    { id: "personal_assistant_tasks", path: "/personal-assistant/tasks", view: "personal_assistant", tab: "tasks", label: "Tasks", section: "WhatsApp Workspace", title: "Tasks — Personal Assistant | BlackArrow" },
    { id: "personal_assistant_conversations", path: "/personal-assistant/conversations", view: "personal_assistant", tab: "conversations", label: "Conversations", section: "WhatsApp Workspace", title: "Conversations — Personal Assistant | BlackArrow" },
    { id: "personal_assistant_contacts", path: "/personal-assistant/contacts", view: "personal_assistant", tab: "contacts", label: "Contacts", section: "WhatsApp Workspace", title: "Contacts — Personal Assistant | BlackArrow" },
    { id: "personal_assistant_profile", path: "/personal-assistant/profile", view: "personal_assistant", tab: "profile", label: "My Profile", section: "WhatsApp Workspace", title: "My Profile — Personal Assistant | BlackArrow" },
    { id: "personal_assistant_permissions", path: "/personal-assistant/permissions", view: "personal_assistant", tab: "permissions", label: "Permissions", section: "WhatsApp Workspace", title: "Permissions — Personal Assistant | BlackArrow" },
    { id: "personal_assistant_connected_apps", path: "/personal-assistant/connected-apps", view: "personal_assistant", tab: "connected_apps", label: "Connected Apps", section: "WhatsApp Workspace", title: "Connected Apps — Personal Assistant | BlackArrow" },
    { id: "personal_assistant_numbers", path: "/personal-assistant/numbers", view: "personal_assistant", tab: "numbers", label: "Personal Numbers", section: "WhatsApp Workspace", title: "Personal Numbers — Personal Assistant | BlackArrow" },
  ] : []),
  { id: "instances", path: "/instances", view: "selector", label: "Instance Hub", section: "WhatsApp Workspace", title: "WhatsApp Instances | BlackArrow", legacyAliases: ["/selector"] },
  { id: "live_monitor", path: LIVE_MONITOR_PATH, view: "live_monitor", label: "Live Monitor", section: "WhatsApp Workspace", title: "Live Monitor | BlackArrow", legacyAliases: ["/terminal"] },
  ...(INBOX_UI_ENABLED ? [{ id: "inbox", path: "/inbox", view: "dashboard", label: "Inbox", section: "Customers & Engagement", title: "Inbox | BlackArrow" }] : []),
  { id: "customers", path: "/customers", view: "customers", label: "Customers", section: "Customers & Engagement", title: "Customers | BlackArrow" },
  ...(CRM_UI_ENABLED ? [{ id: "crm", path: "/crm", view: "crm", label: "CRM & Pipeline", section: "Customers & Engagement", title: "CRM | BlackArrow" }] : []),
  { id: "products", path: "/products", view: "products", label: "Products & Services", section: "WhatsApp Workspace", title: "Products & Services | BlackArrow" },
  { id: "orders", path: "/orders", view: "orders", label: "Orders", section: "Commerce & Operations", title: "Orders | BlackArrow" },
  { id: "knowledge_center", path: "/knowledge-center", view: "knowledge", label: "Knowledge Base", section: "WhatsApp Workspace", title: "Knowledge Base | BlackArrow", legacyAliases: ["/knowledge"] },
  { id: "integrations", path: DASHBOARD_INTEGRATIONS_PATH, view: "integrations", label: "Integrations", section: "Commerce & Operations", title: "Integrations | BlackArrow" },

  // AUTOMATIONS
  { id: "followups", path: "/followups", view: "marketing", label: "Follow-up Campaigns", section: "Customers & Engagement", title: "Follow-ups | BlackArrow", legacyAliases: ["/marketing"] },
  { id: "contact_lists", path: "/contact-lists", view: "contact_lists", label: "Contact Lists", section: "Customers & Engagement", title: "Contact Lists | BlackArrow" },
  { id: "campaigns", path: "/campaigns", view: "campaigns", label: "Campaigns", section: "Customers & Engagement", title: "Campaigns | BlackArrow" },
  { id: "workspaces", path: "/workspaces", view: "workspaces", label: "AI Workspaces", section: "WhatsApp Workspace", title: "AI Workspaces | BlackArrow", legacyAliases: ["/ai-workspaces"] },
  { id: "broadcasts", path: "/broadcasts", view: "broadcast", label: "Courier Broadcast", section: "Customers & Engagement", title: "Broadcasts | BlackArrow", legacyAliases: ["/broadcast"] },
  { id: "customer_updates", path: "/customer-updates", view: "customer_updates", label: "Customer Updates", section: "Customers & Engagement", title: "Customer Updates | BlackArrow" },

  // CONTENT LIBRARY
  { id: "content_library_media", path: "/content-library/media", view: "content_library", tab: "media", label: "Media & Assets", section: "WhatsApp Workspace", title: "Media & Assets | BlackArrow", legacyAliases: ["/media"] },
  { id: "content_library_saved_replies", path: "/content-library/saved-replies", view: "content_library", tab: "saved_replies", label: "Saved Replies", section: "WhatsApp Workspace", title: "Saved Replies | BlackArrow", legacyAliases: ["/content-library"] },
  { id: "content_library_sequences", path: "/content-library/sequences", view: "content_library", tab: "sequences", label: "Sequences & Automation", section: "WhatsApp Workspace", title: "Sequences | BlackArrow", legacyAliases: ["/sequences"] },
  { id: "content_library_welcome", path: "/content-library/welcome", view: "content_library", tab: "welcome", label: "Welcome Automation", section: "WhatsApp Workspace", title: "Welcome Automation | BlackArrow" },

  // AI STUDIO
  { id: "ai_instructions", path: "/ai-studio/instructions", view: "ai", tab: "instructions", label: "AI Instructions", section: "WhatsApp Workspace", title: "AI Studio — Instructions | BlackArrow", legacyAliases: ["/ai", "/ai-studio"] },
  { id: "ai_knowledge", path: "/ai-studio/knowledge", view: "ai", tab: "learned", label: "Learned Knowledge", section: "WhatsApp Workspace", title: "AI Studio — Knowledge | BlackArrow" },
  { id: "ai_custom_fields", path: "/ai-studio/confirmation-fields", view: "ai", tab: "fields", label: "Confirmation Fields", section: "WhatsApp Workspace", title: "AI Studio — Confirmation Fields | BlackArrow" },
  { id: "ai_reply_settings", path: "/ai-studio/reply-call-settings", view: "ai", tab: "calls", label: "Reply & Call Settings", section: "WhatsApp Workspace", title: "AI Studio — Reply & Call Settings | BlackArrow" },
  { id: "ai_smart_sales", path: "/ai-studio/smart-sales", view: "ai", tab: "smart_sales", label: "Smart Sales Engine", section: "WhatsApp Workspace", title: "AI Studio — Smart Sales Engine | BlackArrow" },

  // REPORTS / ANALYTICS
  { id: "reports_performance", path: "/reports/performance", view: "analytics", tab: "performance", label: "Performance Analytics", section: "Reports", title: "Performance Reports | BlackArrow", legacyAliases: ["/analytics", "/reports"] },
  { id: "reports_usage", path: "/reports/usage", view: "analytics", tab: "usage", label: "API Usage Breakdown", section: "Reports", title: "Usage Reports | BlackArrow" },
  { id: "reports_live", path: "/reports/live", view: "analytics", tab: "live", label: "Live API Analytics", section: "Reports", title: "Live Analytics | BlackArrow" },
  { id: "reports_logs", path: "/reports/logs", view: "analytics", tab: "logs", label: "Daily Transparency Logs", section: "Reports", title: "Daily Logs | BlackArrow" },

  // BILLING
  { id: "billing_overview", path: "/billing/overview", view: "billing", tab: "overview", label: "Billing Overview", section: "Account", title: "Billing Overview | BlackArrow", legacyAliases: ["/billing", "/wallet"] },
  { id: "billing_usage", path: "/billing/usage", view: "billing", tab: "usage", label: "Usage Breakdown", section: "Account", title: "Billing Usage | BlackArrow" },
  { id: "billing_plans", path: "/billing/plans", view: "billing", tab: "plans", label: "Plans & Add-ons", section: "Account", title: "Subscription Plans | BlackArrow" },
  { id: "billing_history", path: "/billing/history", view: "billing", tab: "history", label: "Billing History", section: "Account", title: "Billing History | BlackArrow" },

  // SETTINGS & TEAM
  { id: "settings_account_access", path: "/settings/account-access", view: "team", tab: "team", label: "Team & Account Access", section: "Account", title: "Team Access | BlackArrow", legacyAliases: ["/team"] },
  { id: "settings_billing", path: "/settings/billing", view: "settings", tab: "billing", label: "Billing Preferences", section: "Account", title: "Billing Preferences | BlackArrow", legacyAliases: ["/billing/account"] },
  { id: "settings_admin_alerts", path: "/settings/admin-alerts", view: "settings", tab: "alerts", label: "Admin Alerts", section: "Account", title: "Admin Alerts | BlackArrow", legacyAliases: ["/settings", "/notifications"] },
  { id: "settings_security", path: "/settings/security", view: "security", tab: "security", label: "Security & 2FA", section: "Account", title: "Security & 2FA | BlackArrow", legacyAliases: ["/security"] },
  { id: "settings_sessions", path: "/settings/sessions", view: "settings", tab: "sessions", label: "Active Sessions", section: "Account", title: "Active Sessions | BlackArrow" },
  { id: "settings_proxy", path: "/settings/proxy", view: "settings", tab: "proxy", label: "Proxy Settings", section: "Account", title: "Proxy Settings | BlackArrow" },
  { id: "departments", path: "/departments", view: "departments", label: "Departments", section: "Customers & Engagement", title: "Departments & Lead Routing | BlackArrow", legacyAliases: ["/lead-routing", "/settings/lead-routing"] },

  // ADMIN (Admin Only)
  { id: "admin_dashboard", path: "/admin/dashboard", view: "admin", tab: "dashboard", label: "Admin Dashboard", section: "Administration", adminOnly: true, title: "Admin Dashboard | BlackArrow", legacyAliases: ["/admin"] },
  { id: "admin_users", path: "/admin/users", view: "admin", tab: "users", label: "Accounts & Users", section: "Administration", adminOnly: true, title: "Accounts & Users | BlackArrow" },
  { id: "admin_directory", path: "/admin/directory", view: "admin", tab: "directory", label: "Shared Directory", section: "Administration", adminOnly: true, title: "Shared Directory | BlackArrow" },
  { id: "admin_smart_sales", path: "/admin/smart-sales", view: "admin", tab: "smart_sales", label: "Smart Sales Control", section: "Administration", adminOnly: true, title: "Smart Sales Control | BlackArrow" },
  { id: "admin_accounting", path: "/admin/accounting", view: "admin", tab: "accounting", label: "Platform Accounting", section: "Administration", adminOnly: true, title: "Platform Accounting | BlackArrow" },
  { id: "admin_logs", path: "/admin/logs", view: "admin", tab: "logs", label: "Admin Logs", section: "Administration", adminOnly: true, title: "Admin Logs | BlackArrow" },
  { id: "admin_proxies", path: "/admin/proxies", view: "admin", tab: "proxies", label: "System Proxies", section: "Administration", adminOnly: true, title: "System Proxies | BlackArrow" },
];

export function resolveRouteByPath(pathname: string): DashboardRouteDef | null {
  const normalized = pathname.toLowerCase().replace(/\/+$/, "") || "/";
  if (!CRM_UI_ENABLED && (normalized === "/crm" || normalized.startsWith("/crm/"))) {
    return { id: "dashboard", path: "/dashboard", view: "global_dashboard", label: "Dashboard", section: "Overview", title: "Dashboard | BlackArrow" };
  }
  if (!INBOX_UI_ENABLED && (normalized === "/inbox" || normalized.startsWith("/inbox/"))) {
    return { id: "dashboard", path: "/dashboard", view: "global_dashboard", label: "Dashboard", section: "Overview", title: "Dashboard | BlackArrow" };
  }
  if (!isProductFeatureEnabled("personalAssistant") && (normalized === "/personal-assistant" || normalized.startsWith("/personal-assistant/"))) {
    return { id: "dashboard", path: "/dashboard", view: "global_dashboard", label: "Dashboard", section: "Overview", title: "Dashboard | BlackArrow" };
  }
  for (const route of DASHBOARD_ROUTE_REGISTRY) {
    if (route.path.toLowerCase() === normalized) {
      return route;
    }
  }
  for (const route of DASHBOARD_ROUTE_REGISTRY) {
    if (route.legacyAliases?.some((alias) => alias.toLowerCase() === normalized)) {
      return route;
    }
  }
  return null;
}

export function resolvePathByViewAndTab(view: string, tab?: string): string {
  if (tab) {
    const matchedWithTab = DASHBOARD_ROUTE_REGISTRY.find(
      (r) => r.view === view && r.tab === tab
    );
    if (matchedWithTab) return matchedWithTab.path;
  }
  const matchedViewOnly = DASHBOARD_ROUTE_REGISTRY.find(
    (r) => r.view === view && (!tab || !r.tab)
  );
  if (matchedViewOnly) return matchedViewOnly.path;
  const fallback = DASHBOARD_ROUTE_REGISTRY.find((r) => r.view === view);
  return fallback ? fallback.path : `/${view}`;
}
