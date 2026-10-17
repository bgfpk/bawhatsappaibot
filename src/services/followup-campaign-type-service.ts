export type FollowupCampaignType = "fixed_message" | "ai_smart_followup";

export function normalizeFollowupCampaignType(value: any): FollowupCampaignType {
  return String(value || "").trim().toLowerCase() === "ai_smart_followup"
    ? "ai_smart_followup"
    : "fixed_message";
}

export function getFollowupCampaignTypeLabel(value: any) {
  return normalizeFollowupCampaignType(value) === "ai_smart_followup"
    ? "AI Smart Follow-up"
    : "Fixed Message";
}

export function getFollowupCampaignCost(value: any) {
  return normalizeFollowupCampaignType(value) === "ai_smart_followup" ? 0.003 : 0.001;
}
