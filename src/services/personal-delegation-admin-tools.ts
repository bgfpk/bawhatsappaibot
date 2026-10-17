/**
 * Personal Delegation Admin Business Assistant Tools
 * 
 * Server-authoritative Admin BA tools for delegation policy management:
 * - get_personal_delegation_policy: Views current safety, spending, and disclosure rules
 * - update_personal_delegation_policy: Updates policy with broadening-confirmation gates
 * - evaluate_action_authorization: Dry-run/preview action authorization check
 * 
 * Channels & Security:
 * - Authorized ONLY from controlling Business WhatsApp by owner/admin
 * - Personal instance messages (including fromMe/self-chat) can NEVER change policy
 * - Tenant isolation enforced
 */

import { registerAdminAction } from "./admin-action-registry-service.ts";
import {
  getPersonalDelegationPolicy,
  savePersonalDelegationPolicy,
  isBroadeningPolicyChange,
} from "./personal-delegation-policy-service.ts";
import {
  evaluatePersonalActionAuthorization,
} from "./personal-action-authorization-service.ts";
import { isPersonalAssistantFeatureEnabled } from "./personal-assistant-config-service.ts";
import type { PersonalDelegationPolicy } from "./personal-delegation-types.ts";

export function registerPersonalDelegationAdminTools(): void {
  // 1. GET POLICY
  registerAdminAction({
    actionId: "get_personal_delegation_policy",
    category: "personal_assistant",
    label: "Get Personal Assistant Policy",
    description: "Views current permissions, spending limits, data sharing, and safety rules for your Personal Assistant.",
    riskLevel: "READ",
    requiredRole: "owner",
    requiresConfirmation: false,
    idempotent: true,
    auditEventType: "personal_delegation_policy_viewed",
    handler: async (context, params) => {
      if (!isPersonalAssistantFeatureEnabled()) {
        return { success: false, message: "Personal Assistant feature is currently disabled." };
      }

      const policy = await getPersonalDelegationPolicy(context.accountId, params?.personalInstanceId);

      const orderModeStr =
        policy.orders.orderCommitmentMode === "NEVER"
          ? "🚫 Never"
          : policy.orders.orderCommitmentMode === "ASK_EACH_TIME"
          ? "⚠️ Ask me every time"
          : `✅ Allowed within limits (Max: ${policy.orders.allowedCurrencies.join("/")} ${policy.orders.maxOrderValuePerTask}/task, ${policy.orders.maxOrderValuePerDay}/day)`;

      const addressSharingStr = policy.dataDisclosure.allowDeliveryAddressForShopping
        ? "✅ Allowed for shopping tasks"
        : "⚠️ Ask me every time";

      const meetingsStr = policy.appointments.allowMeetingConfirmation
        ? "✅ Autonomous within constraints"
        : "⚠️ Ask me every time";

      const summary = `
🛡️ *Personal Assistant Permissions & Delegation*

• *Version:* ${policy.policyVersion} (rev ${policy.revision})

📦 *Orders & Spending:*
• Status: ${policy.orders.allowOrderCommitment ? "Enabled" : "Disabled"}
• Mode: ${orderModeStr}
• Payment Types: ${policy.orders.allowedPaymentCommitmentTypes.join(", ") || "None"}

📍 *Data Sharing & Privacy:*
• City: ${policy.dataDisclosure.allowCitySharingForTasks ? "Allowed for tasks" : "Ask each time"}
• Delivery Address: ${addressSharingStr}
• Email / Phone: ${policy.dataDisclosure.allowEmailSharing}
• Owner Notes: 🔒 Strictly Private (Internal only)

📅 *Appointments & Meetings:*
• Negotiation: ${policy.appointments.allowMeetingNegotiation ? "Allowed" : "Disabled"}
• Confirmation: ${meetingsStr}

🤝 *Negotiation:*
• Price Bargaining: ${policy.negotiation.allowPriceNegotiation ? "Allowed" : "Disabled"}
• Accept Final Deal: ${policy.negotiation.allowAcceptFinalOffer ? "Allowed within limits" : "Requires approval"}
      `.trim();

      return {
        success: true,
        message: summary,
        data: policy,
      };
    },
  });

  // 2. UPDATE POLICY
  registerAdminAction({
    actionId: "update_personal_delegation_policy",
    category: "personal_assistant",
    label: "Update Personal Assistant Policy",
    description: "Updates delegation rules, spending caps, or data disclosure settings for your Personal Assistant.",
    riskLevel: "CRITICAL",
    requiredRole: "owner",
    requiresConfirmation: true, // Broadening changes require explicit confirmation
    idempotent: false,
    auditEventType: "personal_delegation_policy_updated",
    handler: async (context, params) => {
      if (!isPersonalAssistantFeatureEnabled()) {
        return { success: false, message: "Personal Assistant feature is currently disabled." };
      }

      const current = await getPersonalDelegationPolicy(context.accountId, params?.personalInstanceId);

      const updates: Partial<PersonalDelegationPolicy> = {};

      // Parse order updates
      if (params?.orders) {
        updates.orders = {
          ...current.orders,
          ...params.orders,
        };
      }

      // Parse data disclosure updates
      if (params?.dataDisclosure) {
        updates.dataDisclosure = {
          ...current.dataDisclosure,
          ...params.dataDisclosure,
        };
      }

      // Parse appointment updates
      if (params?.appointments) {
        updates.appointments = {
          ...current.appointments,
          ...params.appointments,
        };
      }

      // Parse negotiation updates
      if (params?.negotiation) {
        updates.negotiation = {
          ...current.negotiation,
          ...params.negotiation,
        };
      }

      // Broadening check: if making assistant more autonomous and confirmation wasn't explicitly given
      const broadening = isBroadeningPolicyChange(current, updates);
      if (broadening.isBroadening && !params?.confirmed) {
        const listStr = broadening.reasons.map((r) => `• ${r}`).join("\n");
        return {
          success: false,
          requiresConfirmation: true,
          message: `⚠️ *Safety Confirmation Required*\n\nThe requested change broadens autonomous capability:\n${listStr}\n\n_Reply "Confirm" to apply this change, or "Cancel" to keep existing restrictions._`,
        };
      }

      const mergedPolicy: PersonalDelegationPolicy = {
        ...current,
        ...updates,
        orders: updates.orders || current.orders,
        dataDisclosure: updates.dataDisclosure || current.dataDisclosure,
        appointments: updates.appointments || current.appointments,
        negotiation: updates.negotiation || current.negotiation,
        communication: updates.communication || current.communication,
        updatedBy: context.adminJid || "owner_admin_ba",
      };

      const saved = await savePersonalDelegationPolicy(mergedPolicy, params?.expectedRevision);

      return {
        success: true,
        message: `✅ *Delegation Policy Updated*\n\nYour Personal Assistant permissions have been updated to version \`${saved.policyVersion}\`.`,
        data: saved,
      };
    },
  });

  // 3. EVALUATE ACTION (PREVIEW)
  registerAdminAction({
    actionId: "evaluate_action_authorization",
    category: "personal_assistant",
    label: "Evaluate Action Authorization",
    description: "Evaluates whether an action would be allowed, require approval, or be blocked under current policy.",
    riskLevel: "READ",
    requiredRole: "owner",
    requiresConfirmation: false,
    idempotent: true,
    auditEventType: "personal_action_evaluated",
    handler: async (context, params) => {
      const decision = await evaluatePersonalActionAuthorization({
        accountId: context.accountId,
        personalInstanceId: params?.personalInstanceId || "default",
        targetContactId: params?.targetContactId,
        targetPhoneOrJid: params?.targetPhoneOrJid,
        actionType: params?.actionType || "WHATSAPP_SEND",
        taskId: params?.taskId,
        proposedPayload: params?.payload || {},
        actorRole: context.adminRole || "owner",
      });

      return {
        success: true,
        message: `🔍 *Authorization Evaluation: ${decision.decision}*\n\n• *Reason Code:* \`${decision.reasonCode}\`\n• *Risk Class:* \`${decision.riskClass}\`\n• *Details:* ${decision.reasonMessage}\n• *Policy Version:* \`${decision.policyVersion}\``,
        data: decision,
      };
    },
  });
}

// Auto-register tools
registerPersonalDelegationAdminTools();
