import { compactAiText } from "./ai-cost-control-service.ts";
import {
  getSequenceDisplayName,
  getSequenceFlag,
  getSequenceShortcut,
  getSequenceTriggers,
  messageMatchesTrigger,
  normalizeSequenceText,
  resolveSequenceForAiChoice,
} from "./sequence-trigger-service.ts";
import { isSequenceSentValue, shouldHideSequencesFromAi } from "./sequence-delivery-guard-service.ts";

const MAX_SEQUENCE_GUIDE_ITEMS = 12;

export function buildSequenceDecisionGuide(cachedKeywordSequences: Record<string, any> = {}) {
  return buildSequenceDecisionGuideWithState(cachedKeywordSequences);
}

export function buildSequenceDecisionGuideWithState(cachedKeywordSequences: Record<string, any> = {}, profile: any = {}) {
  if (shouldHideSequencesFromAi(profile)) return "";

  const entries = Object.entries(cachedKeywordSequences || {})
    .filter(([, sequence]: any) => sequence?.templates?.length > 0)
    .filter(([key, sequence]: any) => {
      const sentValue = profile?.[getSequenceFlag(key, sequence)];
      return !isSequenceSentValue(sentValue);
    })
    .slice(0, MAX_SEQUENCE_GUIDE_ITEMS);

  if (entries.length === 0) return "";

  const lines = entries.map(([key, sequence]: any) => {
    const name = getSequenceDisplayName(key, sequence);
    const code = getSequenceShortcut(sequence?.config) || name;
    const keywords = getSequenceTriggers(sequence?.config).slice(0, 12).join(", ");
    const instructions = compactAiText(sequence?.config?.instructions || "", 280);
    return [
      `- ${name}`,
      `  sendMediaFile media_name: ${code}`,
      keywords ? `  intent keywords: ${keywords}` : "",
      instructions ? `  when to send: ${instructions}` : "",
    ].filter(Boolean).join("\n");
  });

  return `\n\n=== AUTOMATION SEQUENCES ===
These are ready-to-send WhatsApp template sequences. Decide from the customer's product/service interest, not exact keyword only.
If one sequence clearly matches what the customer is asking about, call sendMediaFile with the listed media_name. Do not invent a code.
Use a sequence once, then continue normally if it was already sent.
Keep this decision cheap: choose only when the match is clear.
${lines.join("\n")}`;
}

export function findSequenceForAiChoice(cachedKeywordSequences: Record<string, any> = {}, choice: any) {
  return resolveSequenceForAiChoice(cachedKeywordSequences, choice);
}

export function findAutomaticSequenceCandidate(
  cachedKeywordSequences: Record<string, any> = {},
  messageText: any,
  profile: any = {}
) {
  if (shouldHideSequencesFromAi(profile)) return null;

  const normalizedMessage = normalizeSequenceText(messageText);
  if (!normalizedMessage) return null;

  let best: any = null;
  for (const [key, sequence] of Object.entries(cachedKeywordSequences || {})) {
    if (!sequence?.templates?.length) continue;
    const sentValue = profile?.[getSequenceFlag(key, sequence)];
    if (isSequenceSentValue(sentValue)) continue;

    const name = getSequenceDisplayName(key, sequence);
    const shortcut = getSequenceShortcut(sequence?.config);
    const instructionWords = String(sequence?.config?.instructions || "")
      .split(/[,\n.،]/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 3)
      .slice(0, 12);
    const candidates = [key, name, shortcut, ...getSequenceTriggers(sequence?.config), ...instructionWords].filter(Boolean);

    let score = 0;
    for (const candidate of candidates) {
      const normalizedCandidate = normalizeSequenceText(candidate);
      if (!normalizedCandidate) continue;
      if (normalizedMessage === normalizedCandidate) score = Math.max(score, 100);
      else if (messageMatchesTrigger(messageText, candidate)) score = Math.max(score, 75);
      else if (normalizedCandidate.length >= 4 && normalizedMessage.includes(normalizedCandidate)) score = Math.max(score, 65);
    }

    if (score > (best?.score || 0)) best = { key, sequence, score };
  }

  return best && best.score >= 65 ? { key: best.key, sequence: best.sequence, matchedBy: "auto-instructions" as const } : null;
}
