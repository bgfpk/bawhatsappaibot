import React, { useState, useMemo } from "react";
import { Search, Users, Download, ArrowUpDown } from "lucide-react";
import { DashboardPageHeader, DashboardToolbar, DashboardEmptyState, ToneBadge } from "../components/dashboard/DashboardPrimitives";
import { filterAndSortCustomers, type CustomerSortColumn, type CustomerSortDirection } from "./customer-model";
import { CustomerCsvImportButton } from "../components/CustomerCsvImportButton";
import { getDisplayNameFromCustomer, getDisplayPhoneFromCustomer } from "../utils/contact-identity";

export interface CustomersPageProps {
  customers: any[];
  userId?: string;
  isGlobalAiEnabled?: boolean | undefined;
  onSelectCustomer: (customer: any) => void;
  onRefreshCustomers?: () => void;
  onDownloadCsv?: () => void;
  onSuccess?: (msg: string) => void;
  onError?: (msg: string) => void;
  formatDate?: (ts?: number | string) => string;
}

export const CustomersPage: React.FC<CustomersPageProps> = ({
  customers = [],
  userId = "",
  isGlobalAiEnabled,
  onSelectCustomer,
  onRefreshCustomers = () => {},
  onDownloadCsv,
  onSuccess = () => {},
  onError = () => {},
  formatDate = (ts) => (ts ? String(ts) : ""),
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "ai_paused" | "human" | "orders" | "recent">("all");
  const [sortColumn, setSortColumn] = useState<CustomerSortColumn>("interacted");
  const [sortDirection, setSortDirection] = useState<CustomerSortDirection>("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  const filtered = useMemo(() => {
    return filterAndSortCustomers(
      customers,
      { searchQuery, sourceFilter, statusFilter },
      { column: sortColumn, direction: sortDirection },
    );
  }, [customers, searchQuery, sourceFilter, statusFilter, sortColumn, sortDirection]);

  const paginated = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filtered.slice(start, start + itemsPerPage);
  }, [filtered, currentPage]);

  const totalPages = Math.ceil(filtered.length / itemsPerPage) || 1;

  const handleSort = (col: CustomerSortColumn) => {
    if (sortColumn === col) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(col);
      setSortDirection("desc");
    }
  };

  const getAriaSort = (col: CustomerSortColumn) => {
    if (sortColumn !== col) return "none";
    return sortDirection === "asc" ? "ascending" : "descending";
  };

  const nowSeconds = Math.floor(Date.now() / 1000);

  return (
    <div className="flex flex-col gap-5">
      <DashboardPageHeader
        eyebrow="Directory"
        title="Customers & Leads"
        description="Comprehensive customer database built from WhatsApp conversations and sales interactions."
        icon={Users}
      />

      <DashboardToolbar>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ca-text-muted)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search customers by name, phone, or notes..."
            className="w-full rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] pl-10 pr-4 py-2 text-xs font-medium text-[var(--ca-text-primary)] outline-none focus:border-emerald-500"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as any);
            setCurrentPage(1);
          }}
          className="rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] px-3 py-2 text-xs font-bold text-[var(--ca-text-primary)] outline-none focus:border-emerald-500"
        >
          <option value="all">All Statuses</option>
          <option value="ai_paused">AI Paused</option>
          <option value="human">Human Handled</option>
          <option value="orders">Has Orders</option>
        </select>

        <div className="flex items-center gap-2">
          {onDownloadCsv && customers.length > 0 && (
            <button
              type="button"
              onClick={onDownloadCsv}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] px-3 py-2 text-xs font-bold text-[var(--ca-text-primary)] hover:border-emerald-500"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export CSV</span>
            </button>
          )}

          <CustomerCsvImportButton
            userId={userId}
            onImported={onRefreshCustomers}
            onSuccess={onSuccess}
            onError={onError}
          />
        </div>
      </DashboardToolbar>

      {filtered.length === 0 ? (
        <DashboardEmptyState
          icon={Users}
          title="No Customers Found"
          body="No customer profiles match your search filter."
          tone="neutral"
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-1)] shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--ca-border-subtle)] bg-[var(--ca-surface-2)] text-[var(--ca-text-muted)] font-bold">
                  <th className="p-4" aria-sort={getAriaSort("name")}>
                    <button
                      type="button"
                      onClick={() => handleSort("name")}
                      className="flex items-center gap-1 text-left font-bold hover:text-[var(--ca-text-primary)] focus:outline-none"
                    >
                      <span>Customer</span>
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="p-4" aria-sort={getAriaSort("contact")}>
                    <button
                      type="button"
                      onClick={() => handleSort("contact")}
                      className="flex items-center gap-1 text-left font-bold hover:text-[var(--ca-text-primary)] focus:outline-none"
                    >
                      <span>Contact</span>
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="p-4">AI & Status</th>
                  <th className="p-4" aria-sort={getAriaSort("interacted")}>
                    <button
                      type="button"
                      onClick={() => handleSort("interacted")}
                      className="flex items-center gap-1 text-left font-bold hover:text-[var(--ca-text-primary)] focus:outline-none"
                    >
                      <span>Last Active</span>
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="p-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ca-border-subtle)] font-medium">
                {paginated.map((cust, idx) => {
                  const name = getDisplayNameFromCustomer(cust);
                  const phone = getDisplayPhoneFromCustomer(cust) || "Number unavailable";
                  const botReplyControl = cust.profile?.botReplyControl;
                  const isPermanentlyPaused = Boolean(cust.profile?.botReplyPausedPermanent || botReplyControl === "paused_permanent");
                  const until = Number(cust.profile?.botReplyPausedUntil || 0);
                  const isTempPaused = Boolean(botReplyControl === "paused_temp" && until > nowSeconds);
                  const isPaused = isPermanentlyPaused || isTempPaused || Boolean(cust.profile?.aiPaused || cust.profile?.ai_paused);
                  const isHuman = Boolean(cust.profile?.manualReviewRequired || cust.profile?.manual_review);
                  const lastTs = cust.last_message_at || cust.last_interaction_at || cust.profile?.lastMessageAt || cust.profile?.lastCustomerMessageAt || cust.profile?.lastInteractionAt || "";

                  return (
                    <tr
                      key={cust.$id || idx}
                      onClick={() => onSelectCustomer(cust)}
                      className="cursor-pointer hover:bg-[var(--ca-surface-2)] transition-colors"
                    >
                      <td className="p-4">
                        <div className="font-bold text-[var(--ca-text-primary)]">{name}</div>
                      </td>
                      <td className="p-4 font-mono text-[var(--ca-text-secondary)]">{phone}</td>
                      <td className="p-4">
                        {isGlobalAiEnabled === undefined ? (
                          <ToneBadge tone="neutral">Unknown</ToneBadge>
                        ) : !isGlobalAiEnabled ? (
                          <ToneBadge tone="neutral">AI Off</ToneBadge>
                        ) : isHuman ? (
                          <ToneBadge tone="blue">Human Handling</ToneBadge>
                        ) : isPermanentlyPaused ? (
                          <ToneBadge tone="neutral">Paused permanently</ToneBadge>
                        ) : isTempPaused ? (
                          <ToneBadge tone="neutral">{`Paused until ${new Date(until * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}</ToneBadge>
                        ) : isPaused ? (
                          <ToneBadge tone="neutral">AI Paused</ToneBadge>
                        ) : (
                          <ToneBadge tone="teal">AI Active</ToneBadge>
                        )}
                      </td>
                      <td className="p-4 text-[var(--ca-text-muted)]">{formatDate(lastTs)}</td>
                      <td className="p-4 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectCustomer(cust);
                          }}
                          className="rounded-lg border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] px-2.5 py-1 text-[11px] font-bold text-[var(--ca-text-primary)] hover:border-emerald-500"
                        >
                          Customer 360
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
