/**
 * AI Group Workspaces Hub Page
 * 
 * Account-owned, instance-independent WhatsApp group workspace intelligence.
 * Provides:
 * - Metrics overview (Saved Workspaces, Active Transports, Ingested Messages, Memory Items)
 * - Workspaces directory with search & status filters (All, Active, Detached, Archived)
 * - Create Workspace modal with connected instance picker & group auto-fetch
 * - Detached UX with clear safe data assurance and Attach Responder action
 * - Clone Workspace modal with selective copy flags
 * - Archive & Restore controls
 */

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Users,
  Sparkles,
  Bot,
  Radio,
  Search,
  Plus,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  Archive,
  RefreshCw,
  Copy,
  Trash2,
  Settings,
  MessageSquare,
  FileText,
  Clock,
  ExternalLink,
  CheckCircle2,
  X,
  FileSpreadsheet,
  Download,
} from "lucide-react";
import {
  DashboardSurface,
  DashboardPageHeader,
  DashboardToolbar,
  MetricTile,
  ActionPanel,
} from "../components/dashboard/DashboardPrimitives";
import type {
  Workspace,
  WorkspaceBinding,
  WorkspaceStatus,
  WorkspaceReplyMode,
} from "../services/workspace-types";

export function WorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<Array<Workspace & { binding?: WorkspaceBinding; metrics?: any }>>([]);
  const [bots, setBots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Filters & Search
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isAttachOpen, setIsAttachOpen] = useState(false);
  const [isCloneOpen, setIsCloneOpen] = useState(false);
  const [selectedWsForAction, setSelectedWsForAction] = useState<Workspace | null>(null);

  // Create Workspace form state
  const [createStep, setCreateStep] = useState<1 | 2>(1);
  const [selectedBotId, setSelectedBotId] = useState("");
  const [availableGroups, setAvailableGroups] = useState<any[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const activeBotFetchRef = useRef<string>("");
  const [selectedGroupJid, setSelectedGroupJid] = useState("");
  const [selectedGroupName, setSelectedGroupName] = useState("");
  const [wsName, setWsName] = useState("");
  const [wsPurpose, setWsPurpose] = useState("");
  const [wsInstructions, setWsInstructions] = useState("");
  const [wsReplyMode, setWsReplyMode] = useState<WorkspaceReplyMode>("SMART_ASSIST");
  const [submitting, setSubmitting] = useState(false);

  // Attach form state
  const [attachBotId, setAttachBotId] = useState("");
  const [attachGroupJid, setAttachGroupJid] = useState("");
  const [attachGroupName, setAttachGroupName] = useState("");

  // Clone form state
  const [cloneName, setCloneName] = useState("");
  const [cloneCopyInstructions, setCloneCopyInstructions] = useState(true);
  const [cloneCopySummary, setCloneCopySummary] = useState(true);
  const [cloneCopyMemory, setCloneCopyMemory] = useState(true);
  const [cloneCopyTasks, setCloneCopyTasks] = useState(true);

  // Selected Workspace Detail Drawer
  const [activeDetailWs, setActiveDetailWs] = useState<(Workspace & { binding?: WorkspaceBinding }) | null>(null);
  const [activeTab, setActiveTab] = useState<"discussion" | "memory" | "files" | "tasks" | "reminders" | "participants" | "settings">("discussion");
  const [messages, setMessages] = useState<any[]>([]);
  const [memoryItems, setMemoryItems] = useState<any[]>([]);
  const [files, setFiles] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [reminders, setReminders] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [participants, setParticipants] = useState<any[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Load data
  const loadWorkspaces = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/user/workspaces");
      const data = await res.json();
      if (data.success) {
        setWorkspaces(data.workspaces || []);
      } else {
        setError(data.error || "Failed to load workspaces");
      }
    } catch (e: any) {
      setError(e?.message || "Error loading workspaces");
    } finally {
      setLoading(false);
    }
  };

  const loadBots = async () => {
    try {
      const res = await fetch("/api/bots/list");
      const data = await res.json();
      if (Array.isArray(data)) {
        setBots(data);
        if (data.length > 0 && !selectedBotId) {
          setSelectedBotId(data[0].id);
        }
      }
    } catch (e) {}
  };

  useEffect(() => {
    loadWorkspaces();
    loadBots();
  }, []);

  // Fetch participating groups when instance changes in modal
  const fetchGroupsForBot = async (botId: string) => {
    if (!botId) return;
    activeBotFetchRef.current = botId;
    setLoadingGroups(true);
    setGroupsError(null);
    setAvailableGroups([]);
    try {
      const res = await fetch(`/api/user/workspaces/participating-groups?botId=${encodeURIComponent(botId)}`);
      const data = await res.json();
      // Guard against stale response if user switched instances while fetch was in flight
      if (activeBotFetchRef.current !== botId) return;

      if (data.success && Array.isArray(data.groups)) {
        setAvailableGroups(data.groups);
        if (data.groups.length > 0) {
          setSelectedGroupJid(data.groups[0].jid);
          setSelectedGroupName(data.groups[0].name);
        } else {
          setSelectedGroupJid("");
          setSelectedGroupName("");
        }
      } else {
        setAvailableGroups([]);
        setGroupsError(data.error || (data.offline ? "Selected instance is offline" : "Could not load WhatsApp groups"));
      }
    } catch (e: any) {
      if (activeBotFetchRef.current === botId) {
        setAvailableGroups([]);
        setGroupsError("WhatsApp group sync failed. Please check connection and retry.");
      }
    } finally {
      if (activeBotFetchRef.current === botId) {
        setLoadingGroups(false);
      }
    }
  };

  useEffect(() => {
    if (isCreateOpen && selectedBotId) {
      fetchGroupsForBot(selectedBotId);
    }
  }, [isCreateOpen, selectedBotId]);

  useEffect(() => {
    if (isAttachOpen && attachBotId) {
      fetchGroupsForBot(attachBotId);
    }
  }, [isAttachOpen, attachBotId]);

  // Load Workspace Detail Drawer Data
  const openWorkspaceDetail = async (ws: Workspace & { binding?: WorkspaceBinding }) => {
    setActiveDetailWs(ws);
    setActiveTab("discussion");
    setLoadingDetails(true);
    try {
      const [msgRes, memRes, fileRes, taskRes, remRes, evtRes, partRes] = await Promise.all([
        fetch(`/api/user/workspaces/${ws.workspaceId}/messages?limit=50`).then((r) => r.json()).catch(() => ({ messages: [] })),
        fetch(`/api/user/workspaces/${ws.workspaceId}/memory`).then((r) => r.json()).catch(() => ({ memory: [] })),
        fetch(`/api/user/workspaces/${ws.workspaceId}/files`).then((r) => r.json()).catch(() => ({ files: [] })),
        fetch(`/api/user/workspaces/${ws.workspaceId}/tasks`).then((r) => r.json()).catch(() => ({ tasks: [] })),
        fetch(`/api/user/workspaces/${ws.workspaceId}/reminders`).then((r) => r.json()).catch(() => ({ reminders: [] })),
        fetch(`/api/user/workspaces/${ws.workspaceId}/events`).then((r) => r.json()).catch(() => ({ events: [] })),
        fetch(`/api/user/workspaces/${ws.workspaceId}/participants`).then((r) => r.json()).catch(() => ({ participants: [] })),
      ]);

      setMessages(msgRes.messages || []);
      setMemoryItems(memRes.memory || []);
      setFiles(fileRes.files || []);
      setTasks(taskRes.tasks || []);
      setReminders(remRes.reminders || []);
      setEvents(evtRes.events || []);
      setParticipants(partRes.participants || []);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleGrantAdmin = async (jid: string) => {
    if (!activeDetailWs) return;
    try {
      const res = await fetch(`/api/user/workspaces/${activeDetailWs.workspaceId}/participants/${encodeURIComponent(jid)}/grant-admin`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setSuccess("Workspace Admin role explicitly granted.");
        const partRes = await fetch(`/api/user/workspaces/${activeDetailWs.workspaceId}/participants`).then((r) => r.json());
        setParticipants(partRes.participants || []);
      } else {
        setError(data.error || "Failed to grant Workspace Admin");
      }
    } catch (e: any) {
      setError(e?.message || "Failed to grant Workspace Admin");
    }
  };

  const handleRevokeAdmin = async (jid: string) => {
    if (!activeDetailWs) return;
    try {
      const res = await fetch(`/api/user/workspaces/${activeDetailWs.workspaceId}/participants/${encodeURIComponent(jid)}/revoke-admin`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setSuccess("Workspace Admin role revoked. Role reverted to MEMBER.");
        const partRes = await fetch(`/api/user/workspaces/${activeDetailWs.workspaceId}/participants`).then((r) => r.json());
        setParticipants(partRes.participants || []);
      } else {
        setError(data.error || "Failed to revoke Workspace Admin");
      }
    } catch (e: any) {
      setError(e?.message || "Failed to revoke Workspace Admin");
    }
  };

  // Submit Create Workspace
  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wsName.trim() || !selectedBotId || !selectedGroupJid) {
      setError("Please specify name, responder instance, and select a WhatsApp group");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/user/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: wsName.trim(),
          purpose: wsPurpose.trim(),
          instructions: wsInstructions.trim(),
          replyMode: wsReplyMode,
          responderInstanceId: selectedBotId,
          groupJid: selectedGroupJid,
          groupName: selectedGroupName || selectedGroupJid,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSuccess(`Workspace "${data.workspace.name}" created successfully.`);
        setIsCreateOpen(false);
        setWsName("");
        setWsPurpose("");
        setWsInstructions("");
        loadWorkspaces();
      } else {
        setError(data.error || "Failed to create workspace");
      }
    } catch (e: any) {
      setError(e?.message || "Failed to create workspace");
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Attach Existing
  const handleAttachWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWsForAction || !attachBotId || !attachGroupJid) {
      setError("Please select both a responder instance and a group");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/user/workspaces/${selectedWsForAction.workspaceId}/attach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          responderInstanceId: attachBotId,
          groupJid: attachGroupJid,
          groupName: attachGroupName || attachGroupJid,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(`Workspace reattached to group successfully.`);
        setIsAttachOpen(false);
        loadWorkspaces();
      } else {
        setError(data.error || "Failed to attach workspace");
      }
    } catch (e: any) {
      setError(e?.message || "Failed to attach workspace");
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Clone Workspace
  const handleCloneWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWsForAction) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/user/workspaces/${selectedWsForAction.workspaceId}/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newName: cloneName.trim(),
          copyInstructions: cloneCopyInstructions,
          copySummary: cloneCopySummary,
          copyMemory: cloneCopyMemory,
          copyTasks: cloneCopyTasks,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(`Workspace cloned into "${data.workspace.name}".`);
        setIsCloneOpen(false);
        loadWorkspaces();
      } else {
        setError(data.error || "Failed to clone workspace");
      }
    } catch (e: any) {
      setError(e?.message || "Failed to clone workspace");
    } finally {
      setSubmitting(false);
    }
  };

  // Archive / Restore
  const handleArchive = async (ws: Workspace) => {
    try {
      const isArchived = ws.status === "ARCHIVED";
      const endpoint = isArchived ? `/api/user/workspaces/${ws.workspaceId}/restore` : `/api/user/workspaces/${ws.workspaceId}/archive`;
      const res = await fetch(endpoint, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setSuccess(isArchived ? "Workspace restored." : "Workspace archived.");
        loadWorkspaces();
      } else {
        setError(data.error || "Action failed");
      }
    } catch (e: any) {
      setError(e?.message || "Action failed");
    }
  };

  // Delete
  const handleDelete = async (ws: Workspace) => {
    if (!confirm(`Are you sure you want to permanently delete workspace "${ws.name}"? This removes all associated history and records.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/user/workspaces/${ws.workspaceId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setSuccess("Workspace permanently deleted.");
        if (activeDetailWs?.workspaceId === ws.workspaceId) setActiveDetailWs(null);
        loadWorkspaces();
      } else {
        setError(data.error || "Failed to delete workspace");
      }
    } catch (e: any) {
      setError(e?.message || "Failed to delete workspace");
    }
  };

  // Filtered workspaces
  const filteredWorkspaces = useMemo(() => {
    return workspaces.filter((ws) => {
      if (statusFilter === "active" && ws.status !== "ACTIVE") return false;
      if (statusFilter === "detached" && ws.status !== "DETACHED" && ws.status !== "NEEDS_RESPONDER") return false;
      if (statusFilter === "archived" && ws.status !== "ARCHIVED") return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return ws.name.toLowerCase().includes(q) || (ws.purpose && ws.purpose.toLowerCase().includes(q));
      }
      return true;
    });
  }, [workspaces, statusFilter, searchQuery]);

  // High-level KPI metrics
  const totalWorkspaces = workspaces.length;
  const activeTransports = workspaces.filter((w) => w.status === "ACTIVE").length;
  const detachedCount = workspaces.filter((w) => w.status === "DETACHED" || w.status === "NEEDS_RESPONDER").length;
  const totalMessagesCount = workspaces.reduce((sum, w) => sum + (w.metrics?.messageCount || 0), 0);

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <DashboardPageHeader
        title="AI Workspaces"
        description="Multi-instance WhatsApp group collaboration, memory, and automated records. Account-owned and resilient across bot instance lifecycles."
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                setSelectedBotId(bots[0]?.id || "");
                setIsCreateOpen(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-[var(--ca-brand)] text-white shadow-sm hover:brightness-110 active:scale-[0.98] transition-all"
            >
              <Plus className="w-4 h-4" />
              Create Workspace
            </button>
          </div>
        }
      />

      {/* Alerts */}
      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button type="button" onClick={() => setError(null)}><X className="w-4 h-4" /></button>
        </div>
      )}
      {success && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{success}</span>
          </div>
          <button type="button" onClick={() => setSuccess(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* KPI Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricTile label="Total Workspaces" value={totalWorkspaces} icon={Users} tone="brand" />
        <MetricTile label="Active Transports" value={activeTransports} icon={Radio} tone="brand" />
        <MetricTile label="Needs Responder" value={detachedCount} icon={AlertTriangle} tone={detachedCount > 0 ? "amber" : "neutral"} />
        <MetricTile label="Archived Workspaces" value={workspaces.filter((w) => w.status === "ARCHIVED").length} icon={Archive} tone="neutral" />
      </div>

      {/* Workspaces List with Status Tabs */}
      <DashboardSurface className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
          {/* Status Tabs */}
          <div className="inline-flex rounded-lg p-1 bg-[var(--ca-bg-subtle)] border border-[var(--ca-border-subtle)] text-xs font-semibold">
            {["all", "active", "detached", "archived"].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3.5 py-1.5 rounded-md capitalize transition-all ${
                  statusFilter === st
                    ? "bg-[var(--ca-surface)] text-[var(--ca-text-primary)] shadow-sm"
                    : "text-[var(--ca-text-muted)] hover:text-[var(--ca-text-primary)]"
                }`}
              >
                {st === "detached" ? `Detached (${detachedCount})` : st}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--ca-text-muted)]" />
            <input
              type="text"
              placeholder="Search workspaces..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm rounded-lg bg-[var(--ca-surface-subtle)] border border-[var(--ca-border-subtle)] text-[var(--ca-text-primary)] placeholder-[var(--ca-text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--ca-brand)]"
            />
          </div>
        </div>

        {/* Workspaces Cards Grid */}
        {loading ? (
          <div className="py-12 text-center text-sm text-[var(--ca-text-muted)]">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 opacity-60" />
            Loading workspaces...
          </div>
        ) : filteredWorkspaces.length === 0 ? (
          <div className="py-12 text-center">
            <Users className="w-10 h-10 mx-auto text-[var(--ca-text-muted)] mb-3 opacity-50" />
            <p className="text-base font-semibold text-[var(--ca-text-primary)]">No workspaces found</p>
            <p className="text-sm text-[var(--ca-text-muted)] mt-1">
              {searchQuery ? "Try a different search query." : "Create your first AI Group Workspace to connect a group."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredWorkspaces.map((ws) => {
              const isDetached = ws.status === "DETACHED" || ws.status === "NEEDS_RESPONDER";
              const isArchived = ws.status === "ARCHIVED";
              const boundBot = bots.find((b) => b.id === ws.binding?.responderInstanceId);

              return (
                <div
                  key={ws.workspaceId}
                  className={`relative flex flex-col justify-between p-5 rounded-xl border transition-all ${
                    isDetached
                      ? "border-amber-500/30 bg-amber-500/[0.02]"
                      : "border-[var(--ca-border-subtle)] bg-[var(--ca-surface)] hover:border-[var(--ca-border-hover)]"
                  }`}
                >
                  <div>
                    {/* Status & Mode Badges */}
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                          ws.status === "ACTIVE"
                            ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                            : isDetached
                            ? "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                            : "bg-neutral-500/10 text-neutral-400 border border-neutral-500/20"
                        }`}
                      >
                        {ws.status}
                      </span>
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[var(--ca-surface-subtle)] text-[var(--ca-text-muted)] border border-[var(--ca-border-subtle)]">
                        {ws.replyMode}
                      </span>
                    </div>

                    {/* Title & Purpose */}
                    <h3 className="text-base font-bold text-[var(--ca-text-primary)] mb-1">
                      {ws.name}
                    </h3>
                    <p className="text-xs text-[var(--ca-text-muted)] line-clamp-2 mb-4">
                      {ws.purpose || "General purpose AI collaboration workspace"}
                    </p>

                    {/* Detached UX Warning (Requirement 54) */}
                    {isDetached && (
                      <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-500 leading-relaxed flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <div>
                          <strong>Workspace data is safe.</strong> Responder required to resume automated group replies.
                        </div>
                      </div>
                    )}

                    {/* Transport & Group Info */}
                    <div className="space-y-1.5 text-xs text-[var(--ca-text-secondary)] mb-4">
                      <div className="flex items-center justify-between">
                        <span className="text-[var(--ca-text-muted)]">WhatsApp Group:</span>
                        <span className="font-medium text-[var(--ca-text-primary)] truncate max-w-[180px]">
                          {ws.binding?.groupName || "No bound group"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[var(--ca-text-muted)]">Responder Bot:</span>
                        <span className="font-medium text-[var(--ca-text-primary)] truncate max-w-[180px]">
                          {boundBot?.name || ws.binding?.responderInstanceId || "None"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions Footer */}
                  <div className="pt-3 border-t border-[var(--ca-border-subtle)] flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => openWorkspaceDetail(ws)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--ca-brand)] text-white hover:brightness-110 active:scale-[0.98] transition-all"
                    >
                      <span>Open Workspace</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>

                    <div className="flex items-center gap-1">
                      {isDetached ? (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedWsForAction(ws);
                            setAttachBotId(bots[0]?.id || "");
                            setIsAttachOpen(true);
                          }}
                          className="px-2.5 py-1.5 rounded-md text-xs font-semibold bg-amber-500/15 text-amber-500 hover:bg-amber-500/25 transition-all"
                        >
                          Attach Responder
                        </button>
                      ) : (
                        <button
                          type="button"
                          title="Clone Workspace"
                          onClick={() => {
                            setSelectedWsForAction(ws);
                            setCloneName(`${ws.name} (Clone)`);
                            setIsCloneOpen(true);
                          }}
                          className="p-1.5 rounded-md text-[var(--ca-text-muted)] hover:text-[var(--ca-text-primary)] hover:bg-[var(--ca-surface-subtle)] transition-all"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <button
                        type="button"
                        title={isArchived ? "Restore Workspace" : "Archive Workspace"}
                        onClick={() => handleArchive(ws)}
                        className="p-1.5 rounded-md text-[var(--ca-text-muted)] hover:text-[var(--ca-text-primary)] hover:bg-[var(--ca-surface-subtle)] transition-all"
                      >
                        <Archive className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        title="Delete Workspace"
                        onClick={() => handleDelete(ws)}
                        className="p-1.5 rounded-md text-red-400 hover:text-red-500 hover:bg-red-500/10 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DashboardSurface>

      {/* CREATE WORKSPACE MODAL */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-[var(--ca-surface)] rounded-2xl border border-[var(--ca-border-subtle)] shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--ca-border-subtle)]">
              <div>
                <h3 className="text-lg font-bold text-[var(--ca-text-primary)]">Create AI Group Workspace</h3>
                <p className="text-xs text-[var(--ca-text-muted)]">Connect an eligible WhatsApp instance to an active WhatsApp group.</p>
              </div>
              <button type="button" onClick={() => setIsCreateOpen(false)} className="text-[var(--ca-text-muted)] hover:text-[var(--ca-text-primary)]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateWorkspace} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--ca-text-secondary)] mb-1.5">
                  Workspace Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sales Pipeline Core, Ops Alpha"
                  value={wsName}
                  onChange={(e) => setWsName(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm rounded-lg bg-[var(--ca-surface-subtle)] border border-[var(--ca-border-subtle)] text-[var(--ca-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--ca-brand)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--ca-text-secondary)] mb-1.5">
                  Workspace Purpose / Goal
                </label>
                <input
                  type="text"
                  placeholder="e.g. Daily team standup, expense tracking, and decision logs"
                  value={wsPurpose}
                  onChange={(e) => setWsPurpose(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm rounded-lg bg-[var(--ca-surface-subtle)] border border-[var(--ca-border-subtle)] text-[var(--ca-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--ca-brand)]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--ca-text-secondary)] mb-1.5">
                    Responder WhatsApp Instance
                  </label>
                  <select
                    value={selectedBotId}
                    onChange={(e) => setSelectedBotId(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm rounded-lg bg-[var(--ca-surface-subtle)] border border-[var(--ca-border-subtle)] text-[var(--ca-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--ca-brand)]"
                  >
                    {bots.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.phone || b.id})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--ca-text-secondary)] mb-1.5">
                    Reply Mode
                  </label>
                  <select
                    value={wsReplyMode}
                    onChange={(e) => setWsReplyMode(e.target.value as WorkspaceReplyMode)}
                    className="w-full px-3.5 py-2 text-sm rounded-lg bg-[var(--ca-surface-subtle)] border border-[var(--ca-border-subtle)] text-[var(--ca-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--ca-brand)]"
                  >
                    <option value="SMART_ASSIST">SMART_ASSIST (Semantically helpful replies)</option>
                    <option value="MENTION_ONLY">MENTION_ONLY (Direct @mentions or replies)</option>
                    <option value="EVERY_MESSAGE">EVERY_MESSAGE (Reply to all eligible messages)</option>
                    <option value="OWNER_ONLY">OWNER_ONLY (Replies only to account owner)</option>
                    <option value="SILENT_ARCHIVE">SILENT_ARCHIVE (Store & memorize without replies)</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-[var(--ca-text-secondary)]">
                    Select Participating WhatsApp Group
                  </label>
                  <button
                    type="button"
                    onClick={() => fetchGroupsForBot(selectedBotId)}
                    disabled={loadingGroups || !selectedBotId}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--ca-brand)] hover:underline disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${loadingGroups ? "animate-spin" : ""}`} />
                    Refresh Groups
                  </button>
                </div>
                {loadingGroups ? (
                  <div className="p-3 text-xs text-[var(--ca-text-muted)] bg-[var(--ca-surface-subtle)] rounded-lg flex items-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Fetching participating groups from WhatsApp instance...
                  </div>
                ) : groupsError ? (
                  <div className="p-3 text-xs text-rose-500 bg-rose-500/10 border border-rose-500/20 rounded-lg flex items-center justify-between">
                    <span>{groupsError}</span>
                    <button
                      type="button"
                      onClick={() => fetchGroupsForBot(selectedBotId)}
                      className="text-xs underline font-semibold ml-2 hover:opacity-80 shrink-0"
                    >
                      Retry
                    </button>
                  </div>
                ) : availableGroups.length === 0 ? (
                  <div className="p-3 text-xs text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-center justify-between">
                    <span>No participating WhatsApp groups found for this instance. Ensure this bot has been added to the desired WhatsApp group.</span>
                    <button
                      type="button"
                      onClick={() => fetchGroupsForBot(selectedBotId)}
                      className="text-xs underline font-semibold ml-2 hover:opacity-80 shrink-0"
                    >
                      Refresh
                    </button>
                  </div>
                ) : (
                  <select
                    value={selectedGroupJid}
                    onChange={(e) => {
                      setSelectedGroupJid(e.target.value);
                      const g = availableGroups.find((item) => item.jid === e.target.value);
                      if (g) setSelectedGroupName(g.name);
                    }}
                    className="w-full px-3.5 py-2 text-sm rounded-lg bg-[var(--ca-surface-subtle)] border border-[var(--ca-border-subtle)] text-[var(--ca-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--ca-brand)]"
                  >
                    {availableGroups.map((g) => (
                      <option key={g.jid} value={g.jid}>
                        {g.name} ({g.participantCount} members)
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--ca-text-secondary)] mb-1.5">
                  Owner Workspace Instructions (Layer 2)
                </label>
                <textarea
                  rows={3}
                  placeholder="Custom assistant instructions, project guidelines, tone, expense rules..."
                  value={wsInstructions}
                  onChange={(e) => setWsInstructions(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm rounded-lg bg-[var(--ca-surface-subtle)] border border-[var(--ca-border-subtle)] text-[var(--ca-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--ca-brand)]"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--ca-border-subtle)]">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 text-sm font-semibold rounded-lg bg-[var(--ca-surface-subtle)] text-[var(--ca-text-primary)] hover:bg-[var(--ca-border-subtle)] transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !selectedGroupJid}
                  className="px-5 py-2 text-sm font-semibold rounded-lg bg-[var(--ca-brand)] text-white hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {submitting ? "Creating..." : "Create & Bind Workspace"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ATTACH RESPONDER MODAL */}
      {isAttachOpen && selectedWsForAction && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[var(--ca-surface)] rounded-2xl border border-[var(--ca-border-subtle)] shadow-2xl p-6 space-y-4">
            <h3 className="text-base font-bold text-[var(--ca-text-primary)]">
              Attach Responder to "{selectedWsForAction.name}"
            </h3>
            <p className="text-xs text-[var(--ca-text-muted)] leading-relaxed">
              Select a connected WhatsApp instance to serve as the responder. All existing conversation history, memory items, tasks, and files remain attached to this workspace.
            </p>

            <form onSubmit={handleAttachWorkspace} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--ca-text-secondary)] mb-1">
                  Connected WhatsApp Instance
                </label>
                <select
                  value={attachBotId}
                  onChange={(e) => setAttachBotId(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg bg-[var(--ca-surface-subtle)] border border-[var(--ca-border-subtle)] text-[var(--ca-text-primary)]"
                >
                  {bots.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.phone || b.id})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-[var(--ca-text-secondary)]">
                    WhatsApp Group
                  </label>
                  <button
                    type="button"
                    onClick={() => fetchGroupsForBot(attachBotId)}
                    disabled={loadingGroups || !attachBotId}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--ca-brand)] hover:underline disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${loadingGroups ? "animate-spin" : ""}`} />
                    Refresh Groups
                  </button>
                </div>
                {loadingGroups ? (
                  <div className="p-2 text-xs text-[var(--ca-text-muted)] bg-[var(--ca-surface-subtle)] rounded flex items-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Fetching groups...
                  </div>
                ) : groupsError ? (
                  <div className="p-2 text-xs text-rose-500 bg-rose-500/10 border border-rose-500/20 rounded flex items-center justify-between">
                    <span>{groupsError}</span>
                    <button
                      type="button"
                      onClick={() => fetchGroupsForBot(attachBotId)}
                      className="text-xs underline font-semibold ml-2 hover:opacity-80 shrink-0"
                    >
                      Retry
                    </button>
                  </div>
                ) : availableGroups.length === 0 ? (
                  <div className="p-2 text-xs text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded flex items-center justify-between">
                    <span>No participating WhatsApp groups found for this instance.</span>
                    <button
                      type="button"
                      onClick={() => fetchGroupsForBot(attachBotId)}
                      className="text-xs underline font-semibold ml-2 hover:opacity-80 shrink-0"
                    >
                      Refresh
                    </button>
                  </div>
                ) : (
                  <select
                    value={attachGroupJid}
                    onChange={(e) => {
                      setAttachGroupJid(e.target.value);
                      const g = availableGroups.find((x) => x.jid === e.target.value);
                      if (g) setAttachGroupName(g.name);
                    }}
                    className="w-full px-3 py-2 text-sm rounded-lg bg-[var(--ca-surface-subtle)] border border-[var(--ca-border-subtle)] text-[var(--ca-text-primary)]"
                  >
                    {availableGroups.map((g) => (
                      <option key={g.jid} value={g.jid}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--ca-border-subtle)]">
                <button
                  type="button"
                  onClick={() => setIsAttachOpen(false)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[var(--ca-surface-subtle)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !attachGroupJid}
                  className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-[var(--ca-brand)] text-white disabled:opacity-50"
                >
                  {submitting ? "Attaching..." : "Confirm & Attach"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CLONE WORKSPACE MODAL */}
      {isCloneOpen && selectedWsForAction && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[var(--ca-surface)] rounded-2xl border border-[var(--ca-border-subtle)] shadow-2xl p-6 space-y-4">
            <h3 className="text-base font-bold text-[var(--ca-text-primary)]">
              Clone Workspace
            </h3>
            <p className="text-xs text-[var(--ca-text-muted)]">
              Create a new independent workspace inheriting selected configuration from "{selectedWsForAction.name}".
            </p>

            <form onSubmit={handleCloneWorkspace} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--ca-text-secondary)] mb-1">
                  New Workspace Name
                </label>
                <input
                  type="text"
                  required
                  value={cloneName}
                  onChange={(e) => setCloneName(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg bg-[var(--ca-surface-subtle)] border border-[var(--ca-border-subtle)] text-[var(--ca-text-primary)]"
                />
              </div>

              <div className="space-y-2 pt-2 border-t border-[var(--ca-border-subtle)] text-xs text-[var(--ca-text-secondary)]">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cloneCopyInstructions}
                    onChange={(e) => setCloneCopyInstructions(e.target.checked)}
                    className="rounded text-[var(--ca-brand)]"
                  />
                  <span>Copy Owner Instructions</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cloneCopySummary}
                    onChange={(e) => setCloneCopySummary(e.target.checked)}
                    className="rounded text-[var(--ca-brand)]"
                  />
                  <span>Copy Rolling Summary</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cloneCopyMemory}
                    onChange={(e) => setCloneCopyMemory(e.target.checked)}
                    className="rounded text-[var(--ca-brand)]"
                  />
                  <span>Copy Structured Memory Items</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cloneCopyTasks}
                    onChange={(e) => setCloneCopyTasks(e.target.checked)}
                    className="rounded text-[var(--ca-brand)]"
                  />
                  <span>Copy Active Tasks</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--ca-border-subtle)]">
                <button
                  type="button"
                  onClick={() => setIsCloneOpen(false)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[var(--ca-surface-subtle)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-[var(--ca-brand)] text-white disabled:opacity-50"
                >
                  {submitting ? "Cloning..." : "Clone Workspace"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* WORKSPACE DETAIL DRAWER */}
      {activeDetailWs && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-2xl bg-[var(--ca-surface)] border-l border-[var(--ca-border-subtle)] h-full flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="p-5 border-b border-[var(--ca-border-subtle)] flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                    {activeDetailWs.status}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded bg-[var(--ca-surface-subtle)] text-[var(--ca-text-muted)] font-mono">
                    {activeDetailWs.replyMode}
                  </span>
                </div>
                <h2 className="text-lg font-bold text-[var(--ca-text-primary)]">
                  {activeDetailWs.name}
                </h2>
                <p className="text-xs text-[var(--ca-text-muted)] mt-0.5">
                  Group: {activeDetailWs.binding?.groupName || "Detached"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveDetailWs(null)}
                className="p-1 rounded-lg text-[var(--ca-text-muted)] hover:text-[var(--ca-text-primary)] hover:bg-[var(--ca-surface-subtle)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Tabs */}
            <div className="flex border-b border-[var(--ca-border-subtle)] px-5 overflow-x-auto text-xs font-semibold">
              {[
                { id: "discussion", label: `Discussion (${messages.length})` },
                { id: "memory", label: `Memory (${memoryItems.length})` },
                { id: "files", label: `Files (${files.length})` },
                { id: "tasks", label: `Tasks (${tasks.length})` },
                { id: "reminders", label: `Reminders (${reminders.length})` },
                { id: "participants", label: `Participants (${participants.length})` },
                { id: "settings", label: "Settings" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`py-3 px-3 border-b-2 whitespace-nowrap transition-all ${
                    activeTab === tab.id
                      ? "border-[var(--ca-brand)] text-[var(--ca-brand)]"
                      : "border-transparent text-[var(--ca-text-muted)] hover:text-[var(--ca-text-primary)]"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {loadingDetails ? (
                <div className="py-12 text-center text-sm text-[var(--ca-text-muted)]">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 opacity-60" />
                  Loading workspace details...
                </div>
              ) : activeTab === "discussion" ? (
                <div className="space-y-3">
                  {messages.length === 0 ? (
                    <div className="py-8 text-center text-xs text-[var(--ca-text-muted)]">
                      No group messages ingested yet for this workspace.
                    </div>
                  ) : (
                    messages.map((m) => (
                      <div key={m.messageRecordId} className="p-3.5 rounded-xl bg-[var(--ca-surface-subtle)] border border-[var(--ca-border-subtle)] space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-[var(--ca-text-primary)]">{m.senderDisplayName}</span>
                          <span className="text-[var(--ca-text-muted)]">{new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                        <p className="text-xs text-[var(--ca-text-secondary)] whitespace-pre-wrap leading-relaxed">{m.textContent}</p>
                        {m.aiReplyText && (
                          <div className="mt-2 p-2.5 rounded-lg bg-[var(--ca-brand)]/10 border border-[var(--ca-brand)]/20 text-xs text-[var(--ca-brand)] leading-relaxed">
                            <span className="font-semibold block mb-0.5">AI Response:</span>
                            {m.aiReplyText}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              ) : activeTab === "memory" ? (
                <div className="space-y-3">
                  {memoryItems.length === 0 ? (
                    <div className="py-8 text-center text-xs text-[var(--ca-text-muted)]">
                      No structured memory items extracted yet.
                    </div>
                  ) : (
                    memoryItems.map((mem) => (
                      <div key={mem.memoryId} className="p-3 rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-subtle)] space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-[var(--ca-text-primary)]">{mem.title}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-[var(--ca-surface)] text-[var(--ca-text-muted)] font-mono">{mem.type}</span>
                        </div>
                        <p className="text-xs text-[var(--ca-text-secondary)]">{mem.content}</p>
                        <span className="text-[10px] text-[var(--ca-text-muted)] block">Provenance: {mem.provenance}</span>
                      </div>
                    ))
                  )}
                </div>
              ) : activeTab === "files" ? (
                <div className="space-y-2">
                  {files.length === 0 ? (
                    <div className="py-8 text-center text-xs text-[var(--ca-text-muted)]">
                      No files or media uploaded yet.
                    </div>
                  ) : (
                    files.map((f) => (
                      <div key={f.fileId} className="p-3 rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-subtle)] flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-[var(--ca-brand)]" />
                          <div>
                            <p className="font-semibold text-[var(--ca-text-primary)]">{f.fileName}</p>
                            <p className="text-[10px] text-[var(--ca-text-muted)]">{f.mimeType ? `${f.mimeType} • ` : ""}{(f.size / 1024).toFixed(1)} KB • {f.processingStatus}</p>
                          </div>
                        </div>
                        <a
                          href={`/api/user/workspaces/${activeDetailWs.workspaceId}/files/${f.fileId}/download`}
                          className="px-2.5 py-1 rounded-md bg-[var(--ca-surface)] text-[var(--ca-text-primary)] hover:bg-[var(--ca-surface-subtle)] flex items-center gap-1 font-semibold"
                        >
                          <Download className="w-3 h-3" />
                          Download
                        </a>
                      </div>
                    ))
                  )}
                </div>
              ) : activeTab === "tasks" ? (
                <div className="space-y-2">
                  {tasks.length === 0 ? (
                    <div className="py-8 text-center text-xs text-[var(--ca-text-muted)]">
                      No tasks created yet.
                    </div>
                  ) : (
                    tasks.map((t) => (
                      <div key={t.taskId} className="p-3 rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-subtle)] flex items-center justify-between text-xs">
                        <div>
                          <p className="font-semibold text-[var(--ca-text-primary)]">{t.title}</p>
                          <p className="text-[10px] text-[var(--ca-text-muted)]">Status: {t.status} • Assignee: {t.assignee || "Unassigned"}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : activeTab === "reminders" ? (
                <div className="space-y-2">
                  {reminders.length === 0 ? (
                    <div className="py-8 text-center text-xs text-[var(--ca-text-muted)]">
                      No reminders set.
                    </div>
                  ) : (
                    reminders.map((r) => (
                      <div key={r.reminderId} className="p-3 rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-subtle)] flex items-center justify-between text-xs">
                        <div>
                          <p className="font-semibold text-[var(--ca-text-primary)]">{r.message}</p>
                          <p className="text-[10px] text-[var(--ca-text-muted)]">Due: {new Date(r.dueAt).toLocaleString()} • Status: {r.status}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : activeTab === "participants" ? (
                <div className="space-y-3">
                  <div className="p-3 bg-[var(--ca-surface-subtle)] border border-[var(--ca-border-subtle)] rounded-xl text-xs text-[var(--ca-text-secondary)]">
                    <p className="font-semibold text-[var(--ca-text-primary)] mb-1">Role Authority Separation Policy</p>
                    <p>
                      WhatsApp group admin status is transport metadata only. BlackArrow Workspace Admin authority requires an explicit grant by the Workspace Owner.
                    </p>
                  </div>
                  {participants.length === 0 ? (
                    <div className="py-8 text-center text-xs text-[var(--ca-text-muted)]">
                      No participants recorded for this workspace yet. Participants are registered upon first group message or sync.
                    </div>
                  ) : (
                    participants.map((p) => (
                      <div
                        key={p.participantId || p.jid}
                        className="p-3.5 rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-subtle)] flex items-center justify-between text-xs"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-[var(--ca-text-primary)]">{p.displayName || p.canonicalPhone}</span>
                            <span className="font-mono text-[10px] text-[var(--ca-text-muted)]">({p.canonicalPhone || p.jid})</span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px]">
                            <span className="text-[var(--ca-text-muted)]">Workspace Role:</span>
                            <span
                              className={`px-2 py-0.5 rounded font-semibold ${
                                p.role === "OWNER"
                                  ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                                  : p.role === "WORKSPACE_ADMIN"
                                  ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                                  : "bg-[var(--ca-surface)] text-[var(--ca-text-secondary)]"
                              }`}
                            >
                              {p.role}
                            </span>
                            <span className="text-[var(--ca-text-muted)] ml-2">WhatsApp Group Role:</span>
                            <span
                              className={`px-2 py-0.5 rounded font-mono ${
                                p.whatsappAdmin
                                  ? "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                                  : "bg-[var(--ca-surface)] text-[var(--ca-text-muted)]"
                              }`}
                            >
                              {p.whatsappAdmin ? "ADMIN" : "MEMBER"}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {p.role === "MEMBER" && (
                            <button
                              type="button"
                              onClick={() => handleGrantAdmin(p.jid)}
                              className="px-3 py-1 text-xs font-semibold rounded-lg bg-[var(--ca-brand)] text-white hover:opacity-90"
                            >
                              Grant Workspace Admin
                            </button>
                          )}
                          {p.role === "WORKSPACE_ADMIN" && (
                            <button
                              type="button"
                              onClick={() => handleRevokeAdmin(p.jid)}
                              className="px-3 py-1 text-xs font-semibold rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20"
                            >
                              Revoke Workspace Admin
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className="space-y-4 text-xs">
                  <div>
                    <label className="font-bold text-[var(--ca-text-primary)] block mb-1">Owner Workspace Instructions</label>
                    <textarea
                      rows={5}
                      defaultValue={activeDetailWs.instructions}
                      className="w-full p-2.5 rounded-lg bg-[var(--ca-surface-subtle)] border border-[var(--ca-border-subtle)] text-[var(--ca-text-primary)]"
                    />
                  </div>
                  <div className="pt-3 border-t border-[var(--ca-border-subtle)] flex items-center justify-between">
                    <a
                      href={`/api/user/workspaces/${activeDetailWs.workspaceId}/export`}
                      className="px-3 py-1.5 rounded-lg bg-[var(--ca-surface-subtle)] text-[var(--ca-text-primary)] font-semibold"
                    >
                      Export Workspace JSON
                    </a>
                    <button
                      type="button"
                      onClick={() => handleDelete(activeDetailWs)}
                      className="px-3 py-1.5 rounded-lg bg-red-500/10 text-red-500 font-semibold"
                    >
                      Delete Workspace
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
