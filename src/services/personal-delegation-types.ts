/**
 * Personal Assistant Permissions, Safety & Delegation - Canonical Types
 * 
 * Prompt 7 Architecture Contract:
 * - Server-authoritative action authorization
 * - Risk classification taxonomy (R0 - R5)
 * - Delegation policy contracts (Spending, Orders, Disclosure, Meetings, Negotiation)
 * - Field-level data disclosure governance
 * - Daily commitment limit ledger contracts
 */

export type PersonalActionRiskClass =
  | "R0_READ_ONLY"
  | "R1_LOW_RISK_COMMUNICATION"
  | "R2_DATA_DISCLOSURE"
  | "R3_REVERSIBLE_COMMITMENT"
  | "R4_FINANCIAL_OR_BINDING_COMMITMENT"
  | "R5_PROHIBITED_SENSITIVE_ACTION";

export type PersonalAuthorizationDecisionType =
  | "ALLOW"
  | "REQUIRE_APPROVAL"
  | "BLOCK";

export type PersonalOrderCommitmentMode =
  | "NEVER"
  | "ASK_EACH_TIME"
  | "WITHIN_LIMITS";

export type PersonalReservationMode =
  | "NEVER"
  | "ASK_EACH_TIME"
  | "AUTHORIZED_TASKS";

export type PersonalMeetingConfirmationMode =
  | "NEVER"
  | "ASK_EACH_TIME"
  | "WITHIN_CONSTRAINTS";

export type PersonalOwnerDataCategory =
  | "preferred_name"
  | "full_name"
  | "email"
  | "phone"
  | "city"
  | "address"
  | "delivery_address"
  | "work_address"
  | "timezone"
  | "language"
  | "custom_fact"
  | "owner_note"
  | "other";

export interface PersonalDelegationPolicy {
  policyId: string;
  schemaVersion: number;
  revision: number;
  policyVersion: string;
  accountId: string;
  personalInstanceId?: string; // Optional instance-specific override
  updatedAt: number;
  updatedBy: string;

  // Communication Settings
  communication: {
    allowAnswerKnownContacts: boolean;
    allowAnswerUnknownContacts: boolean;
    allowOutboundOwnerTasks: boolean;
    allowTaskFollowUps: boolean;
    maxFollowUpsPerTask: number; // Max 2 safety cap
  };

  // Data Disclosure Settings
  dataDisclosure: {
    allowCitySharingForTasks: boolean;
    allowDeliveryAddressForShopping: boolean;
    allowEmailSharing: "NEVER" | "ASK_EACH_TIME" | "AUTHORIZED_TASKS";
    allowPhoneSharing: "NEVER" | "ASK_EACH_TIME" | "AUTHORIZED_TASKS";
    prohibitOwnerNotesDisclosure: boolean; // Always true by default
  };

  // Orders & Financial Spending Settings
  orders: {
    allowOrderCommitment: boolean;
    orderCommitmentMode: PersonalOrderCommitmentMode;
    maxOrderValuePerTask: number; // e.g. 5000 PKR
    maxOrderValuePerDay: number; // e.g. 10000 PKR
    allowedCurrencies: string[]; // e.g. ["PKR"]
    allowedPaymentCommitmentTypes: Array<"COD" | "PAY_ON_DELIVERY">;
    newMerchantRequiresApproval: boolean;
  };

  // Reversible Commitments & Reservations
  reservations: {
    allowReservations: boolean;
    reservationMode: PersonalReservationMode;
    newProviderRequiresApproval: boolean;
  };

  // Appointments & Meetings
  appointments: {
    allowMeetingNegotiation: boolean;
    allowMeetingConfirmation: boolean;
    meetingConfirmationMode: PersonalMeetingConfirmationMode;
  };

  // Negotiation Settings
  negotiation: {
    allowPriceNegotiation: boolean;
    maxDiscountPercentRequest?: number;
    allowAcceptFinalOffer: boolean;
  };
}

export interface EvaluatePersonalActionParams {
  accountId: string;
  personalInstanceId: string;
  targetContactId?: string;
  targetPhoneOrJid?: string;
  actionType: string;
  riskClass?: PersonalActionRiskClass;
  taskId?: string;
  taskGoal?: string;
  proposedPayload: Record<string, any>;
  approvalFingerprint?: string;
  actorRole: "owner" | "admin" | "manager" | "contact" | "system" | "worker";
  now?: number;
}

export interface PersonalAuthorizationDecision {
  decision: PersonalAuthorizationDecisionType;
  reasonCode: string;
  reasonMessage: string;
  riskClass: PersonalActionRiskClass;
  policyVersion: string;
  policyRevision: number;
  taskId?: string;
  contactId?: string;
  requiredApprovalSummary?: string;
  effectiveLimits?: {
    maxTaskValue?: number;
    dailyLimitRemaining?: number;
    currency?: string;
  };
  auditMetadata?: Record<string, any>;
}

export interface TaskScopedDataAuthorization {
  authorizationId: string;
  taskId: string;
  field: PersonalOwnerDataCategory;
  authorizedValue: string;
  recipientPhoneOrJid: string;
  authorizedAt: number;
  expiresAt: number;
  authorizedBy: string;
  scope: "single_task";
}

export interface DailyCommitmentRecord {
  recordId: string;
  accountId: string;
  dateKey: string; // YYYY-MM-DD
  currency: string;
  totalCommitted: number;
  commitments: Array<{
    taskId: string;
    actionId: string;
    amount: number;
    timestamp: number;
    merchant: string;
    idempotencyKey: string;
  }>;
}
