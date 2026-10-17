import React, { useState, useEffect, useRef } from "react";
import {
  Sparkles,
  Layers,
  Activity,
  CheckSquare,
  MessageSquare,
  Users,
  UserCheck,
  Shield,
  RefreshCw,
  Radio,
  FolderOpen,
} from "lucide-react";
import type {
  PersonalAssistantTab,
  PersonalConversationSummary,
} from "./hub-types.ts";
import type { PersonalTask } from "../../../services/personal-task-types.ts";
import { fetchHubOverview, type HubOverviewResponse } from "./hub-api.ts";
import { PersonalAssistantOverview } from "./PersonalAssistantOverview.tsx";
import { PersonalTasksView } from "./PersonalTasksView.tsx";
import { PersonalTaskDetail } from "./PersonalTaskDetail.tsx";
import { PersonalConversationsView } from "./PersonalConversationsView.tsx";
import { PersonalConversationDetail } from "./PersonalConversationDetail.tsx";
import { PersonalConnectedAppsView } from "./PersonalConnectedAppsView.tsx";
import { PersonalNumbersView } from "./PersonalNumbersView.tsx";
import { PersonalContactsView } from "../contacts/PersonalContactsView.tsx";
import { OwnerProfileEditor } from "../owner-profile/OwnerProfileEditor.tsx";
import { PersonalDelegationSettingsView } from "../settings/PersonalDelegationSettingsView.tsx";

const VALID_TABS: readonly PersonalAssistantTab[] = [
  "overview",
  "tasks",
  "conversations",
  "contacts",
  "profile",
  "permissions",
  "connected_apps",
  "numbers",
] as const;

function isPersonalAssistantTab(val: unknown): val is PersonalAssistantTab {
  return typeof val === "string" && (VALID_TABS as readonly string[]).includes(val);
}

interface PersonalAssistantHubProps {
  initialTab?: PersonalAssistantTab;
}

const DEFAULT_TAB: PersonalAssistantTab = "overview";

export const PersonalAssistantHub: React.FC<PersonalAssistantHubProps> = ({
  initialTab = DEFAULT_TAB,
}) => {
  const getTabFromUrl = (): PersonalAssistantTab => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const tabParam = urlParams.get("tab");
      if (isPersonalAssistantTab(tabParam)) {
        return tabParam;
      }
      const pathname = typeof window !== "undefined" ? window.location.pathname : "";
      for (const t of VALID_TABS) {
        if (pathname.endsWith(`/${t}`) || pathname.includes(`/personal-assistant/${t}`)) {
          return t;
        }
      }
    } catch {}
    return (initialTab as PersonalAssistantTab) || DEFAULT_TAB;
  };

  const [activeTab, setActiveTab] = useState<PersonalAssistantTab>(getTabFromUrl);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>("all");
  const [overviewData, setOverviewData] = useState<HubOverviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedTask, setSelectedTask] = useState<PersonalTask | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<PersonalConversationSummary | null>(null);

  // Request isolation ref to prevent late async responses from previous instance overwriting current
  const activeInstanceRef = useRef<string>("all");

  const handleTabChange = (tabId: PersonalAssistantTab) => {
    setActiveTab(tabId);
    setSelectedTask(null);
    setSelectedConversation(null);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", tabId);
      window.history.replaceState({}, document.title, url.toString());
    } catch {}
  };

  const loadOverview = async () => {
    const targetInstance = selectedInstanceId;
    activeInstanceRef.current = targetInstance;
    setLoading(true);
    try {
      const data = await fetchHubOverview(targetInstance === "all" ? undefined : targetInstance);
      if (activeInstanceRef.current === targetInstance) {
        setOverviewData(data);
      }
    } catch (err) {
      console.error("[PersonalAssistantHub] Failed to load overview:", err);
    } finally {
      if (activeInstanceRef.current === targetInstance) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    loadOverview();
  }, [selectedInstanceId]);

  const handleSelectInstance = (instanceId: string) => {
    setSelectedInstanceId(instanceId);
    setSelectedTask(null);
    setSelectedConversation(null);
  };

  const handleOpenTask = (taskId: string) => {
    handleTabChange("tasks");
    const found = overviewData?.attentionQueue.find((i) => i.taskId === taskId);
    if (found) {
      setSelectedTask({
        taskId,
        goal: found.title,
        status: found.type === "approval_required" ? "WAITING_FOR_APPROVAL" : "WAITING_FOR_OWNER",
        pendingQuestion: found.pendingQuestion,
        approvalFingerprint: found.approvalFingerprint,
        createdAt: found.timestamp,
        updatedAt: found.timestamp,
        events: [],
      } as any);
    }
  };

  const tabs = [
    { id: "overview", label: "Overview", icon: Activity },
    { id: "tasks", label: "Tasks", icon: CheckSquare },
    { id: "conversations", label: "Conversations", icon: MessageSquare },
    { id: "contacts", label: "Contacts", icon: Users },
    { id: "profile", label: "My Profile", icon: UserCheck },
    { id: "permissions", label: "Permissions", icon: Shield },
    { id: "connected_apps", label: "Connected Apps", icon: FolderOpen },
    { id: "numbers", label: "Personal Numbers", icon: Radio },
  ] as const;

  return (
    <div className="min-h-screen bg-[var(--ca-bg-main)] text-[var(--ca-text-primary)] p-4 sm:p-6 lg:p-8 space-y-6" data-testid="personal-assistant-hub">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--ca-border-subtle)] pb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-emerald-500/20 to-teal-500/20 text-emerald-400 border border-emerald-500/30">
            <Sparkles className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--ca-text-primary)]">Personal Assistant Hub</h1>
            <p className="text-xs text-[var(--ca-text-secondary)]">
              Central Command, Autonomy Governance & Personal Task Engine
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 self-end sm:self-center">
          {/* Instance Selector Dropdown */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[var(--ca-text-muted)] hidden sm:inline">Instance:</span>
            <select
              value={selectedInstanceId}
              onChange={(e) => handleSelectInstance(e.target.value)}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-[var(--ca-bg-card)] border border-[var(--ca-border-subtle)] text-[var(--ca-text-primary)] focus:outline-none focus:border-emerald-500"
            >
              <option value="all">All Personal Numbers</option>
              {(overviewData?.personalNumbers || []).map((num) => (
                <option key={num.instanceId} value={num.instanceId}>
                  {num.name} ({num.phone || num.instanceId})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={loadOverview}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[var(--ca-bg-card)] border border-[var(--ca-border-subtle)] hover:bg-[var(--ca-bg-hover)] transition"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Tabs Navigation Bar */}
      <div className="flex items-center gap-1.5 border-b border-[var(--ca-border-subtle)] overflow-x-auto pb-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              data-testid={`hub-tab-${tab.id}`}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition whitespace-nowrap ${
                isActive
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                  : "text-[var(--ca-text-secondary)] hover:text-[var(--ca-text-primary)] hover:bg-[var(--ca-bg-card)]"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content Panes */}
      <div className="pt-2">
        {activeTab === "overview" && (
          <PersonalAssistantOverview
            data={overviewData}
            loading={loading}
            onNavigateTab={(tab) => {
              setActiveTab(tab);
              setSelectedTask(null);
              setSelectedConversation(null);
            }}
            onOpenTask={handleOpenTask}
          />
        )}

        {activeTab === "tasks" && (
          selectedTask ? (
            <PersonalTaskDetail
              task={selectedTask}
              onBack={() => setSelectedTask(null)}
              onTaskUpdated={(updated) => setSelectedTask(updated)}
            />
          ) : (
            <PersonalTasksView
              onSelectTask={(t) => setSelectedTask(t)}
              selectedInstanceId={selectedInstanceId === "all" ? undefined : selectedInstanceId}
            />
          )
        )}

        {activeTab === "conversations" && (
          selectedConversation ? (
            <PersonalConversationDetail
              conversation={selectedConversation}
              onBack={() => setSelectedConversation(null)}
              onOpenTask={(tid) => handleOpenTask(tid)}
              onStatusChanged={() => loadOverview()}
            />
          ) : (
            <PersonalConversationsView
              onSelectConversation={(c) => setSelectedConversation(c)}
              selectedInstanceId={selectedInstanceId === "all" ? undefined : selectedInstanceId}
            />
          )
        )}

        {activeTab === "contacts" && (
          <PersonalContactsView />
        )}

        {activeTab === "profile" && (
          <div className="max-w-4xl">
            <OwnerProfileEditor />
          </div>
        )}

        {activeTab === "permissions" && (
          <div className="max-w-4xl">
            <PersonalDelegationSettingsView />
          </div>
        )}

        {activeTab === "connected_apps" && (
          <div className="max-w-4xl">
            <PersonalConnectedAppsView />
          </div>
        )}

        {activeTab === "numbers" && (
          <PersonalNumbersView
            numbers={overviewData?.personalNumbers || []}
          />
        )}
      </div>
    </div>
  );
};
