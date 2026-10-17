import { isFollowupActive, parseFollowupList } from "./followup-campaign-service.ts";
import { normalizeFollowupCampaignType } from "./followup-campaign-type-service.ts";

function parseConfig(raw: any) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return {};
  }
}

export function validateFollowupCampaignStillSendable(input: {
  bot?: any;
  followupId: string;
  campaignType?: string;
}) {
  const config = parseConfig(input.bot?.config_settings);
  const followups = parseFollowupList(config.followups_json ?? config.followups);
  const followupId = String(input.followupId || "").trim();
  const current = followups.find((item: any, index: number) => String(item?.id || `campaign_${index + 1}`) === followupId);
  if (!current) return { ok: false, reason: "skipped_deleted_campaign", campaign: null as any };
  if (!isFollowupActive(current?.is_active)) return { ok: false, reason: "skipped_inactive_campaign", campaign: current };

  const expectedType = normalizeFollowupCampaignType(input.campaignType);
  const currentType = normalizeFollowupCampaignType(current?.campaign_type);
  if (expectedType !== currentType) {
    return { ok: false, reason: "skipped_campaign_type_changed", campaign: current };
  }
  return { ok: true, reason: "", campaign: current };
}
