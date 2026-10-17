import test from "node:test";
import assert from "node:assert/strict";
import { buildClientOnboardingChecklist, getOnboardingCtaTarget } from "./client-onboarding-checklist-service.ts";

const completeInput = {
  selectedBot: { id: "bot_a", name: "Main Sales", jid: "contact-e4ed32210a80@example.invalid", is_active: 1, last_inbound_at: 100 },
  status: "connected",
  systemPrompt: "We sell home products and deliver nationwide. Answer clearly and confirm every order.",
  botName: "Sales helper",
  businessType: "product",
  selectedBotLanguage: "English",
  replyBehavior: "text_preferred",
  products: [{ id: "product_1", name: "Delivery service" }],
  customFields: [{ name: "Delivery city", instructions: "Ask for the customer's delivery city." }],
  userBilling: { billing_access: { status: "paid" } },
  aiRepliesEnabled: true,
};

test("launch checklist contains exactly six ordered core steps", () => {
  const checklist = buildClientOnboardingChecklist({});
  assert.deepEqual(checklist.coreItems.map((item) => item.id), [
    "connect-whatsapp",
    "business-information",
    "products-services",
    "customer-details",
    "test-bot",
    "go-live",
  ]);
  assert.equal(checklist.totalCoreCount, 6);
  assert.equal(checklist.totalCount, 6);
  assert.equal(checklist.items.some((item) => item.id === "account-created"), false);
});

test("optional improvements never affect launch progress", () => {
  const withoutOptional = buildClientOnboardingChecklist(completeInput);
  const withOptional = buildClientOnboardingChecklist({
    ...completeInput,
    syncGroups: [{ name: "Media", purpose: "welcome_sequence" }],
    followups: [{ id: "followup_1" }],
    userBilling: { ...completeInput.userBilling, setupStatus: { websiteKnowledgeCount: 2 } },
  });
  assert.equal(withoutOptional.optionalItems.length, 4);
  assert.equal(withOptional.optionalItems.length, 4);
  assert.equal(withOptional.totalCount, 6);
  assert.equal(withOptional.progressPercent, withoutOptional.progressPercent);
  assert.equal(withOptional.coreItems.some((item) => /media|welcome|website|follow-up|crm/i.test(item.id)), false);
});

test("core progress uses only six steps and rounds to the requested percentages", () => {
  const none = buildClientOnboardingChecklist({});
  const one = buildClientOnboardingChecklist({ selectedBot: { ...completeInput.selectedBot, last_inbound_at: undefined }, status: "connected" });
  const five = buildClientOnboardingChecklist({ ...completeInput, userBilling: { billing_access: { status: "inactive" } }, walletBalance: 0 });
  const six = buildClientOnboardingChecklist(completeInput);
  assert.deepEqual([none.progressPercent, one.progressPercent, five.progressPercent, six.progressPercent], [0, 17, 83, 100]);
});

test("connection and configuration completion use persisted selected-instance signals", () => {
  const disconnected = buildClientOnboardingChecklist({ ...completeInput, selectedBot: { ...completeInput.selectedBot, is_active: 0 }, status: "disconnected" });
  const weakBasics = buildClientOnboardingChecklist({ ...completeInput, systemPrompt: "Too short", botName: "" });
  const emptyDetails = buildClientOnboardingChecklist({ ...completeInput, customFields: [] });
  const invalidDetails = buildClientOnboardingChecklist({ ...completeInput, customFields: [{ name: "", instructions: "" }] });
  assert.equal(disconnected.coreItems[0].completed, false);
  assert.equal(weakBasics.coreItems[1].completed, false);
  assert.equal(emptyDetails.coreItems[3].completed, false);
  assert.equal(invalidDetails.coreItems[3].completed, false);
});

test("an explicit saved Customer Details marker completes without custom fields", () => {
  const savedDefaults = buildClientOnboardingChecklist({
    ...completeInput,
    customerDetailsConfigured: true,
    customFields: [],
  });
  const notSaved = buildClientOnboardingChecklist({
    ...completeInput,
    customerDetailsConfigured: false,
    customFields: [],
  });
  assert.equal(savedDefaults.coreItems[3].completed, true);
  assert.equal(notSaved.coreItems[3].completed, false);
});

test("legacy valid persisted fields complete Customer Details but blank fields do not", () => {
  const legacyValid = buildClientOnboardingChecklist(completeInput);
  const legacyBlank = buildClientOnboardingChecklist({
    ...completeInput,
    customFields: [{ name: "", instructions: "" }],
  });
  assert.equal(legacyValid.coreItems[3].completed, true);
  assert.equal(legacyBlank.coreItems[3].completed, false);
});

test("saved Customer Details remains complete after optional custom fields are removed", () => {
  const checklist = buildClientOnboardingChecklist({
    ...completeInput,
    customerDetailsConfigured: true,
    customFields: [],
  });
  assert.equal(checklist.coreItems[3].completed, true);
  assert.equal(checklist.launchReady, true);
});

test("products require at least one valid product or service", () => {
  assert.equal(buildClientOnboardingChecklist({ ...completeInput, products: [] }).coreItems[2].completed, false);
  assert.equal(buildClientOnboardingChecklist({ ...completeInput, products: [{}] }).coreItems[2].completed, false);
  assert.equal(buildClientOnboardingChecklist(completeInput).coreItems[2].completed, true);
});

test("test step uses persisted activity for the selected instance", () => {
  const noActivity = buildClientOnboardingChecklist({ ...completeInput, selectedBot: { ...completeInput.selectedBot, last_inbound_at: undefined } });
  const fallbackActivity = buildClientOnboardingChecklist({
    ...completeInput,
    selectedBot: { ...completeInput.selectedBot, last_inbound_at: undefined, config_settings: JSON.stringify({ __instanceActivity: { last_message_at: 200 } }) },
  });
  assert.equal(noActivity.coreItems[4].completed, false);
  assert.equal(fallbackActivity.coreItems[4].completed, true);
});

test("switching selected instances recalculates progress and AI status", () => {
  const first = buildClientOnboardingChecklist(completeInput);
  const second = buildClientOnboardingChecklist({
    ...completeInput,
    selectedBot: { id: "bot_b", name: "Support", jid: "", is_active: 0 },
    status: "disconnected",
    systemPrompt: "",
    botName: "",
    customFields: [],
    customerDetailsConfigured: false,
    aiRepliesEnabled: false,
  });
  assert.equal(first.progressPercent, 100);
  assert.equal(first.aiRepliesEnabled, true);
  assert.equal(second.progressPercent < first.progressPercent, true);
  assert.equal(second.aiRepliesEnabled, false);
  assert.equal(second.selectedInstanceLabel, "Support");
});

test("go live requires steps one through five plus access, while AI Replies remains separate", () => {
  const missingAccess = buildClientOnboardingChecklist({ ...completeInput, userBilling: { billing_access: { status: "inactive" } }, walletBalance: 0 });
  const trial = buildClientOnboardingChecklist({ ...completeInput, userBilling: { billing_access: { status: "trial" } } });
  const aiOff = buildClientOnboardingChecklist({ ...completeInput, aiRepliesEnabled: false });
  assert.equal(missingAccess.coreItems[5].completed, false);
  assert.equal(missingAccess.coreItems[5].cta, "wallet");
  assert.equal(trial.coreItems[5].completed, true);
  assert.equal(aiOff.launchReady, true);
  assert.equal(aiOff.coreItems[5].completed, true);
  assert.equal(aiOff.coreItems[5].cta, "configure_ai");
});

test("onboarding CTAs use existing dashboard destinations", () => {
  assert.deepEqual(getOnboardingCtaTarget("configure_ai"), { view: "ai", aiTab: "instructions" });
  assert.deepEqual(getOnboardingCtaTarget("customer_details"), { view: "ai", aiTab: "fields" });
  assert.deepEqual(getOnboardingCtaTarget("add_product"), { view: "products" });
  assert.deepEqual(getOnboardingCtaTarget("test_message"), { view: "dashboard" });
  assert.deepEqual(getOnboardingCtaTarget("wallet"), { view: "billing", billingTab: "overview" });
});
