import React, { useState, useEffect } from "react";
import {
  Route,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Send,
  Phone,
  HelpCircle,
  Clock,
  ArrowRightLeft,
  X,
} from "lucide-react";
import {
  DashboardSurface,
  DashboardSection,
  IconWell,
  StatusBadge,
} from "../DashboardPrimitives";

export interface DepartmentItem {
  id: string;
  name: string;
  description: string;
  whatsappNumber: string;
  whatsappNumberNormalized: string;
  enabled: boolean;
  priority?: number;
  isFallback?: boolean;
}

export interface RoutingAuditItem {
  id: string;
  leadId: string;
  departmentName?: string;
  destinationPhone?: string;
  status: string;
  customerPhone?: string;
  leadName?: string;
  summaryText?: string;
  attemptTimestamp: number;
}

interface Props {
  accountId?: string;
  departments?: DepartmentItem[];
  recentAudits?: RoutingAuditItem[];
  fallbackDepartmentId?: string;
  onSaveDepartment?: (dept: Partial<DepartmentItem>) => Promise<void>;
  onDeleteDepartment?: (id: string) => Promise<void>;
  onReassignLead?: (leadId: string, departmentId: string) => Promise<void>;
  formatDate?: (ts: number) => string;
}

export const LeadRoutingSettingsSection: React.FC<Props> = ({
  accountId,
  departments: initialDepartments = [],
  recentAudits: initialAudits = [],
  fallbackDepartmentId,
  onSaveDepartment,
  onDeleteDepartment,
  onReassignLead,
  formatDate = (ts) => (ts ? new Date(ts).toLocaleString() : ""),
}) => {
  const [departments, setDepartments] = useState<DepartmentItem[]>(initialDepartments);
  const [audits, setAudits] = useState<RoutingAuditItem[]>(initialAudits);
  const [editingDept, setEditingDept] = useState<Partial<DepartmentItem> | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [reassignModalOpen, setReassignModalOpen] = useState(false);
  const [selectedLeadForReassign, setSelectedLeadForReassign] = useState<string | null>(null);
  const [targetDeptForReassign, setTargetDeptForReassign] = useState<string>("");

  const fetchDepartmentsAndAudits = async () => {
    setIsLoading(true);
    try {
      const [deptRes, auditRes] = await Promise.all([
        fetch("/api/user/lead-routing/departments").then((r) => (r.ok ? r.json() : null)),
        fetch("/api/user/lead-routing/audits").then((r) => (r.ok ? r.json() : null)),
      ]);
      if (deptRes?.departments) {
        setDepartments(deptRes.departments);
      }
      if (auditRes?.audits) {
        setAudits(auditRes.audits);
      }
    } catch (err) {
      console.warn("Could not fetch remote lead routing data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (initialDepartments && initialDepartments.length > 0) {
      setDepartments(initialDepartments);
    } else {
      fetchDepartmentsAndAudits();
    }
  }, [initialDepartments]);

  useEffect(() => {
    if (initialAudits && initialAudits.length > 0) {
      setAudits(initialAudits);
    }
  }, [initialAudits]);

  const validatePhone = (num: string): boolean => {
    const digits = num.replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) {
      setPhoneError("Phone number must be between 8 and 15 digits.");
      return false;
    }
    if (/^(\d)\1+$/.test(digits)) {
      setPhoneError("Cannot use repeated digits.");
      return false;
    }
    setPhoneError(null);
    return true;
  };

  const handleOpenCreate = () => {
    setEditingDept({
      name: "",
      description: "",
      whatsappNumber: "",
      enabled: true,
      isFallback: departments.length === 0,
    });
    setPhoneError(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (dept: DepartmentItem) => {
    setEditingDept({ ...dept });
    setPhoneError(null);
    setIsModalOpen(true);
  };

  const handleSaveModal = async () => {
    if (!editingDept?.name?.trim()) return;
    if (!editingDept?.description?.trim()) return;
    if (!validatePhone(editingDept?.whatsappNumber || "")) return;

    setIsSaving(true);
    try {
      if (onSaveDepartment) {
        await onSaveDepartment(editingDept);
      } else {
        const isUpdate = Boolean(editingDept.id);
        const url = isUpdate
          ? `/api/user/lead-routing/departments/${encodeURIComponent(editingDept.id!)}`
          : "/api/user/lead-routing/departments";
        const method = isUpdate ? "PUT" : "POST";

        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editingDept),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP ${res.status}`);
        }

        await fetchDepartmentsAndAudits();
      }
      setIsModalOpen(false);
      setEditingDept(null);
    } catch (e: any) {
      alert(`Error saving department: ${e.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this department?")) return;
    try {
      if (onDeleteDepartment) {
        await onDeleteDepartment(id);
      } else {
        const res = await fetch(`/api/user/lead-routing/departments/${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP ${res.status}`);
        }
        await fetchDepartmentsAndAudits();
      }
      setDepartments((prev) => prev.filter((d) => d.id !== id));
    } catch (e: any) {
      alert(`Error deleting department: ${e.message}`);
    }
  };

  const handleReassignSubmit = async () => {
    if (!selectedLeadForReassign || !targetDeptForReassign) return;
    try {
      if (onReassignLead) {
        await onReassignLead(selectedLeadForReassign, targetDeptForReassign);
      } else {
        const res = await fetch("/api/user/lead-routing/reassign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            leadId: selectedLeadForReassign,
            targetDepartmentId: targetDeptForReassign,
          }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP ${res.status}`);
        }
        await fetchDepartmentsAndAudits();
      }
      setReassignModalOpen(false);
      setSelectedLeadForReassign(null);
      alert("Lead reassigned and notification forwarded.");
    } catch (e: any) {
      alert(`Failed to reassign lead: ${e.message}`);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Top Banner / Explanation */}
      <DashboardSurface level={1} className="p-5 sm:p-6 rounded-2xl border border-[var(--ca-border-subtle)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <IconWell icon={Route} tone="brand" className="mt-1" />
            <div>
              <h2 className="text-base font-bold text-[var(--ca-text-primary)]">
                Department-Based Lead Routing
              </h2>
              <p className="mt-1 text-xs text-[var(--ca-text-secondary)] max-w-2xl leading-relaxed">
                When an incoming customer is qualified as a confirmed lead, BlackArrow's semantic AI
                matches their need against your configured department responsibilities and forwards a concise,
                grounded summary to that department's WhatsApp line.
              </p>
            </div>
          </div>
          <button
            onClick={handleOpenCreate}
            className="flex items-center justify-center gap-2 rounded-xl bg-[var(--ca-brand)] px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:opacity-95 transition-all whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            Add Department
          </button>
        </div>
      </DashboardSurface>

      {/* Configured Departments List */}
      <DashboardSection className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-[var(--ca-text-primary)]">
            Configured Departments ({departments.length})
          </h3>
          <span className="text-xs text-[var(--ca-text-secondary)]">
            AI classifies leads semantically across English, Urdu, Roman Urdu, and Arabic.
          </span>
        </div>

        {departments.length === 0 ? (
          <DashboardSurface level={2} className="p-8 text-center rounded-2xl border border-dashed border-[var(--ca-border-subtle)]">
            <Route className="mx-auto h-8 w-8 text-[var(--ca-text-tertiary)] mb-2" />
            <p className="text-sm font-medium text-[var(--ca-text-primary)]">No departments configured yet</p>
            <p className="text-xs text-[var(--ca-text-secondary)] mt-1 max-w-md mx-auto">
              Create your business's departments (e.g. Sales, Support, Quotes, Billing) with their respective WhatsApp numbers.
            </p>
            <button
              onClick={handleOpenCreate}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[var(--ca-brand)] px-4 py-2 text-xs font-semibold text-white"
            >
              <Plus className="h-4 w-4" />
              Create First Department
            </button>
          </DashboardSurface>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {departments.map((dept) => (
              <div key={dept.id} className="h-full">
                <DashboardSurface
                  level={2}
                  className="p-5 rounded-2xl border border-[var(--ca-border-subtle)] flex flex-col justify-between gap-4 h-full"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-[var(--ca-text-primary)]">{dept.name}</span>
                      {dept.isFallback && (
                        <StatusBadge tone="brand">Fallback Destination</StatusBadge>
                      )}
                      {!dept.enabled && (
                        <StatusBadge tone="neutral">Disabled</StatusBadge>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenEdit(dept)}
                        className="p-1.5 rounded-lg text-[var(--ca-text-secondary)] hover:text-[var(--ca-text-primary)] hover:bg-[var(--ca-surface-hover)] transition-colors"
                        title="Edit Department"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(dept.id)}
                        className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                        title="Delete Department"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Destination Phone */}
                  <div className="mt-3 flex items-center gap-2 text-xs text-[var(--ca-text-secondary)] font-mono">
                    <Phone className="h-3.5 w-3.5 text-[var(--ca-brand)]" />
                    <span>{dept.whatsappNumberNormalized || dept.whatsappNumber}</span>
                  </div>

                  {/* Semantic Responsibility Description */}
                  <div className="mt-3 p-3 rounded-xl bg-[var(--ca-surface-base)] border border-[var(--ca-border-subtle)]">
                    <span className="text-[11px] font-semibold text-[var(--ca-text-tertiary)] uppercase tracking-wider block mb-1">
                      AI Responsibility Scope:
                    </span>
                    <p className="text-xs text-[var(--ca-text-primary)] leading-relaxed">
                      {dept.description}
                    </p>
                  </div>
                </div>

                <div className="text-[11px] text-[var(--ca-text-tertiary)] flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                  <span>Validated WhatsApp Destination</span>
                </div>
              </DashboardSurface>
            </div>
          ))}
          </div>
        )}
      </DashboardSection>

      {/* Recent Routing Audit Log & Forwarding History */}
      {audits.length > 0 && (
        <DashboardSection className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[var(--ca-text-primary)]">
              Recent Lead Forwarding Activity
            </h3>
            {isLoading && (
              <span className="text-xs text-[var(--ca-brand)] animate-pulse">
                Updating...
              </span>
            )}
          </div>
          <DashboardSurface level={2} className="overflow-x-auto rounded-2xl border border-[var(--ca-border-subtle)]">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[var(--ca-border-subtle)] bg-[var(--ca-surface-base)] text-[var(--ca-text-secondary)] font-semibold">
                <tr>
                  <th className="p-3">Lead ID</th>
                  <th className="p-3">Lead Name / Contact</th>
                  <th className="p-3">Assigned Department</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Time</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ca-border-subtle)] text-[var(--ca-text-primary)]">
                {audits.map((audit) => (
                  <tr key={audit.id} className="hover:bg-[var(--ca-surface-hover)]">
                    <td className="p-3 font-mono font-bold">{audit.leadId}</td>
                    <td className="p-3">
                      <div>{audit.leadName || "Lead"}</div>
                      <div className="text-[11px] text-[var(--ca-text-secondary)] font-mono">
                        {audit.customerPhone || "Pending Phone"}
                      </div>
                    </td>
                    <td className="p-3 font-medium">{audit.departmentName || "Unassigned"}</td>
                    <td className="p-3">
                      <StatusBadge
                        tone={
                          audit.status === "forwarded"
                            ? "brand"
                            : audit.status === "pending_contact_number"
                            ? "neutral"
                            : "amber"
                        }
                      >
                        {audit.status === "forwarded"
                          ? "Forwarded"
                          : audit.status === "pending_contact_number"
                          ? "Pending Phone"
                          : audit.status}
                      </StatusBadge>
                    </td>
                    <td className="p-3 text-[var(--ca-text-secondary)]">
                      {formatDate(audit.attemptTimestamp)}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => {
                          setSelectedLeadForReassign(audit.leadId);
                          setReassignModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--ca-brand)] hover:underline"
                      >
                        <ArrowRightLeft className="h-3 w-3" />
                        Reassign
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DashboardSurface>
        </DashboardSection>
      )}

      {/* Create / Edit Department Modal */}
      {isModalOpen && editingDept && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-[var(--ca-surface-base)] border border-[var(--ca-border-subtle)] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--ca-border-subtle)] pb-4">
              <h3 className="text-sm font-bold text-[var(--ca-text-primary)]">
                {editingDept.id ? "Edit Department" : "Add New Department"}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-[var(--ca-text-tertiary)] hover:text-[var(--ca-text-primary)]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 flex flex-col gap-4">
              <div>
                <label className="text-xs font-semibold text-[var(--ca-text-primary)] block mb-1">
                  Department Name *
                </label>
                <input
                  type="text"
                  value={editingDept.name || ""}
                  onChange={(e) => setEditingDept({ ...editingDept, name: e.target.value })}
                  placeholder="e.g. Inbound Sales, Technical Support, Bulk Quotes"
                  className="w-full rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-layer)] px-3 py-2 text-xs text-[var(--ca-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--ca-brand)]"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[var(--ca-text-primary)] block mb-1">
                  Destination WhatsApp Number *
                </label>
                <input
                  type="text"
                  value={editingDept.whatsappNumber || ""}
                  onChange={(e) => {
                    setEditingDept({ ...editingDept, whatsappNumber: e.target.value });
                    validatePhone(e.target.value);
                  }}
                  placeholder="e.g. +923001234567 or 03001234567"
                  className="w-full rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-layer)] px-3 py-2 text-xs text-[var(--ca-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--ca-brand)] font-mono"
                />
                {phoneError && (
                  <p className="mt-1 text-[11px] text-rose-500">{phoneError}</p>
                )}
                <span className="text-[11px] text-[var(--ca-text-tertiary)] mt-0.5 block">
                  Must be a valid telephone number (8-15 digits). WhatsApp LID IDs are automatically rejected.
                </span>
              </div>

              <div>
                <label className="text-xs font-semibold text-[var(--ca-text-primary)] block mb-1">
                  Semantic Responsibility Description *
                </label>
                <textarea
                  rows={3}
                  value={editingDept.description || ""}
                  onChange={(e) => setEditingDept({ ...editingDept, description: e.target.value })}
                  placeholder="Describe what this department handles. AI uses this semantic text to route customer leads across any language (e.g. 'Handles wholesale purchasing, custom manufacturing quotes, and B2B pricing inquiries')."
                  className="w-full rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-layer)] px-3 py-2 text-xs text-[var(--ca-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--ca-brand)]"
                />
                <span className="text-[11px] text-[var(--ca-text-tertiary)] mt-0.5 block">
                  Crucial for AI classification. Does not rely on keyword lists.
                </span>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="isFallbackCheckbox"
                  checked={Boolean(editingDept.isFallback)}
                  onChange={(e) => setEditingDept({ ...editingDept, isFallback: e.target.checked })}
                  className="rounded border-[var(--ca-border-subtle)] text-[var(--ca-brand)] focus:ring-[var(--ca-brand)]"
                />
                <label htmlFor="isFallbackCheckbox" className="text-xs text-[var(--ca-text-primary)] cursor-pointer">
                  Set as Fallback Department (receives low-confidence or ambiguous leads)
                </label>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2 border-t border-[var(--ca-border-subtle)] pt-4">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-xl border border-[var(--ca-border-subtle)] px-4 py-2 text-xs font-semibold text-[var(--ca-text-secondary)] hover:bg-[var(--ca-surface-hover)]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSaving || !editingDept.name || !editingDept.description || Boolean(phoneError)}
                onClick={handleSaveModal}
                className="rounded-xl bg-[var(--ca-brand)] px-4 py-2 text-xs font-semibold text-white hover:opacity-95 disabled:opacity-50"
              >
                {isSaving ? "Saving..." : "Save Department"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Reassignment Modal */}
      {reassignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-[var(--ca-surface-base)] border border-[var(--ca-border-subtle)] p-6 shadow-2xl">
            <h3 className="text-sm font-bold text-[var(--ca-text-primary)] mb-2">
              Reassign Lead #{selectedLeadForReassign}
            </h3>
            <p className="text-xs text-[var(--ca-text-secondary)] mb-4">
              Select the new department to route this lead to. The grounded conversation summary will be immediately forwarded to the new destination.
            </p>

            <select
              value={targetDeptForReassign}
              onChange={(e) => setTargetDeptForReassign(e.target.value)}
              className="w-full rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-layer)] px-3 py-2 text-xs text-[var(--ca-text-primary)]"
            >
              <option value="">Select Department</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.whatsappNumberNormalized})
                </option>
              ))}
            </select>

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                onClick={() => setReassignModalOpen(false)}
                className="rounded-xl border border-[var(--ca-border-subtle)] px-4 py-2 text-xs font-semibold text-[var(--ca-text-secondary)]"
              >
                Cancel
              </button>
              <button
                disabled={!targetDeptForReassign}
                onClick={handleReassignSubmit}
                className="rounded-xl bg-[var(--ca-brand)] px-4 py-2 text-xs font-semibold text-white hover:opacity-95 disabled:opacity-50"
              >
                Forward to Department
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
