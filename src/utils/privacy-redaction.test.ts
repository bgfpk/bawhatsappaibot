import assert from "node:assert/strict";
import test from "node:test";
import { containsSensitiveText, redactObjectPreview, redactSensitiveText } from "./privacy-redaction";

test("redacts OTP sentence", () => {
  const input = "Your OTP for Black Arrow login is: 252039. This code will expire in 10 minutes.";
  assert.equal(redactSensitiveText(input), "Your OTP for Black Arrow login is: [redacted code]. This code will expire in 10 minutes.");
});

test("redacts login code", () => {
  assert.equal(redactSensitiveText("login code: 123456"), "login code: [redacted code]");
});

test("redacts verification code", () => {
  assert.equal(redactSensitiveText("verification code is 123456"), "verification code is [redacted code]");
});

test("redacts 2FA and authentication code", () => {
  assert.equal(redactSensitiveText("2FA code: 654321"), "2FA code: [redacted code]");
  assert.equal(redactSensitiveText("authentication code is 998877"), "authentication code is [redacted code]");
});

test("redacts password and passcode", () => {
  assert.equal(redactSensitiveText("password: abc123"), "password: [redacted secret]");
  assert.equal(redactSensitiveText("passcode: 123456"), "passcode: [redacted code]");
});

test("redacts api key and labelled tokens", () => {
  assert.equal(redactSensitiveText("api key: sk_live_123456789"), "api key: [redacted secret]");
  assert.equal(redactSensitiveText("token=abc123456789"), "token=[redacted secret]");
});

test("redacts bearer token", () => {
  assert.equal(redactSensitiveText("Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"), "Bearer [redacted token]");
});

test("redacts webhook and signing secrets", () => {
  assert.equal(redactSensitiveText("webhook secret: whsec_123456789"), "webhook secret: [redacted secret]");
  assert.equal(redactSensitiveText("signing secret=sig_987654321"), "signing secret=[redacted secret]");
});

test("redacts long suspicious alphanumeric tokens", () => {
  assert.equal(redactSensitiveText("token body abcdef1234567890abcdef123456"), "token body [redacted token]");
});

test("does not redact normal customer phone numbers by default", () => {
  assert.equal(redactSensitiveText("Customer phone is 923136923129"), "Customer phone is 923136923129");
});

test("does not aggressively redact normal order ids", () => {
  assert.equal(redactSensitiveText("Order ID ORD-123456"), "Order ID ORD-123456");
});

test("handles null and empty input safely", () => {
  assert.equal(redactSensitiveText(null), "");
  assert.equal(redactSensitiveText(""), "");
  assert.equal(containsSensitiveText(null), false);
});

test("redacts object preview without mutating input", () => {
  const input = { message: "api key: secret_123456", phone: "125415830980" };
  const before = JSON.stringify(input);
  const output = redactObjectPreview(input);
  assert.match(output, /\[redacted secret\]/);
  assert.equal(JSON.stringify(input), before);
});

test("detects sensitive text", () => {
  assert.equal(containsSensitiveText("Your OTP is 252039"), true);
  assert.equal(containsSensitiveText("Normal customer asked about price"), false);
});
