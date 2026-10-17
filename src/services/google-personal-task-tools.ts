/**
 * Google Personal Task Tools & Prompt 7 Authorization Bridge
 * 
 * Bounded Action Allowlist:
 * - GOOGLE_CALENDAR_FREEBUSY
 * - GOOGLE_CALENDAR_CREATE_EVENT
 * - GOOGLE_CALENDAR_UPDATE_EVENT
 * - GOOGLE_CALENDAR_CANCEL_EVENT
 * - GOOGLE_CONTACT_SEARCH
 * - GOOGLE_CONTACT_GET
 * - GMAIL_SEND
 * - GOOGLE_DRIVE_READ_SELECTED_FILE
 * 
 * Every action evaluates evaluatePersonalActionAuthorization immediately before effect.
 */

import crypto from "node:crypto";
import { evaluatePersonalActionAuthorization } from "./personal-action-authorization-service.ts";
import {
  queryCalendarFreeBusy,
  createCalendarEvent,
  updateCalendarEvent,
  cancelCalendarEvent,
} from "./google-calendar-service.ts";
import {
  searchGoogleContacts,
  linkGoogleContactToPersonalContact,
} from "./google-contacts-service.ts";
import { sendGmailMessage } from "./google-gmail-send-service.ts";
import { readSelectedDriveFileContent } from "./google-drive-file-service.ts";
import type { PersonalActionRiskClass } from "./personal-delegation-types.ts";
import type { GoogleTaskActionType } from "./google-personal-auth-types.ts";

export interface ExecuteGoogleActionParams {
  accountId: string;
  personalInstanceId?: string;
  actionType: GoogleTaskActionType;
  taskId?: string;
  actionId?: string;
  payload: Record<string, any>;
  actorRole?: "owner" | "admin" | "manager" | "contact" | "system" | "worker";
  approvalFingerprint?: string;
  now?: number;
  overrideFetch?: (url: string, init?: RequestInit) => Promise<any>;
}

export function determineGoogleActionRisk(actionType: GoogleTaskActionType, payload: Record<string, any>): PersonalActionRiskClass {
  switch (actionType) {
    case "GOOGLE_CALENDAR_FREEBUSY":
    case "GOOGLE_CONTACT_GET":
      return "R0_READ_ONLY";
    case "GOOGLE_CONTACT_SEARCH":
    case "GOOGLE_DRIVE_READ_SELECTED_FILE":
      return "R2_DATA_DISCLOSURE";
    case "GOOGLE_CALENDAR_UPDATE_EVENT":
    case "GOOGLE_CALENDAR_CANCEL_EVENT":
      return "R3_REVERSIBLE_COMMITMENT";
    case "GOOGLE_CALENDAR_CREATE_EVENT":
      return "R4_FINANCIAL_OR_BINDING_COMMITMENT"; // Meeting confirmation commitment
    case "GMAIL_SEND":
      // If payment/order confirmation in email -> R4, otherwise R1
      if (payload.isOrderCommitment || payload.isPaymentRelated) {
        return "R4_FINANCIAL_OR_BINDING_COMMITMENT";
      }
      return "R1_LOW_RISK_COMMUNICATION";
    default:
      return "R5_PROHIBITED_SENSITIVE_ACTION";
  }
}

export function computeCalendarApprovalFingerprint(input: {
  calendarId: string;
  start: string;
  end: string;
  timezone: string;
  attendees?: Array<{ email: string }>;
  summary?: string;
}): string {
  const normAttendees = (input.attendees || []).map((a) => a.email.toLowerCase()).sort().join(",");
  const seed = `${input.calendarId}:${input.start}:${input.end}:${input.timezone}:${normAttendees}:${input.summary || ""}`;
  return crypto.createHash("sha256").update(seed).digest("hex");
}

export function computeGmailApprovalFingerprint(input: {
  to: string;
  subject: string;
  bodyText: string;
}): string {
  const seed = `${input.to.toLowerCase()}:${input.subject}:${input.bodyText}`;
  return crypto.createHash("sha256").update(seed).digest("hex");
}

export async function executeGooglePersonalAction(
  params: ExecuteGoogleActionParams
): Promise<any> {
  const {
    accountId,
    personalInstanceId,
    actionType,
    taskId,
    actionId,
    payload,
    actorRole = "worker",
    approvalFingerprint,
    now = Date.now(),
    overrideFetch,
  } = params;

  // 1. Determine Risk Class
  const riskClass = determineGoogleActionRisk(actionType, payload);

  // 2. Evaluate Prompt 7 Authorization immediately before execution
  const authDecision = await evaluatePersonalActionAuthorization({
    accountId,
    personalInstanceId,
    actionType,
    riskClass,
    taskId,
    taskGoal: payload.taskGoal || `Google Action: ${actionType}`,
    proposedPayload: payload,
    approvalFingerprint,
    actorRole,
    now,
  });

  if (authDecision.decision === "BLOCK") {
    const err: any = new Error(authDecision.reasonMessage || "Action blocked by delegation policy.");
    err.code = authDecision.reasonCode;
    err.riskClass = riskClass;
    throw err;
  }

  if (authDecision.decision === "REQUIRE_APPROVAL") {
    const err: any = new Error(authDecision.reasonMessage || "Action requires explicit owner approval.");
    err.code = "ACTION_REQUIRES_APPROVAL";
    err.requiredApprovalSummary = authDecision.requiredApprovalSummary;
    err.riskClass = riskClass;
    throw err;
  }

  // 3. Dispatch to Bounded Google Tools
  switch (actionType) {
    case "GOOGLE_CALENDAR_FREEBUSY":
      return await queryCalendarFreeBusy({
        accountId,
        timeMin: payload.timeMin,
        timeMax: payload.timeMax,
        timezone: payload.timezone,
        calendarId: payload.calendarId,
        now,
        overrideFetch,
      });

    case "GOOGLE_CALENDAR_CREATE_EVENT":
      return await createCalendarEvent({
        accountId,
        calendarId: payload.calendarId,
        summary: payload.summary,
        description: payload.description,
        start: payload.start,
        end: payload.end,
        timezone: payload.timezone,
        attendees: payload.attendees,
        taskId,
        actionId,
        now,
        overrideFetch,
      });

    case "GOOGLE_CALENDAR_UPDATE_EVENT":
      return await updateCalendarEvent({
        accountId,
        calendarId: payload.calendarId,
        eventId: payload.eventId,
        summary: payload.summary,
        start: payload.start,
        end: payload.end,
        timezone: payload.timezone,
        attendees: payload.attendees,
        overrideFetch,
      });

    case "GOOGLE_CALENDAR_CANCEL_EVENT":
      return await cancelCalendarEvent({
        accountId,
        calendarId: payload.calendarId,
        eventId: payload.eventId,
        overrideFetch,
      });

    case "GOOGLE_CONTACT_SEARCH":
      return await searchGoogleContacts({
        accountId,
        query: payload.query,
        pageSize: payload.pageSize,
        now,
        overrideFetch,
      });

    case "GOOGLE_CONTACT_GET":
      if (payload.selectedPerson) {
        return await linkGoogleContactToPersonalContact({
          accountId,
          selectedPerson: payload.selectedPerson,
          primaryPhoneNumber: payload.primaryPhoneNumber,
          now,
        });
      }
      return await searchGoogleContacts({
        accountId,
        query: payload.query,
        pageSize: 1,
        now,
        overrideFetch,
      });

    case "GMAIL_SEND":
      return await sendGmailMessage({
        accountId,
        to: payload.to,
        subject: payload.subject,
        bodyText: payload.bodyText || payload.text,
        cc: payload.cc,
        bcc: payload.bcc,
        taskId,
        actionId,
        now,
        overrideFetch,
      });

    case "GOOGLE_DRIVE_READ_SELECTED_FILE":
      return await readSelectedDriveFileContent(
        accountId,
        payload.fileId,
        now,
        overrideFetch
      );

    default: {
      const err: any = new Error(`Unsupported Google action type: ${actionType}`);
      err.code = "UNSUPPORTED_ACTION";
      throw err;
    }
  }
}
