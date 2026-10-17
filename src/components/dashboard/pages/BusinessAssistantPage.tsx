import React, { useEffect, useState } from "react";
import {
  Sparkles,
  ShieldCheck,
  Bell,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Plus,
  DollarSign,
  Activity,
  Layers,
  Phone,
  Radio,
  Lock,
  TrendingUp,
  Settings as SettingsIcon,
  Check,
  Ban,
  Globe,
  Key,
  Copy,
  ShieldAlert,
  Search,
} from "lucide-react";

interface BusinessAssistantOverview {
  enabled: boolean;
  businessAssistantEnabled?: boolean;
  adminPhone?: string;
  adminPhoneMasked?: string;
  authorizedAdminPhone: string;
  rawAdminPhone: string;
  isVerified?: boolean;
  role: string;
  instanceConnected: boolean;
  instanceName?: string;
  instancePhone?: string;
  instancePhoneMasked?: string;
  accountTimezone?: string;
  effectiveTimezone?: string;
  hasConfiguredTimezone?: boolean;
  canManagePairing?: boolean;
  walletBalance: number;
  repliesToday: number;
  costToday: number;
  pendingRemindersCount: number;
  stats: {
    customersCount: number;
    active7dCount: number;
    ordersCount: number;
    productsCount: number;
    servicesCount: number;
  };
}

interface AdminReminder {
  reminderId: string;
  text: string;
  scheduledAtMs: number;
  scheduledAtIso: string;
  formattedTime: string;
  timezone: string;
  status: "pending" | "sent" | "failed" | "cancelled";
  createdAt: number;
  updatedAt: number;
  error?: string | null;
}

interface CapabilityItem {
  actionId: string;
  category: string;
  label: string;
  description: string;
  riskLevel: string;
  requiredRole: string;
  requiresConfirmation: boolean;
  isDashboardOnly: boolean;
}

interface AuditEvent {
  id: string;
  adminJidMasked: string;
  actionId: string;
  riskLevel: string;
  timestamp: number;
  confirmationRequired: boolean;
  confirmationResult?: string;
  executionResult: string;
  failureReason?: string;
  durationMs?: number;
}

interface UsageData {
  messagesToday: number;
  spendToday: number;
  spend7d: number;
  walletBalance: number;
  transactions: any[];
}

interface AssistantSettingsState {
  enabled: boolean;
  adminPhone: string;
  accountTimezone: string;
}

const COMMON_TIMEZONES = [
  "Asia/Karachi",
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Singapore",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "UTC",
];

export const BusinessAssistantPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"overview" | "reminders" | "usage" | "capabilities" | "activity" | "settings">("overview");
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<BusinessAssistantOverview | null>(null);
  const [reminders, setReminders] = useState<AdminReminder[]>([]);
  const [reminderFilter, setReminderFilter] = useState<string>("all");
  const [capabilities, setCapabilities] = useState<CapabilityItem[]>([]);
  const [activity, setActivity] = useState<AuditEvent[]>([]);
  const [usage, setUsage] = useState<UsageData | null>(null);

  // Settings State
  const [settings, setSettings] = useState<AssistantSettingsState>({
    enabled: true,
    adminPhone: "",
    accountTimezone: "",
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);

  // Modal / Inline Reminder Management
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newReminderText, setNewReminderText] = useState("");
  const [newReminderDateTime, setNewReminderDateTime] = useState("");
  const [creatingReminder, setCreatingReminder] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [reschedulingId, setReschedulingId] = useState<string | null>(null);
  const [rescheduleDateTime, setRescheduleDateTime] = useState("");

  // Pairing State
  const [showPairingModal, setShowPairingModal] = useState(false);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingExpiry, setPairingExpiry] = useState<number | null>(null);
  const [pairingLoading, setPairingLoading] = useState(false);
  const [pairingFeedback, setPairingFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  // Capability Filters
  const [capabilityCategory, setCapabilityCategory] = useState<string>("all");
  const [capabilitySearch, setCapabilitySearch] = useState<string>("");

  const fetchOverview = async () => {
    try {
      const res = await fetch("/api/business-assistant/overview");
      const data = await res.json();
      if (data.success) {
        setOverview(data);
        setSettings({
          enabled: data.enabled ?? true,
          adminPhone: data.rawAdminPhone || "",
          accountTimezone: data.accountTimezone || "",
        });
      }
    } catch (err) {
      console.error("Failed to load business assistant overview:", err);
    }
  };

  const fetchReminders = async (status = reminderFilter) => {
    try {
      const queryStatus = status === "completed" ? "sent" : status;
      const res = await fetch(`/api/business-assistant/reminders?status=${queryStatus}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.reminders)) {
        setReminders(data.reminders);
      }
    } catch (err) {
      console.error("Failed to load reminders:", err);
    }
  };

  const fetchCapabilities = async () => {
    try {
      const res = await fetch("/api/business-assistant/capabilities");
      const data = await res.json();
      if (data.success && Array.isArray(data.capabilities)) {
        setCapabilities(data.capabilities);
      }
    } catch (err) {
      console.error("Failed to load capabilities:", err);
    }
  };

  const fetchActivity = async () => {
    try {
      const res = await fetch("/api/business-assistant/activity?limit=50");
      const data = await res.json();
      if (data.success && Array.isArray(data.events)) {
        setActivity(data.events);
      }
    } catch (err) {
      console.error("Failed to load activity:", err);
    }
  };

  const fetchUsage = async () => {
    try {
      const res = await fetch("/api/business-assistant/usage");
      const data = await res.json();
      if (data.success) {
        setUsage(data);
      }
    } catch (err) {
      console.error("Failed to load usage data:", err);
    }
  };

  const loadAll = async () => {
    setLoading(true);
    await Promise.all([
      fetchOverview(),
      fetchReminders(),
      fetchCapabilities(),
      fetchActivity(),
      fetchUsage(),
    ]);
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsMessage(null);
    try {
      const res = await fetch("/api/business-assistant/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (data.success) {
        setSettingsMessage("Assistant settings saved successfully!");
        await fetchOverview();
      } else {
        setSettingsMessage(data.message || "Failed to save settings.");
      }
    } catch (err: any) {
      setSettingsMessage(err.message || "Network error saving settings.");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleRequestPairingCode = async () => {
    setPairingLoading(true);
    setPairingFeedback(null);
    try {
      const res = await fetch("/api/business-assistant/pairing/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: settings.adminPhone }),
      });
      const data = await res.json();
      if (data.success) {
        setPairingCode(data.challengeCode);
        setPairingExpiry(data.expiresAt);
        setShowPairingModal(true);
      } else {
        setPairingFeedback({ type: "error", text: data.message || "Failed to generate pairing code" });
      }
    } catch (err: any) {
      setPairingFeedback({ type: "error", text: err?.message || "Pairing request failed" });
    } finally {
      setPairingLoading(false);
    }
  };

  const handleCheckPairingStatus = async () => {
    setPairingLoading(true);
    setPairingFeedback(null);
    try {
      const res = await fetch("/api/business-assistant/overview");
      const data = await res.json();
      if (data?.success && data?.isVerified) {
        setPairingFeedback({ type: "success", text: "✅ WhatsApp number verified successfully!" });
        setOverview(data);
        setTimeout(() => setShowPairingModal(false), 1200);
      } else {
        setPairingFeedback({
          type: "error",
          text: `Verification pending. Send "PAIR ${pairingCode || "<code>"}" directly from WhatsApp (+${overview?.authorizedAdminPhone || settings.adminPhone}) to your bot.`,
        });
      }
    } catch (err: any) {
      setPairingFeedback({ type: "error", text: err?.message || "Status check failed" });
    } finally {
      setPairingLoading(false);
    }
  };

  const handleRevokePairing = async () => {
    if (!window.confirm("Are you sure you want to revoke Admin WhatsApp pairing? Privileged actions will be suspended immediately.")) return;
    try {
      const res = await fetch("/api/business-assistant/pairing/revoke", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        await fetchOverview();
      }
    } catch (err) {
      console.error("Revocation error:", err);
    }
  };

  const handleCreateReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReminderText.trim() || !newReminderDateTime) {
      setCreateError("Please provide both reminder text and a future date/time.");
      return;
    }

    setCreatingReminder(true);
    setCreateError(null);

    try {
      const res = await fetch("/api/business-assistant/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: newReminderText,
          scheduledAt: newReminderDateTime,
          timezone: overview?.accountTimezone || overview?.effectiveTimezone || "",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setCreateError(data.message || "Failed to create reminder.");
      } else {
        setShowCreateModal(false);
        setNewReminderText("");
        setNewReminderDateTime("");
        await fetchReminders();
        await fetchOverview();
      }
    } catch (err: any) {
      setCreateError(err.message || "Network error.");
    } finally {
      setCreatingReminder(false);
    }
  };

  const handleCancelReminder = async (id: string) => {
    if (!confirm("Are you sure you want to cancel this reminder?")) return;
    try {
      const res = await fetch(`/api/business-assistant/reminders/${id}/cancel`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        await fetchReminders();
        await fetchOverview();
      }
    } catch (err) {
      console.error("Failed to cancel reminder:", err);
    }
  };

  const handleRescheduleReminder = async (id: string) => {
    if (!rescheduleDateTime) return;
    try {
      const res = await fetch(`/api/business-assistant/reminders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduledAt: rescheduleDateTime,
          timezone: overview?.accountTimezone || overview?.effectiveTimezone || "",
        }),
      });
      const data = await res.json();
      if (data.success) {
        setReschedulingId(null);
        setRescheduleDateTime("");
        await fetchReminders();
      }
    } catch (err) {
      console.error("Failed to reschedule reminder:", err);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--ca-bg-main)] text-[var(--ca-text-primary)] p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--ca-border-subtle)] pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-emerald-500/20 to-teal-500/20 text-emerald-400 border border-emerald-500/30">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[var(--ca-text-primary)]">Business Assistant Hub</h1>
              <p className="text-sm text-[var(--ca-text-secondary)]">WhatsApp Admin AI Assistant, Scheduled Reminders & Tool Execution</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadAll}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold bg-[var(--ca-bg-card)] border border-[var(--ca-border-subtle)] hover:bg-[var(--ca-bg-hover)] transition"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950/20 transition"
          >
            <Plus className="h-4 w-4" />
            New Reminder
          </button>
        </div>
      </div>

      {/* Top Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Status Card */}
        <div className="p-4 rounded-2xl bg-[var(--ca-bg-card)] border border-[var(--ca-border-subtle)] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--ca-text-secondary)]">Assistant Status</span>
            <div className={`h-2.5 w-2.5 rounded-full ${overview?.instanceConnected ? "bg-emerald-500 shadow-sm shadow-emerald-500/50 animate-pulse" : "bg-amber-500"}`} />
          </div>
          <div className="mt-3">
            <div className="text-lg font-bold text-[var(--ca-text-primary)] flex items-center gap-2">
              <Radio className="h-4 w-4 text-emerald-400" />
              {overview?.instanceConnected ? "Connected" : "Standby"}
            </div>
            <p className="text-xs text-[var(--ca-text-secondary)] mt-0.5">
              {overview?.instanceName || "Primary WhatsApp Assistant"}
            </p>
          </div>
        </div>

        {/* Security / Role Card */}
        <div className="p-4 rounded-2xl bg-[var(--ca-bg-card)] border border-[var(--ca-border-subtle)] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--ca-text-secondary)]">Access Control</span>
            <ShieldCheck className="h-4 w-4 text-teal-400" />
          </div>
          <div className="mt-3">
            <div className="text-lg font-bold text-[var(--ca-text-primary)] uppercase">
              {overview?.role || "ADMIN"}
            </div>
            <p className="text-xs text-[var(--ca-text-secondary)] mt-0.5 font-mono">
              {overview?.authorizedAdminPhone || "Admin phone not set"}
            </p>
          </div>
        </div>

        {/* Reminders Card */}
        <div className="p-4 rounded-2xl bg-[var(--ca-bg-card)] border border-[var(--ca-border-subtle)] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--ca-text-secondary)]">Pending Reminders</span>
            <Clock className="h-4 w-4 text-amber-400" />
          </div>
          <div className="mt-3">
            <div className="text-lg font-bold text-[var(--ca-text-primary)]">
              {overview?.pendingRemindersCount ?? 0}
            </div>
            <p className="text-xs text-[var(--ca-text-secondary)] mt-0.5">
              Automated delivery via WhatsApp
            </p>
          </div>
        </div>

        {/* Cost / Wallet Card */}
        <div className="p-4 rounded-2xl bg-[var(--ca-bg-card)] border border-[var(--ca-border-subtle)] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--ca-text-secondary)]">Wallet Balance</span>
            <DollarSign className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-3">
            <div className="text-lg font-bold text-emerald-400">
              ${(overview?.walletBalance ?? 0).toFixed(3)}
            </div>
            <p className="text-xs text-[var(--ca-text-secondary)] mt-0.5">
              {overview?.repliesToday ?? 0} replies today (${(overview?.costToday ?? 0).toFixed(3)})
            </p>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-[var(--ca-border-subtle)] overflow-x-auto pb-2">
        <button
          onClick={() => setActiveTab("overview")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
            activeTab === "overview"
              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
              : "text-[var(--ca-text-secondary)] hover:text-[var(--ca-text-primary)] hover:bg-[var(--ca-bg-card)]"
          }`}
        >
          <Activity className="h-3.5 w-3.5" />
          Overview & Snapshot
        </button>
        <button
          onClick={() => setActiveTab("reminders")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
            activeTab === "reminders"
              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
              : "text-[var(--ca-text-secondary)] hover:text-[var(--ca-text-primary)] hover:bg-[var(--ca-bg-card)]"
          }`}
        >
          <Bell className="h-3.5 w-3.5" />
          Reminders Hub ({reminders.length})
        </button>
        <button
          onClick={() => setActiveTab("usage")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
            activeTab === "usage"
              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
              : "text-[var(--ca-text-secondary)] hover:text-[var(--ca-text-primary)] hover:bg-[var(--ca-bg-card)]"
          }`}
        >
          <TrendingUp className="h-3.5 w-3.5" />
          Usage & Cost
        </button>
        <button
          onClick={() => setActiveTab("capabilities")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
            activeTab === "capabilities"
              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
              : "text-[var(--ca-text-secondary)] hover:text-[var(--ca-text-primary)] hover:bg-[var(--ca-bg-card)]"
          }`}
        >
          <Layers className="h-3.5 w-3.5" />
          Capabilities ({capabilities.length})
        </button>
        <button
          onClick={() => setActiveTab("activity")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
            activeTab === "activity"
              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
              : "text-[var(--ca-text-secondary)] hover:text-[var(--ca-text-primary)] hover:bg-[var(--ca-bg-card)]"
          }`}
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          Action Audit ({activity.length})
        </button>
        <button
          onClick={() => setActiveTab("settings")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
            activeTab === "settings"
              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
              : "text-[var(--ca-text-secondary)] hover:text-[var(--ca-text-primary)] hover:bg-[var(--ca-bg-card)]"
          }`}
        >
          <SettingsIcon className="h-3.5 w-3.5" />
          Assistant Settings
        </button>
      </div>

      {/* Tab 1: Overview */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Live Business Snapshot */}
            <div className="p-6 rounded-2xl bg-[var(--ca-bg-card)] border border-[var(--ca-border-subtle)] space-y-4">
              <h2 className="text-base font-bold text-[var(--ca-text-primary)] flex items-center gap-2">
                <Activity className="h-5 w-5 text-teal-400" />
                Live Business Snapshot
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-[var(--ca-bg-main)] border border-[var(--ca-border-subtle)] text-center">
                  <div className="text-2xl font-extrabold text-[var(--ca-text-primary)]">{overview?.stats.customersCount ?? 0}</div>
                  <div className="text-xs font-semibold text-[var(--ca-text-secondary)] mt-1">Total Customers</div>
                </div>
                <div className="p-4 rounded-xl bg-[var(--ca-bg-main)] border border-[var(--ca-border-subtle)] text-center">
                  <div className="text-2xl font-extrabold text-emerald-400">{overview?.stats.active7dCount ?? 0}</div>
                  <div className="text-xs font-semibold text-[var(--ca-text-secondary)] mt-1">7-Day Active</div>
                </div>
                <div className="p-4 rounded-xl bg-[var(--ca-bg-main)] border border-[var(--ca-border-subtle)] text-center">
                  <div className="text-2xl font-extrabold text-blue-400">{overview?.stats.ordersCount ?? 0}</div>
                  <div className="text-xs font-semibold text-[var(--ca-text-secondary)] mt-1">Total Orders</div>
                </div>
                <div className="p-4 rounded-xl bg-[var(--ca-bg-main)] border border-[var(--ca-border-subtle)] text-center">
                  <div className="text-2xl font-extrabold text-amber-400">
                    {(overview?.stats.productsCount ?? 0) + (overview?.stats.servicesCount ?? 0)}
                  </div>
                  <div className="text-xs font-semibold text-[var(--ca-text-secondary)] mt-1">Catalog Items</div>
                </div>
              </div>
            </div>

            {/* Quick How-to Card */}
            <div className="p-6 rounded-2xl bg-[var(--ca-bg-card)] border border-[var(--ca-border-subtle)] space-y-4">
              <h2 className="text-base font-bold text-[var(--ca-text-primary)] flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-emerald-400" />
                How to Use Your Business Assistant
              </h2>
              <p className="text-xs text-[var(--ca-text-secondary)] leading-relaxed">
                Your Business Assistant runs natively on your connected WhatsApp instance. As the authorized administrator, you can message your business WhatsApp number anytime to request sales summaries, query orders, create reminders, manage campaigns, or check system health.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div className="p-3 rounded-xl bg-[var(--ca-bg-main)] border border-[var(--ca-border-subtle)]">
                  <div className="text-xs font-bold text-emerald-400">📊 Business Intelligence</div>
                  <div className="text-[11px] text-[var(--ca-text-secondary)] mt-1">"Summary of today's sales", "How many active customers this week?"</div>
                </div>
                <div className="p-3 rounded-xl bg-[var(--ca-bg-main)] border border-[var(--ca-border-subtle)]">
                  <div className="text-xs font-bold text-teal-400">⏰ Reminders & Follow-ups</div>
                  <div className="text-[11px] text-[var(--ca-text-secondary)] mt-1">"Remind me tomorrow at 10 AM to call vendor", "List my reminders"</div>
                </div>
                <div className="p-3 rounded-xl bg-[var(--ca-bg-main)] border border-[var(--ca-border-subtle)]">
                  <div className="text-xs font-bold text-amber-400">📦 Orders & Catalog</div>
                  <div className="text-[11px] text-[var(--ca-text-secondary)] mt-1">"Check order status for 0313...", "List my products"</div>
                </div>
                <div className="p-3 rounded-xl bg-[var(--ca-bg-main)] border border-[var(--ca-border-subtle)]">
                  <div className="text-xs font-bold text-purple-400">⚙️ Instance Controls</div>
                  <div className="text-[11px] text-[var(--ca-text-secondary)] mt-1">"Pause AI for 2 hours", "Sync WooCommerce catalog"</div>
                </div>
              </div>
            </div>
          </div>

          {/* Access & Security Sidebar Card */}
          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-[var(--ca-bg-card)] border border-[var(--ca-border-subtle)] space-y-4">
              <h2 className="text-base font-bold text-[var(--ca-text-primary)] flex items-center gap-2">
                <Lock className="h-5 w-5 text-emerald-400" />
                Access & Security
              </h2>
              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-[var(--ca-text-secondary)] block">Authorized Admin Phone</span>
                  <div className="flex items-center justify-between gap-2 mt-1">
                    <span className="font-mono font-bold text-[var(--ca-text-primary)] text-sm">
                      {overview?.authorizedAdminPhone || overview?.adminPhoneMasked || "No admin number configured"}
                    </span>
                    {overview?.isVerified ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                        <CheckCircle2 className="h-3 w-3" />
                        Verified
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                        <AlertTriangle className="h-3 w-3" />
                        Unverified
                      </span>
                    )}
                  </div>
                  <div className="mt-2.5">
                    {!overview?.isVerified ? (
                      <button
                        onClick={handleRequestPairingCode}
                        disabled={pairingLoading || (!overview?.rawAdminPhone && !overview?.adminPhone)}
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition disabled:opacity-50"
                      >
                        <Key className="h-3.5 w-3.5" />
                        {pairingLoading ? "Generating..." : "Pair WhatsApp"}
                      </button>
                    ) : (
                      <button
                        onClick={handleRevokePairing}
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-bold transition"
                      >
                        <ShieldAlert className="h-3.5 w-3.5" />
                        Revoke Pairing
                      </button>
                    )}
                  </div>
                </div>
                {overview?.instancePhoneMasked && (
                  <div>
                    <span className="text-[var(--ca-text-secondary)] block">Connected Bot Number</span>
                    <span className="font-mono font-bold text-[var(--ca-text-primary)] text-xs block mt-0.5">
                      {overview.instancePhoneMasked} {overview.instanceName ? `(${overview.instanceName})` : ""}
                    </span>
                  </div>
                )}
                <div>
                  <span className="text-[var(--ca-text-secondary)] block">Account Timezone</span>
                  <span className={`font-semibold text-xs flex items-center gap-1.5 mt-0.5 ${overview?.hasConfiguredTimezone || overview?.accountTimezone ? "text-emerald-400" : "text-amber-400"}`}>
                    <Globe className="h-3.5 w-3.5" />
                    {overview?.accountTimezone || (overview?.hasConfiguredTimezone ? overview?.effectiveTimezone : "Not Configured (Setup Required)")}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--ca-text-secondary)] block">Admin Role</span>
                  <span className="inline-block px-2 py-0.5 mt-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold uppercase text-[10px]">
                    {overview?.role || "ADMIN"}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--ca-text-secondary)] block">Security Policy</span>
                  <span className="text-[var(--ca-text-secondary)] leading-relaxed">
                    Only messages sent from the verified authorized phone can invoke private admin actions and view business telemetry.
                  </span>
                </div>
              </div>
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] leading-relaxed">
                Critical actions (like bulk campaigns or broad resets) require double-confirmation with a 60-second time-to-live.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Reminders Hub */}
      {activeTab === "reminders" && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              {[
                { key: "all", label: "All" },
                { key: "pending", label: "Pending" },
                { key: "completed", label: "Completed" },
                { key: "failed", label: "Failed" },
                { key: "cancelled", label: "Cancelled" },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => {
                    setReminderFilter(key);
                    fetchReminders(key);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                    reminderFilter === key
                      ? "bg-emerald-600 text-white"
                      : "bg-[var(--ca-bg-card)] text-[var(--ca-text-secondary)] border border-[var(--ca-border-subtle)] hover:bg-[var(--ca-bg-hover)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Reminder
            </button>
          </div>

          {reminders.length === 0 ? (
            <div className="p-12 text-center rounded-2xl bg-[var(--ca-bg-card)] border border-[var(--ca-border-subtle)] space-y-3">
              <Clock className="h-10 w-10 text-[var(--ca-text-secondary)] mx-auto opacity-40" />
              <h3 className="text-sm font-bold text-[var(--ca-text-primary)]">No reminders found</h3>
              <p className="text-xs text-[var(--ca-text-secondary)]">Create a reminder from the button above or by asking your Assistant on WhatsApp.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {reminders.map((r) => (
                <div key={r.reminderId} className="p-5 rounded-2xl bg-[var(--ca-bg-card)] border border-[var(--ca-border-subtle)] space-y-3 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        r.status === "pending"
                          ? "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                          : r.status === "sent"
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                          : r.status === "failed"
                          ? "bg-red-500/10 text-red-400 border border-red-500/30"
                          : "bg-gray-500/10 text-gray-400 border border-gray-500/30"
                      }`}>
                        {r.status === "sent" ? "completed" : r.status}
                      </span>
                      <span className="text-[11px] text-[var(--ca-text-secondary)]">{r.formattedTime || new Date(r.scheduledAtMs).toLocaleString()}</span>
                    </div>
                    <p className="text-sm font-bold text-[var(--ca-text-primary)] leading-snug">{r.text}</p>
                    {r.error && (
                      <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-[11px] text-red-400 font-medium">
                        Delivery issue: {r.error}
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-[var(--ca-border-subtle)] flex items-center justify-between gap-2">
                    {reschedulingId === r.reminderId ? (
                      <div className="flex items-center gap-2 w-full">
                        <input
                          type="datetime-local"
                          value={rescheduleDateTime}
                          onChange={(e) => setRescheduleDateTime(e.target.value)}
                          className="text-xs p-1.5 rounded-lg bg-[var(--ca-bg-main)] border border-[var(--ca-border-subtle)] text-[var(--ca-text-primary)] flex-1"
                        />
                        <button
                          onClick={() => handleRescheduleReminder(r.reminderId)}
                          className="p-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-500"
                          title="Confirm Reschedule"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setReschedulingId(null)}
                          className="p-1.5 rounded-lg bg-[var(--ca-bg-main)] text-[var(--ca-text-secondary)] text-xs"
                          title="Cancel"
                        >
                          <Ban className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        {(r.status === "pending" || r.status === "failed") && (
                          <button
                            onClick={() => {
                              setReschedulingId(r.reminderId);
                              setRescheduleDateTime("");
                            }}
                            className="text-xs text-emerald-400 hover:text-emerald-300 font-medium transition"
                          >
                            Reschedule
                          </button>
                        )}
                        {r.status === "pending" && (
                          <button
                            onClick={() => handleCancelReminder(r.reminderId)}
                            className="text-xs text-red-400 hover:text-red-300 font-medium transition"
                          >
                            Cancel
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Usage & Cost */}
      {activeTab === "usage" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl bg-[var(--ca-bg-card)] border border-[var(--ca-border-subtle)]">
              <span className="text-xs font-semibold text-[var(--ca-text-secondary)]">Today's Messages</span>
              <div className="text-2xl font-bold text-[var(--ca-text-primary)] mt-1">{usage?.messagesToday ?? 0}</div>
              <p className="text-xs text-emerald-400 mt-1">${(usage?.spendToday ?? 0).toFixed(4)} spent</p>
            </div>
            <div className="p-5 rounded-2xl bg-[var(--ca-bg-card)] border border-[var(--ca-border-subtle)]">
              <span className="text-xs font-semibold text-[var(--ca-text-secondary)]">7-Day Outbound Spend</span>
              <div className="text-2xl font-bold text-[var(--ca-text-primary)] mt-1">${(usage?.spend7d ?? 0).toFixed(4)}</div>
              <p className="text-xs text-[var(--ca-text-secondary)] mt-1">At $0.003 / successful AI call</p>
            </div>
            <div className="p-5 rounded-2xl bg-[var(--ca-bg-card)] border border-[var(--ca-border-subtle)]">
              <span className="text-xs font-semibold text-[var(--ca-text-secondary)]">Wallet Balance</span>
              <div className="text-2xl font-bold text-emerald-400 mt-1">${(usage?.walletBalance ?? 0).toFixed(3)}</div>
              <p className="text-xs text-[var(--ca-text-secondary)] mt-1">Credits auto-deducted</p>
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-[var(--ca-bg-card)] border border-[var(--ca-border-subtle)] space-y-4">
            <h2 className="text-base font-bold text-[var(--ca-text-primary)]">Pricing & Ledger Transparency</h2>
            <div className="p-4 rounded-xl bg-[var(--ca-bg-main)] border border-[var(--ca-border-subtle)] text-xs text-[var(--ca-text-secondary)] leading-relaxed space-y-2">
              <p>• <strong>Cost per AI call:</strong> $0.003 is billed only per successful AI provider call. Deterministic non-AI commands and failed requests are always $0.</p>
              <p>• <strong>Zero charges for:</strong> Inbound queries, internal evaluations, Customer 360 intelligence enrichment, failed messages, or dashboard UI interactions.</p>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Capabilities */}
      {activeTab === "capabilities" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[var(--ca-bg-card)] border border-[var(--ca-border-subtle)]">
            <div className="space-y-1">
              <h2 className="text-sm font-bold text-[var(--ca-text-primary)] flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-emerald-400" />
                Active Assistant Action Registry ({capabilities.length} Native Tools)
              </h2>
              <p className="text-xs text-[var(--ca-text-secondary)]">
                Derived directly from your central action registry. Access is strictly governed by your role (<strong className="uppercase text-[var(--ca-text-primary)]">{overview?.role || "ADMIN"}</strong>) and security risk tier.
              </p>
            </div>
            <div className="relative min-w-[220px]">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ca-text-secondary)]" />
              <input
                type="text"
                value={capabilitySearch}
                onChange={(e) => setCapabilitySearch(e.target.value)}
                placeholder="Search capabilities..."
                className="w-full text-xs pl-9 pr-3 py-2 rounded-xl bg-[var(--ca-bg-main)] border border-[var(--ca-border-subtle)] text-[var(--ca-text-primary)] focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {[
              { id: "all", label: `All Capabilities (${capabilities.length})` },
              { id: "business", label: "Business & Reports" },
              { id: "customers", label: "Customers" },
              { id: "products", label: "Products & Services" },
              { id: "orders", label: "Orders" },
              { id: "ai", label: "AI & Knowledge" },
              { id: "reminders", label: "Reminders" },
              { id: "followups", label: "Follow-ups & Broadcasts" },
              { id: "whatsapp", label: "WhatsApp Operations" },
              { id: "billing", label: "Billing & Ledger" },
              { id: "integrations", label: "Integrations" },
              { id: "security", label: "Team & Security" },
              { id: "proactive", label: "Proactive Manager" },
            ]
              .filter((cat) => {
                if (cat.id === "all") return true;
                return capabilities.some((c) => {
                  const cCat = (c.category || "").toLowerCase();
                  if (cat.id === "business") return cCat === "business" || cCat === "system" || cCat === "analytics" || cCat === "reports" || cCat === "live_monitor";
                  if (cat.id === "customers") return cCat === "customers" || cCat === "customer_updates";
                  if (cat.id === "products") return cCat === "products" || cCat === "courier";
                  if (cat.id === "orders") return cCat === "orders";
                  if (cat.id === "ai") return cCat === "ai" || cCat === "sequences" || cCat === "welcome" || cCat === "ai_content" || cCat === "ai_studio" || cCat === "knowledge" || cCat === "reply_settings" || cCat === "smart_sales" || cCat === "saved_replies";
                  if (cat.id === "reminders") return cCat === "reminders" || cCat === "operations";
                  if (cat.id === "followups") return cCat === "followups" || cCat === "broadcasts";
                  if (cat.id === "whatsapp") return cCat === "whatsapp" || cCat === "instance" || cCat === "instance_ops" || cCat === "media" || cCat === "confirmation_fields";
                  if (cat.id === "billing") return cCat === "billing" || cCat === "account";
                  if (cat.id === "integrations") return cCat === "integrations";
                  if (cat.id === "security") return cCat === "security" || cCat === "team" || cCat === "destructive" || cCat === "alerts";
                  if (cat.id === "proactive") return cCat === "proactive";
                  return false;
                });
              })
              .map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCapabilityCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                    capabilityCategory === cat.id
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "bg-[var(--ca-bg-card)] text-[var(--ca-text-secondary)] border border-[var(--ca-border-subtle)] hover:bg-[var(--ca-bg-hover)]"
                  }`}
                >
                  {cat.label}
                </button>
              ))}
          </div>

          {/* Filtered Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {capabilities
              .filter((c) => {
                const cat = (c.category || "").toLowerCase();
                const q = capabilitySearch.toLowerCase().trim();
                const matchesSearch = !q || c.label.toLowerCase().includes(q) || c.description.toLowerCase().includes(q) || c.actionId.toLowerCase().includes(q);

                if (!matchesSearch) return false;
                if (capabilityCategory === "all") return true;
                if (capabilityCategory === "business") return cat === "business" || cat === "system" || cat === "test" || cat === "analytics" || cat === "reports" || cat === "live_monitor";
                if (capabilityCategory === "customers") return cat === "customers" || cat === "customer_updates";
                if (capabilityCategory === "products") return cat === "products" || cat === "courier";
                if (capabilityCategory === "orders") return cat === "orders";
                if (capabilityCategory === "ai") return cat === "ai" || cat === "sequences" || cat === "welcome" || cat === "ai_content" || cat === "ai_studio" || cat === "knowledge" || cat === "reply_settings" || cat === "smart_sales" || cat === "saved_replies";
                if (capabilityCategory === "reminders") return cat === "reminders" || cat === "operations";
                if (capabilityCategory === "followups") return cat === "followups" || cat === "broadcasts";
                if (capabilityCategory === "whatsapp") return cat === "whatsapp" || cat === "instance" || cat === "instance_ops" || cat === "media" || cat === "confirmation_fields";
                if (capabilityCategory === "billing") return cat === "billing" || cat === "account";
                if (capabilityCategory === "integrations") return cat === "integrations";
                if (capabilityCategory === "security") return cat === "security" || cat === "team" || cat === "destructive" || cat === "alerts";
                if (capabilityCategory === "proactive") return cat === "proactive";
                return true;
              })
              .map((c) => (
                <div key={c.actionId} className="p-4 rounded-2xl bg-[var(--ca-bg-card)] border border-[var(--ca-border-subtle)] space-y-2 flex flex-col justify-between">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[var(--ca-text-primary)]">{c.label}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        c.riskLevel === "READ"
                          ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                          : c.riskLevel === "SAFE_WRITE"
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : c.riskLevel === "SENSITIVE_WRITE"
                          ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                          : "bg-red-500/10 text-red-400 border border-red-500/20"
                      }`}>
                        {c.riskLevel}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--ca-text-secondary)] leading-relaxed">{c.description}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[var(--ca-border-subtle)] text-[10px] text-[var(--ca-text-secondary)]">
                    <span className="font-mono bg-[var(--ca-bg-main)] px-1.5 py-0.5 rounded border border-[var(--ca-border-subtle)]">{c.actionId}</span>
                    <span>•</span>
                    <span>Role: <strong className="text-[var(--ca-text-primary)] uppercase">{c.requiredRole}</strong></span>
                    {c.requiresConfirmation && (
                      <>
                        <span>•</span>
                        <span className="text-amber-400 font-semibold">2-Step Confirmation</span>
                      </>
                    )}
                    {c.isDashboardOnly && (
                      <>
                        <span>•</span>
                        <span className="text-purple-400 font-semibold">Dashboard Only</span>
                      </>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Tab 5: Action Audit */}
      {activeTab === "activity" && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-[var(--ca-bg-card)] border border-[var(--ca-border-subtle)] text-xs text-[var(--ca-text-secondary)]">
            Audited execution log of all admin commands, reminders, and queries processed by the Business Assistant.
          </div>

          {activity.length === 0 ? (
            <div className="p-8 text-center rounded-2xl bg-[var(--ca-bg-card)] border border-[var(--ca-border-subtle)] text-xs text-[var(--ca-text-secondary)]">
              No recent audit events recorded.
            </div>
          ) : (
            <div className="space-y-2">
              {activity.map((ev) => (
                <div key={ev.id} className="p-3.5 rounded-xl bg-[var(--ca-bg-card)] border border-[var(--ca-border-subtle)] flex items-center justify-between gap-4 text-xs">
                  <div className="flex items-center gap-3">
                    <div className={`p-1.5 rounded-lg ${
                      ev.executionResult === "success"
                        ? "bg-emerald-500/10 text-emerald-400"
                        : ev.executionResult === "pending_confirmation"
                        ? "bg-amber-500/10 text-amber-400"
                        : "bg-red-500/10 text-red-400"
                    }`}>
                      {ev.executionResult === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                    </div>
                    <div>
                      <div className="font-bold text-[var(--ca-text-primary)]">{ev.actionId}</div>
                      <div className="text-[11px] text-[var(--ca-text-secondary)]">By {ev.adminJidMasked}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      ev.executionResult === "success" ? "text-emerald-400 bg-emerald-500/10" : "text-amber-400 bg-amber-500/10"
                    }`}>
                      {ev.executionResult}
                    </span>
                    <div className="text-[10px] text-[var(--ca-text-secondary)] mt-0.5">
                      {new Date(ev.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 6: Assistant Settings */}
      {activeTab === "settings" && (
        <div className="max-w-2xl space-y-6">
          <div className="p-6 rounded-2xl bg-[var(--ca-bg-card)] border border-[var(--ca-border-subtle)] space-y-6">
            <div className="flex items-center gap-3 border-b border-[var(--ca-border-subtle)] pb-4">
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <SettingsIcon className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-[var(--ca-text-primary)]">Assistant Configuration</h2>
                <p className="text-xs text-[var(--ca-text-secondary)]">Manage admin phone number pairing, alerts, and operational timezone.</p>
              </div>
            </div>

            {settingsMessage && (
              <div className={`p-3.5 rounded-xl text-xs font-semibold ${
                settingsMessage.includes("success")
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : "bg-red-500/10 text-red-400 border border-red-500/20"
              }`}>
                {settingsMessage}
              </div>
            )}

            <form onSubmit={handleSaveSettings} className="space-y-5">
              {/* Enable Toggle */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-[var(--ca-bg-main)] border border-[var(--ca-border-subtle)]">
                <div>
                  <label className="text-sm font-bold text-[var(--ca-text-primary)] block">
                    Business Assistant Engine
                  </label>
                  <p className="text-xs text-[var(--ca-text-secondary)] mt-0.5">
                    Enable or disable AI business assistant replies and reminder executions.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.enabled}
                  onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
                  className="h-5 w-5 rounded text-emerald-600 focus:ring-emerald-500 accent-emerald-500"
                />
              </div>

              {/* Admin WhatsApp Number */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[var(--ca-text-secondary)] block">
                  Authorized Admin WhatsApp Number
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Phone className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ca-text-secondary)]" />
                    <input
                      type="text"
                      value={settings.adminPhone}
                      onChange={(e) => setSettings({ ...settings, adminPhone: e.target.value })}
                      placeholder="+144225232320"
                      className="w-full text-xs pl-9 pr-3 py-2.5 rounded-xl bg-[var(--ca-bg-main)] border border-[var(--ca-border-subtle)] text-[var(--ca-text-primary)] focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-[var(--ca-text-secondary)]">
                  International format with country code (e.g. +923001234567 or +14155552671).
                </p>
              </div>

              {/* Pairing Status Banner */}
              <div className={`p-4 rounded-xl border ${
                overview?.isVerified
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                  : "bg-amber-500/10 border-amber-500/20 text-amber-300"
              } flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs`}>
                <div className="flex items-center gap-2.5">
                  {overview?.isVerified ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />
                  )}
                  <div>
                    <div className="font-bold text-[var(--ca-text-primary)]">
                      {overview?.isVerified ? "WhatsApp Number Verified" : "WhatsApp Number Unverified"}
                    </div>
                    <div className="text-[11px] opacity-80 mt-0.5">
                      {overview?.isVerified
                        ? `Paired as authorized administrator for this business.`
                        : `Admin commands will be ignored until this WhatsApp number is verified.`}
                    </div>
                  </div>
                </div>
                <div>
                  {!overview?.isVerified ? (
                    <button
                      type="button"
                      onClick={handleRequestPairingCode}
                      disabled={pairingLoading || !settings.adminPhone}
                      className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition whitespace-nowrap disabled:opacity-50"
                    >
                      <Key className="h-3.5 w-3.5 inline mr-1" />
                      Pair WhatsApp Now
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleRevokePairing}
                      className="px-3 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 font-bold text-xs transition whitespace-nowrap"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              </div>

              {/* Account Timezone */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-[var(--ca-text-secondary)] block">
                    Account Business Timezone
                  </label>
                  {!settings.accountTimezone && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      Setup Required
                    </span>
                  )}
                </div>
                <div className="relative">
                  <Globe className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ca-text-secondary)]" />
                  <select
                    value={settings.accountTimezone || ""}
                    onChange={(e) => setSettings({ ...settings, accountTimezone: e.target.value })}
                    className="w-full text-xs pl-9 pr-3 py-2.5 rounded-xl bg-[var(--ca-bg-main)] border border-[var(--ca-border-subtle)] text-[var(--ca-text-primary)] focus:outline-none focus:border-emerald-500"
                  >
                    {!settings.accountTimezone && (
                      <option value="">Select your business timezone...</option>
                    )}
                    {COMMON_TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-[11px] text-[var(--ca-text-secondary)]">
                  Reminders and sales digests will trigger according to this timezone schedule. Suggested: <span className="font-mono text-emerald-400">{typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC"}</span>.
                </p>
              </div>

              <div className="pt-3 border-t border-[var(--ca-border-subtle)] flex justify-end">
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition disabled:opacity-50"
                >
                  {savingSettings ? "Saving Settings..." : "Save Settings"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: New Reminder */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md p-6 rounded-2xl bg-[var(--ca-bg-card)] border border-[var(--ca-border-subtle)] shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-[var(--ca-text-primary)] flex items-center gap-2">
              <Bell className="h-5 w-5 text-emerald-400" />
              Schedule Admin Reminder
            </h3>
            {createError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                {createError}
              </div>
            )}
            <form onSubmit={handleCreateReminder} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-[var(--ca-text-secondary)] block mb-1">
                  Reminder Message / Text
                </label>
                <textarea
                  rows={3}
                  value={newReminderText}
                  onChange={(e) => setNewReminderText(e.target.value)}
                  placeholder="e.g. Call supplier regarding inventory restocking"
                  className="w-full text-xs p-3 rounded-xl bg-[var(--ca-bg-main)] border border-[var(--ca-border-subtle)] text-[var(--ca-text-primary)] focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[var(--ca-text-secondary)] block mb-1">
                  Scheduled Date & Time ({overview?.accountTimezone || "Asia/Karachi"})
                </label>
                <input
                  type="datetime-local"
                  value={newReminderDateTime}
                  onChange={(e) => setNewReminderDateTime(e.target.value)}
                  className="w-full text-xs p-3 rounded-xl bg-[var(--ca-bg-main)] border border-[var(--ca-border-subtle)] text-[var(--ca-text-primary)] focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-[var(--ca-text-secondary)] hover:bg-[var(--ca-bg-hover)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingReminder}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition disabled:opacity-50"
                >
                  {creatingReminder ? "Scheduling..." : "Schedule Reminder"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Pairing Challenge */}
      {showPairingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md p-6 rounded-2xl bg-[var(--ca-bg-card)] border border-[var(--ca-border-subtle)] shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[var(--ca-text-primary)] flex items-center gap-2">
                <Key className="h-5 w-5 text-emerald-400" />
                Pair Admin WhatsApp
              </h3>
              <button
                onClick={() => setShowPairingModal(false)}
                className="text-[var(--ca-text-secondary)] hover:text-[var(--ca-text-primary)] text-xs font-bold"
              >
                ✕
              </button>
            </div>

            {pairingFeedback && (
              <div className={`p-3 rounded-xl text-xs font-semibold ${
                pairingFeedback.type === "success"
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : "bg-red-500/10 text-red-400 border border-red-500/20"
              }`}>
                {pairingFeedback.text}
              </div>
            )}

            <div className="text-center p-5 rounded-2xl bg-[var(--ca-bg-main)] border border-[var(--ca-border-subtle)] space-y-2">
              <span className="text-xs font-semibold text-[var(--ca-text-secondary)] block">One-Time Pairing Code</span>
              <div className="flex items-center justify-center gap-3">
                <span className="font-mono text-3xl font-extrabold tracking-widest text-emerald-400">
                  {pairingCode || "------"}
                </span>
                {pairingCode && (
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(`PAIR ${pairingCode}`);
                      setCopiedCode(true);
                      setTimeout(() => setCopiedCode(false), 2000);
                    }}
                    className="p-2 rounded-xl bg-[var(--ca-bg-card)] hover:bg-[var(--ca-bg-hover)] border border-[var(--ca-border-subtle)] text-[var(--ca-text-primary)]"
                    title="Copy command"
                  >
                    {copiedCode ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                  </button>
                )}
              </div>
              <span className="text-[11px] text-[var(--ca-text-secondary)] block mt-1">
                Expires in 10 minutes (5 attempts limit)
              </span>
            </div>

            <div className="space-y-3 text-xs text-[var(--ca-text-secondary)]">
              <div className="font-bold text-[var(--ca-text-primary)]">Step-by-step verification:</div>
              <ol className="list-decimal list-inside space-y-2 pl-1 leading-relaxed">
                <li>
                  Open WhatsApp on your authorized Admin phone:{" "}
                  <span className="font-mono font-bold text-[var(--ca-text-primary)]">
                    {overview?.authorizedAdminPhone || overview?.adminPhoneMasked || settings.adminPhone}
                  </span>
                </li>
                <li>
                  Send message:{" "}
                  <span className="font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    PAIR {pairingCode}
                  </span>
                </li>
                <li>
                  Send it to your connected BlackArrow WhatsApp number
                  {overview?.instancePhoneMasked ? (
                    <> (Connected Bot: <span className="font-mono font-semibold text-[var(--ca-text-primary)]">{overview.instancePhoneMasked}</span>)</>
                  ) : ""}.
                </li>
                <li>Your bot will instantly confirm pairing and activate Business Assistant mode.</li>
              </ol>
            </div>

            <div className="pt-3 border-t border-[var(--ca-border-subtle)] space-y-3">
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[11px] leading-relaxed flex items-start gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong>WhatsApp Possession Required:</strong> Verification must originate from your WhatsApp device to prove possession of the configured Admin phone.
                </span>
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowPairingModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-[var(--ca-text-secondary)] hover:bg-[var(--ca-bg-hover)]"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleCheckPairingStatus}
                  disabled={pairingLoading}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition disabled:opacity-50 flex items-center gap-1.5"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${pairingLoading ? "animate-spin" : ""}`} />
                  {pairingLoading ? "Checking..." : "I've Sent the Code (Check Status)"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
