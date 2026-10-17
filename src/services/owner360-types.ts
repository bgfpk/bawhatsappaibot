/**
 * Canonical OWNER360 / Personal Profile Types & Constants
 * Account-scoped personal profile for the BlackArrow Personal Assistant architecture.
 */

export type OwnerDataPrivacyPolicy =
  | "PRIVATE"
  | "ASK_BEFORE_SHARE"
  | "ALLOW_FOR_AUTHORIZED_TASK";

export const DEFAULT_OWNER_DATA_PRIVACY_POLICY: OwnerDataPrivacyPolicy = "PRIVATE";

export type OwnerDataProvenance =
  | "owner_dashboard"
  | "owner_business_whatsapp"
  | "existing_account_identity"
  | "system";

export const OWNER_PROFILE_SCHEMA_VERSION = 1;

export interface OwnerIdentity {
  preferredName?: string;
  fullName?: string;
  title?: string;
  preferredReference?: string; // e.g. "Mr. Khan", "Dr. Ahmed", "Firdosi"
  source?: OwnerDataProvenance;
  privacyPolicy: OwnerDataPrivacyPolicy;
}

export interface OwnerContactMethod {
  id: string;
  type: "email" | "phone";
  label: string; // e.g. "Personal", "Work", "Orders", "Bookings"
  value: string;
  verified?: boolean;
  source?: OwnerDataProvenance;
  privacyPolicy: OwnerDataPrivacyPolicy;
  isDefault: boolean;
}

export interface OwnerAddress {
  id: string;
  label: string; // e.g. "Home", "Office", "Warehouse", "Delivery"
  recipientName?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  region?: string; // state/province
  postalCode?: string;
  country: string; // international country name or code
  deliveryInstructions?: string;
  isDefault: boolean;
  privacyPolicy: OwnerDataPrivacyPolicy;
  source?: OwnerDataProvenance;
}

export interface OwnerLocalePreferences {
  timezone: string; // Valid IANA timezone e.g. "Asia/Karachi", "America/New_York", "UTC"
  locale: string; // e.g. "en-US", "ur-PK"
  preferredLanguages: string[]; // e.g. ["en", "ur"]
  defaultCurrency: string; // ISO 4217 e.g. "PKR", "USD"
}

export interface OwnerCommunicationPreferences {
  formality: "formal" | "neutral" | "casual";
  tone: string; // e.g. "professional", "friendly", "direct"
  brevity: "concise" | "balanced" | "detailed";
  preferredGreeting?: string;
  preferredSignoff?: string;
  useEmojis: boolean;
  allowVoiceNotes: boolean;
  assistantOwnerReference?: string; // how assistant refers to owner, e.g. "Mr. Ali", "the owner"
}

export interface OwnerAssistantRepresentation {
  assistantDisplayName: string; // e.g. "Executive Assistant"
  identityDisclosure: "always_disclose_ai" | "disclose_as_assistant" | "transparent";
}

export interface OwnerAvailabilityPreferences {
  preferredMeetingDays: string[]; // ["monday", "tuesday", "wednesday", ...]
  preferredMeetingWindows: Array<{ start: string; end: string }>; // e.g. [{ start: "09:00", end: "17:00" }]
  minimumNoticeHours: number; // e.g. 24
  defaultMeetingDurationMinutes: number; // e.g. 30
  preferredMeetingFormat: "google_meet" | "zoom" | "in_person" | "phone";
  bufferMinutes: number; // e.g. 15
}

export interface OwnerCommercePreferences {
  preferredCurrency?: string;
  deliveryPreference?: string;
  budgetPreference?: string;
  preferredContactMethod?: string;
  preferredDeliveryAddressId?: string;
  allowedDeliveryWindows?: string[];
  paymentPreference?: string; // e.g. "cash_on_delivery"
}

export interface OwnerCustomFact {
  factId: string;
  label: string;
  category: string;
  value: string;
  privacyPolicy: OwnerDataPrivacyPolicy;
  source?: OwnerDataProvenance;
  createdAt: number;
  updatedAt: number;
}

export interface Owner360Profile {
  schemaVersion: number;
  revision: number;
  accountId: string;
  createdAt: number;
  updatedAt: number;
  identity: OwnerIdentity;
  contactMethods: OwnerContactMethod[];
  addresses: OwnerAddress[];
  locale: OwnerLocalePreferences;
  communicationPreferences: OwnerCommunicationPreferences;
  assistantRepresentation: OwnerAssistantRepresentation;
  availabilityPreferences: OwnerAvailabilityPreferences;
  commercePreferences: OwnerCommercePreferences;
  customFacts: OwnerCustomFact[];
}

export interface SafeOwnerContextItem<T = string> {
  value: T;
  privacyPolicy: OwnerDataPrivacyPolicy;
  source?: OwnerDataProvenance;
}

export interface SafeOwnerTaskContext {
  accountId: string;
  identity?: {
    preferredName?: SafeOwnerContextItem;
    fullName?: SafeOwnerContextItem;
    title?: SafeOwnerContextItem;
    preferredReference?: SafeOwnerContextItem;
  };
  contactMethods: Array<{
    id: string;
    type: "email" | "phone";
    label: string;
    isDefault: boolean;
  } & SafeOwnerContextItem>;
  addresses: Array<{
    id: string;
    label: string;
    recipientName?: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    region?: string;
    postalCode?: string;
    country: string;
    deliveryInstructions?: string;
    isDefault: boolean;
    privacyPolicy: OwnerDataPrivacyPolicy;
    source?: OwnerDataProvenance;
  }>;
  locale: {
    timezone: string;
    locale: string;
    preferredLanguages: string[];
    defaultCurrency: string;
  };
  communicationPreferences: OwnerCommunicationPreferences;
  assistantRepresentation: OwnerAssistantRepresentation;
  availabilityPreferences: OwnerAvailabilityPreferences;
  commercePreferences: OwnerCommercePreferences;
  customFacts: Array<{
    factId: string;
    label: string;
    category: string;
  } & SafeOwnerContextItem>;
}

export const OWNER360_ERROR_CODES = {
  OWNER_PROFILE_NOT_FOUND: "OWNER_PROFILE_NOT_FOUND",
  INVALID_OWNER_PROFILE: "INVALID_OWNER_PROFILE",
  INVALID_TIMEZONE: "INVALID_TIMEZONE",
  INVALID_PRIVACY_POLICY: "INVALID_PRIVACY_POLICY",
  INVALID_ADDRESS: "INVALID_ADDRESS",
  SENSITIVE_SECRET_NOT_ALLOWED: "SENSITIVE_SECRET_NOT_ALLOWED",
  REVISION_CONFLICT: "REVISION_CONFLICT",
  FORBIDDEN: "FORBIDDEN",
  PERSONAL_ASSISTANT_DISABLED: "PERSONAL_ASSISTANT_DISABLED",
} as const;

export type Owner360ErrorCode = (typeof OWNER360_ERROR_CODES)[keyof typeof OWNER360_ERROR_CODES];

export class Owner360Error extends Error {
  code: Owner360ErrorCode;
  status: number;
  details?: any;

  constructor(message: string, code: Owner360ErrorCode, status: number = 400, details?: any) {
    super(message);
    this.name = "Owner360Error";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}
