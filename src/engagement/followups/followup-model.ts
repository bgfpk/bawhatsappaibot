export type FollowupCampaignType = "fixed_message" | "ai_smart_followup" | string;

export interface FollowupCampaign {
  id: string;
  name: string;
  campaign_type: FollowupCampaignType;
  is_active: boolean;
  hours: number;
  window_hours?: number;
  audience?: string;
  offer_context?: string;
  fixed_message?: string;
  defaultBotId?: string;
  sendFromMode?: "default_only" | "customer_origin_then_default" | string;
  totalSent?: number;
  totalCost?: number;
  lastRunAt?: number | string;
  raw?: any;
}

export interface FollowupActivityLog {
  id: string;
  customerName?: string;
  customerPhone?: string;
  campaignName?: string;
  campaignType?: string;
  timestamp?: number | string;
  status: "sent" | "failed" | "skipped" | "pending";
  reason?: string;
  instanceName?: string;
  cost?: number;
}

export function normalizeFollowupCampaign(raw: any): FollowupCampaign {
  const safe = raw || {};
  const fallbackId = `fup_${safe.hours || 24}_${safe.name ? String(safe.name).slice(0, 12).replace(/\s+/g, "_") : "camp"}`;
  const id = String(safe.id || safe._id || safe.$id || fallbackId);
  return {
    id,
    name: safe.name || "Untitled Campaign",
    campaign_type: safe.campaign_type || safe.type || "fixed_message",
    is_active: Boolean(safe.is_active ?? safe.active ?? true),
    hours: typeof safe.hours === "number" ? safe.hours : 24,
    window_hours: typeof safe.window_hours === "number" ? safe.window_hours : 48,
    audience: safe.audience || "all_customers",
    offer_context: safe.offer_context || safe.prompt || "",
    fixed_message: safe.fixed_message || safe.message || "",
    defaultBotId: safe.defaultBotId || safe.botId || undefined,
    sendFromMode: safe.sendFromMode || "customer_origin_then_default",
    totalSent: typeof safe.totalSent === "number" ? safe.totalSent : 0,
    totalCost: typeof safe.totalCost === "number" ? safe.totalCost : 0,
    lastRunAt: safe.lastRunAt || safe.lastRun || undefined,
    raw: safe,
  };
}

export function filterFollowupLogs(
  logs: FollowupActivityLog[],
  query: string,
  statusFilter: string
): FollowupActivityLog[] {
  const q = query.trim().toLowerCase();

  return logs.filter((log) => {
    if (statusFilter !== "all" && log.status !== statusFilter) {
      return false;
    }

    if (q) {
      const matchName = (log.customerName || "").toLowerCase().includes(q);
      const matchPhone = (log.customerPhone || "").toLowerCase().includes(q);
      const matchCampaign = (log.campaignName || "").toLowerCase().includes(q);
      if (!matchName && !matchPhone && !matchCampaign) return false;
    }

    return true;
  });
}
