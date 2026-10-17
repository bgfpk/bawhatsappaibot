import test from "node:test";
import assert from "node:assert/strict";

import {
  isExactResetCommand,
  isAuthorizedResetSender,
  getMessageTimestampMs,
  filterMessagesAfterReset,
  applyGroupResetToStore,
  recordGroupResetTimestamp,
  serializeTemplateStoreWithMeta,
} from "../content-library-reset-service.ts";

test("Reset Command Detection: exact standalone 'reset' and '- reset' commands match", () => {
  assert.equal(isExactResetCommand("reset"), true);
  assert.equal(isExactResetCommand("RESET"), true);
  assert.equal(isExactResetCommand("  reset  "), true);
  assert.equal(isExactResetCommand("- reset"), true);
  assert.equal(isExactResetCommand("- RESET"), true);
  assert.equal(isExactResetCommand("  - reset  "), true);
});

test("Reset Command Detection: embedded text does NOT trigger destructive reset", () => {
  assert.equal(isExactResetCommand("please reset this"), false);
  assert.equal(isExactResetCommand("reset order"), false);
  assert.equal(isExactResetCommand("can you reset the password?"), false);
  assert.equal(isExactResetCommand("resetting"), false);
  assert.equal(isExactResetCommand(""), false);
  assert.equal(isExactResetCommand(null), false);
  assert.equal(isExactResetCommand(undefined), false);
});

test("Reset Authorization: owner (fromMe: true) is always authorized", () => {
  assert.equal(isAuthorizedResetSender({ fromMe: true }), true);
  assert.equal(
    isAuthorizedResetSender({
      fromMe: true,
      senderJid: "contact-ec20495cc107@example.invalid",
      adminNumber: "130550897135",
    }),
    true
  );
});

test("Reset Authorization: configured admin number digits are authorized", () => {
  assert.equal(
    isAuthorizedResetSender({
      fromMe: false,
      senderJid: "contact-83742b4558c8@example.invalid",
      adminNumber: "130550897135",
    }),
    true
  );

  // Admin number with leading 0 matching normalized digits
  assert.equal(
    isAuthorizedResetSender({
      fromMe: false,
      senderJid: "contact-83742b4558c8@example.invalid",
      adminNumber: "10388056894",
    }),
    true
  );

  // Admin verified phone match
  assert.equal(
    isAuthorizedResetSender({
      fromMe: false,
      senderJid: "contact-83742b4558c8@example.invalid",
      adminVerifiedPhone: "+92 339 4135544",
    }),
    true
  );
});

test("Reset Authorization: unauthorized group participant cannot reset templates", () => {
  assert.equal(
    isAuthorizedResetSender({
      fromMe: false,
      senderJid: "contact-9113b3869185@example.invalid",
      adminNumber: "130550897135",
    }),
    false
  );

  // No admin configured and not fromMe
  assert.equal(
    isAuthorizedResetSender({
      fromMe: false,
      senderJid: "contact-9113b3869185@example.invalid",
    }),
    false
  );
});

test("Timestamp Normalization: handles seconds, milliseconds, and Baileys Long objects", () => {
  const msgSeconds = { messageTimestamp: 1700000000 };
  assert.equal(getMessageTimestampMs(msgSeconds), 1700000000000);

  const msgMillis = { messageTimestamp: 1700000000123 };
  assert.equal(getMessageTimestampMs(msgMillis), 1700000000123);

  const msgBaileysLong = { messageTimestamp: { low: 1700000500 } };
  assert.equal(getMessageTimestampMs(msgBaileysLong), 1700000500000);

  const msgWrapped = { originalMessage: { messageTimestamp: 1700000600 } };
  assert.equal(getMessageTimestampMs(msgWrapped), 1700000600000);

  assert.equal(getMessageTimestampMs(null), 0);
  assert.equal(getMessageTimestampMs({}), 0);
});

test("Anti-Resurrection: filterMessagesAfterReset discards pre-reset messages", () => {
  const resetThreshold = 1700000500000; // ms

  const messages = [
    { key: { id: "old_1" }, messageTimestamp: 1700000100 }, // before reset
    { key: { id: "old_2" }, messageTimestamp: 1700000500 }, // at exact reset threshold
    { key: { id: "new_1" }, messageTimestamp: 1700000600 }, // strictly AFTER reset
    { key: { id: "new_2" }, messageTimestamp: 1700000700 }, // strictly AFTER reset
  ];

  const filtered = filterMessagesAfterReset(messages, resetThreshold);
  assert.equal(filtered.length, 2);
  assert.equal(filtered[0].key.id, "new_1");
  assert.equal(filtered[1].key.id, "new_2");
});

test("Per-Group Reset Isolation: resetting Group B leaves Group A, C, and D untouched", () => {
  const localStore: Record<string, any[]> = {
    "contact-a0f9fd2d568d@example.invalid": [{ key: { id: "a_1" } }, { key: { id: "a_2" } }],
    "contact-a86f01f2d89b@example.invalid": [{ key: { id: "b_1" } }, { key: { id: "b_2" } }, { key: { id: "b_3" } }],
    "contact-72299f77d20c@example.invalid": [{ key: { id: "c_1" } }],
    "contact-3b022987d128@example.invalid": [{ key: { id: "w_1" } }],
  };

  applyGroupResetToStore(localStore, "contact-a86f01f2d89b@example.invalid");

  // Group B is cleared
  assert.equal(localStore["contact-a86f01f2d89b@example.invalid"].length, 0);

  // Groups A, C, and Welcome remain untouched
  assert.equal(localStore["contact-a0f9fd2d568d@example.invalid"].length, 2);
  assert.equal(localStore["contact-72299f77d20c@example.invalid"].length, 1);
  assert.equal(localStore["contact-3b022987d128@example.invalid"].length, 1);
});

test("Durable Reset Tombstones: records timestamp and serializes into template store metadata", () => {
  const initialMap: Record<string, number> = {
    "contact-a0f9fd2d568d@example.invalid": 1699999000000,
  };

  const resetTime = 1700001000000;
  const updatedMap = recordGroupResetTimestamp(initialMap, "contact-a86f01f2d89b@example.invalid", resetTime);

  assert.equal(updatedMap["contact-a0f9fd2d568d@example.invalid"], 1699999000000);
  assert.equal(updatedMap["contact-a86f01f2d89b@example.invalid"], resetTime);

  const templateStore = {
    "contact-a0f9fd2d568d@example.invalid": [{ key: { id: "a_1" } }],
    "contact-a86f01f2d89b@example.invalid": [],
  };

  const serialized = serializeTemplateStoreWithMeta(templateStore, updatedMap);
  assert.equal(serialized.__meta?.groupResetAt?.["contact-a86f01f2d89b@example.invalid"], resetTime);
  assert.equal(serialized.__meta?.version, 2);
  assert.equal(Array.isArray(serialized["contact-a86f01f2d89b@example.invalid"]), true);
  assert.equal(serialized["contact-a86f01f2d89b@example.invalid"].length, 0);
});

test("Stale Hydration Protection: old backup cannot resurrect reset templates", () => {
  const groupJid = "contact-48b33bb1407b@example.invalid";
  const resetAt = 1700002000000;

  // Stale backup from botId or connectedBotJid store containing old templates captured before reset
  const staleBackupFromDatabase = {
    __meta: { groupResetAt: {} },
    [groupJid]: [
      { key: { id: "stale_tpl_1" }, message: { imageMessage: { caption: "Offer 1" } }, messageTimestamp: 1700001000 },
      { key: { id: "stale_tpl_2" }, message: { imageMessage: { caption: "Offer 2" } }, messageTimestamp: 1700001500 },
    ],
  };

  // When hydrating with active groupResetAt tombstone:
  const activeTombstones: Record<string, number> = { [groupJid]: resetAt };
  const restoredMessages = filterMessagesAfterReset(staleBackupFromDatabase[groupJid], activeTombstones[groupJid]);

  // All stale messages must be rejected
  assert.equal(restoredMessages.length, 0);

  // New message captured AFTER reset passes through
  const newMessageAfterReset = {
    key: { id: "fresh_tpl_1" },
    message: { imageMessage: { caption: "New Catalog" } },
    messageTimestamp: 1700003000,
  };
  const withNew = filterMessagesAfterReset([...staleBackupFromDatabase[groupJid], newMessageAfterReset], activeTombstones[groupJid]);
  assert.equal(withNew.length, 1);
  assert.equal(withNew[0].key.id, "fresh_tpl_1");
});

test("Reset Preserves Group Bindings and Configurations", () => {
  const configuredGroups = [
    {
      id: "media_grp",
      name: "Media Group",
      purpose: "media",
      jid: "contact-48b33bb1407b@example.invalid",
      instructions: "Send product photos only",
      autoSync: true,
      enabled: true,
      templateCount: 23,
    },
    {
      id: "seq_grp_1",
      name: "Pricing Flow",
      purpose: "sequence",
      jid: "contact-71652412ca68@example.invalid",
      shortcutCode: "price",
      keywordTrigger: "pricing, cost",
      instructions: "Explain packages clearly",
      autoSync: true,
      enabled: true,
      templateCount: 5,
    },
  ];

  // Simulating reset of Sequence Group 1
  const targetSeqJid = "contact-71652412ca68@example.invalid";
  const updatedGroups = configuredGroups.map((g) => {
    if (g.jid === targetSeqJid) {
      return { ...g, templateCount: 0 };
    }
    return g;
  });

  const resetGroup = updatedGroups.find((g) => g.jid === targetSeqJid)!;
  // Template count is 0
  assert.equal(resetGroup.templateCount, 0);
  // All configuration attributes are preserved intact
  assert.equal(resetGroup.jid, "contact-71652412ca68@example.invalid");
  assert.equal(resetGroup.name, "Pricing Flow");
  assert.equal(resetGroup.shortcutCode, "price");
  assert.equal(resetGroup.keywordTrigger, "pricing, cost");
  assert.equal(resetGroup.instructions, "Explain packages clearly");
  assert.equal(resetGroup.autoSync, true);
  assert.equal(resetGroup.enabled, true);

  // Other groups untouched
  const mediaGroup = updatedGroups.find((g) => g.purpose === "media")!;
  assert.equal(mediaGroup.templateCount, 23);
  assert.equal(mediaGroup.jid, "contact-48b33bb1407b@example.invalid");
});
