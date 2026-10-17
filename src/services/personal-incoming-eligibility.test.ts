/**
 * Personal Incoming Assistant Reply Eligibility Tests
 * 
 * Tests all 15 deterministic eligibility gates per Prompt 4 specification.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateIncomingPersonalReply,
  recordManualTakeover,
  clearManualTakeover,
  isManualTakeoverActive,
  markMessageProcessed,
  isMessageAlreadyProcessed,
  __resetEligibilityTrackingForTest,
} from "./personal-incoming-eligibility-service.ts";
import { __resetAtomicClaimTestDeps } from "./canonical-claim-service.ts";
import type { PersonalContact } from "./personal-contact-types.ts";
import type { PersonalIncomingAssistantSettings } from "./personal-incoming-types.ts";

const mockTenantId = "tenant_test_001";
const mockPersonalBotConfig = {
  $id: "bot_personal_001",
  bot_id: "bot_personal_001",
  instancePurpose: "personal",
  controlBusinessInstanceId: "bot_biz_001",
};

const mockBusinessBotConfig = {
  $id: "bot_biz_001",
  bot_id: "bot_biz_001",
  instancePurpose: "business",
};

const mockActiveContact: PersonalContact = {
  contactId: "pc_contact_001",
  schemaVersion: 1,
  revision: 1,
  accountId: mockTenantId,
  status: "active",
  relationshipProvenance: "owner_provided",
  displayName: "Hamza Supplier",
  relationship: "supplier",
  whatsappIdentities: [{
    personalInstanceId: "bot_personal_001",
    jid: "contact-e4ed32210a80@example.invalid",
    jidType: "pn",
    canonicalPhone: "+144225232320",
  }],
  communicationPreferences: {
    contactCommunicationStatus: "active",
  },
  durableFacts: [],
  ownerNotes: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const mockActiveSettings: PersonalIncomingAssistantSettings = {
  instanceId: "bot_personal_001",
  tenantId: mockTenantId,
  enabled: true,
  incomingReplyMode: "known_contacts_only",
  unknownContactPolicy: "ignore",
  assistantDisplayName: "Sarah Assistant",
  disclosureMode: "first_contact",
  manualTakeoverDurationMinutes: 60,
  ownerEscalationEnabled: true,
  globalInstructions: "Be concise.",
  updatedAt: Date.now(),
};

test("Personal Incoming Assistant - 15 Canonical Eligibility Gates", async (t) => {
  t.beforeEach(() => {
    __resetAtomicClaimTestDeps(true);
    __resetEligibilityTrackingForTest();
    process.env.ENABLE_PERSONAL_ASSISTANT = "true";
  });

  t.after(() => {
    __resetAtomicClaimTestDeps(false);
    process.env.ENABLE_PERSONAL_ASSISTANT = "true";
  });

  await t.test("Gate 1: Product feature flag disabled -> BLOCKED (feature_disabled)", async () => {
    process.env.ENABLE_PERSONAL_ASSISTANT = "false";
    const result = await evaluateIncomingPersonalReply({
      tenantId: mockTenantId,
      botConfig: mockPersonalBotConfig,
      remoteJid: "contact-e4ed32210a80@example.invalid",
      messageId: "msg_1",
      contact: mockActiveContact,
      injectedSettings: mockActiveSettings,
    });
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.reason, "feature_disabled");
  });

  await t.test("Gate 2: Instance purpose != personal -> BLOCKED (instance_not_personal)", async () => {
    const result = await evaluateIncomingPersonalReply({
      tenantId: mockTenantId,
      botConfig: mockBusinessBotConfig,
      remoteJid: "contact-e4ed32210a80@example.invalid",
      messageId: "msg_2",
      contact: mockActiveContact,
      injectedSettings: mockActiveSettings,
    });
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.reason, "instance_not_personal");
  });

  await t.test("Gate 3: Settings missing / default off -> BLOCKED (incoming_assistant_disabled)", async () => {
    const result = await evaluateIncomingPersonalReply({
      tenantId: mockTenantId,
      botConfig: mockPersonalBotConfig,
      remoteJid: "contact-e4ed32210a80@example.invalid",
      messageId: "msg_3",
      contact: mockActiveContact,
      injectedSettings: { ...mockActiveSettings, enabled: false },
    });
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.reason, "incoming_assistant_disabled");
  });

  await t.test("Gate 4: Settings enabled = false -> BLOCKED (incoming_assistant_disabled)", async () => {
    const result = await evaluateIncomingPersonalReply({
      tenantId: mockTenantId,
      botConfig: mockPersonalBotConfig,
      remoteJid: "contact-e4ed32210a80@example.invalid",
      messageId: "msg_4",
      contact: mockActiveContact,
      injectedSettings: { ...mockActiveSettings, enabled: false, incomingReplyMode: "off" },
    });
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.reason, "incoming_assistant_disabled");
  });

  await t.test("Gate 5: Control Business instance missing/unlinked -> BLOCKED (control_business_unavailable)", async () => {
    const unlinkedBot = { ...mockPersonalBotConfig, controlBusinessInstanceId: undefined };
    const result = await evaluateIncomingPersonalReply({
      tenantId: mockTenantId,
      botConfig: unlinkedBot,
      remoteJid: "contact-e4ed32210a80@example.invalid",
      messageId: "msg_5",
      contact: mockActiveContact,
      injectedSettings: mockActiveSettings,
    });
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.reason, "control_business_unavailable");
  });

  await t.test("Gate 6: Reply scope OFF -> BLOCKED (incoming_assistant_disabled)", async () => {
    const result = await evaluateIncomingPersonalReply({
      tenantId: mockTenantId,
      botConfig: mockPersonalBotConfig,
      remoteJid: "contact-e4ed32210a80@example.invalid",
      messageId: "msg_6",
      contact: mockActiveContact,
      injectedSettings: { ...mockActiveSettings, incomingReplyMode: "off" },
    });
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.reason, "incoming_assistant_disabled");
  });

  await t.test("Gate 7: Reply scope KNOWN_CONTACTS_ONLY + unknown contact -> BLOCKED (unknown_contact_not_allowed)", async () => {
    const result = await evaluateIncomingPersonalReply({
      tenantId: mockTenantId,
      botConfig: mockPersonalBotConfig,
      remoteJid: "contact-626862d4b59f@example.invalid",
      messageId: "msg_7",
      contact: null,
      isNewContact: true,
      injectedSettings: { ...mockActiveSettings, incomingReplyMode: "known_contacts_only" },
    });
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.reason, "unknown_contact_not_allowed");
  });

  await t.test("Gate 8: Reply scope KNOWN_CONTACTS_ONLY + known contact -> ALLOWED", async () => {
    const result = await evaluateIncomingPersonalReply({
      tenantId: mockTenantId,
      botConfig: mockPersonalBotConfig,
      remoteJid: "contact-e4ed32210a80@example.invalid",
      messageId: "msg_8",
      contact: mockActiveContact,
      injectedSettings: { ...mockActiveSettings, incomingReplyMode: "known_contacts_only" },
    });
    assert.strictEqual(result.allowed, true);
    assert.strictEqual(result.reason, "allowed");
  });

  await t.test("Gate 9: Reply scope ALL_PRIVATE_CONTACTS + unknown contact -> ALLOWED", async () => {
    const result = await evaluateIncomingPersonalReply({
      tenantId: mockTenantId,
      botConfig: mockPersonalBotConfig,
      remoteJid: "contact-6db0c233d9ab@example.invalid",
      messageId: "msg_9",
      contact: null,
      isNewContact: true,
      injectedSettings: {
        ...mockActiveSettings,
        incomingReplyMode: "all_private_contacts",
        unknownContactPolicy: "reply",
      },
    });
    assert.strictEqual(result.allowed, true);
    assert.strictEqual(result.reason, "allowed");
  });

  await t.test("Gate 10: Group message (@g.us) -> BLOCKED (unsupported_chat_type)", async () => {
    const result = await evaluateIncomingPersonalReply({
      tenantId: mockTenantId,
      botConfig: mockPersonalBotConfig,
      remoteJid: "contact-885de4b1d789@example.invalid",
      messageId: "msg_10",
      contact: mockActiveContact,
      injectedSettings: mockActiveSettings,
    });
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.reason, "unsupported_chat_type");
  });

  await t.test("Gate 11: Broadcast/newsletter/status -> BLOCKED (unsupported_chat_type)", async () => {
    for (const jid of ["status@broadcast", "12345@newsletter", "12345@broadcast"]) {
      const result = await evaluateIncomingPersonalReply({
        tenantId: mockTenantId,
        botConfig: mockPersonalBotConfig,
        remoteJid: jid,
        messageId: `msg_11_${jid}`,
        contact: mockActiveContact,
        injectedSettings: mockActiveSettings,
      });
      assert.strictEqual(result.allowed, false);
      assert.strictEqual(result.reason, "unsupported_chat_type");
    }
  });

  await t.test("Gate 12: fromMe manual message -> BLOCKED and records takeover window", async () => {
    const result = await evaluateIncomingPersonalReply({
      tenantId: mockTenantId,
      botConfig: mockPersonalBotConfig,
      remoteJid: "contact-e4ed32210a80@example.invalid",
      messageId: "msg_12",
      isFromMe: true,
      contact: mockActiveContact,
      injectedSettings: mockActiveSettings,
    });
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.reason, "from_me_manual_takeover");

    // Verify takeover is now active
    const isActive = isManualTakeoverActive(mockTenantId, "bot_personal_001", mockActiveContact.contactId);
    assert.strictEqual(isActive.active, true);
  });

  await t.test("Gate 13: Incoming message during active manual takeover -> BLOCKED (manual_takeover_active)", async () => {
    recordManualTakeover(mockTenantId, "bot_personal_001", mockActiveContact.contactId, 60);
    const result = await evaluateIncomingPersonalReply({
      tenantId: mockTenantId,
      botConfig: mockPersonalBotConfig,
      remoteJid: "contact-e4ed32210a80@example.invalid",
      messageId: "msg_13",
      isFromMe: false,
      contact: mockActiveContact,
      injectedSettings: mockActiveSettings,
    });
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.reason, "manual_takeover_active");
  });

  await t.test("Gate 14: Contact paused by owner -> BLOCKED (contact_paused)", async () => {
    const pausedContact: PersonalContact = {
      ...mockActiveContact,
      communicationPreferences: {
        contactCommunicationStatus: "paused_by_owner",
      },
    };
    const result = await evaluateIncomingPersonalReply({
      tenantId: mockTenantId,
      botConfig: mockPersonalBotConfig,
      remoteJid: "contact-e4ed32210a80@example.invalid",
      messageId: "msg_14",
      contact: pausedContact,
      injectedSettings: mockActiveSettings,
    });
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.reason, "contact_paused");
  });

  await t.test("Gate 15: Contact blocked or do_not_contact -> BLOCKED", async () => {
    const dncContact: PersonalContact = {
      ...mockActiveContact,
      communicationPreferences: {
        contactCommunicationStatus: "do_not_contact",
      },
    };
    const dncRes = await evaluateIncomingPersonalReply({
      tenantId: mockTenantId,
      botConfig: mockPersonalBotConfig,
      remoteJid: "contact-e4ed32210a80@example.invalid",
      messageId: "msg_15a",
      contact: dncContact,
      injectedSettings: mockActiveSettings,
    });
    assert.strictEqual(dncRes.allowed, false);
    assert.strictEqual(dncRes.reason, "contact_do_not_contact");

    const blockedContact: PersonalContact = {
      ...mockActiveContact,
      communicationPreferences: {
        contactCommunicationStatus: "blocked_by_owner",
      },
    };
    const blockedRes = await evaluateIncomingPersonalReply({
      tenantId: mockTenantId,
      botConfig: mockPersonalBotConfig,
      remoteJid: "contact-e4ed32210a80@example.invalid",
      messageId: "msg_15b",
      contact: blockedContact,
      injectedSettings: mockActiveSettings,
    });
    assert.strictEqual(blockedRes.allowed, false);
    assert.strictEqual(blockedRes.reason, "contact_blocked");
  });
});
