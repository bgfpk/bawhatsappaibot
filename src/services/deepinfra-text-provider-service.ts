export type DeepInfraChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content?: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
};

export type DeepInfraToolDefinition = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, any>;
  };
};

export type DeepInfraParsedToolCall = {
  id: string;
  name: string;
  arguments: Record<string, any>;
  rawArguments: string;
};

export function convertGeminiSchemaToOpenAi(schema: any): any {
  if (!schema || typeof schema !== "object") return schema;
  const result: any = Array.isArray(schema) ? [] : {};
  for (const [key, val] of Object.entries(schema)) {
    if (key === "type" && typeof val === "string") {
      result.type = val.toLowerCase();
    } else if (val && typeof val === "object") {
      result[key] = convertGeminiSchemaToOpenAi(val);
    } else {
      result[key] = val;
    }
  }
  return result;
}

export function convertGeminiToolsToDeepInfra(tools: any): DeepInfraToolDefinition[] {
  if (!tools) return [];
  const list = Array.isArray(tools) ? tools : [tools];
  const converted: DeepInfraToolDefinition[] = [];
  for (const group of list) {
    const decls = Array.isArray(group?.functionDeclarations) ? group.functionDeclarations : [];
    for (const decl of decls) {
      if (!decl?.name) continue;
      converted.push({
        type: "function",
        function: {
          name: String(decl.name),
          description: decl.description ? String(decl.description) : undefined,
          parameters: convertGeminiSchemaToOpenAi(decl.parameters) || { type: "object", properties: {} },
        },
      });
    }
  }
  return converted;
}

export type DeepInfraTextProviderInput = {
  purpose?: string;
  accountId?: string;
  botId?: string;
  customerJid?: string;
  stablePrompt?: string;
  messages?: DeepInfraChatMessage[];
  latestCustomerMessage?: string;
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
  response_format?: { type: "text" | "json_object" | "json_schema"; json_schema?: any };
  tools?: DeepInfraToolDefinition[];
  tool_choice?: "auto" | "none" | "required" | { type: "function"; function: { name: string } };
  modelOverride?: string;
  timeoutMs?: number;
  promptCacheKey?: string;
  billingContext?: Record<string, any>;
  fetchImpl?: typeof fetch;
};

export type DeepInfraTextProviderResult = {
  text: string;
  toolCalls?: DeepInfraParsedToolCall[];
  finishReason?: string;
  provider: "deepinfra";
  model: string;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  estimatedCost: number;
  requestStatus: "success" | "missing_key" | "invalid_response" | "failed";
  fallbackUsed: false;
  rawUsageSafe: Record<string, any>;
  latencyMs: number;
  httpStatus?: number;
  failureType?: string;
  timedOut?: boolean;
  aborted?: boolean;
  retryable?: boolean;
  providerRequestId?: string;
};

function clean(value: any, max = 4000) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanMultiline(value: any, max = 12000) {
  return String(value ?? "").replace(/\r\n/g, "\n").trim().slice(0, max);
}

function hashSafe(value: any) {
  const text = String(value || "");
  if (!text) return "";
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const p1 = (h1 >>> 0).toString(16).padStart(8, "0");
  const p2 = (h2 >>> 0).toString(16).padStart(8, "0");
  return (p1 + p2).slice(0, 16);
}

function maskToken(value: any) {
  const text = String(value || "");
  if (!text) return "";
  if (text.length <= 8) return `${text.slice(0, 2)}***`;
  return `${text.slice(0, 4)}...${text.slice(-3)}`;
}

function maskCustomerJid(value: any) {
  const [local, domain] = String(value || "").split("@");
  if (!local) return "";
  const maskedLocal = local.length <= 6 ? `${local.slice(0, 2)}***` : `${local.slice(0, 3)}...${local.slice(-2)}`;
  return domain ? `${maskedLocal}@${domain}` : maskedLocal;
}

function deepInfraBaseUrl() {
  return String(process.env.DEEPINFRA_BASE_URL || "https://api.deepinfra.com/v1/openai").replace(/\/+$/, "");
}

export function getDeepInfraTextModel() {
  return String(process.env.DEEPINFRA_TEXT_MODEL || "deepseek-ai/DeepSeek-V4-Flash").trim();
}

export function getAdminBusinessAgentModel() {
  return String(
    process.env.ADMIN_BUSINESS_AGENT_MODEL ||
    process.env.DEEPINFRA_TEXT_MODEL ||
    "deepseek-ai/DeepSeek-V4-Flash-0731"
  ).trim();
}

export function hasDeepInfraTextProviderKey(env: NodeJS.ProcessEnv = process.env) {
  return Boolean(String(env.DEEPINFRA_API_KEY || "").trim());
}

export function buildDeepInfraPromptCacheKey(input: { accountId?: any; botId?: any; purpose?: any; customerKey?: any }) {
  const parts = [
    "blackarrow",
    clean(input.accountId || "account", 80),
    clean(input.botId || "instance", 80),
    clean(input.purpose || "text", 80),
    clean(input.customerKey || "", 80),
  ].filter(Boolean);
  return parts.join(":").replace(/[^a-zA-Z0-9:_-]/g, "_").slice(0, 180);
}

function isCustomerFacingPurpose(purpose: any) {
  return /customer_ai_reply|customer_support_reply|sales_reply|product_service_question|smart_sales_text|ai_smart_followup/i.test(clean(purpose, 160));
}

function isAdminAgentPurpose(purpose: any) {
  return /admin_assistant_intent|admin_assistant_domain|admin_assistant_internal_planning/i.test(clean(purpose, 160));
}

function buildCustomerReplyQualityInstruction(purpose: any) {
  if (!isCustomerFacingPurpose(purpose)) return "";
  return `
BlackArrow customer reply quality rules:
- Reply like a strong WhatsApp sales/support assistant, not a tiny generic chatbot.
- Use the provided business instructions, CRM/order/lead context, product/service details, policies, Smart Sales guidance, and recent chat before answering.
- Answer the customer's latest message directly first. Then ask one useful next question that moves the lead/support conversation forward.
- Match the customer's language naturally: English, Urdu, or Roman Urdu.
- Do not simply repeat or mirror the customer's message. If the previous attempt was blocked for echoing, write a fresh direct answer.
- Do not invent prices, policies, stock, delivery promises, discounts, or commitments not present in context.
- Keep it concise for WhatsApp, but not empty/generic; usually 1-4 helpful sentences are better than one weak line.
`.trim();
}

export function buildDeepInfraTextMessages(input: DeepInfraTextProviderInput): DeepInfraChatMessage[] {
  const messages: DeepInfraChatMessage[] = [];
  const qualityInstruction = buildCustomerReplyQualityInstruction(input.purpose);
  const stablePrompt = cleanMultiline([input.stablePrompt, qualityInstruction].filter(Boolean).join("\n\n"), 20000);
  if (stablePrompt) messages.push({ role: "system", content: stablePrompt });
  for (const message of input.messages || []) {
    const role = message?.role === "assistant" ? "assistant" : message?.role === "system" ? "system" : message?.role === "tool" ? "tool" : "user";
    const content = message?.content ? cleanMultiline(message.content, 9000) : "";
    const msgObj: DeepInfraChatMessage = { role, content };
    if (message.name) msgObj.name = message.name;
    if (message.tool_call_id) msgObj.tool_call_id = message.tool_call_id;
    if (message.tool_calls) msgObj.tool_calls = message.tool_calls;
    messages.push(msgObj);
  }
  const latest = cleanMultiline(input.latestCustomerMessage, 9000);
  if (latest) messages.push({ role: "user", content: latest });
  return messages;
}

export function buildDeepInfraTelemetry(input: { purpose?: any; model?: any; promptTokens?: any; completionTokens?: any; cachedTokens?: any; estimatedCost?: any; requestStatus?: any; fallbackUsed?: any; fallbackReason?: any; skipReason?: any; latencyMs?: any; accountId?: any; botId?: any; customerJid?: any; promptCacheKeyAttached?: any; promptCacheKeyHash?: any; stablePromptHash?: any }) {
  return {
    provider: "deepinfra",
    model: clean(input.model, 160),
    purpose: clean(input.purpose, 120),
    promptTokens: Number(input.promptTokens || 0),
    completionTokens: Number(input.completionTokens || 0),
    totalTokens: Number(input.promptTokens || 0) + Number(input.completionTokens || 0),
    cachedTokens: Number(input.cachedTokens || 0),
    estimatedCost: Number(input.estimatedCost || 0),
    requestStatus: clean(input.requestStatus, 80),
    fallbackUsed: Boolean(input.fallbackUsed),
    fallbackReason: clean(input.fallbackReason, 120),
    skipReason: clean(input.skipReason, 120),
    latencyMs: Number(input.latencyMs || 0),
    promptCacheKeyAttached: Boolean(input.promptCacheKeyAttached),
    promptCacheKeyHash: clean(input.promptCacheKeyHash, 32),
    stablePromptHash: clean(input.stablePromptHash, 32),
    accountId: maskToken(input.accountId),
    botId: maskToken(input.botId),
    customerJid: maskCustomerJid(input.customerJid),
  };
}

function buildRequestBody(input: DeepInfraTextProviderInput, model: string, messages: DeepInfraChatMessage[]) {
  const customerFacing = isCustomerFacingPurpose(input.purpose);
  const body: any = {
    model,
    messages,
    max_tokens: Math.max(1, Number(input.maxTokens || (customerFacing ? 900 : 700))),
    temperature: input.temperature === undefined ? (customerFacing ? 0.55 : 0.4) : Number(input.temperature),
  };

  if (input.response_format) {
    body.response_format = input.response_format;
  } else if (input.jsonMode) {
    body.response_format = { type: "json_object" };
  }

  if (Array.isArray(input.tools) && input.tools.length > 0) {
    body.tools = input.tools;
    body.tool_choice = input.tool_choice || "auto";
  }

  const promptCacheKey = clean(input.promptCacheKey, 180);
  if (promptCacheKey) body.extra_body = { prompt_cache_key: promptCacheKey };
  return body;
}

export async function generateWithDeepInfraTextProvider(input: DeepInfraTextProviderInput): Promise<DeepInfraTextProviderResult> {
  const startedAt = Date.now();
  const apiKey = String(process.env.DEEPINFRA_API_KEY || "").trim();
  const model = input.modelOverride || (isAdminAgentPurpose(input.purpose) ? getAdminBusinessAgentModel() : getDeepInfraTextModel());
  const promptCacheKey = clean(input.promptCacheKey, 180);
  const promptCacheKeyHash = hashSafe(promptCacheKey);
  const stablePromptHash = hashSafe(cleanMultiline(input.stablePrompt, 20000));
  if (!apiKey) {
    return { text: "", provider: "deepinfra", model, promptTokens: 0, completionTokens: 0, cachedTokens: 0, estimatedCost: 0, requestStatus: "missing_key", fallbackUsed: false, rawUsageSafe: { prompt_cache_key_attached: Boolean(promptCacheKey), prompt_cache_key_hash: promptCacheKeyHash, stable_prompt_hash: stablePromptHash }, latencyMs: Date.now() - startedAt };
  }

  const messages = buildDeepInfraTextMessages(input);
  if (messages.length === 0) {
    return { text: "", provider: "deepinfra", model, promptTokens: 0, completionTokens: 0, cachedTokens: 0, estimatedCost: 0, requestStatus: "invalid_response", fallbackUsed: false, rawUsageSafe: { prompt_cache_key_attached: Boolean(promptCacheKey), prompt_cache_key_hash: promptCacheKeyHash, stable_prompt_hash: stablePromptHash }, latencyMs: Date.now() - startedAt };
  }

  const controller = new AbortController();
  const timeoutMs = Math.max(1000, Number(input.timeoutMs || 25000));
  const timeout = setTimeout(() => controller.abort("timeout"), timeoutMs);

  try {
    const response = await (input.fetchImpl || fetch)(`${deepInfraBaseUrl()}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(buildRequestBody(input, model, messages)),
      signal: controller.signal,
    });
    const providerRequestId = clean(response.headers?.get?.("x-request-id") || response.headers?.get?.("request-id"), 180);

    if (!response.ok) {
      const httpStatus = response.status;
      const retryable = httpStatus === 429 || httpStatus === 499 || httpStatus >= 500;
      return {
        text: "", provider: "deepinfra", model, promptTokens: 0, completionTokens: 0, cachedTokens: 0, estimatedCost: 0,
        requestStatus: "failed", fallbackUsed: false,
        rawUsageSafe: { status: response.status, prompt_cache_key_attached: Boolean(promptCacheKey), prompt_cache_key_hash: promptCacheKeyHash, stable_prompt_hash: stablePromptHash },
        latencyMs: Date.now() - startedAt,
        httpStatus,
        failureType: `http_${httpStatus}`,
        timedOut: false,
        aborted: false,
        retryable,
        providerRequestId: providerRequestId || undefined,
      };
    }

    const payload: any = await response.json().catch(() => null);
    const text = cleanMultiline(payload?.choices?.[0]?.message?.content, 12000);
    const finishReason = payload?.choices?.[0]?.finish_reason;
    const rawCalls = payload?.choices?.[0]?.message?.tool_calls;
    let toolCalls: DeepInfraParsedToolCall[] | undefined = undefined;

    if (Array.isArray(rawCalls) && rawCalls.length > 0) {
      toolCalls = rawCalls.map((tc: any) => {
        let args: any = {};
        const rawArgs = String(tc?.function?.arguments || "{}");
        try {
          args = JSON.parse(rawArgs);
        } catch {
          args = {};
        }
        return {
          id: String(tc?.id || ""),
          name: String(tc?.function?.name || ""),
          arguments: args,
          rawArguments: rawArgs,
        };
      });
    }

    const usage = payload?.usage || {};
    const promptTokens = Number(usage.prompt_tokens || 0);
    const completionTokens = Number(usage.completion_tokens || 0);
    const cachedTokens = Number(usage.cached_tokens || usage.prompt_cache_hit_tokens || usage.prompt_cache_read_tokens || 0);
    const hasValidOutput = Boolean(text || (toolCalls && toolCalls.length > 0));

    return {
      text,
      toolCalls,
      finishReason,
      provider: "deepinfra",
      model,
      promptTokens,
      completionTokens,
      cachedTokens,
      estimatedCost: 0,
      requestStatus: hasValidOutput ? "success" : "invalid_response",
      fallbackUsed: false,
      rawUsageSafe: { prompt_tokens: promptTokens, completion_tokens: completionTokens, cached_tokens: cachedTokens, prompt_cache_key_attached: Boolean(promptCacheKey), prompt_cache_key_hash: promptCacheKeyHash, stable_prompt_hash: stablePromptHash },
      latencyMs: Date.now() - startedAt,
      httpStatus: 200,
      failureType: hasValidOutput ? "" : "empty_response",
      providerRequestId: clean(payload?.request_id || payload?.id || providerRequestId, 180) || undefined,
    };
  } catch (err: any) {
    const isTimeout = err?.name === "TimeoutError" || controller.signal.reason === "timeout";
    const isAbort = err?.name === "AbortError" && !isTimeout;
    return {
      text: "", provider: "deepinfra", model, promptTokens: 0, completionTokens: 0, cachedTokens: 0, estimatedCost: 0,
      requestStatus: "failed", fallbackUsed: false,
      rawUsageSafe: { prompt_cache_key_attached: Boolean(promptCacheKey), prompt_cache_key_hash: promptCacheKeyHash, stable_prompt_hash: stablePromptHash },
      latencyMs: Date.now() - startedAt,
      failureType: isTimeout ? "timeout" : (isAbort ? "aborted" : "network_error"),
      timedOut: isTimeout,
      aborted: isAbort,
      retryable: isTimeout || isAbort || err?.name === "TypeError",
    };
  } finally {
    clearTimeout(timeout);
  }
}
