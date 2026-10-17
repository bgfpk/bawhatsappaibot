import { USAGE_BILLING, getUsageBillingDefinition, type BillableUsageAction } from "./pricing.ts";

type UsageDiscountDetails = {
  chargedPriceUsd: number;
  regularPriceUsd: number;
  discountAmountUsd: number;
  discountPercent: number;
  hasDiscount: boolean;
};

function clean(value: any) {
  return String(value || "").trim().toLowerCase();
}

export function formatUsageUsd(amount: number) {
  return `$${Number(amount || 0).toFixed(3)}`;
}

export function getUsageDiscountDetails(action: BillableUsageAction): UsageDiscountDetails {
  const definition = getUsageBillingDefinition(action);
  const chargedPriceUsd = Number(definition.priceUsd || 0);
  const regularPriceUsd = Number(definition.regularPriceUsd || 0);
  const discountAmountUsd = Number(
    definition.discountAmountUsd ?? (regularPriceUsd > chargedPriceUsd ? regularPriceUsd - chargedPriceUsd : 0)
  );
  const discountPercent = Number(
    definition.discountPercent ?? (regularPriceUsd > 0 && discountAmountUsd > 0
      ? Math.round((discountAmountUsd / regularPriceUsd) * 100)
      : 0)
  );
  return {
    chargedPriceUsd,
    regularPriceUsd,
    discountAmountUsd,
    discountPercent,
    hasDiscount: regularPriceUsd > chargedPriceUsd && discountAmountUsd > 0 && discountPercent > 0,
  };
}

export function buildUsageCurrentPriceLabel(action: BillableUsageAction) {
  const definition = getUsageBillingDefinition(action);
  const details = getUsageDiscountDetails(action);
  if (details.hasDiscount) return `Now ${formatUsageUsd(details.chargedPriceUsd)} / ${definition.unitLabel}`;
  return definition.publicRateLabel || `${formatUsageUsd(details.chargedPriceUsd)} / ${definition.unitLabel}`;
}

export function buildUsageRegularPriceLabel(action: BillableUsageAction) {
  const details = getUsageDiscountDetails(action);
  return details.hasDiscount ? `Regular ${formatUsageUsd(details.regularPriceUsd)}` : "";
}

export function buildUsageSavingsLabel(action: BillableUsageAction) {
  const details = getUsageDiscountDetails(action);
  return details.hasDiscount ? `Save ${formatUsageUsd(details.discountAmountUsd)} (${details.discountPercent}% off)` : "";
}

export function buildUsageCompactChargeLabel(action: BillableUsageAction) {
  const details = getUsageDiscountDetails(action);
  if (!details.hasDiscount) return `Charged ${formatUsageUsd(details.chargedPriceUsd)}`;
  return `Charged ${formatUsageUsd(details.chargedPriceUsd)} · regular ${formatUsageUsd(details.regularPriceUsd)} · saved ${formatUsageUsd(details.discountAmountUsd)}`;
}

export function buildUsageDiscountHeroLabel(action: BillableUsageAction) {
  const definition = getUsageBillingDefinition(action);
  const details = getUsageDiscountDetails(action);
  if (!details.hasDiscount) return definition.publicRateLabel || `${formatUsageUsd(details.chargedPriceUsd)} / ${definition.unitLabel}`;
  return `Regular ${formatUsageUsd(details.regularPriceUsd)} -> Now ${formatUsageUsd(details.chargedPriceUsd)} per ${definition.unitLabel}`;
}

export function buildUsageChargeDescription(input: {
  action: BillableUsageAction;
  amount?: number;
  extraParts?: Array<string | null | undefined>;
}) {
  const definition = getUsageBillingDefinition(input.action);
  const amount = Math.max(1, Number(input.amount || 1));
  const base = `${definition.label} debit (${amount} ${definition.unitLabel}${amount === 1 ? "" : "s"})`;
  const summary = buildUsageCompactChargeLabel(input.action);
  const savings = buildUsageSavingsLabel(input.action);
  const parts = [base, summary, savings, ...(input.extraParts || [])].filter(Boolean);
  return parts.join(" | ");
}

const ACTION_ALIASES = new Map<string, BillableUsageAction>();

for (const [action, definition] of Object.entries(USAGE_BILLING) as [BillableUsageAction, (typeof USAGE_BILLING)[BillableUsageAction]][]) {
  const key = clean(action);
  if (key) ACTION_ALIASES.set(key, action);
  const analyticsType = clean(definition.analyticsType);
  if (analyticsType) ACTION_ALIASES.set(analyticsType, action);
  if (analyticsType) ACTION_ALIASES.set(`ai_${analyticsType}_debit`, action);
  const label = clean(definition.label);
  if (label) ACTION_ALIASES.set(label, action);
}

[
  ["normal ai text reply", "customer_ai_text_reply"],
  ["ai text response", "customer_ai_text_reply"],
  ["ai smart follow-up", "ai_smart_followup_text"],
  ["customer update stock", "customer_update_stock_text"],
  ["customer update scheduled", "customer_update_scheduled_text"],
  ["agent mode ai action", "agent_mode_ai_action"],
  ["crm agent mode action (legacy)", "crm_agent_mode_action"],
  ["business assistant ai", "business_assistant_ai_call"],
  ["admin business assistant", "business_assistant_ai_call"],
  ["personal assistant ai", "personal_assistant_ai_call"],
].forEach(([alias, action]) => {
  ACTION_ALIASES.set(alias, action as BillableUsageAction);
});

export function resolveUsageBillingAction(value: any): BillableUsageAction | null {
  const normalized = clean(value);
  if (!normalized) return null;
  return ACTION_ALIASES.get(normalized) || null;
}
