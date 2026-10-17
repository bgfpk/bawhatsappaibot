// src/services/whatsapp-outbound-policy-service.ts
//
// Universal Provider-Aware Outbound Policy Router.
// Centralizes the 24-hour customer service window decision and template requirements for WhatsApp.
//
// Rules:
// - whatsapp_web: always free-form allowed (subject to existing product guards).
// - whatsapp_cloud_api + window OPEN: free-form text/media allowed (or template if explicitly requested).
// - whatsapp_cloud_api + window CLOSED: free-form blocked; APPROVED template required.
// - No arbitrary free-form sends outside window for Cloud API.

import {
  evaluateWhatsAppCloudServiceWindow,
  type WhatsAppCloudServiceWindowEvaluation,
} from "./whatsapp-cloud-api-service-window.ts";
import { normalizeProviderType } from "./whatsapp-provider-capabilities.ts";
import type { WhatsAppProviderType } from "./whatsapp-transport-types.ts";

export type WhatsAppMessagePurpose =
  | "ai_reply"
  | "manual_reply"
  | "fixed_followup"
  | "smart_followup"
  | "customer_update"
  | "welcome"
  | "broadcast"
  | "sequence"
  | "direct_message"
  | string;

export interface ConfiguredTemplateInput {
  name: string;
  language?: string;
  status?: string;
  components?: any[];
  params?: any[];
}

export interface WhatsAppOutboundPolicyParams {
  providerType?: WhatsAppProviderType | string;
  customer?: any;
  messagePurpose: WhatsAppMessagePurpose;
  nowMs?: number;
  latestInboundAt?: number | null;
  requestedPayloadType?: "text" | "media" | "voice" | "document" | "template" | string;
  configuredTemplate?: ConfiguredTemplateInput | null;
}

export type WhatsAppOutboundSendMode = "freeform" | "template" | "blocked";

export interface WhatsAppOutboundPolicyDecision {
  allowed: boolean;
  sendMode: WhatsAppOutboundSendMode;
  reason: string;
  providerType: WhatsAppProviderType;
  serviceWindow: WhatsAppCloudServiceWindowEvaluation;
  template?: {
    name: string;
    language: string;
    components?: any[];
    status?: string;
  };
}

/**
 * Resolves the outbound messaging policy for a recipient and message purpose.
 * Pure function with parameterizable clock.
 */
export function resolveWhatsAppOutboundPolicy(
  params: WhatsAppOutboundPolicyParams
): WhatsAppOutboundPolicyDecision {
  const providerType = normalizeProviderType(params.providerType);
  const nowMs = typeof params.nowMs === "number" ? params.nowMs : Date.now();

  // Extract latest inbound timestamp from params or customer object
  let latestInboundAt = params.latestInboundAt;
  if (latestInboundAt === undefined || latestInboundAt === null) {
    const customer = params.customer;
    const profile = customer?.profile && typeof customer.profile === "object" ? customer.profile : {};
    latestInboundAt =
      customer?.lastInboundWhatsAppAt ??
      profile.lastInboundWhatsAppAt ??
      customer?.last_inbound_whatsapp_at ??
      null;
  }

  const serviceWindow = evaluateWhatsAppCloudServiceWindow(latestInboundAt, nowMs);

  // 1. WhatsApp Web (Baileys) – always free-form allowed, no 24h window restriction
  if (providerType === "whatsapp_web") {
    return {
      allowed: true,
      sendMode: "freeform",
      reason: "web_unrestricted",
      providerType: "whatsapp_web",
      serviceWindow,
    };
  }

  // 2. WhatsApp Cloud API
  if (serviceWindow.isOpen) {
    // Window is OPEN
    if (params.requestedPayloadType === "template" && params.configuredTemplate) {
      const tpl = params.configuredTemplate;
      if (tpl.status && tpl.status.toUpperCase() !== "APPROVED") {
        return {
          allowed: false,
          sendMode: "blocked",
          reason: `template_not_approved (status: ${tpl.status})`,
          providerType: "whatsapp_cloud_api",
          serviceWindow,
        };
      }
      return {
        allowed: true,
        sendMode: "template",
        reason: "template_requested_in_window",
        providerType: "whatsapp_cloud_api",
        serviceWindow,
        template: {
          name: tpl.name,
          language: tpl.language || "en_US",
          components: tpl.components,
          status: tpl.status || "APPROVED",
        },
      };
    }

    return {
      allowed: true,
      sendMode: "freeform",
      reason: "window_open",
      providerType: "whatsapp_cloud_api",
      serviceWindow,
    };
  }

  // Window is CLOSED
  if (params.configuredTemplate) {
    const tpl = params.configuredTemplate;
    const status = (tpl.status || "APPROVED").toUpperCase();

    if (status !== "APPROVED") {
      return {
        allowed: false,
        sendMode: "blocked",
        reason: `template_not_approved (status: ${status})`,
        providerType: "whatsapp_cloud_api",
        serviceWindow,
      };
    }

    return {
      allowed: true,
      sendMode: "template",
      reason: "window_closed_template_mapped",
      providerType: "whatsapp_cloud_api",
      serviceWindow,
      template: {
        name: tpl.name,
        language: tpl.language || "en_US",
        components: tpl.components,
        status: "APPROVED",
      },
    };
  }

  // Window is CLOSED and no approved template is configured
  return {
    allowed: false,
    sendMode: "blocked",
    reason: "cloud_template_required",
    providerType: "whatsapp_cloud_api",
    serviceWindow,
  };
}
