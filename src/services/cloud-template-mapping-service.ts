// src/services/cloud-template-mapping-service.ts
//
// Reusable configuration service for mapping approved Meta templates to BlackArrow proactive use cases.
//
// Supported Proactive Purpose Keys:
// - fixed_followup
// - ai_smart_followup
// - customer_update
// - welcome_sequence
// - broadcast
// - manual_outside_window

import * as dbService from "./db-service.ts";

export type ProactiveMessagePurpose =
  | "fixed_followup"
  | "ai_smart_followup"
  | "customer_update"
  | "welcome_sequence"
  | "broadcast"
  | "manual_outside_window"
  | string;

export interface AutomationTemplateMapping {
  purpose: ProactiveMessagePurpose;
  templateId?: string;
  templateName: string;
  language: string;
  status?: string;
  variableMapping?: Record<string, string>;
  lastKnownStatus?: string;
  updatedAt?: number;
}

const AUTOMATION_MAPPING_STORE_PREFIX = "cloud_template_mappings_";

function clean(value: any): string {
  return String(value ?? "").trim();
}

/**
 * Normalizes an automation template mapping object.
 */
export function normalizeAutomationTemplateMapping(
  raw: any
): AutomationTemplateMapping | null {
  if (!raw || typeof raw !== "object") return null;

  const purpose = clean(raw.purpose);
  const templateName = clean(raw.templateName || raw.name);
  const language = clean(raw.language || raw.languageCode) || "en_US";

  if (!purpose || !templateName) return null;

  return {
    purpose,
    templateId: clean(raw.templateId || raw.id) || undefined,
    templateName,
    language,
    status: clean(raw.status || raw.lastKnownStatus).toUpperCase() || "APPROVED",
    variableMapping:
      raw.variableMapping && typeof raw.variableMapping === "object"
        ? raw.variableMapping
        : undefined,
    lastKnownStatus: clean(raw.lastKnownStatus || raw.status).toUpperCase() || "APPROVED",
    updatedAt: Number(raw.updatedAt || Date.now()),
  };
}

/**
 * Retrieves all automation template mappings for a specific bot.
 */
export async function getBotAutomationTemplateMappings(
  botId: string,
  accountId: string
): Promise<Record<string, AutomationTemplateMapping>> {
  const cleanBotId = clean(botId);
  const cleanAccountId = clean(accountId);

  if (!cleanBotId || !cleanAccountId) return {};

  const storeKey = `${AUTOMATION_MAPPING_STORE_PREFIX}${cleanBotId}`;
  const data: any = await dbService
    .getUserExtraConfigValue(cleanAccountId, storeKey)
    .catch(() => null);

  const mappings: Record<string, AutomationTemplateMapping> = {};
  if (data && typeof data === "object") {
    for (const [purpose, rawMapping] of Object.entries(data)) {
      const normalized = normalizeAutomationTemplateMapping(rawMapping);
      if (normalized) {
        mappings[purpose] = normalized;
      }
    }
  }

  return mappings;
}

/**
 * Saves or updates an automation template mapping for a bot.
 */
export async function saveBotAutomationTemplateMapping(
  botId: string,
  accountId: string,
  mapping: AutomationTemplateMapping
): Promise<boolean> {
  const cleanBotId = clean(botId);
  const cleanAccountId = clean(accountId);
  const normalized = normalizeAutomationTemplateMapping(mapping);

  if (!cleanBotId || !cleanAccountId || !normalized) {
    return false;
  }

  const storeKey = `${AUTOMATION_MAPPING_STORE_PREFIX}${cleanBotId}`;
  const current = await getBotAutomationTemplateMappings(cleanBotId, cleanAccountId);

  current[normalized.purpose] = {
    ...normalized,
    updatedAt: Date.now(),
  };

  await dbService.saveUserExtraConfigPatch(cleanAccountId, {
    [storeKey]: current,
  });

  return true;
}

/**
 * Resolves the mapped template for a specific proactive purpose.
 */
export async function resolveMappedTemplateForPurpose(
  botId: string,
  accountId: string,
  purpose: string
): Promise<AutomationTemplateMapping | null> {
  const mappings = await getBotAutomationTemplateMappings(botId, accountId);
  return mappings[purpose] || null;
}
