export type ConversationFilterType = "all" | "unread" | "ai_active" | "human" | "paused" | "orders";

export interface ConversationItem {
  id: string;
  customerName: string;
  phone: string;
  displayPhone: string;
  lastMessagePreview: string;
  lastMessageTimestamp?: number | string;
  unreadCount: number;
  isAiPaused: boolean;
  isHumanTakeover: boolean;
  botReplyControl: "active" | "paused_temp" | "paused_permanent";
  customerStatus: string;
  recordStatus?: string;
  orderCount?: number;
  avatarUrl?: string;
  rawCustomer?: any;
}

export interface MessageItem {
  id: string;
  sender: "customer" | "bot" | "user" | "system";
  senderName: string;
  text: string;
  timestamp?: number | string;
  mediaType?: "image" | "video" | "audio" | "document" | "sticker" | "text";
  mediaUrl?: string;
  fileName?: string;
  fileSize?: string;
  status?: "sending" | "sent" | "delivered" | "read" | "failed";
  error?: string;
}

export function normalizeConversationItem(customer: any): ConversationItem {
  const profile = typeof customer?.profile === "object" ? customer.profile : {};
  const customerId = customer?.$id || customer?.id || customer?.customer_id || "cust_unknown";
  const name = customer?.name || profile?.customerName || profile?.name || "Customer " + customerId.slice(-4);
  const phone = customer?.phone || profile?.customerPhone || customer?.customer_id?.replace(/@.*$/, "") || "";
  const displayPhone = phone ? (phone.startsWith("+") ? phone : `+${phone}`) : "No phone linked";

  const isAiPaused = Boolean(
    profile?.aiPaused ||
    profile?.ai_paused ||
    profile?.botReplyControl === "paused_temp" ||
    profile?.botReplyControl === "paused_permanent"
  );
  const isHumanTakeover = Boolean(profile?.manualReviewRequired || profile?.manual_review || profile?.customerStatus === "manual_review");
  const botReplyControl = profile?.botReplyControl || (isAiPaused ? "paused_temp" : "active");

  const lastPreview = customer?.last_message || profile?.lastMessagePreview || profile?.lastMessage || "No messages yet";
  const lastTs = customer?.updated_at || customer?.$updatedAt || profile?.lastInteractionAt || undefined;
  const unreadCount = Number(customer?.unreadCount || profile?.unreadCount || 0);

  return {
    id: customerId,
    customerName: name,
    phone,
    displayPhone,
    lastMessagePreview: lastPreview,
    lastMessageTimestamp: lastTs,
    unreadCount,
    isAiPaused,
    isHumanTakeover,
    botReplyControl,
    customerStatus: isHumanTakeover ? "Manual review" : isAiPaused ? "Paused" : "Active",
    recordStatus: profile?.latestOrder?.recordStatus || undefined,
    orderCount: Array.isArray(profile?.orders) ? profile.orders.length : undefined,
    rawCustomer: customer,
  };
}

export function filterConversations(
  conversations: ConversationItem[],
  filter: ConversationFilterType,
  searchQuery: string,
): ConversationItem[] {
  const query = searchQuery.trim().toLowerCase();

  return conversations.filter((item) => {
    // Search query filter
    if (query) {
      const matchName = item.customerName.toLowerCase().includes(query);
      const matchPhone = item.phone.includes(query) || item.displayPhone.includes(query);
      const matchMsg = item.lastMessagePreview.toLowerCase().includes(query);
      if (!matchName && !matchPhone && !matchMsg) return false;
    }

    // Tab filter
    if (filter === "unread") return item.unreadCount > 0;
    if (filter === "ai_active") return !item.isAiPaused && !item.isHumanTakeover;
    if (filter === "human") return item.isHumanTakeover;
    if (filter === "paused") return item.isAiPaused;
    if (filter === "orders") return Boolean(item.orderCount && item.orderCount > 0);

    return true;
  });
}
