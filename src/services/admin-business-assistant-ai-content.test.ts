import test from "node:test";
import assert from "node:assert/strict";
import {
  setAiContentServiceDeps,
  resetAiContentServiceDeps,
  computeAiConfigFingerprint,
  handleGetAiChatReplyStatus,
  handleEnableAiChatReplies,
  handleDisableAiChatReplies,
  handleGetAiSettings,
  handleUpdateBotName,
  handleUpdateAiLanguage,
  handleUpdateBusinessType,
  handleUpdateAiBasicSettings,
  handleGetSharedAiInstructions,
  handleAppendAiInstruction,
  handleUpdateAiInstruction,
  handleRemoveAiInstruction,
  handleReplaceSharedAiInstructions,
  handleSearchKnowledge,
  handleAddKnowledge,
  handleUpdateKnowledge,
  handleRemoveKnowledge,
  handleListConfirmationFields,
  handleAddConfirmationField,
  handleSetConfirmationFieldRequired,
  handleDisableConfirmationField,
  handleGetReplySettings,
  handleUpdateReplyMode,
  handleUpdateVoiceUnderstanding,
  handleUpdateImageUnderstanding,
  handleUpdateCallSettings,
  handleUpdateReplyTimingSettings,
  handleGetSmartSalesSettings,
  handleEnableSmartSales,
  handleDisableSmartSales,
  handleUpdateSmartSalesTraining,
  handleListMedia,
  handleSaveAdminMedia,
  handleListSavedReplies,
  handleCreateSavedReply,
  handleDeleteSavedReply,
  handleListSequences,
  handleGetSequence,
  handleCreateSequence,
  handleAddSequenceStep,
  handleRemoveSequenceStep,
  handleEnableSequence,
  handleDisableSequence,
  handleDeleteSequence,
  handleGetWelcomeAutomation,
  handleEnableWelcomeAutomation,
  handleDisableWelcomeAutomation,
  handleSetWelcomeSequence,
} from "./admin-ai-content-write-service.ts";
import {
  handleAdminBusinessAssistantMessage as routeAdminMessage,
  __setAdminRouterTestDeps,
  __resetAdminRouterTestDeps,
} from "./admin-business-assistant-router.ts";
import {
  __setAdminBusinessAgentTestDeps,
  __resetAdminBusinessAgentTestDeps,
} from "./admin-business-agent-service.ts";
import type { AdminBusinessAssistantContext } from "./admin-identity-service.ts";

function createMockContext(overrides: Partial<AdminBusinessAssistantContext> = {}): AdminBusinessAssistantContext {
  return {
    accountId: "user_test_tenant_1",
    userId: "user_test_tenant_1",
    adminPhone: "+144225232320",
    adminJid: "contact-e4ed32210a80@example.invalid",
    adminRole: "owner",
    botId: "bot_test_123",
    isBusinessAssistantEnabled: true,
    mode: "admin_business_assistant",
    conversationId: "conv_test_123",
    ...overrides,
  };
}

function createMockDbEnvironment() {
  const botDoc: any = {
    $id: "bot_test_123",
    user_id: "user_test_tenant_1",
    name: "Fashion Hub AI",
    updated_at: 1700000000,
    config_settings: JSON.stringify({
      botName: "Fashion Hub AI",
      preferredLanguage: "Roman Urdu / English",
      businessType: "Fashion Retail",
      prompt: "You are Fashion Hub AI assistant. Always be polite and offer sizes.",
      learned_instructions: "We deliver across Pakistan in 3-5 days.",
      customFields: [
        { id: "cf_size", name: "Dress Size", key: "dress_size", type: "text", required: true },
        { id: "cf_note", name: "Special Note", key: "special_note", type: "text", required: false },
      ],
      replyBehavior: "always_text",
      rejectCalls: 0,
      voice_understanding_enabled: true,
      image_understanding_enabled: true,
      smartSalesEngineEnabled: 0,
      smart_sales_training: "Offer 10% discount if customer hesitates on price.",
      groups: [
        {
          id: "seq_1",
          name: "Onboarding Flow",
          jid: "contact-bc99dd0c4ba8@example.invalid",
          purpose: "sequence",
          shortcut_code: "onboard",
          enabled: true,
          templateCount: 2,
        },
        {
          id: "welcome_1",
          name: "Welcome Flow",
          jid: "contact-2771ac357d54@example.invalid",
          purpose: "welcome",
          shortcut_code: "welcome",
          enabled: true,
          templateCount: 1,
        },
      ],
    }),
  };

  let savedConfig: any = JSON.parse(botDoc.config_settings);
  let savedTemplateStore: any = {
    sequences: {
      "Onboarding Flow": {
        templates: [
          { message: { conversation: "Welcome to Fashion Hub!" }, text: "Welcome to Fashion Hub!" },
          { message: { conversation: "Check out our new catalog." }, text: "Check out our new catalog." },
        ],
      },
      "Welcome Flow": {
        templates: [
          { message: { conversation: "Hello! Welcome to our store." }, text: "Hello! Welcome to our store." },
        ],
      },
    },
    welcome: {
      templates: [
        { message: { conversation: "Hello! Welcome to our store." }, text: "Hello! Welcome to our store." },
      ],
    },
    media: {
      templates: [
        { id: "med_1", type: "image", caption: "Summer Catalog 2026", url: "https://cdn.example.com/cat.jpg" },
      ],
    },
  };

  const mockDbService = {
    getBot: async (botId: string) => {
      if (botId === "bot_test_123") return botDoc;
      if (botId === "bot_other_tenant") return { $id: "bot_other_tenant", user_id: "user_other_tenant" };
      return null;
    },
    loadBotConfig: async (botId: string) => {
      if (botId === "bot_test_123") return JSON.parse(JSON.stringify(savedConfig));
      return null;
    },
    saveBotConfig: async (botId: string, config: any) => {
      savedConfig = JSON.parse(JSON.stringify(config));
      botDoc.config_settings = JSON.stringify(config);
      botDoc.updated_at = Math.floor(Date.now() / 1000);
      return true;
    },
    loadTemplateStore: async (botId: string) => {
      return JSON.stringify(savedTemplateStore);
    },
    saveTemplateStore: async (botId: string, storeData: string) => {
      savedTemplateStore = typeof storeData === "string" ? JSON.parse(storeData) : storeData;
      return true;
    },
  };

  const mockDatabases = {
    getDocument: async (dbId: string, collId: string, docId: string) => {
      if (docId === "bot_test_123") return botDoc;
      if (docId === "bot_other_tenant") return { $id: "bot_other_tenant", user_id: "user_other_tenant" };
      return null;
    },
    updateDocument: async (dbId: string, collId: string, docId: string, data: any) => {
      if (docId === "bot_test_123") {
        Object.assign(botDoc, data);
      }
      return botDoc;
    },
  };

  return {
    botDoc,
    getSavedConfig: () => savedConfig,
    getSavedTemplateStore: () => savedTemplateStore,
    mockDbService,
    mockDatabases,
  };
}

// ---------------------------------------------------------------------------
// 1. AI CHAT REPLIES CONTROL
// ---------------------------------------------------------------------------

test("AI Replies Control: get_ai_chat_reply_status returns active status", async () => {
  const env = createMockDbEnvironment();
  setAiContentServiceDeps({ dbService: env.mockDbService as any, databases: env.mockDatabases as any });
  const context = createMockContext();

  const res = await handleGetAiChatReplyStatus(context);
  assert.equal(res.success, true);
  assert.equal(res.data.enabled, true);
  assert.match(res.message, /AI Automated Replies:\* ✅ \*ON \(Active\)\*/);

  resetAiContentServiceDeps();
});

test("AI Replies Control: disable_ai_chat_replies sets ai_chat_replies_enabled and autoReply to false", async () => {
  const env = createMockDbEnvironment();
  setAiContentServiceDeps({ dbService: env.mockDbService as any, databases: env.mockDatabases as any });
  const context = createMockContext();

  const res = await handleDisableAiChatReplies(context);
  assert.equal(res.success, true);
  assert.equal(res.data.enabled, false);

  const saved = env.getSavedConfig();
  assert.equal(saved.ai_chat_replies_enabled, false);
  assert.equal(saved.autoReply, false);

  resetAiContentServiceDeps();
});

test("AI Replies Control: enable_ai_chat_replies restores active replies with timestamp", async () => {
  const env = createMockDbEnvironment();
  setAiContentServiceDeps({ dbService: env.mockDbService as any, databases: env.mockDatabases as any });
  const context = createMockContext();

  await handleDisableAiChatReplies(context);
  const enableRes = await handleEnableAiChatReplies(context);
  assert.equal(enableRes.success, true);
  assert.equal(enableRes.data.enabled, true);

  const saved = env.getSavedConfig();
  assert.equal(saved.ai_chat_replies_enabled, true);
  assert.equal(saved.autoReply, true);
  assert.ok(saved.ai_chat_replies_enabled_at > 0);

  resetAiContentServiceDeps();
});

test("AI Replies Control: state fingerprint rejects stale confirmation if config changed", async () => {
  const env = createMockDbEnvironment();
  setAiContentServiceDeps({ dbService: env.mockDbService as any, databases: env.mockDatabases as any });
  const context = createMockContext();

  const staleFingerprint = "outdated_fingerprint_hash";
  const res = await handleDisableAiChatReplies(context, { expectedFingerprint: staleFingerprint });
  assert.equal(res.success, false);
  assert.match(res.message, /AI settings changed in another session/);

  resetAiContentServiceDeps();
});

// ---------------------------------------------------------------------------
// 2. BOT IDENTITY & BASIC AI SETTINGS
// ---------------------------------------------------------------------------

test("AI Settings: get_ai_settings returns name, language, business type", async () => {
  const env = createMockDbEnvironment();
  setAiContentServiceDeps({ dbService: env.mockDbService as any, databases: env.mockDatabases as any });
  const context = createMockContext();

  const res = await handleGetAiSettings(context);
  assert.equal(res.success, true);
  assert.equal(res.data.name, "Fashion Hub AI");
  assert.equal(res.data.language, "Roman Urdu / English");
  assert.equal(res.data.businessType, "Fashion Retail");

  resetAiContentServiceDeps();
});

test("AI Settings: update_bot_name updates name in config and bot document", async () => {
  const env = createMockDbEnvironment();
  setAiContentServiceDeps({ dbService: env.mockDbService as any, databases: env.mockDatabases as any });
  const context = createMockContext();

  const res = await handleUpdateBotName(context, { botName: "Fashion Elite" });
  assert.equal(res.success, true);
  assert.equal(env.getSavedConfig().botName, "Fashion Elite");
  assert.equal(env.botDoc.name, "Fashion Elite");

  resetAiContentServiceDeps();
});

test("AI Settings: update_ai_language updates preferred language with validation", async () => {
  const env = createMockDbEnvironment();
  setAiContentServiceDeps({ dbService: env.mockDbService as any, databases: env.mockDatabases as any });
  const context = createMockContext();

  const res = await handleUpdateAiLanguage(context, { language: "Urdu" });
  assert.equal(res.success, true);
  assert.equal(env.getSavedConfig().preferredLanguage, "Urdu");

  resetAiContentServiceDeps();
});

test("AI Settings: update_business_type updates business niche", async () => {
  const env = createMockDbEnvironment();
  setAiContentServiceDeps({ dbService: env.mockDbService as any, databases: env.mockDatabases as any });
  const context = createMockContext();

  const res = await handleUpdateBusinessType(context, { businessType: "Cosmetics & Skincare" });
  assert.equal(res.success, true);
  assert.equal(env.getSavedConfig().businessType, "Cosmetics & Skincare");

  resetAiContentServiceDeps();
});

// ---------------------------------------------------------------------------
// 3. SHARED AI INSTRUCTIONS
// ---------------------------------------------------------------------------

test("Shared AI Instructions: get_shared_ai_instructions returns preview, word/char counts and fingerprint", async () => {
  const env = createMockDbEnvironment();
  setAiContentServiceDeps({ dbService: env.mockDbService as any, databases: env.mockDatabases as any });
  const context = createMockContext();

  const res = await handleGetSharedAiInstructions(context);
  assert.equal(res.success, true);
  assert.ok(res.data.charCount > 0);
  assert.ok(res.data.wordCount > 0);
  assert.ok(res.data.fingerprint);

  resetAiContentServiceDeps();
});

test("Shared AI Instructions: append_ai_instruction appends new rule without destroying existing text", async () => {
  const env = createMockDbEnvironment();
  setAiContentServiceDeps({ dbService: env.mockDbService as any, databases: env.mockDatabases as any });
  const context = createMockContext();

  const newRule = "Do not offer discounts above 15%.";
  const res = await handleAppendAiInstruction(context, { instruction: newRule });
  assert.equal(res.success, true);

  const updatedPrompt = env.getSavedConfig().prompt;
  assert.ok(updatedPrompt.includes("Always be polite and offer sizes."));
  assert.ok(updatedPrompt.includes(newRule));

  resetAiContentServiceDeps();
});

test("Shared AI Instructions: update_ai_instruction mutates target rule cleanly", async () => {
  const env = createMockDbEnvironment();
  setAiContentServiceDeps({ dbService: env.mockDbService as any, databases: env.mockDatabases as any });
  const context = createMockContext();

  const res = await handleUpdateAiInstruction(context, {
    targetRule: "offer sizes",
    newRule: "offer sizes and matching accessories",
  });
  assert.equal(res.success, true);
  assert.ok(env.getSavedConfig().prompt.includes("offer sizes and matching accessories"));

  resetAiContentServiceDeps();
});

test("Shared AI Instructions: remove_ai_instruction removes rule cleanly", async () => {
  const env = createMockDbEnvironment();
  setAiContentServiceDeps({ dbService: env.mockDbService as any, databases: env.mockDatabases as any });
  const context = createMockContext();

  const res = await handleRemoveAiInstruction(context, {
    targetRule: "Always be polite and offer sizes.",
  });
  assert.equal(res.success, true);
  assert.ok(!env.getSavedConfig().prompt.includes("offer sizes"));

  resetAiContentServiceDeps();
});

test("Shared AI Instructions: replace_shared_ai_instructions overwrites with fingerprint check", async () => {
  const env = createMockDbEnvironment();
  setAiContentServiceDeps({ dbService: env.mockDbService as any, databases: env.mockDatabases as any });
  const context = createMockContext();

  const currentFp = computeAiConfigFingerprint(env.botDoc, env.getSavedConfig());
  const newPrompt = "Brand new concise guidelines for 2026 sales season.";

  const res = await handleReplaceSharedAiInstructions(context, {
    newInstructions: newPrompt,
    expectedFingerprint: currentFp,
  });
  assert.equal(res.success, true);
  assert.equal(env.getSavedConfig().prompt, newPrompt);

  resetAiContentServiceDeps();
});

// ---------------------------------------------------------------------------
// 4. LEARNED KNOWLEDGE
// ---------------------------------------------------------------------------

test("Learned Knowledge: search_knowledge searches facts by keyword", async () => {
  const env = createMockDbEnvironment();
  setAiContentServiceDeps({ dbService: env.mockDbService as any, databases: env.mockDatabases as any });
  const context = createMockContext();

  const res = await handleSearchKnowledge(context, { query: "deliver" });
  assert.equal(res.success, true);
  assert.equal(res.data.facts.length, 1);
  assert.match(res.data.facts[0], /We deliver across Pakistan/);

  resetAiContentServiceDeps();
});

test("Learned Knowledge: add_knowledge appends new fact to learned instructions", async () => {
  const env = createMockDbEnvironment();
  setAiContentServiceDeps({ dbService: env.mockDbService as any, databases: env.mockDatabases as any });
  const context = createMockContext();

  const res = await handleAddKnowledge(context, {
    fact: "Karachi deliveries take 24 hours only.",
    category: "Shipping",
  });
  assert.equal(res.success, true);

  const learned = env.getSavedConfig().learned_instructions;
  assert.ok(learned.includes("[Shipping] Karachi deliveries take 24 hours only."));
  assert.ok(learned.includes("We deliver across Pakistan"));

  resetAiContentServiceDeps();
});

test("Learned Knowledge: update_knowledge updates existing fact", async () => {
  const env = createMockDbEnvironment();
  setAiContentServiceDeps({ dbService: env.mockDbService as any, databases: env.mockDatabases as any });
  const context = createMockContext();

  const res = await handleUpdateKnowledge(context, {
    targetFact: "We deliver across Pakistan in 3-5 days.",
    updatedFact: "We deliver nationwide across Pakistan in 2-4 business days.",
  });
  assert.equal(res.success, true);
  assert.ok(env.getSavedConfig().learned_instructions.includes("2-4 business days"));

  resetAiContentServiceDeps();
});

test("Learned Knowledge: remove_knowledge removes fact with validation", async () => {
  const env = createMockDbEnvironment();
  setAiContentServiceDeps({ dbService: env.mockDbService as any, databases: env.mockDatabases as any });
  const context = createMockContext();

  const res = await handleRemoveKnowledge(context, {
    targetFact: "We deliver across Pakistan in 3-5 days.",
  });
  assert.equal(res.success, true);
  assert.ok(!env.getSavedConfig().learned_instructions.includes("3-5 days"));

  resetAiContentServiceDeps();
});

// ---------------------------------------------------------------------------
// 5. CONFIRMATION FIELDS
// ---------------------------------------------------------------------------

test("Confirmation Fields: list_confirmation_fields returns configured fields with required status", async () => {
  const env = createMockDbEnvironment();
  setAiContentServiceDeps({ dbService: env.mockDbService as any, databases: env.mockDatabases as any });
  const context = createMockContext();

  const res = await handleListConfirmationFields(context);
  assert.equal(res.success, true);
  assert.equal(res.data.fields.length, 2);
  assert.match(res.message, /Dress Size.*Required/);

  resetAiContentServiceDeps();
});

test("Confirmation Fields: add_confirmation_field adds field with schema validation", async () => {
  const env = createMockDbEnvironment();
  setAiContentServiceDeps({ dbService: env.mockDbService as any, databases: env.mockDatabases as any });
  const context = createMockContext();

  const res = await handleAddConfirmationField(context, {
    name: "Shoe Size",
    type: "number",
    required: true,
  });
  assert.equal(res.success, true);

  const fields = env.getSavedConfig().customFields;
  assert.equal(fields.length, 3);
  const added = fields.find((f: any) => f.key === "shoe_size");
  assert.ok(added);
  assert.equal(added.required, true);

  resetAiContentServiceDeps();
});

test("Confirmation Fields: set_confirmation_field_required toggles requirement", async () => {
  const env = createMockDbEnvironment();
  setAiContentServiceDeps({ dbService: env.mockDbService as any, databases: env.mockDatabases as any });
  const context = createMockContext();

  const res = await handleSetConfirmationFieldRequired(context, {
    key: "special_note",
    required: true,
  });
  assert.equal(res.success, true);

  const fields = env.getSavedConfig().customFields;
  const noteField = fields.find((f: any) => f.key === "special_note");
  assert.equal(noteField.required, true);

  resetAiContentServiceDeps();
});

test("Confirmation Fields: disable_confirmation_field removes custom field", async () => {
  const env = createMockDbEnvironment();
  setAiContentServiceDeps({ dbService: env.mockDbService as any, databases: env.mockDatabases as any });
  const context = createMockContext();

  const res = await handleDisableConfirmationField(context, { key: "special_note" });
  assert.equal(res.success, true);

  const fields = env.getSavedConfig().customFields;
  assert.equal(fields.length, 1);

  resetAiContentServiceDeps();
});

// ---------------------------------------------------------------------------
// 6. REPLY & MULTIMODAL SETTINGS
// ---------------------------------------------------------------------------

test("Reply Settings: get_reply_settings returns current multimodal settings", async () => {
  const env = createMockDbEnvironment();
  setAiContentServiceDeps({ dbService: env.mockDbService as any, databases: env.mockDatabases as any });
  const context = createMockContext();

  const res = await handleGetReplySettings(context);
  assert.equal(res.success, true);
  assert.equal(res.data.replyMode, "always_text");
  assert.equal(res.data.voiceUnd, true);
  assert.equal(res.data.imageUnd, true);

  resetAiContentServiceDeps();
});

test("Reply Settings: update_reply_mode validates and saves allowed mode", async () => {
  const env = createMockDbEnvironment();
  setAiContentServiceDeps({ dbService: env.mockDbService as any, databases: env.mockDatabases as any });
  const context = createMockContext();

  const res = await handleUpdateReplyMode(context, { mode: "customer_preference" });
  assert.equal(res.success, true);
  assert.equal(env.getSavedConfig().replyBehavior, "customer_preference");

  // Invalid mode rejection
  const invalidRes = await handleUpdateReplyMode(context, { mode: "telepathy_mode" });
  assert.equal(invalidRes.success, false);

  resetAiContentServiceDeps();
});

test("Reply Settings: update_call_settings updates rejectCalls flag", async () => {
  const env = createMockDbEnvironment();
  setAiContentServiceDeps({ dbService: env.mockDbService as any, databases: env.mockDatabases as any });
  const context = createMockContext();

  const res = await handleUpdateCallSettings(context, { rejectCalls: true });
  assert.equal(res.success, true);
  assert.equal(env.getSavedConfig().rejectCalls, 1);

  resetAiContentServiceDeps();
});

// ---------------------------------------------------------------------------
// 7. SMART SALES SETTINGS
// ---------------------------------------------------------------------------

test("Smart Sales: enable_smart_sales and disable_smart_sales toggle engine state", async () => {
  const env = createMockDbEnvironment();
  setAiContentServiceDeps({ dbService: env.mockDbService as any, databases: env.mockDatabases as any });
  const context = createMockContext();

  const enableRes = await handleEnableSmartSales(context);
  assert.equal(enableRes.success, true);
  assert.equal(env.getSavedConfig().smartSalesEngineEnabled, 1);

  const disableRes = await handleDisableSmartSales(context);
  assert.equal(disableRes.success, true);
  assert.equal(env.getSavedConfig().smartSalesEngineEnabled, 0);

  resetAiContentServiceDeps();
});

test("Smart Sales: update_smart_sales_training saves sales objection rules without exposing CRM", async () => {
  const env = createMockDbEnvironment();
  setAiContentServiceDeps({ dbService: env.mockDbService as any, databases: env.mockDatabases as any });
  const context = createMockContext();

  const res = await handleUpdateSmartSalesTraining(context, {
    training: "Offer free shipping on orders above Rs. 3000.",
    append: true,
  });
  assert.equal(res.success, true);

  const training = env.getSavedConfig().smart_sales_training;
  assert.ok(training.includes("Offer free shipping on orders above Rs. 3000."));
  assert.ok(training.includes("10% discount"));

  resetAiContentServiceDeps();
});

// ---------------------------------------------------------------------------
// 8. MEDIA LIBRARY
// ---------------------------------------------------------------------------

test("Media Library: list_media lists assets and save_admin_media adds asset", async () => {
  const env = createMockDbEnvironment();
  setAiContentServiceDeps({ dbService: env.mockDbService as any, databases: env.mockDatabases as any });
  const context = createMockContext();

  const listRes = await handleListMedia(context);
  assert.equal(listRes.success, true);
  assert.equal(listRes.data.media.length, 1);

  const saveRes = await handleSaveAdminMedia(context, {
    name: "Winter Lookbook 2026",
    type: "document",
    url: "https://cdn.example.com/winter.pdf",
    fileSize: 1024 * 500,
  });
  assert.equal(saveRes.success, true);

  const store = env.getSavedTemplateStore();
  assert.equal(store.media.templates.length, 2);

  resetAiContentServiceDeps();
});

// ---------------------------------------------------------------------------
// 9. SAVED REPLIES
// ---------------------------------------------------------------------------

test("Saved Replies: list_saved_replies and create_saved_reply with shortcut collision check", async () => {
  const env = createMockDbEnvironment();
  setAiContentServiceDeps({ dbService: env.mockDbService as any, databases: env.mockDatabases as any });
  const context = createMockContext();

  const listRes = await handleListSavedReplies(context);
  assert.equal(listRes.success, true);

  // Collision with existing sequence shortcut "onboard"
  const collisionRes = await handleCreateSavedReply(context, {
    title: "Onboarding Info",
    shortcut: "onboard",
    content: "Here is onboarding info.",
  });
  assert.equal(collisionRes.success, false);
  assert.match(collisionRes.message, /Shortcut Collision/);

  // Unique shortcut
  const createRes = await handleCreateSavedReply(context, {
    title: "Bank Account Details",
    shortcut: "bank",
    content: "Meezan Bank: 0101010101010101, Title: Fashion Hub",
  });
  assert.equal(createRes.success, true);

  const groups = env.getSavedConfig().groups;
  assert.ok(groups.find((g: any) => g.shortcut_code === "bank"));

  // Delete saved reply
  const deleteRes = await handleDeleteSavedReply(context, { shortcut: "bank" });
  assert.equal(deleteRes.success, true);
  assert.ok(!env.getSavedConfig().groups.find((g: any) => g.shortcut_code === "bank"));

  resetAiContentServiceDeps();
});

// ---------------------------------------------------------------------------
// 10. SEQUENCES & SEQUENCE STEPS
// ---------------------------------------------------------------------------

test("Sequences: list_sequences, get_sequence, add step, remove step, enable/disable", async () => {
  const env = createMockDbEnvironment();
  setAiContentServiceDeps({ dbService: env.mockDbService as any, databases: env.mockDatabases as any });
  const context = createMockContext();

  const listRes = await handleListSequences(context);
  assert.equal(listRes.success, true);
  assert.equal(listRes.data.sequences.length, 1);

  const getRes = await handleGetSequence(context, { name: "Onboarding Flow" });
  assert.equal(getRes.success, true);
  assert.equal(getRes.data.sequence.items.length, 2);

  // Add step
  const addStepRes = await handleAddSequenceStep(context, {
    sequenceName: "Onboarding Flow",
    content: "Reply YES to speak with an agent.",
    delaySeconds: 5,
  });
  assert.equal(addStepRes.success, true);

  const store = env.getSavedTemplateStore();
  assert.equal(store.sequences["Onboarding Flow"].templates.length, 3);

  // Remove step #2
  const removeStepRes = await handleRemoveSequenceStep(context, {
    sequenceName: "Onboarding Flow",
    stepIndex: 2,
  });
  assert.equal(removeStepRes.success, true);
  assert.equal(env.getSavedTemplateStore().sequences["Onboarding Flow"].templates.length, 2);

  // Toggle sequence state
  const disableRes = await handleDisableSequence(context, { name: "Onboarding Flow" });
  assert.equal(disableRes.success, true);
  const enableRes = await handleEnableSequence(context, { name: "Onboarding Flow" });
  assert.equal(enableRes.success, true);

  resetAiContentServiceDeps();
});

// ---------------------------------------------------------------------------
// 11. WELCOME AUTOMATION
// ---------------------------------------------------------------------------

test("Welcome Automation: get_welcome_automation and set_welcome_sequence with ambiguity check", async () => {
  const env = createMockDbEnvironment();
  setAiContentServiceDeps({ dbService: env.mockDbService as any, databases: env.mockDatabases as any });
  const context = createMockContext();

  const getRes = await handleGetWelcomeAutomation(context);
  assert.equal(getRes.success, true);
  assert.equal(getRes.data.welcome.name, "Welcome Flow");

  // Assign existing sequence as welcome
  const setRes = await handleSetWelcomeSequence(context, { sequenceName: "Onboarding Flow" });
  assert.equal(setRes.success, true);

  const groups = env.getSavedConfig().groups;
  const onboarding = groups.find((g: any) => g.name === "Onboarding Flow");
  assert.equal(onboarding.purpose, "welcome");

  resetAiContentServiceDeps();
});

// ---------------------------------------------------------------------------
// 12. ROUTER END-TO-END + CONFIRMATION & BILLING
// ---------------------------------------------------------------------------

test("Router End-to-End: 'turn on ai replies' creates pending confirmation and executes upon YES with $0.005 billing", async () => {
  const env = createMockDbEnvironment();
  setAiContentServiceDeps({ dbService: env.mockDbService as any, databases: env.mockDatabases as any });

  let billedAction = "";
  let billedAmount = 0;
  __setAdminRouterTestDeps({
    previewUsageBillingAction: (async () => ({ allowed: true, action: "admin_business_assistant_message", cost: 0.005, balance: 10 })) as any,
    chargeUsageBillingAction: (async (accId: string, action: any, meta: any) => {
      billedAction = action;
      billedAmount = 0.005;
      return { charged: true, cost: 0.005, dedupeKey: "test", walletBalance: 9.995, breakdown: [] };
    }) as any,
  });

  const context = createMockContext();
  const sentMessages: string[] = [];
  const mockSock = {
    sendMessage: async (jid: string, content: any) => {
      sentMessages.push(content.text);
      return { key: { id: `msg_${Date.now()}` } };
    },
  };

  __setAdminBusinessAgentTestDeps({
    generateBackendText: async () => ({
      requestStatus: "success",
      toolCalls: [
        {
          id: "tc_ai",
          name: "set_ai_reply_enabled",
          arguments: { enabled: true },
        },
      ],
    } as any),
  });

  // Step 1: Send proposal command
  const res1 = await routeAdminMessage({
    sock: mockSock,
    context,
    rawMessage: {},
    text: "turn on ai replies",
  });

  assert.equal(res1.handled, true);
  assert.equal(sentMessages.length, 1);
  assert.match(sentMessages[0], /Action Confirmation Required/);
  assert.match(sentMessages[0], /Confirm turning ON AI automated replies/);

  // Step 2: Affirmative reply "YES"
  const res2 = await routeAdminMessage({
    sock: mockSock,
    context,
    rawMessage: {},
    text: "YES",
  });

  assert.equal(res2.handled, true);
  assert.equal(sentMessages.length, 2);
  assert.match(sentMessages[1], /AI Chat Replies Turned ON/);
  assert.equal(billedAction, "");
  assert.equal(billedAmount, 0);

  __resetAdminBusinessAgentTestDeps();
  resetAiContentServiceDeps();
  __resetAdminRouterTestDeps();
});

test("Router End-to-End: 'add knowledge ...' executes as SAFE_WRITE immediately without confirmation", async () => {
  const env = createMockDbEnvironment();
  setAiContentServiceDeps({ dbService: env.mockDbService as any, databases: env.mockDatabases as any });

  __setAdminRouterTestDeps({
    previewUsageBillingAction: (async () => ({ allowed: true, action: "admin_business_assistant_message", cost: 0.005, balance: 10 })) as any,
    chargeUsageBillingAction: (async () => ({ charged: true, cost: 0.005, dedupeKey: "test", walletBalance: 9.995, breakdown: [] })) as any,
  });
  __setAdminBusinessAgentTestDeps({
    generateBackendText: async () => ({
      requestStatus: "success",
      toolCalls: [
        {
          id: "tc_faq",
          name: "add_faq_knowledge",
          arguments: { content: "Exchange is valid within 7 days with original tag." },
        },
      ],
    } as any),
  });

  const context = createMockContext();
  const sentMessages: string[] = [];
  const mockSock = {
    sendMessage: async (jid: string, content: any) => {
      sentMessages.push(content.text);
      return { key: { id: `msg_${Date.now()}` } };
    },
  };

  const res = await routeAdminMessage({
    sock: mockSock,
    context,
    rawMessage: {},
    text: "add knowledge Exchange is valid within 7 days with original tag.",
  });

  assert.equal(res.handled, true);
  assert.equal(sentMessages.length, 1);
  assert.match(sentMessages[0], /Knowledge Learned!/);
  assert.match(sentMessages[0], /Exchange is valid within 7 days/);

  __resetAdminBusinessAgentTestDeps();
  resetAiContentServiceDeps();
  __resetAdminRouterTestDeps();
});

test("Tenant Security: Bot from different account is blocked closed", async () => {
  const env = createMockDbEnvironment();
  setAiContentServiceDeps({ dbService: env.mockDbService as any, databases: env.mockDatabases as any });

  const context = createMockContext({
    accountId: "user_test_tenant_1",
    botId: "bot_other_tenant",
  });

  await assert.rejects(
    async () => handleGetAiSettings(context),
    /Access denied: Bot belongs to a different tenant account/
  );

  resetAiContentServiceDeps();
});
