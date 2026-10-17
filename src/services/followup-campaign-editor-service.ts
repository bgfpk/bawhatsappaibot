import { normalizeFollowupCampaignType } from "./followup-campaign-type-service.ts";

function clean(value: any) {
  return String(value || "").trim();
}

export function updateFollowupCampaignAt(items: any[], index: number, patch: any) {
  const next = Array.isArray(items) ? [...items] : [];
  if (!next[index]) return next;
  next[index] = {
    ...next[index],
    ...patch,
    campaign_type: normalizeFollowupCampaignType(patch?.campaign_type ?? next[index]?.campaign_type),
  };
  return next;
}

export function removeFollowupCampaignAt(items: any[], index: number) {
  const next = Array.isArray(items) ? [...items] : [];
  if (index < 0 || index >= next.length) return next;
  next.splice(index, 1);
  return next;
}

export function buildFollowupDeleteConfirmation(campaign: any, index: number) {
  const name = clean(campaign?.name) || `campaign ${index + 1}`;
  return `Delete "${name}"? This campaign will stop future follow-up scans after saving.`;
}
