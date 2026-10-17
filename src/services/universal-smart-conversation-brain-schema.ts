export const SMART_BRAIN_BUSINESS_TYPES = [
  "ecommerce",
  "service",
  "agency",
  "clinic",
  "hospital",
  "school",
  "other",
] as const;

export const SMART_BRAIN_INTENTS = [
  "price",
  "product",
  "service_quote",
  "appointment",
  "admission",
  "support",
  "complaint",
  "order",
  "booking",
  "follow_up",
  "human_request",
  "general",
] as const;

export const SMART_BRAIN_STAGES = [
  "new",
  "browsing",
  "interested",
  "comparing",
  "ready",
  "waiting",
  "blocked",
  "handoff_needed",
] as const;

export const SMART_BRAIN_RISK_LEVELS = ["low", "medium", "high"] as const;
export const SMART_BRAIN_LEAD_QUALITIES = ["cold", "warm", "hot"] as const;

export const SMART_BRAIN_NEXT_BEST_ACTIONS = [
  "answer",
  "ask_one_field",
  "send_media",
  "save_draft",
  "handoff",
  "skip_reply",
] as const;

export const SMART_BRAIN_REPLY_STYLES = [
  "concise",
  "reassuring",
  "qualifying",
  "confirmation",
  "handoff_safe",
] as const;

export type SmartBrainBusinessType = typeof SMART_BRAIN_BUSINESS_TYPES[number];
export type SmartBrainIntent = typeof SMART_BRAIN_INTENTS[number];
export type SmartBrainStage = typeof SMART_BRAIN_STAGES[number];
export type SmartBrainRiskLevel = typeof SMART_BRAIN_RISK_LEVELS[number];
export type SmartBrainLeadQuality = typeof SMART_BRAIN_LEAD_QUALITIES[number];
export type SmartBrainNextBestAction = typeof SMART_BRAIN_NEXT_BEST_ACTIONS[number];
export type SmartBrainReplyStyle = typeof SMART_BRAIN_REPLY_STYLES[number];

export type SmartBrainContextObject = Record<string, string | number | boolean | null>;

export type UniversalSmartConversationBrainResult = {
  business_type: SmartBrainBusinessType;
  intent: SmartBrainIntent;
  stage: SmartBrainStage;
  risk_level: SmartBrainRiskLevel;
  lead_quality: SmartBrainLeadQuality;
  missing_required_fields: string[];
  missing_optional_fields: string[];
  next_best_action: SmartBrainNextBestAction;
  recommended_reply_style: SmartBrainReplyStyle;
  facts_to_use: string[];
  facts_to_avoid: string[];
  product_or_service_matches: string[];
  appointment_or_booking_context: SmartBrainContextObject;
  medical_safety_context: SmartBrainContextObject;
  school_admission_context: SmartBrainContextObject;
  service_quote_context: SmartBrainContextObject;
  handoff_reason: string;
  follow_up_reason: string;
  confidence: number;
  should_use_flash: boolean;
  should_handoff: boolean;
  should_skip_reply: boolean;
  cache_context_key: string;
};

export const DEFAULT_SMART_BRAIN_RESULT: UniversalSmartConversationBrainResult = {
  business_type: "other",
  intent: "general",
  stage: "new",
  risk_level: "low",
  lead_quality: "cold",
  missing_required_fields: [],
  missing_optional_fields: [],
  next_best_action: "answer",
  recommended_reply_style: "concise",
  facts_to_use: [],
  facts_to_avoid: [],
  product_or_service_matches: [],
  appointment_or_booking_context: {},
  medical_safety_context: {},
  school_admission_context: {},
  service_quote_context: {},
  handoff_reason: "",
  follow_up_reason: "",
  confidence: 0,
  should_use_flash: true,
  should_handoff: false,
  should_skip_reply: false,
  cache_context_key: "",
};

export type SmartBrainDefaultInput = {
  businessType?: any;
  activeRecord?: any;
  cacheContextKey?: any;
};

export type SmartBrainLogSummary = {
  business_type: SmartBrainBusinessType;
  intent: SmartBrainIntent;
  stage: SmartBrainStage;
  risk_level: SmartBrainRiskLevel;
  lead_quality: SmartBrainLeadQuality;
  next_best_action: SmartBrainNextBestAction;
  confidence: number;
  enabled: false;
  source: "phase_a_default";
  reason: "logging_only_no_behavior_change";
};
