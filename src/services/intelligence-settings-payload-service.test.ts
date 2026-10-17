import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAiLearnedKnowledgePayload,
  buildConfirmationFieldsPayload,
  buildIntegrationPayload,
  buildSharedAiInstructionsPayload,
  getIntelligenceSaveButtonLabel,
  getCustomerDetailsConfiguredSignal,
  isIntelligenceTabSaving,
  resolveCustomerDetailsConfigured,
} from "./intelligence-settings-payload-service.ts";

const snapshot = {
  systemPrompt: "Shared instructions",
  botName: "BlackArrow",
  botGender: "female",
  botVoice: "Aoede",
  businessType: "products",
  learnedInstructions: "Learned rule",
  customFields: [{ name: "Color", instructions: "Ask color" }],
  rejectCalls: 1,
  mutedNumbers: ["16747095146"],
  difficultCustomerMode: "admin_pause",
  replyBehavior: "preference",
  replyInGroups: 0,
  voiceSimulationEnabled: 1,
  postexApiKey: "postex",
  leopardsApiKey: "leo",
  leopardsApiPassword: "secret",
  dhlApiKey: "dhl-secret",
  dhlService: "express",
  dhlRequesterCountryCode: "US",
  dhlOriginCountryCode: "AE",
  dhlLanguage: "en",
  dhlEnabled: true,
  adminNumber: "16747095146",
};

test("Saving AI Self Learned Instructions does not include dhl_api_key in payload", () => {
  const payload = buildAiLearnedKnowledgePayload(snapshot);
  assert.deepEqual(payload, { learnedInstructions: "Learned rule" });
  assert.equal("dhlApiKey" in payload, false);
  assert.equal("dhl_api_key" in payload, false);
});

test("Saving Shared AI Instructions does not include DHL fields", () => {
  const payload = buildSharedAiInstructionsPayload(snapshot);
  assert.deepEqual(payload, {
    systemPrompt: "Shared instructions",
    botName: "BlackArrow",
    botGender: "female",
    botVoice: "Aoede",
    businessType: "products",
  });
  assert.equal("dhlApiKey" in payload, false);
});

test("Saving API & Integrations uses only integration-safe fields", () => {
  const payload = buildIntegrationPayload(snapshot);
  assert.deepEqual(payload, {
    postexApiKey: "postex",
    leopardsApiKey: "leo",
    leopardsApiPassword: "secret",
    dhlApiKey: "dhl-secret",
    dhlService: "express",
    dhlRequesterCountryCode: "US",
    dhlOriginCountryCode: "AE",
    dhlLanguage: "en",
    dhlEnabled: true,
    adminNumber: "16747095146",
  });
  assert.equal("systemPrompt" in payload, false);
  assert.equal("learnedInstructions" in payload, false);
});

test("Save buttons show correct loading state only for the tab being saved", () => {
  assert.equal(isIntelligenceTabSaving("learned", "learned"), true);
  assert.equal(isIntelligenceTabSaving("learned", "integrations"), false);
  assert.equal(getIntelligenceSaveButtonLabel("integrations"), "Save API & Integrations");
  assert.equal(getIntelligenceSaveButtonLabel("instructions"), "Save basics");
  assert.equal(getIntelligenceSaveButtonLabel("learned"), "Save knowledge");
});

test("Saving Customer Details preserves fields and sets the per-instance completion marker", () => {
  assert.deepEqual(buildConfirmationFieldsPayload({ ...snapshot, customFields: [] }), {
    customFields: [],
    customer_details_configured: true,
  });
  assert.deepEqual(buildConfirmationFieldsPayload(snapshot), {
    customFields: [{ name: "Color", instructions: "Ask color" }],
    customer_details_configured: true,
  });
});

test("canonical Customer Details marker overrides the legacy camelCase fallback", () => {
  assert.equal(getCustomerDetailsConfiguredSignal({}), undefined);
  assert.equal(resolveCustomerDetailsConfigured({}), false);
  assert.equal(resolveCustomerDetailsConfigured({ customerDetailsConfigured: true }), true);
  assert.equal(resolveCustomerDetailsConfigured({ customer_details_configured: true }), true);
  assert.equal(resolveCustomerDetailsConfigured({ customer_details_configured: false, customerDetailsConfigured: true }), false);
});
