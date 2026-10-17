/**
 * Personal Owner Escalation Service
 * 
 * Handles routing unanswerable questions or decisions requiring owner attention
 * from Personal WhatsApp conversations to the owner via their controlling Business WhatsApp channel.
 * Implements deduplication to prevent notification spam.
 */

import { createHash } from "node:crypto";
import { formatWhatsAppResponse } from "./whatsapp-ai-response-style-service.ts";
import type { PersonalOwnerEscalationEvent } from "./personal-incoming-types.ts";

// In-memory escalation store with cooldown deduplication
// Key: `${tenantId}::${contactId}::${hash(question)}`
const activeEscalations = new Map<string, PersonalOwnerEscalationEvent>();
const ESCALATION_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes cooldown for identical question

function hashText(text: string): string {
  return createHash("sha256").update(text.toLowerCase().trim()).digest("hex").slice(0, 16);
}

export function __clearEscalationsForTest(): void {
  activeEscalations.clear();
}

export interface CreatePersonalEscalationInput {
  tenantId: string;
  personalInstanceId: string;
  controlBusinessInstanceId: string;
  contactId: string;
  contactDisplayName: string;
  contactPhone: string | null;
  questionOrDecision: string;
  contextSnippet: string;
  sendBusinessNotification?: (notificationText: string) => Promise<{ success: boolean; messageId?: string }>;
}

export interface CreatePersonalEscalationResult {
  created: boolean;
  isDuplicate: boolean;
  escalation: PersonalOwnerEscalationEvent;
  notificationSent: boolean;
}

/**
 * Creates an escalation event and dispatches a notification to the owner via their Business WhatsApp instance.
 */
export async function createPersonalOwnerEscalation(
  input: CreatePersonalEscalationInput
): Promise<CreatePersonalEscalationResult> {
  const {
    tenantId,
    personalInstanceId,
    controlBusinessInstanceId,
    contactId,
    contactDisplayName,
    contactPhone,
    questionOrDecision,
    contextSnippet,
    sendBusinessNotification,
  } = input;

  const qHash = hashText(questionOrDecision);
  const dedupKey = `${tenantId}::${contactId}::${qHash}`;
  const now = Date.now();

  // Deduplication check
  const existing = activeEscalations.get(dedupKey);
  if (existing && now - existing.createdAt < ESCALATION_COOLDOWN_MS) {
    return {
      created: false,
      isDuplicate: true,
      escalation: existing,
      notificationSent: false,
    };
  }

  const escalationId = `pesc_${createHash("sha256").update(`${dedupKey}_${now}`).digest("hex").slice(0, 16)}`;
  const escalation: PersonalOwnerEscalationEvent = {
    escalationId,
    tenantId,
    personalInstanceId,
    controlBusinessInstanceId,
    contactId,
    contactDisplayName,
    contactPhone,
    questionOrDecision,
    contextSnippet,
    status: "pending",
    createdAt: now,
  };

  activeEscalations.set(dedupKey, escalation);

  // Dispatch notification to owner via Business WhatsApp channel if sender provided
  let notificationSent = false;
  if (typeof sendBusinessNotification === "function") {
    const contactSafeLabel = contactPhone ? `${contactDisplayName} (${contactPhone})` : contactDisplayName;
    const notificationText = formatWhatsAppResponse(`
🔔 *Personal Assistant Notice*

Your Personal Assistant received a message requiring your input:

👤 *From:* ${contactSafeLabel}
❓ *Question/Decision:* ${questionOrDecision}
💬 *Context:* "${contextSnippet}"

_You can reply to them directly from your Personal WhatsApp or review recent messages through this chat._
    `.trim());

    try {
      const res = await sendBusinessNotification(notificationText);
      if (res && res.success) {
        notificationSent = true;
        escalation.status = "notified";
        escalation.notificationMessageId = res.messageId;
      }
    } catch (err: any) {
      console.warn("[PersonalEscalation] Failed dispatching owner notification:", err?.message || err);
    }
  }

  return {
    created: true,
    isDuplicate: false,
    escalation,
    notificationSent,
  };
}

/**
 * Lists pending escalations for a tenant.
 */
export function listPendingPersonalEscalations(tenantId: string): PersonalOwnerEscalationEvent[] {
  const results: PersonalOwnerEscalationEvent[] = [];
  for (const esc of activeEscalations.values()) {
    if (esc.tenantId === tenantId && (esc.status === "pending" || esc.status === "notified")) {
      results.push(esc);
    }
  }
  return results;
}
