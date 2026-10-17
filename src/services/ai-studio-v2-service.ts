export type AiStudioStatusInput = {
  botName?: string;
  businessType?: string;
  instructions?: string;
  learnedKnowledge?: string;
  replyMode?: string;
  products?: any[];
  syncGroups?: any[];
  clientGeminiStatus?: any;
  cacheBoostEnabled?: boolean;
  customerIntelligenceEnabled?: boolean;
  smartSalesEnabled?: boolean;
  usage?: any;
};

export type AiStudioStatusCard = {
  id: string;
  label: string;
  status: "ready" | "partial" | "not_connected";
  value: string;
  action: string;
};

function text(value: any) {
  return String(value ?? "").trim();
}

function count(items: any) {
  return Array.isArray(items) ? items.length : 0;
}

function statusFromBoolean(value: boolean, readyValue: string, missingValue = "Not connected yet") {
  return { status: value ? "ready" as const : "not_connected" as const, value: value ? readyValue : missingValue };
}

export function buildAiStudioV2Status(input: AiStudioStatusInput = {}) {
  const hasPersona = Boolean(text(input.botName) || text(input.businessType) || text(input.instructions));
  const hasInstructions = text(input.instructions).length >= 30;
  const productsCount = count(input.products);
  const groupsCount = count(input.syncGroups);
  const knowledgeChars = text(input.learnedKnowledge).length;
  const geminiHasKey = Boolean(input.clientGeminiStatus?.hasKey || input.clientGeminiStatus?.enabled);
  const usageTotal = Number(input.usage?.total?.customGeminiCycles || input.usage?.total?.customGeminiRequests || 0);

  const cards: AiStudioStatusCard[] = [
    {
      id: "personality",
      label: "Personality",
      ...(hasPersona ? { status: hasInstructions ? "ready" as const : "partial" as const, value: hasInstructions ? "Instructions ready" : "Basic persona saved" } : { status: "not_connected" as const, value: "Open settings" }),
      action: "Edit persona",
    },
    {
      id: "reply_mode",
      label: "Reply mode",
      status: text(input.replyMode) ? "ready" : "partial",
      value: text(input.replyMode) ? text(input.replyMode).replace(/_/g, " ") : "Default behavior",
      action: "Review behavior",
    },
    {
      id: "knowledge",
      label: "Knowledge",
      status: knowledgeChars > 0 || productsCount > 0 || groupsCount > 0 ? "ready" : "not_connected",
      value: knowledgeChars > 0 ? `${knowledgeChars.toLocaleString()} chars learned` : productsCount > 0 ? `${productsCount} products/services` : groupsCount > 0 ? `${groupsCount} media/sequence groups` : "Not connected yet",
      action: "Open knowledge",
    },
    {
      id: "actions",
      label: "Actions",
      ...statusFromBoolean(Boolean(input.smartSalesEnabled), "Smart Sales available", "Manual actions only"),
      action: "Review actions",
    },
    {
      id: "memory",
      label: "Memory",
      status: knowledgeChars > 0 || Boolean(input.customerIntelligenceEnabled) ? "ready" : "not_connected",
      value: input.customerIntelligenceEnabled ? "Customer intelligence on" : knowledgeChars > 0 ? "Learned facts available" : "Not connected yet",
      action: "Open memory",
    },
    {
      id: "analytics",
      label: "Analytics",
      status: usageTotal > 0 ? "ready" : "not_connected",
      value: usageTotal > 0 ? `${usageTotal.toLocaleString()} AI cycles` : "No usage yet",
      action: "View usage",
    },
    {
      id: "provider",
      label: "AI provider",
      status: geminiHasKey ? "ready" : "partial",
      value: geminiHasKey ? "Custom Gemini configured" : "Hosted AI default",
      action: input.cacheBoostEnabled ? "Cache Boost on" : "Review provider",
    },
  ];

  return {
    cards,
    readyCount: cards.filter((card) => card.status === "ready").length,
    partialCount: cards.filter((card) => card.status === "partial").length,
    notConnectedCount: cards.filter((card) => card.status === "not_connected").length,
  };
}
