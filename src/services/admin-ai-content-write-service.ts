import crypto from "node:crypto";
import {
  databases,
  DATABASE_ID,
  COLLECTIONS,
  Query,
} from "../config/appwrite-client.ts";
import type { AdminBusinessAssistantContext } from "./admin-identity-service.ts";
import type { AdminActionResult } from "./admin-action-registry-service.ts";
import * as dbService from "./db-service.ts";
import { resolveBotAiChatReplyMode } from "./bot-ai-chat-reply-mode-service.ts";
import {
  isSequenceSyncGroup,
  normalizeSequenceGroupPurpose,
  getSequenceGroupStableId,
  normalizeShortcutCode,
} from "../content-library/sequence-group-config-service.ts";
import {
  parseTemplateItem,
  buildSequenceGroupItems,
  buildMediaGroupItems,
  buildMediaLibraryItems,
  buildSavedReplyItems,
  buildWelcomeSequenceConfig,
} from "../content-library/content-library-runtime-adapter.ts";
import { sanitizeCourierText } from "./courier-broadcast-service.ts";

/**
 * Dependency injection container for Admin AI & Content Write Service.
 * Enables pure unit testing with 100% mockability.
 */
export const aiContentServiceDeps = {
  databases,
  dbService,
  nowSeconds: () => Math.floor(Date.now() / 1000),
};

export function setAiContentServiceDeps(overrides: Partial<typeof aiContentServiceDeps>) {
  Object.assign(aiContentServiceDeps, overrides);
}

export function resetAiContentServiceDeps() {
  aiContentServiceDeps.databases = databases;
  aiContentServiceDeps.dbService = dbService;
  aiContentServiceDeps.nowSeconds = () => Math.floor(Date.now() / 1000);
}

function getOwnerKey(context: AdminBusinessAssistantContext): string {
  return context.botId || context.accountId;
}

/**
 * Computes deterministic SHA-256 fingerprint of the bot's AI configuration
 * to prevent stale overwrite race conditions.
 */
export function computeAiConfigFingerprint(botDoc: any, config: any): string {
  const payload = {
    botId: botDoc?.$id || botDoc?.id || "",
    ai_enabled: config?.ai_chat_replies_enabled ?? config?.autoReply ?? true,
    prompt: config?.prompt || config?.systemPrompt || "",
    learned: config?.learned_instructions || config?.learnedInstructions || "",
    reply_mode: config?.replyBehavior || config?.reply_mode || "always_text",
    smart_sales: config?.smartSalesEngineEnabled ?? config?.smart_sales_enabled ?? false,
    updatedAt: botDoc?.updated_at || botDoc?.updatedAt || 0,
  };
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
}

/**
 * Helper to load bot and full operational configuration safely scoped to tenant.
 */
async function loadTenantBotAndConfig(context: AdminBusinessAssistantContext): Promise<{
  botDoc: any;
  config: any;
  templateStore: any;
}> {
  const botId = context.botId;
  const botDoc = await aiContentServiceDeps.databases.getDocument(DATABASE_ID, COLLECTIONS.BOTS, botId).catch(() => null) as any;
  if (!botDoc) {
    throw new Error(`Bot ${botId} not found.`);
  }

  // Tenant isolation check
  if (botDoc.user_id && botDoc.user_id !== context.accountId) {
    throw new Error("Access denied: Bot belongs to a different tenant account.");
  }

  const loadedConfig = await aiContentServiceDeps.dbService.loadBotConfig(botId).catch(() => null);
  const config = loadedConfig || (botDoc.config_settings ? (typeof botDoc.config_settings === "string" ? JSON.parse(botDoc.config_settings) : botDoc.config_settings) : {});

  const rawTemplates = await aiContentServiceDeps.dbService.loadTemplateStore(botId).catch(() => null);
  let templateStore: any = null;
  if (rawTemplates) {
    try {
      templateStore = typeof rawTemplates === "string" ? JSON.parse(rawTemplates) : rawTemplates;
    } catch {}
  }

  return { botDoc, config, templateStore };
}

/**
 * Helper to persist operational configuration through canonical dbService.
 */
async function persistBotConfig(botId: string, updatedConfig: any) {
  await aiContentServiceDeps.dbService.saveBotConfig(botId, updatedConfig);
}

// ---------------------------------------------------------------------------
// 1. AI CHAT REPLIES CONTROL (SENSITIVE_WRITE)
// ---------------------------------------------------------------------------

export async function handleGetAiChatReplyStatus(context: AdminBusinessAssistantContext): Promise<AdminActionResult> {
  const { botDoc, config } = await loadTenantBotAndConfig(context);
  const mode = resolveBotAiChatReplyMode(config);
  const botName = botDoc.name || config.botName || "BlackArrow Assistant";

  return {
    success: true,
    message: `🤖 *AI Chat Replies Status*\n\n• *Bot:* ${botName}\n• *AI Automated Replies:* ${mode.enabled ? "✅ *ON (Active)*" : "⏸️ *OFF (Paused)*"}\n• *State:* ${mode.enabled ? "Answering incoming customer messages with AI." : "Silent for incoming messages. Sequences, shortcuts & follow-ups remain active."}`,
    data: { enabled: mode.enabled, botName, botId: botDoc.$id },
  };
}

export async function handleEnableAiChatReplies(
  context: AdminBusinessAssistantContext,
  params: { expectedFingerprint?: string } = {}
): Promise<AdminActionResult> {
  const { botDoc, config } = await loadTenantBotAndConfig(context);

  if (params.expectedFingerprint) {
    const currentFingerprint = computeAiConfigFingerprint(botDoc, config);
    if (currentFingerprint !== params.expectedFingerprint) {
      return {
        success: false,
        message: "⚠️ AI settings changed in another session. Please review latest status and retry.",
      };
    }
  }

  config.ai_chat_replies_enabled = true;
  config.autoReply = true;
  config.ai_chat_replies_enabled_at = Date.now();

  await persistBotConfig(context.botId, config);

  // Authoritative readback
  const { config: readback } = await loadTenantBotAndConfig(context);
  const isEnabled = resolveBotAiChatReplyMode(readback).enabled;

  return {
    success: true,
    message: `✅ *AI Chat Replies Turned ON*\n\n• *Bot:* ${botDoc.name || "BlackArrow Assistant"}\n• *Status:* Active\n• AI will now respond to incoming customer messages automatically.`,
    data: { enabled: isEnabled },
  };
}

export async function handleDisableAiChatReplies(
  context: AdminBusinessAssistantContext,
  params: { expectedFingerprint?: string } = {}
): Promise<AdminActionResult> {
  const { botDoc, config } = await loadTenantBotAndConfig(context);

  if (params.expectedFingerprint) {
    const currentFingerprint = computeAiConfigFingerprint(botDoc, config);
    if (currentFingerprint !== params.expectedFingerprint) {
      return {
        success: false,
        message: "⚠️ AI settings changed in another session. Please review latest status and retry.",
      };
    }
  }

  config.ai_chat_replies_enabled = false;
  config.autoReply = false;

  await persistBotConfig(context.botId, config);

  // Authoritative readback
  const { config: readback } = await loadTenantBotAndConfig(context);
  const isEnabled = resolveBotAiChatReplyMode(readback).enabled;

  return {
    success: true,
    message: `⏸️ *AI Chat Replies Paused*\n\n• *Bot:* ${botDoc.name || "BlackArrow Assistant"}\n• *Status:* Paused\n• AI will stay silent for normal incoming messages. Shortcuts, sequences, and follow-ups will continue.`,
    data: { enabled: isEnabled },
  };
}

// ---------------------------------------------------------------------------
// 2. BOT IDENTITY / BASIC AI SETTINGS
// ---------------------------------------------------------------------------

export async function handleGetAiSettings(context: AdminBusinessAssistantContext): Promise<AdminActionResult> {
  const { botDoc, config } = await loadTenantBotAndConfig(context);

  const name = botDoc.name || config.botName || "BlackArrow Assistant";
  const language = config.preferredLanguage || config.language || "Roman Urdu / English";
  const businessType = config.businessType || config.business_type || "General Business";
  const replyMode = config.replyBehavior || config.reply_mode || "always_text";
  const rejectCalls = config.rejectCalls === 1 || config.rejectCalls === true;

  return {
    success: true,
    message: `⚙️ *AI Studio Settings*\n\n• *Bot Name:* ${name}\n• *Language:* ${language}\n• *Business Type:* ${businessType}\n• *Reply Mode:* ${replyMode}\n• *Call Handling:* ${rejectCalls ? "Auto-reject calls" : "Allow calls"}`,
    data: { name, language, businessType, replyMode, rejectCalls },
  };
}

export async function handleUpdateBotName(
  context: AdminBusinessAssistantContext,
  params: { botName: string }
): Promise<AdminActionResult> {
  const botName = String(params.botName || "").trim();
  if (!botName) return { success: false, message: "❌ Bot name cannot be empty." };

  const { botDoc, config } = await loadTenantBotAndConfig(context);
  config.botName = botName;

  await persistBotConfig(context.botId, config);

  try {
    await aiContentServiceDeps.databases.updateDocument(DATABASE_ID, COLLECTIONS.BOTS, context.botId, {
      name: botName,
      updated_at: aiContentServiceDeps.nowSeconds(),
    });
  } catch {}

  return {
    success: true,
    message: `✅ *Bot Name Updated*\n\n• *New Name:* ${botName}`,
    data: { botName },
  };
}

export async function handleUpdateAiLanguage(
  context: AdminBusinessAssistantContext,
  params: { language: string }
): Promise<AdminActionResult> {
  const language = String(params.language || "").trim();
  if (!language) return { success: false, message: "❌ Language cannot be empty." };

  const allowedLanguages = ["english", "urdu", "roman urdu", "roman_urdu", "arabic", "multilingual", "auto"];
  const isRecognized = allowedLanguages.some((l) => language.toLowerCase().includes(l));
  if (!isRecognized && language.length > 50) {
    return { success: false, message: `❌ Unsupported language '${language}'. Supported: English, Urdu, Roman Urdu, Arabic, Auto.` };
  }

  const { config } = await loadTenantBotAndConfig(context);
  config.preferredLanguage = language;
  config.language = language;

  await persistBotConfig(context.botId, config);

  return {
    success: true,
    message: `✅ *AI Language Updated*\n\n• *Preferred Language:* ${language}`,
    data: { language },
  };
}

export async function handleUpdateBusinessType(
  context: AdminBusinessAssistantContext,
  params: { businessType: string }
): Promise<AdminActionResult> {
  const businessType = String(params.businessType || "").trim();
  if (!businessType) return { success: false, message: "❌ Business type cannot be empty." };

  const { config } = await loadTenantBotAndConfig(context);
  config.businessType = businessType;
  config.business_type = businessType;

  await persistBotConfig(context.botId, config);

  return {
    success: true,
    message: `✅ *Business Type Updated*\n\n• *New Business Type:* ${businessType}`,
    data: { businessType },
  };
}

export async function handleUpdateAiBasicSettings(
  context: AdminBusinessAssistantContext,
  params: {
    botName?: string;
    language?: string;
    businessType?: string;
    botGender?: string;
    botVoice?: string;
  }
): Promise<AdminActionResult> {
  const { botDoc, config } = await loadTenantBotAndConfig(context);

  if (params.botName) {
    config.botName = params.botName.trim();
    try {
      await aiContentServiceDeps.databases.updateDocument(DATABASE_ID, COLLECTIONS.BOTS, context.botId, {
        name: params.botName.trim(),
        updated_at: aiContentServiceDeps.nowSeconds(),
      });
    } catch {}
  }
  if (params.language) {
    config.preferredLanguage = params.language.trim();
    config.language = params.language.trim();
  }
  if (params.businessType) {
    config.businessType = params.businessType.trim();
    config.business_type = params.businessType.trim();
  }
  if (params.botGender) config.botGender = params.botGender.trim();
  if (params.botVoice) config.botVoice = params.botVoice.trim();

  await persistBotConfig(context.botId, config);

  return {
    success: true,
    message: `✅ *AI Basic Settings Saved*\n\n• *Bot Name:* ${config.botName || botDoc.name}\n• *Language:* ${config.preferredLanguage || "Roman Urdu / English"}\n• *Business Type:* ${config.businessType || "General"}`,
    data: { config },
  };
}

// ---------------------------------------------------------------------------
// 3. SHARED AI INSTRUCTIONS
// ---------------------------------------------------------------------------

export async function handleGetSharedAiInstructions(context: AdminBusinessAssistantContext): Promise<AdminActionResult> {
  const { botDoc, config } = await loadTenantBotAndConfig(context);
  const prompt = String(config.prompt || config.systemPrompt || config.system_prompt || "").trim();

  const charCount = prompt.length;
  const wordCount = prompt ? prompt.split(/\s+/).length : 0;
  const fingerprint = computeAiConfigFingerprint(botDoc, config);

  if (!prompt) {
    return {
      success: true,
      message: `📝 *Shared AI Instructions*\n\nNo custom instructions configured yet. The bot uses standard business defaults.`,
      data: { charCount: 0, wordCount: 0, fingerprint },
    };
  }

  const preview = prompt.length > 300 ? prompt.slice(0, 300) + "..." : prompt;

  return {
    success: true,
    message: `📝 *Shared AI Instructions (${charCount.toLocaleString()} chars, ${wordCount} words)*\n\n${preview}\n\n• *Fingerprint:* \`${fingerprint}\``,
    data: { prompt, charCount, wordCount, fingerprint },
  };
}

export async function handleAppendAiInstruction(
  context: AdminBusinessAssistantContext,
  params: { instruction: string }
): Promise<AdminActionResult> {
  const newRule = String(params.instruction || "").trim();
  if (!newRule) return { success: false, message: "❌ Instruction text cannot be empty." };

  const { config } = await loadTenantBotAndConfig(context);
  const currentPrompt = String(config.prompt || config.systemPrompt || config.system_prompt || "").trim();

  const updatedPrompt = currentPrompt ? `${currentPrompt}\n\n${newRule}` : newRule;
  config.prompt = updatedPrompt;
  config.systemPrompt = updatedPrompt;

  await persistBotConfig(context.botId, config);

  return {
    success: true,
    message: `✅ *Instruction Added to Bot Training*\n\n📝 "${newRule}"\n\n• Total instruction length: ${updatedPrompt.length.toLocaleString()} characters.`,
    data: { prompt: updatedPrompt, charCount: updatedPrompt.length },
  };
}

export async function handleUpdateAiInstruction(
  context: AdminBusinessAssistantContext,
  params: { targetRule: string; newRule: string }
): Promise<AdminActionResult> {
  const target = String(params.targetRule || "").trim();
  const replacement = String(params.newRule || "").trim();
  if (!target) return { success: false, message: "❌ Target rule to replace is required." };
  if (!replacement) return { success: false, message: "❌ Replacement rule is required." };

  const { config } = await loadTenantBotAndConfig(context);
  const currentPrompt = String(config.prompt || config.systemPrompt || config.system_prompt || "");

  if (!currentPrompt.includes(target)) {
    return {
      success: false,
      message: `❌ Target rule not found in existing instructions: "${target}". Please check current instructions.`,
    };
  }

  const updatedPrompt = currentPrompt.replace(target, replacement);
  config.prompt = updatedPrompt;
  config.systemPrompt = updatedPrompt;

  await persistBotConfig(context.botId, config);

  return {
    success: true,
    message: `✅ *AI Instruction Rule Updated*\n\n• *Replaced:* "${target}"\n• *New Rule:* "${replacement}"`,
    data: { prompt: updatedPrompt },
  };
}

export async function handleRemoveAiInstruction(
  context: AdminBusinessAssistantContext,
  params: { targetRule: string }
): Promise<AdminActionResult> {
  const target = String(params.targetRule || "").trim();
  if (!target) return { success: false, message: "❌ Target rule to remove is required." };

  const { config } = await loadTenantBotAndConfig(context);
  const currentPrompt = String(config.prompt || config.systemPrompt || config.system_prompt || "");

  if (!currentPrompt.includes(target)) {
    return {
      success: false,
      message: `❌ Target rule not found in instructions: "${target}".`,
    };
  }

  const updatedPrompt = currentPrompt.replace(target, "").replace(/\n{3,}/g, "\n\n").trim();
  config.prompt = updatedPrompt;
  config.systemPrompt = updatedPrompt;

  await persistBotConfig(context.botId, config);

  return {
    success: true,
    message: `✅ *AI Instruction Rule Removed*\n\n🗑️ "${target}"`,
    data: { prompt: updatedPrompt },
  };
}

export async function handleReplaceSharedAiInstructions(
  context: AdminBusinessAssistantContext,
  params: { newInstructions: string; expectedFingerprint?: string }
): Promise<AdminActionResult> {
  const newText = String(params.newInstructions || "").trim();
  if (!newText) return { success: false, message: "❌ New instructions cannot be empty." };

  const { botDoc, config } = await loadTenantBotAndConfig(context);

  if (params.expectedFingerprint) {
    const currentFingerprint = computeAiConfigFingerprint(botDoc, config);
    if (currentFingerprint !== params.expectedFingerprint) {
      return {
        success: false,
        message: "⚠️ Instructions were modified in another session. Please review latest instructions and retry.",
      };
    }
  }

  config.prompt = newText;
  config.systemPrompt = newText;

  await persistBotConfig(context.botId, config);

  return {
    success: true,
    message: `✅ *Shared AI Instructions Fully Replaced*\n\n• *New Length:* ${newText.length.toLocaleString()} characters\n• *Words:* ${newText.split(/\s+/).length}`,
    data: { prompt: newText, charCount: newText.length },
  };
}

// ---------------------------------------------------------------------------
// 4. LEARNED KNOWLEDGE
// ---------------------------------------------------------------------------

export async function handleSearchKnowledge(
  context: AdminBusinessAssistantContext,
  params: { query?: string } = {}
): Promise<AdminActionResult> {
  const query = String(params.query || "").trim().toLowerCase();
  const { config } = await loadTenantBotAndConfig(context);
  const learned = String(config.learned_instructions || config.learnedInstructions || "").trim();

  if (!learned) {
    return {
      success: true,
      message: `🧠 *Learned Knowledge*\n\nNo learned knowledge facts stored yet. You can teach the bot anytime!`,
      data: { facts: [] },
    };
  }

  const lines = learned.split(/\n+/).filter((l) => l.trim().length > 0);
  const matches = query ? lines.filter((l) => l.toLowerCase().includes(query)) : lines;

  if (matches.length === 0) {
    return {
      success: true,
      message: `🧠 *Knowledge Search*\n\nNo facts found matching "${params.query}". (Total stored: ${lines.length} facts)`,
      data: { facts: [] },
    };
  }

  let text = `🧠 *Learned Knowledge (${matches.length} fact${matches.length === 1 ? "" : "s"}${query ? ` matching "${query}"` : ""})*\n\n`;
  matches.slice(0, 5).forEach((m, idx) => {
    text += `${idx + 1}. ${m.trim()}\n`;
  });
  if (matches.length > 5) {
    text += `\n_...and ${matches.length - 5} more facts._`;
  }

  return {
    success: true,
    message: text.trim(),
    data: { facts: matches },
  };
}

export async function handleAddKnowledge(
  context: AdminBusinessAssistantContext,
  params: { fact?: string; content?: string; text?: string; category?: string }
): Promise<AdminActionResult> {
  const fact = String(params.fact || params.content || params.text || "").trim();
  if (!fact) return { success: false, message: "❌ Knowledge fact text cannot be empty." };

  const { config } = await loadTenantBotAndConfig(context);
  const current = String(config.learned_instructions || config.learnedInstructions || "").trim();

  const formattedFact = params.category ? `[${params.category.trim()}] ${fact}` : fact;
  const updated = current ? `${current}\n${formattedFact}` : formattedFact;

  config.learned_instructions = updated;
  config.learnedInstructions = updated;

  await persistBotConfig(context.botId, config);

  return {
    success: true,
    message: `✅ *Knowledge Learned!*\n\n💡 "${formattedFact}"\n\n• Bot will now use this knowledge in customer replies.`,
    data: { fact: formattedFact, totalLength: updated.length },
  };
}

export async function handleUpdateKnowledge(
  context: AdminBusinessAssistantContext,
  params: { targetFact: string; updatedFact: string }
): Promise<AdminActionResult> {
  const target = String(params.targetFact || "").trim();
  const updated = String(params.updatedFact || "").trim();
  if (!target || !updated) return { success: false, message: "❌ Target and updated fact are required." };

  const { config } = await loadTenantBotAndConfig(context);
  const current = String(config.learned_instructions || config.learnedInstructions || "");

  if (!current.includes(target)) {
    return {
      success: false,
      message: `❌ Target knowledge fact not found: "${target}".`,
    };
  }

  const newKnowledge = current.replace(target, updated);
  config.learned_instructions = newKnowledge;
  config.learnedInstructions = newKnowledge;

  await persistBotConfig(context.botId, config);

  return {
    success: true,
    message: `✅ *Knowledge Updated*\n\n• *Updated:* "${updated}"`,
    data: { learned: newKnowledge },
  };
}

export async function handleRemoveKnowledge(
  context: AdminBusinessAssistantContext,
  params: { targetFact: string }
): Promise<AdminActionResult> {
  const target = String(params.targetFact || "").trim();
  if (!target) return { success: false, message: "❌ Target fact to remove is required." };

  const { config } = await loadTenantBotAndConfig(context);
  const current = String(config.learned_instructions || config.learnedInstructions || "");

  if (!current.includes(target)) {
    return {
      success: false,
      message: `❌ Target knowledge fact not found: "${target}".`,
    };
  }

  const newKnowledge = current.replace(target, "").replace(/\n{3,}/g, "\n\n").trim();
  config.learned_instructions = newKnowledge;
  config.learnedInstructions = newKnowledge;

  await persistBotConfig(context.botId, config);

  return {
    success: true,
    message: `✅ *Knowledge Fact Removed*\n\n🗑️ "${target}"`,
    data: { learned: newKnowledge },
  };
}

// ---------------------------------------------------------------------------
// 5. CONFIRMATION FIELDS
// ---------------------------------------------------------------------------

export async function handleListConfirmationFields(context: AdminBusinessAssistantContext): Promise<AdminActionResult> {
  const { config } = await loadTenantBotAndConfig(context);
  const fields = Array.isArray(config.customFields) ? config.customFields : [];

  if (fields.length === 0) {
    return {
      success: true,
      message: `📋 *Order Confirmation Fields*\n\nStandard default fields are active: Name, Phone, City, Address.`,
      data: { fields: [] },
    };
  }

  let text = `📋 *Order Confirmation Fields (${fields.length})*\n\n`;
  fields.forEach((f: any) => {
    const isReq = f.required === true || f.is_required === true || f.required === 1;
    const name = f.name || f.key || "Field";
    const type = f.type || "text";
    text += `• *${name}* (${type}) — ${isReq ? "🔴 Required" : "⚪ Optional"}\n`;
  });

  return {
    success: true,
    message: text.trim(),
    data: { fields },
  };
}

export async function handleAddConfirmationField(
  context: AdminBusinessAssistantContext,
  params: {
    name: string;
    key?: string;
    type?: string;
    required?: boolean;
    instructions?: string;
  }
): Promise<AdminActionResult> {
  const name = String(params.name || "").trim();
  if (!name) return { success: false, message: "❌ Field name is required." };

  const key = String(params.key || name.toLowerCase().replace(/[^a-z0-9_]/g, "_")).trim();
  const type = String(params.type || "text").toLowerCase();
  const allowedTypes = ["text", "number", "select", "date", "address", "phone", "email"];

  if (!allowedTypes.includes(type)) {
    return {
      success: false,
      message: `❌ Invalid field type '${type}'. Allowed types: ${allowedTypes.join(", ")}.`,
    };
  }

  const { config } = await loadTenantBotAndConfig(context);
  const fields = Array.isArray(config.customFields) ? [...config.customFields] : [];

  if (fields.some((f) => String(f.key || "").toLowerCase() === key.toLowerCase())) {
    return {
      success: false,
      message: `⚠️ Field '${key}' already exists in confirmation fields.`,
    };
  }

  const newField = {
    id: `cf_${Date.now()}_${key}`,
    name,
    key,
    type,
    required: Boolean(params.required),
    is_required: Boolean(params.required),
    instructions: params.instructions || "",
    enabled: true,
    order: fields.length + 1,
  };

  fields.push(newField);
  config.customFields = fields;
  config.customer_details_configured = true;

  await persistBotConfig(context.botId, config);

  return {
    success: true,
    message: `✅ *Confirmation Field Added*\n\n• *Field:* ${name} (\`${key}\`)\n• *Type:* ${type}\n• *Required:* ${newField.required ? "Yes" : "No"}`,
    data: { field: newField },
  };
}

export async function handleSetConfirmationFieldRequired(
  context: AdminBusinessAssistantContext,
  params: { key: string; required: boolean }
): Promise<AdminActionResult> {
  const key = String(params.key || "").trim().toLowerCase();
  if (!key) return { success: false, message: "❌ Field key/name is required." };

  const { config } = await loadTenantBotAndConfig(context);
  const fields = Array.isArray(config.customFields) ? [...config.customFields] : [];

  const targetIdx = fields.findIndex((f) => String(f.key || f.name || "").toLowerCase() === key);
  if (targetIdx < 0) {
    return { success: false, message: `❌ Confirmation field '${key}' not found.` };
  }

  fields[targetIdx] = {
    ...fields[targetIdx],
    required: params.required,
    is_required: params.required,
  };

  config.customFields = fields;
  await persistBotConfig(context.botId, config);

  return {
    success: true,
    message: `✅ *Field Requirement Updated*\n\n• *Field:* ${fields[targetIdx].name}\n• *Required:* ${params.required ? "🔴 YES (Mandatory for orders)" : "⚪ NO (Optional)"}`,
    data: { field: fields[targetIdx] },
  };
}

export async function handleDisableConfirmationField(
  context: AdminBusinessAssistantContext,
  params: { key: string }
): Promise<AdminActionResult> {
  const key = String(params.key || "").trim().toLowerCase();
  if (!key) return { success: false, message: "❌ Field key is required." };

  const { config } = await loadTenantBotAndConfig(context);
  const fields = Array.isArray(config.customFields) ? [...config.customFields] : [];

  const targetIdx = fields.findIndex((f) => String(f.key || f.name || "").toLowerCase() === key);
  if (targetIdx < 0) {
    return { success: false, message: `❌ Confirmation field '${key}' not found.` };
  }

  const removed = fields.splice(targetIdx, 1)[0];
  config.customFields = fields;

  await persistBotConfig(context.botId, config);

  return {
    success: true,
    message: `✅ *Confirmation Field Removed*\n\n🗑️ ${removed.name || removed.key}`,
    data: { removed },
  };
}

// ---------------------------------------------------------------------------
// 6. REPLY / VOICE / IMAGE / CALL SETTINGS
// ---------------------------------------------------------------------------

export async function handleGetReplySettings(context: AdminBusinessAssistantContext): Promise<AdminActionResult> {
  const { config } = await loadTenantBotAndConfig(context);

  const replyMode = config.replyBehavior || config.reply_mode || "always_text";
  const voiceUnd = config.voice_understanding_enabled !== false;
  const imageUnd = config.image_understanding_enabled !== false;
  const voiceReply = config.voiceSimulationEnabled === 1 || config.voiceSimulationEnabled === true;
  const rejectCalls = config.rejectCalls === 1 || config.rejectCalls === true;

  return {
    success: true,
    message: `💬 *Reply & Multimodal Settings*\n\n• *Reply Mode:* ${replyMode}\n• *Voice Note Understanding:* ${voiceUnd ? "✅ Enabled" : "❌ Disabled"}\n• *Image Understanding:* ${imageUnd ? "✅ Enabled" : "❌ Disabled"}\n• *Voice Reply Generation:* ${voiceReply ? "✅ Enabled" : "❌ Disabled"}\n• *WhatsApp Calls:* ${rejectCalls ? "Auto-reject" : "Accept/Standard"}`,
    data: { replyMode, voiceUnd, imageUnd, voiceReply, rejectCalls },
  };
}

export async function handleUpdateReplyMode(
  context: AdminBusinessAssistantContext,
  params: { mode: string }
): Promise<AdminActionResult> {
  const mode = String(params.mode || "").trim().toLowerCase();
  const allowedModes = ["always_text", "always_voice", "customer_preference", "text_preferred"];

  if (!allowedModes.includes(mode)) {
    return {
      success: false,
      message: `❌ Invalid reply mode '${mode}'. Allowed modes: ${allowedModes.join(", ")}.`,
    };
  }

  const { config } = await loadTenantBotAndConfig(context);
  config.replyBehavior = mode;
  config.reply_mode = mode;

  await persistBotConfig(context.botId, config);

  return {
    success: true,
    message: `✅ *Reply Mode Updated*\n\n• *New Mode:* ${mode}`,
    data: { replyMode: mode },
  };
}

export async function handleUpdateVoiceUnderstanding(
  context: AdminBusinessAssistantContext,
  params: { enabled: boolean }
): Promise<AdminActionResult> {
  const { config } = await loadTenantBotAndConfig(context);
  config.voice_understanding_enabled = params.enabled;

  await persistBotConfig(context.botId, config);

  return {
    success: true,
    message: `✅ *Voice Understanding Updated*\n\n• *Voice Note Audio Understanding:* ${params.enabled ? "Enabled" : "Disabled"}`,
    data: { voice_understanding_enabled: params.enabled },
  };
}

export async function handleUpdateImageUnderstanding(
  context: AdminBusinessAssistantContext,
  params: { enabled: boolean }
): Promise<AdminActionResult> {
  const { config } = await loadTenantBotAndConfig(context);
  config.image_understanding_enabled = params.enabled;

  await persistBotConfig(context.botId, config);

  return {
    success: true,
    message: `✅ *Image Understanding Updated*\n\n• *Image Photo Understanding:* ${params.enabled ? "Enabled" : "Disabled"}`,
    data: { image_understanding_enabled: params.enabled },
  };
}

export async function handleUpdateCallSettings(
  context: AdminBusinessAssistantContext,
  params: { rejectCalls: boolean }
): Promise<AdminActionResult> {
  const { config } = await loadTenantBotAndConfig(context);
  config.rejectCalls = params.rejectCalls ? 1 : 0;

  await persistBotConfig(context.botId, config);

  return {
    success: true,
    message: `✅ *Call Handling Updated*\n\n• *Incoming WhatsApp Calls:* ${params.rejectCalls ? "Auto-reject calls with polite message" : "Standard allow"}`,
    data: { rejectCalls: config.rejectCalls },
  };
}

export async function handleUpdateReplyTimingSettings(
  context: AdminBusinessAssistantContext,
  params: { replyDelaySeconds?: number; typingDelaySeconds?: number }
): Promise<AdminActionResult> {
  const { config } = await loadTenantBotAndConfig(context);

  if (params.replyDelaySeconds !== undefined) {
    const delay = Math.max(0, Math.min(60, Number(params.replyDelaySeconds) || 0));
    config.reply_delay_seconds = delay;
  }
  if (params.typingDelaySeconds !== undefined) {
    const delay = Math.max(0, Math.min(60, Number(params.typingDelaySeconds) || 0));
    config.typing_delay_seconds = delay;
  }

  await persistBotConfig(context.botId, config);

  return {
    success: true,
    message: `✅ *Timing Delays Updated*\n\n• *Reply Delay:* ${config.reply_delay_seconds || 0}s\n• *Typing Indicator Delay:* ${config.typing_delay_seconds || 0}s`,
    data: { reply_delay_seconds: config.reply_delay_seconds, typing_delay_seconds: config.typing_delay_seconds },
  };
}

// ---------------------------------------------------------------------------
// 7. SMART SALES SETTINGS
// ---------------------------------------------------------------------------

export async function handleGetSmartSalesSettings(context: AdminBusinessAssistantContext): Promise<AdminActionResult> {
  const { config } = await loadTenantBotAndConfig(context);
  const isEnabled = config.smartSalesEngineEnabled === 1 || config.smartSalesEngineEnabled === true || config.smart_sales_enabled === true;
  const training = String(config.smart_sales_training || config.smartSalesPromptVersion || "Default Objection Handling").trim();

  return {
    success: true,
    message: `💼 *Smart Sales Engine*\n\n• *Status:* ${isEnabled ? "✅ Active" : "⏸️ Paused"}\n• *Engine:* AI Objection Handling & Upselling\n• *Training Version:* ${training}`,
    data: { isEnabled, training },
  };
}

export async function handleEnableSmartSales(context: AdminBusinessAssistantContext): Promise<AdminActionResult> {
  const { config } = await loadTenantBotAndConfig(context);
  config.smartSalesEngineEnabled = 1;
  config.smart_sales_enabled = true;

  await persistBotConfig(context.botId, config);

  return {
    success: true,
    message: `✅ *Smart Sales Engine Activated*\n\n• The bot will automatically handle price objections, offer bundle incentives, and boost conversion without overriding canonical catalog pricing.`,
    data: { isEnabled: true },
  };
}

export async function handleDisableSmartSales(context: AdminBusinessAssistantContext): Promise<AdminActionResult> {
  const { config } = await loadTenantBotAndConfig(context);
  config.smartSalesEngineEnabled = 0;
  config.smart_sales_enabled = false;

  await persistBotConfig(context.botId, config);

  return {
    success: true,
    message: `⏸️ *Smart Sales Engine Deactivated*\n\n• Bot will use standard customer support reply flow.`,
    data: { isEnabled: false },
  };
}

export async function handleUpdateSmartSalesTraining(
  context: AdminBusinessAssistantContext,
  params: { training: string; append?: boolean }
): Promise<AdminActionResult> {
  const text = String(params.training || "").trim();
  if (!text) return { success: false, message: "❌ Sales training text is required." };

  const { config } = await loadTenantBotAndConfig(context);
  const current = String(config.smart_sales_training || "").trim();

  const updated = (params.append && current) ? `${current}\n\n${text}` : text;
  config.smart_sales_training = updated;

  await persistBotConfig(context.botId, config);

  return {
    success: true,
    message: `✅ *Smart Sales Training Saved*\n\n📝 "${text.length > 200 ? text.slice(0, 200) + "..." : text}"`,
    data: { training: updated },
  };
}

// ---------------------------------------------------------------------------
// 8. MEDIA & CONTENT LIBRARY
// ---------------------------------------------------------------------------

export async function handleListMedia(
  context: AdminBusinessAssistantContext,
  params: { type?: string; query?: string } = {}
): Promise<AdminActionResult> {
  const { templateStore } = await loadTenantBotAndConfig(context);
  const mediaItems = buildMediaLibraryItems(templateStore);

  const query = String(params.query || "").trim().toLowerCase();
  const typeFilter = String(params.type || "").trim().toLowerCase();

  let filtered = mediaItems;
  if (typeFilter) {
    filtered = filtered.filter((m: any) => String(m.type || "").toLowerCase().includes(typeFilter));
  }
  if (query) {
    filtered = filtered.filter((m: any) => String(m.name || "").toLowerCase().includes(query));
  }

  if (filtered.length === 0) {
    return {
      success: true,
      message: `🖼️ *Media Library*\n\nNo media assets found${query ? ` matching "${query}"` : ""}.`,
      data: { media: [] },
    };
  }

  let text = `🖼️ *Media Library (${filtered.length} asset${filtered.length === 1 ? "" : "s"}${typeFilter ? ` - ${typeFilter}` : ""})*\n\n`;
  filtered.slice(0, 5).forEach((m: any, idx: number) => {
    text += `${idx + 1}. *${m.name}* [${m.type.toUpperCase()}]\n`;
  });

  return {
    success: true,
    message: text.trim(),
    data: { media: filtered },
  };
}

export async function handleSaveAdminMedia(
  context: AdminBusinessAssistantContext,
  params: {
    name: string;
    type: string;
    url?: string;
    fileName?: string;
    fileSize?: number;
  }
): Promise<AdminActionResult> {
  const name = String(params.name || "Uploaded Media").trim();
  const type = String(params.type || "image").toLowerCase();

  const allowedTypes = ["image", "video", "document", "audio", "sticker"];
  if (!allowedTypes.includes(type)) {
    return { success: false, message: `❌ Unsupported media type: ${type}.` };
  }

  // Bounded size check (max 25MB)
  if (params.fileSize && params.fileSize > 25 * 1024 * 1024) {
    return { success: false, message: "❌ File size exceeds 25MB limit." };
  }

  const { templateStore } = await loadTenantBotAndConfig(context);
  const store = templateStore || { media: { templates: [] } };
  if (!store.media) store.media = { templates: [] };
  if (!Array.isArray(store.media.templates)) store.media.templates = [];

  const newMedia = {
    id: `med_${Date.now()}`,
    key: { id: `med_${Date.now()}` },
    caption: name,
    type,
    url: params.url || "",
    fileName: params.fileName || name,
    fileSize: params.fileSize || 0,
    timestamp: Date.now(),
  };

  store.media.templates.push(newMedia);

  await aiContentServiceDeps.dbService.saveTemplateStore(context.botId, JSON.stringify(store));

  return {
    success: true,
    message: `✅ *Media Asset Saved to Content Library*\n\n• *Name:* ${name}\n• *Type:* ${type.toUpperCase()}`,
    data: { media: newMedia },
  };
}

// ---------------------------------------------------------------------------
// 9. SAVED REPLIES
// ---------------------------------------------------------------------------

export async function handleListSavedReplies(context: AdminBusinessAssistantContext): Promise<AdminActionResult> {
  const { config, templateStore } = await loadTenantBotAndConfig(context);
  const groups = Array.isArray(config.groups) ? config.groups : [];
  const savedReplies = buildSavedReplyItems(groups, templateStore);

  if (savedReplies.length === 0) {
    return {
      success: true,
      message: `💬 *Saved Quick Replies*\n\nNo saved replies configured. You can create one anytime by asking e.g. "create saved reply bank details".`,
      data: { savedReplies: [] },
    };
  }

  let text = `💬 *Saved Quick Replies (${savedReplies.length})*\n\n`;
  savedReplies.slice(0, 8).forEach((r) => {
    text += `• *!${r.shortcut}* — ${r.title}\n`;
  });

  return {
    success: true,
    message: text.trim(),
    data: { savedReplies },
  };
}

export async function handleCreateSavedReply(
  context: AdminBusinessAssistantContext,
  params: {
    title: string;
    shortcut: string;
    content: string;
    instructions?: string;
  }
): Promise<AdminActionResult> {
  const title = String(params.title || "").trim();
  const rawShortcut = String(params.shortcut || "").trim().replace(/^!+/, "");
  const shortcut = normalizeShortcutCode(rawShortcut);
  const content = String(params.content || "").trim();

  if (!title) return { success: false, message: "❌ Title is required for saved reply." };
  if (!shortcut) return { success: false, message: "❌ Shortcut code is required (e.g. 'bank', 'pricing')." };
  if (!content) return { success: false, message: "❌ Reply content cannot be empty." };

  const { config, templateStore } = await loadTenantBotAndConfig(context);
  const groups = Array.isArray(config.groups) ? [...config.groups] : [];

  // Check shortcut collision
  const existingCollision = groups.find((g) => normalizeShortcutCode(g.shortcut_code || g.shortcut) === shortcut);
  if (existingCollision) {
    return {
      success: false,
      message: `⚠️ *Shortcut Collision*\n\nShortcut \`!${shortcut}\` is already used by *${existingCollision.name || "another flow"}*. Please choose a different shortcut.`,
    };
  }

  const groupId = `reply_${Date.now()}_${shortcut}`;
  const newGroup = {
    id: groupId,
    name: title,
    jid: `${groupId}@g.us`,
    purpose: "sequence",
    shortcut_code: shortcut,
    instructions: params.instructions || `Send ${title}`,
    enabled: true,
    autoSync: false,
    templateCount: 1,
    updatedAt: Date.now(),
  };

  groups.push(newGroup);
  config.groups = groups;

  // Persist template message
  const store = templateStore || { sequences: {} };
  if (!store.sequences) store.sequences = {};
  store.sequences[title] = {
    templates: [
      {
        message: { conversation: content },
        text: content,
        timestamp: Date.now(),
      },
    ],
  };

  await persistBotConfig(context.botId, config);
  await aiContentServiceDeps.dbService.saveTemplateStore(context.botId, JSON.stringify(store));

  return {
    success: true,
    message: `✅ *Saved Reply Created*\n\n• *Title:* ${title}\n• *Shortcut:* \`!${shortcut}\`\n• *Content:* "${content}"`,
    data: { title, shortcut, content },
  };
}

export async function handleDeleteSavedReply(
  context: AdminBusinessAssistantContext,
  params: { shortcut: string }
): Promise<AdminActionResult> {
  const shortcut = normalizeShortcutCode(params.shortcut);
  if (!shortcut) return { success: false, message: "❌ Shortcut is required." };

  const { config, templateStore } = await loadTenantBotAndConfig(context);
  const groups = Array.isArray(config.groups) ? [...config.groups] : [];

  const targetIdx = groups.findIndex((g) => normalizeShortcutCode(g.shortcut_code || g.shortcut) === shortcut);
  if (targetIdx < 0) {
    return { success: false, message: `❌ Saved reply with shortcut '!${shortcut}' not found.` };
  }

  const removed = groups.splice(targetIdx, 1)[0];
  config.groups = groups;

  if (templateStore?.sequences?.[removed.name]) {
    delete templateStore.sequences[removed.name];
  }

  await persistBotConfig(context.botId, config);
  if (templateStore) {
    await aiContentServiceDeps.dbService.saveTemplateStore(context.botId, JSON.stringify(templateStore));
  }

  return {
    success: true,
    message: `✅ *Saved Reply Deleted*\n\n🗑️ ${removed.name} (\`!${shortcut}\`)`,
    data: { removed },
  };
}

// ---------------------------------------------------------------------------
// 10. SEQUENCES & SEQUENCE STEPS
// ---------------------------------------------------------------------------

export async function handleListSequences(context: AdminBusinessAssistantContext): Promise<AdminActionResult> {
  const { config, templateStore } = await loadTenantBotAndConfig(context);
  const groups = Array.isArray(config.groups) ? config.groups : [];
  const sequences = buildSequenceGroupItems(groups, templateStore);

  if (sequences.length === 0) {
    return {
      success: true,
      message: `📑 *Sequences*\n\nNo message sequences configured.`,
      data: { sequences: [] },
    };
  }

  let text = `📑 *Sequences (${sequences.length})*\n\n`;
  sequences.forEach((s) => {
    const status = s.isEnabled ? "🟢 Active" : "⚪ Paused";
    const sc = s.shortcutCode ? ` (!${s.shortcutCode})` : "";
    text += `• *${s.name}*${sc} — ${s.itemCount} step${s.itemCount === 1 ? "" : "s"} (${status})\n`;
  });

  return {
    success: true,
    message: text.trim(),
    data: { sequences },
  };
}

export async function handleGetSequence(
  context: AdminBusinessAssistantContext,
  params: { name?: string; id?: string; shortcut?: string }
): Promise<AdminActionResult> {
  const { config, templateStore } = await loadTenantBotAndConfig(context);
  const groups = Array.isArray(config.groups) ? config.groups : [];
  const sequences = buildSequenceGroupItems(groups, templateStore);

  const identifier = String(params.name || params.id || params.shortcut || "").trim().toLowerCase();
  const found = sequences.find((s) => {
    return s.name.toLowerCase() === identifier ||
      s.id.toLowerCase() === identifier ||
      (s.shortcutCode && s.shortcutCode.toLowerCase() === identifier);
  });

  if (!found) {
    return { success: false, message: `❌ Sequence '${identifier}' not found.` };
  }

  let text = `📑 *Sequence: ${found.name}*\n\n`;
  text += `• *Status:* ${found.isEnabled ? "🟢 Active" : "⚪ Paused"}\n`;
  if (found.shortcutCode) text += `• *Shortcut:* \`!${found.shortcutCode}\`\n`;
  if (found.keywordTrigger) text += `• *Keywords:* ${found.keywordTrigger}\n`;
  text += `\n*Steps (${found.items.length}):*\n`;

  found.items.forEach((it, idx) => {
    text += `${idx + 1}. [${it.type.toUpperCase()}] ${it.content}${it.delaySeconds ? ` (+${it.delaySeconds}s)` : ""}\n`;
  });

  return {
    success: true,
    message: text.trim(),
    data: { sequence: found },
  };
}

export async function handleCreateSequence(
  context: AdminBusinessAssistantContext,
  params: {
    name: string;
    shortcutCode?: string;
    keywordTrigger?: string;
    instructions?: string;
    items?: Array<{ content: string; type?: string; delaySeconds?: number }>;
  }
): Promise<AdminActionResult> {
  const name = String(params.name || "").trim();
  if (!name) return { success: false, message: "❌ Sequence name is required." };

  const { config, templateStore } = await loadTenantBotAndConfig(context);
  const groups = Array.isArray(config.groups) ? [...config.groups] : [];

  if (groups.some((g) => isSequenceSyncGroup(g) && g.name?.toLowerCase() === name.toLowerCase())) {
    return { success: false, message: `⚠️ A sequence named "${name}" already exists.` };
  }

  const shortcut = normalizeShortcutCode(params.shortcutCode);
  if (shortcut && groups.some((g) => normalizeShortcutCode(g.shortcut_code || g.shortcut) === shortcut)) {
    return { success: false, message: `⚠️ Shortcut \`!${shortcut}\` is already taken.` };
  }

  const groupId = `seq_${Date.now()}`;
  const rawItems = Array.isArray(params.items) && params.items.length > 0 ? params.items : [{ content: `Welcome to ${name}` }];

  const newGroup = {
    id: groupId,
    name,
    jid: `${groupId}@g.us`,
    purpose: "sequence",
    shortcut_code: shortcut || undefined,
    trigger_keywords: params.keywordTrigger || undefined,
    instructions: params.instructions || undefined,
    enabled: true,
    autoSync: false,
    templateCount: rawItems.length,
    updatedAt: Date.now(),
  };

  groups.push(newGroup);
  config.groups = groups;

  const store = templateStore || { sequences: {} };
  if (!store.sequences) store.sequences = {};
  store.sequences[name] = {
    templates: rawItems.map((it) => ({
      message: { conversation: it.content },
      text: it.content,
      type: it.type || "text",
      delaySeconds: it.delaySeconds || 0,
      timestamp: Date.now(),
    })),
  };

  await persistBotConfig(context.botId, config);
  await aiContentServiceDeps.dbService.saveTemplateStore(context.botId, JSON.stringify(store));

  return {
    success: true,
    message: `✅ *Sequence Created*\n\n• *Name:* ${name}\n• *Steps:* ${rawItems.length}\n• *Shortcut:* ${shortcut ? `\`!${shortcut}\`` : "None"}`,
    data: { sequence: newGroup },
  };
}

export async function handleAddSequenceStep(
  context: AdminBusinessAssistantContext,
  params: {
    sequenceName: string;
    content: string;
    type?: string;
    delaySeconds?: number;
  }
): Promise<AdminActionResult> {
  const seqName = String(params.sequenceName || "").trim();
  const content = String(params.content || "").trim();
  if (!seqName || !content) return { success: false, message: "❌ Sequence name and step content are required." };

  const { config, templateStore } = await loadTenantBotAndConfig(context);
  const groups = Array.isArray(config.groups) ? [...config.groups] : [];

  const group = groups.find((g) => isSequenceSyncGroup(g) && g.name?.toLowerCase() === seqName.toLowerCase());
  if (!group) return { success: false, message: `❌ Sequence '${seqName}' not found.` };

  const store = templateStore || { sequences: {} };
  if (!store.sequences) store.sequences = {};
  if (!store.sequences[group.name]) store.sequences[group.name] = { templates: [] };

  const templates = store.sequences[group.name].templates || [];
  templates.push({
    message: { conversation: content },
    text: content,
    type: params.type || "text",
    delaySeconds: params.delaySeconds || 0,
    timestamp: Date.now(),
  });

  group.templateCount = templates.length;
  group.updatedAt = Date.now();

  await persistBotConfig(context.botId, config);
  await aiContentServiceDeps.dbService.saveTemplateStore(context.botId, JSON.stringify(store));

  return {
    success: true,
    message: `✅ *Step Added to ${group.name}*\n\n• Step #${templates.length}: "${content}"`,
    data: { stepCount: templates.length },
  };
}

export async function handleRemoveSequenceStep(
  context: AdminBusinessAssistantContext,
  params: { sequenceName: string; stepIndex: number }
): Promise<AdminActionResult> {
  const seqName = String(params.sequenceName || "").trim();
  const index = Math.max(1, Number(params.stepIndex) || 1) - 1;

  const { config, templateStore } = await loadTenantBotAndConfig(context);
  const groups = Array.isArray(config.groups) ? [...config.groups] : [];

  const group = groups.find((g) => isSequenceSyncGroup(g) && g.name?.toLowerCase() === seqName.toLowerCase());
  if (!group) return { success: false, message: `❌ Sequence '${seqName}' not found.` };

  const templates = templateStore?.sequences?.[group.name]?.templates || [];
  if (index >= templates.length || index < 0) {
    return { success: false, message: `❌ Step index ${index + 1} does not exist in sequence '${group.name}' (${templates.length} total steps).` };
  }

  const removed = templates.splice(index, 1)[0];
  group.templateCount = templates.length;
  group.updatedAt = Date.now();

  await persistBotConfig(context.botId, config);
  await aiContentServiceDeps.dbService.saveTemplateStore(context.botId, JSON.stringify(templateStore));

  return {
    success: true,
    message: `✅ *Step Removed from ${group.name}*\n\n🗑️ "${removed.text || removed.content || "Step"}"`,
    data: { remainingSteps: templates.length },
  };
}

export async function handleEnableSequence(
  context: AdminBusinessAssistantContext,
  params: { name: string }
): Promise<AdminActionResult> {
  const seqName = String(params.name || "").trim();
  const { config } = await loadTenantBotAndConfig(context);
  const groups = Array.isArray(config.groups) ? [...config.groups] : [];

  const group = groups.find((g) => isSequenceSyncGroup(g) && g.name?.toLowerCase() === seqName.toLowerCase());
  if (!group) return { success: false, message: `❌ Sequence '${seqName}' not found.` };

  group.enabled = true;
  group.updatedAt = Date.now();

  await persistBotConfig(context.botId, config);

  return {
    success: true,
    message: `🟢 *Sequence Enabled*\n\n• *${group.name}* is now active and can be triggered.`,
    data: { isEnabled: true },
  };
}

export async function handleDisableSequence(
  context: AdminBusinessAssistantContext,
  params: { name: string }
): Promise<AdminActionResult> {
  const seqName = String(params.name || "").trim();
  const { config } = await loadTenantBotAndConfig(context);
  const groups = Array.isArray(config.groups) ? [...config.groups] : [];

  const group = groups.find((g) => isSequenceSyncGroup(g) && g.name?.toLowerCase() === seqName.toLowerCase());
  if (!group) return { success: false, message: `❌ Sequence '${seqName}' not found.` };

  group.enabled = false;
  group.updatedAt = Date.now();

  await persistBotConfig(context.botId, config);

  return {
    success: true,
    message: `⚪ *Sequence Paused*\n\n• *${group.name}* is now disabled.`,
    data: { isEnabled: false },
  };
}

export async function handleDeleteSequence(
  context: AdminBusinessAssistantContext,
  params: { name: string }
): Promise<AdminActionResult> {
  const seqName = String(params.name || "").trim();
  const { config, templateStore } = await loadTenantBotAndConfig(context);
  const groups = Array.isArray(config.groups) ? [...config.groups] : [];

  const idx = groups.findIndex((g) => isSequenceSyncGroup(g) && g.name?.toLowerCase() === seqName.toLowerCase());
  if (idx < 0) return { success: false, message: `❌ Sequence '${seqName}' not found.` };

  const removed = groups.splice(idx, 1)[0];
  config.groups = groups;

  if (templateStore?.sequences?.[removed.name]) {
    delete templateStore.sequences[removed.name];
  }

  await persistBotConfig(context.botId, config);
  if (templateStore) {
    await aiContentServiceDeps.dbService.saveTemplateStore(context.botId, JSON.stringify(templateStore));
  }

  return {
    success: true,
    message: `✅ *Sequence Deleted*\n\n🗑️ *${removed.name}* has been removed.`,
    data: { removed },
  };
}

// ---------------------------------------------------------------------------
// 11. WELCOME AUTOMATION
// ---------------------------------------------------------------------------

export async function handleGetWelcomeAutomation(context: AdminBusinessAssistantContext): Promise<AdminActionResult> {
  const { config, templateStore } = await loadTenantBotAndConfig(context);
  const groups = Array.isArray(config.groups) ? config.groups : [];
  const welcome = buildWelcomeSequenceConfig(groups, templateStore);

  return {
    success: true,
    message: `👋 *Welcome Automation Status*\n\n• *Status:* ${welcome.isEnabled ? "🟢 Enabled" : "⚪ Disabled"}\n• *Sequence:* ${welcome.name || "None"}\n• *Messages:* ${welcome.itemCount} template(s)\n• *Readiness:* ${welcome.readinessStatus}`,
    data: { welcome },
  };
}

export async function handleEnableWelcomeAutomation(context: AdminBusinessAssistantContext): Promise<AdminActionResult> {
  const { config } = await loadTenantBotAndConfig(context);
  const groups = Array.isArray(config.groups) ? [...config.groups] : [];

  const welcomeGroup = groups.find((g) => normalizeSequenceGroupPurpose(g) === "welcome");
  if (!welcomeGroup) {
    return {
      success: false,
      message: `⚠️ No Welcome sequence found. Please set a Welcome sequence first.`,
    };
  }

  welcomeGroup.enabled = true;
  welcomeGroup.updatedAt = Date.now();

  await persistBotConfig(context.botId, config);

  return {
    success: true,
    message: `🟢 *Welcome Automation Enabled*\n\n• New incoming customer contacts will receive the welcome sequence automatically.`,
    data: { isEnabled: true },
  };
}

export async function handleDisableWelcomeAutomation(context: AdminBusinessAssistantContext): Promise<AdminActionResult> {
  const { config } = await loadTenantBotAndConfig(context);
  const groups = Array.isArray(config.groups) ? [...config.groups] : [];

  const welcomeGroup = groups.find((g) => normalizeSequenceGroupPurpose(g) === "welcome");
  if (welcomeGroup) {
    welcomeGroup.enabled = false;
    welcomeGroup.updatedAt = Date.now();
  }

  await persistBotConfig(context.botId, config);

  return {
    success: true,
    message: `⚪ *Welcome Automation Disabled*\n\n• Welcome messages will not be sent automatically to new contacts.`,
    data: { isEnabled: false },
  };
}

export async function handleSetWelcomeSequence(
  context: AdminBusinessAssistantContext,
  params: { sequenceName?: string; sequenceId?: string }
): Promise<AdminActionResult> {
  const target = String(params.sequenceName || params.sequenceId || "").trim().toLowerCase();
  if (!target) return { success: false, message: "❌ Target sequence name or ID is required." };

  const { config, templateStore } = await loadTenantBotAndConfig(context);
  const groups = Array.isArray(config.groups) ? [...config.groups] : [];

  // Match candidate groups
  const matching = groups.filter((g) => {
    const id = getSequenceGroupStableId(g).toLowerCase();
    const name = String(g.name || "").toLowerCase();
    return id === target || name === target;
  });

  if (matching.length === 0) {
    return { success: false, message: `❌ Sequence '${target}' not found.` };
  }

  if (matching.length > 1) {
    return {
      success: false,
      message: `⚠️ *Ambiguous Sequence Match*\n\nMultiple candidate sequences match '${target}'. Please specify the exact sequence ID.`,
    };
  }

  const selected = matching[0];

  // Set purpose to welcome, ensure previous welcome purpose is downgraded
  groups.forEach((g) => {
    if (normalizeSequenceGroupPurpose(g) === "welcome" && getSequenceGroupStableId(g) !== getSequenceGroupStableId(selected)) {
      g.purpose = "sequence";
    }
  });

  selected.purpose = "welcome";
  selected.enabled = true;
  selected.updatedAt = Date.now();

  config.groups = groups;

  // Sync templates in templateStore under 'welcome'
  if (templateStore?.sequences?.[selected.name]) {
    templateStore.welcome = { ...templateStore.sequences[selected.name] };
  }

  await persistBotConfig(context.botId, config);
  if (templateStore) {
    await aiContentServiceDeps.dbService.saveTemplateStore(context.botId, JSON.stringify(templateStore));
  }

  return {
    success: true,
    message: `✅ *Welcome Sequence Assigned*\n\n• *Assigned Flow:* ${selected.name}\n• *Status:* Active for new contacts`,
    data: { welcomeSequence: selected.name },
  };
}
