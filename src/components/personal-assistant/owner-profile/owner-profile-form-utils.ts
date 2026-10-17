import type { OwnerDataPrivacyPolicy } from "./owner-profile-types.ts";

export const PRIVACY_POLICY_OPTIONS: Array<{
  value: OwnerDataPrivacyPolicy;
  label: string;
  description: string;
}> = [
  {
    value: "PRIVATE",
    label: "Private",
    description: "Assistant internal context only. Never shared externally.",
  },
  {
    value: "ASK_BEFORE_SHARE",
    label: "Ask before sharing",
    description: "Assistant must ask you for explicit confirmation before sharing.",
  },
  {
    value: "ALLOW_FOR_AUTHORIZED_TASK",
    label: "Allow for authorized tasks",
    description: "Permitted to use automatically only when an authorized task requires it.",
  },
];

export const COMMON_TIMEZONES = [
  "UTC",
  "Asia/Karachi",
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Kolkata",
  "Asia/Dhaka",
  "Asia/Singapore",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Australia/Sydney",
];

export const BLOCKED_SECRET_PATTERNS = [
  "password",
  "passcode",
  "pin",
  "otp",
  "cvv",
  "cvc",
  "card_security_code",
  "security_code",
  "api_key",
  "apikey",
  "secret",
  "auth_token",
  "access_token",
  "refresh_token",
  "oauth_token",
  "authentication_code",
  "auth_code",
  "private_key",
  "bank_login",
  "credit_card",
  "debit_card",
];

export function isBlockedSecretInput(input: string): boolean {
  if (!input || typeof input !== "string") return false;
  const normalized = input.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const pattern of BLOCKED_SECRET_PATTERNS) {
    const cleanPattern = pattern.replace(/[^a-z0-9]/g, "");
    if (normalized.includes(cleanPattern)) {
      return true;
    }
  }
  return false;
}
