import test from "node:test";
import assert from "node:assert/strict";
import {
  filterDashboardNotificationsByPreferences,
  getAlertChannelEnabled,
  getDashboardNotificationCategory,
  getWhatsAppAlertDeliveryPlan,
  normalizeDashboardAlertPreferences,
  setAlertChannelPreference,
} from "./dashboard-alert-preferences-service.ts";

test("alert preference defaults keep dashboard on and WhatsApp off", () => {
  const preferences = normalizeDashboardAlertPreferences();

  assert.equal(getAlertChannelEnabled(preferences, "billing_wallet", "dashboard"), true);
  assert.equal(getAlertChannelEnabled(preferences, "billing_wallet", "whatsapp"), false);
  assert.equal(getAlertChannelEnabled(preferences, "unknown_future_category", "dashboard"), true);
  assert.equal(getAlertChannelEnabled(preferences, "unknown_future_category", "whatsapp"), false);
});

test("dashboard notification filtering respects category preferences", () => {
  const preferences = setAlertChannelPreference(undefined, "billing_wallet", "dashboard", false);
  const rows = filterDashboardNotificationsByPreferences([
    { id: "wallet", source: "billing", sourceLabel: "Billing", title: "Wallet low", description: "", type: "wallet" },
    { id: "crm", source: "crm", sourceLabel: "CRM", title: "New lead", description: "", type: "lead_created" },
  ], preferences);

  assert.deepEqual(rows.map((item) => item.id), ["crm"]);
});

test("notification categories cover system, billing, integrations, and CRM signals", () => {
  assert.equal(getDashboardNotificationCategory({ source: "system", type: "whatsapp", title: "", description: "" }), "whatsapp_instance");
  assert.equal(getDashboardNotificationCategory({ source: "billing", type: "limit", title: "", description: "" }), "billing_wallet");
  assert.equal(getDashboardNotificationCategory({ source: "integrations", type: "sync", title: "", description: "" }), "integration_sync");
  assert.equal(getDashboardNotificationCategory({ source: "crm", type: "follow_up_overdue", title: "", description: "" }), "overdue_followups");
  assert.equal(getDashboardNotificationCategory({ source: "crm", type: "smart_crm_action", title: "", description: "" }), "smart_crm_actions");
  assert.equal(getDashboardNotificationCategory({ source: "crm", type: "crm_agent_skipped", title: "Skipped", description: "" }), "agent_mode_failures");
  assert.equal(getDashboardNotificationCategory({ source: "crm", type: "hot_lead", title: "Hot lead", description: "" }), "hot_leads");
  assert.equal(getDashboardNotificationCategory({ source: "crm", type: "needs_human_reply", title: "Needs human reply", description: "" }), "needs_human_reply");
  assert.equal(getDashboardNotificationCategory({ source: "crm", type: "lifecycle_suggestion", title: "Move lifecycle", description: "" }), "lifecycle_suggestions");
});

test("WhatsApp alert delivery plan reports support for eligible major categories", () => {
  const preferences = setAlertChannelPreference(undefined, "billing_wallet", "whatsapp", true);
  const plan = getWhatsAppAlertDeliveryPlan({
    id: "wallet",
    source: "billing",
    sourceLabel: "Billing",
    title: "Wallet low",
    description: "",
    type: "wallet",
  }, preferences);

  assert.equal(plan.requested, true);
  assert.equal(plan.supported, true);
  assert.equal(plan.reason, "whatsapp_alert_delivery_available_for_major_alerts");
});
