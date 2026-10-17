/**
 * Personal Outbound Mission Planner & Conversation Engine
 * 
 * Assembles safe prompts and generates messages for Outbound Personal Missions:
 * - First outbound message generation with transparent assistant identity
 * - Continuation turn generation for goal-oriented information gathering
 * - Completion detection (grounded result summaries)
 * - Missing owner information detection (NEEDS_OWNER escalation)
 * - Opt-out and third-party redirection detection
 * - Strict boundaries: No binding commitments, orders, appointments, or payments
 */

import { generateBackendText, type DeepInfraChatMessage } from "./ai-text-provider-service.ts";
import { formatWhatsAppResponse } from "./whatsapp-ai-response-style-service.ts";
import { extractSafeOwnerRepresentation } from "./personal-incoming-context-service.ts";
import { getIncomingPersonalAssistantSettings } from "./personal-incoming-settings-service.ts";
import type { PersonalContact } from "./personal-contact-types.ts";
import type {
  PersonalOutboundMission,
  PersonalOutboundCollectedFact,
} from "./personal-outbound-types.ts";

const plannerDeps = {
  generateBackendText,
};

export function __setPersonalOutboundPlannerTestDeps(overrides: Partial<typeof plannerDeps>) {
  Object.assign(plannerDeps, overrides || {});
}

export function __resetPersonalOutboundPlannerTestDeps() {
  Object.assign(plannerDeps, {
    generateBackendText,
  });
}

export interface FirstMessageGenerationResult {
  messageText: string;
  isSendOnly: boolean;
}

export interface MissionContinuationResult {
  replyText?: string;
  isComplete: boolean;
  isOptOut: boolean;
  needsOwner: boolean;
  unresolvedQuestion?: string;
  resultSummary?: string;
  collectedFacts?: PersonalOutboundCollectedFact[];
}

/**
 * Checks if target message is a clear opt-out request.
 */
export function isTargetOptOutMessage(text: string): boolean {
  const t = String(text || "").trim().toLowerCase();
  if (
    t === "stop" ||
    t.includes("unsubscribe") ||
    t.includes("stop messaging") ||
    t.includes("don't contact me") ||
    t.includes("dont contact me") ||
    t.includes("leave me alone") ||
    t.includes("do not text me") ||
    t.includes("wrong number")
  ) {
    return true;
  }
  return false;
}

/**
 * Checks if target message is redirecting to another third-party number.
 */
export function extractTargetRedirection(text: string): string | null {
  const t = String(text || "").trim().toLowerCase();
  if (
    t.includes("contact this number") ||
    t.includes("call this number") ||
    t.includes("message this number") ||
    t.includes("contact my colleague") ||
    t.includes("speak to")
  ) {
    return text.trim();
  }
  return null;
}

/**
 * Generates the initial outbound message for a mission.
 */
export async function generateFirstOutboundMissionMessage(params: {
  mission: PersonalOutboundMission;
  contact?: PersonalContact | null;
  ownerName?: string;
}): Promise<FirstMessageGenerationResult> {
  const { mission, contact, ownerName = "Owner" } = params;

  // 1. Check if simple send-only message (e.g. "Tell Ahmed I'll be 20 minutes late")
  const goalLower = mission.goal.toLowerCase();
  const isSendOnly =
    mission.isSendOnly === true ||
    (goalLower.startsWith("tell ") && !goalLower.includes("ask") && !goalLower.includes("price") && !goalLower.includes("fee"));

  if (isSendOnly && mission.ownerInstructions.trim()) {
    // If owner gave direct text to send, format it directly
    const directText = formatWhatsAppResponse(mission.ownerInstructions);
    return { messageText: directText, isSendOnly: true };
  }

  // 2. Fetch Safe Owner360 context and assistant settings
  const settings = await getIncomingPersonalAssistantSettings(mission.accountId, mission.personalInstanceId);
  const safeOwner = await extractSafeOwnerRepresentation(mission.accountId, settings);
  const assistantName = settings.assistantDisplayName || "Personal Assistant";

  // 3. Assemble System Prompt with Strict Invariants
  const systemPrompt = `You are ${assistantName}, the personal assistant to ${safeOwner.ownerPreferredName || ownerName}.
You are sending an outbound WhatsApp message on behalf of ${safeOwner.ownerPreferredName || ownerName} to ${mission.targetIdentity.displayName || "the contact"}.

MISSION GOAL:
${mission.goal}

OWNER INSTRUCTIONS:
${mission.ownerInstructions || "Politely ask the recipient."}

CONSTRAINTS:
${(mission.constraints || []).map((c) => `- ${c}`).join("\n") || "- Keep it brief and polite."}

CORE INVARIANTS:
1. SENDER IDENTITY:
   - You act as the assistant to ${safeOwner.ownerPreferredName || ownerName}.
   - In your opening, introduce yourself naturally: "I'm ${assistantName}, ${safeOwner.ownerPreferredName || ownerName}'s assistant."
   - Never claim to be ${safeOwner.ownerPreferredName || ownerName} directly.
2. NATURAL & CONCISE:
   - Write a single concise, polite, natural message for WhatsApp.
   - Do NOT sound like a sales bot or corporate marketing message.
3. STRICT NO BINDING COMMITMENTS:
   - You CANNOT book appointments, confirm orders, make payments, accept contracts, or share credentials.
   - You are solely inquiring/requesting information as directed.
4. PRIVACY:
   - Never share private home addresses, passwords, bank details, or private notes.
   - Only mention details explicitly authorized in the owner instructions.

Generate ONLY the exact message text to send to the recipient.`;

  const messages: DeepInfraChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: `Compose the initial message for this mission.` },
  ];

  let text = "";
  try {
    const aiResult = await plannerDeps.generateBackendText({
      messages,
      purpose: "personal_assistant_outbound_first_message",
      accountId: mission.accountId,
      botId: mission.personalInstanceId,
      customerJid: mission.targetIdentity.jid,
      temperature: 0.6,
      maxTokens: 250,
    });
    text = aiResult.text || "";
  } catch (err: any) {
    console.warn("[PersonalOutboundPlanner] AI generation failed, falling back to direct instructions:", err?.message || err);
    text = `Hello, I am reaching out on behalf of ${ownerName} regarding: ${mission.goal}`;
  }

  const cleanText = formatWhatsAppResponse(text.trim());
  return {
    messageText: cleanText,
    isSendOnly: isSendOnly,
  };
}

/**
 * Plans the continuation turn when the target replies during an active mission.
 */
export async function planMissionContinuationTurn(params: {
  mission: PersonalOutboundMission;
  targetInboundText: string;
  conversationHistory: Array<{ role: "user" | "assistant" | "model"; text: string }>;
  contact?: PersonalContact | null;
  ownerName?: string;
}): Promise<MissionContinuationResult> {
  const { mission, targetInboundText, conversationHistory, contact, ownerName = "Owner" } = params;

  // 1. Opt-out check
  if (isTargetOptOutMessage(targetInboundText)) {
    return {
      isOptOut: true,
      isComplete: false,
      needsOwner: false,
      replyText: "Understood. I will not contact you further. Thank you.",
    };
  }

  // 2. Third-party redirection check
  const redirection = extractTargetRedirection(targetInboundText);
  if (redirection) {
    return {
      isOptOut: false,
      isComplete: false,
      needsOwner: true,
      unresolvedQuestion: `Recipient redirected to another contact: "${redirection}"`,
    };
  }

  // 3. Fetch Settings & Safe Context
  const settings = await getIncomingPersonalAssistantSettings(mission.accountId, mission.personalInstanceId);
  const safeOwner = await extractSafeOwnerRepresentation(mission.accountId, settings);
  const assistantName = settings.assistantDisplayName || "Personal Assistant";

  // 4. Assemble Continuation Prompt
  const systemPrompt = `You are ${assistantName}, the personal assistant to ${safeOwner.ownerPreferredName || ownerName}.
You are in an active conversation on WhatsApp with ${mission.targetIdentity.displayName || "the recipient"} to achieve a specific mission.

MISSION GOAL:
${mission.goal}

OWNER INSTRUCTIONS:
${mission.ownerInstructions}

CONSTRAINTS:
${(mission.constraints || []).map((c) => `- ${c}`).join("\n") || "- Keep it brief and polite."}

RULES FOR YOUR RESPONSE:
1. EVALUATE COMPLETION:
   - If the recipient has provided the requested information (e.g. price, availability, fee, timing, service answer), include the tag:
     [MISSION_COMPLETE: <concise factual summary of the obtained information>]
     at the very end of your reply.
   - If the mission is complete, politely thank them and wrap up.
2. MISSING OWNER INFORMATION:
   - If the recipient asks a question or requires a decision that only the owner can make (e.g. "Which color?", "What is your address?", "Do you want 16GB or 32GB?"):
     DO NOT GUESS OR HALLUCINATE.
     Politely tell them you will check with ${safeOwner.ownerPreferredName || ownerName}.
     Include the tag:
     [NEEDS_OWNER: <exact question from recipient that owner needs to answer>]
     at the very end of your reply.
3. LIMITED NEGOTIATION / QUESTIONS:
   - You may ask follow-up questions, inquire about discounts, or clarify availability if permitted by constraints.
   - You CANNOT confirm orders, make payments, promise money, accept contracts, or book appointments.
4. PRIVACY:
   - Never share passwords, bank accounts, or private owner addresses.

Format your response cleanly for WhatsApp.`;

  const messages: DeepInfraChatMessage[] = [
    { role: "system", content: systemPrompt },
  ];

  // Append recent context
  for (const turn of conversationHistory.slice(-6)) {
    messages.push({
      role: turn.role === "user" ? "user" : "assistant",
      content: turn.text,
    });
  }

  // Append current inbound message
  messages.push({
    role: "user",
    content: targetInboundText,
  });

  let rawReply = "";
  try {
    const aiResult = await plannerDeps.generateBackendText({
      messages,
      purpose: "personal_assistant_outbound_continuation",
      accountId: mission.accountId,
      botId: mission.personalInstanceId,
      customerJid: mission.targetIdentity.jid,
      temperature: 0.5,
      maxTokens: 250,
    });
    rawReply = aiResult.text || "";
  } catch (err: any) {
    console.warn("[PersonalOutboundPlanner] Continuation generation failed:", err?.message || err);
    return {
      isComplete: false,
      isOptOut: false,
      needsOwner: true,
      unresolvedQuestion: `AI generation failed while processing recipient response: "${targetInboundText.slice(0, 100)}"`,
    };
  }

  // Parse Tags
  let cleanText = rawReply;
  let isComplete = false;
  let resultSummary: string | undefined;
  let needsOwner = false;
  let unresolvedQuestion: string | undefined;
  const collectedFacts: PersonalOutboundCollectedFact[] = [];

  const completeMatch = cleanText.match(/\[MISSION_COMPLETE:\s*([\s\S]*?)\]/i);
  if (completeMatch) {
    isComplete = true;
    resultSummary = completeMatch[1].trim();
    cleanText = cleanText.replace(completeMatch[0], "").trim();

    collectedFacts.push({
      key: "mission_result",
      value: resultSummary,
      timestamp: Date.now(),
      sourceMessage: targetInboundText.slice(0, 150),
    });
  }

  const needsOwnerMatch = cleanText.match(/\[NEEDS_OWNER:\s*([\s\S]*?)\]/i);
  if (needsOwnerMatch) {
    needsOwner = true;
    unresolvedQuestion = needsOwnerMatch[1].trim();
    cleanText = cleanText.replace(needsOwnerMatch[0], "").trim();
  }

  // Also extract any explicit price quote if present
  const priceMatch = targetInboundText.match(/(?:rs\.?|pkr|\$|usd|eur|£)\s*([0-9,]+)/i);
  if (priceMatch) {
    collectedFacts.push({
      key: "quoted_price",
      value: priceMatch[0],
      timestamp: Date.now(),
      sourceMessage: targetInboundText.slice(0, 100),
    });
  }

  return {
    replyText: formatWhatsAppResponse(cleanText),
    isComplete,
    isOptOut: false,
    needsOwner,
    unresolvedQuestion,
    resultSummary,
    collectedFacts,
  };
}
