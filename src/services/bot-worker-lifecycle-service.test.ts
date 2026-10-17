import test from "node:test";
import assert from "node:assert/strict";

import {
  createBotWorkerLifecycleManager,
  isActiveLinkedBot,
  shouldReleaseProxyForMissingWorker,
} from "./bot-worker-lifecycle-service.ts";

function activeBot(id: string, patch: any = {}) {
  return {
    $id: id,
    user_id: `user-${id}`,
    jid: `${id}@s.whatsapp.net`,
    is_active: 1,
    ...patch,
  };
}

function createHarness(bots: any[]) {
  const active = new Set<string>();
  const spawning = new Set<string>();
  const spawns: any[] = [];
  const timers: Array<{ ms: number; fn: () => void | Promise<void> }> = [];
  let nowMs = 0;
  const manager = createBotWorkerLifecycleManager({
    listBots: async () => bots,
    getBotById: async (botId) => bots.find((bot) => (bot.$id || bot.id) === botId),
    spawnWorker: async (botId, userId, reason) => {
      spawns.push({ botId, userId, reason });
      active.add(botId);
      return { port: 12000 };
    },
    isWorkerActive: (botId) => active.has(botId),
    isWorkerSpawning: (botId) => spawning.has(botId),
    setTimeoutFn: ((fn: any, ms: number) => {
      timers.push({ ms, fn: () => {
        nowMs += ms;
        return fn();
      } });
      return { ms } as any;
    }) as any,
    clearTimeoutFn: (() => {}) as any,
    nowMs: () => nowMs,
    minRestartDelayMs: 10,
    maxRestartDelayMs: 80,
    logger: { log() {}, warn() {}, error() {} },
  });
  return { active, spawning, spawns, timers, manager };
}

test("startup restore starts active linked client bots without dashboard socket", async () => {
  const harness = createHarness([activeBot("bot-1"), activeBot("bot-2")]);
  await harness.manager.restoreActiveLinkedWorkers("startup_restore");
  assert.deepEqual(harness.spawns.map((spawn) => [spawn.botId, spawn.reason]), [
    ["bot-1", "startup_restore"],
    ["bot-2", "startup_restore"],
  ]);
});

test("startup restore skips disabled stopped reset and login-required bots", async () => {
  const harness = createHarness([
    activeBot("disabled", { is_active: 0 }),
    activeBot("stopped", { status: "stopped" }),
    activeBot("reset", { jid: "" }),
    activeBot("login", { login_required: true }),
    activeBot("ready"),
  ]);
  await harness.manager.restoreActiveLinkedWorkers("startup_restore");
  assert.deepEqual(harness.spawns.map((spawn) => spawn.botId), ["ready"]);
});

test("watchdog spawns a missing active linked worker", async () => {
  const harness = createHarness([activeBot("bot-1")]);
  await harness.manager.restoreActiveLinkedWorkers("watchdog_restore");
  assert.equal(harness.spawns[0].reason, "watchdog_restore");
});

test("worker exit schedules restart when bot is still active and linked", async () => {
  const harness = createHarness([activeBot("bot-1")]);
  await harness.manager.handleWorkerExit("bot-1");
  assert.equal(harness.timers.length, 1);
  assert.equal(harness.timers[0].ms, 1000);
  await harness.timers[0].fn();
  assert.equal(harness.spawns[0].reason, "worker_exit_restart");
});

test("worker exit does not restart after intentional stop", async () => {
  const harness = createHarness([activeBot("bot-1")]);
  harness.manager.markIntentionalStop("bot-1", "manual toggle off");
  await harness.manager.handleWorkerExit("bot-1");
  assert.equal(harness.timers.length, 0);
  assert.equal(harness.spawns.length, 0);
});

test("proxy cleanup does not release active linked bot just because worker is missing", () => {
  assert.equal(shouldReleaseProxyForMissingWorker(activeBot("bot-1")), false);
  assert.equal(shouldReleaseProxyForMissingWorker(activeBot("bot-2", { jid: "" })), true);
});

test("active linked eligibility requires active account, user, and WhatsApp JID for Web", () => {
  assert.equal(isActiveLinkedBot(activeBot("ok")), true);
  assert.equal(isActiveLinkedBot(activeBot("no-user", { user_id: "" })), false);
  assert.equal(isActiveLinkedBot(activeBot("off", { is_active: false })), false);
  assert.equal(isActiveLinkedBot(activeBot("qr", { connection_status: "qr_required" })), false);
  assert.equal(isActiveLinkedBot(activeBot("web-no-jid", { jid: "" })), false);
});

function activeCloudBot(id: string, patch: any = {}) {
  return {
    $id: id,
    user_id: `user-${id}`,
    jid: "",
    is_active: 1,
    config_settings: {
      providerType: "whatsapp_cloud_api",
      phoneNumberId: `phone-${id}`,
      encryptedAccessTokenRef: `ref-${id}`,
    },
    ...patch,
  };
}

test("Cloud active + no JID + valid provider config -> eligible", () => {
  assert.equal(isActiveLinkedBot(activeCloudBot("cloud-ok")), true);
});

test("Cloud inactive or disabled -> not eligible", () => {
  assert.equal(isActiveLinkedBot(activeCloudBot("cloud-off", { is_active: 0 })), false);
  assert.equal(isActiveLinkedBot(activeCloudBot("cloud-stopped", { connection_status: "disabled" })), false);
});

test("Cloud missing phoneNumberId or token ref -> not eligible", () => {
  assert.equal(
    isActiveLinkedBot(
      activeCloudBot("cloud-missing-phone", {
        config_settings: { providerType: "whatsapp_cloud_api", encryptedAccessTokenRef: "ref-1" },
      })
    ),
    false
  );
  assert.equal(
    isActiveLinkedBot(
      activeCloudBot("cloud-missing-token", {
        config_settings: { providerType: "whatsapp_cloud_api", phoneNumberId: "12345" },
      })
    ),
    false
  );
});

test("Cloud worker startup restore works without JID", async () => {
  const harness = createHarness([activeCloudBot("cloud-bot-1")]);
  await harness.manager.restoreActiveLinkedWorkers("startup_restore");
  assert.deepEqual(harness.spawns.map((s) => [s.botId, s.reason]), [
    ["cloud-bot-1", "startup_restore"],
  ]);
});

test("Cloud worker exit schedules restart without JID", async () => {
  const harness = createHarness([activeCloudBot("cloud-bot-1")]);
  await harness.manager.handleWorkerExit("cloud-bot-1");
  assert.equal(harness.timers.length, 1);
  await harness.timers[0].fn();
  assert.equal(harness.spawns[0].reason, "worker_exit_restart");
});
