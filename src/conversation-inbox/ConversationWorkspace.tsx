import React from "react";
import { ConversationHeader } from "./ConversationHeader";
import { MessageTimeline } from "./MessageTimeline";
import { MessageComposer } from "./MessageComposer";
import type { ConversationItem, MessageItem } from "./conversation-model";
import { DashboardEmptyState } from "../components/dashboard/DashboardPrimitives";
import { MessageSquare } from "lucide-react";

export interface ConversationWorkspaceProps {
  selectedConversation?: ConversationItem | null;
  messages: MessageItem[];
  isLoadingMessages?: boolean;
  onSendMessage: (text: string) => Promise<void> | void;
  onSetAiControl?: (action: "resume" | "pause_temp" | "pause_permanent") => Promise<void> | void;
  onToggleCustomer360?: () => void;
  is360Open?: boolean;
  formatTimestamp?: (ts?: number | string) => string;
}

export const ConversationWorkspace: React.FC<ConversationWorkspaceProps> = ({
  selectedConversation,
  messages,
  isLoadingMessages = false,
  onSendMessage,
  onSetAiControl,
  onToggleCustomer360,
  is360Open = false,
  formatTimestamp,
}) => {
  if (!selectedConversation) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-1)] rounded-2xl">
        <DashboardEmptyState
          icon={MessageSquare}
          title="Select a Conversation"
          body="Choose a customer from the left list to view their message history, customer details, and live AI controls."
          tone="neutral"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-1)] shadow-sm">
      <ConversationHeader
        conversation={selectedConversation}
        onToggleCustomer360={onToggleCustomer360}
        is360Open={is360Open}
      />

      <MessageTimeline
        messages={messages}
        isLoading={isLoadingMessages}
        formatTimestamp={formatTimestamp}
      />

      <MessageComposer
        onSendMessage={onSendMessage}
        isAiPaused={selectedConversation.isAiPaused}
        botReplyControl={selectedConversation.botReplyControl}
        onSetAiControl={onSetAiControl}
      />
    </div>
  );
};
