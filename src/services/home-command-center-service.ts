import { buildInboxV2Rows, summarizeInboxV2Rows, type InboxV2Row } from "./inbox-v2-service";

type BuildHomeCommandCenterInput = {
  customers?: any[];
  orders?: any[];
  crmOverview?: any;
  nowMs?: number;
};

function safeString(value: any) {
  return String(value ?? "").trim();
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

function numericAmount(...values: any[]) {
  for (const value of values) {
    const parsed = Number(safeString(value).replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 0;
}

function orderDataOf(order: any) {
  return parseObject(order?.order_data || order?.data || order?.details);
}

function orderAmount(order: any) {
  const data = orderDataOf(order);
  return numericAmount(data.totalPrice, data.codAmount, data.invoicePayment, data.total, order?.total, order?.amount);
}

export function buildHomeCommandCenter(input: BuildHomeCommandCenterInput) {
  const customers = [...(input.customers || [])];
  const orders = [...(input.orders || [])];
  const crmOverview = input.crmOverview || {};
  const leads = Array.isArray(crmOverview?.leads) ? crmOverview.leads : [];
  const followUps = Array.isArray(crmOverview?.followUps) ? crmOverview.followUps : [];
  const inboxRows = buildInboxV2Rows({ customers, orders, crmOverview, nowMs: input.nowMs });
  const inboxSummary = summarizeInboxV2Rows(inboxRows);
  const openLeadCount = leads.filter((lead: any) => !["won", "lost", "closed", "done", "completed"].includes(safeString(lead?.status).toLowerCase())).length;
  const availableRevenue = orders.reduce((total, order) => total + orderAmount(order), 0);

  const needsAttention = inboxRows.filter((row) => (
    row.queueFlags.includes("needs_human") ||
    row.queueFlags.includes("overdue_followup") ||
    row.queueFlags.includes("unassigned")
  )).slice(0, 6);

  const manualActions = [
    { id: "open-inbox", label: "Review customer chats", reason: "Open the inbox to reply to customers who are waiting for you.", target: "inbox" },
    { id: "open-crm", label: "Open CRM Team Routing", reason: "Review lead ownership, routing, and follow-up load.", target: "crm" },
    { id: "open-fleet", label: "Check WhatsApp connection", reason: "Make sure your WhatsApp number is connected and ready.", target: "selector" },
  ];

  return {
    snapshot: {
      totalCustomers: customers.length,
      needsHuman: inboxSummary.needsHuman,
      unassigned: inboxSummary.unassigned,
      openCrmLeads: openLeadCount,
      overdueFollowUps: inboxSummary.overdue,
      orderCount: orders.length,
      availableRevenue,
      aiReplied: inboxSummary.aiReplied,
      noSummary: inboxSummary.noSummary,
    },
    inboxRows,
    needsAttention,
    followUps,
    manualActions,
    systemHealth: {
      whatsappHealth: "Shown from your connected WhatsApp number",
      integrationHealth: "Review website, WooCommerce, and webhook setup in Integrations",
      walletHealth: "Review wallet balance and plan status in Billing",
    },
  };
}

export type HomeCommandCenter = ReturnType<typeof buildHomeCommandCenter>;
export type HomeCommandCenterAttentionRow = InboxV2Row;
