import { getDisplayNameFromCustomer, getDisplayPhoneFromCustomer } from "../utils/contact-identity";

export type CustomerSortColumn = "name" | "contact" | "interacted" | "orders";
export type CustomerSortDirection = "asc" | "desc";

export interface CustomerFilterOptions {
  searchQuery: string;
  sourceFilter: string;
  statusFilter: "all" | "ai_paused" | "human" | "orders" | "recent";
}

function normalizeTime(value: any): number {
  if (!value) return 0;
  if (typeof value === "number") {
    return value > 1e11 ? Math.floor(value / 1000) : value;
  }
  const date = new Date(value);
  const time = date.getTime();
  return Number.isNaN(time) ? 0 : Math.floor(time / 1000);
}

export function filterAndSortCustomers(
  customers: any[],
  options: CustomerFilterOptions,
  sort: { column: CustomerSortColumn; direction: CustomerSortDirection },
): any[] {
  const query = (options.searchQuery || "").trim().toLowerCase();
  const source = options.sourceFilter || "all";
  const status = options.statusFilter || "all";

  let result = [...customers];

  // 1. Search Query
  if (query) {
    result = result.filter((c) => {
      const name = String(getDisplayNameFromCustomer(c) || "").toLowerCase();
      const phone = String(getDisplayPhoneFromCustomer(c) || c?.phone || c?.customer_id || "").toLowerCase();
      const summary = String(c?.chat_summary || c?.summary || c?.profile?.chatSummary || "").toLowerCase();
      return name.includes(query) || phone.includes(query) || summary.includes(query);
    });
  }

  // 2. Source Filter
  if (source !== "all") {
    result = result.filter((c) => {
      const cSource = String(c?.source || c?.profile?.source || "").toLowerCase();
      return cSource.includes(source.toLowerCase());
    });
  }

  // 3. Status Filter
  if (status === "ai_paused") {
    result = result.filter((c) =>
      Boolean(
        c?.profile?.aiPaused ||
        c?.profile?.botReplyControl === "paused_temp" ||
        c?.profile?.botReplyControl === "paused_permanent" ||
        c?.profile?.botReplyPausedPermanent
      )
    );
  } else if (status === "human") {
    result = result.filter((c) => Boolean(c?.profile?.manualReviewRequired || c?.profile?.manual_review));
  } else if (status === "orders") {
    result = result.filter((c) => Array.isArray(c?.profile?.orders) && c.profile.orders.length > 0);
  }

  // 4. Sort
  result.sort((a, b) => {
    let valA: any = "";
    let valB: any = "";

    if (sort.column === "name") {
      valA = String(getDisplayNameFromCustomer(a) || "").toLowerCase();
      valB = String(getDisplayNameFromCustomer(b) || "").toLowerCase();
    } else if (sort.column === "contact") {
      valA = String(getDisplayPhoneFromCustomer(a) || "").toLowerCase();
      valB = String(getDisplayPhoneFromCustomer(b) || "").toLowerCase();
    } else if (sort.column === "interacted") {
      valA = normalizeTime(a?.last_message_at || a?.last_interaction_at || a?.profile?.lastMessageAt || a?.profile?.lastCustomerMessageAt || a?.profile?.lastInteractionAt);
      valB = normalizeTime(b?.last_message_at || b?.last_interaction_at || b?.profile?.lastMessageAt || b?.profile?.lastCustomerMessageAt || b?.profile?.lastInteractionAt);
    }

    if (valA < valB) return sort.direction === "asc" ? -1 : 1;
    if (valA > valB) return sort.direction === "asc" ? 1 : -1;
    return 0;
  });

  return result;
}
