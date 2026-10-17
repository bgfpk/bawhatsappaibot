import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { Bell, CheckCircle2, ExternalLink, Filter, Settings, X } from "lucide-react";
import {
  DASHBOARD_NOTIFICATION_FILTERS,
  countActiveDashboardNotifications,
  filterDashboardNotifications,
  getDashboardNotificationTriggerClassName,
  topDashboardNotifications,
  type DashboardNotificationFilter,
  type DashboardNotificationItem,
  type DashboardToastTone,
} from "../../services/dashboard-notification-ui-service";
import { registerOverlay, unregisterOverlay } from "../../design-system/primitives/Overlays";

function formatDate(value: any) {
  const seconds = Number(value || 0);
  if (!seconds) return "Now";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(seconds * 1000));
}

function toneClass(severity: string = "info") {
  if (severity === "danger") return "border-red-100 bg-red-50 text-red-700 dark:border-red-950 dark:bg-red-950/30 dark:text-red-300";
  if (severity === "warn") return "border-amber-100 bg-amber-50 text-amber-800 dark:border-amber-950 dark:bg-amber-950/30 dark:text-amber-200";
  if (severity === "success") return "border-emerald-100 bg-emerald-50 text-emerald-800 dark:border-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-200";
  return "border-blue-100 bg-blue-50 text-blue-800 dark:border-blue-950 dark:bg-blue-950/30 dark:text-blue-200";
}

export function DashboardNotificationCenter({
  notifications,
  onOpenLead,
  onApplySmartAction,
  onMarkRead,
  onMarkAllRead,
  onClearAll,
  onClearRead,
  onDone,
  onGoToPage,
  onToast,
  onOpenPreferences,
}: {
  notifications: DashboardNotificationItem[];
  onOpenLead?: (notification: DashboardNotificationItem) => Promise<void> | void;
  onApplySmartAction?: (notification: DashboardNotificationItem) => Promise<void> | void;
  onMarkRead?: (notification: DashboardNotificationItem) => Promise<void> | void;
  onMarkAllRead?: (notifications: DashboardNotificationItem[]) => Promise<void> | void;
  onClearAll?: (notifications: DashboardNotificationItem[]) => Promise<void> | void;
  onClearRead?: (notifications: DashboardNotificationItem[]) => Promise<void> | void;
  onDone?: (notification: DashboardNotificationItem) => Promise<void> | void;
  onGoToPage?: (page: string) => void;
  onToast?: (tone: DashboardToastTone, message: string) => void;
  onOpenPreferences?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();

  useEffect(() => {
    if (!open) return;

    registerOverlay(popoverId, () => setOpen(false), true);

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      unregisterOverlay(popoverId);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open, popoverId]);

  const [filter, setFilter] = useState<DashboardNotificationFilter>("all");
  const [localReadIds, setLocalReadIds] = useState<Set<string>>(() => new Set());
  const [localDoneIds, setLocalDoneIds] = useState<Set<string>>(() => new Set());
  const rows = useMemo(
    () => notifications.map((item) => ({
      ...item,
      read: item.read || localReadIds.has(item.id),
      completed: item.completed || localDoneIds.has(item.id),
    })),
    [notifications, localReadIds, localDoneIds],
  );
  const visibleRows = topDashboardNotifications(filterDashboardNotifications(rows, filter), 18);
  const activeCount = countActiveDashboardNotifications(rows);

  const runAction = async (action: () => Promise<void> | void, success: string, errorMessage: string) => {
    try {
      await action();
      onToast?.("success", success);
    } catch (error) {
      console.warn("[DashboardNotificationCenter] Notification action failed:", error);
      onToast?.("error", errorMessage);
    }
  };

  const markRead = (item: DashboardNotificationItem) => runAction(async () => {
    await onMarkRead?.(item);
    setLocalReadIds((current) => new Set(current).add(item.id));
  }, "Alert marked read.", "Could not update alert.");

  const markDone = (item: DashboardNotificationItem) => runAction(async () => {
    await onDone?.(item);
    setLocalReadIds((current) => new Set(current).add(item.id));
    setLocalDoneIds((current) => new Set(current).add(item.id));
  }, "Task completed.", "Could not complete task.");

  const openLead = (item: DashboardNotificationItem) => runAction(async () => {
    await onOpenLead?.(item);
    setLocalReadIds((current) => new Set(current).add(item.id));
    setOpen(false);
  }, "Lead opened.", "Could not open lead.");

  const applyAction = (item: DashboardNotificationItem) => runAction(async () => {
    await onApplySmartAction?.(item);
    setLocalReadIds((current) => new Set(current).add(item.id));
  }, "Smart action applied.", "Could not apply action.");

  const markAllRead = () => runAction(async () => {
    await onMarkAllRead?.(rows);
    setLocalReadIds((current) => {
      const next = new Set(current);
      rows.forEach((item) => next.add(item.id));
      return next;
    });
  }, "All alerts marked read.", "Could not update alerts.");

  const clearRead = () => runAction(async () => {
    const readRows = rows.filter((item) => item.read && !item.completed);
    await onClearRead?.(readRows);
    setLocalDoneIds((current) => {
      const next = new Set(current);
      readRows.forEach((item) => next.add(item.id));
      return next;
    });
  }, "Read alerts cleared.", "Could not clear read alerts.");

  const clearAll = () => {
    if (!window.confirm("Clear all notifications? Customer records and system data will not be deleted.")) return;
    runAction(async () => {
      await onClearAll?.(rows);
      setLocalReadIds((current) => {
        const next = new Set(current);
        rows.forEach((item) => next.add(item.id));
        return next;
      });
      setLocalDoneIds((current) => {
        const next = new Set(current);
        rows.forEach((item) => next.add(item.id));
        return next;
      });
    }, "All alerts cleared.", "Could not clear alerts.");
  };

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={getDashboardNotificationTriggerClassName()}
        aria-label="Open notifications"
        title="Open notifications"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
      >
        <Bell className="h-5 w-5" />
        {activeCount > 0 ? <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-black text-white">{activeCount}</span> : null}
      </button>

      {open ? (
        <>
          {/* Mobile backdrop for outside dismiss */}
          <button
            type="button"
            className="fixed inset-0 z-[125] bg-black/20 sm:hidden"
            aria-label="Close notifications"
            onClick={() => setOpen(false)}
          />
          <aside
            id={popoverId}
            role="dialog"
            aria-label="Notifications"
            className="fixed inset-x-2 top-16 z-[130] flex max-h-[calc(100dvh-5rem)] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-950 sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-2 sm:max-h-[min(78vh,38rem)] sm:w-[28rem] sm:max-w-[calc(100vw-2rem)]"
          >
            <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-neutral-800">
              <div>
                <h2 className="text-sm font-black text-gray-950 dark:text-neutral-50">Notifications</h2>
                <p className="mt-0.5 text-xs font-bold text-gray-500 dark:text-neutral-500">{activeCount} active/unread</p>
              </div>
              <div className="flex items-center gap-2">
                {rows.some((item) => !item.read && !item.completed) ? (
                  <button
                    type="button"
                    onClick={markAllRead}
                    className="rounded-lg border border-gray-200 px-2.5 py-2 text-xs font-black text-gray-600 transition hover:bg-gray-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-900"
                  >
                    Mark all read
                  </button>
                ) : null}
                {onOpenPreferences ? (
                  <button
                    type="button"
                    onClick={() => { onOpenPreferences(); setOpen(false); }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-2 text-xs font-black text-gray-600 transition hover:bg-gray-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-900"
                  >
                    <Settings className="h-3.5 w-3.5" /> Preferences
                  </button>
                ) : null}
                <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-gray-200 p-2 text-gray-500 transition hover:bg-gray-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-900">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex gap-1 overflow-x-auto border-b border-gray-100 px-3 py-2 dark:border-neutral-800">
              {DASHBOARD_NOTIFICATION_FILTERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFilter(item.id)}
                  className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-black transition ${filter === item.id ? "bg-emerald-600 text-white" : "text-gray-500 hover:bg-gray-100 dark:text-neutral-400 dark:hover:bg-neutral-900"}`}
                >
                  {item.id === "all" ? <Filter className="h-3.5 w-3.5" /> : null}
                  {item.label}
                </button>
              ))}
              {rows.some((item) => item.read && !item.completed) ? (
                <button type="button" onClick={clearRead} className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-black text-gray-500 transition hover:bg-gray-100 dark:text-neutral-400 dark:hover:bg-neutral-900">
                  Clear read
                </button>
              ) : null}
              {rows.some((item) => !item.completed) ? (
                <button type="button" onClick={clearAll} className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-black text-red-600 transition hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/30">
                  Clear all
                </button>
              ) : null}
            </div>

            <div className="custom-scrollbar flex-1 space-y-2 overflow-auto p-3">
              {visibleRows.length === 0 ? (
                <p className="rounded-xl border border-dashed border-gray-200 p-4 text-center text-sm font-bold text-gray-400 dark:border-neutral-800">No active alerts.</p>
              ) : visibleRows.map((item) => (
                <div key={item.id} className={`rounded-xl border p-3 ${toneClass(item.severity)} ${item.read ? "opacity-75" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-black">{item.title}</p>
                      <p className="mt-1 text-xs font-bold leading-relaxed">{item.description}</p>
                    </div>
                    <span className="shrink-0 text-[10px] font-black uppercase">{formatDate(item.createdAt)}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-white/70 px-2 py-1 text-[10px] font-black uppercase dark:bg-neutral-950/50">{item.sourceLabel}</span>
                    {item.type ? <span className="rounded-full bg-white/70 px-2 py-1 text-[10px] font-black uppercase dark:bg-neutral-950/50">{item.type.replace(/_/g, " ")}</span> : null}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.leadId ? <button type="button" onClick={() => openLead(item)} className="rounded-lg border border-current/20 px-2.5 py-1.5 text-xs font-black">Open lead</button> : null}
                    {item.safe && item.actionId ? <button type="button" onClick={() => applyAction(item)} className="rounded-lg border border-current/20 bg-white/70 px-2.5 py-1.5 text-xs font-black dark:bg-neutral-950/40">{item.actionLabel || "Apply"}</button> : null}
                    {item.page ? (
                      <button type="button" onClick={() => { onGoToPage?.(item.page || "global_dashboard"); setOpen(false); }} className="inline-flex items-center gap-1.5 rounded-lg border border-current/20 px-2.5 py-1.5 text-xs font-black">
                        <ExternalLink className="h-3.5 w-3.5" /> Go
                      </button>
                    ) : null}
                    {!item.read ? <button type="button" onClick={() => markRead(item)} className="rounded-lg border border-current/20 px-2.5 py-1.5 text-xs font-black">Mark read</button> : null}
                    <button type="button" onClick={() => markDone(item)} className="inline-flex items-center gap-1.5 rounded-lg border border-current/20 px-2.5 py-1.5 text-xs font-black">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Done
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </>
      ) : null}
    </div>
  );
}
