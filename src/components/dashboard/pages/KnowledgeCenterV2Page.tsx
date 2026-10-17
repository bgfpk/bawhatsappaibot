import React, { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Database, Filter, Search, ShieldCheck } from "lucide-react";
import { buildKnowledgeCenterInventory, type KnowledgeCenterInput, type KnowledgeSourceStatus } from "../../../services/knowledge-center-service";

type Props = {
  children?: React.ReactNode;
  statusInput?: KnowledgeCenterInput;
  onOpenAiStudio?: () => void;
};

const FILTERS: Array<"all" | KnowledgeSourceStatus> = ["all", "ready", "partial", "needs_review", "not_connected"];

function statusClass(status: KnowledgeSourceStatus) {
  if (status === "ready") return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300";
  if (status === "partial") return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300";
  if (status === "needs_review") return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300";
  return "border-gray-200 bg-gray-50 text-gray-600 dark:border-neutral-800 dark:bg-neutral-950/50 dark:text-neutral-400";
}

export function KnowledgeCenterV2Page({ children, statusInput = {}, onOpenAiStudio }: Props) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [query, setQuery] = useState("");
  const inventory = useMemo(() => buildKnowledgeCenterInventory(statusInput), [statusInput]);
  const sources = inventory.sources.filter((source) => {
    const matchesFilter = filter === "all" || source.status === filter;
    const haystack = `${source.label} ${source.description} ${source.type}`.toLowerCase();
    const matchesQuery = !query.trim() || haystack.includes(query.trim().toLowerCase());
    return matchesFilter && matchesQuery;
  });

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] border border-emerald-200/70 bg-gradient-to-br from-neutral-950 via-emerald-950 to-black p-6 text-white shadow-xl shadow-emerald-950/20 dark:border-emerald-900/60">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-300">Knowledge Center</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">See what the AI knows</h2>
            <p className="mt-3 text-sm font-semibold leading-6 text-emerald-50/75">See what the AI knows, where it learned it, what needs updating, and which sources are only customer-specific context.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 rounded-2xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] p-3 text-center sm:grid-cols-4">
            <div><p className="text-2xl font-black text-emerald-200">{inventory.summary.ready}</p><p className="text-[10px] font-black uppercase tracking-widest text-white/45">Ready</p></div>
            <div><p className="text-2xl font-black text-blue-200">{inventory.summary.partial}</p><p className="text-[10px] font-black uppercase tracking-widest text-white/45">Partial</p></div>
            <div><p className="text-2xl font-black text-amber-200">{inventory.summary.needs_review}</p><p className="text-[10px] font-black uppercase tracking-widest text-white/45">Review</p></div>
            <div><p className="text-2xl font-black text-neutral-200">{inventory.summary.not_connected}</p><p className="text-[10px] font-black uppercase tracking-widest text-white/45">Offline</p></div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 items-center gap-2 rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2 dark:border-neutral-800 dark:bg-neutral-950/50">
            <Search className="h-4 w-4 text-gray-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search sources" className="w-full bg-transparent text-sm font-semibold text-gray-700 outline-none dark:text-neutral-200" />
          </div>
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((item) => (
              <button key={item} type="button" onClick={() => setFilter(item)} className={`rounded-full border px-3 py-1.5 text-[11px] font-black uppercase tracking-widest ${filter === item ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "border-gray-200 text-gray-500 dark:border-neutral-800 dark:text-neutral-400"}`}>
                {item.replace("_", " ")}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {sources.map((source) => (
          <article key={source.id} className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300"><Database className="h-5 w-5" /></div>
                <h3 className="text-base font-black text-gray-950 dark:text-neutral-50">{source.label}</h3>
                <p className="mt-1 text-xs font-semibold leading-5 text-gray-500 dark:text-neutral-500">{source.description}</p>
              </div>
              <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${statusClass(source.status)}`}>{source.status.replace("_", " ")}</span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-gray-50 p-3 dark:bg-neutral-950/50"><p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Count</p><p className="mt-1 text-sm font-black text-gray-900 dark:text-neutral-50">{source.count === null ? "Unknown" : source.count}</p></div>
              <div className="rounded-2xl bg-gray-50 p-3 dark:bg-neutral-950/50"><p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Freshness</p><p className="mt-1 text-sm font-black text-gray-900 dark:text-neutral-50">{source.freshness}</p></div>
              <div className="rounded-2xl bg-gray-50 p-3 dark:bg-neutral-950/50"><p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Updated</p><p className="mt-1 text-sm font-black text-gray-900 dark:text-neutral-50">{source.lastUpdatedAt ? new Date(source.lastUpdatedAt).toLocaleDateString() : "Unknown"}</p></div>
            </div>
            {source.preview ? <p className="mt-4 rounded-2xl border border-gray-100 bg-gray-50 p-3 text-xs font-semibold leading-5 text-gray-600 dark:border-neutral-800 dark:bg-neutral-950/50 dark:text-neutral-300">{source.preview}</p> : null}
            {source.risks.length > 0 ? <div className="mt-4 space-y-2">{source.risks.map((risk) => <p key={risk} className="flex gap-2 text-xs font-bold text-amber-700 dark:text-amber-300"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{risk}</p>)}</div> : null}
            <div className="mt-4 flex flex-wrap gap-2">{source.actions.map((action) => <span key={action} className="rounded-full border border-gray-200 px-3 py-1 text-[11px] font-black text-gray-500 dark:border-neutral-800 dark:text-neutral-400">{action}</span>)}</div>
          </article>
        ))}
      </section>

      <section className="rounded-3xl border border-emerald-100 bg-emerald-50 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/20">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-600 dark:text-emerald-300" />
            <div>
              <p className="text-sm font-black text-emerald-900 dark:text-emerald-100">Safe knowledge governance</p>
              <p className="text-xs font-semibold leading-5 text-emerald-700 dark:text-emerald-300">This foundation only displays existing knowledge. It does not call AI, send WhatsApp messages, charge wallet, or expose secrets in previews.</p>
            </div>
          </div>
          {onOpenAiStudio ? <button type="button" onClick={onOpenAiStudio} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2 text-xs font-black text-white"><Filter className="h-4 w-4" />Open AI Studio</button> : null}
        </div>
      </section>

      {children ? <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"><div className="mb-4 flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-300" /><h3 className="text-sm font-black text-gray-950 dark:text-neutral-50">Existing learned knowledge editor</h3></div>{children}</section> : null}
    </div>
  );
}
