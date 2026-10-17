export interface EventEnvelope {
  eventId: string;
  eventType: string;
  accountId?: string;
  botId?: string;
  dataOwnerKey?: string;
  conversationId?: string;
  customerJid?: string;
  timestamp: number;
  payload: unknown;
}

export const EVENT_TYPES = {
  MESSAGE_CREATED: "message.created",
  MESSAGE_UPDATED: "message.updated",
  CONVERSATION_UPDATED: "conversation.updated",
  CONVERSATION_READ: "conversation.read",
  CONVERSATION_UNREAD: "conversation.unread",
  INBOX_UNREAD_COUNT_UPDATED: "inbox.unread_count.updated",
  BOT_STATUS_UPDATED: "bot.status.updated",
  BOT_QR_UPDATED: "bot.qr.updated",
  BOT_ERROR: "bot.error",
  CRM_LEAD_CREATED: "crm.lead.created",
  CRM_LEAD_UPDATED: "crm.lead.updated",
  CRM_FOLLOWUP_CREATED: "crm.followup.created",
  CRM_FOLLOWUP_UPDATED: "crm.followup.updated",
  NOTIFICATION_CREATED: "notification.created",
} as const;
