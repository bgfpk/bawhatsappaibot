import * as dbService from "./db-service.ts";
import { mergeLearnedRule, saveLearnedRule } from "./learning-service.ts";
import { composeImplicitCacheInstruction } from "./gemini-cache-service.ts";
import { withTimeout } from "./async-timeout.ts";
import { compactAiText } from "./ai-cost-control-service.ts";
import type { GeminiProviderContext } from "./gemini-provider-service.ts";
import { compactSummary, reduceRecentMessages, selectRelevantLearnedNotes } from "./ai-context-reducer-service.ts";
import { preserveClientTrainingText } from "./instruction-compaction-service.ts";
import { generateBackendText } from "./ai-text-provider-service.ts";

function cleanText(value: any, limit = 4000) {
  return compactAiText(value, limit);
}

function extractJsonObject(value: any) {
  const text = String(value || "").trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced || text.match(/\{[\s\S]*\}/)?.[0] || text;
  try {
    return JSON.parse(candidate);
  } catch {
    return {};
  }
}

function normalizeNotes(notes: any) {
  if (!Array.isArray(notes)) return [];
  const unique: string[] = [];
  for (const note of notes) {
    const clean = cleanText(note, 500);
    if (!clean || clean.length < 12) continue;
    if (!unique.some((existing) => existing.toLowerCase() === clean.toLowerCase())) {
      unique.push(clean);
    }
  }
  return unique.slice(0, 3);
}

export async function learnFromManualReply(input: {
  botId?: string;
  botConfig: any;
  dataOwnerKey: string;
  customerJid: string;
  manualText: string;
  manualKind: string;
  customerName?: string;
  sharedInstructions?: string;
  existingLearned?: string;
  existingSummary?: string;
  recentHistory?: { role: string; text: string }[];
  providerContext?: GeminiProviderContext;
}) {
  const manualText = cleanText(input.manualText, 2000);
  if (!manualText || !input.botId) {
    return { learnedInstructions: input.botConfig?.learned_instructions || "", notes: [], chatSummary: "" };
  }

  const history = reduceRecentMessages(input.recentHistory || [], 8)
    .map((m) => `${m.role === "user" ? "Customer" : "Assistant/Admin"}: ${cleanText(m.text, 350)}`)
    .join("\n");
  const compactSharedInstructions = preserveClientTrainingText(input.sharedInstructions || "", 1200);
  const relevantLearned = selectRelevantLearnedNotes(input.manualText, input.existingLearned || input.botConfig?.learned_instructions || "", 5);

  const prompt = `
You improve a WhatsApp sales/support AI by learning from a human/admin manual reply.

Return ONLY valid JSON:
{
  "chatSummary": "updated customer-specific summary, or empty string",
  "learningNotes": ["reusable lesson 1", "reusable lesson 2"]
}

Rules:
- Do not save every manual message blindly.
- learningNotes must be reusable across future customers for this business.
- Avoid duplicates or anything already covered in Shared AI Instructions or Existing Self Learned Knowledge.
- Do not save one-off customer facts as learningNotes; put customer-specific facts in chatSummary.
- Learn tone, wording style, objection handling, sales/support approach, policy corrections, product explanations, and useful business rules.
- If the manual reply is only a shortcut/placeholder/unclear media with no reusable insight, learningNotes must be [].
- chatSummary should preserve important customer facts and strict manual commitments/details the bot must respect later.

Shared AI Instructions:
${compactSharedInstructions || "(none)"}

Existing Self Learned Knowledge:
${cleanText(relevantLearned, 1200) || "(none)"}

Existing Customer Chat Summary:
${compactSummary(input.existingSummary, 1000) || "(none)"}

Recent Conversation:
${history || "(none)"}

Manual Reply Kind: ${input.manualKind}
Customer: ${input.customerName || input.customerJid}
Manual Reply:
${manualText}
`.trim();

  try {
    const systemInstruction = composeImplicitCacheInstruction("You extract concise reusable AI training notes and customer chat summaries for BlackArrow WhatsApp bots. Output valid JSON only.");
    const providerContext = input.providerContext;
    const response = await withTimeout(
      generateBackendText({
        purpose: providerContext?.purpose || "manual_learning",
        accountId: providerContext?.accountId || providerContext?.userId || input.dataOwnerKey,
        botId: providerContext?.botId || input.botId || input.dataOwnerKey,
        customerJid: providerContext?.billingContext?.customerJid || input.customerJid,
        stablePrompt: systemInstruction,
        latestCustomerMessage: prompt,
        maxTokens: 450,
        jsonMode: true,
      }),
      45000,
      "Manual learning analysis timed out"
    );
    if (response.requestStatus !== "success" || !response.text) {
      const blocked: any = new Error(response.fallbackReason || response.requestStatus || "deepinfra_unavailable_text_generation_blocked");
      blocked.code = response.fallbackReason || response.requestStatus || "deepinfra_unavailable_text_generation_blocked";
      throw blocked;
    }
    const parsed = extractJsonObject(response.text);
    const notes = normalizeNotes(parsed.learningNotes);
    const chatSummary = cleanText(parsed.chatSummary, 2500);

    if (chatSummary) {
      await dbService.updateCustomerProfile(input.dataOwnerKey, input.customerJid, { chatSummary });
    }

    let learnedInstructions = input.botConfig?.learned_instructions || "";
    for (const note of notes) {
      const next = mergeLearnedRule(learnedInstructions, note);
      if (next !== learnedInstructions) {
        learnedInstructions = await saveLearnedRule(input.botId, { ...(input.botConfig || {}), learned_instructions: learnedInstructions }, note);
      }
    }

    return { learnedInstructions, notes, chatSummary };
  } catch (e: any) {
    console.error("[ManualLearning] Failed:", e?.message || e);
    return { learnedInstructions: input.botConfig?.learned_instructions || "", notes: [], chatSummary: "" };
  }
}
