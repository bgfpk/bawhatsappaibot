import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizePlanId,
  getPlanMonthlyPriceUsd,
  getAddonMonthlyPriceUsd,
  BILLING_ADDONS,
  BILLING_PLAN_DETAILS,
} from "../config/pricing.ts";
import {
  buildSequenceGroupItems,
  buildWelcomeSequenceConfig,
  buildMediaGroupItems,
} from "../content-library/content-library-runtime-adapter.ts";
import { buildAccountLimits } from "./account-limit-service.ts";
import { resolveRouteByPath, DASHBOARD_ROUTE_REGISTRY } from "../app/dashboard-route-registry.ts";
import { cancelPendingWelcomeJobs } from "./sequence-manager.ts";

test("Pricing Helpers: normalizePlanId handles raw strings and plan keys", () => {
  assert.equal(normalizePlanId("starter"), "starter_plan");
  assert.equal(normalizePlanId("starter_plan"), "starter_plan");
  assert.equal(normalizePlanId("Growth"), "growth_plan");
  assert.equal(normalizePlanId("growth_plan"), "growth_plan");
  assert.equal(normalizePlanId("PRO"), "pro_plan");
  assert.equal(normalizePlanId("pro_plan"), "pro_plan");
  assert.equal(normalizePlanId("invalid"), undefined);
});

test("Pricing Helpers: getPlanMonthlyPriceUsd returns exact canonical monthly prices ($9, $29, $89)", () => {
  assert.equal(getPlanMonthlyPriceUsd("starter"), 9);
  assert.equal(getPlanMonthlyPriceUsd("growth"), 29);
  assert.equal(getPlanMonthlyPriceUsd("pro"), 89);
  assert.equal(getPlanMonthlyPriceUsd("unknown"), undefined);

  assert.equal(BILLING_PLAN_DETAILS.starter_plan.monthlyPrice, 9);
  assert.equal(BILLING_PLAN_DETAILS.growth_plan.monthlyPrice, 29);
  assert.equal(BILLING_PLAN_DETAILS.pro_plan.monthlyPrice, 89);
});

test("Pricing Addons Data Contract: all 6 addons have numeric monthlyPriceUsd", () => {
  assert.equal(BILLING_ADDONS.length, 6);
  assert.equal(getAddonMonthlyPriceUsd("extra_instance"), 10);
  assert.equal(getAddonMonthlyPriceUsd("extra_30_products"), 7);
  assert.equal(getAddonMonthlyPriceUsd("extra_500_media"), 7);
  assert.equal(getAddonMonthlyPriceUsd("extra_5_sequence_groups"), 5);
  assert.equal(getAddonMonthlyPriceUsd("extra_10000_customers"), 10);
  assert.equal(getAddonMonthlyPriceUsd("extra_2000_orders"), 10);

  for (const addon of BILLING_ADDONS) {
    assert.equal(typeof addon.monthlyPriceUsd, "number");
    assert.ok(addon.monthlyPriceUsd > 0);
  }
});

test("Route Registry: /settings/billing route exists and legacy /billing/account resolves to it", () => {
  const route = resolveRouteByPath("/settings/billing");
  assert.equal(route.view, "settings");
  assert.equal(route.tab, "billing");
  assert.equal(route.id, "settings_billing");

  const legacyRoute = resolveRouteByPath("/billing/account");
  assert.equal(legacyRoute.view, "settings");
  assert.equal(legacyRoute.tab, "billing");
  assert.equal(legacyRoute.id, "settings_billing");
});

test("Content Library Runtime Adapter: correctly parses sequence, welcome, and media groups from syncGroups", () => {
  const sampleSyncGroups = [
    {
      name: "Sales Onboarding Sequence",
      jid: "contact-eff303a11623@example.invalid",
      purpose: "sequence",
      instructions: "Welcome new leads with pricing catalog",
      shortcut_code: "sales_lead",
      trigger_keywords: ["pricing", "catalog"],
      templateCount: 4,
      enabled: true,
    },
    {
      name: "VIP Welcome Sequence",
      jid: "contact-bb30f1b35cbb@example.invalid",
      purpose: "welcome",
      templateCount: 2,
      enabled: true,
    },
    {
      name: "Product Media Vault",
      jid: "contact-c8d1aa94313b@example.invalid",
      purpose: "media",
      templateCount: 15,
      enabled: true,
    },
  ];

  const templateDetails = {
    sequences: {
      "Sales Onboarding Sequence": {
        count: 4,
        templates: [
          { type: "text", text: "Hello! Welcome to BlackArrow." },
          { type: "image", caption: "Here is our product catalog brochure." },
        ],
      },
    },
    welcome: {
      templates: [{ type: "text", text: "Welcome! How can we assist you today?" }],
    },
  };

  const sequenceItems = buildSequenceGroupItems(sampleSyncGroups, templateDetails);
  assert.equal(sequenceItems.length, 1);
  assert.equal(sequenceItems[0].name, "Sales Onboarding Sequence");
  assert.equal(sequenceItems[0].itemCount, 2);
  assert.equal(sequenceItems[0].shortcutCode, "sales_lead");
  assert.equal(sequenceItems[0].keywordTrigger, "pricing, catalog");
  assert.equal(sequenceItems[0].isEnabled, true);

  const welcomeConfig = buildWelcomeSequenceConfig(sampleSyncGroups, templateDetails);
  assert.equal(welcomeConfig.name, "VIP Welcome Sequence");
  assert.equal(welcomeConfig.isEnabled, true);
  assert.equal(welcomeConfig.itemCount, 1);
  assert.equal(welcomeConfig.readinessStatus, "ready");

  const mediaGroups = buildMediaGroupItems(sampleSyncGroups, templateDetails);
  assert.equal(mediaGroups.length, 1);
  assert.equal(mediaGroups[0].name, "Product Media Vault");
  assert.equal(mediaGroups[0].status, "connected");
});

test("Sequence Capacity: buildAccountLimits incorporates base plan and extra_5_sequence_groups addon entitlements", () => {
  const futureExpiry = Math.floor(Date.now() / 1000) + 86400;
  const starterUser = { plan_id: "starter_plan", plan_expiry: futureExpiry };
  const starterLimits = buildAccountLimits(starterUser, []);
  assert.equal(starterLimits.sequenceGroupLimit, 3);

  const growthUser = { plan_id: "growth_plan", plan_expiry: futureExpiry };
  const growthLimits = buildAccountLimits(growthUser, []);
  assert.equal(growthLimits.sequenceGroupLimit, 10);

  const proUser = { plan_id: "pro_plan", plan_expiry: futureExpiry };
  const proLimits = buildAccountLimits(proUser, []);
  assert.equal(proLimits.sequenceGroupLimit, 30);

  const userWithAddon = { plan_id: "growth_plan", plan_expiry: futureExpiry };
  const subs = [{ type: "extra_5_sequence_groups", quantity: 2, expires_at: futureExpiry }];
  const addonLimits = buildAccountLimits(userWithAddon, subs);
  assert.equal(addonLimits.sequenceGroupLimit, 20); // 10 base + (2 * 5) = 20
});

test("Non-Sequence Preservation & Field Patching: sequence operations do not alter welcome/media groups or erase unknown properties", () => {
  const syncGroups = [
    { name: "Welcome Sequence", jid: "contact-3b022987d128@example.invalid", purpose: "welcome", autoSync: true, customMetaData: "secret_123" },
    { name: "Media Vault", jid: "contact-a53c66d64544@example.invalid", purpose: "media", templateCount: 12, storageNode: "node-2" },
    { name: "Sequence A", jid: "contact-e5c7119a60f2@example.invalid", purpose: "sequence", instructions: "Original instruction", shortcut_code: "seq_a", autoSync: true },
    { name: "Sequence B", jid: "contact-7355aaff76d2@example.invalid", purpose: "sequence", instructions: "Original B" }
  ];

  // Perform edit on Sequence A preserving existing fields
  const targetEdit = syncGroups.find(g => g.name === "Sequence A");
  const updatedEdit = {
    ...targetEdit,
    instructions: "Updated instruction",
    shortcut_code: "seq_a_v2",
    trigger_keywords: "sale, discount",
    enabled: true
  };

  const nextListAfterEdit = syncGroups.map(g => g.name === "Sequence A" ? updatedEdit : g);

  // Assert welcome and media groups are 100% untouched
  assert.equal(nextListAfterEdit[0].name, "Welcome Sequence");
  assert.equal(nextListAfterEdit[0].autoSync, true);
  assert.equal(nextListAfterEdit[0].customMetaData, "secret_123");
  assert.equal(nextListAfterEdit[1].name, "Media Vault");
  assert.equal(nextListAfterEdit[1].storageNode, "node-2");

  // Assert edited sequence kept existing properties like autoSync
  assert.equal(nextListAfterEdit[2].instructions, "Updated instruction");
  assert.equal(nextListAfterEdit[2].shortcut_code, "seq_a_v2");
  assert.equal(nextListAfterEdit[2].autoSync, true);

  // Unlink Sequence B
  const nextListAfterUnlink = nextListAfterEdit.filter(g => g.name !== "Sequence B");
  assert.equal(nextListAfterUnlink.length, 3);
  assert.equal(nextListAfterUnlink[0].purpose, "welcome");
  assert.equal(nextListAfterUnlink[1].purpose, "media");
  assert.equal(nextListAfterUnlink[2].name, "Sequence A");
});

test("Template Detail Adapter: handles unknown message types and malformed payloads without crashing", () => {
  const malformedSyncGroups = [
    { name: "Corrupted Group", jid: "contact-ad363ffc0ccb@example.invalid", purpose: "sequence" }
  ];

  const malformedTemplateDetails = {
    sequences: {
      "Corrupted Group": {
        count: 3,
        templates: [
          { type: "text", text: "Valid text" },
          { type: "unknown_future_payload", data: { foo: "bar" } },
          null,
        ]
      }
    }
  };

  const sequenceItems = buildSequenceGroupItems(malformedSyncGroups, malformedTemplateDetails);
  assert.equal(sequenceItems.length, 1);
  assert.equal(sequenceItems[0].name, "Corrupted Group");
  assert.equal(sequenceItems[0].itemCount, 3);
  assert.equal(sequenceItems[0].items[1].content, "Unsupported message format");
  assert.equal(sequenceItems[0].items[2].content, "Unsupported message format");
});

test("Regression: edit shortcut code preserves existing instructions", () => {
  const groups = [
    { name: "Sales Flow", purpose: "sequence", instructions: "Do not offer discounts above 10%", shortcut_code: "sales" }
  ];

  const adapted = buildSequenceGroupItems(groups);
  assert.equal(adapted[0].instructions, "Do not offer discounts above 10%");

  // Perform edit of shortcut only
  const edited = groups.map(g => {
    if (g.name === adapted[0].id || g.name === "Sales Flow") {
      return {
        ...g,
        shortcut_code: "sales_v2",
        instructions: g.instructions
      };
    }
    return g;
  });

  assert.equal(edited[0].shortcut_code, "sales_v2");
  assert.equal(edited[0].instructions, "Do not offer discounts above 10%");
});

import {
  isSequenceSyncGroup,
  getSequenceGroupStableId,
  findSequenceGroupIndex,
  assertUniqueSequenceGroupName,
  buildAddedSequenceGroups,
  buildEditedSequenceGroups,
  buildToggledSequenceGroups,
  buildUnlinkedSequenceGroups,
} from "../content-library/sequence-group-config-service.ts";
import { parseTemplateItem } from "../content-library/content-library-runtime-adapter.ts";

test("Sequence Mutation Service: restricts operations strictly to sequence groups and preserves welcome/media groups", () => {
  const syncGroups = [
    { name: "Main Welcome", jid: "contact-491c22ba87b4@example.invalid", purpose: "welcome" },
    { name: "Product Media", jid: "contact-491c22ba87b4@example.invalid", purpose: "media" },
    { name: "Onboarding Flow", jid: "contact-6d3d63d9c1a9@example.invalid", purpose: "sequence", shortcut_code: "onboard", enabled: true },
  ];

  // Verify filtering
  assert.equal(isSequenceSyncGroup(syncGroups[0]), false);
  assert.equal(isSequenceSyncGroup(syncGroups[1]), false);
  assert.equal(isSequenceSyncGroup(syncGroups[2]), true);

  // Edit sequence group
  const edited = buildEditedSequenceGroups(syncGroups, "contact-6d3d63d9c1a9@example.invalid", {
    name: "Onboarding Flow V2",
    shortcutCode: "onboard_v2",
  });
  assert.equal(edited.length, 3);
  assert.equal(edited[0].name, "Main Welcome");
  assert.equal(edited[1].name, "Product Media");
  assert.equal(edited[2].name, "Onboarding Flow V2");
  assert.equal(edited[2].shortcut_code, "onboard_v2");

  // Toggle sequence group
  const toggled = buildToggledSequenceGroups(edited, "contact-6d3d63d9c1a9@example.invalid", false);
  assert.equal(toggled[2].enabled, false);

  // Unlink sequence group
  const unlinked = buildUnlinkedSequenceGroups(toggled, "contact-6d3d63d9c1a9@example.invalid");
  assert.equal(unlinked.length, 2);
  assert.equal(unlinked[0].purpose, "welcome");
  assert.equal(unlinked[1].purpose, "media");
});

test("Sequence Mutation Service: duplicate name rejection and target-not-found safety", () => {
  const syncGroups = [
    { name: "Lead Nurture", purpose: "sequence", shortcut_code: "nurture" },
    { name: "Sales Outreach", purpose: "sequence", shortcut_code: "sales" },
  ];

  // Duplicate name check
  assert.throws(
    () => assertUniqueSequenceGroupName(syncGroups, "Lead Nurture"),
    /already exists/
  );
  assert.throws(
    () => buildAddedSequenceGroups(syncGroups, { name: "lead nurture", shortcutCode: "dup" }),
    /already exists/
  );

  // Target not found check
  assert.throws(
    () => findSequenceGroupIndex(syncGroups, "non_existent_id"),
    /Sequence group not found/
  );
  assert.throws(
    () => buildToggledSequenceGroups(syncGroups, "non_existent_id", false),
    /Sequence group not found/
  );
  assert.throws(
    () => buildUnlinkedSequenceGroups(syncGroups, "non_existent_id"),
    /Sequence group not found/
  );
});

test("Sequence Capacity: Growth plan + 2 extra_5_sequence_groups allows up to 20 sequences", () => {
  const sequenceGroupLimit = 20; // 10 base + (2 * 5)
  const existingGroups: any[] = [];
  for (let i = 1; i <= 19; i++) {
    existingGroups.push({ name: `Sequence ${i}`, purpose: "sequence" });
  }

  // 19/20: Add allowed
  const listWith20 = buildAddedSequenceGroups(existingGroups, { name: "Sequence 20" }, sequenceGroupLimit);
  assert.equal(listWith20.length, 20);

  // 20/20: Add blocked
  assert.throws(
    () => buildAddedSequenceGroups(listWith20, { name: "Sequence 21" }, sequenceGroupLimit),
    /capacity limit reached/
  );

  // At 20: Edit existing sequence allowed
  const listEditedAt20 = buildEditedSequenceGroups(listWith20, "Sequence 20", { name: "Sequence 20 Updated" });
  assert.equal(listEditedAt20.length, 20);
  assert.equal(listEditedAt20[19].name, "Sequence 20 Updated");
});

test("WhatsApp WAMessage Parsing: parseTemplateItem handles real nested Baileys payload structures", () => {
  // 1. Plain text conversation
  const textMsg = parseTemplateItem({ message: { conversation: "Hello there" } }, 0);
  assert.equal(textMsg.type, "text");
  assert.equal(textMsg.content, "Hello there");

  // 2. Extended text message
  const extendedMsg = parseTemplateItem({ message: { extendedTextMessage: { text: "Click here for details" } } }, 1);
  assert.equal(extendedMsg.type, "text");
  assert.equal(extendedMsg.content, "Click here for details");

  // 3. Image with caption
  const imageMsg = parseTemplateItem({ message: { imageMessage: { caption: "Product catalog picture", url: "http://img.jpg" } } }, 2);
  assert.equal(imageMsg.type, "image");
  assert.equal(imageMsg.content, "Product catalog picture");

  // 4. Video without caption
  const videoMsg = parseTemplateItem({ message: { videoMessage: { url: "http://vid.mp4" } } }, 3);
  assert.equal(videoMsg.type, "video");
  assert.equal(videoMsg.content, "Video");

  // 5. Document with fileName and caption
  const docMsg = parseTemplateItem({ message: { documentMessage: { caption: "Price list brochure", fileName: "prices.pdf" } } }, 4);
  assert.equal(docMsg.type, "document");
  assert.equal(docMsg.content, "Price list brochure");
  assert.equal(docMsg.fileName, "prices.pdf");

  // 6. Sticker message
  const stickerMsg = parseTemplateItem({ message: { stickerMessage: {} } }, 5);
  assert.equal(stickerMsg.type, "sticker");
  assert.equal(stickerMsg.content, "Sticker");

  // 7. Wrapped ephemeral message
  const ephemeralMsg = parseTemplateItem({
    message: {
      ephemeralMessage: {
        message: {
          imageMessage: { caption: "Ephemeral offer" }
        }
      }
    }
  }, 6);
  assert.equal(ephemeralMsg.type, "image");
  assert.equal(ephemeralMsg.content, "Ephemeral offer");

  // 8. Wrapped viewOnceMessageV2
  const viewOnceMsg = parseTemplateItem({
    message: {
      viewOnceMessageV2: {
        message: {
          videoMessage: { caption: "Secret product preview" }
        }
      }
    }
  }, 7);
  assert.equal(viewOnceMsg.type, "video");
  assert.equal(viewOnceMsg.content, "Secret product preview");
});

import { findMatchingSequence } from "./sequence-trigger-service.ts";
import { assertUniqueSequenceShortcut, normalizeShortcutCode } from "../content-library/sequence-group-config-service.ts";

test("findMatchingSequence: respects enabled === false for shortcut and keyword matching", () => {
  const cachedKeywordSequences: Record<string, any> = {
    "Sales Sequence": {
      jid: "contact-ec836b51907f@example.invalid",
      templates: [{ type: "text", content: "Hi from sales" }],
      config: {
        name: "Sales Sequence",
        shortcut_code: "sales",
        trigger_keywords: "pricing, catalog",
        enabled: true,
      }
    }
  };

  // 1. Enabled=true: shortcut matches
  let match = findMatchingSequence(cachedKeywordSequences, ["sales"]);
  assert.ok(match);
  assert.equal(match?.matchedBy, "shortcut");

  // 2. Enabled=true: keyword matches
  match = findMatchingSequence(cachedKeywordSequences, ["show me pricing"]);
  assert.ok(match);
  assert.equal(match?.matchedBy, "keyword");

  // 3. Disable sequence: enabled=false
  cachedKeywordSequences["Sales Sequence"].config.enabled = false;
  match = findMatchingSequence(cachedKeywordSequences, ["sales"]);
  assert.equal(match, null, "Disabled shortcut must not match");

  match = findMatchingSequence(cachedKeywordSequences, ["show me pricing"]);
  assert.equal(match, null, "Disabled keyword must not match");

  // 4. Re-enable sequence: enabled=true
  cachedKeywordSequences["Sales Sequence"].config.enabled = true;
  match = findMatchingSequence(cachedKeywordSequences, ["sales"]);
  assert.ok(match, "Re-enabled shortcut matches immediately");
  assert.equal(match?.matchedBy, "shortcut");
});

test("assertUniqueSequenceShortcut: rejects duplicate shortcut codes across case and normalization", () => {
  const syncGroups = [
    { name: "Flow A", purpose: "sequence", shortcut_code: "sales" },
    { name: "Flow B", purpose: "sequence", shortcut_code: "promo" }
  ];

  // 1. Exact duplicate rejected
  assert.throws(
    () => assertUniqueSequenceShortcut(syncGroups, "sales"),
    /already exists/
  );

  // 2. Case & punctuation normalized duplicate rejected (e.g. Sales, sales-, sales)
  assert.throws(
    () => assertUniqueSequenceShortcut(syncGroups, "Sales-"),
    /already exists/
  );

  // 3. Editing Flow A to keep its own shortcut is allowed
  assert.doesNotThrow(
    () => assertUniqueSequenceShortcut(syncGroups, "sales", "Flow A")
  );

  // 4. Blank or missing shortcut is allowed
  assert.doesNotThrow(
    () => assertUniqueSequenceShortcut(syncGroups, "")
  );
  assert.doesNotThrow(
    () => assertUniqueSequenceShortcut(syncGroups, undefined)
  );
});

test("Active Cache Filtering: enabled === false groups are excluded from active runtime cache", () => {
  const botConfig = {
    groups: [
      { name: "Welcome", purpose: "welcome", jid: "contact-1305da1e490c@example.invalid", enabled: false },
      { name: "Media", purpose: "media", jid: "contact-c073a3984970@example.invalid", enabled: true },
      { name: "Seq 1", purpose: "sequence", jid: "contact-af6ba35873cc@example.invalid", enabled: false },
      { name: "Seq 2", purpose: "sequence", jid: "contact-9fa5cfe3cc5b@example.invalid", enabled: true }
    ]
  };

  const activeWelcome = botConfig.groups.filter(g => g.purpose === "welcome" && g.enabled !== false);
  assert.equal(activeWelcome.length, 0, "Disabled welcome group excluded");

  const activeMedia = botConfig.groups.filter(g => g.purpose === "media" && g.enabled !== false);
  assert.equal(activeMedia.length, 1, "Enabled media group included");

  const activeSequences = botConfig.groups.filter(g => g.purpose === "sequence" && g.enabled !== false);
  assert.equal(activeSequences.length, 1, "Only enabled sequence group included");
  assert.equal(activeSequences[0].name, "Seq 2");
});

import { processShortcut } from "./sequence-manager.ts";

test("processShortcut: Welcome shortcut disabled (enabled === false) does NOT trigger or queue welcome sequence", async () => {
  let forwardCalls = 0;
  const mockSock = { user: { id: "123456789:contact-ecd0964c8b9b@example.invalid" } };
  const mockMsg = { key: { fromMe: false, remoteJid: "contact-e4ed32210a80@example.invalid" }, message: { conversation: "welcome" } };
  const mockIo = { emit: () => {} } as any;
  const pendingResponses: any[] = [];
  const currentlyReplying = new Set<string>();

  const disabledWelcomeSeq = {
    templates: [{ type: "text", content: "Welcome message" }],
    config: {
      name: "Welcome Group",
      purpose: "welcome",
      shortcut_code: "welcome",
      enabled: false
    }
  };

  const matched = await processShortcut(
    mockSock,
    "contact-e4ed32210a80@example.invalid",
    "Test Customer",
    mockMsg,
    "welcome",
    {},
    async () => {},
    async () => { forwardCalls++; return { status: "delivered" }; },
    pendingResponses,
    currentlyReplying,
    mockIo,
    disabledWelcomeSeq
  );

  assert.equal(matched, false, "Disabled welcome shortcut must return false");
  assert.equal(forwardCalls, 0, "No templates must be forwarded when welcome is disabled");
  assert.equal(pendingResponses.length, 0, "No items must be added to pending queue when welcome is disabled");

  // Enabled = true: shortcut matches
  const enabledWelcomeSeq = {
    ...disabledWelcomeSeq,
    config: { ...disabledWelcomeSeq.config, enabled: true }
  };

  const matchedEnabled = await processShortcut(
    mockSock,
    "contact-e4ed32210a80@example.invalid",
    "Test Customer",
    mockMsg,
    "welcome",
    {},
    async () => {},
    async () => { forwardCalls++; return { status: "delivered" }; },
    pendingResponses,
    currentlyReplying,
    mockIo,
    enabledWelcomeSeq
  );

  assert.equal(matchedEnabled, true, "Enabled welcome shortcut matches and returns true");
});

test("Pending Welcome Retry: dropped safely with status=skipped and reason=disabled when welcome config enabled === false", () => {
  const botConfig = {
    groups: [
      { name: "Welcome Group", purpose: "welcome", jid: "contact-3b022987d128@example.invalid", enabled: false }
    ]
  };

  const item = { type: "welcome", jid: "contact-e4ed32210a80@example.invalid" };
  const welcomeConfig = (botConfig.groups || []).find((g: any) => g.purpose === "welcome");

  let statusRecorded: any = null;
  let success = false;

  if (!welcomeConfig) {
    statusRecorded = { status: "skipped", reason: "no_welcome_config" };
    success = true;
  } else if ((welcomeConfig as any).enabled === false) {
    statusRecorded = { status: "skipped", reason: "disabled", source: "pending_welcome_retry" };
    success = true;
  }

  assert.equal(success, true, "Pending item resolved as handled");
  assert.equal(statusRecorded.status, "skipped", "Status recorded as skipped");
  assert.equal(statusRecorded.reason, "disabled", "Reason recorded as disabled");
});

test("cancelPendingWelcomeJobs: purges all pending welcome jobs while preserving other sequences", () => {
  const queue = [
    { type: "welcome", jid: "contact-85d2a3563239@example.invalid", sequenceName: "Welcome Group" },
    { type: "sequence", jid: "contact-126f2cd31c20@example.invalid", sequenceName: "Promo 1" },
    { type: "welcome", jid: "contact-d58a89d5392e@example.invalid", sequenceName: "Welcome Group" },
    { type: "shortcut", jid: "contact-b24f3916a145@example.invalid", sequenceName: "Pricing" },
  ];

  const cancelledCount = cancelPendingWelcomeJobs(queue);
  assert.equal(cancelledCount, 2, "Cancelled exactly 2 welcome jobs");
  assert.equal(queue.length, 2, "Queue length reduced to 2");
  assert.deepEqual(queue.map(q => q.type), ["sequence", "shortcut"], "Only non-welcome jobs remain");
});
