import React, { useState, useMemo } from "react";
import { InboxHeader } from "./InboxHeader";
import { ConversationSearch } from "./ConversationSearch";
import { ConversationFilters } from "./ConversationFilters";
import { ConversationList } from "./ConversationList";
import { ConversationWorkspace } from "./ConversationWorkspace";
import { Customer360Panel } from "../components/dashboard/pages/Customer360Panel";
import {
  filterConversations,
  normalizeConversationItem,
  type ConversationFilterType,
  type ConversationItem,
  type MessageItem,
} from "./conversation-model";

export interface ConversationInboxPageProps {
  customers: any[];
  messages: MessageItem[];
  selectedCustomerId?: string | null;
  activeBotName?: string;
  userId?: string;
  isLoading?: boolean;
  onSelectCustomer: (id: string) => void;
  onSendMessage: (text: string) => Promise<void> | void;
  onSetAiControl?: (customerId: string, action: "resume" | "pause_temp" | "pause_permanent") => Promise<void> | void;
  onCustomerSaved?: (customer: any, profile: any) => void;
  onOpenSelector?: () => void;
  formatTimestamp?: (ts?: number | string) => string;
}

export const ConversationInboxPage: React.FC<ConversationInboxPageProps> = ({
  customers = [],
  messages = [],
  selectedCustomerId = null,
  activeBotName = "WhatsApp Instance",
  userId = "",
  isLoading = false,
  onSelectCustomer,
  onSendMessage,
  onSetAiControl,
  onCustomerSaved = () => {},
  onOpenSelector,
  formatTimestamp,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<ConversationFilterType>("all");
  const [is360Open, setIs360Open] = useState(false);

  // Normalize customers into conversation items
  const conversationItems = useMemo<ConversationItem[]>(() => {
    return (customers || []).map(normalizeConversationItem);
  }, [customers]);

  // Counts for filters
  const counts = useMemo(() => {
    return {
      all: conversationItems.length,
      unread: conversationItems.filter((c) => c.unreadCount > 0).length,
      ai_active: conversationItems.filter((c) => !c.isAiPaused && !c.isHumanTakeover).length,
      human: conversationItems.filter((c) => c.isHumanTakeover).length,
      paused: conversationItems.filter((c) => c.isAiPaused).length,
      orders: conversationItems.filter((c) => Boolean(c.orderCount && c.orderCount > 0)).length,
    };
  }, [conversationItems]);

  const filteredItems = useMemo(() => {
    return filterConversations(conversationItems, activeFilter, searchQuery);
  }, [conversationItems, activeFilter, searchQuery]);

  const selectedConversation = useMemo(() => {
    if (!selectedCustomerId) return null;
    return conversationItems.find((c) => c.id === selectedCustomerId) || null;
  }, [conversationItems, selectedCustomerId]);

  const selectedRawCustomer = selectedConversation?.rawCustomer || null;

  return (
    <div className="flex flex-col gap-5">
      <InboxHeader
        totalCount={counts.all}
        unreadTotal={counts.unread}
        activeBotName={activeBotName}
        onOpenSelector={onOpenSelector}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Left Column: Conversation List (4 cols on lg) */}
        <div className="lg:col-span-4 flex flex-col gap-3 rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-1)] p-4 shadow-sm">
          <ConversationSearch
            value={searchQuery}
            onChange={setSearchQuery}
          />

          <ConversationFilters
            activeFilter={activeFilter}
            onSelectFilter={setActiveFilter}
            counts={counts}
          />

          <ConversationList
            conversations={filteredItems}
            selectedId={selectedCustomerId}
            onSelect={onSelectCustomer}
            isLoading={isLoading}
          />
        </div>

        {/* Right Column: Conversation Workspace (8 cols on lg) */}
        <div className="lg:col-span-8 flex min-h-[500px]">
          <ConversationWorkspace
            selectedConversation={selectedConversation}
            messages={messages}
            isLoadingMessages={isLoading}
            onSendMessage={onSendMessage}
            onSetAiControl={
              selectedCustomerId && onSetAiControl
                ? (action) => onSetAiControl(selectedCustomerId, action)
                : undefined
            }
            onToggleCustomer360={() => setIs360Open((prev) => !prev)}
            is360Open={is360Open}
            formatTimestamp={formatTimestamp}
          />
        </div>
      </div>

      {/* Customer 360 Drawer / Panel */}
      {selectedRawCustomer && (
        <Customer360Panel
          customer={selectedRawCustomer}
          userId={userId}
          isOpen={is360Open}
          onClose={() => setIs360Open(false)}
          onSaved={onCustomerSaved}
          formatDate={(ts, incTime) => (formatTimestamp ? formatTimestamp(ts) : String(ts || ""))}
        />
      )}
    </div>
  );
};
