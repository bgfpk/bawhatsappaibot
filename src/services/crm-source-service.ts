export const CRM_SOURCE_FILTERS = [
  { id: "all", label: "All sources" },
  { id: "whatsapp", label: "WhatsApp inbound" },
  { id: "website_api", label: "Website API" },
  { id: "woo_wordpress", label: "WooCommerce / WordPress" },
  { id: "manual_crm", label: "Manual admin action" },
  { id: "social", label: "Social" },
  { id: "unknown", label: "Unknown" },
] as const;

export const CRM_SOURCE_LABELS = [
  "WhatsApp",
  "CRM",
  "Manual",
  "Website API",
  "Website",
  "API",
  "WooCommerce",
  "WordPress",
  "Facebook",
  "Instagram",
  "Google Form",
  "TikTok",
  "Calls",
  "Unknown",
] as const;

function cleanSource(value: any, fallback = "") {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 80) || fallback;
}

export function normalizeCrmSource(value: any) {
  const text = cleanSource(value).toLowerCase();
  if (!text) return "Unknown";
  if (text.includes("follow") || text.includes("campaign")) return "Follow-up campaign";
  if (text.includes("customer_update") || text.includes("customer update")) return "Customer update";
  if (text.includes("woocommerce") || text === "woo" || text.includes("woo_")) return "WooCommerce";
  if (text.includes("wordpress") || text === "wp") return "WordPress";
  // Handle explicit API cases before generic Website API detection
  if (text === "api" || text.includes("public api") || text.includes("api form") || text === "public api form") return "API";
  // Generic Website API detection
  if (text === "website_api" || text.includes("website api") || text.includes("webhook") || (text.includes("website") && text.includes("api"))) return "Website API";
  if (text.includes("knowledge")) return "Website / knowledge";
  if (text.includes("google") && text.includes("form")) return "Google Form";
  if (text.includes("facebook") || text === "fb") return "Facebook";
  if (text.includes("instagram") || text === "ig") return "Instagram";
  if (text.includes("tiktok") || text.includes("tik tok")) return "TikTok";
  // Explicitly handle public API form cases before generic API handling
  if (text.includes("public api") || text.includes("api form") || text === "public api form") return "API";
  if (text.includes("api")) return "API";
  if (text.includes("website") || text.includes("web form") || text === "web") return "Website";
  if (text.includes("whatsapp") || text === "wa" || /^wa\b/.test(text)) return "WhatsApp";
  if (text.includes("call")) return "Calls";
  if (text.includes("crm")) return "CRM";
  if (text.includes("manual") || text.includes("csv")) return "Manual";
  if (text.includes("unknown")) return "Unknown";
  return cleanSource(value, "Unknown");
}

export function getCrmSourceGroup(value: any) {
  const source = normalizeCrmSource(value);
  if (source === "WhatsApp") return "whatsapp";
  if (source === "Website API" || source === "Website" || source === "API" || source === "Google Form" || source === "Website / knowledge") return "website_api";
  if (source === "WooCommerce" || source === "WordPress") return "woo_wordpress";
  if (source === "Manual" || source === "CRM" || source === "Customer update") return "manual_crm";
  if (source === "Follow-up campaign") return "manual_crm";
  if (source === "Facebook" || source === "Instagram" || source === "TikTok") return "social";
  if (source === "Unknown") return "unknown";
  return "unknown";
}

export function getCrmSourceDisplayLabel(value: any) {
  const source = normalizeCrmSource(value);
  if (source === "WhatsApp") return "WhatsApp inbound";
  if (source === "Manual" || source === "CRM") return "Manual admin action";
  if (source === "Website API") return "Website API";
  if (source === "Website") return "Website / knowledge";
  if (source === "API") return "Website API";
  if (source === "WooCommerce") return "WooCommerce";
  if (source === "WordPress") return "WordPress";
  return source;
}

export function sourceMatchesCrmFilter(value: any, filter: any) {
  const filterId = cleanSource(filter || "all").toLowerCase();
  if (!filterId || filterId === "all") return true;
  const source = normalizeCrmSource(value);
  if (getCrmSourceGroup(source) === filterId) return true;
  return source.toLowerCase() === filterId;
}

export function summarizeCrmSources(rows: any[] = [], getSource: (row: any) => any = (row) => row?.source) {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const source = normalizeCrmSource(getSource(row));
    counts[source] = (counts[source] || 0) + 1;
  }
  return counts;
}

export function getSourceBadgeClassName(value: any) {
  const group = getCrmSourceGroup(value);
  if (group === "whatsapp") return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";
  if (group === "woo_wordpress") return "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300";
  if (group === "website_api") return "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300";
  if (group === "manual_crm") return "bg-slate-100 text-slate-700 dark:bg-neutral-800 dark:text-neutral-300";
  if (group === "social") return "bg-pink-50 text-pink-700 dark:bg-pink-950/40 dark:text-pink-300";
  return "bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-300";
}
