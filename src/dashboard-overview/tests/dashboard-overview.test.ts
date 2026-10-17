import test from "node:test";
import assert from "node:assert/strict";
import { buildOverviewModel } from "../overview-model";
import { buildClientOnboardingChecklist } from "../../services/client-onboarding-checklist-service";

test("buildOverviewModel: constructs default disconnected state", () => {
  const onboarding = buildClientOnboardingChecklist();
  const model = buildOverviewModel({
    onboardingChecklist: onboarding,
  });

  assert.equal(model.workspaceName, "Workspace");
  assert.equal(model.connectionTone, "neutral");
  assert.equal(model.selectedBotLabel, "No instance selected");
  assert.equal(model.metrics.length, 5);
  assert.ok(model.attentionItems.some((item) => item.id === "no_instance"));
  assert.ok(model.quickActions.length > 0);
  assert.equal(model.userPlanName, "Plan unavailable");
});

test("buildOverviewModel: constructs connected state with attention items", () => {
  const selectedBot = {
    jid: "contact-2f5256f18e8b@example.invalid",
    name: "Customer Support Bot",
    status: "connected",
    is_active: 1,
  };

  const onboarding = buildClientOnboardingChecklist({
    selectedBot,
    status: "connected",
    systemPrompt: "You are a helpful customer support agent for product inquiries.",
    botName: "Support Bot",
    businessType: "product",
    selectedBotLanguage: "English",
    replyBehavior: "text_preferred",
    products: [{ name: "Starter Widget", price: 10 }],
    customFields: [{ name: "City", instructions: "Ask for city" }],
    walletBalance: 15,
  });

  const model = buildOverviewModel({
    currentUser: { name: "Acme Store" },
    selectedBot,
    connectionStatus: "connected",
    isAutoReplyEnabled: true,
    walletBalance: 15,
    customers: [{ id: "c1" }, { id: "c2" }],
    orders: [{ id: "o1" }],
    products: [{ name: "Starter Widget" }],
    onboardingChecklist: onboarding,
  });

  assert.equal(model.workspaceName, "Acme Store");
  assert.equal(model.connectionTone, "teal");
  assert.equal(model.selectedBotLabel, "Customer Support Bot");
  assert.equal(model.isAiRepliesEnabled, true);
  assert.equal(model.walletBalance, 15);
  assert.equal(model.attentionItems.length, 0);
});

test("buildOverviewModel A2: AI unknown state is not shown as Active", () => {
  const onboarding = buildClientOnboardingChecklist();
  const model = buildOverviewModel({
    isAutoReplyEnabled: undefined,
    onboardingChecklist: onboarding,
  });

  const aiMetric = model.metrics.find((m) => m.id === "ai_replies");
  assert.ok(aiMetric);
  assert.equal(aiMetric?.value, "Loading...");
  assert.equal(model.isAiRepliesEnabled, null);
});

test("buildOverviewModel A2: Unloaded metrics are not shown as confirmed zero", () => {
  const onboarding = buildClientOnboardingChecklist();
  const model = buildOverviewModel({
    customers: undefined,
    orders: undefined,
    onboardingChecklist: onboarding,
  });

  const customerMetric = model.metrics.find((m) => m.id === "total_customers");
  const orderMetric = model.metrics.find((m) => m.id === "total_orders");

  assert.equal(customerMetric?.value, "Loading...");
  assert.equal(orderMetric?.value, "Loading...");
});

test("buildOverviewModel A2: Confirmed empty dataset shows 0", () => {
  const onboarding = buildClientOnboardingChecklist();
  const model = buildOverviewModel({
    customers: [],
    orders: [],
    onboardingChecklist: onboarding,
  });

  const customerMetric = model.metrics.find((m) => m.id === "total_customers");
  const orderMetric = model.metrics.find((m) => m.id === "total_orders");

  assert.equal(customerMetric?.value, "0");
  assert.equal(orderMetric?.value, "0");
});

test("buildOverviewModel A2: Missing activity timestamp does not produce Date.now()", () => {
  const onboarding = buildClientOnboardingChecklist();
  const model = buildOverviewModel({
    dashboardNotifications: [
      { id: "1", title: "Test Event", message: "Event detail" },
    ],
    onboardingChecklist: onboarding,
  });

  assert.equal(model.recentActivities.length, 1);
  assert.equal(model.recentActivities[0].timestamp, undefined);
});

test("buildOverviewModel A5: Selected instance is not arbitrary first instance when null", () => {
  const onboarding = buildClientOnboardingChecklist();
  const model = buildOverviewModel({
    selectedBot: null,
    onboardingChecklist: onboarding,
  });

  assert.equal(model.selectedBotLabel, "No instance selected");
  assert.ok(model.attentionItems.some((item) => item.id === "no_instance"));
});
