export type AccountPhoneOwner = {
  $id?: string;
  id?: string;
  email?: string;
  name?: string;
  business_name?: string;
  whatsapp_number?: string;
  phone?: string;
  phone_number?: string;
  mobile?: string;
  contact_number?: string;
};

export function normalizeAccountPhone(value: any, defaultCountryCode = "92") {
  const raw = String(value || "").trim();
  let digits = raw.replace(/[^0-9]/g, "");
  if (!digits) return "";

  const countryCode = String(defaultCountryCode || "").replace(/[^0-9]/g, "");
  if (countryCode && digits.startsWith("00" + countryCode)) digits = digits.slice(2);
  if (countryCode && digits.startsWith("0") && digits.length >= 10) {
    digits = countryCode + digits.slice(1);
  }

  return digits.length >= 7 && digits.length <= 18 ? digits : "";
}

export function getAccountPhoneCandidates(account: AccountPhoneOwner, defaultCountryCode = "92") {
  const candidates = [
    account?.whatsapp_number,
    account?.phone,
    account?.phone_number,
    account?.mobile,
    account?.contact_number,
  ].map((value) => normalizeAccountPhone(value, defaultCountryCode)).filter(Boolean);

  return Array.from(new Set(candidates));
}

export function getAccountDisplayLabel(account: AccountPhoneOwner) {
  return String(account?.business_name || account?.name || account?.email || account?.$id || account?.id || "this account").trim();
}

export function findExistingAccountByPhone(
  accounts: AccountPhoneOwner[] = [],
  phone: any,
  options: { exceptUserId?: string; defaultCountryCode?: string } = {},
) {
  const normalizedPhone = normalizeAccountPhone(phone, options.defaultCountryCode || "92");
  const exceptUserId = String(options.exceptUserId || "").trim();
  if (!normalizedPhone) return null;

  return (accounts || []).find((account) => {
    const accountId = String(account?.$id || account?.id || "").trim();
    if (exceptUserId && accountId === exceptUserId) return false;
    return getAccountPhoneCandidates(account, options.defaultCountryCode || "92").includes(normalizedPhone);
  }) || null;
}

export function buildDuplicatePhoneSignupMessage(account?: AccountPhoneOwner | null) {
  const label = account ? getAccountDisplayLabel(account) : "an existing BlackArrow account";
  return `This WhatsApp number is already registered with ${label}. Please log in to that account or use account recovery instead of creating another trial.`;
}
