import { isLidJid } from "./whatsapp-jid";

export type WhatsAppContactProfile = {
  displayName: string;
  pushName: string;
  notifyName: string;
  verifiedName: string;
  businessName: string;
  businessDescription: string;
  businessCategory: string;
  businessWebsite: string;
  businessEmail: string;
  businessAddress: string;
  profilePictureUrl: string;
  source: string;
  syncedAt: number;
};

export type ContactIdentity = {
  displayName: string;
  displayPhone: string;
  rawDigits: string;
  hasRealName: boolean;
  hasRealPhone: boolean;
  contactId: string;
  contactLabel: string;
  source: string;
  nameSource: string;
  profileSource: string;
  phoneSource: string;
  whatsappProfile?: WhatsAppContactProfile;
};

type PhoneOptions = { source?: string; trusted?: boolean; blockedDigits?: Set<string> };
type NamedCandidate = [any, string];

function safeString(value: any, limit = 500) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function parseObject(value: any) {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function digitsOnly(value: any) {
  return safeString(value).replace(/\D/g, "");
}

function isWhatsappPhoneJid(value: any) {
  return /^\d{8,15}@s\.whatsapp\.net$/i.test(safeString(value));
}

export function isBlockedContactIdentifier(value: any) {
  const text = safeString(value).toLowerCase();
  return Boolean(!text || text === "status@broadcast" || text.endsWith("@lid") || text.endsWith("@hosted.lid") || text.endsWith("@g.us") || text.endsWith("@broadcast") || text.includes("@lid") || text.includes("@hosted.lid"));
}

function jidPhoneDigits(value: any) {
  const text = safeString(value).toLowerCase();
  if (!isWhatsappPhoneJid(text)) return "";
  return text.split("@")[0].replace(/\D/g, "");
}

function isTrustedSource(source: string) {
  return [
    "profile.whatsapp_number",
    "profile.whatsappNumber",
    "profile.phoneNumber",
    "profile.shippingPhone",
    "profile.customerPhone",
    "profile.phone",
    "customer.phone",
    "customer.whatsapp_number",
    "customer.whatsappNumber",
    "lead.phone",
    "lead.whatsapp_number",
    "order.phone",
    "order.customerPhone",
    "contact-d26ce7788f39@example.invalid",
    "persisted_lid_mapping",
  ].includes(source);
}

function normalizePakistaniMobile(digits: string) {
  if (/^03\d{9}$/.test(digits)) return `92${digits.slice(1)}`;
  if (/^3\d{9}$/.test(digits)) return `92${digits}`;
  if (/^92\d{10}$/.test(digits)) return digits;
  return "";
}

export function normalizeTrustedPhoneDigits(value: any, options: PhoneOptions = {}) {
  const source = safeString(options.source);
  const raw = safeString(value);
  if (!raw || isBlockedContactIdentifier(raw)) return "";
  const jidDigits = jidPhoneDigits(raw);
  if (jidDigits) {
    if (options.blockedDigits && options.blockedDigits.has(jidDigits)) return "";
    return normalizePakistaniMobile(jidDigits) || jidDigits;
  }
  const trusted = options.trusted || isTrustedSource(source);
  if (!trusted) return "";
  let digits = digitsOnly(raw);
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (!digits) return "";
  if (options.blockedDigits && options.blockedDigits.has(digits)) return "";
  const pkMobile = normalizePakistaniMobile(digits);
  if (pkMobile) return pkMobile;
  if (digits.length >= 8 && digits.length <= 15) return digits;
  return "";
}

export function isTrustedPhoneCandidate(value: any, source?: string) {
  return Boolean(normalizeTrustedPhoneDigits(value, { source }));
}

export function formatInternationalPhone(value: any, options: PhoneOptions = {}) {
  const raw = safeString(value);
  if (!raw || isBlockedContactIdentifier(raw) || isLidJid(raw) || /@lid$/i.test(raw)) return "";
  const isExplicitInternational = raw.startsWith("+") || raw.startsWith("00");
  const digits = normalizeTrustedPhoneDigits(value, options) || (options.trusted || isExplicitInternational ? digitsOnly(raw) : "");
  if (!digits) return "";
  if (options.blockedDigits && options.blockedDigits.has(digits)) return "";
  if (/^92\d{10}$/.test(digits)) return `+92 ${digits.slice(2, 5)} ${digits.slice(5)}`;
  if (/^3\d{9}$/.test(digits)) return `+92 ${digits.slice(0, 3)} ${digits.slice(3)}`;
  if ((raw.startsWith("+") || raw.startsWith("00") || (options.trusted && digits.length >= 11)) && digits.length <= 15) return `+${digits}`;
  return (options.trusted || isExplicitInternational) && digits.length >= 8 && digits.length <= 15 ? `+${digits}` : "";
}

export function isPhoneLikeDisplayName(value: any) {
  const text = safeString(value);
  if (!text) return false;
  if (isWhatsappPhoneJid(text)) return true;
  if (/^\+\s*\d[\d\s().-]{7,}$/.test(text)) return true;
  const digits = digitsOnly(text);
  if (digits.length >= 8 && /^[+\d\s().-]+$/.test(text)) return true;
  return false;
}

export function isUsableContactDisplayName(value: any) {
  const text = safeString(value, 180);
  if (!text) return false;
  const lowered = text.toLowerCase();
  if (["unknown", "unknown customer", "whatsapp contact", "no phone linked", "n/a", "na", "null", "undefined", "customer"].includes(lowered)) return false;
  if (isBlockedContactIdentifier(text)) return false;
  if (/@(?:s\.whatsapp\.net|lid|hosted\.lid|g\.us|broadcast)$/i.test(text)) return false;
  if (isPhoneLikeDisplayName(text)) return false;
  // If it's a generic placeholder like "Customer 4073" or "Customer ••••4073"
  if (/^Customer\s+(?:••••|\d{3,})/i.test(text)) return false;
  if (!/[\p{L}]/u.test(text)) return false;
  return true;
}

function firstSafeName(candidates: NamedCandidate[]) {
  for (const [value, source] of candidates) {
    const text = safeString(value, 180);
    if (isUsableContactDisplayName(text)) return { displayName: text, nameSource: source };
  }
  return null;
}

function numberFrom(...values: any[]) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
  }
  return 0;
}

function websiteFrom(value: any) {
  if (Array.isArray(value)) return safeString(value.find(Boolean), 220);
  return safeString(value, 220);
}

export function extractWhatsAppContactProfile(row: any): WhatsAppContactProfile | undefined {
  const profile = parseObject(row?.profile);
  const stored = parseObject(profile.whatsappProfile || profile.contactProfile || profile.whatsappCustomerIntelligence || row?.whatsappProfile || row?.contactProfile || row?.whatsappCustomerIntelligence);
  const source = safeString(stored.source || (profile.whatsappCustomerIntelligence ? "whatsapp_visible_profile" : profile.whatsappProfile || profile.contactProfile ? "stored_whatsapp_profile" : "stored_profile"), 80);
  const result: WhatsAppContactProfile = {
    displayName: safeString(stored.displayName || stored.name || profile.whatsappName || profile.displayName, 160),
    pushName: safeString(stored.pushName || profile.pushName || row?.pushName, 160),
    notifyName: safeString(stored.notifyName || stored.notify || profile.notify, 160),
    verifiedName: safeString(stored.verifiedName || profile.verifiedName, 160),
    businessName: safeString(stored.businessName || profile.businessName, 180),
    businessDescription: safeString(stored.businessDescription || stored.description || stored.about || profile.businessDescription, 500),
    businessCategory: safeString(stored.businessCategory || stored.category || profile.businessCategory, 160),
    businessWebsite: websiteFrom(stored.businessWebsite || stored.website || stored.websites || profile.businessWebsite),
    businessEmail: safeString(stored.businessEmail || stored.email || profile.businessEmail, 180),
    businessAddress: safeString(stored.businessAddress || stored.address || profile.businessAddress, 260),
    profilePictureUrl: safeString(stored.profilePictureUrl || profile.profilePictureUrl, 260),
    source: source || "stored_profile",
    syncedAt: numberFrom(stored.syncedAt, stored.scannedAt, profile.whatsappProfileSyncedAt, profile.contactProfileSyncedAt),
  };
  const hasUsefulProfileData = Boolean(result.displayName || result.pushName || result.notifyName || result.verifiedName || result.businessName || result.businessDescription || result.businessCategory || result.businessWebsite || result.businessEmail || result.businessAddress || result.profilePictureUrl || result.syncedAt);
  return hasUsefulProfileData ? result : undefined;
}

function savedNameCandidates(row: any): NamedCandidate[] {
  const profile = parseObject(row?.profile);
  return [
    [profile.savedName, "profile.savedName"],
    [profile.customerName, "profile.customerName"],
    [row?.name, "customer.name"],
    [profile.name, "profile.name"],
  ];
}

function whatsappNameCandidates(row: any): NamedCandidate[] {
  const profile = parseObject(row?.profile);
  const whatsappProfile = extractWhatsAppContactProfile(row);
  return [
    [whatsappProfile?.verifiedName, "whatsappProfile.verifiedName"],
    [whatsappProfile?.businessName, "whatsappProfile.businessName"],
    [profile.verifiedName, "profile.verifiedName"],
    [profile.businessName, "profile.businessName"],
    [whatsappProfile?.pushName, "whatsappProfile.pushName"],
    [whatsappProfile?.notifyName, "whatsappProfile.notifyName"],
    [profile.pushName, "profile.pushName"],
    [profile.notify, "profile.notify"],
    [row?.pushName, "customer.pushName"],
    [whatsappProfile?.displayName, "whatsappProfile.displayName"],
    [profile.whatsappName, "profile.whatsappName"],
    [profile.displayName, "profile.displayName"],
  ];
}

function linkedNameCandidates(row: any, sourcePrefix: string): NamedCandidate[] {
  const profile = parseObject(row?.profile);
  const orderData = parseObject(row?.order_data || row?.data || row?.details);
  return [
    [row?.name, `${sourcePrefix}.name`],
    [row?.customerName, `${sourcePrefix}.name`],
    [row?.leadName, `${sourcePrefix}.name`],
    [profile.name, `${sourcePrefix}.profile.name`],
    [orderData.customerName, `${sourcePrefix}.customerName`],
    [orderData.name, `${sourcePrefix}.customerName`],
    [orderData.fullName, `${sourcePrefix}.customerName`],
  ];
}

function firstUsableName(customer: any, linkedRows: any[], resolvedPhoneDigits?: string) {
  const explicitSaved = firstSafeName(savedNameCandidates(customer));
  if (explicitSaved) return explicitSaved;

  const waName = firstSafeName(whatsappNameCandidates(customer));
  if (waName) return waName;

  const linked = firstSafeName(linkedRows.flatMap((row, index) => linkedNameCandidates(row || {}, index === 0 ? "lead" : "order")));
  if (linked) return linked;

  return { displayName: "WhatsApp contact", nameSource: "fallback" };
}

function collectBlockedLidDigits(...rows: any[]): Set<string> {
  const blocked = new Set<string>();
  for (const row of rows) {
    const profile = parseObject(row?.profile);
    const candidates = [
      row?.jid,
      row?.customer_jid,
      row?.customer_id,
      row?.lid,
      profile?.lidJid,
      profile?.lid,
      profile?.hostedLid,
      profile?.whatsappLid,
    ];
    for (const c of candidates) {
      const text = safeString(c);
      if (isLidJid(text) || text.includes("@lid")) {
        const d = text.split("@")[0].replace(/\D/g, "");
        if (d) blocked.add(d);
      }
    }
    const rawLid = safeString(row?.lid || profile?.lid || profile?.lidJid || profile?.whatsappLid);
    const lidDigits = digitsOnly(rawLid);
    if (lidDigits && lidDigits.length >= 8) {
      blocked.add(lidDigits);
    }
  }
  return blocked;
}

function phoneCandidates(customer: any, blocked: Set<string>): NamedCandidate[] {
  const profile = parseObject(customer?.profile);
  const orderData = parseObject(customer?.order_data || customer?.data || customer?.details);

  const candidates: NamedCandidate[] = [];

  candidates.push(
    [profile.whatsapp_number, "profile.whatsapp_number"],
    [profile.whatsappNumber, "profile.whatsappNumber"],
    [profile.phoneNumber, "profile.phoneNumber"],
    [profile.shippingPhone, "profile.shippingPhone"],
    [profile.customerPhone, "profile.customerPhone"],
    [profile.phone, "profile.phone"],
    [customer?.phone, "customer.phone"],
    [customer?.whatsapp_number, "customer.whatsapp_number"],
    [customer?.whatsappNumber, "customer.whatsappNumber"],
    [customer?.customerPhone, "lead.phone"],
    [customer?.customer_phone, "lead.phone"],
    [customer?.jid, "contact-d26ce7788f39@example.invalid"],
    [customer?.customer_jid, "contact-d26ce7788f39@example.invalid"],
    [customer?.chat_jid, "contact-d26ce7788f39@example.invalid"],
    [safeString(customer?.customer_id).includes("@s.whatsapp.net") ? customer.customer_id : "", "contact-d26ce7788f39@example.invalid"],
    [orderData.phone, "order.phone"],
    [orderData.customerPhone, "order.customerPhone"],
    [orderData.customer_phone, "order.customerPhone"],
    [orderData.whatsappNumber, "order.phone"]
  );

  return candidates;
}

function firstPhoneIdentity(...rows: any[]) {
  const blockedDigits = collectBlockedLidDigits(...rows);
  for (const row of rows) {
    for (const [value, source] of phoneCandidates(row || {}, blockedDigits)) {
      const rawDigits = normalizeTrustedPhoneDigits(value, { source, blockedDigits });
      if (rawDigits && !blockedDigits.has(rawDigits)) {
        return { displayPhone: formatInternationalPhone(rawDigits, { source, trusted: true, blockedDigits }), rawDigits, source };
      }
    }
  }
  return { displayPhone: "", rawDigits: "", source: "" };
}

export function getCustomerContactIdentity(customer: any, ...linkedRows: any[]): ContactIdentity {
  const links = linkedRows.filter(Boolean);
  const phone = firstPhoneIdentity(customer, ...links);
  const name = firstUsableName(customer || {}, links, phone.rawDigits);
  const contactId = safeString(customer?.customer_id || customer?.jid || customer?.customer_jid || customer?.chat_jid || customer?.id || customer?.$id);
  const isLid = isLidJid(contactId) || isLidJid(parseObject(customer?.profile)?.lidJid) || contactId.includes("@lid");
  const hasBlockedOrNumericId = Boolean(contactId && (isBlockedContactIdentifier(contactId) || /^\d{6,}$/.test(contactId)));
  const contactLabel = phone.displayPhone
    ? ""
    : isLid || hasBlockedOrNumericId
      ? "Number unavailable"
      : "No phone linked";
  const whatsappProfile = extractWhatsAppContactProfile(customer);
  return {
    displayName: name.displayName,
    displayPhone: phone.displayPhone,
    rawDigits: phone.rawDigits,
    hasRealName: name.nameSource !== "fallback",
    hasRealPhone: Boolean(phone.displayPhone),
    contactId,
    contactLabel,
    source: phone.source || (contactId ? "contact_id" : "unknown"),
    nameSource: name.nameSource,
    profileSource: whatsappProfile?.source || name.nameSource,
    phoneSource: phone.source,
    whatsappProfile,
  };
}

export function getDisplayNameFromCustomer(customer: any, ...linkedRows: any[]) {
  return getCustomerContactIdentity(customer, ...linkedRows).displayName;
}

export function getDisplayPhoneFromCustomer(customer: any, ...linkedRows: any[]) {
  return getCustomerContactIdentity(customer, ...linkedRows).displayPhone;
}

export function getDisplayContactLabel(customer: any, ...linkedRows: any[]) {
  const identity = getCustomerContactIdentity(customer, ...linkedRows);
  return identity.displayPhone || (identity.hasRealName ? identity.displayName : "WhatsApp contact");
}
