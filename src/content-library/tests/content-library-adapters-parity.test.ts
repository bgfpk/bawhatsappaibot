import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMediaLibraryItems,
  buildSavedReplyItems,
  buildSequenceGroupItems,
  buildWelcomeSequenceConfig,
  buildMediaGroupItems,
  buildAddedSyncGroups,
  buildEditedSyncGroups,
  buildToggledSyncGroups,
  buildUnlinkedSyncGroups,
} from "../content-library-runtime-adapter.ts";

test("Content Library Adapters Parity", async (t) => {
  await t.test("buildMediaLibraryItems converts raw WhatsApp template payload into 22 MediaLibraryItems", () => {
    const rawTemplates = Array.from({ length: 22 }, (_, i) => ({
      key: { id: `msg_${i + 1}`, remoteJid: "contact-0c1f04090c5e@example.invalid" },
      messageTimestamp: 1750000000 + i * 60,
      message: i % 2 === 0
        ? { imageMessage: { caption: `Photo template #${i + 1}`, url: `https://example.com/img${i}.jpg` } }
        : { documentMessage: { fileName: `catalog_${i + 1}.pdf`, caption: `Catalog PDF #${i + 1}` } },
    }));

    const templateDetails = {
      media: {
        count: 22,
        templates: rawTemplates,
      },
    };

    const items = buildMediaLibraryItems(templateDetails);
    assert.equal(items.length, 22);
    assert.equal(items[0].id, "msg_1");
    assert.equal(items[0].type, "image");
    assert.equal(items[0].name, "Photo template #1");
    assert.equal(items[1].type, "document");
    assert.equal(items[1].fileName, "catalog_2.pdf");
  });

  await t.test("buildSavedReplyItems extracts sequence and welcome shortcuts into SavedReplyItem array", () => {
    const syncGroups = [
      {
        id: "seq_1",
        name: "Sales Prices",
        purpose: "sequence",
        shortcut_code: "prices",
        instructions: "Send price list automatically",
      },
      {
        id: "wel_1",
        name: "Welcome Flow",
        purpose: "welcome",
        shortcut_code: "start",
        instructions: "Greet new customer",
      },
    ];

    const templateDetails = {
      sequences: {
        "Sales Prices": {
          templates: [
            { message: { conversation: "Here is our 2026 pricing catalog!" } },
          ],
        },
      },
      welcome: {
        templates: [
          { message: { conversation: "Welcome to BlackArrow!" } },
        ],
      },
    };

    const savedReplies = buildSavedReplyItems(syncGroups, templateDetails);
    assert.equal(savedReplies.length, 2);

    const pricesReply = savedReplies.find((r) => r.shortcut === "prices");
    assert.ok(pricesReply);
    assert.equal(pricesReply.title, "Sales Prices");
    assert.equal(pricesReply.content, "Here is our 2026 pricing catalog!");

    const startReply = savedReplies.find((r) => r.shortcut === "start");
    assert.ok(startReply);
    assert.equal(startReply.title, "Welcome Flow");
    assert.equal(startReply.content, "Welcome to BlackArrow!");
  });

  await t.test("buildSequenceGroupItems preserves legacy purpose and shortcut configuration", () => {
    const syncGroups = [
      {
        id: "seq_legacy_1",
        name: "Product Demo",
        purpose: "sequence",
        shortcut_code: "demo",
        trigger_keywords: ["demo", "show me"],
        enabled: true,
        templateCount: 3,
      },
    ];

    const sequences = buildSequenceGroupItems(syncGroups, {
      sequences: {
        "Product Demo": {
          templates: [
            { message: { conversation: "Demo step 1" } },
            { message: { conversation: "Demo step 2" } },
            { message: { conversation: "Demo step 3" } },
          ],
        },
      },
    });

    assert.equal(sequences.length, 1);
    assert.equal(sequences[0].name, "Product Demo");
    assert.equal(sequences[0].shortcutCode, "demo");
    assert.equal(sequences[0].itemCount, 3);
    assert.equal(sequences[0].items.length, 3);
    assert.equal(sequences[0].keywordTrigger, "demo, show me");
  });

  await t.test("buildWelcomeSequenceConfig handles disabled welcome sequence cleanly", () => {
    const syncGroups = [
      {
        id: "wel_1",
        name: "Welcome Sequence",
        purpose: "welcome",
        enabled: false,
      },
    ];

    const welcomeConfig = buildWelcomeSequenceConfig(syncGroups, {
      welcome: {
        templates: [{ message: { conversation: "Hello!" } }],
      },
    });

    assert.equal(welcomeConfig.isEnabled, false);
    assert.equal(welcomeConfig.readinessStatus, "disabled");
  });

  await t.test("Purpose-aware syncGroup mutation helpers maintain strict group isolation", () => {
    const initialGroups = [
      { id: "med_1", jid: "contact-2e247c0bb3db@example.invalid", name: "Media Group", purpose: "media", enabled: true },
      { id: "seq_1", jid: "contact-bc99dd0c4ba8@example.invalid", name: "Sequence Group", purpose: "sequence", enabled: true },
      { id: "wel_1", jid: "contact-0db7a2377714@example.invalid", name: "Welcome Group", purpose: "welcome", enabled: true },
    ];

    // Unlinking media group with id "med_1" must ONLY remove the media group, leaving sequence & welcome intact!
    const unlinkedMedia = buildUnlinkedSyncGroups(initialGroups, "med_1", "media");
    assert.equal(unlinkedMedia.length, 2);
    assert.ok(unlinkedMedia.find((g) => g.purpose === "sequence"));
    assert.ok(unlinkedMedia.find((g) => g.purpose === "welcome"));
    assert.equal(unlinkedMedia.find((g) => g.purpose === "media"), undefined);

    // Toggling media group with id "med_1" must ONLY toggle media
    const toggledMedia = buildToggledSyncGroups(initialGroups, "med_1", false, "media");
    assert.equal(toggledMedia.find((g) => g.id === "med_1")?.enabled, false);
    assert.equal(toggledMedia.find((g) => g.id === "seq_1")?.enabled, true);
    assert.equal(toggledMedia.find((g) => g.id === "wel_1")?.enabled, true);

    // Editing welcome group must update welcome without mutating media or sequence
    const editedWelcome = buildEditedSyncGroups(
      initialGroups,
      { id: "wel_1", name: "New Welcome Name", shortcutCode: "hello" },
      "welcome"
    );
    assert.equal(editedWelcome.find((g) => g.id === "wel_1")?.name, "New Welcome Name");
    assert.equal(editedWelcome.find((g) => g.id === "med_1")?.name, "Media Group");
  });

  await t.test("buildAddedSyncGroups creates new group and enforces plan limits & ambiguity rules", () => {
    const initialGroups = [
      { id: "med_1", jid: "contact-3b7a00976096@example.invalid", name: "Media Group 1", purpose: "media" },
    ];

    // Adding media group when limit is 1 throws error
    assert.throws(() => {
      buildAddedSyncGroups(initialGroups, { name: "Media Group 2", jid: "contact-3383e9b82c45@example.invalid" }, "media", 1);
    }, /limit reached/i);

    // Adding media group under limit succeeds
    const added = buildAddedSyncGroups(initialGroups, { name: "Media Group 2", jid: "contact-3383e9b82c45@example.invalid", autoSync: true }, "media", 5);
    assert.equal(added.length, 2);
    assert.equal(added[1].name, "Media Group 2");
    assert.equal(added[1].purpose, "media");

    // Adding welcome group when welcome already exists throws
    const initialWithWelcome = [
      { id: "wel_1", name: "Welcome Sequence", purpose: "welcome" },
    ];
    assert.throws(() => {
      buildAddedSyncGroups(initialWithWelcome, { name: "Another Welcome" }, "welcome", 1);
    }, /only one welcome sequence configuration/i);
  });

  await t.test("buildWelcomeSequenceConfig treats name-only or JID-only purpose=welcome records as isConfigured", () => {
    const syncGroups = [
      {
        name: "Welcome Flow",
        purpose: "welcome",
      },
    ];

    const welcomeConfig = buildWelcomeSequenceConfig(syncGroups);
    assert.equal(welcomeConfig.isConfigured, true);
    assert.equal(welcomeConfig.name, "Welcome Flow");
    assert.equal(welcomeConfig.id, "Welcome Flow");
  });

  await t.test("buildSavedReplyItems preserves flowInstructions distinct from content", () => {
    const syncGroups = [
      {
        id: "seq_99",
        name: "Order Support",
        purpose: "sequence",
        shortcut_code: "support",
        instructions: "Flow instruction prompt v2",
      },
    ];
    const templateDetails = {
      sequences: {
        "Order Support": {
          templates: [{ message: { conversation: "Hello! How can I help with your order?" } }],
        },
      },
    };
    const saved = buildSavedReplyItems(syncGroups, templateDetails);
    assert.equal(saved[0].content, "Hello! How can I help with your order?");
    assert.equal(saved[0].flowInstructions, "Flow instruction prompt v2");
  });

  await t.test("resolveWelcomeSequenceGroup flags ambiguity_error for multiple Welcome groups", () => {
    const syncGroups = [
      { id: "wel_1", name: "Welcome 1", purpose: "welcome" },
      { id: "wel_2", name: "Welcome 2", purpose: "welcome" },
    ];
    const welcomeConfig = buildWelcomeSequenceConfig(syncGroups);
    assert.equal(welcomeConfig.readinessStatus, "ambiguity_error");
    assert.ok(welcomeConfig.guardReason?.includes("Configuration ambiguity error"));
  });
});
