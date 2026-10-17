import React, { useState, useEffect } from "react";
import {
  Search,
  MessageSquare,
  Radio,
  User,
  AlertCircle,
  Pause,
  Ban,
  Sparkles,
} from "lucide-react";
import type { PersonalConversationSummary } from "./hub-types.ts";
import { fetchHubConversations } from "./hub-api.ts";
import { formatRelativeTime } from "./hub-utils.ts";

interface PersonalConversationsViewProps {
  onSelectConversation: (conv: PersonalConversationSummary) => void;
  selectedInstanceId?: string;
}

export const PersonalConversationsView: React.FC<PersonalConversationsViewProps> = ({
  onSelectConversation,
  selectedInstanceId,
}) => {
  const [conversations, setConversations] = useState<PersonalConversationSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "paused" | "manual_takeover" | "do_not_contact">("all");
  const [error, setError] = useState<string | null>(null);

  const loadConversations = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchHubConversations({
        personalInstanceId: selectedInstanceId,
        status: statusFilter,
        search: searchTerm.trim() || undefined,
      });
      setConversations(list);
    } catch (err: any) {
      setError(err.message || "Failed to load personal conversations.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConversations();
  }, [statusFilter, selectedInstanceId]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadConversations();
  };

  return (
    <div className="space-y-4" data-testid="conversations-view-container">
      {/* Notice on Personal-Only domain */}
      <div className="p-3.5 rounded-xl bg-black/20 border border-[var(--ca-border-subtle)] text-xs text-[var(--ca-text-secondary)] flex items-center justify-between gap-3">
        <span>
          Showing personal WhatsApp contacts and threads. Business customer inquiries are managed separately.
        </span>
        <span className="font-mono text-[10px] text-[var(--ca-text-muted)] shrink-0">
          Personal Domain
        </span>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <form onSubmit={handleSearch} className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-[var(--ca-text-muted)]" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search conversations by name or phone..."
            className="w-full pl-9 pr-3 py-2 rounded-xl text-xs bg-[var(--ca-bg-card)] border border-[var(--ca-border-subtle)] text-[var(--ca-text-primary)] focus:outline-none focus:border-emerald-500"
          />
        </form>

        <div className="flex items-center gap-1.5 overflow-x-auto">
          {(["all", "active", "paused", "manual_takeover", "do_not_contact"] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition capitalize ${
                statusFilter === st
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                  : "text-[var(--ca-text-secondary)] hover:text-[var(--ca-text-primary)] hover:bg-[var(--ca-bg-card)]"
              }`}
            >
              {st.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Conversation List */}
      {loading ? (
        <div className="p-12 text-center text-[var(--ca-text-secondary)]">
          <div className="animate-spin w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto mb-2" />
          <span className="text-xs">Loading conversations...</span>
        </div>
      ) : conversations.length === 0 ? (
        <div className="p-8 text-center rounded-2xl bg-[var(--ca-bg-card)] border border-[var(--ca-border-subtle)]">
          <p className="text-xs text-[var(--ca-text-secondary)]">No personal conversations found.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {conversations.map((conv) => {
            const isTakeover = conv.aiStatus === "manual_takeover";
            const isDnc = conv.aiStatus === "do_not_contact";

            return (
              <div
                key={conv.jid}
                onClick={() => onSelectConversation(conv)}
                data-testid={`conversation-row-${conv.jid}`}
                className="p-3.5 rounded-xl bg-[var(--ca-bg-card)] border border-[var(--ca-border-subtle)] hover:border-emerald-500/40 cursor-pointer transition flex items-center justify-between gap-3"
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="w-9 h-9 rounded-full bg-white/10 text-[var(--ca-text-primary)] font-bold text-xs flex items-center justify-center shrink-0">
                    {conv.contactName.charAt(0).toUpperCase() || "?"}
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[var(--ca-text-primary)] truncate">
                        {conv.contactName}
                      </span>
                      <span className="text-[11px] font-mono text-[var(--ca-text-muted)]">
                        {conv.safePhone}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-semibold uppercase ${
                        isDnc
                          ? "bg-rose-500/10 text-rose-400"
                          : isTakeover
                          ? "bg-amber-500/10 text-amber-400"
                          : "bg-emerald-500/10 text-emerald-400"
                      }`}>
                        {conv.aiStatus.replace(/_/g, " ")}
                      </span>
                    </div>

                    <p className="text-xs text-[var(--ca-text-secondary)] truncate">
                      {conv.lastMessage || "No messages yet"}
                    </p>

                    <div className="flex items-center gap-3 text-[10px] text-[var(--ca-text-muted)]">
                      <span>Instance: {conv.personalInstanceId}</span>
                      {conv.activeTaskId && (
                        <span className="text-teal-400 font-medium flex items-center gap-1">
                          <Sparkles className="w-3 h-3" />
                          Task: {conv.activeTaskGoal || conv.activeTaskId}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <span className="text-[10px] text-[var(--ca-text-muted)] shrink-0 font-mono self-start sm:self-center">
                  {formatRelativeTime(conv.lastMessageTimestamp)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
