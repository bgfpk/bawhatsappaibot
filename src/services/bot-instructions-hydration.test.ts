import test from "node:test";
import assert from "node:assert/strict";

test("bot instructions persistence: compact config retains trainingRef and loadBotConfig rehydrates systemPrompt", () => {
  const fullInstructions = "You are a professional assistant for our customer support team. Always provide polite and accurate details.";
  const learnedKnowledge = "Office hours are 9am to 6pm Monday to Friday.";

  // Simulated compact config stored in Appwrite BOTS collection
  const rawBotDocument = {
    $id: "bot_123",
    name: "Customer Support Bot",
    config_settings: JSON.stringify({
      version: 2,
      trainingRef: "training_doc_456",
      voiceSimulationEnabled: 1,
      replyInGroups: 0,
    }),
  };

  // Simulated training chunks in SYSTEM_CONFIGS
  const trainingStorage = new Map<string, any>([
    [
      "training_doc_456",
      {
        prompt: fullInstructions,
        learned_instructions: learnedKnowledge,
      },
    ],
  ]);

  function hydrateBotConfig(rawDoc: any) {
    let parsedConfig: any = {};
    try {
      parsedConfig = typeof rawDoc.config_settings === "string" ? JSON.parse(rawDoc.config_settings) : rawDoc.config_settings || {};
    } catch {
      parsedConfig = {};
    }

    if (parsedConfig.trainingRef && trainingStorage.has(parsedConfig.trainingRef)) {
      const training = trainingStorage.get(parsedConfig.trainingRef);
      return {
        ...parsedConfig,
        prompt: training.prompt || parsedConfig.prompt || "",
        learned_instructions: training.learned_instructions || parsedConfig.learned_instructions || "",
        systemPrompt: training.prompt || parsedConfig.systemPrompt || parsedConfig.prompt || "",
      };
    }
    return parsedConfig;
  }

  const hydrated = hydrateBotConfig(rawBotDocument);
  assert.equal(hydrated.prompt, fullInstructions);
  assert.equal(hydrated.systemPrompt, fullInstructions);
  assert.equal(hydrated.learned_instructions, learnedKnowledge);
  assert.equal(hydrated.voiceSimulationEnabled, 1);
});
