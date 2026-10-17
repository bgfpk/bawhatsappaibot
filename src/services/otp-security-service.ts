import crypto from "crypto";

const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;

export type OtpPurpose = "signup" | "login" | "password_reset" | "generic";

export type OtpRecord = {
  phone: string;
  otp: string;
  purpose: OtpPurpose;
  expiresAt: number;
  attempts: number;
  data?: any;
};

const otpStorage = new Map<string, OtpRecord>();

function cleanPhone(value: any): string {
  let cleaned = String(value || "").replace(/[^0-9]/g, "");
  if (cleaned.startsWith("0")) cleaned = "92" + cleaned.substring(1);
  return cleaned;
}

export function generateSecureNumericOtp(length = 6): string {
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length);
  return crypto.randomInt(min, max).toString();
}

export function storeSecureOtp(
  phone: string,
  options?: { purpose?: OtpPurpose; isLogin?: boolean; isReset?: boolean; isSignup?: boolean; isGeneric?: boolean; data?: any } | any
): { otp: string; expiresAt: number; purpose: OtpPurpose } {
  const target = cleanPhone(phone);
  const otp = generateSecureNumericOtp(6);
  const expiresAt = Date.now() + OTP_EXPIRY_MS;

  let purpose: OtpPurpose = "signup";
  if (options && typeof options === "object") {
    if (options.purpose) {
      purpose = options.purpose;
    } else if (options.isReset) {
      purpose = "password_reset";
    } else if (options.isLogin) {
      purpose = "login";
    } else if (options.isGeneric) {
      purpose = "generic";
    } else if (options.isSignup || options.isRegister) {
      purpose = "signup";
    }
  }

  otpStorage.set(target, {
    phone: target,
    otp,
    purpose,
    expiresAt,
    attempts: 0,
    data: options?.data || options,
  });

  return { otp, expiresAt, purpose };
}

export function verifySecureOtp(input: {
  phone: string;
  otp: string;
  expectedPurpose?: OtpPurpose;
  consumeOnSuccess?: boolean;
  nowMs?: number;
}): { valid: boolean; error?: string; requires2FA?: boolean; data?: any; purpose?: OtpPurpose } {
  const target = cleanPhone(input.phone);
  const providedOtp = String(input.otp || "").trim();
  const now = input.nowMs || Date.now();
  const consume = input.consumeOnSuccess !== false;
  const expectedPurpose = input.expectedPurpose;

  const record = otpStorage.get(target);
  if (!record) {
    return { valid: false, error: "invalid_or_expired_otp" };
  }

  if (record.expiresAt < now) {
    otpStorage.delete(target);
    return { valid: false, error: "expired_otp" };
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    otpStorage.delete(target);
    return { valid: false, error: "too_many_failed_attempts" };
  }

  // Exact purpose matching (no wildcarding)
  if (expectedPurpose) {
    if (record.purpose !== expectedPurpose) {
      return { valid: false, error: "invalid_otp_purpose" };
    }
  }

  const isMatch = record.otp === providedOtp;
  if (!isMatch) {
    record.attempts += 1;
    if (record.attempts >= MAX_ATTEMPTS) {
      otpStorage.delete(target);
      return { valid: false, error: "too_many_failed_attempts" };
    }
    return { valid: false, error: "invalid_otp" };
  }

  if (consume) {
    otpStorage.delete(target);
  }

  return { valid: true, data: record.data, purpose: record.purpose };
}

export function deleteStoredOtp(phone: string): void {
  otpStorage.delete(cleanPhone(phone));
}

export const __otpSecurityTestUtils = {
  otpStorage,
  cleanPhone,
};
