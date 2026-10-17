import { CRM_UI_ENABLED } from "../config/product-flags";

export type ClientOnboardingCta =
  | "connect_whatsapp"
  | "configure_ai"
  | "customer_details"
  | "add_product"
  | "welcome_sequence"
  | "website_knowledge"
  | "create_followup"
  | "advanced_settings"
  | "wallet"
  | "test_message"
  | "open_dashboard";

export type ClientOnboardingChecklistItem = {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  manual: boolean;
  ctaLabel: string;
  cta: ClientOnboardingCta;
};

export type ClientOnboardingChecklist = {
  coreItems: ClientOnboardingChecklistItem[];
  optionalItems: ClientOnboardingChecklistItem[];
  completedCoreCount: number;
  totalCoreCount: number;
  progressPercent: number;
  recommendedCoreItem: ClientOnboardingChecklistItem | null;
  launchReady: boolean;
  accessReady: boolean;
  selectedInstanceLabel: string;
  aiRepliesEnabled: boolean;
  items: ClientOnboardingChecklistItem[];
  completedCount: number;
  totalCount: number;
  recommendedItem: ClientOnboardingChecklistItem | null;
};

export type ClientOnboardingRouteTarget = {
  view: string;
  aiTab?: string;
  billingTab?: string;
  botTab?: string;
};

type ChecklistInput = {
  currentUser?: any;
  selectedBot?: any;
  status?: string;
  systemPrompt?: string;
  botName?: string;
  businessType?: string;
  selectedBotLanguage?: string;
  replyBehavior?: string;
  products?: any[];
  syncGroups?: any[];
  followups?: any[];
  walletBalance?: number;
  userBilling?: any;
  customFields?: any[];
  customerDetailsConfigured?: boolean;
  aiRepliesEnabled?: boolean;
};

function bool(value: any) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function hasText(value: any, minLength = 1) {
  return String(value || "").trim().length >= minLength;
}

function count(value: any) {
  return Array.isArray(value) ? value.length : Math.max(0, Number(value || 0));
}

function hasSetupSignal(setupStatus: any, keys: string[]) {
  return keys.some((key) => bool(setupStatus?.[key]) || count(setupStatus?.[key]) > 0);
}

function isAccessReady(input: ChecklistInput, setupStatus: any) {
  const access = input.userBilling?.billing_access || {};
  const plan = input.userBilling?.plan || {};
  return Number(input.walletBalance || 0) > 0 ||
    hasSetupSignal(setupStatus, ["billingReady", "active", "walletReady", "subscriptionActive"]) ||
    ["paid", "trial"].includes(String(access.status || "").toLowerCase()) ||
    access.canUseAi === true ||
    Boolean(plan.plan_expiry || plan.expires_at || plan.creem_subscription_id);
}

function parseInstanceActivity(bot: any) {
  const direct = [bot?.last_inbound_at, bot?.last_outbound_at, bot?.last_message_at];
  let fallback: any = {};
  try {
    const config = typeof bot?.config_settings === "string" ? JSON.parse(bot.config_settings) : bot?.config_settings;
    fallback = config?.__instanceActivity || {};
  } catch {}
  return [...direct, fallback.last_inbound_at, fallback.last_outbound_at, fallback.last_message_at]
    .some((value) => Number(value || 0) > 0);
}

function isSelectedBotConnected(input: ChecklistInput) {
  if (!input.selectedBot) return false;
  const active = ![0, false, "0"].includes(input.selectedBot.is_active);
  return active && hasText(input.selectedBot.jid) && (input.status === "connected" || input.selectedBot.status === "connected" || hasText(input.selectedBot.jid));
}

function hasBusinessInformation(input: ChecklistInput) {
  return hasText(input.systemPrompt, 30) &&
    hasText(input.botName) &&
    ["product", "service"].includes(String(input.businessType || "").toLowerCase()) &&
    hasText(input.selectedBotLanguage) &&
    hasText(input.replyBehavior);
}

function hasValidProduct(products: any) {
  return Array.isArray(products) && products.some((product) =>
    hasText(product?.name || product?.title || product?.service_name || product?.product_name || product?.id || product?.$id));
}

function hasValidPersistedCustomerDetail(customFields: any) {
  return Array.isArray(customFields) && customFields.some((field) => hasText(field?.name) && hasText(field?.instructions));
}

function hasGroup(input: ChecklistInput, purposes?: string[]) {
  return (input.syncGroups || []).some((group: any) => {
    const purpose = String(group?.purpose || "").toLowerCase();
    return purposes ? purposes.includes(purpose) : hasText(group?.name || group?.jid || purpose);
  });
}

export function getOnboardingCtaTarget(cta: ClientOnboardingCta): ClientOnboardingRouteTarget {
  const targets: Record<ClientOnboardingCta, ClientOnboardingRouteTarget> = {
    connect_whatsapp: { view: "selector" },
    configure_ai: { view: "ai", aiTab: "instructions" },
    customer_details: { view: "ai", aiTab: "fields" },
    add_product: { view: "products" },
    welcome_sequence: { view: "dashboard", botTab: "sequences" },
    website_knowledge: { view: "ai", aiTab: "integrations" },
    create_followup: { view: "marketing" },
    advanced_settings: { view: "ai", aiTab: "smart_sales" },
    wallet: { view: "billing", billingTab: "overview" },
    test_message: { view: "dashboard" },
    open_dashboard: { view: "dashboard" },
  };
  return targets[cta];
}

export function buildClientOnboardingChecklist(input: ChecklistInput = {}): ClientOnboardingChecklist {
  const setupStatus = input.userBilling?.setupStatus || input.currentUser?.setupStatus || {};
  const connected = isSelectedBotConnected(input);
  const businessInformation = hasBusinessInformation(input);
  const products = hasValidProduct(input.products);
  const hasCustomerDetailsConfigured = input.customerDetailsConfigured === true ||
    (input.customerDetailsConfigured === undefined && hasValidPersistedCustomerDetail(input.customFields));
  const testMessage = parseInstanceActivity(input.selectedBot);
  const accessReady = isAccessReady(input, setupStatus);
  const firstFiveReady = connected && businessInformation && products && hasCustomerDetailsConfigured && testMessage;
  const launchReady = firstFiveReady && accessReady;
  const aiRepliesEnabled = input.aiRepliesEnabled === true;
  const goLiveCta: ClientOnboardingCta = !accessReady ? "wallet" : !aiRepliesEnabled ? "configure_ai" : "open_dashboard";

  const coreItems: ClientOnboardingChecklistItem[] = [
    { id: "connect-whatsapp", title: "Connect WhatsApp", description: "Link the WhatsApp number your customers will message.", completed: connected, manual: false, ctaLabel: "Connect WhatsApp", cta: "connect_whatsapp" },
    { id: "business-information", title: "Add business information", description: "Set your bot name, business type, language, reply style and main instructions.", completed: businessInformation, manual: false, ctaLabel: "Add business information", cta: "configure_ai" },
    { id: "products-services", title: "Add products or services", description: "Add what your business sells so customer replies are accurate.", completed: products, manual: false, ctaLabel: "Add products or services", cta: "add_product" },
    { id: "customer-details", title: "Choose customer details", description: "Choose what the bot should collect before confirming a lead, booking or order.", completed: hasCustomerDetailsConfigured, manual: false, ctaLabel: "Choose customer details", cta: "customer_details" },
    { id: "test-bot", title: "Test your bot", description: "Send a message from another WhatsApp number and check the reply in Customer Chats.", completed: testMessage, manual: false, ctaLabel: "Open customer chats", cta: "test_message" },
    { id: "go-live", title: "Go live", description: "Your core setup is ready for real customer conversations.", completed: launchReady, manual: false, ctaLabel: !accessReady ? "Review billing" : !aiRepliesEnabled ? "Turn on AI replies" : "Open customer chats", cta: goLiveCta },
  ];

  const optionalItems: ClientOnboardingChecklistItem[] = [
    { id: "welcome-flow", title: "Add a welcome flow", description: "Prepare a greeting for new customers.", completed: hasGroup(input, ["welcome", "welcome_sequence", "welcome_flow", "new_customer"]), manual: false, ctaLabel: "Review flows", cta: "welcome_sequence" },
    { id: "media-flows", title: "Add media or saved flows", description: "Keep reusable media and flows ready when useful.", completed: hasGroup(input), manual: false, ctaLabel: "Review flows", cta: "welcome_sequence" },
    { id: "website-knowledge", title: "Connect website knowledge", description: "Add website or store knowledge when useful.", completed: hasSetupSignal(setupStatus, ["websiteKnowledge", "websiteKnowledgeCount", "wordpressConnected", "woocommerceConnected"]), manual: false, ctaLabel: "Review connections", cta: "website_knowledge" },
    { id: "follow-up", title: "Create a follow-up", description: "Prepare an optional follow-up campaign.", completed: count(input.followups) > 0, manual: false, ctaLabel: "Review follow-ups", cta: "create_followup" },
  ];

  const completedCoreCount = coreItems.filter((item) => item.completed).length;
  const recommendedCoreItem = coreItems.find((item) => !item.completed) || null;
  const totalCoreCount = coreItems.length;
  return {
    coreItems,
    optionalItems: CRM_UI_ENABLED ? optionalItems : optionalItems.filter((item) => !item.id.includes("crm")),
    completedCoreCount,
    totalCoreCount,
    progressPercent: Math.round((completedCoreCount / totalCoreCount) * 100),
    recommendedCoreItem,
    launchReady,
    accessReady,
    selectedInstanceLabel: input.selectedBot?.name || input.selectedBot?.display_name || input.selectedBot?.jid || "No WhatsApp instance selected",
    aiRepliesEnabled,
    items: coreItems,
    completedCount: completedCoreCount,
    totalCount: totalCoreCount,
    recommendedItem: recommendedCoreItem,
  };
}
