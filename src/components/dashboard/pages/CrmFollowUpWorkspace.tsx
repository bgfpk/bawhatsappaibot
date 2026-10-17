import React, { useMemo, useState } from "react";
import { CheckCircle2, Clock } from "lucide-react";

function formatDate(value: any) {
  const seconds = Number(value || 0);
  if (!seconds) return "Not set";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(seconds * 1000));
}

function dueTone(item: any) {
  const now = Math.floor(Date.now() / 1000);
  const due = Number(item.dueAt || 0);
  const todayEnd = now - (now % 86400) + 86400 - 1;
  if (item.status !== "pending") return { label: item.status, className: "bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-300" };
  if (due && due < now) return { label: "Overdue", className: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300" };
  if (due && due <= todayEnd) return { label: "Due today", className: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" };
  if (item.dueState === "due_soon") return { label: "Due soon", className: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" };
  return { label: "Upcoming", className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" };
}

export function CrmFollowUpWorkspace({
  followUps,
  leads,
  assignedUsers,
  onComplete,
  onReschedule,
  onSelectLead,
}: {
  followUps: any[];
  leads: any[];
  assignedUsers?: string[];
  onComplete: (followUp: any) => void;
  onReschedule: (followUp: any, dueAt: number) => void;
  onSelectLead: (leadId: string) => void;
}) {
  const [filter, setFilter] = useState("pending");
  const [assignedTo, setAssignedTo] = useState("all");
  const leadById = useMemo(() => new Map((leads || []).map((lead) => [lead.id, lead])), [leads]);
  const rows = (followUps || []).filter((item) => {
    if (filter === "pending" && item.status !== "pending") return false;
    if (filter === "completed" && item.status !== "completed") return false;
    if (["overdue", "today", "due_soon", "upcoming"].includes(filter) && item.dueState !== filter) return false;
    if (assignedTo !== "all") {
      const current = String(item.assignedTo || item.leadAssignedTo || "");
      if (assignedTo === "__unassigned" ? current : current !== assignedTo) return false;
    }
    return true;
  });
  const tomorrowMorning = () => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    date.setHours(10, 0, 0, 0);
    return Math.floor(date.getTime() / 1000);
  };

  return (
    <section className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-col gap-3 border-b border-gray-100 p-4 dark:border-neutral-800 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-emerald-600" />
            <h2 className="text-sm font-black text-gray-950 dark:text-neutral-50">Follow-up workspace</h2>
          </div>
          <p className="mt-1 text-xs font-medium text-gray-500 dark:text-neutral-500">Overdue first, then today, then upcoming follow-ups.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <select value={filter} onChange={(event) => setFilter(event.target.value)} className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold dark:border-neutral-800 dark:bg-neutral-950">
            <option value="pending">Pending</option>
            <option value="overdue">Overdue</option>
            <option value="today">Today</option>
            <option value="due_soon">Due soon</option>
            <option value="upcoming">Upcoming</option>
            <option value="completed">Completed</option>
            <option value="all">All</option>
          </select>
          <select value={assignedTo} onChange={(event) => setAssignedTo(event.target.value)} className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold dark:border-neutral-800 dark:bg-neutral-950">
            <option value="all">All assignees</option>
            <option value="__unassigned">Unassigned</option>
            {(assignedUsers || []).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
      </div>
      <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
        {rows.length === 0 ? (
          <p className="col-span-full rounded-xl border border-dashed border-gray-200 p-3 text-center text-xs font-bold text-gray-400 dark:border-neutral-800">No follow-ups here. Create one from a selected lead when a next step is needed.</p>
        ) : rows.slice(0, 9).map((item) => {
          const lead = leadById.get(item.leadId) || {};
          const tone = dueTone(item);
          return (
            <div key={item.id} onClick={() => onSelectLead(item.leadId)} className="cursor-pointer rounded-xl border border-gray-100 p-3 transition hover:border-emerald-200 hover:bg-emerald-50/30 dark:border-neutral-800 dark:hover:border-emerald-900 dark:hover:bg-emerald-950/10">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-gray-950 dark:text-neutral-50">{item.leadName || lead.name || "Lead"}</p>
                  <p className="mt-1 text-xs font-medium text-gray-500">{item.leadPhone || lead.phone || "No phone"}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black uppercase ${tone.className}`}>{tone.label}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-black uppercase text-gray-600 dark:bg-neutral-800 dark:text-neutral-300">{item.leadSource || lead.source || "Source"}</span>
                <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black uppercase text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">{String(item.type || "message").replace(/_/g, " ")}</span>
                <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-black uppercase text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">{item.leadStatus || lead.status || "Status"}</span>
                {item.leadTemperature ? <span className="rounded-full bg-red-50 px-2 py-1 text-[10px] font-black uppercase text-red-700 dark:bg-red-950/40 dark:text-red-300">Temperature: {item.leadTemperature}</span> : null}
                {item.leadHealth ? <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-black uppercase text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">Health: {item.leadHealth}</span> : null}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div><span className="font-black text-gray-400">Due</span><p className="font-bold text-gray-700 dark:text-neutral-200">{formatDate(item.dueAt)}</p></div>
                <div><span className="font-black text-gray-400">Deal</span><p className="font-bold text-gray-700 dark:text-neutral-200">{item.leadDealStage || lead.dealStage || "-"}</p></div>
                <div><span className="font-black text-gray-400">Assigned</span><p className="font-bold text-gray-700 dark:text-neutral-200">{item.leadAssignedTo || lead.assignedTo || "Unassigned"}</p></div>
                <div><span className="font-black text-gray-400">Interest</span><p className="truncate font-bold text-gray-700 dark:text-neutral-200">{item.leadProductInterest || lead.productInterest || "-"}</p></div>
              </div>
              {item.suggestedNextAction ? <p className="mt-3 rounded-lg bg-gray-50 px-2.5 py-2 text-xs font-black text-gray-600 dark:bg-neutral-950 dark:text-neutral-300">Suggested next action: {item.suggestedNextAction}</p> : null}
              <p className="mt-3 line-clamp-2 text-xs font-medium text-gray-600 dark:text-neutral-300">{item.notes || "No follow-up notes yet."}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={(event) => { event.stopPropagation(); onSelectLead(item.leadId); }} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-black text-gray-700 dark:border-neutral-800 dark:text-neutral-200">View lead</button>
                {item.status === "pending" ? (
                <>
                <button type="button" onClick={(event) => { event.stopPropagation(); onComplete(item); }} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-black text-gray-700 dark:border-neutral-800 dark:text-neutral-200">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Complete
                </button>
                <button type="button" onClick={(event) => { event.stopPropagation(); onReschedule(item, tomorrowMorning()); }} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-black text-gray-700 dark:border-neutral-800 dark:text-neutral-200">
                  Tomorrow
                </button>
                </>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
