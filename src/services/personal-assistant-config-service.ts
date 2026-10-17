/**
 * Personal Assistant Feature Config & Zero-Paid-Integration Policy Service
 * 
 * Enforces zero-paid-integration restrictions and feature configuration defaults.
 */

export interface PersonalAssistantFeatureConfig {
  enabled: boolean;
  personalInstanceId?: string;
  controlBusinessInstanceId?: string;
  freeOnlyIntegrations: boolean;
}

export type IntegrationCostPolicy = "free_allowed" | "paid_blocked";

export interface PersonalAssistantIntegrationDefinition {
  id: string;
  name: string;
  costPolicy: IntegrationCostPolicy;
  description?: string;
}

export const KNOWN_PERSONAL_ASSISTANT_INTEGRATIONS: PersonalAssistantIntegrationDefinition[] = [
  {
    id: "google_calendar",
    name: "Google Calendar",
    costPolicy: "free_allowed",
    description: "Personal calendar scheduling via free Google OAuth.",
  },
  {
    id: "google_contacts",
    name: "Google Contacts",
    costPolicy: "free_allowed",
    description: "Contact synchronization via free Google OAuth.",
  },
  {
    id: "gmail",
    name: "Gmail Read/Draft",
    costPolicy: "free_allowed",
    description: "Email drafting via free Google OAuth.",
  },
  {
    id: "premium_paid_sms_gateway",
    name: "Premium SMS Gateway",
    costPolicy: "paid_blocked",
    description: "Paid third-party SMS relay service.",
  },
  {
    id: "paid_crm_connector",
    name: "Paid Enterprise CRM Sync",
    costPolicy: "paid_blocked",
    description: "Commercial paid integration gateway.",
  },
];

/**
 * Checks whether the Personal Assistant feature flag is enabled in the current environment.
 * Defaults strictly to false in production.
 */
export function isPersonalAssistantFeatureEnabled(): boolean {
  if (typeof process !== "undefined" && process.env) {
    if (process.env.ENABLE_PERSONAL_ASSISTANT === "true" || process.env.VITE_ENABLE_PERSONAL_ASSISTANT === "true") {
      return true;
    }
  }
  if (typeof window !== "undefined") {
    if ((window as any).__ENABLE_PERSONAL_ASSISTANT__ === true) {
      return true;
    }
    if ((window as any).__ENABLE_PERSONAL_ASSISTANT__ === false) {
      return false;
    }
    try {
      if (window.localStorage?.getItem("blackarrow_enable_personal_assistant") === "true") {
        return true;
      }
    } catch (_) {}
  }
  return false;
}

/**
 * Injects the runtime Personal Assistant feature flag into HTML before module scripts execute.
 * Injects a boolean literal only to guarantee fail-closed security and prevent arbitrary environment injection.
 */
export function injectPersonalAssistantRuntimeConfig(
  html: string,
  enabled: boolean = isPersonalAssistantFeatureEnabled()
): string {
  const literal = enabled === true ? "true" : "false";
  const scriptTag = `<script>window.__ENABLE_PERSONAL_ASSISTANT__ = ${literal};</script>`;

  // Replace existing script if already present
  const existingPattern = /<script\b[^>]*>\s*window\.__ENABLE_PERSONAL_ASSISTANT__\s*=\s*(?:true|false);?\s*<\/script>/i;
  if (existingPattern.test(html)) {
    return html.replace(existingPattern, scriptTag);
  }

  // Inject immediately BEFORE the first <script type="module" ...>
  const moduleScriptMatch = html.match(/<script\b[^>]*\btype=["']module["'][^>]*>/i);
  if (moduleScriptMatch && moduleScriptMatch.index !== undefined) {
    const idx = moduleScriptMatch.index;
    return html.slice(0, idx) + scriptTag + "\n    " + html.slice(idx);
  }

  // Fallback: inject immediately after <head ...>
  const headMatch = html.match(/<head[^>]*>/i);
  if (headMatch && headMatch.index !== undefined) {
    const idx = headMatch.index + headMatch[0].length;
    return html.slice(0, idx) + "\n    " + scriptTag + html.slice(idx);
  }

  // Fallback: prepend to document
  return scriptTag + "\n" + html;
}

export function createDefaultPersonalAssistantConfig(overrides?: Partial<PersonalAssistantFeatureConfig>): PersonalAssistantFeatureConfig {
  return {
    enabled: isPersonalAssistantFeatureEnabled(),
    freeOnlyIntegrations: true,
    ...overrides,
  };
}

export function validateIntegrationEnablement(
  integration: PersonalAssistantIntegrationDefinition,
  config?: Partial<PersonalAssistantFeatureConfig>
): { allowed: boolean; reason?: string } {
  const isFreeOnly = config?.freeOnlyIntegrations ?? true;

  if (isFreeOnly && integration.costPolicy === "paid_blocked") {
    return {
      allowed: false,
      reason: `Integration '${integration.name}' requires paid third-party access and is blocked by the zero-paid-integration policy. BlackArrow Personal Assistant operates strictly on free integrations.`,
    };
  }

  return {
    allowed: true,
  };
}
