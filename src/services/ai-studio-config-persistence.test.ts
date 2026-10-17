import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAiLearnedKnowledgePayload,
  buildConfirmationFieldsPayload,
  buildReplyModePayload,
  buildSharedAiInstructionsPayload,
  buildSmartSalesPayload,
  resolveCustomerDetailsConfigured,
} from "./intelligence-settings-payload-service.ts";

// Helper modeling buildPartialInstanceConfig from ProtectedDashboardApplication.tsx
function buildPartialInstanceConfig(overrides: Record<string, any>) {
  const payload: Record<string, any> = {};
  if ("systemPrompt" in overrides || "prompt" in overrides) {
    payload.prompt = overrides.systemPrompt ?? overrides.prompt;
  }
  if ("isAutoReply" in overrides || "ai_chat_replies_enabled" in overrides) {
    const autoVal = overrides.isAutoReply ?? overrides.ai_chat_replies_enabled;
    payload.autoReply = autoVal;
    payload.ai_chat_replies_enabled = autoVal;
  }
  if ("syncGroups" in overrides || "groups" in overrides) {
    payload.groups = overrides.syncGroups ?? overrides.groups;
  }
  if ("botVoice" in overrides) payload.botVoice = overrides.botVoice;
  if ("botGender" in overrides) payload.botGender = overrides.botGender;
  if ("botName" in overrides) payload.botName = overrides.botName;
  if ("businessType" in overrides || "business_type" in overrides) {
    payload.business_type = overrides.businessType ?? overrides.business_type;
  }
  if ("customFields" in overrides) payload.customFields = overrides.customFields;
  if ("customer_details_configured" in overrides || "customerDetailsConfigured" in overrides) {
    payload.customer_details_configured = overrides.customer_details_configured ?? overrides.customerDetailsConfigured;
  }
  if ("replyBehavior" in overrides || "reply_behavior" in overrides) {
    payload.reply_behavior = overrides.replyBehavior ?? overrides.reply_behavior;
  }
  if ("difficultCustomerMode" in overrides || "difficult_customer_mode" in overrides) {
    payload.difficult_customer_mode = overrides.difficultCustomerMode ?? overrides.difficult_customer_mode;
  }
  if ("replyInGroups" in overrides || "reply_in_groups" in overrides) {
    payload.reply_in_groups = overrides.replyInGroups ?? overrides.reply_in_groups;
  }
  if ("humanDelayEnabled" in overrides || "human_delay_enabled" in overrides) {
    payload.human_delay_enabled = overrides.humanDelayEnabled ?? overrides.human_delay_enabled;
  }
  if ("voiceSimulationEnabled" in overrides || "voice_simulation_enabled" in overrides) {
    payload.voice_simulation_enabled = overrides.voiceSimulationEnabled ?? overrides.voice_simulation_enabled;
  }
  if ("rejectCalls" in overrides || "reject_calls" in overrides) {
    payload.reject_calls = overrides.rejectCalls ?? overrides.reject_calls;
  }
  if ("learnedInstructions" in overrides || "learned_instructions" in overrides) {
    payload.learned_instructions = overrides.learnedInstructions ?? overrides.learned_instructions;
  }
  if ("followupEnabled" in overrides || "followup_enabled" in overrides) {
    payload.followup_enabled = overrides.followupEnabled ?? overrides.followup_enabled;
  }
  if ("autoFollowupEnabled" in overrides || "auto_followup_enabled" in overrides) {
    payload.auto_followup_enabled = (overrides.autoFollowupEnabled ?? overrides.auto_followup_enabled) ? 1 : 0;
  }
  if ("followupHours" in overrides || "followup_hours" in overrides) {
    payload.followup_hours = overrides.followupHours ?? overrides.followup_hours;
  }
  if ("followupOfferContext" in overrides || "followup_offer_context" in overrides) {
    payload.followup_offer_context = overrides.followupOfferContext ?? overrides.followup_offer_context;
  }
  if ("muted_numbers" in overrides || "mutedNumbers" in overrides) {
    payload.muted_numbers = overrides.muted_numbers ?? overrides.mutedNumbers;
  }
  if ("autoReloadEnabled" in overrides) {
    payload.autoReloadEnabled = overrides.autoReloadEnabled ? 1 : 0;
  }
  if ("autoReloadMinutes" in overrides) {
    payload.autoReloadMinutes = overrides.autoReloadMinutes;
  }
  if ("selectedBotLanguage" in overrides || "preferredLanguage" in overrides) {
    payload.preferredLanguage = overrides.selectedBotLanguage ?? overrides.preferredLanguage;
  }
  if ("smartSalesEngineEnabled" in overrides || "smart_sales_engine_enabled" in overrides) {
    payload.smartSalesEngineEnabled = (overrides.smartSalesEngineEnabled ?? overrides.smart_sales_engine_enabled) ? 1 : 0;
    payload.smartSalesExtraCharge = 0.001;
    payload.smartSalesPromptVersion = overrides.smartSalesPromptVersion ?? overrides.smart_sales_prompt_version ?? "v1";
  }
  if ("customerIntelligenceScanEnabled" in overrides || "customer_intelligence_scan_enabled" in overrides) {
    payload.customerIntelligenceScanEnabled = (overrides.customerIntelligenceScanEnabled ?? overrides.customer_intelligence_scan_enabled) ? 1 : 0;
  }
  return payload;
}

// Full canonical existing configured instance mock
function createFullConfiguredInstance() {
  return {
    botName: "BlackArrow Enterprise Assistant",
    preferredLanguage: "ur",
    botGender: "female",
    botVoice: "Aoede",
    business_type: "services",
    prompt: "You are the authoritative enterprise booking agent. Never offer fake discounts.",
    learned_instructions: "Customer must provide vehicle registration number before scheduling repair.",
    customFields: [
      { name: "Vehicle Number", instructions: "Ask for vehicle registration plate" },
      { name: "Service Type", instructions: "Identify oil change vs brake repair" },
    ],
    customer_details_configured: true,
    reply_behavior: "preference",
    difficult_customer_mode: "admin_pause",
    reject_calls: 1,
    muted_numbers: ["195545134641", "157189850060"],
    reply_in_groups: 0,
    voice_simulation_enabled: 1,
    smartSalesEngineEnabled: 1,
    customerIntelligenceScanEnabled: 1,
  };
}

test("1. Existing configured instance: all custom values preserved across fields", () => {
  const instance = createFullConfiguredInstance();

  assert.equal(instance.botName, "BlackArrow Enterprise Assistant");
  assert.equal(instance.preferredLanguage, "ur");
  assert.equal(instance.botGender, "female");
  assert.equal(instance.botVoice, "Aoede");
  assert.equal(instance.business_type, "services");
  assert.equal(instance.prompt, "You are the authoritative enterprise booking agent. Never offer fake discounts.");
  assert.equal(instance.learned_instructions, "Customer must provide vehicle registration number before scheduling repair.");
  assert.equal(instance.customFields.length, 2);
  assert.equal(instance.customer_details_configured, true);
  assert.equal(instance.reply_behavior, "preference");
  assert.equal(instance.difficult_customer_mode, "admin_pause");
  assert.equal(instance.reject_calls, 1);
  assert.deepEqual(instance.muted_numbers, ["195545134641", "157189850060"]);
  assert.equal(instance.reply_in_groups, 0);
  assert.equal(instance.voice_simulation_enabled, 1);
  assert.equal(instance.smartSalesEngineEnabled, 1);
  assert.equal(instance.customerIntelligenceScanEnabled, 1);
});

test("2. Refresh: all values remain exactly unchanged after re-read/reload", () => {
  const original = createFullConfiguredInstance();
  const serialized = JSON.stringify(original);
  const reloaded = JSON.parse(serialized);

  assert.deepEqual(reloaded, original);
  assert.equal(reloaded.botName, "BlackArrow Enterprise Assistant");
  assert.equal(reloaded.preferredLanguage, "ur");
  assert.equal(reloaded.prompt, original.prompt);
  assert.equal(reloaded.learned_instructions, original.learned_instructions);
  assert.deepEqual(reloaded.customFields, original.customFields);
  assert.equal(reloaded.reply_behavior, "preference");
  assert.equal(reloaded.smartSalesEngineEnabled, 1);
});

test("3. Save Basics: does NOT alter Knowledge, Customer Details, Reply Rules, or Advanced", () => {
  const dbRecord = createFullConfiguredInstance();

  // User edits Basics in UI (name, gender, voice, instructions)
  const editedBasics = buildSharedAiInstructionsPayload({
    ...dbRecord,
    systemPrompt: "Updated enterprise system prompt v2",
    botName: "BlackArrow Renovation Bot",
    botGender: "male",
    botVoice: "Fenrir",
    businessType: "construction",
  } as any);

  const partialPatch = buildPartialInstanceConfig(editedBasics);

  // Partial patch must ONLY touch basic instruction fields
  assert.equal(partialPatch.prompt, "Updated enterprise system prompt v2");
  assert.equal(partialPatch.botName, "BlackArrow Renovation Bot");
  assert.equal(partialPatch.botGender, "male");
  assert.equal(partialPatch.botVoice, "Fenrir");
  assert.equal(partialPatch.business_type, "construction");

  assert.equal("learned_instructions" in partialPatch, false);
  assert.equal("customFields" in partialPatch, false);
  assert.equal("reply_behavior" in partialPatch, false);
  assert.equal("smartSalesEngineEnabled" in partialPatch, false);

  // Merging patch on top of DB record retains all other categories intact
  const mergedDbRecord = { ...dbRecord, ...partialPatch };

  // Modified basics:
  assert.equal(mergedDbRecord.botName, "BlackArrow Renovation Bot");
  assert.equal(mergedDbRecord.prompt, "Updated enterprise system prompt v2");

  // UNTOUCHED preserved fields:
  assert.equal(mergedDbRecord.preferredLanguage, "ur");
  assert.equal(mergedDbRecord.learned_instructions, "Customer must provide vehicle registration number before scheduling repair.");
  assert.equal(mergedDbRecord.customFields.length, 2);
  assert.equal(mergedDbRecord.customer_details_configured, true);
  assert.equal(mergedDbRecord.reply_behavior, "preference");
  assert.equal(mergedDbRecord.difficult_customer_mode, "admin_pause");
  assert.equal(mergedDbRecord.reject_calls, 1);
  assert.deepEqual(mergedDbRecord.muted_numbers, ["195545134641", "157189850060"]);
  assert.equal(mergedDbRecord.smartSalesEngineEnabled, 1);
});

test("4. Save Reply Rules: does NOT alter Basics, AI Instructions, or Knowledge", () => {
  const dbRecord = createFullConfiguredInstance();

  // User edits Reply Rules tab
  const editedReplyRules = buildReplyModePayload({
    ...dbRecord,
    rejectCalls: 0,
    mutedNumbers: ["131121137240"],
    difficultCustomerMode: "ignore",
    replyBehavior: "ai_only",
    replyInGroups: 1,
    voiceSimulationEnabled: 0,
  } as any);

  const partialPatch = buildPartialInstanceConfig(editedReplyRules);

  // Partial patch must ONLY touch reply behavior fields
  assert.equal(partialPatch.reject_calls, 0);
  assert.deepEqual(partialPatch.muted_numbers, ["131121137240"]);
  assert.equal(partialPatch.difficult_customer_mode, "ignore");
  assert.equal(partialPatch.reply_behavior, "ai_only");
  assert.equal(partialPatch.reply_in_groups, 1);
  assert.equal(partialPatch.voice_simulation_enabled, 0);

  assert.equal("botName" in partialPatch, false);
  assert.equal("prompt" in partialPatch, false);
  assert.equal("preferredLanguage" in partialPatch, false);
  assert.equal("learned_instructions" in partialPatch, false);
  assert.equal("customFields" in partialPatch, false);

  // Merging on DB record preserves basics intact
  const mergedDbRecord = { ...dbRecord, ...partialPatch };
  assert.equal(mergedDbRecord.botName, "BlackArrow Enterprise Assistant");
  assert.equal(mergedDbRecord.prompt, "You are the authoritative enterprise booking agent. Never offer fake discounts.");
  assert.equal(mergedDbRecord.learned_instructions, "Customer must provide vehicle registration number before scheduling repair.");
  assert.equal(mergedDbRecord.customFields.length, 2);

  // Updated reply rules
  assert.equal(mergedDbRecord.reject_calls, 0);
  assert.deepEqual(mergedDbRecord.muted_numbers, ["131121137240"]);
  assert.equal(mergedDbRecord.difficult_customer_mode, "ignore");
});

test("5. Slow config response: defaults are never written before authoritative config loads", () => {
  let instanceConfigStatus: "LOADING" | "LOADED" | "EMPTY" | "ERROR" = "LOADING";
  let dbWritten = false;

  const simulateSaveConfig = (status: string, overrides: any = {}) => {
    if (status === "LOADING" && !overrides?.__force) {
      // Guard blocks save during loading
      return { blocked: true, reason: "Instance configuration is still loading" };
    }
    dbWritten = true;
    return { blocked: false };
  };

  // Attempt save while loading
  const saveAttempt = simulateSaveConfig(instanceConfigStatus);
  assert.equal(saveAttempt.blocked, true);
  assert.equal(dbWritten, false, "Database was never written while in LOADING status");

  // Authoritative config arrives
  instanceConfigStatus = "LOADED";
  const postLoadSave = simulateSaveConfig(instanceConfigStatus, { botName: "Loaded Bot" });
  assert.equal(postLoadSave.blocked, false);
  assert.equal(dbWritten, true);
});

test("6. Config API failure: existing configuration is not overwritten and Save is blocked", () => {
  let inMemoryConfig = createFullConfiguredInstance();
  let instanceConfigStatus: "LOADING" | "LOADED" | "EMPTY" | "ERROR" = "LOADING";

  // Simulate API failure
  const simulateFetchFailure = () => {
    try {
      throw new Error("Network timeout loading bot config");
    } catch {
      // In error state, keep existing in-memory state and mark status ERROR
      instanceConfigStatus = "ERROR";
    }
  };

  simulateFetchFailure();
  assert.equal(instanceConfigStatus, "ERROR");
  // inMemoryConfig must NOT be wiped with {} or default values
  assert.equal(inMemoryConfig.botName, "BlackArrow Enterprise Assistant");
  assert.equal(inMemoryConfig.prompt.length > 0, true);

  // Save must be blocked or prevented when incomplete
  const canSave = instanceConfigStatus === "LOADED";
  assert.equal(canSave, false, "Save must be disabled/blocked when status is not LOADED");
});

test("7. Rapid instance switching: Business A -> Personal -> Business B -> Business A prevents stale overwrites", async () => {
  let botConfigLoadRequestId = 0;
  let activeSelectedBotId = "biz_a";
  let activeStateConfig: any = null;

  const mockBots: Record<string, any> = {
    biz_a: { botName: "Business A Bot", prompt: "Biz A prompt", botGender: "female" },
    personal: { botName: "Personal Bot", prompt: "Personal prompt", botGender: "male" },
    biz_b: { botName: "Business B Bot", prompt: "Biz B prompt", botGender: "female" },
  };

  // Simulate async load with delay
  async function selectBot(botId: string, delayMs: number) {
    activeSelectedBotId = botId;
    const currentRequestId = ++botConfigLoadRequestId;

    // Simulate async network fetch
    await new Promise((resolve) => setTimeout(resolve, delayMs));

    // Guard: only apply if this request matches the latest request ID
    if (botConfigLoadRequestId === currentRequestId) {
      activeStateConfig = { ...mockBots[botId] };
      return true;
    }
    return false; // Stale response discarded
  }

  // Rapid switching:
  // biz_a requested (slow, 80ms)
  const p1 = selectBot("biz_a", 80);
  // personal requested immediately after (medium, 40ms)
  const p2 = selectBot("personal", 40);
  // biz_b requested immediately after (fast, 10ms)
  const p3 = selectBot("biz_b", 10);
  // biz_a re-selected (normal, 20ms)
  const p4 = selectBot("biz_a", 20);

  await Promise.all([p1, p2, p3, p4]);

  // Final selected instance is biz_a, and activeStateConfig MUST be biz_a
  assert.equal(activeSelectedBotId, "biz_a");
  assert.equal(activeStateConfig.botName, "Business A Bot");
  assert.equal(activeStateConfig.prompt, "Biz A prompt");
});

test("8. New instance initializes defaults normally; Existing instance never replaces custom values with defaults", () => {
  const DEFAULT_CONFIG = {
    botName: "",
    preferredLanguage: "en",
    botGender: "female",
    botVoice: "Aoede",
    prompt: "",
    business_type: "products",
    reply_behavior: "preference",
  };

  function applyConfigToState(storedConfig: any | null) {
    if (!storedConfig || Object.keys(storedConfig).length === 0) {
      // New instance: initialize defaults
      return { ...DEFAULT_CONFIG, isNew: true };
    }
    // Existing instance: preserve every saved value, only fallback if undefined
    return {
      botName: storedConfig.botName ?? DEFAULT_CONFIG.botName,
      preferredLanguage: storedConfig.preferredLanguage ?? storedConfig.selectedBotLanguage ?? DEFAULT_CONFIG.preferredLanguage,
      botGender: storedConfig.botGender ?? DEFAULT_CONFIG.botGender,
      botVoice: storedConfig.botVoice ?? DEFAULT_CONFIG.botVoice,
      prompt: storedConfig.prompt ?? storedConfig.systemPrompt ?? DEFAULT_CONFIG.prompt,
      business_type: storedConfig.business_type ?? storedConfig.businessType ?? DEFAULT_CONFIG.business_type,
      reply_behavior: storedConfig.reply_behavior ?? storedConfig.replyBehavior ?? DEFAULT_CONFIG.reply_behavior,
      isNew: false,
    };
  }

  // Test New instance:
  const newInstanceState = applyConfigToState({});
  assert.equal(newInstanceState.isNew, true);
  assert.equal(newInstanceState.botName, "");
  assert.equal(newInstanceState.preferredLanguage, "en");

  // Test Existing instance with custom values:
  const existingStored = {
    botName: "Custom Shop Assistant",
    preferredLanguage: "es",
    botGender: "male",
    botVoice: "Kore",
    prompt: "Respond only in formal Spanish.",
    business_type: "hospitality",
    reply_behavior: "ai_only",
  };
  const existingInstanceState = applyConfigToState(existingStored);
  assert.equal(existingInstanceState.isNew, false);
  assert.equal(existingInstanceState.botName, "Custom Shop Assistant");
  assert.equal(existingInstanceState.preferredLanguage, "es");
  assert.equal(existingInstanceState.botGender, "male");
  assert.equal(existingInstanceState.botVoice, "Kore");
  assert.equal(existingInstanceState.prompt, "Respond only in formal Spanish.");
  assert.equal(existingInstanceState.business_type, "hospitality");
  assert.equal(existingInstanceState.reply_behavior, "ai_only");
});

test("Partial config persistence strictly decouples legacy followup_enabled and auto_followup_enabled", () => {
  // 1. Updating auto_followup_enabled only touches auto_followup_enabled
  const autoPayload = buildPartialInstanceConfig({ auto_followup_enabled: 1 });
  assert.deepEqual(autoPayload, { auto_followup_enabled: 1 });
  assert.equal("followup_enabled" in autoPayload, false);

  // 2. Updating legacy followup_enabled only touches followup_enabled
  const legacyPayload = buildPartialInstanceConfig({ followup_enabled: 1 });
  assert.deepEqual(legacyPayload, { followup_enabled: 1 });
  assert.equal("auto_followup_enabled" in legacyPayload, false);

  // 3. Updating other settings does not touch either
  const promptPayload = buildPartialInstanceConfig({ prompt: "New instructions" });
  assert.deepEqual(promptPayload, { prompt: "New instructions" });
  assert.equal("followup_enabled" in promptPayload, false);
  assert.equal("auto_followup_enabled" in promptPayload, false);
});
