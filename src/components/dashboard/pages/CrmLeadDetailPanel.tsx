import React, { useMemo, useState } from "react";
import { CalendarClock, MessageSquare, PhoneCall, Save, Sparkles, X } from "lucide-react";
import { getSourceBadgeClassName } from "../../../services/crm-source-service";

function formatDate(value: any) {
  const seconds = Number(value || 0);
  if (!seconds) return "Not available";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(seconds * 1000));
}

function toDateInput(value: any) {
  const seconds = Number(value || 0);
  if (!seconds) return "";
  const date = new Date(seconds * 1000);
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function fromDateInput(value: string) {
  return value ? Math.floor(new Date(value).getTime() / 1000) : 0;
}

function Field({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{label}</p>
      <p className="mt-1 break-words text-xs font-bold text-gray-700 dark:text-neutral-200">{value || "-"}</p>
    </div>
  );
}

function intelTone(value: string) {
  if (value === "Hot" || String(value).includes("overdue")) return "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300";
  if (value === "Warm" || String(value).includes("today") || String(value).includes("reply")) return "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300";
  if (value === "Won" || value === "Active") return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";
  return "bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-300";
}

function missingDetailLabel(value: string) {
  const labels: Record<string, string> = {
    name: "Name missing",
    phone: "Phone missing",
    "city/location": "City/location missing",
    "product/service interest": "Product/service interest missing",
    quantity: "Quantity missing",
    budget: "Budget missing",
    "next follow-up": "Next follow-up missing",
    "assigned user": "Assigned user missing",
  };
  return labels[value] || `Missing: ${value}`;
}

export function CrmLeadDetailPanel({
  detail,
  statuses,
  dealStages,
  followUpTypes,
  callStatuses,
  assignedUsers,
  onPatchLead,
  onCreateFollowUp,
  onCompleteFollowUp,
  onCreateCallLog,
  onUpdateDeal,
  onApplySmartAction,
  onClose,
  actionState,
}: {
  detail: any;
  statuses: string[];
  dealStages: string[];
  followUpTypes: string[];
  callStatuses: string[];
  assignedUsers?: string[];
  actionState?: "idle" | "saving" | "saved" | "error";
  onPatchLead: (patch: any) => void;
  onCreateFollowUp: (payload: any) => void;
  onCompleteFollowUp: (followUp: any) => void;
  onCreateCallLog: (payload: any) => void;
  onUpdateDeal: (payload: any) => void;
  onApplySmartAction?: (action: any) => void;
  onClose?: () => void;
}) {
  const lead = detail?.lead;
  const [activeTab, setActiveTab] = useState("overview");
  const [followUpDraft, setFollowUpDraft] = useState({ type: "message", dueAt: "", notes: "" });
  const [callDraft, setCallDraft] = useState({ status: "Answered", nextCallAt: "", notes: "" });
  const [manualAssignedTo, setManualAssignedTo] = useState("");
  const [timelineFilter, setTimelineFilter] = useState("all");
  const deal = useMemo(() => detail?.deal || { stage: lead?.dealStage || "Lead" }, [detail, lead]);
  const smartActions = detail?.smartActions || lead?.smartActions || lead?.intelligence?.smartActions || [];
  const timelineRows = useMemo(() => {
    const rows = detail?.timeline || detail?.messages || [];
    if (timelineFilter === "all") return rows;
    return rows.filter((item: any) => {
      const type = String(item.type || "message");
      if (timelineFilter === "message") return type === "message";
      if (timelineFilter === "crm") return type === "crm" || type === "source";
      if (timelineFilter === "follow_up") return type === "follow_up";
      if (timelineFilter === "call") return type === "call";
      if (timelineFilter === "order") return type === "order";
      if (timelineFilter === "agent_action") return type === "agent_action";
      if (timelineFilter === "system") return type === "system";
      return true;
    });
  }, [detail, timelineFilter]);

  if (!lead) {
    return (
      <aside className="rounded-2xl border border-dashed border-gray-200 bg-white p-5 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <p className="text-sm font-bold text-gray-400">Select a lead to open CRM details.</p>
      </aside>
    );
  }

  return (
    <aside className="min-h-full rounded-xl border border-gray-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <section className="border-b border-gray-100 p-3 dark:border-neutral-800">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-black text-gray-950 dark:text-neutral-50">{lead.name || "Unnamed lead"}</h2>
            <p className="mt-1 text-xs font-medium text-gray-500">{lead.phone || lead.email || "No contact"} / {lead.source || "Manual"}</p>
          </div>
          <div className="flex items-start gap-2">
            <div className="flex flex-col items-end gap-2">
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${getSourceBadgeClassName(lead.latestSource || lead.source)}`}>{lead.latestSource || lead.source || "Unknown"}</span>
              {actionState && actionState !== "idle" ? <span className={`text-[10px] font-black uppercase ${actionState === "error" ? "text-red-500" : "text-emerald-600"}`}>{actionState === "saving" ? "Saving" : actionState}</span> : null}
            </div>
            {onClose ? (
              <button type="button" onClick={onClose} aria-label="Close lead details" className="rounded-lg border border-gray-200 p-2 text-gray-500 transition hover:bg-gray-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-800">
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-3 flex gap-1 overflow-x-auto rounded-xl border border-gray-100 bg-gray-50 p-1 dark:border-neutral-800 dark:bg-neutral-950/50">
          {[
            ["overview", "Overview"],
            ["timeline", "Timeline"],
            ["followups", "Follow-ups"],
            ["calls", "Calls"],
            ["deal", "Deal"],
            ["activity", "Activity"],
          ].map(([key, label]) => (
            <button key={key} type="button" onClick={() => setActiveTab(key)} className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-black transition ${activeTab === key ? "bg-white text-emerald-700 shadow-sm dark:bg-neutral-900 dark:text-emerald-300" : "text-gray-500 hover:bg-white/70 dark:text-neutral-400"}`}>
              {label}
            </button>
          ))}
        </div>
      </section>

      {activeTab === "overview" && (
      <section className="p-3">
        <div className="mb-3 rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 dark:border-emerald-950 dark:bg-emerald-950/10">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-black text-gray-950 dark:text-neutral-50">Lead intelligence</h3>
              <p className="mt-1 text-xs font-medium text-gray-500 dark:text-neutral-400">Rule-based CRM signals from lead status, follow-ups, assignment, and captured details.</p>
            </div>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl bg-white p-3 dark:bg-neutral-950/70">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Temperature</p>
              <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-black ${intelTone(lead.intelligence?.temperature)}`}>Temperature: {lead.intelligence?.temperature || "Unknown"}</span>
            </div>
            <div className="rounded-xl bg-white p-3 dark:bg-neutral-950/70">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Health</p>
              <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-black ${intelTone(lead.intelligence?.health)}`}>Health: {lead.intelligence?.health || "Active"}</span>
            </div>
          </div>

          <div className="mt-3 rounded-xl bg-white p-3 dark:bg-neutral-950/70">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Suggested next action</p>
            <p className="mt-1 text-sm font-black text-gray-950 dark:text-neutral-50">Suggested next action: {lead.intelligence?.suggestedNextAction || "Wait / no action"}</p>
          </div>

          <div className="mt-3 rounded-xl bg-white p-3 dark:bg-neutral-950/70">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Missing details checklist</p>
            {(lead.intelligence?.missingDetails || []).length === 0 ? (
              <p className="mt-2 text-sm font-bold text-emerald-700 dark:text-emerald-300">All key lead details captured.</p>
            ) : (lead.intelligence?.missingDetails || []).map((item: string) => (
              <label key={item} className="mt-2 flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-neutral-200">
                <input type="checkbox" checked={false} readOnly className="h-4 w-4 rounded border-gray-300 text-emerald-600" />
                {missingDetailLabel(item)}
              </label>
            ))}
          </div>
        </div>
        <div className="mb-3 rounded-xl border border-blue-100 bg-blue-50/60 p-3 dark:border-blue-950 dark:bg-blue-950/20">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-blue-600 dark:text-blue-300" />
              <h3 className="text-sm font-black text-gray-950 dark:text-neutral-50">Smart CRM actions</h3>
            </div>
            <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black uppercase text-blue-700 dark:bg-neutral-950 dark:text-blue-300">{smartActions.length}</span>
          </div>
          <div className="mt-3 space-y-2">
            {smartActions.length === 0 ? (
              <p className="rounded-xl border border-dashed border-blue-100 bg-white/70 p-3 text-xs font-bold text-gray-500 dark:border-blue-950 dark:bg-neutral-950/40 dark:text-neutral-400">No smart actions right now.</p>
            ) : smartActions.map((action: any) => (
              <div key={action.id} className="rounded-xl border border-blue-100 bg-white p-3 dark:border-blue-950 dark:bg-neutral-950/60">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="mb-1 inline-flex rounded-full bg-blue-50 px-2 py-1 text-[10px] font-black uppercase text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">{action.label || "Smart suggestion"}</span>
                    <p className="text-sm font-black text-gray-950 dark:text-neutral-50">{action.title}</p>
                    <p className="mt-1 text-xs font-bold text-gray-500 dark:text-neutral-400">{action.reason}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black uppercase ${action.priority === "high" ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300" : "bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-300"}`}>{action.priority}</span>
                </div>
                {action.draftText ? (
                  <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50/60 p-2 text-xs font-bold text-blue-800 dark:border-blue-950 dark:bg-blue-950/20 dark:text-blue-200">
                    <div className="flex items-start justify-between gap-2">
                      <span>Suggested message draft - not sent</span>
                      <button type="button" onClick={() => navigator.clipboard?.writeText(action.draftText)} className="shrink-0 rounded-md border border-blue-200 bg-white px-2 py-1 text-[10px] font-black uppercase text-blue-700 dark:border-blue-900 dark:bg-neutral-950 dark:text-blue-300">Copy</button>
                    </div>
                    <p className="mt-1">{action.draftText.replace(/^Draft only - not sent:\s*/i, "")}</p>
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {action.safe && action.actionLabel && onApplySmartAction ? (
                    <button type="button" disabled={actionState === "saving"} onClick={() => onApplySmartAction(action)} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-black text-white transition hover:bg-blue-700 disabled:opacity-60">{action.actionLabel}</button>
                  ) : (
                    <span className="rounded-lg border border-blue-100 px-2.5 py-1.5 text-xs font-black text-blue-700 dark:border-blue-900 dark:text-blue-300">Suggestion only</span>
                  )}
                  {onApplySmartAction ? (
                    <button type="button" disabled={actionState === "saving"} onClick={() => onApplySmartAction({ ...action, dismiss: true })} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-black text-gray-600 transition hover:bg-gray-50 disabled:opacity-60 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-900">Dismiss</button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Latest activity" value={formatDate(lead.latestActivityAt)} />
          <Field label="Next follow-up" value={formatDate(lead.nextFollowUpAt)} />
          <Field label="First source" value={lead.firstSource || lead.source} />
          <Field label="Latest source" value={lead.latestSource || lead.source} />
        </div>
        <div className="mt-4 grid gap-3">
          <select value={lead.status} onChange={(event) => onPatchLead({ status: event.target.value })} className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold dark:border-neutral-800 dark:bg-neutral-950">
            {statuses.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select value={lead.dealStage} onChange={(event) => onUpdateDeal({ stage: event.target.value })} className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold dark:border-neutral-800 dark:bg-neutral-950">
            {dealStages.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <select value={lead.assignedTo || ""} onChange={(event) => onPatchLead({ assignedTo: event.target.value })} className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold dark:border-neutral-800 dark:bg-neutral-950">
              <option value="">Unassigned</option>
              {(assignedUsers || []).map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <input value={manualAssignedTo} onChange={(event) => setManualAssignedTo(event.target.value)} placeholder="Manual assignee" className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm dark:border-neutral-800 dark:bg-neutral-950" />
            <button type="button" onClick={() => { if (manualAssignedTo.trim()) onPatchLead({ assignedTo: manualAssignedTo.trim() }); }} className="rounded-xl border border-gray-200 px-3 text-xs font-black dark:border-neutral-800">Assign</button>
          </div>
          <input defaultValue={lead.productInterest || ""} onBlur={(event) => onPatchLead({ productInterest: event.target.value })} placeholder="Product or service interest" className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm dark:border-neutral-800 dark:bg-neutral-950" />
          <div className="grid gap-3 sm:grid-cols-3">
            <input defaultValue={lead.budget || ""} onBlur={(event) => onPatchLead({ budget: event.target.value })} placeholder="Budget" className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm dark:border-neutral-800 dark:bg-neutral-950" />
            <input defaultValue={lead.quantity || ""} onBlur={(event) => onPatchLead({ quantity: event.target.value })} placeholder="Quantity" className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm dark:border-neutral-800 dark:bg-neutral-950" />
            <input defaultValue={lead.location || lead.city || ""} onBlur={(event) => onPatchLead({ location: event.target.value, city: event.target.value })} placeholder="Location" className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm dark:border-neutral-800 dark:bg-neutral-950" />
          </div>
          <input defaultValue={lead.sourceUrl || ""} onBlur={(event) => onPatchLead({ sourceUrl: event.target.value })} placeholder="Source URL / page" className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm dark:border-neutral-800 dark:bg-neutral-950" />
          <input defaultValue={lead.sourceCampaign || ""} onBlur={(event) => onPatchLead({ sourceCampaign: event.target.value })} placeholder="Campaign" className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm dark:border-neutral-800 dark:bg-neutral-950" />
          <input type="datetime-local" defaultValue={toDateInput(lead.nextFollowUpAt)} onBlur={(event) => onPatchLead({ nextFollowUpAt: fromDateInput(event.target.value) })} className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm dark:border-neutral-800 dark:bg-neutral-950" />
          <textarea defaultValue={lead.notes || ""} onBlur={(event) => onPatchLead({ notes: event.target.value })} placeholder="CRM notes" rows={3} className="rounded-xl border border-gray-200 bg-white p-3 text-sm dark:border-neutral-800 dark:bg-neutral-950" />
        </div>
      </section>
      )}

      {activeTab === "activity" && (
      <section className="p-4">
        <h3 className="text-sm font-black text-gray-950 dark:text-neutral-50">CRM activity</h3>
        <div className="mt-3 space-y-2">
          {(detail.activities || []).length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-200 p-4 text-center text-xs font-bold text-gray-400 dark:border-neutral-800">No CRM activity recorded yet.</p>
          ) : (detail.activities || []).slice(0, 20).map((item: any) => (
            <div key={item.id} className="rounded-xl border border-gray-100 p-3 text-xs dark:border-neutral-800">
              <div className="flex items-center justify-between gap-3">
                <strong className="text-gray-800 dark:text-neutral-100">{item.title || item.type?.replace(/_/g, " ")}</strong>
                <span className="font-bold text-gray-400">{formatDate(item.createdAt)}</span>
              </div>
              <p className="mt-1 font-medium text-gray-500">{item.actor || "System/User"}</p>
              {(item.previousValue || item.newValue) ? (
                <p className="mt-2 font-bold text-gray-600 dark:text-neutral-300">{item.previousValue || "-"} -&gt; {item.newValue || "-"}</p>
              ) : null}
            </div>
          ))}
        </div>
      </section>
      )}

      {activeTab === "deal" && (
      <section className="p-4">
        <h3 className="text-sm font-black text-gray-950 dark:text-neutral-50">Deal tracking</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <input defaultValue={deal.amount || ""} onBlur={(event) => onUpdateDeal({ amount: event.target.value })} placeholder="Deal amount" className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm dark:border-neutral-800 dark:bg-neutral-950" />
          <input defaultValue={deal.paymentStatus || ""} onBlur={(event) => onUpdateDeal({ paymentStatus: event.target.value })} placeholder="Payment status" className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm dark:border-neutral-800 dark:bg-neutral-950" />
          <input defaultValue={deal.dispatchStatus || ""} onBlur={(event) => onUpdateDeal({ dispatchStatus: event.target.value })} placeholder="Dispatch status" className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm dark:border-neutral-800 dark:bg-neutral-950" />
          <input type="datetime-local" defaultValue={toDateInput(deal.expectedDeliveryAt)} onBlur={(event) => onUpdateDeal({ expectedDeliveryAt: fromDateInput(event.target.value) })} className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm dark:border-neutral-800 dark:bg-neutral-950" />
        </div>
        <textarea defaultValue={deal.notes || ""} onBlur={(event) => onUpdateDeal({ notes: event.target.value })} placeholder="Deal notes" rows={2} className="mt-3 w-full rounded-xl border border-gray-200 bg-white p-3 text-sm dark:border-neutral-800 dark:bg-neutral-950" />
      </section>
      )}

      {activeTab === "timeline" && (
      <section className="p-4">
        <div className="flex items-center gap-2"><MessageSquare className="h-4 w-4 text-emerald-600" /><h3 className="text-sm font-black text-gray-950 dark:text-neutral-50">Conversation timeline</h3></div>
        <div className="mt-3 flex gap-1 overflow-x-auto rounded-xl border border-gray-100 bg-gray-50 p-1 dark:border-neutral-800 dark:bg-neutral-950/50">
          {[
            ["all", "All"],
            ["message", "Messages"],
            ["crm", "CRM"],
            ["follow_up", "Follow-ups"],
            ["call", "Calls"],
            ["order", "Orders"],
            ["agent_action", "Agent Actions"],
            ["system", "System"],
          ].map(([key, label]) => (
            <button key={key} type="button" onClick={() => setTimelineFilter(key)} className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-black transition ${timelineFilter === key ? "bg-white text-emerald-700 shadow-sm dark:bg-neutral-900 dark:text-emerald-300" : "text-gray-500 hover:bg-white/70 dark:text-neutral-400"}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="mt-3 space-y-2">
          {timelineRows.length === 0 ? <p className="rounded-xl border border-dashed border-gray-200 p-5 text-center text-sm font-bold text-gray-400 dark:border-neutral-800">No timeline events found for this filter.</p> : timelineRows.map((item: any, index: number) => {
            const day = item.timestamp ? new Date(Number(item.timestamp) * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
            const previous = timelineRows[index - 1];
            const previousDay = previous?.timestamp ? new Date(Number(previous.timestamp) * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
            const isMessage = String(item.type || "message") === "message";
            return (
              <React.Fragment key={item.id || `${item.timestamp}-${item.text}`}>
                {day && day !== previousDay ? <p className="pt-2 text-[10px] font-black uppercase tracking-widest text-gray-400">{day}</p> : null}
                <details open={isMessage} className={`rounded-xl border p-3 text-xs ${item.direction === "inbound" ? "border-emerald-100 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/20" : item.direction === "outbound" ? "border-blue-100 bg-blue-50/60 dark:border-blue-900 dark:bg-blue-950/20" : "border-gray-100 bg-gray-50 dark:border-neutral-800 dark:bg-neutral-950/50"}`}>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
                    <span className="min-w-0 truncate font-black">{item.title || item.actor || String(item.type || "Event").replace(/_/g, " ")}</span>
                    <span className="shrink-0 text-[10px] font-bold text-gray-400">{formatDate(item.timestamp)}</span>
                  </summary>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${getSourceBadgeClassName(item.source || lead.source)}`}>{item.source || lead.source || "CRM"}</span>
                    {item.actor ? <span className="rounded-full bg-white/70 px-2 py-1 text-[10px] font-black uppercase dark:bg-neutral-900">{item.actor}</span> : null}
                    {item.status ? <span className="rounded-full bg-white/70 px-2 py-1 text-[10px] font-black uppercase dark:bg-neutral-900">{item.status}</span> : null}
                  </div>
                  {item.text ? <p className="mt-2 whitespace-pre-wrap font-medium leading-relaxed text-gray-700 dark:text-neutral-200">{item.text}</p> : null}
                </details>
              </React.Fragment>
            );
          })}
        </div>
      </section>
      )}

      {activeTab === "followups" && (
      <section className="p-4">
        <div className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-emerald-600" /><h3 className="text-sm font-black text-gray-950 dark:text-neutral-50">Follow-ups</h3></div>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr]">
          <select value={followUpDraft.type} onChange={(event) => setFollowUpDraft({ ...followUpDraft, type: event.target.value })} className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm dark:border-neutral-800 dark:bg-neutral-950">{followUpTypes.map((item) => <option key={item} value={item}>{item.replace(/_/g, " ")}</option>)}</select>
          <input type="datetime-local" value={followUpDraft.dueAt} onChange={(event) => setFollowUpDraft({ ...followUpDraft, dueAt: event.target.value })} className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm dark:border-neutral-800 dark:bg-neutral-950" />
          <input value={followUpDraft.notes} onChange={(event) => setFollowUpDraft({ ...followUpDraft, notes: event.target.value })} placeholder="Follow-up notes" className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm sm:col-span-2 dark:border-neutral-800 dark:bg-neutral-950" />
          <button onClick={() => {
            onCreateFollowUp({ leadId: lead.id, type: followUpDraft.type, dueAt: fromDateInput(followUpDraft.dueAt), notes: followUpDraft.notes, assignedTo: lead.assignedTo || "" });
            setFollowUpDraft({ type: "message", dueAt: "", notes: "" });
          }} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white sm:col-span-2"><Save className="h-4 w-4" /> Create follow-up</button>
        </div>
        <div className="mt-3 space-y-2">{(detail.followUps || []).length === 0 ? <p className="rounded-xl border border-dashed border-gray-200 p-4 text-center text-xs font-bold text-gray-400 dark:border-neutral-800">No follow-ups yet.</p> : (detail.followUps || []).slice(0, 6).map((item: any) => <div key={item.id} className="rounded-xl border border-gray-100 p-3 text-xs dark:border-neutral-800"><div className="flex justify-between gap-2"><strong>{item.type?.replace(/_/g, " ")}</strong><span>{formatDate(item.dueAt)}</span></div><p className="mt-1 text-gray-500">{item.notes || item.status}</p>{item.status === "pending" ? <button onClick={() => onCompleteFollowUp(item)} className="mt-2 font-black text-emerald-700">Mark completed</button> : null}</div>)}</div>
      </section>
      )}

      {activeTab === "calls" && (
      <section className="p-4">
        <div className="flex items-center gap-2"><PhoneCall className="h-4 w-4 text-emerald-600" /><h3 className="text-sm font-black text-gray-950 dark:text-neutral-50">Call logs</h3></div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <select value={callDraft.status} onChange={(event) => setCallDraft({ ...callDraft, status: event.target.value })} className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm dark:border-neutral-800 dark:bg-neutral-950">{callStatuses.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          <input type="datetime-local" value={callDraft.nextCallAt} onChange={(event) => setCallDraft({ ...callDraft, nextCallAt: event.target.value })} className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm dark:border-neutral-800 dark:bg-neutral-950" />
          <input value={callDraft.notes} onChange={(event) => setCallDraft({ ...callDraft, notes: event.target.value })} placeholder="Call notes" className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm sm:col-span-2 dark:border-neutral-800 dark:bg-neutral-950" />
          <button onClick={() => {
            onCreateCallLog({ leadId: lead.id, status: callDraft.status, nextCallAt: fromDateInput(callDraft.nextCallAt), notes: callDraft.notes });
            setCallDraft({ status: "Answered", nextCallAt: "", notes: "" });
          }} className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-black dark:border-neutral-800 sm:col-span-2"><PhoneCall className="h-4 w-4" /> Add call log</button>
        </div>
        <div className="mt-3 space-y-2">{(detail.callLogs || []).length === 0 ? <p className="rounded-xl border border-dashed border-gray-200 p-4 text-center text-xs font-bold text-gray-400 dark:border-neutral-800">No call logs yet.</p> : (detail.callLogs || []).slice(0, 6).map((item: any) => <div key={item.id} className="rounded-xl border border-gray-100 p-3 text-xs dark:border-neutral-800"><div className="flex justify-between gap-2"><strong>{item.status || item.outcome}</strong><span>{formatDate(item.calledAt)}</span></div><p className="mt-1 text-gray-500">{item.notes || "No notes"}{item.nextCallAt ? ` - Next: ${formatDate(item.nextCallAt)}` : ""}</p></div>)}</div>
      </section>
      )}
    </aside>
  );
}
