import { isMutedCustomer } from "./muted-number-service.ts";

export const DIFFICULT_CUSTOMER_MODE_AI_CONTROL = "ai_control";
export const DIFFICULT_CUSTOMER_MODE_ADMIN_PAUSE = "admin_pause";
export const CUSTOMER_AI_PAUSE_CATEGORY_MANUAL_REVIEW = "manual_review";
export const CUSTOMER_AI_PAUSE_CATEGORY_IRRELEVANT = "irrelevant_pause";

export type CustomerAutoReplyStopKind =
  | "active"
  | "admin_pause_temp"
  | "admin_pause_permanent"
  | "manual_review"
  | "irrelevant_pause";

export function getDifficultCustomerMode(config: any = {}) {
  const mode = String(config?.difficult_customer_mode || config?.difficultCustomerMode || "").trim();
  return mode === DIFFICULT_CUSTOMER_MODE_AI_CONTROL ? mode : DIFFICULT_CUSTOMER_MODE_ADMIN_PAUSE;
}

export function shouldAdminHandleDifficultCustomer(config: any = {}) {
  return getDifficultCustomerMode(config) === DIFFICULT_CUSTOMER_MODE_ADMIN_PAUSE;
}

function normalizePauseCategory(profile: any = {}) {
  const value = String(profile?.aiPauseCategory || "").trim();
  if (value === CUSTOMER_AI_PAUSE_CATEGORY_IRRELEVANT) return value;
  if (value === CUSTOMER_AI_PAUSE_CATEGORY_MANUAL_REVIEW) return value;
  if (Number(profile?.irrelevantCustomerDetectedAt || 0) > 0) return CUSTOMER_AI_PAUSE_CATEGORY_IRRELEVANT;
  return CUSTOMER_AI_PAUSE_CATEGORY_MANUAL_REVIEW;
}

export function getCustomerAutoReplyStopState(
  profile: any = {},
  nowSeconds = Math.floor(Date.now() / 1000),
  options: {
    jid?: any;
    altJid?: any;
    mutedNumbers?: any[];
  } = {}
) {
  const botReplyControl = String(profile?.botReplyControl || "").trim();
  const botReplyStopSource = String(profile?.botReplyStopSource || "").trim();

  // 1. Explicit permanent pause
  if (profile?.botReplyPausedPermanent === true || botReplyControl === "paused_permanent") {
    return {
      isStopped: true,
      kind: "admin_pause_permanent" as CustomerAutoReplyStopKind,
      message: "permanently stopped by admin command",
      reason: "customer_paused_permanent",
    };
  }

  // 2. Explicit temporary pause
  const until = Number(profile?.botReplyPausedUntil || 0);
  if (botReplyControl === "paused_temp") {
    if (until > nowSeconds) {
      return {
        isStopped: true,
        kind: "admin_pause_temp" as CustomerAutoReplyStopKind,
        message: `paused by admin command until ${new Date(until * 1000).toLocaleTimeString()}`,
        reason: "customer_paused_temp",
      };
    }
    // Expired temporary pause is active!
    return { isStopped: false, kind: "active" as CustomerAutoReplyStopKind, message: "", reason: "" };
  }

  // 3. Explicit active state (wins over legacy mute)
  if (botReplyControl === "active") {
    return { isStopped: false, kind: "active" as CustomerAutoReplyStopKind, message: "", reason: "" };
  }

  if (botReplyStopSource === ".0" || botReplyStopSource === ".00") {
    return { isStopped: false, kind: "active" as CustomerAutoReplyStopKind, message: "", reason: "" };
  }

  // 4. Check manual review / irrelevant pause
  const paused = profile?.aiPaused === true || profile?.ai_paused === true || profile?.aiPaused === 1 || profile?.ai_paused === 1;
  if (paused) {
    const category = normalizePauseCategory(profile);
    if (category === CUSTOMER_AI_PAUSE_CATEGORY_IRRELEVANT) {
      return {
        isStopped: true,
        kind: "irrelevant_pause" as CustomerAutoReplyStopKind,
        message: "manual review required (irrelevant/timepass/abusive customer)",
        reason: "manual_review_required",
      };
    }

    return {
      isStopped: true,
      kind: "manual_review" as CustomerAutoReplyStopKind,
      message: "manual review required",
      reason: "manual_review_required",
    };
  }

  // 5. Fallback / legacy check: If profile has no explicit botReplyControl, check mutedNumbers
  if (Array.isArray(options.mutedNumbers) && options.mutedNumbers.length > 0) {
    if (isMutedCustomer(options.jid, options.altJid, options.mutedNumbers, profile)) {
      return {
        isStopped: true,
        kind: "admin_pause_permanent" as CustomerAutoReplyStopKind,
        message: "number is muted",
        reason: "number_muted",
      };
    }
  }

  return { isStopped: false, kind: "active" as CustomerAutoReplyStopKind, message: "", reason: "" };
}

export function isCustomerAiPaused(profile: any = {}) {
  const botReplyControl = String(profile?.botReplyControl || "").trim();
  const botReplyStopSource = String(profile?.botReplyStopSource || "").trim();
  if (botReplyControl === "active" || botReplyControl === "paused_temp" || botReplyControl === "paused_permanent" || botReplyStopSource === ".0" || botReplyStopSource === ".00") {
    return false;
  }
  const state = getCustomerAutoReplyStopState(profile);
  return state.kind === "manual_review" || state.kind === "irrelevant_pause";
}

export function buildCustomerAiPausePatch(
  reason: any,
  nowSeconds = Math.floor(Date.now() / 1000),
  category: string = CUSTOMER_AI_PAUSE_CATEGORY_MANUAL_REVIEW
) {
  return {
    aiPaused: true,
    ai_paused: true,
    aiPausedAt: nowSeconds,
    aiPauseCategory: String(category || CUSTOMER_AI_PAUSE_CATEGORY_MANUAL_REVIEW),
    aiPauseReason: String(reason || "admin_handoff").slice(0, 240),
  };
}

export function buildCustomerAiResumePatch(nowSeconds = Math.floor(Date.now() / 1000)) {
  return {
    aiPaused: false,
    ai_paused: false,
    aiResumedAt: nowSeconds,
    aiPauseCategory: "",
    aiPauseReason: "",
  };
}
