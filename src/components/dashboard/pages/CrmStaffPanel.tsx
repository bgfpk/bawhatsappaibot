import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Loader2, Plus, RefreshCw, Save, Search, UserRoundCheck, Users, Zap } from "lucide-react";
import { buildCrmTeamWorkflow } from "../../../services/crm-team-workflow-service";
import { CrmRoutingPanel } from "./CrmRoutingPanel";

type StaffDraft = {
  name: string;
  phone: string;
  email: string;
  role: string;
  notes: string;
  active?: boolean;
};

async function apiJson(path: string, options: RequestInit = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function statLabel(value: any) {
  return Number(value || 0).toLocaleString();
}

function formatDate(value: any) {
  const seconds = Number(value || 0);
  if (!seconds) return "Not set";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(seconds * 1000));
}

function defaultDraft(): StaffDraft {
  return { name: "", phone: "", email: "", role: "Sales Agent", notes: "", active: true };
}

function riskClass(value: string) {
  if (value === "Needs attention") return "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300";
  if (value === "Busy") return "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300";
  if (value === "Inactive") return "bg-gray-100 text-gray-500 dark:bg-neutral-800 dark:text-neutral-300";
  return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";
}

function tempClass(value: string) {
  if (value === "Hot") return "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300";
  if (value === "Warm") return "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300";
  if (value === "Cold") return "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300";
  return "bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-300";
}

function SummaryCard({ label, value, tone = "gray", icon: Icon }: { label: string; value: any; tone?: string; icon: any }) {
  const toneClass = tone === "red" ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300" : tone === "amber" ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" : tone === "emerald" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-gray-100 text-gray-700 dark:bg-neutral-800 dark:text-neutral-200";
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className={`mb-2 inline-flex rounded-xl p-2 ${toneClass}`}><Icon className="h-4 w-4" /></div>
      <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{label}</p>
      <p className="mt-1 text-xl font-black text-gray-950 dark:text-neutral-50">{statLabel(value)}</p>
    </div>
  );
}

function LeadQueueCard({ title, description, rows, activeStaff, selectedStaffByLead, assignmentState, onSelectStaff, onAssign }: any) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="border-b border-gray-100 p-4 dark:border-neutral-800">
        <div className="flex items-start justify-between gap-3">
          <div><h3 className="text-sm font-black text-gray-950 dark:text-neutral-50">{title}</h3><p className="mt-1 text-xs font-medium text-gray-500 dark:text-neutral-500">{description}</p></div>
          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-black uppercase text-gray-600 dark:bg-neutral-800 dark:text-neutral-300">{rows.length}</span>
        </div>
      </div>
      <div className="max-h-96 overflow-auto p-3">
        {rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-200 p-4 text-center text-xs font-bold text-gray-400 dark:border-neutral-800">Queue is clear.</p>
        ) : (
          <div className="space-y-2">
            {rows.map((lead: any) => {
              const leadId = lead.id || lead.leadId;
              return (
                <div key={leadId || lead.followUpId} className="rounded-xl border border-gray-100 p-3 dark:border-neutral-800">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-gray-950 dark:text-neutral-50">{lead.name || lead.leadName || "Unnamed lead"}</p>
                      <p className="mt-1 text-xs font-medium text-gray-500 dark:text-neutral-500">{lead.phone || lead.leadPhone || lead.email || lead.leadEmail || "No contact"}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-black uppercase text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">{lead.source || lead.leadSource || "CRM"}</span>
                        <span className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-black uppercase text-gray-600 dark:bg-neutral-800 dark:text-neutral-300">{lead.status || lead.leadStatus || "New"}</span>
                        <span className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-black uppercase text-gray-600 dark:bg-neutral-800 dark:text-neutral-300">{lead.dealStage || lead.leadDealStage || "Lead"}</span>
                        <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${tempClass(lead.temperature || lead.leadTemperature)}`}>{lead.temperature || lead.leadTemperature || "Unknown"}</span>
                      </div>
                      <p className="mt-2 text-[11px] font-bold text-gray-400 dark:text-neutral-500">Assigned: {lead.assignedTo || "Unassigned"} / Next: {formatDate(lead.nextFollowUpAt || lead.dueAt)}</p>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-[minmax(140px,1fr)_auto] lg:min-w-64">
                      <select value={selectedStaffByLead[leadId] || ""} onChange={(event) => onSelectStaff(leadId, event.target.value)} className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-xs font-bold dark:border-neutral-800 dark:bg-neutral-950">
                        <option value="">Select staff</option>
                        {activeStaff.map((staff: any) => <option key={staff.name} value={staff.name}>{staff.name}</option>)}
                      </select>
                      <button type="button" onClick={() => onAssign(leadId)} disabled={!selectedStaffByLead[leadId] || assignmentState[leadId] === "saving"} className="inline-flex h-9 items-center justify-center rounded-lg bg-emerald-600 px-3 text-xs font-black text-white disabled:opacity-50">
                        {assignmentState[leadId] === "saving" ? "Saving" : "Assign"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

export function CrmStaffPanel({ staff, roles, onCreate, onUpdate }: { staff: any[]; roles: string[]; onCreate: (payload: any) => Promise<any> | void; onUpdate: (staffId: string, payload: any) => Promise<any> | void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<StaffDraft>(defaultDraft());
  const [editStaffId, setEditStaffId] = useState("");
  const [editDraft, setEditDraft] = useState<StaffDraft>(defaultDraft());
  const [overview, setOverview] = useState<any>(null);
  const [isLoadingWorkflow, setIsLoadingWorkflow] = useState(false);
  const [workflowError, setWorkflowError] = useState("");
  const [assignmentState, setAssignmentState] = useState<Record<string, string>>({});
  const [selectedStaffByLead, setSelectedStaffByLead] = useState<Record<string, string>>({});
  const [staffSearch, setStaffSearch] = useState("");

  const loadTeamWorkflow = async () => {
    setIsLoadingWorkflow(true);
    setWorkflowError("");
    try {
      setOverview(await apiJson("/api/user/crm/overview"));
    } catch (e: any) {
      setWorkflowError(e.message || "Could not load team workflow.");
    } finally {
      setIsLoadingWorkflow(false);
    }
  };

  useEffect(() => { loadTeamWorkflow(); }, []);

  const teamWorkflow = useMemo(() => overview?.teamWorkflow || buildCrmTeamWorkflow({
    staff: staff?.length ? staff : overview?.staff || [],
    leads: overview?.leads || [],
    followUps: overview?.followUps || [],
    reports: overview?.reports || {},
  }), [staff, overview]);

  const activeStaff = teamWorkflow.staffCards.filter((item: any) => item.active && item.name && item.role !== "Assigned owner");
  const visibleStaffCards = teamWorkflow.staffCards.filter((item: any) => {
    const q = staffSearch.trim().toLowerCase();
    if (!q) return true;
    return [item.name, item.role, item.phone, item.email, item.riskLabel].filter(Boolean).join(" ").toLowerCase().includes(q);
  });

  const save = async () => {
    await onCreate(draft);
    setDraft(defaultDraft());
    setOpen(false);
    await loadTeamWorkflow();
  };

  const startEdit = (item: any) => {
    setEditStaffId(item.id);
    setEditDraft({ name: item.name || "", phone: item.phone || "", email: item.email || "", role: item.role || "Sales Agent", notes: item.notes || "", active: item.active !== false });
  };

  const saveEdit = async () => {
    if (!editStaffId) return;
    await onUpdate(editStaffId, editDraft);
    setEditStaffId("");
    setEditDraft(defaultDraft());
    await loadTeamWorkflow();
  };

  const assignLead = async (leadId: string) => {
    const assignedTo = selectedStaffByLead[leadId];
    if (!leadId || !assignedTo) return;
    setAssignmentState((current) => ({ ...current, [leadId]: "saving" }));
    setWorkflowError("");
    try {
      await apiJson(`/api/user/crm/leads/${leadId}`, { method: "PATCH", body: JSON.stringify({ assignedTo }) });
      setAssignmentState((current) => ({ ...current, [leadId]: "saved" }));
      await loadTeamWorkflow();
    } catch (e: any) {
      setWorkflowError(e.message || "Assignment failed.");
      setAssignmentState((current) => ({ ...current, [leadId]: "error" }));
    }
  };

  const queues = teamWorkflow.ownerQueues;
  const selectStaff = (leadId: string, staffName: string) => setSelectedStaffByLead((current) => ({ ...current, [leadId]: staffName }));

  return (
    <section className="grid gap-4">
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex flex-col gap-3 border-b border-gray-100 p-4 dark:border-neutral-800 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2"><UserRoundCheck className="h-4 w-4 text-emerald-600" /><h2 className="text-sm font-black text-gray-950 dark:text-neutral-50">Team command center</h2></div>
            <p className="mt-1 text-xs font-medium text-gray-500 dark:text-neutral-500">See ownership, workload pressure, and queues that need a human decision.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={loadTeamWorkflow} disabled={isLoadingWorkflow} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-xs font-black text-gray-700 disabled:opacity-60 dark:border-neutral-800 dark:text-neutral-200">{isLoadingWorkflow ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh</button>
            <button type="button" onClick={() => setOpen((value) => !value)} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white"><Plus className="h-4 w-4" /> Add staff</button>
          </div>
        </div>
        {workflowError ? <div className="m-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">{workflowError}</div> : null}
        {open ? (
          <div className="grid gap-2 border-b border-gray-100 p-4 dark:border-neutral-800 sm:grid-cols-2 xl:grid-cols-3">
            <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Staff name" className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm dark:border-neutral-800 dark:bg-neutral-950" />
            <select value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value })} className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm dark:border-neutral-800 dark:bg-neutral-950">{(roles || ["Owner", "Manager", "Sales Agent", "Support", "Viewer"]).map((role) => <option key={role} value={role}>{role}</option>)}</select>
            <input value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} placeholder="Phone optional" className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm dark:border-neutral-800 dark:bg-neutral-950" />
            <input value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} placeholder="Email optional" className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm dark:border-neutral-800 dark:bg-neutral-950" />
            <input value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="Notes optional" className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm dark:border-neutral-800 dark:bg-neutral-950 xl:col-span-2" />
            <button type="button" onClick={save} disabled={!draft.name.trim()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50 sm:col-span-2 xl:col-span-3"><Save className="h-4 w-4" /> Save staff</button>
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Active staff" value={teamWorkflow.summary.activeStaff} tone="emerald" icon={Users} />
        <SummaryCard label="Unassigned leads" value={teamWorkflow.summary.unassignedLeads} tone="amber" icon={AlertTriangle} />
        <SummaryCard label="Overdue follow-ups" value={teamWorkflow.summary.overdueFollowUps} tone="red" icon={Clock3} />
        <SummaryCard label="Due today" value={teamWorkflow.summary.dueToday} tone="amber" icon={CheckCircle2} />
        <SummaryCard label="Hot unassigned" value={teamWorkflow.summary.hotUnassigned} tone="red" icon={Zap} />
      </div>

      <CrmRoutingPanel teamWorkflow={teamWorkflow} activeStaff={activeStaff} onRefresh={loadTeamWorkflow} />

      <section className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex flex-col gap-3 border-b border-gray-100 p-4 dark:border-neutral-800 lg:flex-row lg:items-center lg:justify-between">
          <div><h3 className="text-sm font-black text-gray-950 dark:text-neutral-50">Staff workload board</h3><p className="mt-1 text-xs font-medium text-gray-500 dark:text-neutral-500">Risk is based on assigned leads, pending work, overdue follow-ups, hot leads, and human-reply pressure.</p></div>
          <div className="relative w-full lg:w-72"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input value={staffSearch} onChange={(event) => setStaffSearch(event.target.value)} placeholder="Search staff or risk..." className="h-10 w-full rounded-xl border border-gray-200 bg-white pl-9 pr-3 text-sm font-semibold dark:border-neutral-800 dark:bg-neutral-950" /></div>
        </div>
        <div className="grid gap-3 p-4 lg:grid-cols-2 2xl:grid-cols-3">
          {visibleStaffCards.length === 0 ? <p className="rounded-xl border border-dashed border-gray-200 p-4 text-center text-xs font-bold text-gray-400 dark:border-neutral-800 lg:col-span-2 2xl:col-span-3">Add staff to turn CRM assignment into a real owner queue.</p> : visibleStaffCards.map((item: any) => (
            <div key={item.id} className="rounded-2xl border border-gray-100 p-3 dark:border-neutral-800">
              {editStaffId === item.id && item.role !== "Assigned owner" ? (
                <div className="grid gap-2">
                  <input value={editDraft.name} onChange={(event) => setEditDraft({ ...editDraft, name: event.target.value })} className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-xs font-bold dark:border-neutral-800 dark:bg-neutral-950" />
                  <select value={editDraft.role} onChange={(event) => setEditDraft({ ...editDraft, role: event.target.value })} className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-xs font-bold dark:border-neutral-800 dark:bg-neutral-950">{(roles || []).map((role) => <option key={role} value={role}>{role}</option>)}</select>
                  <input value={editDraft.phone} onChange={(event) => setEditDraft({ ...editDraft, phone: event.target.value })} placeholder="Phone" className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-xs dark:border-neutral-800 dark:bg-neutral-950" />
                  <input value={editDraft.email} onChange={(event) => setEditDraft({ ...editDraft, email: event.target.value })} placeholder="Email" className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-xs dark:border-neutral-800 dark:bg-neutral-950" />
                  <input value={editDraft.notes} onChange={(event) => setEditDraft({ ...editDraft, notes: event.target.value })} placeholder="Notes" className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-xs dark:border-neutral-800 dark:bg-neutral-950" />
                  <label className="flex items-center gap-2 text-xs font-bold text-gray-600 dark:text-neutral-300"><input type="checkbox" checked={editDraft.active !== false} onChange={(event) => setEditDraft({ ...editDraft, active: event.target.checked })} /> Active</label>
                  <div className="flex gap-2"><button type="button" onClick={saveEdit} disabled={!editDraft.name.trim()} className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50">Save</button><button type="button" onClick={() => setEditStaffId("")} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-black text-gray-600 dark:border-neutral-800 dark:text-neutral-300">Cancel</button></div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-black text-gray-950 dark:text-neutral-50">{item.name}</p><p className="mt-1 text-xs font-medium text-gray-500">{item.role}{item.email ? ` / ${item.email}` : ""}{item.phone ? ` / ${item.phone}` : ""}</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${riskClass(item.riskLabel)}`}>{item.riskLabel}</span></div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">{[["Leads", item.assignedLeads], ["Overdue", item.overdueFollowUps], ["Today", item.dueToday], ["Hot", item.hotLeads], ["Pending", item.pendingFollowUps], ["Score", item.workloadScore]].map(([label, value]) => <div key={label as string} className="rounded-xl bg-gray-50 p-2 dark:bg-neutral-950"><p className="text-[10px] font-black uppercase text-gray-400">{label}</p><p className="font-black">{value as any}</p></div>)}</div>
                  {item.role !== "Assigned owner" ? <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => startEdit(item)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-[11px] font-black text-gray-600 dark:border-neutral-800 dark:text-neutral-300">Edit</button><button type="button" onClick={async () => { await onUpdate(item.id, { active: !item.active }); await loadTeamWorkflow(); }} className={`rounded-lg px-3 py-1.5 text-[11px] font-black uppercase ${item.active ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-gray-100 text-gray-500 dark:bg-neutral-800 dark:text-neutral-300"}`}>{item.active ? "Active" : "Inactive"}</button></div> : null}
                </>
              )}
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <LeadQueueCard title="Unassigned leads" description="New work without an owner." rows={queues.unassignedLeads || []} activeStaff={activeStaff} selectedStaffByLead={selectedStaffByLead} assignmentState={assignmentState} onSelectStaff={selectStaff} onAssign={assignLead} />
        <LeadQueueCard title="Needs human reply" description="Leads where automation is not enough anymore." rows={queues.needsHumanReply || []} activeStaff={activeStaff} selectedStaffByLead={selectedStaffByLead} assignmentState={assignmentState} onSelectStaff={selectStaff} onAssign={assignLead} />
        <LeadQueueCard title="Overdue follow-ups" description="Pending follow-ups already past due." rows={queues.overdueFollowUps || []} activeStaff={activeStaff} selectedStaffByLead={selectedStaffByLead} assignmentState={assignmentState} onSelectStaff={selectStaff} onAssign={assignLead} />
        <LeadQueueCard title="Due today" description="Work that should be handled today." rows={queues.dueToday || []} activeStaff={activeStaff} selectedStaffByLead={selectedStaffByLead} assignmentState={assignmentState} onSelectStaff={selectStaff} onAssign={assignLead} />
        <LeadQueueCard title="Stale / no next follow-up" description="Active leads without a next step." rows={queues.staleLeadsNoFollowUp || []} activeStaff={activeStaff} selectedStaffByLead={selectedStaffByLead} assignmentState={assignmentState} onSelectStaff={selectStaff} onAssign={assignLead} />
        <LeadQueueCard title="Hot unassigned" description="High-intent leads that still need an owner." rows={queues.hotUnassignedLeads || []} activeStaff={activeStaff} selectedStaffByLead={selectedStaffByLead} assignmentState={assignmentState} onSelectStaff={selectStaff} onAssign={assignLead} />
      </div>
    </section>
  );
}
