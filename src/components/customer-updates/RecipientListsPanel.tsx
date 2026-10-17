import React, { useEffect, useMemo, useState } from "react";
import { CalendarClock, Eye, RefreshCw, Save, Send, Trash2, Users } from "lucide-react";
import { readJsonResponse } from "../../services/api-json-response-service";
import { normalizeWhatsAppJid } from "../../utils/whatsapp-jid";

type Mode = "lists" | "send" | "runs";

function countRecipients(value: string) {
  const seen = new Set<string>();
  return String(value || "").split(/[\n,;\t]+/).map((entry) => entry.trim()).filter(Boolean).reduce((acc, raw) => {
    const jid = normalizeWhatsAppJid(raw);
    const key = jid || raw.toLowerCase();
    if (!jid) acc.invalid++;
    else if (seen.has(key)) acc.duplicate++;
    else acc.valid++;
    if (key) seen.add(key);
    acc.total++;
    return acc;
  }, { total: 0, valid: 0, invalid: 0, duplicate: 0 });
}

function formatTime(value?: number) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-PK", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value * 1000));
}

function parseDateTimeInput(value: string) {
  if (!value) return 0;
  return Math.floor(new Date(value).getTime() / 1000);
}

function defaultScheduleInput() {
  const date = new Date(Date.now() + 15 * 60 * 1000);
  date.setSeconds(0, 0);
  return date.toISOString().slice(0, 16);
}

export function RecipientListsPanel({ mode }: { mode: Mode }) {
  const [state, setState] = useState<any>({ lists: [], members: [], runs: [], jobs: [], campaigns: [] });
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [openListId, setOpenListId] = useState("");
  const [openRunId, setOpenRunId] = useState("");
  const [listForm, setListForm] = useState({ name: "", description: "", recipients: "" });
  const [sendForm, setSendForm] = useState({ listId: "", botId: "", messageText: "", runAt: defaultScheduleInput(), repeatRule: "" });

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/user/customer-update-list-foundation");
      const data = await readJsonResponse(res, { context: "Saved recipient lists" });
      if (!res.ok) throw new Error(data?.error || "Failed to load saved lists");
      setState(data || {});
      const firstList = data?.lists?.[0]?.id || "";
      setSendForm((prev) => ({ ...prev, listId: prev.listId || firstList }));
    } catch (e: any) {
      setError(e?.message || "Failed to load saved lists");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (mode !== "runs") return;
    const timer = window.setInterval(load, 8000);
    return () => window.clearInterval(timer);
  }, [mode]);

  const preview = useMemo(() => countRecipients(listForm.recipients), [listForm.recipients]);
  const openMembers = (state.members || []).filter((member: any) => member.listId === openListId && member.status !== "removed");
  const openRunJobs = (state.jobs || []).filter((job: any) => job.runId === openRunId);

  const run = async (action: () => Promise<void>, success: string) => {
    setBusy(true); setError(""); setMessage("");
    try {
      await action();
      setMessage(success);
      await load();
    } catch (e: any) {
      setError(e?.message || "Request failed");
    } finally {
      setBusy(false);
    }
  };

  const saveList = () => run(async () => {
    const res = await fetch("/api/user/customer-update-lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(listForm),
    });
    const data = await readJsonResponse(res, { context: "Save recipient list" });
    if (!res.ok) throw new Error(data?.error || "Failed to save list");
    setListForm({ name: "", description: "", recipients: "" });
  }, "Recipient list saved.");

  const sendList = (scheduled: boolean) => run(async () => {
    const res = await fetch(scheduled ? "/api/user/customer-update-list-campaigns/schedule" : "/api/user/customer-update-list-campaigns/send-now", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...sendForm,
        runAt: scheduled ? parseDateTimeInput(sendForm.runAt) : undefined,
        repeatRule: scheduled ? sendForm.repeatRule : "",
      }),
    });
    const data = await readJsonResponse(res, { context: "Send to saved list" });
    if (!res.ok) throw new Error(data?.error || "Failed to queue list send");
    setOpenRunId(data?.run?.id || "");
  }, scheduled ? "List message scheduled." : "List message queued.");

  const removeMember = (listId: string, memberId: string) => run(async () => {
    const res = await fetch(`/api/user/customer-update-lists/${listId}/members/${memberId}`, { method: "DELETE" });
    const data = await readJsonResponse(res, { context: "Remove list member" });
    if (!res.ok) throw new Error(data?.error || "Failed to remove member");
  }, "Member removed.");

  const lists = state.lists || [];
  const runs = state.runs || [];
  const campaigns = state.campaigns || [];
  const limits = state.messageSafetyLimits || {};
  const maxListRecipients = limits.MAX_SAVED_LIST_IMPORT_RECIPIENTS || 500;
  const maxRunRecipients = limits.MAX_QUICK_SEND_RUN_RECIPIENTS || 100;

  return (
    <div className="grid gap-5">
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
        Only message opted-in customers. Avoid spam, start with small batches, and keep list/API sends within the current safety limits.
      </div>
      {(message || error) && (
        <div className={`rounded-xl px-4 py-3 text-sm font-bold ${error ? "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300" : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"}`}>
          {error || message}
        </div>
      )}

      {mode === "lists" && (
        <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded-2xl border border-gray-200 bg-white/92 p-5 shadow-sm dark:border-white/10 dark:bg-neutral-900/88">
            <h3 className="text-base font-black text-gray-950 dark:text-neutral-50">Saved Lists</h3>
            <p className="mt-1 text-xs font-medium text-gray-500 dark:text-neutral-400">Use only opted-in recipients. Invalid and duplicate rows are tracked instead of crashing sends. Max {maxListRecipients} recipients per import.</p>
            <div className="mt-4 grid gap-3">
              <input value={listForm.name} onChange={(e) => setListForm({ ...listForm, name: e.target.value })} placeholder="List name" className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm dark:border-neutral-800 dark:bg-neutral-950" />
              <input value={listForm.description} onChange={(e) => setListForm({ ...listForm, description: e.target.value })} placeholder="Description optional" className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm dark:border-neutral-800 dark:bg-neutral-950" />
              <textarea value={listForm.recipients} onChange={(e) => setListForm({ ...listForm, recipients: e.target.value })} rows={8} placeholder="Paste one number per line, or comma separated" className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm dark:border-neutral-800 dark:bg-neutral-950" />
              <div className="grid grid-cols-4 gap-2 text-center text-xs font-black">
                <span className="rounded-xl bg-gray-100 p-2 dark:bg-neutral-800">Total {preview.total}</span>
                <span className="rounded-xl bg-emerald-50 p-2 text-emerald-700 dark:bg-emerald-950/30">Valid {preview.valid}</span>
                <span className="rounded-xl bg-amber-50 p-2 text-amber-700 dark:bg-amber-950/30">Dup {preview.duplicate}</span>
                <span className="rounded-xl bg-red-50 p-2 text-red-700 dark:bg-red-950/30">Invalid {preview.invalid}</span>
              </div>
              <button disabled={busy || !listForm.recipients.trim()} onClick={saveList} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"><Save className="h-4 w-4" /> Save list</button>
            </div>
          </section>
          <section className="rounded-2xl border border-gray-200 bg-white/92 p-5 shadow-sm dark:border-white/10 dark:bg-neutral-900/88">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-black text-gray-950 dark:text-neutral-50">Lists</h3>
              <button onClick={load} disabled={loading} className="rounded-xl bg-gray-100 p-2 dark:bg-neutral-800"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button>
            </div>
            <div className="mt-4 grid gap-3">
              {lists.length === 0 ? <p className="text-sm font-medium text-gray-500">No saved lists yet.</p> : lists.map((list: any) => (
                <div key={list.id} className="rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-neutral-800 dark:bg-neutral-950/60">
                  <div className="flex items-start justify-between gap-3">
                    <div><p className="font-black text-gray-900 dark:text-neutral-50">{list.name}</p><p className="text-xs text-gray-500">{list.description || "No description"}</p></div>
                    <button onClick={() => setOpenListId(list.id)} className="rounded-lg bg-white p-2 dark:bg-neutral-900"><Eye className="h-4 w-4" /></button>
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-2 text-xs font-black text-gray-600 dark:text-neutral-300">
                    <span>Total {list.memberCount}</span><span>Valid {list.validCount}</span><span>Dup {list.duplicateCount || 0}</span><span>Invalid {list.invalidCount}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {mode === "send" && (
        <section className="rounded-2xl border border-gray-200 bg-white/92 p-5 shadow-sm dark:border-white/10 dark:bg-neutral-900/88">
          <h3 className="text-base font-black text-gray-950 dark:text-neutral-50">Send to List</h3>
          <p className="mt-1 text-xs font-medium text-gray-500 dark:text-neutral-400">Creates campaign, run, and per-recipient jobs. Billing happens only after WhatsApp returns sent message evidence. Max {maxRunRecipients} valid recipients per run.</p>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <select value={sendForm.listId} onChange={(e) => setSendForm({ ...sendForm, listId: e.target.value })} className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm dark:border-neutral-800 dark:bg-neutral-950">
              <option value="">Select saved list</option>
              {lists.map((list: any) => <option key={list.id} value={list.id}>{list.name} ({list.validCount} valid)</option>)}
            </select>
            <input value={sendForm.botId} onChange={(e) => setSendForm({ ...sendForm, botId: e.target.value })} placeholder="Instance ID optional, default first active" className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm dark:border-neutral-800 dark:bg-neutral-950" />
            <textarea value={sendForm.messageText} onChange={(e) => setSendForm({ ...sendForm, messageText: e.target.value })} rows={5} placeholder="Message text" className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm dark:border-neutral-800 dark:bg-neutral-950 lg:col-span-2" />
            <input type="datetime-local" value={sendForm.runAt} onChange={(e) => setSendForm({ ...sendForm, runAt: e.target.value })} className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm dark:border-neutral-800 dark:bg-neutral-950" />
            <select value={sendForm.repeatRule} onChange={(e) => setSendForm({ ...sendForm, repeatRule: e.target.value })} className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm dark:border-neutral-800 dark:bg-neutral-950">
              <option value="">One time</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
            </select>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button disabled={busy || !sendForm.listId || !sendForm.messageText.trim()} onClick={() => sendList(false)} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"><Send className="h-4 w-4" /> Send now</button>
            <button disabled={busy || !sendForm.listId || !sendForm.messageText.trim()} onClick={() => sendList(true)} className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"><CalendarClock className="h-4 w-4" /> Schedule</button>
          </div>
        </section>
      )}

      {mode === "runs" && (
        <section className="rounded-2xl border border-gray-200 bg-white/92 p-5 shadow-sm dark:border-white/10 dark:bg-neutral-900/88">
          <div className="flex items-center justify-between gap-3"><h3 className="text-base font-black text-gray-950 dark:text-neutral-50">Runs</h3><button onClick={load} className="rounded-xl bg-gray-100 p-2 dark:bg-neutral-800"><RefreshCw className="h-4 w-4" /></button></div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs uppercase text-gray-400"><tr><th className="p-2">Run</th><th className="p-2">When</th><th className="p-2">Status</th><th className="p-2">Total</th><th className="p-2">Sent</th><th className="p-2">Failed</th><th className="p-2">Skipped</th><th className="p-2"></th></tr></thead>
              <tbody>{runs.map((run: any) => <tr key={run.id} className="border-t border-gray-100 dark:border-neutral-800"><td className="p-2 font-bold">{run.id}</td><td className="p-2">{formatTime(run.runAt)}</td><td className="p-2">{run.status}</td><td className="p-2">{run.totalCount}</td><td className="p-2">{run.sentCount}</td><td className="p-2">{run.failedCount}</td><td className="p-2">{run.skippedCount}</td><td className="p-2"><button onClick={() => setOpenRunId(run.id)} className="rounded-lg bg-gray-100 p-2 dark:bg-neutral-800"><Eye className="h-4 w-4" /></button></td></tr>)}</tbody>
            </table>
          </div>
          {campaigns.length > 0 && <p className="mt-3 text-xs font-medium text-gray-500">Campaigns tracked: {campaigns.length}</p>}
        </section>
      )}

      {(openListId || openRunId) && (
        <div className="fixed inset-0 z-[80] flex items-end justify-end bg-black/30 p-4" onClick={() => { setOpenListId(""); setOpenRunId(""); }}>
          <div className="max-h-[86vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl dark:bg-neutral-900" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between"><h3 className="font-black text-gray-950 dark:text-neutral-50">{openListId ? "List members" : "Run recipients"}</h3><button onClick={() => { setOpenListId(""); setOpenRunId(""); }} className="rounded-lg bg-gray-100 px-3 py-1 text-xs font-bold dark:bg-neutral-800">Close</button></div>
            {openListId ? (
              <div className="grid gap-2">{openMembers.map((member: any) => <div key={member.id} className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 p-3 text-sm dark:bg-neutral-950"><span>{member.phoneRaw} <b className="ml-2">{member.status}</b></span><button onClick={() => removeMember(member.listId, member.id)} className="text-red-600"><Trash2 className="h-4 w-4" /></button></div>)}</div>
            ) : (
              <div className="grid gap-2">{openRunJobs.map((job: any) => <div key={job.id} className="rounded-xl bg-gray-50 p-3 text-sm dark:bg-neutral-950"><div className="flex items-center justify-between gap-3"><span>{job.normalizedPhone || job.jid || job.phoneRaw}</span><b>{job.status}</b></div><p className="mt-1 text-xs text-gray-500">Sent {formatTime(job.sentAt)} / Failed {formatTime(job.failedAt)} / Message {job.whatsAppMessageId || "-"}</p>{job.lastError ? <p className="mt-1 text-xs text-red-600">{job.lastError}</p> : null}</div>)}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
