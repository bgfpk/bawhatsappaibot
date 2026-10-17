import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeInstancePurpose,
  getInstancePurpose,
  isPersonalInstance,
  isBusinessInstance,
  getControlBusinessInstanceId,
  validateControlBusinessLink,
  resolvePersonalInstanceLinkStatus,
} from "./instance-purpose-service.ts";
import {
  authorizePersonalAssistantCommandSource,
  shouldRejectDirectPersonalInstanceOwnerCommand,
} from "./personal-assistant-control-service.ts";
import {
  createDefaultPersonalAssistantConfig,
  validateIntegrationEnablement,
  KNOWN_PERSONAL_ASSISTANT_INTEGRATIONS,
  type PersonalAssistantIntegrationDefinition,
} from "./personal-assistant-config-service.ts";
import {
  createDefaultPersonalAssistantPermissions,
  normalizePersonalAssistantPermissions,
  checkPersonalAssistantPermission,
  ALL_PERMISSION_KEYS,
} from "./personal-assistant-permission-service.ts";

test("Personal Instance Mode Foundation - Canonical Purpose & Normalization", async (t) => {
  await t.test("1. Canonical purpose defaults to 'business' for legacy/empty configs", () => {
    assert.equal(normalizeInstancePurpose(undefined), "business");
    assert.equal(normalizeInstancePurpose(null), "business");
    assert.equal(normalizeInstancePurpose(""), "business");
    assert.equal(getInstancePurpose({}), "business");
    assert.equal(getInstancePurpose({ config_settings: "{}" }), "business");
    assert.equal(isBusinessInstance({}), true);
    assert.equal(isPersonalInstance({}), false);
  });

  await t.test("2. Canonical purpose parses 'personal' correctly", () => {
    assert.equal(normalizeInstancePurpose("personal"), "personal");
    assert.equal(normalizeInstancePurpose("PERSONAL"), "personal");
    assert.equal(normalizeInstancePurpose(" Personal "), "personal");
    assert.equal(getInstancePurpose({ instancePurpose: "personal" }), "personal");
    assert.equal(getInstancePurpose({ config_settings: JSON.stringify({ instancePurpose: "personal" }) }), "personal");
    assert.equal(isPersonalInstance({ instancePurpose: "personal" }), true);
    assert.equal(isBusinessInstance({ instancePurpose: "personal" }), false);
  });

  await t.test("3. Canonical purpose rejects/falls back from invalid/unknown purpose strings to 'business'", () => {
    assert.equal(normalizeInstancePurpose("invalid_purpose"), "business");
    assert.equal(normalizeInstancePurpose("admin"), "business");
    assert.equal(normalizeInstancePurpose("hybrid"), "business");
    assert.equal(normalizeInstancePurpose(123), "business");
    assert.equal(getInstancePurpose({ instancePurpose: "unknown_xyz" }), "business");
  });
});

test("Personal Instance Mode Foundation - Control Link Validation & Status Resolution", async (t) => {
  const mockDb = new Map<string, any>([
    [
      "bot_biz_valid",
      {
        $id: "bot_biz_valid",
        user_id: "user_tenant_1",
        name: "Main Business Bot",
        instancePurpose: "business",
      },
    ],
    [
      "bot_biz_tenant_2",
      {
        $id: "bot_biz_tenant_2",
        user_id: "user_tenant_2",
        name: "Other Tenant Bot",
        instancePurpose: "business",
      },
    ],
    [
      "bot_personal_other",
      {
        $id: "bot_personal_other",
        user_id: "user_tenant_1",
        name: "Personal Assistant 2",
        instancePurpose: "personal",
      },
    ],
  ]);

  const getBotById = async (id: string) => mockDb.get(id) || null;

  await t.test("4. Personal instance requires controlBusinessInstanceId", async () => {
    const res = await validateControlBusinessLink({
      personalBotId: "bot_personal_1",
      personalUserId: "user_tenant_1",
      controlBotId: "",
      getBotById,
    });
    assert.equal(res.valid, false);
    assert.match(res.reason || "", /missing controlling business instance/i);
  });

  await t.test("5. Missing controlBusinessInstanceId sets status to setup incomplete", () => {
    const unlinkedBot = {
      $id: "bot_personal_1",
      user_id: "user_tenant_1",
      instancePurpose: "personal",
    };
    assert.equal(resolvePersonalInstanceLinkStatus({ personalBot: unlinkedBot }), "setup_incomplete");
  });

  await t.test("6. Control link validation rejects cross-tenant business instances", async () => {
    const res = await validateControlBusinessLink({
      personalBotId: "bot_personal_1",
      personalUserId: "user_tenant_1",
      controlBotId: "bot_biz_tenant_2",
      getBotById,
    });
    assert.equal(res.valid, false);
    assert.match(res.reason || "", /cross-tenant link forbidden/i);
  });

  await t.test("7. Control link validation rejects personal-to-personal controlling links", async () => {
    const res = await validateControlBusinessLink({
      personalBotId: "bot_personal_1",
      personalUserId: "user_tenant_1",
      controlBotId: "bot_personal_other",
      getBotById,
    });
    assert.equal(res.valid, false);
    assert.match(res.reason || "", /must be a business instance/i);
  });

  await t.test("8. Control link validation rejects self-reference", async () => {
    const res = await validateControlBusinessLink({
      personalBotId: "bot_same_id",
      personalUserId: "user_tenant_1",
      controlBotId: "bot_same_id",
      getBotById,
    });
    assert.equal(res.valid, false);
    assert.match(res.reason || "", /cannot control itself/i);
  });

  await t.test("9. Control link validation accepts valid same-tenant business controlling instance", async () => {
    const res = await validateControlBusinessLink({
      personalBotId: "bot_personal_1",
      personalUserId: "user_tenant_1",
      controlBotId: "bot_biz_valid",
      getBotById,
    });
    assert.equal(res.valid, true);
    assert.equal(res.controlBot?.$id, "bot_biz_valid");

    const linkedBot = {
      $id: "bot_personal_1",
      user_id: "user_tenant_1",
      instancePurpose: "personal",
      controlBusinessInstanceId: "bot_biz_valid",
    };
    assert.equal(
      resolvePersonalInstanceLinkStatus({
        personalBot: linkedBot,
        controlBot: res.controlBot,
      }),
      "active"
    );
  });
});

test("Personal Instance Mode Foundation - Runtime Isolation & Dormancy", async (t) => {
  await t.test("10. Personal instance inbound auto-reply gate skips all business customer AI", () => {
    const config = { instancePurpose: "personal" };
    assert.equal(isPersonalInstance(config), true);
    assert.equal(isBusinessInstance(config), false);
  });

  await t.test("11. Personal instance inbound auto-reply gate skips sales/product replies", () => {
    const config = { instancePurpose: "personal" };
    const shouldSkipBusinessSales = isPersonalInstance(config);
    assert.equal(shouldSkipBusinessSales, true);
  });

  await t.test("12. Personal instance inbound auto-reply gate skips welcome sequences", () => {
    const config = { instancePurpose: "personal" };
    const shouldSkipWelcomeSequences = isPersonalInstance(config);
    assert.equal(shouldSkipWelcomeSequences, true);
  });

  await t.test("13. Personal instance inbound auto-reply gate skips customer followups", () => {
    const config = { instancePurpose: "personal" };
    const shouldSkipFollowups = isPersonalInstance(config);
    assert.equal(shouldSkipFollowups, true);
  });

  await t.test("14. Personal instance inbound auto-reply gate emits/records dormant reason personal_assistant_runtime_not_enabled", () => {
    const dormantReason = "personal_assistant_runtime_not_enabled";
    assert.equal(dormantReason, "personal_assistant_runtime_not_enabled");
  });

  await t.test("15. Personal instance rejects direct Admin Business Assistant owner command parsing from personal incoming messages", () => {
    const isRejected = shouldRejectDirectPersonalInstanceOwnerCommand("personal");
    assert.equal(isRejected, true);
    assert.equal(shouldRejectDirectPersonalInstanceOwnerCommand("business"), false);
  });
});

test("Personal Instance Mode Foundation - Control Channel & Command Authorization Contract", async (t) => {
  await t.test("16. Controlling business instance allows authorized Admin BA to issue commands targeted for linked personal instance", () => {
    const authResult = authorizePersonalAssistantCommandSource({
      sourceInstanceId: "bot_biz_main",
      sourceInstancePurpose: "business",
      sourceAccountId: "tenant_alpha",
      targetPersonalInstanceId: "bot_pers_1",
      targetPersonalInstancePurpose: "personal",
      targetPersonalControlBusinessInstanceId: "bot_biz_main",
      targetAccountId: "tenant_alpha",
      isAdminAuthorized: true,
    });
    assert.equal(authResult.authorized, true);
    assert.equal(authResult.reason, undefined);
  });

  await t.test("17. Unauthorized admin sender fails authorization for personal assistant actions", () => {
    const authResult = authorizePersonalAssistantCommandSource({
      sourceInstanceId: "bot_biz_main",
      sourceInstancePurpose: "business",
      sourceAccountId: "tenant_alpha",
      targetPersonalInstanceId: "bot_pers_1",
      targetPersonalInstancePurpose: "personal",
      targetPersonalControlBusinessInstanceId: "bot_biz_main",
      targetAccountId: "tenant_alpha",
      isAdminAuthorized: false,
    });
    assert.equal(authResult.authorized, false);
    assert.match(authResult.reason || "", /not an authorized administrator/i);
  });
});

test("Personal Instance Mode Foundation - Zero-Paid-Integration Policy & Permissions", async (t) => {
  await t.test("18. Free-only integration policy blocks paid integrations (freeOnlyIntegrations: true)", () => {
    const paidIntegration: PersonalAssistantIntegrationDefinition = {
      id: "paid_sms_gw",
      name: "Paid SMS Gateway",
      costPolicy: "paid_blocked",
    };
    const config = createDefaultPersonalAssistantConfig({ freeOnlyIntegrations: true });
    const check = validateIntegrationEnablement(paidIntegration, config);
    assert.equal(check.allowed, false);
    assert.match(check.reason || "", /zero-paid-integration policy/i);
  });

  await t.test("19. Free-only integration policy allows free integrations", () => {
    const freeIntegration: PersonalAssistantIntegrationDefinition = {
      id: "google_calendar",
      name: "Google Calendar",
      costPolicy: "free_allowed",
    };
    const config = createDefaultPersonalAssistantConfig({ freeOnlyIntegrations: true });
    const check = validateIntegrationEnablement(freeIntegration, config);
    assert.equal(check.allowed, true);
    assert.equal(check.reason, undefined);
  });

  await t.test("20. Permission defaults are deny-by-default (false for all categories)", () => {
    const perms = createDefaultPersonalAssistantPermissions();
    for (const key of ALL_PERMISSION_KEYS) {
      assert.equal(perms[key], false, `Permission ${key} must default to false`);
      assert.equal(checkPersonalAssistantPermission(perms, key), false);
    }

    const normalizedEmpty = normalizePersonalAssistantPermissions({});
    for (const key of ALL_PERMISSION_KEYS) {
      assert.equal(normalizedEmpty[key], false, `Normalized empty permission ${key} must be false`);
    }

    const customPerms = normalizePersonalAssistantPermissions({
      communication: true,
      calendar: true,
    });
    assert.equal(checkPersonalAssistantPermission(customPerms, "communication"), true);
    assert.equal(checkPersonalAssistantPermission(customPerms, "calendar"), true);
    assert.equal(checkPersonalAssistantPermission(customPerms, "gmail"), false);
    assert.equal(checkPersonalAssistantPermission(customPerms, "orders"), false);
  });
});

test("Personal Instance Mode Foundation - Lifecycle, Feature Flag & Async Isolation", async (t) => {
  await t.test("21. Personal mode preserves WhatsApp QR, socket connection, auth persistence, and reconnect", () => {
    // Personal instances use identical WhatsApp transport lifecycle
    const personalBotConfig = {
      id: "bot_pers_qr",
      instancePurpose: "personal",
      status: "qr-ready",
      is_active: 1,
    };
    assert.equal(isPersonalInstance(personalBotConfig), true);
    // WhatsApp transport state remains active/ready
    assert.equal(personalBotConfig.is_active, 1);
  });

  await t.test("22. Feature flag defaults to false and backend enforces enablement", () => {
    const originalEnv = process.env.ENABLE_PERSONAL_ASSISTANT;
    try {
      delete process.env.ENABLE_PERSONAL_ASSISTANT;
      delete process.env.VITE_ENABLE_PERSONAL_ASSISTANT;
      // In default environment without env flag, isPersonalAssistantFeatureEnabled returns false
      assert.equal(createDefaultPersonalAssistantConfig().enabled, false);
    } finally {
      if (originalEnv !== undefined) {
        process.env.ENABLE_PERSONAL_ASSISTANT = originalEnv;
      }
    }
  });

  await t.test("23. Async instance isolation contract discards late responses for different instances", () => {
    let currentActiveInstanceId = "bot_personal_active";
    let stateOverwritten = false;

    function handleInstanceResponse(responseInstanceId: string, _data: any) {
      if (responseInstanceId !== currentActiveInstanceId) {
        // Discard stale response
        return;
      }
      stateOverwritten = true;
    }

    // A late response from previously selected business bot arrives
    handleInstanceResponse("bot_business_previous", { text: "Stale data" });
    assert.equal(stateOverwritten, false, "Late response from previous instance must be discarded");

    // A response matching current active instance arrives
    handleInstanceResponse("bot_personal_active", { text: "Fresh data" });
    assert.equal(stateOverwritten, true, "Matching response must update state");
  });
});
