import { CONCISE_WHATSAPP_REPLY_RULES } from "./reply-style-service.ts";

const trimBlock = (value: any) => String(value || "").trim();

function cleanEnv(value: any) {
  const key = String(value || "").trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    return key.slice(1, -1);
  }
  return key;
}

function hasValue(value: string) {
  return Boolean(value && value !== "MY_GEMINI_API_KEY" && value !== "YOUR_API_KEY");
}

function truthyEnv(value: any) {
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}

export function getGeminiApiKey() {
  return cleanEnv(process.env.AGENT_PLATFORM_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "");
}

export function getGoogleGenAIClientOptions() {
  const agentPlatformKey = cleanEnv(process.env.AGENT_PLATFORM_API_KEY);
  const geminiApiKey = cleanEnv(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
  const project = cleanEnv(process.env.GOOGLE_CLOUD_PROJECT || process.env.VERTEX_AI_PROJECT || process.env.AGENT_PLATFORM_PROJECT);
  const location = cleanEnv(process.env.GOOGLE_CLOUD_LOCATION || process.env.VERTEX_AI_LOCATION || process.env.AGENT_PLATFORM_LOCATION);
  const apiVersion = cleanEnv(process.env.GOOGLE_GENAI_API_VERSION || process.env.AGENT_PLATFORM_API_VERSION);

  const withApiVersion = (options: any) => {
    if (apiVersion) {
      options.httpOptions = { ...(options.httpOptions || {}), apiVersion };
    }
    return options;
  };

  if (hasValue(agentPlatformKey)) {
    return withApiVersion({ apiKey: agentPlatformKey });
  }

  if (truthyEnv(process.env.GOOGLE_GENAI_USE_VERTEXAI) || (project && location)) {
    if (project && location) {
      return withApiVersion({
        vertexai: true,
        project,
        location,
      });
    }
    return null;
  }

  if (hasValue(geminiApiKey)) {
    return withApiVersion({ apiKey: geminiApiKey });
  }

  return null;
}

export function getGoogleGenAIAuthLabel() {
  if (hasValue(cleanEnv(process.env.AGENT_PLATFORM_API_KEY))) {
    return "Agent Platform API key";
  }
  if (truthyEnv(process.env.GOOGLE_GENAI_USE_VERTEXAI) || cleanEnv(process.env.GOOGLE_CLOUD_PROJECT || process.env.VERTEX_AI_PROJECT || process.env.AGENT_PLATFORM_PROJECT)) {
    return "Vertex AI project/location";
  }
  if (hasValue(cleanEnv(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY))) {
    return "Gemini Developer API";
  }
  return "not configured";
}

export function buildBotCachePrefix(input: { userConfig: any; basePrompt: string }) {
  const { userConfig, basePrompt } = input;
  const gender = userConfig?.bot_gender === "female" ? "Feminine" : "Masculine";
  const grammar = userConfig?.bot_gender === "female" ? "'rahi hoon'" : "'raha hoon'";

  return `
=== SYSTEM CAPABILITIES (CACHEABLE PREFIX) ===
- VISION: ACTIVE. You can see images sent by users. Analyze them to help the customer.
- VOICE ENGINE: INTEGRATED. You are fully capable of sending voice notes.
- If the user asks for audio or voice, use the 'reply_with_voice' tool.
- If the user sends an audio message, acknowledge it. Reply via voice only when the configured reply_behavior allows voice for that situation.
- NEVER claim you are "only text-based" or "cannot see images". You have full vision and voice capabilities.

=== CONVERSATION STYLE ===
- Talk naturally like a human friend on WhatsApp. Use simple, direct language.
- NO REPETITIVE INTROS: NEVER introduce yourself in every message. Only introduce yourself ONCE in the very first message of a new chat. If there is already history, skip the intro entirely.
- NO REPETITIVE GREETINGS: Do NOT say "Assalam o Alaikum", "Salam", "Hi", or "Hello" in every message. Only greet if it's the very first message. If there is history, get straight to the point.
- NO ROBOTIC TALK: Do NOT use phrases like "current function is to respond in text" or "as an AI I communicate...". Talk like a professional human sales agent.
- WHATSAPP FORMATTING: Use short paragraphs and preserve line breaks. Use simple numbered points or "- " bullets when listing details. Do not wrap words or labels in markdown bold/italic markers.
- FORMATTING LIMITS: Do not use markdown tables, HTML, # headings, markdown links, underscores, tildes, or code blocks.
- GRAMMAR: Use ${gender} grammar context (e.g. ${grammar}).
- Keep responses concise, helpful, and engaging.
${CONCISE_WHATSAPP_REPLY_RULES}
- STOCK REPLIES: If an item or variation is unavailable, do not dump full stock counts or long alternative lists. Reply in the customer's language and mention only 1-2 available options they can actually buy, unless they explicitly ask for exact stock.
- Your name is: ${userConfig?.bot_name || "Black Arrow"}. Never use the name 'Zain'.
- MANDATORY TOOL USAGE: If a customer asks to see a product, a photo, a catalog, a video, or any visual proof: YOU MUST IMMEDIATELY CALL THE 'sendMediaFile' TOOL.
- CRITICAL INSTRUCTION: When using ANY tool (like sendMediaFile or save_order), you MUST provide a natural language text response to the user in the SAME generated reply as the tool call. Do not return just a tool call without a text message.
- ONLY send the specific media file requested or relevant. Do not send all files at once. Limit to 1 media file unless specifically asked for more.
- ORDER SAFETY: You save orders only inside Black Arrow for human review. Never claim that you booked, dispatched, or pushed an order to PostEx/Leopards unless the conversation history or customer profile already contains a tracking ID.
- STOCK SAFETY: Before saying an item is available or saving an order, inspect the product catalog stock and variation stock. If the exact product or requested variation is out of stock, do not call save_order. Recommend another in-stock variation or similar product instead.
- TRACKING MEMORY: If the customer asks for order status and the customer profile contains trackingId, courierCompany, or latestTrackingStatus, answer from that saved information. Do not invent a tracking status.
- RETENTION BEFORE HANDOFF: If the customer asks for a human/admin/manager, is angry, asks for a discount, or asks something difficult, first try to help, explain, reassure, and convince politely using the business training. Mention admin/team review only after the customer keeps refusing or the issue is legally/financially unsafe.
- TEXT PREFERRED MODE: If reply_behavior is text_preferred, answer in text even when the customer sends audio. Use voice only if the customer explicitly asks for a voice/audio reply, or says they cannot read/type/write, are driving, or have a similar practical need.

=== BUSINESS TRAINING (CACHEABLE PER INSTANCE) ===
${trimBlock(basePrompt)}
`.trim();
}

export function buildBotDynamicContext(input: {
  businessContext: string;
  productCatalog: string;
  customFieldsContext: string;
  learnedRules: string;
  mediaTemplates: string;
  sequencesMetadata: string;
  chatSummaryContext: string;
  customerInstructionsContext: string;
  customerSavedDataContext: string;
}) {
  return `
=== REQUEST-SPECIFIC CONTEXT (NOT CACHE STABLE) ===

=== PERSONA & SETTINGS ===
${trimBlock(input.businessContext)}

=== PRODUCT CATALOG ===
${trimBlock(input.productCatalog)}

${trimBlock(input.customFieldsContext)}
${trimBlock(input.learnedRules)}
${trimBlock(input.mediaTemplates)}
${trimBlock(input.sequencesMetadata)}
${trimBlock(input.chatSummaryContext)}
${trimBlock(input.customerInstructionsContext)}
${trimBlock(input.customerSavedDataContext)}
`.trim();
}

export function composeImplicitCacheInstruction(cachePrefix: string, dynamicContext = "") {
  return [trimBlock(cachePrefix), trimBlock(dynamicContext)].filter(Boolean).join("\n\n");
}

export function getGeminiCacheTelemetry(response: any) {
  const usage = response?.usageMetadata || response?.usage_metadata || {};
  const cachedTokens = Number(usage.cachedContentTokenCount || usage.cached_content_token_count || 0);
  const inputTokens = Number(usage.promptTokenCount || usage.prompt_token_count || usage.totalInputTokenCount || 0);
  const outputTokens = Number(usage.candidatesTokenCount || usage.candidates_token_count || 0);
  const thoughtTokens = Number(usage.thoughtsTokenCount || usage.thoughts_token_count || 0);
  const totalTokens = Number(usage.totalTokenCount || usage.total_token_count || 0);
  const uncachedInputTokens = Math.max(0, Number(usage.uncachedContentTokenCount || usage.uncached_content_token_count || 0) || (inputTokens - cachedTokens));
  const cacheHit = cachedTokens > 0;
  return { cachedTokens, uncachedInputTokens, inputTokens, outputTokens, thoughtTokens, totalTokens, cacheHit };
}

const cacheFingerprintHistory = new Map<string, string>();

function buildCacheHistoryKey(label: string, context: any) {
  return [
    label,
    String(context?.botId || context?.accountId || "unknown"),
    String(context?.model || "unknown"),
  ].join("|");
}

function buildCacheHintList(telemetry: any, context: any, label: string) {
  if (!context || telemetry.cacheHit || telemetry.inputTokens < 1024) return [];

  const hints: string[] = [];
  const historyKey = buildCacheHistoryKey(label, context);
  const lastStableHash = cacheFingerprintHistory.get(historyKey);
  const stableHash = String(context?.stablePrefixHash || "");
  const model = String(context?.model || "").toLowerCase();

  if (stableHash && lastStableHash && stableHash !== lastStableHash) {
    hints.push("stable-prefix-changed");
  }
  if (context?.stablePrefixTokenEstimate && Number(context.stablePrefixTokenEstimate) < 1024) {
    hints.push("stable-prefix-too-small");
  }
  if (model && !model.includes("gemini-2.5") && !model.includes("gemini-3")) {
    hints.push("model-may-not-use-implicit-cache");
  }
  if (!stableHash) {
    hints.push("request-prefix-differs");
  } else if (!lastStableHash) {
    hints.push("cache-not-warmed-yet");
  } else if (stableHash === lastStableHash) {
    hints.push("request-prefix-differs-or-cache-not-warmed");
  }

  return Array.from(new Set(hints)).slice(0, 3);
}

export function logGeminiCacheTelemetry(response: any, io: any, label: string, context?: {
  model?: string;
  botId?: string;
  accountId?: string;
  stablePrefixHash?: string;
  stablePrefixLength?: number;
  stablePrefixTokenEstimate?: number;
  explicitCacheEnabled?: boolean;
  explicitCacheUsed?: boolean;
  explicitCacheCreated?: boolean;
  explicitCacheNameShort?: string;
  cacheFallbackReason?: string;
}) {
  const telemetry = getGeminiCacheTelemetry(response);
  const hints = buildCacheHintList(telemetry, context, label);
  const explicitCacheHit = Boolean(context?.explicitCacheUsed && telemetry.cachedTokens > 0);
  const metadata = [
    context?.model ? `model=${context.model}` : "",
    context?.botId ? `bot=${context.botId}` : "",
    context?.stablePrefixHash ? `stableHash=${context.stablePrefixHash}` : "",
    context?.stablePrefixLength ? `stableChars=${context.stablePrefixLength}` : "",
    context?.stablePrefixTokenEstimate ? `stableTokens~=${context.stablePrefixTokenEstimate}` : "",
    typeof context?.explicitCacheEnabled === "boolean" ? `explicit=${context.explicitCacheEnabled}` : "",
    typeof context?.explicitCacheUsed === "boolean" ? `used=${context.explicitCacheUsed}` : "",
    typeof context?.explicitCacheCreated === "boolean" ? `created=${context.explicitCacheCreated}` : "",
    context?.explicitCacheNameShort ? `cacheRef=${context.explicitCacheNameShort}` : "",
    `input=${telemetry.inputTokens}`,
    `output=${telemetry.outputTokens}`,
    `cached=${telemetry.cachedTokens}`,
    `cacheHit=${explicitCacheHit || telemetry.cacheHit}`,
    context?.cacheFallbackReason ? `fallback=${context.cacheFallbackReason}` : "",
    hints.length > 0 ? `hints=${hints.join("|")}` : "",
  ].filter(Boolean).join(", ");
  const msg = `[Gemini Cache] ${label}: ${metadata}`;
  console.log(msg);
  io?.emit?.("system-log", { type: "info", msg });
  if (context?.stablePrefixHash) {
    cacheFingerprintHistory.set(buildCacheHistoryKey(label, context), String(context.stablePrefixHash));
  }
  return telemetry;
}
