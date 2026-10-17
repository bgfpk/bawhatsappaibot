import React, { useEffect, useState } from "react";
import {
  Banknote,
  BarChart3,
  Bot,
  CalendarClock,
  ChevronDown,
  ClipboardCheck,
  Database,
  LayoutDashboard,
  MessageSquare,
  Moon,
  Package,
  Puzzle,
  Settings,
  Shield,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Sun,
  Users,
  X,
} from "lucide-react";
import { BrandLogo } from "./BrandLogo";
import { HomeCommandCenterPage } from "./dashboard/pages/HomeCommandCenterPage";
import { InboxV2Page } from "./dashboard/pages/InboxV2Page";
import type { ClientOnboardingChecklist, ClientOnboardingChecklistItem } from "../services/client-onboarding-checklist-service";
import { dashboardToneClass, type DashboardTone } from "./dashboard/dashboard-tone";
import { INBOX_UI_ENABLED } from "../config/product-flags";

type LocalPanel = "homeV2" | "inboxV2";

type SidebarItem = {
  key?: string;
  view: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  action?: () => void;
  adminOnly?: boolean;
  aiTab?: string;
  adminTab?: string;
  analyticsTab?: string;
  billingTab?: string;
  localPanel?: LocalPanel;
  tone?: DashboardTone;
};

type AppSidebarProps = {
  activeView: string;
  activeAiTab?: string;
  activeAdminTab?: string;
  activeAnalyticsTab?: string;
  activeBillingTab?: string;
  currentUser: any;
  isAdmin: boolean;
  showGetStarted?: boolean;
  isDarkMode: boolean;
  isOpen: boolean;
  onClose: () => void;
  onSetView: (view: any) => void;
  onOpenAiTab?: (tab: string) => void;
  onOpenAdminTab?: (tab: string) => void;
  onOpenAnalyticsTab?: (tab: string) => void;
  onOpenBillingTab?: (tab: string) => void;
  onFetchOrders: () => void;
  onFetchCustomers: () => void;
  onFetchProducts: () => void;
  onShowLanding: () => void;
  onSignOut: () => void;
  onToggleDarkMode: () => void;
  notificationCenter?: React.ReactNode;
  onboardingChecklist: ClientOnboardingChecklist;
  onOpenOnboardingItem: (item: ClientOnboardingChecklistItem) => void;
  connectionLabel: string;
  selectedBotLabel: string;
  billingStatusLabel: string;
  walletBalance: number;
};

export function AppSidebar({
  activeView,
  activeAiTab,
  activeAdminTab,
  activeAnalyticsTab,
  activeBillingTab,
  currentUser,
  isAdmin,
  showGetStarted = true,
  isDarkMode,
  isOpen,
  onClose,
  onSetView,
  onOpenAiTab,
  onOpenAdminTab,
  onOpenAnalyticsTab,
  onOpenBillingTab,
  onFetchOrders,
  onFetchCustomers,
  onFetchProducts,
  onShowLanding,
  onSignOut,
  onToggleDarkMode,
  notificationCenter,
  onboardingChecklist,
  onOpenOnboardingItem,
  connectionLabel,
  selectedBotLabel,
  billingStatusLabel,
  walletBalance,
}: AppSidebarProps) {
  const [activeLocalPanel, setActiveLocalPanel] = useState<LocalPanel | null>(null);
  const isInboxV2Open = activeLocalPanel === "inboxV2";
  const isHomeV2Open = activeLocalPanel === "homeV2";

  const clientItems: Array<SidebarItem & { memberViews: string[] }> = [
    ...(showGetStarted
      ? [{ view: "get_started", label: "Get Started", description: "Setup checklist", icon: ClipboardCheck, tone: "brand" as const, memberViews: ["get_started"] }]
      : []),
    { view: "global_dashboard", label: "Home", description: "Business overview", icon: LayoutDashboard, tone: "brand", action: onFetchOrders, localPanel: "homeV2", memberViews: ["global_dashboard"] },
    { view: "business_assistant", label: "Business Assistant", description: "AI Assistant & Reminders", icon: Bot, tone: "brand", memberViews: ["business_assistant"] },
    ...(INBOX_UI_ENABLED
      ? [{ view: "dashboard", label: "Chats", description: "Inbox and customers", icon: MessageSquare, tone: "teal" as const, localPanel: "inboxV2" as const, memberViews: ["dashboard", "customers"] }]
      : [{ view: "customers", label: "Customers", description: "Profiles and directory", icon: Users, tone: "teal" as const, action: onFetchCustomers, memberViews: ["customers"] }]),
    { view: "orders", label: "Sales & Orders", description: "Catalog, leads, and orders", icon: ShoppingCart, tone: "amber", action: onFetchOrders, memberViews: ["products", "orders"] },
    { view: "marketing", label: "Automations", description: "Flows and campaigns", icon: CalendarClock, tone: "violet", memberViews: ["marketing", "broadcast", "customer_updates"] },
    { view: "ai", label: "Bot Setup", description: "Replies, knowledge, and rules", icon: Sparkles, tone: "violet", aiTab: "instructions", memberViews: ["ai"] },
    { view: "analytics", label: "Reports", description: "Business and usage reports", icon: BarChart3, tone: "cyan", analyticsTab: "performance", memberViews: ["analytics"] },
    { view: "selector", label: "Connections", description: "WhatsApp and integrations", icon: Puzzle, tone: "blue", memberViews: ["selector"] },
    { view: "billing", label: "Billing", description: "Plans, wallet, and payments", icon: Banknote, tone: "amber", billingTab: "overview", memberViews: ["billing"] },
    { view: "settings", label: "Settings", description: "Account, alerts, and security", icon: Settings, tone: "neutral", memberViews: ["settings", "notifications", "security"] },
  ];

  const adminItems: SidebarItem[] = [
        { key: "admin-dashboard", view: "admin", label: "Admin Dashboard", description: "System overview", icon: Shield, adminOnly: true, adminTab: "dashboard" },
        { key: "admin-users", view: "admin", label: "Accounts & Users", description: "Client access controls", icon: Users, adminOnly: true, adminTab: "users" },
        { key: "admin-directory", view: "admin", label: "Shared Directory", description: "Phone identity data", icon: Database, adminOnly: true, adminTab: "directory" },
        { key: "admin-smart-sales", view: "admin", label: "Smart Sales Control", description: "Global prompt tuning", icon: Sparkles, adminOnly: true, adminTab: "smart_sales" },
        { key: "admin-accounting", view: "admin", label: "Platform Accounting", description: "Revenue and cost reports", icon: Banknote, adminOnly: true, adminTab: "accounting" },
        { key: "admin-logs", view: "admin", label: "Logs", description: "Admin action history", icon: MessageSquare, adminOnly: true, adminTab: "logs" },
        { key: "admin-proxies", view: "admin", label: "System Proxies", description: "Proxy pool controls", icon: ShieldCheck, adminOnly: true, adminTab: "proxies" },
  ];

  const getItemKey = (item: SidebarItem) => item.key || item.view;

  const isItemActive = (item: SidebarItem) => {
    if (activeLocalPanel) return item.localPanel === activeLocalPanel;
    if (item.adminTab) return activeView === "admin" && (activeAdminTab === item.adminTab || (item.adminTab === "dashboard" && !activeAdminTab));
    if (item.aiTab) return activeView === "ai" && (activeAiTab === item.aiTab || (item.aiTab === "instructions" && !activeAiTab));
    if (item.analyticsTab) return activeView === "analytics" && (activeAnalyticsTab === item.analyticsTab || (item.analyticsTab === "performance" && !activeAnalyticsTab));
    if (item.billingTab) return activeView === "billing" && (activeBillingTab === item.billingTab || (item.billingTab === "overview" && !activeBillingTab));
    if (item.view === "ai") return activeView === "ai" && (!activeAiTab || activeAiTab === "instructions");
    return activeView === item.view;
  };

  const [adminOpen, setAdminOpen] = useState(activeView === "admin");
  const [openFooterMenu, setOpenFooterMenu] = useState<"account" | null>(null);

  useEffect(() => {
    if (activeView === "admin") setAdminOpen(true);
  }, [activeView]);

  useEffect(() => {
    if (!openFooterMenu) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenFooterMenu(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [openFooterMenu]);

  const openItem = (item: SidebarItem) => {
    if (item.localPanel) {
      setActiveLocalPanel(item.localPanel);
      onSetView(item.view);
      item.action?.();
      if (typeof window !== "undefined" && window.innerWidth < 1024) onClose();
      return;
    }
    setActiveLocalPanel(null);
    if (item.aiTab) onOpenAiTab?.(item.aiTab);
    if (item.adminTab) onOpenAdminTab?.(item.adminTab);
    if (item.analyticsTab) onOpenAnalyticsTab?.(item.analyticsTab);
    if (item.billingTab) onOpenBillingTab?.(item.billingTab);
    onSetView(item.view);
    item.action?.();
    if (typeof window !== "undefined" && window.innerWidth < 1024) onClose();
  };

  const openMainSettings = () => {
    setActiveLocalPanel(null);
    setOpenFooterMenu(null);
    onSetView("settings");
    if (typeof window !== "undefined" && window.innerWidth < 1024) onClose();
  };

  const renderItem = (item: SidebarItem & { memberViews?: string[] }) => {
    if (item.adminOnly && !isAdmin) return null;
    const Icon = item.icon;
    const isActive = item.label === "Bot Setup"
      ? activeView === "ai" && activeAiTab !== "integrations"
      : item.label === "Connections"
        ? activeView === "selector" || (activeView === "ai" && activeAiTab === "integrations")
      : item.memberViews
      ? item.memberViews.includes(activeView) || Boolean(item.localPanel && activeLocalPanel === item.localPanel)
      : isItemActive(item);

    return (
      <button
        key={getItemKey(item)}
        onClick={() => openItem(item)}
        className={`ca-sidebar-item ${dashboardToneClass(item.tone)} group relative w-full rounded-xl px-3 py-2.5 text-left`}
        aria-current={isActive ? "page" : undefined}
      >
        <div className="flex items-center gap-3">
          <div className="ca-icon-well flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-bold tracking-[-0.01em]">{item.label}</div>
            <div className="truncate text-[13px] text-[var(--ca-text-muted)]">{item.description}</div>
          </div>
        </div>
      </button>
    );
  };

  const renderAdminGroup = () => {
    if (!isAdmin) return null;
    return (
      <div className="mt-3 border-t border-gray-200 pt-3 dark:border-white/10">
        <button
          type="button"
          onClick={() => setAdminOpen((value) => !value)}
          className={`mb-1.5 flex w-full items-center justify-between gap-2 rounded-xl px-2 py-1.5 text-left transition-colors ${
            activeView === "admin" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/28 dark:text-emerald-300" : "text-gray-400 hover:bg-gray-100/70 hover:text-gray-700 dark:text-neutral-500 dark:hover:bg-white/[0.045] dark:hover:text-neutral-300"
          }`}
        >
          <span className="min-w-0">
            <span className="block text-xs font-black">Admin</span>
            {adminOpen ? <span className="mt-0.5 block truncate text-[10px] font-bold opacity-70">Platform controls</span> : null}
          </span>
          <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${adminOpen ? "rotate-0" : "-rotate-90"}`} />
        </button>
        {adminOpen && <div className="space-y-1.5">{adminItems.map(renderItem)}</div>}
      </div>
    );
  };

  const accountInitials = String(currentUser?.name || currentUser?.email || "Account")
    .substring(0, 2)
    .toUpperCase();
  const currentUserId = currentUser?.id || currentUser?.$id || "";

  const openViewFromLocalPanel = (view: string) => {
    setActiveLocalPanel(null);
    onSetView(view);
    if (typeof window !== "undefined" && window.innerWidth < 1024) onClose();
  };

  return (
    <>
    <aside className={`ca-sidebar fixed left-0 top-0 z-[70] flex h-[100dvh] w-[17rem] shrink-0 flex-col border-r p-4 transition-transform duration-200 lg:sticky xl:w-[18rem] ${isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <a className="min-w-0 cursor-pointer text-left transition-opacity hover:opacity-80" href="/" aria-label="BlackArrow home" title="Go to homepage">
          <BrandLogo isDarkMode={isDarkMode} imageClassName="h-9 w-auto" />
        </a>
        <button
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 text-gray-500 lg:hidden dark:border-white/10 dark:text-neutral-400"
          title="Close menu"
          aria-label="Close menu"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <nav className="custom-scrollbar flex-1 space-y-1 overflow-y-auto pr-1.5">
        {clientItems.map(renderItem)}
        {renderAdminGroup()}
      </nav>

      {openFooterMenu && (
        <button
          type="button"
          className="fixed inset-0 z-[80] cursor-default bg-transparent"
          aria-label="Close sidebar menu"
          onClick={() => setOpenFooterMenu(null)}
        />
      )}

      <div className="ca-sidebar-account relative mt-4 rounded-2xl p-3">
        {openFooterMenu === "account" && (
          <div className="absolute bottom-[4.8rem] left-0 right-0 z-[90] rounded-2xl border border-gray-200 bg-white p-2 shadow-2xl dark:border-neutral-800 dark:bg-neutral-900">
            <div className="mb-1 rounded-xl px-3 py-2">
              <p className="truncate text-xs font-black text-gray-900 dark:text-neutral-50">{currentUser?.name || "Business account"}</p>
              {currentUser?.email ? <p className="mt-0.5 truncate text-[11px] font-semibold text-gray-400 dark:text-neutral-500">{currentUser.email}</p> : null}
            </div>
            <button
              type="button"
              onClick={onSignOut}
              className="flex w-full items-center gap-3 rounded-xl border border-red-100 px-3 py-2.5 text-left text-xs font-black text-red-500 transition-colors hover:bg-red-50 dark:border-red-900/40 dark:text-red-400 dark:hover:bg-red-950/30"
            >
              <X className="h-4 w-4" /> Sign out
            </button>
          </div>
        )}

        <div className="flex items-center gap-3">
          <div className="ca-icon-well ca-tone-brand flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold uppercase">
            {accountInitials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-gray-900 dark:text-neutral-50">{currentUser?.name || "Business account"}</p>
            <p className="truncate text-xs font-medium text-gray-500 dark:text-neutral-500">Workspace account</p>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            onClick={openMainSettings}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100 text-gray-600 transition-colors hover:bg-gray-200 dark:bg-white/[0.055] dark:text-neutral-300 dark:hover:bg-white/10"
            title="Open settings"
            aria-label="Open settings"
          >
            <Settings className="h-4 w-4" />
          </button>
          <button
            onClick={() => setOpenFooterMenu(openFooterMenu === "account" ? null : "account")}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100 text-gray-600 transition-colors hover:bg-gray-200 dark:bg-white/[0.055] dark:text-neutral-300 dark:hover:bg-white/10"
            title="Account menu"
            aria-label="Account menu"
          >
            <Users className="h-4 w-4" />
          </button>
          <button
            onClick={onToggleDarkMode}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100 text-gray-600 transition-colors hover:bg-gray-200 dark:bg-white/[0.055] dark:text-neutral-300 dark:hover:bg-white/10"
            title="Toggle theme"
            aria-label="Toggle theme"
          >
            {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          {notificationCenter}
        </div>
      </div>
    </aside>
    <HomeCommandCenterPage
      userId={currentUserId}
      isOpen={isHomeV2Open}
      onClose={() => setActiveLocalPanel(null)}
      onOpenInbox={() => (INBOX_UI_ENABLED ? setActiveLocalPanel("inboxV2") : onSetView("customers"))}
      onOpenView={openViewFromLocalPanel}
      onboardingChecklist={onboardingChecklist}
      onOpenOnboardingItem={onOpenOnboardingItem}
      connectionLabel={connectionLabel}
      selectedBotLabel={selectedBotLabel}
      billingStatusLabel={billingStatusLabel}
      walletBalance={walletBalance}
    />
    {INBOX_UI_ENABLED && (
      <InboxV2Page userId={currentUserId} isOpen={isInboxV2Open} onClose={() => setActiveLocalPanel(null)} />
    )}
    </>
  );
}
