import { BILLING_PLAN_DETAILS } from "./config/pricing.ts";

export interface Log {
  type: 'info' | 'error' | 'ai' | 'wa';
  msg: string;
  timestamp: number;
}

export interface IncomingMessage {
  sender: string;
  senderName: string;
  text: string;
  id: string;
  timestamp: number;
}

export interface ProductPlan {
  id?: string;
  price: number;
  name: string;
  included_instances: number;
  max_instances: number;
  included_products: number;
  max_products: number;
  has_trial?: boolean;
  customers?: number;
  orders_per_month?: number;
  media_templates?: number;
  media_groups?: number;
  sequence_groups?: number;
}

function billingDetailsToProductPlan(plan: typeof BILLING_PLAN_DETAILS[keyof typeof BILLING_PLAN_DETAILS]): ProductPlan {
  return {
    id: plan.id,
    price: plan.monthlyPrice,
    name: plan.name,
    included_instances: plan.included_instances,
    max_instances: plan.max_instances,
    included_products: plan.included_products,
    max_products: plan.max_products,
    customers: plan.customers,
    orders_per_month: plan.ordersPerMonth,
    media_templates: plan.mediaTemplates,
    media_groups: plan.mediaGroups,
    sequence_groups: plan.sequenceGroups,
  };
}

export const PLANS: Record<string, ProductPlan> = {
  starter_plan: billingDetailsToProductPlan(BILLING_PLAN_DETAILS.starter_plan),
  growth_plan: billingDetailsToProductPlan(BILLING_PLAN_DETAILS.growth_plan),
  pro_plan: billingDetailsToProductPlan(BILLING_PLAN_DETAILS.pro_plan)
};
