import test from "node:test";
import assert from "node:assert/strict";
import {
  deliverDashboardWhatsAppAlert,
  normalizeDashboardAlertRecipient,
  type DashboardWhatsAppAlertState,
} from "./dashboard-whatsapp-alert-delivery-service.ts";
import { setAlertChannelPreference } from "./dashboard-alert-preferences-service.ts";

function deps(state: DashboardWhatsAppAlertState = {}, sendWhatsApp?: (phone: string, message: string) => Promise<any>) {
  let saved = state;
  return {
    get saved() {
      return saved;
    },
    api: {
      getState: async () => saved,
      saveState: async (_accountId: string, next: DashboardWhatsAppAlertState) => {
        saved = next;
      },
      ...(sendWhatsApp ? { sendWhatsApp } : {}),
    },
  };
}

const walletAlert = {
  id: "billing:wallet-empty",
  source: "billing",
  sourceLabel: "Billing",
  title: "Wallet empty",
  description: "Wallet balance is empty.",
  type: "wallet",
  severity: "danger",
};

test("dashboard WhatsApp delivery skips when WhatsApp preference is disabled by default", async () => {
  let sends = 0;
  const harness = deps({}, async () => {
    sends += 1;
    return true;
  });
  const result = await deliverDashboardWhatsAppAlert({
    accountId: "user_1",
    notification: walletAlert,
    recipient: "16747095146",
    deps: harness.api,
    now: 1000,
  });

  assert.equal(result.status, "disabled");
  assert.equal(sends, 0);
  assert.equal(harness.saved.logs?.[0]?.reason, "whatsapp_preference_disabled");
});

test("dashboard WhatsApp delivery skips when admin recipient is missing", async () => {
  const preferences = setAlertChannelPreference(undefined, "billing_wallet", "whatsapp", true);
  const harness = deps({}, async () => true);
  const result = await deliverDashboardWhatsAppAlert({
    accountId: "user_1",
    notification: walletAlert,
    preferences,
    recipient: "",
    deps: harness.api,
    now: 1000,
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "missing_admin_recipient");
});

test("dashboard WhatsApp delivery dedupes repeated notification ids", async () => {
  const preferences = setAlertChannelPreference(undefined, "billing_wallet", "whatsapp", true);
  let sends = 0;
  const harness = deps({}, async () => {
    sends += 1;
    return { success: true };
  });
  const input = {
    accountId: "user_1",
    notification: walletAlert,
    preferences,
    recipient: "16747095146",
    deps: harness.api,
  };

  const first = await deliverDashboardWhatsAppAlert({ ...input, now: 1000 });
  const second = await deliverDashboardWhatsAppAlert({ ...input, now: 1200 });

  assert.equal(first.status, "sent");
  assert.equal(second.status, "skipped");
  assert.equal(second.reason, "duplicate");
  assert.equal(sends, 1);
});

test("dashboard WhatsApp delivery throttles same category", async () => {
  const preferences = setAlertChannelPreference(undefined, "billing_wallet", "whatsapp", true);
  let sends = 0;
  const harness = deps({}, async () => {
    sends += 1;
    return true;
  });

  const first = await deliverDashboardWhatsAppAlert({
    accountId: "user_1",
    notification: walletAlert,
    preferences,
    recipient: "16747095146",
    deps: harness.api,
    now: 1000,
  });
  const second = await deliverDashboardWhatsAppAlert({
    accountId: "user_1",
    notification: { ...walletAlert, id: "billing:wallet-low", title: "Wallet low" },
    preferences,
    recipient: "16747095146",
    deps: harness.api,
    now: 1100,
  });

  assert.equal(first.status, "sent");
  assert.equal(second.status, "throttled");
  assert.equal(second.reason, "category_cooldown");
  assert.equal(sends, 1);
});

test("dashboard WhatsApp delivery succeeds only when safe sender succeeds", async () => {
  const preferences = setAlertChannelPreference(undefined, "billing_wallet", "whatsapp", true);
  const failed = deps({}, async () => false);
  const success = deps({}, async () => ({ messageId: "wamid-1" }));

  const failedResult = await deliverDashboardWhatsAppAlert({
    accountId: "user_1",
    notification: walletAlert,
    preferences,
    recipient: "16747095146",
    deps: failed.api,
    now: 1000,
  });
  const successResult = await deliverDashboardWhatsAppAlert({
    accountId: "user_1",
    notification: walletAlert,
    preferences,
    recipient: "16747095146",
    deps: success.api,
    now: 1000,
  });

  assert.equal(failedResult.status, "failed");
  assert.equal(successResult.status, "sent");
});

test("dashboard alert recipient normalizer keeps alerts account/admin scoped", () => {
  assert.equal(normalizeDashboardAlertRecipient("+1 (202) 555-0101"), "16747095146");
  assert.equal(normalizeDashboardAlertRecipient("contact-936fa60ae3d8@example.invalid"), "195545134641");
});
