import * as dbService from './db-service.ts';

const normalizeRule = (value: any) => String(value || "").replace(/\s+/g, " ").trim();

export function mergeLearnedRule(existing: any, newRule: any) {
  const cleanRule = normalizeRule(newRule);
  if (!cleanRule) return normalizeRule(existing);

  const rules = String(existing || "")
    .split("\n")
    .map(normalizeRule)
    .filter(Boolean);

  const exists = rules.some(rule => rule.toLowerCase() === cleanRule.toLowerCase());
  if (!exists) rules.push(cleanRule);

  return rules.slice(-80).map(rule => `- ${rule.replace(/^[-\s]+/, "")}`).join("\n");
}

export async function saveLearnedRule(botId: string | undefined, botConfig: any, newRule: string) {
  if (!botId) return "";
  const updatedRules = mergeLearnedRule(botConfig?.learned_instructions, newRule);
  if (!updatedRules) return "";

  await dbService.saveBotConfig(botId, {
    ...(botConfig || {}),
    learned_instructions: updatedRules
  });

  return updatedRules;
}
