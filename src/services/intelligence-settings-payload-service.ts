export type IntelligenceTab = "instructions" | "learned" | "fields" | "calls" | "integrations" | "smart_sales";

type IntelligenceSettingsSnapshot = {
  systemPrompt: string;
  botName: string;
  botGender: string;
  botVoice: string;
  businessType: string;
  learnedInstructions: string;
  customFields: any[];
  rejectCalls: number;
  mutedNumbers: string[];
  difficultCustomerMode: string;
  replyBehavior: string;
  replyInGroups: number;
  voiceSimulationEnabled: number;
  postexApiKey: string;
  leopardsApiKey: string;
  leopardsApiPassword: string;
  dhlApiKey: string;
  dhlService: string;
  dhlRequesterCountryCode: string;
  dhlOriginCountryCode: string;
  dhlLanguage: string;
  dhlEnabled: boolean;
  adminNumber: string;
  smartSalesEngineEnabled?: boolean;
  customerIntelligenceScanEnabled?: boolean;
};

function cloneFields(fields: any[]) {
  return Array.isArray(fields) ? fields.map((field) => ({ ...field })) : [];
}

export function buildSharedAiInstructionsPayload(snapshot: IntelligenceSettingsSnapshot) {
  return {
    systemPrompt: snapshot.systemPrompt,
    botName: snapshot.botName,
    botGender: snapshot.botGender,
    botVoice: snapshot.botVoice,
    businessType: snapshot.businessType,
  };
}

export function buildAiLearnedKnowledgePayload(snapshot: IntelligenceSettingsSnapshot) {
  return {
    learnedInstructions: snapshot.learnedInstructions,
  };
}

export function buildConfirmationFieldsPayload(snapshot: IntelligenceSettingsSnapshot) {
  return {
    customFields: cloneFields(snapshot.customFields),
    customer_details_configured: true,
  };
}

export function getCustomerDetailsConfiguredSignal(config: any): boolean | undefined {
  if (Object.prototype.hasOwnProperty.call(config || {}, "customer_details_configured")) {
    return config.customer_details_configured === true || config.customer_details_configured === 1 || config.customer_details_configured === "1" || config.customer_details_configured === "true";
  }
  if (Object.prototype.hasOwnProperty.call(config || {}, "customerDetailsConfigured")) {
    return config.customerDetailsConfigured === true || config.customerDetailsConfigured === 1 || config.customerDetailsConfigured === "1" || config.customerDetailsConfigured === "true";
  }
  return undefined;
}

export function resolveCustomerDetailsConfigured(config: any) {
  return getCustomerDetailsConfiguredSignal(config) === true;
}

export function buildReplyModePayload(snapshot: IntelligenceSettingsSnapshot) {
  return {
    rejectCalls: snapshot.rejectCalls,
    muted_numbers: Array.isArray(snapshot.mutedNumbers) ? [...snapshot.mutedNumbers] : [],
    difficultCustomerMode: snapshot.difficultCustomerMode,
    replyBehavior: snapshot.replyBehavior,
    replyInGroups: snapshot.replyInGroups,
    voiceSimulationEnabled: snapshot.voiceSimulationEnabled,
  };
}

export function buildIntegrationPayload(snapshot: IntelligenceSettingsSnapshot) {
  return {
    postexApiKey: snapshot.postexApiKey,
    leopardsApiKey: snapshot.leopardsApiKey,
    leopardsApiPassword: snapshot.leopardsApiPassword,
    dhlApiKey: snapshot.dhlApiKey,
    dhlService: snapshot.dhlService,
    dhlRequesterCountryCode: snapshot.dhlRequesterCountryCode,
    dhlOriginCountryCode: snapshot.dhlOriginCountryCode,
    dhlLanguage: snapshot.dhlLanguage,
    dhlEnabled: snapshot.dhlEnabled,
    adminNumber: snapshot.adminNumber,
  };
}

export function buildSmartSalesPayload(snapshot: IntelligenceSettingsSnapshot) {
  return {
    smartSalesEngineEnabled: snapshot.smartSalesEngineEnabled ? 1 : 0,
    smartSalesExtraCharge: 0.001,
    smartSalesPromptVersion: "v1",
    customerIntelligenceScanEnabled: snapshot.customerIntelligenceScanEnabled ? 1 : 0,
  };
}

export function getIntelligenceSaveButtonLabel(tab: IntelligenceTab) {
  switch (tab) {
    case "instructions":
      return "Save basics";
    case "learned":
      return "Save knowledge";
    case "fields":
      return "Save customer details";
    case "calls":
      return "Save reply rules";
    case "integrations":
      return "Save API & Integrations";
    case "smart_sales":
      return "Save advanced settings";
  }
}

export function isIntelligenceTabSaving(activeTab: IntelligenceTab, savingTab: IntelligenceTab | null) {
  return activeTab === savingTab;
}
