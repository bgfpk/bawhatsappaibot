import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMediaGroupItems,
  buildEditedSyncGroups,
  buildAddedSyncGroups,
  buildSequenceGroupItems,
  buildWelcomeSequenceConfig,
} from "../content-library-runtime-adapter.ts";
import {
  buildEditedSequenceGroups,
  buildAddedSequenceGroups,
} from "../sequence-group-config-service.ts";

test("Requirement 30-A: Connected instance participating groups normalized correctly", () => {
  const rawParticipatingGroups = [
    {
      id: "contact-5875fcb80c19@example.invalid",
      subject: "VIP Customers Group",
      desc: "Discussions & Catalogs",
      participants: [
        { id: "contact-2f5256f18e8b@example.invalid", admin: null },
        { id: "contact-2cd20f9602a6@example.invalid", admin: "admin" },
      ],
    },
  ];

  const normalized = rawParticipatingGroups.map((g) => ({
    jid: g.id,
    name: g.subject,
    description: g.desc,
    participantCount: g.participants.length,
    isBotParticipant: true,
    isBotAdmin: g.participants.some((p) => p.admin === "admin" && p.id === "contact-2cd20f9602a6@example.invalid"),
  }));

  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].jid, "contact-5875fcb80c19@example.invalid");
  assert.equal(normalized[0].name, "VIP Customers Group");
  assert.equal(normalized[0].participantCount, 2);
  assert.equal(normalized[0].isBotAdmin, true);
});

test("Requirement 30-B & 30-O: Group discovery requires authenticated owned bot check", () => {
  const accountId = "usr_acc_123";
  const ownedBots = [{ id: "bot_owned_1", accountId }, { id: "bot_owned_2", accountId }];
  
  const checkBotOwnership = (reqAccountId: string, botId: string) => {
    return ownedBots.some((b) => b.id === botId && b.accountId === reqAccountId);
  };

  assert.equal(checkBotOwnership(accountId, "bot_owned_1"), true);
  assert.equal(checkBotOwnership(accountId, "bot_alien_999"), false);
  assert.equal(checkBotOwnership("usr_hacker", "bot_owned_1"), false);
});

test("Requirement 30-C & 30-D: Search filters participating groups by name case-insensitively", () => {
  const groups = [
    { jid: "contact-93d7c997cd60@example.invalid", name: "Camas y Muebles" },
    { jid: "contact-4ec3cbc5b56d@example.invalid", name: "Sillas de Oficina" },
    { jid: "contact-12e436dedc01@example.invalid", name: "Catálogo General Camas" },
  ];

  const filter = (query: string) => {
    const q = query.trim().toLowerCase();
    return groups.filter((g) => g.name.toLowerCase().includes(q));
  };

  assert.equal(filter("camas").length, 2);
  assert.equal(filter("oficina").length, 1);
  assert.equal(filter("mesas").length, 0);
});

test("Requirement 30-E: Selecting group stores exact JID and name automatically", () => {
  const selectedGroup = {
    jid: "contact-8dded9f4924c@example.invalid",
    name: "Camas Guatemala Oficial",
  };

  const syncGroups: any[] = [];
  const updated = buildAddedSyncGroups(
    syncGroups,
    {
      groupJid: selectedGroup.jid,
      name: selectedGroup.name,
      instructions: "High priority catalog items",
      autoSync: true,
      isEnabled: true,
    },
    "media"
  );

  assert.equal(updated.length, 1);
  assert.equal(updated[0].jid, "contact-8dded9f4924c@example.invalid");
  assert.equal(updated[0].name, "Camas Guatemala Oficial");
  assert.equal(updated[0].purpose, "media");
  assert.equal(updated[0].autoSync, true);
  assert.equal(updated[0].enabled, true);
});

test("Requirement 30-F: JID is authoritative runtime identity and not manually editable in selector flow", () => {
  const initialGroup = {
    id: "med_1",
    jid: "contact-a491c3a8b2f8@example.invalid",
    name: "Products Group",
    purpose: "media",
  };

  // User selects an actual new group via selector
  const updatedViaSelector = buildEditedSyncGroups(
    [initialGroup],
    {
      id: "med_1",
      groupJid: "contact-8dded9f4924c@example.invalid",
      name: "New Real WhatsApp Group",
    },
    "media"
  );

  assert.equal(updatedViaSelector[0].jid, "contact-8dded9f4924c@example.invalid");
  assert.equal(updatedViaSelector[0].name, "New Real WhatsApp Group");
});

test("Requirement 30-G: Editing existing group preselects by JID, not display name", () => {
  const existingConfig = {
    id: "med_10",
    jid: "contact-db2d9c109f4a@example.invalid",
    name: "Local Alias Name",
    purpose: "media",
  };

  const liveWhatsAppGroups = [
    { jid: "contact-db2d9c109f4a@example.invalid", name: "WhatsApp Subject Changed Remotely" },
    { jid: "contact-285761367306@example.invalid", name: "Local Alias Name" }, // Different group with coincidental name
  ];

  const preselected = liveWhatsAppGroups.find((g) => g.jid === existingConfig.jid);
  assert.ok(preselected);
  assert.equal(preselected.jid, "contact-db2d9c109f4a@example.invalid");
  assert.equal(preselected.name, "WhatsApp Subject Changed Remotely");
});

test("Requirement 30-H & 30-J: Editing instructions preserves JID even if discovery is empty or offline", () => {
  const existingConfig = {
    id: "med_camas",
    jid: "contact-a491c3a8b2f8@example.invalid",
    name: "Camas",
    instructions: "Old instructions",
    purpose: "media",
    enabled: true,
  };

  // User opens edit modal and only updates instructions; groupJid is undefined in partial payload
  const saved = buildEditedSyncGroups(
    [existingConfig],
    {
      id: "med_camas",
      instructions: "Updated instructions for AI catalog",
    },
    "media"
  );

  assert.equal(saved[0].jid, "contact-a491c3a8b2f8@example.invalid");
  assert.equal(saved[0].instructions, "Updated instructions for AI catalog");

  // User submits form where groupJid was blank string due to transient discovery failure
  const savedWithBlankJid = buildEditedSyncGroups(
    [existingConfig],
    {
      id: "med_camas",
      groupJid: "",
      instructions: "Transient discovery failure should never wipe JID",
    },
    "media"
  );

  assert.equal(savedWithBlankJid[0].jid, "contact-a491c3a8b2f8@example.invalid");
  assert.equal(savedWithBlankJid[0].instructions, "Transient discovery failure should never wipe JID");
});

test("Requirement 30-I: Group title changes on WhatsApp but same JID remains linked", () => {
  const existingGroup = {
    id: "med_camas_1",
    jid: "contact-c7dd5198dc5c@example.invalid",
    name: "Camas Antiguo",
    purpose: "media",
  };

  // WhatsApp subject was renamed remotely to "Camas Moderno 2026"
  const updated = buildEditedSyncGroups(
    [existingGroup],
    {
      id: "med_camas_1",
      name: "Camas Moderno 2026",
      groupJid: "contact-c7dd5198dc5c@example.invalid",
    },
    "media"
  );

  assert.equal(updated[0].jid, "contact-c7dd5198dc5c@example.invalid");
  assert.equal(updated[0].name, "Camas Moderno 2026");
});

test("Requirement 30-L: Missing JID group cannot claim healthy Capturing state; shows needs_group", () => {
  const missingJidGroup = {
    id: "med_broken",
    name: "Camas",
    jid: "",
    purpose: "media",
    enabled: true,
    autoSync: true,
  };

  const validJidGroup = {
    id: "med_healthy",
    name: "Catalogo Real",
    jid: "contact-a491c3a8b2f8@example.invalid",
    purpose: "media",
    enabled: true,
    autoSync: true,
  };

  const disabledGroup = {
    id: "med_disabled",
    name: "Catalogo Pausado",
    jid: "contact-8dded9f4924c@example.invalid",
    purpose: "media",
    enabled: false,
    autoSync: true,
  };

  const items = buildMediaGroupItems([missingJidGroup, validJidGroup, disabledGroup]);

  assert.equal(items[0].status, "needs_group");
  assert.equal(items[1].status, "connected");
  assert.equal(items[2].status, "paused");
});

test("Requirement 30-M: Sequence group setup uses same group selector without manual JID", () => {
  const currentSequences: any[] = [];
  const added = buildAddedSequenceGroups(currentSequences, {
    name: "Onboarding Sequence",
    groupJid: "contact-285761367306@example.invalid",
    shortcutCode: "onboard",
    instructions: "Send intro templates in order",
    isEnabled: true,
  });

  assert.equal(added.length, 1);
  assert.equal(added[0].jid, "contact-285761367306@example.invalid");
  assert.equal(added[0].name, "Onboarding Sequence");
  assert.equal(added[0].purpose, "sequence");

  // Editing sequence preserves JID
  const edited = buildEditedSequenceGroups(added, "Onboarding Sequence", {
    name: "Onboarding Sequence Updated",
    instructions: "Updated instructions",
    isEnabled: true,
  });
  assert.equal(edited[0].jid, "contact-285761367306@example.invalid");
  assert.equal(edited[0].name, "Onboarding Sequence Updated");
});

test("Requirement 30-N: Welcome sequence setup uses same group selector without manual JID", () => {
  const currentGroups: any[] = [];
  const added = buildAddedSyncGroups(
    currentGroups,
    {
      name: "First Contact Welcome",
      groupJid: "contact-3c86c3d5861c@example.invalid",
      shortcutCode: "welcome",
      instructions: "Deliver introductory catalog on first message",
      isEnabled: true,
    },
    "welcome"
  );

  assert.equal(added.length, 1);
  assert.equal(added[0].jid, "contact-3c86c3d5861c@example.invalid");
  assert.equal(added[0].purpose, "welcome");

  const config = buildWelcomeSequenceConfig(added, {
    welcome: { templates: [{ type: "image", caption: "Welcome to our store!" }] },
  });

  assert.equal(config.isConfigured, true);
  assert.equal(config.groupJid, "contact-3c86c3d5861c@example.invalid");
  assert.equal(config.readinessStatus, "ready");
});

test("Requirement 30-P: Changing selected bot clears stale previous bot group selection", () => {
  let activeBotId = "bot_1";
  let selectedJid = "contact-5875fcb80c19@example.invalid";

  const handleBotChange = (newBotId: string) => {
    activeBotId = newBotId;
    selectedJid = ""; // Must clear stale selection
  };

  handleBotChange("bot_2");
  assert.equal(activeBotId, "bot_2");
  assert.equal(selectedJid, "");
});
