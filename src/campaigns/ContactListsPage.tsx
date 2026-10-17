import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Users,
  Upload,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Clock,
  ShieldAlert,
  ShieldCheck,
  Download,
  Trash2,
  RefreshCw,
  Eye,
  FileSpreadsheet,
  ArrowRight,
  Sparkles,
  Phone,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  AlertTriangle,
} from "lucide-react";
import {
  DashboardSurface,
  DashboardPageHeader,
  MetricTile,
  ToneBadge,
  ProgressTrack,
  ActionPanel,
} from "../components/dashboard/DashboardPrimitives";

export interface ContactListModel {
  id: string;
  name: string;
  description?: string;
  status: string;
  totalRows: number;
  uniqueContacts: number;
  validContacts: number;
  invalidContacts: number;
  notOnWhatsAppContacts: number;
  suppressedContacts: number;
  readyContacts: number;
  createdAt: number;
  updatedAt: number;
}

export interface ContactItem {
  id: string;
  rowNumber: number;
  originalName: string;
  originalPhone: string;
  normalizedPhone: string;
  canonicalWhatsAppJid: string;
  originalAiInstructions?: string;
  originalFixedMessage?: string;
  validationStatus: string;
  validationReason?: string;
  isDuplicate: boolean;
  suppressionStatus: string;
  createdAt: number;
}

export interface SuppressionItem {
  id: string;
  normalizedPhone: string;
  reason: string;
  suppressedAt: number;
}

interface Props {
  bots?: any[];
  formatDate?: (ts?: any) => string;
}

export const ContactListsPage: React.FC<Props> = ({
  bots = [],
  formatDate = (ts) => (ts ? new Date(ts).toLocaleString() : "-"),
}) => {
  const [lists, setLists] = useState<ContactListModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Active View / Drawer states
  const [selectedList, setSelectedList] = useState<ContactListModel | null>(null);
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsTotal, setContactsTotal] = useState(0);
  const [contactsPage, setContactsPage] = useState(1);
  const [contactStatusFilter, setContactStatusFilter] = useState("all");
  const [contactSearchQuery, setContactSearchQuery] = useState("");

  // Modals
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isValidateModalOpen, setIsValidateModalOpen] = useState(false);
  const [isSuppressionsModalOpen, setIsSuppressionsModalOpen] = useState(false);

  // Import State
  const [importStep, setImportStep] = useState<1 | 2 | 3 | 4>(1);
  const [newListName, setNewListName] = useState("");
  const [newListDesc, setNewListDesc] = useState("");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvRawText, setCsvRawText] = useState("");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvPreviewRows, setCsvPreviewRows] = useState<Record<string, string>[]>([]);
  const [colMapping, setColMapping] = useState({
    fullNameColumn: "",
    phoneNumberColumn: "",
    aiInstructionsColumn: "",
    fixedMessageColumn: "",
  });
  const [importProgress, setImportProgress] = useState<{
    importing: boolean;
    result?: any;
  }>({ importing: false });

  // Validation State
  const [validatingListId, setValidatingListId] = useState<string | null>(null);
  const [validationBotId, setValidationBotId] = useState<string>("");
  const [validationProgress, setValidationProgress] = useState<any>(null);
  const [isValidating, setIsValidating] = useState(false);

  // Suppressions State
  const [suppressions, setSuppressions] = useState<SuppressionItem[]>([]);
  const [newSuppressionPhone, setNewSuppressionPhone] = useState("");
  const [newSuppressionReason, setNewSuppressionReason] = useState("");

  // Fetch contact lists
  const fetchLists = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/user/contact-lists");
      if (!res.ok) throw new Error("Failed to load contact lists");
      const data = await res.json();
      setLists(Array.isArray(data.lists) ? data.lists : []);
    } catch (err: any) {
      setError(err.message || "Could not fetch contact lists");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLists();
  }, []);

  // Fetch contacts for selected list
  const fetchContacts = async (listId: string, page = 1) => {
    try {
      setContactsLoading(true);
      const params = new URLSearchParams({
        page: String(page),
        limit: "25",
        status: contactStatusFilter,
        q: contactSearchQuery,
      });
      const res = await fetch(`/api/user/contact-lists/${listId}/contacts?${params}`);
      if (!res.ok) throw new Error("Failed to load contacts");
      const data = await res.json();
      setContacts(data.contacts || []);
      setContactsTotal(data.total || 0);
      setContactsPage(data.page || 1);
    } catch (err: any) {
      setError(err.message || "Failed to load list contacts");
    } finally {
      setContactsLoading(false);
    }
  };

  useEffect(() => {
    if (selectedList) {
      fetchContacts(selectedList.id, contactsPage);
    }
  }, [selectedList, contactsPage, contactStatusFilter, contactSearchQuery]);

  // Fetch suppressions
  const fetchSuppressions = async () => {
    try {
      const res = await fetch("/api/user/contact-suppressions");
      if (res.ok) {
        const data = await res.json();
        setSuppressions(data.suppressions || []);
      }
    } catch (err) {
      // safe fallback
    }
  };

  // CSV File Handler
  const handleFileSelected = (file: File) => {
    setCsvFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = String(e.target?.result || "");
      setCsvRawText(text);
      // Basic header extraction
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length > 0) {
        const headers = lines[0]
          .split(",")
          .map((h) => h.replace(/^["']|["']$/g, "").trim());
        setCsvHeaders(headers);

        // Preview up to 5 rows
        const preview: Record<string, string>[] = [];
        for (let i = 1; i < Math.min(lines.length, 6); i++) {
          const cells = lines[i].split(",").map((c) => c.replace(/^["']|["']$/g, "").trim());
          const rowObj: Record<string, string> = {};
          headers.forEach((h, idx) => {
            rowObj[h] = cells[idx] || "";
          });
          preview.push(rowObj);
        }
        setCsvPreviewRows(preview);

        // Auto detect mappings
        const autoName = headers.find((h) => /name|full/i.test(h)) || headers[0] || "";
        const autoPhone = headers.find((h) => /phone|mobile|number|tel/i.test(h)) || "";
        const autoAi = headers.find((h) => /ai|instruction|prompt/i.test(h)) || "";
        const autoFixed = headers.find((h) => /message|fixed|text/i.test(h)) || "";

        setColMapping({
          fullNameColumn: autoName,
          phoneNumberColumn: autoPhone,
          aiInstructionsColumn: autoAi,
          fixedMessageColumn: autoFixed,
        });

        if (!newListName) {
          setNewListName(file.name.replace(/\.[^/.]+$/, ""));
        }
        setImportStep(2);
      }
    };
    reader.readAsText(file);
  };

  // Execute Import
  const handleExecuteImport = async () => {
    if (!colMapping.phoneNumberColumn) {
      setError("Please select the Phone Number column mapping.");
      return;
    }
    try {
      setImportProgress({ importing: true });
      setError(null);

      // 1. Create list
      const createRes = await fetch("/api/user/contact-lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newListName || "Imported Contact List",
          description: newListDesc,
        }),
      });
      if (!createRes.ok) throw new Error("Failed to create contact list container");
      const listData = await createRes.json();
      const listId = listData.list.id;

      // 2. Upload and parse CSV
      const importRes = await fetch(`/api/user/contact-lists/${listId}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csvText: csvRawText,
          fileName: csvFile?.name || "contacts.csv",
          columnMapping: colMapping,
        }),
      });
      if (!importRes.ok) {
        const errData = await importRes.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to parse and import contacts");
      }
      const summary = await importRes.json();
      setImportProgress({ importing: false, result: summary });
      setImportStep(4);
      fetchLists();
      setSuccess(`Import completed! ${summary.uniqueContacts} unique contacts ready.`);
    } catch (err: any) {
      setImportProgress({ importing: false });
      setError(err.message || "Failed to complete CSV import");
    }
  };

  // Trigger WhatsApp Validation
  const handleStartValidation = async () => {
    if (!validatingListId || !validationBotId) {
      setError("Please select a connected WhatsApp instance for validation.");
      return;
    }
    try {
      setIsValidating(true);
      setError(null);
      const res = await fetch(`/api/user/contact-lists/${validatingListId}/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botId: validationBotId, batchSize: 50 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Validation failed");
      setValidationProgress(data.progress);
      setSuccess(`Validation complete! Valid WhatsApp: ${data.progress?.valid || 0}, Not on WhatsApp: ${data.progress?.notOnWhatsApp || 0}`);
      fetchLists();
      if (selectedList?.id === validatingListId) {
        fetchContacts(validatingListId);
      }
    } catch (err: any) {
      setError(err.message || "WhatsApp validation failed");
    } finally {
      setIsValidating(false);
    }
  };

  // Delete List
  const handleDeleteList = async (listId: string) => {
    if (!window.confirm("Are you sure you want to delete this contact list?")) return;
    try {
      const res = await fetch(`/api/user/contact-lists/${listId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete contact list");
      setLists((cur) => cur.filter((l) => l.id !== listId));
      if (selectedList?.id === listId) setSelectedList(null);
      setSuccess("Contact list deleted successfully.");
    } catch (err: any) {
      setError(err.message || "Could not delete contact list");
    }
  };

  // Toggle Suppression
  const handleToggleSuppression = async (phone: string, currentSuppressed: boolean) => {
    try {
      if (currentSuppressed) {
        const res = await fetch(`/api/user/contact-suppressions/${encodeURIComponent(phone)}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Failed to remove suppression");
        setSuccess(`Phone ${phone} unsuppressed.`);
      } else {
        const res = await fetch("/api/user/contact-suppressions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, reason: "manual_dashboard" }),
        });
        if (!res.ok) throw new Error("Failed to suppress phone");
        setSuccess(`Phone ${phone} suppressed from all campaigns.`);
      }
      if (selectedList) fetchContacts(selectedList.id, contactsPage);
      fetchLists();
      fetchSuppressions();
    } catch (err: any) {
      setError(err.message || "Suppression operation failed");
    }
  };

  // Aggregated metric stats
  const metrics = useMemo(() => {
    const totalLists = lists.length;
    const totalContacts = lists.reduce((acc, l) => acc + (l.totalRows || 0), 0);
    const validContacts = lists.reduce((acc, l) => acc + (l.validContacts || 0), 0);
    const readyContacts = lists.reduce((acc, l) => acc + (l.readyContacts || 0), 0);
    return { totalLists, totalContacts, validContacts, readyContacts };
  }, [lists]);

  const filteredLists = lists.filter((l) =>
    l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (l.description && l.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 max-w-7xl mx-auto w-full">
      {/* Page Header */}
      <DashboardPageHeader
        eyebrow="Audience & Data"
        title="Contact Lists"
        description="Upload CSV lists, validate WhatsApp existence, manage account suppressions, and power bulk campaigns with zero instance lock-in."
        icon={Users}
        actions={
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                fetchSuppressions();
                setIsSuppressionsModalOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-surface)] px-4 py-2.5 text-xs font-bold text-[var(--ca-text-primary)] hover:bg-[var(--ca-bg-hover)] transition-all shadow-sm"
            >
              <ShieldAlert className="w-4 h-4 text-amber-500" />
              Manage Suppressions
            </button>
            <button
              type="button"
              onClick={() => {
                setImportStep(1);
                setCsvFile(null);
                setCsvRawText("");
                setNewListName("");
                setNewListDesc("");
                setImportProgress({ importing: false });
                setIsImportModalOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 transition-all shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Upload / Import List
            </button>
          </div>
        }
      />

      {/* Notifications */}
      {error && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-xs font-medium text-rose-500 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button type="button" onClick={() => setError(null)}><X className="w-4 h-4" /></button>
        </div>
      )}
      {success && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-xs font-medium text-emerald-500 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{success}</span>
          </div>
          <button type="button" onClick={() => setSuccess(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Summary KPI Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricTile label="Saved Lists" value={metrics.totalLists} icon={FileSpreadsheet} tone="brand" />
        <MetricTile label="Total Contacts" value={metrics.totalContacts.toLocaleString()} icon={Users} tone="neutral" />
        <MetricTile label="WhatsApp Verified" value={metrics.validContacts.toLocaleString()} icon={CheckCircle2} tone="brand" />
        <MetricTile label="Ready for Campaigns" value={metrics.readyContacts.toLocaleString()} icon={Sparkles} tone="brand" />
      </div>

      {/* Lists Listing & Search */}
      <DashboardSurface className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--ca-text-muted)]" />
            <input
              type="text"
              placeholder="Search contact lists..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-hover)] pl-10 pr-4 py-2 text-xs text-[var(--ca-text-primary)] outline-none focus:border-emerald-500"
            />
          </div>

          <button
            type="button"
            onClick={fetchLists}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--ca-border-subtle)] px-3 py-2 text-xs font-bold text-[var(--ca-text-secondary)] hover:bg-[var(--ca-bg-hover)]"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {/* Table of Contact Lists */}
        {loading ? (
          <div className="py-12 text-center text-xs text-[var(--ca-text-secondary)]">Loading contact lists...</div>
        ) : filteredLists.length === 0 ? (
          <div className="py-12 text-center flex flex-col items-center justify-center">
            <FileSpreadsheet className="w-12 h-12 text-[var(--ca-text-muted)] mb-3" />
            <h3 className="text-sm font-bold text-[var(--ca-text-primary)]">No Contact Lists Found</h3>
            <p className="text-xs text-[var(--ca-text-secondary)] max-w-sm mt-1">
              Upload a CSV of customer contacts to start sending personalized or fixed campaigns.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-[var(--ca-text-secondary)]">
              <thead className="border-b border-[var(--ca-border-subtle)] text-[var(--ca-text-muted)] uppercase tracking-wider font-semibold">
                <tr>
                  <th className="py-3 px-4">List Name</th>
                  <th className="py-3 px-4">Created</th>
                  <th className="py-3 px-4">Total Rows</th>
                  <th className="py-3 px-4">Unique</th>
                  <th className="py-3 px-4">WhatsApp Valid</th>
                  <th className="py-3 px-4">Suppressed</th>
                  <th className="py-3 px-4">Ready</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ca-border-subtle)]">
                {filteredLists.map((list) => (
                  <tr key={list.id} className="hover:bg-[var(--ca-bg-hover)] transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-bold text-[var(--ca-text-primary)]">{list.name}</div>
                      {list.description && <div className="text-[10px] text-[var(--ca-text-muted)] truncate max-w-xs">{list.description}</div>}
                    </td>
                    <td className="py-3 px-4">{formatDate(list.createdAt)}</td>
                    <td className="py-3 px-4 font-semibold">{list.totalRows}</td>
                    <td className="py-3 px-4">{list.uniqueContacts}</td>
                    <td className="py-3 px-4">
                      {list.validContacts > 0 ? (
                        <span className="inline-flex items-center gap-1 text-emerald-500 font-bold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {list.validContacts}
                        </span>
                      ) : (
                        <span className="text-[var(--ca-text-muted)]">Unverified</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {list.suppressedContacts > 0 ? (
                        <span className="text-amber-500 font-semibold">{list.suppressedContacts}</span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 font-bold text-emerald-500">
                        {list.readyContacts} ready
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setValidatingListId(list.id);
                            setValidationProgress(null);
                            setIsValidateModalOpen(true);
                          }}
                          className="rounded-lg border border-[var(--ca-border-subtle)] px-2.5 py-1 text-xs font-semibold hover:border-emerald-500 hover:text-emerald-500 transition-colors"
                          title="Verify WhatsApp Presence"
                        >
                          Verify WhatsApp
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedList(list);
                            setContactsPage(1);
                          }}
                          className="rounded-lg bg-[var(--ca-bg-hover)] p-1.5 hover:text-[var(--ca-text-primary)]"
                          title="View Contacts"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <a
                          href={`/api/user/contact-lists/${list.id}/raw-csv`}
                          download
                          className="rounded-lg bg-[var(--ca-bg-hover)] p-1.5 hover:text-[var(--ca-text-primary)]"
                          title="Download Original CSV"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
                        <button
                          type="button"
                          onClick={() => handleDeleteList(list.id)}
                          className="rounded-lg bg-[var(--ca-bg-hover)] p-1.5 hover:text-rose-500 text-[var(--ca-text-muted)]"
                          title="Delete List"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DashboardSurface>

      {/* Contact Details Drawer */}
      {selectedList && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-4xl bg-[var(--ca-bg-surface)] border-l border-[var(--ca-border-subtle)] p-6 overflow-y-auto flex flex-col h-full shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-[var(--ca-border-subtle)]">
              <div>
                <h3 className="text-base font-bold text-[var(--ca-text-primary)]">{selectedList.name} - Contacts</h3>
                <p className="text-xs text-[var(--ca-text-secondary)] mt-0.5">
                  Showing {contacts.length} of {contactsTotal} contacts
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedList(null)}
                className="rounded-lg p-1.5 text-[var(--ca-text-muted)] hover:bg-[var(--ca-bg-hover)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Filter toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 my-4">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ca-text-muted)]" />
                <input
                  type="text"
                  placeholder="Search name or phone..."
                  value={contactSearchQuery}
                  onChange={(e) => setContactSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-hover)] pl-9 pr-3 py-1.5 text-xs text-[var(--ca-text-primary)] outline-none"
                />
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={contactStatusFilter}
                  onChange={(e) => setContactStatusFilter(e.target.value)}
                  className="rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-surface)] px-3 py-1.5 text-xs text-[var(--ca-text-primary)] outline-none"
                >
                  <option value="all">All Statuses</option>
                  <option value="VALID">WhatsApp Valid</option>
                  <option value="NOT_ON_WHATSAPP">Not on WhatsApp</option>
                  <option value="INVALID_FORMAT">Invalid Format</option>
                  <option value="PENDING">Pending Check</option>
                  <option value="SUPPRESSED">Suppressed</option>
                  <option value="DUPLICATE">Duplicates</option>
                </select>

                <a
                  href={`/api/user/contact-lists/${selectedList.id}/export`}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--ca-border-subtle)] px-3 py-1.5 text-xs font-semibold hover:bg-[var(--ca-bg-hover)]"
                  download
                >
                  <Download className="w-3.5 h-3.5" />
                  Export
                </a>
              </div>
            </div>

            {/* Contacts Table */}
            <div className="flex-1 overflow-x-auto">
              <table className="w-full text-left text-xs text-[var(--ca-text-secondary)]">
                <thead className="border-b border-[var(--ca-border-subtle)] text-[var(--ca-text-muted)] uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="py-2.5 px-3">#</th>
                    <th className="py-2.5 px-3">Full Name</th>
                    <th className="py-2.5 px-3">Phone</th>
                    <th className="py-2.5 px-3">WhatsApp</th>
                    <th className="py-2.5 px-3">AI / Fixed</th>
                    <th className="py-2.5 px-3">Suppression</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--ca-border-subtle)]">
                  {contactsLoading ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8">Loading contacts...</td>
                    </tr>
                  ) : contacts.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8">No matching contacts found.</td>
                    </tr>
                  ) : (
                    contacts.map((c) => (
                      <tr key={c.id} className="hover:bg-[var(--ca-bg-hover)]">
                        <td className="py-2.5 px-3 font-mono text-[11px] text-[var(--ca-text-muted)]">{c.rowNumber}</td>
                        <td className="py-2.5 px-3 font-bold text-[var(--ca-text-primary)]">{c.originalName || "-"}</td>
                        <td className="py-2.5 px-3 font-mono text-[11px]">
                          {c.normalizedPhone || c.originalPhone}
                          {c.isDuplicate && (
                            <span className="ml-1.5 rounded bg-amber-500/10 px-1 py-0.5 text-[9px] font-bold text-amber-500">DUP</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          {c.validationStatus === "VALID" && (
                            <span className="inline-flex items-center gap-1 text-emerald-500 font-semibold">
                              <CheckCircle2 className="w-3 h-3" /> Valid
                            </span>
                          )}
                          {c.validationStatus === "NOT_ON_WHATSAPP" && (
                            <span className="text-rose-500 font-semibold">Not on WhatsApp</span>
                          )}
                          {c.validationStatus === "INVALID_FORMAT" && (
                            <span className="text-rose-400" title={c.validationReason}>Invalid Phone</span>
                          )}
                          {c.validationStatus === "PENDING" && (
                            <span className="text-[var(--ca-text-muted)]">Unchecked</span>
                          )}
                          {c.validationStatus === "VALIDATION_FAILED" && (
                            <span className="text-amber-500 font-semibold">Retryable Fail</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-[11px]">
                          {c.originalAiInstructions ? (
                            <span className="text-indigo-400 font-medium" title={c.originalAiInstructions}>AI Set</span>
                          ) : c.originalFixedMessage ? (
                            <span className="text-emerald-400 font-medium" title={c.originalFixedMessage}>Fixed Set</span>
                          ) : (
                            <span className="text-[var(--ca-text-muted)]">-</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          {c.suppressionStatus === "SUPPRESSED" ? (
                            <span className="rounded bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-bold text-rose-500">
                              Suppressed
                            </span>
                          ) : (
                            <span className="text-[var(--ca-text-muted)]">Active</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleToggleSuppression(c.normalizedPhone || c.originalPhone, c.suppressionStatus === "SUPPRESSED")}
                            className={`text-[10px] font-bold px-2 py-0.5 rounded transition-colors ${
                              c.suppressionStatus === "SUPPRESSED"
                                ? "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20"
                                : "bg-rose-500/10 text-rose-500 hover:bg-rose-500/20"
                            }`}
                          >
                            {c.suppressionStatus === "SUPPRESSED" ? "Unsuppress" : "Suppress"}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center justify-between pt-4 border-t border-[var(--ca-border-subtle)] mt-4">
              <span className="text-xs text-[var(--ca-text-muted)]">
                Page {contactsPage} of {Math.max(1, Math.ceil(contactsTotal / 25))}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={contactsPage <= 1}
                  onClick={() => setContactsPage((p) => Math.max(1, p - 1))}
                  className="p-1.5 rounded-lg border border-[var(--ca-border-subtle)] disabled:opacity-30"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={contactsPage >= Math.ceil(contactsTotal / 25)}
                  onClick={() => setContactsPage((p) => p + 1)}
                  className="p-1.5 rounded-lg border border-[var(--ca-border-subtle)] disabled:opacity-30"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CSV Import Flow Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-2xl bg-[var(--ca-bg-surface)] border border-[var(--ca-border-subtle)] rounded-2xl p-6 shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--ca-border-subtle)]">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-emerald-500" />
                <h3 className="text-base font-bold text-[var(--ca-text-primary)]">Import Contact List (CSV)</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                className="rounded-lg p-1 text-[var(--ca-text-muted)] hover:bg-[var(--ca-bg-hover)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Step Indicators */}
            <div className="flex items-center justify-between my-4 text-xs font-bold border-b border-[var(--ca-border-subtle)] pb-3">
              <span className={importStep >= 1 ? "text-emerald-500" : "text-[var(--ca-text-muted)]"}>1. Upload</span>
              <ArrowRight className="w-3.5 h-3.5 text-[var(--ca-text-muted)]" />
              <span className={importStep >= 2 ? "text-emerald-500" : "text-[var(--ca-text-muted)]"}>2. Map Headers</span>
              <ArrowRight className="w-3.5 h-3.5 text-[var(--ca-text-muted)]" />
              <span className={importStep >= 3 ? "text-emerald-500" : "text-[var(--ca-text-muted)]"}>3. Preview</span>
              <ArrowRight className="w-3.5 h-3.5 text-[var(--ca-text-muted)]" />
              <span className={importStep >= 4 ? "text-emerald-500" : "text-[var(--ca-text-muted)]"}>4. Summary</span>
            </div>

            {/* Step 1: Upload */}
            {importStep === 1 && (
              <div className="space-y-4 py-4">
                <div>
                  <label className="block text-xs font-bold text-[var(--ca-text-primary)] mb-1">List Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Summer Campaign Leads 2026"
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    className="w-full rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-hover)] px-3 py-2 text-xs text-[var(--ca-text-primary)] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[var(--ca-text-primary)] mb-1">Description (Optional)</label>
                  <input
                    type="text"
                    placeholder="Brief description of this contact cohort..."
                    value={newListDesc}
                    onChange={(e) => setNewListDesc(e.target.value)}
                    className="w-full rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-hover)] px-3 py-2 text-xs text-[var(--ca-text-primary)] outline-none"
                  />
                </div>
                <div className="border-2 border-dashed border-[var(--ca-border-subtle)] rounded-2xl p-8 text-center hover:border-emerald-500/50 transition-colors">
                  <FileSpreadsheet className="w-10 h-10 text-[var(--ca-text-muted)] mx-auto mb-2" />
                  <p className="text-xs font-bold text-[var(--ca-text-primary)]">Drag & drop your CSV file here, or browse</p>
                  <p className="text-[11px] text-[var(--ca-text-muted)] mt-1">Expected: Full Name, Phone Number with country code</p>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => {
                      if (e.target.files?.[0]) handleFileSelected(e.target.files[0]);
                    }}
                    className="mt-4 text-xs"
                  />
                </div>
              </div>
            )}

            {/* Step 2: Column Mapping */}
            {importStep === 2 && (
              <div className="space-y-4 py-4">
                <p className="text-xs text-[var(--ca-text-secondary)]">
                  Match the columns from your uploaded CSV file to BlackArrow contact attributes.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[var(--ca-text-primary)] mb-1">
                      Phone Number Column <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={colMapping.phoneNumberColumn}
                      onChange={(e) => setColMapping({ ...colMapping, phoneNumberColumn: e.target.value })}
                      className="w-full rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-hover)] px-3 py-2 text-xs font-bold text-[var(--ca-text-primary)] outline-none"
                    >
                      <option value="">-- Select Phone Column --</option>
                      {csvHeaders.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[var(--ca-text-primary)] mb-1">Full Name Column</label>
                    <select
                      value={colMapping.fullNameColumn}
                      onChange={(e) => setColMapping({ ...colMapping, fullNameColumn: e.target.value })}
                      className="w-full rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-hover)] px-3 py-2 text-xs text-[var(--ca-text-primary)] outline-none"
                    >
                      <option value="">-- None / Default --</option>
                      {csvHeaders.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[var(--ca-text-primary)] mb-1">AI Instructions Column</label>
                    <select
                      value={colMapping.aiInstructionsColumn}
                      onChange={(e) => setColMapping({ ...colMapping, aiInstructionsColumn: e.target.value })}
                      className="w-full rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-hover)] px-3 py-2 text-xs text-[var(--ca-text-primary)] outline-none"
                    >
                      <option value="">-- None / Optional --</option>
                      {csvHeaders.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[var(--ca-text-primary)] mb-1">Fixed Message Column</label>
                    <select
                      value={colMapping.fixedMessageColumn}
                      onChange={(e) => setColMapping({ ...colMapping, fixedMessageColumn: e.target.value })}
                      className="w-full rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-hover)] px-3 py-2 text-xs text-[var(--ca-text-primary)] outline-none"
                    >
                      <option value="">-- None / Optional --</option>
                      {csvHeaders.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex justify-between pt-4">
                  <button
                    type="button"
                    onClick={() => setImportStep(1)}
                    className="rounded-xl border border-[var(--ca-border-subtle)] px-4 py-2 text-xs font-semibold"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => setImportStep(3)}
                    disabled={!colMapping.phoneNumberColumn}
                    className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-40"
                  >
                    Preview Data
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Preview */}
            {importStep === 3 && (
              <div className="space-y-4 py-4">
                <p className="text-xs text-[var(--ca-text-secondary)]">First 5 rows from your CSV with current mapping:</p>
                <div className="overflow-x-auto border border-[var(--ca-border-subtle)] rounded-xl">
                  <table className="w-full text-left text-xs text-[var(--ca-text-secondary)]">
                    <thead className="bg-[var(--ca-bg-hover)] font-bold">
                      <tr>
                        <th className="p-2">Name</th>
                        <th className="p-2">Phone</th>
                        <th className="p-2">AI Instructions</th>
                        <th className="p-2">Fixed Msg</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--ca-border-subtle)]">
                      {csvPreviewRows.map((r, i) => (
                        <tr key={i}>
                          <td className="p-2 font-medium">{r[colMapping.fullNameColumn] || "-"}</td>
                          <td className="p-2 font-mono text-[11px]">{r[colMapping.phoneNumberColumn] || "-"}</td>
                          <td className="p-2 truncate max-w-[140px]">{colMapping.aiInstructionsColumn ? r[colMapping.aiInstructionsColumn] || "-" : "-"}</td>
                          <td className="p-2 truncate max-w-[140px]">{colMapping.fixedMessageColumn ? r[colMapping.fixedMessageColumn] || "-" : "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-between pt-4">
                  <button
                    type="button"
                    onClick={() => setImportStep(2)}
                    className="rounded-xl border border-[var(--ca-border-subtle)] px-4 py-2 text-xs font-semibold"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleExecuteImport}
                    disabled={importProgress.importing}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {importProgress.importing ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Importing Contacts...
                      </>
                    ) : (
                      "Confirm & Start Import"
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Step 4: Import Summary */}
            {importStep === 4 && importProgress.result && (
              <div className="space-y-4 py-6 text-center">
                <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
                <h4 className="text-base font-bold text-[var(--ca-text-primary)]">CSV Successfully Imported!</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-lg mx-auto text-left">
                  <div className="rounded-xl bg-[var(--ca-bg-hover)] p-3">
                    <div className="text-[10px] text-[var(--ca-text-muted)] font-bold uppercase">Total Rows</div>
                    <div className="text-base font-bold text-[var(--ca-text-primary)]">{importProgress.result.totalRows}</div>
                  </div>
                  <div className="rounded-xl bg-emerald-500/10 p-3">
                    <div className="text-[10px] text-emerald-500 font-bold uppercase">Unique</div>
                    <div className="text-base font-bold text-emerald-500">{importProgress.result.uniqueContacts}</div>
                  </div>
                  <div className="rounded-xl bg-amber-500/10 p-3">
                    <div className="text-[10px] text-amber-500 font-bold uppercase">Duplicates</div>
                    <div className="text-base font-bold text-amber-500">{importProgress.result.duplicateContacts}</div>
                  </div>
                  <div className="rounded-xl bg-rose-500/10 p-3">
                    <div className="text-[10px] text-rose-500 font-bold uppercase">Invalid Format</div>
                    <div className="text-base font-bold text-rose-500">{importProgress.result.invalidContacts}</div>
                  </div>
                </div>

                <div className="pt-4 flex justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIsImportModalOpen(false)}
                    className="rounded-xl bg-emerald-600 px-6 py-2.5 text-xs font-bold text-white hover:bg-emerald-700"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* WhatsApp Existence Validation Modal */}
      {isValidateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-md bg-[var(--ca-bg-surface)] border border-[var(--ca-border-subtle)] rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--ca-border-subtle)]">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                <h3 className="text-sm font-bold text-[var(--ca-text-primary)]">Verify WhatsApp Presence</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsValidateModalOpen(false)}
                className="rounded-lg p-1 text-[var(--ca-text-muted)] hover:bg-[var(--ca-bg-hover)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[var(--ca-text-secondary)]">
              Validate which phone numbers are registered on WhatsApp using your connected WhatsApp instance without sending any message.
            </p>

            <div>
              <label className="block text-xs font-bold text-[var(--ca-text-primary)] mb-1">Choose Connected WhatsApp Instance</label>
              <select
                value={validationBotId}
                onChange={(e) => setValidationBotId(e.target.value)}
                className="w-full rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-hover)] px-3 py-2 text-xs font-bold text-[var(--ca-text-primary)] outline-none"
              >
                <option value="">-- Select Active WhatsApp Bot --</option>
                {bots.map((b: any) => (
                  <option key={b.$id || b.id} value={b.$id || b.id}>
                    {b.name || b.phone || "WhatsApp Instance"} ({b.status || "active"})
                  </option>
                ))}
              </select>
            </div>

            {validationProgress && (
              <div className="rounded-xl bg-[var(--ca-bg-hover)] p-3 text-xs space-y-1.5">
                <div className="flex justify-between font-semibold">
                  <span>Processed:</span> <span>{validationProgress.processed}</span>
                </div>
                <div className="flex justify-between text-emerald-500 font-bold">
                  <span>Valid on WhatsApp:</span> <span>{validationProgress.valid}</span>
                </div>
                <div className="flex justify-between text-rose-500">
                  <span>Not on WhatsApp:</span> <span>{validationProgress.notOnWhatsApp}</span>
                </div>
                {validationProgress.failed > 0 && (
                  <div className="flex justify-between text-amber-500">
                    <span>Temporary Failures:</span> <span>{validationProgress.failed}</span>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsValidateModalOpen(false)}
                className="rounded-xl border border-[var(--ca-border-subtle)] px-4 py-2 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleStartValidation}
                disabled={isValidating || !validationBotId}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-40"
              >
                {isValidating ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Validating...
                  </>
                ) : (
                  "Run WhatsApp Verification"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Account Suppressions Modal */}
      {isSuppressionsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-xl bg-[var(--ca-bg-surface)] border border-[var(--ca-border-subtle)] rounded-2xl p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--ca-border-subtle)]">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-amber-500" />
                <h3 className="text-sm font-bold text-[var(--ca-text-primary)]">Account-Level Suppressions (Opt-Outs)</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsSuppressionsModalOpen(false)}
                className="rounded-lg p-1 text-[var(--ca-text-muted)] hover:bg-[var(--ca-bg-hover)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[var(--ca-text-secondary)]">
              Suppressed phone numbers are permanently blocked across all current and future campaigns for this account, even if re-uploaded in new CSV files.
            </p>

            {/* Add phone to suppression */}
            <div className="flex flex-wrap gap-2 p-3 rounded-xl bg-[var(--ca-bg-hover)]">
              <input
                type="text"
                placeholder="Phone with country code (e.g. +923001234567)"
                value={newSuppressionPhone}
                onChange={(e) => setNewSuppressionPhone(e.target.value)}
                className="flex-1 rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-surface)] px-3 py-1.5 text-xs text-[var(--ca-text-primary)] outline-none min-w-[180px]"
              />
              <input
                type="text"
                placeholder="Reason (e.g. Opt-out request)"
                value={newSuppressionReason}
                onChange={(e) => setNewSuppressionReason(e.target.value)}
                className="flex-1 rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-surface)] px-3 py-1.5 text-xs text-[var(--ca-text-primary)] outline-none min-w-[160px]"
              />
              <button
                type="button"
                onClick={async () => {
                  if (!newSuppressionPhone) return;
                  await handleToggleSuppression(newSuppressionPhone, false);
                  setNewSuppressionPhone("");
                  setNewSuppressionReason("");
                }}
                className="rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700"
              >
                Add Number
              </button>
            </div>

            {/* Suppression List */}
            <div className="flex-1 overflow-y-auto divide-y divide-[var(--ca-border-subtle)] border border-[var(--ca-border-subtle)] rounded-xl">
              {suppressions.length === 0 ? (
                <div className="p-8 text-center text-xs text-[var(--ca-text-muted)]">No suppressed numbers in this account.</div>
              ) : (
                suppressions.map((s) => (
                  <div key={s.id} className="p-3 flex items-center justify-between hover:bg-[var(--ca-bg-hover)] text-xs">
                    <div>
                      <div className="font-mono font-bold text-[var(--ca-text-primary)]">{s.normalizedPhone}</div>
                      <div className="text-[11px] text-[var(--ca-text-muted)]">{s.reason} • {formatDate(s.suppressedAt)}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleSuppression(s.normalizedPhone, true)}
                      className="text-xs font-semibold text-rose-500 hover:text-rose-600"
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
