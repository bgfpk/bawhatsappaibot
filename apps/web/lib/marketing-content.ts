import {
  AI_USAGE_EXAMPLES,
  AI_USAGE_RATES,
  BILLING_ADDONS,
  BILLING_PLAN_DETAILS,
  BLOG_CATEGORIES,
  BLOG_POSTS,
  DOCS_PAGES,
  FULL_SETUP_PRICE,
  SEO_LANDING_PAGES,
} from "@/lib/public-content";

export const HOME_TRUST_STRIP = [
  "WhatsApp-first businesses",
  "AI replies",
  "Voice and image understanding",
  "Order capture",
  "Templates and sequences",
  "Human handoff",
];

export const HOME_PROBLEMS = [
  "Missed replies during busy hours",
  "Orders buried in chat history",
  "Repeated product questions",
  "Voice notes and images hard to manage",
  "No clear handoff between AI and team",
];

export const HOME_SOLUTIONS = [
  "Replies from business instructions",
  "Product and service guidance",
  "Order and customer capture",
  "Saved templates and media",
  "Live dashboard and billing visibility",
  "Pause, resume, and human handoff",
];

export const HOME_WORKFLOW = [
  ["Connect WhatsApp", "Scan QR and attach the business number you actually use."],
  ["Train AI", "Add instructions, language direction, and response boundaries."],
  ["Add products and templates", "Store product guidance, media, and reusable sequences."],
  ["Reply and capture orders", "Handle incoming chats while collecting the right details."],
  ["Monitor and hand off", "Pause automation or step in manually when judgment matters."],
] as const;

export const HOME_USE_CASES = [
  "Ecommerce stores",
  "Salons",
  "Clinics",
  "Agencies",
  "Restaurants",
  "Real estate and service businesses",
];

export const HOME_FAQS = [
  {
    question: "Is this official WhatsApp API?",
    answer:
      "Only describe an account as official API based when that setup is explicitly true for that account. BlackArrow does not make unsupported official API claims on the public site.",
  },
  {
    question: "Can it reply to voice notes?",
    answer:
      "Yes. BlackArrow can understand voice notes and teams can choose whether replies stay text-first or use voice where appropriate.",
  },
  {
    question: "Can it send product photos and templates?",
    answer:
      "Yes. Products, media groups, and reusable templates can support faster responses when they are configured in the account.",
  },
  {
    question: "Can I pause the bot?",
    answer:
      "Yes. Teams can pause or resume replies and move a conversation into manual handling when a human should take over.",
  },
  {
    question: "How does billing work?",
    answer:
      "The subscription plan controls account capacity, while wallet balance covers AI usage and paid outgoing automation sends.",
  },
  {
    question: "Can I use it for multiple WhatsApp numbers?",
    answer:
      "Yes, based on the plan capacity and any extra instance add-ons your business chooses.",
  },
];

export const FEATURE_SECTIONS = [
  {
    title: "AI reply engine",
    body: "Use business instructions, language guidance, and controlled reply modes to keep conversations useful instead of generic.",
  },
  {
    title: "Product and service knowledge",
    body: "Support buying questions with catalog details, variants, pricing guidance, and reusable product references.",
  },
  {
    title: "Order and customer capture",
    body: "Turn active chats into structured customer and order records instead of re-reading long threads later.",
  },
  {
    title: "Media, templates, and sequences",
    body: "Organize reusable photos, templates, welcome sequences, and repeatable response flows in one place.",
  },
  {
    title: "Reply modes and voice behavior",
    body: "Choose Always Text, Always Voice, Customer Preference, or Text Preferred based on customer experience and cost control.",
  },
  {
    title: "Pause, resume, and handoff",
    body: "Staff can pause AI replies, take over a conversation, and resume automation where supported.",
  },
  {
    title: "Courier and tracking support",
    body: "Use PostEx and Leopards where supported today, while keeping planned integrations labeled as planned.",
  },
  {
    title: "Billing and wallet visibility",
    body: "Review plan capacity, wallet balance, and AI usage rates without losing sight of operational cost.",
  },
  {
    title: "Admin monitoring",
    body: "Monitor live conversations, captured details, and workflow behavior from a clearer operational view.",
  },
];

export const CONTACT_PROMPTS = [
  "Business type and what you sell or support on WhatsApp",
  "Expected daily message volume and whether voice notes matter",
  "Whether you need order capture, courier support, or customer records",
  "What your team wants AI to handle before human handoff",
];

export const CONTACT_CHANNELS = [
  {
    title: "Support email",
    label: "Official BlackArrow Support",
    body: "Contact BlackArrow support directly at contact-086473cbd844@example.invalid for sales, setup, billing, and technical questions.",
    href: "mailto:contact-086473cbd844@example.invalid",
    action: "contact-086473cbd844@example.invalid",
  },
];

export const LEGAL_PAGE_NOTE =
  "BlackArrow is an independent platform. Public content should not promise unsupported legal, compliance, courier, or platform guarantees.";

export const DOCS_CATEGORY_CARDS = [
  {
    title: "Getting started",
    body: "Account setup, trial planning, and the first workflow decisions before you connect a number.",
  },
  {
    title: "Connection and reply behavior",
    body: "WhatsApp QR connection, session ownership, instructions, language, and reply modes.",
  },
  {
    title: "Commerce workflows",
    body: "Products, customers, orders, templates, media groups, and reusable sequences.",
  },
  {
    title: "Operations and billing",
    body: "Pause and resume controls, courier support, wallet usage, and launch safety.",
  },
];

export const BLOG_CATEGORY_STRIP = BLOG_CATEGORIES;
export const FEATURED_BLOG_POST = BLOG_POSTS.find((post) => post.featured) || BLOG_POSTS[0];
export const OTHER_BLOG_POSTS = BLOG_POSTS.filter((post) => post.slug !== FEATURED_BLOG_POST.slug);

export const PRICING_PLANS = Object.values(BILLING_PLAN_DETAILS).map((plan) => ({
  name: plan.name,
  price: `$${plan.monthlyPrice}/month`,
  badge: plan.popular ? "Recommended for Growing Teams" : undefined,
  description:
    plan.id === "starter_plan"
      ? "For small businesses testing one WhatsApp number."
      : plan.id === "growth_plan"
        ? "For growing teams handling more conversations and orders."
        : "For larger teams needing expanded capacity and control.",
  highlights: plan.highlights.slice(0, 5),
  stats: [
    { label: "Instances", value: `${plan.included_instances} included / ${plan.max_instances} max` },
    { label: "Products", value: `${plan.included_products} included / ${plan.max_products} max` },
    { label: "Customers", value: plan.customers.toLocaleString() },
    { label: "Orders / month", value: plan.ordersPerMonth.toLocaleString() },
  ],
}));

export const PRICING_ADDONS = BILLING_ADDONS.map((addon) => ({
  title: addon.name,
  body: `${addon.price} per ${addon.quantityLabel}.`,
}));

export const PRICING_USAGE_NOTES = [
  `Full account setup is available at $${FULL_SETUP_PRICE} one time where needed.`,
  "Wallet balance covers AI text replies, image understanding, audio understanding, voice replies, and paid automation sends where configured.",
  "If wallet balance runs out, AI replies and paid sends may stop until the business tops up.",
];

export const PRICING_USAGE_EXAMPLES = AI_USAGE_EXAMPLES;
export const PRICING_USAGE_RATES = AI_USAGE_RATES;

export const LANDING_LINKS = SEO_LANDING_PAGES.slice(0, 6).map((page) => ({
  href: `/${page.slug}`,
  label: page.title,
}));

export const DOCS_LINKS = DOCS_PAGES.slice(0, 6).map((page) => ({
  href: `/docs/${page.slug}`,
  label: page.title,
}));
