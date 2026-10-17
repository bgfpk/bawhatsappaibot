import test from "node:test";
import assert from "node:assert/strict";

import {
  AI_USAGE_EXAMPLES,
  AI_USAGE_RATES,
  AUTOMATION_USAGE_EXAMPLES,
  BETA_PLAN_DISCOUNT_ENDS_AT,
  BETA_PLAN_DISCOUNT_ENDS_LABEL,
  BETA_PLAN_DISCOUNT_LABEL,
  BETA_PLAN_DISCOUNT_PERCENT,
  FOUNDING_YEARLY_DISCOUNT_LABEL,
  buildCustomerAiUsageActions,
  describeUsageAnalyticsType,
  getPlanDisplayPricing,
  getRegularMonthlyPlanPrice,
  getUsageAnalyticsBucket,
  getUsageBillingDefinition,
} from "./pricing.ts";
import { getRequiredAiReplyCostForPurpose } from "./ai-reply-required-cost.ts";

test("Text input + text output charges AI text only", () => {
  assert.deepEqual(buildCustomerAiUsageActions({ sendsTextReply: true }), [
    "customer_ai_text_reply",
  ]);
});

test("Voice input + voice output charges audio understanding, AI text, and voice generation", () => {
  assert.deepEqual(buildCustomerAiUsageActions({ hasIncomingAudio: true, sendsVoiceReply: true }), [
    "customer_ai_audio_understanding",
    "customer_ai_text_reply",
    "customer_ai_voice_reply",
  ]);
});

test("Image input + voice output charges image understanding, AI text, and voice generation", () => {
  assert.deepEqual(buildCustomerAiUsageActions({ hasIncomingImage: true, sendsVoiceReply: true }), [
    "customer_ai_image_understanding",
    "customer_ai_text_reply",
    "customer_ai_voice_reply",
  ]);
});

test("No delivered reply means no customer-facing AI billing action", () => {
  assert.deepEqual(buildCustomerAiUsageActions({}), []);
});

test("Helper chat legacy records are hidden from normal analytics buckets", () => {
  assert.equal(getUsageAnalyticsBucket("helper_chat"), "legacy_hidden");
  assert.equal(getUsageAnalyticsBucket("legacy_helper_chat"), "legacy_hidden");
  assert.equal(describeUsageAnalyticsType("helper_chat"), "Legacy helper chat");
});

test("Visible AI usage examples remain the six customer reply examples", () => {
  assert.deepEqual(AI_USAGE_EXAMPLES.map((item) => item.label), [
    "Text to text",
    "Image to text",
    "Voice to text",
    "Text to voice",
    "Voice to voice",
    "Image to voice",
  ]);
});

test("Updated AI usage totals come from shared pricing config", () => {
  assert.equal(AI_USAGE_EXAMPLES.find((item) => item.label === "Text to text")?.total, "$0.003");
  assert.equal(AI_USAGE_EXAMPLES.find((item) => item.label === "Image to text")?.total, "$0.010");
  assert.equal(AI_USAGE_EXAMPLES.find((item) => item.label === "Voice to text")?.total, "$0.013");
  assert.equal(AI_USAGE_EXAMPLES.find((item) => item.label === "Text to voice")?.total, "from $0.023");
  assert.equal(AI_USAGE_EXAMPLES.find((item) => item.label === "Voice to voice")?.total, "from $0.033");
  assert.equal(AI_USAGE_EXAMPLES.find((item) => item.label === "Image to voice")?.total, "from $0.030");
});

test("New outbound usage categories have the correct shared rates", () => {
  assert.equal(getUsageBillingDefinition("sequence_template_send").priceUsd, 0.0005);
  assert.equal(getUsageBillingDefinition("media_group_file_send").priceUsd, 0.001);
  assert.equal(getUsageBillingDefinition("customer_update_stock_text").priceUsd, 0.003);
  assert.equal(getUsageBillingDefinition("customer_update_scheduled_text").priceUsd, 0.003);
  assert.equal(getUsageBillingDefinition("ai_smart_followup_text").priceUsd, 0.003);
  assert.equal(getUsageBillingDefinition("customer_ai_text_reply").regularPriceUsd, 0.005);
  assert.equal(getUsageBillingDefinition("customer_ai_text_reply").discountAmountUsd, 0.002);
  assert.equal(getUsageBillingDefinition("customer_ai_text_reply").discountPercent, 40);
  assert.equal(getUsageBillingDefinition("broadcast_tracking_text").priceUsd, 0.001);
  assert.equal(getUsageBillingDefinition("client_gemini_message_cycle").priceUsd, 0.001);
  assert.equal(getUsageBillingDefinition("client_gemini_explicit_cache_boost").priceUsd, 0.001);
  assert.equal(getUsageBillingDefinition("agent_mode_rule_action").priceUsd, 0);
  assert.equal(getUsageBillingDefinition("agent_mode_ai_action").priceUsd, 0.003);
  assert.equal(describeUsageAnalyticsType("sequence_template_send"), "Sequence/template send");
  assert.equal(describeUsageAnalyticsType("media_group_file_send"), "Media Group file send");
  assert.equal(describeUsageAnalyticsType("client_gemini_explicit_cache_boost"), "Gemini Cache Boost");
  assert.equal(describeUsageAnalyticsType("agent_mode_rule_action"), "Agent Mode rule action");
  assert.equal(describeUsageAnalyticsType("agent_mode_ai_action"), "Agent Mode AI action");
  assert.equal(getUsageAnalyticsBucket("sequence_template_send"), "sequence");
  assert.equal(getUsageAnalyticsBucket("media_group_file_send"), "media_send");
  assert.equal(getUsageAnalyticsBucket("client_gemini_explicit_cache_boost"), "outbound");
  assert.equal(getUsageAnalyticsBucket("agent_mode_rule_action"), "outbound");
  assert.equal(getUsageAnalyticsBucket("agent_mode_ai_action"), "outbound");
});

test("AI reply eligibility cost defaults to hosted text reply instead of global free actions", () => {
  assert.equal(getUsageBillingDefinition("agent_mode_rule_action").priceUsd, 0);
  assert.equal(getRequiredAiReplyCostForPurpose(), 0.003);
  assert.equal(getRequiredAiReplyCostForPurpose({ purpose: "ai_smart_followup_generation" }), 0.003);
  assert.equal(getRequiredAiReplyCostForPurpose({ purpose: "wait_check_nudge" }), 0.003);
  assert.equal(getRequiredAiReplyCostForPurpose({ purpose: "customer_ai_image_understanding" }), 0.007);
});

test("Visible wallet rates include automation sends and helper chat stays hidden", () => {
  assert.ok(AI_USAGE_RATES.some((item) => item.label === "Fixed message follow-up text" && item.price === "$0.001 / successful sent message"));
  assert.ok(AI_USAGE_RATES.some((item) => item.label === "AI smart follow-up text" && item.price === "Now $0.003 / successful sent message" && item.regularPrice === "Regular $0.005" && item.savings === "Save $0.002 (40% off)"));
  assert.ok(AI_USAGE_RATES.some((item) => item.label === "Sequence/template send" && item.price === "$0.0005 / sent item"));
  assert.ok(AI_USAGE_RATES.some((item) => item.label === "Media Group file send" && item.price === "$0.001 / file"));
  assert.ok(AI_USAGE_RATES.some((item) => item.label === "Custom Gemini AI cycle" && item.price === "$0.001 / customer message or AI cycle"));
  assert.ok(AI_USAGE_RATES.some((item) => item.label === "Gemini Cache Boost" && item.price === "$0.001 / successful cache use"));
  assert.ok(AI_USAGE_RATES.some((item) => item.label === "Agent Mode rule action" && item.price === "Free / successful rule action"));
  assert.ok(AI_USAGE_RATES.some((item) => item.label === "Agent Mode AI action" && item.price === "Now $0.003 / successful AI action" && item.compactCharge === "Charged $0.003 · regular $0.005 · saved $0.002"));
  assert.ok(!AI_USAGE_RATES.some((item) => item.label.toLowerCase().includes("helper")));
});

test("plan display pricing shows regular monthly price as double the current beta price", () => {
  assert.equal(getRegularMonthlyPlanPrice("starter_plan"), 18);
  assert.equal(getRegularMonthlyPlanPrice("growth_plan"), 58);
  assert.equal(getRegularMonthlyPlanPrice("pro_plan"), 178);
  assert.equal(getPlanDisplayPricing("starter_plan").currentMonthlyPrice, 9);
  assert.equal(getPlanDisplayPricing("growth_plan").currentMonthlyPrice, 29);
  assert.equal(getPlanDisplayPricing("pro_plan").currentMonthlyPrice, 89);
});

test("plan display metadata shows 50 percent beta pricing until 1 Jan 2027", () => {
  const starter = getPlanDisplayPricing("starter_plan");
  assert.equal(BETA_PLAN_DISCOUNT_PERCENT, 50);
  assert.equal(BETA_PLAN_DISCOUNT_ENDS_AT, "2027-01-01");
  assert.equal(starter.betaDiscountEndsLabel, BETA_PLAN_DISCOUNT_ENDS_LABEL);
  assert.match(BETA_PLAN_DISCOUNT_LABEL, /50% off until 1 Jan 2027/i);
  assert.match(starter.betaDiscountExplanation, /Regular pricing starts from 1 Jan 2027/i);
});

test("founding yearly discount copy still mentions 1 Jan 2027", () => {
  assert.match(FOUNDING_YEARLY_DISCOUNT_LABEL, /1 Jan 2027/i);
  assert.match(getPlanDisplayPricing("starter_plan").foundingYearlyCta, /1 Jan 2027/i);
});

test("Smart Sales public billing note does not mention prompt", () => {
  const note = getUsageBillingDefinition("smart_sales_engine_reply").publicNote || "";
  assert.doesNotMatch(note, /prompt/i);
  assert.match(note, /successful AI reply/i);
});

test("Automation usage examples calculate from shared config", () => {
  assert.deepEqual(AUTOMATION_USAGE_EXAMPLES.map((item) => [item.label, item.total]), [
    ["Fixed message follow-up example", "$0.010"],
    ["AI smart follow-up example", "$0.030"],
    ["Sequence/template example", "$0.005"],
    ["Media Group example", "$0.010"],
  ]);
});
