export type BillingPlanId = "starter_plan" | "growth_plan" | "pro_plan";
export type BillingCycle = "monthly" | "annual";
export type BillableUsageAction =
  | "customer_ai_text_reply"
  | "customer_ai_extra_call"
  | "customer_ai_image_understanding"
  | "customer_ai_audio_understanding"
  | "customer_ai_voice_reply"
  | "smart_sales_engine_reply"
  | "ai_smart_followup_text"
  | "sequence_template_send"
  | "media_group_file_send"
  | "helper_chat_reply"
  | "marketing_auto_bot_text"
  | "customer_update_stock_text"
  | "customer_update_scheduled_text"
  | "broadcast_tracking_text"
  | "client_gemini_message_cycle"
  | "client_gemini_explicit_cache_boost"
  | "customer_profile_intelligence_scan"
  | "agent_mode_rule_action"
  | "agent_mode_ai_action"
  | "crm_agent_mode_action"
  | "admin_business_assistant_message"
  | "business_assistant_ai_call"
  | "personal_assistant_ai_call";

export type UsageAnalyticsCategory = "text" | "voice" | "image" | "audio" | "sequence" | "media_send" | "outbound" | "legacy_hidden";

export type UsageBillingDefinition = {
  analyticsType: string;
  category: UsageAnalyticsCategory;
  label: string;
  priceUsd: number;
  regularPriceUsd?: number;
  discountLabel?: string;
  discountPercent?: number;
  discountAmountUsd?: number;
  unitLabel: string;
  publicRateLabel?: string;
  publicNote?: string;
};

export const BILLING_PLAN_IDS: BillingPlanId[] = ["starter_plan", "growth_plan", "pro_plan"];

export const BILLING_PLAN_DETAILS = {
  starter_plan: {
    id: "starter_plan" as const,
    key: "starter",
    name: "Starter",
    monthlyPrice: 9,
    annualFounding: { normal: 108, exact: 64.8, display: 65, effectiveMonthly: 5.4 },
    included_instances: 1,
    max_instances: 2,
    included_products: 5,
    max_products: 30,
    customers: 1000,
    ordersPerMonth: 300,
    mediaTemplates: 100,
    mediaGroups: 2,
    sequenceGroups: 3,
    support: "Standard support",
    popular: false,
    highlights: ["1 WhatsApp instance", "5 products/services", "1,000 customers", "Standard support"]
  },
  growth_plan: {
    id: "growth_plan" as const,
    key: "growth",
    name: "Growth",
    monthlyPrice: 29,
    annualFounding: { normal: 348, exact: 208.8, display: 209, effectiveMonthly: 17.4 },
    included_instances: 3,
    max_instances: 7,
    included_products: 30,
    max_products: 150,
    customers: 10000,
    ordersPerMonth: 2000,
    mediaTemplates: 500,
    mediaGroups: 5,
    sequenceGroups: 10,
    support: "Priority support",
    popular: true,
    highlights: ["3 WhatsApp instances", "30 products/services", "10,000 customers", "Courier integration where available"]
  },
  pro_plan: {
    id: "pro_plan" as const,
    key: "pro",
    name: "Pro",
    monthlyPrice: 89,
    annualFounding: { normal: 1068, exact: 640.8, display: 641, effectiveMonthly: 53.4 },
    included_instances: 10,
    max_instances: 30,
    included_products: 100,
    max_products: 500,
    customers: 50000,
    ordersPerMonth: 10000,
    mediaTemplates: 2000,
    mediaGroups: 15,
    sequenceGroups: 30,
    support: "Priority support",
    popular: false,
    highlights: ["10 WhatsApp instances", "100 products/services", "50,000 customers", "Higher usage capacity"]
  }
};

export const USAGE_BILLING = {
  customer_ai_text_reply: {
    analyticsType: "text_reply",
    category: "text",
    label: "AI text response",
    priceUsd: 0.003,
    regularPriceUsd: 0.005,
    discountLabel: "Limited-time AI text discount",
    discountPercent: 40,
    discountAmountUsd: 0.002,
    unitLabel: "reply",
    publicRateLabel: "Now $0.003 / successful text reply",
    publicNote: "Charged only after a successful AI text reply/message."
  },
  customer_ai_extra_call: {
    analyticsType: "customer_ai_extra_call",
    category: "text",
    label: "Customer AI extra call",
    priceUsd: 0.001,
    unitLabel: "extra call",
    publicRateLabel: "$0.001 / extra AI call",
    publicNote: "Charged for additional successful qualifying AI provider invocations during a customer reply turn."
  },
  customer_ai_image_understanding: {
    analyticsType: "image_understanding",
    category: "image",
    label: "Image understanding",
    priceUsd: 0.007,
    unitLabel: "image",
    publicRateLabel: "$0.007 / image"
  },
  customer_ai_audio_understanding: {
    analyticsType: "audio_understanding",
    category: "audio",
    label: "Voice message understanding",
    priceUsd: 0.01,
    unitLabel: "voice note",
    publicRateLabel: "$0.010 / voice note"
  },
  customer_ai_voice_reply: {
    analyticsType: "voice_reply_generation",
    category: "voice",
    label: "Voice reply generation",
    priceUsd: 0.02,
    unitLabel: "reply",
    publicRateLabel: "from $0.020 / reply"
  },
  smart_sales_engine_reply: {
    analyticsType: "smart_sales_engine_reply",
    category: "text",
    label: "Smart Sales Engine",
    priceUsd: 0.001,
    unitLabel: "successful AI reply",
    publicRateLabel: "$0.001 / successful AI reply",
    publicNote: "Charged only when Smart Sales Engine was enabled for a successful AI reply."
  },
  ai_smart_followup_text: {
    analyticsType: "ai_smart_followup_text",
    category: "outbound",
    label: "AI smart follow-up text",
    priceUsd: 0.003,
    regularPriceUsd: 0.005,
    discountLabel: "Limited-time AI text discount",
    discountPercent: 40,
    discountAmountUsd: 0.002,
    unitLabel: "message",
    publicRateLabel: "Now $0.003 / successful sent message",
    publicNote: "Charged only after successful WhatsApp send/receipt."
  },
  sequence_template_send: {
    analyticsType: "sequence_template_send",
    category: "sequence",
    label: "Sequence/template send",
    priceUsd: 0.0005,
    unitLabel: "sent item",
    publicRateLabel: "$0.0005 / sent item",
    publicNote: "Charged only after successful WhatsApp send/receipt."
  },
  media_group_file_send: {
    analyticsType: "media_group_file_send",
    category: "media_send",
    label: "Media Group file send",
    priceUsd: 0.001,
    unitLabel: "file",
    publicRateLabel: "$0.001 / file",
    publicNote: "Charged only after successful WhatsApp send/receipt."
  },
  helper_chat_reply: {
    analyticsType: "legacy_helper_chat",
    category: "legacy_hidden",
    label: "Legacy helper chat",
    priceUsd: 0.004,
    unitLabel: "reply",
  },
  marketing_auto_bot_text: {
    analyticsType: "marketing_auto_bot_text",
    category: "outbound",
    label: "Fixed message follow-up text",
    priceUsd: 0.001,
    unitLabel: "message",
    publicRateLabel: "$0.001 / successful sent message",
    publicNote: "Charged only after successful WhatsApp send/receipt."
  },
  customer_update_stock_text: {
    analyticsType: "customer_update_stock_text",
    category: "outbound",
    label: "Customer stock update text",
    priceUsd: 0.003,
    regularPriceUsd: 0.005,
    discountLabel: "Limited-time AI text discount",
    discountPercent: 40,
    discountAmountUsd: 0.002,
    unitLabel: "message",
    publicRateLabel: "Now $0.003 / successful sent message",
    publicNote: "Charged only after successful WhatsApp send/receipt."
  },
  customer_update_scheduled_text: {
    analyticsType: "customer_update_scheduled_text",
    category: "outbound",
    label: "Customer scheduled update text",
    priceUsd: 0.003,
    regularPriceUsd: 0.005,
    discountLabel: "Limited-time AI text discount",
    discountPercent: 40,
    discountAmountUsd: 0.002,
    unitLabel: "message",
    publicRateLabel: "Now $0.003 / successful sent message",
    publicNote: "Charged only after successful WhatsApp send/receipt."
  },
  broadcast_tracking_text: {
    analyticsType: "broadcast_tracking_text",
    category: "outbound",
    label: "Broadcast text",
    priceUsd: 0.001,
    unitLabel: "message",
    publicRateLabel: "$0.001 / successful sent message",
    publicNote: "Charged only after successful WhatsApp send/receipt."
  },
  client_gemini_message_cycle: {
    analyticsType: "client_gemini_message_cycle",
    category: "outbound",
    label: "Custom Gemini AI cycle",
    priceUsd: 0.001,
    unitLabel: "cycle",
    publicRateLabel: "$0.001 / customer message or AI cycle",
    publicNote: "Charged once per successful customer message or automation AI cycle through your own active Gemini key, even when the cycle uses multiple internal Gemini calls."
  },
  client_gemini_explicit_cache_boost: {
    analyticsType: "client_gemini_explicit_cache_boost",
    category: "outbound",
    label: "Gemini Cache Boost",
    priceUsd: 0.001,
    unitLabel: "cache use",
    publicRateLabel: "$0.001 / successful cache use",
    publicNote: "Optional premium cache feature for Gemini. Charged only when enabled and explicit cache is successfully used."
  },
  customer_profile_intelligence_scan: {
    analyticsType: "customer_profile_intelligence_scan",
    category: "outbound",
    label: "Customer Intelligence Scan",
    priceUsd: 0.001,
    unitLabel: "successful scan",
    publicRateLabel: "$0.001 / successful new/refreshed customer profile scan",
    publicNote: "Optional scan of visible WhatsApp business profile/catalog data. Charged only after useful data is saved."
  },
  agent_mode_rule_action: {
    analyticsType: "agent_mode_rule_action",
    category: "outbound",
    label: "Agent Mode rule action",
    priceUsd: 0,
    unitLabel: "successful rule action",
    publicRateLabel: "Free / successful rule action",
    publicNote: "Free rule-based CRM automation. Skipped, duplicate, failed, unsafe, disabled, and no-op actions are not charged."
  },
  agent_mode_ai_action: {
    analyticsType: "agent_mode_ai_action",
    category: "outbound",
    label: "Agent Mode AI action",
    priceUsd: 0.003,
    regularPriceUsd: 0.005,
    discountLabel: "Limited-time AI text discount",
    discountPercent: 40,
    discountAmountUsd: 0.002,
    unitLabel: "successful AI action",
    publicRateLabel: "Now $0.003 / successful AI action",
    publicNote: "Charged only after Agent Mode successfully applies an AI-involved CRM action. Skipped, duplicate, failed, unsafe, disabled, and no-op actions are not charged."
  },
  crm_agent_mode_action: {
    analyticsType: "crm_agent_mode_action",
    category: "outbound",
    label: "CRM Agent Mode action (legacy)",
    priceUsd: 0.003,
    regularPriceUsd: 0.005,
    discountLabel: "Limited-time AI text discount",
    discountPercent: 40,
    discountAmountUsd: 0.002,
    unitLabel: "successful action",
    publicRateLabel: "Now $0.003 / successful legacy CRM action",
    publicNote: "Legacy Agent Mode category retained for old usage records. New actions use Agent Mode rule action or Agent Mode AI action."
  },
  admin_business_assistant_message: {
    analyticsType: "admin_business_assistant_message",
    category: "outbound",
    label: "Business Assistant AI call",
    priceUsd: 0.003,
    unitLabel: "AI call",
    publicRateLabel: "$0.003 / AI call",
    publicNote: "Charged per successful Business Assistant AI provider call."
  },
  business_assistant_ai_call: {
    analyticsType: "business_assistant_ai_call",
    category: "outbound",
    label: "Business Assistant AI call",
    priceUsd: 0.003,
    unitLabel: "AI call",
    publicRateLabel: "$0.003 / AI call",
    publicNote: "Charged per successful Business Assistant AI provider call."
  },
  personal_assistant_ai_call: {
    analyticsType: "personal_assistant_ai_call",
    category: "outbound",
    label: "Personal Assistant AI call",
    priceUsd: 0.003,
    unitLabel: "AI call",
    publicRateLabel: "$0.003 / AI call",
    publicNote: "Charged per successful Personal Assistant AI provider call."
  }
} satisfies Record<BillableUsageAction, UsageBillingDefinition>;

export const MINIMUM_BILLABLE_USAGE_COST_USD = Math.min(
  ...Object.values(USAGE_BILLING).map((item) => item.priceUsd)
);

export type AiUsageRateCard = {
  label: string;
  badge?: string;
  price: string;
  regularPrice?: string;
  savings?: string;
  compactCharge?: string;
  note?: string;
};

export const BETA_PLAN_DISCOUNT_PERCENT = 50;
export const BETA_PLAN_DISCOUNT_ENDS_AT = "2027-01-01";
export const BETA_PLAN_DISCOUNT_ENDS_LABEL = "1 Jan 2027";
export const BETA_PLAN_DISCOUNT_LABEL = `Beta launch offer: ${BETA_PLAN_DISCOUNT_PERCENT}% off until ${BETA_PLAN_DISCOUNT_ENDS_LABEL}`;
export const BETA_PLAN_DISCOUNT_EXPLANATION = `Current prices are discounted while BlackArrow is in beta. Regular pricing starts from ${BETA_PLAN_DISCOUNT_ENDS_LABEL}.`;
export const FOUNDING_YEARLY_DISCOUNT_LABEL = `Founding yearly discount available until ${BETA_PLAN_DISCOUNT_ENDS_LABEL}.`;
export const FOUNDING_YEARLY_DISCOUNT_CTA = `Lock this discounted yearly rate before ${BETA_PLAN_DISCOUNT_ENDS_LABEL}.`;

export function getRegularMonthlyPlanPrice(planId: BillingPlanId) {
  const monthlyPrice = Number(BILLING_PLAN_DETAILS[planId]?.monthlyPrice || 0);
  return Number((monthlyPrice * 2).toFixed(2));
}

export function getPlanDisplayPricing(planId: BillingPlanId) {
  const plan = BILLING_PLAN_DETAILS[planId];
  const currentMonthlyPrice = Number(plan?.monthlyPrice || 0);
  const regularMonthlyPrice = getRegularMonthlyPlanPrice(planId);
  return {
    currentMonthlyPrice,
    regularMonthlyPrice,
    betaDiscountPercent: BETA_PLAN_DISCOUNT_PERCENT,
    betaDiscountLabel: BETA_PLAN_DISCOUNT_LABEL,
    betaDiscountExplanation: BETA_PLAN_DISCOUNT_EXPLANATION,
    betaDiscountEndsAt: BETA_PLAN_DISCOUNT_ENDS_AT,
    betaDiscountEndsLabel: BETA_PLAN_DISCOUNT_ENDS_LABEL,
    foundingYearlyLabel: FOUNDING_YEARLY_DISCOUNT_LABEL,
    foundingYearlyCta: FOUNDING_YEARLY_DISCOUNT_CTA,
  };
}

export const PUBLIC_AI_USAGE_RATE_ACTIONS = [
  "customer_ai_text_reply",
  "smart_sales_engine_reply",
  "customer_ai_image_understanding",
  "customer_ai_audio_understanding",
  "customer_ai_voice_reply",
  "marketing_auto_bot_text",
  "ai_smart_followup_text",
  "customer_update_stock_text",
  "customer_update_scheduled_text",
  "broadcast_tracking_text",
  "sequence_template_send",
  "media_group_file_send",
  "client_gemini_message_cycle",
  "client_gemini_explicit_cache_boost",
  "customer_profile_intelligence_scan",
  "agent_mode_rule_action",
  "agent_mode_ai_action",
] as const satisfies BillableUsageAction[];

export const AI_USAGE_RATES = PUBLIC_AI_USAGE_RATE_ACTIONS.map((action) => {
  const definition = getUsageBillingDefinition(action);
  const regularPriceUsd = Number(definition.regularPriceUsd || 0);
  const discountAmountUsd = Number(definition.discountAmountUsd || Math.max(0, regularPriceUsd - Number(definition.priceUsd || 0)));
  const hasDiscount = regularPriceUsd > Number(definition.priceUsd || 0) && discountAmountUsd > 0;
  return {
    label: definition.label,
    badge: hasDiscount ? (definition.discountLabel || "Limited-time offer") : undefined,
    price: hasDiscount
      ? (definition.publicRateLabel || `Now $${definition.priceUsd.toFixed(3)} / ${definition.unitLabel}`)
      : definition.publicRateLabel || `$${definition.priceUsd.toFixed(3)} / ${definition.unitLabel}`,
    regularPrice: hasDiscount ? `Regular $${regularPriceUsd.toFixed(3)}` : undefined,
    savings: hasDiscount
      ? `Save $${discountAmountUsd.toFixed(3)} (${Number(definition.discountPercent || 0)}% off)`
      : undefined,
    compactCharge: hasDiscount
      ? `Charged $${definition.priceUsd.toFixed(3)} · regular $${regularPriceUsd.toFixed(3)} · saved $${discountAmountUsd.toFixed(3)}`
      : undefined,
    note: definition.publicNote,
  };
}) as AiUsageRateCard[];

type AiUsageExampleDefinition = {
  label: string;
  actions: readonly BillableUsageAction[];
};

type AiUsageExampleLine = {
  action: BillableUsageAction;
  label: string;
  price: string;
};

export type AiUsageExampleCard = {
  label: string;
  lines: AiUsageExampleLine[];
  total: string;
};

const AI_USAGE_EXAMPLE_DEFINITIONS: AiUsageExampleDefinition[] = [
  { label: "Text to text", actions: ["customer_ai_text_reply"] },
  { label: "Image to text", actions: ["customer_ai_image_understanding", "customer_ai_text_reply"] },
  { label: "Voice to text", actions: ["customer_ai_audio_understanding", "customer_ai_text_reply"] },
  { label: "Text to voice", actions: ["customer_ai_text_reply", "customer_ai_voice_reply"] },
  { label: "Voice to voice", actions: ["customer_ai_audio_understanding", "customer_ai_text_reply", "customer_ai_voice_reply"] },
  { label: "Image to voice", actions: ["customer_ai_image_understanding", "customer_ai_text_reply", "customer_ai_voice_reply"] },
];

const AUTOMATION_USAGE_EXAMPLE_DEFINITIONS: AiUsageExampleDefinition[] = [
  { label: "Fixed message follow-up example", actions: ["marketing_auto_bot_text"] },
  { label: "AI smart follow-up example", actions: ["ai_smart_followup_text"] },
  { label: "Sequence/template example", actions: ["sequence_template_send"] },
  { label: "Media Group example", actions: ["media_group_file_send"] },
];

function formatUsageUsd(amount: number) {
  return `$${amount.toFixed(3)}`;
}

function getUsagePriceDisplayForExample(action: BillableUsageAction) {
  const definition = getUsageBillingDefinition(action);
  const rateLabel = definition.publicRateLabel || formatUsageUsd(definition.priceUsd);
  const firstUnitSeparator = rateLabel.indexOf(" / ");
  return firstUnitSeparator > 0 ? rateLabel.slice(0, firstUnitSeparator) : rateLabel;
}

export function buildAiUsageExampleCards() {
  return AI_USAGE_EXAMPLE_DEFINITIONS.map((example): AiUsageExampleCard => {
    const lines = example.actions.map((action) => ({
      action,
      label: getUsageBillingDefinition(action).label,
      price: getUsagePriceDisplayForExample(action),
    }));
    const totalValue = Number(example.actions.reduce((sum, action) => {
      return sum + getUsageBillingDefinition(action).priceUsd;
    }, 0).toFixed(3));
    const hasFromRate = lines.some((line) => line.price.toLowerCase().startsWith("from "));
    return {
      label: example.label,
      lines,
      total: `${hasFromRate ? "from " : ""}${formatUsageUsd(totalValue)}`,
    };
  });
}

export const AI_USAGE_EXAMPLES = buildAiUsageExampleCards();

export type UsageQuantityExampleCard = {
  label: string;
  detail: string;
  total: string;
};

function buildQuantityExampleCard(action: BillableUsageAction, quantity: number, label: string, detail: string): UsageQuantityExampleCard {
  const definition = getUsageBillingDefinition(action);
  const totalValue = Number((definition.priceUsd * quantity).toFixed(6));
  return {
    label,
    detail,
    total: formatUsageUsd(totalValue),
  };
}

export const AUTOMATION_USAGE_EXAMPLES: UsageQuantityExampleCard[] = [
  buildQuantityExampleCard("marketing_auto_bot_text", 10, "Fixed message follow-up example", "10 successful fixed follow-up sends"),
  buildQuantityExampleCard("ai_smart_followup_text", 10, "AI smart follow-up example", "10 successful AI smart follow-up sends"),
  buildQuantityExampleCard("sequence_template_send", 10, "Sequence/template example", "10 sequence items sent"),
  buildQuantityExampleCard("media_group_file_send", 10, "Media Group example", "10 media files sent"),
];

export type CustomerAiUsageScenarioInput = {
  hasIncomingImage?: boolean;
  hasIncomingAudio?: boolean;
  sendsTextReply?: boolean;
  sendsVoiceReply?: boolean;
};

export const ACCOUNT_USAGE_GUARDRAILS = {
  dailySpendUsd: 25,
  monthlySpendUsd: 400,
  voiceRepliesPerCustomerPerDay: 6,
  maxAiRetriesPerMessage: 1
};

export function getUsageBillingDefinition(action: BillableUsageAction): UsageBillingDefinition {
  return USAGE_BILLING[action];
}

export function buildCustomerAiUsageActions(input: CustomerAiUsageScenarioInput): BillableUsageAction[] {
  const actions: BillableUsageAction[] = [];
  const sendsAnyReply = Boolean(input.sendsTextReply || input.sendsVoiceReply);
  if (!sendsAnyReply) return actions;
  if (input.hasIncomingImage) actions.push("customer_ai_image_understanding");
  if (input.hasIncomingAudio) actions.push("customer_ai_audio_understanding");
  actions.push("customer_ai_text_reply");
  if (input.sendsVoiceReply) actions.push("customer_ai_voice_reply");
  return actions;
}

export function describeUsageAnalyticsType(type: any) {
  const value = String(type || "").toLowerCase();
  if (value.includes("legacy_helper_chat") || value === "helper_chat") return "Legacy helper chat";
  if (value.includes("business_assistant") || value.includes("admin_business_assistant")) return "Business Assistant AI call";
  if (value.includes("personal_assistant")) return "Personal Assistant AI call";
  if (value.includes("marketing_auto_bot")) return "Marketing auto-bot text";
  if (value.includes("customer_update_stock")) return "Customer stock update text";
  if (value.includes("customer_update_scheduled")) return "Customer scheduled update text";
  if (value.includes("broadcast")) return "Broadcast text";
  if (value.includes("client_gemini_explicit_cache_boost")) return "Gemini Cache Boost";
  if (value.includes("customer_profile_intelligence_scan")) return "Customer Intelligence Scan";
  if (value.includes("agent_mode_rule_action")) return "Agent Mode rule action";
  if (value.includes("agent_mode_ai_action")) return "Agent Mode AI action";
  if (value.includes("crm_agent_mode_action")) return "CRM Agent Mode action (legacy)";
  if (value.includes("client_gemini_message_cycle") || value.includes("client_gemini_api_request")) return "Custom Gemini AI cycle";
  if (value.includes("smart_sales_engine")) return "Smart Sales Engine";
  if (value.includes("sequence_template_send")) return "Sequence/template send";
  if (value.includes("media_group_file_send")) return "Media Group file send";
  if (value.includes("audio")) return "Voice message understanding";
  if (value.includes("image")) return "Image understanding";
  if (value.includes("voice")) return "Voice reply generation";
  if (value.includes("customer_ai_extra_call")) return "Customer AI extra call";
  return "AI text response";
}

export function getUsageAnalyticsBucket(type: any): UsageAnalyticsCategory {
  const value = String(type || "").toLowerCase();
  if (value.includes("legacy_helper_chat") || value === "helper_chat") return "legacy_hidden";
  if (value.includes("audio")) return "audio";
  if (value.includes("voice")) return "voice";
  if (value.includes("image") || value.includes("vision")) return "image";
  if (value.includes("sequence_template_send")) return "sequence";
  if (value.includes("media_group_file_send")) return "media_send";
  if (value.includes("marketing_auto_bot") || value.includes("customer_update") || value.includes("broadcast") || value.includes("client_gemini_message_cycle") || value.includes("client_gemini_api_request") || value.includes("client_gemini_explicit_cache_boost") || value.includes("customer_profile_intelligence_scan") || value.includes("agent_mode_") || value.includes("crm_agent_mode_action") || value.includes("business_assistant") || value.includes("personal_assistant") || value.includes("admin_business_assistant")) return "outbound";
  return "text";
}

export function normalizePlanId(rawPlanId: any): BillingPlanId | undefined {
  const value = String(rawPlanId || "").trim().toLowerCase();
  if (value === "starter" || value === "starter_plan") return "starter_plan";
  if (value === "growth" || value === "growth_plan") return "growth_plan";
  if (value === "pro" || value === "pro_plan") return "pro_plan";
  return undefined;
}

export function getPlanMonthlyPriceUsd(planId: string): number | undefined {
  const normalized = normalizePlanId(planId);
  if (!normalized) return undefined;
  const price = BILLING_PLAN_DETAILS[normalized]?.monthlyPrice;
  return typeof price === "number" && price > 0 ? price : undefined;
}

export const BILLING_ADDONS = [
  { id: "extra_instance", name: "Extra WhatsApp instance", price: "$10/mo each", monthlyPriceUsd: 10, quantityLabel: "instance" },
  { id: "extra_30_products", name: "Extra 30 products/services", price: "$7/mo", monthlyPriceUsd: 7, quantityLabel: "bundle" },
  { id: "extra_500_media", name: "Extra 500 media templates", price: "$7/mo", monthlyPriceUsd: 7, quantityLabel: "bundle" },
  { id: "extra_5_sequence_groups", name: "Extra 5 sequence groups", price: "$5/mo", monthlyPriceUsd: 5, quantityLabel: "bundle" },
  { id: "extra_10000_customers", name: "Extra 10,000 customer records", price: "$10/mo", monthlyPriceUsd: 10, quantityLabel: "bundle" },
  { id: "extra_2000_orders", name: "Extra 2,000 orders/month", price: "$10/mo", monthlyPriceUsd: 10, quantityLabel: "bundle" }
] as const;

export function getAddonMonthlyPriceUsd(addonId: string): number | undefined {
  const addon = BILLING_ADDONS.find((item) => item.id === addonId);
  const price = addon?.monthlyPriceUsd;
  return typeof price === "number" && price > 0 ? price : undefined;
}

export const WALLET_TOPUP_AMOUNTS = [5, 10, 25, 50, 100];

export const FULL_SETUP_PRICE = 49;

export interface PlanUpgradeCalculation {
  isUpgrade: boolean;
  currentPlanId?: BillingPlanId;
  targetPlanId: BillingPlanId;
  targetPrice: number;
  currentPlanCredit: number;
  amountDueNow: number;
  remainingSeconds: number;
}

export function calculatePlanUpgradeCost(params: {
  currentPlanId?: string;
  currentPlanExpiry?: number;
  targetPlanId: BillingPlanId;
  billingCycle?: BillingCycle;
  nowTime?: number;
}): PlanUpgradeCalculation {
  const now = params.nowTime || Math.floor(Date.now() / 1000);
  const targetDetails = BILLING_PLAN_DETAILS[params.targetPlanId];
  if (!targetDetails) {
    throw new Error("Invalid target plan selection.");
  }
  const billingCycle = params.billingCycle === "annual" ? "annual" : "monthly";
  const targetPrice = billingCycle === "annual"
    ? Number(targetDetails.annualFounding?.exact || targetDetails.annualFounding?.display || 0)
    : targetDetails.monthlyPrice;

  const currentNormalized = normalizePlanId(params.currentPlanId);
  const currentExpiry = Number(params.currentPlanExpiry || 0);
  const isCurrentActive = currentExpiry > now;
  const currentMonthlyPrice = currentNormalized && isCurrentActive ? (getPlanMonthlyPriceUsd(currentNormalized) || 0) : 0;

  // If user is renewing the same plan or has no active paid plan, no upgrade credit
  if (!currentNormalized || !isCurrentActive || currentMonthlyPrice <= 0 || currentNormalized === params.targetPlanId) {
    return {
      isUpgrade: false,
      currentPlanId: currentNormalized,
      targetPlanId: params.targetPlanId,
      targetPrice,
      currentPlanCredit: 0,
      amountDueNow: targetPrice,
      remainingSeconds: 0,
    };
  }

  // Active plan upgrade:
  const remainingSeconds = Math.max(0, currentExpiry - now);
  const cycleSeconds = 30 * 24 * 60 * 60; // 30 days

  // If upgrade happens within the first 24 hours (same day) of the cycle, provide 100% full credit of the current monthly price.
  // Otherwise, prorate proportionally by remaining seconds.
  let currentPlanCredit = 0;
  if (remainingSeconds >= cycleSeconds - 86400) {
    currentPlanCredit = currentMonthlyPrice;
  } else {
    const ratio = Math.min(1, Math.max(0, remainingSeconds / cycleSeconds));
    currentPlanCredit = Math.round(currentMonthlyPrice * ratio * 100) / 100;
  }
  currentPlanCredit = Math.min(currentPlanCredit, currentMonthlyPrice);

  const amountDueNow = Math.max(0, Math.round((targetPrice - currentPlanCredit) * 100) / 100);

  return {
    isUpgrade: true,
    currentPlanId: currentNormalized,
    targetPlanId: params.targetPlanId,
    targetPrice,
    currentPlanCredit,
    amountDueNow,
    remainingSeconds,
  };
}
