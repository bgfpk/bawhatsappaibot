import test from "node:test";
import assert from "node:assert/strict";
import {
  getAdminAction,
  canExecuteAdminBusinessAction,
} from "./admin-action-registry-service.ts";
import {
  resolveAdminAgentIntent,
  executeAdminAgentIntent,
  matchDeterministicGuards,
} from "./admin-business-agent-service.ts";
import {
  getOwnerProfile,
  updateOwnerProfile,
  setOwnerIdentity,
  owner360Deps,
  invalidateOwnerProfileCache,
} from "./owner360-service.ts";
import type { AdminBusinessAssistantContext } from "./admin-identity-service.ts";

test("Owner360 Admin Business Assistant Integration Tests (Prompt 2 Requirements 28-32)", async (t) => {
  const mockStorage = new Map<string, any>();

  owner360Deps.getDocument = async (_dbId, _collId, docId) => {
    const doc = mockStorage.get(docId);
    if (!doc) {
      const err: any = new Error("Document not found");
      err.code = 404;
      err.status = 404;
      throw err;
    }
    return doc;
  };

  owner360Deps.createDocument = async (_dbId, _collId, docId, data) => {
    mockStorage.set(docId, { ...data, $id: docId });
    return mockStorage.get(docId);
  };

  owner360Deps.updateDocument = async (_dbId, _collId, docId, data) => {
    if (!mockStorage.has(docId)) {
      const err: any = new Error("Document not found");
      err.code = 404;
      err.status = 404;
      throw err;
    }
    mockStorage.set(docId, { ...mockStorage.get(docId), ...data });
    return mockStorage.get(docId);
  };

  t.beforeEach(() => {
    mockStorage.clear();
    invalidateOwnerProfileCache();
  });

  const businessAdminContext: AdminBusinessAssistantContext = {
    accountId: "test_tenant_ba",
    userId: "test_tenant_ba",
    botId: "bot_business_01",
    adminJid: "contact-fb7cfca76a29@example.invalid",
    adminPhone: "135351162196",
    adminRole: "owner",
    isBusinessAssistantEnabled: true,
    mode: "admin_business_assistant",
    conversationId: "conv_test_ba",
  };

  await t.test("1. Actions are registered in centralized action registry", () => {
    const getAction = getAdminAction("get_owner_profile");
    assert.ok(getAction);
    assert.equal(getAction.riskLevel, "READ");
    assert.equal(getAction.requiredRole, "owner");

    const updatePref = getAdminAction("update_owner_preference");
    assert.ok(updatePref);
    assert.equal(updatePref.riskLevel, "SAFE_WRITE");

    const addAddr = getAdminAction("add_owner_address");
    assert.ok(addAddr);
    assert.equal(addAddr.riskLevel, "SENSITIVE_WRITE");
    assert.equal(addAddr.requiresConfirmation, true);

    const updatePrivacy = getAdminAction("update_owner_privacy");
    assert.ok(updatePrivacy);
    assert.equal(updatePrivacy.riskLevel, "SENSITIVE_WRITE");
  });

  await t.test("2. canExecuteAdminBusinessAction enforces role permissions", () => {
    // Owner is allowed
    const ownerPerm = canExecuteAdminBusinessAction({
      role: "owner",
      action: "get_owner_profile",
      channel: "whatsapp",
    });
    assert.equal(ownerPerm.allowed, true);

    // Regular member/viewer is denied
    const memberPerm = canExecuteAdminBusinessAction({
      role: "member",
      action: "get_owner_profile",
      channel: "whatsapp",
    });
    assert.equal(memberPerm.allowed, false);
    assert.equal(memberPerm.reason, "insufficient_role_permission");
  });

  await t.test("3. Deterministic query 'what do you know about me' resolves get_owner_profile", async () => {
    const resolved = await resolveAdminAgentIntent({
      text: "what do you know about me",
      context: businessAdminContext,
    });
    assert.equal(resolved.mode, "tool");
    assert.equal(resolved.actionId, "get_owner_profile");
  });

  await t.test("4. get_owner_profile execution outputs structured human-readable text without internal IDs", async () => {
    await setOwnerIdentity(businessAdminContext.accountId, {
      preferredName: "Firdosi",
      preferredReference: "Mr. Firdosi",
    });
    await updateOwnerProfile(businessAdminContext.accountId, {
      locale: { timezone: "Asia/Karachi", locale: "en", preferredLanguages: ["en", "ur"], defaultCurrency: "PKR" },
    });

    const action = getAdminAction("get_owner_profile")!;
    const result = await action.handler!(businessAdminContext, {});

    assert.equal(result.success, true);
    assert.match(result.message, /Firdosi/);
    assert.match(result.message, /Asia\/Karachi/);
    assert.match(result.message, /PKR/);
    assert.doesNotMatch(result.message, /owner360_/);
    assert.doesNotMatch(result.message, /SYSTEM_CONFIGS/);
  });

  await t.test("5. update_owner_preference updates timezone & languages safely", async () => {
    const action = getAdminAction("update_owner_preference")!;
    const result = await action.handler!(businessAdminContext, {
      timezone: "Asia/Karachi",
      languages: ["ur", "en"],
      tone: "friendly",
    });

    assert.equal(result.success, true);
    assert.match(result.message, /Personal Preferences Updated/);

    const profile = await getOwnerProfile(businessAdminContext.accountId);
    assert.equal(profile.locale.timezone, "Asia/Karachi");
    assert.deepEqual(profile.locale.preferredLanguages, ["ur", "en"]);
    assert.equal(profile.communicationPreferences.tone, "friendly");
  });

  await t.test("6. update_owner_preference rejects invalid IANA timezone", async () => {
    const action = getAdminAction("update_owner_preference")!;
    const result = await action.handler!(businessAdminContext, {
      timezone: "Pakistan time",
    });

    assert.equal(result.success, false);
    assert.equal(result.error, "INVALID_TIMEZONE");
  });

  await t.test("7. add_owner_address requires confirmation preview text", async () => {
    const action = getAdminAction("add_owner_address")!;
    const execResult = await executeAdminAgentIntent({
      intent: {
        mode: "tool",
        actionId: "add_owner_address",
        action,
        params: {
          label: "Home",
          addressLine1: "123 Main Blvd",
          city: "Karachi",
          country: "Pakistan",
        },
      },
      context: businessAdminContext,
      rawText: "My delivery address is 123 Main Blvd, Karachi",
    });

    assert.equal(execResult.requiresConfirmation, true);
    assert.match(execResult.confirmationPreviewText || "", /123 Main Blvd/);
    assert.match(execResult.confirmationPreviewText || "", /Karachi/);
  });

  await t.test("8. update_owner_privacy requires confirmation preview for privacy broadening", async () => {
    const action = getAdminAction("update_owner_privacy")!;
    const execResult = await executeAdminAgentIntent({
      intent: {
        mode: "tool",
        actionId: "update_owner_privacy",
        action,
        params: {
          target: "address",
          privacyPolicy: "ALLOW_FOR_AUTHORIZED_TASK",
        },
      },
      context: businessAdminContext,
      rawText: "Allow assistant to use my address for tasks",
    });

    assert.equal(execResult.requiresConfirmation, true);
    assert.match(execResult.confirmationPreviewText || "", /ALLOW_FOR_AUTHORIZED_TASK/);
  });

  await t.test("9. Ambiguous informational statement does NOT trigger deterministic mutation", async () => {
    // Conversational mention should not be matched by deterministic guards as a mutation
    const ambiguous = matchDeterministicGuards("My timezone is Asia/Karachi");
    assert.equal(ambiguous, null, "Ambiguous conversational mention must not trigger deterministic mutation");
  });

  await t.test("10. Non-owner / customer is strictly blocked from executing Owner360 actions", () => {
    // Unauthenticated context
    const customerContext: AdminBusinessAssistantContext = {
      ...businessAdminContext,
      adminRole: "manager",
    };
    const denied = canExecuteAdminBusinessAction({
      role: customerContext.adminRole,
      action: "add_owner_address",
      channel: "whatsapp",
    });
    assert.equal(denied.allowed, false);
    assert.equal(denied.reason, "insufficient_role_permission");
  });

  await t.test("11. Tool outputs and confirmation previews never expose internal DB IDs or system collections", async () => {
    const action = getAdminAction("get_owner_profile")!;
    const res = await action.handler!(businessAdminContext, {});
    assert.ok(res.success);
    assert.doesNotMatch(res.message, /SYSTEM_CONFIGS/);
    assert.doesNotMatch(res.message, /owner360_/);
    assert.doesNotMatch(res.message, /databaseId/);
  });
});
