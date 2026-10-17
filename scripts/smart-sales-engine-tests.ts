import assert from "node:assert/strict";
import { getUsageBillingDefinition } from "../src/config/pricing.ts";
import { calculateThirtyDayTrialExtension } from "../src/services/admin-trial-extension-service.ts";
import {
  DEFAULT_SMART_SALES_PROMPT,
  findUnsupportedSmartSalesClaim,
  SMART_SALES_EXTRA_CHARGE_USD,
  SMART_SALES_PROMPT_VERSION,
} from "../src/services/smart-sales-engine-service.ts";
import { buildCustomerBotPromptAssembly } from "../src/services/customer-bot-prompt-service.ts";

const now = 1_800_000_000;

const enabledAssembly = buildCustomerBotPromptAssembly({
  userConfig: { preferredLanguage: "English" },
  businessFlow: "product",
  basePrompt: "Sell honestly.",
  learnedInstructions: "",
  cachedProductContext: "",
  cachedServicesContext: "",
  cachedKnowledgeContext: "",
  cachedMediaTemplates: [],
  cachedKeywordSequences: [],
  instanceCustomFields: [],
  activeCartState: null,
  orderState: null,
  addressValidationState: null,
  voiceContext: "",
  mediaContext: "",
  syncGroupPrompt: "",
  effectiveChatSummary: "",
  customerProfile: null,
  lastUserMsgText: "Need a cover",
  recentConversationText: "",
  aiMessagesCount: 1,
  smartSalesPromptText: DEFAULT_SMART_SALES_PROMPT,
  smartSalesPromptVersion: SMART_SALES_PROMPT_VERSION,
});

assert.match(enabledAssembly.stablePrefix, /STABLE SMART SALES ENGINE/);
assert.match(enabledAssembly.stablePrefix, /smart human sales assistant/i);

const disabledAssembly = buildCustomerBotPromptAssembly({
  userConfig: { preferredLanguage: "English" },
  businessFlow: "product",
  basePrompt: "Sell honestly.",
  learnedInstructions: "",
  cachedProductContext: "",
  cachedServicesContext: "",
  cachedKnowledgeContext: "",
  cachedMediaTemplates: [],
  cachedKeywordSequences: [],
  instanceCustomFields: [],
  activeCartState: null,
  orderState: null,
  addressValidationState: null,
  voiceContext: "",
  mediaContext: "",
  syncGroupPrompt: "",
  effectiveChatSummary: "",
  customerProfile: null,
  lastUserMsgText: "Need a cover",
  recentConversationText: "",
  aiMessagesCount: 1,
});

assert.doesNotMatch(disabledAssembly.stablePrefix, /STABLE SMART SALES ENGINE/);
assert.equal(getUsageBillingDefinition("smart_sales_engine_reply")?.priceUsd, SMART_SALES_EXTRA_CHARGE_USD);
assert.equal(findUnsupportedSmartSalesClaim("This has guaranteed results.", "We sell standard covers."), "guaranteed");
assert.equal(findUnsupportedSmartSalesClaim("This has warranty.", "Warranty is one year."), "");
assert.equal(calculateThirtyDayTrialExtension(0, now), now + 30 * 24 * 60 * 60);
assert.equal(
  calculateThirtyDayTrialExtension(now + 60 * 24 * 60 * 60, now),
  now + 60 * 24 * 60 * 60,
);

console.log("Smart Sales Engine tests passed");
