import React, { useEffect, useMemo, useState } from "react";
import {
  BellRing,
  CalendarClock,
  CheckCircle2,
  Edit3,
  PackageCheck,
  Plus,
  RefreshCw,
  Repeat,
  Save,
  Search,
  Send,
  Trash2,
  XCircle,
} from "lucide-react";
import { getCustomerDisplayContact, getCustomerDisplayName } from "../utils/whatsapp-jid";
import {
  canEditCustomerUpdate,
  getEditableUpdateMessage,
  getUpdateMessageFieldLabel,
  getUpdateMessagePlaceholder,
  shouldShowScheduleFields,
} from "./customer-updates/customer-update-editing";
import { readJsonResponse } from "../services/api-json-response-service";
import { TextLimitCounter } from "./TextLimitCounter";
import { DashboardEmptyState, DashboardPageHeader, DashboardToolbar, MetricTile } from "./dashboard/DashboardPrimitives";
import { RecipientListsPanel } from "./customer-updates/RecipientListsPanel";

type CustomerUpdateRepeat = "none" | "daily" | "weekly" | "monthly" | "yearly";

type CustomerUpdateItem = {
  id: string;
  type: "stock" | "planned";
  status: "pending" | "sent" | "cancelled" | string;
  customerName?: string;
  customerId?: string;
  customerJid?: string;
  productName?: string;
  summary?: string;
  message?: string;
  scheduledAt?: number;
  createdAt?: number;
  sentAt?: number | null;
  lastSentAt?: number | null;
  sentCount?: number;
  repeat?: CustomerUpdateRepeat;
  productId?: string;
  defaultBotId?: string;
  sendFromMode?: "default_only" | "customer_origin_then_default" | string;
  actualBotId?: string;
  actualBotJid?: string;
  fallbackReason?: string;
};

type CustomerUpdatesResponse = {
  items?: CustomerUpdateItem[];
  stock?: CustomerUpdateItem[];
  planned?: CustomerUpdateItem[];
};

type CustomerRow = {
  $id?: string;
  id?: string;
  customer_id?: string;
  jid?: string;
  profile?: Record<string, any>;
};

type BotRow = {
  $id?: string;
  id?: string;
  name?: string;
  jid?: string;
};

type UpdateFormState = {
  customerId: string;
  message: string;
  scheduledAt: string;
  repeat: CustomerUpdateRepeat;
  defaultBotId: string;
  sendFromMode: "default_only" | "customer_origin_then_default";
};
type SortColumn = "customer" | "type" | "summary" | "message" | "when" | "repeat" | "status";
type SortDirection = "asc" | "desc";
type CustomerUpdateTab = "updates" | "lists" | "send" | "runs";

const PK_OFFSET = "+05:00";
const PK_TIME_ZONE = "Asia/Karachi";
const CUSTOMER_UPDATE_MESSAGE_MAX_CHARS = 100000;

const repeatLabels: Record<CustomerUpdateRepeat, string> = {
  none: "One time",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

function formatTime(value?: number | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-PK", {
    timeZone: PK_TIME_ZONE,
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value * 1000));
}

function formatDateTimeInput(value?: number | null) {
  const seconds = value || Math.floor(Date.now() / 1000) + 15 * 60;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PK_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(new Date(seconds * 1000));
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

function parseDateTimeInput(value: string) {
  if (!value) return 0;
  return Math.floor(new Date(`${value}:00${PK_OFFSET}`).getTime() / 1000);
}

function getDefaultForm(customerId = ""): UpdateFormState {
  return {
    customerId,
    message: "",
    scheduledAt: formatDateTimeInput(),
    repeat: "none",
    defaultBotId: "",
    sendFromMode: "default_only",
  };
}

function getCustomerOptionId(customer: CustomerRow) {
  return String(customer.$id || customer.id || customer.customer_id || customer.jid || "");
}

function getCustomerOptionLabel(customer: CustomerRow) {
  const name = getCustomerDisplayName(customer);
  const contact = getCustomerDisplayContact(customer);
  return contact && contact !== name ? `${name} - ${contact}` : name;
}

function getCustomerOptionValue(customer: CustomerRow) {
  return getCustomerOptionLabel(customer);
}

function getCustomerSearchValues(customer: CustomerRow) {
  const profile = customer.profile || {};
  return Array.from(new Set([
    getCustomerOptionLabel(customer),
    getCustomerDisplayName(customer),
    getCustomerDisplayContact(customer),
    customer.customer_id,
    customer.jid,
    profile.jid,
    profile.lidJid,
    profile.phoneJid,
    profile.whatsapp_number,
    profile.phoneNumber,
    profile.phone,
  ].map((value) => String(value || "").trim()).filter(Boolean)));
}

function getCustomerLabel(item: CustomerUpdateItem) {
  return item.customerName || item.customerId || item.customerJid || "Customer";
}

function normalizeRepeat(value?: string): CustomerUpdateRepeat {
  return value === "daily" || value === "weekly" || value === "monthly" || value === "yearly" ? value : "none";
}

function getStatusTone(status: string) {
  if (status === "sent") return "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300";
  if (status === "cancelled") return "bg-gray-100 dark:bg-neutral-800 text-gray-500 dark:text-neutral-400";
  return "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300";
}

function getWhenValue(item: CustomerUpdateItem) {
  if (item.status === "sent") return Number(item.sentAt || item.lastSentAt || item.scheduledAt || item.createdAt || 0);
  return Number(item.scheduledAt || item.createdAt || 0);
}

function getSortValue(item: CustomerUpdateItem, column: SortColumn) {
  if (column === "customer") return getCustomerLabel(item).toLowerCase();
  if (column === "type") return item.type;
  if (column === "summary") return String(item.summary || "").toLowerCase();
  if (column === "message") return String(item.message || "").toLowerCase();
  if (column === "repeat") return repeatLabels[normalizeRepeat(item.repeat)].toLowerCase();
  if (column === "status") return item.status;
  return getWhenValue(item);
}

export function CustomerUpdatesPage({ userId }: { userId: string }) {
  const [items, setItems] = useState<CustomerUpdateItem[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [bots, setBots] = useState<BotRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "sent" | "cancelled">("pending");
  const [query, setQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [updateTab, setUpdateTab] = useState<CustomerUpdateTab>("updates");
  const [editingItem, setEditingItem] = useState<CustomerUpdateItem | null>(null);
  const [form, setForm] = useState<UpdateFormState>(() => getDefaultForm());
  const [sort, setSort] = useState<{ column: SortColumn; direction: SortDirection }>({
    column: "when",
    direction: "asc",
  });

  const fetchUpdates = async (silent = false) => {
    if (!userId) return;
    if (!silent) {
      setLoading(true);
      setError("");
    }
    try {
      const res = await fetch(`/api/user/customer-updates?userId=${encodeURIComponent(userId)}`);
      const data: CustomerUpdatesResponse = await readJsonResponse(res, { context: "Customer updates API" });
      if (!res.ok) throw new Error((data as any)?.error || "Failed to load customer updates");
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (e: any) {
      if (!silent) setError(e?.message || "Failed to load customer updates");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const fetchCustomers = async () => {
    if (!userId) return;
    try {
      const res = await fetch(`/api/user/customers?userId=${encodeURIComponent(userId)}`);
      const data = await readJsonResponse(res, { context: "Customer list API" });
      if (!res.ok) throw new Error(data?.error || "Failed to load customers");
      setCustomers(Array.isArray(data) ? data : []);
    } catch {
      setCustomers([]);
    }
  };

  const fetchBots = async () => {
    try {
      const res = await fetch("/api/bots");
      const data = await readJsonResponse(res, { context: "Customer update API" });
      if (!res.ok || !Array.isArray(data)) return;
      setBots(data);
      const firstBotId = data[0]?.id || data[0]?.$id || "";
      if (firstBotId) {
        setForm((prev) => prev.defaultBotId ? prev : { ...prev, defaultBotId: firstBotId });
      }
    } catch {}
  };

  useEffect(() => {
    fetchUpdates();
    fetchCustomers();
    fetchBots();
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const timer = window.setInterval(() => {
      fetchUpdates(true);
    }, 8000);
    return () => window.clearInterval(timer);
  }, [userId]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (!needle) return true;
      return [
        item.type,
        item.status,
        item.repeat,
        item.customerName,
        item.customerId,
        item.customerJid,
        item.productName,
        item.summary,
        item.message,
      ].filter(Boolean).join(" ").toLowerCase().includes(needle);
    });
  }, [items, query, statusFilter]);

  const sortedItems = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aValue = getSortValue(a, sort.column);
      const bValue = getSortValue(b, sort.column);
      const direction = sort.direction === "asc" ? 1 : -1;
      if (typeof aValue === "number" && typeof bValue === "number") {
        return (aValue - bValue) * direction;
      }
      return String(aValue).localeCompare(String(bValue)) * direction;
    });
  }, [filtered, sort]);

  const setSortColumn = (column: SortColumn) => {
    setSort((prev) => ({
      column,
      direction: prev.column === column && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  const sortMark = (column: SortColumn) => {
    if (sort.column !== column) return "";
    return sort.direction === "asc" ? " ↑" : " ↓";
  };

  const stats = useMemo(() => ({
    pending: items.filter((item) => item.status === "pending").length,
    sent: items.filter((item) => item.status === "sent").length,
    stock: items.filter((item) => item.type === "stock").length,
    planned: items.filter((item) => item.type === "planned").length,
  }), [items]);

  const metricCards = [
    { label: "Pending", value: stats.pending, icon: BellRing, tone: "text-amber-600 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300" },
    { label: "Sent", value: stats.sent, icon: Send, tone: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-300" },
    { label: "Stock", value: stats.stock, icon: PackageCheck, tone: "text-teal-600 bg-teal-50 dark:bg-teal-950/40 dark:text-teal-300" },
    { label: "Planned", value: stats.planned, icon: CalendarClock, tone: "text-sky-600 bg-sky-50 dark:bg-sky-950/40 dark:text-sky-300" },
  ];

  const customerOptions = useMemo(() => customers.flatMap((customer) => {
    const label = getCustomerOptionLabel(customer);
    return getCustomerSearchValues(customer).map((value) => ({
      key: `${getCustomerOptionId(customer) || label}-${value}`,
      value,
      label,
    }));
  }), [customers]);

  const resetForm = () => {
    setEditingItem(null);
    setForm(getDefaultForm());
    setFormOpen(false);
  };

  const submitForm = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const scheduledAt = parseDateTimeInput(form.scheduledAt);
      const stockEdit = editingItem?.type === "stock";
      const payload: any = {
        userId,
        customerId: form.customerId,
      };
      if (stockEdit) {
        payload.productName = form.message;
        payload.productId = editingItem?.productId;
      } else {
        payload.message = form.message;
        payload.scheduledAt = scheduledAt;
        payload.repeat = form.repeat;
        payload.defaultBotId = form.defaultBotId;
        payload.sendFromMode = form.sendFromMode;
      }
      const res = editingItem
        ? await fetch(`/api/user/customer-updates/${editingItem.type}/${encodeURIComponent(editingItem.id)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/user/customer-updates", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      const data = await readJsonResponse(res, { context: "Customer update API" });
      if (!res.ok) throw new Error(data?.error || "Failed to save update");
      setSuccess(editingItem ? "Update saved." : "Update scheduled.");
      resetForm();
      await fetchUpdates();
    } catch (e: any) {
      setError(e?.message || "Failed to save update");
    } finally {
      setSaving(false);
    }
  };

  const editItem = (item: CustomerUpdateItem) => {
    const selectedCustomer = customers.find((customer) => {
      const optionId = getCustomerOptionId(customer);
      const optionValue = getCustomerOptionValue(customer);
      return optionId === item.customerId ||
        optionId === item.customerJid ||
        optionValue === item.customerName ||
        customer.customer_id === item.customerId ||
        customer.customer_id === item.customerJid;
    });
    setEditingItem(item);
    setForm({
      customerId: selectedCustomer ? getCustomerOptionValue(selectedCustomer) : (item.customerName || item.customerId || item.customerJid || ""),
      message: getEditableUpdateMessage(item),
      scheduledAt: formatDateTimeInput(item.scheduledAt || item.createdAt),
      repeat: normalizeRepeat(item.repeat),
      defaultBotId: item.defaultBotId || bots[0]?.id || bots[0]?.$id || "",
      sendFromMode: item.sendFromMode === "customer_origin_then_default" ? "customer_origin_then_default" : "default_only",
    });
    setFormOpen(true);
    setSuccess("");
    setError("");
  };

  const runItemAction = async (item: CustomerUpdateItem, action: "cancel" | "delete") => {
    const label = getCustomerLabel(item);
    if (action === "delete" && !window.confirm(`Delete update for ${label}?`)) return;
    if (action === "cancel" && !window.confirm(`Cancel update for ${label}?`)) return;
    setBusyId(`${action}-${item.type}-${item.id}`);
    setError("");
    setSuccess("");
    try {
      const url = action === "cancel"
        ? `/api/user/customer-updates/${item.type}/${encodeURIComponent(item.id)}/cancel`
        : `/api/user/customer-updates/${item.type}/${encodeURIComponent(item.id)}`;
      const res = await fetch(url, {
        method: action === "cancel" ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await readJsonResponse(res, { context: "Customer update API" });
      if (!res.ok) throw new Error(data?.error || `Failed to ${action} update`);
      setSuccess(action === "cancel" ? "Update cancelled." : "Update deleted.");
      await fetchUpdates();
    } catch (e: any) {
      setError(e?.message || `Failed to ${action} update`);
    } finally {
      setBusyId("");
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <DashboardPageHeader
        eyebrow="Outreach"
        title="Scheduled Updates"
        description="Back-in-stock alerts and customer requested follow-ups, organized by status and schedule."
        icon={CalendarClock}
        actions={
          <>
          <button
            onClick={() => {
              setFormOpen(true);
              setEditingItem(null);
              setForm(getDefaultForm());
            }}
            className="inline-flex items-center justify-center gap-2 bg-gray-900 hover:bg-gray-800 dark:bg-neutral-100 dark:hover:bg-white text-white dark:text-neutral-950 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Update
          </button>
          <button
            onClick={fetchUpdates}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          </>
        }
      />

      <div className="flex gap-1 overflow-x-auto rounded-2xl border border-gray-200 bg-gray-50 p-1 dark:border-neutral-800 dark:bg-neutral-950/50">
        {([
          ["updates", "Updates"],
          ["lists", "Saved Lists"],
          ["send", "Send to List"],
          ["runs", "Runs"],
        ] as Array<[CustomerUpdateTab, string]>).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setUpdateTab(key)}
            className={`shrink-0 rounded-xl px-3 py-2 text-xs font-black transition-all ${updateTab === key ? "bg-white text-emerald-700 shadow-sm dark:bg-neutral-900 dark:text-emerald-300" : "text-gray-500 hover:bg-white/70 dark:text-neutral-400 dark:hover:bg-neutral-900/70"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {updateTab !== "updates" ? (
        <RecipientListsPanel mode={updateTab === "lists" ? "lists" : updateTab === "send" ? "send" : "runs"} />
      ) : (
      <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {metricCards.map((metric) => {
          const Icon = metric.icon;
          return (
            <React.Fragment key={metric.label}>
              <MetricTile
                label={metric.label}
                value={metric.value}
                icon={Icon}
                tone={metric.label === "Pending" ? "amber" : metric.label === "Sent" ? "green" : metric.label === "Stock" ? "blue" : "gray"}
              />
            </React.Fragment>
          );
        })}
      </div>

      {formOpen && (
        <section className="rounded-2xl border border-gray-200 bg-white/92 p-5 shadow-sm dark:border-white/10 dark:bg-neutral-900/88">
          <div className="mb-4">
            <h3 className="text-base font-black text-gray-950 dark:text-neutral-50">{editingItem ? "Edit update" : "Schedule update"}</h3>
            <p className="mt-1 text-xs font-medium text-gray-500 dark:text-neutral-400">Choose the customer, message, delivery time, and sending instance.</p>
          </div>
          <form onSubmit={submitForm} className="grid grid-cols-1 lg:grid-cols-12 gap-3">
            <div className="lg:col-span-3">
              <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-neutral-500 mb-1">Customer</label>
              <input
                list="customer-update-customer-options"
                value={form.customerId}
                onChange={(e) => setForm((prev) => ({ ...prev, customerId: e.target.value }))}
                placeholder="Search or type number/JID/LID"
                className="w-full bg-gray-50 dark:bg-neutral-950 border border-gray-200 dark:border-neutral-800 rounded-xl px-3 py-2.5 text-sm text-gray-800 dark:text-neutral-100 outline-none focus:border-emerald-500"
              />
              <datalist id="customer-update-customer-options">
                {customerOptions.map((customer) => (
                  <option key={customer.key} value={customer.value}>{customer.label}</option>
                ))}
              </datalist>
            </div>
            <div className={shouldShowScheduleFields(editingItem) ? "lg:col-span-4" : "lg:col-span-7"}>
              <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-neutral-500 mb-1">{getUpdateMessageFieldLabel(editingItem)}</label>
              <textarea
                value={form.message}
                onChange={(e) => setForm((prev) => ({ ...prev, message: e.target.value }))}
                rows={3}
                placeholder={getUpdateMessagePlaceholder(editingItem)}
                className="w-full min-h-24 bg-gray-50 dark:bg-neutral-950 border border-gray-200 dark:border-neutral-800 rounded-xl px-3 py-2 text-sm text-gray-800 dark:text-neutral-100 outline-none focus:border-emerald-500 resize-y"
              />
            </div>
            {shouldShowScheduleFields(editingItem) && (
              <>
                <div className="lg:col-span-2">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-neutral-500 mb-1">When</label>
                  <input
                    type="datetime-local"
                    value={form.scheduledAt}
                    onChange={(e) => setForm((prev) => ({ ...prev, scheduledAt: e.target.value }))}
                    className="w-full bg-gray-50 dark:bg-neutral-950 border border-gray-200 dark:border-neutral-800 rounded-xl px-3 py-2.5 text-sm text-gray-800 dark:text-neutral-100 outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="lg:col-span-2">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-neutral-500 mb-1">Repeat</label>
                  <select
                    value={form.repeat}
                    onChange={(e) => setForm((prev) => ({ ...prev, repeat: normalizeRepeat(e.target.value) }))}
                    className="w-full bg-gray-50 dark:bg-neutral-950 border border-gray-200 dark:border-neutral-800 rounded-xl px-3 py-2.5 text-sm text-gray-800 dark:text-neutral-100 outline-none focus:border-emerald-500"
                  >
                    {(Object.keys(repeatLabels) as CustomerUpdateRepeat[]).map((repeat) => (
                      <option key={repeat} value={repeat}>{repeatLabels[repeat]}</option>
                    ))}
                  </select>
                </div>
                <div className="lg:col-span-2">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-neutral-500 mb-1">Default Instance</label>
                  <select
                    value={form.defaultBotId}
                    onChange={(e) => setForm((prev) => ({ ...prev, defaultBotId: e.target.value }))}
                    className="w-full bg-gray-50 dark:bg-neutral-950 border border-gray-200 dark:border-neutral-800 rounded-xl px-3 py-2.5 text-sm text-gray-800 dark:text-neutral-100 outline-none focus:border-emerald-500"
                  >
                    <option value="">Primary instance</option>
                    {bots.map((bot) => (
                      <option key={bot.id || bot.$id} value={bot.id || bot.$id}>
                        {bot.name || bot.jid || bot.id || bot.$id}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="lg:col-span-2">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-neutral-500 mb-1">Send Mode</label>
                  <select
                    value={form.sendFromMode}
                    onChange={(e) => setForm((prev) => ({ ...prev, sendFromMode: e.target.value === "customer_origin_then_default" ? "customer_origin_then_default" : "default_only" }))}
                    className="w-full bg-gray-50 dark:bg-neutral-950 border border-gray-200 dark:border-neutral-800 rounded-xl px-3 py-2.5 text-sm text-gray-800 dark:text-neutral-100 outline-none focus:border-emerald-500"
                  >
                    <option value="default_only">Default instance only</option>
                    <option value="customer_origin_then_default">Customer origin, then default</option>
                  </select>
                </div>
              </>
            )}
            <div className="lg:col-span-1 flex lg:flex-col gap-2 lg:pt-5">
              <button
                type="submit"
                disabled={saving || !form.customerId || !form.message.trim()}
                title={editingItem ? "Save update" : "Schedule update"}
                className="flex-1 inline-flex items-center justify-center bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-xl px-3 py-2.5 transition-colors"
              >
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={resetForm}
                title="Close"
                className="flex-1 inline-flex items-center justify-center bg-gray-100 dark:bg-neutral-800 hover:bg-gray-200 dark:hover:bg-neutral-700 text-gray-500 dark:text-neutral-300 rounded-xl px-3 py-2.5 transition-colors"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </div>
          </form>
        </section>
      )}

      {(error || success) && (
        <div className={`rounded-xl px-4 py-3 text-sm font-bold ${error ? "bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-300" : "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300"}`}>
          {error || success}
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white/92 shadow-sm dark:border-white/10 dark:bg-neutral-900/88">
        <DashboardToolbar>
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-neutral-800 rounded-xl p-1">
            {(["pending", "sent", "cancelled", "all"] as const).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 rounded-lg text-xs font-black capitalize transition-colors ${statusFilter === status ? "bg-white dark:bg-neutral-700 text-gray-900 dark:text-neutral-50 shadow-sm" : "text-gray-500 dark:text-neutral-400 hover:text-gray-900 dark:hover:text-neutral-100"}`}
              >
                {status}
              </button>
            ))}
          </div>
          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search updates..."
              className="w-full bg-gray-50 dark:bg-neutral-950 border border-gray-200 dark:border-neutral-800 rounded-xl pl-9 pr-3 py-2 text-sm text-gray-800 dark:text-neutral-100 outline-none focus:border-emerald-500"
            />
          </div>
        </DashboardToolbar>

        {sortedItems.length === 0 ? (
          <DashboardEmptyState
            icon={BellRing}
            title="No updates found"
            body="Nothing matches the current filter. Create a planned update or wait for stock reminders to appear."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 dark:bg-neutral-800/80 border-b border-gray-100 dark:border-neutral-800">
                  <th onClick={() => setSortColumn("customer")} className="px-4 py-3 text-[11px] font-black uppercase tracking-widest text-gray-500 dark:text-neutral-400 cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-neutral-700/70">Customer{sortMark("customer")}</th>
                  <th onClick={() => setSortColumn("type")} className="px-4 py-3 text-[11px] font-black uppercase tracking-widest text-gray-500 dark:text-neutral-400 cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-neutral-700/70">Type{sortMark("type")}</th>
                  <th onClick={() => setSortColumn("summary")} className="px-4 py-3 text-[11px] font-black uppercase tracking-widest text-gray-500 dark:text-neutral-400 cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-neutral-700/70">Summary{sortMark("summary")}</th>
                  <th onClick={() => setSortColumn("message")} className="px-4 py-3 text-[11px] font-black uppercase tracking-widest text-gray-500 dark:text-neutral-400 cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-neutral-700/70">Message{sortMark("message")}</th>
                  <th onClick={() => setSortColumn("when")} className="px-4 py-3 text-[11px] font-black uppercase tracking-widest text-gray-500 dark:text-neutral-400 cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-neutral-700/70">When{sortMark("when")}</th>
                  <th onClick={() => setSortColumn("repeat")} className="px-4 py-3 text-[11px] font-black uppercase tracking-widest text-gray-500 dark:text-neutral-400 cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-neutral-700/70">Repeat{sortMark("repeat")}</th>
                  <th onClick={() => setSortColumn("status")} className="px-4 py-3 text-[11px] font-black uppercase tracking-widest text-gray-500 dark:text-neutral-400 cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-neutral-700/70">Status{sortMark("status")}</th>
                  <th className="px-4 py-3 text-[11px] font-black uppercase tracking-widest text-gray-500 dark:text-neutral-400 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-neutral-800">
                {sortedItems.map((item) => {
                  const actionKey = `${item.type}-${item.id}`;
                  const repeat = normalizeRepeat(item.repeat);
                  return (
                    <tr key={actionKey} className="hover:bg-gray-50 dark:hover:bg-neutral-800/60 transition-colors">
                      <td className="px-4 py-4 align-top text-sm font-bold text-gray-900 dark:text-neutral-50">{getCustomerLabel(item)}</td>
                      <td className="px-4 py-4 align-top">
                        <span className="inline-flex px-2 py-1 rounded-lg bg-gray-100 dark:bg-neutral-800 text-[11px] font-black uppercase tracking-widest text-gray-600 dark:text-neutral-300">
                          {item.type === "stock" ? "Stock" : "Planned"}
                        </span>
                      </td>
                      <td className="px-4 py-4 align-top text-xs text-gray-600 dark:text-neutral-300 max-w-xs leading-relaxed">{item.summary || "-"}</td>
                      <td className="px-4 py-4 align-top text-xs text-gray-500 dark:text-neutral-400 max-w-sm leading-relaxed">{item.message || "-"}</td>
                      <td className="px-4 py-4 align-top text-xs font-bold text-gray-500 dark:text-neutral-400">
                        {item.status === "sent" ? formatTime(item.sentAt) : formatTime(item.scheduledAt || item.createdAt)}
                        {item.lastSentAt && item.status === "pending" ? (
                          <div className="mt-1 text-[10px] font-medium text-gray-400 dark:text-neutral-600">Last sent {formatTime(item.lastSentAt)}</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-4 align-top text-xs font-bold text-gray-500 dark:text-neutral-400">
                        <span className="inline-flex items-center gap-1">
                          <Repeat className="w-3.5 h-3.5 text-gray-400" />
                          {repeatLabels[repeat]}
                        </span>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <span className={`inline-flex px-2 py-1 rounded-lg text-[11px] font-black uppercase tracking-widest ${getStatusTone(item.status)}`}>
                          {item.status}
                        </span>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <div className="flex justify-end gap-1">
                          {canEditCustomerUpdate(item) && (
                            <button
                              type="button"
                              onClick={() => editItem(item)}
                              title="Edit"
                              className="w-8 h-8 inline-flex items-center justify-center rounded-lg bg-gray-100 dark:bg-neutral-800 hover:bg-gray-200 dark:hover:bg-neutral-700 text-gray-600 dark:text-neutral-300"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                          )}
                          {item.status === "pending" && (
                            <button
                              type="button"
                              onClick={() => runItemAction(item, "cancel")}
                              disabled={busyId === `cancel-${actionKey}`}
                              title="Cancel"
                              className="w-8 h-8 inline-flex items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-amber-700 dark:text-amber-300 disabled:opacity-50"
                            >
                              {busyId === `cancel-${actionKey}` ? <RefreshCw className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                            </button>
                          )}
                          {item.status !== "sent" && (
                            <button
                              type="button"
                              onClick={() => runItemAction(item, "delete")}
                              disabled={busyId === `delete-${actionKey}`}
                              title="Delete"
                              className="w-8 h-8 inline-flex items-center justify-center rounded-lg bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/60 text-red-600 dark:text-red-300 disabled:opacity-50"
                            >
                              {busyId === `delete-${actionKey}` ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                            </button>
                          )}
                          {item.status === "sent" && (
                            <span title="Sent" className="w-8 h-8 hidden md:inline-flex items-center justify-center rounded-lg text-emerald-600 dark:text-emerald-300">
                              <CheckCircle2 className="w-4 h-4" />
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      </>
      )}
    </div>
  );
}
