import React, { useEffect, useState } from "react";
import { BookOpen, RefreshCw } from "lucide-react";

async function apiJson(path: string) {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function formatDate(value: any) {
  const seconds = Number(value || 0);
  if (!seconds) return "Not set";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(seconds * 1000));
}

function statLabel(value: any) {
  return Number(value || 0).toLocaleString();
}

function bytesLabel(value: any) {
  const bytes = Number(value || 0);
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function WebsiteKnowledgePanel() {
  const [knowledge, setKnowledge] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setIsLoading(true);
    setError("");
    try {
      setKnowledge(await apiJson("/api/user/website-knowledge"));
    } catch (e: any) {
      setError(e.message || "Failed to load website knowledge");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <section className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="border-b border-gray-100 p-5 dark:border-neutral-800">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-emerald-600" />
              <h2 className="text-sm font-black text-gray-950 dark:text-neutral-50">Website Knowledge</h2>
            </div>
            <p className="mt-1 text-xs font-medium text-gray-500 dark:text-neutral-500">WordPress connector content is cleaned, stored, and made available to AI replies for the matching account and bot.</p>
          </div>
          <button onClick={load} disabled={isLoading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-black text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-60 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-200">
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
        {error ? <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">{error}</div> : null}
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          {[
            ["Synced items", statLabel(knowledge?.totalItems)],
            ["Pages / Posts", `${statLabel(knowledge?.pagesCount)} / ${statLabel(knowledge?.postsCount)}`],
            ["Failed", statLabel(knowledge?.failedItemCount), Number(knowledge?.failedItemCount || 0) > 0 ? "text-red-600 dark:text-red-400" : ""],
            ["Status", knowledge?.latestSyncStatus || "none"],
          ].map(([label, value, color]) => (
            <div key={String(label)} className="rounded-xl border border-gray-100 p-3 dark:border-neutral-800">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{label}</p>
              <p className={`mt-2 text-xl font-black capitalize ${color || ""}`}>{value}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-gray-100 p-3 dark:border-neutral-800">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Connected site</p>
            <p className="mt-1 break-all text-xs font-bold text-gray-700 dark:text-neutral-200">{knowledge?.connectedSiteUrl || "Not connected"}</p>
          </div>
          <div className="rounded-xl border border-gray-100 p-3 dark:border-neutral-800">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Bot ID</p>
            <p className="mt-1 break-all text-xs font-bold text-gray-700 dark:text-neutral-200">{knowledge?.botId || "Any bot / not set"}</p>
          </div>
          <div className="rounded-xl border border-gray-100 p-3 dark:border-neutral-800">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Source / last sync</p>
            <p className="mt-1 text-xs font-bold text-gray-700 dark:text-neutral-200">{knowledge?.sourceType || "WordPress"} - {formatDate(knowledge?.lastSyncAt)}</p>
          </div>
        </div>
      </div>

      <div className="p-5">
        <h3 className="mb-3 text-xs font-black uppercase tracking-widest text-gray-400 dark:text-neutral-500">Synced WordPress items</h3>
        <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-neutral-800">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-gray-50 text-[10px] uppercase tracking-widest text-gray-400 dark:bg-neutral-950/60 dark:text-neutral-500">
              <tr>
                <th className="px-3 py-2">Title</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">URL</th>
                <th className="px-3 py-2">Last modified</th>
                <th className="px-3 py-2">Last synced</th>
                <th className="px-3 py-2">Size / hash</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {(knowledge?.items || []).length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-sm font-bold text-gray-400">No synced website knowledge yet. Connect WordPress and run a sync to populate this table.</td></tr>
              ) : (knowledge?.items || []).map((item: any) => (
                <tr key={item.id} className="border-t border-gray-100 dark:border-neutral-800">
                  <td className="px-3 py-2 font-black text-gray-950 dark:text-neutral-50">{item.title || "Untitled"}</td>
                  <td className="px-3 py-2 font-bold capitalize text-gray-600 dark:text-neutral-300">{item.type}</td>
                  <td className="max-w-[260px] truncate px-3 py-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">{item.url || "-"}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{formatDate(item.lastModifiedAt || item.updatedAt)}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{formatDate(item.lastSyncedAt)}</td>
                  <td className="px-3 py-2 text-xs font-mono text-gray-500">{bytesLabel(item.contentLength)} {item.contentHash ? `- ${item.contentHash}` : ""}</td>
                  <td className="px-3 py-2"><span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black uppercase text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">{item.status || "active"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 className="mb-3 mt-5 text-xs font-black uppercase tracking-widest text-gray-400 dark:text-neutral-500">Failed sync items</h3>
        <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-neutral-800">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-gray-50 text-[10px] uppercase tracking-widest text-gray-400 dark:bg-neutral-950/60 dark:text-neutral-500">
              <tr>
                <th className="px-3 py-2">WordPress ID</th>
                <th className="px-3 py-2">Title</th>
                <th className="px-3 py-2">URL</th>
                <th className="px-3 py-2">Error reason</th>
                <th className="px-3 py-2">Time</th>
              </tr>
            </thead>
            <tbody>
              {(knowledge?.failedItems || []).length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-sm font-bold text-gray-400">No failed WordPress sync items recorded for the latest runs.</td></tr>
              ) : (knowledge?.failedItems || []).map((item: any) => (
                <tr key={item.id || `${item.sourceItemId}-${item.failedAt}`} className="border-t border-gray-100 dark:border-neutral-800">
                  <td className="px-3 py-2 font-mono text-xs text-gray-500">{item.sourceItemId || "-"}</td>
                  <td className="px-3 py-2 font-black text-gray-950 dark:text-neutral-50">{item.title || "Untitled"}</td>
                  <td className="max-w-[240px] truncate px-3 py-2 text-xs font-medium text-gray-500">{item.url || "-"}</td>
                  <td className="px-3 py-2 text-xs font-bold text-red-600 dark:text-red-300">{item.errorReason || "Unknown error"}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{formatDate(item.failedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
