/**
 * Google Personal Assistant Integration - Canonical Types & Scopes
 * 
 * Strict V1 Free-Only Architecture:
 * - Dedicated Personal Assistant OAuth configuration (isolated from login)
 * - Incremental capability consent
 * - Free-only policy enforcement (no new third-party API costs)
 * - Prohibited restricted scopes (NO gmail.readonly, NO broad drive, NO Maps/Places)
 */

export type GoogleCapability =
  | "calendarAvailability"
  | "calendarEvents"
  | "googleContactsRead"
  | "gmailSend"
  | "driveSelectedFiles";

export type GoogleConnectionStatus =
  | "CONNECTED"
  | "NOT_CONNECTED"
  | "REAUTH_REQUIRED"
  | "REVOKED"
  | "DISABLED";

// ============================================================================
// 1. CANONICAL ALLOWED SCOPES (Section 6 & 7 & 8 & 9 & 10)
// ============================================================================

export const GOOGLE_SCOPES = {
  // Identity (standard openid/email)
  OPENID: "openid",
  USERINFO_EMAIL: "https://www.googleapis.com/auth/userinfo.email",

  // Calendar: narrowest owned/freebusy events
  CALENDAR_EVENTS_OWNED: "https://www.googleapis.com/auth/calendar.events.owned",
  CALENDAR_FREEBUSY: "https://www.googleapis.com/auth/calendar.events.freebusy",

  // Contacts: read-only people API
  CONTACTS_READONLY: "https://www.googleapis.com/auth/contacts.readonly",

  // Gmail: send-only (NO inbox reading)
  GMAIL_SEND: "https://www.googleapis.com/auth/gmail.send",

  // Drive: per-file user-selected access (NO broad drive search)
  DRIVE_FILE: "https://www.googleapis.com/auth/drive.file",
} as const;

export const CAPABILITY_REQUIRED_SCOPES: Record<GoogleCapability, string[]> = {
  calendarAvailability: [GOOGLE_SCOPES.CALENDAR_FREEBUSY],
  calendarEvents: [GOOGLE_SCOPES.CALENDAR_EVENTS_OWNED, GOOGLE_SCOPES.CALENDAR_FREEBUSY],
  googleContactsRead: [GOOGLE_SCOPES.CONTACTS_READONLY],
  gmailSend: [GOOGLE_SCOPES.GMAIL_SEND],
  driveSelectedFiles: [GOOGLE_SCOPES.DRIVE_FILE],
};

// ============================================================================
// 2. PROHIBITED RESTRICTED SCOPES (Hard Security Assertions - Section 5 & 79)
// ============================================================================

export const PROHIBITED_GOOGLE_SCOPES = [
  "https://mail.google.com/",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.metadata",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/drive.metadata",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
] as const;

// ============================================================================
// 3. CONNECTION MODEL (Section 13)
// ============================================================================

export interface GooglePersonalConnection {
  connectionId: string;
  schemaVersion: number;
  revision: number;
  accountId: string;
  provider: "google";
  googleSubject: string;
  googleEmail: string;
  status: GoogleConnectionStatus;
  grantedScopes: string[];
  capabilities: Record<GoogleCapability, boolean>;
  internalDisabledCapabilities: Record<GoogleCapability, boolean>;
  createdAt: number;
  updatedAt: number;
  lastValidatedAt: number;
  encryptedRefreshTokenRef: string;
  tokenExpiry: number;
  refreshStatus: "valid" | "invalid_grant" | "refresh_failed";
  revokedAt?: number;
}

// ============================================================================
// 4. SELECTED DRIVE FILE REFERENCE (Section 46)
// ============================================================================

export interface SelectedDriveFile {
  fileId: string;
  accountId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  selectedAt: number;
  validatedAt: number;
}

// ============================================================================
// 5. USAGE LIMITS & DECISION TYPES (Section 22 & 23)
// ============================================================================

export type GoogleFreeUsageDecision =
  | "ALLOW"
  | "BLOCK_FREE_ONLY_LIMIT"
  | "BLOCK_DISABLED"
  | "BLOCK_REAUTH_REQUIRED";

export interface GoogleUsageCheckParams {
  accountId: string;
  service: "calendar" | "contacts" | "gmail" | "drive";
  method: string;
  estimatedQuotaUnits?: number;
  egressBytes?: number;
  now?: number;
}

export interface GoogleUsageCheckResult {
  decision: GoogleFreeUsageDecision;
  reasonCode: string;
  reasonMessage: string;
  dailyAccountUsage: number;
  accountLimit: number;
  dailyProjectUsage: number;
  projectLimit: number;
}

// ============================================================================
// 6. ACTION ALLOWLIST (Section 52)
// ============================================================================

export const GOOGLE_TASK_ACTION_TYPES = [
  "GOOGLE_CALENDAR_FREEBUSY",
  "GOOGLE_CALENDAR_CREATE_EVENT",
  "GOOGLE_CALENDAR_UPDATE_EVENT",
  "GOOGLE_CALENDAR_CANCEL_EVENT",
  "GOOGLE_CONTACT_SEARCH",
  "GOOGLE_CONTACT_GET",
  "GMAIL_SEND",
  "GOOGLE_DRIVE_READ_SELECTED_FILE",
] as const;

export type GoogleTaskActionType = (typeof GOOGLE_TASK_ACTION_TYPES)[number];
