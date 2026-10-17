import React from "react";
import { BarChart3 } from "lucide-react";

function statLabel(value: any) {
  return Number(value || 0).toLocaleString();
}

function CountList({ title, rows }: { title: string; rows: Record<string, number> }) {
  const entries = Object.entries(rows || {}).sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, 5);
  const max = Math.max(1, ...entries.map(([, value]) => Number(value || 0)));
  return (
    <div className="rounded-xl border border-gray-100 p-3 dark:border-neutral-800">
      <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{title}</p>
      <div className="mt-3 space-y-2">
        {entries.length === 0 ? <p className="text-xs font-bold text-gray-400">No data yet.</p> : entries.map(([label, value]) => (
          <div key={label}>
            <div className="mb-1 flex justify-between gap-3 text-xs font-bold text-gray-600 dark:text-neutral-300"><span className="truncate">{label}</span><span>{value}</span></div>
            <div className="h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-neutral-800"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(8, (Number(value || 0) / max) * 100)}%` }} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CrmReportsPanel({ reports }: { reports: any }) {
  if (!reports) return null;
  const metrics = [
    ["Contacted / AI", reports.contactedOrAi],
    ["Assigned", reports.assigned],
    ["Quotation", reports.quotationSent],
    ["Overdue", reports.overdueFollowUps],
    ["Smart actions", reports.smartActionSuggestions],
    ["High priority", reports.highPrioritySmartActions],
    ["Needs reply", reports.needsHumanReply],
    ["Suggested follow-ups", reports.suggestedFollowUps],
    ["Missing details", reports.missingDetailSuggestions],
    ["Lifecycle moves", reports.lifecycleStageSuggestions],
    ["Due today", reports.todayFollowUps],
    ["Complete %", reports.followUpCompletionRate],
    ["This week", reports.createdThisWeek],
    ["This month", reports.createdThisMonth],
  ];
  const sourceHotRows = Object.fromEntries(Object.entries(reports.sourceTemperatureCounts || {}).map(([source, counts]: any) => [source, Number(counts.Hot || 0) + Number(counts.Warm || 0)]));

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mb-3 flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-emerald-600" />
        <h2 className="text-sm font-black text-gray-950 dark:text-neutral-50">CRM activity reports</h2>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-7">
        {metrics.map(([label, value]) => (
          <div key={String(label)} className="rounded-xl border border-gray-100 p-2.5 dark:border-neutral-800">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{String(label)}</p>
            <p className={`mt-1 text-base font-black ${label === "Overdue" && Number(value || 0) > 0 ? "text-red-600 dark:text-red-400" : "text-gray-950 dark:text-neutral-50"}`}>{statLabel(value)}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <CountList title="Sources" rows={reports.sourceCounts || {}} />
        <CountList title="Assigned leads" rows={reports.assignedCounts || {}} />
        <CountList title="Deal stages" rows={reports.dealStageCounts || {}} />
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <CountList title="Follow-ups by staff" rows={reports.assignedFollowUpCounts || {}} />
        <CountList title="Overdue by staff" rows={reports.overdueFollowUpsByStaff || {}} />
        <div className="rounded-xl border border-gray-100 p-3 dark:border-neutral-800">
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Top performers</p>
          <div className="mt-3 grid gap-2 text-xs font-bold text-gray-600 dark:text-neutral-300">
            <div className="flex justify-between gap-3"><span>Top source</span><span>{reports.topSource || "-"}</span></div>
            <div className="flex justify-between gap-3"><span>Top assigned staff</span><span>{reports.topAssignedStaff || "-"}</span></div>
            <div className="flex justify-between gap-3"><span>Won / Lost</span><span>{statLabel(reports.won)} / {statLabel(reports.lost)}</span></div>
          </div>
        </div>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <CountList title="Lead temperature count" rows={reports.temperatureCounts || {}} />
        <CountList title="Lead health count" rows={reports.healthCounts || {}} />
        <CountList title="Source-wise hot/warm leads" rows={sourceHotRows} />
        <CountList title="Smart action types" rows={reports.smartActionTypeCounts || {}} />
      </div>
    </section>
  );
}
