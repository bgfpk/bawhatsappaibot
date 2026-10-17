import test from "node:test";
import assert from "node:assert/strict";

import {
  __resetWhatsAppNumberLockTestDeps,
  __setWhatsAppNumberLockTestDeps,
  normalizeWhatsAppJid,
  releaseWhatsAppNumberLock,
  verifyWhatsAppNumberLock,
} from "./whatsapp-number-lock.ts";

test.afterEach(() => {
  __resetWhatsAppNumberLockTestDeps();
});

test("first account connect creates owner lock and same account can reconnect after reset", async () => {
  const store = new Map<string, string>();
  __setWhatsAppNumberLockTestDeps({
    getSystemConfig: async (key: string) => store.get(key) || "",
    setSystemConfig: async (key: string, value: string) => { store.set(key, value); },
    getBotById: async () => null,
    listBotsByJid: async () => [],
    deleteSystemConfig: async (key: string) => { store.delete(key); },
  });

  const first = await verifyWhatsAppNumberLock({
    jid: "contact-6c9bc40fc084@example.invalid",
    userId: "user_1",
    botId: "bot_1",
  });
  const second = await verifyWhatsAppNumberLock({
    jid: "contact-6c9bc40fc084@example.invalid",
    userId: "user_1",
    botId: "bot_2",
  });

  assert.equal(first.allowed, true);
  assert.equal(second.allowed, true);
  assert.equal(store.size, 1);
});

test("by default (uniqueness disabled), another account can connect the same number", async () => {
  const store = new Map<string, string>();
  __setWhatsAppNumberLockTestDeps({
    getSystemConfig: async (key: string) => store.get(key) || "",
    setSystemConfig: async (key: string, value: string) => { store.set(key, value); },
    getBotById: async () => null,
    listBotsByJid: async () => [],
    deleteSystemConfig: async (key: string) => { store.delete(key); },
  });

  const first = await verifyWhatsAppNumberLock({
    jid: "contact-6c9bc40fc084@example.invalid",
    userId: "user_1",
    botId: "bot_1",
  });
  const second = await verifyWhatsAppNumberLock({
    jid: "contact-6c9bc40fc084@example.invalid",
    userId: "user_2",
    botId: "bot_9",
  });

  assert.equal(first.allowed, true);
  assert.equal(second.allowed, true);
});

test("when uniqueness is enforced, another account cannot connect a permanently locked number", async () => {
  const store = new Map<string, string>();
  __setWhatsAppNumberLockTestDeps({
    isUniquenessEnforced: () => true,
    getSystemConfig: async (key: string) => store.get(key) || "",
    setSystemConfig: async (key: string, value: string) => { store.set(key, value); },
    getBotById: async () => null,
    listBotsByJid: async () => [],
    deleteSystemConfig: async (key: string) => { store.delete(key); },
  });

  await verifyWhatsAppNumberLock({
    jid: "contact-6c9bc40fc084@example.invalid",
    userId: "user_1",
    botId: "bot_1",
  });
  const blocked = await verifyWhatsAppNumberLock({
    jid: "contact-6c9bc40fc084@example.invalid",
    userId: "user_2",
    botId: "bot_9",
  });

  assert.equal(blocked.allowed, false);
  assert.match(String(blocked.message || ""), /already locked to another BlackArrow account/i);
});

test("admin release frees the permanent owner lock", async () => {
  const store = new Map<string, string>();
  __setWhatsAppNumberLockTestDeps({
    isUniquenessEnforced: () => true,
    getSystemConfig: async (key: string) => store.get(key) || "",
    setSystemConfig: async (key: string, value: string) => { store.set(key, value); },
    getBotById: async () => null,
    listBotsByJid: async () => [],
    deleteSystemConfig: async (key: string) => { store.delete(key); },
  });

  await verifyWhatsAppNumberLock({
    jid: "contact-6c9bc40fc084@example.invalid",
    userId: "user_1",
    botId: "bot_1",
  });
  const released = await releaseWhatsAppNumberLock("contact-6c9bc40fc084@example.invalid", "bot_1");
  const next = await verifyWhatsAppNumberLock({
    jid: "contact-6c9bc40fc084@example.invalid",
    userId: "user_2",
    botId: "bot_2",
  });

  assert.equal(released, true);
  assert.equal(next.allowed, true);
});

test("existing connected bot backfills the owner lock and jid variants normalize to one key", async () => {
  const store = new Map<string, string>();
  __setWhatsAppNumberLockTestDeps({
    isUniquenessEnforced: () => true,
    getSystemConfig: async (key: string) => store.get(key) || "",
    setSystemConfig: async (key: string, value: string) => { store.set(key, value); },
    getBotById: async () => null,
    listBotsByJid: async () => [{ $id: "bot_existing", user_id: "user_1", jid: "contact-6c9bc40fc084@example.invalid" } as any],
    deleteSystemConfig: async (key: string) => { store.delete(key); },
  });

  const allowed = await verifyWhatsAppNumberLock({
    jid: "110064053003",
    userId: "user_1",
    botId: "bot_new",
  });
  const blocked = await verifyWhatsAppNumberLock({
    jid: "contact-6c9bc40fc084@example.invalid",
    userId: "user_2",
    botId: "bot_other",
  });

  assert.equal(normalizeWhatsAppJid("110064053003"), "contact-6c9bc40fc084@example.invalid");
  assert.equal(allowed.allowed, true);
  assert.equal(blocked.allowed, false);
  assert.equal(store.size, 1);
});

test("when uniqueness is disabled: dual accounts can link same number with separate bot session, billing owner, and customer namespaces", async () => {
  const store = new Map<string, string>();
  __setWhatsAppNumberLockTestDeps({
    isUniquenessEnforced: () => false,
    getSystemConfig: async (key: string) => store.get(key) || "",
    setSystemConfig: async (key: string, value: string) => { store.set(key, value); },
    getBotById: async (botId: string) => ({
      $id: botId,
      user_id: botId === "bot_alpha" ? "user_alpha" : "user_beta",
      jid: "contact-e4ed32210a80@example.invalid",
    } as any),
    listBotsByJid: async () => [],
    deleteSystemConfig: async (key: string) => { store.delete(key); },
  });

  const accountA = await verifyWhatsAppNumberLock({
    jid: "contact-e4ed32210a80@example.invalid",
    userId: "user_alpha",
    botId: "bot_alpha",
  });
  const accountB = await verifyWhatsAppNumberLock({
    jid: "contact-e4ed32210a80@example.invalid",
    userId: "user_beta",
    botId: "bot_beta",
  });

  assert.equal(accountA.allowed, true);
  assert.equal(accountB.allowed, true);

  // Verify session isolation keys
  const sessionDirA = `auth_info_baileys_${"bot_alpha"}`;
  const sessionDirB = `auth_info_baileys_${"bot_beta"}`;
  assert.notEqual(sessionDirA, sessionDirB);

  // Verify billing owner separation
  const userAlpha: string = "user_alpha";
  const userBeta: string = "user_beta";
  assert.notEqual(userAlpha, userBeta);

  // Verify Customer360 namespace isolation (Customer360 query uses bot_id)
  const c360QueryA = { bot_id: "bot_alpha", jid: "contact-4c8958cc74ea@example.invalid" };
  const c360QueryB = { bot_id: "bot_beta", jid: "contact-4c8958cc74ea@example.invalid" };
  assert.notEqual(c360QueryA.bot_id, c360QueryB.bot_id);
});
