/**
 * Incoming Personal Assistant Context Assembly Service
 * 
 * Assembles sanitized, privacy-preserving model context for incoming Personal Assistant replies.
 * Strictly adheres to Prompt 4 Owner360 disclosure constraints (no addresses, phones, emails,
 * or private facts leaked) and Personal Contact memory isolation.
 */

import { getOwnerProfile } from "./owner360-service.ts";
import { getPersonalContactContext } from "./personal-contact-memory-service.ts";
import * as dbService from "./db-service.ts";
import type { PersonalContact } from "./personal-contact-types.ts";
import type {
  PersonalIncomingAssistantSettings,
  SafeOwner360RepresentationContext,
  PersonalAssistantModelContext,
} from "./personal-incoming-types.ts";

export interface AssemblePersonalContextInput {
  tenantId: string;
  instanceId: string;
  dataOwnerKey: string;
  remoteJid: string;
  contact?: PersonalContact | null;
  messageId: string;
  incomingText: string;
  hasMedia?: boolean;
  mediaType?: string;
  settings: PersonalIncomingAssistantSettings;
  recentMessagesLimit?: number;
}

/**
 * Extracts only the safe representation fields from Owner360 for assistant introduction.
 * Strictly enforces Prompt 4 rule: PRIVATE, ASK_BEFORE_SHARE, and ALLOW_FOR_AUTHORIZED_TASK
 * fields (addresses, emails, phone numbers, custom facts, delivery notes) are completely excluded.
 */
export async function extractSafeOwnerRepresentation(
  tenantId: string,
  settings: PersonalIncomingAssistantSettings
): Promise<SafeOwner360RepresentationContext> {
  let preferredName = "Owner";
  let communicationStyle = "professional";
  let primaryLanguages = ["en"];
  let timezone = "UTC";

  try {
    const profile = await getOwnerProfile(tenantId);
    if (profile) {
      if (profile.identity?.preferredName?.trim()) {
        preferredName = profile.identity.preferredName.trim();
      } else if (profile.identity?.fullName?.trim()) {
        preferredName = profile.identity.fullName.trim();
      }
      if (profile.communicationPreferences?.tone) {
        communicationStyle = profile.communicationPreferences.tone;
      }
      if (Array.isArray(profile.locale?.preferredLanguages) && profile.locale.preferredLanguages.length > 0) {
        primaryLanguages = profile.locale.preferredLanguages;
      }
      if (profile.locale?.timezone) {
        timezone = profile.locale.timezone;
      }
    }
  } catch (err: any) {
    // Fail gracefully to safe generic representation
  }

  const assistantDisplayName = settings.assistantDisplayName?.trim() || "Personal Assistant";

  return {
    ownerPreferredName: preferredName,
    assistantDisplayName,
    communicationStyle,
    primaryLanguages,
    timezone,
  };
}

/**
 * Determines whether the assistant should introduce its identity in this reply.
 * Avoids repetitive introductions if the assistant has already disclosed its identity recently.
 */
export function shouldDiscloseIdentity(
  settings: PersonalIncomingAssistantSettings,
  recentHistory: Array<{ role: string; text: string }>
): boolean {
  if (settings.disclosureMode === "never") return false;
  if (settings.disclosureMode === "always") return true;

  // "first_contact" mode: Check if assistant already introduced itself in recent conversation
  if (!recentHistory || recentHistory.length === 0) return true;

  const assistantIntroPatterns = [
    /assistant/i,
    /on behalf of/i,
    /speaking for/i,
    new RegExp(settings.assistantDisplayName, "i"),
  ];

  for (const msg of recentHistory) {
    if (msg.role === "model" || msg.role === "assistant") {
      for (const pattern of assistantIntroPatterns) {
        if (pattern.test(msg.text)) {
          return false; // Already introduced in recent window
        }
      }
    }
  }

  return true;
}

/**
 * Assembles full sanitized context for model prompt generation.
 */
export async function assemblePersonalAssistantContext(
  input: AssemblePersonalContextInput
): Promise<PersonalAssistantModelContext> {
  const { tenantId, instanceId, dataOwnerKey, remoteJid, settings } = input;

  // 1. Safe Owner360 representation context
  const ownerRepresentation = await extractSafeOwnerRepresentation(tenantId, settings);

  // 2. Personal Contact memory context
  let contactContext = input.contact ? getPersonalContactContext(input.contact) : null;
  if (!contactContext) {
    // Fabricate minimal safe context if contact doc was just created or unavailable
    contactContext = {
      contactId: input.contact?.contactId || "pc_unknown",
      displayName: input.contact?.displayName || remoteJid.split("@")[0],
      relationship: "acquaintance",
      communicationStatus: "active",
      trustedPhone: null,
      currentDurableFacts: [],
      activeTemporaryFacts: [],
      ownerNotes: [],
      messageCount: 1,
    };
  }

  // 3. Conversation History (Personal instance only, strictly isolated)
  const limit = input.recentMessagesLimit || 8;
  let conversationHistory: Array<{ role: "user" | "model" | "assistant"; text: string; timestamp?: number }> = [];

  try {
    const rawHistory = await dbService.getChatHistory(dataOwnerKey, remoteJid, limit).catch(() => []);
    if (Array.isArray(rawHistory)) {
      conversationHistory = rawHistory.map((h: any) => ({
        role: h.role === "user" ? ("user" as const) : ("model" as const),
        text: String(h.text || ""),
        timestamp: h.timestamp,
      }));
    }
  } catch {}

  // 4. Identity disclosure state
  const disclose = shouldDiscloseIdentity(settings, conversationHistory);

  return {
    settings,
    ownerRepresentation,
    contactContext,
    shouldDiscloseIdentity: disclose,
    conversationHistory,
    incomingMessage: {
      messageId: input.messageId,
      text: input.incomingText,
      hasMedia: input.hasMedia,
      mediaType: input.mediaType,
    },
  };
}
