import React, { useState } from "react";
import { Link } from "react-router-dom";
import { FolderKanban, Image as ImageIcon, FileText, Layers, Sparkles, AlertTriangle } from "lucide-react";
import { DashboardPageHeader } from "../components/dashboard/DashboardPrimitives";
import { resolvePathByViewAndTab } from "../app/dashboard-route-registry";
import { MediaLibrary } from "./media/MediaLibrary";
import { SavedRepliesPanel } from "./replies/SavedRepliesPanel";
import { SequenceGroupsPanel } from "./sequences/SequenceGroupsPanel";
import { WelcomeSequencePanel } from "./welcome/WelcomeSequencePanel";
import type { MediaLibraryItem, MediaGroupItem, SavedReplyItem, SequenceGroupItem, WelcomeSequenceConfig } from "./content-library-model";

export type ContentLibraryTab = "media" | "saved_replies" | "sequences" | "welcome";

export interface ContentLibraryPageProps {
  activeTab?: ContentLibraryTab;
  selectedBotId?: string;
  sequenceGroupLimit?: number;
  mediaGroupLimit?: number;
  mediaItems?: MediaLibraryItem[];
  mediaGroups?: MediaGroupItem[];
  savedReplies?: SavedReplyItem[];
  sequences?: SequenceGroupItem[];
  welcomeConfig?: WelcomeSequenceConfig;
  onTabChange?: (tab: ContentLibraryTab) => void;
  onRefreshGroup?: (groupId?: string) => Promise<void> | void;
  onResetGroup?: (groupId: string, purpose?: "media" | "sequence" | "welcome") => Promise<void> | void;
  onUnlinkGroup?: (groupId: string) => Promise<void> | void;
  onSaveMediaGroup?: (data: any) => Promise<void> | void;
  onToggleMediaGroup?: (groupId: string, enabled: boolean) => Promise<void> | void;
  onUnlinkMediaGroup?: (groupId: string) => Promise<void> | void;
  onToggleSequence?: (sequenceId: string, enabled: boolean) => Promise<void> | void;
  onSaveSequenceGroup?: (data: any) => Promise<void> | void;
  onSaveWelcomeGroup?: (data: any) => Promise<void> | void;
  onToggleWelcome?: (enabled: boolean) => Promise<void> | void;
  onUnlinkWelcomeGroup?: (groupId: string) => Promise<void> | void;
  onSaveReplyShortcut?: (data: any) => Promise<void> | void;
  onDeleteReplyShortcut?: (id: string) => Promise<void> | void;
  formatDate?: (ts?: number | string) => string;
}

export const ContentLibraryPage: React.FC<ContentLibraryPageProps> = ({
  activeTab = "media",
  selectedBotId,
  sequenceGroupLimit,
  mediaGroupLimit,
  mediaItems = [],
  mediaGroups = [],
  savedReplies = [],
  sequences = [],
  welcomeConfig = {
    isEnabled: false,
    name: "Welcome Sequence",
    itemCount: 0,
    items: [],
    readinessStatus: "not_configured",
    isConfigured: false,
  } as WelcomeSequenceConfig,
  onTabChange,
  onRefreshGroup,
  onResetGroup,
  onUnlinkGroup,
  onSaveMediaGroup,
  onToggleMediaGroup,
  onUnlinkMediaGroup,
  onToggleSequence,
  onSaveSequenceGroup,
  onSaveWelcomeGroup,
  onToggleWelcome,
  onUnlinkWelcomeGroup,
  onSaveReplyShortcut,
  onDeleteReplyShortcut,
  formatDate = (ts) => (ts ? String(ts) : ""),
}) => {
  const [currentTab, setCurrentTab] = useState<ContentLibraryTab>(activeTab);

  React.useEffect(() => {
    setCurrentTab(activeTab);
  }, [activeTab]);

  const handleSelectTab = (tab: ContentLibraryTab) => {
    setCurrentTab(tab);
    if (onTabChange) onTabChange(tab);
  };

  const tabs: Array<{ id: ContentLibraryTab; label: string; icon: any }> = [
    { id: "media", label: "Media Library", icon: ImageIcon },
    { id: "saved_replies", label: "Saved Replies & Shortcuts", icon: FileText },
    { id: "sequences", label: "Sequence Groups", icon: Layers },
    { id: "welcome", label: "Welcome Sequence", icon: Sparkles },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <DashboardPageHeader
        eyebrow="Automation Library"
        title="Content Library & Sequences"
        description="Manage Media Groups, quick reply shortcuts, automated WhatsApp multi-step sequences, and instant onboarding Welcome flows."
        icon={FolderKanban}
      />

      {!selectedBotId && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
            <div>
              <h4 className="text-sm font-bold text-amber-900 dark:text-amber-200">Select a WhatsApp Instance</h4>
              <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">
                Select a WhatsApp instance first to manage Media & Sequence Groups.
              </p>
            </div>
          </div>
          <Link to="/instances" className="ca-button-primary text-xs shrink-0">
            Manage Instances
          </Link>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-1)] p-1.5 shadow-sm">
        <Link
          to={resolvePathByViewAndTab("content_library", "media")}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
            currentTab === "media"
              ? "bg-emerald-600 text-white shadow-sm"
              : "text-[var(--ca-text-secondary)] hover:bg-[var(--ca-surface-2)]"
          }`}
        >
          <ImageIcon className="h-4 w-4" />
          <span>Media Library</span>
        </Link>

        <Link
          to={resolvePathByViewAndTab("content_library", "saved_replies")}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
            currentTab === "saved_replies"
              ? "bg-emerald-600 text-white shadow-sm"
              : "text-[var(--ca-text-secondary)] hover:bg-[var(--ca-surface-2)]"
          }`}
        >
          <FileText className="h-4 w-4" />
          <span>Saved Replies</span>
        </Link>

        <Link
          to={resolvePathByViewAndTab("content_library", "sequences")}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
            currentTab === "sequences"
              ? "bg-emerald-600 text-white shadow-sm"
              : "text-[var(--ca-text-secondary)] hover:bg-[var(--ca-surface-2)]"
          }`}
        >
          <Layers className="h-4 w-4" />
          <span>Sequence Groups ({sequences.length})</span>
        </Link>

        <Link
          to={resolvePathByViewAndTab("content_library", "welcome")}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
            currentTab === "welcome"
              ? "bg-emerald-600 text-white shadow-sm"
              : "text-[var(--ca-text-secondary)] hover:bg-[var(--ca-surface-2)]"
          }`}
        >
          <Sparkles className="h-4 w-4" />
          <span>Welcome Sequence</span>
        </Link>
      </div>

      {/* Active Tab Panel Rendering */}
      {currentTab === "media" && (
        <MediaLibrary
          mediaItems={mediaItems}
          mediaGroups={mediaGroups}
          selectedBotId={selectedBotId}
          onSaveGroup={onSaveMediaGroup}
          onToggleGroup={onToggleMediaGroup}
          onRefreshGroup={onRefreshGroup}
          onResetGroup={(gid) => onResetGroup?.(gid, "media")}
          onUnlinkGroup={onUnlinkMediaGroup || onUnlinkGroup}
          formatDate={formatDate}
        />
      )}

      {currentTab === "saved_replies" && (
        <SavedRepliesPanel
          replies={savedReplies}
          selectedBotId={selectedBotId}
          sequences={sequences}
          welcomeConfig={welcomeConfig}
          onSaveReplyShortcut={onSaveReplyShortcut}
          onDeleteReplyShortcut={onDeleteReplyShortcut}
          onSelectTab={(tab) => handleSelectTab(tab)}
          formatDate={formatDate}
        />
      )}

      {currentTab === "sequences" && (
        <SequenceGroupsPanel
          sequences={sequences}
          selectedBotId={selectedBotId}
          sequenceGroupLimit={sequenceGroupLimit}
          onToggleSequence={onToggleSequence}
          onRefreshGroup={onRefreshGroup}
          onResetGroup={(gid) => onResetGroup?.(gid, "sequence")}
          onUnlinkGroup={onUnlinkGroup}
          onSaveSequenceGroup={onSaveSequenceGroup}
          formatDate={formatDate}
        />
      )}

      {currentTab === "welcome" && (
        <WelcomeSequencePanel
          config={welcomeConfig}
          selectedBotId={selectedBotId}
          onToggleWelcome={onToggleWelcome}
          onSaveWelcomeGroup={onSaveWelcomeGroup}
          onRefreshGroup={onRefreshGroup}
          onResetWelcome={() => onResetGroup?.(welcomeConfig.id || welcomeConfig.groupJid || "welcome", "welcome")}
          onResetGroup={(gid) => onResetGroup?.(gid, "welcome")}
          onUnlinkGroup={onUnlinkWelcomeGroup || onUnlinkGroup}
          onDeleteWelcomeSequence={onUnlinkWelcomeGroup || onUnlinkGroup}
          formatDate={formatDate}
        />
      )}
    </div>
  );
};
