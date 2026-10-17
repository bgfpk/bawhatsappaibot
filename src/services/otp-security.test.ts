import test from "node:test";
import assert from "node:assert/strict";
import {
  generateSecureNumericOtp,
  storeSecureOtp,
  verifySecureOtp,
  deleteStoredOtp,
} from "./otp-security-service.ts";

test("OTP security service: purpose binding, attempt limiting, and expiration", () => {
  const phone = "15811061380";

  // 1. Generation format
  const otp1 = generateSecureNumericOtp(6);
  assert.equal(otp1.length, 6);
  assert.equal(/^\d{6}$/.test(otp1), true);

  // 2. Storage with explicit purpose
  const loginStored = storeSecureOtp(phone, { purpose: "login" });
  assert.equal(loginStored.purpose, "login");
  assert.equal(loginStored.otp.length, 6);

  // 3. Cross-purpose rejection (trying to use login OTP for password reset or signup)
  const crossResetCheck = verifySecureOtp({
    phone,
    otp: loginStored.otp,
    expectedPurpose: "password_reset",
  });
  assert.equal(crossResetCheck.valid, false);
  assert.equal(crossResetCheck.error, "invalid_otp_purpose");

  const crossSignupCheck = verifySecureOtp({
    phone,
    otp: loginStored.otp,
    expectedPurpose: "signup",
  });
  assert.equal(crossSignupCheck.valid, false);
  assert.equal(crossSignupCheck.error, "invalid_otp_purpose");

  // 4. Invalid OTP increments attempts and fails
  const wrongOtpCheck = verifySecureOtp({
    phone,
    otp: "000000",
    expectedPurpose: "login",
  });
  assert.equal(wrongOtpCheck.valid, false);
  assert.equal(wrongOtpCheck.error, "invalid_otp");

  // 5. Success with correct purpose and OTP
  const validCheck = verifySecureOtp({
    phone,
    otp: loginStored.otp,
    expectedPurpose: "login",
    consumeOnSuccess: true,
  });
  assert.equal(validCheck.valid, true);

  // 6. Replay prevention: consumed OTP cannot be reused
  const replayCheck = verifySecureOtp({
    phone,
    otp: loginStored.otp,
    expectedPurpose: "login",
  });
  assert.equal(replayCheck.valid, false);
  assert.equal(replayCheck.error, "invalid_or_expired_otp");

  // 7. Password reset purpose test
  const resetStored = storeSecureOtp(phone, { purpose: "password_reset" });
  const resetValid = verifySecureOtp({
    phone,
    otp: resetStored.otp,
    expectedPurpose: "password_reset",
    consumeOnSuccess: true,
  });
  assert.equal(resetValid.valid, true);

  // 8. Max attempts lockout
  const lockoutStored = storeSecureOtp(phone, { purpose: "signup" });
  for (let i = 0; i < 4; i++) {
    verifySecureOtp({ phone, otp: "999999", expectedPurpose: "signup" });
  }
  const fifthFail = verifySecureOtp({ phone, otp: "999999", expectedPurpose: "signup" });
  assert.equal(fifthFail.valid, false);
  assert.equal(fifthFail.error, "too_many_failed_attempts");

  // 9. Generic purpose isolation (generic OTP cannot pass login/signup/reset, and vice versa)
  const genericStored = storeSecureOtp(phone, { purpose: "generic" });
  assert.equal(genericStored.purpose, "generic");

  // Cannot be used for login
  const genericAsLogin = verifySecureOtp({ phone, otp: genericStored.otp, expectedPurpose: "login" });
  assert.equal(genericAsLogin.valid, false);
  assert.equal(genericAsLogin.error, "invalid_otp_purpose");

  // Cannot be used for signup
  const genericAsSignup = verifySecureOtp({ phone, otp: genericStored.otp, expectedPurpose: "signup" });
  assert.equal(genericAsSignup.valid, false);
  assert.equal(genericAsSignup.error, "invalid_otp_purpose");

  // Cannot be used for password_reset
  const genericAsReset = verifySecureOtp({ phone, otp: genericStored.otp, expectedPurpose: "password_reset" });
  assert.equal(genericAsReset.valid, false);
  assert.equal(genericAsReset.error, "invalid_otp_purpose");

  // Login OTP cannot be used for generic
  const newLogin = storeSecureOtp(phone, { purpose: "login" });
  const loginAsGeneric = verifySecureOtp({ phone, otp: newLogin.otp, expectedPurpose: "generic" });
  assert.equal(loginAsGeneric.valid, false);
  assert.equal(loginAsGeneric.error, "invalid_otp_purpose");

  // Valid generic verification succeeds with exact generic purpose
  const newGeneric = storeSecureOtp(phone, { purpose: "generic" });
  const genericValid = verifySecureOtp({ phone, otp: newGeneric.otp, expectedPurpose: "generic", consumeOnSuccess: true });
  assert.equal(genericValid.valid, true);
});
