import { HOME_FAQS, HOME_SOLUTIONS, HOME_WORKFLOW, HOME_USE_CASES, PRICING_PLANS } from "@/lib/marketing-content";

export const PREVIEW_PRIMARY_CTA = "Start free trial";

export const PREVIEW_PROOF_POINTS = [
  "AI replies for real WhatsApp workflows",
  "Order capture and customer details",
  "Wallet visibility and handoff control",
];

export const PREVIEW_BENEFITS = [
  {
    title: "Faster first replies",
    body: "Answer common product, delivery, and order questions without leaving buyers waiting during busy hours.",
  },
  {
    title: "Cleaner order capture",
    body: "Store the customer details that matter instead of re-reading long threads after the fact.",
  },
  {
    title: "Safer team control",
    body: "Pause automation, keep wallet usage visible, and hand complex conversations to a human when judgment matters.",
  },
];

export const PREVIEW_GUARDRAILS = [
  "Human handoff for sensitive pricing, complaints, or unusual requests",
  "Wallet visibility so usage stays understandable before scale increases",
  "Reply modes that support text-first, voice-first, or preference-based workflows",
  "Public positioning that avoids unsupported claims and keeps the buyer story credible",
];

export const PREVIEW_PRICING_TEASER = PRICING_PLANS.map((plan) => ({
  name: plan.name,
  price: plan.price,
  description: plan.description,
  badge: plan.badge,
}));

export const PREVIEW_FAQS = HOME_FAQS.slice(0, 4);
export const PREVIEW_USE_CASES = HOME_USE_CASES;
export const PREVIEW_WORKFLOW = HOME_WORKFLOW;
export const PREVIEW_SOLUTIONS = HOME_SOLUTIONS;
