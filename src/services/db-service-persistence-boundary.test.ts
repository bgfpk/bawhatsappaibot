import test from "node:test";
import assert from "node:assert/strict";
import * as dbService from "./db-service.ts";
import { compactSavedAiTrainingConfig } from "./instruction-compaction-service.ts";

test("Real save -> persistence boundary -> reload -> exact equality test suite", async () => {
  const originalGetDocument = dbService.databases.getDocument;
  const originalUpdateDocument = dbService.databases.updateDocument;
  const originalCreateDocument = dbService.databases.createDocument;
  const mockStorage = new Map<string, any>();

  try {
    // Setup isolated in-memory DB mock
    dbService.databases.getDocument = (async (_dbId: string, _collectionId: string, documentId: string) => {
      if (mockStorage.has(documentId)) {
        return mockStorage.get(documentId);
      }
      const err = new Error("Document not found");
      (err as any).code = 404;
      throw err;
    }) as any;

    dbService.databases.createDocument = (async (_dbId: string, _collectionId: string, documentId: string, data: any) => {
      const doc = { $id: documentId, ...data };
      mockStorage.set(documentId, doc);
      return doc;
    }) as any;

    dbService.databases.updateDocument = (async (_dbId: string, _collectionId: string, documentId: string, data: any) => {
      if (mockStorage.has(documentId)) {
        const existing = mockStorage.get(documentId);
        const updated = { ...existing, ...data };
        mockStorage.set(documentId, updated);
        return updated;
      }
      const err = new Error("Document not found");
      (err as any).code = 404;
      throw err;
    }) as any;

    const botId = "test_bot_boundary_999";
    mockStorage.set(botId, {
      $id: botId,
      user_id: "user_test_owner",
      name: "Boundary Test Bot",
      config_settings: JSON.stringify({ autoReply: true }),
    });

    // Construct synthetic training content:
    // - Substantially > 6000 chars (~14,000 chars)
    // - Multiline
    // - Urdu / Arabic / Unicode
    // - Sentinels: beginning, near middle, around char 6000, final chars
    const sentinelStart = "[[SENTINEL_START: BEGIN_TRAINING_POLICY]]\n";
    const segment1 = "1. آپ ہمارے معزز کسٹمر ہیں اور آپ کو بہترین سروس ملے گی۔\n".repeat(100); // ~6,000 chars
    const sentinel6000 = "\n[[SENTINEL_6000: EXACT_SIX_THOUSAND_BOUNDARY]]\n";
    const segment2 = "2. Please ensure prompt delivery in Karachi, Lahore, Islamabad with standard rates.\n".repeat(80); // ~6,500 chars
    const sentinelMiddle = "\n[[SENTINEL_MIDDLE: MIDPOINT_VERIFICATION_TAG]]\n";
    const segment3 = "3. واپسی اور تبدیلی کی سہولت 7 دن کے اندر دستیاب ہے۔\n".repeat(60); // ~3,500 chars
    const sentinelEnd = "\n[[SENTINEL_END: FINAL_CHARS_GUARANTEE_EOF]]";

    const largeCustomPrompt = `${sentinelStart}${segment1}${sentinel6000}${segment2}${sentinelMiddle}${segment3}${sentinelEnd}`;
    assert.ok(largeCustomPrompt.length > 14000, `Prompt length is ${largeCustomPrompt.length}, substantially > 6000`);

    const largeLearnedInstructions = "سیکھی گئی ہدایات: تمام آرڈرز کی تصدیق فون پر کریں۔\n".repeat(50);
    const customFieldInstructions = "کسٹمر کا مکمل پتہ اور قریبی لینڈ مارک حاصل کریں۔\n".repeat(20);

    const inputConfig = {
      prompt: largeCustomPrompt,
      learned_instructions: largeLearnedInstructions,
      autoReply: true,
      customFields: [
        {
          name: "delivery_landmark",
          instructions: customFieldInstructions,
        },
      ],
    };

    // Step 1: Run through compaction preservation
    const compactionResult = compactSavedAiTrainingConfig(inputConfig);
    const configToPersist = compactionResult.config;

    // Step 2: Save to database through dbService.saveBotConfig
    await dbService.saveBotConfig(botId, configToPersist);

    // Verify serialized payload stored in DB
    const storedBotDoc = mockStorage.get(botId);
    assert.ok(storedBotDoc, "Bot document exists in storage");
    assert.ok(typeof storedBotDoc.config_settings === "string", "config_settings is serialized JSON string");
    assert.ok(storedBotDoc.config_settings.length < 10000, "Serialized JSON size must stay strictly below 10,000 live Appwrite attribute limit");
    assert.ok(storedBotDoc.config_settings.length < 2000, "Serialized JSON size is compact operational config only");

    // Step 3: Reload through dbService.loadBotConfig
    const reloadedConfig = await dbService.loadBotConfig(botId);

    // Step 4: Verify EXACT equality after persistence and reload
    assert.ok(reloadedConfig, "Reloaded config is parsed successfully");
    assert.equal(reloadedConfig.prompt, largeCustomPrompt.trim(), "Shared AI instructions match exactly after reload");
    assert.equal(reloadedConfig.learned_instructions, largeLearnedInstructions.trim(), "Learned instructions match exactly after reload");
    assert.equal(reloadedConfig.customFields[0].instructions, customFieldInstructions.trim(), "Custom field instructions match exactly after reload");

    // Verify all sentinels are intact in reloaded config
    assert.ok(reloadedConfig.prompt.includes("[[SENTINEL_START: BEGIN_TRAINING_POLICY]]"), "Start sentinel verified intact");
    assert.ok(reloadedConfig.prompt.includes("[[SENTINEL_6000: EXACT_SIX_THOUSAND_BOUNDARY]]"), "6000-char boundary sentinel verified intact");
    assert.ok(reloadedConfig.prompt.includes("[[SENTINEL_MIDDLE: MIDPOINT_VERIFICATION_TAG]]"), "Middle sentinel verified intact");
    assert.ok(reloadedConfig.prompt.includes("[[SENTINEL_END: FINAL_CHARS_GUARANTEE_EOF]]"), "End sentinel verified intact");
    assert.ok(reloadedConfig.prompt.includes("آپ ہمارے معزز کسٹمر ہیں"), "Urdu unicode characters intact");

    // Step 5: Test persistence failure propagation
    dbService.databases.updateDocument = (async () => {
      const err = new Error("AppwriteException: Attribute length exceeds schema attribute limit");
      (err as any).code = 400;
      throw err;
    }) as any;

    await assert.rejects(
      async () => {
        await dbService.saveBotConfig(botId, configToPersist);
      },
      /Attribute length exceeds schema attribute limit/,
      "saveBotConfig must reject and throw on Appwrite persistence rejection"
    );
  } finally {
    dbService.databases.getDocument = originalGetDocument;
    dbService.databases.updateDocument = originalUpdateDocument;
    dbService.databases.createDocument = originalCreateDocument;
  }
});
