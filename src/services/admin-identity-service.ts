import { normalizePhoneDigits, normalizeWhatsAppJid } from "../utils/whatsapp-jid.ts";

export interface NormalizedAdminIdentity {
  phone: string;
  jid: string;
}

export interface AdminBusinessAssistantContext {
  accountId: string;
  userId: string;
  botId: string;
  adminPhone: string;
  adminJid: string;
  adminRole: "owner" | "admin" | "manager";
  isBusinessAssistantEnabled: boolean;
  mode: "admin_business_assistant";
  conversationId: string;
  isAuthorizedAdmin?: boolean;
  isPrimaryOwner?: boolean;
}

export interface AdminIdentityResolutionResult {
  isAuthorizedAdmin: boolean;
  mode: "admin_business_assistant" | "customer";
  reason?: string;
  context?: AdminBusinessAssistantContext;
}

/**
 * Normalizes any admin phone number, formatted string, or JID into canonical
 * { phone: "195545134641", jid: "contact-e4ed32210a80@example.invalid" }
 */
export function normalizeAdminWhatsAppIdentity(value: any): NormalizedAdminIdentity {
  const raw = String(value || "").trim();
  if (!raw) return { phone: "", jid: "" };

  let directDigits = normalizePhoneDigits(raw.split("@")[0]);
  if (directDigits.startsWith("00")) directDigits = directDigits.slice(2);
  if (directDigits.startsWith("0") && directDigits.length === 11) {
    directDigits = "92" + directDigits.slice(1);
  }

  if (directDigits.length >= 8 && directDigits.length <= 15) {
    return {
      phone: directDigits,
      jid: `${directDigits}@s.whatsapp.net`,
    };
  }

  return { phone: "", jid: "" };
}

/**
 * Verifies if a user or role is authorized for Admin Business Assistant access.
 * Owner and Admin roles are authorized. Normal member/agent/viewer roles are denied.
 */
export function canUseAdminBusinessAssistant(input: {
  role?: string;
  user?: any;
}): boolean {
  const role = String(
    input?.role ||
    input?.user?.role ||
    input?.user?.account_role ||
    ""
  ).toLowerCase().trim();

  if (role === "owner" || role === "admin" || role === "super_admin") return true;
  // If user object has isOwner or isAdmin flag
  if (input?.user?.is_owner === true || input?.user?.is_admin === true) return true;
  return false;
}

/**
 * Verifies if a user has sufficient authorization to modify the Admin WhatsApp number,
 * generate pairing challenges, or revoke admin pairing.
 * Restricted strictly to account owner or super_admin.
 */
export function canManageAdminPairing(input: {
  role?: string;
  user?: any;
}): boolean {
  const role = String(
    input?.role ||
    input?.user?.role ||
    input?.user?.account_role ||
    ""
  ).toLowerCase().trim();

  if (role === "owner" || role === "super_admin") return true;
  if (input?.user?.is_owner === true || input?.user?.is_super_admin === true) return true;
  return false;
}

/**
 * Resolves the canonical Admin WhatsApp Phone Number from user / extra config / bot config.
 *
 * Strict rule: NEVER fallback to user.whatsapp_number, connected instance phone,
 * instance JID, socket user phone, or bot metadata.
 */
export function getCanonicalAdminPhone(
  user?: any,
  userConfig?: any,
  botConfig?: any
): string {
  const candidate = String(
    userConfig?.admin_number ||
    userConfig?.adminPhone ||
    userConfig?.admin_alerts_config?.adminPhone ||
    user?.admin_number ||
    user?.adminPhone ||
    user?.admin_phone ||
    user?.admin_alerts_phone ||
    botConfig?.admin_number ||
    botConfig?.adminNumber ||
    ""
  ).trim();

  const normalized = normalizeAdminWhatsAppIdentity(candidate);
  return normalized.phone || "";
}

/**
 * Resolves the connected WhatsApp instance / bot phone number.
 *
 * Strict rule: ONLY derives from bot document, bot.jid, or bot config.
 * NEVER derives from admin configuration.
 */
export function extractBotPhoneNumber(bot?: any): string {
  if (!bot) return "";
  if (bot.phone && typeof bot.phone === "string") {
    const p = normalizePhoneDigits(bot.phone);
    if (p) return p;
  }
  if (bot.phoneNumber && typeof bot.phoneNumber === "string") {
    const p = normalizePhoneDigits(bot.phoneNumber);
    if (p) return p;
  }
  if (bot.jid && typeof bot.jid === "string") {
    const rawJid = bot.jid.replace(/@.*$/, "");
    const p = normalizePhoneDigits(rawJid);
    if (p) return p;
  }
  let bConfig: any = {};
  try {
    bConfig = typeof bot.config_settings === "string" ? JSON.parse(bot.config_settings) : (bot.config_settings || {});
  } catch {}
  if (bConfig.phone) {
    const p = normalizePhoneDigits(bConfig.phone);
    if (p) return p;
  }
  if (bConfig.phoneNumber) {
    const p = normalizePhoneDigits(bConfig.phoneNumber);
    if (p) return p;
  }
  return "";
}

/**
 * Canonical resolver for whether Business Assistant access is enabled for an account.
 */
export function isCanonicalBusinessAssistantEnabled(user?: any, extraConfig?: any, botConfig?: any): boolean {
  if (extraConfig?.business_assistant_enabled === false ||
      extraConfig?.isBusinessAssistantEnabled === false ||
      extraConfig?.businessAssistantEnabled === false ||
      extraConfig?.admin_alerts_config?.isBusinessAssistantEnabled === false) {
    return false;
  }
  if (user?.business_assistant_enabled === false ||
      user?.is_business_assistant_enabled === false) {
    return false;
  }
  return Boolean(
    extraConfig?.business_assistant_enabled === true ||
    extraConfig?.isBusinessAssistantEnabled === true ||
    extraConfig?.businessAssistantEnabled === true ||
    extraConfig?.admin_alerts_config?.isBusinessAssistantEnabled === true ||
    user?.business_assistant_enabled === true ||
    user?.is_business_assistant_enabled === true ||
    botConfig?.isBusinessAssistantEnabled === true ||
    botConfig?.business_assistant_enabled === true
  );
}

export interface AdminAuthorizationStatusInfo {
  state: "no_number" | "disabled_unverified" | "disabled_verified" | "enabled_unverified" | "active_authorized";
  label: string;
  badgeClass: string;
  isAuthorized: boolean;
}

export function getAdminAuthorizationStatusBadge(params: {
  adminPhone?: string;
  isBusinessAssistantEnabled?: boolean;
  isVerified?: boolean;
}): AdminAuthorizationStatusInfo {
  const phone = String(params.adminPhone || "").trim();
  if (!phone) {
    return {
      state: "no_number",
      label: "No Admin Number Configured",
      badgeClass: "text-[var(--ca-text-muted)]",
      isAuthorized: false,
    };
  }

  const enabled = Boolean(params.isBusinessAssistantEnabled);
  const verified = Boolean(params.isVerified);

  if (!enabled && !verified) {
    return {
      state: "disabled_unverified",
      label: "Access Disabled (Normal Customer Mode)",
      badgeClass: "text-amber-500",
      isAuthorized: false,
    };
  }

  if (!enabled && verified) {
    return {
      state: "disabled_verified",
      label: "Verified, Access Disabled (Normal Customer Mode)",
      badgeClass: "text-amber-500",
      isAuthorized: false,
    };
  }

  if (enabled && !verified) {
    return {
      state: "enabled_unverified",
      label: "Access Enabled — Verification Required (Pairing Needed)",
      badgeClass: "text-amber-500",
      isAuthorized: false,
    };
  }

  return {
    state: "active_authorized",
    label: "Active & Authorized (Owner/Admin)",
    badgeClass: "text-emerald-500",
    isAuthorized: true,
  };
}

/**
 * Resolves whether an inbound WhatsApp message sender is an authorized Admin Business Assistant
 * for the given bot/account.
 *
 * Requirements for admin mode:
 * 1. Account / tenant exists
 * 2. Configured admin phone exists
 * 3. Inbound sender identity matches configured admin identity
 * 4. Admin number is verified via pairing possession proof
 * 5. Business Assistant access is explicitly ENABLED
 * 6. User role has admin/owner authorization
 */
export function resolveAdminIdentityContext(params: {
  fromJid: string;
  altJid?: string;
  botConfig?: any;
  userConfig?: any;
  user?: any;
  accountId?: string;
  botId?: string;
}): AdminIdentityResolutionResult {
  const accountId = String(
    params.accountId ||
    params.user?.$id ||
    params.user?.id ||
    params.botConfig?.userId ||
    ""
  ).trim();

  if (!accountId) {
    return {
      isAuthorizedAdmin: false,
      mode: "customer",
      reason: "missing_account_id",
    };
  }

  const rawConfiguredAdmin = getCanonicalAdminPhone(
    params.user,
    params.userConfig,
    params.botConfig
  );

  const configuredAdmin = normalizeAdminWhatsAppIdentity(rawConfiguredAdmin);
  if (!configuredAdmin.phone || !configuredAdmin.jid) {
    return {
      isAuthorizedAdmin: false,
      mode: "customer",
      reason: "no_admin_number_configured",
    };
  }

  const normalizedSender = normalizeAdminWhatsAppIdentity(params.fromJid);
  const normalizedAltSender = params.altJid ? normalizeAdminWhatsAppIdentity(params.altJid) : { phone: "", jid: "" };

  const isMatchingSender =
    (normalizedSender.jid && normalizedSender.jid === configuredAdmin.jid) ||
    (normalizedAltSender.jid && normalizedAltSender.jid === configuredAdmin.jid) ||
    (normalizedSender.phone && normalizedSender.phone === configuredAdmin.phone) ||
    (normalizedAltSender.phone && normalizedAltSender.phone === configuredAdmin.phone);

  if (!isMatchingSender) {
    return {
      isAuthorizedAdmin: false,
      mode: "customer",
      reason: "sender_mismatch",
    };
  }

  const isBusinessAssistantEnabled = isCanonicalBusinessAssistantEnabled(
    params.user,
    params.userConfig,
    params.botConfig
  );

  if (!isBusinessAssistantEnabled) {
    return {
      isAuthorizedAdmin: false,
      mode: "customer",
      reason: "business_assistant_disabled",
    };
  }

  const isVerified =
    (params.userConfig?.admin_number_verified === true ||
     params.userConfig?.is_admin_verified === true ||
     params.user?.admin_number_verified === true ||
     params.user?.is_admin_verified === true ||
     params.botConfig?.admin_number_verified === true) &&
    (params.userConfig?.admin_verified_phone === configuredAdmin.phone ||
     params.user?.admin_verified_phone === configuredAdmin.phone ||
     params.botConfig?.admin_verified_phone === configuredAdmin.phone);

  if (!isVerified) {
    return {
      isAuthorizedAdmin: false,
      mode: "customer",
      reason: "admin_number_unverified",
    };
  }

  const userRole = String(params.user?.role || params.userConfig?.role || "owner").toLowerCase();
  const isAuthorizedRole = canUseAdminBusinessAssistant({ role: userRole, user: params.user });
  if (!isAuthorizedRole) {
    return {
      isAuthorizedAdmin: false,
      mode: "customer",
      reason: "unauthorized_role",
    };
  }

  const botId = String(params.botId || params.botConfig?.id || params.botConfig?.$id || accountId).trim();
  const adminRole: "owner" | "admin" | "manager" =
    userRole === "admin" ? "admin" : userRole === "manager" ? "manager" : "owner";

  return {
    isAuthorizedAdmin: true,
    mode: "admin_business_assistant",
    context: {
      accountId,
      userId: accountId,
      botId,
      adminPhone: configuredAdmin.phone,
      adminJid: configuredAdmin.jid,
      adminRole,
      isBusinessAssistantEnabled: true,
      mode: "admin_business_assistant",
      conversationId: `admin_${accountId}_${configuredAdmin.phone}`,
      isAuthorizedAdmin: true,
      isPrimaryOwner: adminRole === "owner",
    },
  };
}
