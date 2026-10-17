import React, { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Shuffle } from "lucide-react";
import { buildCrmLeadRoutingPreview, type CrmLeadAssignmentStrategy, type CrmLeadRoutingMode } from "../../../services/crm-lead-routing-service";

async function apiJson(path: string, options: RequestInit = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

const queues: Array<{ value: CrmLeadRoutingMode; label: string }> = [
  { value: "all_unassigned", label: "Unassigned" },
  { value: "hot_unassigned", label: "Hot unassigned" },
  { value: "stale_no_followup", label: "Stale / no follow-up" },
  { value: "needs_human_reply", label: "Needs human reply" },
  { value: "overdue_followup_leads", label: "Overdue follow-up leads" },
];

const strategies: Array<{ value: CrmLeadAssignmentStrategy; label: string }> = [
  { value: "selected_staff", label: "Specific staff" },
  { value: "lowest_workload", label: "Lowest workload" },
  { value: "round_robin_preview", label: "Round-robin preview" },
];

function count(value: any) {
  return Number(value || 0).toLocaleString();
}

export function CrmRoutingPanel({ teamWorkflow, activeStaff, onRefresh }: { teamWorkflow: any; activeStaff: any[]; onRefresh: () => Promise<any> | void }) {
  const [mode, setMode] = useState<CrmLeadRoutingMode>("all_unassigned");
  const [strategy, setStrategy] = useState<CrmLeadAssignmentStrategy>("selected_staff");
  const [selectedStaffName, setSelectedStaffName] = useState(activeStaff?.[0]?.name || "");
  const [preview, setPreview] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [isApplying, setIsApplying] = useState(false);

  const previewRouting = () => {
    setError("");
    setResult(null);
    setPreview(buildCrmLeadRoutingPreview({ teamWorkflow, mode, strategy, selectedStaffName, limit: 50 }));
  };

  const applyRouting = async () => {
    const rows = preview?.preview || [];
    if (!rows.length) return;
    setIsApplying(true);
    setError("");
    try {
      const grouped = new Map<string, string[]>();
      for (const row of rows) {
        const assignedTo = String(row.recommendedAssignedTo || "").trim();
        const leadId = String(row.leadId || "").trim();
        if (!assignedTo || !leadId) continue;
        grouped.set(assignedTo, [...(grouped.get(assignedTo) || []), leadId]);
      }
      const aggregate = { assigned: 0, skipped: 0, skippedReasons: [] as any[] };
      for (const [assignedTo, leadIds] of grouped.entries()) {
        const response = await apiJson("/api/user/crm/leads/bulk-assign", { method: "POST", body: JSON.stringify({ assignedTo, leadIds }) });
        aggregate.assigned += Number(response.assigned ?? response.assignedCount ?? 0);
        aggregate.skipped += Number(response.skipped ?? response.skippedCount ?? 0);
        aggregate.skippedReasons.push(...(response.skippedReasons || []));
      }
      setResult(aggregate);
      setPreview(null);
      await onRefresh?.();
    } catch (e: any) {
      setError(e.message || "Bulk assignment failed.");
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <section className="rounded-2xl border border-emerald-200 bg-white shadow-sm dark:border-emerald-900/50 dark:bg-neutral-900">
      <div className="border-b border-emerald-100 p-4 dark:border-emerald-900/40">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
          <Shuffle className="h-3.5 w-3.5" /> Routing preview
        </div>
        <h3 className="text-sm font-black text-gray-950 dark:text-neutral-50">Routing & bulk assignment</h3>
        <p className="mt-1 text-xs font-medium text-gray-500 dark:text-neutral-500">Preview a queue, review owners, then apply visible assignments only.</p>
      </div>

      <div className="grid gap-3 p-4 lg:grid-cols-[1fr_1fr_1fr_auto]">
        <select value={mode} onChange={(event) => setMode(event.target.value as CrmLeadRoutingMode)} className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold dark:border-neutral-800 dark:bg-neutral-950">
          {queues.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <select value={strategy} onChange={(event) => setStrategy(event.target.value as CrmLeadAssignmentStrategy)} className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold dark:border-neutral-800 dark:bg-neutral-950">
          {strategies.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <select value={selectedStaffName} onChange={(event) => setSelectedStaffName(event.target.value)} disabled={strategy !== "selected_staff"} className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold disabled:opacity-50 dark:border-neutral-800 dark:bg-neutral-950">
          <option value="">Select active staff</option>
          {(activeStaff || []).map((staff: any) => <option key={staff.name} value={staff.name}>{staff.name}</option>)}
        </select>
        <button type="button" onClick={previewRouting} className="inline-flex h-10 items-center justify-center rounded-xl bg-emerald-600 px-4 text-xs font-black text-white">Preview routing</button>
      </div>

      {(error || result) ? (
        <div className="px-4 pb-4">
          {error ? <div className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200"><AlertTriangle className="h-4 w-4" />{error}</div> : <div className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"><CheckCircle2 className="h-4 w-4" />Assigned {count(result.assigned)} lead(s). Skipped {count(result.skipped)}.</div>}
        </div>
      ) : null}

      {preview ? (
        <div className="border-t border-gray-100 p-4 dark:border-neutral-800">
          <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-gray-400">Preview</p>
              <h4 className="text-sm font-black text-gray-950 dark:text-neutral-50">{count(preview.preview?.length)} lead(s) ready</h4>
              <p className="mt-1 text-xs font-medium text-gray-500">Max 50 visible leads. Review before applying.</p>
            </div>
            <button type="button" onClick={applyRouting} disabled={isApplying || !preview.preview?.length} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 py-2 text-xs font-black text-white disabled:opacity-50 dark:bg-neutral-50 dark:text-neutral-950">
              {isApplying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Apply assignment
            </button>
          </div>
          <div className="grid gap-2">
            {(preview.preview || []).length === 0 ? <p className="rounded-xl border border-dashed border-gray-200 p-4 text-center text-xs font-bold text-gray-400 dark:border-neutral-800">No eligible leads for this routing option.</p> : (preview.preview || []).map((row: any) => (
              <div key={row.leadId} className="grid gap-3 rounded-xl border border-gray-100 p-3 text-xs dark:border-neutral-800 lg:grid-cols-[minmax(0,1.4fr)_0.8fr_0.8fr_1fr] lg:items-center">
                <div className="min-w-0"><p className="truncate text-sm font-black text-gray-950 dark:text-neutral-50">{row.leadName}</p><p className="mt-1 font-medium text-gray-500">{row.source || "CRM"} / {row.status || "New"}</p></div>
                <div><span className="font-black text-gray-400">Current</span><p className="font-bold text-gray-700 dark:text-neutral-200">{row.currentAssignedTo || "Unassigned"}</p></div>
                <div><span className="font-black text-gray-400">Suggested</span><p className="font-bold text-emerald-700 dark:text-emerald-300">{row.recommendedAssignedTo}</p></div>
                <p className="font-medium text-gray-500 dark:text-neutral-400">{row.reason}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
