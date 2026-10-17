import React, { useState, useEffect } from "react";
import {
  ArrowLeft,
  User,
  Radio,
  Pause,
  Play,
  Ban,
  Clock,
  Sparkles,
  ExternalLink,
  AlertCircle,
} from "lucide-react";
import type {
  PersonalConversationSummary,
  PersonalChatMessage,
} from "./hub-types.ts";
import {
  fetchConversationMessages,
  setConversationTakeover,
  setConversationDnc,
} from "./hub-api.ts";
import { formatRelativeTime } from "./hub-utils.ts";

interface PersonalConversationDetailProps {
  conversation: PersonalConversationSummary;
  onBack: () => void;
  onOpenTask?: (taskId: string) => void;
  onOpenContact?: (contactId?: string) => void;
  onStatusChanged?: () => void;
}

export const PersonalConversationDetail: React.FC<PersonalConversationDetailProps> = ({
  conversation,
  onBack,
  onOpenTask,
  onOpenContact,
  onStatusChanged,
}) => {
  const [messages, setMessages] = useState<PersonalChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMessages = async () => {
    setLoading(true);
    setError(null);
    try {
      const msgs = await fetchConversationMessages(conversation.jid);
      setMessages(msgs);
    } catch (err: any) {
      setError(err.message || "Failed to load conversation history.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMessages();
  }, [conversation.jid]);

  const handleToggleTakeover = async () => {
    const nextState = conversation.aiStatus !== "manual_takeover";
    setActionLoading(true);
    setError(null);
    try {
      await setConversationTakeover(conversation.jid, nextState);
      if (onStatusChanged) onStatusChanged();
    } catch (err: any) {
      setError(err.message || "Failed to update takeover state.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleDnc = async () => {
    const nextDnc = conversation.aiStatus !== "do_not_contact";
    setActionLoading(true);
    setError(null);
    try {
      await setConversationDnc(conversation.jid, nextDnc);
      if (onStatusChanged) onStatusChanged();
    } catch (err: any) {
      setError(err.message || "Failed to update Do Not Contact status.");
    } finally {
      setActionLoading(false);
    }
  };

  const isTakeover = conversation.aiStatus === "manual_takeover";
  const isDnc = conversation.aiStatus === "do_not_contact";

  return (
    <div className="space-y-4" data-testid="conversation-detail-container">
      {/* Top Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--ca-border-subtle)] pb-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-semibold text-[var(--ca-text-secondary)] hover:text-[var(--ca-text-primary)] transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Conversations</span>
        </button>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleToggleTakeover}
            disabled={actionLoading}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              isTakeover
                ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                : "border border-[var(--ca-border-subtle)] text-[var(--ca-text-primary)] hover:bg-[var(--ca-bg-card)]"
            }`}
          >
            {isTakeover ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            <span>{isTakeover ? "Resume Assistant" : "Take Over"}</span>
          </button>

          <button
            onClick={handleToggleDnc}
            disabled={actionLoading}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              isDnc
                ? "bg-rose-600 hover:bg-rose-500 text-white"
                : "border border-rose-500/30 text-rose-400 hover:bg-rose-500/10"
            }`}
          >
            <Ban className="w-3.5 h-3.5" />
            <span>{isDnc ? "Remove DNC" : "Do Not Contact"}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Linked Task Banner if present */}
      {conversation.activeTaskId && (
        <div className="p-3.5 rounded-xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-teal-400 shrink-0" />
            <span>
              Active Personal Task: <span className="font-semibold">{conversation.activeTaskGoal || conversation.activeTaskId}</span>
            </span>
          </div>
          {onOpenTask && (
            <button
              onClick={() => onOpenTask(conversation.activeTaskId!)}
              className="flex items-center gap-1 font-semibold text-teal-400 hover:underline shrink-0"
            >
              <span>View Task</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {/* Conversation Header Card */}
      <div className="p-4 rounded-xl bg-[var(--ca-bg-card)] border border-[var(--ca-border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-[var(--ca-text-primary)]">{conversation.contactName}</h2>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
              isDnc
                ? "bg-rose-500/10 text-rose-400"
                : isTakeover
                ? "bg-amber-500/10 text-amber-400"
                : "bg-emerald-500/10 text-emerald-400"
            }`}>
              {conversation.aiStatus.replace(/_/g, " ")}
            </span>
          </div>
          <p className="text-xs text-[var(--ca-text-secondary)] font-mono mt-0.5">
            {conversation.safePhone} • Instance: {conversation.personalInstanceId}
          </p>
        </div>

        <span className="text-[11px] text-[var(--ca-text-muted)]">
          Last active {formatRelativeTime(conversation.lastMessageTimestamp)}
        </span>
      </div>

      {/* Messages Transcript Window */}
      <div className="p-5 rounded-2xl bg-[var(--ca-bg-card)] border border-[var(--ca-border-subtle)] min-h-[380px] max-h-[550px] overflow-y-auto space-y-3">
        {loading ? (
          <div className="p-12 text-center text-[var(--ca-text-secondary)]">
            <div className="animate-spin w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto mb-2" />
            <span className="text-xs">Loading message history...</span>
          </div>
        ) : messages.length === 0 ? (
          <p className="text-xs text-center text-[var(--ca-text-muted)] py-12">
            No recent messages found for this personal contact.
          </p>
        ) : (
          messages.map((msg) => {
            if (msg.sender === "system") {
              return (
                <div key={msg.id} className="text-center my-2">
                  <span className="text-[10px] px-2.5 py-1 rounded-full bg-white/5 text-[var(--ca-text-muted)] font-mono">
                    {msg.text} • {formatRelativeTime(msg.timestamp)}
                  </span>
                </div>
              );
            }

            const isContact = msg.sender === "contact";
            const isAssistant = msg.sender === "assistant";
            const isOwner = msg.sender === "owner_manual";

            return (
              <div
                key={msg.id}
                className={`flex flex-col max-w-[80%] ${
                  isContact ? "self-start items-start" : "self-end items-end ml-auto"
                }`}
              >
                <span className="text-[10px] text-[var(--ca-text-muted)] mb-0.5 font-semibold">
                  {isContact ? conversation.contactName : isAssistant ? "Personal Assistant" : "You (Manual)"}
                </span>
                <div
                  className={`p-3 rounded-2xl text-xs leading-relaxed ${
                    isContact
                      ? "bg-white/10 text-[var(--ca-text-primary)] rounded-tl-sm"
                      : isAssistant
                      ? "bg-emerald-600/90 text-white rounded-tr-sm"
                      : "bg-indigo-600/90 text-white rounded-tr-sm"
                  }`}
                >
                  {msg.text}
                </div>
                <span className="text-[9px] text-[var(--ca-text-muted)] mt-0.5 font-mono">
                  {formatRelativeTime(msg.timestamp)}
                </span>
              </div>
            );
          })
        )}
      </div>

      <p className="text-[11px] text-[var(--ca-text-muted)] text-center">
        💡 Manual messages from you are sent from your WhatsApp phone. The dashboard provides observation and AI control.
      </p>
    </div>
  );
};
