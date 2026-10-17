import test from "node:test";
import assert from "node:assert/strict";

import {
  __resetBillingNotificationTestDeps,
  __setBillingNotificationTestDeps,
  markBillingNotificationStateResolved,
  sendBillingNotification,
} from "./billing-notification-service.ts";
import { buildAccessBlockedMessage, getBillingAccess } from "../config/billing-access.ts";

function createPersistentStore() {
  return {
    dedupe: new Map<string, any>(),
    state: new Map<string, any>(),
    global: new Map<string, string>(),
    wallet: [] as any[],
  };
}

function installBillingNotificationDeps(store = createPersistentStore(), disableFlag = "", whatsappEnabled = true) {
  const user = { $id: "user_1", email: "contact-c8cd3c642730@example.invalid", whatsapp_number: "110064053003" };
  const config = { admin_number: "153687026404", billing_alerts_enabled: true, business_name: "BlackArrow Demo" };

  __setBillingNotificationTestDeps({
    getUser: async () => user as any,
    loadUserConfig: async () => config,
    addWalletTransaction: async (...args: any[]) => {
      store.wallet.push(args);
      return undefined;
    },
    getGlobalSetting: async (key: string) => store.global.get(key) || null,
    setGlobalSetting: async (key: string, value: string) => {
      store.global.set(key, value);
      return undefined;
    },
    getBillingAlertRecord: async (scope: string, key: string) => (store as any)[scope]?.get?.(key) || null,
    tryCreateBillingAlertRecord: async (scope: string, key: string, value: any) => {
      const bucket = (store as any)[scope] as Map<string, any>;
      if (bucket.has(key)) return { created: false, documentId: `${scope}:${key}`, record: bucket.get(key) };
      bucket.set(key, value);
      return { created: true, documentId: `${scope}:${key}`, record: value };
    },
    setBillingAlertRecord: async (scope: string, key: string, value: any) => {
      const bucket = (store as any)[scope] as Map<string, any>;
      bucket.set(key, value);
      return { documentId: `${scope}:${key}`, record: value };
    },
    deleteBillingAlertRecord: async (scope: string, key: string) => {
      const bucket = (store as any)[scope] as Map<string, any>;
      return bucket.delete(key);
    },
    getUserExtraConfigValue: async (_userId: string, key: string) => key === "dashboardAlertPreferences" ? {
      categories: {
        billing_wallet: { dashboard: true, whatsapp: whatsappEnabled },
      },
    } : null,
    getDisableBillingWhatsAppRemindersFlag: () => disableFlag,
  } as any);

  return { store, user, config };
}

function buildTrialExpiredInput(overrides: Record<string, any> = {}) {
  return {
    userId: "user_1",
    title: "Trial expired",
    status: "Upgrade required",
    action: "Choose Starter, Growth, or Pro from Billing to continue using plan features.",
    dedupeKey: "trial_expired:user_1:1710000000",
    messageMode: "reminder" as const,
    alertType: "trial_expired",
    billingStatus: "expired",
    stateVersion: "1245308306",
    stateChangedAt: 1710000000,
    hardSafetyCooldownSeconds: 7 * 24 * 60 * 60,
    whatsAppMessage: "BlackArrow billing reminder\nYour trial has ended. Please choose Starter, Growth, or Pro from Billing to continue using plan features.",
    sendWhatsApp: async () => true,
    ...overrides,
  };
}

test.afterEach(() => {
  __resetBillingNotificationTestDeps();
});

test("billing WhatsApp alert is skipped when new WhatsApp preference is off", async (t) => {
  installBillingNotificationDeps(createPersistentStore(), "", false);
  const sendWhatsApp = t.mock.fn(async () => true);

  const result: any = await sendBillingNotification(buildTrialExpiredInput({ sendWhatsApp }));

  assert.equal(result.sent, false);
  assert.equal(result.deliveryStatus, "alerts_disabled");
  assert.equal(sendWhatsApp.mock.calls.length, 0);
});

test("first trial expired check sends alert", async (t) => {
  const { store } = installBillingNotificationDeps();
  const sendWhatsApp = t.mock.fn(async () => true);

  const result: any = await sendBillingNotification(buildTrialExpiredInput({ sendWhatsApp }));

  assert.equal(result.sent, true);
  assert.equal(sendWhatsApp.mock.calls.length, 1);
  assert.ok(store.dedupe.has("trial_expired:user_1:1710000000"));
});

test("second trial expired check one hour later does not send", async (t) => {
  installBillingNotificationDeps();
  const sendWhatsApp = t.mock.fn(async () => true);

  await sendBillingNotification(buildTrialExpiredInput({ sendWhatsApp }));
  const second: any = await sendBillingNotification(buildTrialExpiredInput({ sendWhatsApp }));

  assert.equal(second.skipped, true);
  assert.equal(sendWhatsApp.mock.calls.length, 1);
});

test("repeated checks within same expired state do not send", async (t) => {
  installBillingNotificationDeps();
  const sendWhatsApp = t.mock.fn(async () => true);

  await sendBillingNotification(buildTrialExpiredInput({ sendWhatsApp }));
  await sendBillingNotification(buildTrialExpiredInput({ sendWhatsApp }));
  await sendBillingNotification(buildTrialExpiredInput({ sendWhatsApp }));

  assert.equal(sendWhatsApp.mock.calls.length, 1);
});

test("missing timestamp still dedupes by stable account status key", async (t) => {
  installBillingNotificationDeps();
  const sendWhatsApp = t.mock.fn(async () => true);
  const input = buildTrialExpiredInput({
    dedupeKey: "trial_expired:user_1:missing_trial_expiry",
    stateVersion: "missing_trial_expiry",
    stateChangedAt: 0,
  });

  await sendBillingNotification({ ...input, sendWhatsApp });
  const second: any = await sendBillingNotification({ ...input, sendWhatsApp });

  assert.equal(second.skipped, true);
  assert.equal(sendWhatsApp.mock.calls.length, 1);
});

test("upgraded account does not send expired alert", async (t) => {
  installBillingNotificationDeps();
  const sendWhatsApp = t.mock.fn(async () => true);

  await sendBillingNotification(buildTrialExpiredInput({ sendWhatsApp }));
  await markBillingNotificationStateResolved({
    userId: "user_1",
    alertType: "trial_expired",
    currentStatus: "paid",
    billingStatus: "paid",
    stateVersion: "paid_renewed",
    stateChangedAt: 1710003600,
  });

  assert.equal(sendWhatsApp.mock.calls.length, 1);
});

test("new future expired state can send once", async (t) => {
  installBillingNotificationDeps();
  const sendWhatsApp = t.mock.fn(async () => true);

  await sendBillingNotification(buildTrialExpiredInput({ sendWhatsApp }));
  await markBillingNotificationStateResolved({
    userId: "user_1",
    alertType: "trial_expired",
    currentStatus: "paid",
    billingStatus: "paid",
    stateVersion: "paid_renewed",
    stateChangedAt: 1710003600,
  });
  const second: any = await sendBillingNotification(buildTrialExpiredInput({
    sendWhatsApp,
    dedupeKey: "trial_expired:user_1:1710600000",
    stateVersion: "1253050012",
    stateChangedAt: 1710600000,
  }));

  assert.equal(second.sent, true);
  assert.equal(sendWhatsApp.mock.calls.length, 2);
});

test("global disable flag suppresses WhatsApp reminder", async (t) => {
  const { store } = installBillingNotificationDeps(createPersistentStore(), "true");
  const sendWhatsApp = t.mock.fn(async () => true);

  const result: any = await sendBillingNotification(buildTrialExpiredInput({ sendWhatsApp }));

  assert.equal(result.skipped, true);
  assert.equal(result.reason, "disabled");
  assert.equal(sendWhatsApp.mock.calls.length, 0);
  assert.equal(store.dedupe.get("trial_expired:user_1:1710000000")?.deliveryStatus, "global_disabled");
});

test("daily billing alert sends once per account, type, recipient, and day", async (t) => {
  const { store } = installBillingNotificationDeps();
  const sendWhatsApp = t.mock.fn(async () => true);
  const input = {
    userId: "user_1",
    title: "Trial expiring soon",
    status: "1 day left",
    action: "Choose a paid plan in Billing to continue after trial.",
    messageMode: "reminder" as const,
    alertType: "trial_expiring_1_day",
    billingStatus: "trial_expiring",
    stateVersion: "2026-06-19",
    dailyDedupeDate: "2026-06-19",
    sendWhatsApp,
  };

  const first: any = await sendBillingNotification(input);
  const second: any = await sendBillingNotification(input);

  assert.equal(first.sent, true);
  assert.equal(second.skipped, true);
  assert.equal(sendWhatsApp.mock.calls.length, 1);
  assert.equal(second.reason, "billing_notification_skipped_duplicate_daily");
  assert.equal(store.wallet.some((row) => String(row[2]) === "billing_notification_skipped"), true);
  assert.equal(store.dedupe.has("billing_alert:user_1:trial_expiring_1_day:2026-06-19"), true);
});

test("different accounts can each receive their own daily billing notification", async (t) => {
  const store = createPersistentStore();
  installBillingNotificationDeps(store);
  const sendWhatsApp = t.mock.fn(async () => true);
  const base = {
    title: "Subscription expiring soon",
    status: "1 day left",
    action: "Renew in Billing.",
    messageMode: "reminder" as const,
    alertType: "subscription_expiring_1_day",
    billingStatus: "subscription_expiring",
    stateVersion: "2026-06-19",
    dailyDedupeDate: "2026-06-19",
    sendWhatsApp,
  };

  await sendBillingNotification({ ...base, userId: "user_1" });
  const second: any = await sendBillingNotification({ ...base, userId: "user_2" });

  assert.equal(second.sent, true);
  assert.equal(sendWhatsApp.mock.calls.length, 2);
  assert.equal(store.dedupe.has("billing_alert:user_1:subscription_expiring_1_day:2026-06-19"), true);
  assert.equal(store.dedupe.has("billing_alert:user_2:subscription_expiring_1_day:2026-06-19"), true);
});

test("daily billing alert allows a new send on a different day", async (t) => {
  installBillingNotificationDeps();
  const sendWhatsApp = t.mock.fn(async () => true);
  const base = {
    userId: "user_1",
    title: "Wallet low balance",
    status: "Balance below threshold",
    action: "Top up wallet.",
    messageMode: "reminder" as const,
    alertType: "wallet_low_balance",
    billingStatus: "wallet_low",
    sendWhatsApp,
  };

  await sendBillingNotification({ ...base, stateVersion: "2026-06-19", dailyDedupeDate: "2026-06-19" });
  const second: any = await sendBillingNotification({ ...base, stateVersion: "2026-06-20", dailyDedupeDate: "2026-06-20" });

  assert.equal(second.sent, true);
  assert.equal(sendWhatsApp.mock.calls.length, 2);
});

test("dashboard status logic remains unchanged", () => {
  const expiredUser = { trial_expires_at: 1710000000, plan_expiry: 0 };
  const activeUser = { trial_expires_at: 1999999999, plan_expiry: 0 };
  const nowSeconds = 1800000000;

  const expiredAccess = getBillingAccess(expiredUser, nowSeconds);
  const activeAccess = getBillingAccess(activeUser, nowSeconds);

  assert.equal(expiredAccess.status, "trial_expired");
  assert.equal(buildAccessBlockedMessage(expiredAccess), "Your 7-day trial has ended. Choose a paid plan in Billing to continue using this feature.");
  assert.equal(activeAccess.status, "trial");
});
