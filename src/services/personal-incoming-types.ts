/**
 * Canonical Types for Incoming Personal Assistant Runtime
 * 
 * Provides configuration schemas, eligibility results, context structures,
 * and escalation types for the Incoming Personal Assistant pipeline.
 */

import type { PersonalContact, PersonalContactSummaryContext } from "./personal-contact-types.ts";

export type PersonalIncomingReplyMode =
  | "off"
  | "known_contacts_only"
  | "all_private_contacts";

export type PersonalUnknownContactPolicy = "ignore" | "reply";

export type PersonalAssistantDisclosureMode = "first_contact" | "always" | "never";

export interface PersonalOperatingHours {
  enabled: boolean;
  startHour: number; // 0-23
  endHour: number;   // 0-23
  timezone?: string;
}

export interface PersonalIncomingAssistantSettings {
  instanceId?: string;
  tenantId?: string;
  enabled: boolean;
  incomingReplyMode: PersonalIncomingReplyMode;
  globalInstructions: string;
  assistantDisplayName: string;
  disclosureMode: PersonalAssistantDisclosureMode;
  unknownContactPolicy: PersonalUnknownContactPolicy;
  manualTakeoverDurationMinutes: number;
  quietHours?: PersonalOperatingHours;
  ownerEscalationEnabled: boolean;
  memoryEnabled?: boolean;
  updatedAt: number;
}

export type PersonalReplyBlockReason =
  | "feature_disabled"
  | "instance_not_personal"
  | "incoming_assistant_disabled"
  | "control_business_unavailable"
  | "unsupported_chat_type"
  | "self_chat"
  | "from_me_manual_takeover"
  | "contact_do_not_contact"
  | "contact_blocked"
  | "contact_paused"
  | "manual_takeover_active"
  | "unknown_contact_not_allowed"
  | "outside_allowed_hours"
  | "duplicate_message"
  | "rate_limited"
  | "context_assembly_failed";

export interface PersonalReplyEligibilityResult {
  allowed: boolean;
  reason?: PersonalReplyBlockReason | string;
  contact?: PersonalContact | null;
  settings: PersonalIncomingAssistantSettings;
  takeoverActive?: boolean;
  takeoverUntil?: number;
}

export interface SafeOwner360RepresentationContext {
  ownerPreferredName: string;
  assistantDisplayName: string;
  communicationStyle?: string;
  primaryLanguages?: string[];
  timezone?: string;
}

export interface PersonalAssistantModelContext {
  settings: PersonalIncomingAssistantSettings;
  ownerRepresentation: SafeOwner360RepresentationContext;
  contactContext: PersonalContactSummaryContext;
  shouldDiscloseIdentity: boolean;
  conversationHistory: Array<{
    role: "user" | "model" | "assistant";
    text: string;
    timestamp?: number;
  }>;
  incomingMessage: {
    messageId: string;
    text: string;
    timestamp?: number;
    hasMedia?: boolean;
    mediaType?: string;
  };
}

export interface PersonalOwnerEscalationEvent {
  escalationId: string;
  tenantId: string;
  personalInstanceId: string;
  controlBusinessInstanceId: string;
  contactId: string;
  contactDisplayName: string;
  contactPhone: string | null;
  questionOrDecision: string;
  contextSnippet: string;
  status: "pending" | "notified" | "resolved" | "dismissed";
  notificationMessageId?: string;
  createdAt: number;
  resolvedAt?: number;
}

export interface PersonalIncomingReplyResult {
  success: boolean;
  replyText?: string;
  messageId?: string;
  skipped?: boolean;
  reason?: string;
  escalationCreated?: boolean;
  escalationId?: string;
  usageRecorded?: boolean;
}
