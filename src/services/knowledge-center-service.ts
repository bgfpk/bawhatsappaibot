import { redactSensitiveText } from "../utils/privacy-redaction";

export type KnowledgeSourceType =
  | "ai_instructions"
  | "learned_facts"
  | "products_services"
  | "media_library"
  | "sequence_templates"
  | "website_knowledge"
  | "woo_commerce"
  | "wordpress"
  | "integrations_api"
  | "customer_profiles"
  | "whatsapp_profiles"
  | "manual_notes";

export type KnowledgeSourceStatus = "ready" | "partial" | "not_connected" | "needs_review";

export type KnowledgeSource = {
  id: string;
  type: KnowledgeSourceType;
  label: string;
  status: KnowledgeSourceStatus;
  count: number | null;
  freshness: string;
  lastUpdatedAt: number | null;
  description: string;
  risks: string[];
  actions: string[];
  preview: string;
};

export type KnowledgeCenterInventory = {
  sources: KnowledgeSource[];
  summary: Record<KnowledgeSourceStatus, number>;
};

export type KnowledgeCenterInput = {
  instructions?: any;
  learnedKnowledge?: any;
  manualNotes?: any;
  products?: any[];
  syncGroups?: any[];
  customers?: any[];
  websiteKnowledge?: any;
  integrations?: any;
  clientGeminiStatus?: any;
  customerIntelligenceEnabled?: boolean;
};

function text(value: any, limit = 220) {
  return redactSensitiveText(String(value ?? "").replace(/\s+/g, " ").trim()).slice(0, limit);
}

function hasText(value: any) {
  return text(value).length > 0;
}

function asArray(value: any) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function parseObject(value: any) {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function timeFrom(...values: any[]) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric > 100000000000 ? numeric : numeric * 1000;
    const parsed = Date.parse(String(value || ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function profileOf(customer: any) {
  return parseObject(customer?.profile);
}

function hasWhatsAppProfile(customer: any) {
  const profile = profileOf(customer);
  const stored = profile.whatsappProfile || profile.contactProfile || profile.whatsappCustomerIntelligence || customer?.whatsappProfile || customer?.contactProfile || customer?.whatsappCustomerIntelligence;
  const object = parseObject(stored);
  return Boolean(object.businessName || object.displayName || object.pushName || object.verifiedName || object.category || object.description || object.email || object.address || object.profilePictureUrl);
}

function source(input: Omit<KnowledgeSource, "preview"> & { preview?: any }): KnowledgeSource {
  return { ...input, preview: text(input.preview || "") };
}

export function buildKnowledgeCenterInventory(input: KnowledgeCenterInput = {}): KnowledgeCenterInventory {
  const products = asArray(input.products);
  const syncGroups = asArray(input.syncGroups);
  const customers = asArray(input.customers);
  const mediaGroups = syncGroups.filter((item: any) => /media/i.test(String(item?.purpose || item?.type || item?.name || "")));
  const sequenceGroups = syncGroups.filter((item: any) => /sequence|welcome/i.test(String(item?.purpose || item?.type || item?.name || "")));
  const whatsappProfileCount = customers.filter(hasWhatsAppProfile).length;
  const customerSummaryCount = customers.filter((customer: any) => {
    const profile = profileOf(customer);
    return Boolean(profile.aiSummary || profile.customerSummary || profile.summary || profile.smartSummary);
  }).length;
  const website = parseObject(input.websiteKnowledge);
  const integrations = parseObject(input.integrations);
  const apiConnected = Boolean(integrations.api?.connected || integrations.websiteApi?.keyStatus || integrations.websiteApi?.connected || integrations.leadsApi?.connected);
  const sources: KnowledgeSource[] = [
    source({ id: "ai-instructions", type: "ai_instructions", label: "AI Instructions", status: hasText(input.instructions) ? "ready" : "needs_review", count: hasText(input.instructions) ? 1 : 0, freshness: "Manual setup", lastUpdatedAt: null, description: "Core business instructions and operating rules saved in AI Studio.", risks: hasText(input.instructions) ? [] : ["No main instructions found."], actions: ["Open AI Studio"], preview: input.instructions }),
    source({ id: "learned-facts", type: "learned_facts", label: "Learned Facts", status: hasText(input.learnedKnowledge) ? "partial" : "not_connected", count: hasText(input.learnedKnowledge) ? 1 : 0, freshness: "Editable memory", lastUpdatedAt: null, description: "AI-learned or admin-corrected facts used as quick memory.", risks: hasText(input.learnedKnowledge) ? ["Review learned facts periodically for stale claims."] : [], actions: ["Review learned facts"], preview: input.learnedKnowledge }),
    source({ id: "products-services", type: "products_services", label: "Products / Services", status: products.length > 0 ? "ready" : "needs_review", count: products.length, freshness: "Catalog data", lastUpdatedAt: Math.max(0, ...products.map((item: any) => Number(timeFrom(item?.updated_at, item?.$updatedAt, item?.created_at, item?.$createdAt) || 0))) || null, description: "Products, services, pricing, and selling details available to the assistant.", risks: products.length > 0 ? [] : ["No catalog items detected."], actions: ["Open Products / Services"], preview: products[0]?.name || products[0]?.title || products[0]?.description }),
    source({ id: "media-library", type: "media_library", label: "Media Library", status: mediaGroups.length > 0 ? "partial" : "not_connected", count: mediaGroups.length, freshness: "WhatsApp group templates", lastUpdatedAt: null, description: "Reusable media/template groups captured from WhatsApp libraries.", risks: mediaGroups.length ? [] : ["No media groups detected in current state."], actions: ["Open Sequences / Media"], preview: mediaGroups[0]?.name }),
    source({ id: "sequence-templates", type: "sequence_templates", label: "Sequences", status: sequenceGroups.length > 0 ? "partial" : "not_connected", count: sequenceGroups.length, freshness: "WhatsApp group templates", lastUpdatedAt: null, description: "Welcome and keyword sequences available for manual/AI-triggered template use.", risks: sequenceGroups.length ? [] : ["No sequence groups detected in current state."], actions: ["Open Sequences"], preview: sequenceGroups[0]?.name }),
    source({ id: "website-knowledge", type: "website_knowledge", label: "Website Knowledge", status: hasText(website.summary || website.content || website.url) ? "partial" : "not_connected", count: hasText(website.summary || website.content || website.url) ? 1 : 0, freshness: "Connected source", lastUpdatedAt: timeFrom(website.updatedAt, website.syncedAt), description: "Website notes or imported site knowledge, when configured.", risks: hasText(website.summary || website.content || website.url) ? ["Website facts may become stale."] : [], actions: ["Open Integrations"], preview: website.summary || website.content || website.url }),
    source({ id: "woo-commerce", type: "woo_commerce", label: "WooCommerce", status: integrations.woocommerce?.connected ? "partial" : "not_connected", count: null, freshness: "Integration status", lastUpdatedAt: timeFrom(integrations.woocommerce?.updatedAt), description: "WooCommerce events and product/order context when connected.", risks: [], actions: ["Open Integrations"], preview: integrations.woocommerce?.storeUrl }),
    source({ id: "wordpress-api", type: "wordpress", label: "WordPress / Website API", status: integrations.wordpress?.connected || integrations.websiteApi?.connected ? "partial" : "not_connected", count: null, freshness: "Integration status", lastUpdatedAt: timeFrom(integrations.wordpress?.updatedAt, integrations.websiteApi?.updatedAt), description: "Website lead capture and WordPress integration context.", risks: [], actions: ["Open Integrations & API"], preview: integrations.wordpress?.siteUrl || integrations.websiteApi?.label }),
    source({ id: "integrations-api", type: "integrations_api", label: "Integrations API", status: apiConnected ? "partial" : "not_connected", count: null, freshness: "API connection status", lastUpdatedAt: timeFrom(integrations.api?.updatedAt, integrations.leadsApi?.updatedAt, integrations.websiteApi?.updatedAt), description: "Website lead capture API and webhook knowledge source status. Secrets and keys are never shown here.", risks: [], actions: ["Open Integrations & API"], preview: integrations.api?.label || integrations.leadsApi?.label || integrations.websiteApi?.label }),
    source({ id: "customer-profiles", type: "customer_profiles", label: "Customer Intelligence", status: customers.length === 0 ? "not_connected" : customerSummaryCount > 0 ? "partial" : "needs_review", count: customerSummaryCount, freshness: customers.length ? "Customer profiles" : "No customer data loaded", lastUpdatedAt: null, description: "Saved customer summaries, preferences, and internal context.", risks: customers.length && customerSummaryCount === 0 ? ["Many customers may need summaries or review."] : [], actions: ["Open Customers", "Open Customer 360"], preview: customers[0]?.summary || profileOf(customers[0]).summary || profileOf(customers[0]).aiSummary }),
    source({ id: "whatsapp-profiles", type: "whatsapp_profiles", label: "WhatsApp Profiles", status: whatsappProfileCount > 0 ? "partial" : input.customerIntelligenceEnabled ? "needs_review" : "not_connected", count: whatsappProfileCount, freshness: input.customerIntelligenceEnabled ? "Profile intelligence enabled" : "Profile sync not enabled", lastUpdatedAt: Math.max(0, ...customers.map((customer: any) => Number(profileOf(customer).whatsappCustomerIntelligence?.scannedAt || profileOf(customer).whatsappProfile?.syncedAt || 0))) || null, description: "Visible WhatsApp profile/business data. Used as customer-specific context, not business policy source.", risks: ["Treat profile data as observed context, not verified policy/pricing truth."], actions: ["Open Customer 360", "Review AI Studio customer intelligence setting"], preview: customers.find(hasWhatsAppProfile)?.profile }),
    source({ id: "manual-notes", type: "manual_notes", label: "Manual Notes", status: hasText(input.manualNotes) ? "partial" : "not_connected", count: hasText(input.manualNotes) ? 1 : 0, freshness: "Admin notes", lastUpdatedAt: null, description: "Manual admin notes and corrections available for future knowledge governance.", risks: [], actions: ["Open AI Studio"], preview: input.manualNotes }),
  ];
  const summary = sources.reduce((acc, item) => ({ ...acc, [item.status]: (acc[item.status] || 0) + 1 }), { ready: 0, partial: 0, not_connected: 0, needs_review: 0 } as Record<KnowledgeSourceStatus, number>);
  return { sources, summary };
}
