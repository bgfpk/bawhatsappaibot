import { isPersonalAssistantFeatureEnabled } from "../services/personal-assistant-config-service.ts";

export const PRODUCT_FEATURE_FLAGS = {
  crm: false,
  inbox: false,
  personalAssistant: isPersonalAssistantFeatureEnabled(),
} as const;

export const CRM_UI_ENABLED = PRODUCT_FEATURE_FLAGS.crm;
export const CRM_UI_PAUSED_MESSAGE = "CRM is currently paused while core product areas are being improved.";

export const INBOX_UI_ENABLED = PRODUCT_FEATURE_FLAGS.inbox;
export const INBOX_UI_PAUSED_MESSAGE = "Inbox is currently paused while core product areas are being improved.";

export const PERSONAL_ASSISTANT_FEATURE_ENABLED = isPersonalAssistantFeatureEnabled();

export function isProductFeatureEnabled(flag: keyof typeof PRODUCT_FEATURE_FLAGS) {
  if (flag === "personalAssistant") {
    return isPersonalAssistantFeatureEnabled();
  }
  return Boolean(PRODUCT_FEATURE_FLAGS[flag]);
}
