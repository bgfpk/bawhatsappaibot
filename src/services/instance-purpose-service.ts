/**
 * Instance Purpose & Personal Instance Control Link Service
 * 
 * Provides canonical types, normalization, and validation rules for
 * Business vs. Personal WhatsApp instance modes and control links.
 */

import { isLidJid, extractPhoneDigits } from "./whatsapp-contact-identity-resolver.ts";

export type InstancePurpose = "business" | "personal";

export interface PersonalInstanceControlLink {
  controlBusinessInstanceId?: string;
  linkStatus?: "active" | "setup_incomplete" | "control_unavailable";
}

export interface InstancePurposeConfig {
  instancePurpose?: InstancePurpose;
  controlBusinessInstanceId?: string;
}

/**
 * Normalizes input into a canonical InstancePurpose.
 * Defaults strictly to "business" for backward-compatibility with all legacy/empty configs.
 */
export function normalizeInstancePurpose(val: any): InstancePurpose {
  if (typeof val === "string" && val.trim().toLowerCase() === "personal") {
    return "personal";
  }
  return "business";
}

/**
 * Extracts normalized instance purpose from a bot document or config object.
 */
export function getInstancePurpose(configOrBot: any): InstancePurpose {
  if (!configOrBot) return "business";
  if (typeof configOrBot === "string") {
    return normalizeInstancePurpose(configOrBot);
  }
  if (configOrBot.instancePurpose) {
    return normalizeInstancePurpose(configOrBot.instancePurpose);
  }
  if (configOrBot.instance_purpose) {
    return normalizeInstancePurpose(configOrBot.instance_purpose);
  }
  if (configOrBot.config_settings) {
    const parsed = typeof configOrBot.config_settings === "string"
      ? parseJsonSafe(configOrBot.config_settings)
      : configOrBot.config_settings;
    if (parsed?.instancePurpose) {
      return normalizeInstancePurpose(parsed.instancePurpose);
    }
    if (parsed?.instance_purpose) {
      return normalizeInstancePurpose(parsed.instance_purpose);
    }
  }
  return "business";
}

/**
 * Returns true if the instance is configured as a Personal Assistant instance.
 */
export function isPersonalInstance(configOrBot: any): boolean {
  return getInstancePurpose(configOrBot) === "personal";
}

/**
 * Returns true if the instance is configured as a Business instance.
 */
export function isBusinessInstance(configOrBot: any): boolean {
  return getInstancePurpose(configOrBot) === "business";
}

/**
 * Extracts controlBusinessInstanceId from a bot document or config object.
 */
export function getControlBusinessInstanceId(configOrBot: any): string | undefined {
  if (!configOrBot) return undefined;
  if (typeof configOrBot.controlBusinessInstanceId === "string" && configOrBot.controlBusinessInstanceId.trim()) {
    return configOrBot.controlBusinessInstanceId.trim();
  }
  if (typeof configOrBot.control_business_instance_id === "string" && configOrBot.control_business_instance_id.trim()) {
    return configOrBot.control_business_instance_id.trim();
  }
  if (configOrBot.config_settings) {
    const parsed = typeof configOrBot.config_settings === "string"
      ? parseJsonSafe(configOrBot.config_settings)
      : configOrBot.config_settings;
    if (typeof parsed?.controlBusinessInstanceId === "string" && parsed.controlBusinessInstanceId.trim()) {
      return parsed.controlBusinessInstanceId.trim();
    }
    if (typeof parsed?.control_business_instance_id === "string" && parsed.control_business_instance_id.trim()) {
      return parsed.control_business_instance_id.trim();
    }
  }
  return undefined;
}

export interface ValidateControlBusinessLinkParams {
  personalBotId?: string;
  personalUserId: string;
  controlBotId: string;
  getBotById: (id: string) => Promise<any> | any;
}

/**
 * Validates that a personal instance's controlling business instance link is valid,
 * same-tenant, exists, is not self-referential, and is actually a business instance.
 */
export async function validateControlBusinessLink(
  params: ValidateControlBusinessLinkParams
): Promise<{ valid: boolean; reason?: string; controlBot?: any }> {
  const { personalBotId, personalUserId, controlBotId, getBotById } = params;

  if (!controlBotId || typeof controlBotId !== "string" || !controlBotId.trim()) {
    return { valid: false, reason: "Missing controlling business instance ID" };
  }

  const cleanControlId = controlBotId.trim();

  if (personalBotId && personalBotId.trim() === cleanControlId) {
    return { valid: false, reason: "Personal instance cannot control itself" };
  }

  if (!personalUserId || typeof personalUserId !== "string" || !personalUserId.trim()) {
    return { valid: false, reason: "Missing personal instance owner user ID" };
  }

  let controlBot: any = null;
  try {
    controlBot = await getBotById(cleanControlId);
  } catch (e: any) {
    return { valid: false, reason: `Failed to retrieve controlling business instance: ${e?.message || e}` };
  }

  if (!controlBot) {
    return { valid: false, reason: "Controlling business instance does not exist" };
  }

  const controlOwnerId = controlBot.user_id || controlBot.userId;
  if (!controlOwnerId || String(controlOwnerId).trim() !== String(personalUserId).trim()) {
    return {
      valid: false,
      reason: "Controlling business instance belongs to a different account (cross-tenant link forbidden)",
    };
  }

  if (isPersonalInstance(controlBot)) {
    return {
      valid: false,
      reason: "Controlling instance must be a business instance, not another personal instance",
    };
  }

  return { valid: true, controlBot };
}

/**
 * Resolves the link status of a personal instance.
 */
export function resolvePersonalInstanceLinkStatus(params: {
  personalBot: any;
  controlBot?: any;
}): "active" | "setup_incomplete" | "control_unavailable" {
  const { personalBot, controlBot } = params;
  if (!personalBot) return "setup_incomplete";

  const controlId = getControlBusinessInstanceId(personalBot);
  if (!controlId) return "setup_incomplete";

  if (controlBot === null) return "control_unavailable";
  if (controlBot !== undefined) {
    if (isPersonalInstance(controlBot)) return "control_unavailable";
    const personalOwner = personalBot.user_id || personalBot.userId;
    const controlOwner = controlBot.user_id || controlBot.userId;
    if (personalOwner && controlOwner && String(personalOwner) !== String(controlOwner)) {
      return "control_unavailable";
    }
  }

  return "active";
}

export interface CanonicalInstanceStatus {
  botId: string;
  name: string;
  displayName: string;
  purpose: InstancePurpose;
  phone: string;
  formattedPhone: string;
  rawJid: string;
  isActive: boolean;
  connectionState: "connected" | "connecting" | "qr_required" | "disconnected" | "paused" | "error";
  isConnected: boolean;
  controllingBusinessInstanceId?: string;
  controllingBusinessInstanceName?: string;
  controllingBusinessPhone?: string;
  incomingAssistantEnabled: boolean;
  incomingAssistantRuntimeStatus: "auto_replying" | "waiting_connection" | "disabled";
}

/**
 * Server-authoritative canonical resolver for instance identity, connection state,
 * and phone number normalization across Instance Hub, Personal Assistant, and Admin tools.
 */
export function resolveCanonicalInstanceStatus(
  bot: any,
  allBots: any[] = [],
  activeWorkersMap?: Map<string, any>
): CanonicalInstanceStatus {
  const botId = String(bot?.$id || bot?.id || bot?.bot_id || "").trim();
  const name = String(bot?.name || bot?.display_name || (getInstancePurpose(bot) === "personal" ? "Personal WhatsApp" : "WhatsApp Instance")).trim();
  const displayName = name;
  const purpose = getInstancePurpose(bot);
  const rawJid = String(bot?.jid || "").trim();

  // Extract phone digits safely, ignoring LID IDs
  let phone = "";
  if (bot?.phone_number && !isLidJid(bot.phone_number)) {
    phone = extractPhoneDigits(bot.phone_number) || bot.phone_number.replace(/\D/g, "");
  } else if (bot?.phoneNumber && !isLidJid(bot.phoneNumber)) {
    phone = extractPhoneDigits(bot.phoneNumber) || bot.phoneNumber.replace(/\D/g, "");
  } else if (bot?.phone && !isLidJid(bot.phone)) {
    phone = extractPhoneDigits(bot.phone) || bot.phone.replace(/\D/g, "");
  } else if (rawJid && !isLidJid(rawJid)) {
    phone = extractPhoneDigits(rawJid) || rawJid.replace(/@.*$/, "").replace(/\D/g, "");
  }

  const formattedPhone = phone ? (phone.startsWith("+") ? phone : `+${phone}`) : "";
  const isActive = bot?.is_active !== 0;

  // Determine connection status canonically
  const rawStatus = String(bot?.status || bot?.connection_status || bot?.connectionStatus || "").toLowerCase().trim();
  const isWorkerActive = activeWorkersMap ? activeWorkersMap.has(botId) : false;

  let connectionState: "connected" | "connecting" | "qr_required" | "disconnected" | "paused" | "error" = "disconnected";
  if (!isActive) {
    connectionState = "paused";
  } else if (
    rawStatus === "connected" ||
    rawStatus === "ready" ||
    isWorkerActive ||
    Boolean(rawJid && !isLidJid(rawJid) && rawStatus !== "qr-ready" && rawStatus !== "error" && rawStatus !== "disconnected")
  ) {
    connectionState = "connected";
  } else if (rawStatus === "qr-ready" || rawStatus === "qr_required") {
    connectionState = "qr_required";
  } else if (rawStatus === "connecting" || rawStatus === "proxy-connecting" || rawStatus === "retrying") {
    connectionState = "connecting";
  } else if (rawStatus === "error") {
    connectionState = "error";
  } else {
    connectionState = "disconnected";
  }

  const isConnected = connectionState === "connected";

  // Controlling business instance (for personal bots)
  let controllingBusinessInstanceId: string | undefined;
  let controllingBusinessInstanceName: string | undefined;
  let controllingBusinessPhone: string | undefined;

  if (purpose === "personal") {
    controllingBusinessInstanceId = getControlBusinessInstanceId(bot);
    if (controllingBusinessInstanceId) {
      const controlBot = allBots.find(
        (b) => (b.$id || b.id || b.bot_id) === controllingBusinessInstanceId
      );
      if (controlBot) {
        controllingBusinessInstanceName = controlBot.name || controlBot.display_name || `Business (${controllingBusinessInstanceId.slice(0, 8)}...)`;
        let cbPhone = "";
        if (controlBot.phone_number && !isLidJid(controlBot.phone_number)) {
          cbPhone = extractPhoneDigits(controlBot.phone_number) || controlBot.phone_number.replace(/\D/g, "");
        } else if (controlBot.jid && !isLidJid(controlBot.jid)) {
          cbPhone = extractPhoneDigits(controlBot.jid) || controlBot.jid.replace(/@.*$/, "").replace(/\D/g, "");
        }
        controllingBusinessPhone = cbPhone ? (cbPhone.startsWith("+") ? cbPhone : `+${cbPhone}`) : undefined;
      } else {
        controllingBusinessInstanceName = `Business (${controllingBusinessInstanceId.slice(0, 8)}...)`;
      }
    }
  }

  // Incoming assistant status
  const parsedSettings = typeof bot?.config_settings === "string"
    ? parseJsonSafe(bot.config_settings)
    : bot?.config_settings;
  const incomingAssistantEnabled = Boolean(parsedSettings?.personalIncomingAssistant?.enabled ?? true);

  let incomingAssistantRuntimeStatus: "auto_replying" | "waiting_connection" | "disabled" = "disabled";
  if (!incomingAssistantEnabled) {
    incomingAssistantRuntimeStatus = "disabled";
  } else if (isConnected) {
    incomingAssistantRuntimeStatus = "auto_replying";
  } else {
    incomingAssistantRuntimeStatus = "waiting_connection";
  }

  return {
    botId,
    name,
    displayName,
    purpose,
    phone,
    formattedPhone,
    rawJid,
    isActive,
    connectionState,
    isConnected,
    controllingBusinessInstanceId,
    controllingBusinessInstanceName,
    controllingBusinessPhone,
    incomingAssistantEnabled,
    incomingAssistantRuntimeStatus,
  };
}

function parseJsonSafe(raw: string): any {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
