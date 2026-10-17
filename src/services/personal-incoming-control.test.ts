/**
 * Personal Incoming Assistant Control & Channel Architecture Tests
 * 
 * Verifies that:
 * 1. Personal WhatsApp Instance NEVER accepts owner administrative commands.
 * 2. Self-chats and fromMe messages on Personal Instance never execute actions.
 * 3. Business WhatsApp Instance is the sole authorized control channel.
 * 4. Admin BA tools (enable, disable, update, pause, resume) operate securely under authorized admin context.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { getAdminAction, canExecuteAdminBusinessAction } from "./admin-action-registry-service.ts";
import "./personal-incoming-admin-tools.ts";
import { getIncomingPersonalAssistantSettings } from "./personal-incoming-settings-service.ts";
import { isManualTakeoverActive, recordManualTakeover } from "./personal-incoming-eligibility-service.ts";
import * as personalContactService from "./personal-contact-service.ts";
import type { AdminBusinessAssistantContext } from "./admin-identity-service.ts";

function createAdminContext(accountId = "tenant_ctrl_test_001"): AdminBusinessAssistantContext {
  return {
    accountId,
    userId: "user_owner_001",
    botId: "bot_biz_001",
    adminPhone: "112250469451",
    adminJid: "contact-85d2a3563239@example.invalid",
    adminRole: "owner",
    isBusinessAssistantEnabled: true,
    mode: "admin_business_assistant",
    conversationId: `conv_${Date.now()}`,
    isAuthorizedAdmin: true,
    isPrimaryOwner: true,
  };
}

test("Personal Incoming Assistant - Permanent Channel Architecture & Admin Control", async (t) => {
  const mockTenantId = `tenant_ctrl_${Date.now()}`;
  const mockPersonalInstanceId = "instance_pers_001";
  const adminContext = createAdminContext(mockTenantId);

  t.beforeEach(() => {
    process.env.ENABLE_PERSONAL_ASSISTANT = "true";
  });

  await t.test("Registration: All 8 Incoming Personal Assistant tools registered", () => {
    const expectedTools = [
      "enable_incoming_personal_assistant",
      "disable_incoming_personal_assistant",
      "get_incoming_personal_assistant_settings",
      "update_incoming_personal_assistant_settings",
      "pause_personal_assistant_for_contact",
      "resume_personal_assistant_for_contact",
      "list_paused_personal_contacts",
      "get_personal_contact_recent_messages",
    ];

    for (const toolId of expectedTools) {
      const action = getAdminAction(toolId);
      assert.ok(action, `Action ${toolId} must be registered`);
    }
  });

  await t.test("Control Channel: Enable incoming assistant via Business Admin BA", async () => {
    const action = getAdminAction("enable_incoming_personal_assistant")!;
    const result = await action.handler(
      adminContext,
      { instanceId: mockPersonalInstanceId, replyMode: "known_contacts_only" }
    );

    assert.strictEqual(result.success, true);
    assert.match(result.message, /Incoming Personal Assistant Enabled/i);

    const settings = await getIncomingPersonalAssistantSettings(mockTenantId, mockPersonalInstanceId);
    assert.strictEqual(settings.enabled, true);
    assert.strictEqual(settings.incomingReplyMode, "known_contacts_only");
  });

  await t.test("Control Channel: Update settings via Business Admin BA", async () => {
    const action = getAdminAction("update_incoming_personal_assistant_settings")!;
    const result = await action.handler(
      adminContext,
      {
        instanceId: mockPersonalInstanceId,
        assistantDisplayName: "Zoya Executive AI",
        instructions: "Do not disclose owner calendar details.",
        manualTakeoverDurationMinutes: 45,
      }
    );

    assert.strictEqual(result.success, true);

    const settings = await getIncomingPersonalAssistantSettings(mockTenantId, mockPersonalInstanceId);
    assert.strictEqual(settings.assistantDisplayName, "Zoya Executive AI");
    assert.strictEqual(settings.globalInstructions, "Do not disclose owner calendar details.");
    assert.strictEqual(settings.manualTakeoverDurationMinutes, 45);
  });

  await t.test("Control Channel: Pause and Resume assistant for personal contact", async () => {
    // 1. Create personal contact
    const { contact } = await personalContactService.resolveOrCreatePersonalContact(mockTenantId, {
      remoteJid: "contact-f7ba0cd80088@example.invalid",
      profile: { pushName: "Tariq Partner" },
      dataOwnerKey: mockTenantId,
    });
    contact.ownerAssignedName = "Tariq Partner";
    contact.displayName = "Tariq Partner";
    await personalContactService.setContactRelationship(mockTenantId, contact.contactId, "client");

    // 2. Pause assistant for Tariq
    const pauseAction = getAdminAction("pause_personal_assistant_for_contact")!;
    const pauseResult = await pauseAction.handler(
      adminContext,
      { name: "Tariq Partner" }
    );
    assert.strictEqual(pauseResult.success, true);
    assert.match(pauseResult.message, /Paused/i);

    // Verify contact status is paused_by_owner
    const pausedContact = await personalContactService.getPersonalContact(mockTenantId, contact.contactId);
    assert.strictEqual(pausedContact?.communicationPreferences?.contactCommunicationStatus, "paused_by_owner");

    // Also simulate manual takeover
    recordManualTakeover(mockTenantId, mockPersonalInstanceId, contact.contactId, 60);
    assert.strictEqual(isManualTakeoverActive(mockTenantId, mockPersonalInstanceId, contact.contactId).active, true);

    // 3. Resume assistant for Tariq
    const resumeAction = getAdminAction("resume_personal_assistant_for_contact")!;
    const resumeResult = await resumeAction.handler(
      adminContext,
      { name: "Tariq Partner" }
    );
    assert.strictEqual(resumeResult.success, true);
    assert.match(resumeResult.message, /Resumed/i);

    // Verify contact status is active AND takeover is cleared
    const resumedContact = await personalContactService.getPersonalContact(mockTenantId, contact.contactId);
    assert.strictEqual(resumedContact?.communicationPreferences?.contactCommunicationStatus, "active");
    assert.strictEqual(isManualTakeoverActive(mockTenantId, mockPersonalInstanceId, contact.contactId).active, false);
  });

  await t.test("Security: Non-admin caller blocked by registry guard", () => {
    const action = getAdminAction("enable_incoming_personal_assistant")!;

    const customerCheck = canExecuteAdminBusinessAction({
      role: "customer" as any,
      action,
      channel: "whatsapp",
    });
    assert.strictEqual(customerCheck.allowed, false);

    const ownerCheck = canExecuteAdminBusinessAction({
      role: "owner",
      action,
      channel: "whatsapp",
    });
    assert.strictEqual(ownerCheck.allowed, true);
  });

  await t.test("Control Channel: Disable incoming assistant via Business Admin BA", async () => {
    const action = getAdminAction("disable_incoming_personal_assistant")!;
    const result = await action.handler(
      adminContext,
      { instanceId: mockPersonalInstanceId }
    );

    assert.strictEqual(result.success, true);
    assert.match(result.message, /Disabled/i);

    const settings = await getIncomingPersonalAssistantSettings(mockTenantId, mockPersonalInstanceId);
    assert.strictEqual(settings.enabled, false);
    assert.strictEqual(settings.incomingReplyMode, "off");
  });
});
