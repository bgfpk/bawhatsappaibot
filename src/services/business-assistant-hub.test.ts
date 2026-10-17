import test from "node:test";
import assert from "node:assert/strict";
import { resolveRouteByPath, DASHBOARD_ROUTE_REGISTRY } from "../app/dashboard-route-registry.ts";
import {
  createReminderForAccount,
  listRemindersForAccount,
  rescheduleReminderForAccount,
  cancelReminderForAccount,
} from "./admin-reminder-service.ts";
import { listAdminActions } from "./admin-action-registry-service.ts";
import { recordAdminAuditEvent, getAdminAuditEvents, maskAdminIdentity } from "./admin-audit-service.ts";

test("1. Route registry maps /dashboard/business-assistant and legacy alias /business-assistant correctly", () => {
  const primary = resolveRouteByPath("/dashboard/business-assistant");
  assert.ok(primary);
  assert.equal(primary.view, "business_assistant");
  assert.equal(primary.label, "Business Assistant");

  const legacy = resolveRouteByPath("/business-assistant");
  assert.ok(legacy);
  assert.equal(legacy.view, "business_assistant");

  const registered = DASHBOARD_ROUTE_REGISTRY.find((r) => r.view === "business_assistant");
  assert.ok(registered);
  assert.equal(registered.path, "/dashboard/business-assistant");
});

test("2. Admin reminder CRUD for accounts: create, list, reschedule, and cancel", () => {
  const testAccountId = `test_hub_acc_${Date.now()}`;
  const futureIso = new Date(Date.now() + 3600 * 1000).toISOString();

  // Create
  const createRes = createReminderForAccount({
    accountId: testAccountId,
    adminPhone: "195545134641",
    text: "Review weekly sales ledger",
    scheduledAt: futureIso,
    timezone: "Asia/Karachi",
  });
  assert.equal(createRes.success, true);
  assert.ok(createRes.reminder);
  assert.equal(createRes.reminder.status, "pending");

  const reminderId = createRes.reminder.reminderId;

  // List
  const list1 = listRemindersForAccount(testAccountId);
  assert.equal(list1.length, 1);
  assert.equal(list1[0].reminderId, reminderId);

  // Reschedule
  const newFutureIso = new Date(Date.now() + 7200 * 1000).toISOString();
  const reschedRes = rescheduleReminderForAccount({
    accountId: testAccountId,
    reminderId,
    scheduledAt: newFutureIso,
  });
  assert.equal(reschedRes.success, true);
  assert.equal(reschedRes.reminder?.status, "pending");

  // Cancel
  const cancelRes = cancelReminderForAccount(testAccountId, reminderId);
  assert.equal(cancelRes.success, true);
  assert.equal(cancelRes.reminder?.status, "cancelled");

  // Verify list with filter
  const pendingOnly = listRemindersForAccount(testAccountId, "pending");
  assert.equal(pendingOnly.length, 0);

  const allReminders = listRemindersForAccount(testAccountId, "all");
  assert.equal(allReminders.length, 1);
  assert.equal(allReminders[0].status, "cancelled");
});

test("3. Admin action registry lists capabilities and role requirements cleanly", () => {
  const actions = listAdminActions();
  assert.ok(actions.length > 5);

  const adminStatus = actions.find((a) => a.actionId === "get_admin_status");
  assert.ok(adminStatus);
  assert.equal(adminStatus.riskLevel, "READ");
  assert.equal(adminStatus.requiresConfirmation, false);

  const bulkCampaign = actions.find((a) => a.actionId === "send_bulk_campaign");
  if (bulkCampaign) {
    assert.equal(bulkCampaign.riskLevel, "CRITICAL");
    assert.equal(bulkCampaign.requiresConfirmation, true);
  }
});

test("4. Audit log records and queries account-scoped events with masked identity", () => {
  const testAccId = `test_audit_acc_${Date.now()}`;
  recordAdminAuditEvent({
    accountId: testAccId,
    adminJidMasked: "contact-e4ed32210a80@example.invalid",
    actionId: "get_sales_summary",
    riskLevel: "READ",
    executionResult: "success",
  });

  const events = getAdminAuditEvents(testAccId);
  assert.equal(events.length, 1);
  assert.equal(events[0].actionId, "get_sales_summary");
  assert.equal(events[0].executionResult, "success");
  assert.ok(events[0].adminJidMasked.includes("***"));
});
