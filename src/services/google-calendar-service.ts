/**
 * Google Calendar Integration Service (Free-Only V1)
 * 
 * Capabilities:
 * - Real calendar availability via Free/Busy API (data minimization: busy intervals only)
 * - Double-booking protection (re-checks availability immediately before final event creation)
 * - Event creation with deterministic idempotency linkage
 * - Event update and cancellation
 * - Grounded output strictly based on external Google responses
 */

import { getValidGoogleAccessToken } from "./google-personal-oauth-service.ts";
import {
  evaluateGoogleFreeUsage,
  recordGoogleUsageSuccess,
} from "./google-free-usage-guard.ts";

export const googleCalendarDeps = {
  fetch: (url: string, init?: RequestInit) => fetch(url, init),
};

export interface CalendarTimeInterval {
  start: string; // ISO 8601
  end: string;   // ISO 8601
}

export interface QueryFreeBusyParams {
  accountId: string;
  timeMin: string;
  timeMax: string;
  timezone?: string;
  calendarId?: string;
  now?: number;
  overrideFetch?: (url: string, init?: RequestInit) => Promise<any>;
}

export interface FreeBusyResult {
  calendarId: string;
  timeMin: string;
  timeMax: string;
  timezone: string;
  busy: CalendarTimeInterval[];
  isFreeEntireWindow: boolean;
}

export interface CreateEventParams {
  accountId: string;
  calendarId?: string;
  summary: string;
  description?: string;
  start: string; // ISO 8601
  end: string;   // ISO 8601
  timezone: string;
  attendees?: Array<{ email: string; displayName?: string }>;
  taskId?: string;
  actionId?: string;
  now?: number;
  overrideFetch?: (url: string, init?: RequestInit) => Promise<any>;
  createMeeting?: boolean;
}

export interface CalendarEventResult {
  eventId: string;
  summary: string;
  htmlLink?: string;
  meetLink?: string;
  start: string;
  end: string;
  timezone: string;
  status: string;
  attendeeCount: number;
}

export interface ParsedMeetingTime {
  valid: boolean;
  startISO?: string;
  endISO?: string;
  durationMinutes?: number;
  displayTime?: string;
  error?: string;
}

/**
 * Parses owner-relative and clock-based time expressions (e.g. "in 15 minutes", "at 4pm", "tomorrow at 10am").
 * Respects authoritative server/user timezone and default meeting duration (default 30 mins).
 */
export function parseMeetingTimeExpression(
  expression?: string,
  timezone: string = "UTC",
  now: number = Date.now(),
  defaultDurationMinutes: number = 30
): ParsedMeetingTime {
  const raw = String(expression || "").trim().toLowerCase();
  if (!raw) {
    return { valid: false, error: "Time expression is missing." };
  }

  let durationMinutes = defaultDurationMinutes;
  const durationMatch = raw.match(/(?:for|duration)\s+(\d+)\s*(minutes?|mins?|min\b|m\b|hours?|hrs?|h\b)/i);
  if (durationMatch) {
    const val = parseInt(durationMatch[1], 10);
    const unit = durationMatch[2].toLowerCase();
    if (unit.startsWith("h")) {
      durationMinutes = val * 60;
    } else {
      durationMinutes = val;
    }
  }

  let startDate: Date | null = null;

  // 1. Relative minutes: "in 15 minutes", "in 15 mins", "in 15 min", "in 15m"
  const relMinMatch = raw.match(/\bin\s+(\d+)\s*(?:minutes?|mins?|min\b|m\b)/i);
  if (relMinMatch) {
    const mins = parseInt(relMinMatch[1], 10);
    startDate = new Date(now + mins * 60 * 1000);
  }

  // 2. Relative hours: "in 1 hour", "in 2 hours", "in 1 hr"
  if (!startDate) {
    const relHourMatch = raw.match(/\bin\s+(\d+)\s*(?:hours?|hrs?|h\b)/i);
    if (relHourMatch) {
      const hrs = parseInt(relHourMatch[1], 10);
      startDate = new Date(now + hrs * 60 * 60 * 1000);
    }
  }

  // 3. Absolute time: "at 4pm", "at 4:30 pm", "4 pm", "16:00"
  if (!startDate) {
    const timeOfDayMatch = raw.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
    if (timeOfDayMatch) {
      let hours = parseInt(timeOfDayMatch[1], 10);
      const minutes = timeOfDayMatch[2] ? parseInt(timeOfDayMatch[2], 10) : 0;
      const meridiem = timeOfDayMatch[3].toLowerCase();
      if (meridiem === "pm" && hours < 12) hours += 12;
      if (meridiem === "am" && hours === 12) hours = 0;

      const isTomorrow = raw.includes("tomorrow") || raw.includes("kal");
      const target = new Date(now);
      if (isTomorrow) {
        target.setDate(target.getDate() + 1);
      }
      target.setHours(hours, minutes, 0, 0);
      // If time has passed today and tomorrow wasn't specified, roll over to tomorrow
      if (!isTomorrow && target.getTime() <= now) {
        target.setDate(target.getDate() + 1);
      }
      startDate = target;
    }
  }

  // 4. Fallback ISO string check
  if (!startDate) {
    const isoCandidate = new Date(raw);
    if (!isNaN(isoCandidate.getTime()) && isoCandidate.getTime() > 100000000000) {
      startDate = isoCandidate;
    }
  }

  if (!startDate || isNaN(startDate.getTime())) {
    return {
      valid: false,
      error: `Could not parse relative time from "${expression}". Please specify a time like "in 15 minutes" or "at 4pm".`,
    };
  }

  const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);

  // Format display time
  let displayTime = "";
  try {
    displayTime = startDate.toLocaleTimeString("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    const dateStr = startDate.toLocaleDateString("en-US", {
      timeZone: timezone,
      month: "short",
      day: "numeric",
    });
    displayTime = `${displayTime} (${dateStr})`;
  } catch {
    displayTime = startDate.toISOString();
  }

  return {
    valid: true,
    startISO: startDate.toISOString(),
    endISO: endDate.toISOString(),
    durationMinutes,
    displayTime,
  };
}

// In-memory idempotency store for created events: taskId:actionId -> eventResult
const createdEventIdempotencyStore = new Map<string, CalendarEventResult>();

export async function queryCalendarFreeBusy(
  params: QueryFreeBusyParams
): Promise<FreeBusyResult> {
  const { accountId, timeMin, timeMax, timezone = "UTC", calendarId = "primary", now = Date.now() } = params;

  // 1. Free-only usage guard check
  const guard = await evaluateGoogleFreeUsage({
    accountId,
    service: "calendar",
    method: "freeBusy",
    estimatedQuotaUnits: 1,
    now,
  });

  if (guard.decision !== "ALLOW") {
    const err: any = new Error(guard.reasonMessage);
    err.code = guard.reasonCode;
    throw err;
  }

  // 2. Obtain valid token and verify capability
  const { accessToken, connection } = await getValidGoogleAccessToken(accountId);
  if (!connection.capabilities.calendarAvailability) {
    const err: any = new Error("GOOGLE_CALENDAR_AVAILABILITY_NOT_GRANTED");
    err.code = "GOOGLE_SCOPE_NOT_GRANTED";
    throw err;
  }

  // 3. Query Google Calendar FreeBusy endpoint
  const fetchFn = params.overrideFetch || googleCalendarDeps.fetch;
  const res = await fetchFn("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timeMin,
      timeMax,
      timeZone: timezone,
      items: [{ id: calendarId }],
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const err: any = new Error(data.error?.message || "CALENDAR_FREEBUSY_FAILED");
    err.code = "CALENDAR_API_ERROR";
    throw err;
  }

  // 4. Record usage on success
  await recordGoogleUsageSuccess({
    accountId,
    service: "calendar",
    method: "freeBusy",
    estimatedQuotaUnits: 1,
    now,
  });

  const busyIntervals: CalendarTimeInterval[] = (data.calendars?.[calendarId]?.busy || []).map((b: any) => ({
    start: b.start,
    end: b.end,
  }));

  return {
    calendarId,
    timeMin,
    timeMax,
    timezone,
    busy: busyIntervals,
    isFreeEntireWindow: busyIntervals.length === 0,
  };
}

export async function createCalendarEvent(
  params: CreateEventParams
): Promise<CalendarEventResult> {
  const {
    accountId,
    calendarId = "primary",
    summary,
    description,
    start,
    end,
    timezone,
    attendees = [],
    taskId,
    actionId,
    now = Date.now(),
  } = params;

  // 1. Idempotency Check
  const idempotencyKey = taskId && actionId ? `${taskId}:${actionId}` : null;
  if (idempotencyKey && createdEventIdempotencyStore.has(idempotencyKey)) {
    return createdEventIdempotencyStore.get(idempotencyKey)!;
  }

  // 2. Double-booking Protection (Section 57 & 58)
  const availability = await queryCalendarFreeBusy({
    accountId,
    timeMin: start,
    timeMax: end,
    timezone,
    calendarId,
    now,
    overrideFetch: params.overrideFetch,
  });

  if (!availability.isFreeEntireWindow) {
    const err: any = new Error(
      "Double-booking detected. Calendar has a conflicting event in the requested window."
    );
    err.code = "CALENDAR_SLOT_CONFLICT";
    throw err;
  }

  // 3. Free-only usage guard check for event creation
  const guard = await evaluateGoogleFreeUsage({
    accountId,
    service: "calendar",
    method: "events.insert",
    estimatedQuotaUnits: 1,
    now,
  });

  if (guard.decision !== "ALLOW") {
    const err: any = new Error(guard.reasonMessage);
    err.code = guard.reasonCode;
    throw err;
  }

  // 4. Obtain valid token and verify capability
  const { accessToken, connection } = await getValidGoogleAccessToken(accountId);
  if (!connection.capabilities.calendarEvents) {
    const err: any = new Error("GOOGLE_CALENDAR_EVENTS_NOT_GRANTED");
    err.code = "GOOGLE_SCOPE_NOT_GRANTED";
    throw err;
  }

  // 5. Create event via Google API
  const fetchFn = params.overrideFetch || googleCalendarDeps.fetch;
  const createMeeting = params.createMeeting !== false;
  const eventUrl = createMeeting
    ? `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1`
    : `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;

  const requestBody: Record<string, any> = {
    summary,
    description,
    start: { dateTime: start, timeZone: timezone },
    end: { dateTime: end, timeZone: timezone },
    attendees: attendees.map((a) => ({ email: a.email, displayName: a.displayName })),
  };

  if (createMeeting) {
    requestBody.conferenceData = {
      createRequest: {
        requestId: idempotencyKey || `meet_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }

  const res = await fetchFn(eventUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const err: any = new Error(data.error?.message || "CALENDAR_EVENT_CREATE_FAILED");
    err.code = "CALENDAR_API_ERROR";
    throw err;
  }

  // 6. Record usage on success
  await recordGoogleUsageSuccess({
    accountId,
    service: "calendar",
    method: "events.insert",
    estimatedQuotaUnits: 1,
    now,
  });

  const meetLink =
    data.hangoutLink ||
    data.conferenceData?.entryPoints?.find((ep: any) => ep.entryPointType === "video")?.uri ||
    data.conferenceData?.entryPoints?.[0]?.uri ||
    data.htmlLink;

  const result: CalendarEventResult = {
    eventId: data.id || `evt_${Date.now()}`,
    summary: data.summary || summary,
    htmlLink: data.htmlLink,
    meetLink,
    start,
    end,
    timezone,
    status: data.status || "confirmed",
    attendeeCount: attendees.length,
  };

  if (idempotencyKey) {
    createdEventIdempotencyStore.set(idempotencyKey, result);
  }

  return result;
}

export async function updateCalendarEvent(params: {
  accountId: string;
  calendarId?: string;
  eventId: string;
  summary?: string;
  start: string;
  end: string;
  timezone: string;
  attendees?: Array<{ email: string; displayName?: string }>;
  overrideFetch?: (url: string, init?: RequestInit) => Promise<any>;
}): Promise<CalendarEventResult> {
  const { accountId, calendarId = "primary", eventId, summary, start, end, timezone, attendees } = params;

  const { accessToken, connection } = await getValidGoogleAccessToken(accountId);
  if (!connection.capabilities.calendarEvents) {
    const err: any = new Error("GOOGLE_CALENDAR_EVENTS_NOT_GRANTED");
    err.code = "GOOGLE_SCOPE_NOT_GRANTED";
    throw err;
  }

  const fetchFn = params.overrideFetch || googleCalendarDeps.fetch;
  const res = await fetchFn(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...(summary ? { summary } : {}),
        start: { dateTime: start, timeZone: timezone },
        end: { dateTime: end, timeZone: timezone },
        ...(attendees ? { attendees } : {}),
      }),
    }
  );

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const err: any = new Error(data.error?.message || "CALENDAR_EVENT_UPDATE_FAILED");
    err.code = "CALENDAR_API_ERROR";
    throw err;
  }

  return {
    eventId,
    summary: data.summary || summary || "",
    htmlLink: data.htmlLink,
    start,
    end,
    timezone,
    status: data.status || "confirmed",
    attendeeCount: attendees?.length || 0,
  };
}

export async function cancelCalendarEvent(params: {
  accountId: string;
  calendarId?: string;
  eventId: string;
  overrideFetch?: (url: string, init?: RequestInit) => Promise<any>;
}): Promise<{ cancelled: boolean; eventId: string }> {
  const { accountId, calendarId = "primary", eventId } = params;

  const { accessToken, connection } = await getValidGoogleAccessToken(accountId);
  if (!connection.capabilities.calendarEvents) {
    const err: any = new Error("GOOGLE_CALENDAR_EVENTS_NOT_GRANTED");
    err.code = "GOOGLE_SCOPE_NOT_GRANTED";
    throw err;
  }

  const fetchFn = params.overrideFetch || googleCalendarDeps.fetch;
  const res = await fetchFn(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!res.ok && res.status !== 404 && res.status !== 410) {
    const err: any = new Error("CALENDAR_EVENT_CANCEL_FAILED");
    err.code = "CALENDAR_API_ERROR";
    throw err;
  }

  return { cancelled: true, eventId };
}

export function __clearCalendarIdempotencyForTest(): void {
  createdEventIdempotencyStore.clear();
}
