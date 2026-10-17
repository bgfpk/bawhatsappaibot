import React from "react";
import { Bell, CheckCircle2 } from "lucide-react";

function formatDate(value: any) {
  const seconds = Number(value || 0);
  if (!seconds) return "Now";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(seconds * 1000));
}

function toneClass(severity: string) {
  if (severity === "danger") return "border-red-100 bg-red-50/70 text-red-700 dark:border-red-950 dark:bg-red-950/20 dark:text-red-300";
  if (severity === "warn") return "border-amber-100 bg-amber-50/70 text-amber-700 dark:border-amber-950 dark:bg-amber-950/20 dark:text-amber-300";
  if (severity === "success") return "border-emerald-100 bg-emerald-50/70 text-emerald-700 dark:border-emerald-950 dark:bg-emerald-950/20 dark:text-emerald-300";
  return "border-blue-100 bg-blue-50/70 text-blue-700 dark:border-blue-950 dark:bg-blue-950/20 dark:text-blue-300";
}

export function CrmNotificationsPanel({
  notifications,
  onSelectLead,
  onUpdate,
  onBulkUpdate,
  onApplySmartAction,
}: {
  notifications: any[];
  onSelectLead: (leadId: string) => void;
  onUpdate: (notificationId: string, patch: any) => void;
  onBulkUpdate?: (action: "mark_all_read" | "clear_all" | "clear_read") => void;
  onApplySmartAction?: (notification: any) => void;
}) {
  const unread = (notifications || []).filter((item) => !item.read).length;
  const read = (notifications || []).filter((item) => item.read).length;
  return (
    <section className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 p-4 dark:border-neutral-800">
        <div>
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-emerald-600" />
            <h2 className="text-sm font-black text-gray-950 dark:text-neutral-50">Tasks & alerts</h2>
          </div>
          <p className="mt-1 text-xs font-medium text-gray-500 dark:text-neutral-500">{unread} unread CRM alerts.</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${unread ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300" : "bg-gray-100 text-gray-500 dark:bg-neutral-800 dark:text-neutral-300"}`}>{unread}</span>
          {unread ? <button type="button" onClick={() => onBulkUpdate?.("mark_all_read")} className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-black text-gray-600 dark:border-neutral-800 dark:text-neutral-300">Mark all read</button> : null}
          {read ? <button type="button" onClick={() => onBulkUpdate?.("clear_read")} className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-black text-gray-600 dark:border-neutral-800 dark:text-neutral-300">Clear read</button> : null}
          {(notifications || []).length ? <button type="button" onClick={() => { if (window.confirm("Clear all CRM notifications? CRM leads and records will not be deleted.")) onBulkUpdate?.("clear_all"); }} className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-black text-red-600 dark:border-red-900 dark:text-red-300">Clear all</button> : null}
        </div>
      </div>

      <div className="max-h-80 space-y-2 overflow-auto p-4">
        {(notifications || []).length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-200 p-4 text-center text-xs font-bold text-gray-400 dark:border-neutral-800">No CRM alerts right now.</p>
        ) : (notifications || []).slice(0, 10).map((item) => (
          <div key={item.id} className={`rounded-xl border p-3 ${toneClass(item.severity)} ${item.read ? "opacity-70" : ""}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-black">{item.title}</p>
                <p className="mt-1 text-xs font-bold">{item.message}</p>
              </div>
              <span className="shrink-0 text-[10px] font-black uppercase">{formatDate(item.createdAt)}</span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {item.assignedTo ? <span className="rounded-full bg-white/70 px-2 py-1 text-[10px] font-black uppercase dark:bg-neutral-950/40">{item.assignedTo}</span> : null}
              {item.leadId ? <button type="button" onClick={() => { onSelectLead(item.leadId); onUpdate(item.id, { read: true }); }} className="rounded-lg border border-current/20 px-2.5 py-1.5 text-xs font-black">Open lead</button> : null}
              {item.safe && item.actionId && onApplySmartAction ? <button type="button" onClick={() => onApplySmartAction(item)} className="rounded-lg border border-current/20 bg-white/70 px-2.5 py-1.5 text-xs font-black dark:bg-neutral-950/40">{item.actionLabel || "Apply"}</button> : null}
              {!item.read ? <button type="button" onClick={() => onUpdate(item.id, { read: true })} className="rounded-lg border border-current/20 px-2.5 py-1.5 text-xs font-black">Mark read</button> : null}
              <button type="button" onClick={() => onUpdate(item.id, { completed: true, read: true })} className="inline-flex items-center gap-1.5 rounded-lg border border-current/20 px-2.5 py-1.5 text-xs font-black">
                <CheckCircle2 className="h-3.5 w-3.5" /> Done
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
