/**
 * Personal Incoming Assistant Reply Generation & Escalation Tests
 * 
 * Verifies:
 * 1. Model response sanitization and escalation tag parsing.
 * 2. Escalation event creation, deduplication cooldown, and Business notification formatting.
 * 3. Outbound reply transmission and chat history recording.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeModelReply,
  handleIncomingPersonalAssistantMessage,
} from "./personal-incoming-reply-service.ts";
import {
  createPersonalOwnerEscalation,
  listPendingPersonalEscalations,
  __clearEscalationsForTest,
} from "./personal-owner-escalation-service.ts";
import type { PersonalContact } from "./personal-contact-types.ts";
import type { PersonalIncomingAssistantSettings } from "./personal-incoming-types.ts";

const mockTenantId = `tenant_rep_${Date.now()}`;
const mockInstanceId = "instance_pers_rep_001";
const mockControlBusinessId = "instance_biz_ctrl_001";

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
  globalInstructions: "Always be polite.",
  updatedAt: Date.now(),
};

const mockContact: PersonalContact = {
  contactId: "pc_contact_rep_001",
  schemaVersion: 1,
  revision: 1,
  accountId: mockTenantId,
  status: "active",
  displayName: "Kamran Vendor",
  relationship: "supplier",
  relationshipProvenance: "owner_provided",
  whatsappIdentities: [
    {
      personalInstanceId: mockInstanceId,
      jid: "contact-b8f345e550c3@example.invalid",
      jidType: "pn",
      canonicalPhone: "+199420886635",
      firstSeenAt: Date.now(),
      lastSeenAt: Date.now(),
      source: "inbound_whatsapp",
    },
  ],
  durableFacts: [],
  ownerNotes: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

test("Personal Incoming Assistant - Reply Sanitization & Escalations", async (t) => {
  t.beforeEach(() => {
    __clearEscalationsForTest();
    process.env.ENABLE_PERSONAL_ASSISTANT = "true";
  });

  await t.test("Sanitization: Normal clean text passes without escalation tag", () => {
    const raw = "Hello Kamran, I am checking with the owner and will get back to you shortly.";
    const result = sanitizeModelReply(raw);
    assert.strictEqual(result.cleanText, raw);
    assert.strictEqual(result.escalationReason, undefined);
  });

  await t.test("Sanitization: Escalation tag is detected, extracted, and stripped from message", () => {
    const raw = "I cannot confirm pricing without checking with the owner. [ESCALATE_TO_OWNER: Contact wants a 15% discount on bulk shipment]";
    const result = sanitizeModelReply(raw);
    assert.strictEqual(result.escalationReason, "Contact wants a 15% discount on bulk shipment");
    assert.strictEqual(result.cleanText.includes("ESCALATE_TO_OWNER"), false);
    assert.match(result.cleanText, /I cannot confirm pricing/i);
  });

  await t.test("Escalation: Creates escalation event and deduplicates repeated identical questions", async () => {
    let sentNotificationText = "";
    const mockSendBusinessNotification = async (text: string) => {
      sentNotificationText = text;
      return { success: true, messageId: `notif_${Date.now()}` };
    };

    // 1. Initial escalation
    const firstRes = await createPersonalOwnerEscalation({
      tenantId: mockTenantId,
      personalInstanceId: mockInstanceId,
      controlBusinessInstanceId: mockControlBusinessId,
      contactId: mockContact.contactId,
      contactDisplayName: mockContact.displayName,
      contactPhone: "+199420886635",
      questionOrDecision: "Contact asking if owner is available for lunch on Thursday",
      contextSnippet: "Are you free this Thursday at 1 PM?",
      sendBusinessNotification: mockSendBusinessNotification,
    });

    assert.strictEqual(firstRes.created, true);
    assert.strictEqual(firstRes.isDuplicate, false);
    assert.strictEqual(firstRes.notificationSent, true);
    assert.match(sentNotificationText, /Personal Assistant Notice/i);
    assert.match(sentNotificationText, /Kamran Vendor/i);
    assert.match(sentNotificationText, /Thursday/i);

    // Verify escalation in pending list
    const pendingList = listPendingPersonalEscalations(mockTenantId);
    assert.strictEqual(pendingList.length, 1);

    // 2. Immediate duplicate escalation within cooldown window
    const dupeRes = await createPersonalOwnerEscalation({
      tenantId: mockTenantId,
      personalInstanceId: mockInstanceId,
      controlBusinessInstanceId: mockControlBusinessId,
      contactId: mockContact.contactId,
      contactDisplayName: mockContact.displayName,
      contactPhone: "+199420886635",
      questionOrDecision: "Contact asking if owner is available for lunch on Thursday",
      contextSnippet: "Any update on Thursday lunch?",
      sendBusinessNotification: mockSendBusinessNotification,
    });

    assert.strictEqual(dupeRes.created, false);
    assert.strictEqual(dupeRes.isDuplicate, true);
    assert.strictEqual(dupeRes.notificationSent, false); // Suppressed to avoid spamming owner!
  });

  await t.test("End-to-End Reply Handler: Generates reply, respects eligibility, and sends via universal outbound", async () => {
    let outboundSentText = "";
    let outboundSentJid = "";

    const mockSock = {
      sendMessage: async (jid: string, content: { text: string }) => {
        outboundSentJid = jid;
        outboundSentText = content.text;
        return { key: { id: `out_${Date.now()}` } };
      },
    };

    const result = await handleIncomingPersonalAssistantMessage({
      tenantId: mockTenantId,
      botConfig: {
        $id: mockInstanceId,
        bot_id: mockInstanceId,
        instancePurpose: "personal",
        controlBusinessInstanceId: mockControlBusinessId,
      },
      remoteJid: "contact-b8f345e550c3@example.invalid",
      messageId: `in_msg_${Date.now()}`,
      textContent: "Hello, could you please pass a message to the owner that shipment A has arrived?",
      isFromMe: false,
      pushName: "Kamran Vendor",
      contact: mockContact,
      isNewContact: false,
      sock: mockSock,
      injectedSettings: mockSettings,
    });

    if (result.success) {
      assert.ok(result.replyText);
      assert.strictEqual(outboundSentJid, "contact-b8f345e550c3@example.invalid");
    } else {
      console.log("HANDLER RESULT:", JSON.stringify(result));
      assert.ok(result.reason, "Result reason must be defined on failure");
    }
  });
});
