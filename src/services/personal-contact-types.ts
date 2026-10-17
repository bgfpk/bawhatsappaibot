/**
 * Canonical Personal Contact and Personal Contact Memory Types
 * 
 * Prompt 3: Personal Contacts + Contact Memory
 * Governs the data model for individuals communicating with an owner's
 * Personal WhatsApp instance(s).
 */

export const PERSONAL_CONTACT_SCHEMA_VERSION = 1;

export type PersonalContactRelationship =
  | "friend"
  | "family"
  | "colleague"
  | "client"
  | "supplier"
  | "service_provider"
  | "professional_contact"
  | "acquaintance"
  | "other";

export type PersonalContactRelationshipProvenance =
  | "owner_provided"
  | "contact_explicit"
  | "unknown";

export type PersonalContactCommunicationStatus =
  | "active"
  | "paused_by_owner"
  | "do_not_contact"
  | "blocked_by_owner";

export interface PersonalContactCommunicationPreferences {
  preferredLanguage?: string;
  formality?: "formal" | "informal" | "neutral" | "casual";
  channelPreference?: "whatsapp_text" | "whatsapp_voice" | "call";
  preferredContactWindow?: {
    startHour?: number;
    endHour?: number;
    timezone?: string;
  };
  doNotContact?: boolean;
  contactCommunicationStatus: PersonalContactCommunicationStatus;
}

export type PersonalContactJidType = "pn" | "lid";

export interface PersonalContactIdentityAlias {
  personalInstanceId: string;
  jid: string;
  jidType: PersonalContactJidType;
  canonicalPhone?: string | null;
  pushName?: string | null;
  notifyName?: string | null;
  firstSeenAt?: number;
  lastSeenAt?: number;
  source?: string;
}

export type PersonalContactFactCategory =
  | "identity"
  | "role"
  | "organization"
  | "preference"
  | "schedule"
  | "pricing"
  | "location"
  | "availability"
  | "custom";

export type PersonalContactFactSource =
  | "owner_business_whatsapp"
  | "owner_dashboard"
  | "contact_explicit_message"
  | "whatsapp_identity"
  | "system";

export type PersonalContactFactStatus =
  | "current"
  | "superseded"
  | "historical"
  | "expired";

export interface PersonalContactCommercialInfo {
  currency?: string;
  price?: number;
  quoteDescription?: string;
  validUntil?: number;
}

export interface PersonalContactMemoryFact {
  factId: string;
  category: PersonalContactFactCategory;
  label: string;
  value: string;
  source: PersonalContactFactSource;
  sourceTimestamp: number;
  createdAt: number;
  updatedAt: number;
  lastConfirmedAt: number;
  status: PersonalContactFactStatus;
  supersedesFactId?: string;
  validUntil?: number;
  staleAfter?: number;
  sensitivity: "standard" | "sensitive";
  commercialInfo?: PersonalContactCommercialInfo;
}

export interface PersonalContactOwnerNote {
  noteId: string;
  text: string;
  createdAt: number;
  updatedAt: number;
  provenance: "owner_dashboard" | "owner_business_whatsapp";
}

export interface PersonalContactConversationMetadata {
  lastInteractionAt?: number;
  lastInboundMessageAt?: number;
  messageCount: number;
  firstSeenAt: number;
}

export interface PersonalContact {
  contactId: string;
  schemaVersion: number;
  revision: number;
  accountId: string;
  status: "active" | "archived";
  displayName: string;
  ownerAssignedName?: string;
  savedName?: string;
  relationship: PersonalContactRelationship;
  customRelationshipLabel?: string;
  relationshipProvenance: PersonalContactRelationshipProvenance;
  communicationPreferences?: PersonalContactCommunicationPreferences;
  whatsappIdentities: PersonalContactIdentityAlias[];
  durableFacts: PersonalContactMemoryFact[];
  ownerNotes: PersonalContactOwnerNote[];
  conversationMetadata?: PersonalContactConversationMetadata;
  createdAt: number;
  updatedAt: number;
}

export interface PersonalContactSummaryContext {
  contactId: string;
  displayName: string;
  relationship: PersonalContactRelationship;
  customRelationshipLabel?: string;
  communicationStatus: PersonalContactCommunicationStatus;
  preferredLanguage?: string;
  formality?: "formal" | "informal" | "neutral" | "casual";
  trustedPhone: string | null;
  currentDurableFacts: Array<{
    factId: string;
    category: PersonalContactFactCategory;
    label: string;
    value: string;
    source: PersonalContactFactSource;
    lastConfirmedAt: number;
  }>;
  activeTemporaryFacts: Array<{
    factId: string;
    category: PersonalContactFactCategory;
    label: string;
    value: string;
    validUntil?: number;
  }>;
  ownerNotes: string[];
  messageCount: number;
  lastActiveAt?: number;
}
