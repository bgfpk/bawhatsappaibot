import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Bot, CheckCircle2, MessageSquare, RefreshCw, ShieldCheck, Smartphone, Wallet, X } from "lucide-react";
import { CustomerDetailDrawer } from "../../CustomerDetailDrawer";
import { ActionPanel, DashboardEmptyState, DashboardSection, MetricGrid, MetricTile, StatusBadge, ToneBadge, WorkspaceHero } from "../DashboardPrimitives";
import { dashboardToneClass, type DashboardTone } from "../dashboard-tone";
import { buildHomeCommandCenter } from "../../../services/home-command-center-service";
import { getInboxV2PriorityLabel } from "../../../services/inbox-v2-service";
import type { ClientOnboardingChecklist as ClientOnboardingChecklistModel, ClientOnboardingChecklistItem } from "../../../services/client-onboarding-checklist-service";
import { CRM_UI_ENABLED, INBOX_UI_ENABLED } from "../../../config/product-flags";

type HomeCommandCenterPageProps = {
  userId: string;
  isOpen: boolean;
  onClose: () => void;
  onOpenInbox: () => void;
  onOpenView: (view: string) => void;
  onboardingChecklist: ClientOnboardingChecklistModel;
  onOpenOnboardingItem: (item: ClientOnboardingChecklistItem) => void;
  connectionLabel: string;
  selectedBotLabel: string;
  billingStatusLabel: string;
  walletBalance: number;
};

function formatHomeDate(value: any, includeTime = false) {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";
  return date.toLocaleString(undefined, includeTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" });
}

function customerIdOf(customer: any, fallback = 0) {
  return String(customer?.$id || customer?.id || customer?.customer_id || customer?.jid || `customer-${fallback}`);
}

function money(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "No revenue data";
  return `$${value.toFixed(value >= 100 ? 0 : 2)}`;
}

function waitingCustomerTone(queueFlags: string[]): DashboardTone {
  if (queueFlags.includes("needs_human")) return "rose";
  if (queueFlags.includes("overdue_followup")) return "amber";
  if (queueFlags.includes("unassigned")) return "blue";
  return "neutral";
}

export function HomeCommandCenterPage({
  userId,
  isOpen,
  onClose,
  onOpenInbox,
  onOpenView,
  onboardingChecklist,
  onOpenOnboardingItem,
  connectionLabel,
  selectedBotLabel,
  billingStatusLabel,
  walletBalance,
}: HomeCommandCenterPageProps) {
  const [customers, setCustomers] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [crmOverview, setCrmOverview] = useState<any>(null);
  const [profileCustomer, setProfileCustomer] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  const loadHome = async () => {
    if (!userId) return;
    setIsLoading(true);
    setLoadError("");
    try {
      const requests = [
        fetch(`/api/user/customers?userId=${encodeURIComponent(userId)}`),
        fetch(`/api/user/orders?userId=${encodeURIComponent(userId)}`),
        CRM_UI_ENABLED ? fetch("/api/user/crm/overview") : Promise.resolve(null),
      ];
      const [customersRes, ordersRes, crmRes] = await Promise.all(requests);
      const [customersData, ordersData, crmData] = await Promise.all([
        customersRes.ok ? customersRes.json() : [],
        ordersRes.ok ? ordersRes.json() : [],
        crmRes && "ok" in crmRes && crmRes.ok ? crmRes.json() : null,
      ]);
      setCustomers(Array.isArray(customersData) ? customersData : []);
      setOrders(Array.isArray(ordersData) ? ordersData : []);
      setCrmOverview(crmData || null);
    } catch {
      setLoadError("Some dashboard activity could not be refreshed. Your last loaded setup is still shown.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) loadHome();
  }, [isOpen, userId]);

  const home = useMemo(() => buildHomeCommandCenter({ customers, orders, crmOverview }), [customers, orders, crmOverview]);
  const customerMap = useMemo(() => new Map(customers.map((customer, index) => [customerIdOf(customer, index), customer])), [customers]);

  if (!isOpen) return null;

  const readyToGoLive = onboardingChecklist.launchReady;
  const visibleManualActions = home.manualActions.filter((action) => (CRM_UI_ENABLED || action.target !== "crm") && (INBOX_UI_ENABLED || action.target !== "inbox"));
  const attentionCount = home.needsAttention.length;
  const walletLabel = Number.isFinite(walletBalance) ? `$${Math.max(0, walletBalance).toFixed(2)}` : "$0.00";
  const connectionTone = /\b(?:connected|linked)\b/i.test(connectionLabel) ? "teal" : /scan qr code|preparing|connecting/i.test(connectionLabel) ? "amber" : "neutral";
  const readinessTone = readyToGoLive ? "brand" : "amber";
  const setupLabel = readyToGoLive
    ? "Setup complete"
    : onboardingChecklist.completedCoreCount === 5
      ? "Ready to go live"
      : `${onboardingChecklist.completedCoreCount} of 6 complete`;

  return (
    <div className="ca-home-canvas fixed inset-0 z-[64] overflow-x-hidden overflow-y-auto p-3 sm:p-5 lg:left-[18rem]">
      <WorkspaceHero
        eyebrow="Business Home"
        title="Your WhatsApp business overview"
        description="See connection health, launch progress, customer activity, wallet readiness, and the next best action without digging through technical screens."
        icon={Smartphone}
        status={<><ToneBadge tone={connectionTone as any}>{connectionLabel}</ToneBadge><ToneBadge tone="blue">{selectedBotLabel || "No instance selected"}</ToneBadge></>}
        actions={<><button onClick={loadHome} disabled={isLoading} className="ca-button-secondary gap-2 px-4"><RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} /> Refresh</button><button onClick={onClose} className="ca-button-quiet gap-2 px-4"><X className="h-4 w-4" /> Close</button></>}
      />

      {loadError ? (
        <div className="mb-5 flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200 sm:flex-row sm:items-center sm:justify-between">
          <span>{loadError}</span>
          <button type="button" onClick={loadHome} className="self-start font-black underline sm:self-auto">Retry</button>
        </div>
      ) : null}

      <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
        <MetricTile
          label="WhatsApp"
          value={connectionTone === "teal" ? "Connected" : connectionTone === "amber" ? "Connecting" : "Needs attention"}
          helper={selectedBotLabel || "Choose a WhatsApp number to connect and manage."}
          icon={Smartphone}
          tone={connectionTone as any}
        />
        <MetricTile
          label="AI Replies"
          value={onboardingChecklist.aiRepliesEnabled ? "On" : "Off"}
          helper={onboardingChecklist.aiRepliesEnabled ? "AI Chat Replies are active for this WhatsApp instance." : "Normal incoming messages remain visible. Saved flows, shortcuts and scheduled follow-ups can continue."}
          icon={Bot}
          tone={onboardingChecklist.aiRepliesEnabled ? "violet" : "neutral"}
        />
        <MetricTile
          label="Setup"
          value={<span className="block whitespace-normal text-xl leading-tight sm:text-2xl">{setupLabel}</span>}
          helper={readyToGoLive ? "Your core setup is complete." : onboardingChecklist.recommendedCoreItem ? `Next: ${onboardingChecklist.recommendedCoreItem.title}` : "Review your setup."}
          icon={CheckCircle2}
          tone={readinessTone as any}
        />
      </div>



      <section className="mt-5">
        <div className="mb-3">
          <p className="ca-eyebrow text-[var(--ca-cyan)]">Live activity</p>
          <h2 className="mt-1 text-xl font-bold">Today</h2>
          <p className="mt-1 text-sm text-[var(--ca-text-secondary)]">Customer activity and account status.</p>
        </div>
        <MetricGrid>
        <MetricTile
          label="AI replies today"
          value={`${home.snapshot.aiReplied} AI replies`}
          helper={`${home.snapshot.totalCustomers} customers • ${home.snapshot.orderCount} orders • ${money(home.snapshot.availableRevenue)} order value`}
          icon={MessageSquare}
          tone="violet"
        />
        <MetricTile label="Customers contacted" value={home.snapshot.totalCustomers} helper="Customers visible in this workspace." icon={MessageSquare} tone="teal" />
        <MetricTile
          label="Customers waiting"
          value={attentionCount}
          helper={`${home.snapshot.needsHuman} need a manual reply • ${home.snapshot.overdueFollowUps} overdue follow-ups`}
          icon={AlertTriangle}
          tone={attentionCount > 0 ? "rose" : "brand"}
        />
        <MetricTile label="Orders" value={home.snapshot.orderCount} helper="Orders visible in this workspace." icon={CheckCircle2} tone="amber" />
        <MetricTile label="Order value" value={money(home.snapshot.availableRevenue)} helper="Available order revenue data." icon={CheckCircle2} tone="cyan" />
        <MetricTile
          label="Wallet and billing"
          value={<span className="block whitespace-normal text-lg leading-tight sm:text-2xl">{billingStatusLabel}</span>}
          helper={`Wallet balance: ${walletLabel}`}
          icon={Wallet}
          tone="amber"
        />
      </MetricGrid>
      </section>

      <div className="mt-5 space-y-5">
        <DashboardSection className="p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-black">Customers waiting for you</h2>
                <ToneBadge tone={attentionCount > 0 ? "rose" : "neutral"}>{attentionCount}</ToneBadge>
              </div>
              <p className="mt-1 text-sm font-semibold text-[var(--ca-text-secondary)]">Manual replies, overdue follow-ups, and unassigned conversations that need a decision.</p>
            </div>
            {INBOX_UI_ENABLED ? (
              <button onClick={onOpenInbox} className="ca-button-secondary shrink-0 px-4">Open all chats</button>
            ) : (
              <button onClick={() => onOpenView("customers")} className="ca-button-secondary shrink-0 px-4">View customers</button>
            )}
          </div>
          {home.needsAttention.length === 0 ? (
            <DashboardEmptyState icon={ShieldCheck} title="No urgent customer issues right now" body="When someone needs a reply, follow-up, or assignment, they will appear here so you know what needs your attention first." tone="brand" />
          ) : (
            <div className="ca-customer-waiting-list">
              {home.needsAttention.map((row) => {
                const tone = waitingCustomerTone(row.queueFlags);
                return (
                <article key={row.id} className={`ca-customer-waiting-row ${dashboardToneClass(tone)} p-4`}>
                  <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(12rem,0.8fr)_minmax(16rem,1.4fr)_auto] md:items-center">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="ca-icon-well flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-black">{row.displayName.trim().charAt(0).toUpperCase() || "?"}</span>
                      <div className="min-w-0">
                        <h3 className="truncate font-black">{row.displayName}</h3>
                        <p className="mt-0.5 truncate font-mono text-xs font-semibold text-[var(--ca-text-muted)]">{row.phone || row.email || row.contactLabel || "No visible contact"}</p>
                      </div>
                    </div>
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-sm font-semibold leading-relaxed text-[var(--ca-text-secondary)]">{row.latestContextPreview || row.aiSummaryPreview || "No message preview saved yet."}</p>
                      {row.latestContextAt ? <p className="mt-1 text-xs font-semibold text-[var(--ca-text-muted)]">Last activity {formatHomeDate(row.latestContextAt, true)}</p> : null}
                    </div>
                    <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center md:flex-col md:items-end">
                      <StatusBadge tone={tone}>{getInboxV2PriorityLabel(row)}</StatusBadge>
                      <button onClick={() => setProfileCustomer(customerMap.get(row.customerId) || null)} className="ca-button-secondary w-full px-3 text-xs sm:w-auto">Review</button>
                    </div>
                  </div>
                </article>
              )})}
            </div>
          )}
        </DashboardSection>

        {readyToGoLive && visibleManualActions.length ? <ActionPanel tone="cyan" className="p-5">
            <h2 className="text-lg font-black">Suggested next step</h2>
            <p className="mt-1 text-sm font-semibold text-gray-500 dark:text-neutral-400">Choose an operational action for customer work.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {visibleManualActions.map((action) => (
                <button key={action.id} onClick={() => action.target === "inbox" ? onOpenInbox() : onOpenView(action.target)} className="w-full rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-1)] p-3 text-left hover:bg-[var(--ca-surface-3)]">
                  <span className="flex items-center justify-between gap-2 text-sm font-black">{action.label}<ArrowRight className="h-4 w-4" /></span>
                  <span className="mt-1 block text-xs font-semibold text-gray-500 dark:text-neutral-400">{action.reason}</span>
                </button>
              ))}
            </div>
          </ActionPanel> : null}
      </div>

      <CustomerDetailDrawer
        customer={profileCustomer}
        userId={userId}
        isOpen={Boolean(profileCustomer)}
        onClose={() => setProfileCustomer(null)}
        onSaved={(customer, nextProfile) => {
          setCustomers((prev) => prev.map((item, index) => customerIdOf(item, index) === customerIdOf(customer) ? { ...item, profile: nextProfile } : item));
          setProfileCustomer(null);
        }}
        formatDate={formatHomeDate}
      />
    </div>
  );
}
