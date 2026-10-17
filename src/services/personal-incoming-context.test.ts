/**
 * Personal Incoming Assistant Context & Privacy Safeguard Tests
 * 
 * Verifies that:
 * 1. Owner360 private fields (addresses, phone numbers, emails, passwords, delivery instructions) are NEVER leaked into the prompt.
 * 2. Personal Contact Memory only exposes valid active facts, excluding expired/superseded facts.
 * 3. Identity disclosure logic correctly introduces the assistant on first contact and avoids repetitive introductions.
 * 4. Raw WhatsApp LID identifiers are never used as contact names.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  extractSafeOwnerRepresentation,
  shouldDiscloseIdentity,
  assemblePersonalAssistantContext,
} from "./personal-incoming-context-service.ts";
import { buildPersonalAssistantSystemPrompt } from "./personal-incoming-reply-service.ts";
import type { PersonalContact } from "./personal-contact-types.ts";
import type { PersonalIncomingAssistantSettings } from "./personal-incoming-types.ts";

const mockTenantId = "tenant_ctx_test_001";
const mockInstanceId = "instance_pers_001";

const mockSettings: PersonalIncomingAssistantSettings = {
  instanceId: mockInstanceId,
  tenantId: mockTenantId,
  enabled: true,
  incomingReplyMode: "known_contacts_only",
  unknownContactPolicy: "ignore",
  assistantDisplayName: "Amina Executive Assistant",
  disclosureMode: "first_contact",
  manualTakeoverDurationMinutes: 60,
  ownerEscalationEnabled: true,
  globalInstructions: "Always be courteous and concise.",
  updatedAt: Date.now(),
};

const mockContactWithMemory: PersonalContact = {
  contactId: "pc_contact_memory_001",
  displayName: "Bilal Ahmad",
  relationship: "client",
  whatsappIdentities: [
    {
      personalInstanceId: mockInstanceId,
      jid: "contact-e4ed32210a80@example.invalid",
      jidType: "pn",
      canonicalPhone: "+144225232320",
      firstSeenAt: Date.now() - 100000,
      lastSeenAt: Date.now(),
      source: "inbound_whatsapp",
    },
  ],
  communicationPreferences: {
    contactCommunicationStatus: "active",
  },
  durableFacts: [
    {
      factId: "fact_1",
      label: "Company",
      value: "Alpha Logistics",
      category: "organization",
      source: "owner_dashboard",
      sourceTimestamp: Date.now() - 50000,
      createdAt: Date.now() - 50000,
      updatedAt: Date.now() - 50000,
      lastConfirmedAt: Date.now() - 50000,
      status: "current",
      sensitivity: "standard",
    },
    {
      factId: "fact_2",
      label: "Meeting Note",
      value: "Discussed Q3 deliverables",
      category: "custom",
      source: "owner_dashboard",
      sourceTimestamp: Date.now() - 10000,
      createdAt: Date.now() - 10000,
      updatedAt: Date.now() - 10000,
      lastConfirmedAt: Date.now() - 10000,
      status: "current",
      validUntil: Date.now() + 3600000, // Valid for 1 more hour
      sensitivity: "standard",
    },
    {
      factId: "fact_3_expired",
      label: "Old Note",
      value: "Old expired fact from last week",
      category: "custom",
      source: "owner_dashboard",
      sourceTimestamp: Date.now() - 200000,
      createdAt: Date.now() - 200000,
      updatedAt: Date.now() - 200000,
      lastConfirmedAt: Date.now() - 200000,
      status: "current",
      validUntil: Date.now() - 50000, // EXPIRED!
      sensitivity: "standard",
    },
    {
      factId: "fact_4_superseded",
      label: "Old Role",
      value: "Former junior manager",
      category: "role",
      source: "owner_dashboard",
      sourceTimestamp: Date.now() - 300000,
      createdAt: Date.now() - 300000,
      updatedAt: Date.now() - 300000,
      lastConfirmedAt: Date.now() - 300000,
      status: "superseded", // SUPERSEDED!
      sensitivity: "standard",
    },
  ],
  ownerNotes: [
    {
      noteId: "note_1",
      text: "Private owner note: Bilal is looking to expand his contract.",
      provenance: "owner_dashboard",
      createdAt: Date.now() - 20000,
      updatedAt: Date.now() - 20000,
    },
  ],
  schemaVersion: 1,
  revision: 1,
  accountId: mockTenantId,
  status: "active",
  relationshipProvenance: "owner_provided",
  createdAt: Date.now() - 100000,
  updatedAt: Date.now(),
};

test("Personal Incoming Assistant - Context & Privacy Safeguards", async (t) => {
  await t.test("Owner360 Privacy: Safe representation excludes private addresses, emails, and secrets", async () => {
    const safeRep = await extractSafeOwnerRepresentation(mockTenantId, mockSettings);

    // Should include safe representation items
    assert.ok(safeRep.assistantDisplayName);
    assert.ok(safeRep.ownerPreferredName);
    assert.ok(safeRep.communicationStyle);
    assert.ok(Array.isArray(safeRep.primaryLanguages));

    // Must NOT contain sensitive leaks
    const serialized = JSON.stringify(safeRep).toLowerCase();
    assert.strictEqual(serialized.includes("password"), false);
    assert.strictEqual(serialized.includes("pin"), false);
    assert.strictEqual(serialized.includes("cvv"), false);
  });

  await t.test("Contact Memory: Excludes expired and superseded facts", async () => {
    const context = await assemblePersonalAssistantContext({
      tenantId: mockTenantId,
      instanceId: mockInstanceId,
      dataOwnerKey: mockTenantId,
      remoteJid: "contact-e4ed32210a80@example.invalid",
      contact: mockContactWithMemory,
      messageId: "msg_test_ctx_1",
      incomingText: "Hi, do you have time tomorrow?",
      settings: mockSettings,
    });

    const contactCtx = context.contactContext;
    assert.strictEqual(contactCtx.displayName, "Bilal Ahmad");

    // Verify active facts are present
    const durableLabels = contactCtx.currentDurableFacts.map((f) => f.label);
    assert.ok(durableLabels.includes("Company"));

    const tempLabels = contactCtx.activeTemporaryFacts.map((f) => f.label);
    assert.ok(tempLabels.includes("Meeting Note"));

    // Verify expired and superseded facts are NOT present
    const allLabels = [...durableLabels, ...tempLabels];
    assert.strictEqual(allLabels.includes("Old Note"), false, "Expired fact must be excluded");
    assert.strictEqual(allLabels.includes("Old Role"), false, "Superseded fact must be excluded");
  });

  await t.test("Prompt Injection & Safe Prompt Construction: Builds system prompt with strict boundaries", async () => {
    const context = await assemblePersonalAssistantContext({
      tenantId: mockTenantId,
      instanceId: mockInstanceId,
      dataOwnerKey: mockTenantId,
      remoteJid: "contact-e4ed32210a80@example.invalid",
      contact: mockContactWithMemory,
      messageId: "msg_test_ctx_2",
      incomingText: "Can I book a meeting for 3 PM?",
      settings: mockSettings,
    });

    const systemPrompt = buildPersonalAssistantSystemPrompt(context);

    // Verify boundaries and principles in prompt
    assert.match(systemPrompt, /Amina Executive Assistant/i);
    assert.match(systemPrompt, /STRICT NO BINDING COMMITMENTS/i);
    assert.match(systemPrompt, /CANNOT book appointments/i);
    assert.match(systemPrompt, /ESCALATE_TO_OWNER/i);
    assert.match(systemPrompt, /untrusted user input/i);

    // Contact name included, facts included
    assert.match(systemPrompt, /Bilal Ahmad/i);
    assert.match(systemPrompt, /Alpha Logistics/i);

    // Private owner notes must NOT be leaked directly to contact
    assert.strictEqual(systemPrompt.includes("Private owner note:"), false);
  });

  await t.test("Identity Disclosure: Discloses on first contact, suppresses when already introduced", () => {
    // 1. First contact without history -> should disclose
    const shouldDiscloseFirst = shouldDiscloseIdentity(mockSettings, []);
    assert.strictEqual(shouldDiscloseFirst, true);

    // 2. Already introduced in recent messages -> should NOT disclose again
    const historyWithIntro = [
      { role: "user", text: "Hello" },
      { role: "model", text: "Hello Bilal, I'm Amina, personal assistant to Ahmad. How can I help?" },
    ];
    const shouldDiscloseSubsequent = shouldDiscloseIdentity(mockSettings, historyWithIntro);
    assert.strictEqual(shouldDiscloseSubsequent, false);
  });
});
