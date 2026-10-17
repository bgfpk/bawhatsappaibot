import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import * as dbService from "./db-service.ts";
import {
  TRAINING_CHUNK_SIZE,
  MAX_TRAINING_PAYLOAD_BYTES,
  getBotHash,
  getManifestDocId,
  getChunkDocId,
  saveBotTrainingPayload,
  loadBotTrainingPayload,
  extractBotTraining,
  mergeTrainingIntoConfig,
  computeTrainingChecksum,
} from "./bot-training-storage-service.ts";

function createMockDatabases() {
  const storage = new Map<string, any>();

  const mockDb = {
    storage,
    getDocument: async (_dbId: string, _collId: string, docId: string) => {
      if (storage.has(docId)) {
        return JSON.parse(JSON.stringify(storage.get(docId)));
      }
      const err = new Error(`Document ${docId} not found`);
      (err as any).code = 404;
      throw err;
    },
    createDocument: async (_dbId: string, _collId: string, docId: string, data: any) => {
      const doc = { $id: docId, ...data };
      storage.set(docId, doc);
      return JSON.parse(JSON.stringify(doc));
    },
    updateDocument: async (_dbId: string, _collId: string, docId: string, data: any) => {
      if (storage.has(docId)) {
        const existing = storage.get(docId);
        const updated = { ...existing, ...data };
        storage.set(docId, updated);
        return JSON.parse(JSON.stringify(updated));
      }
      const err = new Error(`Document ${docId} not found`);
      (err as any).code = 404;
      throw err;
    },
    deleteDocument: async (_dbId: string, _collId: string, docId: string) => {
      storage.delete(docId);
      return { success: true };
    },
    listDocuments: async (_dbId: string, _collId: string) => {
      return { documents: Array.from(storage.values()).map(v => JSON.parse(JSON.stringify(v))) };
    },
  };

  return mockDb;
}

test("Document IDs strictly respect Appwrite <= 36 characters length and charset", () => {
  const longBotId = "bot_with_a_very_long_custom_identifier_9999999999999";
  const botHash = getBotHash(longBotId);
  const manifestId = getManifestDocId(botHash, 123456);
  const chunkId = getChunkDocId(botHash, 999999, 15);

  assert.ok(manifestId.length <= 36, `Manifest ID length ${manifestId.length} must be <= 36`);
  assert.ok(chunkId.length <= 36, `Chunk ID length ${chunkId.length} must be <= 36`);
  assert.match(manifestId, /^[a-zA-Z0-9_.-]+$/);
  assert.match(chunkId, /^[a-zA-Z0-9_.-]+$/);
});

test("A. 8,000-character prompt: save, chunk, and exact reconstruction", async () => {
  const mockDb = createMockDatabases();
  const botId = "bot_test_8k";
  const text = "A".repeat(8000);
  const payload = { prompt: text, learned_instructions: "Learned 8k", version: 1 };

  const ref = await saveBotTrainingPayload("main_db", botId, payload, mockDb);
  assert.equal(ref.chunkCount, 1);

  const reloaded = await loadBotTrainingPayload("main_db", botId, mockDb, ref);
  assert.ok(reloaded);
  assert.equal(reloaded.prompt, text);
  assert.equal(reloaded.learned_instructions, "Learned 8k");
});

test("B. 20,000-character prompt: save, single chunk under 50k, exact reconstruction", async () => {
  const mockDb = createMockDatabases();
  const botId = "bot_test_20k";
  const text = "Instructions for 20k:\n" + "20k line with info.\n".repeat(1000);
  assert.ok(text.length > 20000);

  const payload = { prompt: text, learned_instructions: "", version: 1 };
  const ref = await saveBotTrainingPayload("main_db", botId, payload, mockDb);
  assert.equal(ref.chunkCount, 1);

  const reloaded = await loadBotTrainingPayload("main_db", botId, mockDb, ref);
  assert.ok(reloaded);
  assert.equal(reloaded.prompt, text);
});

test("C. >100,000-character prompt requiring multiple chunks with exact boundary sentinels", async () => {
  const mockDb = createMockDatabases();
  const botId = "bot_test_100k_multi";

  const sentinelStart = "[[SENTINEL_START: START_OF_140K_TRAINING]]\n";
  const seg6k = "1. First segment up to 6000 chars.\n".repeat(170);
  const sentinel6k = "\n[[SENTINEL_6000: BOUNDARY_6000_CHARS]]\n";
  const seg10k = "2. Segment expanding past 10000 chars.\n".repeat(120);
  const sentinel10k = "\n[[SENTINEL_10000: BOUNDARY_10000_CHARS]]\n";
  const seg100k = "3. Substantial body taking payload past 100,000 characters threshold.\n".repeat(1300);
  const sentinel100k = "\n[[SENTINEL_100000: BOUNDARY_100000_CHARS]]\n";
  const segEnd = "4. Final expansion segment.\n".repeat(600);
  const sentinelEnd = "\n[[SENTINEL_END: FINAL_CHARS_GUARANTEE_EOF]]";

  const longPrompt = `${sentinelStart}${seg6k}${sentinel6k}${seg10k}${sentinel10k}${seg100k}${sentinel100k}${segEnd}${sentinelEnd}`;
  assert.ok(longPrompt.length > 100000, `Prompt length is ${longPrompt.length} (> 100,000 chars)`);

  const payload = {
    prompt: longPrompt,
    learned_instructions: "Learned knowledge for multi-chunk bot",
    version: 1,
  };

  const ref = await saveBotTrainingPayload("main_db", botId, payload, mockDb);
  assert.ok(ref.chunkCount >= 2, `Expected at least 2 chunks, got ${ref.chunkCount}`);

  const reloaded = await loadBotTrainingPayload("main_db", botId, mockDb, ref);
  assert.ok(reloaded);
  assert.equal(reloaded.prompt, longPrompt);
  assert.equal(reloaded.learned_instructions, "Learned knowledge for multi-chunk bot");
  assert.ok(reloaded.prompt.includes(sentinelStart));
  assert.ok(reloaded.prompt.includes(sentinel6k));
  assert.ok(reloaded.prompt.includes(sentinel10k));
  assert.ok(reloaded.prompt.includes(sentinel100k));
  assert.ok(reloaded.prompt.includes(sentinelEnd));
});

test("D. Raw chunk size safety: escape-heavy text with quotes, backslashes, emoji, Urdu is strictly < 100,000 chars", async () => {
  const mockDb = createMockDatabases();
  const botId = "bot_escape_heavy_safety";

  const escapeHeavyPrompt = `
"Quotes with backslashes \\" and newlines \n\r\t and JSON strings: {\"key\": \"value\", \"nested\": [1,2,3]}
اردو ہدایات: کسٹمر کو "السلام علیکم" کہیں۔ قیمت 500 روپے ہے۔
🚀 🛍️ ✨ 🎉
`.repeat(1500);

  const payload = {
    prompt: escapeHeavyPrompt,
    learned_instructions: "Special instructions with \\' and \"quotes\".",
    version: 1,
  };

  const ref = await saveBotTrainingPayload("main_db", botId, payload, mockDb);
  assert.ok(ref.chunkCount >= 2);

  // Check every chunk in mock storage
  for (let i = 0; i < ref.chunkCount; i++) {
    const chunkDocId = getChunkDocId(getBotHash(botId), ref.generation, i);
    const chunkDoc = mockDb.storage.get(chunkDocId);
    assert.ok(chunkDoc, `Chunk ${i} must exist`);
    assert.ok(typeof chunkDoc.value === "string");
    // Strictly verify chunk is under Appwrite's 100,000 character limit
    assert.ok(
      chunkDoc.value.length < 100000,
      `Chunk ${i} length (${chunkDoc.value.length}) must be strictly < 100,000 characters`
    );
    assert.ok(
      chunkDoc.value.length <= TRAINING_CHUNK_SIZE,
      `Chunk ${i} length (${chunkDoc.value.length}) must be <= ${TRAINING_CHUNK_SIZE}`
    );
  }

  const reloaded = await loadBotTrainingPayload("main_db", botId, mockDb, ref);
  assert.ok(reloaded);
  assert.equal(reloaded.prompt, escapeHeavyPrompt);
});

test("E. Custom-field instructions > 10,000 characters: instructions live in external training and survive reload", async () => {
  const mockDb = createMockDatabases();
  const botId = "bot_large_custom_fields";

  mockDb.storage.set(botId, {
    $id: botId,
    name: "Custom Fields Bot",
    config_settings: JSON.stringify({ autoReply: true }),
  });

  const originalGetDoc = dbService.databases.getDocument;
  const originalUpdateDoc = dbService.databases.updateDocument;
  const originalCreateDoc = dbService.databases.createDocument;

  try {
    dbService.databases.getDocument = mockDb.getDocument as any;
    dbService.databases.updateDocument = mockDb.updateDocument as any;
    dbService.databases.createDocument = mockDb.createDocument as any;

    const largeFieldInstructions = "Detailed custom field instructions for order delivery:\n".repeat(300); // ~17,000 chars
    assert.ok(largeFieldInstructions.length > 15000);

    const fullConfig = {
      autoReply: true,
      prompt: "Base system prompt.",
      learned_instructions: "Base learned instructions.",
      customFields: [
        { id: "cf_delivery", name: "Delivery Info", key: "delivery_info", type: "text", required: true, instructions: largeFieldInstructions },
      ],
    };

    // Save through dbService.saveBotConfig
    await dbService.saveBotConfig(botId, fullConfig);

    // Verify stored BOTS.config_settings is compact (< 2,000 chars, well below 10,000)
    const storedBotDoc = mockDb.storage.get(botId);
    const serializedConfig = storedBotDoc.config_settings;
    assert.ok(serializedConfig.length < 2000, `Serialized config (${serializedConfig.length}) must be < 2000`);
    assert.ok(!serializedConfig.includes("Detailed custom field instructions for order delivery"));

    // Reload through dbService.loadBotConfig
    const reloaded = await dbService.loadBotConfig(botId);
    assert.ok(reloaded);
    assert.equal(reloaded.prompt, "Base system prompt.");
    assert.equal(reloaded.learned_instructions, "Base learned instructions.");
    assert.equal(Array.isArray(reloaded.customFields), true);
    assert.equal(reloaded.customFields[0].instructions, largeFieldInstructions);
  } finally {
    dbService.databases.getDocument = originalGetDoc;
    dbService.databases.updateDocument = originalUpdateDoc;
    dbService.databases.createDocument = originalCreateDoc;
  }
});

test("F. Unchanged training on config save reuses active trainingRef without creating new generations", async () => {
  const mockDb = createMockDatabases();
  const botId = "bot_unchanged_training";

  mockDb.storage.set(botId, {
    $id: botId,
    name: "Unchanged Test Bot",
    config_settings: JSON.stringify({ autoReply: true }),
  });

  const originalGetDoc = dbService.databases.getDocument;
  const originalUpdateDoc = dbService.databases.updateDocument;
  const originalCreateDoc = dbService.databases.createDocument;

  try {
    dbService.databases.getDocument = mockDb.getDocument as any;
    dbService.databases.updateDocument = mockDb.updateDocument as any;
    dbService.databases.createDocument = mockDb.createDocument as any;

    const initialConfig = {
      autoReply: true,
      prompt: "Fixed training text v1",
      learned_instructions: "Fixed learned instructions v1",
    };

    // First save
    await dbService.saveBotConfig(botId, initialConfig);
    const doc1 = mockDb.storage.get(botId);
    const config1 = JSON.parse(doc1.config_settings);
    const initialGeneration = config1.trainingRef.generation;
    assert.ok(initialGeneration > 0);

    // Second save with operational-only changes (no prompt change)
    await dbService.saveBotConfig(botId, {
      autoReply: false,
      prompt: "Fixed training text v1",
      learned_instructions: "Fixed learned instructions v1",
    });

    const doc2 = mockDb.storage.get(botId);
    const config2 = JSON.parse(doc2.config_settings);
    assert.equal(config2.autoReply, false);
    // Must reuse exact same trainingRef generation!
    assert.equal(config2.trainingRef.generation, initialGeneration);

    // Third save with NO training fields in incoming payload (e.g. worker group sync update)
    await dbService.saveBotConfig(botId, {
      autoReply: true,
      groups: [{ name: "Test Group", jid: "contact-05e4fddb226e@example.invalid" }],
    });

    const doc3 = mockDb.storage.get(botId);
    const config3 = JSON.parse(doc3.config_settings);
    assert.equal(config3.trainingRef.generation, initialGeneration);

    // Reload still returns full training
    const reloaded = await dbService.loadBotConfig(botId);
    assert.equal(reloaded.prompt, "Fixed training text v1");
    assert.equal(reloaded.learned_instructions, "Fixed learned instructions v1");
  } finally {
    dbService.databases.getDocument = originalGetDoc;
    dbService.databases.updateDocument = originalUpdateDoc;
    dbService.databases.createDocument = originalCreateDoc;
  }
});

test("G. BOTS Update Failure preserves generation N as authoritative", async () => {
  const mockDb = createMockDatabases();
  const botId = "bot_atomic_bots_failure";

  mockDb.storage.set(botId, {
    $id: botId,
    name: "Atomic Failure Bot",
    config_settings: JSON.stringify({ autoReply: true }),
  });

  const originalGetDoc = dbService.databases.getDocument;
  const originalUpdateDoc = dbService.databases.updateDocument;
  const originalCreateDoc = dbService.databases.createDocument;

  try {
    dbService.databases.getDocument = mockDb.getDocument as any;
    dbService.databases.updateDocument = mockDb.updateDocument as any;
    dbService.databases.createDocument = mockDb.createDocument as any;

    // 1. Initial valid save
    await dbService.saveBotConfig(botId, { prompt: "Generation 1 Training", learned_instructions: "Gen 1" });
    const initialConfig = await dbService.loadBotConfig(botId);
    assert.equal(initialConfig.prompt, "Generation 1 Training");

    // 2. Attempt to save Generation 2, but simulate failure during BOTS.config_settings update
    dbService.databases.updateDocument = (async (dbId: string, collId: string, docId: string, data: any) => {
      if (collId === dbService.COLLECTIONS.BOTS) {
        throw new Error("Simulated Appwrite BOTS collection network timeout");
      }
      return mockDb.updateDocument(dbId, collId, docId, data);
    }) as any;

    await assert.rejects(
      async () => {
        await dbService.saveBotConfig(botId, { prompt: "Generation 2 Training (Should Fail)", learned_instructions: "Gen 2" });
      },
      /Simulated Appwrite BOTS collection network timeout/
    );

    // Restore updateDocument
    dbService.databases.updateDocument = mockDb.updateDocument as any;

    // 3. Verify loadBotConfig STILL returns Generation 1 because BOTS.trainingRef was not updated!
    const activeAfterFailure = await dbService.loadBotConfig(botId);
    assert.equal(activeAfterFailure.prompt, "Generation 1 Training");
    assert.equal(activeAfterFailure.learned_instructions, "Gen 1");
  } finally {
    dbService.databases.getDocument = originalGetDoc;
    dbService.databases.updateDocument = originalUpdateDoc;
    dbService.databases.createDocument = originalCreateDoc;
  }
});

test("H. WhatsApp JID Relink: Bot A to Bot B restores 150k+ training with isolated namespaces and chunking", async () => {
  const mockDb = createMockDatabases();
  const botAId = "bot_alpha_large";
  const botBId = "bot_beta_large";
  const jid = "contact-f3e665cdb447@example.invalid";

  // Build >150,000 characters of training with sentinels
  const startSentinel = "===START_SENTINEL_150K===";
  const middleSentinel = "===MIDDLE_SENTINEL_75K===";
  const endSentinel = "===END_SENTINEL_150K===";

  const part1 = startSentinel + "\n" + "P1 Knowledge line for Bot A.\n".repeat(2500);
  const part2 = middleSentinel + "\n" + "P2 Middle knowledge content.\n".repeat(2500);
  const part3 = "P3 Trailing instructions.\n".repeat(2000) + "\n" + endSentinel;
  const large150kPrompt = part1 + part2 + part3;
  assert.ok(large150kPrompt.length > 150000, `Training length ${large150kPrompt.length} must exceed 150k chars`);

  // Pre-seed Bot A and Bot B
  mockDb.storage.set(botAId, {
    $id: botAId,
    name: "Bot A",
    jid: jid,
    user_id: "user_123",
    config_settings: JSON.stringify({ autoReply: true }),
  });

  mockDb.storage.set(botBId, {
    $id: botBId,
    name: "Bot B",
    jid: "",
    user_id: "user_123",
    config_settings: JSON.stringify({ autoReply: true }),
  });

  const originalGetDoc = dbService.databases.getDocument;
  const originalUpdateDoc = dbService.databases.updateDocument;
  const originalCreateDoc = dbService.databases.createDocument;
  const originalListDoc = dbService.databases.listDocuments;

  try {
    dbService.databases.getDocument = mockDb.getDocument as any;
    dbService.databases.updateDocument = mockDb.updateDocument as any;
    dbService.databases.createDocument = mockDb.createDocument as any;
    dbService.databases.listDocuments = mockDb.listDocuments as any;

    // 1. Save 150k+ training for Bot A (creates bot chunks and JID-scoped permanent backup chunks)
    await dbService.saveBotConfig(botAId, {
      prompt: large150kPrompt,
      learned_instructions: "Learned instructions for large relink.",
    });

    // 2. Perform operational-only update on Bot A (should NOT overwrite or blank out permanent JID backup)
    await dbService.saveBotConfig(botAId, {
      autoReply: false,
      groups: ["vip_group"],
    });

    // 3. Relink JID to Bot B via saveBotInfo
    await dbService.saveBotInfo(jid, botBId);

    // 4. Bot B must now have its own loaded 150k+ training
    const botBConfig = await dbService.loadBotConfig(botBId);
    assert.ok(botBConfig);
    assert.equal(botBConfig.prompt.length, large150kPrompt.length);
    assert.ok(botBConfig.prompt.startsWith(startSentinel));
    assert.ok(botBConfig.prompt.includes(middleSentinel));
    assert.ok(botBConfig.prompt.endsWith(endSentinel));
    assert.equal(botBConfig.learned_instructions, "Learned instructions for large relink.");

    // 5. Bot B has its own distinct trainingRef and isolated bot-scoped chunks
    const botBDoc = mockDb.storage.get(botBId);
    const botBOperational = JSON.parse(botBDoc.config_settings);
    assert.ok(botBOperational.trainingRef);

    const botAHash = getBotHash(botAId);
    const botBHash = getBotHash(botBId);
    assert.notEqual(botAHash, botBHash);
  } finally {
    dbService.databases.getDocument = originalGetDoc;
    dbService.databases.updateDocument = originalUpdateDoc;
    dbService.databases.createDocument = originalCreateDoc;
    dbService.databases.listDocuments = originalListDoc;
  }
});

test("I. Intentional clear-all training safely clears trainingRef and does not restore old training on reload", async () => {
  const mockDb = createMockDatabases();
  const botId = "bot_clear_test";

  mockDb.storage.set(botId, {
    $id: botId,
    name: "Bot Clear",
    user_id: "user_clear",
    config_settings: JSON.stringify({ autoReply: true }),
  });

  const originalGetDoc = dbService.databases.getDocument;
  const originalUpdateDoc = dbService.databases.updateDocument;
  const originalCreateDoc = dbService.databases.createDocument;

  try {
    dbService.databases.getDocument = mockDb.getDocument as any;
    dbService.databases.updateDocument = mockDb.updateDocument as any;
    dbService.databases.createDocument = mockDb.createDocument as any;

    // 1. Initial save with training
    await dbService.saveBotConfig(botId, {
      prompt: "Original bot prompt",
      learned_instructions: "Original learned instructions",
    });

    const initialLoaded = await dbService.loadBotConfig(botId);
    assert.equal(initialLoaded.prompt, "Original bot prompt");

    // 2. User intentionally clears all training fields
    await dbService.saveBotConfig(botId, {
      prompt: "",
      learned_instructions: "",
      customFields: [],
    });

    // 3. Reload config - prompt and learned_instructions must be empty and trainingRef cleared
    const reloaded = await dbService.loadBotConfig(botId);
    assert.equal(reloaded.prompt || "", "");
    assert.equal(reloaded.learned_instructions || "", "");
    assert.equal(reloaded.trainingRef, undefined);
  } finally {
    dbService.databases.getDocument = originalGetDoc;
    dbService.databases.updateDocument = originalUpdateDoc;
    dbService.databases.createDocument = originalCreateDoc;
  }
});

test("J. Save fails closed when reading existing BOTS document fails with network error", async () => {
  const mockDb = createMockDatabases();
  const botId = "bot_fail_closed";

  mockDb.storage.set(botId, {
    $id: botId,
    name: "Bot Fail Closed",
    user_id: "user_fail",
    config_settings: JSON.stringify({ autoReply: true, trainingRef: { generation: 1, chunkCount: 1, checksum: "abc", totalLength: 50, updatedAt: 100 } }),
  });

  const originalGetDoc = dbService.databases.getDocument;
  const originalUpdateDoc = dbService.databases.updateDocument;

  try {
    // Simulate network error on getDocument
    dbService.databases.getDocument = (async () => {
      const err = new Error("Appwrite network timeout reading BOTS document");
      (err as any).code = 500;
      throw err;
    }) as any;

    let updateAttempted = false;
    dbService.databases.updateDocument = (async () => {
      updateAttempted = true;
    }) as any;

    await assert.rejects(
      async () => {
        await dbService.saveBotConfig(botId, { prompt: "New instructions" });
      },
      /Failed to read existing bot document/
    );

    assert.equal(updateAttempted, false, "BOTS document was not overwritten during read failure");
  } finally {
    dbService.databases.getDocument = originalGetDoc;
    dbService.databases.updateDocument = originalUpdateDoc;
  }
});

test("K. Corrupt or missing active training chunk fails safe with critical error instead of running blank", async () => {
  const mockDb = createMockDatabases();
  const botId = "bot_corrupt_test";

  mockDb.storage.set(botId, {
    $id: botId,
    name: "Bot Corrupt",
    user_id: "user_corrupt",
    config_settings: JSON.stringify({ autoReply: true }),
  });

  const originalGetDoc = dbService.databases.getDocument;
  const originalUpdateDoc = dbService.databases.updateDocument;
  const originalCreateDoc = dbService.databases.createDocument;

  try {
    dbService.databases.getDocument = mockDb.getDocument as any;
    dbService.databases.updateDocument = mockDb.updateDocument as any;
    dbService.databases.createDocument = mockDb.createDocument as any;

    // 1. Save valid multi-chunk training
    const text = "A".repeat(60000); // 2 chunks
    await dbService.saveBotConfig(botId, { prompt: text, learned_instructions: "Valid" });

    // 2. Corrupt storage by deleting one of the chunk documents
    const botHash = getBotHash(botId);
    const botDoc = mockDb.storage.get(botId);
    const opConfig = JSON.parse(botDoc.config_settings);
    const chunk1Id = getChunkDocId(botHash, opConfig.trainingRef.generation, 1);
    mockDb.storage.delete(chunk1Id);

    // 3. Loading corrupt config must fail safe with critical error
    await assert.rejects(
      async () => {
        await dbService.loadBotConfig(botId);
      },
      /Critical: Unable to reconstruct authoritative bot training/
    );
  } finally {
    dbService.databases.getDocument = originalGetDoc;
    dbService.databases.updateDocument = originalUpdateDoc;
    dbService.databases.createDocument = originalCreateDoc;
  }
});
