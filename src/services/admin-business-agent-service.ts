import {
  getAdminAction,
  listAdminActions,
  canExecuteAdminBusinessAction,
  type AdminActionDefinition,
  type AdminActionResult,
} from "./admin-action-registry-service.ts";
import type { AdminBusinessAssistantContext } from "./admin-identity-service.ts";
import { generateBackendText, type DeepInfraToolDefinition, type DeepInfraParsedToolCall } from "./ai-text-provider-service.ts";
import { getAdminBusinessAgentModel } from "./deepinfra-text-provider-service.ts";
import { isInstanceLiveConnected } from "./admin-business-read-service.ts";
import { handleCreateProduct } from "./admin-business-write-service.ts";
import { recordAdminAuditEvent } from "./admin-audit-service.ts";
import { BILLING_PLAN_DETAILS } from "../config/pricing.ts";
import * as dbService from "./db-service.ts";

export interface PendingOfferedAction {
  actionId: string;
  params?: Record<string, any>;
  description: string;
  createdAt: number;
  expiresAt: number;
}

export interface PendingSlotCollection {
  actionId: string;
  missingSlots: string[];
  collectedParams: Record<string, any>;
  description: string;
  createdAt: number;
  expiresAt: number;
}

import "./google-personal-admin-tools.ts";
import "./personal-outbound-admin-tools.ts";
import "./personal-contact-admin-ba-tools.ts";
import {
  getActiveConversationGoal,
  saveConversationGoal,
  clearConversationGoal,
  createConversationGoal,
  updateGoalWithToolResult,
  resolveSemanticReferent,
  incorporateUserResponseIntoGoal,
  suspendAndReplaceActiveGoal,
  resumeSuspendedGoal,
  completeConversationGoal,
  type ConversationGoal,
  type GoalStatus,
} from "./conversation-goal-manager.ts";

export interface ActiveContactReferent {
  contactId?: string;
  displayName: string;
  canonicalPhone?: string;
  jid?: string;
  isDirectNumber?: boolean;
}

export interface PendingMeetingState {
  recipient?: ActiveContactReferent;
  timeExpression?: string;
  durationMinutes?: number;
  purpose?: string;
  requiresClarification?: "recipient" | "time" | "duration" | "calendar_auth";
}

export interface PendingPersonalMessageState {
  target?: string;
  recipientPhone?: string;
  recipientName?: string;
  goal?: string;
  requiresClarification?: "message" | "recipient";
}

export interface AdminConversationMemory {
  accountId: string;
  adminJid: string;
  lastTopic?: "billing" | "business" | "account" | "orders" | "products" | "customers" | "courier" | "ai_studio" | "integrations" | "followups" | "broadcasts" | "meeting" | "personal_assistant" | "help" | "general";
  lastActionId?: string;
  lastResourceType?: "order" | "customer" | "product" | "bot" | "billing" | "campaign" | "calendar" | "contact" | "general";
  lastResourceId?: string;
  lastDateRange?: string;
  lastPeriod?: string;
  lastQuery?: string;
  lastSummary?: string;
  lastRawResult?: any;
  activeContact?: ActiveContactReferent;
  activePhone?: string;
  activePersonName?: string;
  activeEntity?: string;
  activeCustomer?: any;
  activeOrder?: any;
  activeLead?: any;
  activeGoal?: ConversationGoal;
  pendingMeeting?: PendingMeetingState;
  pendingPersonalMessage?: PendingPersonalMessageState;
  pendingTask?: Record<string, any>;
  pendingOfferedAction?: PendingOfferedAction;
  pendingSlotCollection?: PendingSlotCollection;
  updatedAt: number;
}

export type AdminAgentIntentMode = "tool" | "conversation" | "clarify" | "help" | "multi_write_preview";

export interface AdminAgentResolvedIntent {
  mode: AdminAgentIntentMode;
  actionId?: string;
  action?: AdminActionDefinition;
  params?: Record<string, any>;
  reply?: string;
  clarifyQuestion?: string;
  reasoning?: string;
  isWriteAction?: boolean;
  writeActionReason?: string;
  offeredAction?: {
    actionId: string;
    params?: Record<string, any>;
    description: string;
  };
  previewSummary?: string;
  pendingBatchActions?: Array<{ actionId: string; params: any }>;
  routingTelemetry?: {
    domain?: string;
    secondaryDomain?: string;
    plannerSource?: "native_tool_call" | "repair_json_schema" | "semantic_rule" | "conversation" | "clarify";
    toolCallId?: string;
    toolName?: string;
    validation?: "accepted" | "rejected" | "unauthorized" | "not_found";
    fallbackReason?: string;
    modelUsed?: string;
  };
}

export interface AdminAgentExecutionResult {
  handled: boolean;
  replyText: string;
  mode: AdminAgentIntentMode;
  actionExecuted?: string;
  requiresConfirmation?: boolean;
  confirmationPreviewText?: string;
  pendingParams?: any;
  error?: string;
  data?: any;
  isWriteDenied?: boolean;
  writeDeniedReason?: string;
}

// ---------------------------------------------------------------------------
// 1. BOUNDED IN-MEMORY CONVERSATION CONTEXT (10 MIN TTL)
// ---------------------------------------------------------------------------
const MEMORY_TTL_MS = 10 * 60 * 1000;
const CONVERSATION_MEMORY = new Map<string, AdminConversationMemory>();

function getMemoryKey(accountId: string, adminJid: string): string {
  return `${String(accountId || "").trim()}:${String(adminJid || "").trim().toLowerCase()}`;
}

export function getAdminConversationContext(accountId: string, adminJid: string): AdminConversationMemory | undefined {
  const key = getMemoryKey(accountId, adminJid);
  const mem = CONVERSATION_MEMORY.get(key);
  if (!mem) return undefined;
  if (Date.now() - mem.updatedAt > MEMORY_TTL_MS) {
    CONVERSATION_MEMORY.delete(key);
    return undefined;
  }
  return mem;
}

export function saveAdminConversationContext(memory: Partial<AdminConversationMemory> & { accountId: string; adminJid: string }): void {
  const key = getMemoryKey(memory.accountId, memory.adminJid);
  const existing = getAdminConversationContext(memory.accountId, memory.adminJid) || {
    accountId: memory.accountId,
    adminJid: memory.adminJid,
    updatedAt: Date.now(),
  };

  const updated: AdminConversationMemory = {
    ...existing,
    ...memory,
    updatedAt: Date.now(),
  };
  CONVERSATION_MEMORY.set(key, updated);
}

export function clearAdminConversationContext(accountId: string, adminJid: string): void {
  CONVERSATION_MEMORY.delete(getMemoryKey(accountId, adminJid));
}

// ---------------------------------------------------------------------------
// 2. DEPENDENCY INJECTION FOR UNIT & INTEGRATION TESTING
// ---------------------------------------------------------------------------
export const agentDeps = {
  generateBackendText,
  isInstanceLiveConnected,
  getAdminBusinessAgentModel,
  executeAdminAction: undefined as ((actionId: string, params?: any, context?: any) => Promise<any>) | undefined,
};

export function __setAdminBusinessAgentTestDeps(overrides: Partial<typeof agentDeps>) {
  Object.assign(agentDeps, overrides || {});
}

export function __resetAdminBusinessAgentTestDeps() {
  Object.assign(agentDeps, {
    generateBackendText,
    isInstanceLiveConnected,
    getAdminBusinessAgentModel,
    executeAdminAction: undefined,
  });
}

// ---------------------------------------------------------------------------
// 3. TEXT UTILITIES & PARSERS
// ---------------------------------------------------------------------------

export function cleanPunctuation(text: string): string {
  return String(text || "")
    .replace(/[?!,;'"()[\]{}#$^*~_+=/\\|<>`]/g, " ")
    .replace(/\.+$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function isAffirmative(text: string): boolean {
  const clean = cleanPunctuation(text);
  return (
    clean === "yes" ||
    clean === "y" ||
    clean === "haan" ||
    clean === "han" ||
    clean === "ji" ||
    clean === "ji haan" ||
    clean === "sure" ||
    clean === "ok" ||
    clean === "okay" ||
    clean === "kar do" ||
    clean === "karo" ||
    clean === "yes please" ||
    clean === "yep" ||
    clean === "check it" ||
    clean === "please do" ||
    clean === "proceed"
  );
}

export function isCancellation(text: string): boolean {
  const clean = cleanPunctuation(text);
  return (
    clean === "no" ||
    clean === "n" ||
    clean === "nahi" ||
    clean === "cancel" ||
    clean === "mat karo" ||
    clean === "rehne do" ||
    clean === "nope" ||
    clean === "stop"
  );
}

// ---------------------------------------------------------------------------
// 4. ACTION DOMAINS & FOCUSED TOOL DEFINITIONS
// ---------------------------------------------------------------------------

export type AdminActionDomain =
  | "billing"
  | "business"
  | "account"
  | "orders"
  | "products"
  | "customers"
  | "courier"
  | "followups"
  | "broadcasts"
  | "customer_updates"
  | "ai_studio"
  | "integrations"
  | "live_monitor"
  | "reports"
  | "team"
  | "security"
  | "operations"
  | "general";

const DOMAIN_CATEGORY_MAP: Record<AdminActionDomain, string[]> = {
  billing: ["account", "billing"],
  business: ["business", "reports", "account", "analytics", "customers", "lead_routing"],
  account: ["account", "security", "team", "owner_profile", "personal_contacts", "personal_assistant"],
  orders: ["orders", "courier"],
  products: ["products", "business"],
  customers: ["customers", "reports", "analytics", "business", "personal_contacts", "personal_assistant"],
  courier: ["courier", "orders"],
  followups: ["followups", "ai_studio"],
  broadcasts: ["broadcasts", "customer_updates"],
  customer_updates: ["customer_updates", "broadcasts"],
  ai_studio: ["ai_studio", "live_monitor"],
  integrations: ["integrations"],
  live_monitor: ["live_monitor", "security"],
  reports: ["reports", "business", "analytics", "customers"],
  team: ["team", "security"],
  security: ["security", "account"],
  operations: ["operations", "business", "account", "owner_profile", "personal_contacts", "personal_assistant", "lead_routing"],
  general: ["business", "account", "orders", "products", "operations", "customers", "analytics", "owner_profile", "personal_contacts", "personal_assistant", "lead_routing"],
};

/**
 * Builds compact, authoritative parameter schema for native tool calling.
 */
function getActionToolSchema(actionId: string): Record<string, any> {
  if (actionId === "get_usage_summary" || actionId === "get_business_metrics") {
    return {
      type: "object",
      properties: {
        range: {
          type: "string",
          description: "Named period or relative range (e.g. 'today', 'yesterday', 'this_week', 'last_week', 'last_3_days', 'last_5_days', 'last_7_days', 'last_10_days', 'last_14_days', 'this_month', 'last_month', 'last_30_days').",
        },
        days: {
          type: "number",
          description: "Number of recent calendar days (e.g. 2, 3, 5, 7, 10, 14, 30).",
        },
        startDate: {
          type: "string",
          description: "Start date in YYYY-MM-DD format for explicit date range.",
        },
        endDate: {
          type: "string",
          description: "End date in YYYY-MM-DD format for explicit date range.",
        },
      },
      additionalProperties: false,
    };
  }

  if (actionId === "get_business_counts_summary") {
    return {
      type: "object",
      properties: {},
      additionalProperties: false,
    };
  }

  if (actionId === "get_customer_activity_summary") {
    return {
      type: "object",
      properties: {
        range: {
          type: "string",
          description: "Named period or relative range (e.g. 'today', 'yesterday', 'this_week', 'last_week', 'last_7_days', 'this_month', 'last_30_days').",
        },
        days: {
          type: "number",
          description: "Number of recent calendar days (e.g. 7, 14, 30).",
        },
        startDate: {
          type: "string",
          description: "Start date in YYYY-MM-DD format for explicit date range.",
        },
        endDate: {
          type: "string",
          description: "End date in YYYY-MM-DD format for explicit date range.",
        },
      },
      additionalProperties: false,
    };
  }

  if (actionId === "create_admin_reminder") {
    return {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "The reminder task or note text (e.g. 'Do mobile package', 'Call supplier').",
        },
        scheduledAt: {
          type: "string",
          description: "Scheduled reminder time (e.g. 'today 4PM', 'tomorrow 10am', 'in 2 hours', '2026-08-27T16:00:00Z').",
        },
      },
      required: ["text", "scheduledAt"],
      additionalProperties: false,
    };
  }

  if (actionId === "list_admin_reminders") {
    return {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["pending", "sent", "cancelled", "all"],
          description: "Filter reminders by status (default: 'pending').",
        },
      },
      additionalProperties: false,
    };
  }

  if (actionId === "cancel_admin_reminder") {
    return {
      type: "object",
      properties: {
        reminderId: {
          type: "string",
          description: "Reminder ID to cancel.",
        },
        query: {
          type: "string",
          description: "Search keyword matching reminder text to cancel.",
        },
      },
      additionalProperties: false,
    };
  }

  if (actionId === "get_business_overview" || actionId === "get_today_business_summary") {
    return {
      type: "object",
      properties: {
        range: {
          type: "string",
          enum: ["today"],
          description: "Daily operational overview.",
        },
      },
      additionalProperties: false,
    };
  }

  if (actionId === "list_recent_orders" || actionId === "get_recent_orders") {
    return {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Maximum number of recent orders to return (1-20).",
        },
      },
      additionalProperties: false,
    };
  }

  if (actionId === "search_orders" || actionId === "search_products" || actionId === "search_customers") {
    return {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search keyword, order ID, product name, or customer name/phone.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    };
  }

  if (actionId === "update_product_type") {
    return {
      type: "object",
      properties: {
        productName: { type: "string", description: "Product name or 'all' for all products in catalog." },
        productId: { type: "string", description: "Specific product ID if known." },
        type: { type: "string", enum: ["physical", "service", "digital"], description: "Target product type (e.g. 'service', 'physical')." },
        fromType: { type: "string", description: "Optional filter for source type (e.g. 'physical')." },
        bulk: { type: "boolean", description: "Set to true when converting multiple or all items in catalog." },
      },
      required: ["type"],
      additionalProperties: false,
    };
  }

  if (actionId === "create_product") {
    return {
      type: "object",
      properties: {
        name: { type: "string", description: "Product or service name." },
        base_price: { type: "number", description: "Price in PKR/USD." },
        description: { type: "string", description: "Product/service description." },
        stock: { type: "number", description: "Stock quantity (default: 999 for services)." },
        type: { type: "string", enum: ["physical", "service", "digital"], description: "Type of item ('service' for subscription plans, consulting, or services)." },
        category: { type: "string", description: "Category name (e.g. 'Services', 'Software', 'Clothing')." },
      },
      required: ["name", "base_price"],
      additionalProperties: false,
    };
  }

  if (actionId === "update_product_price") {
    return {
      type: "object",
      properties: {
        productName: { type: "string", description: "Name or SKU of product." },
        newPrice: { type: "number", description: "New price in currency units." },
      },
      required: ["productName", "newPrice"],
      additionalProperties: false,
    };
  }

  if (actionId === "update_product_stock") {
    return {
      type: "object",
      properties: {
        productName: { type: "string", description: "Name or SKU of product." },
        amount: { type: "number", description: "New stock level or adjustment quantity." },
        mode: { type: "string", enum: ["set", "adjust"], description: "'set' for exact quantity, 'adjust' to increment/decrement." },
      },
      required: ["productName", "amount"],
      additionalProperties: false,
    };
  }

  if (actionId === "pause_bot") {
    return {
      type: "object",
      properties: {
        hours: { type: "number", description: "Hours to pause (1-720). Leave empty for permanent manual pause." },
        mode: { type: "string", enum: ["temporary", "permanent"], description: "Pause mode." },
      },
      additionalProperties: false,
    };
  }

  if (actionId === "book_courier_shipment") {
    return {
      type: "object",
      properties: {
        orderReference: { type: "string", description: "Order ID/Reference to book." },
        courier: { type: "string", enum: ["postex", "leopards"], description: "Courier partner." },
      },
      required: ["orderReference"],
      additionalProperties: false,
    };
  }

  if (actionId === "update_owner_preference") {
    return {
      type: "object",
      properties: {
        timezone: { type: "string", description: "Valid IANA timezone, e.g. Asia/Karachi, America/New_York, UTC." },
        language: { type: "string", description: "Preferred language, e.g. English, Urdu." },
        languages: { type: "array", items: { type: "string" }, description: "List of preferred languages." },
        formality: { type: "string", enum: ["formal", "neutral", "casual"], description: "Formality level." },
        tone: { type: "string", description: "Communication tone, e.g. professional, friendly." },
      },
      additionalProperties: false,
    };
  }

  if (actionId === "add_owner_address") {
    return {
      type: "object",
      properties: {
        label: { type: "string", description: "Address label, e.g. Home, Office, Delivery." },
        addressLine1: { type: "string", description: "Street address or house number." },
        city: { type: "string", description: "City name." },
        country: { type: "string", description: "Country name or code." },
        postalCode: { type: "string", description: "Postal or ZIP code." },
        isDefault: { type: "boolean", description: "Whether this is the default address." },
      },
      required: ["addressLine1", "city"],
      additionalProperties: false,
    };
  }

  if (actionId === "update_owner_privacy") {
    return {
      type: "object",
      properties: {
        target: { type: "string", enum: ["identity", "address", "contact"], description: "Target profile item." },
        label: { type: "string", description: "Item label (e.g. Home, Office, Work)." },
        privacyPolicy: { type: "string", enum: ["PRIVATE", "ASK_BEFORE_SHARE", "ALLOW_FOR_AUTHORIZED_TASK"], description: "Privacy policy." },
      },
      required: ["privacyPolicy"],
      additionalProperties: false,
    };
  }

  if (actionId === "schedule_google_meeting") {
    return {
      type: "object",
      properties: {
        target: { type: "string", description: "Contact name or phone number of the meeting invitee/recipient." },
        time: { type: "string", description: "Meeting time, relative time expression (e.g. 'in 15 minutes', 'at 4pm'), or ISO timestamp." },
        durationMinutes: { type: "number", description: "Meeting duration in minutes (default 30)." },
        purpose: { type: "string", description: "Meeting topic or purpose (e.g. 'Quick sync', 'Project discussion')." },
        sendInviteWhatsApp: { type: "boolean", description: "Whether to send the meeting link to the recipient via Personal WhatsApp (default true)." },
      },
      required: ["time"],
      additionalProperties: false,
    };
  }

  if (actionId === "start_personal_outbound_mission") {
    return {
      type: "object",
      properties: {
        target: { type: "string", description: "Contact name or phone number to message." },
        goal: { type: "string", description: "What to ask or say to them (the message or task goal)." },
        contactName: { type: "string", description: "Name of the person or business to contact (e.g. 'Starts Digital', 'Supplier XYZ')." },
        contactPhone: { type: "string", description: "Explicit phone number of the target (e.g. '+194019413064'). Keep strictly separate from budget numbers." },
        objective: { type: "string", description: "Core objective or instruction (e.g. 'discuss monthly pricing', 'request quotation', 'negotiate website terms')." },
        budgetConstraint: { type: "string", description: "Budget constraint or maximum limit (e.g. '20k/month', '$500'). NEVER concatenate into phone number!" },
        negotiationTarget: { type: "string", description: "Target price or deliverable to negotiate." },
        context: { type: "string", description: "Background context or details about the conversation." },
        isSendOnly: { type: "boolean", description: "True if just delivering a one-off message, false if expecting a multi-turn conversation or negotiation." },
      },
      additionalProperties: false,
    };
  }

  if (actionId === "get_personal_outbound_mission") {
    return {
      type: "object",
      properties: {
        missionId: { type: "string", description: "Mission or task ID." },
        target: { type: "string", description: "Contact name or phone number." },
      },
      additionalProperties: false,
    };
  }

  if (actionId === "list_personal_outbound_missions") {
    return {
      type: "object",
      properties: {
        status: { type: "string", description: "Optional filter: ACTIVE, WAITING_FOR_REPLY, NEEDS_OWNER, COMPLETED, CANCELLED, FAILED" },
        limit: { type: "number", description: "Maximum number of missions to list." },
      },
      additionalProperties: false,
    };
  }

  if (actionId === "cancel_personal_outbound_mission") {
    return {
      type: "object",
      properties: {
        missionId: { type: "string", description: "Mission or task ID to cancel." },
        target: { type: "string", description: "Contact name or phone number to cancel mission for." },
      },
      additionalProperties: false,
    };
  }

  if (actionId === "provide_personal_mission_information") {
    return {
      type: "object",
      properties: {
        answer: { type: "string", description: "The owner's answer or information for the mission recipient." },
        missionId: { type: "string", description: "Optional mission ID." },
        target: { type: "string", description: "Optional contact name or phone." },
      },
      required: ["answer"],
      additionalProperties: false,
    };
  }

  if (actionId === "find_personal_contact") {
    return {
      type: "object",
      properties: {
        query: { type: "string", description: "Name, phone number, or relationship of the personal contact." },
      },
      required: ["query"],
      additionalProperties: false,
    };
  }

  if (actionId === "get_personal_contact_memory") {
    return {
      type: "object",
      properties: {
        name: { type: "string", description: "Name or phone of the personal contact to look up memory for." },
        contactId: { type: "string", description: "Optional contact ID." },
      },
      required: ["name"],
      additionalProperties: false,
    };
  }

  if (actionId === "set_personal_contact_relationship") {
    return {
      type: "object",
      properties: {
        name: { type: "string", description: "Contact name or phone." },
        relationship: { type: "string", enum: ["friend", "family", "colleague", "client", "supplier", "service_provider", "professional_contact", "acquaintance", "other"], description: "Relationship category." },
        customLabel: { type: "string", description: "Optional custom label (e.g. accountant, laptop supplier)." },
      },
      required: ["name", "relationship"],
      additionalProperties: false,
    };
  }

  if (actionId === "save_personal_contact_note") {
    return {
      type: "object",
      properties: {
        name: { type: "string", description: "Contact name or phone." },
        text: { type: "string", description: "Private note text to save." },
      },
      required: ["name", "text"],
      additionalProperties: false,
    };
  }

  if (actionId === "save_personal_contact_fact") {
    return {
      type: "object",
      properties: {
        name: { type: "string", description: "Contact name or phone." },
        label: { type: "string", description: "Fact label (e.g. profession, opening hours, preference)." },
        value: { type: "string", description: "Fact value (e.g. accountant, 10 AM, WhatsApp only)." },
        category: { type: "string", enum: ["identity", "role", "organization", "preference", "schedule", "pricing", "location", "availability", "custom"], description: "Category." },
      },
      required: ["name", "label", "value"],
      additionalProperties: false,
    };
  }

  if (actionId === "correct_personal_contact_fact") {
    return {
      type: "object",
      properties: {
        name: { type: "string", description: "Contact name or phone." },
        label: { type: "string", description: "Fact label being corrected." },
        newValue: { type: "string", description: "New updated value." },
      },
      required: ["name", "label", "newValue"],
      additionalProperties: false,
    };
  }

  if (actionId === "remove_personal_contact_fact") {
    return {
      type: "object",
      properties: {
        name: { type: "string", description: "Contact name or phone." },
        label: { type: "string", description: "Fact label or ID to remove." },
      },
      required: ["name", "label"],
      additionalProperties: false,
    };
  }

  if (actionId === "set_personal_contact_do_not_contact") {
    return {
      type: "object",
      properties: {
        name: { type: "string", description: "Contact name or phone." },
        status: { type: "string", enum: ["active", "do_not_contact", "blocked_by_owner"], description: "Status to set." },
      },
      required: ["name", "status"],
      additionalProperties: false,
    };
  }

  if (actionId === "archive_personal_contact") {
    return {
      type: "object",
      properties: {
        name: { type: "string", description: "Contact name or phone." },
      },
      required: ["name"],
      additionalProperties: false,
    };
  }

  if (actionId === "enable_incoming_personal_assistant") {
    return {
      type: "object",
      properties: {
        instanceId: { type: "string", description: "Personal instance ID (optional)." },
        replyMode: { type: "string", enum: ["known_contacts_only", "all_private_contacts"], description: "Reply scope." },
      },
      additionalProperties: false,
    };
  }

  if (actionId === "disable_incoming_personal_assistant") {
    return {
      type: "object",
      properties: {
        instanceId: { type: "string", description: "Personal instance ID (optional)." },
      },
      additionalProperties: false,
    };
  }

  if (actionId === "get_incoming_personal_assistant_settings") {
    return {
      type: "object",
      properties: {
        instanceId: { type: "string", description: "Personal instance ID (optional)." },
      },
      additionalProperties: false,
    };
  }

  if (actionId === "update_incoming_personal_assistant_settings") {
    return {
      type: "object",
      properties: {
        instanceId: { type: "string", description: "Personal instance ID." },
        instructions: { type: "string", description: "New global assistant instructions." },
        assistantDisplayName: { type: "string", description: "Assistant display name." },
        manualTakeoverDurationMinutes: { type: "number", description: "Takeover duration in minutes." },
        replyMode: { type: "string", enum: ["known_contacts_only", "all_private_contacts", "off"] },
      },
      additionalProperties: false,
    };
  }

  if (actionId === "pause_personal_assistant_for_contact" || actionId === "resume_personal_assistant_for_contact") {
    return {
      type: "object",
      properties: {
        name: { type: "string", description: "Personal contact name or phone." },
      },
      required: ["name"],
      additionalProperties: false,
    };
  }

  if (actionId === "get_personal_contact_recent_messages") {
    return {
      type: "object",
      properties: {
        name: { type: "string", description: "Personal contact name or phone." },
        limit: { type: "number", description: "Number of messages to retrieve." },
      },
      required: ["name"],
      additionalProperties: false,
    };
  }

  if (actionId === "list_departments") {
    return {
      type: "object",
      properties: {},
      additionalProperties: false,
    };
  }

  if (actionId === "get_lead_routing_status") {
    return {
      type: "object",
      properties: {
        leadId: { type: "string", description: "Optional specific lead ID to check status for." },
      },
      additionalProperties: false,
    };
  }

  if (actionId === "reassign_lead_department") {
    return {
      type: "object",
      properties: {
        leadId: { type: "string", description: "Lead ID to reassign." },
        departmentId: { type: "string", description: "Target department ID to route to." },
        reason: { type: "string", description: "Reason for reassignment." },
      },
      required: ["leadId", "departmentId"],
      additionalProperties: false,
    };
  }

  // Default parameter schema for read actions with no required params
  return {
    type: "object",
    properties: {},
    additionalProperties: false,
  };
}

/**
 * Returns enhanced, semantically unambiguous description for key tool calling actions.
 */
function getEnhancedToolDescription(action: AdminActionDefinition): string {
  if (action.actionId === "get_owner_profile") {
    return "Returns the stored Owner360 personal profile (preferred name, timezone, languages, default address, contact methods, and privacy levels). Use when owner asks 'What information do you have saved about me?' or 'What do you know about me?'.";
  }
  if (action.actionId === "update_owner_preference") {
    return "Updates low-risk personal preferences such as timezone (valid IANA name), preferred languages, or communication tone/formality. Use for 'Save my preferred timezone as Asia/Karachi' or 'Change my preferred language to Urdu'.";
  }
  if (action.actionId === "add_owner_address") {
    return "Saves a new physical or delivery address to the owner's personal profile. Requires confirmation preview before persisting.";
  }
  if (action.actionId === "update_owner_privacy") {
    return "Updates privacy policy on an owner profile item. Setting to ALLOW_FOR_AUTHORIZED_TASK broadens sharing and requires explicit confirmation preview.";
  }
  if (action.actionId === "find_personal_contact") {
    return "Searches for a Personal Contact by name, phone number, or relationship. Use for 'Find contact Ali' or 'Who is my laptop supplier?'.";
  }
  if (action.actionId === "list_personal_contacts") {
    return "Lists all Personal Contacts with their safe phone numbers, relationships, and saved memory counts. Use for 'List my personal contacts' or 'Show my personal contacts'.";
  }
  if (action.actionId === "get_personal_contact_memory") {
    return "Returns what is known about a specific Personal Contact (relationship, facts, notes, communication status). Use for 'What do we know about Ahmed?' or 'Tell me about contact Ali'.";
  }
  if (action.actionId === "save_personal_contact_fact") {
    return "Explicitly saves a factual statement about a Personal Contact. Use for 'Remember Ahmed is an accountant' or 'Ali prefers WhatsApp'.";
  }
  if (action.actionId === "save_personal_contact_note") {
    return "Saves a private owner note about a Personal Contact. Use for 'Add note about Ahmed: discussed tax filing'.";
  }
  if (action.actionId === "set_personal_contact_relationship") {
    return "Sets the owner-defined relationship for a Personal Contact (friend, supplier, colleague, client, etc.). Use for 'Set ABC Electronics as my supplier'.";
  }
  if (action.actionId === "correct_personal_contact_fact") {
    return "Corrects or supersedes a previously stored fact about a Personal Contact. Use for 'Actually, Ahmed's office opens at 10 AM'.";
  }
  if (action.actionId === "remove_personal_contact_fact") {
    return "Removes a specific fact from a Personal Contact's memory.";
  }
  if (action.actionId === "set_personal_contact_do_not_contact") {
    return "Sets communication status for a Personal Contact (active, do_not_contact, blocked_by_owner). Use for 'Do not contact Ali'.";
  }
  if (action.actionId === "archive_personal_contact") {
    return "Archives a Personal Contact.";
  }
  if (action.actionId === "enable_incoming_personal_assistant") {
    return "Enables incoming auto-replies for a Personal WhatsApp instance so the assistant can answer on behalf of owner. Use for 'Turn on personal assistant', 'Enable personal assistant', 'Activate assistant'.";
  }
  if (action.actionId === "disable_incoming_personal_assistant") {
    return "Disables incoming auto-replies for a Personal WhatsApp instance. Use for 'Turn off personal assistant', 'Disable personal assistant', 'Stop assistant auto-replies'.";
  }
  if (action.actionId === "get_assistant_capabilities") {
    return "Returns live dynamic system capabilities across business automation, CRM, orders, catalog, reminders, and live connection status of the paired Personal WhatsApp line. Use when user asks what the assistant can do or what PA can do.";
  }
  if (action.actionId === "save_personal_contact") {
    return "Saves a new or active contact to the personal address book with a display name and phone number. Use for 'Save this contact as Ahmed' or 'Save it'.";
  }
  if (action.actionId === "get_incoming_personal_assistant_settings") {
    return "Views technical configuration settings of the incoming Personal Assistant (takeover duration, reply scope, owner escalation). DO NOT use for general capability questions or when the user asks what the Personal Assistant can do.";
  }
  if (action.actionId === "update_incoming_personal_assistant_settings") {
    return "Updates Incoming Personal Assistant instructions, assistant display name, or takeover duration.";
  }
  if (action.actionId === "pause_personal_assistant_for_contact") {
    return "Pauses Personal Assistant auto-replies for a specific personal contact. Use for 'Pause assistant for Ahmed' or 'Stop auto-replying to Ali'.";
  }
  if (action.actionId === "resume_personal_assistant_for_contact") {
    return "Resumes Personal Assistant auto-replies for a specific personal contact and clears active takeover. Use for 'Resume assistant for Ahmed' or 'Start auto-replying to Ali again'.";
  }
  if (action.actionId === "list_paused_personal_contacts") {
    return "Lists personal contacts where Personal Assistant is paused. Use for 'Which contacts is the assistant paused for?'.";
  }
  if (action.actionId === "get_personal_contact_recent_messages") {
    return "Returns recent chat messages with a personal contact. Use for 'What did Ahmed message me?' or 'Show conversation with Ali'.";
  }
  if (action.actionId === "get_wallet_balance") {
    return "Returns current prepaid BlackArrow wallet credit/balance (in USD) and recent wallet transactions. Use when admin asks for CURRENT wallet balance, remaining money, or how much credit is left.";
  }
  if (action.actionId === "get_usage_summary") {
    return "Returns BlackArrow platform wallet usage and spend breakdown (in USD) for a requested time period (e.g. today, yesterday, this_week, last_week, last_7_days, this_month, last_month). This is platform billing consumption, NOT store sales/revenue.";
  }
  if (action.actionId === "get_business_profile_summary") {
    return "Returns what BlackArrow currently knows and configures about the owner's business/account: business name, plan tier, wallet balance, WhatsApp bot live connection status, catalog products count, customer leads count, order count, and active integrations. Use for 'Do you know about my business?', 'What do you know about my company?', 'Tell me about my account', or 'What is configured for my business?'.";
  }
  if (action.actionId === "get_business_counts_summary") {
    return "Returns authoritative total counts: total customers/leads, total products and services in catalog (with physical vs service breakdown), total orders handled, and full order status breakdown (confirmed, pending, delivered, cancelled). Use for 'How many customers do I have?', 'Total customers and orders', 'How many orders/leads are confirmed?'.";
  }
  if (action.actionId === "get_customer_activity_summary") {
    return "Returns count of UNIQUE customers who sent INBOUND WhatsApp messages during the requested period (e.g. last 7 days, today, this week, this month, etc.) and total inbound message counts. Use for questions like 'How many customers talked to us in last 7 days?', 'How many people messaged us this week?', 'Who chatted with us yesterday?'. This counts unique inbound messaging people, NOT sales, NOT orders, NOT customer search, and NOT generic business metrics.";
  }
  if (action.actionId === "get_business_metrics") {
    return "Returns monetary business performance, total sales revenue in $, completed order counts, and average order value for a period (e.g. today, yesterday, last 7 days, this month). Use for sales, revenue, turnover, or order performance. Do NOT use for customer message activity.";
  }
  if (action.actionId === "create_admin_reminder") {
    return "Schedules a private durable reminder delivered exclusively to the owner's WhatsApp at a specified future time. Use for 'remind me to do mobile package at 4pm', 'remind me tomorrow 9am to check stock', or any reminder request.";
  }
  if (action.actionId === "list_admin_reminders") {
    return "Lists upcoming scheduled private reminders for the WhatsApp admin.";
  }
  if (action.actionId === "cancel_admin_reminder") {
    return "Cancels a scheduled pending private reminder.";
  }
  if (action.actionId === "get_business_overview") {
    return "Returns today's comprehensive business operations report, today's order count, today's revenue, active bots, and urgent attention items. Use for 'How is business today?', or general 'Overview?'.";
  }
  if (action.actionId === "list_products") {
    return "Lists all catalog items, showing their name, price, stock, and item type ([Physical] vs [Service]). Use to inspect catalog products or verify if items are physical or services.";
  }
  if (action.actionId === "update_product_type") {
    return "Updates product or catalog item type between physical, service, and digital. Supports single product (e.g. 'Starter Plan') or bulk conversion across all catalog items (e.g. 'turn all products from physical to service'). If all items are already services, reports no change needed.";
  }
  if (action.actionId === "get_instance_status") {
    return "Returns real-time connection status and operational health of the WhatsApp instance. Use for bot connection checks or when the admin asks about WhatsApp connection state.";
  }
  if (action.actionId === "get_ai_reply_status") {
    return "Returns operational status of automated customer AI chat replies (enabled/disabled).";
  }
  if (action.actionId === "get_attention_items") {
    return "Lists urgent alerts, disconnected bots, low stock warnings, and pending unfulfilled orders.";
  }
  if (action.actionId === "list_departments") {
    return "Lists all configured departments for lead routing, including their names, semantic responsibilities, and WhatsApp destinations. Use for 'Show departments', 'List departments', 'Which departments do we have?'.";
  }
  if (action.actionId === "get_lead_routing_status") {
    return "Inspects recent lead routing audit records or specific forwarding status for a lead. Use for 'Show lead routing', 'Where was lead routed?', 'Check lead routing status'.";
  }
  if (action.actionId === "reassign_lead_department") {
    return "Reassigns a lead to a new department and forwards the grounded conversation summary. Use for 'Reassign lead 123 to Sales'.";
  }
  return action.description;
}

const DOMAIN_PRIORITY_ACTIONS: Record<string, string[]> = {
  business: [
    "get_business_profile_summary",
    "get_business_overview",
    "get_business_counts_summary",
    "get_customer_activity_summary",
    "get_business_metrics",
    "get_usage_summary",
    "get_wallet_balance",
    "list_departments",
    "get_attention_items",
    "get_instance_status",
  ],
  customers: [
    "get_customer_activity_summary",
    "get_business_counts_summary",
    "get_recent_customers",
    "search_customers",
    "get_customer_details",
    "get_customer_tags",
    "get_customer_orders",
  ],
  products: [
    "list_products",
    "search_products",
    "get_product",
    "update_product_type",
    "update_product_price",
    "update_product_stock",
    "create_product",
    "list_low_stock_products",
    "list_unavailable_products",
  ],
  operations: [
    "create_admin_reminder",
    "list_admin_reminders",
    "cancel_admin_reminder",
    "schedule_google_meeting",
    "start_personal_outbound_mission",
    "get_personal_outbound_mission",
    "list_personal_outbound_missions",
    "cancel_personal_outbound_mission",
    "provide_personal_mission_information",
    "get_google_personal_status",
    "get_owner_profile",
    "update_owner_preference",
    "add_owner_address",
    "update_owner_privacy",
    "find_personal_contact",
    "list_personal_contacts",
    "save_personal_contact",
    "get_assistant_capabilities",
    "list_departments",
    "get_lead_routing_status",
    "reassign_lead_department",
    "get_personal_contact_memory",
    "save_personal_contact_fact",
    "save_personal_contact_note",
    "set_personal_contact_relationship",
    "correct_personal_contact_fact",
    "remove_personal_contact_fact",
    "set_personal_contact_do_not_contact",
    "archive_personal_contact",
    "get_attention_items",
  ],
  billing: [
    "get_wallet_balance",
    "get_usage_summary",
    "get_billing_logs",
    "get_account_status",
    "get_business_profile_summary",
  ],
  orders: [
    "list_recent_orders",
    "search_orders",
    "get_order",
    "get_order_counts",
    "get_courier_tracking_status",
  ],
  reports: [
    "get_business_metrics",
    "get_customer_activity_summary",
    "get_business_counts_summary",
    "get_usage_summary",
    "get_business_overview",
  ],
};

/**
 * Builds a focused subset of native tool definitions (5-16 tools) based on classified domain(s).
 */
export function buildFocusedToolDefinitions(
  context: AdminBusinessAssistantContext,
  primaryDomain: AdminActionDomain,
  secondaryDomain?: AdminActionDomain
): DeepInfraToolDefinition[] {
  const allowedCategories = new Set<string>();
  (DOMAIN_CATEGORY_MAP[primaryDomain] || []).forEach((c) => allowedCategories.add(c));
  if (secondaryDomain && secondaryDomain !== "general" && secondaryDomain !== primaryDomain) {
    (DOMAIN_CATEGORY_MAP[secondaryDomain] || []).forEach((c) => allowedCategories.add(c));
  }

  const priorityActionIds = new Set<string>([
    ...(DOMAIN_PRIORITY_ACTIONS[primaryDomain] || []),
    ...(secondaryDomain ? DOMAIN_PRIORITY_ACTIONS[secondaryDomain] || [] : []),
  ]);

  const allActions = listAdminActions().filter((a) => {
    const roleCheck = canExecuteAdminBusinessAction({
      role: context.adminRole,
      action: a,
      channel: "whatsapp",
    });
    return roleCheck.allowed;
  });

  const priorityList = allActions.filter((a) => priorityActionIds.has(a.actionId));
  const categoryList = allActions.filter((a) => !priorityActionIds.has(a.actionId) && allowedCategories.has(a.category));

  const candidateActions = [...priorityList, ...categoryList];
  const selected = candidateActions.slice(0, 16);

  return selected.map((action) => ({
    type: "function",
    function: {
      name: action.actionId,
      description: getEnhancedToolDescription(action),
      parameters: getActionToolSchema(action.actionId),
    },
  }));
}

// ---------------------------------------------------------------------------
// 5. AI DOMAIN CLASSIFIER (STRICT JSON SCHEMA)
// ---------------------------------------------------------------------------

export async function classifyAdminDomain(input: {
  text: string;
  context: AdminBusinessAssistantContext;
  memory?: AdminConversationMemory;
}): Promise<{ primaryDomain: AdminActionDomain; secondaryDomain?: AdminActionDomain; confidence: number }> {
  const { text, context, memory } = input;

  const domainSchema = {
    type: "object",
    properties: {
      primaryDomain: {
        type: "string",
        enum: [
          "billing",
          "business",
          "account",
          "orders",
          "products",
          "customers",
          "courier",
          "followups",
          "broadcasts",
          "customer_updates",
          "ai_studio",
          "integrations",
          "live_monitor",
          "reports",
          "team",
          "security",
          "operations",
          "personal_assistant",
          "general",
        ],
      },
      secondaryDomain: {
        type: "string",
        enum: [
          "billing",
          "business",
          "account",
          "orders",
          "products",
          "customers",
          "courier",
          "followups",
          "broadcasts",
          "customer_updates",
          "ai_studio",
          "integrations",
          "live_monitor",
          "reports",
          "team",
          "security",
          "operations",
          "personal_assistant",
          "general",
          "none",
        ],
      },
      confidence: { type: "number" },
    },
    required: ["primaryDomain", "confidence"],
    additionalProperties: false,
  };

  const activeRef = memory?.activePersonName || memory?.activeContact?.displayName || "";
  const systemPrompt = `
You are the Domain Classifier for the BlackArrow Admin Business Assistant.
Classify the user's message into the single most relevant action domain:
- billing: wallet balance, usage summary, spend, credits, billing logs, subscription costs
- business: business profile summary ("what do you know about my business"), business overview, business counts summary (total customers & orders), sales metrics, attention alerts
- orders: order lookup, recent orders, order details, order status, order cancellation
- products: product catalog, stock levels, low stock, product price updates, create product, change product type
- customers: customer search, customer conversation activity, active messaging customers
- operations: private reminders ("remind me at 4 PM to..."), scheduling tasks, operational controls
- personal_assistant: personal contacts, personal outbound messages, messaging contacts or direct numbers, owner personal profile ("what do you know about me"), personal reminders
- courier: courier tracking, PostEx/Leopards booking
- ai_studio: AI chat replies status, bot settings, prompts
- integrations: WooCommerce sync, webhooks, API keys
- account: plan status, subscription limits, profile info
- general: greeting, help, broad questions

CONTEXT: Previous topic was "${memory?.lastTopic || "none"}", previous action was "${memory?.lastActionId || "none"}"${activeRef ? `, active contact/person in context is "${activeRef}"` : ""}.
`.trim();

  try {
    const res = await agentDeps.generateBackendText({
      purpose: "admin_assistant_domain",
      accountId: context.accountId,
      botId: context.botId,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text },
      ],
      maxTokens: 100,
      temperature: 0.0,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "domain_classification",
          strict: true,
          schema: domainSchema,
        },
      },
      timeoutMs: 4000,
    });

    if (res.requestStatus === "success" && res.text) {
      let parsed: any = null;
      try {
        parsed = JSON.parse(res.text);
      } catch {
        parsed = null;
      }
      if (parsed?.primaryDomain) {
        return {
          primaryDomain: parsed.primaryDomain as AdminActionDomain,
          secondaryDomain: parsed.secondaryDomain && parsed.secondaryDomain !== "none" ? parsed.secondaryDomain as AdminActionDomain : undefined,
          confidence: Number(parsed.confidence || 0.9),
        };
      }
    }
  } catch (err) {
    console.warn("[AdminAgent] Domain classification fallback:", err);
  }

  // Graceful semantic heuristic fallback if domain classifier call fails
  const clean = cleanPunctuation(text);
  if (
    clean.includes("department") ||
    clean.includes("departments") ||
    clean.includes("lead route") ||
    clean.includes("lead routing") ||
    clean.includes("reassign lead") ||
    clean.includes("shobah")
  ) {
    return { primaryDomain: "operations", secondaryDomain: "business", confidence: 0.95 };
  }
  if (
    clean.includes("contact") ||
    clean.includes("message ") ||
    clean.includes("text ") ||
    clean.includes("send message") ||
    clean.includes("meet") ||
    clean.includes("meeting") ||
    clean.includes("google meet") ||
    clean.includes("calendar") ||
    clean.includes("reach out") ||
    clean.includes("use message") ||
    clean.includes("usko message") ||
    clean.includes("unhe message") ||
    clean.includes("kisi ko message") ||
    clean.includes("rabta") ||
    clean.includes("رسالة")
  ) {
    return { primaryDomain: "operations", secondaryDomain: "general", confidence: 0.95 };
  }
  if (
    clean.includes("about me") ||
    clean.includes("my profile") ||
    clean.includes("my timezone") ||
    clean.includes("my address") ||
    clean.includes("save my") ||
    clean.includes("keep private") ||
    clean.includes("mere baray") ||
    clean.includes("kya jantay") ||
    clean.includes("تعرف عني")
  ) {
    return { primaryDomain: "operations", secondaryDomain: "account", confidence: 0.9 };
  }
  if (clean.includes("personal contact") || clean.includes("my contact") || clean.includes("remember ") || clean.includes("save note") || clean.includes("supplier") || clean.includes("accountant") || clean.includes("what do we know about") || clean.includes("do not contact")) {
    return { primaryDomain: "operations", secondaryDomain: "customers", confidence: 0.9 };
  }
  if (clean.includes("remind") || clean.includes("reminder") || clean.includes("schedule") || clean.includes("yaad")) {
    return { primaryDomain: "operations", secondaryDomain: "general", confidence: 0.9 };
  }
  if (clean.includes("how many customer") || clean.includes("how many order") || clean.includes("total customer") || clean.includes("counts summary") || clean.includes("kitne customer")) {
    return { primaryDomain: "business", secondaryDomain: "customers", confidence: 0.9 };
  }
  if (clean.includes("talked") || clean.includes("active customer") || clean.includes("chatted") || clean.includes("messaged")) {
    return { primaryDomain: "customers", secondaryDomain: "business", confidence: 0.9 };
  }
  if (clean.includes("wallet") || clean.includes("spend") || clean.includes("cost") || clean.includes("credit") || clean.includes("burn") || clean.includes("paise") || clean.includes("kharch")) {
    return { primaryDomain: "billing", secondaryDomain: "business", confidence: 0.8 };
  }
  if (clean.includes("order") || clean.includes("dispatch") || clean.includes("track")) {
    return { primaryDomain: "orders", secondaryDomain: "courier", confidence: 0.8 };
  }
  if (clean.includes("product") || clean.includes("stock") || clean.includes("price") || clean.includes("catalog") || clean.includes("service")) {
    return { primaryDomain: "products", secondaryDomain: "business", confidence: 0.8 };
  }
  if (clean.includes("business") || clean.includes("company") || clean.includes("overview") || clean.includes("report") || clean.includes("karobar") || clean.includes("meri company")) {
    return { primaryDomain: "business", secondaryDomain: "billing", confidence: 0.8 };
  }
  return { primaryDomain: (memory?.lastTopic as AdminActionDomain) || "general", confidence: 0.5 };
}

// ---------------------------------------------------------------------------
// 6. DETERMINISTIC GUARDS (AFFIRMATIONS, HELP, BATCH PLANS, HEALTH)
// ---------------------------------------------------------------------------

export function buildAdminCapabilityHelpText(role: string = "admin", continuation: boolean = false): string {
  if (continuation) {
    return `💡 *Additional Assistant Capabilities*

Here is what else I can help you with:

📱 *Personal WhatsApp Actions*
• *"Message [Name/Number] that [message]"* — Sends directly from your personal line
• *"Just message him"* — Uses active conversation contact
• Direct phone messaging supported without saving contact first

👤 *Owner360 Personal Intelligence*
• Stored personal profile, preferences, address, and timezone
• Strictly separated from public business data

⏰ *Automated Reminders*
• *"Remind me at 4 PM to check inventory"*
• View and cancel pending reminders

📅 *Calendar & Meetings*
• Google Meet / Calendar integration is deferred and can be linked in settings

Ask me to do any of these or give a command!`;
  }

  return `🤖 *Business Assistant*

I can help manage and check your BlackArrow business directly from WhatsApp.

📊 *Business & Reports*
• Sales, revenue and performance
• Orders and business summaries

👥 *Customers*
• Search customers
• Check recent activity
• View customer information

📦 *Products & Services*
• View catalog
• Create/update supported items

💳 *Billing*
• Wallet balance
• Usage and spending

⏰ *Reminders & Operations*
• Create/manage reminders
• Check bot and business status
• Personal WhatsApp messaging to contacts and direct numbers

Ask me anything naturally, e.g. *"What is my wallet balance?"* or *"How many orders today?"*.`;
}

export function matchDeterministicGuards(
  rawText: string,
  memory?: AdminConversationMemory
): AdminAgentResolvedIntent | null {
  const clean = cleanPunctuation(rawText);
  if (!clean) return null;

  // 1. Pending Offered Action Check
  if (memory?.pendingOfferedAction) {
    const offer = memory.pendingOfferedAction;
    if (Date.now() <= offer.expiresAt) {
      if (isAffirmative(clean)) {
        if (offer.actionId === "batch_create_blackarrow_plans") {
          return {
            mode: "tool",
            actionId: "batch_create_blackarrow_plans",
            reasoning: "User affirmed batch creation of BlackArrow service plans",
            routingTelemetry: { domain: "products", plannerSource: "semantic_rule", validation: "accepted" },
          };
        }

        const targetActionDef = getAdminAction(offer.actionId);
        if (targetActionDef) {
          return {
            mode: "tool",
            actionId: offer.actionId,
            action: targetActionDef,
            params: offer.params || {},
            reasoning: `Executing offered action ${offer.actionId} upon affirmative response`,
            routingTelemetry: { plannerSource: "semantic_rule", toolName: offer.actionId, validation: "accepted" },
          };
        }
      } else if (isCancellation(clean)) {
        return {
          mode: "conversation",
          reply: "No problem. Let me know if you need help with anything else.",
          reasoning: "Cleared pending offered action on cancellation",
          routingTelemetry: { plannerSource: "semantic_rule", validation: "accepted" },
        };
      }
    }
  }

  // 1b. Conversational Acknowledgement ("Ok" must NOT reset assistant or re-introduce)
  if (
    clean === "ok" ||
    clean === "okay" ||
    clean === "ok thanks" ||
    clean === "okay thanks" ||
    clean === "thanks" ||
    clean === "thank you" ||
    clean === "thanks a lot" ||
    clean === "got it" ||
    clean === "noted" ||
    clean === "alright" ||
    clean === "all right" ||
    clean === "understood" ||
    clean === "perfect" ||
    clean === "great" ||
    clean === "cool" ||
    clean === "sounds good" ||
    clean === "sure thing" ||
    clean === "ok got it" ||
    clean === "cool thanks" ||
    clean === "fine" ||
    clean === "done thanks"
  ) {
    return {
      mode: "conversation",
      reply: "Got it! Let me know what you'd like to do next.",
      reasoning: "Conversational acknowledgement; maintain context continuity without re-introduction",
      routingTelemetry: { plannerSource: "semantic_rule", validation: "accepted" },
    };
  }

  // 1c. "What else?" Contextual Continuation
  if (
    clean === "what else" ||
    clean === "what else?" ||
    clean === "what more" ||
    clean === "what more?" ||
    clean === "what else can you do" ||
    clean === "anything else"
  ) {
    if (memory?.lastTopic === "help" || memory?.lastActionId === "help") {
      return {
        mode: "help",
        reply: buildAdminCapabilityHelpText("owner", true),
        reasoning: "Continued capability explanation from previous help context",
        routingTelemetry: { plannerSource: "semantic_rule", validation: "accepted" },
      };
    }
    if (memory?.activePersonName || memory?.activeContact) {
      const name = memory.activePersonName || memory.activeContact?.displayName;
      return {
        mode: "conversation",
        reply: `For ${name}, I can send another message, check their notes, or view their contact details. Or I can help with business orders and performance. What would you like to do?`,
        reasoning: "Contextual continuation of contact topic without triggering unrelated business overview",
        routingTelemetry: { plannerSource: "semantic_rule", validation: "accepted" },
      };
    }
    return {
      mode: "conversation",
      reply: "I can help you check orders, sales performance, product stock, or message contacts and direct phone numbers using your Personal WhatsApp line. What would you like to do next?",
      reasoning: "Contextual continuation of previous topic without triggering unrelated business overview",
      routingTelemetry: { plannerSource: "semantic_rule", validation: "accepted" },
    };
  }

  // 1d. Action-capability inquiries
  if (
    clean === "what can you do as pa" ||
    clean === "what can you do as pa?" ||
    clean === "what can you do as my pa" ||
    clean === "what can you do as personal assistant" ||
    clean === "what can you do as my personal assistant"
  ) {
    const paHelp = `📱 *Personal Assistant Capabilities*\n\n• *Personal Messaging:* Send messages from your paired personal line to contacts or unsaved phone numbers (e.g. *"Message Starts Digital that..."*, *"Tell him..."*)\n• *Contact Lookup:* Find contacts by name or phone number, or message direct numbers without saving them first\n• *Owner360:* Save and retrieve personal facts, notes, preferences, and addresses\n• *Reminders:* Create and manage personal task reminders (e.g. *"Remind me at 4 PM to..."*)\n• *Context Awareness:* Remembers who you are talking about across conversation turns\n\nWhat would you like me to do?`;
    return {
      mode: "conversation",
      reply: paHelp,
      actionId: "get_assistant_capabilities",
      reasoning: "Specific Personal Assistant capability inquiry",
      routingTelemetry: { plannerSource: "semantic_rule", validation: "accepted" },
    };
  }

  const isContactCapabilityQuery = (
    clean === "can you contact somebody" ||
    clean === "can you contact someone" ||
    clean === "can you message somebody" ||
    clean === "can you message someone" ||
    clean === "can you send a message to somebody" ||
    clean === "can you send a message to someone" ||
    clean === "can you call someone" ||
    clean === "can you reach someone" ||
    /^(?:can|could|would)\s+you\s+(?:contact|message|send\s+a\s+message\s+to|reach\s+out\s+to)\s+(?:somebody|someone|anybody|anyone)(?:\s+for\s+me)?$/i.test(clean)
  );

  if (isContactCapabilityQuery) {
    return {
      mode: "conversation",
      reply: "Yes, I can contact someone for you using your Personal WhatsApp line. Who would you like me to message and what should I say?",
      reasoning: "Action capability inquiry; guiding owner to specify recipient and message",
      routingTelemetry: { plannerSource: "semantic_rule", validation: "accepted" },
    };
  }

  // 1e. Pending Personal Message Continuation (Task Continuation across turns)
  if (memory?.pendingPersonalMessage) {
    const pm = memory.pendingPersonalMessage;
    if (isCancellation(clean)) {
      return {
        mode: "conversation",
        reply: "Cancelled. Let me know what else you'd like to do.",
        reasoning: "Cancelled pending personal message",
        routingTelemetry: { plannerSource: "semantic_rule", validation: "accepted" },
      };
    }

    if (pm.requiresClarification === "message") {
      const target = pm.target || memory.activeContact?.displayName || memory.activePhone || memory.activePersonName;
      if (target) {
        let msg = rawText.trim();
        const preamble = msg.match(/^(?:(?:just\s+)?(?:tell\s+(?:him|her|them)|say|message(?:\s+(?:him|her|them))?)(?:\s+that|\s+to|\s*:)?\s*)(.*)$/i);
        if (preamble && preamble[1]?.trim()) {
          msg = preamble[1].trim();
        }

        return {
          mode: "tool",
          actionId: "start_personal_outbound_mission",
          action: getAdminAction("start_personal_outbound_mission"),
          params: {
            target,
            goal: msg,
            isSendOnly: true,
          },
          reasoning: `Continuing pending personal message to ${target} with provided message text`,
          routingTelemetry: { domain: "operations", plannerSource: "semantic_rule", toolName: "start_personal_outbound_mission", validation: "accepted" },
        };
      }
    } else if (pm.requiresClarification === "recipient") {
      const target = rawText.trim();
      return {
        mode: "tool",
        actionId: "start_personal_outbound_mission",
        action: getAdminAction("start_personal_outbound_mission"),
        params: {
          target,
          goal: pm.goal || "Hello",
          isSendOnly: true,
        },
        reasoning: `Continuing pending personal message with supplied recipient ${target}`,
        routingTelemetry: { domain: "operations", plannerSource: "semantic_rule", toolName: "start_personal_outbound_mission", validation: "accepted" },
      };
    }
  }

  // 1f. Pending Meeting Continuation
  if (memory?.pendingMeeting) {
    const pm = memory.pendingMeeting;
    if (pm.requiresClarification === "recipient") {
      return {
        mode: "tool",
        actionId: "schedule_google_meeting",
        action: getAdminAction("schedule_google_meeting"),
        params: {
          target: rawText.trim(),
          time: pm.timeExpression || "in 15 minutes",
          durationMinutes: pm.durationMinutes || 30,
          purpose: pm.purpose || "Google Meet Meeting",
        },
        reasoning: "Resuming pending meeting with supplied contact details",
        routingTelemetry: { domain: "operations", plannerSource: "semantic_rule", toolName: "schedule_google_meeting", validation: "accepted" },
      };
    }
  }

  // 1f-2. Semantic Referent Contact Saving ("save it", "save this number", "save him as Ahmed", "isko save karo")
  const isSaveReferent =
    /\b(save it|save this|save this number|save number|save contact|save him|save her|isko save|use save|iss number ko save)\b/i.test(clean);

  if (isSaveReferent) {
    const referent = resolveSemanticReferent({
      text: rawText,
      activeContact: memory?.activeContact,
      activePhone: memory?.activePhone,
      activePersonName: memory?.activePersonName,
    });

    const targetPhone = referent.phone || memory?.activePhone || memory?.activeContact?.canonicalPhone;
    if (targetPhone) {
      const nameMatch = rawText.match(/(?:as|naam|name)\s+([^.]+)/i);
      const displayName = nameMatch ? nameMatch[1].trim() : (referent.displayName || memory?.activePersonName || "Contact");
      return {
        mode: "tool",
        actionId: "save_personal_contact",
        action: getAdminAction("save_personal_contact"),
        params: {
          targetPhone,
          displayName,
        },
        reasoning: `Resolved semantic active phone ${targetPhone} for contact saving`,
        routingTelemetry: { domain: "operations", plannerSource: "semantic_rule", toolName: "save_personal_contact", validation: "accepted" },
      };
    }
  }

  // 1g. Personal WhatsApp Messaging Intents
  const politePrefixRegex = /^(?:(?:hey|hi|hello)\s+)?(?:(?:can|could|would)\s+you(?:\s+please)?|please|kindly|will\s+you)\s+/i;
  const strippedClean = clean.replace(politePrefixRegex, "");
  const strippedRaw = rawText.replace(politePrefixRegex, "");
  const isPersonalMessageIntent = (
    clean.startsWith("message ") ||
    clean.startsWith("just message ") ||
    clean.startsWith("tell ") ||
    clean.startsWith("contact ") ||
    strippedClean.startsWith("message ") ||
    strippedClean.startsWith("just message ") ||
    strippedClean.startsWith("tell ") ||
    strippedClean.startsWith("contact ") ||
    (clean.startsWith("send ") && (clean.includes(" message") || clean.includes(" msg") || clean.includes(" this"))) ||
    (strippedClean.startsWith("send ") && (strippedClean.includes(" message") || strippedClean.includes(" msg") || strippedClean.includes(" this"))) ||
    clean === "message him" ||
    clean === "message her" ||
    clean === "message them" ||
    clean === "just message him" ||
    clean === "just message her" ||
    clean === "just message them" ||
    clean === "contact him" ||
    clean === "contact her" ||
    clean === "contact them" ||
    strippedClean === "message him" ||
    strippedClean === "message her" ||
    strippedClean === "message them" ||
    strippedClean === "contact him" ||
    strippedClean === "contact her" ||
    strippedClean === "contact them"
  );

  if (isPersonalMessageIntent) {
    const activeTarget = memory?.activeContact?.displayName || memory?.activePhone || memory?.activePersonName;

    // A. Pronoun targets: him, her, them, that person, that contact, same person
    const pronounMatch = strippedRaw.match(/^(?:just\s+)?(?:message|tell|contact|send(?:\s+(?:a\s+message|this|msg))?)\s+(him|her|them|that\s+person|that\s+contact|same\s+person)(?:\s+(?:that|to|saying|:)?\s*(.*))?$/i);
    if (pronounMatch) {
      let content = pronounMatch[2]?.trim();
      if (content) {
        content = content.replace(/^(?:this\s*:\s*|this\s+|msg\s*:\s*|message\s*:\s*)/i, "").trim();
      }
      if (!activeTarget) {
        if (content) {
          return {
            mode: "conversation",
            reply: "Who would you like me to message? Please provide their name or phone number.",
            reasoning: "Missing recipient referent for message action; storing goal in pending message",
            params: { goal: content },
            routingTelemetry: { plannerSource: "semantic_rule", validation: "accepted" },
          };
        }
        return {
          mode: "conversation",
          reply: "Who would you like me to message? Please provide their name or phone number.",
          reasoning: "Missing recipient referent for message action",
          routingTelemetry: { plannerSource: "semantic_rule", validation: "accepted" },
        };
      }

      if (!content) {
        return {
          mode: "conversation",
          reply: `What would you like me to send to ${activeTarget}?`,
          reasoning: "Asking only for genuinely missing message content for active referent",
          params: { target: activeTarget },
          routingTelemetry: { plannerSource: "semantic_rule", validation: "accepted" },
        };
      }

      return {
        mode: "tool",
        actionId: "start_personal_outbound_mission",
        action: getAdminAction("start_personal_outbound_mission"),
        params: {
          target: activeTarget,
          goal: content,
          isSendOnly: true,
        },
        reasoning: `Executing personal WhatsApp message to active referent ${activeTarget}`,
        routingTelemetry: { domain: "operations", plannerSource: "semantic_rule", toolName: "start_personal_outbound_mission", validation: "accepted" },
      };
    }

    // B. Explicit recipient with message:
    const explicitWithMsgMatch =
      strippedRaw.match(/^(?:just\s+)?message\s+([^:]+?)(?:\s+(?:that|to|saying)|\s*:\s*)\s*(.+)$/i) ||
      strippedRaw.match(/^(?:just\s+)?tell\s+([^:]+?)(?:\s+(?:that|to|saying)|\s*:\s*)\s*(.+)$/i) ||
      strippedRaw.match(/^(?:just\s+)?tell\s+([A-Za-z0-9+\s]+?)\s+(we\b.*|i\b.*|please\b.*|the\b.*|call\b.*|meeting\b.*|ready\b.*)$/i) ||
      strippedRaw.match(/^(?:just\s+)?send\s+([^:]+?)\s+(?:a\s+message|msg)(?:\s+(?:that|to|saying)|\s*:\s*)\s*(.+)$/i) ||
      strippedRaw.match(/^(?:just\s+)?contact\s+([^:]+?)(?:\s+(?:and\s+tell\s+(?:them|him|her)|and\s+say|that|to|saying)|\s*:\s*)\s*(.+)$/i);

    if (explicitWithMsgMatch) {
      let explicitTarget = explicitWithMsgMatch[1].trim();
      explicitTarget = explicitTarget.replace(/['"]/g, "").trim();
      const content = explicitWithMsgMatch[2].trim();
      const isMissionNegotiation = /^(?:fix|negotiate|discuss|deal|close|finalize|agree|settle|talk\s+about)\b/i.test(content);
      return {
        mode: "tool",
        actionId: "start_personal_outbound_mission",
        action: getAdminAction("start_personal_outbound_mission"),
        params: {
          target: explicitTarget,
          goal: content,
          isSendOnly: !isMissionNegotiation,
        },
        reasoning: `Executing personal WhatsApp ${isMissionNegotiation ? "mission" : "message"} to ${explicitTarget}`,
        routingTelemetry: { domain: "operations", plannerSource: "semantic_rule", toolName: "start_personal_outbound_mission", validation: "accepted" },
      };
    }

    // C. Explicit recipient without message:
    const explicitNoMsgMatch =
      strippedRaw.match(/^(?:just\s+)?message\s+(.+)$/i) ||
      strippedRaw.match(/^(?:just\s+)?contact\s+(.+)$/i) ||
      strippedRaw.match(/^(?:just\s+)?send\s+(?:a\s+message\s+to\s+)?(.+?)\s+(?:a\s+message|msg)$/i);

    if (explicitNoMsgMatch) {
      let explicitTarget = explicitNoMsgMatch[1].trim();
      explicitTarget = explicitTarget.replace(/['"]/g, "").trim();
      explicitTarget = explicitTarget.replace(/^(?:this\s+number\s+|contact\s+)/i, "").trim();
      const tLower = explicitTarget.toLowerCase();
      const hasActionOrGoal = /\b(?:and|fix|negotiate|discuss|deal|close|finalize|agree|settle|talk|ask|inquire|pricing|budget|quote|offer|service|per|month)\b/i.test(explicitTarget);
      if (
        !hasActionOrGoal &&
        !tLower.includes("overview") &&
        !tLower.includes("summary") &&
        !tLower.includes("report") &&
        !tLower.includes("order") &&
        !tLower.includes("product") &&
        !tLower.includes("settings")
      ) {
        return {
          mode: "conversation",
          reply: `What would you like me to send to ${explicitTarget}?`,
          reasoning: "Prompting only for missing message content for explicit target",
          params: { target: explicitTarget },
          routingTelemetry: { plannerSource: "semantic_rule", validation: "accepted" },
        };
      }
    }
  }

  // 1h. Direct Meeting Scheduling with pronouns or relative time
  const isMeetingIntent =
    (clean.includes("schedule") || clean.includes("set up") || clean.includes("fix")) &&
    (clean.includes("meeting") || clean.includes("google meet") || clean.includes("meet"));

  if (isMeetingIntent) {
    const usesPronoun = /\b(them|him|her|that person|that contact|same person)\b/i.test(clean);
    const activeTarget = memory?.activeContact?.displayName || memory?.activePhone || memory?.activePersonName;

    let target = usesPronoun && activeTarget ? activeTarget : undefined;
    if (!target && !usesPronoun) {
      const targetMatch = rawText.match(/with\s+([^,]+?)(?:\s+(?:in\s+\d+|at\s+\d+|tomorrow|for\s+\d+)|$)/i);
      if (targetMatch) {
        target = targetMatch[1].trim();
      }
    }

    const timeMatch = rawText.match(/\b(in\s+\d+\s*(?:minutes?|mins?|hours?|hrs?)|at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?|tomorrow(?:\s+at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?)\b/i);
    const timeExpr = timeMatch ? timeMatch[1].trim() : "in 15 minutes";

    if (!target && !activeTarget) {
      return {
        mode: "conversation",
        reply: "Who would you like to schedule the Google Meet meeting with? Please provide their name or phone number.",
        reasoning: "Prompting for recipient while retaining relative meeting time in pending meeting state",
        routingTelemetry: { plannerSource: "semantic_rule", validation: "accepted" },
      };
    }

    const finalTarget = target || activeTarget!;
    return {
      mode: "tool",
      actionId: "schedule_google_meeting",
      action: getAdminAction("schedule_google_meeting"),
      params: {
        target: finalTarget,
        time: timeExpr,
        durationMinutes: 30,
        purpose: "Google Meet Meeting",
      },
      reasoning: `Scheduling Google Meet meeting with ${finalTarget} for ${timeExpr}`,
      routingTelemetry: { domain: "operations", plannerSource: "semantic_rule", toolName: "schedule_google_meeting", validation: "accepted" },
    };
  }

  // 1h-2. Personal Mission Queries & Status Checking
  const isMissionQuery =
    clean.includes("what happened with that task") ||
    clean.includes("did they reply") ||
    clean.includes("did they respond") ||
    clean.includes("did starts digital reply") ||
    (clean.includes("what did") && (clean.includes("say") || clean.includes("reply") || clean.includes("offer"))) ||
    clean.includes("is that conversation still active") ||
    clean.includes("is that task still active") ||
    clean.includes("is that mission still active") ||
    clean.includes("status of that task") ||
    clean.includes("status of that mission") ||
    clean.includes("show my waiting tasks") ||
    clean.includes("show waiting tasks") ||
    clean.includes("my waiting tasks") ||
    clean.includes("my active tasks") ||
    clean.includes("waiting tasks");

  if (isMissionQuery) {
    if (clean.includes("show my waiting tasks") || clean.includes("show waiting tasks") || clean.includes("my waiting tasks") || clean.includes("waiting tasks")) {
      return {
        mode: "tool",
        actionId: "list_personal_outbound_missions",
        action: getAdminAction("list_personal_outbound_missions"),
        params: { status: "WAITING_FOR_REPLY" },
        reasoning: "Listing waiting personal missions on owner request",
        routingTelemetry: { domain: "operations", plannerSource: "semantic_rule", toolName: "list_personal_outbound_missions", validation: "accepted" },
      };
    }

    const activeTarget = memory?.activeContact?.displayName || memory?.activePersonName;
    return {
      mode: "tool",
      actionId: "get_personal_outbound_mission",
      action: getAdminAction("get_personal_outbound_mission"),
      params: {
        missionId: (memory as any)?.lastRawResult?.missionId || (memory as any)?.lastRawResult?.data?.missionId,
        target: activeTarget,
      },
      reasoning: "Querying personal mission progress for owner",
      routingTelemetry: { domain: "operations", plannerSource: "semantic_rule", toolName: "get_personal_outbound_mission", validation: "accepted" },
    };
  }

  // 1h-3. Personal Mission Cancellation
  const isMissionCancel =
    clean.includes("stop that discussion") ||
    clean.includes("cancel that task") ||
    clean.includes("cancel that mission") ||
    clean.includes("stop talking to") ||
    clean.includes("cancel discussion");

  if (isMissionCancel) {
    const activeTarget = memory?.activeContact?.displayName || memory?.activePersonName;
    return {
      mode: "tool",
      actionId: "cancel_personal_outbound_mission",
      action: getAdminAction("cancel_personal_outbound_mission"),
      params: {
        missionId: (memory as any)?.lastRawResult?.missionId || (memory as any)?.lastRawResult?.data?.missionId,
        target: activeTarget,
      },
      reasoning: "Cancelling personal mission on owner instruction",
      routingTelemetry: { domain: "operations", plannerSource: "semantic_rule", toolName: "cancel_personal_outbound_mission", validation: "accepted" },
    };
  }

  // 1h-4. Owner Answer for Mission awaiting input
  if (clean.startsWith("answer for ") || clean.startsWith("answer to ")) {
    const answerMatch = rawText.match(/^(?:answer\s+(?:for|to)\s+([^:]+?)\s*:\s*(.+))$/i);
    if (answerMatch) {
      const target = answerMatch[1].trim();
      const answer = answerMatch[2].trim();
      return {
        mode: "tool",
        actionId: "provide_personal_mission_information",
        action: getAdminAction("provide_personal_mission_information"),
        params: { target, answer },
        reasoning: "Supplying owner answer to recipient awaiting input",
        routingTelemetry: { domain: "operations", plannerSource: "semantic_rule", toolName: "provide_personal_mission_information", validation: "accepted" },
      };
    }
  }

  // 1i. Direct Phone Number or Contact Search
  // Ensure isDirectPhone ONLY triggers on pure phone format inputs (e.g. "+92 325 0872796", "0325-0872796"), NEVER on conversational sentences
  const isPurePhoneFormat = /^[\s+0-9()\-]{7,25}$/.test(rawText.trim());
  const digits = rawText.replace(/\D/g, "");
  const isDirectPhone = isPurePhoneFormat && digits.length >= 8 && digits.length <= 15;
  const isExplicitContactLookup =
    clean.startsWith("find contact ") ||
    clean.startsWith("search contact ") ||
    clean.startsWith("lookup contact ") ||
    clean.startsWith("find personal contact ") ||
    clean.startsWith("search personal contact ") ||
    clean.startsWith("find ") ||
    clean.startsWith("search ");

  if (isDirectPhone && !memory?.pendingMeeting && !memory?.pendingPersonalMessage) {
    return {
      mode: "tool",
      actionId: "find_personal_contact",
      action: getAdminAction("find_personal_contact"),
      params: { query: rawText.trim() },
      reasoning: "Direct phone number search for personal contact",
      routingTelemetry: { domain: "operations", plannerSource: "semantic_rule", toolName: "find_personal_contact", validation: "accepted" },
    };
  }

  if (isExplicitContactLookup) {
    if (!clean.includes("order") && !clean.includes("product") && !clean.includes("customer") && !clean.includes("lead")) {
      const q = rawText.replace(/^(?:find|search|lookup)(?:\s+personal)?(?:\s+contact)?\s+/i, "").trim();
      if (q) {
        return {
          mode: "tool",
          actionId: "find_personal_contact",
          action: getAdminAction("find_personal_contact"),
          params: { query: q },
          reasoning: "Explicit personal contact lookup",
          routingTelemetry: { domain: "operations", plannerSource: "semantic_rule", toolName: "find_personal_contact", validation: "accepted" },
        };
      }
    }
  }

  // 2. Explicit System Help vs Dynamic Capabilities
  if (clean === "help" || clean === "madad" || clean === "/help" || clean === ".help" || clean === "show commands") {
    return { mode: "help", routingTelemetry: { plannerSource: "semantic_rule", validation: "accepted" } };
  }

  if (
    clean === "what can you do" ||
    clean === "what can you do for me" ||
    clean === "what can you do for me?" ||
    clean === "what can you do?" ||
    clean === "what do you do" ||
    clean === "what do you do for me" ||
    clean === "capabilities" ||
    clean === "menu" ||
    clean === "options" ||
    clean.startsWith("what can you do") ||
    clean.startsWith("how can you help") ||
    clean === "what can i ask" ||
    clean === "features"
  ) {
    const capAction = getAdminAction("get_assistant_capabilities");
    return {
      mode: "tool",
      actionId: "get_assistant_capabilities",
      action: capAction,
      params: {},
      reasoning: "Dynamic capability inquiry grounded in live system state",
      routingTelemetry: { plannerSource: "semantic_rule", validation: "accepted" },
    };
  }

  // 3. Multi-Item Service Addition Proposal (BlackArrow Plans as Services)
  if (
    clean.includes("add blackarrow plans") ||
    clean.includes("add blackarrow plan") ||
    (clean.includes("blackarrow") && (clean.includes("service") || clean.includes("services"))) ||
    (clean.includes("blackarrow") && (clean.includes("plan") || clean.includes("plans")))
  ) {
    const pStarter = BILLING_PLAN_DETAILS.starter_plan;
    const pGrowth = BILLING_PLAN_DETAILS.growth_plan;
    const pPro = BILLING_PLAN_DETAILS.pro_plan;

    const previewMsg =
      `📦 *Proposed Additions to Service Catalog:*\n\n` +
      `1. *${pStarter.name} Plan* — $${pStarter.monthlyPrice}/mo\n` +
      `   • Highlights: ${pStarter.highlights.join(", ")}\n` +
      `2. *${pGrowth.name} Plan* — $${pGrowth.monthlyPrice}/mo\n` +
      `   • Highlights: ${pGrowth.highlights.join(", ")}\n` +
      `3. *${pPro.name} Plan* — $${pPro.monthlyPrice}/mo\n` +
      `   • Highlights: ${pPro.highlights.join(", ")}\n\n` +
      `Would you like me to add these 3 BlackArrow service plans to your catalog? (Reply *YES* to confirm).`;

    return {
      mode: "conversation",
      reply: previewMsg,
      offeredAction: {
        actionId: "batch_create_blackarrow_plans",
        description: "add BlackArrow Starter, Growth, and Pro plans to catalog",
        params: { batch: "blackarrow_plans" },
      },
      reasoning: "Formulated batch service addition proposal from canonical pricing config",
      routingTelemetry: { plannerSource: "semantic_rule", validation: "accepted" },
    };
  }

  // 4. Connection Status Contradiction / Live Health Inquiry
  if (
    clean.includes("how you are talking to me") ||
    clean.includes("how are you talking to me") ||
    (clean.includes("talking to me") && (clean.includes("disconnect") || clean.includes("offline") || clean.includes("disconneded"))) ||
    (clean.includes("replying") && (clean.includes("disconnect") || clean.includes("offline") || clean.includes("disconneded"))) ||
    ((clean.includes("disconnect") || clean.includes("disconneded")) && clean.includes("talking"))
  ) {
    return {
      mode: "tool",
      actionId: "get_instance_status",
      action: getAdminAction("get_instance_status"),
      params: {},
      reasoning: "Authoritative live connection status inquiry",
      routingTelemetry: { domain: "ai_studio", plannerSource: "semantic_rule", toolName: "get_instance_status", validation: "accepted" },
    };
  }

  // 5. Owner360 Profile Inquiries (Section 14)
  if (
    clean === "what do you know about me" ||
    clean === "what do you know about me?" ||
    clean === "what do you know about me as pa" ||
    clean === "what do you know about me as pa?" ||
    clean === "what do you know about me as my pa" ||
    clean === "what do you know about me as my pa?" ||
    clean.includes("what do you know about me") ||
    clean.includes("what information do you have saved about me") ||
    clean.includes("what information do you have on me") ||
    clean.includes("what do you have on me") ||
    clean.includes("what have you saved about me") ||
    clean.includes("what have you stored about me") ||
    clean.includes("what do you have saved about me") ||
    clean.includes("what is saved about me") ||
    clean.includes("tell me about my profile") ||
    clean.includes("tell me what you know about me") ||
    clean.includes("saved about me") ||
    clean.includes("stored about me") ||
    clean.includes("about my profile") ||
    clean.includes("know me as pa") ||
    clean.includes("know about me as pa") ||
    clean === "show my profile" ||
    clean === "my owner profile" ||
    clean === "what is my profile" ||
    clean === "view my profile" ||
    clean === "owner profile" ||
    clean === "my profile" ||
    clean === "profile"
  ) {
    return {
      mode: "tool",
      actionId: "get_owner_profile",
      action: getAdminAction("get_owner_profile"),
      params: {},
      reasoning: "Owner360 stored profile inquiry",
      routingTelemetry: { domain: "operations", plannerSource: "semantic_rule", toolName: "get_owner_profile", validation: "accepted" },
    };
  }

  // 6. Personal Contacts Inquiries
  if (
    clean === "list personal contacts" ||
    clean === "my personal contacts" ||
    clean === "show personal contacts" ||
    clean === "personal contacts"
  ) {
    return {
      mode: "tool",
      actionId: "list_personal_contacts",
      action: getAdminAction("list_personal_contacts"),
      params: {},
      reasoning: "Personal contacts list inquiry",
      routingTelemetry: { domain: "operations", plannerSource: "semantic_rule", toolName: "list_personal_contacts", validation: "accepted" },
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// 7. PRIMARY NATIVE TOOL CALLING PLANNER & 1-SHOT REPAIR
// ---------------------------------------------------------------------------

export async function resolveAdminAgentIntent(input: {
  text: string;
  context: AdminBusinessAssistantContext;
  memory?: AdminConversationMemory;
}): Promise<AdminAgentResolvedIntent> {
  const { text, context, memory } = input;
  const adminModel = agentDeps.getAdminBusinessAgentModel();

  // 1. Fast Deterministic Guard Checks (affirmative, cancel, help, batch plans)
  const guardMatch = matchDeterministicGuards(text, memory);
  const isActionablePersonalCommand =
    !memory?.pendingPersonalMessage &&
    !memory?.pendingMeeting &&
    (guardMatch?.actionId === "start_personal_outbound_mission" ||
     Boolean(guardMatch?.reply && guardMatch.reply.startsWith("What would you like me to send to")));

  if (guardMatch && !isActionablePersonalCommand) {
    return guardMatch;
  }

  // 2. AI Domain Classification
  const domainRes = await classifyAdminDomain({ text, context, memory });
  const { primaryDomain, secondaryDomain } = domainRes;

  // 3. Focused Tool Subset (5-12 tools)
  const focusedTools = buildFocusedToolDefinitions(context, primaryDomain, secondaryDomain);

  // 4. Build Native Planning Context
  const activeContactName = memory?.activeContact?.displayName || memory?.activePersonName || "";
  const activePhoneNum = memory?.activeContact?.canonicalPhone || memory?.activePhone || "";

  const systemPrompt = `
You are the BlackArrow Admin Business Assistant, an intelligent, natural AI copilot for the authorized business owner.
Assist the authorized administrator by understanding their natural language intent and selecting the exact appropriate tool function.

MULTILINGUAL INTELLIGENCE:
- The owner may speak in English, Urdu, Roman Urdu, Arabic, Hindi, Punjabi, or another language.
- Understand semantic intent regardless of language. Do NOT require exact English keywords.
- A messaging request in Urdu ("use message kar do ke...") or Roman Urdu ("use bolo ke...") or Arabic ("أرسل له رسالة...") selects the exact same tool as English ("message him that..."): start_personal_outbound_mission(target, goal).
- An inquiry about what you know about the owner in Urdu ("mere baray me kya jantay ho") or Arabic ("ماذا تعرف عني") selects get_owner_profile(), just like English ("what do you know about me").

CRITICAL DISTINCTIONS:
- Platform Wallet vs Business Sales:
  • "wallet balance", "how much money left", "kitne paise bache hain" -> call get_wallet_balance()
  • "wallet use of last 3 days", "wallet usage yesterday", "kitna credit kharch hua" -> call get_usage_summary(range or days)
  • "yesterday sales", "revenue last 3 days", "order performance" -> call get_business_metrics(range or days)
- Owner360 Personal Knowledge vs Business Profile:
  • "What do you know about me", "What do you know about me as PA", "mere baray me kya jantay ho", "Show my profile" -> call get_owner_profile()
  • "Do you know about my business?", "What do you know about my company?", "meri company ke baray me kya jantay ho" -> call get_business_profile_summary()
  • "How is business today?", "Overview?", "aaj ka karobar kaisa hai" -> call get_business_overview()
- Personal Contacts & Outbound Messaging / Missions:
  • "find contact", "search phone", phone lookup -> call find_personal_contact(query)
  • "contact someone", "ask a business about a service", "negotiate terms", "request a quotation", "follow up with a supplier", "discuss monthly pricing", "make an offer", "continue a negotiation", in English, Urdu ("un se baat karo aur deal fix karo"), Roman Urdu ("supplier se rate negotiate karo"), or any language -> call start_personal_outbound_mission(...)
  • For start_personal_outbound_mission, provide separate structured arguments:
    - contactName: target person or business name (e.g. "Starts Digital")
    - contactPhone: clean phone number if explicitly provided (e.g. "+194019413064"). NEVER combine budget digits into the phone number!
    - objective: core goal, message, or task (e.g. "discuss website development service", "negotiate monthly pricing")
    - budgetConstraint: financial limit or budget mentioned (e.g. "20k/month", "$500"). Keep strictly separate from contactPhone!
    - isSendOnly: false if negotiating, discussing, or expecting a reply; true only if simple one-way delivery.
  • If recipient is known from context ("${activeContactName}"), use that target. If message content is missing, ask naturally what to send.
- Lead Routing & Departments:
  • "list departments", "show departments", "kon se departments hain", "hamare departments" -> call list_departments()
  • "lead routing status", "where was lead 123 sent", "lead kis department ko gayi" -> call get_lead_routing_status(leadId)
  • "reassign lead", "lead transfer karo" -> call reassign_lead_department(leadId, departmentId, reason)
- Aggregate Counts vs Customer Activity:
  • "how many customers do I have", "total customers and orders", "kitne customer hain" -> call get_business_counts_summary()
  • "how many customers talked to us in last 7 days", "customer conversation activity" -> call get_customer_activity_summary(range or days)
- Products & Catalog:
  • "list products", "catalog", "show products" -> call list_products()
  • "turn all products from physical to service", "change product type" -> call update_product_type(type: "service", bulk: true)
- Admin Reminders:
  • "remind me at 4PM", "mujhe yaad karwana" -> call create_admin_reminder(text, scheduledAt)
  • "show my reminders", "list reminders" -> call list_admin_reminders()
  • "cancel reminder" -> call cancel_admin_reminder(reminderId or query)
- WhatsApp Instance Health:
  • "bot status", "instance status", "is bot connected" -> call get_instance_status()
  • "is AI running", "ai reply status" -> call get_ai_reply_status()

ACTIVE CONVERSATION CONTEXT:
- Active Contact / Referent: "${activeContactName || "none"}" (Phone: "${activePhoneNum || "none"}")
- Active Entity: "${memory?.activeEntity || "none"}"
- Previous Topic: "${memory?.lastTopic || "none"}"
- Previous Action: "${memory?.lastActionId || "none"}"
- Previous Period: "${memory?.lastPeriod || "none"}"
- Pending Personal Message: ${memory?.pendingPersonalMessage ? JSON.stringify(memory.pendingPersonalMessage) : "none"}
- Pending Meeting: ${memory?.pendingMeeting ? JSON.stringify(memory.pendingMeeting) : "none"}
- Pending Task: ${memory?.pendingTask ? JSON.stringify(memory.pendingTask) : "none"}
`.trim();

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemPrompt },
    { role: "user", content: text },
  ];

  try {
    // 5. Native Tool Calling Request
    const planRes = await agentDeps.generateBackendText({
      purpose: "admin_assistant_intent",
      accountId: context.accountId,
      botId: context.botId,
      modelOverride: adminModel,
      messages,
      tools: focusedTools,
      tool_choice: "auto",
      maxTokens: 250,
      temperature: 0.0,
      timeoutMs: 6000,
    });

    if (planRes.requestStatus === "success") {
      // Check for native tool call
      if (Array.isArray(planRes.toolCalls) && planRes.toolCalls.length > 0) {
        const tc = planRes.toolCalls[0];
        const actionDef = getAdminAction(tc.name);

        if (actionDef) {
          const auth = canExecuteAdminBusinessAction({
            role: context.adminRole,
            action: actionDef,
            channel: "whatsapp",
          });

          if (auth.allowed) {
            return {
              mode: "tool",
              actionId: tc.name,
              action: actionDef,
              params: tc.arguments || {},
              reasoning: `Resolved via native tool call (${tc.name})`,
              routingTelemetry: {
                domain: primaryDomain,
                secondaryDomain,
                plannerSource: "native_tool_call",
                toolCallId: tc.id,
                toolName: tc.name,
                validation: "accepted",
                modelUsed: planRes.model,
              },
            };
          } else {
            return {
              mode: "tool",
              actionId: tc.name,
              action: actionDef,
              params: tc.arguments || {},
              reasoning: `Tool not authorized: ${auth.reason}`,
              routingTelemetry: {
                domain: primaryDomain,
                plannerSource: "native_tool_call",
                toolName: tc.name,
                validation: "unauthorized",
                fallbackReason: "tool_not_authorized",
                modelUsed: planRes.model,
              },
            };
          }
        } else {
          console.warn(`[AdminAgent] Model called unknown actionId: ${tc.name}`);
        }
      }

      // If text response returned (conversational or direct reply)
      if (planRes.text && !cleanPunctuation(text).includes("wallet") && !cleanPunctuation(text).includes("business")) {
        return {
          mode: "conversation",
          reply: planRes.text,
          reasoning: "Direct conversational response from model",
          routingTelemetry: {
            domain: primaryDomain,
            plannerSource: "conversation",
            validation: "accepted",
            modelUsed: planRes.model,
          },
        };
      }
    }

    // 6. One-Shot Bounded Structured Repair (if native tool calling returned empty for factual query)
    const repairSchema = {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["tool", "conversation", "clarify"] },
        actionId: {
          type: "string",
          enum: focusedTools.map((t) => t.function.name),
        },
        range: {
          type: "string",
        },
        days: {
          type: "number",
        },
        clarifyQuestion: { type: "string" },
      },
      required: ["mode"],
      additionalProperties: false,
    };

    const repairRes = await agentDeps.generateBackendText({
      purpose: "admin_assistant_intent",
      accountId: context.accountId,
      botId: context.botId,
      modelOverride: adminModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text },
        { role: "system", content: "Select the required tool actionId and period parameter from the schema." },
      ],
      maxTokens: 150,
      temperature: 0.0,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "tool_repair",
          strict: true,
          schema: repairSchema,
        },
      },
      timeoutMs: 4000,
    });

    if (repairRes.requestStatus === "success" && repairRes.text) {
      const repaired = JSON.parse(repairRes.text);
      if (repaired?.mode === "tool" && repaired.actionId) {
        const actionDef = getAdminAction(repaired.actionId);
        if (actionDef) {
          const params: Record<string, any> = {};
          if (repaired.days) params.days = Number(repaired.days);
          if (repaired.range && repaired.range !== "none") params.range = repaired.range;
          return {
            mode: "tool",
            actionId: repaired.actionId,
            action: actionDef,
            params,
            reasoning: "Resolved via structured 1-shot repair",
            routingTelemetry: {
              domain: primaryDomain,
              secondaryDomain,
              plannerSource: "repair_json_schema",
              toolName: repaired.actionId,
              validation: "accepted",
              modelUsed: repairRes.model,
            },
          };
        }
      }
    }
  } catch (llmErr: any) {
    console.warn("[AdminAgent] Planner error:", llmErr);
  }

  // 7. Contextual Ambiguity Clarification (Not generic menu dump)
  const clarifyQuestion = buildNaturalAmbiguityClarification(text, context);

  return {
    mode: "clarify",
    clarifyQuestion,
    routingTelemetry: {
      domain: primaryDomain,
      plannerSource: "clarify",
      fallbackReason: "planner_clarification",
      modelUsed: adminModel,
    },
  };
}

/**
 * Builds a natural, context-aware clarification question when intent is ambiguous or unresolvable.
 * Supports English, Urdu, Roman Urdu, and Arabic without dropping into English regexes or canned templates.
 */
export function buildNaturalAmbiguityClarification(
  text: string,
  _context?: AdminBusinessAssistantContext
): string {
  const clean = cleanPunctuation(text);
  const rawLower = String(text || "").toLowerCase().trim();

  // 1. Urdu (Arabic script with Urdu-specific characters or common Urdu vocabulary)
  const isArabicScript = /[\u0600-\u06FF]/.test(text);
  const isUrduScript =
    isArabicScript &&
    (/[ٹڈڑںےہئےپچژگ]/.test(text) ||
      /\b(کیا|ہیں|ہے|کا|کی|کے|کو|میں|سے|اور|نہیں|والٹ|خاتہ|روپے|پیسے|حساب|رپورٹ|بتائیں|کرو|کریں|کیسے|کون)\b/.test(text));

  if (isUrduScript) {
    if (/والٹ|پیسے|روپے|خرچہ|بیلنس|کریڈٹ/.test(text)) {
      return "کیا آپ BlackArrow والٹ کریڈٹ کے بارے میں پوچھ رہے ہیں یا اپنے کاروباری اخراجات اور سیلز کے بارے میں؟";
    }
    if (/آرڈر|کسٹمر|گاہک|رابطہ/.test(text)) {
      return "کیا آپ حالیہ آرڈرز چیک کرنا چاہتے ہیں یا کسی مخصوص کسٹمر کے بارے میں؟";
    }
    return "کیا آپ وضاحت کر سکتے ہیں کہ آپ کس مخصوص کاروباری معلومات یا کام کے بارے میں جاننا چاہتے ہیں؟";
  }

  // 2. Arabic (Arabic script without Urdu-specific markers)
  if (isArabicScript) {
    if (/رصيد|محفظة|تكلفة|مصاريف|أموال/.test(text)) {
      return "هل تقصد رصيد محفظة BlackArrow أم مبيعات ونفقات عملك؟";
    }
    if (/طلب|طلبات|عميل|عملاء|شحنة/.test(text)) {
      return "هل تود الاطلاع على أحدث الطلبات أم البحث عن عميل محدد؟";
    }
    return "هل يمكنك توضيح التفاصيل المحددة التي تود التحقق منها؟";
  }

  // 3. Roman Urdu
  const isRomanUrdu =
    /\b(kya|ye|yeh|wo|woh|hai|hain|ka|ki|ke|ko|mein|men|se|aur|nahi|nahin|batao|bataen|bataein|karo|karein|bhejo|mujhe|ap|aap|mera|meri|mere|hum|humein|kitna|kitne|pata|chahiye|chal|raha|rahi|aaj|kal|parson|hisab|kharcha|masla|grahak|paise|rupay)\b/i.test(
      rawLower
    );

  if (isRomanUrdu) {
    if (/\b(paise|rupay|kharcha|kharch|wallet|balance|spend|credits)\b/i.test(rawLower)) {
      return "Kya aap BlackArrow wallet credit check karna chahtay hain ya business sales aur expenses?";
    }
    if (/\b(order|orders|customer|customers|grahak)\b/i.test(rawLower)) {
      return "Kya aap recent orders dekhna chahtay hain ya kisi specific customer contact ko search karna chahtay hain?";
    }
    return "Kya aap wazeh kar saktay hain ke aap business ki kis cheez ke baray mein janna chahtay hain?";
  }

  // 4. English (Default)
  if (/\b(spend|cost|costs|burn|wallet|balance|credit|credits)\b/i.test(rawLower)) {
    return "Do you mean how much BlackArrow platform wallet credit was used, or your business sales and expenses?";
  }
  if (/\b(order|orders|customer|customers|lead|leads)\b/i.test(rawLower)) {
    return "Would you like me to check your recent orders or search for a specific customer contact?";
  }
  return "Could you please clarify what specific business details you'd like to check?";
}

// ---------------------------------------------------------------------------
// 8. TOOL EXECUTION, BATCH MUTATION & AUDIT
// ---------------------------------------------------------------------------

export async function executeAdminAgentIntent(input: {
  intent: AdminAgentResolvedIntent;
  context: AdminBusinessAssistantContext;
  rawText: string;
}): Promise<AdminAgentExecutionResult> {
  const { intent, context, rawText } = input;
  const memory = getAdminConversationContext(context.accountId, context.adminJid);

  // Log internal telemetry
  if (intent.routingTelemetry) {
    recordAdminAuditEvent({
      accountId: context.accountId,
      adminJidMasked: context.adminJid,
      botId: context.botId,
      actionId: intent.actionId || "admin_intent_routing",
      riskLevel: "READ",
      confirmationRequired: false,
      executionResult: intent.mode === "clarify" ? "failed" : "success",
      failureReason: intent.routingTelemetry.fallbackReason,
      metadata: {
        domain: intent.routingTelemetry.domain,
        plannerSource: intent.routingTelemetry.plannerSource,
        toolCallId: intent.routingTelemetry.toolCallId,
        validation: intent.routingTelemetry.validation,
        model: intent.routingTelemetry.modelUsed,
      },
    });
  }

  // 1. Handle Help Mode
  if (intent.mode === "help") {
    const helpText = intent.reply || buildAdminCapabilityHelpText(context.adminRole);

    saveAdminConversationContext({
      accountId: context.accountId,
      adminJid: context.adminJid,
      lastTopic: "help",
      lastActionId: "help",
      lastResourceType: "general",
      activeContact: memory?.activeContact,
      activePhone: memory?.activePhone,
      activePersonName: memory?.activePersonName,
      pendingMeeting: memory?.pendingMeeting,
    });

    return {
      handled: true,
      replyText: helpText,
      mode: "help",
    };
  }

  // 2. Handle Conversational Mode
  if (intent.mode === "conversation") {
    let pendingOfferedAction: PendingOfferedAction | undefined = undefined;
    if (intent.offeredAction) {
      pendingOfferedAction = {
        actionId: intent.offeredAction.actionId,
        params: intent.offeredAction.params,
        description: intent.offeredAction.description,
        createdAt: Date.now(),
        expiresAt: Date.now() + 5 * 60 * 1000,
      };
    }

    let pendingMeeting: PendingMeetingState | undefined = memory?.pendingMeeting;
    if (intent.reply && intent.reply.includes("Who would you like to schedule the Google Meet meeting with")) {
      pendingMeeting = {
        timeExpression: intent.params?.time || "in 15 minutes",
        durationMinutes: intent.params?.durationMinutes || 30,
        purpose: intent.params?.purpose || "Google Meet Meeting",
        requiresClarification: "recipient",
      };
    }

    let pendingPersonalMessage: PendingPersonalMessageState | undefined = memory?.pendingPersonalMessage;
    if (intent.reply && intent.reply.startsWith("What would you like me to send to")) {
      const targetMatch = intent.reply.match(/What would you like me to send to\s+([^?]+)\?/i);
      const target = targetMatch ? targetMatch[1].trim() : (intent.params?.target || memory?.activeContact?.displayName || memory?.activePhone || memory?.activePersonName);
      pendingPersonalMessage = {
        target,
        requiresClarification: "message",
      };
    } else if (intent.reply && intent.reply.includes("Who would you like me to message")) {
      pendingPersonalMessage = {
        goal: intent.params?.goal || intent.params?.message,
        requiresClarification: "recipient",
      };
    }

    saveAdminConversationContext({
      accountId: context.accountId,
      adminJid: context.adminJid,
      lastTopic: pendingPersonalMessage ? "personal_assistant" : "general",
      lastActionId: "conversation",
      lastResourceType: pendingPersonalMessage ? "contact" : "general",
      pendingOfferedAction,
      pendingMeeting,
      pendingPersonalMessage,
      activeContact: memory?.activeContact,
      activePhone: memory?.activePhone,
      activePersonName: memory?.activePersonName,
    });

    return {
      handled: true,
      replyText: intent.reply || "I am running normally and ready to assist you.",
      mode: "conversation",
    };
  }

  // 3. Handle Clarification Mode
  if (intent.mode === "clarify") {
    return {
      handled: true,
      replyText: intent.clarifyQuestion || buildNaturalAmbiguityClarification(rawText, context),
      mode: "clarify",
    };
  }

  // 4. Handle Batch BlackArrow Service Plans Creation
  if (intent.actionId === "batch_create_blackarrow_plans") {
    const plans = [
      {
        name: "Starter Plan",
        base_price: BILLING_PLAN_DETAILS.starter_plan.monthlyPrice,
        description: "1 WhatsApp instance, 5 products/services, 1,000 customers",
        stock: 999,
        type: "service",
        category: "Subscription Plans",
      },
      {
        name: "Growth Plan",
        base_price: BILLING_PLAN_DETAILS.growth_plan.monthlyPrice,
        description: "3 WhatsApp instances, 30 products/services, 10,000 customers",
        stock: 999,
        type: "service",
        category: "Subscription Plans",
      },
      {
        name: "Pro Plan",
        base_price: BILLING_PLAN_DETAILS.pro_plan.monthlyPrice,
        description: "10 WhatsApp instances, 100 products/services, 50,000 customers",
        stock: 999,
        type: "service",
        category: "Subscription Plans",
      },
    ];

    for (const plan of plans) {
      await handleCreateProduct(context, plan);
    }

    saveAdminConversationContext({
      accountId: context.accountId,
      adminJid: context.adminJid,
      lastTopic: "products",
      lastActionId: "create_product",
      lastResourceType: "product",
      pendingOfferedAction: undefined,
    });

    return {
      handled: true,
      replyText:
        `✅ *3 BlackArrow Service Plans Added Successfully!*\n\n` +
        `• *Starter Plan:* $${plans[0].base_price}/mo\n` +
        `• *Growth Plan:* $${plans[1].base_price}/mo\n` +
        `• *Pro Plan:* $${plans[2].base_price}/mo\n\n` +
        `Your catalog has been updated and is ready for customer inquiries.`,
      mode: "tool",
      actionExecuted: "batch_create_blackarrow_plans",
    };
  }

  // 5. Handle Standard Registered Tools
  if (intent.mode === "tool" && intent.action) {
    const action = intent.action;

    // Server-side Authorization Check
    const permission = canExecuteAdminBusinessAction({
      role: context.adminRole,
      action,
      channel: "whatsapp",
    });

    if (!permission.allowed) {
      recordAdminAuditEvent({
        accountId: context.accountId,
        adminJidMasked: context.adminJid,
        botId: context.botId,
        actionId: action.actionId,
        riskLevel: action.riskLevel,
        confirmationRequired: action.requiresConfirmation,
        executionResult: "denied",
        failureReason: permission.reason,
      });

      const refusalText =
        permission.reason === "critical_action_dashboard_only"
          ? `⚠️ *Action Not Permitted via WhatsApp*\n\nDestructive and permanent deletion operations cannot be performed through WhatsApp for security reasons.\n\nPlease log in to the BlackArrow Dashboard: https://blackarrow-source.offline.invalid/dashboard`
          : `⚠️ You do not have permission to execute *${action.label}* (Required: ${action.requiredRole}, Current: ${context.adminRole}).`;

      return {
        handled: true,
        replyText: refusalText,
        mode: "tool",
        error: permission.reason,
      };
    }

    // Confirmation Requirement for Sensitive Writes
    if (action.requiresConfirmation) {
      if (action.actionId === "update_product_type") {
        const rawTargetType = String(intent.params?.targetType || intent.params?.type || "service").toLowerCase().trim();
        const targetType = (rawTargetType === "service" || rawTargetType === "digital" || rawTargetType.includes("service")) ? "service" : "physical";
        const products = (await dbService.listProducts(context.accountId).catch(() => [])) as any[];
        const queryName = String(intent.params?.productName || "").trim().toLowerCase();
        const isBulk = Boolean(
          intent.params?.bulk ||
          (!intent.params?.productId && (!queryName || queryName === "all" || queryName.includes("all product") || queryName.includes("all")))
        );

        if (isBulk) {
          const eligible = products.filter((p: any) => (p.type || "physical") !== targetType);
          if (eligible.length === 0) {
            // Zero-change: DO NOT request confirmation
            return {
              handled: true,
              replyText: `ℹ️ All ${products.length} current catalog items are already set to ${targetType === "service" ? "services" : "physical products"}. There is nothing to change.`,
              mode: "tool",
              actionExecuted: "update_product_type",
            };
          }
          // Items to convert -> freeze IDs and request confirmation preview
          const frozenIds = eligible.map((p: any) => p.$id || p.id);
          const previewList = eligible.map((p: any) => `• *${p.name}* (${p.type || "physical"} ➔ ${targetType})`).join("\n");
          const previewText = `Confirm converting *${eligible.length}* product(s) to ${targetType === "service" ? "Services" : "Physical Products"}?\n\n${previewList}`;
          return {
            handled: true,
            replyText: previewText,
            mode: "tool",
            requiresConfirmation: true,
            confirmationPreviewText: previewText,
            pendingParams: {
              ...intent.params,
              targetType,
              bulk: true,
              confirmedProductIds: frozenIds,
            },
            actionExecuted: "update_product_type",
          };
        } else {
          const product = products.find((p: any) =>
            (intent.params?.productId && (p.$id === intent.params.productId || p.id === intent.params.productId)) ||
            (queryName && p.name && p.name.toLowerCase().includes(queryName))
          );
          if (product && (product.type || "physical") === targetType) {
            return {
              handled: true,
              replyText: `ℹ️ *${product.name}* is already set to ${targetType === "service" ? "Service" : "Physical Product"}. No changes needed.`,
              mode: "tool",
              actionExecuted: "update_product_type",
            };
          }
        }
      }

      if (action.actionId === "add_owner_address") {
        const previewText = `Confirm saving *${intent.params?.label || "Home"}* address: ${intent.params?.addressLine1 || ""}, ${intent.params?.city || ""}?`;
        return {
          handled: true,
          replyText: previewText,
          mode: "tool",
          requiresConfirmation: true,
          confirmationPreviewText: previewText,
          pendingParams: intent.params,
          actionExecuted: "add_owner_address",
        };
      }

      if (action.actionId === "update_owner_privacy") {
        const target = intent.params?.target || "profile item";
        const policy = intent.params?.privacyPolicy || "ALLOW_FOR_AUTHORIZED_TASK";
        const previewText = `Confirm updating privacy for *${target}* to *${policy}*? (This allows your Personal Assistant to use it for authorized tasks)`;
        return {
          handled: true,
          replyText: previewText,
          mode: "tool",
          requiresConfirmation: true,
          confirmationPreviewText: previewText,
          pendingParams: intent.params,
          actionExecuted: "update_owner_privacy",
        };
      }

      let previewText = `Confirm execution of *${action.label}*?`;
      if (action.actionId === "update_product_price") {
        const prodName = intent.params?.productName || intent.params?.product || intent.params?.name || "product";
        const newPrice = intent.params?.newPrice ?? intent.params?.price;
        previewText = `Confirm updating price of *${prodName}* to *${newPrice}*?`;
      } else if (action.actionId === "invite_team_member") {
        previewText = `Confirm sending team invitation to *${intent.params?.email}* (Role: \`${intent.params?.role || "member"}\`)?`;
      } else if (action.actionId === "cancel_order") {
        previewText = `Confirm cancellation of Order *${intent.params?.orderReference || intent.params?.orderId}*?`;
      } else if (action.actionId === "enable_ai_chat_replies") {
        previewText = `Confirm turning ON AI automated replies for customer WhatsApp chats?`;
      } else if (action.actionId === "disable_ai_chat_replies") {
        previewText = `Confirm turning OFF AI automated replies for customer WhatsApp chats?`;
      } else if (action.actionId === "set_ai_reply_enabled") {
        previewText = `Confirm turning ${intent.params?.enabled ? "ON" : "OFF"} AI automated replies for customer WhatsApp chats?`;
      } else if (action.actionId === "create_broadcast") {
        previewText = `Confirm preparing and dispatching WhatsApp broadcast campaign?`;
      } else if (action.actionId === "create_fixed_followup" || action.actionId === "create_followup") {
        previewText = `Confirm creating Fixed Follow-up automation after ${intent.params?.delayHours || 24} hours?`;
      } else if (action.actionId === "create_smart_followup") {
        previewText = `Confirm creating AI Smart Follow-up automation after ${intent.params?.delayHours || 48} hours?`;
      }

      return {
        handled: true,
        replyText: previewText,
        mode: "tool",
        requiresConfirmation: true,
        confirmationPreviewText: previewText,
        pendingParams: intent.params,
        actionExecuted: action.actionId,
      };
    }

    // Direct Execution
    try {
      let result: any;
      if (agentDeps.executeAdminAction) {
        result = await agentDeps.executeAdminAction(action.actionId, intent.params, context);
      } else {
        if (!action.handler) {
          throw new Error(`Handler missing for action: ${action.actionId}`);
        }
        result = await action.handler(context, intent.params);
      }

      if (result && result.success === false) {
        return {
          handled: true,
          replyText: result.message || result.error || "Action failed.",
          mode: "tool",
          actionExecuted: action.actionId,
          error: result.error || "action_failed",
        };
      }

      // Determine topic and context tracking
      let topic: any = "general";
      let resourceType: any = "general";
      let resourceId: string | undefined = undefined;

      if (action.actionId.includes("wallet") || action.actionId.includes("usage") || action.actionId.includes("billing") || action.category === "account") {
        topic = "billing";
        resourceType = "billing";
      } else if (action.actionId.includes("order")) {
        topic = "orders";
        resourceType = "order";
        resourceId = result.data?.orderReference || result.data?.orderId || result.data?.orders?.[0]?.$id;
      } else if (action.actionId.includes("product") || action.actionId.includes("stock")) {
        topic = "products";
        resourceType = "product";
      } else if (action.actionId.includes("customer") || action.actionId.includes("lead")) {
        topic = "customers";
        resourceType = "customer";
        resourceId = result.data?.phone || result.data?.customerId;
      } else if (action.actionId.includes("instance") || action.actionId.includes("bot") || action.actionId.includes("ai")) {
        topic = "ai_studio";
        resourceType = "bot";
      } else if (action.actionId.includes("meeting") || action.actionId.includes("calendar")) {
        topic = "meeting";
        resourceType = "calendar";
      } else if (action.actionId.includes("contact") || action.actionId.includes("mission")) {
        topic = "personal_assistant";
        resourceType = "contact";
      } else if (action.category === "business") {
        topic = "business";
      }

      let activeContact: ActiveContactReferent | undefined = memory?.activeContact;
      let activePhone: string | undefined = memory?.activePhone;
      let activePersonName: string | undefined = memory?.activePersonName;
      let pendingMeeting: PendingMeetingState | undefined = memory?.pendingMeeting;
      let pendingPersonalMessage: PendingPersonalMessageState | undefined = memory?.pendingPersonalMessage;

      if (action.actionId === "find_personal_contact") {
        if (result.data?.contact) {
          const c = result.data.contact;
          const phone = c.whatsappIdentities?.[0]?.canonicalPhone;
          const jid = c.whatsappIdentities?.[0]?.jid;
          activeContact = {
            contactId: c.contactId,
            displayName: c.displayName,
            canonicalPhone: phone,
            jid,
            isDirectNumber: false,
          };
          activePhone = phone;
          activePersonName = c.displayName;
        } else if (result.data?.directRecipient) {
          const d = result.data.directRecipient;
          activeContact = {
            displayName: d.displayName,
            canonicalPhone: d.canonicalPhone,
            jid: d.jid,
            isDirectNumber: true,
          };
          activePhone = d.canonicalPhone;
          activePersonName = d.displayName;
        }
      } else if (action.actionId === "schedule_google_meeting") {
        pendingMeeting = undefined;
        if (result.data?.recipient) {
          activePersonName = typeof result.data.recipient === "string" ? result.data.recipient : result.data.recipient.displayName;
        }
      } else if (action.actionId === "start_personal_outbound_mission") {
        pendingMeeting = undefined;
        pendingPersonalMessage = undefined;
        if (result.data?.targetIdentity) {
          activePersonName = result.data.targetIdentity.displayName;
          activePhone = result.data.targetIdentity.canonicalPhone;
          activeContact = {
            contactId: result.data.targetContactId,
            displayName: result.data.targetIdentity.displayName,
            canonicalPhone: result.data.targetIdentity.canonicalPhone,
            jid: result.data.targetIdentity.jid,
          };
        }
      }

      saveAdminConversationContext({
        accountId: context.accountId,
        adminJid: context.adminJid,
        lastTopic: topic,
        lastActionId: action.actionId,
        lastResourceType: resourceType,
        lastResourceId: resourceId,
        lastDateRange: intent.params?.range || "today",
        lastPeriod: intent.params?.range || intent.params?.period || "today",
        lastSummary: result.message?.slice(0, 200),
        lastRawResult: result.data,
        activeContact,
        activePhone,
        activePersonName,
        pendingMeeting,
        pendingPersonalMessage,
        pendingOfferedAction: undefined,
      });

      recordAdminAuditEvent({
        accountId: context.accountId,
        adminJidMasked: context.adminJid,
        botId: context.botId,
        actionId: action.actionId,
        riskLevel: action.riskLevel,
        confirmationRequired: false,
        executionResult: result.success ? "success" : "failed",
        failureReason: result.error,
        metadata: { params: intent.params },
      });

      return {
        handled: true,
        replyText: result.message,
        mode: "tool",
        actionExecuted: action.actionId,
        data: result.data,
      };
    } catch (handlerErr: any) {
      console.error(`[AdminAgent] Tool execution error for ${action.actionId}:`, handlerErr);
      return {
        handled: true,
        replyText: `❌ *Action Error*\n\nFailed to check *${action.label}*: ${handlerErr?.message || "Internal error."}`,
        mode: "tool",
        error: handlerErr?.message,
      };
    }
  }

  // Fallback
  return {
    handled: true,
    replyText: `I couldn't complete your request. Please specify what you would like to check.`,
    mode: "clarify",
  };
}

// ---------------------------------------------------------------------------
// 8. BOUNDED AGENT EXECUTION LOOP (PLAN -> EXECUTE -> OBSERVE -> REPLAN)
// ---------------------------------------------------------------------------

export interface AgentLoopInput {
  text?: string;
  userText?: string;
  context: AdminBusinessAssistantContext;
  rawMessage?: any;
  sock?: any;
  io?: any;
  emitLiveConsoleEvent?: (event: any) => void;
  maxSteps?: number;
}

export interface AgentLoopResult {
  handled: boolean;
  replyText: string;
  mode: AdminAgentIntentMode;
  actionExecuted?: string;
  actionsExecuted: string[];
  requiresConfirmation?: boolean;
  confirmationPreviewText?: string;
  pendingParams?: any;
  error?: string;
  goal: ConversationGoal;
  stepsExecuted: number;
}

export async function executeGoalDrivenAgentLoop(input: AgentLoopInput): Promise<AgentLoopResult> {
  const { context, maxSteps = 4, sock, io, emitLiveConsoleEvent } = input;
  const rawText = String(input.text || input.userText || "").trim();
  const memory = getAdminConversationContext(context.accountId, context.adminJid);
  const actionsExecuted: string[] = [];

  // 1. Check for Active Goal in Persistent Goal Manager
  let goal = getActiveConversationGoal(context.accountId, context.adminJid);

  let incorporationAccepted = false;
  // 2. Check if user is responding to a goal waiting for user input
  if (goal && (goal.status === "WAITING_FOR_USER" || goal.status === "IN_PROGRESS")) {
    const incorporation = incorporateUserResponseIntoGoal(goal, rawText);
    if (incorporation.accepted) {
      goal = incorporation.updatedGoal;
      incorporationAccepted = true;
    }
  }

  // 3. Resolve Intent
  let intent: AdminAgentResolvedIntent;

  // Check if active goal has a pending tool action that is ready to run
  if (goal && goal.status === "IN_PROGRESS" && goal.pendingToolAction) {
    const targetActionDef = getAdminAction(goal.pendingToolAction.actionId);
    intent = {
      mode: "tool",
      actionId: goal.pendingToolAction.actionId,
      action: targetActionDef,
      params: { ...goal.pendingToolAction.params, ...goal.knownArguments },
      reasoning: `Continuing goal ${goal.goalType} with filled arguments`,
    };
    goal.pendingToolAction = undefined;
  } else {
    // 3b. Deterministic Guard Check: only intercept true guards (confirmations, cancellations, acknowledgements, pending states)
    const isSimpleGuard = (
      isAffirmative(rawText) ||
      isCancellation(rawText) ||
      Boolean(memory?.pendingOfferedAction) ||
      Boolean(memory?.pendingMeeting) ||
      Boolean(memory?.pendingPersonalMessage) ||
      rawText.trim().startsWith("+") ||
      /^\d+$/.test(rawText.replace(/\D/g, "")) ||
      /^(?:ok|okay|thanks|thank you|got it|noted|alright|what else\??|what more\??|what can you do.*|help|menu|options|features|capabilities)$/i.test(rawText.trim()) ||
      /^(?:save it|save this|save this number|save number|save contact|save him|save her|isko save|use save)\b/i.test(rawText.trim()) ||
      /^(?:what do you know about me|show my profile|my profile|owner profile)\b/i.test(rawText.trim())
    );

    if (isSimpleGuard) {
      const guardMatch = matchDeterministicGuards(rawText, memory);
      if (guardMatch) {
        intent = guardMatch;
      } else {
        intent = await resolveAdminAgentIntent({ text: rawText, context, memory });
      }
    } else {
      intent = await resolveAdminAgentIntent({ text: rawText, context, memory });
    }
  }

  // 4. Ensure Goal Exists or Handle Interruption
  if (!goal || goal.status === "COMPLETED" || goal.status === "FAILED") {
    let goalType: ConversationGoal["goalType"] = "general_task";
    if (intent.actionId?.includes("contact") || intent.actionId?.includes("mission")) {
      goalType = "external_contact";
    } else if (intent.actionId?.includes("order")) {
      goalType = "order_inquiry";
    } else if (intent.actionId?.includes("customer")) {
      goalType = "customer_lookup";
    } else if (intent.actionId?.includes("lead")) {
      goalType = "lead_management";
    } else if (intent.actionId?.includes("product") || intent.actionId?.includes("catalog")) {
      goalType = "catalog_management";
    } else if (intent.actionId?.includes("wallet") || intent.actionId?.includes("usage") || intent.actionId?.includes("billing")) {
      goalType = "wallet_billing";
    } else if (intent.actionId?.includes("capability")) {
      goalType = "assistant_capabilities";
    }

    const missing: string[] = [];
    if (goalType === "external_contact") {
      const hasTarget = Boolean(intent.params?.target || intent.params?.name || intent.params?.recipient || memory?.activeContact?.displayName || memory?.activePersonName);
      const hasGoal = Boolean(intent.params?.goal || intent.params?.message || intent.params?.instruction);
      if (!hasTarget && intent.actionId === "start_personal_outbound_mission") missing.push("recipient");
      if (!hasGoal && intent.actionId === "start_personal_outbound_mission") missing.push("message");
    }

    goal = createConversationGoal({
      accountId: context.accountId,
      conversationId: context.adminJid,
      requesterIdentity: {
        role: context.adminRole,
        jid: context.adminJid,
      },
      goalType,
      originalObjective: rawText,
      channelRequired: "personal_whatsapp",
      knownArguments: intent.params || {},
      missingArguments: missing,
      knownEntities: {
        activeContact: memory?.activeContact,
        activePhone: memory?.activePhone,
        activePersonName: memory?.activePersonName,
        activeEntity: memory?.activeEntity,
      },
    });
  } else if (goal.status === "WAITING_FOR_USER" && !incorporationAccepted && intent.mode === "tool") {
    // Interruption / Task-switching: Suspend Goal A into Goal B's suspendedGoal
    let goalType: ConversationGoal["goalType"] = "general_task";
    if (intent.actionId?.includes("contact") || intent.actionId?.includes("mission")) {
      goalType = "external_contact";
    } else if (intent.actionId?.includes("order")) {
      goalType = "order_inquiry";
    } else if (intent.actionId?.includes("customer")) {
      goalType = "customer_lookup";
    } else if (intent.actionId?.includes("lead")) {
      goalType = "lead_management";
    } else if (intent.actionId?.includes("product") || intent.actionId?.includes("catalog")) {
      goalType = "catalog_management";
    } else if (intent.actionId?.includes("wallet") || intent.actionId?.includes("usage") || intent.actionId?.includes("billing")) {
      goalType = "wallet_billing";
    } else if (intent.actionId?.includes("capability")) {
      goalType = "assistant_capabilities";
    }

    goal = suspendAndReplaceActiveGoal(context.accountId, context.adminJid, {
      accountId: context.accountId,
      conversationId: context.adminJid,
      requesterIdentity: {
        role: context.adminRole,
        jid: context.adminJid,
      },
      goalType,
      originalObjective: rawText,
      channelRequired: "personal_whatsapp",
      knownArguments: intent.params || {},
      missingArguments: [],
      knownEntities: {
        activeContact: memory?.activeContact,
        activePhone: memory?.activePhone,
        activePersonName: memory?.activePersonName,
        activeEntity: memory?.activeEntity,
      },
    });
  }

  // Handle Clarification
  if (intent.mode === "clarify") {
    return {
      handled: true,
      replyText: intent.clarifyQuestion || buildNaturalAmbiguityClarification(rawText, context),
      mode: "clarify",
      actionsExecuted,
      goal,
      stepsExecuted: 0,
    };
  }

  // Handle Conversational Mode
  if (intent.mode === "conversation") {
    return {
      handled: true,
      replyText: intent.reply || "Got it! Let me know what you'd like to do next.",
      mode: "conversation",
      actionsExecuted,
      goal,
      stepsExecuted: 0,
    };
  }

  // Handle Help Mode
  if (intent.mode === "help") {
    const execRes = await executeAdminAgentIntent({ intent, context, rawText });
    return {
      handled: true,
      replyText: execRes.replyText,
      mode: "help",
      actionExecuted: execRes.actionExecuted,
      actionsExecuted: execRes.actionExecuted ? [execRes.actionExecuted] : [],
      goal,
      stepsExecuted: 1,
    };
  }

  // Handle Action requiring confirmation (e.g. sensitive write)
  if (intent.action?.requiresConfirmation) {
    const execRes = await executeAdminAgentIntent({ intent, context, rawText });
    return {
      handled: true,
      replyText: execRes.replyText,
      mode: execRes.mode,
      requiresConfirmation: execRes.requiresConfirmation,
      confirmationPreviewText: execRes.confirmationPreviewText,
      pendingParams: execRes.pendingParams,
      actionExecuted: execRes.actionExecuted,
      actionsExecuted: execRes.actionExecuted ? [execRes.actionExecuted] : [],
      goal,
      stepsExecuted: 1,
    };
  }

  // If goal has missing arguments that cannot be resolved automatically:
  if (goal.missingArguments.length > 0) {
    goal.status = "WAITING_FOR_USER";
    saveConversationGoal(goal);
    let question = "Could you please specify the details?";
    if (goal.missingArguments.includes("recipient") || goal.missingArguments.includes("target")) {
      question = "Who would you like me to contact?";
    } else if (goal.missingArguments.includes("message") || goal.missingArguments.includes("goal")) {
      const targetName = goal.knownArguments.target || goal.knownEntities.activePersonName || "them";
      question = `What would you like me to send to ${targetName}?`;
    }
    return {
      handled: true,
      replyText: question,
      mode: "conversation",
      actionsExecuted,
      goal,
      stepsExecuted: 0,
    };
  }

  // 5. Bounded Agent Execution Loop (Step -> Execute -> Observe -> Evaluate -> Continue / Replan)
  let stepsExecuted = 0;
  let lastExecResult: AdminAgentExecutionResult | undefined = undefined;
  let currentActionId = intent.actionId;
  let currentParams = intent.params || {};

  while (stepsExecuted < maxSteps) {
    stepsExecuted++;

    const actionDef = getAdminAction(currentActionId!);
    if (!actionDef) {
      break;
    }

    const stepIntent: AdminAgentResolvedIntent = {
      mode: "tool",
      actionId: currentActionId,
      action: actionDef,
      params: currentParams,
    };

    lastExecResult = await executeAdminAgentIntent({ intent: stepIntent, context, rawText });
    actionsExecuted.push(currentActionId!);

    // Observe tool result and update goal
    updateGoalWithToolResult({
      goal,
      actionId: currentActionId!,
      params: currentParams,
      result: {
        success: !lastExecResult.error,
        message: lastExecResult.replyText,
        error: lastExecResult.error,
        data: lastExecResult.data,
      },
    });

    // Check for execution error (e.g. disconnected WhatsApp transport)
    if (lastExecResult.error) {
      if (
        lastExecResult.error.includes("disconnected") ||
        lastExecResult.error.includes("offline") ||
        lastExecResult.error.includes("not_connected")
      ) {
        goal.status = "BLOCKED";
        goal.blockedReason = "Personal WhatsApp instance is disconnected.";
      } else {
        goal.status = "FAILED";
        goal.blockedReason = lastExecResult.error;
      }
      saveConversationGoal(goal);
      return {
        handled: true,
        replyText: `⚠️ Action blocked: ${goal.blockedReason}`,
        mode: "tool",
        actionExecuted: currentActionId,
        actionsExecuted,
        error: lastExecResult.error,
        goal,
        stepsExecuted,
      };
    }

    if (lastExecResult.requiresConfirmation) {
      goal.status = "WAITING_FOR_USER";
      saveConversationGoal(goal);
      return {
        handled: true,
        replyText: lastExecResult.replyText,
        mode: lastExecResult.mode,
        requiresConfirmation: true,
        confirmationPreviewText: lastExecResult.confirmationPreviewText,
        pendingParams: lastExecResult.pendingParams,
        actionExecuted: lastExecResult.actionExecuted,
        actionsExecuted,
        goal,
        stepsExecuted,
      };
    }

    // MULTI-TOOL CHAINING EVALUATION:
    // Case 1: External contact workflow where step 1 was find_personal_contact
    if (goal.goalType === "external_contact" && currentActionId === "find_personal_contact") {
      const contact = goal.knownEntities.activeContact;
      const targetPhone = goal.knownEntities.activePhone || contact?.canonicalPhone;
      const targetName = contact?.displayName || goal.knownEntities.activePersonName || goal.knownArguments.target;
      let messageGoal = goal.knownArguments.goal || goal.knownArguments.message || goal.knownArguments.instruction || goal.knownArguments.serviceQuery;
      if (!messageGoal) {
        const askMatch = rawText.match(/(?:ask about|ask|tell them|tell him|tell her|say|that|inquire about|poocho|bolo|kehna|ke|batao|regarding|about)\s+(.+)$/i);
        if (askMatch) {
          messageGoal = askMatch[1].trim();
        }
      }

      // If user had a message/goal to send: DO NOT STOP! Chain to start_personal_outbound_mission!
      if (messageGoal && targetName) {
        currentActionId = "start_personal_outbound_mission";
        currentParams = {
          target: targetName,
          goal: messageGoal,
          phone: targetPhone,
        };
        continue;
      } else if (targetName && !messageGoal) {
        goal.status = "WAITING_FOR_USER";
        goal.missingArguments = ["messageContent"];
        goal.pendingToolAction = {
          actionId: "start_personal_outbound_mission",
          params: {
            target: targetName,
            phone: targetPhone,
          },
        };
        saveConversationGoal(goal);
        return {
          handled: true,
          replyText: `Found contact *${targetName}*${targetPhone ? ` (${targetPhone})` : ""}. What message or inquiry would you like me to send them?`,
          mode: "conversation",
          actionExecuted: "find_personal_contact",
          actionsExecuted,
          goal,
          stepsExecuted,
        };
      }
    }

    // Case 2: Customer lookup chained to order check
    if (goal.goalType === "order_inquiry" && currentActionId === "find_customer") {
      const customer = goal.knownEntities.activeCustomer;
      if (customer?.customerId) {
        currentActionId = "get_customer_orders";
        currentParams = { customerId: customer.customerId };
        continue;
      }
    }

    // Goal completed normally
    goal.status = "COMPLETED";
    if (goal.suspendedGoal) {
      goal = completeConversationGoal(context.accountId, context.adminJid) || goal;
    } else {
      saveConversationGoal(goal);
    }
    break;
  }

  return {
    handled: true,
    replyText: lastExecResult?.replyText || "Action completed.",
    mode: lastExecResult?.mode || "tool",
    actionExecuted: lastExecResult?.actionExecuted,
    actionsExecuted,
    error: lastExecResult?.error,
    goal,
    stepsExecuted,
  };
}
