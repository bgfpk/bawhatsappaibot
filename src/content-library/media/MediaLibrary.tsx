import React, { useState, useMemo } from "react";
import { Search, Image as ImageIcon, Video, FileText, File, Smile, Eye, Volume2 } from "lucide-react";
import { DashboardEmptyState, ToneBadge } from "../../components/dashboard/DashboardPrimitives";
import { filterMediaItems, type MediaLibraryItem, type MediaGroupItem } from "../content-library-model";
import { MediaPreviewModal } from "./MediaPreviewModal";
import { MediaGroupsPanel } from "./MediaGroupsPanel";

export interface MediaLibraryProps {
  mediaItems: MediaLibraryItem[];
  mediaGroups: MediaGroupItem[];
  selectedBotId?: string;
  mediaGroupLimit?: number;
  onSaveGroup?: (data: any) => Promise<void> | void;
  onToggleGroup?: (groupId: string, enabled: boolean) => Promise<void> | void;
  onRefreshGroup?: (groupId: string) => Promise<void> | void;
  onResetGroup?: (groupId: string) => Promise<void> | void;
  onUnlinkGroup?: (groupId: string) => Promise<void> | void;
  formatDate?: (ts?: number | string) => string;
}

export const MediaLibrary: React.FC<MediaLibraryProps> = ({
  mediaItems = [],
  mediaGroups = [],
  selectedBotId,
  mediaGroupLimit,
  onSaveGroup,
  onToggleGroup,
  onRefreshGroup,
  onResetGroup,
  onUnlinkGroup,
  formatDate = (ts) => {
    if (!ts) return "";
    const num = typeof ts === "number" ? ts : Number(ts);
    if (!isNaN(num) && num > 0) {
      const ms = num < 10000000000 ? num * 1000 : num;
      return new Date(ms).toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
    }
    return String(ts);
  },
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [previewItem, setPreviewItem] = useState<MediaLibraryItem | null>(null);

  const filtered = useMemo(() => {
    return filterMediaItems(mediaItems, searchQuery, typeFilter);
  }, [mediaItems, searchQuery, typeFilter]);

  const renderIcon = (type: string) => {
    switch (type) {
      case "image":
        return <ImageIcon className="h-4 w-4 text-emerald-500" />;
      case "video":
        return <Video className="h-4 w-4 text-purple-500" />;
      case "document":
        return <FileText className="h-4 w-4 text-blue-500" />;
      case "audio":
        return <Volume2 className="h-4 w-4 text-indigo-500" />;
      case "sticker":
        return <Smile className="h-4 w-4 text-amber-500" />;
      default:
        return <File className="h-4 w-4 text-slate-500" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* WhatsApp Media Groups Section */}
      <MediaGroupsPanel
        groups={mediaGroups}
        selectedBotId={selectedBotId}
        mediaGroupLimit={mediaGroupLimit}
        onSaveGroup={onSaveGroup}
        onToggleGroup={onToggleGroup}
        onRefreshGroup={onRefreshGroup}
        onResetGroup={onResetGroup}
        onUnlinkGroup={onUnlinkGroup}
        formatDate={formatDate}
      />

      {/* Media Library Items Filter & Grid */}
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-bold text-[var(--ca-text-primary)]">
            Captured Media Templates ({filtered.length})
          </h3>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ca-text-muted)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search captured media..."
                className="w-full rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] pl-9 pr-3 py-1.5 text-xs text-[var(--ca-text-primary)] outline-none focus:border-emerald-500"
              />
            </div>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] px-3 py-1.5 text-xs font-bold text-[var(--ca-text-primary)] outline-none focus:border-emerald-500"
            >
              <option value="all">All Media Types</option>
              <option value="image">Images</option>
              <option value="video">Videos</option>
              <option value="document">Documents</option>
              <option value="audio">Audios</option>
              <option value="sticker">Stickers</option>
              <option value="text">Text Templates</option>
            </select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <DashboardEmptyState
            icon={ImageIcon}
            title={mediaItems.length === 0 && !searchQuery.trim() ? "No media templates captured yet." : "No Media Templates Found"}
            body={mediaItems.length === 0 && !searchQuery.trim() ? "Send media to the linked WhatsApp group to start a fresh library." : "No captured media items match your search filter."}
            tone="neutral"
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {filtered.map((item) => (
              <div
                key={item.id}
                onClick={() => setPreviewItem(item)}
                className="group flex flex-col justify-between rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-1)] p-3.5 shadow-sm hover:border-emerald-500 cursor-pointer transition-all"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      {renderIcon(item.type)}
                      <span className="font-bold text-[10px] uppercase text-[var(--ca-text-muted)] tracking-wider">
                        {item.type}
                      </span>
                    </div>
                    <ToneBadge tone={item.status === "ready" ? "teal" : item.status === "processing" ? "amber" : "rose"}>
                      {item.status}
                    </ToneBadge>
                  </div>

                  {/* Title / Name */}
                  {item.name && (
                    <p className="font-bold text-xs text-[var(--ca-text-primary)] leading-snug break-words">
                      {item.name}
                    </p>
                  )}

                  {/* Full WhatsApp caption without line-clamp or truncation */}
                  {item.caption && (
                    <p className="text-[11px] text-[var(--ca-text-secondary)] whitespace-pre-wrap break-words leading-relaxed font-normal">
                      {item.caption}
                    </p>
                  )}

                  {item.sourceGroupName && (
                    <p className="text-[10px] text-[var(--ca-text-muted)] truncate">
                      From: {item.sourceGroupName}
                    </p>
                  )}
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-[var(--ca-border-subtle)] pt-2 text-[10px] text-[var(--ca-text-muted)]">
                  <span>{item.capturedAt ? formatDate(item.capturedAt) : "Ready"}</span>
                  <span className="inline-flex items-center gap-1 font-bold text-emerald-600 group-hover:underline">
                    <Eye className="h-3 w-3" /> Preview
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <MediaPreviewModal
        item={previewItem}
        isOpen={Boolean(previewItem)}
        onClose={() => setPreviewItem(null)}
        selectedBotId={selectedBotId}
        formatDate={formatDate}
      />
    </div>
  );
};
