import React, { useRef, useState } from "react";
import { Download, RefreshCw, Upload } from "lucide-react";
import { parseCustomerCsv } from "../utils/customer-csv-import";
import { CUSTOMER_CSV_SAMPLE, downloadCsvText } from "../utils/customer-csv-sample";

type Props = {
  userId: string;
  onImported: () => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
};

export function CustomerCsvImportButton({ userId, onImported, onSuccess, onError }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [importing, setImporting] = useState(false);

  const importFile = async (file?: File | null) => {
    if (!file || importing) return;
    setImporting(true);
    try {
      const rows = parseCustomerCsv(await file.text());
      if (rows.length === 0) throw new Error("No customers found in CSV.");
      const missingIdentity = rows.find((row) => !row.phone && !row.jid && !row.lidJid);
      if (missingIdentity) throw new Error("Each row needs at least phone, JID, or LID.");
      const invalid = rows.find((row) => row.phone && (row.phone.length < 8 || row.phone.length > 15));
      if (invalid) throw new Error(`Invalid phone number "${invalid.phone}". Use country code digits, e.g. 923001234567.`);

      const res = await fetch("/api/user/customers/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, rows }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Customer import failed");
      onSuccess(`Imported ${data.imported || 0} customer${(data.imported || 0) === 1 ? "" : "s"}. Shared ${data.shared || 0}. Skipped ${data.skipped || 0}.`);
      onImported();
    } catch (e: any) {
      onError(e?.message || "Customer import failed");
    } finally {
      setImporting(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(event) => importFile(event.target.files?.[0])}
      />
      <button
        type="button"
        onClick={() => downloadCsvText("customer-import-sample.csv", CUSTOMER_CSV_SAMPLE)}
        title="Download sample customer CSV"
        className="inline-flex items-center gap-2 bg-white dark:bg-neutral-900 text-gray-600 dark:text-neutral-300 border border-gray-200 dark:border-neutral-800 px-4 py-2 rounded-xl text-xs font-bold hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors"
      >
        <Download className="w-4 h-4" />
        Sample CSV
      </button>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={importing || !userId}
        title="Import customers from CSV"
        className="inline-flex items-center gap-2 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 px-4 py-2 rounded-xl text-xs font-bold hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors disabled:opacity-60"
      >
        {importing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
        Import CSV
      </button>
    </>
  );
}
