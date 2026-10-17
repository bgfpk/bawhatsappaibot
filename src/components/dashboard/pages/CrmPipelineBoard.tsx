import React, { useEffect, useMemo, useState } from "react";
import { CalendarClock, MessageSquareText, Phone, RotateCcw, Settings2, UserRound } from "lucide-react";
import {
  CRM_PIPELINE_STAGE_ACTIONS,
  buildCrmPipelineStagePatch,
  crmPipelineColumnId,
  type CrmPipelineStageActionId,
} from "../../../services/crm-pipeline-stage-service";
import {
  filterCrmPipelineStages,
  normalizeCrmPipelineBoardPreferences,
  resetCrmPipelineBoardPreferences,
  sortCrmPipelineLeadsByActivity,
} from "../../../services/crm-pipeline-board-preferences-service";

const PIPELINE_COLUMNS = [
  { id: "new", title: "New" },
  { id: "contacted", title: "AI Replied / Contacted" },
  { id: "quotation", title: "Quotation" },
  { id: "negotiation", title: "Negotiation" },
  { id: "payment", title: "Payment Pending" },
  { id: "won", title: "Won / Completed" },
  { id: "lost", title: "Lost" },
];

const STORAGE_KEY = "blackarrow_crm_pipeline_board_preferences";

function formatDate(value: any) {
  const seconds = Number(value || 0);
  if (!seconds) return "Not available";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(seconds * 1000));
}

function sourceChipClass(source: string) {
  const normalized = String(source || "").toLowerCase();
  if (normalized.includes("whatsapp")) return "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300";
  if (normalized.includes("woo")) return "bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300";
  if (normalized.includes("api")) return "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300";
  if (normalized.includes("word") || normalized.includes("web")) return "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300";
  return "bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-300";
}

function temperatureClass(value: string) {
  if (value === "Hot") return "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300";
  if (value === "Warm") return "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300";
  if (value === "Cold") return "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300";
  return "bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-300";
}

function healthClass(value: string) {
  if (String(value).includes("overdue")) return "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300";
  if (String(value).includes("today") || String(value).includes("reply")) return "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300";
  if (value === "Won" || value === "Active") return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";
  return "bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-300";
}

function statusAccentClass(columnId: string) {
  if (columnId === "lost") return "border-l-gray-400";
  if (columnId === "won") return "border-l-emerald-500";
  if (columnId === "payment") return "border-l-blue-500";
  if (columnId === "quotation" || columnId === "negotiation") return "border-l-amber-500";
  if (columnId === "contacted") return "border-l-cyan-500";
  return "border-l-gray-300";
}

function dueLabel(value: any) {
  const seconds = Number(value || 0);
  if (!seconds) return { label: "No follow-up", className: "text-gray-400 dark:text-neutral-500" };
  const now = Math.floor(Date.now() / 1000);
  const todayEnd = now - (now % 86400) + 86400 - 1;
  if (seconds < now) return { label: "Overdue", className: "text-red-600 dark:text-red-300" };
  if (seconds <= todayEnd) return { label: "Due today", className: "text-amber-700 dark:text-amber-300" };
  return { label: formatDate(seconds), className: "text-gray-500 dark:text-neutral-400" };
}

export function CrmPipelineBoard({
  leads,
  selectedLeadId,
  onSelectLead,
  onMoveStage,
}: {
  leads: any[];
  selectedLeadId: string;
  onSelectLead: (leadId: string) => void;
  onMoveStage?: (lead: any, actionId: CrmPipelineStageActionId, patch: { status: string; dealStage: string }) => void;
}) {
  const [preferences, setPreferences] = useState(() => {
    if (typeof window === "undefined") return resetCrmPipelineBoardPreferences();
    try {
      return normalizeCrmPipelineBoardPreferences(JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}"));
    } catch {
      return resetCrmPipelineBoardPreferences();
    }
  });
  const [showControls, setShowControls] = useState(true);

  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  }, [preferences]);

  const columns = useMemo(() => filterCrmPipelineStages(PIPELINE_COLUMNS, preferences).map((column) => ({
    ...column,
    leads: sortCrmPipelineLeadsByActivity(leads.filter((lead) => crmPipelineColumnId(lead) === column.id)),
  })), [leads, preferences]);

  const setVisibleStage = (stageId: string, visible: boolean) => {
    setPreferences((current) => {
      const nextVisible = visible
        ? [...current.visibleStages, stageId]
        : current.visibleStages.filter((id) => id !== stageId);
      return normalizeCrmPipelineBoardPreferences({ ...current, visibleStages: nextVisible });
    });
  };

  const cardPadding = preferences.density === "comfortable" ? "p-3" : "p-2.5";
  const columnHeight = "h-[min(1400px,calc(200vh-10rem))]";

  return (
    <div className="grid gap-3">
      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex flex-col gap-3 border-b border-gray-100 px-3 py-3 dark:border-neutral-800 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-sm font-black text-gray-950 dark:text-neutral-50">Pipeline board</h2>
            <p className="mt-1 text-xs font-medium text-gray-500 dark:text-neutral-500">Wide horizontal workflow with saved board preferences and latest-activity ordering.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-black uppercase text-gray-600 dark:bg-neutral-800 dark:text-neutral-300">{leads.length} leads</span>
            <button type="button" onClick={() => setShowControls((value) => !value)} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-black text-gray-600 dark:border-neutral-800 dark:text-neutral-300">
              <Settings2 className="h-3.5 w-3.5" /> View
            </button>
            <button type="button" onClick={() => setPreferences(resetCrmPipelineBoardPreferences())} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-black text-gray-600 dark:border-neutral-800 dark:text-neutral-300">
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </button>
          </div>
        </div>

        {showControls ? (
          <div className="border-b border-gray-100 px-3 py-2 dark:border-neutral-800">
            <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-wrap gap-1.5">
                {PIPELINE_COLUMNS.map((column) => (
                  <label key={column.id} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-black text-gray-600 dark:border-neutral-800 dark:text-neutral-300">
                    <input
                      type="checkbox"
                      checked={preferences.visibleStages.includes(column.id)}
                      onChange={(event) => setVisibleStage(column.id, event.target.checked)}
                      className="h-3.5 w-3.5 rounded border-gray-300 text-emerald-600"
                    />
                    {column.title}
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-[11px] font-black uppercase text-gray-500 dark:text-neutral-400">
                  Width
                  <input
                    type="range"
                    min="220"
                    max="380"
                    step="20"
                    value={preferences.columnWidth}
                    onChange={(event) => setPreferences((current) => normalizeCrmPipelineBoardPreferences({ ...current, columnWidth: event.target.value }))}
                  />
                  <span className="w-10 text-right">{preferences.columnWidth}px</span>
                </label>
                <div className="flex rounded-lg border border-gray-200 p-1 dark:border-neutral-800">
                  {["compact", "comfortable"].map((density) => (
                    <button
                      key={density}
                      type="button"
                      onClick={() => setPreferences((current) => normalizeCrmPipelineBoardPreferences({ ...current, density }))}
                      className={`rounded-md px-2.5 py-1 text-[11px] font-black capitalize ${preferences.density === density ? "bg-emerald-600 text-white" : "text-gray-500 dark:text-neutral-400"}`}
                    >
                      {density}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <div className="overflow-x-auto p-2 sm:p-3">
          <div className="flex min-w-max gap-3">
            {columns.map((column) => {
              const columnLeads = column.leads;
              const hotCount = columnLeads.filter((lead) => lead.intelligence?.temperature === "Hot").length;
              return (
                <div key={column.id} className={`flex ${columnHeight} shrink-0 flex-col rounded-xl border border-gray-100 bg-gray-50/80 p-2.5 dark:border-neutral-800 dark:bg-neutral-950/40`} style={{ width: preferences.columnWidth }}>
                  <div className="mb-2.5 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate text-xs font-black text-gray-800 dark:text-neutral-100">{column.title}</h3>
                      <p className="mt-0.5 text-[10px] font-bold uppercase text-gray-400 dark:text-neutral-500">{hotCount ? `${hotCount} hot` : "No hot leads"}</p>
                    </div>
                    <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black text-gray-500 shadow-sm dark:bg-neutral-900 dark:text-neutral-400">{columnLeads.length}</span>
                  </div>
                  <div className="custom-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                    {columnLeads.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-gray-200 px-2 py-5 text-center text-[11px] font-bold text-gray-400 dark:border-neutral-800">No leads</p>
                    ) : columnLeads.map((lead) => {
                      const due = dueLabel(lead.nextFollowUpAt);
                      return (
                      <div
                        key={lead.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => onSelectLead(lead.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") onSelectLead(lead.id);
                        }}
                        className={`w-full cursor-pointer rounded-xl border-l-4 bg-white ${cardPadding} text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 dark:bg-neutral-900 dark:hover:border-emerald-900 ${statusAccentClass(column.id)} ${selectedLeadId === lead.id ? "border-emerald-300 ring-2 ring-emerald-100 dark:border-emerald-800 dark:ring-emerald-950/60" : "border-y-gray-100 border-r-gray-100 dark:border-y-neutral-800 dark:border-r-neutral-800"}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-black text-gray-950 dark:text-neutral-50">{lead.name || "Unnamed lead"}</p>
                            <p className="mt-1 flex items-center gap-1 truncate text-[11px] font-bold text-gray-500 dark:text-neutral-500">
                              <Phone className="h-3 w-3 shrink-0" /> {lead.phone || lead.email || "No contact"}
                            </p>
                          </div>
                          <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black uppercase ${temperatureClass(lead.intelligence?.temperature)}`}>{lead.intelligence?.temperature || "Unknown"}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${sourceChipClass(lead.latestSource || lead.source)}`}>{lead.latestSource || lead.source || "Manual"}</span>
                          <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${healthClass(lead.intelligence?.health)}`}>{lead.intelligence?.health || "Active"}</span>
                          {onMoveStage ? (
                            <select
                              value=""
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) => {
                                event.stopPropagation();
                                const actionId = event.target.value as CrmPipelineStageActionId;
                                if (!actionId) return;
                                onMoveStage(lead, actionId, buildCrmPipelineStagePatch(lead, actionId));
                                event.target.value = "";
                              }}
                              className="ml-auto h-6 rounded-md border border-gray-200 bg-white px-1.5 text-[10px] font-black uppercase text-gray-600 outline-none hover:border-emerald-300 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-300"
                              aria-label={`Move ${lead.name || "lead"}`}
                            >
                              <option value="">Move</option>
                              {CRM_PIPELINE_STAGE_ACTIONS.map((action) => <option key={action.id} value={action.id}>{action.label}</option>)}
                            </select>
                          ) : null}
                        </div>
                        <div className="mt-2 grid gap-1.5 text-[11px] font-bold text-gray-500 dark:text-neutral-500">
                          <p className="flex items-center gap-1 truncate">
                            <UserRound className="h-3 w-3 shrink-0" /> {lead.assignedTo || "Unassigned"}
                          </p>
                          {lead.intelligence?.suggestedNextAction ? (
                            <p className="flex items-center gap-1 truncate text-gray-700 dark:text-neutral-300">
                              <MessageSquareText className="h-3 w-3 shrink-0" /> {lead.intelligence.suggestedNextAction}
                            </p>
                          ) : null}
                          <p className={`flex items-center gap-1 truncate ${due.className}`}>
                            <CalendarClock className="h-3 w-3 shrink-0" /> {due.label}
                          </p>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
