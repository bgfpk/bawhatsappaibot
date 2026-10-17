import test from "node:test";
import assert from "node:assert/strict";

import {
  buildUserConfigWritePayload,
} from "./user-config-save-payload-service.ts";

import {
  resolveDelayedReadConfig,
} from "./whatsapp-delayed-read-service.ts";

// Helper simulating sanitizeClientConfig from server.ts
function sanitizeClientConfig(rawConfig: any) {
  const isEnabled = rawConfig.delayed_read_receipts_enabled === 1 ||
    rawConfig.delayed_read_receipts_enabled === true ||
    rawConfig.delayedReadReceiptsEnabled === true;

  const delaySeconds = rawConfig.read_receipt_delay_seconds !== undefined
    ? Number(rawConfig.read_receipt_delay_seconds)
    : rawConfig.readReceiptDelaySeconds !== undefined
      ? Number(rawConfig.readReceiptDelaySeconds)
      : undefined;

  return {
    delayed_read_receipts_enabled: rawConfig.delayed_read_receipts_enabled,
    delayedReadReceiptsEnabled: isEnabled,
    read_receipt_delay_seconds: rawConfig.read_receipt_delay_seconds,
    readReceiptDelaySeconds: delaySeconds,
  };
}

// Simulated in-memory database store for USER_CONFIGS
class MockUserConfigDatabase {
  private store = new Map<string, any>();

  async saveUserConfig(userId: string, payload: any) {
    const existing = this.store.get(userId) || {};
    const updated = { ...existing, ...payload };
    this.store.set(userId, updated);
    return updated;
  }

  async loadUserConfig(userId: string) {
    return this.store.get(userId) || {};
  }
}

test("1. Delayed Read persistence: ON + 10 sec -> save -> reload -> ON + 10 sec", async () => {
  const db = new MockUserConfigDatabase();
  const userId = "user_test_delayed_read";

  // 1. Client creates write payload for ON + 10 sec
  const clientInput = {
    delayedReadReceiptsEnabled: true,
    readReceiptDelaySeconds: 10,
  };
  const writePayload = buildUserConfigWritePayload(clientInput);
  assert.equal(writePayload.delayed_read_receipts_enabled, 1);
  assert.equal(writePayload.read_receipt_delay_seconds, 10);

  // 2. Server persists to USER_CONFIGS
  await db.saveUserConfig(userId, writePayload);

  // 3. Client reloads via GET /api/user/config -> sanitizeClientConfig
  const reloadedRaw = await db.loadUserConfig(userId);
  const reloadedClient = sanitizeClientConfig(reloadedRaw);

  assert.equal(reloadedClient.delayedReadReceiptsEnabled, true);
  assert.equal(reloadedClient.readReceiptDelaySeconds, 10);
  assert.equal(reloadedClient.delayed_read_receipts_enabled, 1);
  assert.equal(reloadedClient.read_receipt_delay_seconds, 10);
});

test("2. Delayed Read persistence: ON + 20 sec -> save -> reload -> ON + 20 sec", async () => {
  const db = new MockUserConfigDatabase();
  const userId = "user_test_delayed_read";

  // 1. Client updates to ON + 20 sec
  const clientInput = {
    delayedReadReceiptsEnabled: true,
    readReceiptDelaySeconds: 20,
  };
  const writePayload = buildUserConfigWritePayload(clientInput);
  assert.equal(writePayload.delayed_read_receipts_enabled, 1);
  assert.equal(writePayload.read_receipt_delay_seconds, 20);

  // 2. Persist
  await db.saveUserConfig(userId, writePayload);

  // 3. Reload
  const reloadedRaw = await db.loadUserConfig(userId);
  const reloadedClient = sanitizeClientConfig(reloadedRaw);

  assert.equal(reloadedClient.delayedReadReceiptsEnabled, true);
  assert.equal(reloadedClient.readReceiptDelaySeconds, 20);
});

test("3. Delayed Read persistence: OFF -> reload -> OFF", async () => {
  const db = new MockUserConfigDatabase();
  const userId = "user_test_delayed_read";

  // First was ON + 20 sec
  await db.saveUserConfig(userId, buildUserConfigWritePayload({
    delayedReadReceiptsEnabled: true,
    readReceiptDelaySeconds: 20,
  }));

  // Client toggles to OFF
  const clientInput = {
    delayedReadReceiptsEnabled: false,
    readReceiptDelaySeconds: 20,
  };
  const writePayload = buildUserConfigWritePayload(clientInput);
  assert.equal(writePayload.delayed_read_receipts_enabled, 0);

  // Persist
  await db.saveUserConfig(userId, writePayload);

  // Reload
  const reloadedRaw = await db.loadUserConfig(userId);
  const reloadedClient = sanitizeClientConfig(reloadedRaw);

  assert.equal(reloadedClient.delayedReadReceiptsEnabled, false);
  assert.equal(reloadedClient.delayed_read_receipts_enabled, 0);
  // Delay seconds value is retained in DB for when user re-enables toggle
  assert.equal(reloadedClient.readReceiptDelaySeconds, 20);
});

test("4. Business and Personal workers both read the persisted authoritative setting", async () => {
  const db = new MockUserConfigDatabase();
  const userId = "user_shared_account";

  // User sets global account setting: ON + 15 sec
  await db.saveUserConfig(userId, buildUserConfigWritePayload({
    delayedReadReceiptsEnabled: true,
    readReceiptDelaySeconds: 15,
  }));

  // Worker on boot executes: dbService.loadUserConfig(process.env.USER_ID)
  const authoritativeAccountConfig = await db.loadUserConfig(userId);

  // Business bot instance with standard config (no explicit override)
  const businessBotInstanceConfig = {
    botId: "bot_business_1",
    botName: "Sales Bot",
    // Notice: no delayed_read_receipts_override
  };

  const businessResolved = resolveDelayedReadConfig(businessBotInstanceConfig, authoritativeAccountConfig);
  assert.equal(businessResolved.enabled, true, "Business worker reads account delayed read enabled");
  assert.equal(businessResolved.delaySeconds, 15, "Business worker reads account 15s delay");

  // Personal bot instance with standard config (no explicit override)
  const personalBotInstanceConfig = {
    botId: "bot_personal_1",
    botName: "My Personal WhatsApp",
    // Notice: no delayed_read_receipts_override
  };

  const personalResolved = resolveDelayedReadConfig(personalBotInstanceConfig, authoritativeAccountConfig);
  assert.equal(personalResolved.enabled, true, "Personal worker reads account delayed read enabled");
  assert.equal(personalResolved.delaySeconds, 15, "Personal worker reads account 15s delay");
});

test("5. Explicit instance override precedence over authoritative account setting", async () => {
  const db = new MockUserConfigDatabase();
  const userId = "user_shared_account";

  // Account global is ON + 15 sec
  await db.saveUserConfig(userId, buildUserConfigWritePayload({
    delayedReadReceiptsEnabled: true,
    readReceiptDelaySeconds: 15,
  }));
  const accountConfig = await db.loadUserConfig(userId);

  // Instance A: Business bot with explicit override to 5 seconds
  const instanceWithFastOverride = {
    botId: "bot_fast",
    delayed_read_receipts_override: true,
    delayed_read_receipts_enabled: 1,
    read_receipt_delay_seconds: 5,
  };
  const resolvedFast = resolveDelayedReadConfig(instanceWithFastOverride, accountConfig);
  assert.equal(resolvedFast.enabled, true);
  assert.equal(resolvedFast.delaySeconds, 5, "Explicit instance delay overrides account delay");

  // Instance B: Personal bot with explicit override to DISABLED
  const instanceWithDisabledOverride = {
    botId: "bot_disabled",
    delayed_read_receipts_override: true,
    delayed_read_receipts_enabled: 0,
    read_receipt_delay_seconds: 15,
  };
  const resolvedDisabled = resolveDelayedReadConfig(instanceWithDisabledOverride, accountConfig);
  assert.equal(resolvedDisabled.enabled, false, "Explicit instance disable overrides account enable");

  // Instance C: Standard bot with legacy default false in object without override flag
  const instanceWithUnmarkedDefault = {
    botId: "bot_unmarked",
    delayed_read_receipts_enabled: false, // Old default without override marker
  };
  const resolvedUnmarked = resolveDelayedReadConfig(instanceWithUnmarkedDefault, accountConfig);
  assert.equal(resolvedUnmarked.enabled, true, "Without explicit override, instance safely adopts account setting");
  assert.equal(resolvedUnmarked.delaySeconds, 15);
});
