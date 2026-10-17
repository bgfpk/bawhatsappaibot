import React, { useEffect, useMemo, useRef, useState } from "react";
import { Database, Download, RefreshCw, Search, Upload } from "lucide-react";
import { parseCustomerCsv } from "../utils/customer-csv-import";
import { CUSTOMER_CSV_SAMPLE, downloadCsvText } from "../utils/customer-csv-sample";

type SharedDirectoryRow = {
  id: string;
  name?: string;
  phone?: string;
  phoneJid?: string;
  lidJid?: string;
  linkedJids?: string[];
  lookupCount?: number;
  source?: string;
  updatedAt?: number;
};

type Props = {
  requesterId: string;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
};

function formatUpdatedAt(value?: number) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-PK", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Karachi",
  }).format(new Date(value * 1000));
}

export function SharedPhoneDirectoryAdminPanel({ requesterId, onSuccess, onError }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [rows, setRows] = useState<SharedDirectoryRow[]>([]);
  const [rawLookupRows, setRawLookupRows] = useState(0);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  const loadDirectory = async () => {
    if (!requesterId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/shared-phone-directory?requesterId=${encodeURIComponent(requesterId)}&limit=5000`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load shared directory");
      setRows(Array.isArray(data.rows) ? data.rows : []);
      setRawLookupRows(Number(data.rawLookupRows || 0));
    } catch (e: any) {
      onError(e?.message || "Failed to load shared directory");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDirectory();
  }, [requesterId]);

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) =>
      [
        row.name,
        row.phone,
        row.phoneJid,
        row.lidJid,
        row.source,
        ...(row.linkedJids || []),
      ].filter(Boolean).join(" ").toLowerCase().includes(needle)
    );
  }, [query, rows]);

  const importFile = async (file?: File | null) => {
    if (!file || importing) return;
    setImporting(true);
    try {
      const parsedRows = parseCustomerCsv(await file.text());
      if (parsedRows.length === 0) throw new Error("No shared contacts found in CSV.");
      const res = await fetch("/api/admin/shared-phone-directory/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requesterId, rows: parsedRows }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Shared directory import failed");
      onSuccess(`Shared directory imported ${data.imported || 0}. Skipped ${data.skipped || 0}.`);
      await loadDirectory();
    } catch (e: any) {
      onError(e?.message || "Shared directory import failed");
    } finally {
      setImporting(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const downloadDirectory = () => {
    window.open(`/api/admin/shared-phone-directory.csv?requesterId=${encodeURIComponent(requesterId)}`, "_blank");
  };

  return (
    <div className="flex flex-col gap-4">
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(event) => importFile(event.target.files?.[0])}
      />

      <section className="bg-white dark:bg-neutral-900 rounded-xl p-5 border border-gray-100 dark:border-neutral-800 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-300 flex items-center justify-center">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-gray-900 dark:text-neutral-50">Shared Phone Directory</h3>
              <p className="text-xs font-bold text-gray-400 dark:text-neutral-500 uppercase tracking-widest">
                {rows.length} contacts, {rawLookupRows} lookup rows
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => downloadCsvText("shared-phone-directory-sample.csv", CUSTOMER_CSV_SAMPLE)}
              className="inline-flex items-center gap-2 bg-white dark:bg-neutral-950 border border-gray-200 dark:border-neutral-800 text-gray-600 dark:text-neutral-300 px-4 py-2 rounded-xl text-xs font-bold hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors"
            >
              <Download className="w-4 h-4" />
              Sample CSV
            </button>
            <button
              type="button"
              onClick={downloadDirectory}
              disabled={rows.length === 0}
              className="inline-flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 px-4 py-2 rounded-xl text-xs font-bold hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              Download CSV
            </button>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={importing || !requesterId}
              className="inline-flex items-center gap-2 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 px-4 py-2 rounded-xl text-xs font-bold hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors disabled:opacity-60"
            >
              {importing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Upload CSV
            </button>
            <button
              type="button"
              onClick={loadDirectory}
              disabled={loading}
              className="inline-flex items-center gap-2 bg-gray-900 dark:bg-neutral-100 text-white dark:text-neutral-950 px-4 py-2 rounded-xl text-xs font-bold hover:bg-gray-800 dark:hover:bg-white transition-colors disabled:opacity-60"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        <div className="relative mt-4 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search phone, JID, LID, or name..."
            className="w-full bg-gray-50 dark:bg-neutral-950 border border-gray-200 dark:border-neutral-800 rounded-xl pl-9 pr-3 py-2 text-sm text-gray-800 dark:text-neutral-100 outline-none focus:border-emerald-500"
          />
        </div>
      </section>

      <section className="bg-white dark:bg-neutral-900 border border-gray-100 dark:border-neutral-800 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 dark:bg-neutral-800 border-b border-gray-100 dark:border-neutral-800">
                <th className="px-4 py-3 text-[11px] font-black uppercase tracking-widest text-gray-500 dark:text-neutral-400">Name</th>
                <th className="px-4 py-3 text-[11px] font-black uppercase tracking-widest text-gray-500 dark:text-neutral-400">Phone</th>
                <th className="px-4 py-3 text-[11px] font-black uppercase tracking-widest text-gray-500 dark:text-neutral-400">LID</th>
                <th className="px-4 py-3 text-[11px] font-black uppercase tracking-widest text-gray-500 dark:text-neutral-400">Linked JIDs</th>
                <th className="px-4 py-3 text-[11px] font-black uppercase tracking-widest text-gray-500 dark:text-neutral-400">Lookups</th>
                <th className="px-4 py-3 text-[11px] font-black uppercase tracking-widest text-gray-500 dark:text-neutral-400">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-neutral-800">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm font-bold text-gray-400 dark:text-neutral-500">
                    {loading ? "Loading shared directory..." : "No shared contacts found."}
                  </td>
                </tr>
              ) : filteredRows.map((row) => (
                <tr key={row.id || `${row.phone}-${row.lidJid}`} className="hover:bg-gray-50 dark:hover:bg-neutral-800/60">
                  <td className="px-4 py-4 text-sm font-bold text-gray-900 dark:text-neutral-50">{row.name || "-"}</td>
                  <td className="px-4 py-4 text-xs font-bold text-gray-600 dark:text-neutral-300">
                    <div>{row.phone || "-"}</div>
                    <div className="text-[10px] text-gray-400 dark:text-neutral-600 mt-1">{row.phoneJid || ""}</div>
                  </td>
                  <td className="px-4 py-4 text-xs text-gray-500 dark:text-neutral-400">{row.lidJid || "-"}</td>
                  <td className="px-4 py-4 text-xs text-gray-500 dark:text-neutral-400 max-w-md">
                    {(row.linkedJids || []).slice(0, 4).join(", ") || "-"}
                    {(row.linkedJids || []).length > 4 ? ` +${(row.linkedJids || []).length - 4}` : ""}
                  </td>
                  <td className="px-4 py-4 text-xs font-black text-gray-500 dark:text-neutral-400">{row.lookupCount || 1}</td>
                  <td className="px-4 py-4 text-xs font-bold text-gray-500 dark:text-neutral-400">{formatUpdatedAt(row.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
