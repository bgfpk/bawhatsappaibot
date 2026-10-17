import { TRIAL_LIMITS, getBaseLimitsForUser, normalizeEpochSeconds } from "../config/billing-access.ts";

export type ActiveAddonQuantities = {
  productBundles: number;
  instances: number;
  mediaTemplateBundles: number;
  sequenceGroupBundles: number;
  customerBundles: number;
  orderBundles: number;
};

const now = () => Math.floor(Date.now() / 1000);

export function addActiveAddonQuantities(subscriptions: any[], currentTime = now()): ActiveAddonQuantities {
  return (subscriptions || []).reduce((acc, sub) => {
    if (normalizeEpochSeconds(sub?.expires_at) <= currentTime) return acc;
    if (sub.type === "product_bundle" || sub.type === "extra_30_products") acc.productBundles += Number(sub.quantity || 0);
    if (sub.type === "instance" || sub.type === "extra_instance") acc.instances += Number(sub.quantity || 0);
    if (sub.type === "extra_500_media") acc.mediaTemplateBundles += Number(sub.quantity || 0);
    if (sub.type === "extra_5_sequence_groups") acc.sequenceGroupBundles += Number(sub.quantity || 0);
    if (sub.type === "extra_10000_customers") acc.customerBundles += Number(sub.quantity || 0);
    if (sub.type === "extra_2000_orders") acc.orderBundles += Number(sub.quantity || 0);
    return acc;
  }, {
    productBundles: 0,
    instances: 0,
    mediaTemplateBundles: 0,
    sequenceGroupBundles: 0,
    customerBundles: 0,
    orderBundles: 0
  } satisfies ActiveAddonQuantities);
}

export function buildAccountLimits(user: any, subscriptions: any[], currentTime = now()) {
  const { planId, plan, access } = getBaseLimitsForUser(user, currentTime);
  if (access.trialActive) {
    return {
      access,
      planId,
      plan,
      addons: addActiveAddonQuantities([], currentTime),
      instanceLimit: TRIAL_LIMITS.included_instances,
      productLimit: TRIAL_LIMITS.included_products,
      customerLimit: TRIAL_LIMITS.customers || 100,
      orderLimit: TRIAL_LIMITS.orders_per_month || 50,
      mediaTemplateLimit: TRIAL_LIMITS.media_templates || 25,
      mediaGroupLimit: TRIAL_LIMITS.media_groups,
      sequenceGroupLimit: TRIAL_LIMITS.sequence_groups
    };
  }

  const addons = addActiveAddonQuantities(subscriptions, currentTime);
  return {
    access,
    planId,
    plan,
    addons,
    instanceLimit: Math.min((plan.included_instances || 0) + addons.instances, plan.max_instances || 0),
    productLimit: Math.min((plan.included_products || 0) + addons.productBundles * 30, plan.max_products || 0),
    customerLimit: (plan.customers || 0) + addons.customerBundles * 10000,
    orderLimit: (plan.orders_per_month || 0) + addons.orderBundles * 2000,
    mediaTemplateLimit: (plan.media_templates || 0) + addons.mediaTemplateBundles * 500,
    mediaGroupLimit: Math.max(0, Number((plan as any).media_groups || 0)),
    sequenceGroupLimit: (plan.sequence_groups || 0) + addons.sequenceGroupBundles * 5
  };
}
