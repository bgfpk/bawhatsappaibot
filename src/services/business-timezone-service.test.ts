import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_BUSINESS_TIMEZONE,
  buildBusinessDateTimeContext,
  formatBusinessDateTime,
  isValidBusinessTimezone,
  resolveBusinessTimezone,
  getExplicitAccountTimezone,
  hasConfiguredTimezone,
} from "./business-timezone-service.ts";
import { createReminderForAccount } from "./admin-reminder-service.ts";

test("missing business timezone falls back to Asia/Karachi", () => {
  assert.equal(resolveBusinessTimezone({}), DEFAULT_BUSINESS_TIMEZONE);
  assert.equal(resolveBusinessTimezone({ businessTimezone: "" }), DEFAULT_BUSINESS_TIMEZONE);
});

test("invalid business timezone falls back safely", () => {
  assert.equal(resolveBusinessTimezone({ businessTimezone: "Mars/Phobos" }), DEFAULT_BUSINESS_TIMEZONE);
  assert.equal(isValidBusinessTimezone("Mars/Phobos"), false);
});

test("getExplicitAccountTimezone returns null when unconfigured and string when configured", () => {
  assert.equal(getExplicitAccountTimezone({}), null);
  assert.equal(getExplicitAccountTimezone({ timezone: "" }), null);
  assert.equal(getExplicitAccountTimezone({ timezone: "Invalid/Zone" }), null);
  assert.equal(getExplicitAccountTimezone({ timezone: "America/New_York" }), "America/New_York");
  assert.equal(getExplicitAccountTimezone({ business_timezone: "Europe/London" }), "Europe/London");
  assert.equal(getExplicitAccountTimezone({ businessTimezone: "Asia/Dubai" }), "Asia/Dubai");
  assert.equal(getExplicitAccountTimezone({ time_zone: "Asia/Karachi" }), "Asia/Karachi");

  assert.equal(hasConfiguredTimezone({}), false);
  assert.equal(hasConfiguredTimezone({ timezone: "America/New_York" }), true);
});

test("valid business timezone is preserved and formats current date/time", () => {
  const timezone = resolveBusinessTimezone({ businessTimezone: "Asia/Dubai" });
  const formatted = formatBusinessDateTime(Date.UTC(2026, 5, 16, 12, 30, 0), timezone);

  assert.equal(timezone, "Asia/Dubai");
  assert.match(formatted, /Tuesday, June 16, 2026/);
  assert.match(formatted, /GMT\+4|GST/);
});

test("business date/time context exposes timezone and formatted timestamp", () => {
  const context = buildBusinessDateTimeContext(
    { business_timezone: "Europe/London" },
    Date.UTC(2026, 5, 16, 12, 30, 0),
  );

  assert.equal(context.timezone, "Europe/London");
  assert.match(context.currentDateTime, /Tuesday, June 16, 2026/);
});

test("Ambiguous reminder without configured timezone is rejected with clear instructions", () => {
  const accountWithoutTz = "test_acc_no_tz_01";
  const result = createReminderForAccount({
    accountId: accountWithoutTz,
    adminPhone: "195545134641",
    text: "Follow up with customer on shipment",
    scheduledAt: "tomorrow at 4pm",
    // No timezone provided
  });

  assert.equal(result.success, false);
  assert.match(result.message, /timezone is not configured/i);
});

test("Relative reminder without configured timezone succeeds", () => {
  const accountWithoutTz = "test_acc_no_tz_02";
  const result = createReminderForAccount({
    accountId: accountWithoutTz,
    adminPhone: "195545134641",
    text: "Check courier update",
    scheduledAt: "in 15 mins",
  });

  assert.equal(result.success, true);
  assert.ok(result.reminder?.scheduledAtMs);
});

test("Absolute reminder with explicit timezone preserves exact epoch across timezone shifts", () => {
  const resultLondon = createReminderForAccount({
    accountId: "test_acc_tz_03",
    adminPhone: "195545134641",
    text: "Sales review",
    scheduledAt: "2026-10-15 14:00",
    timezone: "Europe/London",
  });

  assert.equal(resultLondon.success, true);
  const scheduledMs = resultLondon.reminder?.scheduledAtMs;
  assert.ok(scheduledMs);

  // Absolute timestamp must remain invariant
  assert.equal(resultLondon.reminder?.scheduledAtMs, scheduledMs);
});
