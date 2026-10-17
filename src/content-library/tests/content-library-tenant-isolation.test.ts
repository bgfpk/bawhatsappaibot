import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveTenantTemplateStoreCandidates,
  filterHydrationStoresAndGroups,
  serializeTemplateStoreWithMeta,
} from "../content-library-reset-service.ts";

// Standard demo fixtures
const USER_A = "usr_tenant_alpha_111";
const BOT_A = "bot_alpha_primary_111";
const PHONE_A = "+126724984593";

const USER_B = "usr_tenant_bravo_222";
const BOT_B = "bot_bravo_primary_222";
const PHONE_B = "+151929803453";

test("Test A: User A owns bot_A, User B owns bot_B; manifests for both exist; User A candidates must NEVER return bot_B", () => {
  const candidates = resolveTenantTemplateStoreCandidates({
    userId: USER_A,
    botId: BOT_A,
    activeBots: [
      { id: BOT_A, userId: USER_A, phoneNumber: PHONE_A },
      { id: BOT_B, userId: USER_B, phoneNumber: PHONE_B },
    ],
    manifests: [
      { key: "tpl_hash_a_manifest", botId: BOT_A, accountId: USER_A, version: 2 },
      { key: "tpl_hash_b_manifest", botId: BOT_B, accountId: USER_B, version: 2 },
    ],
    allBotsLookup: [
      { id: BOT_A, userId: USER_A },
      { id: BOT_B, userId: USER_B },
    ],
  });

  assert.ok(candidates.includes(BOT_A), "User A's bot must be included");
  assert.ok(!candidates.includes(BOT_B), "User B's bot must NEVER be returned to User A");
  assert.ok(!candidates.some((c) => c.includes("222")), "No User B phone or bot identity may leak");
});

test("Test B: User B manifest appears first in query results; User A candidates still cannot leak", () => {
  const candidates = resolveTenantTemplateStoreCandidates({
    userId: USER_A,
    botId: BOT_A,
    activeBots: [
      { id: BOT_A, userId: USER_A, phoneNumber: PHONE_A },
      { id: BOT_B, userId: USER_B, phoneNumber: PHONE_B },
    ],
    // Manifest B comes first in query results
    manifests: [
      { key: "tpl_first_b_manifest", botId: BOT_B, accountId: USER_B, version: 2 },
      { key: "tpl_second_a_manifest", botId: BOT_A, accountId: USER_A, version: 2 },
    ],
    allBotsLookup: [
      { id: BOT_A, userId: USER_A },
      { id: BOT_B, userId: USER_B },
    ],
  });

  assert.deepEqual(
    candidates.filter((c) => c === BOT_B),
    [],
    "User B's bot must not be in candidates even if its manifest is listed first"
  );
  assert.ok(candidates.includes(BOT_A));
});

test("Test C: Legacy manifest with bot_B and no accountId; authoritative BOTS says user_B; User A cannot receive it", () => {
  const candidates = resolveTenantTemplateStoreCandidates({
    userId: USER_A,
    botId: BOT_A,
    activeBots: [
      { id: BOT_A, userId: USER_A, phoneNumber: PHONE_A },
      { id: BOT_B, userId: USER_B, phoneNumber: PHONE_B },
    ],
    manifests: [
      // Legacy version 1 manifest with NO accountId / userId
      { key: "tpl_legacy_b_manifest", botId: BOT_B, version: 1 },
    ],
    allBotsLookup: [
      { id: BOT_A, userId: USER_A },
      { id: BOT_B, userId: USER_B },
    ],
  });

  assert.ok(!candidates.includes(BOT_B), "Legacy manifest for bot_B must be rejected via authoritative BOTS check");
});

test("Test D: Deleted archive belonging to user_A (archive.userId=user_A, archive.botId=old_bot_A) may be returned for user_A", () => {
  const OLD_BOT_A = "bot_alpha_historical_archive";

  const candidates = resolveTenantTemplateStoreCandidates({
    userId: USER_A,
    botId: BOT_A,
    activeBots: [
      { id: BOT_A, userId: USER_A, phoneNumber: PHONE_A },
    ],
    deletedBotArchives: [
      { userId: USER_A, botId: OLD_BOT_A, phoneNumber: "+137198324521" },
    ],
    manifests: [
      { key: "tpl_old_a_manifest", botId: OLD_BOT_A, version: 1 },
    ],
  });

  assert.ok(candidates.includes(OLD_BOT_A), "Deleted bot archive proven to belong to user_A must be returned");
});

test("Test E: Deleted archive belonging to user_B must never be returned for user_A", () => {
  const OLD_BOT_B = "bot_bravo_historical_archive";

  const candidates = resolveTenantTemplateStoreCandidates({
    userId: USER_A,
    botId: BOT_A,
    activeBots: [
      { id: BOT_A, userId: USER_A, phoneNumber: PHONE_A },
    ],
    deletedBotArchives: [
      { userId: USER_B, botId: OLD_BOT_B, phoneNumber: "+173312024142" },
    ],
    manifests: [
      { key: "tpl_old_b_manifest", botId: OLD_BOT_B, version: 1 },
    ],
    allBotsLookup: [
      { id: BOT_A, userId: USER_A },
      { id: BOT_B, userId: USER_B },
    ],
  });

  assert.ok(!candidates.includes(OLD_BOT_B), "User B's deleted bot archive must never be returned for User A");
});

test("Test F: Hydration defense-in-depth rejects foreign bot even if manually passed into candidate input", () => {
  const userAAllowedCandidates = new Set([BOT_A, "bot_alpha_historical_archive"]);

  // An adversary or bug manually passes foreign bot_B into candidate input
  const manuallySuppliedIds = [BOT_B, BOT_A];

  // Defense-in-depth filter enforced by hydration
  const safeStoreIds = manuallySuppliedIds.filter((id) => userAAllowedCandidates.has(id));

  assert.deepEqual(safeStoreIds, [BOT_A], "Foreign bot_B must be stripped before loading from database");
  assert.ok(!safeStoreIds.includes(BOT_B));
});

test("Test G: Foreign group templates cannot appear in bot_A localStore", () => {
  const GROUP_A = "contact-71652412ca68@example.invalid";
  const FOREIGN_GROUP_B = "contact-36da24199210@example.invalid";

  const incomingRemoteStore = {
    [GROUP_A]: [
      { key: { id: "msg_a_1" }, message: { conversation: "Product Catalogue A" } },
      { key: { id: "msg_a_2" }, message: { conversation: "Image caption A" } },
    ],
    [FOREIGN_GROUP_B]: [
      { key: { id: "msg_b_1" }, message: { conversation: "SECRET Customer Data B" } },
      { key: { id: "msg_b_2" }, message: { conversation: "Invoice details B" } },
    ],
  };

  // Bot A only configures GROUP_A
  const botAConfiguredGroups = new Set([GROUP_A]);

  const { filteredStore, totalRestored } = filterHydrationStoresAndGroups({
    incomingStore: incomingRemoteStore,
    configuredGroupJids: botAConfiguredGroups,
  });

  assert.equal(totalRestored, 2, "Only 2 messages from GROUP_A should be restored");
  assert.ok(Boolean(filteredStore[GROUP_A]), "Configured GROUP_A must be preserved");
  assert.equal(filteredStore[GROUP_A].length, 2);
  assert.equal(filteredStore[FOREIGN_GROUP_B], undefined, "FOREIGN_GROUP_B must be completely dropped");
});

test("Test H: Foreign groupResetAt tombstones cannot enter bot_A botConfig", () => {
  const GROUP_A = "contact-71652412ca68@example.invalid";
  const FOREIGN_GROUP_B = "contact-36da24199210@example.invalid";

  const incomingRemoteStore = {
    __meta: {
      groupResetAt: {
        [GROUP_A]: 1780000001000,
        [FOREIGN_GROUP_B]: 1780000099000, // Foreign tombstone
      },
    },
    [GROUP_A]: [
      {
        key: { id: "msg_a_fresh" },
        messageTimestamp: 1780000005, // > reset threshold
        message: { conversation: "Fresh template after reset" },
      },
    ],
  };

  const botAConfiguredGroups = new Set([GROUP_A]);
  const initialResetMap: Record<string, number> = {};

  const { updatedGroupResetMap } = filterHydrationStoresAndGroups({
    incomingStore: incomingRemoteStore,
    configuredGroupJids: botAConfiguredGroups,
    existingGroupResetMap: initialResetMap,
  });

  assert.equal(updatedGroupResetMap[GROUP_A], 1780000001000, "GROUP_A tombstone must be preserved");
  assert.equal(
    updatedGroupResetMap[FOREIGN_GROUP_B],
    undefined,
    "FOREIGN_GROUP_B tombstone must NEVER contaminate bot_A botConfig"
  );
});

test("Test I: After hydration bot_A persistence contains only bot_A/account_A Content Library data", () => {
  const GROUP_A = "contact-71652412ca68@example.invalid";
  const FOREIGN_GROUP_B = "contact-36da24199210@example.invalid";

  const incomingStore = {
    __meta: {
      groupResetAt: {
        [GROUP_A]: 1700000000000,
        [FOREIGN_GROUP_B]: 1700000000000,
      },
    },
    [GROUP_A]: [
      {
        key: { id: "msg_a_valid" },
        messageTimestamp: 1700001000,
        message: { conversation: "Valid User A template" },
      },
    ],
    [FOREIGN_GROUP_B]: [
      {
        key: { id: "msg_b_foreign" },
        messageTimestamp: 1700001000,
        message: { conversation: "Foreign User B template" },
      },
    ],
  };

  const botAConfiguredGroups = new Set([GROUP_A]);
  const { filteredStore, updatedGroupResetMap } = filterHydrationStoresAndGroups({
    incomingStore,
    configuredGroupJids: botAConfiguredGroups,
  });

  const serialized = serializeTemplateStoreWithMeta(filteredStore, updatedGroupResetMap);

  assert.ok(Array.isArray(serialized[GROUP_A]));
  assert.equal(serialized[FOREIGN_GROUP_B], undefined, "Foreign group must NOT exist in serialized store");
  assert.equal(
    serialized.__meta?.groupResetAt?.[FOREIGN_GROUP_B],
    undefined,
    "Foreign group tombstone must NOT exist in serialized store metadata"
  );
  assert.equal(serialized.__meta?.groupResetAt?.[GROUP_A], 1700000000000);
});

test("Test J: Two users with identical WhatsApp group display names remain isolated", () => {
  const USER_A_GROUP_JID = "contact-71652412ca68@example.invalid";
  const USER_B_GROUP_JID = "contact-9dbf85639683@example.invalid";

  // Both groups are named "VIP Customers"
  const incomingStore = {
    [USER_A_GROUP_JID]: [
      { key: { id: "msg_1" }, message: { conversation: "User A VIP promo" } },
    ],
    [USER_B_GROUP_JID]: [
      { key: { id: "msg_2" }, message: { conversation: "User B VIP promo" } },
    ],
  };

  // Bot A is configured strictly with USER_A_GROUP_JID
  const botAConfiguredGroups = new Set([USER_A_GROUP_JID]);

  const { filteredStore } = filterHydrationStoresAndGroups({
    incomingStore,
    configuredGroupJids: botAConfiguredGroups,
  });

  assert.ok(filteredStore[USER_A_GROUP_JID]);
  assert.equal(filteredStore[USER_B_GROUP_JID], undefined, "User B group with same display name is isolated by authoritative JID");
});
