// src/services/whatsapp-cloud-api-template-service.ts
//
// Template Rendering, Validation, Previewing, and Storage Management for WhatsApp Cloud API.
//
// Requirements:
// - Validates template status (APPROVED required for send)
// - Parameter count/format validation against template definition
// - Clean variable substitution without object leakage or HTML injection
// - Tenant-isolated caching and status reconciliation

import type { NormalizedMetaTemplate, MetaTemplateStatus } from "./whatsapp-cloud-api-template-client.ts";
import { listWabaMessageTemplates } from "./whatsapp-cloud-api-template-client.ts";
import { decryptServerSecret } from "./secret-crypto-service.ts";
import * as dbService from "./db-service.ts";

export interface TemplateValidationResult {
  valid: boolean;
  error?: string;
  components?: any[];
}

export interface TemplateVariableValues {
  [key: string]: string | number;
}

/**
 * Extracts expected body variable placeholders (e.g. {{1}}, {{2}}) from template components.
 */
export function extractTemplateBodyVariables(template: NormalizedMetaTemplate): string[] {
  const bodyComponent = template.components.find(
    (c: any) => String(c?.type || "").toUpperCase() === "BODY"
  );
  if (!bodyComponent || typeof bodyComponent.text !== "string") {
    return [];
  }

  const text = bodyComponent.text;
  const matches = text.match(/\{\{(\d+)\}\}/g);
  if (!matches) return [];

  // Extract unique sorted indexes
  const indexes: string[] = Array.from<string>(
    new Set(matches.map((m) => m.replace(/[\{\}]/g, "")))
  ).sort((a, b) => Number(a) - Number(b));

  return indexes;
}

/**
 * Validates provided variable parameters against a template's definition.
 * Produces the typed Meta components array required by Graph API.
 */
export function validateTemplateParameters(
  template: NormalizedMetaTemplate,
  parameters?: any[] | Record<string, any>
): TemplateValidationResult {
  if (!template || !template.name) {
    return { valid: false, error: "invalid_template" };
  }

  if (template.status !== "APPROVED") {
    return {
      valid: false,
      error: `template_not_approved (status: ${template.status})`,
    };
  }

  const expectedVars = extractTemplateBodyVariables(template);
  if (expectedVars.length === 0) {
    // Template has no variables
    return { valid: true, components: [] };
  }

  const paramsObj: Record<string, string> = {};

  if (Array.isArray(parameters)) {
    parameters.forEach((val, idx) => {
      paramsObj[String(idx + 1)] = String(val ?? "");
    });
  } else if (parameters && typeof parameters === "object") {
    for (const [k, v] of Object.entries(parameters)) {
      paramsObj[String(k)] = String(v ?? "");
    }
  }

  const bodyParams: Array<{ type: "text"; text: string }> = [];

  for (const varIndex of expectedVars) {
    const rawVal = paramsObj[varIndex];
    if (rawVal === undefined || rawVal === null || rawVal === "") {
      return {
        valid: false,
        error: `missing_template_variable: variable {{${varIndex}}} is required for template '${template.name}'`,
      };
    }

    const cleanVal = String(rawVal).trim();
    if (
      cleanVal === "undefined" ||
      cleanVal === "null" ||
      cleanVal === "[object Object]"
    ) {
      return {
        valid: false,
        error: `invalid_template_variable: variable {{${varIndex}}} has invalid placeholder string '${cleanVal}'`,
      };
    }

    bodyParams.push({
      type: "text",
      text: cleanVal,
    });
  }

  return {
    valid: true,
    components: [
      {
        type: "body",
        parameters: bodyParams,
      },
    ],
  };
}

/**
 * Renders a plain-text preview of a template with variable substitutions.
 * Does not execute HTML or allow script injection.
 */
export function renderTemplatePreview(
  template: NormalizedMetaTemplate,
  sampleValues?: Record<string, string>
): string {
  const bodyComponent = template.components.find(
    (c: any) => String(c?.type || "").toUpperCase() === "BODY"
  );
  if (!bodyComponent || typeof bodyComponent.text !== "string") {
    return `[Template: ${template.name}]`;
  }

  let text = String(bodyComponent.text);

  if (sampleValues && typeof sampleValues === "object") {
    for (const [key, val] of Object.entries(sampleValues)) {
      const cleanVal = String(val || "").trim();
      text = text.replaceAll(`{{${key}}}`, cleanVal || `{{${key}}}`);
    }
  }

  return text;
}

const TEMPLATE_STORE_PREFIX = "cloud_templates_";

/**
 * Synchronizes templates from Meta Graph API for a specific bot and stores them durably.
 */
export async function syncWabaTemplatesForBot(params: {
  botId: string;
  accountId: string;
  fetchImpl?: typeof fetch;
}): Promise<{
  success: boolean;
  syncedCount: number;
  templates: NormalizedMetaTemplate[];
  error?: string;
}> {
  const { botId, accountId, fetchImpl } = params;

  const botDoc = await dbService.getBotById(botId).catch(() => null);
  if (!botDoc) {
    return { success: false, syncedCount: 0, templates: [], error: "bot_not_found" };
  }

  // Tenant isolation check
  if (botDoc.user_id && botDoc.user_id !== accountId) {
    return { success: false, syncedCount: 0, templates: [], error: "unauthorized_tenant" };
  }

  const providerConfig = await dbService.getBotProviderConfig(botId).catch(() => null);
  if (!providerConfig || providerConfig.providerType !== "whatsapp_cloud_api") {
    return {
      success: false,
      syncedCount: 0,
      templates: [],
      error: "cloud_api_not_configured",
    };
  }

  const wabaId = providerConfig.businessAccountId;
  const encryptedToken = providerConfig.encryptedAccessTokenRef;

  if (!wabaId || !encryptedToken) {
    return {
      success: false,
      syncedCount: 0,
      templates: [],
      error: "missing_waba_or_token",
    };
  }

  let accessToken = "";
  try {
    accessToken = decryptServerSecret(encryptedToken);
  } catch (err: any) {
    return {
      success: false,
      syncedCount: 0,
      templates: [],
      error: `token_decryption_failed: ${err?.message || err}`,
    };
  }

  if (!accessToken) {
    return {
      success: false,
      syncedCount: 0,
      templates: [],
      error: "empty_decrypted_token",
    };
  }

  try {
    const templates = await listWabaMessageTemplates({
      wabaId,
      accessToken,
      fetchImpl,
    });

    // Store templates in user extra config under bot-scoped key
    const storeKey = `${TEMPLATE_STORE_PREFIX}${botId}`;
    await dbService.saveUserExtraConfigPatch(accountId, {
      [storeKey]: {
        wabaId,
        syncedAt: Date.now(),
        templates,
      },
    });

    return {
      success: true,
      syncedCount: templates.length,
      templates,
    };
  } catch (err: any) {
    return {
      success: false,
      syncedCount: 0,
      templates: [],
      error: err?.message || "template_sync_failed",
    };
  }
}

/**
 * Retrieves cached templates for a bot from durable storage with optional filtering.
 */
export async function getCachedTemplatesForBot(
  botId: string,
  accountId: string,
  filter?: { status?: string; category?: string; language?: string }
): Promise<NormalizedMetaTemplate[]> {
  const storeKey = `${TEMPLATE_STORE_PREFIX}${botId}`;
  const data: any = await dbService
    .getUserExtraConfigValue(accountId, storeKey)
    .catch(() => null);

  const rawTemplates: NormalizedMetaTemplate[] = Array.isArray(data?.templates)
    ? data.templates
    : [];

  let filtered = rawTemplates;

  if (filter?.status) {
    const targetStatus = filter.status.toUpperCase();
    filtered = filtered.filter((t) => t.status.toUpperCase() === targetStatus);
  }

  if (filter?.category) {
    const targetCategory = filter.category.toUpperCase();
    filtered = filtered.filter((t) => t.category.toUpperCase() === targetCategory);
  }

  if (filter?.language) {
    const targetLang = filter.language.toLowerCase();
    filtered = filtered.filter((t) => t.language.toLowerCase() === targetLang);
  }

  return filtered;
}

/**
 * Updates a specific template's status in cached storage when receiving a webhook event.
 */
export async function updateCachedTemplateStatusInStorage(params: {
  accountId: string;
  botId: string;
  templateName: string;
  language?: string;
  status: MetaTemplateStatus;
}): Promise<boolean> {
  const { accountId, botId, templateName, language, status } = params;
  const storeKey = `${TEMPLATE_STORE_PREFIX}${botId}`;

  const data: any = await dbService
    .getUserExtraConfigValue(accountId, storeKey)
    .catch(() => null);

  if (!data || !Array.isArray(data.templates)) return false;

  let found = false;
  const updatedTemplates = data.templates.map((t: NormalizedMetaTemplate) => {
    const matchName = t.name.toLowerCase() === templateName.toLowerCase();
    const matchLang = !language || t.language.toLowerCase() === language.toLowerCase();
    if (matchName && matchLang) {
      found = true;
      return {
        ...t,
        status: status.toUpperCase(),
      };
    }
    return t;
  });

  if (found) {
    await dbService.saveUserExtraConfigPatch(accountId, {
      [storeKey]: {
        ...data,
        updatedAt: Date.now(),
        templates: updatedTemplates,
      },
    });
  }

  return found;
}
