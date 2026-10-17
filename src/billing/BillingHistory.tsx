import React, { useState } from "react";
import { History, Search, Filter, Download, Calendar, AlertTriangle, Loader2 } from "lucide-react";
import { filterBillingTransactions, formatAccountCurrency, type BillingTransactionItem } from "./billing-model";

interface Props {
  transactions?: BillingTransactionItem[];
  currency?: string;
  formatDate?: (ts: any) => string;
  fromDate?: string;
  toDate?: string;
  onFromDateChange?: (val: string) => void;
  onToDateChange?: (val: string) => void;
  onDownloadStatementCSV?: () => void;
  isLoading?: boolean;
  hasLoadError?: boolean;
}

export const BillingHistory: React.FC<Props> = ({
  transactions = [],
  currency = "USD",
  formatDate = (ts) => (ts ? String(ts) : ""),
  fromDate = "",
  toDate = "",
  onFromDateChange,
  onToDateChange,
  onDownloadStatementCSV,
  isLoading = false,
  hasLoadError = false,
}) => {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const filtered = filterBillingTransactions(transactions, query, typeFilter);

  const handleDownloadCSV = () => {
    if (onDownloadStatementCSV) {
      onDownloadStatementCSV();
      return;
    }
    // Fallback client-side CSV download from current transactions
    if (filtered.length === 0) return;
    let csv = "Date,Type,Description,Amount ($),Balance After ($),Reference ID\n";
    filtered.forEach((tx) => {
      const d = formatDate(tx.timestamp);
      const desc = `"${(tx.description || "").replace(/"/g, '""')}"`;
      csv += `${d},${tx.type},${desc},${tx.amountUsd.toFixed(4)},${tx.runningBalanceUsd ?? ""},${tx.referenceId || ""}\n`;
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Account_Statement_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-surface)] p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-purple-500/10 text-purple-500">
              <History className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[var(--ca-text-primary)]">Billing History & Ledger</h2>
              <p className="text-xs text-[var(--ca-text-secondary)] mt-0.5">
                Complete record of wallet top-ups, usage debits, and plan purchases.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(onFromDateChange || onToDateChange) && (
              <div className="flex items-center gap-1.5 bg-[var(--ca-bg-hover)] border border-[var(--ca-border-subtle)] rounded-xl px-2.5 py-1 text-xs">
                <Calendar className="w-3.5 h-3.5 text-[var(--ca-text-muted)]" />
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => onFromDateChange?.(e.target.value)}
                  placeholder="Date From"
                  className="bg-transparent text-[var(--ca-text-primary)] outline-none text-[11px] font-mono"
                />
                <span className="text-[var(--ca-text-muted)]">-</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => onToDateChange?.(e.target.value)}
                  placeholder="Date To"
                  className="bg-transparent text-[var(--ca-text-primary)] outline-none text-[11px] font-mono"
                />
              </div>
            )}

            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ca-text-muted)]" />
              <input
                type="text"
                placeholder="Search transactions..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="bg-[var(--ca-bg-hover)] border border-[var(--ca-border-subtle)] rounded-xl pl-8 pr-3 py-1.5 text-xs text-[var(--ca-text-primary)] outline-none focus:border-[var(--ca-brand)]"
              />
            </div>

            <div className="flex items-center gap-1 bg-[var(--ca-bg-hover)] border border-[var(--ca-border-subtle)] rounded-xl px-2.5 py-1.5 text-xs">
              <Filter className="w-3.5 h-3.5 text-[var(--ca-text-muted)]" />
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="bg-transparent text-[var(--ca-text-primary)] outline-none font-bold cursor-pointer"
              >
                <option value="all">All Types</option>
                <option value="topup">Top-Up Credits</option>
                <option value="usage">Usage Debits</option>
                <option value="plan_purchase">Plan Purchases</option>
                <option value="addon_purchase">Add-on Purchases</option>
              </select>
            </div>

            <button
              type="button"
              onClick={handleDownloadCSV}
              disabled={transactions.length === 0}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-hover)] px-3 py-1.5 text-xs font-bold text-[var(--ca-text-primary)] hover:border-emerald-500 disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5 text-emerald-500" />
              <span>Download Statement CSV</span>
            </button>
          </div>
        </div>

        {/* Ledger Table & States */}
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="py-12 text-center text-xs text-[var(--ca-text-muted)] flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
              <span>Loading billing history...</span>
            </div>
          ) : hasLoadError ? (
            <div className="py-12 text-center text-xs text-rose-500 flex items-center justify-center gap-2 font-bold">
              <AlertTriangle className="w-4 h-4" />
              <span>Failed to load billing history. Please refresh or try again later.</span>
            </div>
          ) : transactions.length === 0 ? (
            <div className="py-12 text-center text-xs text-[var(--ca-text-muted)] font-medium">
              No billing transactions recorded yet.
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-xs text-[var(--ca-text-muted)] font-medium">
              No transactions match your search filter.
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[var(--ca-border-subtle)] text-[var(--ca-text-muted)] uppercase tracking-wider font-bold">
                  <th className="py-3 px-3">Date</th>
                  <th className="py-3 px-3">Type</th>
                  <th className="py-3 px-3">Description</th>
                  <th className="py-3 px-3">Amount</th>
                  <th className="py-3 px-3">Balance After</th>
                  <th className="py-3 px-3">Ref ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ca-border-subtle)]">
                {filtered.map((tx) => {
                  const isCredit = tx.amountUsd > 0;

                  return (
                    <tr key={tx.id} className="hover:bg-[var(--ca-bg-hover)]">
                      <td className="py-3 px-3 text-[var(--ca-text-secondary)] whitespace-nowrap">
                        {formatDate(tx.timestamp)}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded font-bold uppercase text-[10px] ${
                            isCredit
                              ? "bg-emerald-500/10 text-emerald-500"
                              : "bg-blue-500/10 text-blue-500"
                          }`}
                        >
                          {tx.type}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-bold text-[var(--ca-text-primary)]">
                        {tx.description}
                      </td>
                      <td
                        className={`py-3 px-3 font-mono font-bold ${
                          isCredit ? "text-emerald-500" : "text-[var(--ca-text-primary)]"
                        }`}
                      >
                        {isCredit ? "+" : ""}
                        {formatAccountCurrency(tx.amountUsd, currency)}
                      </td>
                      <td className="py-3 px-3 font-mono text-[var(--ca-text-muted)]">
                        {tx.runningBalanceUsd !== undefined
                          ? formatAccountCurrency(tx.runningBalanceUsd, currency)
                          : "-"}
                      </td>
                      <td className="py-3 px-3 font-mono text-[var(--ca-text-muted)] truncate max-w-[120px]">
                        {tx.referenceId || "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
